// 787-9 aircraft systems: fly-by-wire primary flight control (flight-path /
// bank-hold law with auto-trim and envelope protection), autopilot, autothrottle,
// high-lift, gear, spoilers, autobrake, warnings and aural callouts.

import { V3, DEG, RAD, KT, FT, FPM, G0, clamp, lerp, approach, wrap180, wrap360, smoothstep, headingVec } from './util.js';
import { FLAPS, SPEC, flapAero } from './flightmodel.js';
import { isa, tas2cas, cas2tas } from './atmosphere.js';

export const AUTOBRAKE = ['OFF', '1', '2', '3', '4', 'MAX', 'RTO'];
const AB_DECEL = [0, 1.2, 1.5, 1.9, 2.4, 3.4, 99];

export class Systems {
  constructor(fm, world) {
    this.fm = fm;
    this.world = world;       // runway data
    // pilot inputs
    this.pilot = { pitch: 0, roll: 0, yaw: 0, throttle: 0, reverse: 0, brakes: 0, tiller: 0 };
    this.flapLever = 0;
    this.gearLever = true;         // down
    this.speedbrakeLever = 0;      // 0..1
    this.speedbrakeArmed = false;
    this.autobrake = 0;
    this.lawDirect = false;        // DIRECT law (no FBW augmentation)
    this.trimInput = 0;            // manual trim (direct law)
    // FBW state
    this.gammaT = 0; this.phiT = 0; this.iq = 0; this.ip = 0; this.mode = 'ground';
    this.airTime = 0; this.groundTime = 10;
    this.elev = 0; this.ail = 0; this.rud = 0;
    // autopilot / autothrottle
    this.ap = { on: false, roll: 'HDG', pitch: 'ALT', armed: { loc: false, gs: false } };
    this.at = { on: false, mode: 'SPD', integ: 0 };
    this.fdOn = true;
    this.mcp = { spd: 160, hdg: 270, alt: 5000, vs: 1500 };
    this.ils = null;               // selected runway ILS
    this.ilsDev = { loc: 0, gs: 0, valid: false, dist: 0 };
    this.tla = [0, 0];
    this.stabTakeoff = 2.5 * DEG;
    fm.ctl.stab = this.stabTakeoff;
    // callouts / warnings
    this.callouts = [];
    this.warn = {};
    this._raPrev = 9999; this._v1 = false; this._vr = false; this._posRate = false;
    this.autobrakeActive = false;
    this.fd = { pitch: 0, roll: 0 };
    this.rolloutCmd = 0;
    this.message = [];
  }

  selectRunway(rwy) {
    this.ils = rwy;
    if (rwy) this.mcp.hdg = rwy.heading;
  }

