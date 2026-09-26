// Small dependency-free math used by the physics (so it can run in Node for tests).
// Frames: world = three.js (x east, y up, z south). Body = aircraft (x fwd, y up, z right).

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const KT = 0.514444;          // m/s per knot
export const FT = 0.3048;            // m per foot
export const FPM = FT / 60;          // m/s per ft/min
export const G0 = 9.80665;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrap180 = (a) => {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a;
};
export const wrap360 = (a) => ((a % 360) + 360) % 360;
// move x toward target at max rate r*dt
export const approach = (x, target, rate, dt) => {
  const d = target - x;
  const m = rate * dt;
  return Math.abs(d) <= m ? target : x + Math.sign(d) * m;
};

export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  len() { return Math.hypot(this.x, this.y, this.z); }
  norm() { const l = this.len() || 1; return this.scale(1 / l); }
  static add(a, b) { return new V3(a.x + b.x, a.y + b.y, a.z + b.z); }
  static sub(a, b) { return new V3(a.x - b.x, a.y - b.y, a.z - b.z); }
  static cross(a, b) {
    return new V3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
}

export class Quat {
  constructor(w = 1, x = 0, y = 0, z = 0) { this.w = w; this.x = x; this.y = y; this.z = z; }
  copy(q) { this.w = q.w; this.x = q.x; this.y = q.y; this.z = q.z; return this; }
  clone() { return new Quat(this.w, this.x, this.y, this.z); }
  static axisAngle(ax, ay, az, a) {
    const s = Math.sin(a / 2);
    return new Quat(Math.cos(a / 2), ax * s, ay * s, az * s);
  }
  mul(b) {   // this * b
    const a = this;
    return new Quat(
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w);
  }
  normalize() {
    const l = Math.hypot(this.w, this.x, this.y, this.z) || 1;
    this.w /= l; this.x /= l; this.y /= l; this.z /= l; return this;
  }
  conj() { return new Quat(this.w, -this.x, -this.y, -this.z); }
  // rotate vector (body -> world when q is body->world)
  rotate(v) {
    const { w, x, y, z } = this;
    const ix = w * v.x + y * v.z - z * v.y;
    const iy = w * v.y + z * v.x - x * v.z;
    const iz = w * v.z + x * v.y - y * v.x;
    const iw = -x * v.x - y * v.y - z * v.z;
    return new V3(
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x);
  }
  invRotate(v) { return this.conj().rotate(v); }
  // integrate body angular velocity w (rad/s) over dt
  integrate(wb, dt) {
    const dq = this.mul(new Quat(0, wb.x, wb.y, wb.z));
    this.w += 0.5 * dq.w * dt; this.x += 0.5 * dq.x * dt;
    this.y += 0.5 * dq.y * dt; this.z += 0.5 * dq.z * dt;
    return this.normalize();
  }
  // Build from aviation Euler angles (heading from north cw, pitch up, bank right), degrees.
  static fromHPB(hdg, pitch, bank) {
    // yaw about +y: heading h means nose points (sin h, 0, -cos h); a +y rotation of a
    // turns +x towards -z, so a = 90deg - h.
    const qy = Quat.axisAngle(0, 1, 0, (90 - hdg) * DEG);
    const qz = Quat.axisAngle(0, 0, 1, pitch * DEG);
    const qx = Quat.axisAngle(1, 0, 0, bank * DEG);
    return qy.mul(qz).mul(qx);
  }
  // heading, pitch, bank (deg) of the body attitude
  toHPB() {
    const fwd = this.rotate(new V3(1, 0, 0));
    const up = this.rotate(new V3(0, 1, 0));
    const right = this.rotate(new V3(0, 0, 1));
    const pitch = Math.asin(clamp(fwd.y, -1, 1)) * RAD;
    const hdg = wrap360(Math.atan2(fwd.x, -fwd.z) * RAD);
    // bank: angle of the right wing below the horizon, measured in the plane normal to fwd
    const hr = V3.cross(fwd, new V3(0, 1, 0)).norm();   // horizontal right
    const hu = V3.cross(hr, fwd).norm();                // "level" up
    const bank = Math.atan2(-right.dot(hu), right.dot(hr)) * RAD;
    return { hdg, pitch, bank, fwd, up, right };
  }
}

export function headingVec(hdg) {
  return new V3(Math.sin(hdg * DEG), 0, -Math.cos(hdg * DEG));
}

// Deterministic PRNG
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
