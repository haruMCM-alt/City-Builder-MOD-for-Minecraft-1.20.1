// Emergencies: airport rescue and fire fighting (ARFF) and the passenger evacuation.
//
// When an aircraft declares MAYDAY / PAN-PAN (the player via the radio, or an AI arrival),
// the fire station of that airport turns out: three crash tenders (arff.glb, built in Blender
// by blender/build_arff.py; flashing light bars) race across the airfield to standby
// positions beside the touchdown zone.  After the touchdown they chase the aircraft at full
// speed alongside the runway, drive round the wing tips to their attack positions at the
// front quarters and the nose, fire the roof monitors (ballistic water / foam jets) at the
// fires and let their crews out: fire fighters in proximity suits walk to the fire, or to the
// foot of the escape slides to help the passengers.  After the close-out the crews climb back
// in and the trucks return to the station.
//
// Evacuation: once the aircraft has stopped after an emergency landing the captain orders the
// evacuation; the escape slides inflate at every door on the side away from the fire and the
// passengers slide down and run to an assembly point clear of the aircraft.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { remoteById, nearestAirport } from './airports.js';

const ground = (x, z) => Math.max(0, terrainHeight(x, z));
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// fire station apron per airport (three.js world coordinates) - build_world.py (home, south of
// the runway, midfield) and build_airport2.py (remote airports, north side between runway and
// taxiway)
export function fireStation(apt) {
  if (apt === 1) return { x: 220, z: 245, side: 1 };
  const ap = remoteById(apt);
  return { x: ap.x + 220, z: ap.z - 110, side: -1 };
}

// ------------------------------------------------------------------ model kit (arff.glb)
// crash tender, fire fighter, passenger and escape slide; procedural stand-ins until it loads
export class ARFFKit {
  constructor(gltf) {
    const N = {};
    gltf.scene.traverse((o) => { if (!N[o.name]) N[o.name] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.truck = N.ARFF; this.ff = N.Firefighter; this.person = N.Person; this.slide = N.EvacSlide;
    for (const o of [this.truck, this.ff, this.person, this.slide]) if (o) { o.parent?.remove(o); o.position.set(0, 0, 0); }
    this.ok = !!(this.truck && this.ff && this.person && this.slide);
    // passenger colour sets (shirt / trousers / hair / skin)
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const shirts = ['#3a6ea5', '#b23a48', '#f2f2f2', '#2f8f5b', '#e0a526', '#5b4a8a', '#222831', '#d96c3b', '#8fb8de', '#c7c7c7'];
    const pants = ['#2d2f36', '#394a6d', '#6b5b4b', '#1c1c1c', '#8a8f98', '#c9b79c'];
    const hair = ['#1d1712', '#3b2a1e', '#6b4a2b', '#b8a07a', '#8a8a8a'];
    const skin = ['#f1c9a5', '#e0b896', '#c99a74', '#a8744f', '#7a5236'];
    this.palettes = [];
    const base = {};
    this.person?.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) base[m.name] = m; });
    for (let i = 0; i < 12; i++) {
      const P = {};
      for (const [k, cols] of [['P_Shirt', shirts], ['P_Pants', pants], ['P_Hair', hair], ['P_Skin', skin]]) {
        if (!base[k]) continue;
        P[k] = base[k].clone(); P[k].color.set(pick(cols));
      }
      this.palettes.push(P);
    }
  }
}

function procTruck() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc8141e, roughness: 0.45, metalness: 0.1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const box = (w, h, d, m, x, y, z, name) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; if (name) o.name = name; g.add(o); return o; };
  box(11.5, 2.4, 3.0, red, 0, 2.0, 0);
  box(11.6, 0.25, 3.05, white, 0, 1.4, 0);
  const mon = new THREE.Group(); mon.name = 'ARFF_Monitor'; mon.position.set(2.8, 3.3, 0); g.add(mon);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.18), white); barrel.position.set(0.95, 0.5, 0); mon.add(barrel);
  const wg = new THREE.CylinderGeometry(0.62, 0.62, 0.55, 16); wg.rotateX(Math.PI / 2);
  for (const x of [-4.6, -2.9, 4.2]) for (const z of [-1.22, 1.22]) { const w = new THREE.Mesh(wg, dark); w.name = 'ARFF_W'; w.position.set(x, 0.62, z); g.add(w); }
  box(0.36, 0.16, 1.08, new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff2010 }), 4.8, 3.4, -0.66, 'ARFF_LampRed');
  box(0.36, 0.16, 1.08, new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x3060ff }), 4.8, 3.4, 0.66, 'ARFF_LampBlue');
  return g;
}

