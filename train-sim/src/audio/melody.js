// Departure melodies (発車メロディ) played on the platform before the doors close.

import { ClipPlayer, LOCAL_MELODY_URL } from './announce.js';
import { MELODY_CLIPS, DEFAULT_ASSIGN, MELODY_EXPECTED_DURATION } from './melody-cues.js';

const STORE_KEY = 'tsim.melodyAssign';

export class MelodyPlayer extends ClipPlayer {
  constructor(sound) {
    super(sound, 'melBus', MELODY_EXPECTED_DURATION);
    this.assign = { ...DEFAULT_ASSIGN };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') Object.assign(this.assign, saved);
    } catch { /* storage unavailable */ }
    this.enabled = true;
  }

  tryLocal() { return super.tryLocal(LOCAL_MELODY_URL); }

  setAssign(station, no) {
    this.assign[station] = no;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.assign)); } catch { /* ignore */ }
  }

  resetAssign() {
    this.assign = { ...DEFAULT_ASSIGN };
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }

  clip(no) { return MELODY_CLIPS.find((c) => c.no === no); }

  /** length (s) of the melody for a station, or of the fallback jingle */
  durationFor(station) {
    if (this.audio) {
      const c = this.clip(this.assign[station]);
      if (c) return c.end - c.start;
    }
    return 6.4;
  }

  /** play the departure melody for `station`; returns its length in seconds */
  playFor(station) {
    if (!this.enabled) return 0;
    if (this.audio) {
      const c = this.clip(this.assign[station]);
      if (c) return this.playRange(station, c.start, c.end);
    }
    return this.sound.fallbackMelody ? this.sound.fallbackMelody() : 0;
  }

  preview(no) {
    const c = this.clip(no);
    if (!c || !this.audio) return 0;
    // preview may run before the game's audio graph exists: play the element directly
    this.audio.currentTime = c.start;
    this.audio.play().catch(() => {});
    this.current = { id: 'preview', end: c.end };
    clearInterval(this._pv);
    this._pv = setInterval(() => {
      if (!this.current || this.audio.currentTime >= this.current.end) { this.audio.pause(); this.current = null; clearInterval(this._pv); }
    }, 50);
    return c.end - c.start;
  }
}
