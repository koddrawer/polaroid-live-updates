// Cut a seal/stamp picture out of its plain (usually white) background.
// Flood-fills the background from the image border, feathers the edge (and removes the white
// fringe from edge pixels), then crops to the seal. Returns a PNG data URL, or null on failure.
export async function cutoutSeal(url, maxSize = 320) {
  const im = await new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  if (!im || !im.naturalWidth) return null;
  const k = Math.min(1, 640 / Math.max(im.naturalWidth, im.naturalHeight));
  const W = Math.max(1, Math.round(im.naturalWidth * k)), H = Math.max(1, Math.round(im.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data, N = W * H;

  // border pixels → is it already transparent? otherwise estimate the background colour
  const border = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
  const transparent = border.filter(i => d[i * 4 + 3] < 30).length > border.length * 0.5;
  let removed = 0;
  if (!transparent) {
    const ch = [0, 1, 2].map(c => border.map(i => d[i * 4 + c]).sort((a, b) => a - b)[border.length >> 1]);
    const dist = (i) => { const p = i * 4; return Math.max(Math.abs(d[p] - ch[0]), Math.abs(d[p + 1] - ch[1]), Math.abs(d[p + 2] - ch[2])); };
    const T1 = 38, T2 = 110;          // ≤T1: background; T1..T2: soft edge
    const bg = new Uint8Array(N);     // 1 = background
    const stack = [];
    for (const i of border) if (!bg[i] && dist(i) <= T1) { bg[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && !bg[j] && dist(j) <= T1) { bg[j] = 1; stack.push(j); }
    }
    // soft drop shadow around the seal: grey pixels connected to the background become a real
    // transparent shadow (black with alpha) instead of a light-grey halo
    const bgL = (ch[0] + ch[1] + ch[2]) / 3;
    const shade = new Float32Array(N); // 0 = none, else alpha of the shadow
    const isShadow = (j) => { const q = j * 4, mx = Math.max(d[q], d[q + 1], d[q + 2]), mn = Math.min(d[q], d[q + 1], d[q + 2]); const L = (d[q] + d[q + 1] + d[q + 2]) / 3; return mx - mn < 22 && L < bgL - 4 && L > bgL * 0.5; };
    let front = [];
    for (let i = 0; i < N; i++) if (bg[i]) {
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
        if (j >= 0 && !bg[j] && !shade[j] && isShadow(j)) { shade[j] = 1; front.push(j); }
    }
    for (let depth = 0; depth < Math.round(Math.max(W, H) * 0.08) && front.length; depth++) {
      const next = [];
      for (const i of front) {
        const x = i % W, y = (i / W) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
          if (j >= 0 && !bg[j] && !shade[j] && isShadow(j)) { shade[j] = 1; next.push(j); }
      }
      front = next;
    }
    for (let i = 0; i < N; i++) if (shade[i]) {
      const q = i * 4, L = (d[q] + d[q + 1] + d[q + 2]) / 3;
      d[q] = d[q + 1] = d[q + 2] = 0; d[q + 3] = Math.round(255 * Math.min(1, Math.max(0, 1 - L / bgL)));
      bg[i] = 2;
    }
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      if (bg[i] === 2) continue;
      if (bg[i]) { d[p + 3] = 0; removed++; continue; }
      // soft edge: pixels touching the background and still close to its colour
      const x = i % W, y = (i / W) | 0;
      const touches = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W])
        || (x > 1 && bg[i - 2]) || (x < W - 2 && bg[i + 2]) || (y > 1 && bg[i - 2 * W]) || (y < H - 2 && bg[i + 2 * W]);
      if (!touches) continue;
      const dd = dist(i);
      if (dd >= T2) continue;
      const a = Math.max(0.05, (dd - T1) / (T2 - T1));
      for (let c = 0; c < 3; c++) d[p + c] = Math.max(0, Math.min(255, Math.round((d[p + c] - ch[c] * (1 - a)) / a)));
      d[p + 3] = Math.round(d[p + 3] * a);
    }
    if (removed < N * 0.02) return null;   // nothing that looks like a plain background
  }
  // crop to the visible seal (+ small margin) and scale down
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return null;
  g.putImageData(img, 0, 0);
  const m = 2; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1, s = Math.min(1, maxSize / Math.max(cw, chh));
  const out = document.createElement('canvas'); out.width = Math.round(cw * s); out.height = Math.round(chh * s);
  const og = out.getContext('2d'); og.imageSmoothingQuality = 'high';
  og.drawImage(cv, x0, y0, cw, chh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
