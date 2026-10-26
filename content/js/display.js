// Polaroid Live — display window
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Pipeline } from './pipeline.js';
import { TopBoard, BottomBoard } from './boards.js';
import { Print, drawPrint, PRINT_ASPECT } from './print.js';
import { DEFAULTS, BUNDLED_FONTS, merge, fill } from './defaults.js';

const api = window.api || {};
const $ = (id) => document.getElementById(id);
const bootEl = $('boot');
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (t) => (t = clamp01(t), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let S = merge(DEFAULTS, {});
let meta = null;

// ---------------------------------------------------------------- renderer
const canvas = $('c');
globalThis.__noMSAA = /SwiftShader/i.test((() => { try { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch { return ''; } })());
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // pipeline does the sRGB encode
renderer.toneMapping = THREE.NoToneMapping;
const pipe = new Pipeline(renderer);
const bgScene = new THREE.Scene();
const heroScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(25, 9 / 16, 0.1, 200);
let viewport = { x: 0, y: 0, w: 2, h: 2, cw: 2, ch: 2 };

function resize() {
  const q = S.display.quality;
  const dpr = window.devicePixelRatio || 1;
  const pr = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  // letterbox to 9:16
  let cw = W, ch = Math.round(W * 16 / 9);
  if (ch > H) { ch = H; cw = Math.round(H * 9 / 16); }
  const x = Math.floor((W - cw) / 2), y = Math.floor((H - ch) / 2);
  viewport = { x, y, cw, ch, w: Math.max(2, Math.round(cw * pr)), h: Math.max(2, Math.round(ch * pr)) };
  renderer.setRenderTarget(null); renderer.setViewport(0, 0, W, H); renderer.setClearColor(0, 1); renderer.clear();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- audio
const audio = { ctx: null, buffers: {}, gain: null };
async function initAudio() {
  try {
    audio.ctx = new AudioContext();
    audio.gain = audio.ctx.createGain(); audio.gain.connect(audio.ctx.destination);
    for (const n of ['shutter', 'flash_charge', 'chime']) {
      const r = await fetch(`sounds/${n}.wav`); audio.buffers[n] = await audio.ctx.decodeAudioData(await r.arrayBuffer());
    }
  } catch (e) { console.warn('audio', e); }
}
function play(name, vol = 1) {
  if (!audio.ctx || !audio.buffers[name]) return;
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  const s = audio.ctx.createBufferSource(); s.buffer = audio.buffers[name];
  const g = audio.ctx.createGain(); g.gain.value = vol * (S.photo.volume ?? 80) / 100;
  s.connect(g); g.connect(audio.gain); s.start();
}

// ---------------------------------------------------------------- fonts
const loadedFonts = new Set();
async function ensureFont(family, url) {
  if (!family || loadedFonts.has(family)) return;
  try {
    if (url) { const f = new FontFace(family, `url("${url}")`); await f.load(); document.fonts.add(f); }
    else await document.fonts.load(`40px "${family}"`);
    loadedFonts.add(family);
  } catch (e) { console.warn('font', family, e); }
}

// ---------------------------------------------------------------- scene building
const texLoader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res, rej) => texLoader.load(url, (t) => res(t), undefined, rej));
const SPRITE_VS = `
uniform vec2 img; uniform vec2 pivot; uniform float radius; varying vec2 vPx;
void main(){ vec2 px = pivot + vec2(position.x, -position.y) * radius; vPx = px;
  gl_Position = vec4(px.x / img.x * 2.0 - 1.0, 1.0 - px.y / img.y * 2.0, 0.0, 1.0); }`;
const SPRITE_FS = `
uniform sampler2D map; uniform vec2 pivot; uniform vec4 bbox; uniform float angle; uniform float opacity; varying vec2 vPx;
void main(){
  vec2 d = vPx - pivot; float c = cos(-angle), s = sin(-angle);
  vec2 p = vec2(c * d.x - s * d.y, s * d.x + c * d.y) + pivot;
  vec2 uv = (p - bbox.xy) / (bbox.zw - bbox.xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  vec4 t = texture2D(map, uv);
  if (t.a < 0.004) discard;
  gl_FragColor = vec4(t.rgb, t.a * opacity);
}`;
const GLOW_FS = `
uniform vec2 pivot; uniform float radius; uniform float strength; uniform vec3 color; varying vec2 vPx;
void main(){ float d = length(vPx - pivot) / radius; float a = exp(-d * d * 3.5) * strength; gl_FragColor = vec4(color * a, 1.0); }`;
const PLATE_FS = `uniform sampler2D map; uniform float light; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb * light, 1.0); }`;

const sprites = [], glows = [], leds = {};
let plateMat = null;
let flashSprite = null;
let heroPivot = null, heroRest = null, heroLights = [], flashLight = null, heroEnvIntensity = 0.35;
const gallery = { group: new THREE.Group(), items: [] };

async function buildScene() {
  meta = await (await fetch('scene/scene.json')).json();
  const [IW, IH] = meta.image;
  // camera from Blender
  const m = new THREE.Matrix4().fromArray(meta.camera.matrix);
  // older exports stored C·m·C⁻¹ for the camera; a camera needs C·m
  if (meta.camera.convention !== 'three-camera') m.multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  m.decompose(camera.position, camera.quaternion, new THREE.Vector3());
  camera.fov = meta.camera.fov; camera.aspect = 9 / 16; camera.near = 0.1; camera.far = 200; camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  console.log('scene.json ok');
  // plate
  const plate = await loadTex('scene/plate.jpg');
  plate.colorSpace = THREE.SRGBColorSpace; plate.generateMipmaps = true; plate.minFilter = THREE.LinearMipmapLinearFilter; plate.anisotropy = 4;
  plateMat = new THREE.ShaderMaterial({ uniforms: { map: { value: plate }, light: { value: 1 } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: PLATE_FS, depthTest: false, depthWrite: false });
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plateMat); plateMesh.frustumCulled = false; plateMesh.renderOrder = -100;
  bgScene.add(plateMesh);

  // LED boards on their real 3D panels
  for (const key of ['top', 'bottom']) {
    const L = meta.leds[key]; if (!L) continue;
    const board = key === 'top' ? new TopBoard(L) : new BottomBoard(L);
    const g = new THREE.BufferGeometry();
    const c = L.corners;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...c[0], ...c[1], ...c[2], ...c[3]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 3, 1, 1, 3, 2]);
    board.led.mesh.geometry.dispose(); board.led.mesh.geometry = g;
    board.led.material.depthTest = false; board.led.material.depthWrite = false; board.led.material.side = THREE.DoubleSide;
    board.led.mesh.renderOrder = -50; board.led.mesh.frustumCulled = false;
    bgScene.add(board.led.mesh);
    leds[key] = board;
  }

  // gear + clock-hand sprites (screen space, rotate around their pivots)
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  for (const sp of meta.sprites) {
    let tex;
    try { tex = await loadTex('scene/' + sp.file); } catch { continue; }
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.flipY = false;
    const [x0, y0, x1, y1] = sp.bbox;
    const radius = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.hypot(x - sp.pivot[0], y - sp.pivot[1]))) + 2;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, img: { value: new THREE.Vector2(IW, IH) }, pivot: { value: new THREE.Vector2(...sp.pivot) }, radius: { value: radius },
        bbox: { value: new THREE.Vector4(x0, y0, x1, y1) }, angle: { value: 0 }, opacity: { value: 1 } },
      vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, transparent: true, depthTest: false, depthWrite: false
    });
    const mesh = new THREE.Mesh(quadGeo, mat); mesh.frustumCulled = false; mesh.renderOrder = sp.kind === 'gear' ? -40 : -30;
    bgScene.add(mesh);
    sprites.push({ ...sp, mat, angle: 0 });
  }
  // bulb glows (additive flicker)
  for (const gl of meta.glows) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { img: { value: new THREE.Vector2(IW, IH) }, pivot: { value: new THREE.Vector2(...gl.p) }, radius: { value: gl.r * 3.2 }, strength: { value: 0.1 }, color: { value: new THREE.Color(1.0, 0.55, 0.2) } },
      vertexShader: SPRITE_VS, fragmentShader: GLOW_FS, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false
    });
    const mesh = new THREE.Mesh(quadGeo, mat); mesh.frustumCulled = false; mesh.renderOrder = -20;
    bgScene.add(mesh); glows.push({ mat, seed: Math.random() * 100 });
  }
  bgScene.add(gallery.group);

  // hero lighting
  const pmrem = new THREE.PMREMGenerator(renderer);
  heroScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  heroScene.environmentIntensity = heroEnvIntensity;
  for (const L of meta.lights) {
    const col = new THREE.Color(...L.color);
    const I = L.energy / (4 * Math.PI) * 0.9;
    let light;
    if (L.type === 'SPOT') { light = new THREE.SpotLight(col, I, 0, (L.spot || 1) / 2, 0.35, 2); light.target.position.set(...L.position.map((v, i) => v + L.dir[i])); heroScene.add(light.target); }
    else light = new THREE.PointLight(col, I, 0, 2);
    light.position.set(...L.position); heroScene.add(light); heroLights.push(light);
  }
  const key = new THREE.DirectionalLight(0xffe2c0, 0.9); key.position.set(-2, 9, 14); heroScene.add(key);
  flashLight = new THREE.PointLight(0xffffff, 0, 0, 2); heroScene.add(flashLight);

  console.log('sprites ok', sprites.length);
  // hero model
  const gltf = await new GLTFLoader().loadAsync('scene/' + meta.hero.file);
  const hm = new THREE.Matrix4().fromArray(meta.hero.matrix);
  const heroPos = new THREE.Vector3(), heroQuat = new THREE.Quaternion(); hm.decompose(heroPos, heroQuat, new THREE.Vector3());
  heroPivot = new THREE.Group();
  const model = gltf.scene;
  // the glTF nodes carry world transforms; re-centre them on the hero origin
  model.position.sub(heroPos);
  heroPivot.add(model);
  heroPivot.position.copy(heroPos);
  heroPivot.quaternion.copy(heroQuat);
  model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.envMapIntensity = 1; } } });
  heroScene.add(heroPivot);
  heroRest = { pos: heroPos.clone(), quat: heroQuat.clone() };
  // flash window glow (front, top-right of the camera)
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gg = gc.getContext('2d'); const rg = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,245,225,0.8)'); rg.addColorStop(1, 'rgba(255,230,200,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128);
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: new THREE.Color(4, 4, 4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flashSprite.position.set(...(meta.hero.flash || [0.104, 0.64, 0.14]));
  flashSprite.scale.setScalar(0.9);
  heroPivot.add(flashSprite);
}

