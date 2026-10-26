// Polaroid Live — control panel
import { DEFAULTS, BUILTIN_ICONS, BUNDLED_FONTS, LED_FONTS, PAPERS, SEALS, merge } from './defaults.js';
import { drawPrint } from './print.js';

const api = window.api;
const $ = (id) => document.getElementById(id);
let S = merge(DEFAULTS, {});

// ---------- tabs ----------
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('section[data-panel]').forEach(s => s.hidden = s.dataset.panel !== b.dataset.tab);
  if (b.dataset.tab === 'photo') renderPreview();
}));

// ---------- helpers ----------
const save = (patch) => api.setSettings(patch).then(s => { S = merge(DEFAULTS, s); return S; });
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function bindText(id, get, set, ms = 350) {
  const el = $(id); el.value = get() ?? '';
  el.addEventListener('input', debounce(() => save(set(el.value)), ms));
}
function bindCheck(id, get, set) { const el = $(id); el.checked = !!get(); el.addEventListener('change', () => save(set(el.checked))); }
function bindNum(id, get, set) { const el = $(id); el.value = get(); el.addEventListener('change', () => save(set(Number(el.value)))); }

// ---------- status / log ----------
function setStatus(st) {
  const p = $('statusPill'); p.className = 'pill ' + (st?.state || 'idle'); p.textContent = st?.message || 'Chưa kết nối';
}
const log = $('log');
function addLog(ev) {
  const li = document.createElement('li');
  const t = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  const label = ev.type === 'gift' ? `🎁 ${ev.nickname} tặng ${ev.giftName} x${ev.repeat} (${ev.coins} xu)` :
    ev.type === 'join' ? `👋 ${ev.nickname} vào live` : ev.type === 'follow' ? `➕ ${ev.nickname} follow` : null;
  if (!label) return;
  li.innerHTML = `<span class="t"></span><span></span>`;
  li.children[0].textContent = t; li.children[1].textContent = label;
  if (ev.type === 'gift') li.children[1].className = 'gift';
  log.prepend(li);
  while (log.children.length > 60) log.lastChild.remove();
}
api.onStatus(setStatus);
api.onLive((ev) => { if (ev.type !== 'chat' && ev.type !== 'gift-streak') addLog(ev); });
api.onReport((r) => {
  if (r.music) { musicNow = r.music; renderMusicNow(); return; }
  $('queueInfo').textContent = `Hàng chờ chụp ảnh: ${r.queue}${r.busy ? ' (đang chụp)' : ''} · Ảnh đang trưng bày: ${r.gallery}`;
  $('perf').textContent = `FPS hiện tại: ${r.fps}`;
});

// ---------- connection ----------
$('btnConnect').addEventListener('click', async () => {
  const username = $('tkUser').value.trim();
  await save({ tiktok: { username, signApiKey: $('tkKey').value.trim() } });
  const r = await api.connect({ username, signApiKey: $('tkKey').value.trim() });
  if (r && !r.ok && r.message) setStatus({ state: 'error', message: r.message.slice(0, 120) });
});
$('btnDisconnect').addEventListener('click', () => api.disconnect());

// ---------- update ----------
$('btnUpdate').addEventListener('click', async () => { $('updMsg').textContent = 'Đang kiểm tra…'; await api.checkUpdate(); });
$('btnApply').addEventListener('click', () => api.applyUpdate());
api.onUpdate((p) => {
  const m = $('updMsg');
  if (p.status === 'latest') m.textContent = `Đang dùng bản mới nhất (${p.version}).`;
  else if (p.status === 'downloading') m.textContent = `Đang tải bản ${p.version}: ${p.done}/${p.total} — ${p.file}`;
  else if (p.status === 'updated') { m.textContent = `Đã tải bản ${p.version}. Màn hình sẽ tự áp dụng khi không có ảnh đang chụp.`; $('btnApply').hidden = false; }
  else if (p.status === 'needs-installer') m.textContent = p.message;
  else if (p.status === 'error') m.textContent = 'Không cập nhật được: ' + p.message;
});
$('btnUserData').addEventListener('click', () => api.openUserData());

