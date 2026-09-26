// Auto flight: a virtual crew that flies the player's aircraft from the home runway to the
// destination airport chosen in the flight settings, using the aircraft's own systems.
//
//   TAKEOFF   flaps 5, take-off thrust, runway tracking with the rudder, rotation at VR,
//             gear up, A/P + A/T on at 800 ft
//   CLIMB     LNAV-style heading steering along the route, climb to the cruise level,
//             flaps retracted on the speed schedule, 250 kt below 10,000 ft
//   CRUISE    level at the cruise altitude (chosen from the distance), 290 kt
//   DESCENT   from the top of descent to 3,000 ft at the initial approach fix, slowing down
//             and extending the flaps on the way
//   APPROACH  ILS armed at the fix (LOC / GS capture), gear down, flaps 30, Vref + 5,
//             autobrake and speedbrakes armed; autoland (flare, retard, rollout)
//   ROLLOUT   reverse thrust, autobrake, stop on the runway, parking brake, A/P off
//
// Emergency mode (AutoFlight.emergency): started in the air after a MAYDAY / PAN-PAN: the crew
// runs the fire checklist, flies to a fix on the extended centre line of the emergency runway
// (via a downwind point when the aircraft is past the fix or beyond the airport; straight to
// the ILS when already on final) and lands with the same APPROACH / ROLLOUT logic.
//
// Only FlightModel / Systems are used, so the headless test (tests/autoflight_test.mjs) runs
// exactly the same code.  Manual stick input cancels it (main.js).
import { headingVec, wrap180, clamp, FT } from './util.js';
import { FLAPS } from './flightmodel.js';
import { terrainHeight } from './terrain.js';

const NM = 1852;
const bearing = (fx, fz, tx, tz) => ((Math.atan2(tx - fx, -(tz - fz)) * 180 / Math.PI) + 360) % 360;

export class AutoFlight {
  // dep: home runway (world.json runway object), dest: destination runway, name: airport name
  constructor(fm, sys, { dep, dest, name }) {
    this.fm = fm; this.sys = sys; this.dep = dep; this.dest = dest; this.name = name;
    const dd = headingVec(dep.heading), ad = headingVec(dest.heading);
    const rwEnd = [dep.threshold[0] + dd.x * dep.length, dep.threshold[2] + dd.z * dep.length];
    // route: straight out 8 km past the departure end, then direct to the initial approach fix
    // 14 NM before the destination threshold on the extended centre line
    this.wps = [
      { x: rwEnd[0] + dd.x * 8000, z: rwEnd[1] + dd.z * 8000, name: 'DEP' },
      { x: dest.threshold[0] - ad.x * 14 * NM, z: dest.threshold[2] - ad.z * 14 * NM, name: 'IAF' },
    ];
    this.wi = 0;
    this.fixFt = 3000;
    const dist = Math.hypot(this.wps[1].x - dep.threshold[0], this.wps[1].z - dep.threshold[2]);
    // cruise level from the distance (about FL140 for 170 km ... FL250 for 300 km and more)
    this.cruiseFt = clamp(Math.round(dist / 1000 * 0.085) * 1000, 12000, 25000);
    this.phase = 'TAKEOFF';
    this.t = 0; this.rotT = null;
    this.msg = '';
    this.done = false;
  }

