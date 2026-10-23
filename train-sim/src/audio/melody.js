// Departure melodies (発車メロディ) played on the platform before the doors close.

import { ClipPlayer, LOCAL_MELODY_URL } from './announce.js';
import { MELODY_CLIPS, DEFAULT_ASSIGN, DEFAULT_ASSIGN_UP, MELODY_EXPECTED_DURATION } from './melody-cues.js';

// (v2: the defaults are now researched, so old guessed assignments are not carried over)
const STORE_KEYS = { down: 'tsim.melodyAssign2', up: 'tsim.melodyAssignUp2' };
const DEFAULTS = { down: DEFAULT_ASSIGN, up: DEFAULT_ASSIGN_UP };

export class MelodyPlayer extends ClipPlayer {
  constructor(sound) {
    super(sound, 'melBus', MELODY_EXPECTED_DURATION);
    this.enabled = true;
    this.setDirection('down');
  }

  /** separate per-station assignments for 宇都宮方面 (down) and 上野方面 (up) departures */
  setDirection(dir) {
    this.dir = dir === 'up' ? 'up' : 'down';
    this.randomPick = new Map();
    this.assign = { ...DEFAULTS[this.dir] };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEYS[this.dir]) || 'null');
      if (saved && typeof saved === 'object') Object.assign(this.assign, saved);
    } catch { /* storage unavailable */ }
  }

  tryLocal() { return super.tryLocal(LOCAL_MELODY_URL); }

  setAssign(station, no) {
    this.assign[station] = no;
    try { localStorage.setItem(STORE_KEYS[this.dir], JSON.stringify(this.assign)); } catch { /* ignore */ }
  }

  resetAssign() {
    this.assign = { ...DEFAULTS[this.dir] };
    try { localStorage.removeItem(STORE_KEYS[this.dir]); } catch { /* ignore */ }
  }

  clip(no) { return MELODY_CLIPS.find((c) => c.no === no); }

  /**
   * the melody number for a station: its assignment, or for stations without one (the
   * 東海道線 / 上野東京ライン stretch 小田原–東京 and the 湘南新宿ライン) a random melody,
   * kept for the rest of the run so a station does not change tune between visits
   */
  noFor(station) {
    if (this.assign[station] != null) return this.assign[station];
    if (!this.randomPick) this.randomPick = new Map();
    if (!this.randomPick.has(station)) this.randomPick.set(station, MELODY_CLIPS[Math.floor(Math.random() * MELODY_CLIPS.length)].no);
    return this.randomPick.get(station);
  }

  /** a new run: draw new random melodies */
  reshuffle() { this.randomPick = new Map(); }

  /** length (s) of the melody for a station, or of the fallback jingle */
  durationFor(station) {
    if (this.audio) {
      const c = this.clip(this.noFor(station));
      if (c) return c.end - c.start;
    }
    return 6.4;
  }

  /** play the departure melody for `station`; returns its length in seconds */
  playFor(station) {
    if (!this.enabled) return 0;
    if (this.audio) {
      const c = this.clip(this.noFor(station));
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
