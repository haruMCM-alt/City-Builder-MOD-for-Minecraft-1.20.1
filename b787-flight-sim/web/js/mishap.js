// Damage and crash presentation.
//  * in-flight damage (FlightModel.dmg): torn-off wing sections and fins disappear (shader cut),
//    separated engines fall away, fuel leaks and fires trail from the damaged spots, alarms ring
//  * crash: fireball, the airframe breaks into pieces (nose / cabin / tail sections, wings, engines,
//    gear, doors) that tumble and slide with simple rigid-body physics, hundreds of skin fragments,
//    burning wreckage and a smoke column
import * as THREE from 'three';
import { terrainHeight, isWater } from './terrain.js';
import { liveryUniforms, setLiveryUniforms, patchLiveryShader } from './livery.js';

const G = 9.81;
const tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4();

// rigid bodies: a group with velocity / spin, bouncing and sliding on the terrain
class Body {
  constructor(obj, r, v, w, water) {
    this.obj = obj; this.r = r; this.v = v; this.w = w; this.rest = false; this.water = water;
    this.sink = 0;
  }

  step(dt) {
    if (this.rest) return;
    const o = this.obj, v = this.v;
    v.y -= G * dt;
    v.multiplyScalar(1 - 0.02 * dt);
    o.position.addScaledVector(v, dt);
    const wl = this.w.length();
    if (wl > 1e-4) o.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(tmpV.copy(this.w).divideScalar(wl), wl * dt));
    const gh = Math.max(terrainHeight(o.position.x, o.position.z), isWater(o.position.x, o.position.z) ? -0.3 : -1e9);
    const low = o.position.y - this.r * 0.45;
    if (low < gh) {
      const wet = isWater(o.position.x, o.position.z);
      o.position.y += gh - low;
      if (v.y < 0) v.y = -v.y * (wet ? 0.05 : 0.22);
      const f = wet ? 0.9 : 0.72;
      v.x *= f; v.z *= f;
      this.w.multiplyScalar(0.7);
      if (v.length() < 0.8 && Math.abs(v.y) < 0.8) { this.rest = true; this.water = wet; }
    }
  }
}

export class Mishap {
  constructor(app) {
    this.app = app;
    this.fx = app.fx;
    this.wreck = null;
    this.bodies = [];
    this.falling = [];         // separated engines
    this.shown = { wing: [0, 0], tail: 0, eng: [0, 0] };
    this.fireSrc = {};
  }

  reset() {
    const A = this.app;
    this.clearWreck();
    for (const b of this.falling) A.scene.remove(b.obj);
    this.falling = [];
    this.fx.clear();
    this.shown = { wing: [0, 0], tail: 0, eng: [0, 0] };
    this.fireSrc = {};
    A.visual.clearDamage();
    A.visual.root.visible = true;
    A.audio.stopAlarms?.();
    A.audio.setFire?.(0);
    this._warnT = 0;
  }