function procPerson(top, bottom, helmet) {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const add = (geo, m, x, y, z, parent = g, name) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; if (name) o.name = name; parent.add(o); return o; };
  add(new THREE.BoxGeometry(0.26, 0.55, 0.42), M(top), 0, 1.18, 0);
  add(new THREE.SphereGeometry(0.12, 10, 8), M(helmet || '#e0b896'), 0, 1.66, 0);
  for (const [s, t] of [[1, 'L'], [-1, 'R']]) {
    const leg = new THREE.Group(); leg.name = 'X_Leg' + t; leg.position.set(0, 0.92, -s * 0.1); g.add(leg);
    add(new THREE.BoxGeometry(0.15, 0.9, 0.15), M(bottom), 0, -0.46, 0, leg);
    const arm = new THREE.Group(); arm.name = 'X_Arm' + t; arm.position.set(0, 1.4, -s * 0.25); g.add(arm);
    add(new THREE.BoxGeometry(0.1, 0.6, 0.1), M(top), 0, -0.3, 0, arm);
  }
  return g;
}

function procSlide() {
  const n = 20, geo = new THREE.BufferGeometry(), pos = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, z0 = (1 - t0) ** 1.35, z1 = (1 - t1) ** 1.35;
    pos.push(t0, z0, -0.5, t1, z1, -0.5, t1, z1, 0.5, t0, z0, -0.5, t1, z1, 0.5, t0, z0, 0.5);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf0b416, roughness: 0.5, side: THREE.DoubleSide })));
  return g;
}

const slideProfile = (u) => (1 - u) ** 1.35 * (1 - 0.08 * Math.sin(u * Math.PI));

// ------------------------------------------------------------------ people
class Walker {
  constructor(obj) {
    this.obj = obj;
    this.limbs = {};
    obj.traverse((o) => { const m = /_(Leg|Arm)(L|R)$/.exec(o.name); if (m) this.limbs[m[1] + m[2]] = o; });
    obj.rotation.order = 'YZX';
    this.x = 0; this.z = 0; this.a = 0; this.y = null;
    this.v = 0; this.phase = Math.random() * 6; this.target = null; this.vmax = 2; this.tilt = 0; this.onArrive = null;
  }

  update(dt) {
    let moving = false;
    if (this.target) {
      const dx = this.target.x - this.x, dz = this.target.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.v = 0; const cb = this.onArrive; this.target = null; this.onArrive = null;
        if (this.faceTo) this.a = Math.atan2(this.faceTo.z - this.z, this.faceTo.x - this.x);
        cb?.();
      } else {
        const want = Math.atan2(dz, dx);
        this.a += wrapPi(want - this.a) * Math.min(1, dt * 6);
        this.v = Math.min(this.vmax, d * 1.5 + 0.3);
        this.x += Math.cos(this.a) * this.v * dt; this.z += Math.sin(this.a) * this.v * dt;
        moving = true;
      }
    }
    const L = this.limbs;
    if (moving) this.phase += dt * (2.2 + this.v * 2.1);
    const sw = moving ? Math.sin(this.phase) * Math.min(0.75, 0.25 + this.v * 0.14) : 0;
    if (L.LegL) L.LegL.rotation.z = sw; if (L.LegR) L.LegR.rotation.z = -sw;
    if (L.ArmL) L.ArmL.rotation.z = -sw * 0.8; if (L.ArmR) L.ArmR.rotation.z = sw * 0.8;
    this.place();
  }

  place() {
    const y = this.y ?? ground(this.x, this.z) + 0.02;
    this.obj.position.set(this.x, y, this.z);
    this.obj.rotation.set(0, -this.a, this.tilt);
  }
}

// ------------------------------------------------------------------ crash tender
const DOORS = [[4.4, -1.6], [4.4, 1.6]];           // cab doors (truck frame: x fwd, z right)
const MON_TIP = new THREE.Vector3(1.95, 0.51, 0);  // roof monitor nozzle (monitor frame)

