// All train sounds are synthesized with the Web Audio API (no samples).

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.inCab = true;
    this.lastBrake = 0;
    this.lastCamStep = 0;
  }

  async init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // "cabin" filter: everything from under the floor is muffled inside the cab
    this.body = ctx.createBiquadFilter();
    this.body.type = 'lowpass';
    this.body.frequency.value = 3800;
    this.body.connect(this.master);

    this.noiseBuf = this.makeNoise(3);
    this.brownBuf = this.makeBrown(3);
    this.jointBuf = this.makeJoint();
    this.camBuf = this.makeClick();

    // traction worklet
    try {
      await ctx.audioWorklet.addModule(new URL('./traction-worklet.js', import.meta.url));
      this.traction = new AudioWorkletNode(ctx, 'traction', { outputChannelCount: [2] });
      this.tractionGain = ctx.createGain();
      this.tractionGain.gain.value = 0.9;
      this.traction.connect(this.tractionGain).connect(this.body);
    } catch (e) {
      console.warn('AudioWorklet unavailable', e);
    }

    // rolling noise (low rumble)
    this.roll = this.loopSource(this.brownBuf);
    this.rollF = ctx.createBiquadFilter(); this.rollF.type = 'lowpass'; this.rollF.frequency.value = 300;
    this.rollG = ctx.createGain(); this.rollG.gain.value = 0;
    this.roll.connect(this.rollF).connect(this.rollG).connect(this.body);
    // rail hiss / wind
    this.wind = this.loopSource(this.noiseBuf);
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 900; this.windF.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF).connect(this.windG).connect(this.master);
    // flange squeal on curves
    this.flange = ctx.createOscillator(); this.flange.type = 'sine'; this.flange.frequency.value = 3200;
    this.flangeG = ctx.createGain(); this.flangeG.gain.value = 0;
    this.flange.connect(this.flangeG).connect(this.body);
    this.flange.start();
    // brake squeal near standstill
    this.squeal = ctx.createOscillator(); this.squeal.type = 'triangle'; this.squeal.frequency.value = 2400;
    const sqLfo = ctx.createOscillator(); sqLfo.frequency.value = 7;
    const sqLfoG = ctx.createGain(); sqLfoG.gain.value = 40;
    sqLfo.connect(sqLfoG).connect(this.squeal.frequency); sqLfo.start();
    this.squealG = ctx.createGain(); this.squealG.gain.value = 0;
    this.squeal.connect(this.squealG).connect(this.body);
    this.squeal.start();
    // cab hum (auxiliary power unit / blower)
    this.hum = ctx.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 120;
    const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 400;
    this.humG = ctx.createGain(); this.humG.gain.value = 0.012;
    this.hum.connect(humF).connect(this.humG).connect(this.master);
    this.hum.start();
    const fan = this.loopSource(this.noiseBuf);
    const fanF = ctx.createBiquadFilter(); fanF.type = 'lowpass'; fanF.frequency.value = 700;
    this.fanG = ctx.createGain(); this.fanG.gain.value = 0.02;
    fan.connect(fanF).connect(this.fanG).connect(this.master);

    // announcement bus (in-car speaker colouring)
    this.annBus = ctx.createGain();
    this.annBus.gain.value = 1.0;
    const annHp = ctx.createBiquadFilter(); annHp.type = 'highpass'; annHp.frequency.value = 180;
    this.annBus.connect(annHp).connect(this.master);

    // departure melody bus: platform speaker heard from the train (echo + muffling in the cab)
    this.melBus = ctx.createGain();
    this.melBus.gain.value = 0.9;
    this.melFilter = ctx.createBiquadFilter(); this.melFilter.type = 'lowpass'; this.melFilter.frequency.value = 5000;
    const melDelay = ctx.createDelay(1.0); melDelay.delayTime.value = 0.19;
    const melFb = ctx.createGain(); melFb.gain.value = 0.28;
    const melWet = ctx.createGain(); melWet.gain.value = 0.35;
    this.melBus.connect(this.melFilter);
    this.melFilter.connect(this.master);
    this.melFilter.connect(melDelay); melDelay.connect(melFb).connect(melDelay); melDelay.connect(melWet).connect(this.master);

    this.ready = true;
  }

  setVehicle(veh) {
    this.veh = veh;
    if (this.traction) this.traction.port.postMessage({ type: 'config', sound: veh.sound });
  }

  makeNoise(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeBrown(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return b;
  }

  /** "タン": wheel hitting a rail joint – low thump + metallic click */
  makeJoint() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.32);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const thump = Math.sin(2 * Math.PI * (58 + 30 * Math.exp(-t * 30)) * t) * Math.exp(-t * 16) * 0.9;
      lp += ((Math.random() * 2 - 1) - lp) * 0.35;
      const click = lp * Math.exp(-t * 90) * 0.7;
      const ring = Math.sin(2 * Math.PI * 610 * t) * Math.exp(-t * 45) * 0.12 + Math.sin(2 * Math.PI * 1370 * t) * Math.exp(-t * 60) * 0.05;
      d[i] = thump + click + ring;
    }
    return b;
  }

  makeClick() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.06);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 160) * 0.8 + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 120) * 0.3;
    }
    return b;
  }

  loopSource(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.loopStart = Math.random() * 0.5;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  setInCab(inCab) {
    this.inCab = inCab;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.body.frequency.setTargetAtTime(inCab ? 2600 : 9000, t, 0.1);
    this.humG.gain.setTargetAtTime(inCab ? 0.012 : 0.0, t, 0.1);
    this.fanG.gain.setTargetAtTime(inCab ? 0.02 : 0.004, t, 0.1);
    if (this.melFilter) this.melFilter.frequency.setTargetAtTime(inCab ? 2400 : 7000, t, 0.1);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /**
   * per-frame update
   * st: { v (km/h), torque (-1..1), brake (0..1 effective air brake), curvature (1/m), stopped }
   */
  update(st) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const v = st.v;
    if (this.traction) this.traction.port.postMessage({ type: 'state', v, torque: st.torque });
    const k = Math.min(1, v / 120);
    this.rollG.gain.setTargetAtTime(v > 0.3 ? 0.10 + 0.55 * k : 0, t, 0.08);
    this.rollF.frequency.setTargetAtTime(160 + v * 6, t, 0.1);
    this.windG.gain.setTargetAtTime((this.inCab ? 0.05 : 0.12) * k * k, t, 0.1);
    this.windF.frequency.setTargetAtTime(500 + v * 10, t, 0.2);
    // flange squeal on tight curves at moderate speed
    const R = st.curvature ? 1 / Math.abs(st.curvature) : 1e9;
    const fl = R < 900 && v > 15 ? Math.min(1, (900 - R) / 500) * 0.02 : 0;
    this.flangeG.gain.setTargetAtTime(fl, t, 0.3);
    // brake squeal close to the stop
    const sq = st.brake > 0.05 && v > 0.2 && v < 9 ? Math.sin((v / 9) * Math.PI) * 0.03 * Math.min(1, st.brake * 2) : 0;
    this.squealG.gain.setTargetAtTime(sq, t, 0.05);
    // brake cylinder air
    if (st.brake > this.lastBrake + 0.12) { this.air(0.06, 0.25, 2500); this.lastBrake = st.brake; }
    else if (st.brake < this.lastBrake - 0.12) {
      this.air(st.brake < 0.02 ? 0.16 : 0.08, st.brake < 0.02 ? 0.9 : 0.4, 4200);
      this.lastBrake = st.brake;
    }
    // resistor control: cam shaft notching while powering
    if (this.veh && this.veh.sound.cam) {
      const step = st.torque > 0.05 && v < 55 ? Math.floor(v / 2.6) : 0;
      if (step > this.lastCamStep) this.playBuf(this.camBuf, 0.35, 0.95 + Math.random() * 0.1);
      this.lastCamStep = step;
    }
  }

  playBuf(buf, gain, rate = 1, when = 0, dest = this.body) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(dest);
    s.start(ctx.currentTime + Math.max(0, when));
  }

  /** wheel crossing a rail joint */
  joint(gain, speed) {
    if (!this.ready || this.muted) return;
    const g = gain * (0.25 + Math.min(1, speed / 90) * 0.9);
    this.playBuf(this.jointBuf, g, 0.9 + Math.random() * 0.15);
  }

  air(gain, dur, freq) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.setTargetAtTime(0, t + dur * 0.3, dur * 0.35);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur * 2 + 0.5);
  }

  /** JR East style door chime (3 two-tone pairs) */
  doorChime() {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      this.tone(1318.5, t0 + i * 0.62, 0.35, 0.09);
      this.tone(1046.5, t0 + i * 0.62 + 0.22, 0.45, 0.08);
    }
    return 1.9;
  }

  tone(f, when, dur, gain, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.master);
    o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }

  doorMove(open) {
    if (!this.ready) return;
    this.air(open ? 0.10 : 0.07, open ? 0.6 : 0.5, open ? 1800 : 1400);
    const ctx = this.ctx;
    setTimeout(() => this.playBuf(this.jointBuf, 0.25, 1.6, 0, this.master), open ? 900 : 1500);
    void ctx;
  }

  horn(on) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.hornNodes) {
      const tones = (this.veh && this.veh.sound.hornTones) || [466, 698];
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const oscs = tones.map((fr) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      f.connect(g).connect(this.master);
      this.hornNodes = { g, oscs };
    } else if (!on && this.hornNodes) {
      const { g, oscs } = this.hornNodes;
      g.gain.setTargetAtTime(0, t, 0.05);
      oscs.forEach((o) => o.stop(t + 0.4));
      this.hornNodes = null;
    }
  }

  /** ATS-P bell (continuous ringing while braking) */
  atsBell(on) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.bell) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1250;
      const am = ctx.createOscillator(); am.frequency.value = 22;
      const amG = ctx.createGain(); amG.gain.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.5;
      am.connect(amG).connect(g.gain);
      const out = ctx.createGain(); out.gain.value = 0.05;
      o.connect(g).connect(out).connect(this.master);
      o.start(); am.start();
      this.bell = { o, am, out };
    } else if (!on && this.bell) {
      this.bell.out.gain.setTargetAtTime(0, t, 0.03);
      this.bell.o.stop(t + 0.3); this.bell.am.stop(t + 0.3);
      this.bell = null;
    }
  }

  /** original placeholder departure jingle (used when no melody file is loaded) */
  fallbackMelody() {
    if (!this.ready) return 0;
    const t0 = this.ctx.currentTime + 0.05;
    const N = { D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, D6: 1174.7, E6: 1318.5 };
    const seq = ['E5', 'G5', 'A5', 'C6', 'A5', 'G5', 'E5', 'D5', 'E5', 'G5', 'C6', 'D6', 'E6', 'D6', 'C6', null];
    const step = 0.2;
    for (let r = 0; r < 2; r++) {
      seq.forEach((n, i) => {
        if (!n) return;
        const when = t0 + (r * seq.length + i) * step;
        this.marimba(N[n], when);
      });
    }
    return seq.length * step * 2 + 0.6;
  }

  marimba(f, when) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.08, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
    for (const [mul, a] of [[1, 1], [4, 0.25], [10, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = a;
      o.connect(og).connect(g);
      o.start(when); o.stop(when + 1.0);
    }
    g.connect(this.melBus);
  }

  /** short chime (pattern approach / info) */
  chime() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.5, 0.07);
    this.tone(1175, t + 0.18, 0.6, 0.06);
  }

  /** an oncoming train rushing past */
  passBy(intensity = 1) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35 * intensity, t + 0.15);
    g.gain.setValueAtTime(0.3 * intensity, t + 3.0);
    g.gain.linearRampToValueAtTime(0, t + 4.0);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + 4.2);
  }
}
