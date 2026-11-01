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

const urlsOf = (img) => (img && (img.urlList || img.url_list || img.url)) || [];
function pickAvatar(u) {
  for (const img of [u?.avatarLarge, u?.avatarMedium, u?.avatarThumb]) {
    const list = urlsOf(img).filter(x => typeof x === 'string' && x && !/\.heic/i.test(x));
    const best = list.find(x => /\.jpe?g|\.png/i.test(x)) || list.find(x => /\.webp/i.test(x)) || list[0];
    if (best) return best;
  }
  return null;
}
function userOf(u) {
  u = u || {};
  const uniqueId = u.displayId || u.uniqueId || '';
  return { uniqueId, nickname: String(u.nickname || uniqueId || 'Bạn').trim(), avatar: pickAvatar(u) };
}
// one decoded TikTok message → our event
function handleRaw(method, d, c) {
  switch (method) {
    case 'WebcastMemberMessage': emit({ type: 'join', ...userOf(d.user), t: Date.now() }); break;
    case 'WebcastChatMessage': emit({ type: 'chat', ...userOf(d.user), comment: d.content || d.comment || '', t: Date.now() }); break;
    case 'WebcastGiftMessage': {
      const g = d.gift || d.giftDetails || {};
      const unit = Number(g.diamondCount ?? g.diamond_count ?? 0);
      const repeat = Math.max(1, Number(d.repeatCount || d.comboCount || 1));
      const img = urlsOf(g.image)[0] || urlsOf(g.icon)[0] || null;
      const giftId = d.giftId || g.id;
      const streaking = Number(g.type) === 1 && !Number(d.repeatEnd);
      if (giftId && img && !gifts.some(x => x.id === giftId)) gifts = [...gifts, { id: giftId, name: g.name || 'quà', coins: unit, image: img }].sort((a, b) => a.coins - b.coins);
      emit({ type: streaking ? 'gift-streak' : 'gift', ...userOf(d.user), giftId, giftName: g.name || 'quà', giftImage: img, unit, repeat, coins: unit * repeat, t: Date.now() });
      break;
    }
    case 'WebcastSocialMessage': {
      const key = String(d.common?.displayText?.key || d.displayType || '');
      if (/follow/i.test(key) || Number(d.action) === 1) emit({ type: 'follow', ...userOf(d.user), t: Date.now() });
      else if (/share/i.test(key) || Number(d.action) === 3) emit({ type: 'share', ...userOf(d.user), t: Date.now() });
      break;
    }
    case 'WebcastControlMessage':
      if ([3, 4].includes(Number(d.action))) { c.emit('streamEnd', { action: d.action }); c.disconnect().catch(() => {}); }
      break;
  }
}

async function connect(opts = {}) {
  const username = String(opts.username || '').trim().replace(/^@/, '');
  if (!username) return { ok: false, message: 'Chưa nhập tên kênh' };
  want = { ...opts, username };
  clearTimeout(retryTimer);
  await disconnect(true);
  setState('connecting', `Đang kết nối @${username}…`);
  class Conn extends WebcastPushConnection {
    async processProtoMessageFetchResult(fetchResult) {
      for (const m of fetchResult?.messages || []) {
        const d = m?.decodedData?.data;
        if (d) { try { handleRaw(m.method, d, this); } catch (e) { console.warn('tiktok message', m.method, e); } }
      }
    }
  }
  const c = new Conn(username, {
    enableExtendedGiftInfo: false, processInitialData: false, // gift list endpoint is paid-only now
    ...(opts.signApiKey ? { signApiKey: opts.signApiKey } : {})
  });
  conn = c;
  c.on('streamEnd', () => { setState('ended', 'Live đã kết thúc'); scheduleRetry(60000); });
  c.on('disconnected', () => { if (conn === c && want) { setState('reconnecting', 'Mất kết nối, đang thử lại…'); scheduleRetry(8000); } });
  c.on('error', (e) => console.warn('tiktok error', e?.info || e?.message || e));
  try {
    const st = await c.connect();
    setState('connected', `Đã kết nối @${username}`, { roomId: st?.roomId });
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