class Truck {
  constructor(arff, home, k) {
    this.arff = arff; this.home = home; this.k = k;
    this.x = home.x + (k - 1) * 9; this.z = home.z; this.a = -Math.PI / 2 * home.side;
    this.v = 0; this.path = []; this.spray = null; this.active = false; this.vmax = 20;
    this.crew = []; this.crewOut = false; this.onScene = false;
    this.build();
  }

  build() {
    const kit = this.arff.kit, scene = this.arff.app.scene;
    if (this.obj) scene.remove(this.obj);
    this.obj = kit?.ok ? kit.truck.clone(true) : procTruck();
    this.kitModel = !!kit?.ok;
    this.wheels = []; this.lamps = [];
    this.obj.traverse((o) => {
      if (/^ARFF_W/.test(o.name)) { o.rotation.order = 'YZX'; this.wheels.push(o); }
      if (o.name === 'ARFF_Monitor') this.monitor = o;
      if (/^ARFF_Lamp(Red|Blue)$/.test(o.name)) {
        o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); this.lamps.push(m.material); } });
      }
    });
    if (this.monitor) this.monitor.rotation.order = 'YZX';
    scene.add(this.obj);
    this.place(0);
  }

  goTo(pts, vmax = 30) { this.path = pts.slice(); this.vmax = vmax; }

  place(t) {
    const y = ground(this.x, this.z) + 0.02;
    this.obj.position.set(this.x, y, this.z);
    this.obj.rotation.set(0, -this.a, 0);
    const ph = (t * 2.6 + this.k * 0.37) % 1;
    this.lamps.forEach((m, i) => { m.emissiveIntensity = this.active && ((ph < 0.5) === (i % 2 === 0)) ? 8 : 0.05; });
  }

  // world position of a point in the truck frame (x fwd, z right)
  local(f, r) { const c = Math.cos(this.a), s = Math.sin(this.a); return { x: this.x + c * f - s * r, z: this.z + s * f + c * r }; }

  update(dt, t, fx) {
    if (this.path.length) {
      const p = this.path[0], dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (d < (last ? 2 : 10)) { this.path.shift(); if (!this.path.length) { this.v = 0; if (p.face != null) this.a = p.face; p.done?.(); } }
      else {
        const want = Math.atan2(dz, dx);
        const da = wrapPi(want - this.a);
        const yawMax = Math.min(0.9, this.v / 12 + 0.25);            // turning circle ~ 12 m
        this.a += Math.max(-yawMax * dt, Math.min(yawMax * dt, da * 2 * dt));
        // brake for the stop / slow for sharp turns
        let vT = last ? Math.min(this.vmax, Math.sqrt(2 * 4.5 * Math.max(d - 1, 0)) + 1) : this.vmax;
        // off heading: slow right down near the point (tight turn), so it is never orbited
        if (Math.abs(da) > 0.4) vT = Math.min(vT, Math.max(2.5, Math.min(12, d * 0.35)));
        this.v += Math.max(-6 * dt, Math.min(2.8 * dt, vT - this.v));
        this.x += Math.cos(this.a) * this.v * dt; this.z += Math.sin(this.a) * this.v * dt;
      }
    } else this.v = Math.max(0, this.v - 6 * dt);
    for (const w of this.wheels) w.rotation.z -= this.v * dt / 0.62;
    // roof monitor: aim, then a ballistic water / foam jet at the target
    const mon = this.monitor;
    if (this.spray && !this.path.length && mon) {
      this.obj.updateMatrixWorld();
      const tg = this.spray;
      const base = mon.getWorldPosition(new THREE.Vector3());
      const dx = tg.x - base.x, dz = tg.z - base.z, d = Math.max(Math.hypot(dx, dz), 1);
      const yaw = wrapPi(Math.atan2(dz, dx) - this.a);
      mon.rotation.y = -yaw;
      const T = Math.min(2.6, d / 30 + 0.4);                 // flight time of the jet
      const vy = (tg.y - base.y - 0.5) / T + 0.5 * 9.81 * T;
      mon.rotation.z = Math.atan2(vy, d / T);
      mon.updateMatrixWorld();
      const tip = mon.localToWorld(MON_TIP.clone());
      if (fx) for (let i = 0; i < 4; i++) {
        const j = () => (Math.random() - 0.5) * 1.6;
        fx.water?.({ x: tip.x, y: tip.y, z: tip.z }, { x: (tg.x - tip.x) / T + j(), y: (tg.y - tip.y) / T + 0.5 * 9.81 * T + j(), z: (tg.z - tip.z) / T + j() }, T * 1.15, 0.7);
      }
    } else if (mon) { mon.rotation.y *= 1 - Math.min(1, dt * 2); mon.rotation.z *= 1 - Math.min(1, dt * 2); }
    this.place(t);
  }

  // the crew jumps out (two fire fighters)
  deployCrew() {
    if (this.crewOut) return;
    this.crewOut = true;
    const kit = this.arff.kit;
    for (let i = 0; i < 2; i++) {
      const w = new Walker(kit?.ok ? kit.ff.clone(true) : procPerson('#b7bbc0', '#b7bbc0', '#e3b416'));
      const p = this.local(DOORS[i][0], DOORS[i][1] * 1.3);
      w.x = p.x; w.z = p.z; w.a = this.a + (i ? Math.PI / 2 : -Math.PI / 2); w.vmax = 2.6;
      this.arff.app.scene.add(w.obj);
      w.place();
      this.crew.push(w);
    }
  }

  recallCrew(done) {
    if (!this.crewOut) { done?.(); return; }
    let n = this.crew.length;
    this.crew.forEach((w, i) => {
      w.target = this.local(DOORS[i][0], DOORS[i][1] * 1.3); w.faceTo = null; w.vmax = 2.2;
      w.onArrive = () => { this.arff.app.scene.remove(w.obj); if (--n === 0) { this.crew = []; this.crewOut = false; done?.(); } };
    });
  }
}

