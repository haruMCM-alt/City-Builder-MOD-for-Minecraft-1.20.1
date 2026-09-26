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
// Only FlightModel / Systems are used, so the headless test (tests/autoflight_test.mjs) runs
// exactly the same code.  Manual stick input cancels it (main.js).
import { headingVec, wrap180, clamp, FT } from './util.js';

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
    const dist = Math.hypot(this.wps[1].x - dep.threshold[0], this.wps[1].z - dep.threshold[2]);
    // cruise level from the distance (about FL140 for 170 km ... FL250 for 300 km and more)
    this.cruiseFt = clamp(Math.round(dist / 1000 * 0.085) * 1000, 12000, 25000);
    this.phase = 'TAKEOFF';
    this.t = 0; this.rotT = null;
    this.msg = '';
    this.done = false;
  }

  // distance (m) and bearing from the aircraft to the active waypoint
  _toWp() {
    const w = this.wps[this.wi], p = this.fm.pos;
    return { d: Math.hypot(w.x - p.x, w.z - p.z), brg: bearing(p.x, p.z, w.x, w.z) };
  }

  _say(m) { this.msg = m; this.onMessage?.(m); }

  update(dt) {
    const fm = this.fm, sys = this.sys, o = fm.out, P = sys.pilot, mcp = sys.mcp;
    this.t += dt;
    const vs = sys.vspeeds();
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
        if (this.wi === 0 && w.d < 2500) { this.wi = 1; w = this._toWp(); }
        mcp.hdg = Math.round(w.brg) || 360;
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
        if (this.wi === 1 && this.phase !== 'DESCENT') {
          const need = ((alt - 3000) / 280 + 10) * NM;
          if (w.d < need) {
            this.phase = 'DESCENT';
            mcp.alt = 3000; mcp.vs = -2000; sys.ap.pitch = 'VS';
            this._say(`降下開始 Top of descent · ${this.name}`);
          }
        }
        if (this.phase === 'DESCENT') {
          // keep a sensible descent rate for the remaining distance
          const rem = Math.max(w.d - 4 * NM, 1000);
          const gs = Math.max(o.gs, 150) * 0.5144;
          const need = -((alt - 3000) * FT) / (rem / gs) / FT * 60;
          if (sys.ap.pitch === 'VS') mcp.vs = Math.round(clamp(need * 1.15, -3500, -700) / 100) * 100;
          mcp.spd = alt > 11000 ? 290 : w.d > 18 * NM ? 250 : w.d > 9 * NM ? 210 : 190;
          // speedbrakes when fast (steep descent at idle)
          if (o.ias > mcp.spd + 12) sys.speedbrakeLever = 0.6; else if (o.ias < mcp.spd + 3) sys.speedbrakeLever = 0;
          if (w.d < 18 * NM && sys.flapLever < 1) sys.flapLever = 1;
          if (w.d < 9 * NM && sys.flapLever < 2) sys.flapLever = 2;
          if (w.d < 1500) {
            // at the fix: ILS
            this.phase = 'APPROACH';
            sys.selectRunway(this.dest);
            mcp.hdg = Math.round(this.dest.heading) || 360;
            sys.ap.roll = 'HDG';
            sys.ap.armed.loc = true; sys.ap.armed.gs = true;
            if (sys.ap.pitch !== 'ALT') { mcp.alt = Math.min(mcp.alt, Math.round(alt / 100) * 100); }
            sys.speedbrakeArmed = true; sys.autobrake = 3; sys.speedbrakeLever = 0;
            this._say(`ILS ${this.dest.ident} ${this.name} · APP armed`);
          }
        }
        break;
      }
      case 'APPROACH': {
        P.pitch = 0; P.roll = 0; P.yaw = 0;
        if (sys.ap.roll === 'HDG') mcp.hdg = Math.round(this.dest.heading) || 360;
        if (sys.ap.roll === 'LOC' && sys.flapLever < 3) { sys.flapLever = 3; mcp.spd = 180; }
        // arrived above the glideslope: descend through it (the A/P captures it on the way)
        if (sys.ap.roll === 'LOC' && sys.ap.pitch !== 'GS' && sys.ap.pitch !== 'FLARE' && sys.ilsDev.gsValid && sys.ilsDev.gs > 0.3) {
          mcp.alt = 1500; mcp.vs = -1500; sys.ap.pitch = 'VS'; sys.ap.armed.gs = true;
          sys.speedbrakeLever = o.ias > mcp.spd + 10 ? 0.6 : 0;
        } else if (sys.ap.pitch === 'GS') sys.speedbrakeLever = 0;
        if (sys.ilsDev.gsValid && sys.ilsDev.gs > -1.2 && !sys.gearLever) { sys.gearLever = true; sys.flapLever = Math.max(sys.flapLever, 4); mcp.spd = 165; this._say('Gear down · Flaps 20'); }
        if (sys.ap.pitch === 'GS' && sys.flapLever < 6) { sys.gearLever = true; sys.flapLever = 6; mcp.spd = Math.round(vs.vref30 + 5); this._say('Glideslope · Flaps 30'); }
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
