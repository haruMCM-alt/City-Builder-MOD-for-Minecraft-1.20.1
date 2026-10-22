import { tractiveAccel, resistance } from './vehicles.js';

/**
 * Train dynamics with a one-handle master controller.
 * handle: -(brakeNotches+1) = EB, -brakeNotches..-1 = B, 0 = N, 1..powerNotches = P
 */
export class TrainPhysics {
  constructor(veh, nCars) {
    this.veh = veh;
    this.nCars = nCars;
    this.len = nCars * 20;
    this.s = 0;
    this.v = 0; // m/s
    this.a = 0;
    this.handle = -veh.brakeNotches; // start fully braked
    this.power = 0; // 0..1 actual
    this.brake = 1; // 0..1 actual service brake
    this.ebActive = false;
    this.doorsOpen = false;
    this.ats = { braking: false, near: false, pattern: 999, events: 0 };
    this.jerk = 0;
    this.grade = 0; // rise per metre (+ = uphill)
    // wheel / rail adhesion: 1 = dry rail, ~0.5 = wet. slip / slide 0..1 for the HUD and sound
    this.adhesion = 1;
    this.slip = 0;
    this.slide = 0;
  }

  /** adhesion coefficient available at speed vk (km/h) here; wet rail is patchy (leaves, dirt, puddles) */
  mu(vk) {
    const patch = this.adhesion < 1 ? 0.82 + 0.3 * (0.5 + 0.5 * Math.sin(this.s / 37) * Math.sin(this.s / 113 + 1.3)) : 1;
    return (0.3 / (1 + 0.004 * vk)) * this.adhesion * patch;
  }

  get EB() { return -(this.veh.brakeNotches + 1); }
  get kmh() { return this.v * 3.6; }

  setHandle(h) {
    const veh = this.veh;
    this.handle = Math.max(this.EB, Math.min(veh.powerNotches, h));
  }

  notchLabel(h = this.handle) {
    if (h === this.EB) return 'EB';
    if (h < 0) return 'B' + -h;
    if (h > 0) return 'P' + h;
    return 'N';
  }

  /** ATS-P: braking pattern from line limits ahead and an optional stop target */
  updateATS(route, stopLimitS) {
    const vk = this.kmh;
    // the pattern allows +5 km/h over a limit and assumes ~2.9 km/h/s braking
    const aP = 0.8; // m/s²
    const M = 5;
    let pat = Math.min(route.limitOverTrain(this.s, this.len) + M, this.veh.maxSpeed + M);
    for (const L of route.upcomingLimits(this.s, 1600)) {
      const d = L.s - this.s;
      pat = Math.min(pat, Math.sqrt(((L.v + M) / 3.6) ** 2 + 2 * aP * Math.max(0, d)) * 3.6);
    }
    if (stopLimitS != null) {
      const d = stopLimitS - this.s;
      pat = Math.min(pat, Math.sqrt(2 * aP * Math.max(0, d)) * 3.6 + 10);
    }
    this.ats.pattern = pat;
    this.ats.near = vk > pat - 4;
    let fired = false;
    if (!this.ats.braking && vk > pat + 0.5) {
      this.ats.braking = true; this.ats.events++; fired = true;
      (this.ats.log ||= []).push({ s: Math.round(this.s), v: Math.round(vk), pat: Math.round(pat), lim: route.limitOverTrain(this.s, this.len) });
    }
    if (this.ats.braking && vk < pat - 3) this.ats.braking = false;
    return fired;
  }

  step(dt) {
    const veh = this.veh;
    const h = this.handle;
    let pTarget = h > 0 ? h / veh.powerNotches : 0;
    let bTarget = h < 0 ? Math.min(1, -h / veh.brakeNotches) : 0;
    const eb = h === this.EB;
    if (this.ats.braking) { pTarget = 0; bTarget = Math.max(bTarget, 1); }
    if (this.doorsOpen) pTarget = 0;
    // actuator dynamics
    const pr = pTarget > this.power ? 1.6 : 4.0;
    this.power += Math.sign(pTarget - this.power) * Math.min(Math.abs(pTarget - this.power), pr * dt);
    const br = bTarget > this.brake ? (eb ? 5 : 2.2) : 1.8;
    this.brake += Math.sign(bTarget - this.brake) * Math.min(Math.abs(bTarget - this.brake), br * dt);
    this.ebActive = eb;
    const vk = this.kmh;
    const decel = eb ? (veh.ebDecel / 3.6) * Math.min(1, this.brake) : (veh.brakeMax / 3.6) * this.brake;
    // brakes are slightly stronger at very low speed (friction coefficient)
    const lowBoost = vk < 10 ? 1 + (10 - vk) * 0.012 : 1;
    let aTr = tractiveAccel(veh, vk, this.power);
    let aBr = this.v > 0 ? decel * lowBoost : 0;
    // adhesion limits: motor axles carry ~42 % of the weight; every axle brakes
    const mu = this.mu(vk);
    const tMax = mu * 9.81 * 0.42, bMax = mu * 9.81 * 0.95;
    let slip = 0, slide = 0;
    if (aTr > tMax) { slip = Math.min(1, (aTr - tMax) / tMax + 0.25); aTr = tMax * 0.9; }      // re-adhesion control cuts the torque
    if (aBr > bMax && vk > 3) { slide = Math.min(1, (aBr - bMax) / bMax + 0.25); aBr = bMax * 0.92; } // wheel-slide protection vents the brake
    this.slip += (slip - this.slip) * Math.min(1, dt * 6);
    this.slide += (slide - this.slide) * Math.min(1, dt * 6);
    let a = aTr - resistance(vk) - aBr - 9.81 * this.grade;
    const prevA = this.a;
    // held by the brakes when standing (no rolling back)
    if (this.v <= 0 && (a <= 0 || this.brake > 0.3)) { a = 0; this.v = 0; }
    this.v = Math.max(0, this.v + a * dt);
    this.s += this.v * dt;
    this.jerk = (a - prevA) / Math.max(dt, 1e-3);
    this.a = a;
  }

  /** traction "torque" for the sound engine: + power, - regenerative braking */
  get torque() {
    const vk = this.kmh;
    if (this.power > 0.01) return this.power * (0.55 + 0.45 * Math.min(1, vk / 20)) * (1 - 0.45 * this.slip);
    const sound = this.veh.sound;
    if (this.brake > 0.02 && vk > 3 && !(sound.type === 'dc' && sound.cam)) {
      // regen fades out below ~8 km/h (air brake takes over)
      return -Math.min(1, this.brake) * Math.min(1, (vk - 3) / 6) * 0.8;
    }
    return 0;
  }
}