  // ---------------------------------------------------------------------------
  vspeeds() {
    const fm = this.fm;
    const vs30 = fm.vs1g(30);
    const toFlap = FLAPS[Math.max(2, Math.min(this.flapLever, 4))].angle;
    const vsTO = fm.vs1g(toFlap);
    const v2 = Math.max(1.16 * vsTO, 128);
    const vr = v2 - 7, v1 = vr - 5;
    return {
      vref: 1.23 * vs30 + 0, vref30: 1.23 * vs30, v1, vr, v2,
      vsCurrent: fm.vs1g(fm.ctl.flapAngle),
      vfe: FLAPS[this.flapLever].vfe,
      minMan: fm.vs1g(fm.ctl.flapAngle) * 1.30,
      stickShaker: fm.vs1g(fm.ctl.flapAngle) * 1.06,
      flapsUp: fm.vs1g(0) * 1.30,
    };
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    const fm = this.fm, o = fm.out, ctl = fm.ctl, P = this.pilot;
    const mainWow = fm.gear[1].onGround || fm.gear[2].onGround;
    const anyWow = mainWow || fm.gear[0].onGround;
    if (anyWow) { this.groundTime += dt; this.airTime = 0; } else { this.airTime += dt; this.groundTime = 0; }

    // ---- high lift ------------------------------------------------------------
    const flapT = FLAPS[this.flapLever].angle;
    ctl.flapLever = this.flapLever;
    ctl.flapAngle = approach(ctl.flapAngle, flapT, flapT > 5 || ctl.flapAngle > 5 ? 1.2 : 0.8, dt);
    ctl.slat = approach(ctl.slat, flapAero(flapT)[5], 0.25, dt);
    // ---- gear -----------------------------------------------------------------
    if (!this.gearLever && mainWow) this.gearLever = true;      // squat switch
    ctl.gearDown = this.gearLever;
    ctl.gearPos = approach(ctl.gearPos, this.gearLever ? 0 : 1, 1 / 9, dt);
    // ---- speed brakes / ground spoilers ----------------------------------------
    ctl.speedbrake = approach(ctl.speedbrake, anyWow ? 0 : this.speedbrakeLever, 0.8, dt);
    const idle = this.tla[0] < 0.08 && this.tla[1] < 0.08;
    const reversing = P.reverse > 0.02;
    const deployGS = mainWow && ((this.speedbrakeArmed && idle && o.ias > 40) || reversing
      || (this.speedbrakeLever > 0.5 && idle));
    ctl.groundSpoiler = approach(ctl.groundSpoiler, deployGS ? 1 : 0, deployGS ? 2.5 : 0.8, dt);

    // ---- ILS deviations ------------------------------------------------------
    this.updateILS();

    // ---- autopilot outer loops -> gammaT / phiT ------------------------------------
    if (this.ap.on) this.autopilot(dt, mainWow);
    else this.flightDirector();

    // ---- FBW -------------------------------------------------------------------
    this.fbw(dt, mainWow, anyWow);

    // ---- autothrottle / throttles ---------------------------------------------------
    this.autothrottle(dt, mainWow);
    for (let i = 0; i < 2; i++) {
      ctl.tla[i] = this.tla[i];
      ctl.reverse[i] = P.reverse;
    }

    // ---- brakes & steering ---------------------------------------------------------
    this.brakes(dt, mainWow, idle);
    const gsKt = o.gs;
    const tillerMax = 65 * DEG * (1 - smoothstep(12, 45, gsKt)) + 7 * DEG;
    let steer = P.tiller !== 0 ? P.tiller * tillerMax : P.yaw * tillerMax;
    if (this.ap.on && this.ap.roll === 'ROLLOUT') steer += this.rolloutCmd * 0.5 * DEG;
    ctl.steer = approach(ctl.steer, steer, 25 * DEG, dt);

    // ---- warnings & callouts -----------------------------------------------------
    this.warnings(dt, mainWow);
  }

