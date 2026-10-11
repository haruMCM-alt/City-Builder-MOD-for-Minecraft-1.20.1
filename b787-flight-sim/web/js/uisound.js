// Interface sounds: the soft click of every on-screen button and the menu music
// (tools/menu_bgm/compose.py). They have their own AudioContext: the menu plays before the
// flight audio has started and while it is suspended (pause menu).

// buttons and other controls that click when pressed
const CLICKABLE = 'button, select, input[type="checkbox"], input[type="radio"], [role="button"], a[href], .chk, #title';
// the music file loops [PRE, PRE + LOOP): it carries half a second of pre/post roll
const PRE = 0.5, LOOP = 60;

export class UISound {
  constructor({ url, enabled, musicOn }) {
    this.url = url;
    this.enabled = enabled;           // () => sound on at all
    this.musicOn = musicOn;           // () => the menu-music option
    this.ctx = null;
    this.want = false;                // the menu is on screen
    this._buf = null; this._src = null; this._loading = null;
    const gesture = (e) => {
      this._ensure();
      if (e.type === 'pointerdown') {
        if (e.button !== 0) return;
        const el = e.target.closest?.(CLICKABLE);
        if (el && !el.disabled && !el.closest('[disabled]')) this.click();
      } else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.matches?.('button, [role="button"]')) this.click();
    };
    window.addEventListener('pointerdown', gesture, { capture: true, passive: true });
    window.addEventListener('keydown', gesture, { capture: true, passive: true });
  }

  // the context can only start on a user gesture (autoplay policy)
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = this.ctx = new AC();
      this.out = ctx.createGain(); this.out.connect(ctx.destination);
      this.musicG = ctx.createGain(); this.musicG.gain.value = 0; this.musicG.connect(this.out);
      this._clickBuf = this._makeClick();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._sync();
    return this.ctx;
  }

  // "pochi": a short pitch-dropping pop with a tiny tick on top, 70 ms
  _makeClick() {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.round(sr * 0.07);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let ph = 0, seed = 12345;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 620 + 980 * Math.exp(-t / 0.009);
      ph += 2 * Math.PI * f / sr;
      const body = Math.sin(ph) * Math.min(1, t / 0.0008) * Math.exp(-t / 0.014);
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const tick = (seed / 0x7fffffff * 2 - 1) * Math.exp(-t / 0.0012) * 0.35;
      d[i] = (body * 0.8 + tick) * 0.9;
    }
    // a gentle high-pass of the tick's low end: difference of the signal and its smoothed copy
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += (d[i] - lp) * 0.02; d[i] -= lp * 0.6; }
    return b;
  }

  click() {
    if (!this.ctx || !this.enabled()) return;
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = this._clickBuf;
    s.playbackRate.value = 0.96 + Math.random() * 0.08;       // never quite the same twice
    g.gain.value = 0.32;
    s.connect(g); g.connect(this.out);
    s.start();
  }

  // the menu (or the title screen) is shown / hidden
  setMenu(on) { if (on !== this.want) { this.want = on; this._sync(); } }

  // the sound options changed
  refresh() { this._sync(); }

  _sync() {
    const ctx = this.ctx;
    if (!ctx) return;
    const on = this.want && this.enabled() && this.musicOn();
    const g = this.musicG.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    if (on) {
      if (!this._src) this._play();
      g.linearRampToValueAtTime(0.42, t + 1.5);
    } else if (this._src) {
      g.linearRampToValueAtTime(0, t + 0.8);
      const src = this._src; this._src = null;
      if (src.started) src.stop(t + 0.85);
    }
  }

  async _play() {
    const ctx = this.ctx;
    const src = this._src = ctx.createBufferSource();
    try {
      this._buf ||= await (this._loading ||= fetch(this.url).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)));
    } catch (e) { this._loading = null; if (this._src === src) this._src = null; return; }
    if (this._src !== src) return;    // the menu closed while the file was loading
    src.buffer = this._buf;
    src.loop = true;
    src.loopStart = PRE;
    src.loopEnd = Math.min(PRE + LOOP, this._buf.duration);
    src.connect(this.musicG);
    src.start(); src.started = true;
  }
}
