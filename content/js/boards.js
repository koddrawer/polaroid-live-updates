// Content logic for the two LED boards (readability first: big bold condensed text, ink-box centring,
// whole-LED scrolling steps, binary on/off LEDs).
import { LedBoard } from './led.js';
import { loadImage } from './print.js';
import { fill } from './defaults.js';

const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const fam = (f) => `"${f || 'Barlow Condensed'}", "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;

// Fit text so its ink box fills areaH (and areaW unless allowOverflow). Returns metrics in LED units.
function layout(g, text, family, weight, areaW, areaH, allowOverflow) {
  // size from this text's own ink box (accents/descenders only cost room when the text has them)
  const probe = (text || 'H') + 'H';
  let size = areaH;
  g.font = `${weight} ${size}px ${family}`;
  let m = g.measureText(probe);
  size *= areaH / Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  g.font = `${weight} ${size}px ${family}`;
  let width = g.measureText(text).width;
  if (!allowOverflow && width > areaW) { size *= areaW / width; g.font = `${weight} ${size}px ${family}`; width = g.measureText(text).width; }
  m = g.measureText(probe);
  return { size, width, font: g.font, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
}
function drawLine(g, text, L, x, top, areaH) {
  const inkH = L.asc + L.desc;
  const base = top + (areaH - inkH) / 2 + L.asc;
  g.font = L.font; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillText(text, Math.round(x), Math.round(base));
}
function marquee(g, text, L, left, right, top, areaH, offset) {
  // endless loop: scrolls left in whole-LED steps without ever stopping; the next copy follows
  // right behind, so the text runs round continuously. Returns the loop length (LEDs).
  const gap = 28, per = Math.round(L.width + gap);
  const x = left - (Math.floor(offset) % per);
  for (let xx = x; xx < right; xx += per) drawLine(g, text, L, xx, top, areaH);
  return per;
}

// ------------------------------------------------------------------ TOP BOARD
export class TopBoard {
  constructor(geo) {
    this.led = new LedBoard({ cols: geo.cols, rows: geo.rows, width: 1, height: 1 });
    this.cfg = null; this.items = []; this.idx = 0; this.itemT = 0; this.trans = 1; this.prev = null;
    this.scroll1 = 0; this.scroll2 = 0; this.icons = new Map();
  }
  configure(cfg) {
    this.cfg = cfg;
    this.items = (cfg.items || []).filter(i => (i.text || '').trim() || i.icon);
    for (const it of this.items) if (it.icon && !this.icons.has(it.icon)) {
      this.icons.set(it.icon, null);
      loadImage(it.icon).then(im => this.icons.set(it.icon, im));
    }
    if (this.idx >= this.items.length) this.idx = 0;
    if (cfg.ledBrightness) this.led.brightness = 1.9 * cfg.ledBrightness / 100;
  }
  update(dt, t) {
    const cfg = this.cfg; if (!cfg) return;
    const C = this.led.cols, R = this.led.rows;
    const secs = Math.max(1, cfg.itemSeconds || 4);
    const F = fam(cfg.ledFont), W = cfg.ledWeight || 700;
    if (this.items.length > 1) {
      this.itemT += dt;
      // a scrolling line finishes its current loop before the next item comes in (no jump mid-text)
      const loopDone = !this.l2Per || (this.scroll2 >= this.l2Per && Math.floor(this.scroll2) % this.l2Per < 2);
      if (this.itemT > secs && this.trans >= 1 && loopDone) { this.itemT = 0; this.prev = this.idx; this.idx = (this.idx + 1) % this.items.length; this.trans = 0; this.scroll2 = 0; }
    }
    if (this.trans < 1) this.trans = Math.min(1, this.trans + dt / 0.4);
    const speed = cfg.scrollSpeed || 26;
    this.scroll1 += dt * speed;
    // layout: line 1 = 42% of the height, then the line-2 box
    const l1Top = 1, l1H = Math.round(R * 0.42);
    const divY = l1Top + l1H;
    const bx = 1, by = divY + 1, bw = C - 3, bh = R - by - 1;
    this.led.draw((g) => {
      // ---- line 1 (auto-fit; scroll only if it would become too small)
      const text = cfg.line1 || '';
      g.fillStyle = cfg.line1Color || '#ffb347';
      let L = layout(g, text, F, W, C - 6, l1H, false);
      const tooSmall = L.size < 0.72 * layout(g, text, F, W, 1e9, l1H, true).size;
      if (cfg.line1Scroll || tooSmall) {
        L = layout(g, text, F, W, 1e9, l1H, true);
        marquee(g, text, L, 0, C, l1Top, l1H, this.scroll1);
      } else drawLine(g, text, L, (C - L.width) / 2, l1Top, l1H);

      g.fillStyle = cfg.line1Color || '#ffb347';

      // ---- box (dotted, gentle chase)
      const cur = this.items[this.idx];
      const per = 2 * (bw + bh), rr = 3, chase = Math.floor(t * 10);
      g.fillStyle = cur?.color || '#ffb347';
      for (let s = 0; s < per; s += 2) {
        if ((s / 2 + chase) % 8 === 0) continue; // moving gap
        let x, y;
        if (s < bw) { x = bx + s; y = by; }
        else if (s < bw + bh) { x = bx + bw; y = by + (s - bw); }
        else if (s < 2 * bw + bh) { x = bx + bw - (s - bw - bh); y = by + bh; }
        else { x = bx; y = by + bh - (s - 2 * bw - bh); }
        const cx = Math.min(Math.max(x, bx + rr), bx + bw - rr), cy = Math.min(Math.max(y, by + rr), by + bh - rr);
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d > rr) { x = cx + dx / d * rr; y = cy + dy / d * rr; }
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      // ---- item with slide transition
      g.save(); g.beginPath(); g.rect(bx + 2, by + 2, bw - 4, bh - 4); g.clip();
      const p = ease(this.trans);
      if (this.prev != null && this.trans < 1) this.drawItem(g, this.items[this.prev], bx, by, bw, bh, -Math.round(p * bh), F, W, dt, false);
      this.drawItem(g, cur, bx, by, bw, bh, Math.round((1 - p) * bh), F, W, dt, true);
      g.restore();
    });
  }
  drawItem(g, it, bx, by, bw, bh, yoff, F, W, dt, active) {
    if (!it) return;
    const pad = 2, areaH = bh - pad * 2 + 1, top = by + pad + yoff;
    const icon = it.icon ? this.icons.get(it.icon) : null;
    const text = it.text || '';
    const iconW = icon ? areaH + 1 : 0, gap = icon && text ? 2 : 0;
    const maxW = bw - 5 - iconW - gap;
    g.fillStyle = it.color || '#ffb347';
    let L = layout(g, text, F, W, maxW, areaH * 0.92, false);
    let scrolling = L.size < 0.78 * layout(g, text, F, W, 1e9, areaH * 0.92, true).size;
    if (scrolling) L = layout(g, text, F, W, 1e9, areaH * 0.92, true);
    const total = iconW + gap + (scrolling ? maxW : L.width);
    let x = Math.round(bx + (bw - total) / 2);
    if (icon) {
      const iw = icon.naturalWidth, ih = icon.naturalHeight, s = areaH / Math.max(iw, ih);
      g.drawImage(icon, x + (areaH - iw * s) / 2, top + (areaH - ih * s) / 2, iw * s, ih * s);
      x += iconW + gap;
    }
    g.fillStyle = it.color || '#ffb347';
    if (scrolling) {
      if (active) this.scroll2 += dt * (this.cfg.scrollSpeed || 26);
      g.save(); g.beginPath(); g.rect(x, by, maxW, bh); g.clip();
      const per = marquee(g, text, L, x, x + maxW, top + areaH * 0.04, areaH * 0.92, this.scroll2);
      if (active) this.l2Per = per;
      g.restore();
    } else { drawLine(g, text, L, x, top + areaH * 0.04, areaH * 0.92); if (active) this.l2Per = 0; }
  }
}

// ------------------------------------------------------------------ BOTTOM BOARD
export class BottomBoard {
  constructor(geo) {
    this.led = new LedBoard({ cols: geo.cols, rows: geo.rows, width: 1, height: 1 });
    this.cfg = null; this.queue = []; this.cur = null; this.curT = 0; this.icons = new Map(); this.idleScroll = 0;
  }
  configure(cfg, top) {
    this.cfg = cfg; this.font = top?.ledFont; this.weight = top?.ledWeight; this.speed = top?.scrollSpeed || 26;
    if (top?.ledBrightness) this.led.brightness = 1.9 * top.ledBrightness / 100;
  }
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
      const joins = this.queue.filter(m => m.prio === 0);
      if (joins.length >= 4) this.queue.splice(this.queue.indexOf(joins[0]), 1);
      this.queue.push(msg);
    } else {
      const i = this.queue.findIndex(m => m.prio < prio);
      if (i < 0) this.queue.push(msg); else this.queue.splice(i, 0, msg);
      if (this.queue.length > 30) this.queue.length = 30;
    }
  }
  update(dt) {
    const c = this.cfg; if (!c) return;
    const C = this.led.cols, R = this.led.rows;
    const F = fam(this.font), W = this.weight || 700;
    if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); this.curT = 0; this.cur.scroll = 0; }
    this.idleScroll += dt * this.speed;
    const top = 1, areaH = R - 2;
    this.led.draw((g) => {
      if (!this.cur) {
        const text = c.idleText || '';
        g.fillStyle = c.color || '#ffb347';
        let L = layout(g, text, F, W, C - 4, areaH, false);
        if (L.size < areaH * 0.8) { L = layout(g, text, F, W, 1e9, areaH, true); marquee(g, text, L, 0, C, top, areaH, this.idleScroll); }
        else drawLine(g, text, L, (C - L.width) / 2, top, areaH);
        return;
      }
      const m = this.cur;
      this.curT += dt;
      const icon = m.icon ? this.icons.get(m.icon) : null;
      const iw = icon ? areaH + 2 : 0;
      g.fillStyle = m.color || '#ffb347';
      let L = layout(g, m.text, F, W, C - 4 - iw, areaH, false);
      const minDur = m.prio === 0 ? Math.max(1, c.joinSeconds || 3) : Math.max(2.5, (c.joinSeconds || 3) + 1);
      let x;
      if (L.size >= areaH * 0.8) {
        x = (C - (iw + L.width)) / 2;
        if (this.curT > minDur) { this.cur = null; return; }
      } else {
        L = layout(g, m.text, F, W, 1e9, areaH, true);
        m.scroll += dt * this.speed;
        x = C - Math.floor(m.scroll);
        if (x + iw + L.width < 0) { this.cur = null; return; }
      }
      if (icon) {
        const s = areaH / Math.max(icon.naturalWidth, icon.naturalHeight);
        g.drawImage(icon, Math.round(x), top + (areaH - icon.naturalHeight * s) / 2, icon.naturalWidth * s, icon.naturalHeight * s);
      }
      g.fillStyle = m.color || '#ffb347';
      drawLine(g, m.text, L, x + iw, top, areaH);
    });
  }
}
