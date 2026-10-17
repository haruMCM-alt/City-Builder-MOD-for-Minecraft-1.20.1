// AudioWorklet: synthesizes traction sound.
//  - VVVF: real 3-phase PWM line voltage (sine reference vs. triangle carrier),
//    asynchronous / synchronous N-pulse / 1-pulse modes, 4x oversampled.
//  - Gear mesh whine (all trains) and DC motor hum + brush noise (DC trains).

const TAU = Math.PI * 2;
const OS = 4;

function frac(x) { return x - Math.floor(x); }
function tri(p) { return 1 - 4 * Math.abs(frac(p) - 0.5); } // -1..1

class TractionProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cfg = null;
    this.tv = 0; this.tt = 0; // targets: speed km/h, torque -1..1
    this.v = 0; this.t = 0;
    this.pm = 0; this.pc = 0; this.pg = 0; this.pd = 0;
    this.hpX = 0; this.hpY = 0;
    this.lp1 = 0; this.lp2 = 0;
    this.noiseLp = 0;
    this.mod = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'config') { this.cfg = d.sound; }
      else if (d.type === 'state') { this.tv = d.v; this.tt = d.torque; }
    };
  }

  modeAt(fm) {
    const modes = this.cfg.modes;
    let from = 0;
    for (const m of modes) {
      if (m.onePulse || fm < m.to) return { m, from };
      from = m.to;
    }
    return { m: modes[modes.length - 1], from };
  }

  onePulseStart() {
    let from = 0;
    for (const m of this.cfg.modes) { if (m.onePulse) return from; from = m.to; }
    return from || 80;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const ch = out[0];
    if (!ch) return true;
    const n = ch.length;
    const cfg = this.cfg;
    if (!cfg) { for (let c = 0; c < out.length; c++) out[c].fill(0); return true; }
    const sr = sampleRate;
    const kT = 1 - Math.exp(-1 / (0.12 * sr));
    const kV = 1 - Math.exp(-1 / (0.05 * sr));
    const hpA = Math.exp(-TAU * 140 / sr);
    const lpA = 1 - Math.exp(-TAU * 5200 / sr);
    const vvvf = cfg.type === 'vvvf';
    const f1p = vvvf ? this.onePulseStart() : 1;

    for (let i = 0; i < n; i++) {
      this.v += (this.tv - this.v) * kV;
      this.t += (this.tt - this.t) * kT;
      const v = this.v;
      const level = Math.min(1, Math.abs(this.t));
      let s = 0;
      const fmBase = v * cfg.fmPerKmh;

      if (vvvf && level > 0.004 && fmBase > 0.05) {
        const fm = Math.max(0.2, fmBase + 2.2 * Math.sign(this.t) * level);
        const { m: mode, from } = this.modeAt(fm);
        let fc = 0, N = 0;
        if (mode.async) {
          const span = Math.max(1e-3, mode.to - from);
          const k = Math.min(1, Math.max(0, (fm - from) / span));
          fc = mode.async[0] + (mode.async[1] - mode.async[0]) * k;
        } else if (mode.sync) N = mode.sync;
        // modulation index ~ V/f, rising to 1 at the 1-pulse boundary
        const mi = Math.min(1.25, 0.05 + 0.95 * fm / f1p);
        let acc = 0;
        for (let k = 0; k < OS; k++) {
          this.pm = frac(this.pm + fm / (sr * OS));
          const ru = Math.sin(TAU * this.pm);
          const rv = Math.sin(TAU * (this.pm - 1 / 3));
          let u, w;
          if (mode.onePulse) {
            u = ru >= 0 ? 1 : -1; w = rv >= 0 ? 1 : -1;
          } else {
            let c;
            if (fc > 0) { this.pc = frac(this.pc + fc / (sr * OS)); c = tri(this.pc); }
            else c = tri(this.pm * N + 0.25);
            u = mi * ru > c ? 1 : -1;
            w = mi * rv > c ? 1 : -1;
          }
          acc += (u - w) * 0.5;
        }
        s += (acc / OS) * level * cfg.pwmGain * 0.32;
      }

      // DC motor: commutation hum (harmonic-rich) + brush noise, scales with current
      if (!vvvf && v > 0.3) {
        const f = fmBase * 1.0;
        this.pd = frac(this.pd + f / sr);
        const p = TAU * this.pd;
        const hum = Math.sin(p) * 0.6 + Math.sin(2 * p) * 0.45 + Math.sin(3 * p) * 0.3 + Math.sin(6 * p) * 0.18 + Math.sin(12 * p) * 0.08;
        const lv = level * (cfg.motorGain || 0.5);
        this.noiseLp += ((Math.random() * 2 - 1) - this.noiseLp) * 0.25;
        s += hum * lv * 0.18 * Math.min(1, v / 15) + this.noiseLp * lv * 0.05;
      }

      // gear mesh whine (present whenever moving, louder under load)
      if (v > 0.5) {
        const fg = (fmBase / 2) * cfg.gearTeeth;
        this.pg = frac(this.pg + fg / sr);
        this.mod += ((Math.random() * 2 - 1) * 0.5 - this.mod) * 0.0008;
        const amp = cfg.gearGain * Math.min(1, (v / 100) ** 1.4) * (0.35 + 0.65 * level) * (1 + this.mod) * 0.07;
        s += (Math.sin(TAU * this.pg) + 0.35 * Math.sin(2 * TAU * this.pg)) * amp;
      }

      // high-pass (remove the motor fundamental / DC) then 2-pole low-pass
      const hp = hpA * (this.hpY + s - this.hpX);
      this.hpX = s; this.hpY = hp;
      this.lp1 += (hp - this.lp1) * lpA;
      this.lp2 += (this.lp1 - this.lp2) * lpA;
      ch[i] = this.lp2;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}

registerProcessor('traction', TractionProcessor);
