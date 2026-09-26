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
import { hdg3, AIRPORT, aptName } from './atc.js';
import { remoteById, nearestAirport } from './airports.js';

const NM = 1852;

export class PlayerATC {
  constructor(traffic) {
    this.T = traffic;
    this.reset('Japan Air 101');
  }

  reset(callsign) {
    this.cs = callsign;
    this.s = {};
    this.waiting = null;
    this.gate = null;
    this._apt = null;
  }

  get P() { return this.T.player; }

  // the airport the player is at / nearest to: 1 home, 2-4 the remote airports
  get apt() { return nearestAirport(this.P.x, this.P.z); }

  // the airport the player is working with: stations, runway, taxiways, stands
  ctx() {
    const T = this.T;
    if (this.apt === 1) {
      const G = T.G;
      return { apt: 1, name: AIRPORT.name, twr: 'TWR', gnd: 'GND', ox: 0, oz: 0, half: 1850, R: T._rw(),
        conns: G.connectors, holdZ: G.holdZ, twy: 'Alpha', conn: 'A', stands: T.W.stands, gndFreq: 'one two one decimal niner' };
    }
    // a remote airport: the runway direction its traffic uses (towards home, see Traffic.rwSide)
    const ap = remoteById(this.apt), sx = ap.x >= 0 ? 1 : -1;
    return { apt: ap.id, ap, name: aptName(ap.id), ox: ap.x, oz: ap.z, half: ap.len / 2 + 50,
      R: { id: sx > 0 ? '09' : '27', d: sx, tx: ap.x - sx * ap.len / 2 }, conns: ap.conns.map((c) => ap.x + c), holdZ: ap.z + ap.holdZ,
      twy: 'Bravo', conn: 'B', stands: T.remoteStands?.[ap.id] || [], gndFreq: 'one two one decimal six' };
  }

  // transmissions on the frequencies of the airport the player is working with
  say(who, text) {
    const me = who === this.cs;
    if ((who === 'TWR' || who === 'GND') && this.apt > 1) who += this.apt;
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
    return (T.remote || []).find((a) => a.rap === C.ap && (a.state === 'R_TKOF' || (a.state === 'R_TAXI' && a.v > 15 && Math.abs(a.z - C.oz) < 45))) || null;
  }

  // seconds until the next AI arrival touches down
  _eta(C) {
    const T = this.T;
    if (C.apt === 1) return T._arrivalEta(true);
    let eta = Infinity;
    for (const a of T.remote || []) {
      if (a.state !== 'R_OUT' || !a.route || a.rap !== C.ap) continue;
      const rem = a.route.path.length - a.route.s;
      if (rem < 25000) eta = Math.min(eta, rem / Math.max(a.v, 50));
    }
    return eta;
  }

  // an AI arrival closer to the runway than the player (distance before the threshold)
  _ahead(C, along) {
    const T = this.T;
    if (C.apt === 1) return T.aircraft.find((a) => a.state === 'AIR' && a.air && T._leg(a) >= 4 && (a.air.tdS - a.air.s) < along);
    return (T.remote || []).find((a) => a.state === 'R_OUT' && a.rap === C.ap && a.route && a.route.path.length - a.route.s < along);
  }

  _lined(C) {
    if (C.apt === 1) return this.T.aircraft.some((a) => ['LINEUP', 'WAIT_TKOF', 'TAKEOFF'].includes(a.state));
    return (this.T.remote || []).some((a) => a.state === 'R_TKOF' && a.rap === C.ap);
  }

  // ---------------------------------------------------------------- emergencies
  // what the damage calls for: 'MAYDAY' (distress), 'PAN' (urgency) or null
  emergencyKind() {
    const D = this.P.dmg;
    if (!D) return null;
    const fire = D.engFire[0] || D.engFire[1] || D.wingFire[0] || D.wingFire[1];
    if (fire || D.eng[0] >= 2 || D.eng[1] >= 2 || (D.eng[0] && D.eng[1]) || D.wing[0] > 0.2 || D.wing[1] > 0.2 || D.tail > 0.3) return 'MAYDAY';
    if (D.eng[0] || D.eng[1] || D.leak > 0 || D.wing[0] || D.wing[1] || D.tail || D.struck) return 'PAN';
    return null;
  }

