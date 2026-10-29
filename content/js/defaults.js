// Default settings (merged under the user's saved settings)
export const BUILTIN_ICONS = [
  { id: 'rose', name: 'Hoa hồng', url: 'app://content/icons/rose.png' },
  { id: 'heart', name: 'Tim', url: 'app://content/icons/heart.png' },
  { id: 'coin', name: 'Xu', url: 'app://content/icons/coin.png' },
  { id: 'camera', name: 'Máy ảnh', url: 'app://content/icons/camera.png' },
  { id: 'frame', name: 'Khung ảnh', url: 'app://content/icons/frame.png' },
  { id: 'star', name: 'Ngôi sao', url: 'app://content/icons/star.png' },
  { id: 'crown', name: 'Vương miện', url: 'app://content/icons/crown.png' },
  { id: 'gift', name: 'Hộp quà', url: 'app://content/icons/gift.png' },
];

export const BUNDLED_FONTS = [
  { family: 'Patrick Hand', url: 'app://content/fonts/PatrickHand-Regular.ttf' },
  { family: 'Caveat', url: 'app://content/fonts/Caveat.ttf' },
  { family: 'Dancing Script', url: 'app://content/fonts/DancingScript.ttf' },
  { family: 'Pacifico', url: 'app://content/fonts/Pacifico-Regular.ttf' },
  { family: 'Oswald', url: 'app://content/fonts/Oswald.ttf' },
];

// fonts for the LED boards (bold, Vietnamese-capable)
export const LED_FONTS = [
  { family: 'Barlow Condensed', label: 'Barlow Condensed (gọn, dễ đọc)', faces: [{ url: 'app://content/fonts/BarlowCondensed-Bold.ttf', weight: '700' }, { url: 'app://content/fonts/BarlowCondensed-ExtraBold.ttf', weight: '800' }] },
  { family: 'Be Vietnam Pro', label: 'Be Vietnam Pro (rộng, rất rõ)', faces: [{ url: 'app://content/fonts/BeVietnamPro-ExtraBold.ttf', weight: '800' }] },
  { family: 'Oswald', label: 'Oswald', faces: [{ url: 'app://content/fonts/Oswald.ttf', weight: '200 700' }] },
];

export const SEALS = [
  { id: 'vip', name: 'VIP vàng', url: 'app://content/seals/vip.png' },
  { id: 'heart', name: 'Trái tim đỏ', url: 'app://content/seals/heart.png' },
  { id: 'rose', name: 'Hoa hồng', url: 'app://content/seals/rose.png' },
  { id: 'smile', name: 'Mặt cười xanh', url: 'app://content/seals/smile.png' },
  { id: 'plum', name: 'Hoa mai vàng', url: 'app://content/seals/plum.png' },
  { id: 'leaf', name: 'Lá xanh', url: 'app://content/seals/leaf.png' },
];

export const PAPERS = [
  { id: 'white', name: 'Trắng (mặc định)', url: null, caption: '#2a2420' },
  { id: 'vintage', name: 'Giấy cổ', url: 'app://content/papers/vintage.jpg', caption: '#3a2a18' },
  { id: 'kraft', name: 'Giấy kraft', url: 'app://content/papers/kraft.jpg', caption: '#2a1a0c' },
  { id: 'gold', name: 'Vàng ánh kim', url: 'app://content/papers/gold.jpg', caption: '#3a2408' },
  { id: 'black', name: 'Đen', url: 'app://content/papers/black.jpg', caption: '#f3e9d2' },
  { id: 'pink', name: 'Hồng chấm bi', url: 'app://content/papers/pink.jpg', caption: '#7a2140' },
  { id: 'wood', name: 'Gỗ', url: 'app://content/papers/wood.jpg', caption: '#fff3dc' },
];

