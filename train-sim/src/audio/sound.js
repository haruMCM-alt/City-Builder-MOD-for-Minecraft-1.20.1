// Train sound engine (Web Audio, all synthesized except the recorded door chime).
//
// Layout
//   own train  : one spatial voice per car for wheel/rail rolling noise (+ bridge drumming),
//                one per motor car for the traction worklet (VVVF / DC motor, own channel each),
//                rail joints as spatial one-shots per axle, horn at the cab front
//   world      : passing trains (their own worklet + rolling noise + joints), level-crossing bells
//   interior   : cab / saloon ambience (blowers, wind on the cab front, air-con), chimes, ATS bell
// Every spatial source runs through a propagation delay that follows its distance, which gives
// real Doppler shifts and arrival times (see spatial.js). The listener follows the camera; when it
// is inside the train the exterior buses pass through "body insulation" filters.

import { Listener, SpatialVoice, oneShot, makeImpulse } from './spatial.js';

const MODE_MIX = {
  //            own-train exterior          world (other trains, bells)     reverb  ann   ats   chime
  cab:     { own: [1500, 0.55, 5200, 0.10], world: [1700, 0.40, 6000, 0.05], wet: 0.035, ann: 1.0, ats: 1.0, chime: 0.55 },
  car:     { own: [1900, 0.75, 6500, 0.10], world: [1800, 0.40, 6000, 0.05], wet: 0.035, ann: 1.0, ats: 0.0, chime: 1.0 },
  outside: { own: [20000, 1.0, 20000, 0.0], world: [20000, 1.0, 20000, 0.0], wet: 0.16, ann: 0.12, ats: 0.08, chime: 0.55 },
};