  // ---------------------------------------------------------------------------
  fbw(dt, mainWow, anyWow) {
    const fm = this.fm, o = fm.out, ctl = fm.ctl, P = this.pilot;
    const qbar = Math.max(o.qbar, 200);
    const sched = clamp(9000 / qbar, 0.25, 6);
    const V = Math.max(o.tas, 30);
    const phi = o.bank, gamma = o.gammaAir;
    const q = fm.w.z, p = fm.w.x, r = -fm.w.y;
    const flightMode = !mainWow && this.airTime > 0.6;
    const vs = this.vspeeds();

    if (this.lawDirect || !flightMode) {
      // ---- direct / ground law ---------------------------------------------------
      const elevCmd = -P.pitch * 30 * DEG;
      this.elev = approach(this.elev, elevCmd, 45 * DEG, dt);
      if (this.lawDirect && flightMode) {
        ctl.stab = clamp(ctl.stab + this.trimInput * 0.5 * DEG * dt, -4 * DEG, 12 * DEG);
      } else if (anyWow && this.groundTime > 2) {
        ctl.stab = approach(ctl.stab, this.stabTakeoff, 0.5 * DEG, dt);
      }
      const ailCmd = P.roll * 25 * DEG;
      this.ail = approach(this.ail, ailCmd, 60 * DEG, dt);
      // capture for a bumpless transfer when the law engages
      this.gammaT = gamma; this.phiT = phi;
      this.iq = -this.elev / sched; this.ip = 0;
      this.mode = flightMode ? 'DIRECT' : 'GROUND';
      // rollout: autopilot steering with rudder
      let rudCmd = P.yaw * 27 * DEG;
      if (this.ap.on && this.ap.roll === 'ROLLOUT') {
        rudCmd += this.rolloutCmd * 2.0 * DEG;
        this.elev = approach(this.elev, 2 * DEG, 5 * DEG, dt);
      }
      this.rud = approach(this.rud, rudCmd, 50 * DEG, dt);
    } else {
      this.mode = 'NORMAL';
      // ---- pitch: flight-path hold, stick commands flight-path rate ---------------
      if (!this.ap.on) {
        if (Math.abs(P.pitch) > 0.02) this.gammaT += P.pitch * 4.2 * dt;
        this.gammaT = clamp(this.gammaT, gamma - 7, gamma + 7);
      }
      // flare: near the ground the 787 law reverts towards attitude-like feel;
      // here stick input stays a flight-path command but auto nose-down bias is removed.
      // --- envelope protection ---
      const aDeg = o.alpha * RAD;
      const aProt = o.aStall * RAD - 3.0;
      if (aDeg > aProt) this.gammaT = Math.min(this.gammaT, gamma - (aDeg - aProt) * 2.5);
      if (o.pitch > 25) this.gammaT = Math.min(this.gammaT, gamma - (o.pitch - 25) * 1.5);
      if (o.pitch < -15) this.gammaT = Math.max(this.gammaT, gamma + (-15 - o.pitch) * 1.5);
      const vmo = SPEC.VMO + 4, mmo = SPEC.MMO + 0.01;
      if (o.ias > vmo || o.mach > mmo) {
        const ex = Math.max(o.ias - vmo, (o.mach - mmo) * 600);
        this.gammaT = Math.max(this.gammaT, gamma + ex * 0.25);
      }
      if (o.ias > vs.vfe + 3 && this.flapLever > 0) this.gammaT = Math.max(this.gammaT, gamma + (o.ias - vs.vfe - 3) * 0.1);
      // --- inner loop ---
      const cphi = Math.cos(phi * DEG);
      const qTurn = (G0 / V) * Math.tan(clamp(phi, -70, 70) * DEG) * Math.sin(phi * DEG);
      let qCmd = clamp(0.95 * (this.gammaT - gamma), -4.5, 4.5) * DEG + qTurn;
      const nMax = this.flapLever > 0 ? 2.0 : 2.5;
      const nNow = o.nz ?? 1;
      if (nNow > nMax) qCmd = Math.min(qCmd, (nMax - nNow) * 0.3);
      if (nNow < -0.5) qCmd = Math.max(qCmd, (-0.5 - nNow) * 0.3);
      const eq = qCmd - q;
      this.iq = clamp(this.iq + 2.2 * eq * dt, -0.6, 0.6);
      let elevCmd = -(3.0 * eq + this.iq) * sched;
      // alpha feedback for extra pitch damping
      elevCmd = clamp(elevCmd, -30 * DEG, 25 * DEG);
      this.elev = approach(this.elev, elevCmd, 45 * DEG, dt);
      // auto trim: move the stabiliser to unload the elevator
      const trimRate = clamp(-this.elev * 0.9, -0.45 * DEG, 0.45 * DEG);
      ctl.stab = clamp(ctl.stab + trimRate * dt, -4 * DEG, 12 * DEG);

      // ---- roll: rate command, attitude hold, bank protection --------------------
      let pCmd;
      if (!this.ap.on && Math.abs(P.roll) > 0.04) {
        pCmd = P.roll * 15 * DEG;
        this.phiT = phi;
        if (Math.abs(phi) > 35) pCmd *= clamp(1 - (Math.abs(phi) - 35) / 32 * Math.sign(P.roll * phi), 0, 1);
      } else {
        if (!this.ap.on && Math.abs(this.phiT) > 35) this.phiT = approach(this.phiT, Math.sign(this.phiT) * 30, 3, dt);
        if (!this.ap.on && Math.abs(this.phiT) < 2.5 && Math.abs(P.roll) < 0.04) this.phiT = approach(this.phiT, 0, 0.6, dt);
        pCmd = clamp(1.1 * (this.phiT - phi), this.ap.on ? -4 : -10, this.ap.on ? 4 : 10) * DEG;
      }
      const ep = pCmd - p;
      this.ip = clamp(this.ip + 3.0 * ep * dt, -0.3, 0.3);
      const ailCmd = clamp((4.5 * ep + this.ip) * sched, -25 * DEG, 25 * DEG);
      this.ail = approach(this.ail, ailCmd, 60 * DEG, dt);

      // ---- yaw: pedals + yaw damper + turn coordination + TAC ---------------------
      const rTurn = (G0 / V) * Math.sin(phi * DEG) * cphi;
      const tac = (fm.engines[0].thrust - fm.engines[1].thrust) / Math.max(qbar * SPEC.S * SPEC.b, 1) * 9.85 / 0.074;
      const rudLim = (27 - 21 * smoothstep(150, 300, o.ias)) * DEG;
      let rudCmd = P.yaw * rudLim + (2.2 * o.beta + 2.0 * (rTurn - r)) * Math.min(sched, 2.5) - tac;
      rudCmd = clamp(rudCmd, -rudLim, rudLim);
      this.rud = approach(this.rud, rudCmd, 45 * DEG, dt);
    }
    ctl.elevator = this.elev;
    ctl.aileron = this.ail;
    ctl.rudder = this.rud;
    ctl.rollSpoiler = clamp(this.ail / (25 * DEG), -1, 1);
  }

