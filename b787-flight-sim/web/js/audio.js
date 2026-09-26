// Synthesised sound (Web Audio) for the 787-9 / GE GEnx-1B.
//
// Each engine is built from the physical noise sources of a high-bypass turbofan:
//   * fan blade-passing tone   18 blades x N1 shaft rate (~770 Hz at 100 % N1) + harmonics,
//                              radiated forwards out of the inlet
//   * buzzsaw                  at high N1 the fan tips go supersonic: a rough multi-tone
//                              drone at every multiple of the shaft rate (forward arc)
//   * core compressor whine    high-pitched N2 tone, the characteristic idle "whistle"
//   * jet mixing roar          broadband low/mid roar, loudest ~140 deg off the nose (aft arc)
//   * crackle                  sparse impulsive bursts at high thrust (aft)
//   * low rumble               combustion / structure-borne
// The listener position then shapes it: front/aft directivity, distance attenuation and
// air absorption, Doppler shift, stereo placement per engine, and muffled cabin views.
import { clamp, lerp, smoothstep } from './util.js';

const PHRASES = {
  v1: 'V one', rotate: 'Rotate', positive: 'Positive rate', ra2500: 'Two thousand five hundred',
  ra1000: 'One thousand', ra500: 'Five hundred', ra400: 'Four hundred', ra300: 'Three hundred', ra200: 'Two hundred',
  ra100: 'One hundred', ra50: 'Fifty', ra40: 'Forty', ra30: 'Thirty', ra20: 'Twenty', ra10: 'Ten',
  minimums_approach: 'Approaching minimums', minimums: 'Minimums', retard: 'Retard', flare: '',
  sinkRate: 'Sink rate', pullUp: 'Pull up', tooLowGear: 'Too low, gear', tooLowFlaps: 'Too low, flaps',
  bankAngle: 'Bank angle, bank angle', glideslope: 'Glide slope', ap_on: '', ap_off: '',
};