  // the problem in radio words
  problem() {
    const D = this.P.dmg, out = [];
    for (let i = 0; i < 2; i++) {
      const sd = i ? 'right' : 'left';
      if (D.engFire[i]) out.push(`${sd} engine fire`);
      else if (D.eng[i] >= 2) out.push(`${sd} engine separated`);
      else if (D.eng[i]) out.push(`${sd} engine failure`);
    }
    if (D.wingFire[0] || D.wingFire[1]) out.push('wing fire');
    else if (D.wing[0] || D.wing[1]) out.push('wing damage');
    if (D.tail) out.push('tail damage');
    if (D.leak && !out.length) out.push('fuel leak');
    if (D.struck && out.length < 2) out.unshift('struck a building');
    return out.slice(0, 2).join(' and ') || 'technical problem';
  }

  // the runway in world.json format for the airport the player is working with
  worldRunway(C = this.ctx()) {
    const T = this.T;
    return C.apt === 1 ? T._rw().r : T.W.runways.find((x) => x.apt === C.apt && x.ident === C.R.id);
  }

  // MAYDAY / PAN-PAN: priority, squawk 7700, landing clearance, rescue services
  declare(kind) {
    const C = this.ctx(), P = this.P, T = this.T, s = this.s, cs = this.cs, R = C.R;
    const word = kind === 'MAYDAY' ? 'Mayday, mayday, mayday' : 'Pan-pan, pan-pan, pan-pan';
    const ack = kind === 'MAYDAY' ? 'Mayday' : 'Pan-pan';
    s.mayday = { kind, apt: C.apt, t: T.time };
    s.squawk = '7700';
    const souls = 180 + ((cs.length * 37) % 120);
    const fuelMin = Math.max(20, Math.round((P.fuel || 20000) / 110));
    if (P.onGround) {
      this.say(cs, `${word}, ${C.name} Tower, ${cs}, ${this.problem()}, stopping on the ${P.v > 3 ? 'runway' : 'ground'}, request emergency assistance, ${souls} persons on board.`);
      this.later(4, () => {
        this.say('TWR', `${cs}, ${C.name} Tower, roger ${ack}. Emergency services are on their way to you. Hold position.`);
        this.later(4, () => this.say(cs, `Holding position, ${cs}.`));
        T.onEmergency?.({ apt: C.apt, runway: this.worldRunway(C), onGround: true });
      });
      return;
    }
    s.inbound = true; s.landCleared = true; s.continued = true;
    this.say(cs, `${word}, ${C.name} Tower, ${cs}, ${this.problem()}, request immediate landing runway ${R.id}, ${souls} persons on board, fuel ${fuelMin} minutes.`);
    this.later(4, () => {
      // vectors to a 12 km final
      const fx = R.tx - R.d * 12000, fz = C.oz;
      const dx = fx - P.x, dz = fz - P.z, dist = Math.hypot(dx, dz);
      const f = this.final(C);
      const hdg = Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360 / 5) * 5 || 360;
      const vec = f.aligned && f.along < 20000 ? `continue approach` : `turn heading ${hdg3(hdg)}, ${Math.max(1, Math.round(dist / NM))} miles to final, descend at your discretion`;
      this.say('TWR', `${cs}, ${C.name} Tower, roger ${ack}. Squawk seven seven zero zero. ${vec[0].toUpperCase() + vec.slice(1)}. Runway ${R.id} cleared to land, wind ${hdg3(T.windDir)} at ${Math.round(T.windKt)} knots. Emergency services are standing by.`);
      this.later(7, () => this.say(cs, `Squawk seven seven zero zero, cleared to land runway ${R.id}, ${cs}.`));
      this.later(12, () => this.say('TWR', `All stations, ${C.name} Tower, emergency in progress. All departures hold position, arriving traffic expect holding.`));
      T.onEmergency?.({ apt: C.apt, runway: this.worldRunway(C), onGround: false });
    });
  }

  hint() {
    const ph = this.phase(), s = this.s;
    const ek = this.emergencyKind();
    if (ek && !s.mayday) return ek === 'MAYDAY' ? '🆘 メーデー宣言 Declare MAYDAY' : '⚠ パンパン宣言 Declare PAN-PAN';
    if (s.mayday && !s.autoLand && !this.P.onGround && !s.landed) return '🛬 緊急自動着陸 Auto emergency landing';
    if (ph === 'GATE' && !s.push && !s.pushPending) return 'プッシュバック要求 Request push back';
    if (ph === 'TAXI' && s.landed && !s.taxiIn) return 'スポットへ Request taxi to the gate';
    if ((ph === 'TAXI' || ph === 'GATE') && !s.taxi && !s.landed) return 'タキシー要求 Request taxi';
    if ((ph === 'HOLD' || (ph === 'RUNWAY' && this.P.v < 3)) && !s.tkof && !this.waiting && !s.landed) return '離陸準備完了 Ready for departure';
    if (ph === 'AIR' && !s.inbound && !(s.tkof && !s.handoff)) return '着陸要求 Request landing';
    return '';
  }

  request() {
    const C = this.ctx(), ph = this.phase(C), s = this.s, cs = this.cs, R = C.R;
    const ek = this.emergencyKind();
    if (ek && !s.mayday && ph !== 'OFF') { this.declare(ek); return; }
    if (s.mayday && !s.autoLand && !this.P.onGround && !s.landed) { this.T.onAutoLand?.(); return; }
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
    if (this.apt > 1) {
      const ap = remoteById(this.apt);
      return !(this.T.remote || []).some((a) => a.rap === ap && ['R_TAXI', 'R_PUSH', 'R_TAXIOUT'].includes(a.state) && a.z < ap.z - 180 && Math.abs(a.x - P.x) < 300);
    }
    for (const u of this.T.apron) if (Math.abs((u.x ?? 0) - P.x) < 300) return false;
    return true;
  }

  pickGate(C = this.ctx()) {
    const T = this.T, P = this.P;
    if (C.apt > 1) {
      const free = C.stands.filter((st) => !st.busy);
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
    return (s.tkof && !s.airborne) || (s.landCleared && !s.landed) || !!(s.mayday && !s.closedOut);
  }

  // emergency follow-up: handover, observed damage, brace call, rescue on the runway, close-out
  emergencyUpdate(dt, C) {
    const s = this.s, P = this.P, T = this.T, cs = this.cs;
    const M = s.mayday;
    if (!M) {
      const D = P.dmg;
      // taxiing into a building: the aircraft stops, the fire trucks come to inspect it
      if (D?.bump && P.onGround && !s.bumpCall) {
        s.bumpCall = true;
        s.mayday = { kind: 'PAN', apt: C.apt, t: T.time, ground: true };
        this.later(2, () => {
          this.say(P.v > 20 ? 'TWR' : 'GND', `${cs}, ${C.name} ${P.v > 20 ? 'Tower' : 'Ground'}, we observed you contact a building. Hold position, shut down the affected engine, fire services are on the way to inspect the aircraft.`);
          this.later(4, () => this.say(cs, `Holding position, ${cs}.`));
          T.onEmergency?.({ apt: C.apt, runway: this.worldRunway(C), onGround: true });
        });
        return;
      }
      // landed with damage but never declared: the tower sends the fire services anyway
      if (!P.onGround && P.alt > 30) s.wasAir = true;
      const ek = this.emergencyKind();
      if (ek && P.onGround && s.wasAir && !s.autoDispatch) {
        s.autoDispatch = true;
        s.mayday = { kind: ek, apt: C.apt, t: T.time, auto: true };
        this.later(2, () => this.say('TWR', `${cs}, ${C.name} Tower, we observed your aircraft is damaged. Emergency services dispatched, stop on the runway.`));
        T.onEmergency?.({ apt: C.apt, runway: this.worldRunway(C), onGround: true });
        return;
      }
      // tower sees a problem the crew has not declared (a building strike right away)
      if (this.emergencyKind() && !P.onGround && !s.askedEmerg) {
        s._eT = (s._eT || 0) + dt;
        if (s._eT > (D?.struck ? 4 : 20)) {
          s.askedEmerg = true;
          this.say('TWR', D?.struck ? `${cs}, ${C.name} Tower, we observed you strike a building! Say your condition. Are you declaring an emergency?`
            : `${cs}, ${C.name} Tower, are you declaring an emergency? Say intentions.`);
        }
      }
      return;
    }
    if (M.apt !== C.apt && !P.onGround) {
      M.apt = C.apt;
      s.inbound = true; s.landCleared = true; s.continued = true;
      this.say('TWR', `${cs}, ${C.name} Tower, we have your ${M.kind === 'MAYDAY' ? 'Mayday' : 'Pan-pan'}. Runway ${C.R.id} cleared to land, emergency services are standing by.`);
      T.onEmergency?.({ apt: C.apt, runway: this.worldRunway(C), onGround: false });
    }
    if (M.kind === 'MAYDAY' && !P.onGround && P.alt < 300 && !s.braced && (P.dmg?.wing[0] > 0.2 || P.dmg?.wing[1] > 0.2 || P.dmg?.wingFire?.some(Boolean) || (P.dmg?.eng[0] && P.dmg?.eng[1]))) {
      s.braced = true; T.onBrace?.();
    }
    if (P.onGround && !s.rescue && (s.landed || T.time - M.t > 8)) {
      s.rescue = true;
      T.onEmergencyLanded?.();
    }
    if (s.rescue && P.v < 1.5 && !s.stoppedCall) {
      s.stoppedCall = true;
      if (M.ground) this.say('GND', `${cs}, fire services are with you, inspecting the aircraft. Remain on this frequency.`);
      else this.say('TWR', `${cs}, emergency services are with you. Runway ${C.R.id} closed. Report when ready to taxi, or advise if you require evacuation.`);
    }
    // no fire any more and stopped for a while: close out, the runway reopens
    if (s.stoppedCall && !s.closedOut) {
      const D = P.dmg, fire = D && (D.engFire[0] || D.engFire[1] || D.wingFire[0] || D.wingFire[1]);
      s._cT = fire ? 0 : (s._cT || 0) + dt;
      if (s._cT > (M.ground ? 30 : 45)) {
        s.closedOut = true; s.squawk = null;
        if (M.ground) {
          this.say('GND', `${cs}, inspection complete, no fire. Continue taxi when ready, keep clear of the building.`);
          s.mayday = null; s.rescue = s.stoppedCall = s.closedOut = false; s._cT = 0;
        } else this.say('TWR', `${cs}, fire services report the aircraft safe. Runway ${C.R.id} reopened for traffic. Taxi when able, follow the fire vehicles.`);
        T.onEmergencyEnd?.();
      }
    }
  }

  update(dt) {
    const P = this.P, T = this.T, cs = this.cs;
    if (!P.active) return;
    const C = this.ctx();
    // a new airport's frequencies: start over with its controllers
    if (this._apt !== C.apt) {
      // an emergency is handed over to the next airport's controllers
      if (this._apt !== null && !this.s.departed) this.s = { departed: !P.onGround, mayday: this.s.mayday, squawk: this.s.squawk };
      this._apt = C.apt; this.waiting = null;
    }
    this.emergencyUpdate(dt, C);
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