  // ---------------------------------------------------------------------------
  updateILS() {
    const fm = this.fm, r = this.ils;
    if (!r) { this.ilsDev.valid = false; return; }
    const thr = r.threshold;             // [x, y, z] three coords
    const dir = headingVec(r.heading);   // landing direction
    const dx = fm.pos.x - thr[0], dz = fm.pos.z - thr[2];
    const along = -(dx * dir.x + dz * dir.z);             // distance before the threshold (+ = on approach)
    const right = { x: -dir.z, z: dir.x };                // right of the landing direction
    const lat = dx * right.x + dz * right.z;              // + = right of centreline
    // localizer antenna 300 m beyond the far end
    const locDist = along + r.length + 300;
    const locDeg = Math.atan2(lat, Math.max(locDist, 1)) * RAD;
    // glideslope antenna 300 m past the threshold
    const gsDist = along + r.ils.gsAntennaFromThr;
    const h = fm.pos.y + fm.cgOffset.y - (thr[1] || 0) - 1.5;
    const gsAngle = Math.atan2(h, Math.max(gsDist, 1)) * RAD;
    this.ilsDev = {
      valid: locDist > 0 && Math.abs(locDeg) < 35 && along > -r.length,
      loc: locDeg,                       // deg, + = aircraft right of course
      locM: lat,
      gs: gsAngle - r.ils.glideslope,    // deg, + = above path
      gsValid: gsDist > 50 && along > -200,
      dist: along,
      dme: (along + r.ils.gsAntennaFromThr) / 1852,
      gsAltAtDist: Math.tan(r.ils.glideslope * DEG) * Math.max(gsDist, 0),
      course: r.heading,
    };
  }