// ---------- top board items ----------
function renderItems() {
  const ol = $('itemList'); ol.innerHTML = '';
  S.topBoard.items.forEach((it, i) => {
    const li = document.createElement('li');
    const icon = document.createElement('button'); icon.className = 'icon'; icon.title = 'Chọn icon'; icon.setAttribute('aria-label', 'Chọn icon quà');
    if (it.icon) { const im = document.createElement('img'); im.src = it.icon; im.alt = ''; icon.append(im); } else icon.textContent = '+';
    icon.addEventListener('click', () => openPicker(i));
    const mid = document.createElement('div'); mid.className = 'row';
    const tx = document.createElement('input'); tx.type = 'text'; tx.value = it.text || ''; tx.id = 'item_text_' + i; tx.setAttribute('aria-label', 'Nội dung dòng ' + (i + 1));
    tx.addEventListener('input', debounce(() => { S.topBoard.items[i].text = tx.value; saveItems(); }, 350));
    const col = document.createElement('input'); col.type = 'color'; col.value = it.color || '#ffb347'; col.id = 'item_color_' + i; col.setAttribute('aria-label', 'Màu');
    col.addEventListener('input', debounce(() => { S.topBoard.items[i].color = col.value; saveItems(); }, 200));
    mid.append(tx, col);
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    const up = Object.assign(document.createElement('button'), { textContent: '↑', title: 'Lên' });
    const dn = Object.assign(document.createElement('button'), { textContent: '↓', title: 'Xuống' });
    const del = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Xoá' });
    up.onclick = () => { if (i > 0) { const a = S.topBoard.items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; saveItems(true); } };
    dn.onclick = () => { const a = S.topBoard.items; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; saveItems(true); } };
    del.onclick = () => { S.topBoard.items.splice(i, 1); saveItems(true); };
    ctl.append(up, dn, del);
    li.append(icon, mid, ctl); ol.append(li);
  });
}
function saveItems(rerender) { api.replaceSetting('topBoard', S.topBoard).then(() => rerender && renderItems()); }
$('btnAddItem').addEventListener('click', () => { S.topBoard.items.push({ text: 'Nội dung mới', icon: BUILTIN_ICONS[0].url, color: '#ffb347' }); saveItems(true); });

// ---------- icon picker ----------
let pickIndex = -1, giftCache = null;
async function openPicker(i) {
  pickIndex = i; $('picker').hidden = false; $('pickSearch').value = ''; $('pickMsg').textContent = 'Đang tải danh sách quà…';
  renderPick();
  if (!giftCache) {
    try { giftCache = await api.giftList(); } catch { giftCache = []; }
    $('pickMsg').textContent = giftCache.length ? `${giftCache.length} quà TikTok` : 'Chưa lấy được danh sách quà TikTok (kết nối kênh đang live để tải). Vẫn có icon sẵn bên dưới.';
    renderPick();
  } else $('pickMsg').textContent = '';
}
function renderPick() {
  const q = $('pickSearch').value.trim().toLowerCase();
  const grid = $('pickGrid'); grid.innerHTML = '';
  const add = (label, img, coins, onPick) => {
    const b = document.createElement('button');
    const im = document.createElement('img'); im.src = img; im.alt = ''; im.loading = 'lazy';
    const n = document.createElement('span'); n.textContent = label;
    b.append(im, n);
    if (coins != null) { const c = document.createElement('span'); c.className = 'c'; c.textContent = coins + ' xu'; b.append(c); }
    b.onclick = onPick; grid.append(b);
  };
  BUILTIN_ICONS.filter(i => !q || i.name.toLowerCase().includes(q)).forEach(i => add(i.name, i.url, null, () => pickIcon(i.url)));
  (giftCache || []).filter(g => !q || g.name.toLowerCase().includes(q)).slice(0, 300).forEach(g => add(g.name, g.image, g.coins, async () => {
    const local = await api.fetchImage(g.image); pickIcon(local || g.image);
  }));
}
function pickIcon(url) { if (pickIndex >= 0) { S.topBoard.items[pickIndex].icon = url; saveItems(true); } $('picker').hidden = true; }
$('pickSearch').addEventListener('input', debounce(renderPick, 150));
$('pickClose').onclick = () => $('picker').hidden = true;
$('pickNone').onclick = () => pickIcon(null);
$('pickUpload').onclick = async () => { const f = await api.pickFile('image'); if (f) pickIcon(f.url); };
$('picker').addEventListener('click', (e) => { if (e.target.id === 'picker') $('picker').hidden = true; });

