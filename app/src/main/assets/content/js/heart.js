// Heart-shaped LED board: like (tim) counter + a heart that beats with the incoming likes.
import { LedBoard } from './led.js';

const fam = (f) => `"${f || 'Barlow Condensed'}", "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
function fmt(n) {
  n = Math.max(0, Math.floor(n));
  if (n < 100000) return n.toLocaleString('de-DE');                 // 12.345
  if (n < 1e6) return (n / 1000).toFixed(n < 1e6 ? 1 : 0).replace('.', ',') + 'K';
  return (n / 1e6).toFixed(2).replace('.', ',') + 'M';
}
// classic heart curve, centred at (cx, cy), width w (LED units)
function heartPath(g, cx, cy, w) {
  const s = w / 32; g.beginPath();
  for (let i = 0; i <= 96; i++) {
    const t = i / 96 * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const px = cx + x * s, py = cy - y * s;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

const ICON = ['01110001110', '11111011111', '11111111111', '11111111111', '01111111110', '00111111100', '00011111000', '00001110000', '00000100000'];

export class HeartBoard {
  constructor(meta) {
    const [w, h] = meta.size || [1, 0.65];
    const cols = 72, rows = Math.max(24, Math.round(cols * h / w));
    this.led = new LedBoard({ cols, rows, width: 1, height: 1, boost: 2.0, offColor: 0x1a0606 });
    if (meta.mask) this.led.setMask(meta.mask);
    this.cfg = {}; this.count = 0; this.shown = 0; this.beat = 0; this.icon = 0; this.acc = 0; this.ripples = [];
    // distance (in LEDs) of every LED from the edge of the screen → the outline follows the real screen border
    const C = cols, R = rows, INF = 1e9;
    const d = new Float32Array(C * R).fill(INF), q = [];
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      if (!this.led.inside(x, y)) continue;
      const edge = x === 0 || y === 0 || x === C - 1 || y === R - 1 || !this.led.inside(x - 1, y) || !this.led.inside(x + 1, y) || !this.led.inside(x, y - 1) || !this.led.inside(x, y + 1);
      if (edge) { d[y * C + x] = 0; q.push(y * C + x); }
    }
    for (let h2 = 0; h2 < q.length; h2++) {
      const k = q[h2], x = k % C, y = (k / C) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
        const j = ny * C + nx; if (d[j] !== INF || !this.led.inside(nx, ny)) continue;
        d[j] = d[k] + 1; q.push(j);
      }
    }
    this.dist = d; this.maxDist = Math.max(1, ...[...d].filter(v => v < INF));
    // centre of the screen area (for the number)
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (d[y * C + x] >= 4 && d[y * C + x] < INF) { sx += x; sy += y; n++; }
    this.center = n ? [sx / n + 0.5, sy / n + 0.5] : [C / 2, R / 2];
  }
  configure(cfg, top) {
    this.cfg = cfg || {};
    if (top?.ledBrightness) this.led.brightness = 2.0 * top.ledBrightness / 100;
    this.font = top?.ledFont; this.weight = top?.ledWeight || 700;
  }
  setCount(n) { this.count = n; if (this.shown > n) this.shown = n; }
  // one like event: the little heart icon beats every time, the border pulses with the rhythm
  like() {
    this.icon = 1;
    const now = performance.now();
    if (!this.lastBeat || now - this.lastBeat > 200) { this.beat = 1; this.lastBeat = now; this.ripples.push(0); if (this.ripples.length > 4) this.ripples.shift(); }
  }
  update(dt) {
    this.beat = Math.max(0, this.beat - dt * 3.2);
    this.icon = Math.max(0, this.icon - dt * 4.5);
    this.ripples = this.ripples.map(r => r + dt * 1.4).filter(r => r < 1);
    const dd = this.count - this.shown;
    this.shown = dd > 0 ? Math.min(this.count, this.shown + Math.max(1, dd * Math.min(1, dt * 10))) : this.count;
    this.acc += dt; if (this.acc < 1 / 30) return; this.acc = 0;
    const c = this.cfg, C = this.led.cols, R = this.led.rows, D = this.dist, INF = 1e9;
    const heartCol = c.heartColor || '#ff2d6f', numCol = c.numberColor || '#ffe08a', iconCol = c.iconColor || heartCol;
    const idle = Math.sin(performance.now() / 1000 * 2.2) * 0.5 + 0.5;
    const thick = 2 + Math.round(Math.max(this.beat * this.beat * 2.4, idle * 0.6));     // border 2 LEDs, thicker on a beat
    this.led.draw((g) => {
      // number + beating heart icon beside it
      const F = fam(this.font), W = this.weight;
      const txt = fmt(this.shown);
      const [cx, cy] = this.center;
      let size = R * 0.42; g.font = `${W} ${size}px ${F}`;
      let m = g.measureText(txt);
      const iconW = ICON[0].length, iconH = ICON.length, base = Math.max(1, Math.round(R * 0.3 / iconH * 10) / 10);
      const gap = 2, maxW = C * 0.62 - iconW * base - gap;
      if (m.width > maxW) { size *= maxW / m.width; g.font = `${W} ${size}px ${F}`; m = g.measureText(txt); }
      const ink = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const total = iconW * base + gap + m.width;
      const x0 = cx - total / 2;
      // icon (scales up on every like)
      const k = base * (1 + 0.45 * this.icon * this.icon);
      const icx = x0 + iconW * base / 2, icy = cy;
      g.fillStyle = iconCol;
      for (let r = 0; r < iconH; r++) for (let q = 0; q < iconW; q++) if (ICON[r][q] === '1')
        g.fillRect(icx + (q - iconW / 2) * k, icy + (r - iconH / 2) * k, k, k);
      g.fillStyle = numCol; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText(txt, Math.round(x0 + iconW * base + gap), Math.round(cy + ink / 2 - m.actualBoundingBoxDescent));
    });
  }
}
