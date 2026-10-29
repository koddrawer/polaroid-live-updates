// TikTok LIVE engine for the Android app (runs in a hidden WebView). Same events/status as the
// desktop main/tiktok.js; talks to the pages through the Java bridge.
import { WebcastPushConnection } from 'tiktok-live-connector/legacy';
import { WebSocket as NativeWS } from 'ws';
globalThis.__NativeWS = NativeWS; // exposed for self-tests

const N = globalThis.Native;
let conn = null, want = null, retryTimer = null, state = { state: 'idle', message: 'Chưa kết nối' };
let gifts = [];
const send = (ch, v) => N.send(ch, JSON.stringify(v));
const emit = (ev) => send('live:event', ev);
function setState(s, message, extra = {}) { state = { state: s, message, ...extra }; send('tiktok:status', state); }

function bestAvatar(d) {
  const list = Array.isArray(d.profilePictureUrls) ? d.profilePictureUrls : (d.profilePictureUrls ? [d.profilePictureUrls] : []);
  const big = list.find(u => /720x720|1080x1080/.test(u) && !/\.heic/.test(u)) || list.find(u => !/100x100/.test(u) && !/\.heic/.test(u));
  return big || d.profilePictureUrl || null;
}
const user = (d) => ({ uniqueId: d.uniqueId || '', nickname: (d.nickname || d.uniqueId || 'Bạn').trim(), avatar: bestAvatar(d) });

async function connect(opts = {}) {
  const username = String(opts.username || '').trim().replace(/^@/, '');
  if (!username) return { ok: false, message: 'Chưa nhập tên kênh' };
  want = { ...opts, username };
  clearTimeout(retryTimer);
  await disconnect(true);
  setState('connecting', `Đang kết nối @${username}…`);
  const c = new WebcastPushConnection(username, {
    enableExtendedGiftInfo: true, processInitialData: false,
    ...(opts.signApiKey ? { signApiKey: opts.signApiKey } : {})
  });
  conn = c;
  c.on('member', (d) => emit({ type: 'join', ...user(d), t: Date.now() }));
  c.on('gift', (d) => {
    const streaking = d.giftType === 1 && !d.repeatEnd;
    const unit = Number(d.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 0);
    const repeat = Number(d.repeatCount || 1);
    const img = d.giftPictureUrl || d.extendedGiftInfo?.image?.url_list?.[0] || null;
    emit({ type: streaking ? 'gift-streak' : 'gift', ...user(d), giftId: d.giftId, giftName: d.giftName || d.extendedGiftInfo?.name || 'quà',
      giftImage: img, unit, repeat, coins: unit * repeat, t: Date.now() });
  });
  c.on('follow', (d) => emit({ type: 'follow', ...user(d), t: Date.now() }));
  c.on('share', (d) => emit({ type: 'share', ...user(d), t: Date.now() }));
  c.on('chat', (d) => emit({ type: 'chat', ...user(d), comment: d.comment, t: Date.now() }));
  c.on('streamEnd', () => { setState('ended', 'Live đã kết thúc'); scheduleRetry(60000); });
  c.on('disconnected', () => { if (conn === c && want) { setState('reconnecting', 'Mất kết nối, đang thử lại…'); scheduleRetry(8000); } });
  c.on('error', (e) => console.warn('tiktok error', e?.info || e?.message || e));
  try {
    const st = await c.connect();
    setState('connected', `Đã kết nối @${username}`, { roomId: st?.roomId });
    try {
      const list = await c.fetchAvailableGifts();
      gifts = (Array.isArray(list) ? list : (list?.gifts || [])).map(g => ({
        id: g.id, name: g.name, coins: g.diamond_count, image: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || null
      })).filter(g => g.image).sort((a, b) => a.coins - b.coins);
      send('tiktok:status', { ...state, gifts: gifts.length });
    } catch (e) { console.warn('gift list', e.message); }
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message || e);
    const offline = /offline|not live|UserOffline/i.test(msg) || e?.constructor?.name === 'UserOfflineError';
    setState(offline ? 'offline' : 'error', offline ? `@${username} chưa phát live — tự thử lại sau 30 giây` : 'Lỗi kết nối: ' + msg.slice(0, 160));
    scheduleRetry(offline ? 30000 : 15000);
    return { ok: false, message: msg };
  }
}
function scheduleRetry(ms) {
  clearTimeout(retryTimer);
  if (!want) return;
  retryTimer = setTimeout(() => { if (want) connect(want); }, ms);
}
async function disconnect(keepWant) {
  if (!keepWant) { want = null; clearTimeout(retryTimer); }
  const c = conn; conn = null;
  if (c) { try { c.removeAllListeners(); await c.disconnect(); } catch {} }
  if (!keepWant) setState('idle', 'Đã ngắt kết nối');
  return true;
}

const methods = {
  'tiktok:connect': (o) => connect(o),
  'tiktok:disconnect': () => disconnect(false),
  'tiktok:gifts': () => gifts,
  'tiktok:status': () => state,
};
globalThis.__engineCall = async (rid, method, argsJson) => {
  try {
    const args = JSON.parse(argsJson || '[]');
    const fn = methods[method];
    if (!fn) throw new Error('unknown ' + method);
    const r = await fn(...args);
    N.engineReply(rid, true, JSON.stringify(r ?? null));
  } catch (e) {
    N.engineReply(rid, false, JSON.stringify({ message: String(e?.message || e) }));
  }
};
N.send('engine:ready', '1');
console.log('engine ready');
