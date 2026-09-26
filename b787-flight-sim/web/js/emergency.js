// Emergencies: airport rescue and fire fighting (ARFF).
//
// When an aircraft declares MAYDAY / PAN-PAN (the player via the radio, or an AI arrival),
// the fire station of that airport turns out: three red crash tenders (built here, with
// flashing light bars) drive across the airfield to their standby positions beside the
// runway's touchdown zone.  After the landing they follow the aircraft, surround it when it
// stops and fight any fire with their roof monitors (water spray); the fires go out after a
// while.  When the emergency is over they return to the station.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { remoteById } from './airports.js';

// fire station apron per airport (three.js world coordinates) - build_world.py (home, south of
// the runway, midfield) and build_airport2.py (remote airports, north side between runway and
// taxiway)
export function fireStation(apt) {
  if (apt === 1) return { x: 220, z: 245, side: 1 };
  const ap = remoteById(apt);
  return { x: ap.x + 220, z: ap.z - 110, side: -1 };
}

function truckModel() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc8141e, roughness: 0.45, metalness: 0.1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.6 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  box(11.5, 2.4, 3.0, red, 0, 2.0, 0);                 // body (x = forward)
  box(3.0, 1.2, 3.02, red, 4.4, 3.8, 0);               // cab roof
  box(0.05, 0.9, 2.6, glass, 5.92, 3.3, 0);            // windscreen
  box(11.6, 0.25, 3.05, white, 0, 1.4, 0);             // stripe
  box(1.4, 0.5, 1.2, white, 1.0, 3.45, 0);             // roof monitor base
  const nozzle = box(1.8, 0.25, 0.25, white, 2.0, 3.8, 0);
  const wheelG = new THREE.CylinderGeometry(0.72, 0.72, 0.6, 16);
  wheelG.rotateX(Math.PI / 2);
  for (const x of [-3.8, -1.8, 3.6]) for (const z of [-1.45, 1.45]) { const w = new THREE.Mesh(wheelG, dark); w.position.set(x, 0.72, z); g.add(w); }
  // light bar: two lamps, flashing
  const lampM = [new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff2010, emissiveIntensity: 0 }),
    new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x3060ff, emissiveIntensity: 0 })];
  const lamps = [box(0.4, 0.3, 1.1, lampM[0], 5.2, 4.55, -0.6), box(0.4, 0.3, 1.1, lampM[1], 5.2, 4.55, 0.6)];
  lamps[0].material = lampM[0]; lamps[1].material = lampM[1];
  return { g, lampM, nozzle };
}

class Truck {
  constructor(scene, home, k) {
    const m = truckModel();
    this.obj = m.g; this.lampM = m.lampM; this.nozzle = m.nozzle;
    this.home = home; this.k = k;
    this.x = home.x + (k - 1) * 9; this.z = home.z; this.a = -Math.PI / 2 * home.side;
    this.v = 0; this.path = []; this.spray = null; this.active = false;
    scene.add(this.obj);
    this.place(0);
  }

  goTo(pts, vmax = 22) { this.path = pts.slice(); this.vmax = vmax; }

  place(t) {
    const y = Math.max(0, terrainHeight(this.x, this.z)) + 0.12;
    this.obj.position.set(this.x, y, this.z);
    this.obj.rotation.set(0, -this.a, 0);
    const on = this.active, ph = (t * 3 + this.k * 0.37) % 1;
    this.lampM[0].emissiveIntensity = on && ph < 0.5 ? 6 : 0;
    this.lampM[1].emissiveIntensity = on && ph >= 0.5 ? 6 : 0;
  }

  update(dt, t, fx) {
    if (this.path.length) {
      const p = this.path[0], dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (d < (last ? 1.5 : 8)) { this.path.shift(); if (!this.path.length) { this.v = 0; if (p.face != null) this.a = p.face; } }
      else {
        const want = Math.atan2(dz, dx);
        let da = want - this.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        this.a += Math.max(-1, Math.min(1, da)) * Math.min(1, dt * 1.6);
        const vT = last ? Math.min(this.vmax, d * 0.6 + 2) : this.vmax * (Math.abs(da) > 0.8 ? 0.4 : 1);
        this.v += Math.max(-6 * dt, Math.min(3 * dt, vT - this.v));
        this.x += Math.cos(this.a) * this.v * dt; this.z += Math.sin(this.a) * this.v * dt;
      }
    }
    // roof monitor: a white arc of water towards the target
    if (this.spray && fx && !this.path.length) {
      const tg = this.spray;
      const n = this.obj.position;
      const sx = n.x + Math.cos(this.a) * 2.5, sz = n.z + Math.sin(this.a) * 2.5, sy = n.y + 3.9;
      const dx = tg.x - sx, dz = tg.z - sz, d = Math.max(Math.hypot(dx, dz), 1), T = Math.min(2.2, d / 28);
      for (let i = 0; i < 3; i++) {
        const vx = dx / T + (Math.random() - 0.5) * 2, vz = dz / T + (Math.random() - 0.5) * 2, vy = (tg.y - sy) / T + 0.5 * 9.81 * T;
        fx.steam({ x: sx, y: sy, z: sz }, { x: vx, y: vy, z: vz }, T * 1.1, 0.9, 2.2, 0.45);
      }
    }
    this.place(t);
  }
}

