// Two-way radio between the player and the airport Ground / Tower (names from the menu).
//
// Each airport has its own frequencies: the player talks to the airport they are at (or
// flying to: the second airport east of the halfway line), and only that airport's
// controllers and traffic are heard (Radio.tuned).  The player makes context-sensitive
// requests (Y key or the radio hint): push back, taxi, ready for departure, landing, taxi to
// the gate.  The controllers answer using that airport's traffic picture (apron use, runway
// occupancy, arrival sequence), hold the player when needed and clear them when the runway
// is free.  Some calls are made by ATC on their own: departure hand-off, landing clearance on
// final, go-around, runway vacated, and a reprimand for a take-off without clearance.
import { hdg3, AIRPORT } from './atc.js';
import { A2 } from './airport2.js';

const NM = 1852;

export class PlayerATC {
  constructor(traffic) {
    this.T = traffic;
    this.reset('Claude 101');
  }

  reset(callsign) {
    this.cs = callsign;
    this.s = {};
    this.waiting = null;
    this.gate = null;
    this._apt = null;
  }

  get P() { return this.T.player; }

  // 1: home airport, 2: second airport (the player is east of the halfway line)
  get apt() { return this.P.x > A2.x / 2 ? 2 : 1; }

  // the airport the player is working with: stations, runway, taxiways, stands
  ctx() {
    const T = this.T;
    if (this.apt === 1) {
      const G = T.G;
      return { apt: 1, name: AIRPORT.name, twr: 'TWR', gnd: 'GND', ox: 0, oz: 0, half: 1850, R: T._rw(),
        conns: G.connectors, holdZ: G.holdZ, twy: 'Alpha', conn: 'A', stands: T.W.stands, gndFreq: 'one two one decimal niner' };
    }
    return { apt: 2, name: AIRPORT.name2, twr: 'TWR2', gnd: 'GND2', ox: A2.x, oz: A2.z, half: A2.len / 2 + 50,
      R: { id: '09', d: 1, tx: A2.x - A2.len / 2 }, conns: A2.conns.map((c) => A2.x + c), holdZ: A2.z - 66,
      twy: 'Bravo', conn: 'B', stands: T.a2Stands, gndFreq: 'one two one decimal six' };
  }

  // transmissions on the frequencies of the airport the player is working with
  say(who, text) {
    const me = who === this.cs;
    if (who === 'TWR' || who === 'GND') who += this.apt === 2 ? '2' : '';
    this.T.radio?.say(who, text, { me, apt: this.apt });
  }

  later(t, f) { this.T._later(t, f); }

  // where the player is: GATE / TAXI / HOLD / RUNWAY / AIR
  phase(C = this.ctx()) {
    const P = this.P;
    if (!P.active) return 'OFF';
    if (!P.onGround) return 'AIR';
    if (Math.abs(P.z - C.oz) < 45 && Math.abs(P.x - C.ox) < C.half) return 'RUNWAY';
    if (C.conns.some((c) => Math.hypot(P.x - c, P.z - C.holdZ) < 80)) return 'HOLD';
    const st = C.stands.find((s) => Math.abs(P.x - s.cg[0]) < 22 && Math.abs(P.z - s.cg[2]) < 30);
    if (st && P.v < 1) { this.gate = st; return 'GATE'; }
    return 'TAXI';
  }

