// LED screens built into the scene props: the Chrono desk clock and the wall speaker's equalizer.
import { LedBoard } from './led.js';

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Wall-clock parts in any IANA time zone (falls back to the computer's zone if the name is invalid)
const fmtCache = new Map();
export function zonedParts(date, timeZone) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' };
    try { f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timeZone || undefined }); }
    catch { f = new Intl.DateTimeFormat('en-US', opts); }
    fmtCache.set(timeZone, f);
  }
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: o.year, mo: o.month, d: o.day, h: Number(o.hour) % 24, mi: o.minute, s: Number(o.second), wd: WD[o.weekday] ?? 0 };
}

// ------------------------------------------------------------------ CLOCK
// Recreates the screen design from the Chrono clock model (led_screen.png): 128×96 amber LEDs —
// weather icon + temperature and date on top, big HH:MM, divider with a gear, calendar + day/date
// bottom-left, thermometer + temperature bottom-right. Icons are copied LED-for-LED from the design.
const CLOCK_DECO = [[10,1,1],[10,2,1],[6,3,1],[14,3,1],[9,4,4],[8,5,1],[12,5,2],[7,6,1],[13,6,1],[4,7,2],[7,7,1],[13,7,1],[16,7,1],[7,8,1],[13,8,1],[7,9,2],[11,9,8],[8,10,4],[19,10,1],[6,11,1],[10,11,1],[19,11,1],[10,12,1],[19,12,1],[10,13,1],[19,13,1],[11,14,8],[63,63,2],[63,64,2],[58,65,1],[63,65,2],[69,65,1],[59,66,10],[59,67,3],[66,67,3],[59,68,2],[68,68,1],[59,69,1],[63,69,2],[68,69,2],[56,70,4],[62,70,4],[68,70,4],[6,71,46],[56,71,4],[62,71,4],[68,71,5],[76,71,46],[59,72,1],[63,72,3],[68,72,2],[59,73,2],[68,73,1],[59,74,2],[67,74,2],[59,75,10],[58,76,1],[62,76,4],[69,76,1],[87,77,2],[86,78,1],[88,78,1],[6,79,9],[86,79,1],[88,79,1],[6,80,1],[14,80,1],[86,80,1],[88,80,1],[6,81,1],[14,81,1],[86,81,1],[88,81,1],[6,82,9],[86,82,1],[88,82,1],[6,83,1],[14,83,1],[86,83,1],[88,83,1],[6,84,1],[14,84,1],[86,84,1],[88,84,1],[6,85,1],[14,85,1],[86,85,4],[6,86,1],[14,86,1],[85,86,5],[6,87,9],[84,87,7],[84,88,7],[85,89,5],[86,90,4],[63,77,2],[63,78,2],[63,79,2],[64,80,1],[64,81,1],[64,82,1]];
const PIX = {"0": ".##.|#..#|#..#|#..#|#..#|.##.", "1": ".#.|##.|.#.|.#.|.#.|###", "2": ".##.|#..#|..#.|.#..|#...|####", "3": "###.|...#|.##.|...#|...#|###.", "4": "#..#|#..#|####|...#|...#|...#", "5": "####|#...|###.|...#|...#|###.", "6": ".##.|#...|###.|#..#|#..#|.##.", "7": "####|...#|..#.|.#..|.#..|.#..", "8": ".##.|#..#|.##.|#..#|#..#|.##.", "9": ".##.|#..#|#..#|.###|...#|.##.", "A": ".##.|#..#|#..#|####|#..#|#..#", "B": "###.|#..#|###.|#..#|#..#|###.", "C": ".###|#...|#...|#...|#...|.###", "D": "###.|#..#|#..#|#..#|#..#|###.", "E": "####|#...|###.|#...|#...|####", "F": "####|#...|###.|#...|#...|#...", "G": ".###|#...|#.##|#..#|#..#|.###", "H": "#..#|#..#|####|#..#|#..#|#..#", "I": "###|.#.|.#.|.#.|.#.|###", "J": "...#|...#|...#|...#|#..#|.##.", "K": "#..#|#.#.|##..|#.#.|#..#|#..#", "L": "#...|#...|#...|#...|#...|####", "M": "#...#|##.##|#.#.#|#...#|#...#|#...#", "N": "#..#|##.#|##.#|#.##|#.##|#..#", "O": ".##.|#..#|#..#|#..#|#..#|.##.", "P": "###.|#..#|#..#|###.|#...|#...", "Q": ".##.|#..#|#..#|#..#|#.#.|.#.#", "R": "###.|#..#|#..#|###.|#.#.|#..#", "S": ".###|#...|.##.|...#|...#|###.", "T": "###|.#.|.#.|.#.|.#.|.#.", "U": "#..#|#..#|#..#|#..#|#..#|.##.", "V": "#..#|#..#|#..#|#..#|.##.|.##.", "W": "#...#|#...#|#...#|#.#.#|##.##|#...#", "X": "#..#|#..#|.##.|.##.|#..#|#..#", "Y": "#.#|#.#|#.#|.#.|.#.|.#.", "Z": "####|...#|..#.|.#..|#...|####", "°": ".#.|#.#|.#.|...|...|...", "-": "...|...|###|...|...|...", ":": ".|#|.|.|#|.", ".": ".|.|.|.|.|#", "/": "...#|..#.|..#.|.#..|.#..|#..."};
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const glyph = (ch) => PIX[ch] ? PIX[ch].split('|') : null;
function pixWidth(text) {
  let w = 0;
  for (const ch of text.toUpperCase()) { const g = glyph(ch); w += g ? g[0].length + 1 : 2; }
  return Math.max(0, w - 1);
}
// 6-row LED pixel font (like the small text on the design), one fillRect per lit LED
function pixText(g, text, x, y, k = 1) {
  for (const ch of text.toUpperCase()) {
    const gl = glyph(ch);
    if (!gl) { x += 2 * k; continue; }
    for (let r = 0; r < gl.length; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '#') g.fillRect(x + c * k, y + r * k, k, k);
    x += gl[0].length * k + 1;
  }
}
// one big digit, ink height h LEDs, centred on cx
function bigDigit(g, ch, family, cx, top, h, maxW) {
  g.font = `800 ${h}px ${family}`;
  const z0 = g.measureText('0');
  let size = h * h / Math.max(1, z0.actualBoundingBoxAscent + z0.actualBoundingBoxDescent);
  g.font = `800 ${size}px ${family}`;
  let m = g.measureText(ch);
  if (m.width > maxW) { size *= maxW / m.width; g.font = `800 ${size}px ${family}`; m = g.measureText(ch); }
  const z = g.measureText('0');
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(ch, Math.round(cx - m.width / 2), Math.round(top + z.actualBoundingBoxAscent));
}

