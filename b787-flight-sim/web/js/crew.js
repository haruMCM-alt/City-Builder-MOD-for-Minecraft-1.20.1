// Flight crew in the cockpit: captain (left seat, four bars) and first officer (right seat,
// three bars) from the Blender prototypes in cabin-protos.glb (blender/pax_meta.py,
// build_pilot). They sit at the design eye of each type, are seen faintly through the tinted
// windshield from outside (aircraft.js cuts the glass out of the fuselage paint), and the
// captain steps aside for the cockpit camera, which is at his eyes. Heads turn now and then,
// hands follow the controls a little.
import * as THREE from 'three';

// pivots in the prototype frame (three.js: x forward, y up, z right; seat origin at 0)
const NECK = new THREE.Vector3(-0.13, 1.13, 0);
const SHOULDER = { L: new THREE.Vector3(-0.118, 1.05, -0.15), R: new THREE.Vector3(-0.118, 1.05, 0.15) };
const EYE = new THREE.Vector3(-0.05, 1.266, 0);
const SKIN = ['#f1c9a5', '#e0b896', '#c99a74', '#a8764f', '#f5d7bd'];
const HAIR = ['#141110', '#1c1a1a', '#2b1d14', '#3a2a1e', '#5e4330', '#8f8f8f'];

export class FlightCrew {
  constructor(loadProtos) {
    this.loadProtos = loadProtos;
    this.protos = null;
    this._p = null;
    this.sets = new Map();           // visual -> { group, cap, fo }
  }

  _load() {
    if (this._p) return;
    this._p = this.loadProtos().then((g) => {
      const src = g?.scene;
      if (!src) return;
      src.updateMatrixWorld(true);
      const P = {};
      for (const n of ['Proto_Pilot', 'Proto_PilotFO', 'Proto_PilotHead', 'Proto_PilotArmL', 'Proto_PilotArmR']) {
        const o = src.getObjectByName(n);
        if (!o) return;
        const parts = [];
        o.traverse((m) => { if (m.isMesh) parts.push({ geo: m.geometry.clone().applyMatrix4(m.matrixWorld), mat: m.material }); });
        P[n] = parts;
      }
      this.protos = P;
    }).catch(() => {});
  }

  // one pilot: body + head and arms on their pivots, fresh materials (skin / hair per person)
  _pilot(fo, seed) {
    const P = this.protos, g = new THREE.Group();
    const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const skin = SKIN[Math.floor(rnd(1) * SKIN.length)], hair = HAIR[Math.floor(rnd(2) * HAIR.length)];
    const mats = new Map();
    const mat = (src) => {
      if (!mats.has(src.name)) {
        const m = new THREE.MeshStandardMaterial({ color: src.color.clone(), roughness: src.roughness ?? 0.7, metalness: src.metalness ?? 0, name: src.name });
        if (/Pax_Skin/.test(src.name)) m.color.set(skin);
        if (/Pax_Hair|Pax_Brow/.test(src.name)) m.color.set(hair);
        mats.set(src.name, m);
      }
      return mats.get(src.name);
    };
    const add = (parts, parent, pivot) => {
      for (const p of parts) {
        const geo = pivot ? p.geo.clone().translate(-pivot.x, -pivot.y, -pivot.z) : p.geo;
        const m = new THREE.Mesh(geo, mat(p.mat));
        m.castShadow = false; m.receiveShadow = false;
        parent.add(m);
      }
    };
    add(P[fo ? 'Proto_PilotFO' : 'Proto_Pilot'], g);
    const head = new THREE.Group(); head.position.copy(NECK); g.add(head);
    add(P.Proto_PilotHead, head, NECK);
    const arms = {};
    for (const s of ['L', 'R']) {
      const a = new THREE.Group(); a.position.copy(SHOULDER[s]); g.add(a);
      add(P['Proto_PilotArm' + s], a, SHOULDER[s]);
      arms[s] = a;
    }
    g.userData = { head, arms, look: 0, lookT: 2 + rnd(3) * 6, lookTo: 0, nod: 0 };
    return g;
  }

  // seats: the captain's eye is the cockpit camera (meta.eye); the first officer mirrors it
  // about the flight-deck centre line
  _attach(visual, meta) {
    const ck = visual.cockpit?.[0];
    let zc = 0;
    if (ck) {
      const box = new THREE.Box3().setFromObject(ck);
      const inv = new THREE.Matrix4().copy(visual.root.matrixWorld).invert();
      zc = box.getCenter(new THREE.Vector3()).applyMatrix4(inv).z;
    }
    const e = meta.eye;
    const group = new THREE.Group(); group.name = 'FlightCrew';
    const cap = this._pilot(false, 3 + e[0]), fo = this._pilot(true, 11 + e[0]);
    cap.position.set(e[0] - EYE.x, e[1] - EYE.y, e[2]);
    fo.position.set(e[0] - EYE.x, e[1] - EYE.y, 2 * zc - e[2]);
    group.add(cap, fo);
    visual.root.add(group);
    const set = { group, cap, fo };
    this.sets.set(visual, set);
    return set;
  }

  // env: { view, ctl (fm.ctl), dt }
  update(visual, meta, env) {
    if (!visual) return;
    const want = visual.cockpitVisible;
    let set = this.sets.get(visual);
    if (!set) {
      if (!want) return;
      this._load();
      if (!this.protos) return;
      set = this._attach(visual, meta);
    }
    set.group.visible = want;
    if (!want) return;
    set.cap.visible = env.view !== 'cockpit';
    const dt = env.dt || 0, ctl = env.ctl || {};
    for (const [p, k] of [[set.cap, 0], [set.fo, 1]]) {
      const u = p.userData;
      // now and then a look out of the side window, at the other pilot or down at the panel
      u.lookT -= dt;
      if (u.lookT <= 0) {
        const r = Math.random();
        u.lookTo = r < 0.5 ? 0 : r < 0.7 ? (k ? 0.55 : -0.55) : r < 0.85 ? (k ? -0.6 : 0.6) : 0;
        u.nodTo = r > 0.85 ? -0.25 : 0;
        u.lookT = 2.5 + Math.random() * 6;
      }
      u.look += (u.lookTo - u.look) * Math.min(1, dt * 2.5);
      u.nod += ((u.nodTo || 0) - u.nod) * Math.min(1, dt * 2.5);
      u.head.rotation.set(0, -u.look, u.nod);
      // the pilot flying (captain) follows the controls with his hands
      if (!k) {
        const roll = (ctl.aileron ?? 0) * 0.25, pitch = (ctl.elevator ?? 0) * 0.12;
        u.arms.L.rotation.set(roll, 0, pitch);
        u.arms.R.rotation.set(roll, 0, pitch);
      }
    }
  }
}