// ---------------------------------------------------------------- gallery (photos on wall / table)
let galleryState = { items: [] };
function slotPose(kind, index) {
  if (kind === 'big' || kind === 'small') {
    const s = kind === 'big' ? meta.frames.big[0] : meta.frames.small[index % meta.frames.small.length];
    const c = s.corners.map(v => new THREE.Vector3(...v));
    const center = c.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(0.25);
    const h = c[0].distanceTo(c[3]);
    center.z += 0.006;
    const scale = (h * 0.95) / (0.38 / PRINT_ASPECT);
    return { pos: center, quat: new THREE.Quaternion(), scale };
  }
  // table: random point inside the sampled table zone
  let hits = (meta.table?.hits || []).filter(h => !/^(Plane|Pipe|Cylinder)/.test(h.obj));
  if (hits.length < 3) hits = [{ p: [-0.9, 2.49, -0.6] }, { p: [0.9, 2.49, 0.9] }, { p: [0, 2.49, 0] }];
  // keep the zone in front of the props and inside the camera view
  const xs = hits.map(h => h.p[0]), zs = hits.map(h => h.p[2]), ys = hits.map(h => h.p[1]);
  const pick = index || {};
  const x = pick.x ?? lerp(Math.min(...xs) * 0.75, Math.max(...xs) * 0.75, Math.random());
  const z = pick.z ?? lerp(Math.min(...zs), Math.max(...zs), 0.6 + Math.random() * 0.35);
  const yaw = pick.yaw ?? (Math.random() - 0.5) * 0.9;
  const y = (ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 2.5) + 0.004;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.22, 0, yaw, 'XYZ'));
  return { pos: new THREE.Vector3(x, y, z), quat: q, scale: 1.25, pick: { x, z, yaw } };
}