  // emergency landing from wherever the aircraft is (airborne): dest = runway to land on
  static emergency(fm, sys, { dest, name, fixNM }) {
    const af = new AutoFlight(fm, sys, { dep: dest, dest, name });
    af.emerg = true;
    // wide turns with a damaged wing: a longer final and a wider pattern
    const wide = af.vmin > 0;
    fixNM = fixNM || (wide ? 12 : 9);
    const back = wide ? 6 : 3, off = wide ? 5.5 : 3.5;
    const o = fm.out, p = fm.pos, d = headingVec(dest.heading), n = { x: -d.z, z: d.x };
    const T = { x: dest.threshold[0], z: dest.threshold[2] };
    const along = (p.x - T.x) * d.x + (p.z - T.z) * d.z;        // < 0: before the threshold
    const lat = (p.x - T.x) * n.x + (p.z - T.z) * n.z;
    let side = lat >= 0 ? 1 : -1;
    // a clipped wing rolls easily only towards the damaged side: join the final from that side,
    // so the turn onto the localizer and any overshoot correction are both towards it
    const D = fm.dmg;
    if (D && Math.max(D.wing[0], D.wing[1]) >= 0.2) side = D.wing[0] > D.wing[1] ? -1 : 1;
    const alt = o.altFt;
    // the fix altitude: 3,000 ft, or lower when the aircraft is already low near the airport
    af.fixFt = clamp(Math.round(alt / 100) * 100, 2000, 3000);
    const fix = { x: T.x - d.x * fixNM * NM, z: T.z - d.z * fixNM * NM, name: 'FIX' };
    const aligned = along < -2.5 * NM && along > -15 * NM && Math.abs(lat) < 1500 && Math.abs(wrap180(o.hdg - dest.heading)) < 45;
    const gear = sys.gearLever, flap = sys.flapLever;
    sys.gearLever = gear; sys.flapLever = flap;
    fm.ctl.parkingBrake = false;
    sys.pilot.pitch = 0; sys.pilot.roll = 0; sys.pilot.yaw = 0; sys.pilot.reverse = 0;
    if (!sys.ap.on) { sys.mcp.hdg = Math.round(o.hdg) || 360; sys.ap.roll = 'HDG'; sys.ap.pitch = 'VS'; sys.mcp.vs = 0; sys.mcp.alt = Math.round(alt / 100) * 100; }
    sys.engageAP();
    sys.at.on = true; sys.at.mode = 'SPD';
    sys.mcp.spd = Math.max(Math.round(o.ias), 170);
    af.gearUp = true; af.rotT = 0;
    // gentle turns with a damaged wing (the ailerons are busy holding the wings level)
    sys.bankMax = af.vmin ? 12 : 25;
    if (af.vmin) sys.autobrake = Math.max(sys.autobrake, 4);
    if (aligned) {
      af.wps = [fix]; af.wi = 0;
      af._startApproach(alt);
      af._say(`緊急着陸 ${name} RWY ${dest.ident} · ILS 進入`);
    } else {
      // past the fix (between the fix and the runway, or beyond the airport): a downwind
      // point first, then a 45 degree intercept to the fix
      const wps = [];
      const P = (a, l, name) => ({ x: T.x + d.x * a * NM + n.x * side * l * NM, z: T.z + d.z * a * NM + n.z * side * l * NM, name });
      if (wide && along > -(fixNM + 4) * NM) {
        // damaged wing, near the airport: a traffic pattern on the damaged side - abeam the
        // threshold, downwind, then base and final turns towards the damaged wing
        wps.push(P(-2, off, 'ABM'), P(-fixNM, off, 'DWN'));
      } else if (wide) wps.push(P(-(fixNM + back), off, 'DWN'));
      else if (along > -(fixNM + 1) * NM) wps.push(P(-(fixNM + back), off, 'DWN'));
      wps.push(fix);
      af.wps = wps; af.wi = 0;
      af.phase = 'DESCENT';
      sys.ap.pitch = 'VS'; sys.mcp.alt = af.fixFt; sys.mcp.vs = alt > af.fixFt + 300 ? -1500 : alt < af.fixFt - 300 ? 1200 : 0;
      af._say(`緊急着陸 ${name} RWY ${dest.ident} へ · ${Math.round(af._remaining() / NM)} NM`);
    }
    return af;
  }

