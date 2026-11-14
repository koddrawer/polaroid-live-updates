// LED matrix rendered by a single shader quad sampling a tiny canvas (1 texel = 1 LED).
// Text is drawn supersampled, then thresholded to pure on/off LEDs so it stays crisp and readable.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D map;
uniform vec2 grid;
uniform float boost;
uniform vec3 offColor;
uniform float dotSize;
uniform sampler2D mask;
uniform float useMask;
varying vec2 vUv;
void main(){
  if (useMask > 0.5 && texture2D(mask, vUv).r < 0.5) discard;   // shaped boards (heart)
  vec2 g = vUv * grid;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float d = length(f);
  float aa = max(fwidth(d), 0.015);
  float dotm = 1.0 - smoothstep(dotSize - aa, dotSize + aa, d);
  vec4 tex = texture2D(map, (cell + 0.5) / grid);
  float lit = step(0.5, tex.a);
  vec3 col = tex.rgb * tex.rgb;              // sRGB-ish → linear
  float core = 1.0 - smoothstep(0.0, dotSize, d);
  vec3 on = col * boost * (0.8 + 0.45 * core);
  vec3 off = offColor * (0.5 + 0.5 * core);
  vec3 c = mix(off, on, lit) * dotm;
  c += col * lit * boost * 0.10 * (1.0 - dotm);   // small halo filling the gap → solid strokes
  gl_FragColor = vec4(c + vec3(0.006, 0.004, 0.003) * (1.0 - dotm), 1.0);
}`;

export class LedBoard {
  constructor({ cols, rows, width, height, boost = 1.9, offColor = 0x120904 }) {
    this.cols = cols; this.rows = rows;
    this.SS = 4; // supersampling before thresholding
    this.big = document.createElement('canvas'); this.big.width = cols * this.SS; this.big.height = rows * this.SS;
    this.bg = this.big.getContext('2d');
    this.small = document.createElement('canvas'); this.small.width = cols; this.small.height = rows;
    this.sg = this.small.getContext('2d', { willReadFrequently: true });
    this.sg.imageSmoothingEnabled = true; this.sg.imageSmoothingQuality = 'high';
    this.tex = new THREE.CanvasTexture(this.small);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace; this.tex.premultiplyAlpha = false;
    this.threshold = 0.5;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, grid: { value: new THREE.Vector2(cols, rows) }, boost: { value: boost },
        offColor: { value: new THREE.Color(offColor) }, dotSize: { value: 0.41 }, mask: { value: null }, useMask: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, toneMapped: false
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
  }
  set brightness(v) { this.material.uniforms.boost.value = v; }
  // shape the board: mask rows of '0'/'1' (top row first); LEDs outside are not drawn at all
  setMask(rows) {
    const h = rows.length, w = rows[0].length, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = rows[y][x] === '1' ? 255 : 0, i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true;
    this.material.uniforms.mask.value = t; this.material.uniforms.useMask.value = 1;
    this.maskCanvas = c;
  }
  // is LED (col,row) inside the mask?
  inside(col, row) {
    const c = this.maskCanvas; if (!c) return true;
    if (!this._md) this._md = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const x = Math.min(c.width - 1, Math.floor((col + 0.5) / this.cols * c.width)), y = Math.min(c.height - 1, Math.floor((row + 0.5) / this.rows * c.height));
    return this._md[(y * c.width + x) * 4] > 127;
  }
  // draw(fn) gives a 2D context in "LED units" (1 unit = 1 LED)
  draw(fn) {
    const g = this.bg, S = this.SS;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.big.width, this.big.height);
    g.setTransform(S, 0, 0, S, 0, 0);
    fn(g, this.cols, this.rows);
    const sg = this.sg;
    sg.clearRect(0, 0, this.cols, this.rows);
    sg.drawImage(this.big, 0, 0, this.cols, this.rows);
    // binarize: every LED is either fully on (at its colour) or off
    const img = sg.getImageData(0, 0, this.cols, this.rows), d = img.data, th = this.threshold * 255;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m * a >= th) {
        const k = 255 / Math.max(1, m);
        d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k); d[i + 3] = 255;
      } else { d[i + 3] = 0; }
    }
    sg.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
  }
}

// Largest font size (in LED rows) so the text fits maxW; returns size + width.
export function fitFont(g, text, family, weight, maxH, maxW) {
  let size = maxH;
  g.font = `${weight} ${size}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxW) size = Math.max(6, size * maxW / w);
  g.font = `${weight} ${size}px ${family}`;
  return { size, width: g.measureText(text).width };
}
