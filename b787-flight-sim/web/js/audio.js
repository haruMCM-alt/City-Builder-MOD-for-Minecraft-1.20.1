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
// The listener position then shapes it:
//   * propagation delay (distance / c) in a delay line: the Doppler shift of every component
//     follows from the changing delay, and a fly-over is heard from where the aircraft was
//   * ground reflection: a second, later and duller path - the sweeping comb filter gives the
//     characteristic "flanging" of a passing or taxiing jet
//   * atmospheric turbulence: slow level fluctuations that grow with distance
//   * front / aft directivity, spherical spreading, frequency-dependent air absorption,
//     outdoor reverberation near the ground, stereo placement per engine
//   * the two engines never run at exactly the same speed: their tones beat slowly
//   * transients: surge bang on a flame-out, ignitor ticks and light-off on a relight,
//     reverser doors, APU at the gate
// Inside, the flight deck / cabin filtering takes over.
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
// MA-300 MX-1G geared fan ~3300 rpm / 18, MA-700 MX-9 ~2500 / 16, MA-900 MX-6 (x4) ~3400 / 18
// 747-400 CF6-80C2B5F (x4) 3280 / 38; MA-W8 MX-2 turbofan (x8) ~3600 / 18; ATR 72-600 PW127M: propeller 1200 rpm (Np 100 %), 6 blades
// size: take-off thrust relative to the GEnx (a bigger engine is louder, and its roar deeper);
// four-engine types: thrustSL is per side (two engines), the size is that of one engine
// prop: the 120 Hz blade-passing drone and its harmonics replace most of the jet roar
export const ENGINE_SOUND = { shaftHz: 2560 / 60, blades: 18, thrust: 329600, size: 1, prop: false, perSide: 1 };
export function setEngineSound(type, thrustSL, engineCount = 2, prop = false) {
  const T = { b789: [2560, 18], b738: [5380, 24], b763: [3280, 38], ma3: [3300, 18], ma7: [2500, 16], ma9: [3400, 18],
    b744: [3280, 38], at76: [1200, 6], maw: [3600, 18] }[type] || [2560, 18];
  ENGINE_SOUND.shaftHz = T[0] / 60; ENGINE_SOUND.blades = T[1];
  ENGINE_SOUND.thrust = thrustSL || 329600;
  ENGINE_SOUND.perSide = Math.max(1, engineCount / 2);
  ENGINE_SOUND.size = ENGINE_SOUND.thrust / ENGINE_SOUND.perSide / 329600;
  ENGINE_SOUND.prop = !!prop;
}
// soft-clipping curve: adds harmonics to the low end so the body of the roar is heard (and
// felt) even on small speakers that cannot reproduce 40 Hz
function saturator(ctx, drive) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  const w = ctx.createWaveShaper(); w.curve = c; w.oversample = '2x';
  return w;
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
    // bus compressor (glue, slow release keeps the roar dense) + make-up gain + a brick-wall
    // limiter: louder and thicker without clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.015; comp.release.value = 0.35;
    const makeup = ctx.createGain(); makeup.gain.value = 1.45;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    this.master.connect(comp); comp.connect(makeup); makeup.connect(lim); lim.connect(ctx.destination);
    // engine bus: air absorption (distance) + cabin filtering
    this.engBus = ctx.createGain();
    this.airLP = ctx.createBiquadFilter(); this.airLP.type = 'lowpass'; this.airLP.frequency.value = 18000; this.airLP.Q.value = 0.5;
    this.cabinLP = ctx.createBiquadFilter(); this.cabinLP.type = 'lowpass'; this.cabinLP.frequency.value = 20000; this.cabinLP.Q.value = 0.6;
    this.cabinLP2 = ctx.createBiquadFilter(); this.cabinLP2.type = 'lowpass'; this.cabinLP2.frequency.value = 20000; this.cabinLP2.Q.value = 0.6;
    // overall voicing: softer highs, fuller lows
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 2200; hs.gain.value = -7;
    const ls = ctx.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 160; ls.gain.value = 4;
    // parallel saturation of the low end: density and "chest" of the roar
    this.satIn = ctx.createBiquadFilter(); this.satIn.type = 'lowpass'; this.satIn.frequency.value = 320;
    this.sat = saturator(ctx, 3.2);
    this.satOut = ctx.createBiquadFilter(); this.satOut.type = 'lowpass'; this.satOut.frequency.value = 1400;
    this.satG = ctx.createGain(); this.satG.gain.value = 0.55;
    this.satLS = ls;
    this.engBus.connect(this.satIn); this.satIn.connect(this.sat); this.sat.connect(this.satOut); this.satOut.connect(this.satG); this.satG.connect(ls);
    this.engBus.connect(hs); hs.connect(ls); ls.connect(this.airLP); this.airLP.connect(this.cabinLP); this.cabinLP.connect(this.cabinLP2); this.cabinLP2.connect(this.master);
    // outdoor reverberation (terminal / hangar walls, the ground): synthetic stereo impulse
    // response - sparse early reflections, then a diffuse exponential tail
    this.verb = ctx.createConvolver();
    {
      const n = Math.floor(sr * 2.6), ir = ctx.createBuffer(2, n, sr), rr = seeded(4242);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let k = 0; k < 14; k++) {
          const at = Math.floor(sr * (0.018 + rr() * 0.16)), g = (0.5 + rr() * 0.5) * Math.exp(-at / sr / 0.12);
          d[at] += (rr() < 0.5 ? -1 : 1) * g;
        }
        for (let i = Math.floor(sr * 0.04); i < n; i++) d[i] += (rr() * 2 - 1) * 0.32 * Math.exp(-(i / sr) / 0.55);
      }
      this.verb.buffer = ir;
    }
    this.verbG = ctx.createGain(); this.verbG.gain.value = 0;
    this.airLP.connect(this.verbG); this.verbG.connect(this.verb); this.verb.connect(this.master);

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

    // structure-borne drone bus (bypasses the airborne filters: it comes through the floor)
    this.droneBus = ctx.createGain();
    const dsat = saturator(ctx, 1.8);
    this.droneBus.connect(dsat); dsat.connect(this.master);
    // small-room acoustics of the flight deck / cabin: a short, dense early-reflection response
    this.room = ctx.createConvolver();
    {
      const n = Math.floor(sr * 0.32), ir = ctx.createBuffer(2, n, sr), rr = seeded(99);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let k = 0; k < 24; k++) { const at = Math.floor(sr * (0.002 + rr() * 0.03)); d[at] += (rr() < 0.5 ? -1 : 1) * (0.6 + rr() * 0.4) * Math.exp(-at / sr / 0.03); }
        for (let i = Math.floor(sr * 0.006); i < n; i++) d[i] += (rr() * 2 - 1) * 0.22 * Math.exp(-(i / sr) / 0.07);
      }
      this.room.buffer = ir;
    }
    this.roomG = ctx.createGain(); this.roomG.gain.value = 0;
    const roomLP = ctx.createBiquadFilter(); roomLP.type = 'lowpass'; roomLP.frequency.value = 4500;
    this.roomG.connect(this.room); this.room.connect(roomLP); roomLP.connect(this.master);
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
    this.cabinLP2.connect(this.roomG);
    // flight-deck ambience: avionics cooling fans and the 400 Hz electrical hum
    this.avG = ctx.createGain(); this.avG.gain.value = 0;
    chain(this.noise(this.pink, 0.7), bp(1300, 0.45), this.avG, this.master);
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    for (const [f, a] of [[400, 1], [800, 0.35], [1200, 0.12]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = a;
      o.connect(g); g.connect(this.humG); o.start();
    }
    this.humG.connect(this.master);
    // flap / slat track whistle at speed
    this.flapF = bp(1800, 5); this.flapG = ctx.createGain(); this.flapG.gain.value = 0;
    chain(this.noise(this.white, 1.1), this.flapF, this.flapG, this.master);
    // carbon brakes: the low moan when braking at taxi speed, and the squeal as the aircraft stops
    this.moanO = ctx.createOscillator(); this.moanO.type = 'sawtooth'; this.moanO.frequency.value = 150;
    const mv = ctx.createOscillator(); mv.frequency.value = 6.5; const mvg = ctx.createGain(); mvg.gain.value = 9;
    mv.connect(mvg); mvg.connect(this.moanO.frequency); mv.start();
    this.moanG = ctx.createGain(); this.moanG.gain.value = 0;
    chain(this.moanO, bp(320, 2.2), this.moanG, this.master); this.moanO.start();
    this.grindG = ctx.createGain(); this.grindG.gain.value = 0;
    chain(this.noise(this.crackle, 2.2), bp(700, 0.9), this.grindG, this.master);
    this.squealO = ctx.createOscillator(); this.squealO.frequency.value = 2900;
    const sq = ctx.createOscillator(); sq.frequency.value = 11; const sqg = ctx.createGain(); sqg.gain.value = 60;
    sq.connect(sqg); sqg.connect(this.squealO.frequency); sq.start();
    this.squealG = ctx.createGain(); this.squealG.gain.value = 0;
    chain(this.squealO, this.squealG, this.master); this.squealO.start();
    this._travel = 0;
    this._gearPrev = null;
  }

  _buildEngine(i) {
    const ctx = this.ctx;
    const r = seeded(100 + i * 17);
    const E = {};
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    // propagation: sources -> turbulence -> delay line -> direct + ground-reflected -> panner
    // binaural placement (HRTF): the engines are heard from where they are - behind, beside,
    // above or below the listener - not just left / right; the distance law is applied here
    // (the panner only gives the direction)
    if (ctx.createPanner) {
      E.out = ctx.createPanner();
      E.out.panningModel = 'HRTF'; E.out.distanceModel = 'linear'; E.out.rolloffFactor = 0; E.out.refDistance = 1; E.out.maxDistance = 1e6;
      E.hrtf = true;
    } else E.out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    E.out.connect(this.engBus);
    // structure-borne drone in the cabin / flight deck: once and twice per fan revolution (the
    // two engines never turn at quite the same speed, so the drone beats slowly)
    E.drone = ctx.createOscillator(); E.drone.type = 'sine';
    E.drone2 = ctx.createOscillator(); E.drone2.type = 'sine';
    E.droneG = gain(); E.drone2G = gain();
    E.drone.connect(E.droneG); E.drone2.connect(E.drone2G);
    E.droneG.connect(this.droneBus); E.drone2G.connect(this.droneBus);
    E.drone.start(); E.drone2.start();
    E.turb = gain(1);
    E.delay = ctx.createDelay(30); E.delay.delayTime.value = 0;
    E.direct = gain(1);
    E.refl = ctx.createDelay(0.1); E.refl.delayTime.value = 0.001;
    E.reflLP = filt('lowpass', 3500, 0.5);
    E.reflG = gain(0);
    E.turb.connect(E.delay); E.delay.connect(E.direct); E.direct.connect(E.out);
    E.delay.connect(E.refl); E.refl.connect(E.reflLP); E.reflLP.connect(E.reflG); E.reflG.connect(E.out);
    E.pan = gain(1);                // (name kept: every source connects here)
    E.pan.connect(E.turb);
    E.turbT = 0;
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
    // ---- jet "body": 35-90 Hz sub layer, saturated so it reaches small speakers ---------------
    E.subSrc = this.noise(this.brown, 0.6 + i * 2.2);
    E.subLP = filt('lowpass', 75, 0.9);
    E.subPk = filt('peaking', 48, 1.2); E.subPk.gain.value = 8;
    E.subSat = saturator(ctx, 2.4);
    E.subG = gain();
    E.subSrc.connect(E.subLP); E.subLP.connect(E.subPk); E.subPk.connect(E.subSat); E.subSat.connect(E.subG); E.subG.connect(E.pan);
    // ---- the tearing mid band of a take-off (big turbulent eddies, 250-900 Hz) ----------------
    E.tearSrc = this.noise(this.pink, 3.7 + i * 0.4);
    E.tearF = filt('bandpass', 420, 0.9);
    E.tearG = gain();
    E.tearSrc.connect(E.tearF); E.tearF.connect(E.tearG); E.tearG.connect(E.pan);
    // ---- slow swell of the roar (4-10 Hz amplitude modulation from the turbulent mixing) -------
    E.amSrc = this.noise(this.brown, 1.4 + i * 0.8);
    E.amLP = filt('lowpass', 9, 0.6);
    E.amDepth = gain(0);
    E.amSrc.connect(E.amLP); E.amLP.connect(E.amDepth);
    E.amDepth.connect(E.jetG.gain); E.amDepth.connect(E.tearG.gain); E.amDepth.connect(E.subG.gain);
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

  burst(buf, freq, q, gain, dur, type = 'lowpass', delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
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

  thump(strength, gs = 70) {
    if (!this.ctx) return;
    const inside = this._inside, k = clamp(strength, 0.1, 1.2);
    this.burst(this.brown, 140, 0.7, k * 1.4, 0.55);
    // tyre chirps: each main gear spins up on its own (a few tens of ms apart), the squeal
    // falling in pitch as the tread catches up with the runway
    const sp = clamp(gs / 70, 0.3, 1.2);
    for (const [dl, g] of [[0, 1], [0.025 + Math.random() * 0.05, 0.85]]) {
      this.chirp(dl, 0.3 * sp * clamp(strength, 0.4, 1) * g * (inside ? 0.35 : 1));
      if (Math.random() < 0.6) this.chirp(dl + 0.07 + Math.random() * 0.05, 0.12 * sp * g * (inside ? 0.35 : 1));
    }
    // everything in the cabin rattles for a moment
    if (inside !== false) this.burst(this.crackle, 1900, 0.9, 0.18 * k, 0.45, 'bandpass', 0.02);
  }

  // cabin PA chime: two soft bell tones with a little room
  chime(gain = 0.06) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    [[987.8, 0], [784, 0.42]].forEach(([f, dl]) => {
      const t = c.currentTime + dl, g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0003, t + 1.6);
      for (const [m, a] of [[1, 1], [2.76, 0.18], [5.4, 0.05]]) {
        const o = c.createOscillator(); o.frequency.value = f * m; const og = c.createGain(); og.gain.value = a;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.7);
      }
      g.connect(this.master); g.connect(this.roomG);
    });
  }

  chirp(delay, gain) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 5;
    f.frequency.setValueAtTime(2900, t); f.frequency.exponentialRampToValueAtTime(1300, t + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 3); s.stop(t + 0.3);
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

  // compressor surge / flame-out: a sharp bang and a short roar through that engine's path
  _surge(E) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [buf, f, q, g, d, type] of [[this.brown, 120, 0.7, 2.4, 0.9, 'lowpass'], [this.white, 900, 0.8, 0.9, 0.35, 'bandpass'],
      [this.crackle, 2400, 1.2, 0.6, 0.6, 'bandpass']]) {
      const s = ctx.createBufferSource(); s.buffer = buf;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0005, t + d);
      s.connect(fl); fl.connect(gg); gg.connect(E.pan); s.start(t, Math.random() * 3); s.stop(t + d + 0.05);
    }
  }

  // relight: ignitor ticks (~1.5 per second) and the soft "whoomp" of light-off
  _relight(E) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let k = 0; k < 6; k++) {
      const t = t0 + k * 0.62;
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const fl = ctx.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 3500;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.5, t); gg.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
      s.connect(fl); fl.connect(gg); gg.connect(E.pan); s.start(t, Math.random() * 3); s.stop(t + 0.05);
    }
    const t = t0 + 2.2, s = ctx.createBufferSource(); s.buffer = this.brown;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 180;
    const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(1.4, t + 0.15); gg.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
    s.connect(fl); fl.connect(gg); gg.connect(E.pan); s.start(t, Math.random() * 3); s.stop(t + 1.7);
  }

  // thrust reverser translating sleeves: hydraulic whirr and the end-of-travel clunk
  _reverserDoors(E, deploy) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(deploy ? 180 : 220, t);
    o.frequency.linearRampToValueAtTime(deploy ? 240 : 160, t + 0.9);
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 500; fl.Q.value = 2;
    const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(0.05, t + 0.1); gg.gain.linearRampToValueAtTime(0.0001, t + 0.95);
    o.connect(fl); fl.connect(gg); gg.connect(E.pan); o.start(t); o.stop(t + 1);
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 260;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t + 0.95); g2.gain.linearRampToValueAtTime(0.9, t + 0.97); g2.gain.exponentialRampToValueAtTime(0.0005, t + 1.35);
    s.connect(f2); f2.connect(g2); g2.connect(E.pan); s.start(t, Math.random() * 3); s.stop(t + 1.4);
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
    void vr;
    // distance (spherical spreading, a 787 at 60 m ~ full scale) and air absorption
    const spread = inside || cabin ? 1 : clamp(60 / dist, 0.004, 1.4);
    set(this.airLP.frequency, inside || cabin ? 18000 : clamp(18000 * Math.exp(-dist / 900), 600, 18000), 0.2);
    // cabin filtering: flight deck is far from the engines and well insulated
    set(this.cabinLP.frequency, inside ? 520 : cabin ? 1500 : 20000, 0.2);
    set(this.cabinLP2.frequency, inside ? 900 : cabin ? 2600 : 20000, 0.2);
    const cabinGain = inside ? 0.55 : cabin ? 0.85 : 1;
    set(this.engBus.gain, on * cabinGain, 0.1);

    // outdoor reverberation: strongest on the ground among the buildings, faint in the air
    const camAGL = L.camPos.y - (L.ground || 0);
    set(this.verbG.gain, on * (inside ? 0 : cabin ? 0.02 : 0.2 * (1 - smoothstep(20, 400, camAGL)) + 0.02), 0.4);
    const outsideProp = !(inside || cabin);
    for (let i = 0; i < 2; i++) {
      const e = fm.engines[i], E = this.eng[i];
      const n1 = clamp(e.n1 / 100, 0, 1.05), n2 = clamp(e.n2 / 100, 0, 1.05);
      // ---- propagation from this engine to the listener ----------------------------------
      const p = L.engines[i];
      const ex = p.x - L.camPos.x, ey = p.y - L.camPos.y, ez = p.z - L.camPos.z;
      const d1 = Math.max(Math.hypot(ex, ey, ez), 0.5);
      const delayT = outsideProp ? Math.min(d1, 9000) / C_SOUND : 0;
      const cur = E.delay.delayTime.value;
      // small changes glide (that glide IS the Doppler shift); a view switch jumps
      if (Math.abs(delayT - cur) > 0.04) { E.delay.delayTime.cancelScheduledValues(t); E.delay.delayTime.setValueAtTime(delayT, t); }
      else E.delay.delayTime.setTargetAtTime(delayT, t, 0.05);
      // ground reflection: image source below the ground
      const g0 = L.ground || 0;
      const hS = Math.max(p.y - g0, 0.3), hL = Math.max(L.camPos.y - g0, 0.3), dh = Math.hypot(ex, ez);
      const extra = (Math.hypot(dh, hS + hL) - Math.hypot(dh, hS - hL)) / C_SOUND;
      set(E.refl.delayTime, clamp(extra, 0.00003, 0.09), 0.03);
      // spherical spreading is applied before the delay line, so a fly-over gets loud when its
      // sound arrives, not when the aircraft passes
      set(E.pan.gain, outsideProp ? clamp(60 / d1, 0.004, 1.4) : 1, 0.05);
      const hard = L.hardGround ? 1 : 0;
      set(E.reflLP.frequency, hard ? 6500 : 2600, 0.3);
      set(E.reflG.gain, outsideProp ? (0.5 + 0.25 * hard) * (1 - smoothstep(60, 400, hL)) : 0, 0.2);
      // atmospheric turbulence: random slow level changes, deeper far away
      E.turbT -= dt;
      if (E.turbT <= 0) {
        E.turbT = 0.12 + Math.random() * 0.25;
        const depth = outsideProp ? 0.45 * smoothstep(150, 2500, d1) : 0;
        set(E.turb.gain, 1 + depth * (Math.random() * 2 - 1), 0.15);
      }
      // ---- transients -----------------------------------------------------------------------
      const Es = this._engState || (this._engState = [{}, {}]);
      const st = Es[i];
      if (st.running === true && !e.running && n1 > 0.35) this._surge(E, );
      if (st.running === false && e.running) this._relight(E);
      st.running = e.running;
      if ((st.rev ?? 0) < 0.1 && e.reverse >= 0.1) this._reverserDoors(E, true);
      if ((st.rev ?? 0) > 0.5 && e.reverse <= 0.5) this._reverserDoors(E, false);
      st.rev = e.reverse;
      // tonal parts are voiced a little below the physical values: at a real airport the
      // fan tones are masked by broadband roar and the ear hears a deep, rounded sound
      const dop = 1;       // Doppler comes from the delay line now
      const shaft = ENGINE_SOUND.shaftHz * n1 * dop * TONE_SCALE * (ENGINE_SOUND.blades === 18 ? 1 : 0.8) * (i ? 1.0035 : 1);
      const prop = ENGINE_SOUND.prop;
      // propeller: constant-speed, ~70 % Np at ground idle rising to 100 % at take-off power
      const np = prop ? ENGINE_SOUND.shaftHz * Math.min(1, n1 / 0.25) * (0.7 + 0.3 * smoothstep(0.3, 0.95, n1)) : 0;
      const bpf = prop ? np * ENGINE_SOUND.blades : shaft * ENGINE_SOUND.blades;
      const thrust = clamp(Math.abs(e.thrust) / ENGINE_SOUND.thrust, 0, 1.1);
      // two engines on a side: ~+3 dB and a fuller sound than one engine of the same thrust
      const size = ENGINE_SOUND.size, big = Math.sqrt(size) * Math.sqrt(ENGINE_SOUND.perSide);
      const roarK = prop ? 0.35 : 1;
      const rev = e.reverse;
      // stereo placement from the engine position relative to the camera
      if (E.hrtf && L.camQuat) {
        // direction of the engine in the listener's frame (Web Audio: -z ahead, +y up)
        const v = this._v || (this._v = { x: 0, y: 0, z: 0 });
        const q = L.camQuat, ix = -q.x, iy = -q.y, iz = -q.z, iw = q.w;
        // rotate (ex, ey, ez) by the inverse camera rotation
        const tx = 2 * (iy * ez - iz * ey), ty = 2 * (iz * ex - ix * ez), tz = 2 * (ix * ey - iy * ex);
        v.x = ex + iw * tx + (iy * tz - iz * ty); v.y = ey + iw * ty + (iz * tx - ix * tz); v.z = ez + iw * tz + (ix * ty - iy * tx);
        const n = Math.max(Math.hypot(v.x, v.y, v.z), 1e-3), w = inside ? 0.6 : 1;
        // (inside: the sound comes through the structure, less sharply placed)
        set(E.out.positionX, v.x / n * w, 0.06); set(E.out.positionY, v.y / n * w, 0.06); set(E.out.positionZ, v.z / n * w - (1 - w), 0.06);
      } else if (E.out.pan) {
        const pan = (ex * L.camRight.x + ey * L.camRight.y + ez * L.camRight.z) / Math.max(d1, 1);
        set(E.out.pan, clamp(pan * (inside ? 0.5 : 0.9), -1, 1), 0.1);
      }
      // structure-borne drone (felt more than heard), only aboard
      const shaftHz = ENGINE_SOUND.shaftHz * n1 * (i ? 1.0035 : 1);
      set(E.drone.frequency, Math.max(shaftHz, 5), 0.1); set(E.drone2.frequency, Math.max(shaftHz * 2, 10), 0.1);
      const aboard = inside ? 0.7 : cabin ? 1 : 0;
      set(E.droneG.gain, on * aboard * 0.09 * n1 * n1 * (prop ? 1.6 : 1), 0.2);
      set(E.drone2G.gain, on * aboard * 0.035 * n1 * n1, 0.2);
      // cabin window view is next to the left engine
      const near = cabin ? (i === 0 ? 1.6 : 0.55) : 1;
      // fan tone
      set(E.fan.frequency, bpf, 0.05);
      set(E.fanG.gain, on * near * (prop ? (0.5 + 0.5 * fanDir) * (0.03 + 0.09 * n1) : fanDir * (0.006 + 0.03 * n1 * n1)), 0.08);
      set(E.fanNoiseF.frequency, bpf * 0.8, 0.05);
      set(E.fanNoiseG.gain, on * near * fanDir * 0.12 * n1 * n1, 0.08);
      // buzzsaw above ~78 % N1
      // (prop: the harmonic-rich blade-passing rasp of the propeller instead)
      set(E.buzz.frequency, prop ? bpf : shaft, 0.05);
      set(E.buzzLP.frequency, prop ? 600 + 900 * n1 : 450 + 1300 * n1, 0.1);
      set(E.buzzG.gain, on * near * (prop ? 0.05 + 0.1 * n1 : fanDir * 0.11 * smoothstep(0.76, 0.96, n1)), 0.1);
      // core whine: loudest (relatively) at idle, the classic GEnx whistle
      const cf = (1150 + 1500 * n2) * dop * (i ? 1.0025 : 1);
      set(E.core1.frequency, cf, 0.08);
      set(E.core2.frequency, cf * 1.018, 0.08);
      set(E.coreG.gain, on * near * (0.3 + 0.7 * fanDir) * (0.004 + 0.004 * n2), 0.1);
      set(E.coreNoiseF.frequency, cf * 1.2, 0.08);
      set(E.coreNoiseG.gain, on * near * 0.03 * n2, 0.1);
      // jet roar grows with thrust; reversers throw it forwards
      const jet = Math.pow(thrust, 1.25) + rev * 0.5;

      set(E.jetLP.frequency, (220 + 1100 * Math.min(jet, 1) * (inside ? 0.5 : 1)) / Math.pow(size, 0.25), 0.12);
      set(E.jetBody.frequency, 110 / Math.pow(size, 0.3), 0.3);
      const jetLvl = on * near * (jetDir + rev * 0.8) * (0.02 + 0.55 * jet) * big * roarK;
      set(E.jetG.gain, jetLvl, 0.12);
      // crackle at high thrust, aft
      set(E.crkG.gain, on * near * jetDir * 0.35 * smoothstep(0.6, 1.0, thrust) * big * (prop ? 0 : 1), 0.12);
      // rumble
      set(E.rumG.gain, on * near * (0.16 + 0.65 * n1) * (inside ? 1.6 : 1) * big, 0.1);
      // sub body: grows with thrust, carried through the airframe into the cabin / flight deck
      const subLvl = on * near * (0.05 + 0.5 * Math.pow(Math.min(jet, 1.1), 1.4)) * (0.5 + 0.5 * jetDir) * (inside ? 0.8 : cabin ? 1.0 : 1) * big;
      set(E.subG.gain, subLvl, 0.15);
      set(E.subLP.frequency, 65 + 25 * Math.min(jet, 1), 0.2);
      // tearing mid band: the "ripping" quality of full power, aft and outside
      const tearLvl = on * near * jetDir * 0.32 * smoothstep(0.35, 1.0, thrust) * (outsideProp ? 1 : 0.25) * big * roarK;
      set(E.tearG.gain, tearLvl, 0.15);
      set(E.tearF.frequency, (300 + 260 * thrust) / Math.pow(size, 0.2), 0.2);
      // swell depth: ~35 % of the roar level (the modulator noise is ~+-1)
      set(E.amDepth.gain, 0.35 * jetLvl + 0.3 * tearLvl, 0.2);
    }
    // ---- APU at the gate: high whine + exhaust hiss from the tail cone ----------------------------
    if (!this.apu) {
      const c = this.ctx;
      this.apu = c.createGain(); this.apu.gain.value = 0;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 7350;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 3675;
      const og = c.createGain(); og.gain.value = 0.25;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.6;
      o.connect(og); o2.connect(og); og.connect(this.apu); this.noise(this.pink, 0.2).connect(nf); nf.connect(this.apu);
      this.apu.connect(this.master); o.start(); o2.start();
    }
    const apuOn = fm.out.wow && (fm.out.gs || 0) < 2 && !inside;
    set(this.apu.gain, on * (apuOn ? 0.035 * spread * (cabin ? 0.3 : 1) : 0), 0.8);

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
    this._inside = inside || cabin;
    set(this.roomG.gain, on * (inside ? 0.35 : cabin ? 0.5 : 0), 0.3);
    set(this.avG.gain, on * (inside ? 0.012 : 0), 0.3);
    set(this.humG.gain, on * (inside ? 0.0016 : 0), 0.3);
    // flap / slat whistle: grows with speed and flap angle (fainter through the hull)
    const flapK = clamp(fm.ctl.flapAngle / 30, 0, 1) + 0.4 * (fm.ctl.slat || 0);
    set(this.flapF.frequency, 1200 + ias * 4.5, 0.2);
    set(this.flapG.gain, on * flapK * q * q * (inside ? 0.01 : cabin ? 0.03 : 0.05 * spread), 0.25);
    // ground roll: continuous rumble + centreline light thumps every 15 m under the nose gear
    const wow = fm.out.wow;
    const gs = (fm.out.gs || 0) * 0.5144;
    set(this.rumbleG.gain, on * (wow ? clamp(gs / 60, 0, 1) * (inside ? 0.55 : 0.35 * spread + 0.1) : 0), 0.1);
    set(this.rumbleF.frequency, 70 + gs * 1.5, 0.1);
    if (wow && gs > 3 && fm.gear[0].onGround) {
      this._travel += gs * dt;
      if (this._travel > 15) {
        this._travel = 0;
        const k = (inside ? 0.35 : 0.15) * clamp(gs / 40, 0.2, 1) * on;
        this.burst(this.brown, 110, 0.9, k, 0.18);
        // ... and the main gear rolls over the same light a wheelbase later: "thump ... ka-thunk"
        const wb = L.wheelbase || 22;
        if (gs > 4 && wb / gs < 6) {
          this.burst(this.brown, 85, 0.9, k * 1.25, 0.22, 'lowpass', wb / gs);
          this.burst(this.brown, 85, 0.9, k * 1.1, 0.2, 'lowpass', wb / gs + 0.035);
        }
      }
    }
    // nose wheel coming down after the mains
    const noseOn = !!fm.gear[0].onGround;
    if (wow && noseOn && this._noseOn === false && gs > 15) this.burst(this.brown, 120, 0.8, (inside ? 0.5 : 0.25) * on, 0.35);
    this._noseOn = noseOn;
    // brakes: moan and grind while braking at taxi speed, squeal as the wheels stop
    const brk = Math.max(fm.ctl.brakeL || 0, fm.ctl.brakeR || 0, sys.pilot?.brakes || 0);
    const taxiK = wow ? smoothstep(0.4, 3, gs) * (1 - smoothstep(12, 30, gs)) : 0;
    set(this.moanO.frequency, 120 + gs * 6, 0.1);
    set(this.moanG.gain, on * brk * taxiK * (inside ? 0.02 : 0.05 * spread + 0.01), 0.15);
    set(this.grindG.gain, on * brk * taxiK * (inside ? 0.04 : 0.1 * spread), 0.15);
    const stopping = wow && brk > 0.3 && gs > 0.15 && gs < 2.5;
    set(this.squealG.gain, on * (stopping ? (inside ? 0.004 : 0.012 * spread) * smoothstep(0.15, 1, gs) : 0), 0.08);
    // hydraulics: flaps / gear in transit
    const flapsMoving = Math.abs(fm.ctl.flapAngle - (this._flapPrev ?? fm.ctl.flapAngle)) > 1e-4;
    this._flapPrev = fm.ctl.flapAngle;
    const gearMoving = fm.ctl.gearPos > 0.005 && fm.ctl.gearPos < 0.995;
    set(this.hydG.gain, on * (flapsMoving || gearMoving ? (inside ? 0.02 : 0.008) : 0), 0.15);
    // gear up / down lock clunks
    const gl = fm.ctl.gearPos <= 0.001 ? 'down' : fm.ctl.gearPos >= 0.999 ? 'up' : 'transit';
    if (this._gearPrev === 'transit' && gl !== 'transit') this.burst(this.brown, 160, 1, (inside ? 0.6 : 0.3) * on, 0.4);
    // gear doors swinging open into the airflow: a dull whump and a rush of air
    if (this._gearPrev && this._gearPrev !== 'transit' && gl === 'transit') {
      this.burst(this.brown, 90, 0.8, (inside ? 0.4 : 0.25) * on, 0.5);
      this.burst(this.pink, 600, 0.6, (inside ? 0.12 : 0.08) * on * clamp(q, 0.2, 1), 1.2, 'bandpass', 0.05);
    }
    this._gearPrev = gl;
    // cabin chimes: the seat-belt sign through 10,000 ft (a soft two-tone "pon-pon" in the cabin)
    const alt = fm.out.altFt || 0;
    if (this._alt10 != null && (this._alt10 < 10000) !== (alt < 10000) && (inside || cabin)) this.chime(cabin ? 0.07 : 0.025);
    this._alt10 = alt;
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
