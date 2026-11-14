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

export class HeartBoard {
  constructor(meta) {
    const [w, h] = meta.size || [1, 0.65];
    const cols = 72, rows = Math.max(24, Math.round(cols * h / w));
    this.led = new LedBoard({ cols, rows, width: 1, height: 1, boost: 2.0, offColor: 0x1a0606 });
    if (meta.mask) this.led.setMask(meta.mask);
    this.cfg = {}; this.count = 0; this.shown = 0; this.beat = 0; this.beats = []; this.acc = 0; this.ripples = [];
  }
  configure(cfg, top) {
    this.cfg = cfg || {};
    if (top?.ledBrightness) this.led.brightness = 2.0 * top.ledBrightness / 100;
    this.font = top?.ledFont; this.weight = top?.ledWeight || 700;
  }
  setCount(n) { this.count = Math.max(this.count, n); }
  // one like event (count = likes in this batch) → a heart beat
  like(n = 1) {
    this.count += n;
    const now = performance.now();
    // beats follow the like rhythm but never faster than ~4 per second
    if (!this.lastBeat || now - this.lastBeat > 240) { this.beat = 1; this.lastBeat = now; this.ripples.push(0); if (this.ripples.length > 4) this.ripples.shift(); }
  }
  update(dt) {
    this.beat = Math.max(0, this.beat - dt * 3.2);
    this.ripples = this.ripples.map(r => r + dt * 1.6).filter(r => r < 1);
    // number rolls up smoothly
    const d = this.count - this.shown;
    this.shown = d > 0 ? this.shown + Math.max(1, d * Math.min(1, dt * 8)) : this.count;
    if (this.shown > this.count) this.shown = this.count;
    this.acc += dt; if (this.acc < 1 / 30) return; this.acc = 0;
    const c = this.cfg, C = this.led.cols, R = this.led.rows;
    const heartCol = c.heartColor || '#ff2d6f', numCol = c.numberColor || '#ffe08a', labCol = c.labelColor || '#ffb347';
    const idle = Math.sin(performance.now() / 1000 * 2.2) * 0.5 + 0.5;          // gentle breathing when nobody taps
    const pulse = Math.max(this.beat * this.beat, idle * 0.15);
    this.led.draw((g) => {
      const cx = C / 2, cy = R * 0.44;
      // ripples: thin heart outlines growing outwards
      g.lineWidth = 1.1;
      for (const r of this.ripples) {
        g.strokeStyle = heartCol; g.globalAlpha = 1 - r;
        heartPath(g, cx, cy, C * (0.8 + r * 0.45)); g.stroke();
      }
      g.globalAlpha = 1;
      // the beating heart outline (2 LEDs thick)
      g.lineWidth = 2.2; g.strokeStyle = heartCol;
      heartPath(g, cx, cy, C * (0.74 + pulse * 0.1)); g.stroke();
      // number in the middle, label underneath
      const F = fam(this.font), W = this.weight;
      const txt = fmt(this.shown);
      let size = R * 0.4; g.font = `${W} ${size}px ${F}`;
      let m = g.measureText(txt); const maxW = C * 0.5;
      if (m.width > maxW) { size *= maxW / m.width; g.font = `${W} ${size}px ${F}`; m = g.measureText(txt); }
      g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = numCol;
      const ink = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const ny = cy + R * 0.0;
      g.fillText(txt, Math.round(cx), Math.round(ny + ink / 2 - m.actualBoundingBoxDescent));
      const lab = c.label ?? 'TIM';
      if (lab) {
        let ls = R * 0.17; g.font = `${W} ${ls}px ${F}`; let lm = g.measureText(lab);
        if (lm.width > C * 0.34) { ls *= C * 0.34 / lm.width; g.font = `${W} ${ls}px ${F}`; lm = g.measureText(lab); }
        g.fillStyle = labCol;
        g.fillText(lab, Math.round(cx), Math.round(ny + ink / 2 + R * 0.06 + lm.actualBoundingBoxAscent));
      }
    });
  }
}