async function makePrint(entry) {
  const p = S.photo;
  const font = entry.font || p.font;
  await ensureFont(font, entry.fontUrl || p.fontUrl);
  const cv = await drawPrint({ name: entry.name, avatarUrl: entry.avatar, caption: fill(p.captionTemplate || '{name}', { name: entry.name }), font, color: p.captionColor, sizePct: p.captionSize });
  return new Print(cv, 0.38);
}

let tableLayer = 0;
function placeInGallery(print, entry, pose) {
  print.mesh.position.copy(pose.pos); print.mesh.quaternion.copy(pose.quat); print.mesh.scale.setScalar(pose.scale);
  if (entry.kind === 'table') { print.mesh.position.y += (tableLayer++ % 40) * 0.0012; }
  print.develop = 1; print.light = 0.92;
  gallery.group.add(print.mesh);
  gallery.items.push({ entry, print });
}
function removeGalleryItem(it, fade = true) {
  const i = gallery.items.indexOf(it); if (i >= 0) gallery.items.splice(i, 1);
  if (!fade) { gallery.group.remove(it.print.mesh); it.print.dispose(); return; }
  const t0 = performance.now();
  const tick = () => { const k = (performance.now() - t0) / 600; it.print.opacity = 1 - k; if (k < 1) requestAnimationFrame(tick); else { gallery.group.remove(it.print.mesh); it.print.dispose(); } };
  tick();
}
function saveGallery() { api.saveState?.('gallery', { items: gallery.items.map(i => i.entry) }); }
async function restoreGallery() {
  const st = await api.loadState?.('gallery');
  if (!st?.items) return;
  for (const e of st.items) {
    try { const pr = await makePrint(e); const pose = e.kind === 'table' ? slotPose('table', e.pick) : slotPose(e.kind, e.slot); placeInGallery(pr, e, pose); } catch (err) { console.warn(err); }
  }
}
function nextSmallSlot() {
  const n = meta.frames.small.length;
  const used = new Set(gallery.items.filter(i => i.entry.kind === 'small').map(i => i.entry.slot));
  for (let k = 0; k < n; k++) if (!used.has(k)) return { slot: k, replace: null };
  // all full → replace the oldest
  const oldest = gallery.items.filter(i => i.entry.kind === 'small').sort((a, b) => a.entry.t - b.entry.t)[0];
  return { slot: oldest.entry.slot, replace: oldest };
}

