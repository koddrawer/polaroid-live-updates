// Polaroid print: canvas texture (paper + avatar + caption) on a thin card with a "developing" shader.
import * as THREE from 'three';

export const PRINT_W = 512, PRINT_H = 624, MARGIN = 30, IMG = PRINT_W - MARGIN * 2;
export const PRINT_ASPECT = PRINT_W / PRINT_H;

const imageCache = new Map();
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => res(im); im.onerror = () => res(null); im.src = url;
  });
  imageCache.set(url, p);
  return p;
}

function hashHue(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h % 360; }
function placeholder(name) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const hue = hashHue(name || '?');
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, `hsl(${hue},55%,62%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360},60%,38%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 130px Oswald, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText([...(name || '?').trim()][0]?.toUpperCase() || '?', 128, 138);
  return c;
}

let paperNoise = null;
function noiseCanvas() {
  if (paperNoise) return paperNoise;
  const c = document.createElement('canvas'); c.width = PRINT_W; c.height = PRINT_H;
  const g = c.getContext('2d'); const d = g.createImageData(PRINT_W, PRINT_H);
  for (let i = 0; i < d.data.length; i += 4) { const v = 236 + Math.random() * 14; d.data[i] = v; d.data[i + 1] = v - 3; d.data[i + 2] = v - 10; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); paperNoise = c; return c;
}

// returns a canvas of the finished print
export async function drawPrint({ name, avatarUrl, caption, font, color, sizePct, paperUrl, seal }) {
  const c = document.createElement('canvas'); c.width = PRINT_W; c.height = PRINT_H;
  const g = c.getContext('2d');
  g.drawImage(noiseCanvas(), 0, 0);
  const paper = paperUrl ? await loadImage(paperUrl) : null;
  if (paper) { // cover-fit the chosen background
    const pw = paper.naturalWidth, ph = paper.naturalHeight, k = Math.max(PRINT_W / pw, PRINT_H / ph);
    g.drawImage(paper, (PRINT_W - pw * k) / 2, (PRINT_H - ph * k) / 2, pw * k, ph * k);
  }
  // photo area
  const img = await loadImage(avatarUrl);
  const src = img || placeholder(name);
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const s = Math.min(sw, sh);
  g.save();
  g.beginPath(); g.rect(MARGIN, MARGIN, IMG, IMG); g.clip();
  g.filter = 'sepia(0.18) saturate(1.12) contrast(1.06) brightness(1.03)';
  g.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, MARGIN, MARGIN, IMG, IMG);
  g.filter = 'none';
  // instant-film vignette + warm cast
  const vg = g.createRadialGradient(PRINT_W / 2, MARGIN + IMG / 2, IMG * 0.25, PRINT_W / 2, MARGIN + IMG / 2, IMG * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,0,0.35)');
  g.fillStyle = vg; g.fillRect(MARGIN, MARGIN, IMG, IMG);
  g.fillStyle = 'rgba(255,190,120,0.06)'; g.fillRect(MARGIN, MARGIN, IMG, IMG);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5; g.strokeRect(MARGIN, MARGIN, IMG, IMG);
  // caption
  const text = caption || name || '';
  const areaTop = MARGIN + IMG, areaH = PRINT_H - areaTop;
  let size = Math.round(areaH * 0.55 * (sizePct || 100) / 100);
  g.fillStyle = color || '#2a2420'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fam = `"${font || 'Patrick Hand'}", "Patrick Hand", cursive`;
  g.font = `${size}px ${fam}`;
  const maxW = PRINT_W - MARGIN * 2.2;
  const w = g.measureText(text).width;
  if (w > maxW) { size = Math.max(14, Math.floor(size * maxW / w)); g.font = `${size}px ${fam}`; }
  g.save(); g.translate(PRINT_W / 2, areaTop + areaH * 0.52); g.rotate(-0.012);
  g.fillText(text, 0, 0); g.restore();
  if (seal) await drawSeal(g, seal);
  return c;
}

// wax seal pressed onto the top-left corner (size = % of print width, angle in radians)
export function sealCenter(seal) {
  const d = PRINT_W * (seal.size || 34) / 100;
  return { x: MARGIN * 0.6 + d * 0.42, y: MARGIN * 0.6 + d * 0.42, d };
}
export async function drawSeal(g, seal) {
  const im = await loadImage(seal.url);
  if (!im) return;
  const { x, y, d } = sealCenter(seal);
  g.save();
  g.translate(x, y); g.rotate(seal.angle || 0);
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = d * 0.06; g.shadowOffsetX = d * 0.02; g.shadowOffsetY = d * 0.035;
  g.drawImage(im, -d / 2, -d / 2, d, d);
  g.restore();
}

const PRINT_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const PRINT_FS = `
uniform sampler2D map; uniform float develop; uniform float light; uniform float opacity; uniform vec4 imgRect; uniform float flash;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec4 tex = texture2D(map, vUv);
  vec3 c = tex.rgb;
  // developing: picture area starts dark grey-green and fades to the image
  vec2 p = vUv; bool inImg = p.x > imgRect.x && p.x < imgRect.z && p.y > imgRect.y && p.y < imgRect.w;
  if (inImg) {
    float d = clamp(develop, 0.0, 1.0);
    vec3 dark = vec3(0.07, 0.075, 0.07);
    vec3 mid = mix(dark, c * vec3(0.55, 0.62, 0.75), smoothstep(0.0, 0.55, d));
    c = mix(mid, c, smoothstep(0.45, 1.0, d));
  }
  float spec = pow(max(dot(reflect(-vV, normalize(vN)), vec3(0.0, 0.6, 0.8)), 0.0), 40.0) * 0.12;
  vec3 col = c * light + spec + flash * 0.4;
  gl_FragColor = vec4(col, opacity);
}`;

export class Print {
  constructor(canvas, widthWorld) {
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    const imgRect = new THREE.Vector4(MARGIN / PRINT_W, 1 - (MARGIN + IMG) / PRINT_H, 1 - MARGIN / PRINT_W, 1 - MARGIN / PRINT_H);
    this.front = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, develop: { value: 0 }, light: { value: 1 }, opacity: { value: 1 }, imgRect: { value: imgRect }, flash: { value: 0 } },
      vertexShader: PRINT_VS, fragmentShader: PRINT_FS, transparent: true
    });
    const back = new THREE.MeshBasicMaterial({ color: 0x2b2b2b, transparent: true });
    const edge = new THREE.MeshBasicMaterial({ color: 0xd8d2c4, transparent: true });
    const w = widthWorld, h = w / PRINT_ASPECT;
    const geo = new THREE.BoxGeometry(w, h, w * 0.012);
    // BoxGeometry groups: +x,-x,+y,-y,+z(front),-z(back)
    this.mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, this.front, back]);
    this.mesh.userData.print = this;
    this.width = w; this.height = h;
    this.mats = [edge, back];
  }
  setCanvas(cv) { this.tex.image = cv; this.tex.needsUpdate = true; }
  set develop(v) { this.front.uniforms.develop.value = v; }
  get develop() { return this.front.uniforms.develop.value; }
  set light(v) { this.front.uniforms.light.value = v; }
  set opacity(v) { this.front.uniforms.opacity.value = v; for (const m of this.mats) m.opacity = v; }
  dispose() { this.tex.dispose(); this.mesh.geometry.dispose(); this.front.dispose(); this.mats.forEach(m => m.dispose()); }
}
