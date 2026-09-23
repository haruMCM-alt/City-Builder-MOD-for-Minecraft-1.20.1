// Synthesised sound (Web Audio): GEnx engines, airflow, gear rumble, touchdown,
// warnings and spoken callouts (speechSynthesis where available).
import { clamp, lerp } from './util.js';

const PHRASES = {
  v1: 'V one', rotate: 'Rotate', positive: 'Positive rate', ra2500: 'Two thousand five hundred',
  ra1000: 'One thousand', ra500: 'Five hundred', ra400: 'Four hundred', ra300: 'Three hundred', ra200: 'Two hundred',
  ra100: 'One hundred', ra50: 'Fifty', ra40: 'Forty', ra30: 'Thirty', ra20: 'Twenty', ra10: 'Ten',
  minimums_approach: 'Approaching minimums', minimums: 'Minimums', retard: 'Retard', flare: '',
  sinkRate: 'Sink rate', pullUp: 'Pull up', tooLowGear: 'Too low, gear', tooLowFlaps: 'Too low, flaps',
  bankAngle: 'Bank angle, bank angle', glideslope: 'Glide slope', ap_on: '', ap_off: '',
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastSay = {};
    this.queue = [];
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    // cockpit filter (engaged in the cockpit view)
    this.cabinLP = ctx.createBiquadFilter();
    this.cabinLP.type = 'lowpass'; this.cabinLP.frequency.value = 18000;
    this.cabinLP.connect(this.master);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2.5; }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
    this.eng = [0, 1].map((i) => {
      const roarF = ctx.createBiquadFilter(); roarF.type = 'lowpass'; roarF.frequency.value = 300;
      const roarG = ctx.createGain(); roarG.gain.value = 0;
      noise().connect(roarF); roarF.connect(roarG);
      const whine = ctx.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 400;
      const whineF = ctx.createBiquadFilter(); whineF.type = 'bandpass'; whineF.Q.value = 6; whineF.frequency.value = 800;
      const whineG = ctx.createGain(); whineG.gain.value = 0;
      whine.connect(whineF); whineF.connect(whineG); whine.start();
      const buzz = ctx.createOscillator(); buzz.type = 'square'; buzz.frequency.value = 60;
      const buzzF = ctx.createBiquadFilter(); buzzF.type = 'lowpass'; buzzF.frequency.value = 400;
      const buzzG = ctx.createGain(); buzzG.gain.value = 0;
      buzz.connect(buzzF); buzzF.connect(buzzG); buzz.start();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (pan.pan) pan.pan.value = i === 0 ? -0.35 : 0.35;
      roarG.connect(pan); whineG.connect(pan); buzzG.connect(pan);
      pan.connect(this.cabinLP);
      return { roarF, roarG, whine, whineF, whineG, buzz, buzzG };
    });
    // wind
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 700; this.windF.Q.value = 0.5;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    noise().connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    // rumble
    this.rumbleF = ctx.createBiquadFilter(); this.rumbleF.type = 'lowpass'; this.rumbleF.frequency.value = 110;
    this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0;
    noise().connect(this.rumbleF); this.rumbleF.connect(this.rumbleG); this.rumbleG.connect(this.master);
    // stick shaker / warnings
    this.shakerG = ctx.createGain(); this.shakerG.gain.value = 0;
    const sh = ctx.createOscillator(); sh.type = 'square'; sh.frequency.value = 28;
    const shF = ctx.createBiquadFilter(); shF.type = 'lowpass'; shF.frequency.value = 220;
    sh.connect(shF); shF.connect(this.shakerG); this.shakerG.connect(this.master); sh.start();
    this.clackG = ctx.createGain(); this.clackG.gain.value = 0;
    const cl = ctx.createOscillator(); cl.type = 'square'; cl.frequency.value = 9;
    const clF = ctx.createBiquadFilter(); clF.type = 'highpass'; clF.frequency.value = 1200;
    cl.connect(clF); clF.connect(this.clackG); this.clackG.connect(this.master); cl.start();
    this.noiseBuf = noiseBuf;
  }

  tone(freqs, dur = 0.25, gain = 0.12, type = 'sine') {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    g.connect(this.master);
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      o.connect(g); o.start(); o.stop(ctx.currentTime + dur + 0.05);
    }
  }

  thump(strength) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(clamp(strength, 0.1, 1.2), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(); s.stop(ctx.currentTime + 0.6);
    // tyre chirp
    const s2 = ctx.createBufferSource(); s2.buffer = this.noiseBuf;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2400; f2.Q.value = 3;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.25, ctx.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    s2.connect(f2); f2.connect(g2); g2.connect(this.master);
    s2.start(); s2.stop(ctx.currentTime + 0.4);
  }

  say(key, force = false) {
    const phrase = PHRASES[key];
    const now = performance.now();
    if (!force && this.lastSay[key] && now - this.lastSay[key] < 2600) return;
    this.lastSay[key] = now;
    if (key === 'ap_off') { this.wailer(); return; }
    if (key === 'ap_on') { this.tone([660], 0.15, 0.06); return; }
    if (!phrase || !this.enabled) return;
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(phrase);
      u.rate = 1.15; u.pitch = 0.85; u.volume = 0.9; u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    } else this.tone([900, 1200], 0.2, 0.05);
  }

  wailer() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const g = ctx.createGain(); g.gain.value = 0.08;
    o.frequency.setValueAtTime(700, ctx.currentTime);
    for (let i = 0; i < 6; i++) {
      o.frequency.linearRampToValueAtTime(1100, ctx.currentTime + i * 0.3 + 0.15);
      o.frequency.linearRampToValueAtTime(700, ctx.currentTime + i * 0.3 + 0.3);
    }
    o.connect(g); g.connect(this.master); o.start(); o.stop(ctx.currentTime + 1.8);
  }

  update(dt, fm, sys, view, camDist) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    const inside = view === 'cockpit' || view === 'wing';
    const ext = inside ? 0.35 : clamp(1 / (1 + Math.max(camDist - 60, 0) / 250), 0.03, 1);
    this.cabinLP.frequency.setTargetAtTime(inside ? (view === 'wing' ? 2500 : 1300) : 18000, t, 0.2);
    for (let i = 0; i < 2; i++) {
      const e = fm.engines[i], E = this.eng[i];
      const n = clamp(e.n1 / 100, 0, 1.05);
      E.roarF.frequency.setTargetAtTime(180 + 2600 * n * n, t, 0.1);
      E.roarG.gain.setTargetAtTime(on * ext * (0.05 + 0.55 * n * n * n), t, 0.1);
      const f = 90 + 7.2 * e.n1;
      E.whine.frequency.setTargetAtTime(f, t, 0.1);
      E.whineF.frequency.setTargetAtTime(f * 2.1, t, 0.1);
      E.whineG.gain.setTargetAtTime(on * ext * (0.012 + 0.05 * n), t, 0.1);
      E.buzz.frequency.setTargetAtTime(22 + 0.9 * e.n1, t, 0.1);
      E.buzzG.gain.setTargetAtTime(on * ext * Math.max(0, n - 0.72) * 0.25, t, 0.1);
    }
    const ias = fm.out.ias || 0;
    this.windG.gain.setTargetAtTime(on * clamp(ias / 320, 0, 1.3) ** 2 * (inside ? 0.16 : 0.08 * ext), t, 0.2);
    this.windF.frequency.setTargetAtTime(400 + ias * 3, t, 0.2);
    const rumble = fm.out.wow ? clamp(fm.out.gs / 120, 0, 1) : 0;
    const gearTransit = fm.ctl.gearPos > 0.01 && fm.ctl.gearPos < 0.99 ? 0.15 : 0;
    this.rumbleG.gain.setTargetAtTime(on * (rumble * 0.5 + gearTransit + (fm.ctl.groundSpoiler > 0.5 ? 0.05 : 0)), t, 0.1);
    this.shakerG.gain.setTargetAtTime(on * (sys.warn.stall ? 0.25 : 0), t, 0.03);
    this.clackG.gain.setTargetAtTime(on * (sys.warn.overspeed ? 0.08 : 0), t, 0.03);
    // GPWS
    const W = sys.warn;
    for (const k of ['pullUp', 'sinkRate', 'tooLowGear', 'tooLowFlaps', 'bankAngle', 'glideslope']) {
      if (W[k]) { this.say(k); break; }
    }
    if (W.config && (!this._cfg || performance.now() - this._cfg > 1500)) { this._cfg = performance.now(); this.tone([880, 1320], 0.35, 0.08); }
    while (sys.callouts.length) this.say(sys.callouts.shift(), true);
  }
}
