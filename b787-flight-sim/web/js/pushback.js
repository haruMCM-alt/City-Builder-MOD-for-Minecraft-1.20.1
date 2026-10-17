// Automatic pushback: the tug pushes the aircraft back off the stand and turns it onto the
// taxilane, facing the departure end, then stops.  Pure-pursuit steering of the nose gear
// (the aircraft moves backwards, so the main-gear midpoint is the reference point).
import { Path } from './path.js';

const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class AutoPush {
  // pts: main-gear track in world x/z (last segment = the taxilane direction)
  constructor(fm, meta, pts, { speed = 1.3, radius = 32 } = {}) {
    this.fm = fm;
    this.mainX = meta.mainGearL[0];            // main gear x in the aircraft frame (behind the CG)
    this.wheelbase = meta.noseGear[0] - meta.mainGearL[0];
    this.path = new Path(pts, radius, 0.5);
    this.speed = speed;
    const n = pts.length;
    this.endA = Math.atan2(pts[n - 1].z - pts[n - 2].z, pts[n - 1].x - pts[n - 2].x);   // travel direction at the end
    this.done = false;
    this.s = 0;
  }

  // aircraft heading as the angle of the nose direction in the x/z plane
  _pose() {
    const fm = this.fm;
    const f = fm.q.rotate({ x: 1, y: 0, z: 0 });
    const a = Math.atan2(f.z, f.x);
    const c = Math.cos(a), s = Math.sin(a);
    return { a, x: fm.pos.x + c * this.mainX, z: fm.pos.z + s * this.mainX };
  }

  // returns { steer (rad, +right), speed (m/s backwards, 0 = stop) }
  update() {
    const P = this._pose();
    const L = this.path.length;
    this.s = Math.max(this.s, this.path.nearestS(P.x, P.z));
    const rem = L - this.s;
    const look = 9;
    const t = this.path.at(Math.min(L, this.s + look), {});
    // motion direction is the tail direction; angle of the target relative to it
    const back = P.a + Math.PI;
    let alpha = wrapPi(Math.atan2(t.z - P.z, t.x - P.x) - back);
    if (rem < look) alpha = wrapPi(this.endA - back) * 0.9 + alpha * 0.1;
    // reversing: steering the nose wheel right swings the tail left
    const steer = Math.max(-1.1, Math.min(1.1, -Math.atan(2 * this.wheelbase * Math.sin(alpha) / look)));
    const headErr = Math.abs(wrapPi(this.endA - back));
    if (rem < 1.5 && headErr < 0.12 || rem < 0.3) { this.done = true; return { steer: 0, speed: 0 }; }
    const v = rem < 12 ? Math.max(0.4, this.speed * rem / 12) : this.speed;
    return { steer, speed: v };
  }
}