// ------------------------------------------------------------------ ARFF service
export class ARFF {
  // loadKit: () => Promise<gltf of arff.glb>
  constructor(app, loadKit) {
    this.app = app;
    this.trucks = {};          // airport id -> [Truck x3]
    this.t = 0;
    this.job = null;           // { apt, runway, phase, getPos, getFire, meta, t }
    this.kit = null;
    loadKit?.().then((g) => {
      if (!g) return;
      this.kit = new ARFFKit(g);
      if (this.kit.ok) for (const id in this.trucks) for (const tr of this.trucks[id]) { if (!tr.crewOut) tr.build(); }
    }).catch(() => {});
  }

  _fleet(apt) {
    if (!this.trucks[apt]) {
      const home = fireStation(apt);
      this.trucks[apt] = [0, 1, 2].map((k) => new Truck(this, home, k));
    }
    return this.trucks[apt];
  }

  // standby beside the touchdown zone of the landing runway (on the fire station's side)
  deploy(apt, runway) {
    const T = this._fleet(apt), st = fireStation(apt);
    const d = { x: Math.sin(runway.heading * Math.PI / 180), z: -Math.cos(runway.heading * Math.PI / 180) };
    const side = st.side, off = 75 * side;
    if (this.job?.phase === 'ATTEND' && this.job.apt === apt) return;     // already on the way to it
    this.job = { apt, runway, phase: 'STANDBY', t: 0 };
    T.forEach((tr, k) => {
      const along = 500 + k * 350;
      const px = runway.threshold[0] + d.x * along, pz = runway.threshold[2] + d.z * along + off;
      tr.active = true; tr.spray = null; tr.onScene = false;
      tr.goTo([{ x: tr.x, z: st.z - 25 * side }, { x: px, z: pz + 25 * side }, { x: px, z: pz, face: Math.atan2(-side, 0) }], 26);
    });
  }

  // chase the aircraft, take the attack positions round it, fight the fire, crews out.
  // getPos() -> {x, z, a (heading, three.js angle), v}; getFire() -> world position or null;
  // meta: aircraft dimensions (noseTip, span, fusW)
  attend(getPos, getFire, meta = null) {
    if (!this.job) {
      const p = getPos();
      if (!p) return;
      const apt = nearestAirport(p.x, p.z);
      this.job = { apt, phase: 'STANDBY', t: 0 };
      this._fleet(apt).forEach((tr) => { tr.active = true; });
    }
    Object.assign(this.job, { phase: 'ATTEND', getPos, getFire, meta, t: 0, lastPlan: -9, stopT: 0 });
  }

  // aircraft frame helpers: f forward, r to the right
  _toWorld(p, f, r) { const c = Math.cos(p.a), s = Math.sin(p.a); return { x: p.x + c * f - s * r, z: p.z + s * f + c * r }; }
  _toBody(p, x, z) { const c = Math.cos(p.a), s = Math.sin(p.a), dx = x - p.x, dz = z - p.z; return { f: c * dx + s * dz, r: -s * dx + c * dz }; }

