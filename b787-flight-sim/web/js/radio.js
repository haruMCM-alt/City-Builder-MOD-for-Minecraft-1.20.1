// Broadcast radio you can tune (📻, key 8; [ / ] to tune, Shift+[ / ] to seek).
// FM band 76.0-95.0 MHz: four music stations whose songs are composed and played live in the
// browser (Web Audio synthesis, so nothing is downloaded), and a news / weather talk station
// read by the speech synthesiser from the simulation (time, weather, the airports' traffic,
// your flight). Air band 118-137 MHz: the ATIS of each airport, line-of-sight reception.
// Between stations, and out of range, the set hisses. ATC calls on the flight radio take
// priority: music ducks and talk pauses while a controller or pilot is speaking.
import { GEO } from './geo_data.js';
import { aptName } from './atc.js';

const MIDI = (m) => 440 * Math.pow(2, (m - 69) / 12);
function hash(...a) {
  let h = 2166136261 >>> 0;
  for (const v of a) { h ^= Math.imul((v * 1000) | 0, 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; }
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const CH = { maj: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10],
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], 9: [0, 4, 7, 10, 14], 13: [0, 4, 10, 14, 21], add9: [0, 4, 7, 14], sus4: [0, 5, 7] };
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike',
  'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
const DIR16 = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const WX_JA = { clear: '快晴', scattered: '晴れ', broken: '曇りがち', overcast: '曇り', rain: '雨' };

// ------------------------------------------------------------------------------- stations
const FM = [
  { f: 76.5, id: 'pop', name: 'SKY FM', tag: 'J-POP / シティポップ' },
  { f: 80.0, id: 'jazz', name: 'TOKYO JAZZ', tag: 'ジャズ' },
  { f: 82.5, id: 'classic', name: 'CLASSIC 82.5', tag: 'クラシック' },
  { f: 85.1, id: 'lofi', name: 'LO-FI 85', tag: 'ローファイ・ビーツ' },
  { f: 89.7, id: 'news', name: 'MICOM NEWS', tag: 'ニュース・天気・交通' },
];
const ATIS_F = { 1: 128.8, 2: 128.6, 3: 127.6, 4: 127.8 };
const AIR = GEO.airports.map((a) => ({ f: ATIS_F[a.id] ?? 127.0 + a.id * 0.25, id: 'atis', apt: a.id, x: a.x, z: a.z }));
const BANDS = { FM: { lo: 76.0, hi: 95.0, step: 0.1, list: FM, unit: 'MHz' }, AIR: { lo: 118.0, hi: 136.975, step: 0.025, list: AIR, unit: 'MHz' } };

const TITLES = {
  pop: [['Blue Hour', 'Runway', 'Summer', 'Midnight', 'Skyline', 'Starlight', 'Neon', 'Sunset', 'Ocean', 'Window Seat', 'Harbor'],
    ['Drive', 'Lights', 'Dreams', 'Romance', 'Highway', 'Breeze', 'Days', 'Flight', 'Parade', 'Memories']],
  jazz: [['Haneda', 'Late Night', 'Velvet', 'Autumn', 'Rainy', 'Blue', 'Moonlit', 'Smoky'], ['Walk', 'Swing', 'Blues', 'Waltz', 'Avenue', 'Taxiway', 'Lounge', 'Bop']],
  classic: [['Morning', 'Evening', 'Spring', 'Pastoral', 'Little', 'Gentle', 'Sky'], ['Canon', 'Étude', 'Prelude', 'Sonatina', 'Nocturne', 'Air', 'Serenade']],
  lofi: [['Rainy', 'Sleepy', 'Coffee', 'Cloud', 'Tape', 'Late', 'Sunday', 'Window'], ['Beats', 'Study', 'Loop', 'Nap', 'Drift', 'Shop', 'Hours', 'Gate']],
};
const ARTISTS = {
  pop: ['Haneda Lights', 'Natsu Hikari', 'Kaze to Kumo', 'Moon Taxiway', 'Aozora Club'],
  jazz: ['Tokyo Bay Trio', 'Night Gate Quartet', 'K. Sakamoto Group', 'Blue Apron Five'],
  classic: ['マイコムソフト室内合奏団', 'Sky Chamber Ensemble', 'Haneda String Quartet'],
  lofi: ['tape.gate', 'cloud nap', 'windowseat', 'jet lag beats'],
};

