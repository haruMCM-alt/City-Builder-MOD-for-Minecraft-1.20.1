// Spatial audio helpers.
//
// Every moving sound source is a SpatialVoice:
//   input -> DelayNode (propagation delay = distance / 343 m/s) -> air-absorption low-pass
//         -> distance gain -> stereo panner -> bus
// Because the delay follows the distance continuously, a source approaching the listener
// is played back slightly faster and a receding one slower: the Doppler shift comes out of
// the physics instead of a pitch formula, together with the right arrival time of every
// rail-joint click and bell strike.

export const C_SOUND = 343;
const MAX_DELAY = 3.6;

export class Listener {
  constructor() {
    this.pos = { x: 0, y: 0, z: 0 };
    this.right = { x: 1, y: 0, z: 0 };
    this.fwd = { x: 0, y: 0, z: -1 };
  }
}

/** distance / direction maths shared by voices and one-shots */
export function spatialParams(L, p, ref) {
  const dx = p.x - L.pos.x, dy = p.y - L.pos.y, dz = p.z - L.pos.z;
  const d = Math.max(0.3, Math.hypot(dx, dy, dz));
  const inv = 1 / d;
  const side = (dx * L.right.x + dy * L.right.y + dz * L.right.z) * inv;
  const front = (dx * L.fwd.x + dy * L.fwd.y + dz * L.fwd.z) * inv;
  // inverse-distance law with a near-field plateau; sources right next to the head are not panned hard
  const gain = ref / Math.max(ref, d);
  const pan = Math.max(-1, Math.min(1, side * 0.9 * Math.min(1, d / 2.5)));
  // air absorption + a little head shadow for sources behind
  let lp = 19000 / (1 + d / 85);
  if (front < 0) lp *= 0.62 + 0.38 * (1 + front);
  return { d, gain, pan, lp: Math.max(250, Math.min(20000, lp)), delay: Math.min(MAX_DELAY, d / C_SOUND) };
}

export class SpatialVoice {
  /**
   * @param ctx AudioContext
   * @param bus destination node
   * @param opts { ref: distance (m) at which the gain is 1, gain: level, maxDist }
   */
  constructor(ctx, bus, opts = {}) {
    this.ctx = ctx;
    this.ref = opts.ref ?? 5;
    this.level = opts.gain ?? 1;
    this.maxDist = opts.maxDist ?? 1500;
    this.input = ctx.createGain();
    this.delay = ctx.createDelay(MAX_DELAY + 0.2);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.Q.value = 0.5; this.lp.frequency.value = 18000;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.input.connect(this.delay).connect(this.lp).connect(this.g).connect(this.pan).connect(bus);
    this.pos = { x: 0, y: 0, z: 0 };
    this.fresh = true;
  }

  set(x, y, z) { this.pos.x = x; this.pos.y = y; this.pos.z = z; }

  /** apply the current geometry; jump = camera cut (no Doppler glide from the old distance) */
  update(L, now, jump = false) {
    const p = spatialParams(L, this.pos, this.ref);
    const g = p.d > this.maxDist ? 0 : p.gain * this.level;
    if (jump || this.fresh) {
      this.delay.delayTime.cancelScheduledValues(now);
      this.delay.delayTime.setValueAtTime(p.delay, now);
      this.lp.frequency.setValueAtTime(p.lp, now);
      this.pan.pan.setValueAtTime(p.pan, now);
      this.g.gain.setTargetAtTime(g, now, 0.03);
      this.fresh = false;
    } else {
      // the glide time constant keeps the delay derivative (= Doppler ratio) smooth
      this.delay.delayTime.setTargetAtTime(p.delay, now, 0.06);
      this.lp.frequency.setTargetAtTime(p.lp, now, 0.05);
      this.pan.pan.setTargetAtTime(p.pan, now, 0.04);
      this.g.gain.setTargetAtTime(g, now, 0.04);
    }
    return p;
  }

  dispose() {
    try { this.input.disconnect(); this.pan.disconnect(); } catch { /* already gone */ }
  }
}

/** a short sound (rail joint, cam click) emitted from a point: delayed, panned and attenuated once */
export function oneShot(ctx, L, bus, buf, pos, { gain = 1, ref = 5, rate = 1, minGain = 0.008, when = 0 } = {}) {
  const p = spatialParams(L, pos, ref);
  const g = p.gain * gain;
  if (g < minGain) return;
  const s = ctx.createBufferSource();
  s.buffer = buf; s.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = g;
  const pn = ctx.createStereoPanner(); pn.pan.value = p.pan;
  if (p.lp < 12000) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; f.Q.value = 0.5;
    s.connect(f).connect(gn);
  } else s.connect(gn);
  gn.connect(pn).connect(bus);
  s.start(ctx.currentTime + p.delay + when);
}

/** synthetic stereo impulse response: ground reflection, scattered early reflections, diffuse tail */
export function makeImpulse(ctx, seconds = 1.6, decay = 3.2, early = []) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // tail: noise, darker as it decays
      const a = 0.25 + 0.7 * Math.exp(-t * 4);
      lp += ((Math.random() * 2 - 1) - lp) * a;
      d[i] = lp * Math.exp(-t * decay) * Math.min(1, t / 0.02) * 0.6;
    }
    for (const [t, g] of early) {
      const i = Math.floor((t + (c ? 0.0013 : 0)) * sr);
      if (i < len) d[i] += g * (c ? 0.9 : 1);
    }
  }
  return buf;
}