// engine type (set when the aircraft type changes): N1 100 % shaft rate and fan blade count
// GEnx-1B ~2560 rpm / 18 blades, CFM56-7B 5380 rpm / 24, CF6-80C2 3280 rpm / 38
export const ENGINE_SOUND = { shaftHz: 2560 / 60, blades: 18 };
export function setEngineSound(type) {
  const T = { b789: [2560, 18], b738: [5380, 24], b763: [3280, 38] }[type] || [2560, 18];
  ENGINE_SOUND.shaftHz = T[0] / 60; ENGINE_SOUND.blades = T[1];
}
const TONE_SCALE = 0.62;
const C_SOUND = 340;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastSay = {};
    this._dist = 0;
  }

  // ---------------------------------------------------------------- setup
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const sr = ctx.sampleRate;
    // output: compressor glues the layers, master volume
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    // engine bus: air absorption (distance) + cabin filtering
    this.engBus = ctx.createGain();
    this.airLP = ctx.createBiquadFilter(); this.airLP.type = 'lowpass'; this.airLP.frequency.value = 18000; this.airLP.Q.value = 0.5;
    this.cabinLP = ctx.createBiquadFilter(); this.cabinLP.type = 'lowpass'; this.cabinLP.frequency.value = 20000; this.cabinLP.Q.value = 0.6;
    this.cabinLP2 = ctx.createBiquadFilter(); this.cabinLP2.type = 'lowpass'; this.cabinLP2.frequency.value = 20000; this.cabinLP2.Q.value = 0.6;
    // overall voicing: softer highs, fuller lows
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 2200; hs.gain.value = -7;
    const ls = ctx.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 160; ls.gain.value = 4;
    this.engBus.connect(hs); hs.connect(ls); ls.connect(this.airLP); this.airLP.connect(this.cabinLP); this.cabinLP.connect(this.cabinLP2); this.cabinLP2.connect(this.master);

    // noise buffers (white, pink, brown, crackle), 4 s loops
    const len = sr * 4;
    const mk = (fill) => { const b = ctx.createBuffer(1, len, sr); fill(b.getChannelData(0)); return b; };
    const rnd = seeded(787);
    this.white = mk((d) => { for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1; });
    this.pink = mk((d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    });
    this.brown = mk((d) => { let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.crackle = mk((d) => {
      // sparse random bursts: jet crackle (shock-associated impulsive noise)
      let env = 0;
      for (let i = 0; i < len; i++) {
        if (rnd() < 60 / sr) env = 0.4 + rnd() * 0.6;
        env *= 0.9965;
        d[i] = (rnd() * 2 - 1) * env;
      }
    });
    this.noise = (buf, offset = 0) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, offset % 4); return s;
    };

    this.eng = [0, 1].map((i) => this._buildEngine(i));

    // --- airframe / cockpit sounds (not through the engine bus) ---------------------------
    const bp = (f, q) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
    const lp = (f) => { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; return b; };
    const hp = (f) => { const b = ctx.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = f; return b; };
    const chain = (src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } return n; };
    // slipstream (airflow over the nose / windshield)
    this.windF = bp(900, 0.6); this.windG = ctx.createGain(); this.windG.gain.value = 0;
    chain(this.noise(this.pink, 1.3), this.windF, this.windG, this.master);
    this.windLowF = lp(260); this.windLowG = ctx.createGain(); this.windLowG.gain.value = 0;
    chain(this.noise(this.brown, 2.1), this.windLowF, this.windLowG, this.master);
    // gear / spoiler buffeting
    this.buffetF = bp(180, 0.8); this.buffetG = ctx.createGain(); this.buffetG.gain.value = 0;
    chain(this.noise(this.brown, 0.4), this.buffetF, this.buffetG, this.master);
    // air-conditioning packs (constant cockpit hiss)
    this.packG = ctx.createGain(); this.packG.gain.value = 0;
    chain(this.noise(this.pink, 3.1), hp(1800), lp(7000), this.packG, this.master);
    // tyre / runway rumble
    this.rumbleF = lp(120); this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0;
    chain(this.noise(this.brown, 1.7), this.rumbleF, this.rumbleG, this.master);
    // hydraulic motor whine (flaps / gear in transit)
    this.hydOsc = ctx.createOscillator(); this.hydOsc.type = 'triangle'; this.hydOsc.frequency.value = 390;
    this.hydG = ctx.createGain(); this.hydG.gain.value = 0;
    chain(this.hydOsc, bp(390, 4), this.hydG, this.master); this.hydOsc.start();
    // stick shaker (motor rattle) and overspeed clacker
    this.shakerG = ctx.createGain(); this.shakerG.gain.value = 0;
    const sh = ctx.createOscillator(); sh.type = 'square'; sh.frequency.value = 26;
    chain(sh, lp(240), this.shakerG, this.master); sh.start();
    this.clackG = ctx.createGain(); this.clackG.gain.value = 0;
    const cl = ctx.createOscillator(); cl.type = 'square'; cl.frequency.value = 9;
    chain(cl, hp(1200), this.clackG, this.master); cl.start();
    // rain: hiss outside, drumming on the skin / windshield inside
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    chain(this.noise(this.white, 2.7), hp(1100), lp(8000), this.rainG, this.master);
    this.rainDrumG = ctx.createGain(); this.rainDrumG.gain.value = 0;
    chain(this.noise(this.crackle, 3.3), bp(420, 0.7), this.rainDrumG, this.master);
    // other aircraft (AI traffic): distant jet roar and fan whine
    this.trafG = ctx.createGain(); this.trafG.gain.value = 0;
    this.trafLP = lp(420);
    chain(this.noise(this.brown, 0.9), this.trafLP, this.trafG, this.master);
    this.trafWhineG = ctx.createGain(); this.trafWhineG.gain.value = 0;
    const tw = ctx.createOscillator(); tw.type = 'triangle'; tw.frequency.value = 2350;
    const tw2 = ctx.createOscillator(); tw2.type = 'sine'; tw2.frequency.value = 2390;
    const twb = bp(2370, 6);
    tw.connect(twb); tw2.connect(twb); twb.connect(this.trafWhineG); this.trafWhineG.connect(this.master);
    tw.start(); tw2.start();
    this._travel = 0;
    this._gearPrev = null;
  }

  _buildEngine(i) {
    const ctx = this.ctx;
    const r = seeded(100 + i * 17);
    const E = {};
    E.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    E.pan.connect(this.engBus);
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    // ---- fan blade-passing tone (BPF, 2xBPF, 3xBPF) with slight "breath" -------------------
    const real = new Float32Array(5), imag = new Float32Array(5);
    imag[1] = 1; imag[2] = 0.28; imag[3] = 0.07; imag[4] = 0.02;
    E.fan = ctx.createOscillator();
    E.fan.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    E.fanG = gain();
    E.fan.connect(E.fanG); E.fanG.connect(E.pan); E.fan.start();
    // tone wobble (turbulent inflow)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1 + i * 0.7;
    const lfoG = gain(6); lfo.connect(lfoG); lfoG.connect(E.fan.detune); lfo.start();
    // narrow-band noise around the BPF (tone "haze")
    E.fanNoiseF = filt('bandpass', 450, 2.5);
    E.fanNoiseG = gain();
    this.noise(this.white, 0.5 + i).connect(E.fanNoiseF); E.fanNoiseF.connect(E.fanNoiseG); E.fanNoiseG.connect(E.pan);
    // ---- buzzsaw: multiple pure tones at shaft orders (supersonic fan tips) ----------------
    const N = 48;
    const bre = new Float32Array(N + 1), bim = new Float32Array(N + 1);
    for (let k = 1; k <= N; k++) {
      // irregular amplitudes: blade-to-blade differences give the rough "saw" timbre
      const env = Math.exp(-Math.pow((k - 7) / 7, 2)) + 0.3 / k;
      bim[k] = env * (0.35 + 0.65 * r());
      bre[k] = env * (r() - 0.5) * 0.6;
    }
    E.buzz = ctx.createOscillator();
    E.buzz.setPeriodicWave(ctx.createPeriodicWave(bre, bim));
    E.buzzLP = filt('lowpass', 3000, 0.5);
    E.buzzG = gain();
    E.buzz.connect(E.buzzLP); E.buzzLP.connect(E.buzzG); E.buzzG.connect(E.pan); E.buzz.start();
    // ---- core compressor whine (two close tones + hiss) --------------------------------------
    E.core1 = ctx.createOscillator(); E.core1.type = 'sine';
    E.core2 = ctx.createOscillator(); E.core2.type = 'sine';
    E.coreG = gain();
    E.core1.connect(E.coreG); E.core2.connect(E.coreG); E.coreG.connect(E.pan);
    E.core1.start(); E.core2.start();
    E.coreNoiseF = filt('bandpass', 2000, 3);
    E.coreNoiseG = gain();
    this.noise(this.white, 1.9 + i).connect(E.coreNoiseF); E.coreNoiseF.connect(E.coreNoiseG); E.coreNoiseG.connect(E.pan);
    // ---- jet roar (pink noise, low-pass + low-mid body) --------------------------------------
    E.jetSrc = this.noise(this.pink, 0.8 + i * 1.3);
    E.jetLP = filt('lowpass', 600, 0.4);
    E.jetBody = filt('peaking', 110, 0.7); E.jetBody.gain.value = 9;
    E.jetG = gain();
    E.jetSrc.connect(E.jetLP); E.jetLP.connect(E.jetBody); E.jetBody.connect(E.jetG); E.jetG.connect(E.pan);
    // ---- crackle -----------------------------------------------------------------------------
    E.crkSrc = this.noise(this.crackle, 1.1 + i * 0.9);
    E.crkF = filt('bandpass', 900, 0.8);
    E.crkG = gain();
    E.crkSrc.connect(E.crkF); E.crkF.connect(E.crkG); E.crkG.connect(E.pan);
    // ---- low rumble --------------------------------------------------------------------------
    E.rumSrc = this.noise(this.brown, 2.4 + i);
    E.rumLP = filt('lowpass', 110, 0.7);
    E.rumG = gain();
    E.rumSrc.connect(E.rumLP); E.rumLP.connect(E.rumG); E.rumG.connect(E.pan);
    return E;
  }

  suspend() { if (this.ctx) this.ctx.suspend(); }

  // ---------------------------------------------------------------- one-shots
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

  burst(buf, freq, q, gain, dur, type = 'lowpass') {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
  }

  // ---- alarms: fire bell and master warning (repeat until switched off) ---------------
  setAlarm(kind, on) {
    this._alarms = this._alarms || {};
    const A = this._alarms;
    if (!!A[kind] === !!on) return;
    if (!on) { clearInterval(A[kind]); A[kind] = null; return; }
    const strike = () => {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      if (kind === 'fire') {
        // classic fire bell: inharmonic partials, fast decay, ~3 strikes per second
        for (const [f, g] of [[880, 0.16], [2420, 0.08], [4750, 0.04]]) {
          const o = ctx.createOscillator(), gg = ctx.createGain();
          o.frequency.value = f; gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
          o.connect(gg); gg.connect(this.master); o.start(t); o.stop(t + 0.32);
        }
      } else {
        // master warning: two-tone chime
        [[1150, 0], [760, 0.18]].forEach(([f, dt]) => {
          const o = ctx.createOscillator(), gg = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          gg.gain.setValueAtTime(0.0001, t + dt); gg.gain.linearRampToValueAtTime(0.12, t + dt + 0.02); gg.gain.exponentialRampToValueAtTime(0.0005, t + dt + 0.35);
          o.connect(gg); gg.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.4);
        });
      }
    };
    strike();
    A[kind] = setInterval(strike, kind === 'fire' ? 330 : 1100);
  }

  stopAlarms() { for (const k of Object.keys(this._alarms || {})) this.setAlarm(k, false); }

  // structural impact: metallic crunch
  crunch(strength = 1) {
    if (!this.ctx) return;
    this.burst(this.brown, 220, 0.8, 1.2 * strength, 0.9);
    this.burst(this.crackle, 1800, 1.5, 0.5 * strength, 0.7, 'bandpass');
    this.burst(this.white, 4200, 2, 0.25 * strength, 0.4, 'bandpass');
  }

  // explosion: deep boom with a long rumbling tail and debris clatter
  explosion(power = 1) {
    if (!this.ctx) return;
    this.burst(this.brown, 90, 0.6, 2.2 * power, 3.5);
    this.burst(this.brown, 300, 0.7, 1.4 * power, 1.4);
    this.burst(this.crackle, 1200, 1.0, 0.8 * power, 2.4, 'bandpass');
    setTimeout(() => this.burst(this.crackle, 2600, 1.2, 0.35, 3.0, 'bandpass'), 400);
  }

  // continuous fire roar (0..1)
  setFire(level) {
    if (!this.ctx) return;
    if (!this.fireG) {
      const ctx = this.ctx;
      this.fireG = ctx.createGain(); this.fireG.gain.value = 0;
      const src = this.noise(this.brown, 1.1), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      const src2 = this.noise(this.crackle, 0.8), f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 0.8;
      src.connect(f); f.connect(this.fireG); src2.connect(f2); f2.connect(this.fireG); this.fireG.connect(this.master);
    }
    this.fireG.gain.setTargetAtTime(this.enabled ? level * 0.5 : 0, this.ctx.currentTime, 0.3);
  }

  thump(strength) {
    if (!this.ctx) return;
    this.burst(this.brown, 140, 0.7, clamp(strength, 0.1, 1.2) * 1.4, 0.55);
    this.burst(this.white, 2300, 3, 0.22 * clamp(strength, 0.3, 1), 0.35, 'bandpass');   // tyre chirp
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

  // ---------------------------------------------------------------- per frame
  // listener: { view, camPos (THREE.Vector3), camRight (THREE.Vector3), engines: [pos, pos], fwd, vel }
  update(dt, fm, sys, L) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    const set = (p, v, tc = 0.08) => p.setTargetAtTime(v, t, tc);
    const view = L.view;
    const inside = view === 'cockpit';
    const cabin = view === 'wing' || view === 'ife' || view === 'cabin' || view === 'walk';
    // ---- listener geometry -------------------------------------------------------------------
    const ac = L.acPos;
    const dx = L.camPos.x - ac.x, dy = L.camPos.y - ac.y, dz = L.camPos.z - ac.z;
    const dist = Math.max(Math.hypot(dx, dy, dz), 1);
    const ux = dx / dist, uy = dy / dist, uz = dz / dist;
    // directivity: +1 listener ahead of the nose, -1 behind
    const front = inside || cabin ? 0.2 : L.fwd.x * ux + L.fwd.y * uy + L.fwd.z * uz;
    const fanDir = 0.25 + 0.75 * smoothstep(-0.6, 0.8, front);
    const jetDir = 0.3 + 1.1 * smoothstep(0.3, -0.75, front);   // jet noise peaks ~140 deg off the nose
    // Doppler: velocity of the source towards the listener
    const vr = inside || cabin ? 0 : (fm.vel.x * ux + fm.vel.y * uy + fm.vel.z * uz);
    const dop = clamp(C_SOUND / (C_SOUND - clamp(vr, -150, 150)), 0.6, 1.8);
    // distance (spherical spreading, a 787 at 60 m ~ full scale) and air absorption
    const spread = inside || cabin ? 1 : clamp(60 / dist, 0.004, 1.4);
    set(this.airLP.frequency, inside || cabin ? 18000 : clamp(18000 * Math.exp(-dist / 900), 600, 18000), 0.2);
    // cabin filtering: flight deck is far from the engines and well insulated
    set(this.cabinLP.frequency, inside ? 520 : cabin ? 1500 : 20000, 0.2);
    set(this.cabinLP2.frequency, inside ? 900 : cabin ? 2600 : 20000, 0.2);
    const cabinGain = inside ? 0.55 : cabin ? 0.85 : 1;
    set(this.engBus.gain, on * spread * cabinGain, 0.1);

    for (let i = 0; i < 2; i++) {
      const e = fm.engines[i], E = this.eng[i];
      const n1 = clamp(e.n1 / 100, 0, 1.05), n2 = clamp(e.n2 / 100, 0, 1.05);
      // tonal parts are voiced a little below the physical values: at a real airport the
      // fan tones are masked by broadband roar and the ear hears a deep, rounded sound
      const shaft = ENGINE_SOUND.shaftHz * n1 * dop * TONE_SCALE * (ENGINE_SOUND.blades === 18 ? 1 : 0.8);
      const bpf = shaft * ENGINE_SOUND.blades;
      const thrust = clamp(Math.abs(e.thrust) / 330000, 0, 1.1);
      const rev = e.reverse;
      // stereo placement from the engine position relative to the camera
      if (E.pan.pan) {
        const p = L.engines[i];
        const rx = p.x - L.camPos.x, ry = p.y - L.camPos.y, rz = p.z - L.camPos.z;
        const rl = Math.max(Math.hypot(rx, ry, rz), 1);
        const pan = (rx * L.camRight.x + ry * L.camRight.y + rz * L.camRight.z) / rl;
        set(E.pan.pan, clamp(pan * (inside ? 0.5 : 0.9), -1, 1), 0.1);
      }
      // cabin window view is next to the left engine
      const near = cabin ? (i === 0 ? 1.6 : 0.55) : 1;
      // fan tone
      set(E.fan.frequency, bpf, 0.05);
      set(E.fanG.gain, on * near * fanDir * (0.006 + 0.03 * n1 * n1), 0.08);
      set(E.fanNoiseF.frequency, bpf * 0.8, 0.05);
      set(E.fanNoiseG.gain, on * near * fanDir * 0.12 * n1 * n1, 0.08);
      // buzzsaw above ~78 % N1
      set(E.buzz.frequency, shaft, 0.05);
      set(E.buzzLP.frequency, 450 + 1300 * n1, 0.1);
      set(E.buzzG.gain, on * near * fanDir * 0.11 * smoothstep(0.76, 0.96, n1), 0.1);
      // core whine: loudest (relatively) at idle, the classic GEnx whistle
      const cf = (1150 + 1500 * n2) * dop;
      set(E.core1.frequency, cf, 0.08);
      set(E.core2.frequency, cf * 1.018, 0.08);
      set(E.coreG.gain, on * near * (0.3 + 0.7 * fanDir) * (0.004 + 0.004 * n2), 0.1);
      set(E.coreNoiseF.frequency, cf * 1.2, 0.08);
      set(E.coreNoiseG.gain, on * near * 0.03 * n2, 0.1);
      // jet roar grows with thrust; reversers throw it forwards
      const jet = Math.pow(thrust, 1.25) + rev * 0.5;
      E.jetSrc.playbackRate.setTargetAtTime(dop, t, 0.1);
      set(E.jetLP.frequency, 220 + 1100 * Math.min(jet, 1) * (inside ? 0.5 : 1), 0.12);
      set(E.jetG.gain, on * near * (jetDir + rev * 0.8) * (0.02 + 0.55 * jet), 0.12);
      // crackle at high thrust, aft
      E.crkSrc.playbackRate.setTargetAtTime(dop, t, 0.1);
      set(E.crkG.gain, on * near * jetDir * 0.35 * smoothstep(0.6, 1.0, thrust), 0.12);
      // rumble
      set(E.rumG.gain, on * near * (0.16 + 0.65 * n1) * (inside ? 1.6 : 1), 0.1);
    }

    // ---- AI traffic ----------------------------------------------------------------------------------
    const tr = L.traffic;
    const muff = inside ? 0.25 : cabin ? 0.4 : 1;
    set(this.trafG.gain, on * (tr ? tr.roar * 0.45 * muff : 0), 0.25);
    set(this.trafLP.frequency, 260 + (tr ? Math.min(tr.roar, 1) * 700 : 0) * (inside ? 0.4 : 1), 0.3);
    set(this.trafWhineG.gain, on * (tr ? tr.whine * 0.006 * muff * muff : 0), 0.25);

    // ---- rain ------------------------------------------------------------------------------------
    const rain = L.rain || 0;
    set(this.rainG.gain, on * rain * (inside ? 0.05 : cabin ? 0.06 : 0.14) * (1 + Math.min(fm.out.ias || 0, 200) / 400), 0.4);
    set(this.rainDrumG.gain, on * rain * (inside ? 0.35 : cabin ? 0.25 : 0.05), 0.4);

    // ---- airframe ------------------------------------------------------------------------------
    const ias = fm.out.ias || 0;
    const q = clamp(ias / 250, 0, 1.6);
    set(this.windF.frequency, 500 + ias * 3.2, 0.2);
    set(this.windG.gain, on * q * q * (inside ? 0.28 : cabin ? 0.12 : 0.05 * spread), 0.2);
    set(this.windLowG.gain, on * q * q * (inside ? 0.35 : cabin ? 0.2 : 0.04 * spread), 0.2);
    const gearOut = 1 - fm.ctl.gearPos;
    const buffet = (gearOut * 0.6 + fm.ctl.speedbrake * 0.8 + fm.ctl.groundSpoiler * 0.5) * q * q;
    set(this.buffetG.gain, on * buffet * (inside ? 0.25 : cabin ? 0.3 : 0.12 * spread), 0.2);
    set(this.packG.gain, on * (inside ? 0.035 : cabin ? 0.02 : 0), 0.3);
    // ground roll: continuous rumble + centreline light thumps every 15 m under the nose gear
    const wow = fm.out.wow;
    const gs = (fm.out.gs || 0) * 0.5144;
    set(this.rumbleG.gain, on * (wow ? clamp(gs / 60, 0, 1) * (inside ? 0.55 : 0.35 * spread + 0.1) : 0), 0.1);
    set(this.rumbleF.frequency, 70 + gs * 1.5, 0.1);
    if (wow && gs > 3 && fm.gear[0].onGround) {
      this._travel += gs * dt;
      if (this._travel > 15) { this._travel = 0; this.burst(this.brown, 110, 0.9, (inside ? 0.35 : 0.15) * clamp(gs / 40, 0.2, 1) * on, 0.18); }
    }
    // hydraulics: flaps / gear in transit
    const flapsMoving = Math.abs(fm.ctl.flapAngle - (this._flapPrev ?? fm.ctl.flapAngle)) > 1e-4;
    this._flapPrev = fm.ctl.flapAngle;
    const gearMoving = fm.ctl.gearPos > 0.005 && fm.ctl.gearPos < 0.995;
    set(this.hydG.gain, on * (flapsMoving || gearMoving ? (inside ? 0.02 : 0.008) : 0), 0.15);
    // gear up / down lock clunks
    const gl = fm.ctl.gearPos <= 0.001 ? 'down' : fm.ctl.gearPos >= 0.999 ? 'up' : 'transit';
    if (this._gearPrev === 'transit' && gl !== 'transit') this.burst(this.brown, 160, 1, (inside ? 0.6 : 0.3) * on, 0.4);
    this._gearPrev = gl;
    // warnings
    set(this.shakerG.gain, on * (sys.warn.stall ? 0.25 : 0), 0.03);
    set(this.clackG.gain, on * (sys.warn.overspeed ? 0.08 : 0), 0.03);
    const W = sys.warn;
    for (const k of ['pullUp', 'sinkRate', 'tooLowGear', 'tooLowFlaps', 'bankAngle', 'glideslope']) {
      if (W[k]) { this.say(k); break; }
    }
    if (W.config && (!this._cfg || performance.now() - this._cfg > 1500)) { this._cfg = performance.now(); this.tone([880, 1320], 0.35, 0.08); }
    while (sys.callouts.length) this.say(sys.callouts.shift(), true);
  }
}