// ---------------------------------------------------------------- photo show (queue + timeline)
const queue = [];
let busy = false;
function tierOf(coins) {
  const t = S.photo.tiers;
  if (coins >= (t.big || 10)) return 'big';
  if (coins >= (t.small || 5)) return 'small';
  if (coins >= (t.table || 1)) return 'table';
  return null;
}
function enqueuePhoto(job) {
  const pending = queue.find(j => j.uniqueId && j.uniqueId === job.uniqueId);
  if (pending) { pending.coins += job.coins; pending.kind = tierOf(pending.coins) || pending.kind; return; }
  queue.push(job);
  if (!busy) runQueue();
}
async function runQueue() {
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    try { await shoot(job); } catch (e) { console.error('shoot', e); }
    await sleep(350);
  }
  busy = false;
  if (pendingReload) location.reload();
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const anim = { blur: 0, dim: 1, flash: 0, flashLight: 0 };
let activePrint = null;

function heroClosePose() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
  const d = 1.0 / (2 * Math.tan(hfov / 2)) / 0.78;
  const pos = camera.position.clone().addScaledVector(fwd, d).addScaledVector(up, 0.12);
  const q = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, -0.18, 0.02)));
  return { pos, quat: q };
}
function showPose() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const h = 0.38 / PRINT_ASPECT;
  const d = h / (2 * Math.tan(vfov / 2)) / 0.56; // print fills ~56% of the height
  const pos = camera.position.clone().addScaledVector(fwd, d).addScaledVector(up, h * 0.06);
  const q = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.035)));
  return { pos, quat: q, scale: 1 };
}

function tween(dur, fn) {
  return new Promise((res) => {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (dur * 1000 / speed()));
      fn(k);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    step();
  });
}
const speed = () => queue.length > 6 ? 1.8 : queue.length > 2 ? 1.3 : 1;

