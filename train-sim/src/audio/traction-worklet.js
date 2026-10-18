// AudioWorklet: physically modelled traction sound (one output channel per motor / inverter unit).
//
// VVVF (E231 / E233)
//   1. two-level 3-phase inverter: sine reference vs. triangle carrier (asynchronous,
//      synchronous N-pulse) or square wave (1-pulse), 4x oversampled
//   2. motor phase voltages (neutral-shifted), minus their fundamental, are integrated
//      through the motor's leakage inductance  ->  PWM current ripple per phase
//   3. electromagnetic forces on the stator = air-gap flux x ripple current
//      (space-vector products: breathing mode, 4-pole mode, torque ripple) + ripple^2
//   4. the force excites the motor frame / bogie resonances (bandpass bank)
//   5. plus mechanical sources: gear mesh (pinion teeth x motor speed, with
//      harmonics and once-per-rev sidebands), cooling fan, rotor slot harmonics
// DC (211 / 115)
//   armature slot whine + commutator brush noise scaled with motor current,
//   gear mesh and a big self-ventilated fan.
//
// Each unit has its own wheel diameter (+-0.6 %), carrier phase and noise, so several
// units placed around the train do not comb-filter like copies of one signal.

const TAU = Math.PI * 2;
const OS = 4;
const SQ3_2 = 0.8660254037844386;

function frac(x) { return x - Math.floor(x); }
function tri(p) { return 1 - 4 * Math.abs(frac(p) - 0.5); }   // -1 .. 1

/** RBJ band-pass (0 dB peak), transposed direct form II */
class BP {
  constructor(f, Q, g, sr) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    this.b0 = al / a0 * g; this.b2 = -al / a0 * g;
    this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - al) / a0;
    this.z1 = 0; this.z2 = 0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = -this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** one-pole low-pass helper */
function lpCoef(f, sr) { return 1 - Math.exp(-TAU * f / sr); }

// default structural resonances of a ~200 kW traction motor in a bogie (Hz, Q, gain)
const MOTOR_MODES = [[560, 5, 0.55], [1020, 8, 1.0], [1480, 9, 0.75], [2050, 10, 0.7], [2800, 12, 0.5], [3700, 12, 0.35], [5200, 10, 0.2]];

