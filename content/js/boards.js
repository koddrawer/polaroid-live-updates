// Content logic for the two LED boards.
import { LedBoard, fitFont } from './led.js';
import { loadImage } from './print.js';
import { fill } from './defaults.js';

const LED_FONT = '"Oswald", "Arial Narrow", Arial, sans-serif';
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ------------------------------------------------------------------ TOP BOARD
// line 1: user text (static/scroll). line 2: rotating items (icon + text) inside a chasing rounded box.
export class TopBoard {
  constructor(geo) {
    this.led = new LedBoard({ cols: geo.cols, rows: geo.rows, width: 1, height: 1, boost: 3.0 });
    this.cfg = null; this.items = []; this.idx = 0; this.itemT = 0; this.trans = 1; this.prev = null;
    this.scroll1 = 0; this.icons = new Map(); this.dirty = true;
  }
  configure(cfg) {
    this.cfg = cfg;
    this.items = (cfg.items || []).filter(i => (i.text || '').trim() || i.icon);
    for (const it of this.items) if (it.icon && !this.icons.has(it.icon)) {
      this.icons.set(it.icon, null);
      loadImage(it.icon).then(im => { this.icons.set(it.icon, im); this.dirty = true; });
    }
    if (this.idx >= this.items.length) this.idx = 0;
    this.dirty = true;
  }
  update(dt, t) {
    const cfg = this.cfg; if (!cfg) return;
    const C = this.led.cols, R = this.led.rows;
    const secs = Math.max(1, cfg.itemSeconds || 4);
    if (this.items.length > 1) {
      this.itemT += dt;
      if (this.itemT > secs) { this.itemT = 0; this.prev = this.idx; this.idx = (this.idx + 1) % this.items.length; this.trans = 0; }
    }
    if (this.trans < 1) this.trans = Math.min(1, this.trans + dt / 0.45);
    this.scroll1 += dt * 22;
    const l1H = Math.round(R * 0.40);
    this.led.draw((g) => {
      // ---- line 1
      const text = cfg.line1 || '';
      g.fillStyle = cfg.line1Color || '#ffb347';
      const { size, width } = fitFont(g, text, LED_FONT, 700, l1H * 0.92, 1e9);
      g.textBaseline = 'middle';
      const y1 = l1H / 2 + 1.5;
      if (cfg.line1Scroll || width > C - 4) {
        g.font = `700 ${size}px ${LED_FONT}`;
        const gap = 28, period = width + gap;
        const off = this.scroll1 % period;
        let x = ((C - off) % period + period) % period - period;
        for (; x < C; x += period) g.fillText(text, Math.round(x), y1);
      } else {
        g.textAlign = 'center'; g.fillText(text, C / 2, y1); g.textAlign = 'left';
      }
      // ---- divider ornament
      const dy = l1H + 3;
      g.fillStyle = cfg.line1Color || '#ffb347';
      for (let x = 6; x < C - 6; x += 3) if (Math.abs(x - C / 2) > 6) g.fillRect(x, dy, 1.4, 1.4);
      g.save(); g.translate(C / 2, dy + 0.7); g.rotate(Math.PI / 4); g.fillRect(-2.5, -2.5, 5, 5); g.restore();
      // ---- rounded chase box
      const bx = 3, by = dy + 5, bw = C - 6, bh = R - by - 2, rr = 5;
      const per = 2 * (bw + bh);
      const chase = (t * 24) % 6;
      for (let s = 0; s < per; s += 2) {
        const k = Math.floor((s / 2 + chase)) % 3;
        g.fillStyle = k === 0 ? 'rgba(255,170,60,0.45)' : (this.curItem()?.color || '#ffb347');
        let x, y;
        if (s < bw) { x = bx + s; y = by; }
        else if (s < bw + bh) { x = bx + bw; y = by + (s - bw); }
        else if (s < 2 * bw + bh) { x = bx + bw - (s - bw - bh); y = by + bh; }
        else { x = bx; y = by + bh - (s - 2 * bw - bh); }
        // round the corners
        const cx = Math.min(Math.max(x, bx + rr), bx + bw - rr), cy = Math.min(Math.max(y, by + rr), by + bh - rr);
        const dx = x - cx, dy2 = y - cy, d = Math.hypot(dx, dy2);
        if (d > rr) { x = cx + dx / d * rr; y = cy + dy2 / d * rr; }
        g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
      // ---- item(s) with slide transition
      g.save();
      g.beginPath(); g.rect(bx + 1.5, by + 1.5, bw - 3, bh - 3); g.clip();
      const p = ease(this.trans);
      if (this.prev != null && this.trans < 1) this.drawItem(g, this.items[this.prev], bx, by, bw, bh, -p * bh);
      this.drawItem(g, this.items[this.idx], bx, by, bw, bh, (1 - p) * bh);
      g.restore();
    });
  }
  curItem() { return this.items[this.idx]; }
  drawItem(g, it, bx, by, bw, bh, yoff) {
    if (!it) return;
    const pad = 3, ih = bh - pad * 2 - 2;
    const icon = it.icon ? this.icons.get(it.icon) : null;
    const text = it.text || '';
    g.font = `700 ${ih * 0.8}px ${LED_FONT}`;
    let tw = g.measureText(text).width;
    const iconW = icon ? ih : 0, gap = icon && text ? 4 : 0;
    let total = iconW + gap + tw;
    const maxW = bw - 8;
    let fs = ih * 0.8;
    if (total > maxW) { fs = Math.max(6, fs * (maxW - iconW - gap) / tw); g.font = `700 ${fs}px ${LED_FONT}`; tw = g.measureText(text).width; total = iconW + gap + tw; }
    let x = bx + (bw - total) / 2;
    const cy = by + bh / 2 + yoff;
    if (icon) {
      const iw = icon.naturalWidth, ihh = icon.naturalHeight, s = ih / Math.max(iw, ihh);
      g.drawImage(icon, x + (ih - iw * s) / 2, cy - ihh * s / 2, iw * s, ihh * s);
      x += iconW + gap;
    }
    g.fillStyle = it.color || '#ffb347'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(text, x, cy + 1);
  }
}

// ------------------------------------------------------------------ BOTTOM BOARD
// queue of messages (greetings / thanks). Gifts jump ahead of joins.
export class BottomBoard {
  constructor(geo) {
    this.led = new LedBoard({ cols: geo.cols, rows: geo.rows, width: 1, height: 1, boost: 3.2 });
    this.cfg = null; this.queue = []; this.cur = null; this.curT = 0; this.icons = new Map(); this.idleScroll = 0;
  }
  configure(cfg) { this.cfg = cfg; }
  push(ev) {
    const c = this.cfg; if (!c) return;
    let text, color, icon = null, prio = 0;
    const d = { name: ev.nickname, gift: ev.giftName, count: ev.repeat, coins: ev.coins };
    if (ev.type === 'gift') { text = fill(c.giftTemplate, d); color = c.giftColor; icon = ev.giftImageLocal || null; prio = 2; }
    else if (ev.type === 'follow') { text = fill(c.followTemplate, d); color = c.giftColor; prio = 1; }
    else if (ev.type === 'join') { if (!c.showJoins) return; text = fill(c.joinTemplate, d); color = c.color; prio = 0; }
    else return;
    if (!text) return;
    const msg = { text, color, icon, prio, t: 0 };
    if (icon && !this.icons.has(icon)) { this.icons.set(icon, null); loadImage(icon).then(im => this.icons.set(icon, im)); }
    if (prio === 0) {
      // keep joins short: drop old greetings when busy
      const joins = this.queue.filter(m => m.prio === 0);
      if (joins.length >= 4) this.queue.splice(this.queue.indexOf(joins[0]), 1);
      this.queue.push(msg);
    } else {
      const i = this.queue.findIndex(m => m.prio < prio);
      if (i < 0) this.queue.push(msg); else this.queue.splice(i, 0, msg);
      if (this.queue.length > 30) this.queue.length = 30;
    }
  }
  update(dt, t) {
    const c = this.cfg; if (!c) return;
    const C = this.led.cols, R = this.led.rows;
    if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); this.curT = 0; this.cur.scroll = 0; }
    this.idleScroll += dt * 18;
    this.led.draw((g) => {
      g.textBaseline = 'middle';
      if (!this.cur) {
        const text = c.idleText || '';
        g.fillStyle = c.color || '#ffb347';
        const { size, width } = fitFont(g, text, LED_FONT, 700, R * 0.78, 1e9);
        if (width <= C - 4) { g.textAlign = 'center'; g.fillText(text, C / 2, R / 2 + 1); g.textAlign = 'left'; }
        else { const per = width + 30, off = this.idleScroll % per; let x = ((C - off) % per + per) % per - per; for (; x < C; x += per) g.fillText(text, x, R / 2 + 1); }
        return;
      }
      const m = this.cur;
      this.curT += dt;
      const icon = m.icon ? this.icons.get(m.icon) : null;
      const ih = R - 4;
      g.font = `700 ${R * 0.78}px ${LED_FONT}`;
      const tw = g.measureText(m.text).width;
      const iw = icon ? ih + 3 : 0;
      const total = iw + tw;
      const minDur = m.prio === 0 ? Math.max(1, c.joinSeconds || 3) : Math.max(2.5, (c.joinSeconds || 3) + 1);
      let x;
      // fade/flash in
      const inP = Math.min(1, this.curT / 0.25);
      if (total <= C - 4) {
        x = (C - total) / 2;
        if (this.curT > minDur) { this.cur = null; return; }
      } else {
        m.scroll += dt * 30;
        x = C - m.scroll;
        if (x + total < 0) { this.cur = null; return; }
      }
      g.globalAlpha = inP;
      if (icon) {
        const s = ih / Math.max(icon.naturalWidth, icon.naturalHeight);
        g.drawImage(icon, x, R / 2 - icon.naturalHeight * s / 2, icon.naturalWidth * s, icon.naturalHeight * s);
      }
      g.fillStyle = m.color || '#ffb347';
      g.fillText(m.text, x + iw, R / 2 + 1);
      g.globalAlpha = 1;
    });
  }
}