export const DEFAULTS = {
  tiktok: { username: '', signApiKey: '', autoConnect: false },
  display: { width: 540, height: 960, frame: true, alwaysOnTop: false, quality: 'medium', fps: 60, showFps: false, zoom: 100 },
  topBoard: {
    line1: 'POLAROID LIVE',
    line1Color: '#ffb347',
    line1Scroll: false,
    itemSeconds: 4,
    ledFont: 'Barlow Condensed', ledWeight: 700, scrollSpeed: 26, ledBrightness: 100,
    items: [
      { text: '1 xu: Khung nhỏ', icon: 'app://content/icons/rose.png', color: '#ffb347' },
      { text: '10 xu: Khung vừa', icon: 'app://content/icons/frame.png', color: '#ffd27a' },
      { text: '40 xu: Khung to nhất', icon: 'app://content/icons/crown.png', color: '#ffe08a' },
    ],
  },
  bottomBoard: {
    joinTemplate: 'Chào mừng {name}!',
    giftTemplate: 'Cảm ơn {name} đã tặng {gift} x{count}!',
    followTemplate: 'Cảm ơn {name} đã follow!',
    idleText: 'Tặng quà để được chụp ảnh polaroid!',
    showJoins: true,
    joinSeconds: 3,
    color: '#ffb347',
    giftColor: '#ffe08a',
  },
  photo: {
    font: 'Patrick Hand', fontUrl: 'app://content/fonts/PatrickHand-Regular.ttf',
    captionColor: '#2a2420', captionSize: 100, captionTemplate: '{name}',
    tiers: { table: 1, small: 5, big: 10 }, // (v1.2, unused)
    tierCoins: { small: 1, medium: 10, big: 40 },
    holdSeconds: 2.5, countByCoins: true, volume: 80, flash: true,
    timing: { approach: 1.15, shutter: 0.35, total: 9 },
    seal: {
      enabled: true, size: 34,
      small: { url: 'app://content/seals/heart.png' },
      medium: { url: 'app://content/seals/rose.png' },
      big: { url: 'app://content/seals/vip.png' },
    },
    sounds: { shutter: null, shutterName: '', stampSound: null, stampName: '', charge: true, stamp: true },
    paperAll: { url: null, caption: '#2a2420' },
    paperTier: {}, // { small|medium|big: { url, caption } } — falls back to paperAll
    paper: {
      table: { url: null, caption: '#2a2420' },
      small: { url: 'app://content/papers/vintage.jpg', caption: '#3a2a18' },
      big: { url: 'app://content/papers/gold.jpg', caption: '#3a2408' },
    },
  },
  clock: { timeZone: 'Asia/Ho_Chi_Minh', format: '24h', blink: true, color: '#ff9628', temp: '28°C', showTemp: true },
  speaker: { low: '#ffaa26', high: '#ff4a0c' },
  music: { enabled: false, volume: 35, shuffle: true, duck: true, tracks: [] },
  customFonts: [],
};

// phones (Android app): lighter defaults — TikTok screen sharing runs at 30 fps anyway
if (globalThis.api?.platform === 'android') {
  Object.assign(DEFAULTS.display, { quality: 'medium', fps: 30, fit: 'cover', autoRes: true });
}

export function merge(base, over) {
  if (Array.isArray(over)) return over;
  if (typeof over !== 'object' || over === null) return over === undefined ? base : over;
  const out = { ...(base || {}) };
  for (const k of Object.keys(over)) out[k] = merge(base ? base[k] : undefined, over[k]);
  return out;
}
export const fill = (tpl, d) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (d[k] ?? ''));

// the old (v1.2) default LED texts, replaced automatically by the new tier texts
export const OLD_TOP_ITEMS = ['1 xu: Ảnh đặt bàn', '5 xu: Khung nhỏ', '10 xu: Khung to'];

// common time zones for the clock (any IANA name works)
export const TIME_ZONES = [
  ['Asia/Ho_Chi_Minh', 'Việt Nam (GMT+7)'], ['Asia/Bangkok', 'Thái Lan (GMT+7)'], ['Asia/Jakarta', 'Indonesia – Jakarta (GMT+7)'],
  ['Asia/Phnom_Penh', 'Campuchia (GMT+7)'], ['Asia/Vientiane', 'Lào (GMT+7)'], ['Asia/Shanghai', 'Trung Quốc (GMT+8)'],
  ['Asia/Hong_Kong', 'Hồng Kông (GMT+8)'], ['Asia/Taipei', 'Đài Loan (GMT+8)'], ['Asia/Singapore', 'Singapore (GMT+8)'],
  ['Asia/Kuala_Lumpur', 'Malaysia (GMT+8)'], ['Asia/Manila', 'Philippines (GMT+8)'], ['Australia/Perth', 'Úc – Perth (GMT+8)'],
  ['Asia/Seoul', 'Hàn Quốc (GMT+9)'], ['Asia/Tokyo', 'Nhật Bản (GMT+9)'], ['Australia/Sydney', 'Úc – Sydney'],
  ['Pacific/Auckland', 'New Zealand'], ['Asia/Kolkata', 'Ấn Độ (GMT+5:30)'], ['Asia/Dubai', 'Dubai (GMT+4)'],
  ['Europe/Moscow', 'Nga – Moskva (GMT+3)'], ['Europe/Berlin', 'Đức / Trung Âu'], ['Europe/Paris', 'Pháp'],
  ['Europe/Prague', 'Séc'], ['Europe/Warsaw', 'Ba Lan'], ['Europe/London', 'Anh'], ['UTC', 'UTC (GMT+0)'],
  ['America/New_York', 'Mỹ – miền Đông (New York)'], ['America/Chicago', 'Mỹ – miền Trung (Chicago)'],
  ['America/Denver', 'Mỹ – Denver'], ['America/Los_Angeles', 'Mỹ – miền Tây (Los Angeles)'], ['America/Toronto', 'Canada – Toronto'],
  ['America/Vancouver', 'Canada – Vancouver'], ['America/Sao_Paulo', 'Brazil'],
];

// seals chosen for a tier (the app picks one at random per photo); [] = no seal
export function sealSetOf(S, kind) {
  const set = S.photo?.sealSet?.[kind];
  if (Array.isArray(set)) return set.filter(Boolean);
  const one = S.photo?.seal?.[kind];                       // older single-seal setting
  const url = one && 'url' in one ? one.url : DEFAULTS.photo.seal[kind]?.url;
  return url ? [url] : [];
}