  // world position of a point in the aircraft frame (follows the flying aircraft)
  _atAc(p) {
    const root = this.app.visual.root;
    return () => (root.visible ? new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld) : null);
  }

  _acVel() { const v = this.app.fm.vel; return () => ({ x: v.x, y: v.y, z: v.z }); }

  // ------------------------------------------------------------------ in-flight damage
  onDamage(e) {
    const A = this.app, fm = A.fm, D = fm.dmg, m = A.meta, root = A.visual.root;
    A.visual.setDamage(D);
    if (!e.quiet) { A.audio.crunch?.(Math.min(1.2, 0.4 + e.sev / 60)); A.rig.impulse(0.8); }
    A.audio.setAlarm?.('warn', true);
    this._warnT = 8;
    const side = e.side, sgn = side === 0 ? -1 : 1;        // left = -z
    const half = (m.span || 60) / 2, rootZ = (m.fusW || 5.77) / 2 + 0.3;
    if (e.part === 'wing') {
      const f = D.wing[side];
      const z = sgn * (rootZ + (half - rootZ) * (1 - f));
      const tip = side === 0 ? m.wingTipL : m.wingTipR;
      const k = Math.abs(z) / Math.abs(tip[2]);
      const cutP = [tip[0] * k + 2, tip[1] * k, z];
      const wp = this._atAc(cutP)();
      if (wp) {
        for (let i = 0; i < 80; i++) this.fx.spark(wp, { x: fm.vel.x * 0.8 + (Math.random() - 0.5) * 30, y: fm.vel.y * 0.8 + Math.random() * 15, z: fm.vel.z * 0.8 + (Math.random() - 0.5) * 30 }, 1 + Math.random());
        this._shards(wp, fm.vel, 40, 0.8);
      }
      if (!this.fireSrc['leak' + side]) this.fireSrc['leak' + side] = this.fx.addSource(this._atAc(cutP), { kind: 'fuel', size: 3, dur: 240, getVel: this._acVel(), light: false });
      if (D.wingFire[side] && !this.fireSrc['wf' + side]) {
        this.fireSrc['wf' + side] = this.fx.addSource(this._atAc(cutP), { kind: 'trail', size: 3.5, dur: 120, getVel: this._acVel() });
        A.audio.setAlarm?.('fire', true);
      }
    } else if (e.part === 'engine') {
      const ax = side === 0 ? m.engineAxisL : m.engineAxisR;
      if (D.eng[side] >= 2 && this.shown.eng[side] < 2) this._dropEngine(side);
      if (D.engFire[side] && !this.fireSrc['ef' + side] && D.eng[side] < 2) {
        const ex = [ax[0] - 1.5, ax[1], ax[2]];
        this.fireSrc['ef' + side] = this.fx.addSource(this._atAc(ex), { kind: 'trail', size: 2.6, dur: 1e9, getVel: this._acVel() });
      }
      A.audio.setAlarm?.('fire', true);
    } else if (e.part === 'tail') {
      const wp = this._atAc([m.tailStrike[0] + 3, (m.height || 17) + m.groundY - 2, 0])();
      if (wp) { for (let i = 0; i < 50; i++) this.fx.spark(wp, { x: fm.vel.x * 0.7 + (Math.random() - 0.5) * 20, y: Math.random() * 12, z: fm.vel.z * 0.7 + (Math.random() - 0.5) * 20 }, 1.2); this._shards(wp, fm.vel, 25, 0.6); }
    }
    this.shown = { wing: D.wing.slice(), tail: D.tail, eng: D.eng.slice() };
  }

  // an engine (nacelle, fan, pylon) tears off and falls, burning
  _dropEngine(side) {
    const A = this.app, root = A.visual.root, L = side === 0 ? '_L' : '_R';
    const g = new THREE.Group();
    const src = ['Nacelle', 'Fan', 'Pylon'].map((n) => root.getObjectByName(n + L)).filter(Boolean);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const o of src) box.expandByObject(o);
    const c = box.getCenter(new THREE.Vector3());
    g.position.copy(c);
    g.quaternion.copy(root.quaternion);
    A.scene.add(g);
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert();
    for (const o of src) {
      const cl = o.clone(true);
      cl.visible = true;
      tmpM.multiplyMatrices(inv, o.matrixWorld).decompose(cl.position, cl.quaternion, cl.scale);
      g.add(cl);
    }
    const fm = A.fm;
    const b = new Body(g, box.getSize(new THREE.Vector3()).length() * 0.5,
      new THREE.Vector3(fm.vel.x * 0.9, fm.vel.y - 2, fm.vel.z * 0.9), new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
    this.falling.push(b);
    this.fx.addSource(() => g.position, { kind: 'fire', size: 3, dur: 60 });
    if (this.fireSrc['ef' + side]) { this.fireSrc['ef' + side].dur = 0; this.fireSrc['ef' + side] = null; }
    // the stub of the pylon keeps burning / leaking
    const m = A.meta, ax = side === 0 ? m.engineAxisL : m.engineAxisR;
    this.fireSrc['stub' + side] = this.fx.addSource(this._atAc([ax[0] + 3, ax[1] + 1.5, ax[2]]), { kind: 'trail', size: 2.2, dur: 90, getVel: this._acVel() });
    this.shown.eng[side] = 2;
  }

  // small skin fragments (instanced), also used for the crash
  _shards(p, vel, n, spread) {
    if (!this.shardMesh) {
      const geo = new THREE.BoxGeometry(1, 0.03, 0.7);
      const mat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
      this.shardMesh = new THREE.InstancedMesh(geo, mat, 900);
      this.shardMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3).fill(1), 3);
      this.shardMesh.frustumCulled = false;
      this.shardMesh.count = 0;
      this.app.scene.add(this.shardMesh);
      this.shards = [];
    }
    const prim = this.app.livery ? this._primary() : new THREE.Color(0xb8583a);
    for (let i = 0; i < n; i++) {
      if (this.shards.length >= 900) this.shards.shift();
      const s = 0.3 + Math.random() * 1.6 * spread;
      const c = Math.random();
      this.shards.push({
        p: new THREE.Vector3(p.x, p.y, p.z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        v: new THREE.Vector3(vel.x * (0.5 + Math.random() * 0.5) + (Math.random() - 0.5) * 40 * spread, vel.y * 0.5 + Math.random() * 25 * spread, vel.z * (0.5 + Math.random() * 0.5) + (Math.random() - 0.5) * 40 * spread),
        w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14), s: new THREE.Vector3(s, 1 + Math.random() * 2, s * (0.5 + Math.random())),
        col: (c < 0.3 ? new THREE.Color(0xd8dce0) : c < 0.42 ? prim.clone() : c < 0.72 ? new THREE.Color(0x6f757c) : new THREE.Color(0x17181a)).multiplyScalar(0.55 + 0.45 * Math.random()), rest: false,   // scorched skin, bare metal, soot
      });
    }
  }

  _primary() {
    const m = this.app.visual.paintMats && this.app.visual.paintMats[0];
    return m ? m.color.clone() : new THREE.Color(0x0b2a5c);
  }

  // ------------------------------------------------------------------ crash
  crash(reason) {
    const A = this.app, fm = A.fm, vis = A.visual, root = vis.root, m = A.meta;
    if (this.wreck) return;
    const vel = fm.crashVel ? new THREE.Vector3(fm.crashVel.x, fm.crashVel.y, fm.crashVel.z) : new THREE.Vector3();
    const water = /water/.test(reason);
    root.updateMatrixWorld(true);
    A.renderer.localClippingEnabled = true;
    vis.flexUniforms.uFlex.value = 0;
    vis.flexUniforms.uCut.value.set(1e5, 1e5, 1e5, -1e5);
    const R0 = root.matrixWorld.clone();
    const W = new THREE.Group(); W.name = 'Wreck';
    A.scene.add(W);
    this.wreck = W;
    this.bodies = [];
    const pos0 = new THREE.Vector3().setFromMatrixPosition(R0);
    const sCG = m.sCG ?? 31.85, L = m.length || 62.8;
    const x1 = sCG - 0.30 * L, x2 = sCG - 0.70 * L;      // break lines (aircraft frame x)
    const D = fm.dmg;
    const pieces = [];
    const addPiece = (name, objs, center, opts = {}) => {
      if (!objs.length && !opts.fus) return null;
      const g = new THREE.Group(); g.name = 'Wreck_' + name;
      g.position.copy(center).applyMatrix4(R0);
      g.quaternion.setFromRotationMatrix(R0);
      W.add(g);
      g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert();
      for (const o of objs) {
        const cl = o.clone(true);
        cl.visible = true;
        tmpM.multiplyMatrices(inv, o.matrixWorld).decompose(cl.position, cl.quaternion, cl.scale);
        g.add(cl);
      }
      const p = { g, name, W0: g.matrixWorld.clone(), fus: opts.fus };
      pieces.push(p);
      return p;
    };
    const byName = (n) => root.getObjectByName(n);
    const all = [];
    root.traverse((o) => { if (o !== root && o.parent === root) all.push(o); });
    const sideOf = (n) => (/_L\d*$/.test(n) ? 'L' : /_R\d*$/.test(n) ? 'R' : '');
    const wingParts = { L: [], R: [] }, gear = [], small = [];
    for (const o of all) {
      const n = o.name;
      if (!o.visible || /^Cockpit|^Display|^HUD|^Throttle|^Yoke|^Cabin|^B787-9_Cabin|^Fuselage$|^HStab|^VTail|^Rudder|^Details/.test(n)) continue;
      if (/Nacelle|Fan_|Pylon/.test(n)) continue;
      if (/Gear|Door/.test(n)) { gear.push(o); continue; }
      const sd = sideOf(n);
      if (sd) wingParts[sd].push(o); else small.push(o);
    }
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // wings (a torn-off outer section is already gone)
    if (D.wing[0] < 0.95) addPiece('wingL', wingParts.L, V(m.wingTipL[0] * 0.4, 0, m.wingTipL[2] * 0.4));
    if (D.wing[1] < 0.95) addPiece('wingR', wingParts.R, V(m.wingTipR[0] * 0.4, 0, m.wingTipR[2] * 0.4));
    for (const [i, L2] of [[0, '_L'], [1, '_R']]) {
      if (D.eng[i] >= 2) continue;
      const objs = ['Nacelle', 'Fan', 'Pylon'].map((n) => byName(n + L2)).filter(Boolean);
      const ax = i === 0 ? m.engineAxisL : m.engineAxisR;
      addPiece('eng' + L2, objs, V(ax[0], ax[1], ax[2]));
    }
    const tailObjs = ['HStab', 'VTail', 'Rudder'].map(byName).filter(Boolean);
    for (const o of gear) addPiece('gear_' + o.name, [o], new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(R0.clone().invert()));
    // fuselage: nose / cabin / tail sections cut with clipping planes; the tail keeps the fin
    const fus = byName('Fuselage');
    const sections = [
      ['nose', V((x1 + sCG) / 2 + 4, 0, 0), [new THREE.Plane(new THREE.Vector3(1, 0, 0), -x1)]],
      ['cabin', V((x1 + x2) / 2, 0, 0), [new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1), new THREE.Plane(new THREE.Vector3(1, 0, 0), -x2)]],
      ['tail', V((x2 + (sCG - L)) / 2, 0, 0), [new THREE.Plane(new THREE.Vector3(-1, 0, 0), x2)]],
    ];
    this.clipped = [];
    const livLayout = m.livery;
    const livA = A.liveryAssets ? A.liveryAssets() : null;
    for (const [name, c, planes] of sections) {
      const p = addPiece(name, name === 'tail' ? tailObjs : [], c, { fus: true });
      if (!fus) continue;
      const uPiece = { value: new THREE.Matrix4() };
      const lu = livLayout ? liveryUniforms(livLayout) : null;
      if (lu && livA) setLiveryUniforms(lu, livA);
      const inv = p.g.matrixWorld.clone().invert();
      const mats = [];
      fus.updateMatrixWorld(true);
      fus.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const cl = new THREE.Mesh(mesh.geometry);
        tmpM.multiplyMatrices(inv, mesh.matrixWorld).decompose(cl.position, cl.quaternion, cl.scale);
        const mat0 = mesh.material;
        const mm = mat0.clone();
        mm.side = THREE.DoubleSide;
        mm.clippingPlanes = planes.map(() => new THREE.Plane());
        if (mat0.name === 'B787_Fuselage' && lu) {
          mm.onBeforeCompile = (sh) => {
            sh.uniforms.uPieceInv = uPiece;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uPieceInv;');
            patchLiveryShader(sh, lu, '(uPieceInv * modelMatrix * vec4(position, 1.0)).xyz');
          };
          mm.customProgramCacheKey = () => 'wreck-livery';
        }
        cl.material = mm;
        cl.castShadow = true;
        mats.push(mm);
        p.g.add(cl);
      });
      this.clipped.push({ p, planes, mats, uPiece });
    }
    root.visible = false;
    // physics: pieces fly apart from the impact
    const hit = pos0.clone();
    const sp = vel.length();
    for (const p of pieces) {
      const d = new THREE.Vector3().setFromMatrixPosition(p.g.matrixWorld).sub(hit);
      d.y = Math.abs(d.y) + 2;
      d.normalize();
      const k = water ? 0.25 : 0.35 + Math.random() * 0.4;
      const v = vel.clone().multiplyScalar(k).addScaledVector(d, (water ? 4 : 10) + Math.random() * (water ? 6 : 18) + sp * 0.08);
      v.y = Math.abs(v.y) * (water ? 0.3 : 0.6) + (water ? 2 : 6) + Math.random() * 8;
      const w = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(p.fus ? 1.2 : 4);
      const box = new THREE.Box3().setFromObject(p.g);
      const r = p.fus ? (m.fusH || 6) : Math.max(1.5, box.getSize(tmpV).length() * 0.35);
      const b = new Body(p.g, r, v, w, water);
      b.piece = p;
      this.bodies.push(b);
    }
    // fire / explosion / fragments
    const fx = this.fx;
    if (water) {
      for (let i = 0; i < 400; i++) {
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
        fx.steam({ x: hit.x + d.x * 10, y: 1, z: hit.z + d.z * 10 }, { x: d.x * 30 + vel.x * 0.2, y: 10 + d.y * 40, z: d.z * 30 + vel.z * 0.2 }, 2 + Math.random() * 3, 3 + Math.random() * 5, 2, 0.7);
      }
      fx.addSource(() => hit, { kind: 'smoke', size: 10, dur: 40 });
    } else {
      const fuel = Math.min(1.8, 0.6 + (fm.fuel || 0) / 60000);
      fx.explode({ x: hit.x, y: Math.max(hit.y, terrainHeight(hit.x, hit.z)) + 3, z: hit.z }, fuel, vel);
      const pool = hit.clone(); pool.y = terrainHeight(hit.x, hit.z) + 1;
      fx.addSource(() => pool, { kind: 'fire', size: 12 * fuel, dur: 240, rate: 1.4 });
      for (const b of this.bodies) {
        if (!b.piece.fus && Math.random() < 0.4) continue;
        const g = b.obj;
        fx.addSource(() => g.position, { kind: 'fire', size: b.piece.fus ? 6 : 3, dur: 90 + Math.random() * 120, rate: 1 });
      }
      A.audio.explosion?.(fuel);
      A.audio.setFire?.(1);
    }
    this._shards(hit.clone().setY(hit.y + 2), vel.clone().multiplyScalar(0.5), water ? 150 : 420, 1.6);
    A.audio.stopAlarms?.();
    for (const k of Object.keys(this.fireSrc)) if (this.fireSrc[k]) this.fireSrc[k].dur = 0;
    this.R0inv = R0.clone().invert();
    this.crashT = 0;
    A.rig.impulse(0.7);
  }

  clearWreck() {
    const A = this.app;
    if (this.wreck) { A.scene.remove(this.wreck); this.wreck = null; }
    for (const c of this.clipped || []) for (const mm of c.mats) mm.dispose();
    this.clipped = [];
    this.bodies = [];
    if (this.shardMesh) { this.shards = []; this.shardMesh.count = 0; }
    A.renderer.localClippingEnabled = false;
  }

  update(dt) {
    const A = this.app;
    // damage from the flight model
    const D = A.fm.dmg;
    if (D && !A.fm.crashed) {
      // engine fire handles pulled -> the trailing fire dies out
      for (let i = 0; i < 2; i++) if (!D.engFire[i] && this.fireSrc['ef' + i]) { this.fireSrc['ef' + i].dur = 0; this.fireSrc['ef' + i] = null; this.fx.addSource(this._atAc((i ? A.meta.engineAxisR : A.meta.engineAxisL).map((v, k) => (k === 0 ? v - 1.5 : v))), { kind: 'smoke', size: 2, dur: 20, getVel: this._acVel(), light: false }); }
      const fire = D.engFire[0] || D.engFire[1] || !!this.fireSrc.wf0 && this.fireSrc.wf0.t < this.fireSrc.wf0.dur || !!this.fireSrc.wf1 && this.fireSrc.wf1.t < this.fireSrc.wf1.dur;
      A.audio.setAlarm?.('fire', fire);
      A.audio.setFire?.(fire ? 0.15 : 0);
      if (this._warnT > 0) { this._warnT -= dt; if (this._warnT <= 0) A.audio.setAlarm?.('warn', false); }
      if (D.leak && A.fm.fuel <= 0) D.leak = 0;
    }
    for (const b of this.falling) b.step(dt);
    for (const b of this.bodies) b.step(dt);
    // clipping planes and livery mapping follow the moving fuselage sections
    for (const c of this.clipped || []) {
      const g = c.p.g;
      g.updateMatrixWorld(true);
      // aircraft frame at the crash -> world now
      const M = new THREE.Matrix4().multiplyMatrices(g.matrixWorld, c.p.W0.clone().invert()).multiply(this.R0inv.clone().invert());
      c.planes.forEach((pl, i) => { for (const mm of c.mats) mm.clippingPlanes[i].copy(pl).applyMatrix4(M); });
      c.uPiece.value.copy(M).invert();
    }
    // skin fragments
    if (this.shardMesh && this.shards.length) {
      const S = this.shardMesh, mt = new THREE.Matrix4();
      this.shards.forEach((s, i) => {
        if (!s.rest) {
          s.v.y -= G * dt; s.v.multiplyScalar(1 - 0.35 * dt);
          s.p.addScaledVector(s.v, dt);
          const wl = s.w.length();
          if (wl > 1e-3) s.q.premultiply(new THREE.Quaternion().setFromAxisAngle(tmpV.copy(s.w).divideScalar(wl), wl * dt));
          const gh = Math.max(terrainHeight(s.p.x, s.p.z), -0.2);
          if (s.p.y < gh + 0.05) { s.p.y = gh + 0.05; s.v.y *= -0.2; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); if (s.v.length() < 0.5) s.rest = true; }
        }
        mt.compose(s.p, s.q, s.s);
        S.setMatrixAt(i, mt);
        S.setColorAt(i, s.col);
      });
      S.count = this.shards.length;
      S.instanceMatrix.needsUpdate = true;
      S.instanceColor.needsUpdate = true;
    }
    if (this.wreck) {
      this.crashT += dt;
      A.audio.setFire?.(Math.max(0.2, 1 - this.crashT / 200));
    }
  }

  // centre of the wreck field (camera target)
  wreckCentre() {
    if (!this.bodies.length) return null;
    const c = new THREE.Vector3();
    for (const b of this.bodies) c.add(b.obj.position);
    return c.divideScalar(this.bodies.length);
  }
}