// ---------- fonts ----------
const fontFaces = new Set();
async function loadFont(family, url) {
  if (fontFaces.has(family)) return;
  try { if (url) { const f = new FontFace(family, `url("${url}")`); await f.load(); document.fonts.add(f); } fontFaces.add(family); } catch {}
}
function fontOptions() {
  const sel = $('fontSel'); sel.innerHTML = '';
  const list = [...BUNDLED_FONTS, ...(S.customFonts || []), ...(sysFonts.map(f => ({ family: f, url: null, sys: true })))];
  const seen = new Set();
  for (const f of list) {
    if (seen.has(f.family)) continue; seen.add(f.family);
    const o = document.createElement('option'); o.value = f.family; o.textContent = f.family + (f.sys ? ' (hệ thống)' : ''); o.dataset.url = f.url || '';
    sel.append(o);
  }
  sel.value = S.photo.font;
}
let sysFonts = [];
$('btnSysFonts').addEventListener('click', async () => {
  try {
    const fonts = await window.queryLocalFonts();
    sysFonts = [...new Set(fonts.map(f => f.family))].sort();
    fontOptions();
  } catch (e) { alert('Không đọc được font hệ thống: ' + e.message); }
});
$('fontSel').addEventListener('change', async () => {
  const o = $('fontSel').selectedOptions[0];
  await loadFont(o.value, o.dataset.url || null);
  await save({ photo: { font: o.value, fontUrl: o.dataset.url || null } });
  renderPreview();
});
$('btnFontFile').addEventListener('click', async () => {
  const f = await api.pickFile('font'); if (!f) return;
  const family = f.name.replace(/\.(ttf|otf|woff2?)$/i, '');
  const list = [...(S.customFonts || []).filter(x => x.family !== family), { family, url: f.url }];
  await api.replaceSetting('customFonts', list);
  await save({ photo: { font: family, fontUrl: f.url } });
  await loadFont(family, f.url); fontOptions(); renderPreview();
});

async function renderPreview() {
  const p = S.photo;
  await loadFont(p.font, p.fontUrl);
  const pp = merge(DEFAULTS.photo.paper.small, p.paper?.small || {});
  const se = S.photo.seal || {};
  const cv = await drawPrint({ seal: se.enabled !== false ? { url: merge(DEFAULTS.photo.seal.small, se.small || {}).url, size: se.size || 34, angle: -0.15 } : null, name: $('testName')?.value || 'Hoàng Anh', avatarUrl: null, caption: (p.captionTemplate || '{name}').replace('{name}', $('testName')?.value || 'Hoàng Anh'), font: p.font, color: pp.caption || p.captionColor, sizePct: p.captionSize, paperUrl: pp.url });
  const g = $('printPreview').getContext('2d'); g.fillStyle = '#2a2118'; g.fillRect(0, 0, 300, 360);
  g.drawImage(cv, 20, 6, 260, 260 * cv.height / cv.width);
}