function slotWorld() {
  heroPivot.updateMatrixWorld(true);
  const p = new THREE.Vector3(...meta.hero.slot).applyMatrix4(heroPivot.matrixWorld);
  const d = new THREE.Vector3(...meta.hero.slotDir).applyQuaternion(heroPivot.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(heroPivot.getWorldQuaternion(new THREE.Quaternion()));
  return { p, d, right };
}
function printEjectPose(s, h) {
  const { p, d, right } = slotWorld();
  const x = right.clone().negate();
  const z = new THREE.Vector3().crossVectors(x, d).normalize();
  const m = new THREE.Matrix4().makeBasis(x, d, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const pos = p.clone().addScaledVector(d, s - h / 2).addScaledVector(z, 0.004);
  return { pos, quat: q };
}

async function shoot(job) {
  const kind = job.kind;
  const entry = { id: Date.now() + Math.random(), kind, name: job.nickname, uniqueId: job.uniqueId, avatar: job.avatarLocal || null, coins: job.coins, t: Date.now(), font: S.photo.font, fontUrl: S.photo.fontUrl };
  report();
  const printP = makePrint(entry);
  const close = heroClosePose();
  const restPos = heroRest.pos.clone(), restQ = heroRest.quat.clone();
  // 1. camera comes forward, background blurs
  play('flash_charge', 0.6);
  await tween(1.15, (k) => {
    const e = ease(k);
    heroPivot.position.lerpVectors(restPos, close.pos, e);
    heroPivot.quaternion.slerpQuaternions(restQ, close.quat, e);
    anim.blur = e; anim.dim = lerp(1, 0.82, e);
  });
  const print = await printP;
  activePrint = print;
  const h = print.height;
  // 2. shutter + flash
  await sleep(150 / speed());
  play('shutter', 1);
  await sleep(40);
  if (S.photo.flash !== false) { anim.flash = 0.85; anim.flashLight = 1; }
  // small recoil
  const recoilQ = heroPivot.quaternion.clone();
  tween(0.25, (k) => { const a = Math.sin(k * Math.PI) * 0.02; heroPivot.quaternion.copy(recoilQ).multiply(tmpQ.setFromEuler(new THREE.Euler(-a, 0, 0))); });
  // 3. print ejects from the slot while developing
  print.develop = 0;
  heroScene.add(print.mesh);
  const devStart = performance.now();
  const devDur = 4200;
  const developTick = () => { if (!activePrint || activePrint !== print) return; print.develop = clamp01((performance.now() - devStart) / devDur); if (print.develop < 1) requestAnimationFrame(developTick); };
  developTick();
  await sleep(220 / speed());
  await tween(1.35, (k) => {
    const s = easeOut(k) * h * 0.9;
    const pose = printEjectPose(s, h);
    print.mesh.position.copy(pose.pos); print.mesh.quaternion.copy(pose.quat);
  });
  await sleep(250 / speed());
  // 4. print flies up to the screen, camera goes home
  const from = { pos: print.mesh.position.clone(), quat: print.mesh.quaternion.clone() };
  const show = showPose();
  const heroFrom = { pos: heroPivot.position.clone(), quat: heroPivot.quaternion.clone() };
  tween(1.4, (k) => { const e = ease(k); heroPivot.position.lerpVectors(heroFrom.pos, restPos, e); heroPivot.quaternion.slerpQuaternions(heroFrom.quat, restQ, e); });
  await tween(0.95, (k) => {
    const e = ease(k);
    print.mesh.position.lerpVectors(from.pos, show.pos, e);
    print.mesh.position.addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(e * Math.PI) * 0.18);
    print.mesh.quaternion.slerpQuaternions(from.quat, show.quat, e);
  });
  // 5. hold on screen
  const holdStart = performance.now();
  const hold = (S.photo.holdSeconds ?? 2.5) * 1000 / speed();
  const base = print.mesh.position.clone();
  await tween(hold / 1000 * speed(), (k) => { print.mesh.position.copy(base); print.mesh.position.y += Math.sin(k * Math.PI * 2) * 0.01; });
  print.develop = 1;
  // 6. fly to destination
  let pose, replace = null;
  if (kind === 'small') { const s = nextSmallSlot(); entry.slot = s.slot; replace = s.replace; pose = slotPose('small', s.slot); }
  else if (kind === 'big') { entry.slot = 0; replace = gallery.items.find(i => i.entry.kind === 'big') || null; pose = slotPose('big', 0); }
  else { pose = slotPose('table', null); entry.pick = pose.pick; }
  if (replace) removeGalleryItem(replace, true);
  const f2 = { pos: print.mesh.position.clone(), quat: print.mesh.quaternion.clone(), scale: print.mesh.scale.x };
  const mid = f2.pos.clone().lerp(pose.pos, 0.5); mid.y += kind === 'table' ? 0.5 : 0.35; mid.z += 0.6;
  await tween(1.25, (k) => {
    const e = ease(k);
    // quadratic bezier
    const a = f2.pos.clone().lerp(mid, e), b = mid.clone().lerp(pose.pos, e);
    print.mesh.position.copy(a.lerp(b, e));
    print.mesh.quaternion.slerpQuaternions(f2.quat, pose.quat, e);
    print.mesh.scale.setScalar(lerp(f2.scale, pose.scale, e));
    anim.blur = 1 - clamp01(k * 1.6); anim.dim = lerp(0.82, 1, clamp01(k * 1.6));
    print.light = lerp(1, 0.92, e);
  });
  // land: move from hero layer into background gallery
  heroScene.remove(print.mesh);
  activePrint = null;
  placeInGallery(print, entry, pose);
  if (kind === 'table') {
    const items = gallery.items.filter(i => i.entry.kind === 'table');
    while (items.length > 28) removeGalleryItem(items.shift(), true);
  }
  saveGallery();
  anim.blur = 0; anim.dim = 1;
}

// ---------------------------------------------------------------- live events
const lastGreet = new Map();
async function onLive(ev) {
  if (!ev) return;
  if (ev.type === 'join') {
    const k = ev.uniqueId || ev.nickname; const now = Date.now();
    if (lastGreet.has(k) && now - lastGreet.get(k) < 120000) return;
    lastGreet.set(k, now);
    if (lastGreet.size > 3000) lastGreet.clear();
    leds.bottom?.push(ev);
    return;
  }
  if (ev.type === 'follow') { leds.bottom?.push(ev); return; }
  if (ev.type === 'gift') {
    if (ev.giftImage && api.fetchImage && !ev.giftImage.startsWith('app://')) ev.giftImageLocal = await api.fetchImage(ev.giftImage);
    else ev.giftImageLocal = ev.giftImage || null;
    leds.bottom?.push(ev);
    play('chime', 0.35);
    const coins = S.photo.countByCoins !== false ? ev.coins : ev.unit;
    const kind = tierOf(coins);
    if (!kind) return;
    const avatarLocal = ev.avatarLocal || (ev.avatar && api.fetchImage ? await api.fetchImage(ev.avatar) : null);
    enqueuePhoto({ kind, coins, nickname: ev.nickname, uniqueId: ev.uniqueId, avatarLocal });
  }
}

// ---------------------------------------------------------------- commands from control panel
api.onCommand?.((cmd) => {
  if (!cmd) return;
  if (cmd.type === 'test') {
    const name = cmd.name || 'Khách';
    if (cmd.kind === 'join') onLive({ type: 'join', nickname: name, uniqueId: name + Math.random() });
    else if (cmd.kind === 'follow') onLive({ type: 'follow', nickname: name, uniqueId: name });
    else if (cmd.kind === 'burst') {
      const names = ['Lan Anh', 'Minh Tú', 'Bảo Ngọc', 'Quốc Huy', 'Thảo Vy', 'Đức Anh', 'Hà My', 'Gia Bảo', 'Khánh Linh', 'Tuấn Kiệt'];
      names.forEach((n, i) => setTimeout(() => onLive({ type: 'gift', nickname: n, uniqueId: n, giftName: 'Hoa hồng', giftImage: 'app://content/icons/rose.png', unit: 1, repeat: [1, 1, 5, 1, 10, 1, 1, 5, 1, 1][i], coins: [1, 1, 5, 1, 10, 1, 1, 5, 1, 1][i] }), i * 400));
    } else {
      const coins = Number(cmd.kind) || 1;
      onLive({ type: 'gift', nickname: name, uniqueId: name + '_' + coins, giftName: coins >= 10 ? 'Vương miện' : coins >= 5 ? 'Khung ảnh' : 'Hoa hồng',
        giftImage: coins >= 10 ? 'app://content/icons/crown.png' : coins >= 5 ? 'app://content/icons/frame.png' : 'app://content/icons/rose.png', unit: coins, repeat: 1, coins });
    }
  } else if (cmd.type === 'clear') {
    for (const it of [...gallery.items]) if ((cmd.what === 'table' && it.entry.kind === 'table') || (cmd.what === 'wall' && it.entry.kind !== 'table')) removeGalleryItem(it, true);
    saveGallery();
  }
});
api.onLive?.(onLive);

let pendingReload = false;
api.onUpdateReady?.(() => { if (!busy && !queue.length) location.reload(); else pendingReload = true; });

// ---------------------------------------------------------------- settings
let fpsCap = 60;
function applySettings(s) {
  const prevQ = S.display.quality;
  S = merge(DEFAULTS, s || {});
  if (prevQ !== S.display.quality) { pipe.setQuality(S.display.quality); resize(); }
  fpsCap = Number(S.display.fps) || 60;
  $('fps').hidden = !S.display.showFps;
  leds.top?.configure(S.topBoard);
  leds.bottom?.configure(S.bottomBoard);
  ensureFont(S.photo.font, S.photo.fontUrl);
}
api.onSettings?.(applySettings);

// ---------------------------------------------------------------- frame loop
const clock = new THREE.Clock();
let acc = 0, frames = 0, fpsT = 0, fps = 0;
function report() { api.report?.({ fps, queue: queue.length, busy, gallery: gallery.items.length }); }
setInterval(report, 1000);

function frame() {
  requestAnimationFrame(frame);
  const dt0 = clock.getDelta();
  acc += dt0;
  const minDt = 1 / fpsCap - 0.002;
  if (acc < minDt) return;
  const dt = Math.min(acc, 0.1); acc = 0;
  const t = clock.elapsedTime;
  frames++; fpsT += dt; if (fpsT >= 1) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; if (S.display.showFps) $('fps').textContent = `${fps} fps\nhàng chờ: ${queue.length}`; }

  // sprites
  const now = new Date();
  const sec = now.getSeconds() + now.getMilliseconds() / 1000, min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
  for (const sp of sprites) {
    if (sp.kind === 'gear') sp.angle -= sp.spin * dt;            // + spin = counter-clockwise on screen
    else {
      const frac = sp.kind === 'second' ? sec / 60 : sp.kind === 'minute' ? min / 60 : hr / 12;
      const desiredCCW = -frac * Math.PI * 2;                      // clock hands turn clockwise
      sp.angle = -(desiredCCW - sp.renderedAngle);
    }
    sp.mat.uniforms.angle.value = sp.angle;
  }
  for (const g of glows) g.mat.uniforms.strength.value = 0.06 + 0.05 * Math.sin(t * 13 + g.seed) * Math.sin(t * 7.3 + g.seed * 2) + anim.flash * 0.2;
  leds.top?.update(dt, t);
  leds.bottom?.update(dt, t);

  // flash decay
  anim.flash = Math.max(0, anim.flash - dt * 3.2);
  anim.flashLight = Math.max(0, anim.flashLight - dt * 4);
  if (flashLight && heroPivot) {
    flashLight.position.copy(heroPivot.position).add(new THREE.Vector3(0.3, 0.4, 0.8));
    flashLight.intensity = anim.flashLight * 60;
  }
  if (flashSprite) { flashSprite.material.opacity = Math.min(1, anim.flashLight * 1.4); flashSprite.scale.setScalar(0.5 + anim.flashLight * 0.9); }
  plateMat && (plateMat.uniforms.light.value = 1 + anim.flash * 0.35);
  pipe.blur = anim.blur; pipe.dim = anim.dim; pipe.flash = anim.flash * 0.75;
  pipe.render({ bgScene, heroScene, camera, viewport });
}

// ---------------------------------------------------------------- boot
(async () => {
  try {
    const s = api.getSettings ? await api.getSettings() : {};
    S = merge(DEFAULTS, s || {});
    pipe.setQuality(S.display.quality);
    resize();
    console.log('boot: fonts');
    await Promise.all(BUNDLED_FONTS.map(f => ensureFont(f.family, f.url)));
    console.log('boot: scene');
    for (const f of (S.customFonts || [])) await ensureFont(f.family, f.url);
    await buildScene();
    console.log('boot: scene ok');
    applySettings(S);
    console.log('boot: settings');
    await restoreGallery();
    console.log('boot: gallery');
    initAudio();
    bootEl.hidden = true;
    window.__ready = true;
    frame();
    console.log('boot: running');
  } catch (e) {
    console.error(e);
    bootEl.textContent = 'Lỗi tải cảnh: ' + (e.message || e);
  }
})();
// browsers need a gesture before audio; Electron allows autoplay but keep this as a fallback
window.addEventListener('pointerdown', () => audio.ctx?.resume());
