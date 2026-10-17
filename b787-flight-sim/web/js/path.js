// Ground / air route geometry for the AI traffic.
//
// A Path is a polyline in the horizontal plane (three.js x, z) whose corners are replaced
// by circular arcs (fillets) of a requested radius, sampled densely on the arcs.  Movers
// follow a path by arc length s: position and heading come straight from the geometry,
// the speed is planned from the curvature ahead (lateral acceleration limit), speed
// limits carried by the path, the end of the path and "hold" points (stop bars / clearances).
//
// Heading convention: a = atan2(dz, dx), forward = (cos a, 0, sin a); compass = a + 90 deg.

export class Path {
  // pts: [{x, z, v?}] (v: speed limit from that point on); radius: fillet radius (m) or per-corner array
  constructor(pts, radius = 10, step = 2) {
    const P = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05);
    this.src = P;
    const xs = [], zs = [], vl = [], ks = [], ta = [], id = [];
    const push = (x, z, v, k, h, c) => { xs.push(x); zs.push(z); vl.push(v); ks.push(k); ta.push(h); id.push(c); };
    const n = P.length;
    const vAt = (i) => (P[i].v ?? Infinity);
    const segLen = [];
    for (let i = 0; i < n - 1; i++) segLen.push(Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z));
    const dirOf = (i) => Math.atan2(P[i + 1].z - P[i].z, P[i + 1].x - P[i].x);
    push(P[0].x, P[0].z, vAt(0), 0, dirOf(0), -1);
    this.corners = [];
    for (let i = 1; i < n - 1; i++) {
      const R = Array.isArray(radius) ? (radius[i] ?? 10) : radius;
      const ux = (P[i].x - P[i - 1].x) / segLen[i - 1], uz = (P[i].z - P[i - 1].z) / segLen[i - 1];
      const wx = (P[i + 1].x - P[i].x) / segLen[i], wz = (P[i + 1].z - P[i].z) / segLen[i];
      const cosT = Math.max(-1, Math.min(1, ux * wx + uz * wz));
      const th = Math.acos(cosT);
      if (th < 1e-3 || R <= 0) { push(P[i].x, P[i].z, vAt(i - 1), 0, dirOf(i), -1); this.corners.push(null); continue; }
      const maxIn = i === 1 ? segLen[0] * 0.98 : segLen[i - 1] * 0.5;
      const maxOut = i === n - 2 ? segLen[i] * 0.98 : segLen[i] * 0.5;
      let t = R * Math.tan(th / 2);
      t = Math.min(t, maxIn, maxOut);
      const r = t / Math.tan(th / 2);
      const ax = P[i].x - ux * t, az = P[i].z - uz * t;
      const cross = ux * wz - uz * wx;               // > 0: turning towards +z of the travel (right)
      const sgn = cross > 0 ? 1 : -1;
      const nx = -uz * sgn, nz = ux * sgn;           // towards the centre
      const cx = ax + nx * r, cz = az + nz * r;
      const a0 = Math.atan2(az - cz, ax - cx);
      const segs = Math.max(2, Math.ceil(r * th / step));
      const k = sgn / r;
      const h0 = Math.atan2(uz, ux);
      push(ax, az, vAt(i - 1), k, h0, i);
      for (let j = 1; j <= segs; j++) {
        const a = a0 + sgn * th * j / segs;
        push(cx + Math.cos(a) * r, cz + Math.sin(a) * r, vAt(i), j < segs ? k : 0, h0 + sgn * th * j / segs, j < segs ? i : -1);
      }
      this.corners.push({ i, r, k });
    }
    push(P[n - 1].x, P[n - 1].z, vAt(n - 2), 0, dirOf(n - 2), -1);
    const m = xs.length;
    this.x = Float64Array.from(xs); this.z = Float64Array.from(zs);
    this.vlim = Float64Array.from(vl); this.k = Float64Array.from(ks);
    this.ta = Float64Array.from(ta);
    this.arc = new Uint8Array(m);
    for (let i = 0; i < m - 1; i++) this.arc[i] = id[i] >= 0 && (id[i + 1] === id[i] || (id[i + 1] < 0 && ks[i] !== 0)) ? 1 : 0;
    this.s = new Float64Array(m); this.a = new Float64Array(m);
    for (let i = 1; i < m; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    for (let i = 0; i < m - 1; i++) this.a[i] = Math.atan2(this.z[i + 1] - this.z[i], this.x[i + 1] - this.x[i]);
    this.a[m - 1] = this.a[Math.max(0, m - 2)];
    this.length = this.s[m - 1];
    // arc length of each source vertex (closest sample) -> legs
    this.vertexS = P.map((p) => this.nearestS(p.x, p.z));
    this._i = 0;
  }

  _seg(s) {
    let i = Math.min(this._i, this.s.length - 2);
    while (i > 0 && this.s[i] > s) i--;
    while (i < this.s.length - 2 && this.s[i + 1] < s) i++;
    this._i = i;
    return i;
  }

  // position / heading at arc length s -> out {x, z, a, k}
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.length, s));
    const i = this._seg(s);
    const L = this.s[i + 1] - this.s[i];
    const t = L > 1e-9 ? (s - this.s[i]) / L : 0;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    if (this.arc[i]) {
      // on a fillet: interpolate the true tangent heading
      const a0 = this.ta[i];
      let d = this.ta[i + 1] - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      out.a = a0 + d * t;
      out.k = this.k[i];
    } else { out.a = this.a[i]; out.k = 0; }
    return out;
  }

  nearestS(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.x.length - 1; i++) {
      const ex = this.x[i + 1] - this.x[i], ez = this.z[i + 1] - this.z[i];
      const L2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - this.x[i]) * ex + (z - this.z[i]) * ez) / L2));
      const px = this.x[i] + ex * t, pz = this.z[i] + ez * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = this.s[i] + Math.sqrt(L2) * t; }
    }
    return best;
  }

  // planned speed limit at s for a mover travelling at v with the given decel / lateral accel
  plan(s, v, dec, aLat, vmax) {
    let lim = Math.min(vmax, Math.sqrt(2 * dec * Math.max(0, this.length - s)));
    const look = v * v / (2 * dec) + 8;
    let i = this._seg(s);
    for (; i < this.s.length && this.s[i] < s + look; i++) {
      const ds = Math.max(0, this.s[i] - s);
      let vi = this.vlim[i];
      const k = Math.abs(this.k[i]);
      if (k > 1e-6) vi = Math.min(vi, Math.sqrt(aLat / k));
      if (vi < Infinity) lim = Math.min(lim, Math.sqrt(vi * vi + 2 * dec * ds));
    }
    return lim;
  }
}