class Unit {
  constructor(cfg, k, sr) {
    const rnd = mulberry(1234 + k * 7919);
    this.rnd = rnd;
    this.det = 1 + (rnd() - 0.5) * 0.012;           // wheel wear: diameter differs per car
    this.th = rnd(); this.pc = rnd();
    this.ia = 0; this.ib = 0; this.ic = 0;          // ripple currents
    this.gate = 0;                                   // inverter gate envelope
    this.pg = rnd(); this.pw = rnd(); this.pm = rnd(); this.ps = rnd(); this.pf = rnd(); this.pa = rnd();
    this.n1 = 0; this.n2 = 0; this.fanLp1 = 0; this.fanLp2 = 0; this.brLp = 0; this.brHp = 0;
    this.hpX = 0; this.hpY = 0; this.lp = 0;
    this.jit = 0;
    this.fcJ = 0;
    const modes = (cfg.motorModes || MOTOR_MODES);
    // detune the frame resonances a little per unit as well
    this.bank = modes.map(([f, Q, g]) => new BP(f * (1 + (rnd() - 0.5) * 0.04), Q, g, sr));
    this.gearBank = [new BP(cfg.gearResonance || 1900, 2.2, 1, sr)];
  }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class TractionProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.cfg = null;
    this.units = [];
    this.nUnits = (opts && opts.processorOptions && opts.processorOptions.units) || 1;
    this.tv = 0; this.tt = 0;
    this.v = 0; this.t = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'config') {
        this.cfg = prepare(d.sound);
        this.units = [];
        for (let k = 0; k < this.nUnits; k++) this.units.push(new Unit(this.cfg, k + (d.seed || 0) * 31, sampleRate));
      } else if (d.type === 'state') { this.tv = d.v; this.tt = d.torque; }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const n = out[0].length;
    const cfg = this.cfg;
    if (!cfg) { for (const ch of out) ch.fill(0); return true; }
    const sr = sampleRate, srOS = sr * OS;
    const kV = 1 - Math.exp(-1 / (0.06 * sr));
    const kT = 1 - Math.exp(-1 / (0.10 * sr));
    // control values are smoothed once per block per unit set (cheap) and per sample (accurate)
    let v = this.v, t = this.t;
    if (!this.vs || this.vs.length !== n) { this.vs = new Float32Array(n); this.ts = new Float32Array(n); }
    const vs = this.vs, ts = this.ts;
    for (let i = 0; i < n; i++) {
      v += (this.tv - v) * kV; t += (this.tt - t) * kT;
      vs[i] = v; ts[i] = t;
    }
    this.v = v; this.t = t;
    for (let u = 0; u < out.length; u++) {
      const unit = this.units[u % this.units.length];
      if (!unit) { out[u].fill(0); continue; }
      if (cfg.type === 'vvvf') this.runVVVF(unit, out[u], vs, ts, sr, srOS);
      else this.runDC(unit, out[u], vs, ts, sr);
    }
    return true;
  }

  /** mechanical sources shared by both motor types; returns the sample */
  mech(U, nMot, load, v, sr) {
    const cfg = this.cfg;
    let s = 0;
    if (nMot > 0.2) {
      // gear mesh: pinion teeth x motor speed, harmonics, sidebands at wheel and pinion rev
      U.jit += ((U.rnd() * 2 - 1) - U.jit) * 0.002;
      const fg = nMot * cfg.pinion * (1 + U.jit * 0.0015);
      U.pg = frac(U.pg + fg / sr);
      U.pw = frac(U.pw + nMot / cfg.ratio / sr);
      U.pm = frac(U.pm + nMot / sr);
      const am = 1 + 0.28 * Math.sin(TAU * U.pw) + 0.14 * Math.sin(TAU * U.pm + 1.3);
      const p = TAU * U.pg;
      const te = (0.25 + 0.75 * Math.min(1, Math.abs(load) * 1.2)) * Math.min(1, (nMot / cfg.nRef) ** 1.3);
      const mesh = Math.sin(p) + 0.42 * Math.sin(2 * p + 0.7) + 0.16 * Math.sin(3 * p + 2.1);
      s += mesh * am * te * cfg.gearGain * 0.11;
      // cooling fan: broadband (2-pole band-pass, centre rising with speed) + blade-pass tone
      const nf = nMot / cfg.nRef;
      const fanAmp = cfg.fanGain * Math.min(1.6, nf) ** 2.5;
      if (fanAmp > 1e-4) {
        const w = U.rnd() * 2 - 1;
        const c = lpCoef(500 + 2600 * Math.min(1.5, nf), sr);
        U.fanLp1 += (w - U.fanLp1) * c;
        U.fanLp2 += (U.fanLp1 - U.fanLp2) * c;
        const band = U.fanLp1 - U.fanLp2 * 0.85;
        U.pf = frac(U.pf + nMot * cfg.fanBlades / sr);
        s += (band * 0.9 + Math.sin(TAU * U.pf) * 0.12) * fanAmp * 0.12;
      }
    }
    return s;
  }

  runVVVF(U, ch, vs, ts, sr, srOS) {
    const cfg = this.cfg;
    const leak = TAU * 25 / srOS, kI = TAU * 320 / srOS;
    const hpA = Math.exp(-TAU * 35 / sr);
    for (let i = 0; i < ch.length; i++) {
      const v = vs[i], T = ts[i];
      const nMot = (v / 3.6) / (Math.PI * cfg.wheelD) * cfg.ratio * U.det;     // motor rev/s
      const level = Math.min(1, Math.abs(T));
      // gate: the inverter runs while there is a torque command (coasting = gates off)
      const on = level > 0.02 && (v > 0.05 || T > 0) && !(T < 0 && v < cfg.regenCut);
      U.gate += ((on ? 1 : 0) - U.gate) * (on ? 0.0016 : 0.0012);
      let em = 0;
      if (U.gate > 1e-3) {
        const regen = T < 0;
        const modes = regen && cfg.regenModes ? cfg.regenModes : cfg.modes;
        const f1p = regen && cfg.regenModes ? cfg.f1pRegen : cfg.f1p;
        const slip = cfg.slip * (regen ? -1 : 1) * (0.25 + 0.75 * level);
        const fm = Math.max(0.25, nMot * cfg.polePairs + slip);
        // pattern for this output frequency
        let mode = modes[modes.length - 1], from = 0;
        for (const m of modes) { if (m.onePulse || fm < m.to) { mode = m; break; } from = m.to; }
        let fc = 0, N = 0;
        const k = Math.min(1, Math.max(0, (fm - from) / Math.max(1e-3, (mode.to || from + 1) - from)));
        if (mode.async) fc = mode.async[0] + (mode.async[1] - mode.async[0]) * k;
        else if (mode.sync) N = mode.sync;
        // V/f: modulation index rises to ~1 at the 1-pulse boundary (or along the maker's ramp);
        // wide 3-pulse is over-modulated so the pulses merge toward the square wave
        let mi = cfg.ampRamp ? fm / cfg.ampRamp[0] * cfg.ampRamp[1] : 0.03 + 0.97 * fm / f1p;
        mi = mode.wide ? 1.0 + 0.35 * k : Math.min(cfg.ampRamp ? 1.4 : 1.15, mi);
        const psi = fm < f1p ? 1 : f1p / fm;
        const fund = mode.onePulse ? 1.2732 : mi;
        const iq = Math.max(-1.6, Math.min(1.6, T / psi)) * 0.6;          // torque current
        let acc = 0;
        for (let k = 0; k < OS; k++) {
          U.th = frac(U.th + fm / srOS);
          const ph = TAU * U.th;
          const sa = Math.sin(ph), ca = Math.cos(ph);
          const sb = -0.5 * sa - SQ3_2 * ca, sc = -0.5 * sa + SQ3_2 * ca;
          let Va, Vb, Vc;
          if (mode.onePulse) {
            Va = sa >= 0 ? 1 : -1; Vb = sb >= 0 ? 1 : -1; Vc = sc >= 0 ? 1 : -1;
          } else {
            let c;
            if (fc > 0) {
              // spread-spectrum: each carrier period gets a slightly different frequency
              const p0 = U.pc;
              U.pc = frac(U.pc + (fc + U.fcJ) / srOS);
              if (U.pc < p0 && mode.random) U.fcJ = (U.rnd() - 0.5) * mode.random * 2;
              c = tri(U.pc);
            }
            else c = tri(U.th * N + 0.25);
            Va = mi * sa > c ? 1 : -1; Vb = mi * sb > c ? 1 : -1; Vc = mi * sc > c ? 1 : -1;
          }
          const vn = (Va + Vb + Vc) / 3;
          // ripple = phase voltage minus its fundamental, through the leakage inductance
          U.ia += (Va - vn - fund * sa) * kI - U.ia * leak;
          U.ib += (Vb - vn - fund * sb) * kI - U.ib * leak;
          U.ic += (Vc - vn - fund * sc) * kI - U.ic * leak;
          // Clarke transform of ripple and flux (flux lags the voltage by 90 deg)
          const ra = (2 * U.ia - U.ib - U.ic) / 3, rb = (U.ib - U.ic) / 1.7320508;
          const fa = -psi * ca, fb = -psi * sa;
          // fundamental current: magnetising (along the flux) + torque component
          const ia = fa * 0.5 + iq * sa, ib = fb * 0.5 - iq * ca;
          const breathe = fa * ra + fb * rb;              // space-vector dot: mode-0 radial force
          const mode4 = fa * ra - fb * rb;                // 4-pole spatial mode
          const torque = ia * rb - ib * ra;               // torque ripple (tangential)
          acc += breathe + 0.45 * mode4 + 0.8 * torque + 0.6 * (ra * ra + rb * rb);
        }
        em = (acc / OS) * U.gate * (0.55 + 0.45 * level) * cfg.pwmGain * 0.6;
      }
      // frame resonances + some direct radiation
      let r = em * 0.3;
      for (const b of U.bank) r += b.run(em);
      // slot harmonic: rotor bars x speed, modulated by the flux, needs current
      let slot = 0;
      if (U.gate > 1e-3 && nMot > 1) {
        U.ps = frac(U.ps + nMot * cfg.rotorBars / sr);
        slot = Math.sin(TAU * U.ps) * 0.02 * U.gate * (0.3 + level) * Math.min(1, nMot / 15);
      }
      let s = r * 0.9 + slot + this.mech(U, nMot, U.gate * T, v, sr);
      // DC block
      const hp = hpA * (U.hpY + s - U.hpX);
      U.hpX = s; U.hpY = hp;
      ch[i] = hp;
    }
  }

  runDC(U, ch, vs, ts, sr) {
    const cfg = this.cfg;
    const hpA = Math.exp(-TAU * 40 / sr);
    const brC = lpCoef(5200, sr), brH = lpCoef(1800, sr);
    for (let i = 0; i < ch.length; i++) {
      const v = vs[i], T = ts[i];
      const nMot = (v / 3.6) / (Math.PI * cfg.wheelD) * cfg.ratio * U.det;
      // series motor: armature current ~ torque command (rheostatic / regenerative brake too)
      const cur = Math.min(1, Math.abs(T));
      U.gate += (cur - U.gate) * 0.0015;
      let em = 0;
      if (nMot > 0.3 && U.gate > 1e-3) {
        // armature slot passing: the characteristic DC-motor whine, field-dependent harmonics
        U.ps = frac(U.ps + nMot * cfg.armSlots / sr);
        const p = TAU * U.ps;
        U.pa = frac(U.pa + nMot * cfg.polePairs * 2 / sr);
        const pole = 1 + 0.35 * Math.sin(TAU * U.pa);
        em = (Math.sin(p) + 0.5 * Math.sin(2 * p + 0.4) + 0.22 * Math.sin(3 * p + 1.1)) * pole * U.gate * 0.06 * Math.min(1, nMot / 8);
        // commutator: brush noise (band-limited) scaled with current
        const w = U.rnd() * 2 - 1;
        U.brLp += (w - U.brLp) * brC;
        U.brHp += (U.brLp - U.brHp) * brH;
        em += (U.brLp - U.brHp) * U.gate * 0.05 * cfg.motorGain;
      }
      let r = em * 0.4;
      for (const b of U.bank) r += b.run(em);
      let s = r * cfg.motorGain + this.mech(U, nMot, U.gate, v, sr);
      const hp = hpA * (U.hpY + s - U.hpX);
      U.hpX = s; U.hpY = hp;
      ch[i] = hp * 2.6;   // DC series motors growl louder than an IGBT inverter
    }
  }
}

