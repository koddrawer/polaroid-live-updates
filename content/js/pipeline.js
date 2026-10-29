// Lightweight render pipeline: background layer (+blur, +bloom) and hero layer composited, then soft-clip output.
// Designed for old GPUs: half/quarter-res blur and bloom, no full-res post chains.
import * as THREE from 'three';

const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function quad(material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  m.frustumCulled = false;
  const s = new THREE.Scene(); s.add(m);
  return { scene: s, mesh: m };
}

const BLUR_FS = `
uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 texel; varying vec2 vUv;
void main(){
  vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
  vec2 o1 = dir * texel * 1.3846153846, o2 = dir * texel * 3.2307692308;
  c += texture2D(tDiffuse, vUv + o1) * 0.3162162162; c += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
  c += texture2D(tDiffuse, vUv + o2) * 0.0702702703; c += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
  gl_FragColor = c;
}`;
const _B=0;
const BRIGHT_FS = `
uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.6, l), 1.0); }`;
const COMP_FS = `
uniform sampler2D tBg; uniform sampler2D tBlur; uniform sampler2D tBloom;
uniform float blur; uniform float bloom; uniform float dim; uniform vec4 crop; varying vec2 vUv;
void main(){
  vec2 uv = crop.xy + vUv * crop.zw;   // zoom: show a sub-rectangle of the background
  vec3 c = mix(texture2D(tBg, uv).rgb, texture2D(tBlur, uv).rgb, blur);
  c *= dim;
  c += texture2D(tBloom, uv).rgb * bloom;
  gl_FragColor = vec4(c, 1.0);
}`;
const OUT_FS = `
uniform sampler2D tDiffuse; uniform float flash; uniform float vignette; varying vec2 vUv;
vec3 shoulder(vec3 x){ // soft clip above 0.8
  vec3 k = max(x - 0.8, 0.0); return min(x, 0.8) + k / (1.0 + k / 0.2);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec2 d = vUv - 0.5; c *= 1.0 - vignette * dot(d, d) * 1.6;
  c = shoulder(max(c, 0.0));
  c = toSRGB(clamp(c, 0.0, 1.0));
  c = mix(c, vec3(1.0), flash);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Pipeline {
  constructor(renderer) {
    this.r = renderer;
    this.quality = 'medium';
    // HDR targets need a renderable half-float format; phones without it fall back to 8-bit targets
    const gl = renderer.getContext();
    this.hdr = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    this.mobile = globalThis.api?.platform === 'android';
    const mk = (fs, uniforms) => quad(new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false }));
    this.blurQ = mk(BLUR_FS, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2() } });
    this.brightQ = mk(BRIGHT_FS, { tDiffuse: { value: null }, threshold: { value: 2.3 } });
    this.compQ = mk(COMP_FS, { tBg: { value: null }, tBlur: { value: null }, tBloom: { value: null }, blur: { value: 0 }, bloom: { value: 0.9 }, dim: { value: 1 }, crop: { value: new THREE.Vector4(0, 0, 1, 1) } });
    this.outQ = mk(OUT_FS, { tDiffuse: { value: null }, flash: { value: 0 }, vignette: { value: 0.35 } });
    this.cam = new THREE.Camera();
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    this.targets = null;
    this.blur = 0; this.flash = 0; this.dim = 1; this.crop = new THREE.Vector4(0, 0, 1, 1);
  }
  setQuality(q) { this.quality = q; this.dispose(); }
  dispose() { if (this.targets) Object.values(this.targets).forEach(t => t && t.dispose && t.dispose()); this.targets = null; }
  ensure(w, h) {
    if (this.targets && this.targets.w === w && this.targets.h === h) return;
    this.dispose();
    const q = this.quality;
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const opt = { type, depthBuffer: true, colorSpace: THREE.NoColorSpace };
    // phones: MSAA only on "high" (multisampled targets + resolve cost a lot of bandwidth on mobile GPUs)
    const msaa = globalThis.__noMSAA ? 0 : this.mobile ? (q === 'high' ? 2 : 0) : (q === 'high' ? 4 : q === 'medium' ? 2 : 0);
    const t = {
      w, h,
      bg: new THREE.WebGLRenderTarget(w, h, { ...opt, samples: 0 }),
      comp: new THREE.WebGLRenderTarget(w, h, { ...opt, samples: msaa }),
      bA: new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { type, depthBuffer: false }),
      bB: new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { type, depthBuffer: false }),
      gA: new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), { type, depthBuffer: false }),
      gB: new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), { type, depthBuffer: false }),
    };
    this.targets = t;
  }
  pass(q, target) { this.r.setRenderTarget(target); this.r.render(q.scene, this.cam); }
  blurInto(src, a, b, iterations, spread) {
    const u = this.blurQ.mesh.material.uniforms;
    let input = src;
    for (let i = 0; i < iterations; i++) {
      u.tDiffuse.value = input; u.texel.value.set(spread / a.width, spread / a.height); u.dir.value.set(1, 0); this.pass(this.blurQ, a);
      u.tDiffuse.value = a.texture; u.dir.value.set(0, 1); this.pass(this.blurQ, b);
      input = b.texture;
    }
    return b.texture;
  }
  render({ bgScene, heroScene, camera, heroCamera, viewport }) {
    const r = this.r;
    const { w, h } = viewport;
    this.ensure(w, h);
    const t = this.targets;
    r.autoClear = false;
    // 1. background layer
    r.setRenderTarget(t.bg); r.setClearColor(0x000000, 1); r.clear(true, true, true);
    r.render(bgScene, camera);
    // 2. bloom (quarter res)
    let bloomTex = this.black;
    if (this.quality !== 'low' && this.hdr) {
      this.brightQ.mesh.material.uniforms.tDiffuse.value = t.bg.texture;
      this.pass(this.brightQ, t.gA);
      bloomTex = this.blurInto(t.gA.texture, t.gB, t.gA, 2, 1.6);
      // blurInto ping-pongs into gA as last write
    }
    // 3. depth-of-field style background blur (half res)
    let blurTex = t.bg.texture;
    if (this.blur > 0.005) {
      const it = this.quality === 'low' ? 2 : 3;
      blurTex = this.blurInto(t.bg.texture, t.bA, t.bB, it, 1.0 + this.blur * 2.2);
    }
    // 4. composite + hero
    const cu = this.compQ.mesh.material.uniforms;
    cu.tBg.value = t.bg.texture; cu.tBlur.value = blurTex; cu.blur.value = Math.min(1, this.blur * 1.4);
    cu.tBloom.value = bloomTex; cu.bloom.value = this.quality === 'low' ? 0 : 0.35; cu.dim.value = this.dim; cu.crop.value.copy(this.crop);
    r.setRenderTarget(t.comp); r.clear(true, true, true);
    r.render(this.compQ.scene, this.cam);
    r.clearDepth();
    r.render(heroScene, heroCamera || camera);
    // 5. output
    const ou = this.outQ.mesh.material.uniforms;
    ou.tDiffuse.value = t.comp.texture; ou.flash.value = this.flash;
    r.setRenderTarget(null);
    r.setViewport(viewport.x, viewport.y, viewport.cw, viewport.ch);
    r.render(this.outQ.scene, this.cam);
  }
}
