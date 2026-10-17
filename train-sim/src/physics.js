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
    const aTr = tractiveAccel(veh, vk, this.power);
    let a = aTr - resistance(vk) - (this.v > 0 ? decel * lowBoost : 0);
    const prevA = this.a;
    if (this.v <= 0 && a <= 0) { a = 0; this.v = 0; }
    this.v = Math.max(0, this.v + a * dt);
    this.s += this.v * dt;
    this.jerk = (a - prevA) / Math.max(dt, 1e-3);
    this.a = a;
  }

  /** traction "torque" for the sound engine: + power, - regenerative braking */
  get torque() {
    const vk = this.kmh;
    if (this.power > 0.01) return this.power * (0.55 + 0.45 * Math.min(1, vk / 20));
    const sound = this.veh.sound;
    if (this.brake > 0.02 && vk > 3 && !(sound.type === 'dc' && sound.cam)) {
      // regen fades out below ~8 km/h (air brake takes over)
      return -Math.min(1, this.brake) * Math.min(1, (vk - 3) / 6) * 0.8;
    }
    return 0;
  }
}
