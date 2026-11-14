// Automatic block signals and the train running ahead of us.
//
// Signals are laid out in the running direction (TrackView coordinates, x increases toward the
// destination): a starting signal 90 m past each stop mark, a home signal before each platform,
// and block signals about every 1.2 km in between. Each signal protects the block up to the
// next one; its aspect follows how many blocks ahead are clear of the leading train:
//   0 clear → R (stop), 1 → Y (45 km/h), 2 → YG (75 km/h), 3+ → G.
// ATS-P builds a stop pattern for a red signal; the yellow aspects are the driver's job
// (passing them too fast costs points).

import * as THREE from 'three';
import { PLATFORM_LEN } from './route.js';

export const ASPECT_SPEED = { R: 0, YY: 25, Y: 45, YG: 75, G: 999 };
const BLOCK = 1200;          // m, nominal automatic block length
const LOOK = 2600;           // build signal meshes this far ahead
const LAT = 2.9;             // signals stand left of the track (left-hand running)

/** signal positions in view coordinates for the whole line */
export function layoutSignals(view) {
  const out = [];
  const st = view.stations;
  for (let i = 0; i < st.length; i++) {
    const stop = st[i].s;
    if (i > 0) out.push({ x: stop - PLATFORM_LEN - 140, kind: 'home', station: st[i].name });
    if (i < st.length - 1) {
      const start = stop + 90;
      out.push({ x: start, kind: 'start', station: st[i].name });
      const nextHome = st[i + 1].s - PLATFORM_LEN - 140;
      const gap = nextHome - start;
      const n = Math.max(0, Math.round(gap / BLOCK) - 1);
      for (let k = 1; k <= n; k++) out.push({ x: start + (gap * k) / (n + 1), kind: 'block' });
    }
  }
  out.sort((a, b) => a.x - b.x);
  out.forEach((s, i) => { s.i = i; s.aspect = 'G'; });
  return out;
}

// ---------------------------------------------------------------------------
// meshes: mast, black head with four lamps (top → bottom: Y, G, R, Y), hood visors
// ---------------------------------------------------------------------------
let SIG = null;
function signalAssets() {
  if (SIG) return SIG;
  const lampOn = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 7, roughness: 0.3, toneMapped: true });
  const lampOff = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.12), roughness: 0.25 });
  SIG = {
    mast: new THREE.CylinderGeometry(0.09, 0.11, 5.6, 10),
    head: new THREE.BoxGeometry(0.22, 1.5, 0.42),
    plate: new THREE.BoxGeometry(0.03, 1.9, 0.75),
    lamp: new THREE.CircleGeometry(0.115, 16),
    hood: new THREE.CylinderGeometry(0.13, 0.13, 0.16, 12, 1, true, 0, Math.PI),
    grey: new THREE.MeshStandardMaterial({ color: 0x7c8086, roughness: 0.6, metalness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.7 }),
    on: { Y: lampOn(0xffa21a), G: lampOn(0x19e07a), R: lampOn(0xff2414) },
    off: { Y: lampOff(0xffa21a), G: lampOff(0x19e07a), R: lampOff(0xff2414) },
  };
  return SIG;
}
const LAMPS = ['Y', 'G', 'R', 'Y'];
const LIT = { R: [2], Y: [3], YG: [0, 1], YY: [0, 3], G: [1] };