export class ARFF {
  constructor(app) {
    this.app = app;
    this.trucks = {};          // airport id -> [Truck x3]
    this.t = 0;
    this.job = null;           // { apt, runway, phase, target(), fire(), onDone }
  }

  _fleet(apt) {
    if (!this.trucks[apt]) {
      const home = fireStation(apt);
      this.trucks[apt] = [0, 1, 2].map((k) => new Truck(this.app.scene, home, k));
    }
    return this.trucks[apt];
  }

  // standby beside the touchdown zone of the landing runway (on the fire station's side)
  deploy(apt, runway) {
    const T = this._fleet(apt), st = fireStation(apt);
    const d = { x: Math.sin(runway.heading * Math.PI / 180), z: -Math.cos(runway.heading * Math.PI / 180) };
    const side = st.side, off = 75 * side;
    this.job = { apt, runway, phase: 'STANDBY' };
    T.forEach((tr, k) => {
      const along = 500 + k * 350;
      const px = runway.threshold[0] + d.x * along, pz = runway.threshold[2] + d.z * along + off;
      tr.active = true; tr.spray = null;
      tr.goTo([{ x: tr.x, z: st.z - 25 * side }, { x: px, z: pz + 25 * side }, { x: px, z: pz, face: Math.atan2(-side, 0) }], 24);
    });
  }

  // follow the aircraft and surround it when it stops; spray when there is a fire
  attend(getPos, getFire) {
    if (!this.job) return;
    this.job.phase = 'ATTEND'; this.job.getPos = getPos; this.job.getFire = getFire; this.job.t = 0;
  }

  // a truck is putting water on the aircraft right now
  get spraying() {
    const T = this.job && this.trucks[this.job.apt];
    return !!T && T.some((tr) => tr.spray && !tr.path.length);
  }

  stand() {
    const T = this.trucks[this.job?.apt];
    if (!T) return;
    for (const tr of T) {
      tr.spray = null;
      const st = tr.home;
      tr.goTo([{ x: st.x + (tr.k - 1) * 9, z: st.z - 30 * st.side }, { x: st.x + (tr.k - 1) * 9, z: st.z, face: -Math.PI / 2 * st.side }], 14);
      tr._off = true;
    }
    this.job = null;
  }

  update(dt) {
    this.t += dt;
    const fx = this.app.mishap?.fx, J = this.job;
    if (J && J.phase === 'ATTEND' && J.getPos) {
      J.t += dt;
      const p = J.getPos();
      const T = this.trucks[J.apt];
      if (p && T && (!J.lastPlan || J.t - J.lastPlan > 3)) {
        J.lastPlan = J.t;
        // positions around the aircraft: left, right, ahead (30-40 m away)
        const c = Math.cos(p.a), s = Math.sin(p.a);
        const spots = [[-5, -38], [-5, 38], [42, 0]];
        T.forEach((tr, k) => {
          const [f, l] = spots[k];
          const x = p.x + c * f - s * l, z = p.z + s * f + c * l;
          const face = Math.atan2(p.z - z, p.x - x);
          if (Math.hypot(tr.x - x, tr.z - z) > 6) tr.goTo([{ x, z, face }], p.v > 3 ? 26 : 12);
        });
      }
      const fire = J.getFire ? J.getFire() : null;
      if (T) for (const tr of T) tr.spray = fire && p && p.v < 1 ? { x: fire.x, y: fire.y, z: fire.z } : null;
    }
    for (const id in this.trucks) for (const tr of this.trucks[id]) {
      tr.update(dt, this.t, fx);
      if (tr._off && !tr.path.length) { tr.active = false; tr._off = false; }
    }
  }

  reset() {
    this.job = null;
    for (const id in this.trucks) for (const tr of this.trucks[id]) {
      tr.path = []; tr.spray = null; tr.active = false; tr.v = 0;
      tr.x = tr.home.x + (tr.k - 1) * 9; tr.z = tr.home.z; tr.a = -Math.PI / 2 * tr.home.side;
      tr.place(0);
    }
  }
}