  // ---------------------------------------------------------------------------
  autopilot(dt, mainWow) {
    const fm = this.fm, o = fm.out, ap = this.ap, mcp = this.mcp;
    const V = Math.max(o.tas, 50);
    const d = this.ilsDev;
    // ----- lateral -----
    if (ap.armed.loc && d.valid && Math.abs(d.loc) < 2.2 && Math.abs(wrap180(o.track - d.course)) < 70) {
      ap.roll = 'LOC'; ap.armed.loc = false;
    }
    let phiT = this.phiT;
    if (ap.roll === 'HDG') {
      const e = wrap180(mcp.hdg - o.hdg);
      phiT = clamp(e * 1.6, -25, 25);
    } else if (ap.roll === 'LOC' || ap.roll === 'ROLLOUT') {
      const xt = d.locM;                                   // m right of course
      const vLat = this._prevLat !== undefined ? (xt - this._prevLat) / dt : 0;
      this._prevLat = xt;
      const trackT = d.course + clamp(-xt * 0.055 - vLat * 1.6, -30, 30);
      const e = wrap180(trackT - o.track);
      phiT = clamp(e * 1.8, -22, 22);
      if (o.raFt < 100) phiT = clamp(phiT, -6, 6);
    } else if (ap.roll === 'ATT') {
      phiT = this.phiT;
    }
    this.phiT = phiT;
    // ----- vertical -----
    if (ap.armed.gs && ap.roll === 'LOC' && d.gsValid && d.gs < 0.12 && d.gs > -0.25) {
      ap.pitch = 'GS'; ap.armed.gs = false;
    }
    const altFt = o.altFt;
    let vsT = null;       // ft/min
    if (ap.pitch === 'ALT' || ap.pitch === 'VS' || ap.pitch === 'ALT*') {
      const err = mcp.alt - altFt;
      if (ap.pitch === 'VS') {
        vsT = mcp.vs;
        if ((mcp.vs > 0 && err < Math.abs(mcp.vs) / 4) || (mcp.vs < 0 && err > -Math.abs(mcp.vs) / 4)) ap.pitch = 'ALT';
      }
      if (ap.pitch === 'ALT') vsT = clamp(err * 2.5, -2000, 2000);
    } else if (ap.pitch === 'FLCH') {
      const err = mcp.alt - altFt;
      if (Math.abs(err) < 400) { ap.pitch = 'ALT'; vsT = clamp(err * 2.5, -2000, 2000); }
      else {
        // pitch on speed: climb/descend at the selected speed
        const eS = o.ias - mcp.spd;
        this._flchG = clamp((this._flchG ?? o.gammaAir) + clamp(eS * 0.02, -0.4, 0.4) * dt * 10, -8, 12);
        this.gammaT = err > 0 ? Math.max(this._flchG, 0.5) : Math.min(this._flchG, -0.5);
      }
    } else if (ap.pitch === 'GS' || ap.pitch === 'FLARE') {
      const hGs = d.gsAltAtDist;
      const hAc = fm.pos.y + fm.cgOffset.y - 1.5;
      const err = hAc - hGs;           // m above the path
      const gpaVs = -Math.tan(3 * DEG) * o.gs * KT;
      let vs = gpaVs - clamp(err * 0.22, -2.5, 2.5);
      if (o.raFt < 52 && ap.pitch === 'GS') { ap.pitch = 'FLARE'; this.callouts.push('flare'); }
      if (ap.pitch === 'FLARE') {
        const raFt = o.raFt;
        vs = -(raFt * 0.105 + 1.6) * FT;      // exponential flare
      }
      vsT = vs / FPM;
      if (mainWow && this.groundTime > 0.3) { ap.roll = 'ROLLOUT'; ap.pitch = 'ROLLOUT'; }
    }
    if (vsT !== null) this.gammaT = Math.asin(clamp(vsT * FPM / V, -0.5, 0.5)) * RAD;
    this._flchG = ap.pitch === 'FLCH' ? this._flchG : undefined;
    this.fd = { pitch: this.gammaT - o.gammaAir, roll: this.phiT - o.bank };
    if (ap.roll === 'ROLLOUT') {
      // PD steering to the centreline: lateral offset, heading error and yaw rate
      const hdgErr = wrap180(o.hdg - d.course);
      const r = -fm.w.y * RAD;
      this.rolloutCmd = clamp(-0.35 * d.locM - 1.6 * hdgErr - 1.2 * r, -7, 7);
      if (o.gs < 30) this.apDisconnect(false);
    }
  }

