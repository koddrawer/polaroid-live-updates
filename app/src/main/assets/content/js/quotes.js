// Glowing quotes floating in mid-air while the live is idle.
// Appear: sparks swirl in and gather into the letters, then the glowing text lights up.
// Disappear: the text breaks into sparks that drift away and fade.
// Drawn on a 2D canvas over the 9:16 picture (additive blending), only while a quote is on screen.

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeInOut = (t) => (t = Math.min(1, Math.max(0, t)), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hexRgb(h) { const n = parseInt(String(h || '#ffd78a').replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export class QuoteFX {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.w = 2; this.h = 2; this.k = 1;
    this.state = 'idle'; this.t = 0; this.parts = []; this.text = null;
    this.tIn = 1.6; this.tOut = 1.8; this.hold = 6;
    this.sprite = null; this.textImg = null; this.color = '#ffd78a';
  }
  resize(cssW, cssH) {
    const k = Math.min(window.devicePixelRatio || 1, 1.5);
    this.k = k; this.w = Math.max(2, Math.round(cssW * k)); this.h = Math.max(2, Math.round(cssH * k));
    this.cv.width = this.w; this.cv.height = this.h;
    this.cv.style.width = cssW + 'px'; this.cv.style.height = cssH + 'px';
    if (this.state !== 'idle' && this.lastArgs) this.build(...this.lastArgs, true);
  }
  get visible() { return this.state !== 'idle'; }
  // 0..1: how much the background should be blurred for this quote (eases in with the sparks, out with them)
  get focus() {
    if (this.state === 'in') return easeInOut(this.t / (this.tIn * 0.8));
    if (this.state === 'hold') return 1;
    if (this.state === 'out') return 1 - easeInOut(this.t / (this.tOut * 0.85));
    return 0;
  }

  // glow dot sprite in the quote colour
  makeSprite(color) {
    const s = document.createElement('canvas'); s.width = s.height = 32;
    const g = s.getContext('2d'); const [r, gg, b] = hexRgb(color);
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, `rgba(${Math.min(255, r + 60)},${Math.min(255, gg + 60)},${Math.min(255, b + 60)},0.95)`);
    grd.addColorStop(0.45, `rgba(${r},${gg},${b},0.35)`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    return s;
  }

  // lay the text out (wrapped, centred) and sample it into spark targets
  build(text, opts, keepPhase) {
    const { font = 'Dancing Script', color = '#ffd78a', sizePct = 100, y = 0.5 } = opts || {};
    this.lastArgs = [text, opts];
    this.color = color;
    this.sprite = this.makeSprite(color);
    const W = this.w, H = this.h;
    const maxW = W * 0.84;
    let size = W * 0.085 * sizePct / 100;
    const fam = `"${font}", "Dancing Script", Georgia, serif`;
    const mc = document.createElement('canvas').getContext('2d');
    const wrap = (sz) => {
      mc.font = `600 ${sz}px ${fam}`;
      const words = String(text).split(/\s+/); const lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (mc.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      return lines;
    };
    let lines = wrap(size);
    while (lines.length > 4 && size > 10) { size *= 0.9; lines = wrap(size); }
    const lh = size * 1.25, blockH = lh * lines.length;
    // text image (with glow), drawn once
    const ti = document.createElement('canvas'); ti.width = W; ti.height = H;
    const tg = ti.getContext('2d');
    tg.font = `600 ${size}px ${fam}`; tg.textAlign = 'center'; tg.textBaseline = 'middle';
    const cy = H * y - blockH / 2 + lh / 2;
    const [r, gg, b] = hexRgb(color);
    // soft dark halo behind the letters so they stay readable on the light wall
    tg.shadowColor = 'rgba(20,8,0,0.55)'; tg.shadowBlur = size * 0.5; tg.fillStyle = 'rgba(30,14,4,0.35)';
    lines.forEach((ln, i) => tg.fillText(ln, W / 2, cy + i * lh));
    for (const pass of [{ blur: size * 0.55, col: `rgba(${r},${gg},${b},0.9)` }, { blur: size * 0.18, col: `rgba(${r},${gg},${b},1)` }, { blur: 0, col: `rgba(255,${Math.min(255, gg + 70)},${Math.min(255, b + 120)},1)` }]) {
      tg.shadowColor = `rgba(${r},${gg},${b},1)`; tg.shadowBlur = pass.blur; tg.fillStyle = pass.col;
      lines.forEach((ln, i) => tg.fillText(ln, W / 2, cy + i * lh));
    }
    this.textImg = ti;
    if (keepPhase) return;
    // sample the letters into spark targets
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
    const sg = sc.getContext('2d'); sg.font = tg.font; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillStyle = '#fff';
    lines.forEach((ln, i) => sg.fillText(ln, W / 2, cy + i * lh));
    const top = Math.max(0, Math.floor(cy - lh)), bot = Math.min(H, Math.ceil(cy + blockH));
    const data = sg.getImageData(0, top, W, bot - top).data;
    const step = Math.max(2, Math.round(size / 14));
    const pts = [];
    for (let yy = 0; yy < bot - top; yy += step) for (let xx = 0; xx < W; xx += step) if (data[(yy * W + xx) * 4 + 3] > 120) pts.push([xx, yy + top]);
    // keep it light on slow machines
    const maxN = 1400;
    const keep = pts.length > maxN ? pts.filter((_, i) => i % Math.ceil(pts.length / maxN) === 0) : pts;
    const spread = W * 0.28;
    this.parts = keep.map(([tx, ty]) => {
      const a = Math.random() * Math.PI * 2, d = spread * (0.35 + Math.random() * 0.9);
      return {
        tx, ty, sx: tx + Math.cos(a) * d, sy: ty + Math.sin(a) * d * 0.6 + spread * 0.25,
        delay: Math.random() * 0.45, sz: (0.6 + Math.random() * 0.9) * step * 2.2,
        vx: (Math.random() - 0.5) * W * 0.12, vy: -(0.05 + Math.random() * 0.18) * H, tw: Math.random() * 6.28,
      };
    });
  }

  show(text, opts) {
    this.build(text, opts);
    this.hold = Math.max(0.5, Number(opts?.hold) || 6);
    this.state = 'in'; this.t = 0;
  }
  hide() { if (this.state === 'in' || this.state === 'hold') { this.state = 'out'; this.t = 0; } }
  done() { return this.state === 'idle'; }

  update(dt) {
    if (this.state === 'idle') return;
    this.t += dt;
    const g = this.g, W = this.w, H = this.h, k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const spr = this.sprite;
    if (this.state === 'in') {
      const T = this.tIn;
      for (const p of this.parts) {
        const u = easeInOut((this.t - p.delay) / (T * 0.75));
        if (u <= 0) continue;
        const x = p.sx + (p.tx - p.sx) * u, y = p.sy + (p.ty - p.sy) * u;
        const s = p.sz * (1.6 - 0.6 * u);
        g.globalAlpha = Math.min(1, u * 1.4) * (1 - 0.55 * Math.max(0, (this.t - T * 0.8) / (T * 0.2)));
        g.drawImage(spr, x - s / 2, y - s / 2, s, s);
      }
      g.globalAlpha = easeOut((this.t - T * 0.55) / (T * 0.45));
      if (g.globalAlpha > 0) g.drawImage(this.textImg, 0, 0);
      if (this.t >= T) { this.state = 'hold'; this.t = 0; }
    } else if (this.state === 'hold') {
      g.globalAlpha = 0.9 + 0.1 * Math.sin(this.t * 2.2);
      g.drawImage(this.textImg, 0, 0);
      // a few twinkles on the letters
      const n = Math.min(40, this.parts.length);
      for (let i = 0; i < n; i++) {
        const p = this.parts[(i * 97 + Math.floor(this.t * 3) * 31) % this.parts.length];
        const a = Math.max(0, Math.sin(this.t * 3 + p.tw * 3));
        if (a < 0.6) continue;
        g.globalAlpha = (a - 0.6) * 2; const s = p.sz * 1.4;
        g.drawImage(spr, p.tx - s / 2, p.ty - s / 2, s, s);
      }
      if (this.t >= this.hold) { this.state = 'out'; this.t = 0; }
    } else if (this.state === 'out') {
      const T = this.tOut;
      g.globalAlpha = 1 - easeOut(this.t / (T * 0.3));
      if (g.globalAlpha > 0) g.drawImage(this.textImg, 0, 0);
      for (const p of this.parts) {
        const u = Math.max(0, (this.t - p.delay * 0.5) / (T * 0.8));
        if (u >= 1) continue;
        const e = easeOut(u);
        const x = p.tx + p.vx * e + Math.sin(p.tw + this.t * 3) * 4 * k, y = p.ty + p.vy * e;
        const s = p.sz * (1 + 0.6 * u);
        g.globalAlpha = Math.pow(1 - u, 1.2) * 0.9;
        g.drawImage(spr, x - s / 2, y - s / 2, s, s);
      }
      if (this.t >= T) { this.state = 'idle'; g.globalAlpha = 1; g.clearRect(0, 0, W, H); }
    }
    g.globalAlpha = 1;
  }
}

export const DEFAULT_QUOTES = [
  'Every moment is a fresh beginning.', 'Smile — it looks great on you!', "You are someone's reason to smile.",
  'Good things take time.', 'Stay close to people who feel like sunshine.', 'Wishing you a day full of little joys.',
  'Be the reason someone smiles today.', 'Collect moments, not things.', 'You make this live brighter!',
  'Happiness looks gorgeous on you.', 'Dream big, sparkle more, shine bright.', 'May your heart be light and your days be bright.',
  "Life is better when you're laughing.", 'You are enough, just as you are.', 'Some memories are worth framing.',
  'Thank you for being here tonight!', 'Kindness is always in style.', 'Keep shining, beautiful soul.',
  'The best is yet to come.', 'Wishing you love, luck and laughter.', "You're glowing today!", 'Choose joy.',
  'Make today amazing.', 'Sending good vibes your way!', 'Do more of what makes you happy.',
  'Your smile is your best accessory.', "Here's to the moments that take our breath away.", 'Stay wild, stay kind, stay you.',
  'May all your wishes come true.', 'Life is a picture — make it beautiful.',
];
