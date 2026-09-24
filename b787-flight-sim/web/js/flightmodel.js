// Boeing 787-9 six-degree-of-freedom flight model.
//
// Rigid body integrated at 240 Hz: aerodynamics from stability derivatives
// (tuned to published 787-9 figures: 377 m^2 wing, L/D ~ 20, Vref30 ~ 150 kt at
// MLW, Mmo 0.90, ceiling 43,100 ft), two GE GEnx-1B75 engines (74,100 lbf),
// spring-damper landing gear with tyre friction / brakes / nose-wheel steering,
// fuel burn, and structural contact points for crash detection.
//
// Frames: world = three.js (x east, y up, z south); body = (x fwd, y up, z right).
// Body rates: w.x = roll rate (+ right wing down), w.z = pitch rate (+ nose up),
// w.y = yaw about +y (+ nose LEFT); r = -w.y is the conventional yaw rate.

import { V3, Quat, DEG, RAD, KT, FT, G0, clamp, lerp, smoothstep, approach, wrap360 } from './util.js';
import { isa, tas2cas } from './atmosphere.js';
import { terrainHeight, isWater, TERRAIN } from './terrain.js';

export const SPEC = {
  S: 377.0, b: 60.12, c: 7.71,
  OEW: 128850, MTOW: 254011, MLW: 192777, MZFW: 181437,
  fuelCapacity: 101100,            // kg (126,372 L x 0.8)
  thrustSL: 329600,                // N per engine (GEnx-1B75 74,100 lbf)
  VMO: 350, MMO: 0.90,
};

// flap detents: lever position -> surface angle (deg), placard speed (kt)
export const FLAPS = [
  { name: 'UP', angle: 0, vfe: 999 },
  { name: '1', angle: 1, vfe: 250 },
  { name: '5', angle: 5, vfe: 230 },
  { name: '15', angle: 15, vfe: 210 },
  { name: '20', angle: 20, vfe: 195 },
  { name: '25', angle: 25, vfe: 185 },
  { name: '30', angle: 30, vfe: 175 },
];

// aerodynamic increments as a function of flap surface angle (deg)
const FLAP_TABLE = [
  // angle, dCL0, dCLmax, dCD0, dCm, slat(0..1)
  [0, 0.00, 0.00, 0.0000, 0.000, 0.0],
  [1, 0.10, 0.26, 0.0022, -0.004, 0.5],
  [5, 0.28, 0.42, 0.0080, -0.012, 1.0],
  [15, 0.50, 0.57, 0.0180, -0.030, 1.0],
  [20, 0.62, 0.66, 0.0260, -0.040, 1.0],
  [25, 0.74, 0.74, 0.0400, -0.050, 1.0],
  [30, 0.86, 0.82, 0.0560, -0.060, 1.0],
];