  flightDirector() {
    const o = this.fm.out;
    this.fd = { pitch: this.gammaT - o.gammaAir, roll: this.phiT - o.bank };
  }

  engageAP() {
    const o = this.fm.out;
    if (this.fm.out.wow) return false;
    this.ap.on = true;
    if (!['HDG', 'LOC'].includes(this.ap.roll)) this.ap.roll = 'HDG';
    if (!['ALT', 'VS', 'FLCH', 'GS'].includes(this.ap.pitch)) this.ap.pitch = 'VS';
    if (this.ap.roll === 'HDG' && Math.abs(wrap180(this.mcp.hdg - o.hdg)) > 90) this.mcp.hdg = Math.round(o.hdg);
    if (this.ap.pitch === 'VS' && Math.sign(this.mcp.vs) !== Math.sign(this.mcp.alt - o.altFt)) {
      this.mcp.vs = Math.sign(this.mcp.alt - o.altFt) * 1500 || 0;
    }
    this.callouts.push('ap_on');
    return true;
  }

  apDisconnect(warn = true) {
    if (!this.ap.on) return;
    this.ap.on = false;
    this.ap.armed.loc = this.ap.armed.gs = false;
    if (['ROLLOUT', 'FLARE', 'GS'].includes(this.ap.pitch)) this.ap.pitch = 'VS';
    if (this.ap.roll === 'ROLLOUT') this.ap.roll = 'HDG';
    if (warn) this.callouts.push('ap_off');
  }

  // ---------------------------------------------------------------------------
  autothrottle(dt, mainWow) {
    const fm = this.fm, o = fm.out, P = this.pilot, at = this.at;
    if (P.reverse > 0.02) at.on = false;
    if (!at.on) {
      this.tla[0] = this.tla[1] = approach(this.tla[0], P.throttle, 1.5, dt);
      return;
    }
    let target;
    if (at.mode === 'TOGA') {
      target = 1.0;
      if (!mainWow && o.raFt > 400 && this.ap.on) at.mode = 'SPD';
    } else if (at.mode === 'SPD') {
      if (this.ap.on && this.ap.pitch === 'FLCH') {
        target = this.mcp.alt > o.altFt ? 0.93 : 0.0;
      } else {
        const err = this.mcp.spd - o.ias;
        at.integ = clamp(at.integ + err * 0.0035 * dt, -0.6, 1.0);
        const accel = this._iasPrev !== undefined ? (o.ias - this._iasPrev) / dt : 0;
        target = clamp(0.35 + 0.035 * err - 0.12 * accel + at.integ, 0, 0.98);
      }
      if (this.ap.on && this.ap.pitch === 'FLARE' && o.raFt < 27) { at.mode = 'RETARD'; this.callouts.push('retard'); }
    } else if (at.mode === 'RETARD') {
      target = 0;
      if (mainWow) { at.on = false; }
    } else {
      target = P.throttle;
    }
    this._iasPrev = o.ias;
    const rate = at.mode === 'RETARD' ? 0.35 : 0.25;
    this.tla[0] = this.tla[1] = approach(this.tla[0], target, rate, dt);
    P.throttle = this.tla[0];
  }

