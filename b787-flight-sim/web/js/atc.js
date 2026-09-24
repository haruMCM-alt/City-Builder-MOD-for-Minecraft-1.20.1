// Radio: ATC (Ground / Tower) and AI pilot transmissions.
// Messages are shown in the radio log and, when enabled, spoken with the Web Speech API
// (controller and pilots with different voices), one transmission at a time.

export const FREQ = { GND: 'City Builder Ground 121.9', TWR: 'City Builder Tower 118.1' };

export class Radio {
  constructor(el) {
    this.el = el;
    this.lines = [];
    this.voice = true;
    this.enabled = true;
    this.queue = [];
    this.speaking = false;
    this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    this._voices = null;
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
  say(who, text, { station = null } = {}) {
    if (!this.enabled) return;
    const atc = who === 'GND' || who === 'TWR';
    const label = atc ? (who === 'GND' ? 'GROUND' : 'TOWER') : who;
    this.lines.push({ label, text, atc, t: performance.now() });
    if (this.lines.length > 6) this.lines.shift();
    this.render();
    if (this.voice && this.synth) {
      this.queue.push({ text, atc, pitch: atc ? 1.0 : 0.85 + ((hash(who) % 30) / 100) });
      if (this.queue.length > 4) this.queue.splice(0, this.queue.length - 4);
      this._next();
    }
  }

  _next() {
    if (this.speaking || !this.queue.length || !this.synth) return;
    if (!this._voices) this._pickVoices();
    const m = this.queue.shift();
    const u = new SpeechSynthesisUtterance(m.text.replace(/(\d)(?=\d)/g, '$1 '));
    u.rate = 1.12; u.pitch = m.pitch; u.volume = 0.55;
    const v = this._voices && (m.atc ? this._voices.atc : this._voices.pilot);
    if (v) u.voice = v;
    this.speaking = true;
    const done = () => { this.speaking = false; setTimeout(() => this._next(), 350); };
    u.onend = done; u.onerror = done;
    try { this.synth.speak(u); } catch (e) { done(); }
    // safety: some engines never fire onend
    setTimeout(() => { if (this.speaking) done(); }, 9000);
  }

  clear() {
    this.lines.length = 0; this.queue.length = 0;
    if (this.synth) try { this.synth.cancel(); } catch (e) { /* ignore */ }
    this.speaking = false;
    this.render();
  }

  render() {
    if (!this.el) return;
    const now = performance.now();
    this.el.innerHTML = this.lines.map((l) => {
      const age = (now - l.t) / 1000;
      const op = Math.max(0.35, 1 - Math.max(0, age - 20) / 40);
      return `<div class="${l.atc ? 'atc' : 'plt'}" style="opacity:${op.toFixed(2)}"><b>${esc(l.label)}</b> ${esc(l.text)}</div>`;
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
