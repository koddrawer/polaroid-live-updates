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

export const DEFAULTS = {
  tiktok: { username: '', signApiKey: '', autoConnect: false },
  display: { width: 540, height: 960, frame: true, alwaysOnTop: false, quality: 'medium', fps: 60, showFps: false, zoom: 100 },
  topBoard: {
    line1: 'POLAROID LIVE ✦ CHỤP ẢNH CHO BẠN',
    line1Color: '#ffb347',
    line1Scroll: false,
    itemSeconds: 4,
    items: [
      { text: '1 xu - Chụp ảnh đặt lên bàn', icon: 'app://content/icons/rose.png', color: '#ffb347' },
      { text: '5 xu - Treo khung nhỏ', icon: 'app://content/icons/frame.png', color: '#ffd27a' },
      { text: '10 xu - Treo khung to', icon: 'app://content/icons/crown.png', color: '#ffe08a' },
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
    tiers: { table: 1, small: 5, big: 10 },
    holdSeconds: 2.5, countByCoins: true, volume: 80, flash: true,
  },
  customFonts: [],
};

export function merge(base, over) {
  if (Array.isArray(over)) return over;
  if (typeof over !== 'object' || over === null) return over === undefined ? base : over;
  const out = { ...(base || {}) };
  for (const k of Object.keys(over)) out[k] = merge(base ? base[k] : undefined, over[k]);
  return out;
}
export const fill = (tpl, d) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (d[k] ?? ''));