  // ---------------------------------------------------------------------------
  brakes(dt, mainWow, idle) {
    const fm = this.fm, o = fm.out, ctl = fm.ctl, P = this.pilot;
    let b = P.brakes;
    if (P.brakes > 0.1 && this.autobrakeActive) { this.autobrakeActive = false; this.autobrake = 0; }
    if (this.autobrake > 0 && mainWow && idle && o.gs > 30 && ctl.groundSpoiler > 0.5) this.autobrakeActive = true;
    if (!idle && P.reverse < 0.02) this.autobrakeActive = false;
    if (this.autobrakeActive) {
      const target = AB_DECEL[this.autobrake];
      const hv = Math.hypot(fm.vel.x, fm.vel.z);
      const decel = this._hvPrev !== undefined ? (this._hvPrev - hv) / dt : 0;
      this._abCmd = clamp((this._abCmd || 0) + (target - decel) * 0.25 * dt, 0, 1);
      b = Math.max(b, this._abCmd);
      if (hv < 2) { this.autobrakeActive = false; }
      this._hvPrev = hv;
    } else { this._abCmd = 0; this._hvPrev = undefined; }
    ctl.brakeL = ctl.brakeR = clamp(b, 0, 1);
  }

  // ---------------------------------------------------------------------------
  warnings(dt, mainWow) {
    const fm = this.fm, o = fm.out, ctl = fm.ctl, W = this.warn;
    const vs = this.vspeeds();
    const raFt = o.raFt;
    const aDeg = o.alpha * RAD;
    W.stall = !mainWow && this.airTime > 1 && aDeg > o.aStall * RAD - 1.8;
    W.overspeed = o.ias > SPEC.VMO + 3 || o.mach > SPEC.MMO + 0.005 || (this.flapLever > 0 && o.ias > vs.vfe + 5);
    W.bankAngle = Math.abs(o.bank) > 35 && !mainWow;
    const vsFpm = o.vs / FPM;
    W.sinkRate = !mainWow && raFt < 2500 && raFt > 30 && vsFpm < -(1000 + raFt * 1.0);
    W.pullUp = !mainWow && raFt < 2000 && raFt > 30 && vsFpm < -(2000 + raFt * 1.1);
    W.tooLowGear = !mainWow && raFt < 500 && raFt > 30 && ctl.gearPos > 0.5 && o.ias < 190 && vsFpm < 0;
    W.tooLowFlaps = !mainWow && raFt < 245 && raFt > 30 && this.flapLever < 4 && ctl.gearPos < 0.5 && vsFpm < 0 && o.ias < 170;
    W.glideslope = this.ilsDev.gsValid && this.ap.pitch !== 'GS' && raFt < 1000 && raFt > 50 && this.ilsDev.gs < -0.9
      && Math.abs(this.ilsDev.loc) < 3 && ctl.gearPos < 0.5;
    W.config = mainWow && o.gs < 100 && this.tla[0] > 0.6 && (this.flapLever < 2 || this.flapLever > 5 || ctl.parkingBrake || this.speedbrakeLever > 0.1);
    // ---- callouts ----
    const C = this.callouts;
    if (mainWow && o.ias > 60 && this.tla[0] > 0.6) {
      if (!this._v1 && o.ias >= vs.v1) { C.push('v1'); this._v1 = true; }
      if (!this._vr && o.ias >= vs.vr) { C.push('rotate'); this._vr = true; }
    }
    if (mainWow && o.ias < 40) { this._v1 = this._vr = false; this._posRate = false; }
    if (!mainWow && !this._posRate && o.vs > 1.5 && raFt > 35 && raFt < 400 && this.tla[0] > 0.6) { C.push('positive'); this._posRate = true; }
    const prev = this._raPrev;
    if (!mainWow && o.vs < 0) {
      for (const h of [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10]) {
        if (prev > h && raFt <= h) C.push('ra' + h);
      }
      if (prev > 250 && raFt <= 250 && this.ils) C.push('minimums_approach');
      if (prev > 200 && raFt <= 200) C.push('minimums');
    }
    this._raPrev = raFt;
  }
}