  // route from the truck to (f, r) near the aircraft without driving through the wings
  _route(tr, p, f, r, face, M) {
    const halfSpan = (M.span || 60) / 2, wingF = M.wingF ?? -4;
    const b = this._toBody(p, tr.x, tr.z);
    const pts = [];
    const side = Math.sign(r || b.r || 1);
    // from behind the wing to in front of it (or the other way): round the wing tip
    const crossWing = (b.f - wingF) * (f - wingF) < 0 && Math.abs(b.r) < halfSpan + 25;
    // to the other side of the fuselage: round the nose
    const crossFus = Math.sign(b.r) !== Math.sign(r) && Math.abs(r) > 3 && b.f < M.noseF + 10;
    if (crossWing) {
      if (Math.abs(b.r) < halfSpan + 12) pts.push(this._toWorld(p, b.f, Math.sign(b.r || side) * (halfSpan + 18)));
      pts.push(this._toWorld(p, wingF + 10 * Math.sign(f - wingF || 1), Math.sign(b.r || side) * (halfSpan + 18)));
    }
    if (crossFus) pts.push(this._toWorld(p, M.noseF + 25, 0));
    pts.push({ ...this._toWorld(p, f, r), face });
    return pts;
  }

  stand() {
    const J = this.job;
    const T = this.trucks[J?.apt];
    this.job = null;
    if (!T) return;
    for (const tr of T) {
      tr.spray = null; tr.onScene = false;
      tr.recallCrew(() => {
        const st = tr.home;
        tr.goTo([{ x: st.x + (tr.k - 1) * 9, z: st.z - 30 * st.side }, { x: st.x + (tr.k - 1) * 9, z: st.z, face: -Math.PI / 2 * st.side }], 16);
        tr._off = true;
      });
    }
  }

  // an accident on the airport: all trucks straight to the wreck, water on the fires
  crash(apt, p) {
    this._fleet(apt).forEach((tr) => { tr.active = true; tr.spray = null; tr.path = []; tr.onScene = false; });
    this.job = { apt, phase: 'ATTEND', t: 0, crash: true, lastPlan: -9, stopT: 0,
      getPos: () => ({ x: p.x, z: p.z, a: p.a || 0, v: 0 }),
      getFire: () => (this.job && this.job.t < 150 ? { x: p.x, y: 3, z: p.z } : null),
      meta: { noseF: 15, span: 50, fusW: 6, wingF: -4, tailF: -20 } };
  }

  // a truck is putting water on the aircraft right now
  get spraying() {
    const T = this.job && this.trucks[this.job.apt];
    return !!T && T.some((tr) => tr.spray && !tr.path.length);
  }

  _metaOf(M) {
    if (!M) return { noseF: 30, span: 60, fusW: 5.8, wingF: -4, tailF: -30 };
    if (M.noseF != null) return M;
    return { noseF: M.noseTip?.[0] ?? 30, span: M.span ?? 60, fusW: M.fusW ?? 5.8, wingF: (M.wingTipL?.[0] ?? -10) * 0.4, tailF: -(M.length ?? 60) + (M.noseTip?.[0] ?? 30) };
  }

