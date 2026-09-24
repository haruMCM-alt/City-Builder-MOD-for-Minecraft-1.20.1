// Camera views: cockpit, chase, orbit, wing (cabin window), tower, fly-by.
import * as THREE from 'three';
import { DEG, clamp, lerp } from './util.js';
import { terrainHeight } from './terrain.js';

export const VIEWS = ['cockpit', 'chase', 'orbit', 'wing', 'cabin', 'tower', 'flyby', 'traffic'];
export const VIEW_NAMES = {
  cockpit: 'コックピット Cockpit', chase: '追尾 Chase', orbit: '外部 Orbit', wing: '客室窓 Cabin window', cabin: '機内 Cabin',
  tower: '管制塔 Tower', flyby: 'フライバイ Fly-by', traffic: 'AI交通 Traffic (B: 切替)',
};

export class CameraRig {
  constructor(camera, dom, meta, world) {
    this.camera = camera;
    this.meta = meta;
    this.world = world;
    this.view = 'chase';
    this.yaw = 0; this.pitch = 0;           // user look offsets (rad)
    this.orbitYaw = 2.4; this.orbitPitch = 0.16; this.dist = 105;
    this.fov = 55;
    this.smoothQ = new THREE.Quaternion();
    this.smoothPos = new THREE.Vector3();
    this.flybyPos = null;
    this._drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this._drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointerup', () => { this._drag = null; });
    dom.addEventListener('pointercancel', () => { this._drag = null; });
    dom.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag = { x: e.clientX, y: e.clientY };
      if (this.view === 'cockpit' || this.view === 'wing' || this.view === 'cabin') {
        this.yaw = clamp(this.yaw - dx * 0.004, -2.6, 2.6);
        this.pitch = clamp(this.pitch - dy * 0.004, -1.2, 1.45);
      } else {
        this.orbitYaw -= dx * 0.005;
        this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -0.4, 1.45);
      }
    });
    dom.addEventListener('dblclick', () => { this.yaw = 0; this.pitch = 0; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.001);
      if (this.view === 'cockpit' || this.view === 'wing' || this.view === 'cabin' || this.view === 'tower' || this.view === 'flyby') {
        this.fov = clamp(this.fov * k, 12, 90);
      } else {
        this.dist = clamp(this.dist * k, 28, 1500);
      }
    }, { passive: false });
  }

  setView(v) {
    this.view = v;
    this.yaw = 0; this.pitch = v === 'cockpit' ? -0.10 : 0;
    this.fov = v === 'cockpit' ? 62 : v === 'wing' ? 60 : v === 'cabin' ? 70 : v === 'tower' ? 30 : 55;
    if (v === 'traffic') { this.dist = 110; this.orbitPitch = 0.25; }
    this.flybyPos = null;
    this._init = false;
  }

  next() {
    const i = VIEWS.indexOf(this.view);
    this.setView(VIEWS[(i + 1) % VIEWS.length]);
    return this.view;
  }

  update(dt, fm, aircraftRoot) {
    const cam = this.camera;
    const q = new THREE.Quaternion(fm.q.x, fm.q.y, fm.q.z, fm.q.w);
    const pos = new THREE.Vector3(fm.pos.x, fm.pos.y, fm.pos.z);
    const toWorld = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(aircraftRoot.matrixWorld);
    cam.near = 0.1;
    switch (this.view) {
      case 'cockpit': {
        cam.position.copy(toWorld(this.meta.eye));
        // look direction relative to the aircraft (body x fwd, y up, z right)
        const look = new THREE.Quaternion();
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw - Math.PI / 2);
        const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
        look.copy(q).multiply(qy).multiply(qp);
        cam.quaternion.copy(look);
        cam.near = 0.05;
        break;
      }
      case 'wing': {
        // left cabin window behind the wing root, looking out at the left wing
        const cv = this.meta.cabin?.views;
        cam.position.copy(toWorld(cv ? cv.window : [-5.0, 0.6, -2.45]));
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw - (this.meta.cabin ? 0.2 : 0.5));
        const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch - (this.meta.cabin ? 0.02 : 0.18));
        cam.quaternion.copy(q).multiply(qy).multiply(qp);
        cam.near = 0.05;
        break;
      }
      case 'cabin': {
        // standing in the left aisle of the aft economy cabin, looking forward
        const cv = this.meta.cabin?.views;
        cam.position.copy(toWorld(cv ? cv.aisle : [-11.3, 0.62, -0.95]));
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw - Math.PI / 2);
        const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch - 0.08);
        cam.quaternion.copy(q).multiply(qy).multiply(qp);
        cam.near = 0.05;
        break;
      }
      case 'chase': {
        // follow the flight path heading smoothly
        const e = fm.out;
        const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (90 - e.hdg) * DEG);
        if (!this._init) this.smoothQ.copy(target);
        this.smoothQ.slerp(target, Math.min(1, dt * 2.5));
        const yaw = this.orbitYaw - 2.4;
        const off = new THREE.Vector3(-this.dist * Math.cos(this.orbitPitch), this.dist * Math.sin(this.orbitPitch) + 6, 0)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).applyQuaternion(this.smoothQ);
        cam.position.copy(pos).add(off);
        // aim below the aircraft so it sits in the upper part of the frame (panel below)
        cam.lookAt(pos.clone().add(new THREE.Vector3(0, -this.dist * 0.16, 0)));
        break;
      }
      case 'orbit': {
        const off = new THREE.Vector3(
          Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch), Math.sin(this.orbitPitch), Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch))
          .multiplyScalar(this.dist);
        cam.position.copy(pos).add(off);
        cam.lookAt(pos);
        break;
      }
      case 'tower': {
        const t = this.world?.tower?.pos || [830, 91, -640];
        const tp = new THREE.Vector3(t[0], t[1] + 2, t[2]);
        if (tp.distanceTo(pos) > 12000) {
          // too far: use a spotter position near the aircraft
          if (!this.flybyPos || this.flybyPos.distanceTo(pos) > 6000) this.flybyPos = this._spot(fm, 1500);
          cam.position.copy(this.flybyPos);
        } else cam.position.copy(tp);
        cam.lookAt(pos);
        const d = cam.position.distanceTo(pos);
        this.fovAuto = clamp(2 * Math.atan(90 / d) / DEG, 2.5, 60);
        break;
      }
      case 'traffic': {
        // orbit an AI aircraft / ground vehicle chosen by the app (B cycles targets)
        const tp = this.trafficTarget || pos;
        const off = new THREE.Vector3(
          Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch), Math.sin(this.orbitPitch), Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch))
          .multiplyScalar(this.dist);
        const want = tp.clone().add(off);
        if (!this._init || !this._tpPrev || this._tpPrev.distanceTo(tp) > 300) cam.position.copy(want);
        else cam.position.lerp(want, Math.min(1, dt * 4));
        this._tpPrev = (this._tpPrev || new THREE.Vector3()).copy(tp);
        cam.lookAt(tp);
        break;
      }
      case 'flyby': {
        if (!this.flybyPos || this._passed(fm)) this.flybyPos = this._spot(fm, 520);
        cam.position.copy(this.flybyPos);
        cam.lookAt(pos);
        break;
      }
    }
    this._shake(dt, fm);
    // keep external cameras above the terrain
    if (this.view !== 'cockpit' && this.view !== 'wing' && this.view !== 'cabin') {
      const g = Math.max(terrainHeight(cam.position.x, cam.position.z), -0.3);
      if (cam.position.y < g + 1.5) cam.position.y = g + 1.5;
    }
    const fov = this.view === 'tower' ? Math.min(this.fov, this.fovAuto ?? this.fov) : this.fov;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = this._init ? lerp(cam.fov, fov, Math.min(1, dt * 6)) : fov;
      cam.updateProjectionMatrix();
    }
    this._init = true;
    if (cam.near !== this._near) { this._near = cam.near; cam.updateProjectionMatrix(); }
  }

  // touchdown / bump: a decaying jolt
  impulse(k) { this._jolt = Math.max(this._jolt || 0, k); }

  // camera vibration: runway roughness on the ground roll, buffet and light turbulence in the air
  _shake(dt, fm) {
    const inside = this.view === 'cockpit' || this.view === 'cabin' || this.view === 'wing';
    const chase = this.view === 'chase';
    if (!inside && !chase) return;
    this._t = (this._t || 0) + dt;
    this._jolt = (this._jolt || 0) * Math.exp(-dt * 5);
    const wow = fm.gear.some((g) => g.onGround);
    const gs = fm.out.gs || 0, ias = fm.out.ias || 0;
    const ctl = fm.ctl;
    let a = 0;
    if (wow) a += Math.min(gs / 140, 1) * 0.0035 + (gs > 2 ? 0.0004 : 0);
    else a += 0.0005 + 0.0025 * ((1 - ctl.gearPos) * 0.5 + ctl.speedbrake * 0.8) * Math.min(ias / 250, 1.2);
    a += this._jolt * 0.02;
    if (chase) a *= 0.35;
    if (a < 1e-5) return;
    const t = this._t;
    const n = (f, ph) => Math.sin(t * f + ph) * 0.6 + Math.sin(t * f * 2.13 + ph * 1.7) * 0.3 + Math.sin(t * f * 4.7 + ph * 0.3) * 0.1;
    const e = new THREE.Euler(n(29, 1.1) * a, n(23, 2.7) * a * 0.5, n(31, 0.4) * a * 0.4, 'YXZ');
    this.camera.quaternion.multiply(new THREE.Quaternion().setFromEuler(e));
    if (inside) this.camera.position.y += n(37, 3.3) * a * 0.6;
  }

  _spot(fm, ahead) {
    const v = new THREE.Vector3(fm.vel.x, 0, fm.vel.z);
    if (v.length() < 1) v.set(Math.sin(fm.out.hdg * DEG), 0, -Math.cos(fm.out.hdg * DEG));
    v.normalize();
    const side = new THREE.Vector3(-v.z, 0, v.x);
    const p = new THREE.Vector3(fm.pos.x, fm.pos.y, fm.pos.z).addScaledVector(v, ahead).addScaledVector(side, 70 + Math.random() * 40);
    const g = Math.max(terrainHeight(p.x, p.z), 0);
    p.y = Math.max(fm.pos.y + (Math.random() - 0.3) * 25, g + 2.5);
    return p;
  }

  _passed(fm) {
    const p = this.flybyPos;
    const d = new THREE.Vector3(fm.pos.x - p.x, 0, fm.pos.z - p.z);
    const v = new THREE.Vector3(fm.vel.x, 0, fm.vel.z);
    return d.dot(v) > 0 && d.length() > 450;
  }
}
