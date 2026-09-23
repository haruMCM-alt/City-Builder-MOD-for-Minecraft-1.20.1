// Passenger cabin: static Blender interior + instanced seats and passengers.
// The cabin file is loaded the first time the camera goes inside (cabin / window views).
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const TINT = new Set(['Seat_FabricY', 'Seat_FabricJ', 'Pax_Skin', 'Pax_Shirt', 'Pax_Pants', 'Pax_Hair']);
const SHIRTS = ['#2d4a7a', '#b8423a', '#f2f2f0', '#2f6b4f', '#1d1f24', '#7a5c9e', '#d9a441', '#4f7fa8', '#8c8f94',
  '#c46d8e', '#3c7d86', '#e7ddc9', '#5a3b2e', '#243a5e'];
const PANTS = ['#1f2533', '#2b2d31', '#3a4a66', '#5c4a3a', '#6f6a60', '#22324a', '#111214'];
const SKIN = ['#f1c9a5', '#e0b896', '#c99a74', '#a8764f', '#7d5537', '#5a3a26', '#f5d7bd'];
const HAIR = ['#141110', '#2b1d14', '#4a3222', '#7a5a3a', '#b89a6a', '#9a9a9a', '#d8d4cc', '#1c1a1a'];

export class Cabin {
  constructor(visual, meta, load) {
    this.visual = visual;
    this.info = meta.cabin;
    this.load = load;
    this.group = null;
    this.loading = null;
    this.inst = { Y: [], J: [], pax: [] };
    this.paxCount = 0;
    this.pax = 0;
    this.visible = false;
    // cabin lights: an ambient term that is only on while the camera is inside
    // (ambient lights do not change the shader light count, so toggling is free)
    this.amb = new THREE.AmbientLight(0xfff3e6, 0);
    visual.scene.add(this.amb);
  }

  get available() { return !!this.info; }

  ensure() {
    if (!this.info) return Promise.resolve(null);
    if (!this.loading) this.loading = this.load().then((g) => this._build(g)).catch((e) => { console.warn('cabin', e); this.loading = null; });
    return this.loading;
  }