function flapAero(angle) {
  const T = FLAP_TABLE;
  if (angle <= 0) return T[0];
  for (let i = 1; i < T.length; i++) {
    if (angle <= T[i][0]) {
      const t = (angle - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
      return T[i].map((v, k) => lerp(T[i - 1][k], v, t));
    }
  }
  return T[T.length - 1];
}

export class Engine {
  constructor(side) {
    this.side = side;       // -1 left, +1 right (body z)
    this.n1 = 21; this.n2 = 62; this.egt = 420; this.ff = 0.28;
    this.thrust = 0; this.reverse = 0; this.running = true;
  }
  // tla: 0 idle .. 1 max takeoff.  reverseCmd: 0..1 reverse lever
  update(dt, tla, reverseCmd, atm, mach, onGround) {
    const idle = onGround ? 21.5 : 27;       // approach idle in flight
    const revActive = reverseCmd > 0.02 && onGround;
    this.reverse = approach(this.reverse, revActive ? 1 : 0, revActive ? 0.5 : 0.7, dt);
    const lever = this.reverse > 0.5 ? 0.25 + 0.55 * reverseCmd : tla;
    let target = this.running ? idle + (100.5 - idle) * Math.pow(clamp(lever, 0, 1), 0.85) : 0;
    // N1 limit with altitude (flat rated): slight reduction in thin air is handled by lapse
    const tau = 0.9 + 3.2 * Math.pow(1 - clamp(this.n1 / 100, 0, 1), 1.6);
    this.n1 += (target - this.n1) * Math.min(dt / tau, 1);
    this.n2 = 55 + 0.46 * this.n1;
    // thrust: fraction of static rating vs. N1, altitude and Mach lapse
    const nf = clamp((this.n1 - 19) / (100 - 19), 0, 1.02);
    const frac = 0.035 + 0.965 * Math.pow(nf, 2.2);
    const lapse = Math.pow(atm.sigma, 0.72) * (1 - 1.05 * mach + 0.85 * mach * mach);
    let T = SPEC.thrustSL * frac * lapse;
    if (this.reverse > 0.05) T = -T * 0.32 * this.reverse + T * (1 - this.reverse);
    this.thrust = this.running ? T : 0;
    // fuel flow (kg/s), EGT
    const tsfc = 0.0118e-3 * (1 + 0.45 * mach);       // kg/(N s)  (~0.57 lb/lbf/h in cruise)
    this.ff = this.running ? Math.max(0.12, Math.abs(this.thrust) * tsfc) : 0;
    this.egt = this.running ? 380 + 560 * Math.pow(nf, 1.8) + (1 - atm.sigma) * 40 : 20;
  }
}

export class FlightModel {
  constructor(meta) {
    this.meta = meta;
    // ---- geometry from the Blender export (three.js aircraft frame) ------
    this.cgOffset = new V3(0, -0.55, 0);      // CG relative to model origin
    const cg = this.cgOffset;
    const P = (a) => new V3(a[0] - cg.x, a[1] - cg.y, a[2] - cg.z);
    this.gearExt = 0.30;                      // strut stroke below the modelled static position
    this.gear = [
      { name: 'nose', p: P(meta.noseGear), k: 1.3e6, c: 2.6e5, mu: 0.8, steer: true, brake: false },
      { name: 'left', p: P(meta.mainGearL), k: 5.2e6, c: 1.15e6, mu: 0.8, steer: false, brake: true },
      { name: 'right', p: P(meta.mainGearR), k: 5.2e6, c: 1.15e6, mu: 0.8, steer: false, brake: true },
    ];
    for (const g of this.gear) { g.p.y -= this.gearExt; g.compression = 0; g.load = 0; g.onGround = false; }
    // structural contact points (crash / scrape)
    this.hard = [
      { name: 'tail', p: P(meta.tailStrike) },
      { name: 'wingtipL', p: P(meta.wingTipL) },
      { name: 'wingtipR', p: P(meta.wingTipR) },
      { name: 'engineL', p: P(meta.engineL) },
      { name: 'engineR', p: P(meta.engineR) },
      { name: 'nose', p: P([meta.noseTip[0] - 1.0, meta.noseTip[1] - 2.2, 0]) },
      { name: 'belly', p: P([0, -3.3, 0]) },
    ];
    this.engAxis = [P(meta.engineAxisL), P(meta.engineAxisR)];
    this.engines = [new Engine(-1), new Engine(1)];

    // ---- state ------------------------------------------------------------------
    this.pos = new V3();
    this.vel = new V3();
    this.q = new Quat();
    this.w = new V3();
    this.fuel = 45000;
    this.payload = 26000;
    this.wind = new V3();         // air mass velocity (world)
    this.wet = 0;                 // runway wetness 0..1
    this.gust = new V3();
    this.turbulence = 0;
    this.time = 0;

    // ---- controls (surface positions, written by systems.js) -------------------
    this.ctl = {
      elevator: 0,     // rad, + TE down (nose down)
      stab: 0,         // rad, + nose-up trim
      aileron: 0,      // rad, + right roll
      rudder: 0,       // rad, + nose right
      flapLever: 0,    // detent index
      flapAngle: 0,    // actual surface angle (deg)
      slat: 0,
      speedbrake: 0,   // 0..1 flight spoilers (lever)
      groundSpoiler: 0,// 0..1 deployed
      rollSpoiler: 0,  // signed, for visuals
      gearDown: true,
      gearPos: 0,      // 0 down .. 1 up (transit)
      tla: [0, 0],
      reverse: [0, 0],
      brakeL: 0, brakeR: 0, parkingBrake: false,
      steer: 0,        // nose wheel angle (rad, + right)
      pushback: 0,     // m/s tug speed (negative = backwards)
    };
    this.out = {};           // derived values for instruments
    this.events = [];        // touchdown / crash events
    this.crashed = false;
    this.alphaDot = 0;
    this._alphaPrev = 0;
    this.update(0);
  }

  get mass() { return SPEC.OEW + this.payload + this.fuel; }

  inertia() {
    const m = this.mass;
    return new V3(85.5 * m, 199 * m, 122 * m);     // roll (x), yaw (y), pitch (z)
  }

  reset(pos, hdg, speedMS, pitchDeg = 0, onGround = true) {
    this.pos.copy(pos);
    this.q = Quat.fromHPB(hdg, pitchDeg, 0);
    const fwd = this.q.rotate(new V3(1, 0, 0));
    this.vel = fwd.scale(speedMS);
    this.w.set(0, 0, 0);
    this.crashed = false;
    this.events.length = 0;
    this.touchdownArmed = !onGround;
    for (const g of this.gear) g.onGround = onGround;
    this._alphaPrev = 0;
    this.wasWow = onGround;
    this.step(0);            // populate derived outputs without moving
    this.update();
  }

  // ------------------------------------------------------------------------------
  step(dt) {
    if (this.crashed) return;
    const m = this.mass;
    const I = this.inertia();
    const q = this.q;
    const alt = this.pos.y;
    const atm = isa(alt);
    const ctl = this.ctl;

    // air-relative velocity in body axes
    const air = V3.sub(this.vel, V3.add(this.wind, this.gust));
    const vb = q.invRotate(air);
    const V = Math.max(vb.len(), 0.01);
    const vhat = new V3(vb.x / V, vb.y / V, vb.z / V);
    const alpha = Math.atan2(-vb.y, vb.x);
    const beta = Math.asin(clamp(vb.z / V, -1, 1));
    const mach = V / atm.a;
    const qbar = 0.5 * atm.rho * V * V;
    const S = SPEC.S, b = SPEC.b, c = SPEC.c;
    const p = this.w.x, qr = this.w.z, r = -this.w.y;
    const Vn = Math.max(V, 20);
    const pn = p * b / (2 * Vn), qn = qr * c / (2 * Vn), rn = r * b / (2 * Vn);
    this.alphaDot = lerp(this.alphaDot, (alpha - this._alphaPrev) / Math.max(dt, 1e-4), 0.05);
    this._alphaPrev = alpha;
    const adn = this.alphaDot * c / (2 * Vn);

    // ---- configuration --------------------------------------------------------
    const fa = flapAero(ctl.flapAngle);
    const [, dCL0, dCLmax, dCD0f, dCmf] = fa;
    const gearOut = 1 - ctl.gearPos;
    const sb = ctl.speedbrake;
    const gs = ctl.groundSpoiler;
    // ground effect (wing ~3 m above the gear contact)
    const hWing = Math.max(this.out.gearHeight ?? 50, 0) + 3.2;
    const hb = hWing / b;
    const phiGE = (16 * hb) ** 2 / (1 + (16 * hb) ** 2);

    // ---- lift ---------------------------------------------------------------------
    const machF = Math.min(1 / Math.sqrt(Math.max(1 - mach * mach, 0.05)), 1.5);
    const CLa = 5.55 * machF * (1 + 0.08 * (1 - phiGE));
    const CL0 = 0.20 + dCL0;
    const CLmax = (1.40 + dCLmax) * (1 - 0.55 * clamp(mach - 0.28, 0, 0.6)) - 0.10 * sb;
    const dA = 3.2 * DEG;
    const aLin = (CLmax - CLa * dA / 2 - CL0) / CLa;     // end of linear range
    let CLw;
    const aa = Math.abs(alpha);
    if (alpha <= aLin && alpha >= -0.25) {
      CLw = CL0 + CLa * alpha;
    } else if (alpha > aLin) {
      const x = alpha - aLin;
      if (x <= dA) CLw = CL0 + CLa * aLin + CLa * x - CLa * x * x / (2 * dA);
      else {
        const post = x - dA;
        const drop = CLmax - Math.min(post / (7 * DEG), 1) * 0.42 * CLmax;
        const fp = 1.15 * Math.sin(2 * alpha);
        CLw = lerp(drop, fp, smoothstep(12 * DEG, 30 * DEG, post));
      }
    } else {
      CLw = lerp(CL0 + CLa * alpha, 1.05 * Math.sin(2 * alpha), smoothstep(0.25, 0.5, -alpha));
    }
    const stalled = alpha > aLin + dA;
    // tail contribution: elevator TE down / stabiliser nose-down trim raise the tail lift
    let CL = CLw + 4.8 * qn + 1.2 * adn + 0.30 * ctl.elevator - 0.45 * ctl.stab;
    CL -= 0.28 * sb + 0.85 * gs * (1 - 0.3 * clamp(ctl.flapAngle / 30, 0, 1));

    // ---- drag ---------------------------------------------------------------------
    const k = 0.0405 + 0.006 * clamp(ctl.flapAngle / 30, 0, 1);
    const Mcrit = 0.815 - 0.10 * Math.max(CL - 0.45, 0);
    const dm = Math.max(mach - Mcrit, 0);
    const CDwave = 20 * dm ** 4 + (dm > 0.06 ? 3 * (dm - 0.06) ** 2 : 0);
    let CD = 0.0162 + dCD0f + 0.019 * gearOut + 0.030 * sb + 0.075 * gs
      + k * (CLw - 0.12) ** 2 * phiGE + CDwave + 0.35 * beta * beta
      + 0.012 * Math.abs(ctl.rudder) + 0.02 * Math.abs(ctl.aileron) * 0.5;
    if (aa > aLin) CD += 1.3 * Math.sin(Math.min(aa, Math.PI / 2)) ** 2 * smoothstep(aLin, aLin + 10 * DEG, aa);
    CD += ctl.reverse[0] + ctl.reverse[1] > 0 ? 0.01 : 0;

    // ---- side force & moments -----------------------------------------------------
    const CY = -0.92 * beta - 0.19 * ctl.rudder;
    const Cl = (-0.10 - 0.06 * CLw) * beta - 0.42 * pn + (0.05 + 0.22 * CLw) * rn
      + 0.074 * ctl.aileron + 0.008 * ctl.rudder;
    const Cn = 0.125 * beta - (0.20 + 0.03 * CLw * CLw) * rn - 0.055 * CLw * pn
      + 0.074 * ctl.rudder - 0.006 * ctl.aileron;
    const SM = 0.105;
    let Cm = 0.030 - SM * CLa * alpha - 27 * qn - 9 * adn - 1.35 * ctl.elevator + 3.0 * ctl.stab
      + dCmf - 0.012 * sb - 0.02 * gs + 0.006 * gearOut;
    Cm += -0.06 * (1 - phiGE);                                   // ground effect nose down
    if (mach > 0.86) Cm -= 0.9 * (mach - 0.86) ** 1.5;            // Mach tuck
    if (stalled) Cm -= 0.08 * smoothstep(0, 8 * DEG, alpha - aLin - dA);

    // ---- assemble forces in body axes ---------------------------------------------
    const zb = new V3(0, 0, 1);
    let Ld = V3.cross(zb, vhat);
    if (Ld.len() < 1e-6) Ld = new V3(0, 1, 0); else Ld.norm();
    const Yd = V3.cross(vhat, Ld);
    const F = new V3();
    F.addScaled(Ld, qbar * S * CL);
    F.addScaled(vhat, -qbar * S * CD);
    F.addScaled(Yd, qbar * S * CY);
    const M = new V3(qbar * S * b * Cl, -qbar * S * b * Cn, qbar * S * c * Cm);

    // ---- engines ------------------------------------------------------------------
    const onGroundAny = this.gear.some((g) => g.onGround);
    for (let i = 0; i < 2; i++) {
      const e = this.engines[i];
      e.update(dt, ctl.tla[i], ctl.reverse[i], atm, mach, onGroundAny);
      const tf = new V3(e.thrust, 0, 0);
      F.add(tf);
      M.add(V3.cross(this.engAxis[i], tf));
      this.fuel = Math.max(0, this.fuel - e.ff * dt);
      if (this.fuel <= 0) e.running = false;
    }

    // ---- to world, gravity ----------------------------------------------------------
    const Fw = q.rotate(F);
    Fw.y -= m * G0;
    const Mb = M;

    // ---- landing gear & ground contact ----------------------------------------------
    const up = new V3(0, 1, 0);
    const fwdW = q.rotate(new V3(1, 0, 0));
    let gearHeight = 1e9;
    const gearDownFrac = ctl.gearPos < 0.02 ? 1 : 0;
    let wow = false;
    for (const g of this.gear) {
      const rw = q.rotate(g.p);
      const pc = V3.add(this.pos, rw);
      const gh = terrainHeight(pc.x, pc.z);
      const hAbove = pc.y - gh;
      gearHeight = Math.min(gearHeight, hAbove);
      g.onGround = false;
      g.compression = 0;
      g.load = 0;
      if (!gearDownFrac || hAbove > 0) continue;
      const vc = V3.add(this.vel, q.rotate(V3.cross(this.w, g.p)));
      let d = -hAbove;
      const stroke = 0.62;
      let N = g.k * Math.min(d, stroke) + (d > stroke ? g.k * 12 * (d - stroke) : 0) - g.c * vc.y;
      N = Math.max(N, 0);
      g.onGround = true; wow = true;
      g.compression = Math.min(d, stroke);
      g.load = N;
      // wheel frame on the ground plane
      let wf = new V3(fwdW.x, 0, fwdW.z).norm();
      if (g.steer && ctl.steer) {
        // rotate the wheel heading about +y by -steer (positive steer = turn right)
        const a = -ctl.steer, cs = Math.cos(a), sn = Math.sin(a);
        wf = new V3(wf.x * cs + wf.z * sn, 0, -wf.x * sn + wf.z * cs);
      }
      const wr = V3.cross(wf, up);      // right
      const vLong = vc.dot(wf);
      const vLat = vc.dot(wr);
      let brake = 0;
      if (g.brake) brake = Math.max(ctl.parkingBrake ? 1 : 0, g.name === 'left' ? ctl.brakeL : ctl.brakeR);
      const muRoll = 0.011 + (g.brake ? 0.0 : 0.004);
      // wet runway: braking friction roughly halves, cornering grip drops
      const muLong = muRoll + brake * 0.52 * (1 - 0.45 * this.wet);
      const vs = 0.25;
      let fLong = -muLong * N * clamp(vLong / vs, -1, 1);
      if (ctl.pushback && g.steer) {
        // tug holds the nose gear at the commanded speed
        fLong = clamp((ctl.pushback - vLong) * 2.5e5, -1.5e5, 1.5e5);
      }
      const fLat = -g.mu * (1 - 0.3 * this.wet) * N * clamp(vLat / 0.35, -1, 1);
      const Fg = new V3(0, N, 0).addScaled(wf, fLong).addScaled(wr, fLat);
      Fw.add(Fg);
      Mb.add(q.invRotate(V3.cross(rw, Fg)));
    }
    // structural contacts
    let scrape = null;
    for (const h of this.hard) {
      const rw = q.rotate(h.p);
      const pc = V3.add(this.pos, rw);
      const gh = terrainHeight(pc.x, pc.z);
      const d = gh - pc.y;
      if (d > 0) {
        const vc = V3.add(this.vel, q.rotate(V3.cross(this.w, h.p)));
        const N = Math.max(8e6 * d - 1.5e6 * vc.y, 0);
        const vh = new V3(vc.x, 0, vc.z);
        const Fh = new V3(0, N, 0).addScaled(vh, -0.5 * N / Math.max(vh.len(), 0.5));
        Fw.add(Fh);
        Mb.add(q.invRotate(V3.cross(rw, Fh)));
        scrape = h.name;
        const water = isWater(pc.x, pc.z);
        if (-vc.y > 3.5 || d > 0.8 || (h.name === 'belly' && this.vel.len() > 40) || water) {
          this.crash(water ? 'ditched in water' : 'structural impact (' + h.name + ')');
        }
      }
    }

    // ---- integrate ------------------------------------------------------------------
    // linear
    this.vel.addScaled(Fw, dt / m);
    this.pos.addScaled(this.vel, dt);
    // angular: I wdot = M - w x (I w)
    const Iw = new V3(I.x * this.w.x, I.y * this.w.y, I.z * this.w.z);
    const gyro = V3.cross(this.w, Iw);
    this.w.x += (Mb.x - gyro.x) / I.x * dt;
    this.w.y += (Mb.y - gyro.y) / I.y * dt;
    this.w.z += (Mb.z - gyro.z) / I.z * dt;
    // ground friction damping of yaw/roll at rest to avoid creeping
    if (wow && this.vel.len() < 0.3) this.w.scale(0.98);
    this.q.integrate(this.w, dt);

    // ---- events -------------------------------------------------------------------
    const vs = this.vel.y;
    if (wow && !this.wasWow && this.touchdownArmed) {
      this.events.push({ type: 'touchdown', vs, time: this.time, ias: this.out.ias });
      this.touchdownArmed = false;
      if (vs < -4.6) this.crash('hard landing (' + Math.round(-vs / 0.00508) + ' fpm)');
    }
    if (!wow && gearHeight > 3) this.touchdownArmed = true;
    if (scrape && !this._scrapeReported) { this.events.push({ type: 'scrape', part: scrape, time: this.time }); }
    this._scrapeReported = !!scrape;
    this.wasWow = wow;
    this.time += dt;

    // ---- outputs ------------------------------------------------------------------
    const o = this.out;
    o.alpha = alpha; o.beta = beta; o.mach = mach; o.tas = V; o.qbar = qbar;
    o.ias = tas2cas(V, atm) / KT;
    o.CL = CL; o.CLmax = CLmax; o.aStall = aLin + dA; o.stalled = stalled;
    o.gearHeight = gearHeight; o.wow = wow; o.atm = atm;
    o.nz = q.invRotate(new V3(Fw.x, Fw.y + m * G0, Fw.z)).y / (m * G0);
    o.liftN = qbar * S * CL;
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.events.push({ type: 'crash', reason, time: this.time });
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
  }

  // derived attitude / navigation info (call after stepping)
  update() {
    const o = this.out;
    const e = this.q.toHPB();
    o.hdg = e.hdg; o.pitch = e.pitch; o.bank = e.bank;
    o.alt = this.pos.y;
    o.altFt = this.pos.y / FT;
    const vh = Math.hypot(this.vel.x, this.vel.z);
    o.gs = vh / KT;
    o.vs = this.vel.y;
    o.track = vh > 1 ? wrap360(Math.atan2(this.vel.x, -this.vel.z) * RAD) : e.hdg;
    o.fpa = Math.atan2(this.vel.y, Math.max(vh, 0.1)) * RAD;
    // flight path relative to the air mass (for FBW)
    const air = V3.sub(this.vel, this.wind);
    const ah = Math.hypot(air.x, air.z);
    o.gammaAir = Math.atan2(air.y, Math.max(ah, 0.1)) * RAD;
    const ground = terrainHeight(this.pos.x, this.pos.z);
    o.ground = ground;
    // radio altitude: height of the main gear above terrain (0 on the ground)
    o.ra = Math.max(0, (o.gearHeight ?? (this.pos.y - ground)) );
    o.raFt = o.ra / FT;
    o.fuel = this.fuel; o.mass = this.mass;
  }

  // stall speed (kt CAS, 1 g) for a flap angle and current mass
  vs1g(flapAngle = this.ctl.flapAngle, mass = this.mass) {
    const fa = flapAero(flapAngle);
    const CLmax = 1.40 + fa[2];
    return Math.sqrt(2 * mass * G0 / (1.225 * SPEC.S * CLmax)) / KT;
  }
}

export { flapAero };
