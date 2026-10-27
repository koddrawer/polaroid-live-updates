// LED screens built into the scene props: the Chrono desk clock and the wall speaker's equalizer.
import { LedBoard } from './led.js';

const fam = (f) => `"${f || 'Barlow Condensed'}", "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
const WEEKDAYS = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
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

// Fit text so its ink box is `h` LEDs tall (and at most `w` wide); draws centred at (cx, top).
function inkText(g, text, family, weight, cx, top, h, w) {
  let size = h;
  g.font = `${weight} ${size}px ${family}`;
  let m = g.measureText(text);
  size *= h / Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  g.font = `${weight} ${size}px ${family}`;
  m = g.measureText(text);
  if (m.width > w) { size *= w / m.width; g.font = `${weight} ${size}px ${family}`; m = g.measureText(text); }
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(text, Math.round(cx - m.width / 2), Math.round(top + (h - inkH) / 2 + m.actualBoundingBoxAscent));
  return m.width;
}

// ------------------------------------------------------------------ CLOCK
export class ClockScreen {
  constructor() {
    this.led = new LedBoard({ cols: 44, rows: 33, width: 1, height: 1, boost: 2.0 });
    this.cfg = {}; this.key = '';
  }
  configure(cfg, top) { this.cfg = cfg || {}; this.font = top?.ledFont; this.key = ''; if (top?.ledBrightness) this.led.brightness = 2.0 * top.ledBrightness / 100; }
  update(dt, t) {
    const c = this.cfg, now = new Date();
    const p = zonedParts(now, c.timeZone);
    const colon = now.getMilliseconds() < 500 || c.blink === false;
    let hh = p.h, ampm = '';
    if (c.format === '12h') { ampm = hh < 12 ? 'SA' : 'CH'; hh = hh % 12 || 12; }
    const time = `${c.format === '12h' ? hh : String(hh).padStart(2, '0')}${colon ? ':' : ' '}${p.mi}`;
    // second line alternates: date ↔ weekday (every 4 s)
    const showDay = Math.floor(now.getTime() / 4000) % 2 === 1 && c.weekday !== false;
    const line2 = showDay ? WEEKDAYS[p.wd] + (ampm ? ' ' + ampm : '') : `${p.d}/${p.mo}/${p.y}`;
    const key = time + '|' + line2 + '|' + this.font;
    if (key === this.key) return;
    this.key = key;
    const F = fam(this.font);
    this.led.draw((g, C, R) => {
      // time: draw digits at fixed width so the colon blink doesn't shift them
      g.fillStyle = c.color || '#ffb347';
      const hT = 14, top = 2;
      g.font = `700 20px ${F}`;
      const probe = g.measureText('00:00');
      const k = hT / Math.max(1, probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent);
      let size = 20 * k; g.font = `700 ${size}px ${F}`;
      let wFull = g.measureText(time.replace(' ', ':')).width;
      if (wFull > C - 2) { size *= (C - 2) / wFull; g.font = `700 ${size}px ${F}`; wFull = g.measureText(time.replace(' ', ':')).width; }
      const m = g.measureText('0');
      const base = Math.round(top + (hT + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      let x = Math.round((C - wFull) / 2);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      for (const ch of time) {
        const cw = g.measureText(ch === ' ' ? ':' : ch).width;
        if (ch !== ' ') g.fillText(ch, x, base);
        x += cw;
      }
      // separator line
      g.fillStyle = c.color2 || '#ff8a3c';
      for (let i = 3; i < C - 3; i += 2) g.fillRect(i, 18, 1, 1);
      g.fillStyle = c.color2 || '#ffd27a';
      inkText(g, line2, F, 700, C / 2, 20, 10, C - 3);
    });
  }
}

// ------------------------------------------------------------------ SPEAKER EQUALIZER
export class SpeakerScreen {
  constructor() {
    this.led = new LedBoard({ cols: 38, rows: 16, width: 1, height: 1, boost: 2.0 });
    this.bars = 13; this.level = new Float32Array(this.bars); this.peak = new Float32Array(this.bars); this.peakHold = new Float32Array(this.bars);
    this.analyser = null; this.data = null; this.acc = 0; this.cfg = {};
  }
  configure(cfg, top) { this.cfg = cfg || {}; if (top?.ledBrightness) this.led.brightness = 2.0 * top.ledBrightness / 100; }
  setAnalyser(an) {
    this.analyser = an;
    if (!an) return;
    this.data = new Uint8Array(an.frequencyBinCount);
    // log-spaced bands 50 Hz … 14 kHz
    const sr = an.context.sampleRate, n = an.frequencyBinCount, hz = sr / 2 / n;
    this.bands = [];
    for (let i = 0; i < this.bars; i++) {
      const f0 = 50 * Math.pow(14000 / 50, i / this.bars), f1 = 50 * Math.pow(14000 / 50, (i + 1) / this.bars);
      const a = Math.max(1, Math.floor(f0 / hz)), b = Math.max(a + 1, Math.ceil(f1 / hz));
      this.bands.push([a, Math.min(n, b)]);
    }
  }
  update(dt, t, playing) {
    // targets from the music analyser (0..1)
    const an = this.analyser, B = this.bars;
    let any = false;
    if (an && playing) {
      an.getByteFrequencyData(this.data);
      for (let i = 0; i < B; i++) {
        const [a, b] = this.bands[i];
        let s = 0, mx = 0;
        for (let k = a; k < b; k++) { s += this.data[k]; if (this.data[k] > mx) mx = this.data[k]; }
        let v = (0.6 * mx + 0.4 * s / (b - a)) / 255;
        v = Math.max(0, (v - 0.18) / 0.75);            // drop the noise floor
        v = Math.min(1, Math.pow(v, 1.35) * (1 + i * 0.05)); // tilt so highs show too
        const cur = this.level[i];
        this.level[i] = v > cur ? cur + (v - cur) * Math.min(1, dt * 30) : Math.max(v, cur - dt * 1.6);
        if (this.level[i] > 0.02) any = true;
      }
    } else {
      for (let i = 0; i < B; i++) this.level[i] = Math.max(0, this.level[i] - dt * 1.6);
    }
    for (let i = 0; i < B; i++) {
      if (this.level[i] >= this.peak[i]) { this.peak[i] = this.level[i]; this.peakHold[i] = 0.35; }
      else if ((this.peakHold[i] -= dt) <= 0) this.peak[i] = Math.max(this.level[i], this.peak[i] - dt * 0.9);
    }
    // redraw at ~30 fps
    this.acc += dt; if (this.acc < 1 / 30) return; this.acc = 0;
    const c = this.cfg;
    const cols = [c.low || '#3cff6a', c.mid || '#ffd23c', c.high || '#ff4a2a'];
    this.led.draw((g, C, R) => {
      const bw = 2, gap = 1, total = B * (bw + gap) - gap, x0 = Math.floor((C - total) / 2);
      const rows = R - 1;
      for (let i = 0; i < B; i++) {
        const x = x0 + i * (bw + gap);
        const h = Math.round(this.level[i] * rows);
        for (let r = 0; r < h; r++) {
          const fr = r / rows;
          g.fillStyle = fr < 0.55 ? cols[0] : fr < 0.82 ? cols[1] : cols[2];
          g.fillRect(x, R - 1 - r, bw, 1);
        }
        const pk = Math.round(this.peak[i] * rows);
        if (pk > 0 && pk >= h) { g.fillStyle = cols[2]; g.fillRect(x, R - 1 - pk, bw, 1); }
        // baseline LED so the screen never looks dead
        if (h === 0) { g.fillStyle = cols[0]; g.fillRect(x, R - 1, bw, 1); }
      }
    });
    return any;
  }
}