  update(dt) {
    this.t += dt;
    const fx = this.app.mishap?.fx, J = this.job;
    if (J && J.phase === 'ATTEND' && J.getPos) {
      J.t += dt;
      const p = J.getPos();
      const T = this.trucks[J.apt];
      const M = this._metaOf(J.meta);
      if (p && T) {
        const moving = p.v > 2;
        J.stopT = moving ? 0 : J.stopT + dt;
        if (J.t - J.lastPlan > (moving ? 0.7 : 2)) {
          J.lastPlan = J.t;
          const st = fireStation(J.apt), sideR = this._toBody(p, st.x, st.z).r >= 0 ? 1 : -1;
          T.forEach((tr, k) => {
            if (moving) {
              // race alongside, clear of the wing tip, level with the aircraft
              tr.onScene = false;
              const lat = sideR * (M.span / 2 + 30 + k * 14);
              const tgt = this._toWorld(p, p.v * 1.5 - k * 20, lat);
              tr.goTo([tgt], 34);
            } else if (!tr.onScene) {
              // attack positions: front quarters (left / right) and the nose
              const slots = [[M.noseF * 0.5, -(M.fusW / 2 + 16)], [M.noseF * 0.5, M.fusW / 2 + 16], [M.noseF + 24, 0]];
              const [f, r] = slots[k];
              const w = this._toWorld(p, f, r);
              const face = Math.atan2(p.z - w.z, p.x - w.x);
              const d = Math.hypot(tr.x - w.x, tr.z - w.z);
              if (d > 3 || tr.path.length) {
                tr.goTo(this._route(tr, p, f, r, face, M), 32);
                tr.path[tr.path.length - 1].done = () => { tr.onScene = true; tr.deployCrew(); };
              } else { tr.onScene = true; tr.deployCrew(); }
            }
          });
        }
        // water on the fire (or a foam blanket on the hot brakes for a while after the stop)
        const fire = J.getFire ? J.getFire() : null;
        const gear = this._toWorld(p, 0, 0);
        for (const tr of T) {
          if (!tr.onScene || moving) { tr.spray = null; continue; }
          if (fire) tr.spray = { x: fire.x, y: fire.y, z: fire.z };
          else if (!J.crash && J.stopT < 14) tr.spray = { x: gear.x, y: 1, z: gear.z };
          else tr.spray = null;
        }
        // the crews: to the slides (evacuation), to the fire, or round the aircraft
        const evac = this.app.evac?.active ? this.app.evac.assistPoints() : null;
        let n = 0;
        for (const tr of T) for (const w of tr.crew) {
          if (w.onArrive) continue;          // walking back to the truck
          if (!w._t || this.t - w._t > 2) {
            w._t = this.t;
            let tgt;
            if (evac?.length) tgt = evac[n % evac.length];
            else if (fire) { const a = Math.atan2(tr.z - fire.z, tr.x - fire.x) + (n % 2 ? 0.25 : -0.25); tgt = { x: fire.x + Math.cos(a) * 12, z: fire.z + Math.sin(a) * 12 }; }
            else tgt = this._toWorld(p, (n % 3) * 8 - 4, (n % 2 ? 1 : -1) * (M.fusW / 2 + 5));
            const o = (n >> 1) * 1.5;
            w.target = { x: tgt.x + o, z: tgt.z + o }; w.faceTo = fire || p; w.vmax = 2.6;
          }
          n++;
        }
      }
    }
    for (const id in this.trucks) for (const tr of this.trucks[id]) {
      tr.update(dt, this.t, fx);
      for (const w of tr.crew) w.update(dt);
      if (tr._off && !tr.path.length) { tr.active = false; tr._off = false; }
    }
  }

  reset() {
    this.job = null;
    for (const id in this.trucks) for (const tr of this.trucks[id]) {
      for (const w of tr.crew) this.app.scene.remove(w.obj);
      tr.crew = []; tr.crewOut = false; tr.onScene = false;
      tr.path = []; tr.spray = null; tr.active = false; tr.v = 0; tr._off = false;
      tr.x = tr.home.x + (tr.k - 1) * 9; tr.z = tr.home.z; tr.a = -Math.PI / 2 * tr.home.side;
      tr.place(0);
    }
  }
}