  _build(gltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const protos = {};
    for (const n of ['Proto_SeatY', 'Proto_SeatJ', 'Proto_Pax']) protos[n] = root.getObjectByName(n);
    for (const p of Object.values(protos)) if (p) p.parent.remove(p);
    this.mats = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      this._prepMat(o.material);
    });
    this.group = new THREE.Group();
    this.group.name = 'Cabin';
    this.group.add(root);
    // instanced seats and passengers
    const seats = this.info.seats;
    const Y = seats.filter((s) => s.c !== 'J'), J = seats.filter((s) => s.c === 'J');
    this.seatY = Y; this.seatJ = J;
    this.inst.Y = this._instances(protos.Proto_SeatY, Y.length);
    this.inst.J = this._instances(protos.Proto_SeatJ, J.length);
    this.inst.pax = this._instances(protos.Proto_Pax, seats.length);
    const m = new THREE.Matrix4(), sc = new THREE.Vector3();
    const place = (list, arr, cls) => list.forEach((s, i) => {
      // premium economy: the economy seat, a little wider
      sc.set(1, 1, s.c === 'W' ? s.w / 0.46 : 1);
      m.compose(new THREE.Vector3(s.p[0], s.p[1], s.p[2]), new THREE.Quaternion(), sc);
      for (const im of arr) im.setMatrixAt(i, m.clone().multiply(im.userData.rel));
    });
    place(Y, this.inst.Y); place(J, this.inst.J);
    for (const im of [...this.inst.Y, ...this.inst.J]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    for (const im of [...this.inst.Y, ...this.inst.J, ...this.inst.pax]) this.group.add(im);
    this.visual.root.add(this.group);
    this.group.visible = this.visible;
    if (this._livery) this.setLivery(this._livery);
    this.setPassengers(this.pax, this._seed || 1);
    return this;
  }

  _prepMat(m) {
    if (!m || this.mats.has(m)) return;
    this.mats.add(m);
    m.envMapIntensity = 0.7;
    if (m.name === 'Cabin_Sidewall') { m.alphaTest = 0.5; m.transparent = false; m.depthWrite = true; }
    if (m.name === 'Cabin_WindowPane') { m.transparent = true; m.depthWrite = false; m.opacity = 0.16; }
    // cabin lighting: a soft self-illumination that rises at night (cabin lights on)
    if (!m.emissiveMap && m.emissive && m.emissive.getHex() === 0 && m.name !== 'Cabin_WindowPane') {
      m.userData.cabinGlow = true;
      m.emissive.copy(m.color);
      if (m.map) m.emissiveMap = m.map;
      m.emissiveIntensity = 0.15;
    }
  }

  _instances(proto, count) {
    if (!proto || !count) return [];
    proto.updateMatrixWorld(true);
    const o = this.info.protoOrigin;
    // prototypes sit at the design origin (three: protoOrigin); move them to 0 first
    const inv = new THREE.Matrix4().makeTranslation(-o[0], -o[1], -o[2]).multiply(proto.matrixWorld.clone().invert());
    const out = [];
    proto.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material;
      this._prepMat(mat);
      const im = new THREE.InstancedMesh(o.geometry, mat, count);
      im.userData.rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      im.userData.mat = mat.name;
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = false;
      if (TINT.has(mat.name)) {
        mat.color.set(0xffffff);
        mat.userData.cabinGlow = false; mat.emissive.set(0x000000); mat.envMapIntensity = 1.0;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
      }
      out.push(im);
    });
    return out;
  }

  // seat fabrics follow the airline colours
  setLivery(a) {
    this._livery = a;
    if (!this.group) return;
    const prim = new THREE.Color().setRGB(a.prim.x, a.prim.y, a.prim.z, THREE.LinearSRGBColorSpace);
    const grey = new THREE.Color('#2f343c');
    const cY = prim.clone().lerp(grey, 0.72), cW = prim.clone().lerp(grey, 0.5), cJ = prim.clone().lerp(new THREE.Color('#2a2522'), 0.6);
    for (const im of this.inst.Y) {
      if (!im.instanceColor) continue;
      this.seatY.forEach((s, i) => im.setColorAt(i, s.c === 'W' ? cW : cY));
      im.instanceColor.needsUpdate = true;
    }
    for (const im of this.inst.J) {
      if (!im.instanceColor) continue;
      this.seatJ.forEach((s, i) => im.setColorAt(i, cJ));
      im.instanceColor.needsUpdate = true;
    }
  }

  // fill seats from the payload (passenger + bags ~100 kg); the rest is cargo
  paxFor(payload) {
    if (!this.info) return 0;
    return Math.min(this.info.total, Math.floor(payload / (this.info.paxMass || 100)));
  }

  setPassengers(payload, seed = 1) {
    this.pax = payload; this._seed = seed;
    this.paxCount = Math.min(this.paxFor(payload), this.info.total - (this.info.mySeat != null ? 1 : 0));
    if (!this.group) return;
    const seats = this.info.seats;
    const rnd = mulberry32(seed * 7919 + 17);
    const order = seats.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const jo = this.info.jOffset || [0, 0, 0];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const pick = (arr) => new THREE.Color(arr[Math.floor(rnd() * arr.length)]);
    const n = this.paxCount;
    // the window view is "your" seat: keep it free
    const mine = this.info.mySeat ?? -1;
    const oi = order.indexOf(mine);
    if (oi >= 0) { order.splice(oi, 1); order.push(mine); }
    for (let k = 0; k < n; k++) {
      const s = seats[order[k]];
      const j = s.c === 'J';
      p.set(s.p[0] + (j ? jo[0] : 0), s.p[1] + (j ? jo[1] : 0), s.p[2]);
      const size = 0.92 + rnd() * 0.14;
      sc.set(size, size, size * (0.95 + rnd() * 0.1));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.12);
      m.compose(p, q, sc);
      const cols = { Pax_Skin: pick(SKIN), Pax_Shirt: pick(SHIRTS), Pax_Pants: pick(PANTS), Pax_Hair: pick(HAIR) };
      for (const im of this.inst.pax) {
        im.setMatrixAt(k, m.clone().multiply(im.userData.rel));
        if (im.instanceColor && cols[im.userData.mat]) im.setColorAt(k, cols[im.userData.mat]);
      }
    }
    for (const im of this.inst.pax) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  update(inside, night) {
    this.visible = inside;
    if (inside && !this.group) this.ensure();
    if (!this.group) return;
    this.group.visible = inside;
    this.amb.intensity = inside ? 0.35 + 1.1 * night : 0;
    if (!inside) return;
    const k = 0.08 + 0.18 * night;
    for (const m of this.mats) if (m.userData.cabinGlow) m.emissiveIntensity = k;
  }
}
