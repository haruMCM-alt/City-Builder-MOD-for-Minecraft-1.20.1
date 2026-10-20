import { fmtTime } from './timetable.js';
import { CUES } from './audio/announce-cues.js';

/**
 * Station-to-station game flow: doors, departure, stopping, scoring and
 * triggering the in-car announcements.
 */
export class Game {
  constructor({ route, physics, timetable, sound, announcer, melody, hud, fromIdx, service }) {
    this.service = service || null;
    this.route = route;
    this.ph = physics;
    this.tt = timetable;
    this.sound = sound;
    this.ann = announcer;
    this.melody = melody;
    this.hud = hud;
    this.fromIdx = fromIdx; // index in the full station list of tt[0]
    this.ti = 1; // index into tt of the target (next) stop
    this.state = 'dwell';
    this.score = 0;
    this.results = [];
    this.clock = tt0(timetable) - 45;
    this.stateT = 0;
    this.depT = null;
    this.announced = { dep: false, arr: false };
    this.stillT = 0;
    this.finished = false;
    this.penalties = 0;
    this.ph.s = timetable[0].station.s;
    this.ph.doorsOpen = true;
    this.doorSide = timetable[0].station.door;     // platform side of the doors now in use
    this.introPlayed = false;
  }

  get target() { return this.tt[this.ti]; }
  get current() { return this.tt[this.ti - 1]; }
  get terminal() { return this.ti === this.tt.length - 1; }
  stationIndex(row) { return row.station.index; }

  addScore(n, label) {
    this.score += n;
    return label;
  }

  /** skip waiting at a station */
  /** how long the melody runs here: the whole clip at the origin, cut to fit short stops */
  melodyLength() {
    if (!this.melody || !this.melody.enabled) return 0;
    const row = this.current;
    const full = this.melody.durationFor(row.station.name);
    if (row.arr == null) return full;
    return Math.min(full, Math.max(6, row.dep - row.arr - 17));
  }

  skipWait() {
    if (this.state === 'dwell' && this.current.dep != null) {
      const ml = this.melodyLength();
      const t = this.current.dep - 12 - (ml ? ml + 1.5 : 0) - 4;
      if (this.clock < t) this.clock = t;
    }
  }

  startClosing() {
    this.state = 'closing';
    this.stateT = 0;
    this.closeAt = this.sound.doorChime() || 2.2;
    this.doorSample = this.sound.usesDoorSample();
    this.hud.message('ドアが閉まります', 'info', 2);
  }

  update(dt) {
    const ph = this.ph;
    this.clock += dt;
    this.stateT += dt;
    const ann = this.ann;

    if (this.state === 'dwell') {
      const row = this.current;
      if (!this.introPlayed && this.ti === 1 && this.stateT > 2) {
        this.introPlayed = true;
        // the recorded intro names the local train; rapid services only get it from the speech synthesizer
        const local = !this.service || !this.service.stops;
        if (this.fromIdx === 0 && ann.has('intro') && (local || ann.mode !== 'file')) ann.play('intro', {});
      }
      const ml = row.dep != null ? this.melodyLength() : 0;
      if (row.dep != null && this.clock >= row.dep - 12 - (ml ? ml + 1.5 : 0)) {
        if (ml) {
          // platform departure melody first, then the door chime
          this.melDur = Math.min(this.melody.playFor(row.station.name) || ml, ml);
          this.state = 'melody';
          this.stateT = 0;
        } else this.startClosing();
      }
    } else if (this.state === 'melody') {
      if (this.stateT >= this.melDur) {
        if (this.melody.playing) this.melody.stopClip(false); // the conductor releases the button
        this.startClosing();
      }
    } else if (this.state === 'closing') {
      const closeStart = this.doorSample ? this.closeAt - 1.2 : 2.2;
      if (this.stateT > closeStart && ph.doorsOpen === true) {
        if (!this.doorSample) this.sound.doorMove(false);   // the recording already contains the doors
        ph.doorsOpen = 'closing';
      }
      if (this.stateT > (this.doorSample ? this.closeAt + 0.8 : 4.5)) {
        ph.doorsOpen = false;
        this.state = 'ready';
        this.stateT = 0;
        this.goShown = false;
        this.hud.message('戸閉よし', 'info', 2);
      }
    } else if (this.state === 'ready') {
      if (!this.goShown && this.clock >= this.current.dep - 2) {
        this.goShown = true;
        this.hud.message('出発進行！', 'go', 3);
        this.sound.chime();
      }
      if (ph.v > 0.3) {
        this.state = 'running';
        this.stateT = 0;
        this.depT = this.clock;
        const early = this.current.dep - this.clock;
        if (early > 3) this.hud.message(`早発 ${Math.round(early)}秒 <small>-5</small>`, 'bad', 2.5), this.addScore(-5);
        this.announced = { dep: false, arr: false };
      }
    } else if (this.state === 'running') {
      this.updateRunning(dt);
    } else if (this.state === 'arrived') {
      if (this.stateT > 1.2 && !ph.doorsOpen) {
        ph.doorsOpen = true;
        this.doorSide = this.target.station.door;
        this.sound.doorMove(true);
      }
      if (this.stateT > 3) {
        if (this.ti >= this.tt.length - 1) {
          this.state = 'finished';
          this.finished = true;
        } else {
          this.ti++;
          this.state = 'dwell';
          this.stateT = 0;
        }
      }
    }
  }

