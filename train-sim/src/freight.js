// Freight trains on the parallel freight lines: an EF210 electric locomotive and container wagons
// (コキ106 with 12 ft containers). Built from boxes; same place() interface as TrainSet.
import * as THREE from 'three';
import { CAR_LEN, BOGIE_C } from './vehicles.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
let M = null;
function mats() {
  if (M) return M;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...o });
  M = {
    loco: std(0x23468f, { roughness: 0.45 }),            // EF210: blue body
    band: std(0xb9c0c8, { roughness: 0.45 }),            // light grey band
    roof: std(0x5d6268),
    glass: std(0x0d1014, { roughness: 0.1, metalness: 0.4 }),
    under: std(0x1d1f22, { roughness: 0.8 }),
    deck: std(0x343a42, { roughness: 0.7 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2cc, emissiveIntensity: 2.5 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1505, emissiveIntensity: 2.0 }),
    // JR貨物 19D / 19G (red-brown), and a few other colours
    boxes: [0xa64a3c, 0xa64a3c, 0xa64a3c, 0x9b4436, 0xa85040, 0x96463a, 0x3d6db0, 0x2f5f48, 0x9aa0a6].map((c) => std(c, { roughness: 0.7, metalness: 0.05 })),
  };
  return M;
}

function box(parent, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(BOX, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function bogies(inner, M, y = 0.55) {
  for (const b of [-BOGIE_C, BOGIE_C]) box(inner, M.under, b, y, 0, 3.0, 0.7, 2.2);
}

function locomotive(inner, M, lead) {
  // car space: +x forward, +y up, z across; rail top at y = 0
  const L = 18.2, W = 2.9;
  bogies(inner, M);
  box(inner, M.under, 0, 1.05, 0, L - 0.6, 0.5, W - 0.2);                // underframe / equipment
  box(inner, M.loco, 0, 2.45, 0, L - 1.6, 2.3, W);                       // body
  box(inner, M.band, 0, 2.05, 0, L - 1.58, 0.28, W + 0.02);              // side band
  box(inner, M.roof, 0, 3.72, 0, L - 2.0, 0.24, W - 0.3);
  for (const e of [-1, 1]) {
    // cab ends: a slightly raked nose with the windscreen
    box(inner, M.loco, e * (L / 2 - 0.55), 2.3, 0, 1.1, 2.0, W);
    box(inner, M.glass, e * (L / 2 - 0.42), 3.1, 0, 0.9, 0.7, W - 0.4);
    box(inner, e > 0 === lead ? M.head : M.under, e * (L / 2 - 0.02), 1.6, 0.95, 0.06, 0.18, 0.3);
    box(inner, e > 0 === lead ? M.head : M.under, e * (L / 2 - 0.02), 1.6, -0.95, 0.06, 0.18, 0.3);
    // pantograph (folded down frame)
    box(inner, M.roof, e * 4.6, 4.05, 0, 1.6, 0.12, 1.4);
    box(inner, M.roof, e * 4.6, 4.25, 0, 0.12, 0.08, 1.9);
  }
}

function wagon(inner, M, rnd, last) {
  bogies(inner, M);
  box(inner, M.deck, 0, 1.12, 0, CAR_LEN - 0.6, 0.32, 2.5);              // flat deck
  box(inner, M.under, 0, 0.82, 0, CAR_LEN - 3, 0.3, 0.6);                // centre sill
  // five 12 ft containers (some slots empty)
  for (let k = 0; k < 5; k++) {
    if (rnd() < 0.12) continue;
    const mat = M.boxes[Math.floor(rnd() * M.boxes.length)];
    box(inner, mat, (k - 2) * 3.82, 1.28 + 1.25, 0, 3.66, 2.5, 2.45);
  }
  if (last) box(inner, M.tail, -(CAR_LEN / 2 - 0.25), 1.45, 0.9, 0.12, 0.25, 0.25);
}

export class FreightSet {
  constructor({ wagons = 16, forward = true, seed = 1 } = {}) {
    const M = mats();
    let a = seed | 0;
    const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.forward = forward;
    this.group = new THREE.Group();
    this.cars = [];
    const n = wagons + 1;
    for (let i = 0; i < n; i++) {
      const holder = new THREE.Group(), inner = new THREE.Group();
      if (i === 0) locomotive(inner, M, true);
      else wagon(inner, M, rnd, i === n - 1);
      holder.add(inner);
      holder.userData = { inner };
      this.group.add(holder);
      this.cars.push(holder);
    }
    this.length = n * CAR_LEN;
    this._p1 = {}; this._p2 = {};
  }

  place(route, sFront, offsetFn, sway = 0) {
    const dir = this.forward ? 1 : -1;
    for (let i = 0; i < this.cars.length; i++) {
      const c = sFront - dir * (CAR_LEN / 2 + i * CAR_LEN);
      const sa = c + BOGIE_C, sb = c - BOGIE_C;
      const a = route.pose(sa, offsetFn(sa), this._p1);
      const b = route.pose(sb, offsetFn(sb), this._p2);
      const car = this.cars[i];
      car.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const dx = a.x - b.x, dz = a.z - b.z;
      let yaw = Math.atan2(-dz, dx);
      let pitch = Math.atan2(a.y - b.y, Math.hypot(dx, dz));
      if (!this.forward) { yaw += Math.PI; pitch = -pitch; }
      car.rotation.set(0, yaw, pitch);
      car.userData.inner.rotation.x = Math.sin(c * 0.11 + i) * sway;
    }
  }

  dispose() { this.group.removeFromParent(); }
}