// --------------------------------------------------------------------------- instruments
class Synth {
  constructor(ctx, dest) {
    this.ctx = ctx; this.dest = dest;
    const n = ctx.sampleRate * 1.5, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
  }
  _env(g, t, a, peak, dec, sus, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(peak * sus, 0.0002), t + a + dec);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  _osc(type, f, t, end, out, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(out); o.start(t); o.stop(end + 0.05);
    return o;
  }
  _noise(t, end, out) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.connect(out); s.start(t, Math.random()); s.stop(end + 0.05);
    return s;
  }
  // electric piano: sine carrier, decaying FM brightness
  epiano(t, m, d, v) {
    const c = this.ctx, f = MIDI(m), g = c.createGain(), end = t + d + 0.5;
    this._env(g, t, 0.004, v, 0.5, 0.35, end);
    const o = this._osc('sine', f, t, end, g);
    const mod = c.createOscillator(), mg = c.createGain();
    mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.06, t + 0.5);
    mod.connect(mg); mg.connect(o.frequency); mod.start(t); mod.stop(end + 0.05);
    g.connect(this.dest);
  }
  piano(t, m, d, v) {
    const c = this.ctx, f = MIDI(m), g = c.createGain(), lp = c.createBiquadFilter(), end = t + Math.max(d, 0.25) + 0.9;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), t + 1.2);
    this._env(g, t, 0.003, v, 1.4, 0.25, end);
    this._osc('triangle', f, t, end, lp); this._osc('sine', f * 2, t, end, lp, 3);
    lp.connect(g); g.connect(this.dest);
  }
  pad(t, m, d, v, bright = 1000) {
    const c = this.ctx, f = MIDI(m), g = c.createGain(), lp = c.createBiquadFilter(), end = t + d + 0.8;
    lp.type = 'lowpass'; lp.frequency.value = bright;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.35); g.gain.setValueAtTime(v, t + d); g.gain.exponentialRampToValueAtTime(0.0001, end);
    this._osc('sawtooth', f, t, end, lp, -7); this._osc('sawtooth', f, t, end, lp, 8);
    lp.connect(g); g.connect(this.dest);
  }
  bass(t, m, d, v, tone = 700) {
    const c = this.ctx, f = MIDI(m), g = c.createGain(), lp = c.createBiquadFilter(), end = t + d + 0.08;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(tone * 1.8, t); lp.frequency.exponentialRampToValueAtTime(tone, t + 0.15);
    this._env(g, t, 0.006, v, 0.25, 0.55, end);
    this._osc('triangle', f, t, end, lp); this._osc('sine', f, t, end, lp);
    lp.connect(g); g.connect(this.dest);
  }
  bell(t, m, d, v) {
    const c = this.ctx, f = MIDI(m), g = c.createGain(), end = t + d + 0.6;
    this._env(g, t, 0.003, v, 0.35, 0.4, end);
    const o = this._osc('sine', f, t, end, g);
    const mod = c.createOscillator(), mg = c.createGain();
    mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 1.5, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.4);
    mod.connect(mg); mg.connect(o.frequency); mod.start(t); mod.stop(end + 0.05);
    g.connect(this.dest);
  }
  // breathy reed lead with delayed vibrato (sax / lead synth)
  reed(t, m, d, v, bright = 1600) {
    const c = this.ctx, f = MIDI(m), g = c.createGain(), bp = c.createBiquadFilter(), end = t + d + 0.08;
    bp.type = 'lowpass'; bp.frequency.value = bright; bp.Q.value = 2.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v * 0.85, t + d); g.gain.exponentialRampToValueAtTime(0.0001, end);
    const o = this._osc('sawtooth', f, t, end, bp);
    if (d > 0.25) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(d, 0.5));
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(end + 0.05);
    }
    bp.connect(g); g.connect(this.dest);
  }
  kick(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this._env(g, t, 0.002, v, 0.22, 0.01, t + 0.3);
    o.connect(g); g.connect(this.dest); o.start(t); o.stop(t + 0.35);
  }
  snare(t, v, tone = 1800) {
    const c = this.ctx, g = c.createGain(), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = tone; bp.Q.value = 0.7;
    this._env(g, t, 0.001, v, 0.14, 0.05, t + 0.22);
    this._noise(t, t + 0.22, bp); bp.connect(g); g.connect(this.dest);
    const tg = c.createGain(); this._env(tg, t, 0.001, v * 0.5, 0.06, 0.05, t + 0.1);
    this._osc('triangle', 190, t, t + 0.1, tg); tg.connect(this.dest);
  }
  hat(t, v, open = false) {
    const c = this.ctx, g = c.createGain(), hp = c.createBiquadFilter(), e = open ? 0.28 : 0.045;
    hp.type = 'highpass'; hp.frequency.value = 7200;
    this._env(g, t, 0.001, v, e, 0.05, t + e + 0.03);
    this._noise(t, t + e + 0.03, hp); hp.connect(g); g.connect(this.dest);
  }
  ride(t, v) {
    const c = this.ctx, g = c.createGain(), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 1.2;
    this._env(g, t, 0.001, v, 0.5, 0.15, t + 0.7);
    this._noise(t, t + 0.7, bp); bp.connect(g); g.connect(this.dest);
    const tg = c.createGain(); this._env(tg, t, 0.001, v * 0.18, 0.4, 0.2, t + 0.6);
    this._osc('square', 3150, t, t + 0.6, tg); tg.connect(this.dest);
  }
  brush(t, v, d = 0.18) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'bandpass'; lp.frequency.value = 2600; lp.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    this._noise(t, t + d, lp); lp.connect(g); g.connect(this.dest);
  }
}