// Follows a path by arc length.  dir = -1 moves backwards (the body faces against the path).
export class Mover {
  constructor(path, { vmax = 8, acc = 1, dec = 1.5, aLat = 1.5, dir = 1, v = 0 } = {}) {
    this.path = path; this.s = 0; this.v = v;
    this.vmax = vmax; this.acc = acc; this.dec = dec; this.aLat = aLat; this.dir = dir;
    this.holds = [];          // [{s, cleared}] stop points
    this.limit = Infinity;    // external speed limit (obstacles)
    this.pose = { x: path.x[0], z: path.z[0], a: path.a[0], k: 0 };
    this.done = false;
  }

  hold(s, tag) { const h = { s, tag, cleared: false }; this.holds.push(h); this.holds.sort((a, b) => a.s - b.s); return h; }

  nextHold() { return this.holds.find((h) => !h.cleared && h.s >= this.s - 0.5); }

  atHold() {
    const h = this.nextHold();
    return h && h.s - this.s < 1.5 && this.v < 0.3 ? h : null;
  }

  update(dt) {
    const p = this.path;
    let vt = p.plan(this.s, this.v, this.dec, this.aLat, this.vmax);
    const h = this.nextHold();
    if (h) vt = Math.min(vt, Math.sqrt(2 * this.dec * Math.max(0, h.s - this.s - 0.3)));
    vt = Math.min(vt, this.limit);
    if (this.v < vt) this.v = Math.min(vt, this.v + this.acc * dt);
    else this.v = Math.max(vt, this.v - Math.min(Math.max(this.dec, (this.v - vt) * 2), this.dec * 1.6) * dt);
    if (this.v < 0.02 && vt < 0.05) this.v = 0;
    this.s = Math.min(p.length, this.s + this.v * dt);
    p.at(this.s, this.pose);
    if (this.dir < 0) this.pose.a += Math.PI;
    this.done = this.s >= p.length - 0.05 && this.v < 0.05;
    return this.pose;
  }
}