  // distance (m) and bearing from the aircraft to the active waypoint
  _toWp() {
    const w = this.wps[this.wi], p = this.fm.pos;
    return { d: Math.hypot(w.x - p.x, w.z - p.z), brg: bearing(p.x, p.z, w.x, w.z) };
  }

  // turn radius at the current speed and bank limit (m)
  _turnR() {
    const v = Math.max(this.fm.out.tas || this.fm.out.ias || 150, 120) * 0.5144, bl = (this.sys.bankMax || 25) * Math.PI / 180;
    return v * v / (9.81 * Math.tan(bl));
  }

  // waypoint reached: close, or passed abeam within a turn radius or two
  _reached(w, r0) {
    const R = this._turnR(), p = this.fm.pos, h = headingVec(this.fm.out.hdg);
    const ahead = (this.wps[this.wi].x - p.x) * h.x + (this.wps[this.wi].z - p.z) * h.z;
    // (inside the turn circle it could only orbit the point: good enough)
    const off = Math.abs(wrap180(w.brg - this.fm.out.hdg));
    return w.d < Math.max(r0, 0.9 * R) || (ahead < 0 && w.d < 2.5 * R) || (off > 60 && w.d < 1.7 * R);
  }

  // minimum safe altitude (ft) along the predicted path: the turn towards the active waypoint
  // (at the bank limit) and then straight on to it and a little beyond
  _msa() {
    const p = this.fm.pos, w = this.wps[this.wi], R = this._turnR();
    let x = p.x, z = p.z, h = this.fm.out.hdg, top = 0;
    const step = 400;
    for (let s = 0, turning = true; s < 45000; s += step) {
      const brg = bearing(x, z, w.x, w.z), e = wrap180(brg - h);
      if (turning && Math.abs(e) > 3) h += Math.sign(e) * Math.min(Math.abs(e), step / R * 180 / Math.PI);
      else { turning = false; h = brg; }
      const v = headingVec(h);
      x += v.x * step; z += v.z * step;
      for (const o of [-1500, 0, 1500]) top = Math.max(top, terrainHeight(x - v.z * o, z + v.x * o));
      if (!turning && Math.hypot(w.x - x, w.z - z) < step && s > 6000) break;
    }
    return Math.ceil((top / FT + 1200) / 100) * 100;
  }

  // distance along the route to the last waypoint (the approach fix)
  _remaining() {
    let d = this._toWp().d;
    for (let i = this.wi + 1; i < this.wps.length; i++) d += Math.hypot(this.wps[i].x - this.wps[i - 1].x, this.wps[i].z - this.wps[i - 1].z);
    return d;
  }

  // missed approach: climb away, clean up, fly a new pattern from here
  _goAround() {
    const fm = this.fm, sys = this.sys;
    this.goArounds = (this.goArounds || 0) + 1;
    sys.gearLever = false; sys.flapLever = this._flap(2);
    sys.ap.armed.loc = false; sys.ap.armed.gs = false; sys.ap.roll = 'HDG'; sys.ap.pitch = 'VS';
    sys.mcp.hdg = Math.round(fm.out.hdg) || 360; sys.mcp.vs = 1500; sys.mcp.alt = 3000;
    const n = AutoFlight.emergency(fm, sys, { dest: this.dest, name: this.name });
    for (const k of ['wps', 'wi', 'phase', 'fixFt']) this[k] = n[k];
    this._f15 = this._f20 = this._f30 = false;
    this._say('Go around · 再進入 Missed approach');
  }

  _startApproach(alt) {
    const sys = this.sys, mcp = sys.mcp;
    this.phase = 'APPROACH';
    sys.selectRunway(this.dest);
    mcp.hdg = Math.round(this.dest.heading) || 360;
    sys.ap.roll = 'HDG';
    sys.ap.armed.loc = true; sys.ap.armed.gs = true;
    if (sys.ap.pitch !== 'ALT') { mcp.alt = Math.min(mcp.alt, Math.round(alt / 100) * 100); }
    if (sys.flapLever < 2) sys.flapLever = this._flap(2);
    if (mcp.spd > 210) mcp.spd = this._spd(190);
    sys.speedbrakeArmed = true; sys.autobrake = this.vmin ? 5 : 3; sys.speedbrakeLever = 0;
    this._say(`ILS ${this.dest.ident} ${this.name} · APP armed`);
  }