// ------------------------------------------------------------------------------- songs
const SLOT = 104;                 // seconds per song on a music station (incl. the gap / DJ)
function voicing(root, type, lo = 55, prev = null) {
  const iv = CH[type] || CH.maj;
  let best = null, bd = 1e9;
  for (let inv = 0; inv < iv.length; inv++) {
    const notes = iv.map((x, i) => root + x + (i < inv ? 12 : 0));
    let base = notes.map((n) => n);
    while (Math.min(...base) < lo) base = base.map((n) => n + 12);
    while (Math.min(...base) >= lo + 12) base = base.map((n) => n - 12);
    const c = prev ? base.reduce((s, n, i) => s + Math.abs(n - (prev[i] ?? prev[prev.length - 1])), 0) : 0;
    if (c < bd) { bd = c; best = base.sort((a, b) => a - b); }
  }
  return best;
}
// the chord of a bar: progressions per section kind, chords of one or two per bar
function makeSong(genre, seed) {
  const R = (k) => hash(seed, k);
  const pick = (arr, k) => arr[Math.floor(R(k) * arr.length) % arr.length];
  const key = Math.floor(R(1) * 12);
  const S = { genre, seed, key, swing: 0, bars: [], melody: new Map(), title: '', artist: '' };
  const words = TITLES[genre];
  S.title = `${pick(words[0], 2)} ${pick(words[1], 3)}`;
  S.artist = pick(ARTISTS[genre], 4);
  let progs, bpm, form;
  if (genre === 'pop') {
    bpm = 108 + Math.floor(R(5) * 18);
    progs = { verse: [[[5, 'maj7']], [[7, '7']], [[4, 'm7']], [[9, 'm7']]], chorus: pick([[[[0, 'maj7']], [[7, 'maj']], [[9, 'm7']], [[5, 'maj7']]],
      [[[5, 'maj7']], [[7, '7']], [[4, 'm7']], [[9, 'm7']]], [[[9, 'm7']], [[5, 'maj7']], [[0, 'add9']], [[7, 'sus4'], [7, '7']]]], 6),
    bridge: [[[2, 'm7']], [[4, 'm7']], [[5, 'maj7']], [[7, 'sus4'], [7, '7']]] };
    form = [['intro', 4, 'verse'], ['verse', 8, 'verse'], ['bridge', 4, 'bridge'], ['chorus', 8, 'chorus'], ['verse', 8, 'verse'], ['chorus', 8, 'chorus'], ['outro', 4, 'chorus']];
  } else if (genre === 'jazz') {
    bpm = 112 + Math.floor(R(5) * 50); S.swing = 0.62;
    progs = { head: [[[2, 'm7']], [[7, '7']], [[0, 'maj7']], [[9, '7']], [[2, 'm7']], [[7, '7']], [[4, 'm7'], [9, '7']], [[2, 'm7'], [7, '7']]],
      solo: [[[0, 'maj7']], [[9, '7']], [[2, 'm7']], [[7, '7']], [[4, 'm7']], [[9, '7']], [[2, 'm7']], [[7, '7']]] };
    form = [['intro', 4, 'solo'], ['head', 8, 'head'], ['solo', 8, 'solo'], ['solo', 8, 'solo'], ['head', 8, 'head'], ['outro', 4, 'head']];
  } else if (genre === 'classic') {
    bpm = 70 + Math.floor(R(5) * 18);
    const canon = [[[0, 'maj']], [[7, 'maj']], [[9, 'm']], [[4, 'm']], [[5, 'maj']], [[0, 'maj']], [[5, 'maj']], [[7, 'maj']]];
    progs = { a: canon, b: [[[9, 'm']], [[5, 'maj']], [[0, 'maj']], [[7, 'maj']], [[2, 'm']], [[4, 'm']], [[5, 'maj']], [[7, '7']]] };
    form = [['intro', 2, 'a'], ['a', 8, 'a'], ['b', 8, 'b'], ['a', 8, 'a'], ['outro', 2, 'a']];
  } else {
    bpm = 72 + Math.floor(R(5) * 14); S.swing = 0.57;
    progs = { loop: pick([[[[2, 'm9']], [[7, '9']], [[0, 'maj9']], [[9, 'm9']]], [[[0, 'maj9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']]],
      [[[5, 'maj9']], [[4, 'm7']], [[2, 'm9']], [[0, 'maj9']]]], 6) };
    form = [['intro', 4, 'loop'], ['a', 8, 'loop'], ['b', 8, 'loop'], ['a', 8, 'loop'], ['outro', 4, 'loop']];
  }
  S.bpm = bpm;
  // fit the form into the slot (minus the gap): repeat / trim the middle
  const barDur = 240 / bpm, maxBars = Math.floor((SLOT - 9) / barDur);
  let bars = [];
  for (const [kind, n, prog] of form) for (let i = 0; i < n; i++) bars.push({ kind, i, n, chords: progs[prog][i % progs[prog].length] });
  while (bars.length < maxBars - 8 && genre !== 'classic') {
    const mid = form.slice(1, -1);
    const [kind, n, prog] = mid[bars.length % mid.length];
    const at = bars.length - form[form.length - 1][1];
    const add = []; for (let i = 0; i < n; i++) add.push({ kind, i, n, chords: progs[prog][i % progs[prog].length] });
    bars.splice(at, 0, ...add);
  }
  if (bars.length > maxBars) bars = [...bars.slice(0, maxBars - 4), ...bars.slice(-4)];
  S.bars = bars;
  S.dur = bars.length * barDur;
  composeMelody(S);
  return S;
}
function chordAt(S, bar, step) {
  const b = S.bars[bar];
  if (!b) return null;
  const c = b.chords[b.chords.length > 1 && step >= 8 ? 1 : 0];
  return { root: S.key + c[0], type: c[1] };
}
// melody: motifs per section (a rhythm and a contour), repeated and answered over the phrase;
// chord tones on the strong beats, steps and small skips in between
const RHY = [[[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[2, 2], [4, 2], [6, 4], [10, 6]], [[0, 3], [3, 3], [6, 2], [8, 8]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]]];
function composeMelody(S) {
  const g = S.genre;
  if (g === 'lofi') return;
  const scale = (deg) => S.key + 60 + MAJ[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  let deg = 2;
  let motif = null, motifKind = null;
  S.bars.forEach((b, bi) => {
    const mel = b.kind !== 'intro' && b.kind !== 'outro' && !(g === 'jazz' && b.kind === 'solo' && hash(S.seed, bi, 9) < 0.15);
    if (!mel) return;
    const base = g === 'pop' ? (b.kind === 'chorus' ? 9 : 5) : g === 'jazz' ? 3 : 7;
    const swingLine = g === 'jazz' && b.kind === 'solo';
    if (b.kind !== motifKind || b.i % 4 === 0) motif = null;
    motifKind = b.kind;
    let rhy;
    if (swingLine) {
      rhy = [];
      for (let s = 0; s < 16; s += 2) if (hash(S.seed, bi, s, 3) > 0.22) rhy.push([s, 2]);
      if (hash(S.seed, bi, 7) < 0.3) rhy.push([14, 2]);
    } else rhy = RHY[Math.floor(hash(S.seed, b.kind.length, b.i % 2, 5) * RHY.length) % RHY.length];
    const repeat = !swingLine && b.i % 4 === 2 && motif;
    const out = [];
    rhy.forEach(([s, len], k) => {
      const ch = chordAt(S, bi, s);
      let m;
      if (repeat && motif[k] != null) m = motif[k];
      else {
        const r = hash(S.seed, bi, s, 11);
        deg += r < 0.42 ? 1 : r < 0.84 ? -1 : r < 0.92 ? 2 : -2;
        deg = Math.max(base - 4, Math.min(base + 5, deg));
        m = scale(deg);
      }
      // strong beats land on a chord tone
      if (s % 8 === 0 || len >= 6) {
        const tones = [];
        for (let o = -1; o <= 2; o++) for (const iv of CH[ch.type]) tones.push(ch.root + iv + 12 * (4 + o));
        m = tones.reduce((a, t) => (Math.abs(t - m) < Math.abs(a - m) ? t : a), tones[0]);
      }
      // the last note of a phrase: long, on the root or the third
      if (b.i % 4 === 3 && k === rhy.length - 1) { m = ch.root + 12 * 5 + (hash(S.seed, bi, 13) < 0.5 ? 0 : CH[ch.type][1]); while (m > scale(base + 6)) m -= 12; }
      out.push([s, len, m]);
    });
    if (!repeat && b.i % 4 === 0) motif = out.map((x) => x[2]);
    S.melody.set(bi, out);
  });
}

// what each genre plays on one 16th step (t: start time, sd: step duration)
function playStep(syn, S, bar, step, t, sd) {
  const b = S.bars[bar];
  if (!b) return;
  const ch = chordAt(S, bar, step), nxt = chordAt(S, bar + 1, 0) || ch;
  const g = S.genre, intro = b.kind === 'intro', outro = b.kind === 'outro';
  const fade = outro ? Math.max(0.15, 1 - (b.i + step / 16) / b.n) : intro ? Math.min(1, 0.45 + (b.i + step / 16) / b.n * 0.55) : 1;
  const H = (k) => hash(S.seed, bar, step, k);
  const mel = S.melody.get(bar);
  if (g === 'pop') {
    const chorus = b.kind === 'chorus' || outro;
    if (!intro || b.i >= 2) {
      if (step === 0 || step === 8 || (chorus && step === 6) || (chorus && step === 10 && H(1) < 0.4)) syn.kick(t, 0.5 * fade);
      if (step === 4 || step === 12) syn.snare(t, 0.32 * fade);
    }
    if (step % 2 === 0) syn.hat(t, (step % 4 === 2 ? 0.12 : 0.07) * fade, step === 14 && H(2) < 0.35);
    if (!intro || b.i >= 1) {
      if (step % 2 === 0) {
        let n = ch.root % 12 + 36;
        if (step === 6 || step === 14) n += H(3) < 0.5 ? 12 : 7;
        if (step === 14 && H(4) < 0.4) n = nxt.root % 12 + 36 + (H(5) < 0.5 ? -1 : 1);
        syn.bass(t, n, sd * 1.6, 0.34 * fade);
      }
    }
    const v = voicing(ch.root, ch.type, 57);
    if (step === 0 || step === 6 || step === 10) v.forEach((n) => syn.epiano(t, n, sd * (step === 0 ? 5 : 3), 0.07 * fade));
    if (chorus && (step === 0 || (step === 8 && S.bars[bar].chords.length > 1))) v.forEach((n) => syn.pad(t, n, sd * 7.5, 0.025 * fade, 1400));
  } else if (g === 'jazz') {
    if (step % 4 === 0 || step === 6 || step === 14) syn.ride(t, (step % 8 === 4 ? 0.09 : 0.07) * fade);
    if (step === 4 || step === 12) syn.hat(t, 0.06 * fade);
    if (H(1) < 0.12) syn.brush(t, 0.05 * fade);
    if (step % 4 === 0) {
      const beat = step / 4, iv = CH[ch.type];
      let n = ch.root % 12 + 36;
      if (beat === 1) n += iv[1 + Math.floor(H(2) * 2)];
      else if (beat === 2) n += iv[Math.floor(H(3) * iv.length)];
      else if (beat === 3) n = nxt.root % 12 + 36 + (H(4) < 0.5 ? -1 : 1);
      if (n > 50) n -= 12;
      syn.bass(t, n, sd * 3.6, 0.36 * fade, 520);
    }
    // comping: shell voicings on the Charleston and random pushes
    if ((step === 0 && H(5) < 0.6) || step === 6 || (step === 10 && H(6) < 0.35)) {
      const iv = CH[ch.type], r = ch.root % 12 + 48;
      [r + iv[1], r + iv[iv.length - 1], r + iv[1] + 14].forEach((n) => syn.piano(t, n, sd * 2, 0.06 * fade));
    }
  } else if (g === 'classic') {
    const v = voicing(ch.root, ch.type, 48);
    const arp = [v[0] - 12, v[2] ?? v[0] + 7, v[1], v[2] ?? v[0] + 7];
    if (step % 2 === 0) syn.piano(t, arp[(step / 2) % 4], sd * 2.2, 0.075 * fade);
    if (step === 0) {
      syn.piano(t, ch.root % 12 + 36, sd * 8, 0.09 * fade);
      voicing(ch.root, ch.type, 60).forEach((n) => syn.pad(t, n, sd * 15, 0.018 * fade, 1800));
    }
  } else {
    // lo-fi: lazy kit, warm seventh chords, a round bass
    if (step === 0 || step === 7 || (step === 10 && H(1) < 0.5)) syn.kick(t, 0.42 * fade);
    if (step === 4 || step === 12) syn.snare(t, 0.2 * fade, 1300);
    if (step % 2 === 0) syn.hat(t, 0.045 * fade);
    if (step === 0 || step === 7) voicing(ch.root, ch.type, 55).forEach((n) => syn.epiano(t, n, sd * 7, 0.06 * fade));
    if (step === 0 || step === 6 || step === 10) syn.bass(t, ch.root % 12 + 36, sd * 3, 0.32 * fade, 380);
    if (step === 3 && b.kind === 'b' && H(2) < 0.5) syn.bell(t, voicing(ch.root, ch.type, 72)[Math.floor(H(3) * 3)], sd * 4, 0.035 * fade);
  }
  if (mel) for (const [s, len, m] of mel) if (s === step) {
    if (g === 'pop') syn.bell(t, m + 12, len * sd, 0.07 * fade);
    else if (g === 'jazz') syn.reed(t, m, len * sd * 0.92, 0.07 * fade);
    else if (g === 'classic') syn.piano(t, m + 12, len * sd, 0.085 * fade);
  }
}

// --------------------------------------------------------------------------------- radio
export class RadioSet {
  constructor(app) {
    this.app = app;
    const S = (() => { try { return JSON.parse(localStorage.getItem('b787.tuner') || '{}'); } catch (e) { return {}; } })();
    this.on = !!S.on; this.band = S.band === 'AIR' ? 'AIR' : 'FM';
    this.freq = { FM: S.fm ?? 80.0, AIR: S.air ?? 128.8 };
    this.vol = S.vol ?? 0.7;
    this.open = false;
    this.ready = false;
    this._st = null; this._step = -1; this._song = null; this._talk = null; this._uiT = 0;
  }

  save() { try { localStorage.setItem('b787.tuner', JSON.stringify({ on: this.on, band: this.band, fm: this.freq.FM, air: this.freq.AIR, vol: this.vol })); } catch (e) { /* storage unavailable */ } }

  _init() {
    const A = this.app.audio;
    if (!A?.ctx || this.ready) return !!this.ready;
    const c = A.ctx;
    this.ctx = c;
    this.out = c.createGain(); this.out.gain.value = 0;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 11000;
    this.bus = c.createGain();
    this.bus.connect(hp); hp.connect(this.lp); this.lp.connect(this.out); this.out.connect(A.master);
    this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.bus);
    this.syn = new Synth(c, this.music);
    // station hiss and the lo-fi vinyl crackle
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; nf.Q.value = 0.4;
    this.hiss = c.createGain(); this.hiss.gain.value = 0;
    src.connect(nf); nf.connect(this.hiss); this.hiss.connect(this.bus); src.start();
    const cb = c.createBuffer(1, n, c.sampleRate), cd = cb.getChannelData(0);
    for (let i = 0; i < n; i++) cd[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() * 2 - 1) * 0.012;
    const cs = c.createBufferSource(); cs.buffer = cb; cs.loop = true;
    this.crackle = c.createGain(); this.crackle.gain.value = 0;
    cs.connect(this.crackle); this.crackle.connect(this.music); cs.start();
    this.epoch = c.currentTime - Math.random() * 1000;
    this.ready = true;
    return true;
  }

  // ---------------------------------------------------------------------- tuning
  get B() { return BANDS[this.band]; }
  tune(df) {
    const B = this.B;
    let f = Math.round((this.freq[this.band] + df) / B.step) * B.step;
    if (f > B.hi + 1e-6) f = B.lo; if (f < B.lo - 1e-6) f = B.hi;
    this.freq[this.band] = +f.toFixed(3);
    this.save(); this._render(true);
  }
  seek(dir) {
    const f = this.freq[this.band], L = [...this.B.list].sort((a, b) => a.f - b.f);
    const next = dir > 0 ? (L.find((s) => s.f > f + 1e-3) || L[0]) : ([...L].reverse().find((s) => s.f < f - 1e-3) || L[L.length - 1]);
    this.freq[this.band] = next.f;
    this.save(); this._render(true);
  }
  setBand(b) { this.band = b; this.save(); this._render(true); }
  power(on = !this.on) { this.on = on; if (!on) this._stopTalk(); this.save(); this._render(true); }

  // the nearest station to the dial and how well it comes in (0..1)
  _reception() {
    const f = this.freq[this.band], B = this.B, fm = this.app.fm;
    let st = null, best = 1e9;
    for (const s of B.list) { const d = Math.abs(s.f - f); if (d < best) { best = d; st = s; } }
    const w = this.band === 'FM' ? 0.11 : 0.013;
    const tuneK = Math.exp(-((best / w) ** 2));
    const h = Math.max(fm?.pos?.y ?? 0, 2);
    let sig = 1;
    if (this.band === 'FM') {
      // the network's transmitters are at the four cities
      const dmin = Math.min(...GEO.airports.map((a) => Math.hypot((fm?.pos.x ?? 0) - a.x, (fm?.pos.z ?? 0) - a.z))) / 1000;
      const range = 70 + 4.1 * Math.sqrt(h) * 0.6;
      sig = Math.max(0, Math.min(1, 1 - (dmin - range * 0.7) / (range * 0.5)));
    } else {
      const d = Math.hypot((fm?.pos.x ?? 0) - st.x, (fm?.pos.z ?? 0) - st.z) / 1000;
      const range = 25 + 4.12 * Math.sqrt(h);                        // radio horizon, km
      sig = Math.max(0, Math.min(1, 1 - (d - range * 0.85) / (range * 0.3)));
    }
    return { st, tuneK, sig, k: tuneK * sig };
  }

  // ATC on the flight radio takes over: stop the talk (it carries on with the next item)
  preempt() { if (this._talk?.speaking) { this._talk.cut = true; try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } }

  // ---------------------------------------------------------------------- per frame
  update(dt) {
    if (this.open) { this._uiT += dt; if (this._uiT > 0.25) { this._uiT = 0; this._render(); } }
    if (!this.on) { if (this.ready) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); return; }
    if (!this._init()) return;
    const c = this.ctx, now = c.currentTime;
    const rx = this._rx = this._reception();
    const atcBusy = !!(this.app.radio?.speaking || this.app.radio?.queue?.length);
    const on = this.app.audio.enabled !== false;
    this.out.gain.setTargetAtTime(on ? this.vol * 0.9 : 0, now, 0.08);
    this.lp.frequency.setTargetAtTime(this.band === 'FM' ? 11000 : 3200, now, 0.05);
    const st = rx.st, music = this.band === 'FM' && st.id !== 'news';
    const k = rx.k;
    const hissK = this.band === 'FM' ? (1 - k) * 0.22 + 0.006 : (rx.tuneK > 0.3 ? (1 - rx.sig) * 0.12 : 0.025);
    this.hiss.gain.setTargetAtTime(hissK, now, 0.05);
    this.music.gain.setTargetAtTime(music ? k * (atcBusy ? 0.3 : 1) : 0, now, atcBusy ? 0.15 : 0.08);
    this.crackle.gain.setTargetAtTime(music && st.id === 'lofi' ? 1 : 0, now, 0.1);
    // music: continuous broadcast time, songs in fixed slots; schedule the tuned station only
    if (music && k > 0.01) {
      const t = now - this.epoch + FM.indexOf(st) * 37.3;
      const slot = Math.floor(t / SLOT);
      if (!this._song || this._song.st !== st || this._song.slot !== slot) {
        this._song = { st, slot, S: makeSong(st.id, slot * 31 + FM.indexOf(st) * 1000 + 7), t0: now - (t - slot * SLOT) };
        this._step = -1;
        this._announced = false;
      }
      const S = this._song.S, sd = 60 / S.bpm / 4, song = this._song;
      const pos = now - song.t0;
      if (pos < S.dur) {
        let from = Math.max(this._step + 1, Math.floor(pos / sd));
        const to = Math.floor((pos + 0.3) / sd);
        for (let i = from; i <= to; i++) {
          const bar = Math.floor(i / 16), step = i % 16;
          if (bar >= S.bars.length) break;
          let tt = song.t0 + i * sd;
          if (S.swing && step % 4 === 2) tt += (S.swing - 0.5) * 4 * sd;
          if (tt >= now - 0.01) playStep(this.syn, S, bar, step, Math.max(tt, now), sd);
          this._step = i;
        }
        this.nowPlaying = `${S.title} — ${S.artist}`;
      } else {
        this.nowPlaying = `${st.name} — 次の曲 Next`;
        // between songs: the DJ names the song that just played
        if (!this._announced && rx.k > 0.6 && !atcBusy) {
          this._announced = true;
          this._talk = { st, speaking: false };
          this._speak(`${st.name}、お送りしたのは ${S.artist} で「${S.title}」でした。このあとも音楽をお楽しみください。`,
            `That was ${S.title} by ${S.artist}, on ${st.name}.`);
        }
      }
    } else if (!music) this._song = null;
    // talk: news on FM, the ATIS on the air band (and the DJ of the music station tuned)
    const owner = rx.k > 0.35 ? st : null;
    if (this._talk && this._talk.st !== owner) this._stopTalk(true);
    if (!music && owner && !atcBusy) this._talkStep(owner, rx);
  }

  // ---------------------------------------------------------------------- talk
  _voices() {
    const s = window.speechSynthesis;
    if (!s) return {};
    const v = s.getVoices();
    return { ja: v.find((x) => /^ja/i.test(x.lang)), en: v.find((x) => /^en-(US|GB)/i.test(x.lang)) || v.find((x) => /^en/i.test(x.lang)) };
  }
  _speak(ja, en, cb, lang = 'ja') {
    const s = window.speechSynthesis;
    if (!s || this.app.radio?.speaking) return;
    const V = this._voices();
    const useJa = lang === 'ja' && !!V.ja;
    const u = new SpeechSynthesisUtterance(useJa ? ja : en);
    if (useJa) { u.voice = V.ja; u.lang = 'ja-JP'; u.rate = 1.05; } else { if (V.en) u.voice = V.en; u.lang = 'en-US'; u.rate = lang === 'atis' ? 1.0 : 1.02; }
    u.volume = Math.min(1, this.vol * (this._rx?.k ?? 1) * (this.app.audio.enabled !== false ? 1 : 0));
    const T = this._talk || (this._talk = { st: null });
    T.speaking = true; T.cut = false;
    let done = false;
    const end = () => { if (done) return; done = true; T.speaking = false; cb?.(T.cut); };
    u.onend = end; u.onerror = end;
    try { s.speak(u); } catch (e) { end(); }
    setTimeout(end, 30000);
  }
  _stopTalk(all = true) {
    if (this._talk?.speaking) { this._talk.cut = true; try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    if (all) this._talk = null;
  }
  _talkStep(st, rx) {
    const T = this._talk || (this._talk = { st, i: 0, wait: 0 });
    if (T.st !== st) { T.st = st; T.i = 0; T.wait = 0; T.speaking = false; }
    if (T.speaking) return;
    const now = this.ctx.currentTime;
    if (now < (T.wait || 0)) return;
    if (st.id === 'atis') {
      const text = this._atis(st.apt);
      this.nowPlaying = `${aptName(st.apt)} ATIS`;
      this._speak(text, text, () => { T.wait = this.ctx.currentTime + 2.5; }, 'atis');
      return;
    }
    const items = this._news();
    const it = items[T.i % items.length];
    this.nowPlaying = `${st.name} — ${it.head}`;
    this._speak(it.ja, it.en, (cut) => {
      if (!cut) T.i++;
      T.wait = this.ctx.currentTime + (cut ? 1.5 : 1.2);
      if (!cut && T.i % 3 === 0) this._jingle();
    });
  }
  _jingle() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.05;
    this.synJ ||= new Synth(this.ctx, this.bus);
    [72, 76, 79, 84].forEach((m, i) => this.synJ.bell(t + i * 0.14, m, 0.25, 0.06 * (this._rx?.k ?? 1)));
  }
  _wx() {
    const A = this.app, W = A.world;
    const wdir = +(document.getElementById('windDir')?.value ?? 260), wkt = +(document.getElementById('windSpd')?.value ?? 8);
    const name = W?.weatherName || 'scattered';
    const vis = (W?.weather?.vis ?? 40000);
    const temp = Math.round({ clear: 21, scattered: 19, broken: 17, overcast: 15, rain: 13 }[name] ?? 18);
    return { wdir, wkt, name, vis, temp, dew: temp - ({ rain: 1, overcast: 3, broken: 6 }[name] ?? 9), qnh: name === 'rain' ? 1004 : name === 'overcast' ? 1008 : 1016 };
  }
  _clock() {
    const s = this.app.fids?.clock?.() ?? (this.app.world?.tod || 12) * 3600;
    const m = Math.floor(((s / 60) % 1440 + 1440) % 1440);
    return { h: Math.floor(m / 60), m: m % 60 };
  }
  _atis(apt) {
    const w = this._wx(), c = this._clock();
    const z = (c.h - 9 + 24) % 24;
    const letter = LETTERS[(c.h + apt * 5) % 26];
    const name = aptName(apt) || 'Tokyo';
    let rwy = '';
    if (apt === 1) {
      const R = this.app.worldData?.runways || [];
      const r = R.find((x) => x.ident === (this.app.traffic?.runway || '27')) || R[0];
      if (r?.name) rwy = `Landing and departing runway ${r.name.replace(/L$/, ' left').replace(/R$/, ' right').replace(/C$/, ' center')}. `;
    }
    const vis = w.vis >= 10000 ? '10 kilometers or more' : `${(w.vis / 1000).toFixed(0)} kilometers`;
    const cl = { clear: 'Sky clear', scattered: 'Few clouds 3000 feet', broken: 'Broken 2500 feet', overcast: 'Overcast 1500 feet', rain: 'Light rain. Overcast 1000 feet' }[w.name] || '';
    const sp = (n) => String(n).split('').join(' ');
    return `${name} information ${letter}, ${sp(String(z).padStart(2, '0') + '00')} zulu. ${rwy}Wind ${sp(String(Math.round(w.wdir / 10) * 10 || 360).padStart(3, '0'))} degrees ${w.wkt} knots. ` +
      `Visibility ${vis}. ${cl}. Temperature ${w.temp}, dew point ${w.dew}. QNH ${sp(w.qnh)}. Advise on initial contact you have information ${letter}.`;
  }
  _news() {
    const A = this.app, w = this._wx(), c = this._clock(), fm = A.fm;
    const city = aptName(1) || '東京';
    const T = A.traffic;
    const parked = T?.aircraft?.filter((a) => a.state === 'PARKED').length ?? 0;
    const going = T?.aircraft?.filter((a) => ['TUG', 'REQ_PUSH', 'PUSH_WAIT', 'PUSH', 'TAXI_WAIT', 'TAXI_OUT', 'HOLDING'].includes(a.state)).length ?? 0;
    const ms = Math.round(w.wkt * 0.514);
    const dir = DIR16[Math.round(((w.wdir % 360) + 360) % 360 / 22.5) % 16];
    const alt = Math.round((fm?.out?.altFt || 0) / 100) * 100;
    const air = !(fm?.out?.wow) && alt > 500;
    const near = GEO.airports.reduce((b, a) => (Math.hypot(fm.pos.x - a.x, fm.pos.z - a.z) < Math.hypot(fm.pos.x - b.x, fm.pos.z - b.z) ? a : b), GEO.airports[0]);
    const cs = A.playerCallsign || '';
    const items = [
      { head: '時報 Time', ja: `${c.h}時${c.m}分になりました。マイコム・ニュースをお伝えします。`, en: `It is ${c.h}:${String(c.m).padStart(2, '0')}. Here is the news.` },
      { head: '天気 Weather', ja: `${city}の現在の天気は${WX_JA[w.name] || '晴れ'}。気温は${w.temp}度、${dir}の風、風速${ms}メートルです。見通しは${w.vis >= 10000 ? '良好' : `${Math.round(w.vis / 1000)}キロ`}です。`,
        en: `Weather in ${city}: ${w.name}, ${w.temp} degrees, wind ${w.wkt} knots.` },
      { head: '空港 Airport', ja: `${city}空港では現在、${parked}機が駐機中で、${going}機が出発に向けて準備を進めています。空の便は${w.name === 'rain' ? '雨の影響で一部に遅れが出ていますが、おおむね' : 'すべて'}平常どおり運航しています。`,
        en: `At ${city} airport, ${parked} aircraft are at the gates and ${going} are preparing to depart.` },
      { head: '交通 Your flight', ja: air ? `${cs}便は現在、${aptName(near.id)}付近の上空、高度${alt}フィートを順調に飛行中です。` : `${cs}便は現在、地上で出発の準備中です。`,
        en: air ? `Flight ${cs} is cruising near ${aptName(near.id)} at ${alt} feet.` : `Flight ${cs} is on the ground, getting ready.` },
      { head: '話題 Topics', ja: ['マイコムソフト・エアロスペースの8発機、MA-W8 大鷹が、今日も長距離路線で活躍しています。', '空港の展望デッキは、飛行機を眺める家族連れでにぎわっています。',
        '飛行船クジラの遊覧飛行が人気を集めています。ゆっくりと流れる街の景色が魅力です。', '双胴機、比翼の大きな客室が、旅行客の間で話題になっています。'][c.h % 4],
      en: 'Micomsoft Aerospace aircraft are flying on busy routes today.' },
      { head: 'おわり End', ja: '以上、ニュースでした。このあとも、マイコム・ニュースをお聴きください。', en: 'That is the news. Stay tuned.' },
    ];
    return items;
  }

  // ---------------------------------------------------------------------- panel
  toggle(open = !this.open) {
    this.open = open;
    if (open && !this.el) this._build();
    if (this.el) this.el.classList.toggle('hidden', !open);
    if (open) { this._render(true); this.app.audio?.start?.(); }
  }

  _build() {
    const d = document.createElement('div');
    d.id = 'tuner'; d.className = 'hidden';
    d.innerHTML = `<style>
#tuner{position:fixed;right:14px;top:64px;z-index:12;width:min(330px,calc(100vw - 28px));background:var(--glass,rgba(12,14,18,.82));border:1px solid var(--glass-line,rgba(255,255,255,.1));
  border-radius:10px;box-shadow:var(--glass-shadow,0 10px 30px rgba(0,0,0,.45));color:#e9f2ff;font:500 12px/1.4 var(--hw,sans-serif);padding:10px 12px;backdrop-filter:blur(8px);user-select:none}
#tuner.hidden{display:none}
#tuner .tTop{display:flex;align-items:center;gap:8px;margin-bottom:8px}
#tuner .tTop b{font-size:13px;letter-spacing:.06em;flex:1}
#tuner button{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e9f2ff;border-radius:6px;padding:4px 8px;font:600 12px var(--hw,sans-serif);cursor:pointer}
#tuner button.on{background:#62e2ff;color:#04121a;border-color:#62e2ff}
#tuner .tLcd{background:#0b1a12;border-radius:6px;padding:8px 10px;font-family:"DSEG7 Classic",ui-monospace,Menlo,Consolas,monospace;color:#9dffb8;box-shadow:inset 0 0 12px rgba(0,0,0,.6)}
#tuner .tLcd.off{color:#31463a}
#tuner .tFreq{font-size:28px;letter-spacing:.04em;display:flex;align-items:baseline;gap:6px}
#tuner .tFreq small{font-size:12px;opacity:.75}
#tuner .tSt{font:700 12px var(--hw,sans-serif);color:#d7ffe2;min-height:16px}
#tuner .tNow{font:500 11px var(--hw,sans-serif);color:#9fd7b0;min-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tuner .tSig{display:inline-flex;gap:2px;align-items:flex-end;margin-left:auto}
#tuner .tSig i{display:block;width:4px;background:#2c4636}#tuner .tSig i.l{background:#9dffb8}
#tuner .tDial{position:relative;height:30px;margin:8px 0 6px;border-radius:5px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 1px,transparent 1px 10px),rgba(0,0,0,.35);cursor:ew-resize;overflow:hidden}
#tuner .tDial em{position:absolute;top:0;bottom:0;width:2px;background:#ff5a4a;box-shadow:0 0 6px #ff5a4a}
#tuner .tDial span{position:absolute;bottom:2px;font-size:9px;color:#9aa8b8;transform:translateX(-50%)}
#tuner .tDial s{position:absolute;top:3px;width:6px;height:6px;border-radius:50%;background:#62e2ff;transform:translateX(-50%)}
#tuner .tRow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}
#tuner .tRow input[type=range]{flex:1}
#tuner .tList{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
#tuner .tList button{font-size:11px;padding:3px 6px}
#tuner .tHelp{margin-top:6px;color:#8d9aab;font-size:10.5px}
</style>
<div class="tTop"><b>📻 RADIO</b><button data-a="band" data-b="FM">FM</button><button data-a="band" data-b="AIR">AIR</button><button data-a="power">⏻</button><button data-a="close">✕</button></div>
<div class="tLcd"><div class="tFreq"><span class="tF"></span><small class="tU"></small><span class="tSig"></span></div><div class="tSt"></div><div class="tNow"></div></div>
<div class="tDial"></div>
<div class="tRow"><button data-a="seek" data-d="-1">⏮</button><button data-a="tune" data-d="-1">◀</button><button data-a="tune" data-d="1">▶</button><button data-a="seek" data-d="1">⏭</button>
<span style="margin-left:6px">🔊</span><input type="range" class="tVol" min="0" max="1" step="0.05"></div>
<div class="tList"></div>
<div class="tHelp">8: 開く/閉じる ・ [ ] 選局 ・ Shift+[ ] 次の局 ・ ダイヤルをドラッグ / ホイール</div>`;
    document.body.appendChild(d);
    this.el = d;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.a;
      this.app.audio?.start?.();
      if (a === 'band') this.setBand(b.dataset.b);
      else if (a === 'power') this.power();
      else if (a === 'close') this.toggle(false);
      else if (a === 'tune') { if (!this.on) this.power(true); this.tune(+b.dataset.d * this.B.step); }
      else if (a === 'seek') { if (!this.on) this.power(true); this.seek(+b.dataset.d); }
      else if (a === 'st') { if (!this.on) this.power(true); this.freq[this.band] = +b.dataset.f; this.save(); this._render(true); }
    });
    const vol = d.querySelector('.tVol');
    vol.value = this.vol;
    vol.addEventListener('input', () => { this.vol = +vol.value; this.save(); });
    const dial = d.querySelector('.tDial');
    const setFromX = (x) => {
      const r = dial.getBoundingClientRect(), B = this.B;
      const f = B.lo + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (B.hi - B.lo);
      this.freq[this.band] = +(Math.round(f / B.step) * B.step).toFixed(3);
      if (!this.on) this.power(true);
      this.save(); this._render(true);
    };
    let drag = false;
    dial.addEventListener('pointerdown', (e) => { drag = true; dial.setPointerCapture(e.pointerId); setFromX(e.clientX); this.app.audio?.start?.(); });
    dial.addEventListener('pointermove', (e) => { if (drag) setFromX(e.clientX); });
    dial.addEventListener('pointerup', () => { drag = false; });
    dial.addEventListener('wheel', (e) => { e.preventDefault(); this.tune(Math.sign(e.deltaY) * -this.B.step); }, { passive: false });
    // keep game keys from reaching the flight controls while using the panel
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  _render(full = false) {
    if (!this.el || !this.open) return;
    const B = this.B, f = this.freq[this.band], d = this.el;
    d.querySelectorAll('[data-a=band]').forEach((b) => b.classList.toggle('on', b.dataset.b === this.band));
    d.querySelector('[data-a=power]').classList.toggle('on', this.on);
    d.querySelector('.tLcd').classList.toggle('off', !this.on);
    d.querySelector('.tF').textContent = this.band === 'FM' ? f.toFixed(1) : f.toFixed(3);
    d.querySelector('.tU').textContent = this.band === 'FM' ? 'FM MHz' : 'AIR MHz';
    const rx = this._reception();
    const lock = rx.tuneK > 0.5;
    const name = rx.st.id === 'atis' ? `${aptName(rx.st.apt)} ATIS` : rx.st.name;
    d.querySelector('.tSt').textContent = this.on ? (lock ? (rx.sig > 0.15 ? `${name}  ${rx.st.tag || ''}` : `${name} — 圏外 out of range`) : '— 受信なし —') : '';
    d.querySelector('.tNow').textContent = this.on && lock && rx.sig > 0.15 ? (this.nowPlaying || '') : '';
    const bars = Math.round((this.on ? rx.k : 0) * 5);
    d.querySelector('.tSig').innerHTML = [0, 1, 2, 3, 4].map((i) => `<i class="${i < bars ? 'l' : ''}" style="height:${4 + i * 3}px"></i>`).join('');
    if (full) {
      const x = (v) => ((v - B.lo) / (B.hi - B.lo) * 100).toFixed(2) + '%';
      const marks = this.band === 'FM' ? [76, 80, 85, 90, 95] : [118, 122, 126, 130, 134];
      d.querySelector('.tDial').innerHTML = marks.map((m) => `<span style="left:${x(m)}">${m}</span>`).join('') +
        B.list.map((s) => `<s style="left:${x(s.f)}"></s>`).join('') + `<em style="left:${x(f)}"></em>`;
      d.querySelector('.tList').innerHTML = B.list.map((s) => `<button data-a="st" data-f="${s.f}" class="${Math.abs(s.f - f) < 1e-3 ? 'on' : ''}">${this.band === 'FM' ? s.f.toFixed(1) + ' ' + s.name : s.f.toFixed(3) + ' ' + aptName(s.apt)}</button>`).join('');
    }
  }
}