// Simple, readable layout: big HH:MM on top, DD/MM/YYYY below (coarse 64×48 LED grid so it reads
// even when the clock is small on screen).
function fitInk(g, text, family, weight, h, maxW) {
  g.font = `${weight} ${h}px ${family}`;
  const z = g.measureText('0123456789');
  let size = h * h / Math.max(1, z.actualBoundingBoxAscent + z.actualBoundingBoxDescent);
  g.font = `${weight} ${size}px ${family}`;
  let w = g.measureText(text).width;
  if (w > maxW) { size *= maxW / w; g.font = `${weight} ${size}px ${family}`; w = g.measureText(text).width; }
  const m = g.measureText('0123456789');
  return { w, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
}
export class ClockScreen {
  constructor() {
    this.led = new LedBoard({ cols: 64, rows: 48, width: 1, height: 1, boost: 2.0, offColor: 0x0c0703 });
    this.cfg = {}; this.key = '';
  }
  configure(cfg, top) { this.cfg = cfg || {}; this.key = ''; if (top?.ledBrightness) this.led.brightness = 2.0 * top.ledBrightness / 100; }
  update() {
    const c = this.cfg, now = new Date();
    const p = zonedParts(now, c.timeZone);
    const colon = c.blink === false || now.getMilliseconds() < 500;
    let hh = p.h;
    if (c.format === '12h') hh = hh % 12 || 12;
    const hs = String(hh).padStart(2, '0');
    const date = `${p.d}/${p.mo}/${p.y}`;
    const key = [hs, p.mi, colon, date, c.color].join('|');
    if (key === this.key) return;
    this.key = key;
    this.led.draw((g, C) => {
      g.fillStyle = c.color || '#ff9628';
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      // time: digits at fixed positions so the blinking colon never shifts them
      const F = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
      const T = fitInk(g, '00:00', F, 700, 22, C - 4);
      const digitW = g.measureText('0').width, colW = g.measureText(':').width;
      const base = 3 + T.asc;
      let x = Math.round((C - (digitW * 4 + colW)) / 2);
      for (const ch of [hs[0], hs[1], ':', p.mi[0], p.mi[1]]) {
        const w = ch === ':' ? colW : digitW;
        if (ch !== ':' || colon) { const cw = g.measureText(ch).width; g.fillText(ch, Math.round(x + (w - cw) / 2), Math.round(base)); }
        x += w;
      }
      // divider
      for (let i = 4; i < C - 4; i += 2) g.fillRect(i, 29, 1, 1);
      // date
      const D = fitInk(g, date, F, 700, 12, C - 2);
      g.fillText(date, Math.round((C - D.w) / 2), Math.round(32 + D.asc));
    });
  }
}

// ------------------------------------------------------------------ SPEAKER EQUALIZER
// Same look as the wall speaker's screen design: 128×56 LEDs, 61 one-LED-wide bars on every other
// column, colour fading from amber at the bottom to red-orange at the top; driven by the music.
const hex = (h) => { const n = parseInt(String(h || '#000').replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export class SpeakerScreen {
  constructor() {
    this.led = new LedBoard({ cols: 128, rows: 56, width: 1, height: 1, boost: 2.0, offColor: 0x241208 });
    this.bars = 61; this.x0 = 3; this.base = 53; this.maxH = 47;
    this.level = new Float32Array(this.bars);
    this.analyser = null; this.data = null; this.acc = 0; this.cfg = {}; this.rowCol = [];
  }
  configure(cfg, top) {
    this.cfg = cfg || {};
    if (top?.ledBrightness) this.led.brightness = 2.0 * top.ledBrightness / 100;
    const lo = hex(this.cfg.low || '#ffaa26'), hi = hex(this.cfg.high || '#ff4a0c');
    this.rowCol = [];
    for (let r = 0; r < this.maxH; r++) {
      const k = r / (this.maxH - 1), c = lo.map((v, i) => Math.round(v + (hi[i] - v) * k));
      this.rowCol.push('rgb(' + c.join(',') + ')');
    }
  }
  setAnalyser(an) {
    this.analyser = an;
    if (!an) return;
    this.data = new Uint8Array(an.frequencyBinCount);
    // log-spaced bands 45 Hz … 16 kHz (fractional bin ranges so the low bars stay distinct)
    const hz = an.context.sampleRate / 2 / an.frequencyBinCount;
    this.bands = [];
    for (let i = 0; i < this.bars; i++) {
      const f0 = 45 * Math.pow(16000 / 45, i / this.bars), f1 = 45 * Math.pow(16000 / 45, (i + 1) / this.bars);
      this.bands.push([f0 / hz, Math.max(f0 / hz + 0.5, f1 / hz)]);
    }
  }
  sample(a, b) {
    const d = this.data, n = d.length - 1;
    let s = 0, k = 0;
    for (let x = a; x <= b; x += 0.5) { const i = Math.min(n, Math.floor(x)), f = x - i; s += d[i] * (1 - f) + d[Math.min(n, i + 1)] * f; k++; }
    return s / Math.max(1, k) / 255;
  }
  update(dt, t, playing) {
    const an = this.analyser, B = this.bars;
    if (an && playing) {
      an.getByteFrequencyData(this.data);
      for (let i = 0; i < B; i++) {
        let v = this.sample(this.bands[i][0], this.bands[i][1]);
        v = Math.max(0, (v - 0.12) / 0.8);
        v = Math.min(1, Math.pow(v, 1.2) * (1 + i * 0.012));
        const cur = this.level[i];
        this.level[i] = v > cur ? cur + (v - cur) * Math.min(1, dt * 35) : Math.max(v, cur - dt * 1.8);
      }
    } else {
      for (let i = 0; i < B; i++) this.level[i] = Math.max(0, this.level[i] - dt * 1.8);
    }
    this.acc += dt; if (this.acc < 1 / 30) return; this.acc = 0;
    if (!this.rowCol.length) this.configure(this.cfg);
    this.led.draw((g) => {
      for (let i = 0; i < B; i++) {
        const x = this.x0 + i * 2;
        const h = Math.max(1, Math.round(this.level[i] * this.maxH)); // bottom LED always lit
        for (let r = 0; r < h; r++) { g.fillStyle = this.rowCol[r]; g.fillRect(x, this.base - r, 1, 1); }
      }
    });
  }
}