function buildSignal() {
  const A = signalAssets();
  const g = new THREE.Group();
  const mast = new THREE.Mesh(A.mast, A.grey); mast.position.y = 2.8; g.add(mast);
  const plate = new THREE.Mesh(A.plate, A.black); plate.position.set(0.12, 5.0, 0); g.add(plate);
  const head = new THREE.Mesh(A.head, A.black); head.position.set(-0.02, 5.0, 0); g.add(head);
  const lamps = [];
  for (let k = 0; k < 4; k++) {
    const y = 5.5 - k * 0.33;
    const l = new THREE.Mesh(A.lamp, A.off[LAMPS[k]]);
    l.position.set(-0.135, y, 0); l.rotation.y = -Math.PI / 2;   // faces -X (toward the approaching train)
    g.add(l); lamps.push(l);
    const hood = new THREE.Mesh(A.hood, A.black);
    hood.position.set(-0.2, y + 0.02, 0); hood.rotation.z = Math.PI / 2; hood.rotation.y = Math.PI / 2;
    g.add(hood);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.lamps = lamps;
  return g;
}

function showAspect(g, aspect) {
  const A = signalAssets();
  const lit = LIT[aspect] || LIT.R;
  g.userData.lamps.forEach((l, k) => { l.material = lit.includes(k) ? A.on[LAMPS[k]] : A.off[LAMPS[k]]; });
}

export class SignalSystem {
  constructor(view, scene) {
    this.view = view;
    this.scene = scene;
    this.list = layoutSignals(view);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = new Map();       // signal index → Group
    this.passed = null;            // last signal passed by our front (its aspect when passed)
    this.prevFront = null;
  }

  /** index of the first signal at or ahead of x */
  nextIndex(x) {
    let lo = 0, hi = this.list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.list[m].x < x) lo = m + 1; else hi = m; }
    return lo;
  }

  /**
   * recompute aspects from the trains occupying the line ahead
   * occupied: [{front, rear}] in view coordinates (rear < front)
   */
  update(frontX, occupied) {
    const L = this.list;
    const i0 = Math.max(0, this.nextIndex(frontX) - 1);
    const busy = (a, b) => occupied.some((t) => t.front > a && t.rear < b);
    // block k runs from signal k to signal k+1
    for (let i = i0; i < L.length && L[i].x < frontX + LOOK + 3 * BLOCK; i++) {
      let free = 0;
      for (let k = i; k < L.length && free < 3; k++) {
        const end = k + 1 < L.length ? L[k + 1].x : L[k].x + BLOCK;
        if (busy(L[k].x, end)) break;
        free++;
      }
      L[i].aspect = free === 0 ? 'R' : free === 1 ? 'Y' : free === 2 ? 'YG' : 'G';
    }
    // a train passing a signal: remember what it showed
    let event = null;
    if (this.prevFront != null) {
      for (let i = this.nextIndex(this.prevFront); i < L.length && L[i].x <= frontX; i++) {
        this.passed = { i, aspect: L[i].aspect, x: L[i].x };
        event = this.passed;
      }
    }
    this.prevFront = frontX;
    this.updateMeshes(frontX);
    return event;
  }

  updateMeshes(frontX) {
    const L = this.list, v = this.view;
    const keep = new Set();
    const p = {};
    for (let i = Math.max(0, this.nextIndex(frontX - 300)); i < L.length && L[i].x < frontX + LOOK; i++) {
      keep.add(i);
      let g = this.meshes.get(i);
      if (!g) {
        g = buildSignal();
        v.pose(L[i].x, LAT, p);
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = p.yaw;          // local +X along the running direction; lamps face back
        this.group.add(g);
        this.meshes.set(i, g);
      }
      if (g.userData.shown !== L[i].aspect) { showAspect(g, L[i].aspect); g.userData.shown = L[i].aspect; }
    }
    for (const [i, g] of this.meshes) if (!keep.has(i)) { g.removeFromParent(); this.meshes.delete(i); }
  }

  /** the next signal ahead of x: {x, aspect, d} */
  next(x) {
    const i = this.nextIndex(x + 0.01);
    const s = this.list[i];
    return s ? { x: s.x, aspect: s.aspect, d: s.x - x, kind: s.kind } : null;
  }

  /** speed the last passed signal allows until the next one (km/h) */
  currentLimit() {
    return this.passed ? ASPECT_SPEED[this.passed.aspect] ?? 999 : 999;
  }

  dispose() { this.group.removeFromParent(); this.meshes.clear(); }
}

// ---------------------------------------------------------------------------
// the train ahead of us: same service, a few minutes earlier, simple driver
// ---------------------------------------------------------------------------
export class LeadTrain {
  /**
   * @param tt our timetable (rows with station.s in view coordinates, arr / dep in seconds)
   * @param headway seconds ahead of us
   */
  constructor(view, tt, len, headway, rnd = Math.random) {
    this.view = view;
    this.headwayStart = headway;
    this.len = len;
    this.rows = tt.map((r) => ({
      x: r.station.s,
      arr: r.arr != null ? r.arr - headway : null,
      // a little extra dwell now and then (crowds, a late passenger…)
      dep: r.dep != null ? r.dep - headway + (rnd() < 0.3 ? 20 + rnd() * 70 : 0) : null,
    }));
    this.k = 0;                    // index of the stop it is at / heading to
    this.x = this.rows[0].x;
    this.v = 0;
    this.dwell = true;
    this.done = false;
  }

  /** advance to clock time t (s) */
  update(dt, clock) {
    if (this.done) return;
    const row = this.rows[this.k];
    if (this.dwell) {
      if (row.dep == null) { this.done = true; return; }   // terminus: it leaves the line
      if (clock >= row.dep) { this.dwell = false; this.k++; }
      return;
    }
    const tgt = this.rows[this.k];
    const d = tgt.x - this.x;
    const lim = Math.min(this.view.limitOverTrain(this.x, this.len), 110) / 3.6;
    const vStop = Math.sqrt(2 * 0.75 * Math.max(0, d - 1));
    const vt = Math.min(lim, vStop);
    const a = this.v < vt ? 0.6 : -0.9;
    this.v = Math.max(0, Math.min(vt + 0.3, this.v + a * dt));
    this.x += this.v * dt;
    if (d < 1.2 && this.v < 1.5) {
      this.x = tgt.x; this.v = 0; this.dwell = true;
      tgt.dep = tgt.dep == null ? null : Math.max(tgt.dep, clock + 20);
    }
  }

  get rear() { return this.x - this.len; }
}