  _say(m) { this.msg = m; this.onMessage?.(m); }

  // a clipped wing: the ailerons run out of authority when slow - minimum control speed, and
  // the flap setting whose limit speed is above it
  get vmin() {
    const D = this.fm.dmg, f = D ? Math.max(D.wing[0], D.wing[1]) : 0;
    return f < 0.2 ? 0 : Math.round(140 + (f - 0.2) * 300);
  }
  _spd(v) { return Math.max(v, this.vmin); }
  _flap(n) {
    const vm = this.vmin;
    let k = n;
    while (k > 0 && vm && FLAPS[k].vfe < vm + 8) k--;
    return k;
  }

  update(dt) {
    const fm = this.fm, sys = this.sys, o = fm.out, P = sys.pilot, mcp = sys.mcp;
    this.t += dt;
    const vs = sys.vspeeds();
    // emergency: engine fire checklist (fire handle pulled after a few seconds)
    if (this.emerg && !this.fireDone && this.t > 6 && fm.dmg && (fm.dmg.engFire[0] || fm.dmg.engFire[1])) {
      this.fireDone = true;
      fm.extinguish?.();
      this._say('Engine fire checklist · 消火ハンドル作動');
    }
    switch (this.phase) {
      case 'TAKEOFF': {
        fm.ctl.parkingBrake = false;
        sys.flapLever = 2; sys.gearLever = !this.gearUp;
        P.brakes = 0; P.reverse = 0;
        P.throttle = 1;
        // stay on the runway centre line (rudder / nose-wheel steering), wings level
        const d = headingVec(this.dep.heading);
        const lat = (fm.pos.x - this.dep.threshold[0]) * -d.z + (fm.pos.z - this.dep.threshold[2]) * d.x;
        const hErr = wrap180(this.dep.heading - o.hdg);
        P.yaw = o.wow ? clamp(hErr * 0.25 - lat * 0.04, -0.6, 0.6) : 0;
        P.roll = clamp(-o.bank * 0.05, -0.3, 0.3);
        if (this.rotT === null && o.ias >= vs.vr) { this.rotT = this.t; this._say('V1 · Rotate'); }
        // rotate at ~2.5 deg/s to 12.5 deg, then hold the attitude
        P.pitch = this.rotT === null ? 0 : clamp((Math.min(12.5, 2.5 * (this.t - this.rotT)) - o.pitch) * 0.25, -0.3, 0.7);
        if (!o.wow && o.raFt > 50 && !this.gearUp) { this.gearUp = true; sys.gearLever = false; this._say('Positive rate · Gear up'); }
        if (!o.wow && o.raFt > 800) {
          P.pitch = 0; P.roll = 0; P.yaw = 0;
          mcp.alt = this.cruiseFt; mcp.vs = 2200; mcp.spd = Math.round(vs.v2 + 20); mcp.hdg = Math.round(o.hdg);
          sys.ap.roll = 'HDG'; sys.ap.pitch = 'VS';
          sys.engageAP();
          sys.at.on = true; sys.at.mode = 'SPD';
          this.phase = 'CLIMB';
          this._say(`A/P engaged · climb to FL${Math.round(this.cruiseFt / 100)}`);
        }
        break;
      }
      case 'CLIMB': case 'CRUISE': case 'DESCENT': {
        P.pitch = 0; P.roll = 0; P.yaw = 0;
        let w = this._toWp();
        const last = this.wps.length - 1;
        // emergency: from the downwind point straight onto a 30 degree localizer intercept
        if (this.emerg && this.vmin && this.wps[this.wi].name === 'DWN') {
          // lead the turn onto the intercept heading (wide turns with a damaged wing)
          const turn = Math.min(Math.abs(wrap180(this.dest.heading - o.hdg)), 150);
          if (this._reached(w, Math.max(2500, Math.min(1.2 * this._turnR(), this._turnR() * Math.tan(turn * Math.PI / 360))))) { this._startApproach(o.altFt); break; }
        }
        if (this.wi < last && (this.emerg ? this._reached(w, 2500) : w.d < 2500)) { this.wi++; w = this._toWp(); }
        mcp.hdg = Math.round(w.brg) || 360;
        const rem = this.wi === last ? w.d : this._remaining();
        // emergency: never below the terrain on the way (hills around the airports)
        const FX = this.emerg ? Math.max(this.fixFt, this._msa()) : this.fixFt;
        // flaps / speed schedule
        const alt = o.altFt;
        if (this.phase === 'CLIMB') {
          if (o.ias > vs.v2 + 30 && sys.flapLever > 1) sys.flapLever = 1;
          if (o.ias > vs.v2 + 50 && sys.flapLever > 0) sys.flapLever = 0;
          mcp.spd = sys.flapLever > 0 ? Math.round(vs.v2 + 60) : alt < 10000 ? 250 : 290;
          mcp.vs = alt < 10000 ? 2200 : 1800;
          if (sys.ap.pitch === 'ALT' && Math.abs(alt - this.cruiseFt) < 200) { this.phase = 'CRUISE'; this._say(`巡航 FL${Math.round(this.cruiseFt / 100)} · ${this.name} まで ${Math.round(w.d / 1000)} km`); }
        }
        if (this.phase === 'CRUISE') mcp.spd = 290;
        // top of descent: 3,000 ft at the fix on a ~3 degree path, plus room to slow down
        if (this.wi === last && this.phase !== 'DESCENT') {
          const need = ((alt - FX) / 280 + 10) * NM;
          if (w.d < need) {
            this.phase = 'DESCENT';
            mcp.alt = FX; mcp.vs = -2000; sys.ap.pitch = 'VS';
            this._say(`降下開始 Top of descent · ${this.name}`);
          }
        }
        if (this.phase === 'DESCENT') {
          // keep a sensible descent rate for the remaining distance
          const rr = Math.max(rem - 4 * NM, 1000);
          const gs = Math.max(o.gs, 150) * 0.5144;
          const need = -((alt - FX) * FT) / (rr / gs) / FT * 60;
          // a new altitude (terrain ahead): leave ALT hold
          if (sys.ap.pitch === 'ALT' && Math.abs(mcp.alt - FX) > 150) { sys.ap.pitch = 'VS'; mcp.vs = 0; }
          if (sys.ap.pitch === 'VS') {
            mcp.alt = FX;
            if (alt > FX + 250) mcp.vs = Math.round(clamp(need * 1.15, -3500, -700) / 100) * 100;
            else mcp.vs = alt < FX - 150 ? (alt < FX - 800 ? 2000 : 1000) : -300;   // at / below the target (emergency start, terrain)
          }
          mcp.spd = alt > 11000 ? 290 : rem > 18 * NM ? 250 : rem > 9 * NM ? 210 : 190;
          if (this.emerg) mcp.spd = this._spd(Math.min(mcp.spd, rem > 9 * NM ? 230 : 190));
          // speedbrakes when fast (steep descent at idle)
          if (o.ias > mcp.spd + 12) sys.speedbrakeLever = 0.6; else if (o.ias < mcp.spd + 3) sys.speedbrakeLever = 0;
          if (rem < 18 * NM && sys.flapLever < 1) sys.flapLever = this._flap(1);
          if (rem < 9 * NM && sys.flapLever < 2) sys.flapLever = this._flap(2);
          // at the fix: ILS
          if (this.wi === last && (this.emerg ? this._reached(w, 1500) : w.d < 1500)) this._startApproach(alt);
        }
        break;
      }
      case 'APPROACH': {
        P.pitch = 0; P.roll = 0; P.yaw = 0;
        // emergency: not established on the glideslope close to the runway -> go around, new pattern
        if (this.emerg && !o.wow) {
          const d = headingVec(this.dest.heading);
          const along = (fm.pos.x - this.dest.threshold[0]) * d.x + (fm.pos.z - this.dest.threshold[2]) * d.z;
          if (along > -1500 && sys.ap.pitch !== 'GS' && sys.ap.pitch !== 'FLARE' && o.raFt > 150) { this._goAround(); break; }
        }
        if (sys.ap.roll === 'HDG') {
          // intercept the localizer: up to 40 degrees towards the centre line
          const d = headingVec(this.dest.heading), p = fm.pos;
          const lat = (p.x - this.dest.threshold[0]) * -d.z + (p.z - this.dest.threshold[2]) * d.x;   // m right of course
          const cm = Math.abs(lat) > 4000 ? 45 : 30;       // far out to the side: a steeper cut first
          const cut = this.emerg ? (this.vmin ? clamp(lat * 0.03, -cm, cm) : clamp(lat * 0.02, -40, 40)) : 0;
          mcp.hdg = Math.round(((this.dest.heading - cut) % 360 + 360) % 360) || 360;
        }
        if (sys.ap.roll === 'LOC' && !this._f15) { this._f15 = true; sys.flapLever = Math.max(sys.flapLever, this._flap(3)); mcp.spd = this._spd(180); }
        // arrived above the glideslope: descend through it (the A/P captures it on the way)
        if (sys.ap.roll === 'LOC' && sys.ap.pitch !== 'GS' && sys.ap.pitch !== 'FLARE' && sys.ilsDev.gsValid && sys.ilsDev.gs > 0.3) {
          mcp.alt = 800; mcp.vs = -1500; sys.ap.pitch = 'VS'; sys.ap.armed.gs = true;   // (the glideslope is captured on the way down)
          sys.speedbrakeLever = o.ias > mcp.spd + 10 ? 0.6 : 0;
        } else if (sys.ap.pitch === 'GS') sys.speedbrakeLever = 0;
        if (sys.ilsDev.gsValid && sys.ilsDev.gs > -1.2 && !this._f20) { this._f20 = true; sys.gearLever = true; sys.flapLever = Math.max(sys.flapLever, this._flap(4)); mcp.spd = this._spd(165); this._say(`Gear down · Flaps ${FLAPS[sys.flapLever].name}`); }
        if (sys.ap.pitch === 'GS' && !this._f30) { this._f30 = true; this._f20 = true; sys.gearLever = true; sys.flapLever = Math.max(sys.flapLever, this._flap(6)); mcp.spd = this._spd(Math.round(vs.vref30 + 5)); this._say(`Glideslope · Flaps ${FLAPS[sys.flapLever].name}`); }
        if (o.wow && (sys.ap.roll === 'ROLLOUT' || o.raFt < 5)) { this.phase = 'ROLLOUT'; this._say('Touchdown · Reverse'); }
        break;
      }
      case 'ROLLOUT': {
        P.pitch = 0; P.roll = 0;
        P.reverse = o.gs > 60 ? 1 : 0;
        P.throttle = 0;
        if (o.gs < 40) P.brakes = 0.4;
        if (o.gs < 2) {
          P.reverse = 0; P.brakes = 1;
          fm.ctl.parkingBrake = true;
          sys.at.on = false;
          if (sys.ap.on) sys.apDisconnect?.(false);
          sys.ap.on = false;
          this.phase = 'DONE'; this.done = true;
          this._say(`${this.name} に到着しました Arrived`);
        }
        break;
      }
      default: break;
    }
  }
}
