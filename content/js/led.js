// LED matrix rendered by a single shader quad sampling a tiny canvas (1 texel = 1 LED).
// Cheap on old GPUs: one draw call per board, canvas updates only when content changes.
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
varying vec2 vUv;
void main(){
  vec2 g = vUv * grid;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float d = length(f);
  float aa = max(fwidth(d), 0.02);
  float dotm = 1.0 - smoothstep(dotSize - aa, dotSize + aa, d);
  vec4 tex = texture2D(map, (cell + 0.5) / grid);
  float lum = max(tex.r, max(tex.g, tex.b)) * tex.a;
  float lit = smoothstep(0.30, 0.55, lum);
  vec3 col = tex.rgb / max(lum, 0.001);
  col = col * col; // srgb-ish → linear
  // hot centre for each LED + soft halo inside cell
  float core = 1.0 - smoothstep(0.0, dotSize, d);
  vec3 on = col * boost * (0.65 + 0.7 * core);
  vec3 off = offColor * (0.55 + 0.45 * core);
  vec3 c = mix(off, on, lit) * dotm;
  // faint glow between dots of lit LEDs
  c += col * lit * boost * 0.06 * (1.0 - dotm);
  vec3 gap = vec3(0.012, 0.009, 0.006);
  gl_FragColor = vec4(c + gap * (1.0 - dotm), 1.0);
}`;

export class LedBoard {
  constructor({ cols, rows, width, height, boost = 3.2, offColor = 0x1a0d05 }) {
    this.cols = cols; this.rows = rows;
    this.SS = 3; // supersampling for nicer glyphs
    this.big = document.createElement('canvas'); this.big.width = cols * this.SS; this.big.height = rows * this.SS;
    this.bg = this.big.getContext('2d', { willReadFrequently: false });
    this.small = document.createElement('canvas'); this.small.width = cols; this.small.height = rows;
    this.sg = this.small.getContext('2d');
    this.sg.imageSmoothingEnabled = true; this.sg.imageSmoothingQuality = 'high';
    this.tex = new THREE.CanvasTexture(this.small);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, grid: { value: new THREE.Vector2(cols, rows) }, boost: { value: boost },
        offColor: { value: new THREE.Color(offColor) }, dotSize: { value: 0.36 } },
      vertexShader: VERT, fragmentShader: FRAG, toneMapped: false
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
  }
  set brightness(v) { this.material.uniforms.boost.value = v; }
  // draw(fn) gives a 2D context in "LED units" (1 unit = 1 LED); call commit() after
  draw(fn) {
    const g = this.bg, S = this.SS;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.big.width, this.big.height);
    g.setTransform(S, 0, 0, S, 0, 0);
    fn(g, this.cols, this.rows);
    this.sg.clearRect(0, 0, this.cols, this.rows);
    this.sg.drawImage(this.big, 0, 0, this.cols, this.rows);
    this.tex.needsUpdate = true;
  }
}

// ---------- helpers for drawing LED content ----------
export function fitFont(g, text, family, weight, maxH, maxW) {
  let size = maxH;
  g.font = `${weight} ${size}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxW) size = Math.max(6, size * maxW / w);
  g.font = `${weight} ${size}px ${family}`;
  return { size, width: g.measureText(text).width };
}

// Marquee/static text state machine
export class TextLine {
  constructor() { this.text = ''; this.offset = 0; this.width = 0; }
  set(text) { if (text !== this.text) { this.text = text; this.offset = 0; } }
}