  // distance before the threshold of the active runway and whether the player is lined up
  final(C = this.ctx()) {
    const P = this.P, R = C.R;
    const along = (R.tx - P.x) * R.d;
    const hdgOk = Math.abs(((P.a - (R.d > 0 ? 0 : Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < 0.4;
    const aligned = along > -300 && along < 20000 && Math.abs(P.z - C.oz) < 300 + along * 0.1 && hdgOk;
    return { along, aligned };
  }

  // ---------------------------------------------------------------- traffic picture per airport
  // an aircraft (other than the player) using the runway
  _busy(C) {
    const T = this.T;
    if (C.apt === 1) return T._runwayBusy(this.P);
    return (T.remote || []).find((a) => a.state === 'R_TKOF' || (a.state === 'R_TAXI' && a.v > 15 && Math.abs(a.z - A2.z) < 45)) || null;
  }

  // seconds until the next AI arrival touches down
  _eta(C) {
    const T = this.T;
    if (C.apt === 1) return T._arrivalEta(true);
    let eta = Infinity;
    for (const a of T.remote || []) {
      if (a.state !== 'R_OUT' || !a.route) continue;
      const rem = a.route.path.length - a.route.s;
      if (rem < 25000) eta = Math.min(eta, rem / Math.max(a.v, 50));
    }
    return eta;
  }

  // an AI arrival closer to the runway than the player (distance before the threshold)
  _ahead(C, along) {
    const T = this.T;
    if (C.apt === 1) return T.aircraft.find((a) => a.state === 'AIR' && a.air && T._leg(a) >= 4 && (a.air.tdS - a.air.s) < along);
    return (T.remote || []).find((a) => a.state === 'R_OUT' && a.route && a.route.path.length - a.route.s < along);
  }

  _lined(C) {
    if (C.apt === 1) return this.T.aircraft.some((a) => ['LINEUP', 'WAIT_TKOF', 'TAKEOFF'].includes(a.state));
    return (this.T.remote || []).some((a) => a.state === 'R_TKOF');
  }

  hint() {
    const ph = this.phase(), s = this.s;
    if (ph === 'GATE' && !s.push && !s.pushPending) return 'プッシュバック要求 Request push back';
    if (ph === 'TAXI' && s.landed && !s.taxiIn) return 'スポットへ Request taxi to the gate';
    if ((ph === 'TAXI' || ph === 'GATE') && !s.taxi && !s.landed) return 'タキシー要求 Request taxi';
    if ((ph === 'HOLD' || (ph === 'RUNWAY' && this.P.v < 3)) && !s.tkof && !this.waiting && !s.landed) return '離陸準備完了 Ready for departure';
    if (ph === 'AIR' && !s.inbound && !(s.tkof && !s.handoff)) return '着陸要求 Request landing';
    return '';
  }

  request() {
    const C = this.ctx(), ph = this.phase(C), s = this.s, cs = this.cs, R = C.R;
    if (ph === 'OFF') return;
    const face = R.d < 0 ? 'east' : 'west';
    if (ph === 'GATE' && !s.push && !s.pushPending) {
      s.pushPending = true;
      if (this.gate?.busy === 'player') this.gate.busy = null;       // leaving the second airport's stand
      this.say(cs, `${C.name} Ground, ${cs}, stand ${this.gate.id}, request push back and start up.`);
      this.later(3, () => {
        if (this.apronClear()) this.approvePush(face);
        else { this.say('GND', `${cs}, standby, traffic on the apron, expect push back shortly.`); }
      });
      return;
    }
    if (ph === 'TAXI' && s.landed && !s.taxiIn) {
      const st = this.pickGate(C);
      s.taxiIn = st ? st.id : null;
      this.say(cs, `${C.name} Ground, ${cs}, runway vacated, request taxi to the gate.`);
      this.later(3, () => {
        if (st) this.say('GND', `${cs}, taxi to stand ${st.id} via ${C.twy} and the apron taxilane.`);
        else this.say('GND', `${cs}, taxi to the apron via ${C.twy}, stand to be advised.`);
        this.later(3, () => this.say(cs, `Taxi to stand ${st ? st.id : ''} via ${C.twy}, ${cs}.`));
      });
      return;
    }
    if ((ph === 'TAXI' || ph === 'GATE') && !s.taxi && !s.landed) {
      const conn = R.d < 0 ? C.conns[C.conns.length - 1] : C.conns[0];
      const name = C.conn + (C.conns.indexOf(conn) + 1);
      s.taxi = true;
      this.say(cs, `${C.name} Ground, ${cs}, request taxi.`);
      this.later(3, () => {
        this.say('GND', `${cs}, taxi to holding point ${name} runway ${R.id} via ${C.twy}. QNH one zero one three.`);
        this.later(3.5, () => this.say(cs, `Taxi holding point ${name} runway ${R.id} via ${C.twy}, one zero one three, ${cs}.`));
      });
      return;
    }
    if ((ph === 'HOLD' || ph === 'RUNWAY') && !s.tkof && !this.waiting && !s.landed) {
      this.say(cs, `${C.name} Tower, ${cs}, ${ph === 'RUNWAY' ? 'lined up' : 'holding point'} runway ${R.id}, ready for departure.`);
      this.waiting = { t: this.T.time, told: false };
      return;
    }
    if (ph === 'AIR' && !s.inbound) {
      const f = this.final(C);
      const dist = Math.max(1, Math.round(Math.hypot(this.P.x - R.tx, this.P.z - C.oz) / NM));
      const ft = Math.round(this.P.alt / 0.3048 / 100) * 100;
      s.inbound = true;
      this.say(cs, `${C.name} Tower, ${cs}, ${dist} miles, ${ft} feet, request landing runway ${R.id}.`);
      this.later(3, () => {
        if (f.aligned && f.along < 20000) this.say('TWR', `${cs}, ${C.name} Tower, continue approach runway ${R.id}, report four miles final.`);
        else this.say('TWR', `${cs}, ${C.name} Tower, expect ILS approach runway ${R.id}, descend to three thousand feet, report established.`);
      });
    }
  }

  approvePush(face) {
    const cs = this.cs;
    this.s.push = true; this.s.pushPending = false;
    this.say('GND', `${cs}, push back and start up approved, facing ${face}.`);
    this.later(3, () => this.say(cs, `Push back and start up approved, facing ${face}, ${cs}.`));
  }

  // no AI aircraft moving on the apron near the player
  apronClear() {
    const P = this.P;
    if (this.apt === 2) return !(this.T.remote || []).some((a) => ['R_TAXI', 'R_PUSH', 'R_TAXIOUT'].includes(a.state) && a.z < A2.z - 180 && Math.abs(a.x - P.x) < 300);
    for (const u of this.T.apron) if (Math.abs((u.x ?? 0) - P.x) < 300) return false;
    return true;
  }

  pickGate(C = this.ctx()) {
    const T = this.T, P = this.P;
    if (C.apt === 2) {
      const free = T.a2Stands.filter((st) => !st.busy);
      if (!free.length) return null;
      free.sort((a, b) => Math.abs(a.cg[0] - P.x) - Math.abs(b.cg[0] - P.x));
      free[0].busy = 'player';                       // kept free of AI arrivals
      return free[0];
    }
    if (!T.freeStands.length) return null;
    let best = 0;
    for (let i = 1; i < T.freeStands.length; i++) {
      if (Math.abs(T.freeStands[i].cg[0] - P.x) < Math.abs(T.freeStands[best].cg[0] - P.x)) best = i;
    }
    return T.freeStands.splice(best, 1)[0];
  }

  // is the player cleared / holding for the runway right now (for the AI sequencing)
  runwayClaim(apt = 1) {
    const s = this.s;
    if (!this.P.active || this.apt !== apt) return false;
    return (s.tkof && !s.airborne) || (s.landCleared && !s.landed);
  }

  update(dt) {
    const P = this.P, T = this.T, cs = this.cs;
    if (!P.active) return;
    const C = this.ctx();
    // a new airport's frequencies: start over with its controllers
    if (this._apt !== C.apt) {
      if (this._apt !== null && !this.s.departed) this.s = { departed: !P.onGround };
      this._apt = C.apt; this.waiting = null;
    }
    const s = this.s, R = C.R;
    const ph = this.phase(C);
    P.state = C.apt === 1 && ph === 'RUNWAY' && P.v > 5 && !s.landed ? 'TAKEOFF' : undefined;
    // pending push back
    if (s.pushPending && !s.pushAsked && this.apronClear() && (s._pt = (s._pt || 0) + dt) > 6) this.approvePush(R.d < 0 ? 'east' : 'west');
    // departure sequence
    if (this.waiting) {
      const busy = this._busy(C);
      const eta = this._eta(C);
      const aiLined = this._lined(C);
      const lastT = C.apt === 1 ? T.lastTakeoff : -1e9;
      if (!busy && !aiLined && eta > 80 && T.time - lastT > 50) {
        this.waiting = null;
        s.tkof = true;
        this.say('TWR', `${cs}, wind ${hdg3(T.windDir)} at ${Math.round(T.windKt)} knots, runway ${R.id}, cleared for take-off.`);
        this.later(3, () => this.say(cs, `Cleared for take-off runway ${R.id}, ${cs}.`));
      } else if (!this.waiting.told && T.time - this.waiting.t > 4) {
        this.waiting.told = true;
        const why = eta <= 80 ? 'landing traffic on final' : busy || aiLined ? 'traffic on the runway' : 'departure ahead';
        this.say('TWR', `${cs}, hold position, ${why}. Expect departure shortly.`);
        this.later(3, () => this.say(cs, `Holding position, ${cs}.`));
      }
    }
    // take-off without clearance
    if (ph === 'RUNWAY' && P.v > 25 && !s.tkof && !s.landed && !s.warned && !s.landCleared) {
      s.warned = true;
      this.say('TWR', `${cs}, you are not cleared for take-off! Stop immediately if able.`);
    }
    if (s.tkof && !P.onGround && P.alt > 20) s.airborne = true;
    // departure hand-off
    if (s.tkof && s.airborne && P.alt > 300 && !s.handoff) {
      s.handoff = true;
      this.say('TWR', `${cs}, climb and maintain five thousand feet, contact Departure one two five decimal three, good day.`);
      this.later(3.5, () => this.say(cs, `Five thousand, one two five decimal three, ${cs}, good day.`));
      this.later(8, () => { this.s = { departed: true }; });
    }
    // approach / landing
    if (ph === 'AIR') {
      const f = this.final(C);
      if (!s.inbound && f.aligned && f.along < 12000 && P.alt < 900 && !(s.tkof && !s.handoff)) {
        s.inbound = true;
        this.say('TWR', `${cs}, ${C.name} Tower, radar contact on final runway ${R.id}.`);
      }
      if (s.inbound && f.aligned && f.along < 9000 && !s.landCleared) {
        const b = this._busy(C);
        const ahead = this._ahead(C, f.along);
        if ((!b || b.state === 'TAKEOFF') && !ahead) {
          s.landCleared = true;
          this.say('TWR', `${cs}, wind ${hdg3(T.windDir)} at ${Math.round(T.windKt)} knots, runway ${R.id}, cleared to land.`);
          this.later(3, () => this.say(cs, `Cleared to land runway ${R.id}, ${cs}.`));
        } else if (!s.continued) {
          s.continued = true;
          this.say('TWR', `${cs}, continue approach, number two, ${ahead ? 'traffic on short final' : 'traffic on the runway'}.`);
        }
      }
      if (s.inbound && f.aligned && f.along < 1800 && f.along > 0 && !s.landCleared && !s.ga) {
        s.ga = true;
        this.say('TWR', `${cs}, go around, I say again, go around. Climb to two thousand feet, runway heading.`);
        this.later(3.5, () => this.say(cs, `Going around, ${cs}.`));
        this.later(20, () => { s.inbound = false; s.ga = false; s.continued = false; });
      }
    }
    // on the ground after landing
    if (P.onGround && (s.landCleared || s.inbound) && !s.landed && ph === 'RUNWAY' && !s.tkof) s.landed = true;
    if (s.landed && !s.vacated && ph !== 'RUNWAY' && P.onGround) {
      s.vacated = true;
      this.say('TWR', `${cs}, runway vacated, contact Ground ${C.gndFreq}.`);
      this.later(3, () => this.say(cs, `${C.gndFreq[0].toUpperCase() + C.gndFreq.slice(1)}, ${cs}.`));
    }
    // arrived at the gate
    if (s.taxiIn && ph === 'GATE' && this.gate && this.gate.id === s.taxiIn && !s.welcome) {
      s.welcome = true;
      this.say('GND', `${cs}, welcome to ${C.name}. Shut down engines at stand ${s.taxiIn}.`);
      this.later(10, () => { this.s = {}; });
    }
  }
}