  updateRunning(dt) {
    const ph = this.ph;
    const tgt = this.target;
    const sIdx = this.stationIndex(tgt);
    const dist = tgt.station.s - ph.s;
    const kmh = ph.kmh;
    // announcements
    const depId = `dep:${sIdx}`, arrId = `arr:${sIdx}`;
    const ctx = { station: tgt.station, door: tgt.station.door, terminal: this.terminal };
    if (!this.announced.dep && (kmh > 25 || this.stateT > 15)) {
      this.announced.dep = true;
      if (this.ann.has(depId)) this.ann.play(depId, ctx);
    }
    if (!this.announced.arr) {
      const c = CUES[arrId];
      const dur = this.ann.mode === 'file' && c ? c[1] - c[0] : 8;
      let lead = Math.max(380, ph.v * dur * 0.8 + 260);
      if (CUES[`fin:${sIdx}`] && this.ann.mode === 'file') lead = Math.max(lead, 1500);
      if (dist < lead) {
        this.announced.arr = true;
        if (this.ann.has(arrId)) this.ann.play(arrId, ctx);
      }
    }
    // conductor's last words before the terminal (file mode only)
    const finId = `fin:${sIdx}`;
    if (this.announced.arr && !this.announced.fin && this.ann.mode === 'file' && CUES[finId] && dist < 420 && !this.ann.playing) {
      this.announced.fin = true;
      this.ann.play(finId, ctx);
    }
    // stopped?
    if (ph.v < 0.01) this.stillT += dt; else this.stillT = 0;
    if (this.stillT > 0.8 && dist < 5 && dist > -35) this.arrive(dist);
    else if (this.stillT > 0.8 && dist >= 5 && dist < 300 && this.stillT < 0.85) {
      this.hud.message(`停止位置まで あと ${dist.toFixed(1)} m`, 'info', 2);
    }
    // passed the station without stopping
    if (dist < -40) {
      this.hud.message(`${tgt.station.name} 通過！ <small>-50</small>`, 'bad', 3.5);
      this.addScore(-50);
      this.results.push({ name: tgt.station.name, pass: true, err: null, dt: null, pts: -50 });
      if (this.terminal) { this.state = 'finished'; this.finished = true; return; }
      this.ti++;
      this.announced = { dep: true, arr: false };
    }
  }

  arrive(dist) {
    const ph = this.ph;
    const tgt = this.target;
    const err = -dist; // + = overrun
    const ae = Math.abs(err);
    let pts = 0, label;
    if (ae <= 0.05) { pts = 30; label = 'ぴったり停止！'; }
    else if (ae <= 0.5) { pts = 20; label = 'GREAT'; }
    else if (ae <= 1.0) { pts = 10; label = 'GOOD'; }
    else if (ae <= 3.0) { pts = 0; label = 'OK'; }
    else if (err > 0) { pts = -20; label = 'オーバーラン'; }
    else { pts = -5; label = '停止位置手前'; }
    const late = this.clock - tgt.arr;
    let tp = 0, tl;
    if (Math.abs(late) <= 1) { tp = 20; tl = '定着'; }
    else if (Math.abs(late) <= 5) { tp = 10; tl = late > 0 ? `${Math.round(late)}秒遅れ` : `${Math.round(-late)}秒早着`; }
    else if (late > 0) { tp = -Math.min(30, Math.floor(late / 5)); tl = `${Math.round(late)}秒遅れ`; }
    else { tp = -Math.min(15, Math.floor(-late / 10)); tl = `${Math.round(-late)}秒早着`; }
    let jolt = 0;
    if (ph.brake > 0.6) jolt = -5;
    const total = pts + tp + jolt;
    this.addScore(total);
    const sign = err >= 0 ? '+' : '−';
    this.hud.message(
      `<div class="big">${label}</div>停止位置 ${sign}${ae.toFixed(2)} m　/　${tl}${jolt ? '　/　停止衝動 -5' : ''}<div class="pts">${total >= 0 ? '+' : ''}${total}</div>`,
      total >= 20 ? 'great' : total >= 0 ? 'good' : 'bad', 4.5);
    this.results.push({ name: tgt.station.name, err, late, pts: total, label, tl });
    this.state = 'arrived';
    this.stateT = 0;
    this.stillT = 0;
  }

  /** derived values for the HUD */
  hudData() {
    const ph = this.ph;
    const tgt = this.target;
    const dist = tgt ? tgt.station.s - ph.s : null;
    let delay = 0, delayText = '';
    if (this.state === 'running' && tgt) {
      // Densha de GO style: time left until the scheduled arrival
      const left = tgt.arr - this.clock;
      delay = -left;
      const a = Math.abs(left);
      delayText = `${left < 0 ? '延着 ' : '残り '}${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}`;
      if (left >= 0) delay = Math.min(0, delay);
    } else if (this.current && this.current.dep != null) {
      delay = this.clock - this.current.dep;
      if (this.state === 'dwell' || this.state === 'closing' || this.state === 'melody') delayText = '';
      else delayText = delay > 3 ? `発車 ${Math.round(delay)}秒遅れ` : '';
    }
    let depText = '';
    if (this.state === 'dwell' || this.state === 'closing' || this.state === 'melody') depText = `発車 ${fmtTime(this.current.dep)}`;
    return { dist, delay, delayText, depText, next: tgt, terminal: this.terminal, targetIdx: this.ti, running: this.state === 'running' };
  }
}

function tt0(tt) { return tt[0].dep; }