// ---------- per-tier settings (paper background, caption colour, seal) ----------
const TIER_NAMES = { table: 'Ảnh đặt bàn', small: 'Khung nhỏ', big: 'Khung to' };
function renderTiers() {
  const box = $('tierList'); box.innerHTML = '';
  for (const kind of ['table', 'small', 'big']) {
    const seal = merge(DEFAULTS.photo.seal[kind], S.photo.seal?.[kind] || {});
    const paper = merge(DEFAULTS.photo.paper[kind], S.photo.paper?.[kind] || {});
    const div = document.createElement('div'); div.className = 'tier';
    const sw = document.createElement('img'); sw.className = 'swatch'; sw.alt = ''; if (paper.url) sw.src = paper.url;
    const body = document.createElement('div'); body.className = 'body';
    const title = document.createElement('div'); title.className = 'title'; title.textContent = `${TIER_NAMES[kind]} (từ ${S.photo.tiers[kind]} xu)`;
    const sel = document.createElement('select'); sel.id = 'paper_' + kind; sel.setAttribute('aria-label', 'Hình nền ' + TIER_NAMES[kind]);
    for (const pp of PAPERS) { const o = document.createElement('option'); o.value = pp.url || ''; o.textContent = pp.name; sel.append(o); }
    const custom = PAPERS.some(pp => (pp.url || '') === (paper.url || '')) ? null : paper.url;
    if (custom) { const o = document.createElement('option'); o.value = custom; o.textContent = 'Ảnh của bạn'; sel.append(o); }
    sel.value = paper.url || '';
    sel.onchange = () => { const pp = PAPERS.find(x => (x.url || '') === sel.value); savePaper(kind, { url: sel.value || null, caption: pp ? pp.caption : paper.caption }); };
    const up = Object.assign(document.createElement('button'), { textContent: 'Ảnh nền của bạn…' });
    up.onclick = async () => { const f = await api.pickFile('image'); if (f) savePaper(kind, { url: f.url, caption: paper.caption }); };
    const col = document.createElement('input'); col.type = 'color'; col.value = paper.caption || '#2a2420'; col.id = 'cap_' + kind; col.setAttribute('aria-label', 'Màu chữ');
    col.oninput = debounce(() => savePaper(kind, { url: paper.url, caption: col.value }, false), 250);
    const r1 = document.createElement('div'); r1.className = 'row'; r1.append(sel, up);
    const r2 = document.createElement('div'); r2.className = 'row';
    const lc = document.createElement('label'); lc.htmlFor = col.id; lc.textContent = 'Màu chữ';
    r2.append(lc, col);
    // seal picker
    const r3 = document.createElement('div'); r3.className = 'row seals';
    const lab = document.createElement('span'); lab.className = 'muted'; lab.textContent = 'Con dấu:'; r3.append(lab);
    const all = [...SEALS]; if (seal.url && !SEALS.some(x => x.url === seal.url)) all.push({ name: 'Dấu của bạn', url: seal.url });
    for (const sl of all) {
      const b = document.createElement('button'); b.className = 'seal' + (sl.url === seal.url ? ' on' : ''); b.title = sl.name; b.setAttribute('aria-label', sl.name);
      const im = document.createElement('img'); im.src = sl.url; im.alt = ''; b.append(im);
      b.onclick = () => save({ photo: { seal: { [kind]: { url: sl.url } } } }).then(() => { renderTiers(); renderPreview(); });
      r3.append(b);
    }
    const upS = Object.assign(document.createElement('button'), { textContent: 'Ảnh dấu của bạn…', title: 'PNG nền trong suốt' });
    upS.onclick = async () => { const f = await api.pickFile('image'); if (f) { await save({ photo: { seal: { [kind]: { url: f.url } } } }); renderTiers(); renderPreview(); } };
    r3.append(upS);
    body.append(title, r1, r2, r3);
    div.append(sw, body); box.append(div);
  }
}
async function savePaper(kind, val, rerender = true) {
  await save({ photo: { paper: { [kind]: val } } });
  if (rerender) renderTiers();
  renderPreview();
}

// ---------- music ----------
let musicNow = null;
function renderMusic() {
  const ol = $('musList'); ol.innerHTML = '';
  (S.music.tracks || []).forEach((t, i) => {
    const li = document.createElement('li'); if (musicNow && musicNow.idx === i && musicNow.playing) li.className = 'now';
    const play = Object.assign(document.createElement('button'), { textContent: '▶', title: 'Phát bài này' });
    play.onclick = () => api.command({ type: 'music', action: 'track', index: i });
    const name = document.createElement('span'); name.textContent = t.name;
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    const del = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Xoá' });
    del.onclick = () => { const tr = [...S.music.tracks]; tr.splice(i, 1); save({ music: { tracks: tr } }).then(renderMusic); };
    ctl.append(del); li.append(play, name, ctl); ol.append(li);
  });
}
function renderMusicNow() {
  $('musNow').textContent = musicNow?.playing ? '♪ ' + (musicNow.name || '') : 'Đang dừng';
  renderMusic();
}
$('musAdd').onclick = async () => {
  const f = await api.pickFile('sound'); if (!f) return;
  const tr = [...(S.music.tracks || []), { url: f.url, name: f.name.replace(/\.(mp3|wav|ogg)$/i, '') }];
  await save({ music: { tracks: tr, enabled: true } }); $('musOn').checked = true; renderMusic();
};
$('musPlay').onclick = () => { if (!S.music.enabled) { save({ music: { enabled: true } }); $('musOn').checked = true; } api.command({ type: 'music', action: 'play' }); };
$('musPause').onclick = () => api.command({ type: 'music', action: 'pause' });
$('musNext').onclick = () => api.command({ type: 'music', action: 'next' });
$('musPrev').onclick = () => api.command({ type: 'music', action: 'prev' });

