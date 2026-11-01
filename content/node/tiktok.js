// TikTok LIVE connection (tiktok-live-connector, legacy flat event format)
'use strict';
let mod = null, conn = null, emit = () => {}, emitStatus = () => {}, fetchImage = async (u) => u;
let want = null, retryTimer = null, state = { state: 'idle', message: 'Chưa kết nối' };
let gifts = [];

// the connector library is loaded by main.js (so this file can also run from the hot-updated content folder)
let libLoader = () => import('tiktok-live-connector/legacy');
function setLibLoader(f) { libLoader = f; }
async function lib() { if (!mod) mod = await libLoader(); return mod; }
function setState(s, message, extra = {}) { state = { state: s, message, ...extra }; emitStatus(state); }

function bestAvatar(d) {
  const list = Array.isArray(d.profilePictureUrls) ? d.profilePictureUrls : (d.profilePictureUrls ? [d.profilePictureUrls] : []);
  const big = list.find(u => /720x720|1080x1080/.test(u) && !/\.heic/.test(u)) || list.find(u => !/100x100/.test(u) && !/\.heic/.test(u));
  return big || d.profilePictureUrl || null;
}
function user(d) {
  return { uniqueId: d.uniqueId || '', nickname: (d.nickname || d.uniqueId || 'Bạn').trim(), avatar: bestAvatar(d) };
}

async function connect(opts = {}) {
  const username = String(opts.username || '').trim().replace(/^@/, '');
  if (!username) return { ok: false, message: 'Chưa nhập tên kênh' };
  want = { ...opts, username };
  clearTimeout(retryTimer);
  await disconnect(true);
  setState('connecting', `Đang kết nối @${username}…`);
  const { WebcastPushConnection } = await lib();
  const c = new WebcastPushConnection(username, {
    // the gift list needs a paid (Business) Euler Stream plan now; gift events already carry name/diamonds/image
    enableExtendedGiftInfo: false,
    processInitialData: false,
    ...(opts.signApiKey ? { signApiKey: opts.signApiKey } : {})
  });
  conn = c;
  c.on('member', (d) => emit({ type: 'join', ...user(d), t: Date.now() }));
  c.on('gift', (d) => {
    const streaking = d.giftType === 1 && !d.repeatEnd;
    const unit = Number(d.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 0);
    const repeat = Number(d.repeatCount || 1);
    const img = d.giftPictureUrl || d.extendedGiftInfo?.image?.url_list?.[0] || null;
    rememberGift(d, unit, img);
    emit({ type: streaking ? 'gift-streak' : 'gift', ...user(d), giftId: d.giftId, giftName: d.giftName || d.extendedGiftInfo?.name || 'quà',
      giftImage: img, unit, repeat, coins: unit * repeat, t: Date.now() });
  });
  c.on('follow', (d) => emit({ type: 'follow', ...user(d), t: Date.now() }));
  c.on('share', (d) => emit({ type: 'share', ...user(d), t: Date.now() }));
  c.on('chat', (d) => emit({ type: 'chat', ...user(d), comment: d.comment, t: Date.now() }));
  c.on('streamEnd', () => { setState('ended', 'Live đã kết thúc'); scheduleRetry(60000); });
  c.on('disconnected', () => { if (conn === c && want) { setState('reconnecting', 'Mất kết nối, đang thử lại…'); scheduleRetry(8000); } });
  c.on('error', (e) => console.warn('tiktok error', e?.info || e));
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
function init(onEvent, onStatus, imageFetcher) { emit = onEvent; emitStatus = onStatus; fetchImage = imageFetcher; }
function status() { return state; }
// gifts seen during the live (the full gift list endpoint is paid-only now)
const seenGifts = new Map();
function rememberGift(d, unit, img) {
  if (!d.giftId || !img || seenGifts.has(d.giftId)) return;
  seenGifts.set(d.giftId, { id: d.giftId, name: d.giftName || 'quà', coins: unit, image: img });
  gifts = [...seenGifts.values()].sort((a, b) => a.coins - b.coins);
}
async function giftList() {
  if (gifts.length) return gifts;
  if (!(want && want.signApiKey)) return gifts;
  try {
    const { WebcastPushConnection } = await lib();
    const c = new WebcastPushConnection(want?.username || 'tiktok', want?.signApiKey ? { signApiKey: want.signApiKey } : {});
    const list = await c.fetchAvailableGifts();
    gifts = (Array.isArray(list) ? list : (list?.gifts || [])).map(g => ({ id: g.id, name: g.name, coins: g.diamond_count, image: g.image?.url_list?.[0] || null }))
      .filter(g => g.image).sort((a, b) => a.coins - b.coins);
  } catch (e) { console.warn('gift list', e.message); }
  return gifts;
}
module.exports = { init, connect, disconnect, status, giftList, setLibLoader };