// ------------------------------------------------------------------ evacuation
export class Evacuation {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.exits = []; this.people = [];
  }

  get kit() { return this.app.arff?.kit; }

  // fireSide: -1 fire on the left, 1 on the right, 0 none (those doors stay shut)
  start(fireSide = 0) {
    if (this.active) return 0;
    const A = this.app, M = A.meta, root = A.visual?.root;
    if (!M || !root) return 0;
    this.reset();
    this.active = true; this.t = 0;
    root.updateWorldMatrix(true, false);
    const floor = M.cabin?.seats?.[0] ? M.cabin.seats[0].p[1] - 0.45 : -M.fusH * 0.25;
    const fwd = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld); fwd.y = 0; fwd.normalize();
    const kit = this.kit;
    for (const side of [-1, 1]) {
      if (side === fireSide) continue;
      for (const dx of M.doors || []) {
        const sill = root.localToWorld(new THREE.Vector3(dx, floor, side * M.fusW / 2 * 0.98));
        const out = new THREE.Vector3(0, 0, side).transformDirection(root.matrixWorld); out.y = 0; out.normalize();
        const H = Math.max(1.2, sill.y - ground(sill.x, sill.z));
        const L = H * 2.3 + 1, W = 1.7;
        const obj = kit?.ok ? kit.slide.clone(true) : procSlide();
        obj.position.copy(sill);
        obj.rotation.set(0, -Math.atan2(out.z, out.x), 0);
        obj.scale.set(0.01, 0.01, W);
        A.scene.add(obj);
        const toe = sill.clone().addScaledVector(out, L); toe.y = ground(toe.x, toe.z);
        this.exits.push({ sill, out, fwd: fwd.clone(), H, L, W, obj, toe, queue: 0, timer: 1 + Math.random(), lane: 0, side, dx });
      }
    }
    if (!this.exits.length) { this.active = false; return 0; }
    // passengers (a representative number: every one of them is animated)
    const n = Math.min(90, Math.max(20, Math.round((A.cabin?.paxCount || 200) * 0.35)));
    for (let i = 0; i < n; i++) this.exits[i % this.exits.length].queue++;
    this.total = n; this.out = 0;
    return this.exits.length;
  }

  // where the fire fighters help: the foot of each slide
  assistPoints() {
    return this.exits.map((e) => ({ x: e.toe.x + e.out.x * 2.5 + e.fwd.x * (e.W * 0.9), z: e.toe.z + e.out.z * 2.5 + e.fwd.z * (e.W * 0.9) }));
  }

  _person() {
    const kit = this.kit;
    let obj;
    if (kit?.ok) {
      obj = kit.person.clone(true);
      const P = kit.palettes[Math.floor(Math.random() * kit.palettes.length)];
      obj.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => P[m.name] || m) : (P[o.material.name] || o.material); });
    } else obj = procPerson(['#3a6ea5', '#b23a48', '#eeeeee', '#2f8f5b', '#e0a526'][Math.floor(Math.random() * 5)], '#2d2f36');
    const s = 0.92 + Math.random() * 0.16;
    obj.scale.setScalar(s);
    this.app.scene.add(obj);
    return new Walker(obj);
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const inflate = Math.min(1, this.t / 4);
    const e3 = 1 - (1 - inflate) ** 3;
    for (const e of this.exits) {
      e.obj.scale.set(Math.max(0.01, e.L * e3), Math.max(0.01, e.H * Math.min(1, e3 * 1.3)), e.W);
      if (this.t < 5 || e.queue <= 0) continue;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 0.55 + Math.random() * 0.35;              // two lanes
        e.queue--;
        const w = this._person();
        w.mode = 'slide'; w.u = 0; w.exit = e; w.lane = (e.lane++ % 2) ? 1 : -1;
        w.a = Math.atan2(e.out.z, e.out.x);
        this.people.push(w);
      }
    }
    for (const w of this.people) {
      if (w.mode === 'slide') {
        const e = w.exit;
        w.u += dt / 2.2 * (0.6 + w.u);                  // accelerates down the slide
        const u = Math.min(1, w.u);
        const lat = w.lane * e.W * 0.23;
        w.x = e.sill.x + e.out.x * u * e.L + e.fwd.x * lat;
        w.z = e.sill.z + e.out.z * u * e.L + e.fwd.z * lat;
        w.y = ground(w.x, w.z) + slideProfile(u) * e.H + 0.05 - 0.45;
        w.tilt = 1.15 * (1 - u * 0.4);
        w.place();
        if (u >= 1) {
          // off the slide: up and away from the aircraft to the assembly point
          w.mode = 'run'; w.y = null; w.tilt = 0; this.out++;
          const k = this.out;
          const dist = 70 + (k % 5) * 3 + Math.random() * 4, spread = ((k * 7) % 11 - 5) * 2.2;
          w.target = { x: e.toe.x + e.out.x * dist + e.fwd.x * spread, z: e.toe.z + e.out.z * dist + e.fwd.z * spread };
          w.faceTo = e.sill; w.vmax = 3 + Math.random() * 1.5;
        }
      } else w.update(dt);
    }
  }

  get done() { return this.active && this.exits.every((e) => e.queue <= 0) && this.people.every((w) => w.mode !== 'slide'); }

  reset() {
    for (const e of this.exits) this.app.scene.remove(e.obj);
    for (const w of this.people) this.app.scene.remove(w.obj);
    this.exits = []; this.people = []; this.active = false;
  }
}
