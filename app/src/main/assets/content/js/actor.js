// The robot photographer: a skinned glTF with one long take (sit → stand up → raise the camera → shoot →
// hold the photo out → … → sit down). The app drives it by frame numbers: play a range, or cross-fade to a
// frame (two actions of the same clip blended), so it can skip parts of the take or stay standing between shots.
import * as THREE from 'three';

export const ACTOR_LAYER = 1;
const ease = (t) => (t = Math.max(0, Math.min(1, t)), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Actor {
  constructor(gltf, info) {
    this.root = gltf.scene; this.info = info; this.fps = info.fps || 24; this.F = info.frames;
    this.cam = this.root.getObjectByName(info.camera || 'PolaroidCam');
    const clip = gltf.animations.reduce((a, b) => (!a || b.duration > a.duration ? b : a), null);
    this.clip = clip;
    this.t0 = clip ? Math.min(...clip.tracks.map(t => t.times[0])) : 0;          // time of the take's first frame
    this.mixer = new THREE.AnimationMixer(this.root);
    if (clip) {
      this.a = this.mixer.clipAction(clip); this.b = this.mixer.clipAction(clip.clone());
      for (const x of [this.a, this.b]) { x.setLoop(THREE.LoopOnce, 1); x.clampWhenFinished = true; x.timeScale = 0; x.play(); }
    }
    this.fa = this.F.rest; this.fb = this.F.rest; this.w = 0; this.motion = null; this.state = 'rest'; this.seq = 0;
    this.root.traverse(o => {
      o.layers.set(ACTOR_LAYER);
      if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 1; }
    });
    // the chair in front of the robot: depth only, the background picture shows the real chair
    for (const n of info.occluders || []) this.root.getObjectByName(n)?.traverse(o => {
      if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ colorWrite: false }); o.renderOrder = -10; }
    });
    this.hips = this.root.getObjectByName('mixamorigHips');
    this.apply();
    const v = new THREE.Vector3();
    this.hipsRest = this.hips ? this.hips.getWorldPosition(v).y : 0;
    this.fa = this.F.hold; this.apply(); this.hipsUp = this.hips ? this.hips.getWorldPosition(v).y : 1;
    this.fa = this.F.rest; this.apply();
  }
  tf(f) { const t = this.t0 + (f - 1) / this.fps; return Math.min(Math.max(this.t0, t), (this.clip?.duration || 1) - 1e-4); }
  apply() {
    if (this.a) {
      this.a.time = this.tf(this.fa); this.b.time = this.tf(this.fb);
      this.a.setEffectiveWeight(1 - this.w); this.b.setEffectiveWeight(this.w);
      this.mixer.update(0);
    }
    this.root.updateMatrixWorld(true);
  }
  // 0 = sitting, 1 = standing (from the hips height) — drives the background shadow cross-fade
  get standing() {
    if (!this.hips) return 0;
    const y = this.hips.getWorldPosition(new THREE.Vector3()).y;
    return Math.max(0, Math.min(1, (y - this.hipsRest) / Math.max(1e-4, this.hipsUp - this.hipsRest)));
  }
  _run(m) {
    if (this.motion) this.motion.resolve();
    return new Promise((resolve) => { this.motion = { ...m, t: 0, resolve }; });
  }
  // play frames f1 → f2 in dur seconds
  play(f1, f2, dur) { this.fa = f1; this.w = 0; return this._run({ type: 'play', f1, f2, dur: Math.max(0.01, dur) }); }
  // cross-fade from the current pose to frame f
  blendTo(f, dur) {
    if (this.w > 0) { this.fa = this.w > 0.5 ? this.fb : this.fa; this.w = 0; }
    this.fb = f; return this._run({ type: 'blend', dur: Math.max(0.01, dur) });
  }
  hold(f) { if (this.motion) { this.motion.resolve(); this.motion = null; } this.fa = f; this.w = 0; this.apply(); }
  update(dt) {
    const m = this.motion;
    if (m) {
      m.t += dt; const k = Math.min(1, m.t / m.dur);
      if (m.type === 'play') this.fa = m.f1 + (m.f2 - m.f1) * k;
      else this.w = ease(k);
      if (k >= 1) { if (m.type === 'blend') { this.fa = this.fb; this.w = 0; } this.motion = null; m.resolve(); }
    }
    this.apply();
  }
  // high-level moves. Each new move cancels the previous one (seq), so a sit-down that is still running
  // can never be restarted or interleaved with another one.
  async standAndAim(speed = 1) {
    const F = this.F, my = ++this.seq;
    if (this.state === 'rest') { this.state = 'up'; await this.play(F.standFrom, F.shoot, (F.shoot - F.standFrom) / this.fps / speed); }
    else { this.state = 'up'; await this.blendTo(F.shoot, 0.7 / speed); }
    return my === this.seq;
  }
  sitDown(speed = 1) {
    if (this.state === 'rest') return Promise.resolve();
    if (this.state === 'sitting') return this.sitting;
    const F = this.F, my = ++this.seq;
    this.state = 'sitting';
    this.sitting = (async () => {
      await this.blendTo(F.sitFrom, 0.55 / speed); if (my !== this.seq) return;
      await this.play(F.sitFrom, F.sitTo, (F.sitTo - F.sitFrom) / this.fps / speed); if (my !== this.seq) return;
      await this.blendTo(F.rest, 0.4 / speed); if (my !== this.seq) return;
      this.state = 'rest';
    })();
    return this.sitting;
  }
  stayUp() { ++this.seq; this.state = 'up'; return this.blendTo(this.F.shoot, 1.2); }
}
