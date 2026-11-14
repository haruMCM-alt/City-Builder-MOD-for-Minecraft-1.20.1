// Platform announcements: the station's own speakers announce our train as it approaches
// (「まもなく○番線に…が参ります」), call the station name when it has stopped, and warn that the
// doors are closing after the departure melody. Heard from the platform: loud outside, faint
// in the cab (through the body like every outside sound).
import { STATION_CLIPS } from './station-cues.js';
import { SpatialVoice } from './spatial.js';

const URL_ = new URL('../../assets/sounds/station_announce.mp3', import.meta.url);

export class PlatformAnnouncer {
  constructor(sound) {
    this.sound = sound;
    this.buf = null;
    this.voice = null;
    this.src = null;
    this.where = null;          // { s0, s1 } platform range (route s) of the station speaking now
    this.enabled = true;
  }

  async load() {
    if (this.buf || this.loading) return this.loading;
    const ctx = this.sound.ctx;
    if (!ctx) return null;
    this.loading = fetch(URL_).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => ctx.decodeAudioData(b)).then((b) => { this.buf = b; })
      .catch((e) => console.warn('platform announcements unavailable', e));
    return this.loading;
  }

  /**
   * the clip to use. ctx = { station, dir, service, dest }.
   * approach: the station's own recording for this direction / service / destination, otherwise the same
   * announcement recorded at another station (track numbers then differ); name / door: the station's own only.
   */
  pick(kind, c) {
    const same = (x) => x.kind === kind && (x.dir == null || x.dir === c.dir);
    if (kind === 'approach') {
      const fit = STATION_CLIPS.filter((x) => same(x) && x.service === c.service && x.dest === c.dest);
      return fit.find((x) => x.station === c.station) || fit[0] || null;
    }
    return STATION_CLIPS.find((x) => same(x) && x.station === c.station) || null;
  }

  duration(kind, c) { const x = this.pick(kind, c); return x ? x.t1 - x.t0 : 0; }

  /** play a clip from the platform [s0, s1] (route s); returns its length (s) or 0 */
  play(kind, c, where) {
    if (!this.enabled || !this.buf || !this.sound.ready) return 0;
    const x = this.pick(kind, c);
    if (!x) return 0;
    const ctx = this.sound.ctx;
    this.stop();
    if (!this.voice) this.voice = new SpatialVoice(ctx, this.sound.worldBus, { ref: 12, gain: 0.55, maxDist: 900 });
    this.where = where;
    const s = ctx.createBufferSource();
    s.buffer = this.buf;
    // a hint of the station's hall: a short slap from the canopy
    const g = ctx.createGain(); g.gain.value = 1;
    const d = ctx.createDelay(0.3); d.delayTime.value = 0.09;
    const dg = ctx.createGain(); dg.gain.value = 0.22;
    s.connect(g).connect(this.voice.input);
    s.connect(d).connect(dg).connect(this.voice.input);
    s.start(ctx.currentTime + 0.05, x.t0, x.t1 - x.t0);
    this.src = s;
    s.onended = () => { if (this.src === s) this.src = null; };
    (window.__platLog ||= []).push(`${x.id}@${c.station}`);
    return x.t1 - x.t0;
  }

  stop() { if (this.src) { try { this.src.stop(); } catch { /* */ } this.src = null; } }

  get playing() { return !!this.src; }

  /** keep the voice on the platform, at the speaker nearest the listener; pose(s) → {x, y, z} */
  update(listenerS, pose) {
    if (!this.voice || !this.where) return;
    const s = Math.min(this.where.s1, Math.max(this.where.s0, listenerS));
    const p = pose(s);
    this.voice.set(p.x, p.y + 4.2, p.z);
    this.voice.update(this.sound.L, this.sound.ctx.currentTime, this.sound.jump);
  }
}
