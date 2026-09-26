// Radio: ATC (Ground / Tower) and AI pilot transmissions.
// Messages are shown in the radio log and, when enabled, spoken with the Web Speech API
// (controller and pilots with different voices), one transmission at a time.

export const FREQ = { GND: 'City Builder Ground 121.9', TWR: 'City Builder Tower 118.1' };
// airport names chosen in the menu (radio phrases, frequencies, signs)
export const AIRPORT = { name: 'City Builder', name2: 'Minato' };
export function setAirportNames(a) {
  Object.assign(AIRPORT, a);
  FREQ.GND = `${AIRPORT.name} Ground 121.9`; FREQ.TWR = `${AIRPORT.name} Tower 118.1`;
}

// VHF radio character around the synthesised voices: squelch burst when the carrier opens,
// band-limited (300 Hz - 2.7 kHz) crackling static under the transmission, and the squelch
// tail + click when it drops.  (Web Speech output cannot be routed through Web Audio, so the
// voice itself is only made thinner via rate/pitch; the radio sound is layered with it.)
class RadioFX {
  constructor() { this.ctx = null; this.timer = null; }

  _init() {
    if (this.ctx) return true;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    const c = this.ctx;
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.6 * b + 0.4 * (Math.random() * 2 - 1);
      d[i] = b + (Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 4 : 0);    // pops / crackle
    }
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2700; lp.Q.value = 1.4;
    const peak = c.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1500; peak.gain.value = 7;
    const sh = c.createWaveShaper();
    const cur = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cur[i] = Math.tanh(3 * x) * 0.8; }
    sh.curve = cur;
    this.g = c.createGain(); this.g.gain.value = 0;
    src.connect(hp); hp.connect(peak); peak.connect(lp); lp.connect(sh); sh.connect(this.g); this.g.connect(c.destination);
    src.start();
    return true;
  }

  _click(t, v) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = 900 + Math.random() * 400;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.04);
  }

  open(level = 1) {
    if (!this._init()) return;
    const c = this.ctx;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t = c.currentTime, G = this.g.gain;
    G.cancelScheduledValues(t);
    G.setValueAtTime(G.value, t);
    G.linearRampToValueAtTime(0.22 * level, t + 0.02);       // carrier opens: squelch burst
    G.linearRampToValueAtTime(0.045 * level, t + 0.16);
    this._click(t, 0.05 * level);
    clearInterval(this.timer);
    // static bed that crackles and fades like a real VHF signal
    this.timer = setInterval(() => {
      const n = c.currentTime;
      const v = (0.025 + Math.random() * 0.04 + (Math.random() < 0.12 ? 0.08 : 0)) * level;
      G.setTargetAtTime(v, n, 0.02);
    }, 70);
  }

  close(level = 1) {
    if (!this.ctx) return;
    clearInterval(this.timer); this.timer = null;
    const c = this.ctx, t = c.currentTime, G = this.g.gain;
    G.cancelScheduledValues(t);
    G.setValueAtTime(G.value, t);
    G.linearRampToValueAtTime(0.26 * level, t + 0.03);      // squelch tail ("kssh")
    G.setTargetAtTime(0.0, t + 0.2, 0.05);
    this._click(t + 0.22, 0.04 * level);
  }

  stop() {
    if (!this.ctx) return;
    clearInterval(this.timer); this.timer = null;
    this.g.gain.cancelScheduledValues(this.ctx.currentTime);
    this.g.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}

export class Radio {
  constructor(el) {
    this.el = el;
    this.lines = [];
    this.voice = true;
    this.noise = true;              // squelch / static around transmissions (menu option)
    this.enabled = true;
    this.queue = [];
    this.speaking = false;
    this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    this._voices = null;
    this.fx = new RadioFX();
    this.tuned = 1;
  }

  // change to the other airport's frequencies: calls in progress there are no longer heard
  tune(apt) {
    if (apt === this.tuned) return false;
    this.tuned = apt;
    this.clear();
    return true;
  }

