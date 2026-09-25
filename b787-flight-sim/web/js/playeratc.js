// Two-way radio between the player and the airport Ground / Tower (name from the menu).
//
// The player makes context-sensitive requests (Y key or the radio hint): push back, taxi,
// ready for departure, landing, taxi to the gate.  The controllers answer using the same
// traffic picture as for the AI aircraft (apron use, runway occupancy, arrival sequence),
// hold the player when needed and clear them when the runway is free.  Some calls are
// made by ATC on their own: departure hand-off, landing clearance on final, go-around,
// runway vacated, and a reprimand for a take-off without clearance.
import { hdg3, AIRPORT } from './atc.js';

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
  }

  get P() { return this.T.player; }

  say(who, text) { this.T.radio?.say(who, text, { me: who === this.cs }); }

  later(t, f) { this.T._later(t, f); }

  rw() { return this.T._rw(); }

  // where the player is: GATE / TAXI / HOLD / RUNWAY / AIR
  phase() {
    const P = this.P, G = this.T.G;
    if (!P.active) return 'OFF';
    if (!P.onGround) return 'AIR';
    if (Math.abs(P.z) < 45 && Math.abs(P.x) < 1850) return 'RUNWAY';
    if (G.connectors.some((c) => Math.hypot(P.x - c, P.z - G.holdZ) < 80)) return 'HOLD';
    const st = this.T.W.stands.find((s) => Math.abs(P.x - s.cg[0]) < 22 && Math.abs(P.z - s.cg[2]) < 30);
    if (st && P.v < 1) { this.gate = st; return 'GATE'; }
    return 'TAXI';
  }

  // distance before the threshold of the active runway and whether the player is lined up
  final() {
    const P = this.P, R = this.rw();
    const along = (R.tx - P.x) * R.d;
    const hdgOk = Math.abs(((P.a - (R.d > 0 ? 0 : Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < 0.4;
    const aligned = along > -300 && along < 20000 && Math.abs(P.z) < 300 + along * 0.1 && hdgOk;
    return { along, aligned };
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
    const ph = this.phase(), s = this.s, cs = this.cs, R = this.rw(), T = this.T, G = T.G;
    if (ph === 'OFF') return;
    const face = R.d < 0 ? 'east' : 'west';
    if (ph === 'GATE' && !s.push && !s.pushPending) {
      s.pushPending = true;
      this.say(cs, `${AIRPORT.name} Ground, ${cs}, stand ${this.gate.id}, request push back and start up.`);
      this.later(3, () => {
        if (this.apronClear()) this.approvePush(face);
        else { this.say('GND', `${cs}, standby, traffic on the apron, expect push back shortly.`); }
      });
      return;
    }
    if (ph === 'TAXI' && s.landed && !s.taxiIn) {
      const st = this.pickGate();
      s.taxiIn = st ? st.id : null;
      this.say(cs, `${AIRPORT.name} Ground, ${cs}, runway vacated, request taxi to the gate.`);
      this.later(3, () => {
        if (st) this.say('GND', `${cs}, taxi to stand ${st.id} via Alpha and the apron taxilane.`);
        else this.say('GND', `${cs}, taxi to the apron via Alpha, stand to be advised.`);
        this.later(3, () => this.say(cs, `Taxi to stand ${st ? st.id : ''} via Alpha, ${cs}.`));
      });
      return;
    }
    if ((ph === 'TAXI' || ph === 'GATE') && !s.taxi && !s.landed) {
      const conn = R.d < 0 ? G.connectors[G.connectors.length - 1] : G.connectors[0];
      const name = 'A' + (G.connectors.indexOf(conn) + 1);
      s.taxi = true;
      this.say(cs, `${AIRPORT.name} Ground, ${cs}, request taxi.`);
      this.later(3, () => {
        this.say('GND', `${cs}, taxi to holding point ${name} runway ${R.id} via Alpha. QNH one zero one three.`);
        this.later(3.5, () => this.say(cs, `Taxi holding point ${name} runway ${R.id} via Alpha, one zero one three, ${cs}.`));
      });
      return;
    }
    if ((ph === 'HOLD' || ph === 'RUNWAY') && !s.tkof && !this.waiting && !s.landed) {
      this.say(cs, `${AIRPORT.name} Tower, ${cs}, ${ph === 'RUNWAY' ? 'lined up' : 'holding point'} runway ${R.id}, ready for departure.`);
      this.waiting = { t: T.time, told: false };
      return;
    }
    if (ph === 'AIR' && !s.inbound) {
      const f = this.final();
      const dist = Math.max(1, Math.round(Math.hypot(this.P.x - R.tx, this.P.z) / NM));
      const ft = Math.round(this.P.alt / 0.3048 / 100) * 100;
      s.inbound = true;
      this.say(cs, `${AIRPORT.name} Tower, ${cs}, ${dist} miles, ${ft} feet, request landing runway ${R.id}.`);
      this.later(3, () => {
        if (f.aligned && f.along < 20000) this.say('TWR', `${cs}, ${AIRPORT.name} Tower, continue approach runway ${R.id}, report four miles final.`);
        else this.say('TWR', `${cs}, ${AIRPORT.name} Tower, expect ILS approach runway ${R.id}, descend to three thousand feet, report established.`);
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
    for (const u of this.T.apron) if (Math.abs((u.x ?? 0) - P.x) < 300) return false;
    return true;
  }

  pickGate() {
    const T = this.T, P = this.P;
    if (!T.freeStands.length) return null;
    let best = 0;
    for (let i = 1; i < T.freeStands.length; i++) {
      if (Math.abs(T.freeStands[i].cg[0] - P.x) < Math.abs(T.freeStands[best].cg[0] - P.x)) best = i;
    }
    return T.freeStands.splice(best, 1)[0];
  }

  // is the player cleared / holding for the runway right now (for the AI sequencing)
  runwayClaim() {
    const s = this.s;
    return (s.tkof && !s.airborne) || (s.landCleared && !s.landed);
  }

  update(dt) {
    const P = this.P, T = this.T, s = this.s, cs = this.cs;
    if (!P.active) return;
    const R = this.rw();
    const ph = this.phase();
    P.state = ph === 'RUNWAY' && P.v > 5 && !s.landed ? 'TAKEOFF' : undefined;
    // pending push back
    if (s.pushPending && !s.pushAsked && this.apronClear() && (s._pt = (s._pt || 0) + dt) > 6) this.approvePush(R.d < 0 ? 'east' : 'west');
    // departure sequence
    if (this.waiting) {
      const busy = T._runwayBusy(P);
      const eta = T._arrivalEta(true);
      const aiLined = T.aircraft.some((a) => ['LINEUP', 'WAIT_TKOF', 'TAKEOFF'].includes(a.state));
      if (!busy && !aiLined && eta > 80 && T.time - T.lastTakeoff > 50) {
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
      const f = this.final();
      if (!s.inbound && f.aligned && f.along < 12000 && P.alt < 900 && !(s.tkof && !s.handoff)) {
        s.inbound = true;
        this.say('TWR', `${cs}, ${AIRPORT.name} Tower, radar contact on final runway ${R.id}.`);
      }
      if (s.inbound && f.aligned && f.along < 9000 && !s.landCleared) {
        const b = T._runwayBusy(P);
        const ahead = T.aircraft.find((a) => a.state === 'AIR' && a.air && T._leg(a) >= 4 && (a.air.tdS - a.air.s) < f.along);
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
      this.say('TWR', `${cs}, runway vacated, contact Ground one two one decimal niner.`);
      this.later(3, () => this.say(cs, `One two one decimal niner, ${cs}.`));
    }
    // arrived at the gate
    if (s.taxiIn && ph === 'GATE' && this.gate && this.gate.id === s.taxiIn && !s.welcome) {
      s.welcome = true;
      this.say('GND', `${cs}, welcome to ${AIRPORT.name}. Shut down engines at stand ${s.taxiIn}.`);
      this.later(10, () => { this.s = {}; });
    }
  }
}
