// The line as seen by the player's train in its running direction.
//
// The route is laid out 上野 (s = 0) → 宇都宮 (s ≈ 108.7 km) along the down (下り) track.
// A TrackView gives the game a coordinate x that always increases in the direction of travel,
// so physics, timetable, scoring, ATS and the HUD work unchanged for the up (上り) line:
//   down: x = s on the down track (lateral 0)
//   up:   x = -s on the up track (lateral = upOffset), stations stop at the other platform end
// Rendering and sound convert back with toRoute() / pose().

export const UP_STOP_BACK = 300;   // up trains stop with their front 300 m before the down stop mark

export class TrackView {
  constructor(route, dir = 'down') {
    this.route = route;
    this.dir = dir;
    this.up = dir === 'up';
    this.sign = this.up ? -1 : 1;
    const st = route.stations.map((x) => ({
      ...x,
      realS: x.s,
      // stop position of the train front, in view coordinates
      s: this.up ? -(x.s - UP_STOP_BACK) : x.s,
    }));
    this.stations = this.up ? st.reverse() : st;
  }

  toRoute(x) { return this.up ? -x : x; }
  fromRoute(s) { return this.up ? -s : s; }

  /** lateral offset (route frame) of the track this train runs on */
  trackOffset(s) { return this.up ? this.route.upOffset(s) : 0; }

  /** point + heading at view position x, lateral lat measured to the train's left */
  pose(x, lat = 0, out = {}) {
    const s = this.toRoute(x);
    this.route.pose(s, this.trackOffset(s) + this.sign * lat, out);
    if (this.up) {
      out.dx = -out.dx; out.dz = -out.dz;
      out.lx = -out.lx; out.lz = -out.lz;
      out.th += Math.PI;
      out.yaw += Math.PI;
    }
    return out;
  }

  get sMin() { return this.up ? -this.route.sMax : this.route.sMin; }
  get sMax() { return this.up ? -this.route.sMin : this.route.sMax; }

  limitAt(x) { return this.route.limitAt(this.toRoute(x)); }

  /** most restrictive limit over the train (front at x, extending back by len) */
  limitOverTrain(x, len) {
    if (!this.up) return this.route.limitOverTrain(x, len);
    return this.route.limitOverTrain(-x + len, len);
  }

  /** upcoming limit changes ahead of x within dist: [{s, v}] (view coordinates) */
  upcomingLimits(x, dist) {
    if (!this.up) return this.route.upcomingLimits(x, dist);
    const out = [];
    let prev = this.limitAt(x);
    for (let d = 10; d < dist; d += 10) {
      const v = this.limitAt(x + d);
      if (v !== prev) { out.push({ s: x + d, v }); prev = v; }
    }
    return out;
  }

  grade(x) { return this.sign * this.route.grade(this.toRoute(x)); }
  curvature(x) { return this.sign * this.route.curvature(this.toRoute(x)); }
  structureAt(x) { return this.route.structureAt(this.toRoute(x)); }
  elev(x) { return this.route.elev(this.toRoute(x)); }
  density(x) { return this.route.density(this.toRoute(x)); }
}