function isMotor(formation, i) {
  const c = formation[i];
  return c === 'P' || (c === 'M' && formation[i - 1] === 'P');
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.inCab = true;
    this.mode = 'cab';
    this.lastBrake = 0;
    this.lastCamStep = 0;
    this.L = new Listener();
    this.jump = true;
    this.trains = new Set();
    this.bells = new Map();
    this.doorsOpen = false;
  }

  async init(ctxOverride) {
    if (this.ctx) return;
    const ctx = ctxOverride || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.noiseBuf = this.makeNoise(4);
    this.brownBuf = this.makeBrown(4);
    this.pinkBuf = this.makePink(4);
    // joint impacts: 4 variations x 3 impact strengths (slow / medium / fast)
    this.jointSets = [0, 1, 2].map((br) => [1, 2, 3, 4].map((k) => this.makeJoint(k, br)));
    this.jointBufs = this.jointSets[1];
    this.jointBuf = this.jointBufs[0];
    // crossing alarm strikes, two pitches per alarm (the two-tone "カン・カン")
    this.bellBufs = [0, 1, 2, 3].map((k) => { const f = 690 + k * 26; return [this.makeBell(f, k * 2), this.makeBell(f * 1.055, k * 2 + 1)]; });
    this.camBuf = this.makeClick();

    // --- buses -------------------------------------------------------------------
    // exterior sources -> "insulation" (two low-passes + a leak path for the highs) -> master
    const insulation = () => {
      const input = ctx.createGain();
      const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.Q.value = 0.6;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.Q.value = 0.6;
      const g = ctx.createGain();
      const leakF = ctx.createBiquadFilter(); leakF.type = 'lowpass'; leakF.Q.value = 0.5;
      const leak = ctx.createGain();
      input.connect(lp1).connect(lp2).connect(g).connect(this.master);
      input.connect(leakF).connect(leak).connect(this.master);
      return { input, lp1, lp2, g, leakF, leak };
    };
    this.ownIns = insulation();
    this.worldIns = insulation();
    this.ownBus = this.ownIns.input;
    this.worldBus = this.worldIns.input;
    // environment reverb (sent from both exterior buses)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 1.8, 3.0, [[0.006, 0.5], [0.021, 0.25], [0.043, 0.18], [0.078, 0.12], [0.121, 0.09]]);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.03;
    this.ownBus.connect(this.wet); this.worldBus.connect(this.wet);
    this.wet.connect(this.reverb).connect(this.master);
    // interior (non-spatial) sounds
    this.cabBus = ctx.createGain();
    this.cabBus.connect(this.master);
    // `body` kept for older callers (cam clicks etc.)
    this.body = this.cabBus;

    // --- rolling noise generators (wheel/rail roughness), shared by groups of cars -------
    this.rollGens = [0, 1, 2, 3].map(() => this.makeRollGen());
    this.bridgeGen = this.makeBridgeGen();

    // --- interior ambience ---------------------------------------------------------
    this.hum = ctx.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 120;
    const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 380;
    this.humG = ctx.createGain(); this.humG.gain.value = 0.010;
    this.hum.connect(humF).connect(this.humG).connect(this.cabBus);
    this.hum.start();
    const fan = this.loopSource(this.pinkBuf);
    const fanF = ctx.createBiquadFilter(); fanF.type = 'lowpass'; fanF.frequency.value = 900;
    this.fanG = ctx.createGain(); this.fanG.gain.value = 0.03;
    fan.connect(fanF).connect(this.fanG).connect(this.cabBus);
    // wind on the cab front / car body, rising with v^2
    this.wind = this.loopSource(this.noiseBuf);
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 900; this.windF.Q.value = 0.5;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF).connect(this.windG).connect(this.cabBus);
    // outdoor ambience bed (distant traffic / breeze), only when the listener is outside
    const amb = this.loopSource(this.brownBuf);
    const ambF = ctx.createBiquadFilter(); ambF.type = 'lowpass'; ambF.frequency.value = 500;
    this.ambG = ctx.createGain(); this.ambG.gain.value = 0;
    amb.connect(ambF).connect(this.ambG).connect(this.master);

    // announcement bus (in-car speaker colouring)
    this.annBus = ctx.createGain();
    this.annLevel = ctx.createGain();
    const annHp = ctx.createBiquadFilter(); annHp.type = 'highpass'; annHp.frequency.value = 180;
    this.annBus.connect(annHp).connect(this.annLevel).connect(this.master);

    // departure melody bus: platform speaker heard from the train (echo + muffling inside)
    this.melBus = ctx.createGain();
    this.melBus.gain.value = 0.9;
    this.melFilter = ctx.createBiquadFilter(); this.melFilter.type = 'lowpass'; this.melFilter.frequency.value = 5000;
    const melDelay = ctx.createDelay(1.0); melDelay.delayTime.value = 0.19;
    const melFb = ctx.createGain(); melFb.gain.value = 0.28;
    const melWet = ctx.createGain(); melWet.gain.value = 0.35;
    this.melBus.connect(this.melFilter);
    this.melFilter.connect(this.master);
    this.melFilter.connect(melDelay); melDelay.connect(melFb).connect(melDelay); melDelay.connect(melWet).connect(this.master);

    // ambience: platform crowd murmur (filtered noise with a syllable-rate flutter) and bird calls
    const crowd = this.loopSource(this.pinkBuf);
    const cf1 = ctx.createBiquadFilter(); cf1.type = 'bandpass'; cf1.frequency.value = 650; cf1.Q.value = 0.7;
    const cf2 = ctx.createBiquadFilter(); cf2.type = 'peaking'; cf2.frequency.value = 2400; cf2.gain.value = 5; cf2.Q.value = 1.2;
    const flutter = ctx.createGain(); flutter.gain.value = 0.6;
    const fl1 = ctx.createOscillator(); fl1.frequency.value = 4.3;
    const fl2 = ctx.createOscillator(); fl2.frequency.value = 6.9;
    const flG = ctx.createGain(); flG.gain.value = 0.22;
    fl1.connect(flG); fl2.connect(flG); flG.connect(flutter.gain); fl1.start(); fl2.start();
    this.crowdG = ctx.createGain(); this.crowdG.gain.value = 0;
    crowd.connect(cf1).connect(cf2).connect(flutter).connect(this.crowdG).connect(this.worldBus);
    this.birdBufs = [0, 1, 2, 3].map((k) => this.makeBird(k));
    this.nextBird = 0;

    this.chimeBus = ctx.createGain();
    this.chimeBus.connect(this.master);
    this.atsBus = ctx.createGain();
    this.atsBus.connect(this.master);

    // recorded door chime + linear-motor door closing (E231/E233), see assets/sounds/
    this.doorCloseBuf = null;
    fetch(new URL('../../assets/sounds/door_close_e231.mp3', import.meta.url))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { this.doorCloseBuf = buf; })
      .catch((e) => console.warn('door sound unavailable, using synthesized chime', e));

    try {
      await ctx.audioWorklet.addModule(new URL('./traction-worklet.js', import.meta.url));
      this.hasWorklet = true;
    } catch (e) {
      console.warn('AudioWorklet unavailable', e);
      this.hasWorklet = false;
    }
    this.ready = true;
    this.setListenerMode(this.mode);
  }

  // ---------------------------------------------------------------------------------
  // generators
  // ---------------------------------------------------------------------------------
  /** wheel/rail roughness noise: peak at v / (roughness wavelength), low rumble, flange & brake squeal */
  makeRollGen() {
    const ctx = this.ctx;
    const src = this.loopSource(this.noiseBuf);
    const peak = ctx.createBiquadFilter(); peak.type = 'bandpass'; peak.Q.value = 0.9; peak.frequency.value = 600;
    const hiG = ctx.createGain(); hiG.gain.value = 0;
    const rum = this.loopSource(this.brownBuf);
    const rumF = ctx.createBiquadFilter(); rumF.type = 'lowpass'; rumF.frequency.value = 220;
    const rumG = ctx.createGain(); rumG.gain.value = 0;
    // aerodynamic / pass-by hiss
    const air = this.loopSource(this.pinkBuf);
    const airF = ctx.createBiquadFilter(); airF.type = 'highpass'; airF.frequency.value = 1500;
    const airG = ctx.createGain(); airG.gain.value = 0;
    const out = ctx.createGain();
    src.connect(peak).connect(hiG).connect(out);
    rum.connect(rumF).connect(rumG).connect(out);
    air.connect(airF).connect(airG).connect(out);
    // flange squeal on curves and brake shoe squeal near the stop
    const fl = ctx.createOscillator(); fl.type = 'sine'; fl.frequency.value = 3000 + Math.random() * 900;
    const flLfo = ctx.createOscillator(); flLfo.frequency.value = 0.6 + Math.random();
    const flLfoG = ctx.createGain(); flLfoG.gain.value = 60;
    flLfo.connect(flLfoG).connect(fl.frequency);
    const flG = ctx.createGain(); flG.gain.value = 0;
    fl.connect(flG).connect(out);
    const sq = ctx.createOscillator(); sq.type = 'triangle'; sq.frequency.value = 2100 + Math.random() * 700;
    const sqLfo = ctx.createOscillator(); sqLfo.frequency.value = 6 + Math.random() * 3;
    const sqLfoG = ctx.createGain(); sqLfoG.gain.value = 35;
    sqLfo.connect(sqLfoG).connect(sq.frequency);
    const sqG = ctx.createGain(); sqG.gain.value = 0;
    sq.connect(sqG).connect(out);
    for (const o of [fl, flLfo, sq, sqLfo]) o.start();
    return { out, peak, hiG, rumF, rumG, airG, flG, sqG, nodes: [src, rum, air, fl, flLfo, sq, sqLfo] };
  }

  setRollGen(r, v, st, t) {
    const k = Math.min(1.4, v / 100);
    const moving = v > 0.3;
    // rolling noise ~ 30 log v; roughness wavelengths of 3-6 cm put the peak at v / lambda
    r.hiG.gain.setTargetAtTime(moving ? 0.22 * k ** 1.5 + 0.004 : 0, t, 0.08);
    r.peak.frequency.setTargetAtTime(Math.max(180, Math.min(2600, (v / 3.6) / 0.045)), t, 0.1);
    r.rumG.gain.setTargetAtTime(moving ? 0.5 * Math.min(1, v / 60) ** 1.2 : 0, t, 0.1);
    r.rumF.frequency.setTargetAtTime(120 + v * 2.2, t, 0.1);
    r.airG.gain.setTargetAtTime(v > 40 ? 0.05 * ((v - 40) / 80) ** 3 : 0, t, 0.1);
    const R = st.curvature ? 1 / Math.abs(st.curvature) : 1e9;
    r.flG.gain.setTargetAtTime(R < 700 && v > 12 && v < 90 ? Math.min(1, (700 - R) / 400) * 0.035 : 0, t, 0.3);
    const sq = st.brake > 0.05 && v > 0.2 && v < 10 ? Math.sin((v / 10) * Math.PI) * 0.05 * Math.min(1, st.brake * 2) : 0;
    r.sqG.gain.setTargetAtTime(sq, t, 0.05);
  }

  /** steel truss / girder drumming excited by the passing wheels */
  makeBridgeGen() {
    const ctx = this.ctx;
    const src = this.loopSource(this.brownBuf);
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    src.connect(lp).connect(out);
    for (const [f, q, g] of [[205, 7, 0.9], [385, 9, 0.6], [610, 12, 0.35], [1130, 14, 0.15]]) {
      const n = this.loopSource(this.noiseBuf);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      n.connect(bp).connect(gg).connect(out);
    }
    return { out };
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

  makePink(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    return b;
  }

  /**
   * "タタン": a wheel crossing a rail joint, built as a small modal model.
   * The wheel drops into the gap and is kicked up again by the receiving rail end
   * (two impacts a few ms apart); the impacts excite the rail (bending modes 0.4–3.4 kHz,
   * pinned-pinned ring around 1 kHz), the wheel (long faint ring), the sleeper / ballast
   * (dull thump) and the car body (low boom). `bright` 0..2 = slow .. fast impacts.
   */
  makeJoint(seed, bright = 1) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.42);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const R = mulberry(seed * 977 + bright * 131 + 7);
    const j = (x, k = 0.06) => x * (1 + (R() * 2 - 1) * k);
    // excitation: drop impact + step-up impact (harder at speed: shorter, brighter bursts)
    const ex = new Float32Array(len);
    const burst = (t0, dur, amp) => {
      const i0 = Math.floor(t0 * sr), n = Math.max(2, Math.floor(dur * sr));
      for (let i = 0; i < n && i0 + i < len; i++) ex[i0 + i] += amp * Math.sin(Math.PI * i / n) * (1 + (R() * 2 - 1) * 0.35);
    };
    const durI = [0.003, 0.002, 0.0013][bright];
    burst(0, durI, 1);
    burst(j(0.0045 - bright * 0.0008, 0.25), durI * 0.8, j(0.55, 0.3));
    const sc = [0.7, 1.5, 2.4][bright];
    const modes = [
      // [Hz, decay 1/s, amplitude]  sleeper / ballast thump, body boom
      [j(105), 30, [1.0, 0.75, 0.5][bright]], [j(160), 38, 0.5], [j(46, 0.1), 11, [0.9, 0.55, 0.35][bright]],
      // rail bending modes and the pinned-pinned ring
      [j(430), 48, 0.45 * sc], [j(690), 40, 0.5 * sc], [j(1010, 0.03), 26, 0.55 * sc], [j(1340), 36, 0.38 * sc],
      [j(1880), 44, 0.28 * sc], [j(2580), 52, 0.2 * sc], [j(3420), 64, 0.13 * sc],
      // wheel ring (faint, long)
      [j(2960, 0.03), 13, 0.05 * sc], [j(4380, 0.03), 17, 0.035 * sc],
    ];
    for (const [f, dec, amp] of modes) {
      const r = Math.exp(-dec / sr), w = 2 * Math.PI * f / sr;
      const c1 = 2 * r * Math.cos(w), c2 = -r * r;
      const g = amp * (1 - r) * 2.2 * Math.pow(f / 200, 0.3);
      let y1 = 0, y2 = 0;
      for (let i = 0; i < len; i++) {
        const y = c1 * y1 + c2 * y2 + ex[i] * g;
        y2 = y1; y1 = y;
        d[i] += y;
      }
    }
    // a touch of the raw contact click on top (high-passed impact)
    let hp = 0, prev = 0;
    for (let i = 0; i < len; i++) { hp = 0.82 * (hp + ex[i] - prev); prev = ex[i]; d[i] += hp * 0.08 * sc; }
    let peak = 1e-6;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] *= 0.9 / peak * Math.min(1, (len - i) / (sr * 0.03));
    return b;
  }

  /**
   * one strike of an electronic level-crossing alarm (電子音式警報機): a bell-like tone with
   * inharmonic partials and slow beating, played through a weatherproof horn speaker
   * (band-limited, a horn resonance and a little cone break-up)
   */
  makeBell(f, seed) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.62);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const R = mulberry(seed * 313 + 11);
    const parts = [[1, 1.0, 6.0], [1.0042, 0.5, 7.2], [2.0, 0.45, 9.5], [2.71, 0.6, 11], [2.745, 0.3, 12.5],
      [4.08, 0.3, 15], [5.42, 0.22, 19], [6.83, 0.12, 24]];
    const ph = parts.map(() => R() * Math.PI * 2);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const att = Math.min(1, t / 0.0015);
      let s = 0;
      for (let k = 0; k < parts.length; k++) {
        const [m, a, dec] = parts[k];
        s += Math.sin(2 * Math.PI * f * m * t + ph[k]) * a * Math.exp(-t * dec);
      }
      d[i] = s * att;
    }
    // hammer transient
    let lp = 0;
    for (let i = 0; i < Math.floor(sr * 0.004); i++) { lp += ((R() * 2 - 1) - lp) * 0.5; d[i] += lp * 0.35 * (1 - i / (sr * 0.004)); }
    // horn speaker: soft clipping, 2-pole high-pass ~380 Hz, low-pass ~5 kHz, resonance ~1.15 kHz
    const hpA = Math.exp(-2 * Math.PI * 380 / sr), lpA = Math.exp(-2 * Math.PI * 5000 / sr);
    const rr = Math.exp(-260 / sr), rw = 2 * Math.PI * 1150 / sr, rc1 = 2 * rr * Math.cos(rw), rc2 = -rr * rr;
    let h1 = 0, hx1 = 0, h2 = 0, hx2 = 0, l = 0, y1 = 0, y2 = 0, peak = 1e-6;
    for (let i = 0; i < len; i++) {
      let x = Math.tanh(d[i] * 0.9) / Math.tanh(0.9 * 2.6);
      h1 = hpA * (h1 + x - hx1); hx1 = x;
      h2 = hpA * (h2 + h1 - hx2); hx2 = h1;
      l += (h2 - l) * (1 - lpA);
      const y = rc1 * y1 + rc2 * y2 + l * 0.06; y2 = y1; y1 = y;
      d[i] = l + y;
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < len; i++) d[i] *= 0.9 / peak * Math.min(1, (len - i) / (sr * 0.05));
    return b;
  }

  /** a short bird call: a few frequency-swept whistles (wagtail / bulbul-like) */
  makeBird(seed) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const notes = 2 + (seed % 3) * 2;
    const len = Math.floor(sr * (0.12 * notes + 0.1));
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let ph = 0;
    for (let n = 0; n < notes; n++) {
      const t0 = n * 0.12, dur = 0.06 + (seed % 2) * 0.03;
      const f0 = 2800 + seed * 450 + (n % 2) * 700, f1 = f0 + (seed % 2 ? 1500 : -900);
      for (let i = Math.floor(t0 * sr); i < Math.min(len, Math.floor((t0 + dur) * sr)); i++) {
        const u = (i / sr - t0) / dur;
        ph += 2 * Math.PI * (f0 + (f1 - f0) * u) / sr;
        d[i] += Math.sin(ph + 0.6 * Math.sin(ph * 0.5)) * Math.sin(Math.PI * u) ** 2 * 0.5;
      }
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
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  // ---------------------------------------------------------------------------------
  // trains
  // ---------------------------------------------------------------------------------
  setVehicle(veh) { this.veh = veh; }

  /** the sound profile in use (E231 can switch to the pre-renewal inverter) */
  profile(veh) { return this.altSound && veh.soundAlt ? veh.soundAlt : veh.sound; }

  /** build the own train's voices: rolling noise per car, traction per motor car */
  setTrain(formation, veh) {
    if (!this.ready) return;
    this.veh = veh;
    if (this.own) this.disposeTrain(this.own);
    const ctx = this.ctx;
    const motors = [];
    for (let i = 0; i < formation.length; i++) if (isMotor(formation, i)) motors.push(i);
    const units = Math.max(1, Math.min(4, motors.length));
    const own = { cars: [], traction: [], worklet: null, rollGens: this.rollGens, horn: null };
    if (this.hasWorklet) {
      own.worklet = new AudioWorkletNode(ctx, 'traction', { numberOfInputs: 0, outputChannelCount: [units], processorOptions: { units } });
      own.worklet.port.postMessage({ type: 'config', sound: this.profile(veh), seed: 1 });
      own.split = ctx.createChannelSplitter(units);
      own.worklet.connect(own.split);
    }
    for (let i = 0; i < formation.length; i++) {
      const v = new SpatialVoice(ctx, this.ownBus, { ref: 4, gain: 0.55 });
      this.rollGens[i % 4].out.connect(v.input);
      const bg = ctx.createGain(); bg.gain.value = 0;
      this.bridgeGen.out.connect(bg).connect(v.input);
      own.cars.push({ voice: v, bridge: bg });
    }
    motors.forEach((ci, k) => {
      const v = new SpatialVoice(ctx, this.ownBus, { ref: 3.5, gain: 1.0 });
      if (own.split) own.split.connect(v.input, k % units);
      own.traction.push({ car: ci, voice: v });
    });
    own.hornVoice = new SpatialVoice(ctx, this.ownBus, { ref: 3, gain: 1.0 });
    own.motorIdx = motors;
    this.own = own;
    this.jump = true;
  }

  disposeTrain(t) {
    for (const c of t.cars || []) { c.voice.dispose(); if (c.bridge) c.bridge.disconnect(); }
    for (const c of t.traction || []) c.voice.dispose();
    if (t.hornVoice) t.hornVoice.dispose();
    if (t.worklet) { t.worklet.port.postMessage({ type: 'state', v: 0, torque: 0 }); t.worklet.disconnect(); }
    if (t.gen) for (const n of t.gen.nodes) { try { n.stop(); } catch { /* */ } }
    for (const v of t.voices || []) v.dispose();
  }

  /** a passing / oncoming train: its own traction worklet and rolling noise at front, middle and rear */
  addTrain(veh, nCars) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const t = { veh, nCars, voices: [], gen: this.makeRollGen(), worklet: null };
    if (this.hasWorklet) {
      t.worklet = new AudioWorkletNode(ctx, 'traction', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { units: 2 } });
      t.worklet.port.postMessage({ type: 'config', sound: veh.sound, seed: 7 + Math.floor(Math.random() * 100) });
      t.split = ctx.createChannelSplitter(2);
      t.worklet.connect(t.split);
    }
    for (let k = 0; k < 3; k++) {
      const v = new SpatialVoice(ctx, this.worldBus, { ref: 6, gain: 1.0, maxDist: 1600 });
      const rg = ctx.createGain(); rg.gain.value = nCars / 5;      // each voice stands for a third of the train
      t.gen.out.connect(rg).connect(v.input);
      if (t.split && k !== 1) { const tg = ctx.createGain(); tg.gain.value = 0.9; t.split.connect(tg, k === 0 ? 0 : 1).connect(v.input); }
      t.voices.push(v);
    }
    this.trains.add(t);
    return {
      update: (positions, v, torque, st) => {
        if (!this.ready) return;
        const now = ctx.currentTime;
        this.setRollGen(t.gen, v, st || { curvature: 0, brake: 0 }, now);
        if (t.worklet) t.worklet.port.postMessage({ type: 'state', v, torque });
        positions.forEach((p, k) => { if (t.voices[k]) { t.voices[k].set(p.x, p.y, p.z); t.voices[k].update(this.L, now, this.jump); } });
      },
      dispose: () => { this.disposeTrain(t); this.trains.delete(t); },
    };
  }

  /**
   * a Shinkansen running past on its viaduct: rolling noise, the aerodynamic roar that grows with
   * v^3 (strongest at the nose) and the pantograph hiss, from the front, middle and rear
   */
  addShinkansen(nCars) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const t = { voices: [], gen: this.makeRollGen() };
    const aero = this.loopSource(this.pinkBuf);
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 650; af.Q.value = 0.35;
    const ag = ctx.createGain(); ag.gain.value = 0;
    aero.connect(af).connect(ag);
    const hiss = this.loopSource(this.noiseBuf);
    const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3200;
    const hg = ctx.createGain(); hg.gain.value = 0;
    hiss.connect(hf).connect(hg);
    for (let k = 0; k < 3; k++) {
      const v = new SpatialVoice(ctx, this.worldBus, { ref: 9, gain: 1.0, maxDist: 2600 });
      const rg = ctx.createGain(); rg.gain.value = nCars / 6;
      t.gen.out.connect(rg).connect(v.input);
      const a2 = ctx.createGain(); a2.gain.value = k === 0 ? 1.4 : 0.7;
      ag.connect(a2).connect(v.input);
      if (k === 1) hg.connect(v.input);
      t.voices.push(v);
    }
    return {
      update: (positions, kmh) => {
        if (!this.ready) return;
        const now = ctx.currentTime;
        this.setRollGen(t.gen, Math.min(kmh, 160), { curvature: 0, brake: 0 }, now);
        ag.gain.setTargetAtTime(0.55 * Math.min(1.3, (kmh / 260) ** 3), now, 0.2);
        af.frequency.setTargetAtTime(380 + kmh * 2.2, now, 0.3);
        hg.gain.setTargetAtTime(0.05 * Math.min(1, kmh / 250), now, 0.3);
        positions.forEach((p, k) => { if (t.voices[k]) { t.voices[k].set(p.x, p.y, p.z); t.voices[k].update(this.L, now, this.jump); } });
      },
      dispose: () => {
        for (const n of [aero, hiss, ...t.gen.nodes]) { try { n.stop(); } catch { /* */ } }
        for (const v of t.voices) v.dispose();
      },
    };
  }

  // ---------------------------------------------------------------------------------
  // listener
  // ---------------------------------------------------------------------------------
  /** 'cab' | 'car' | 'outside' */
  setListenerMode(mode) {
    this.mode = mode;
    this.inCab = mode === 'cab';
    this.jump = true;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const m = MODE_MIX[mode];
    const open = this.doorsOpen && mode === 'car';
    const apply = (ins, [f, g, lf, lg]) => {
      ins.lp1.frequency.setTargetAtTime(open ? Math.max(f, 6000) : f, t, 0.08);
      ins.lp2.frequency.setTargetAtTime(open ? Math.max(f, 6000) : f, t, 0.08);
      ins.g.gain.setTargetAtTime(open ? Math.max(g, 0.85) : g, t, 0.08);
      ins.leakF.frequency.setTargetAtTime(lf, t, 0.08);
      ins.leak.gain.setTargetAtTime(lg, t, 0.08);
    };
    apply(this.ownIns, m.own);
    apply(this.worldIns, m.world);
    this.wet.gain.setTargetAtTime(m.wet, t, 0.1);
    this.annLevel.gain.setTargetAtTime(m.ann, t, 0.1);
    this.atsBus.gain.setTargetAtTime(m.ats, t, 0.1);
    this.chimeBus.gain.setTargetAtTime(m.chime, t, 0.1);
    this.humG.gain.setTargetAtTime(mode === 'cab' ? 0.010 : 0.0, t, 0.1);
    this.fanG.gain.setTargetAtTime(mode === 'cab' ? 0.03 : mode === 'car' ? 0.045 : 0.0, t, 0.1);
    this.ambG.gain.setTargetAtTime(mode === 'outside' ? 0.035 : 0.0, t, 0.3);
    if (this.melFilter) this.melFilter.frequency.setTargetAtTime(mode === 'outside' ? 7000 : open ? 5000 : 2400, t, 0.1);
    this.updateRain();
  }

  // ---------------------------------------------------------------------------------
  // rain
  // ---------------------------------------------------------------------------------
  /**
   * a loop of raindrop impacts: each drop is a tiny burst of filtered noise (no pitch), so a
   * dense layer reads as the soft crackle of rain rather than bubbling. dur = burst length (s),
   * lp / hp = one-pole filter corners (Hz)
   */
  makeDrops(sec, rate, dur, lp, hp, seed) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const R = mulberry(seed);
    const n = Math.floor(sec * rate);
    for (let k = 0; k < n; k++) {
      const i0 = Math.floor(R() * len), amp = Math.pow(R(), 3), m = Math.floor(sr * dur * (0.5 + R()));
      const tau = m / 3.5;
      for (let i = 0; i < m; i++) d[(i0 + i) % len] += (R() * 2 - 1) * amp * Math.exp(-i / tau) * Math.min(1, i / 6);
    }
    // band-limit (run twice so the loop seam has settled filter state)
    const aL = Math.exp(-2 * Math.PI * lp / sr), aH = Math.exp(-2 * Math.PI * hp / sr);
    let l = 0, h = 0, px = 0;
    const out = new Float32Array(len);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < len; i++) {
        l = l * aL + d[i] * (1 - aL);
        h = aH * (h + l - px); px = l;
        if (pass) out[i] = h;
      }
    }
    let peak = 1e-6; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < len; i++) d[i] = out[i] / peak;
    return b;
  }

  /** rain strength 0..1 (0 switches it off) */
  setRain(level) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (level > 0 && !this.rain) {
      const mk = (src, filters, dest) => { let n = src; for (const f of filters) n = n.connect(f); const g = ctx.createGain(); g.gain.value = 0; n.connect(g).connect(dest); return g; };
      const bq = (type, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
      // slow gusts: the rain bed swells and fades a little
      const gust = ctx.createGain(); gust.gain.value = 0.85;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.023;
      const lg = ctx.createGain(); lg.gain.value = 0.12;
      lfo.connect(lg); lfo2.connect(lg); lg.connect(gust.gain); lfo.start(); lfo2.start();
      gust.connect(this.master);
      this.rain = {
        // the wide wash of rain falling on everything around (soft, no harsh highs)
        hiss: mk(this.loopSource(this.pinkBuf), [bq('highpass', 300), bq('lowpass', 2600, 0.5)], gust),
        hissMuffled: mk(this.loopSource(this.pinkBuf), [bq('highpass', 200), bq('lowpass', 1300, 0.5)], gust),
        // nearby drops: a dense, fine crackle outdoors
        near: mk(this.loopSource(this.makeDrops(4.1, 1600, 0.0014, 3200, 500, 13)), [bq('lowpass', 4500, 0.5)], gust),
        // in the cab: light ticks on the windscreen, a dull patter on the roof
        glass: mk(this.loopSource(this.makeDrops(3.7, 260, 0.0018, 3000, 700, 5)), [bq('lowpass', 4000, 0.5)], this.master),
        roof: mk(this.loopSource(this.makeDrops(3.3, 900, 0.006, 900, 90, 9)), [], gust),
      };
    }
    this.rainLevel = level;
    this.updateRain();
  }

  updateRain() {
    if (!this.rain) return;
    const t = this.ctx.currentTime, l = this.rainLevel || 0, m = this.mode, r = this.rain;
    const set = (g, v) => g.gain.setTargetAtTime(v * l, t, 0.3);
    set(r.hiss, m === 'outside' ? 0.05 : 0);
    set(r.near, m === 'outside' ? 0.035 : 0);
    set(r.hissMuffled, m === 'cab' ? 0.03 : m === 'car' ? 0.022 : 0);
    set(r.glass, m === 'cab' ? 0.045 : m === 'car' ? 0.012 : 0);
    set(r.roof, m === 'cab' ? 0.05 : m === 'car' ? 0.035 : 0);
  }

  /** one wiper stroke heard in the cab: motor whirr and the rubber blade swishing over wet glass */
  wiper() {
    if (!this.ready || this.mode !== 'cab') return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 1.2;
    const mot = ctx.createOscillator(); mot.type = 'sawtooth'; mot.frequency.setValueAtTime(85, t);
    mot.frequency.linearRampToValueAtTime(110, t + 0.3); mot.frequency.linearRampToValueAtTime(90, t + dur);
    const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 380;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(0, t); mg.gain.linearRampToValueAtTime(0.03, t + 0.08);
    mg.gain.setValueAtTime(0.03, t + dur - 0.1); mg.gain.linearRampToValueAtTime(0, t + dur);
    mot.connect(mf).connect(mg).connect(this.cabBus); mot.start(t); mot.stop(t + dur + 0.05);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2100; sf.Q.value = 0.8;
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0, t);
    // two strokes (out and back), loudest mid-sweep where the blade is fastest
    for (const [a, b] of [[0, dur / 2], [dur / 2, dur]]) {
      sg.gain.linearRampToValueAtTime(0.0, t + a + 0.02);
      sg.gain.linearRampToValueAtTime(0.05, t + (a + b) / 2);
      sg.gain.linearRampToValueAtTime(0.004, t + b - 0.02);
    }
    s.connect(sf).connect(sg).connect(this.cabBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  /** kept for older callers */
  setInCab(inCab) { this.setListenerMode(inCab ? 'cab' : 'outside'); }

  /** camera world position and orientation (unit vectors) */
  setListener(pos, fwd, right) {
    const L = this.L;
    L.pos.x = pos.x; L.pos.y = pos.y; L.pos.z = pos.z;
    L.fwd.x = fwd.x; L.fwd.y = fwd.y; L.fwd.z = fwd.z;
    L.right.x = right.x; L.right.y = right.y; L.right.z = right.z;
  }

  /** the camera was cut to a new place: no Doppler glide from the previous distances */
  cut() { this.jump = true; }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /**
   * per-frame update
   * st: { v (km/h), torque (-1..1), brake (0..1), curvature (1/m), doorsOpen,
   *       cars: [{x,y,z}] car centres (world), front: {x,y,z} cab front, bridge: [0..1 per car] }
   */
  update(st) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const v = st.v;
    const doors = !!st.doorsOpen;
    if (doors !== this.doorsOpen) { this.doorsOpen = doors; this.setListenerMode(this.mode); }
    for (const r of this.rollGens) this.setRollGen(r, v, st, t);
    const own = this.own;
    if (own) {
      if (own.worklet) own.worklet.port.postMessage({ type: 'state', v, torque: st.torque });
      const bv = Math.min(1, v / 70);
      this.bridgeGen.out.gain.setTargetAtTime(v > 1 ? 0.55 * bv ** 1.3 : 0, t, 0.15);
      if (st.cars) {
        for (let i = 0; i < own.cars.length && i < st.cars.length; i++) {
          const c = own.cars[i], p = st.cars[i];
          c.voice.set(p.x, p.y + 0.5, p.z);
          c.voice.update(this.L, t, this.jump);
          c.bridge.gain.setTargetAtTime(st.bridge ? st.bridge[i] || 0 : 0, t, 0.2);
        }
        for (const m of own.traction) {
          const p = st.cars[m.car];
          if (!p) continue;
          m.voice.set(p.x, p.y + 0.55, p.z);
          m.voice.update(this.L, t, this.jump);
        }
      }
      if (st.front) { own.hornVoice.set(st.front.x, st.front.y + 1.0, st.front.z); own.hornVoice.update(this.L, t, this.jump); }
    }
    const k = Math.min(1.3, v / 120);
    this.windG.gain.setTargetAtTime(this.mode === 'cab' ? 0.06 * k * k : this.mode === 'car' ? 0.025 * k * k : 0, t, 0.1);
    this.windF.frequency.setTargetAtTime(450 + v * 9, t, 0.2);
    // brake cylinder air
    if (st.brake > this.lastBrake + 0.12) { this.air(0.06, 0.25, 2500); this.lastBrake = st.brake; }
    else if (st.brake < this.lastBrake - 0.12) {
      this.air(st.brake < 0.02 ? 0.16 : 0.08, st.brake < 0.02 ? 0.9 : 0.4, 4200);
      this.lastBrake = st.brake;
    }
    // resistor control (115): cam shaft notching under the motor car while powering
    if (this.veh && (this.veh.sound.cam || this.veh.sound.camClicks)) {
      const step = st.torque > 0.05 && v < (this.veh.sound.camTo || 55) ? Math.floor(v / 2.2) : 0;
      if (step > this.lastCamStep && own && st.cars) {
        const p = st.cars[own.motorIdx[0] ?? 1];
        if (p) oneShot(ctx, this.L, this.ownBus, this.camBuf, { x: p.x, y: p.y + 0.8, z: p.z }, { gain: 0.9, ref: 3, rate: 0.95 + Math.random() * 0.1 });
      }
      this.lastCamStep = step;
    }
    this.jump = false;
  }

  /**
   * ambience around the listener
   * station: 0..1 how close the listener is to a platform with people; rural: 0..1 countryside
   */
  ambience({ station = 0, rural = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.crowdG.gain.setTargetAtTime(0.06 * station, t, 0.6);
    // birds: occasional calls from random spots around the listener (outside or with doors open)
    if (rural > 0.05 && t > this.nextBird) {
      this.nextBird = t + 1.5 + Math.random() * 6 / rural;
      const a = Math.random() * Math.PI * 2, d = 15 + Math.random() * 60, L = this.L;
      oneShot(this.ctx, L, this.worldBus, this.birdBufs[Math.floor(Math.random() * 4)],
        { x: L.pos.x + Math.cos(a) * d, y: L.pos.y + 3 + Math.random() * 8, z: L.pos.z + Math.sin(a) * d },
        { gain: 0.5 * rural, ref: 10, rate: 0.9 + Math.random() * 0.2 });
    }
  }

  /** a wheel crossing a rail joint at world position pos; own = our train (else a passing one) */
  jointAt(pos, speed, own = true, late = 0) {
    if (!this.ready || this.muted) return;
    const g = 0.2 + Math.min(1.2, speed / 90) * 0.8;
    // impact strength: a slow wheel only "taps" the rail end, a fast one hits it hard and bright
    const x = Math.min(1.999, speed / 45 + (Math.random() - 0.5) * 0.4);
    const set = this.jointSets[Math.max(0, Math.floor(x))];
    const buf = set[Math.floor(Math.random() * set.length)];
    // a fixed 40 ms latency lets every axle sound at its exact crossing time instead of on frame ticks
    const when = Math.max(0, 0.04 - late);
    oneShot(this.ctx, this.L, own ? this.ownBus : this.worldBus, buf, pos, { gain: g * (own ? 0.8 : 1.0), ref: 3, rate: 0.95 + Math.random() * 0.08, when });
  }

  /** legacy non-spatial joint (kept for compatibility) */
  joint(gain, speed) {
    if (!this.ready || this.muted) return;
    const g = gain * (0.25 + Math.min(1, speed / 90) * 0.9);
    this.playBuf(this.jointBuf, g, 0.9 + Math.random() * 0.15, 0, this.ownBus);
  }

  playBuf(buf, gain, rate = 1, when = 0, dest = this.cabBus) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(dest);
    s.start(ctx.currentTime + Math.max(0, when));
  }

  air(gain, dur, freq) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain();
    const lvl = gain * (this.mode === 'cab' ? 1 : this.mode === 'car' ? 0.6 : 0.45);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.03);
    g.gain.setTargetAtTime(0, t + dur * 0.3, dur * 0.35);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur * 2 + 0.5);
  }

  /** true when the recorded chime + door close sample will be used */
  usesDoorSample() {
    return !!(this.doorCloseBuf && this.veh && this.veh.doorSound === 'e231');
  }

  /** door chime before closing; returns seconds until the doors are shut */
  doorChime() {
    if (!this.ready) return 0;
    if (this.usesDoorSample()) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.doorCloseBuf;
      const g = this.ctx.createGain(); g.gain.value = 0.95;
      s.connect(g).connect(this.chimeBus);
      s.start();
      return 3.3;   // the bang of the doors meeting is ~3.2 s into the clip
    }
    return this.synthChime();
  }

  /** JR East style door chime (3 two-tone pairs), synthesized */
  synthChime() {
    if (!this.ready) return 0;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      this.tone(1318.5, t0 + i * 0.62, 0.35, 0.09, 'sine', this.chimeBus);
      this.tone(1046.5, t0 + i * 0.62 + 0.22, 0.45, 0.08, 'sine', this.chimeBus);
    }
    return 1.9;
  }

  tone(f, when, dur, gain, type = 'sine', dest = this.master) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(dest);
    o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }

  /** door engine: air cylinder (115/211) or linear motor whirr + the leaves meeting / stopping */
  doorMove(open) {
    if (!this.ready) return;
    const lvl = this.mode === 'car' ? 1.6 : this.mode === 'cab' ? 0.7 : 0.9;
    this.air((open ? 0.10 : 0.07) * lvl, open ? 0.6 : 0.5, open ? 1800 : 1400);
    setTimeout(() => this.ready && this.playBuf(this.jointBuf, 0.22 * lvl, 1.7, 0, this.master), open ? 1800 : 2650);   // leaves stop / meet (matches the door animation)
  }

  horn(on) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.own ? this.own.hornVoice.input : this.master;
    if (on && !this.hornNodes) {
      const tones = (this.veh && this.veh.sound.hornTones) || [466, 698];
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.06);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2800;
      const oscs = tones.map((fr) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      f.connect(g).connect(dest);
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
      o.connect(g).connect(out).connect(this.atsBus);
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
    this.tone(880, t, 0.5, 0.07, 'sine', this.atsBus);
    this.tone(1175, t + 0.18, 0.6, 0.06, 'sine', this.atsBus);
  }

  /**
   * level-crossing bells (カンカン) as spatial sources.
   * list: [{ id, x, y, z }] of the crossings ringing now (or a plain distance for old callers)
   */
  crossing(list) {
    if (!this.ready) return;
    if (!Array.isArray(list)) list = [];
    const ctx = this.ctx, t = ctx.currentTime;
    const seen = new Set();
    for (const c of list) {
      seen.add(c.id);
      let b = this.bells.get(c.id);
      if (!b) {
        // a crossing has an alarm on each side of the road; their strike rates differ a little,
        // so the two drift in and out of step like the real thing
        const k = Math.floor(Math.random() * this.bellBufs.length);
        b = { units: [0, 1].map((u) => ({
          voice: new SpatialVoice(ctx, this.worldBus, { ref: 8, gain: 0.42, maxDist: 1400 }),
          bufs: this.bellBufs[(k + u) % this.bellBufs.length],
          period: 0.352 + u * 0.009 + Math.random() * 0.004,
          next: t + 0.05 + u * Math.random() * 0.15, n: 0,
          off: (u ? 1 : -1) * 5,
        })) };
        this.bells.set(c.id, b);
      }
      for (const u of b.units) {
        u.voice.set(c.x + u.off, c.y + 2.5, c.z + u.off * 0.6);
        u.voice.update(this.L, t, this.jump);
        // strikes are scheduled into the voice input, so they inherit its delay (Doppler) and panning
        while (u.next < t + 0.15) {
          const s = ctx.createBufferSource();
          s.buffer = u.bufs[u.n % 2];
          s.playbackRate.value = 1 + (Math.random() - 0.5) * 0.002;
          const g = ctx.createGain(); g.gain.value = 0.32;
          s.connect(g).connect(u.voice.input);
          s.start(Math.max(t, u.next));
          u.next += u.period;
          u.n++;
        }
      }
    }
    for (const [id, b] of this.bells) {
      if (!seen.has(id)) { for (const u of b.units) { const v = u.voice; setTimeout(() => v.dispose(), 4000); } this.bells.delete(id); }
    }
  }

  /** passing trains are now real spatial sources (addTrain); kept as a no-op for old callers */
  passBy() {}
}

/** small seeded PRNG for repeatable sound variations */
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