  _pickVoices() {
    if (!this.synth) return;
    const v = this.synth.getVoices().filter((x) => /^en/i.test(x.lang));
    if (!v.length) return;
    this._voices = {
      atc: v.find((x) => /US|United States/i.test(x.lang + x.name)) || v[0],
      pilot: v.find((x) => /GB|UK|Australia|India/i.test(x.lang + x.name)) || v[Math.min(1, v.length - 1)],
    };
  }

  // who: 'GND' | 'TWR' (controller) or a pilot callsign; text: the transmission
  // apt: the airport whose frequencies carry the call (1 home, 2 second airport); only the
  // airport the radio is tuned to (the one the player is at / flying to) is heard
  say(who, text, { station = null, me = false, apt = null } = {}) {
    if (!this.enabled) return;
    // 'GND' / 'TWR': home airport; 'GND2' / 'TWR2': the second airport
    const atc = /^(GND|TWR)2?$/.test(who);
    const two = atc && who.endsWith('2');
    if ((apt ?? (two ? 2 : 1)) !== this.tuned) return;
    const label = atc ? (two ? AIRPORT.name2.toUpperCase() + ' ' : '') + (who.startsWith('GND') ? 'GROUND' : 'TOWER') : who;
    this.lines.push({ label: me ? label + ' (YOU)' : label, text, atc, me, t: performance.now() });
    if (this.lines.length > 6) this.lines.shift();
    this.render();
    if (this.voice && this.synth) {
      this.queue.push({ text, atc, me, pitch: atc ? 1.0 : me ? 1.12 : 0.85 + ((hash(who) % 30) / 100) });
      if (this.queue.length > 4) this.queue.splice(0, this.queue.length - 4);
      this._next();
    }
  }

  _next() {
    if (this.speaking || !this.queue.length || !this.synth) return;
    if (!this._voices) this._pickVoices();
    const m = this.queue.shift();
    const u = new SpeechSynthesisUtterance(m.text.replace(/(\d)(?=\d)/g, '$1 '));
    // clipped, hurried radio delivery; the player's own transmissions are a little louder
    u.rate = 1.2; u.pitch = m.pitch * 1.08; u.volume = m.me ? 0.6 : 0.5;
    const v = this._voices && (m.atc ? this._voices.atc : this._voices.pilot);
    if (v) u.voice = v;
    this.speaking = true;
    const lvl = m.me ? 0.7 : 1;
    let closed = false;
    if (this.noise) try { this.fx.open(lvl); } catch (e) { /* no audio */ }
    const done = () => {
      if (closed) return;
      closed = true;
      if (this.noise) try { this.fx.close(lvl); } catch (e) { /* no audio */ }
      this.speaking = false; setTimeout(() => this._next(), 450);
    };
    u.onend = done; u.onerror = done;
    try { this.synth.speak(u); } catch (e) { done(); }
    // safety: some engines never fire onend
    setTimeout(() => { if (!closed) done(); }, 14000);
  }

  clear() {
    this.lines.length = 0; this.queue.length = 0;
    if (this.synth) try { this.synth.cancel(); } catch (e) { /* ignore */ }
    this.fx.stop();
    this.speaking = false;
    this.render();
  }

  render() {
    if (!this.el) return;
    const now = performance.now();
    this.el.innerHTML = this.lines.map((l) => {
      const age = (now - l.t) / 1000;
      const op = Math.max(0.35, 1 - Math.max(0, age - 20) / 40);
      return `<div class="${l.atc ? 'atc' : l.me ? 'me' : 'plt'}" style="opacity:${op.toFixed(2)}"><b>${esc(l.label)}</b> ${esc(l.text)}</div>`;
    }).join('');
    this.el.classList.toggle('hidden', !this.lines.length);
  }
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function hash(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// radiotelephony helpers
const DIG = ['zero', 'one', 'two', 'three', 'four', 'fife', 'six', 'seven', 'eight', 'niner'];
export const rwyWords = (id) => id;
export const hdg3 = (h) => String(Math.round(h) % 360 || 360).padStart(3, '0');
export { DIG };