// ---------- test buttons ----------
document.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => api.command({ type: 'test', kind: b.dataset.test, name: $('testName').value.trim() || 'Khách' })));
$('btnClearTable').onclick = () => api.command({ type: 'clear', what: 'table' });
$('btnClearWall').onclick = () => api.command({ type: 'clear', what: 'wall' });
$('btnReloadDisplay').onclick = () => api.reloadDisplay();

// ---------- init ----------
(async () => {
  S = merge(DEFAULTS, await api.getSettings());
  const info = await api.info(); $('ver').textContent = 'v' + info.version;
  setStatus(await api.tiktokStatus());
  for (const f of BUNDLED_FONTS) loadFont(f.family, f.url);
  for (const f of (S.customFonts || [])) loadFont(f.family, f.url);

  $('tkUser').value = S.tiktok.username || ''; $('tkKey').value = S.tiktok.signApiKey || '';
  bindCheck('tkAuto', () => S.tiktok.autoConnect, v => ({ tiktok: { autoConnect: v } }));
  bindText('l1Text', () => S.topBoard.line1, v => ({ topBoard: { line1: v } }));
  bindText('l1Color', () => S.topBoard.line1Color, v => ({ topBoard: { line1Color: v } }), 150);
  bindCheck('l1Scroll', () => S.topBoard.line1Scroll, v => ({ topBoard: { line1Scroll: v } }));
  bindNum('itemSec', () => S.topBoard.itemSeconds, v => ({ topBoard: { itemSeconds: v } }));
  renderItems();
  const lf = $('ledFont'); LED_FONTS.forEach(f => { const o = document.createElement('option'); o.value = f.family; o.textContent = f.label; lf.append(o); });
  lf.value = S.topBoard.ledFont; lf.onchange = () => save({ topBoard: { ledFont: lf.value } });
  $('ledWeight').value = String(S.topBoard.ledWeight); $('ledWeight').onchange = () => save({ topBoard: { ledWeight: Number($('ledWeight').value) } });
  bindNum('scrollSpeed', () => S.topBoard.scrollSpeed, v => ({ topBoard: { scrollSpeed: v } }));
  bindNum('ledBright', () => S.topBoard.ledBrightness, v => ({ topBoard: { ledBrightness: v } }));
  bindText('joinTpl', () => S.bottomBoard.joinTemplate, v => ({ bottomBoard: { joinTemplate: v } }));
  bindText('giftTpl', () => S.bottomBoard.giftTemplate, v => ({ bottomBoard: { giftTemplate: v } }));
  bindText('followTpl', () => S.bottomBoard.followTemplate, v => ({ bottomBoard: { followTemplate: v } }));
  bindText('idleTxt', () => S.bottomBoard.idleText, v => ({ bottomBoard: { idleText: v } }));
  bindCheck('showJoins', () => S.bottomBoard.showJoins, v => ({ bottomBoard: { showJoins: v } }));
  bindNum('joinSec', () => S.bottomBoard.joinSeconds, v => ({ bottomBoard: { joinSeconds: v } }));
  bindText('b2Color', () => S.bottomBoard.color, v => ({ bottomBoard: { color: v } }), 150);
  bindText('b2GiftColor', () => S.bottomBoard.giftColor, v => ({ bottomBoard: { giftColor: v } }), 150);

  fontOptions();
  bindText('capColor', () => S.photo.captionColor, v => ({ photo: { captionColor: v } }), 150);
  bindText('capTpl', () => S.photo.captionTemplate, v => ({ photo: { captionTemplate: v } }));
  bindText('capSize', () => S.photo.captionSize, v => ({ photo: { captionSize: Number(v) } }), 150);
  bindNum('tTable', () => S.photo.tiers.table, v => ({ photo: { tiers: { table: v } } }));
  bindNum('tSmall', () => S.photo.tiers.small, v => ({ photo: { tiers: { small: v } } }));
  bindNum('tBig', () => S.photo.tiers.big, v => ({ photo: { tiers: { big: v } } }));
  for (const [id, key] of [['tmApproach', 'approach'], ['tmShutter', 'shutter'], ['tmTotal', 'total']])
    bindNum(id, () => S.photo.timing[key], v => ({ photo: { timing: { [key]: v } } }));
  bindCheck('sealOn', () => S.photo.seal.enabled !== false, v => ({ photo: { seal: { enabled: v } } }));
  bindText('sealSize', () => S.photo.seal.size, v => ({ photo: { seal: { size: Number(v) } } }), 200);
  $('sealSize').addEventListener('input', debounce(renderPreview, 400));
  bindCheck('sndCharge', () => S.photo.sounds.charge !== false, v => ({ photo: { sounds: { charge: v } } }));
  bindCheck('sndStamp', () => S.photo.sounds.stamp !== false, v => ({ photo: { sounds: { stamp: v } } }));
  const showShutter = () => $('shutterName').textContent = S.photo.sounds.shutter ? (S.photo.sounds.shutterName || 'Âm thanh của bạn') : 'Mặc định';
  showShutter();
  $('btnShutterFile').onclick = async () => { const f = await api.pickFile('sound'); if (f) { await save({ photo: { sounds: { shutter: f.url, shutterName: f.name } } }); showShutter(); } };
  $('btnShutterReset').onclick = async () => { await save({ photo: { sounds: { shutter: null, shutterName: '' } } }); showShutter(); };
  $('btnShutterTest').onclick = () => { const a = new Audio(S.photo.sounds.shutter || 'sounds/shutter.wav'); a.volume = (S.photo.volume ?? 80) / 100; a.play(); };
  renderTiers();
  ['tTable', 'tSmall', 'tBig'].forEach(id => $(id).addEventListener('change', () => setTimeout(renderTiers, 300)));
  bindCheck('musOn', () => S.music.enabled, v => ({ music: { enabled: v } }));
  bindCheck('musShuffle', () => S.music.shuffle, v => ({ music: { shuffle: v } }));
  bindCheck('musDuck', () => S.music.duck, v => ({ music: { duck: v } }));
  bindText('musVol', () => S.music.volume, v => ({ music: { volume: Number(v) } }), 120);
  renderMusic(); renderMusicNow();
  bindCheck('countByCoins', () => S.photo.countByCoins, v => ({ photo: { countByCoins: v } }));
  bindText('vol', () => S.photo.volume, v => ({ photo: { volume: Number(v) } }), 150);
  bindCheck('flashOn', () => S.photo.flash, v => ({ photo: { flash: v } }));
  ['capColor', 'capTpl', 'capSize'].forEach(id => $(id).addEventListener('input', debounce(renderPreview, 400)));

  $('winSize').value = `${S.display.width}x${S.display.height}`;
  $('winSize').addEventListener('change', () => { const [w, h] = $('winSize').value.split('x').map(Number); save({ display: { width: w, height: h } }); });
  $('quality').value = S.display.quality; $('quality').addEventListener('change', () => save({ display: { quality: $('quality').value } }));
  $('fpsCap').value = String(S.display.fps); $('fpsCap').addEventListener('change', () => save({ display: { fps: Number($('fpsCap').value) } }));
  bindCheck('winFrame', () => S.display.frame, v => ({ display: { frame: v } }));
  bindCheck('onTop', () => S.display.alwaysOnTop, v => ({ display: { alwaysOnTop: v } }));
  bindCheck('showFps', () => S.display.showFps, v => ({ display: { showFps: v } }));

  const st0 = await api.tiktokStatus();
  if (S.tiktok.autoConnect && S.tiktok.username && (!st0 || st0.state === 'idle')) api.connect({ username: S.tiktok.username, signApiKey: S.tiktok.signApiKey });
})();
api.onSettings((s) => { S = merge(DEFAULTS, s); });