/** fill in physical defaults from the vehicle's sound profile */
function prepare(s) {
  const cfg = {
    type: s.type,
    wheelD: s.wheelD || 0.86,
    ratio: s.gearRatio || 7.07,
    pinion: s.pinion || s.gearTeeth || 14,
    polePairs: s.polePairs || 2,
    slip: s.slip || 2.0,
    modes: s.modes || [{ onePulse: true }],
    ampRamp: s.ampRamp || null,
    regenModes: s.regenModes || null,
    regenCut: s.regenCut ?? 4,
    pwmGain: s.pwmGain ?? 1,
    gearGain: s.gearGain ?? 0.5,
    fanGain: s.fanGain ?? 0.35,
    fanBlades: s.fanBlades || 13,
    rotorBars: s.rotorBars || 40,
    armSlots: s.armSlots || 33,
    motorGain: s.motorGain ?? 0.6,
    motorModes: s.motorModes,
    gearResonance: s.gearResonance,
  };
  const f1 = (modes) => { let from = 0; for (const m of modes) { if (m.onePulse) return from; from = m.to; } return from || 80; };
  cfg.f1p = f1(cfg.modes);
  cfg.f1pRegen = cfg.regenModes ? f1(cfg.regenModes) : cfg.f1p;
  // motor speed at 100 km/h: reference for gear / fan loudness
  cfg.nRef = (100 / 3.6) / (Math.PI * cfg.wheelD) * cfg.ratio;
  return cfg;
}

registerProcessor('traction', TractionProcessor);
