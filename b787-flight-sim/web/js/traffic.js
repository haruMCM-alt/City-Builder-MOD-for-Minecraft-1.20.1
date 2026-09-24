// Airport traffic: AI 787s that push back, taxi, take off, fly a visual circuit, land and
// return to their stands under ATC control, and ground support equipment (Blender models,
// assets/gse.glb) that drives the apron service roads and turns the parked aircraft round.
//
// World frame: three.js x east, z south.  Runway 09/27 along x at z = 0, parallel taxiway
// Alpha at z = -185, apron taxilane at z = -262, stands nose-in facing north (-z), GSE
// service road at z = -415 (vehicles keep left), equipment depots at both ends of the apron.
import * as THREE from 'three';
import { World, HDR, glowTexture } from './world.js';
import { Path, Mover } from './path.js';
import { hdg3 } from './atc.js';
import { dressParked } from './livery.js';
import { terrainHeight } from './terrain.js';
import { DEG, KT, FT, clamp, lerp, smoothstep, mulberry32 } from './util.js';

const G = 9.81;
const TAN3 = Math.tan(3 * DEG);
const GEAR_Y = 5.2;                    // model origin above the ground on the gear
const TELEPHONY = { spark: 'Claude', crane: 'Tsuru', skyline: 'Citybird', wave: 'Pacific', fuji: 'Fuji Sky', globe: 'Globelink', plane: 'Swift' };
const CIRCUIT_ALT = 2500 * FT;
const BASE_ALT = 1600 * FT;
const TURN_R = 1800;                   // circuit turn radius (25 deg bank at ~180 kt)
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const compass = (a) => ((a / DEG + 90) % 360 + 360) % 360;

// --------------------------------------------------------------------------- model helpers
function mergeList(meshes, inv) {
  const buckets = new Map();
  const m4 = new THREE.Matrix4();
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const ng = g.index ? g.toNonIndexed() : g;
    const key = m.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [] });
    buckets.get(key).geos.push(ng);
  }
  const group = new THREE.Group();
  for (const { mat, geos } of buckets.values()) {
    let total = 0;
    for (const g of geos) total += g.getAttribute('position').count;
    const out = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const arr = new Float32Array(total * size);
      let o = 0;
      for (const g of geos) { const a = g.getAttribute(name); arr.set(a.array.subarray(0, a.count * size), o); o += a.count * size; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    group.add(new THREE.Mesh(out, mat));
  }
  return group;
}

const MOVABLE = new Set(['NoseGear', 'MainGear_L', 'MainGear_R', 'NoseWheels', 'MainWheels_L0', 'MainWheels_L1',
  'MainWheels_R0', 'MainWheels_R1', 'NoseDoor_L', 'NoseDoor_R', 'MainDoor_L', 'MainDoor_R', 'FlapInbd_L', 'FlapInbd_R',
  'FlapOutbd_L', 'FlapOutbd_R', 'Flaperon_L', 'Flaperon_R', 'Fan_L', 'Fan_R',
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => ['Slat' + i + '_L', 'Slat' + i + '_R']),
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((i) => ['Spoiler' + i + '_L', 'Spoiler' + i + '_R'])]);

// LOD 787 split into one merged static body + articulated parts (gear, flaps, slats,
// spoilers, fans) that keep their hinge frames (hinge axis = local X, as in the Blender file)
function buildArticulated(src) {
  src.updateMatrixWorld(true);
  const root = src.getObjectByName('B787-9') || src;
  const rootInv = root.matrixWorld.clone().invert();
  const meshesOf = (node) => {
    const out = [];
    const walk = (o) => { if (o !== node && MOVABLE.has(o.name)) return; if (o.isMesh) out.push(o); o.children.forEach(walk); };
    walk(node);
    return out;
  };
  const out = new THREE.Group();
  out.add(mergeList(meshesOf(root), rootInv));
  const addPart = (node, parent, parentInv) => {
    const g = new THREE.Group();
    g.name = node.name;
    new THREE.Matrix4().multiplyMatrices(parentInv, node.matrixWorld).decompose(g.position, g.quaternion, g.scale);
    const inv = node.matrixWorld.clone().invert();
    g.add(mergeList(meshesOf(node), inv));
    parent.add(g);
    const walk = (o) => { for (const c of o.children) { if (MOVABLE.has(c.name)) addPart(c, g, inv); else walk(c); } };
    walk(node);
  };
  const walk = (o) => { for (const c of o.children) { if (MOVABLE.has(c.name)) addPart(c, out, rootInv); else walk(c); } };
  walk(root);
  return out;
}

class ArticulatedModel {
  constructor(obj, meta) {
    this.obj = obj;
    this.parts = {};
    obj.traverse((o) => { if (MOVABLE.has(o.name)) this.parts[o.name] = { obj: o, rest: o.quaternion.clone(), pos: o.position.clone() }; });
    this.q = new THREE.Quaternion();
    this.ax = new THREE.Vector3(1, 0, 0);
    this.wheelA = [0, 0];
    this.fanA = [0, 0];
    this.meta = meta;
  }

  set(name, ang) {
    const p = this.parts[name];
    if (!p) return;
    p.obj.quaternion.copy(p.rest).multiply(this.q.setFromAxisAngle(this.ax, ang));
  }

  pose(ac, dt) {
    const fd = ac.flap * 1.1 * DEG;
    for (const s of ['_L', '_R']) {
      this.set('FlapInbd' + s, fd); this.set('FlapOutbd' + s, fd);
      this.set('Flaperon' + s, Math.min(ac.flap * 0.55, 18) * DEG);
      for (let i = 1; i <= 6; i++) this.set('Slat' + i + s, ac.slat * 22 * DEG);
      for (let i = 1; i <= 7; i++) this.set('Spoiler' + i + s, ac.spoiler * 60 * DEG);
    }
    const gp = ac.gear;
    const legT = smoothstep(0.18, 0.86, gp);
    const doorT = gp <= 0.001 ? 0 : clamp(Math.min(gp / 0.16, (1 - gp) / 0.12), 0, 1);
    this.set('NoseGear', legT * 100 * DEG);
    this.set('MainGear_L', legT * 90 * DEG); this.set('MainGear_R', legT * 90 * DEG);
    this.set('NoseDoor_L', doorT * 88 * DEG); this.set('NoseDoor_R', doorT * 88 * DEG);
    this.set('MainDoor_L', doorT * 85 * DEG); this.set('MainDoor_R', doorT * 85 * DEG);
    const stow = smoothstep(0.55, 1.0, legT);
    for (const n of ['NoseGear', 'MainGear_L', 'MainGear_R']) {
      const p = this.parts[n];
      if (!p) continue;
      p.obj.visible = gp < 0.97;
      p.obj.position.copy(p.pos);
      if (n !== 'NoseGear') { p.obj.position.y += 0.55 * stow; p.obj.position.z -= Math.sign(p.pos.z) * stow; }
    }
    // wheels roll on the ground, spin down in the air
    const onG = ac.alt < 0.3 && gp < 0.05;
    for (let i = 0; i < 2; i++) {
      const R = i === 0 ? 0.51 : 0.685;
      this.wheelA[i] = (this.wheelA[i] + (onG ? ac.v * ac.dirSign / R : 0) * dt) % (Math.PI * 2);
    }
    this.set('NoseWheels', this.wheelA[0]);
    for (const n of ['MainWheels_L0', 'MainWheels_L1', 'MainWheels_R0', 'MainWheels_R1']) this.set(n, this.wheelA[1]);
    for (let i = 0; i < 2; i++) {
      this.fanA[i] = (this.fanA[i] + ac.n1 / 100 * 7.5 * dt * Math.PI * 2) % (Math.PI * 2);
      this.set(i === 0 ? 'Fan_L' : 'Fan_R', this.fanA[i]);
    }
  }
}

// --------------------------------------------------------------------------- light points
class LightPoints {
  constructor(scene, max = 900) {
    this.max = max;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.siz = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('lcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('lsize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geo = geo;
    this.uniforms = { uNight: { value: 0 }, uScreen: { value: 800 }, uPR: { value: 1 }, uLin: HDR.uLin, uGainL: HDR.uGainL };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 lcolor; attribute float lsize;
        uniform float uNight, uScreen, uPR;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mv.z, 0.1);
          float proj = lsize * uScreen / dist;
          float px = clamp(proj * mix(1.2, 3.0, uNight), mix(1.5, 3.2, uNight) * uPR, mix(14.0, 44.0, uNight) * uPR);
          vAlpha = mix(0.35, 1.0, uNight) * clamp(proj * 2.0 + 0.4, 0.0, 1.2);
          vColor = lcolor;
          gl_PointSize = px;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uLin, uGainL;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          float a = exp(-r2 * 5.0) + 0.9 * exp(-r2 * 40.0);
          if (vAlpha * a < 0.003) discard;
          gl_FragColor = vec4(vColor * a * vAlpha * 2.2, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, pow(max(gl_FragColor.rgb, 0.0), vec3(2.2)) * uGainL, uLin);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.n = 0;
  }

  begin() { this.n = 0; }
  add(p, r, g, b, size) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.siz[i] = size;
  }
  end() {
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'lcolor', 'lsize']) this.geo.attributes[k].needsUpdate = true;
  }
}

// --------------------------------------------------------------------------- obstacles
// circles (x, z, r) describing a 787 on the ground (fuselage, wings, tail) in body axes
const AC_CIRCLES = [[26, 0, 3.5], [16, 0, 3.4], [6, 0, 3.4], [-4, 0, 3.4], [-14, 0, 3.4], [-24, 0, 4], [-27, 8, 3], [-27, -8, 3],
  [0, 7, 4], [0, -7, 4], [-5, 13, 3.6], [-5, -13, 3.6], [-10, 19, 3.2], [-10, -19, 3.2], [-15, 25, 3], [-15, -25, 3], [-18, 29.5, 2.2], [-18, -29.5, 2.2]];

function acCircles(x, z, a, out) {
  const c = Math.cos(a), s = Math.sin(a);
  out.length = 0;
  for (const [f, l, r] of AC_CIRCLES) out.push([x + f * c - l * s, z + f * s + l * c, r]);
  return out;
}

// --------------------------------------------------------------------------- vehicles
class Vehicle {
  constructor(traffic, type, info, obj, id) {
    this.t = traffic; this.type = type; this.info = info; this.obj = obj; this.id = id;
    this.L = info.length; this.W = info.width;
    this.x = 0; this.z = 0; this.a = 0; this.v = 0; this.steerA = 0;
    this.legs = []; this.mover = null; this.dir = 1;
    this.state = 'IDLE';
    this.trailers = []; this.leader = null;
    this.wheels = (info.wheels || []).map((w) => ({ obj: obj.getObjectByName(w.name), x: w.x, r: w.r, steer: w.steer, spin: 0 }));
    this.parts = {};
    for (const [k, p] of Object.entries(info.parts || {})) {
      const o = obj.getObjectByName(p.name);
      if (o) this.parts[k] = { obj: o, pos: o.position.clone(), rot: o.rotation.clone() };
    }
    this.lift = 0; this.liftT = 0;           // service lift / belt / deck (0..1)
    this.blocked = 0; this.ignoreVeh = 0;
    this.circles = [];
    this.home = null;
    this.task = null;
    this.beaconPhase = Math.random();
    this.vmax = info.towed ? 6 : type === 'Tug' ? 6 : type === 'Bus' ? 8 : type === 'BagTractor' ? 5 : 7.5;
    if (this.parts.Platform) this.parts.Platform.obj.rotation.z = Math.PI / 2;     // folded
  }

  setPose(x, z, a) { this.x = x; this.z = z; this.a = a; this.place(0); }

  go(legs, onDone) {
    this.legs = legs.slice(); this.onDone = onDone;
    this._nextLeg();
  }

  _nextLeg() {
    const L = this.legs.shift();
    if (!L) { this.mover = null; const f = this.onDone; this.onDone = null; if (f) f(this); return; }
    this.dir = L.dir || 1;
    this.mover = new Mover(L.path, { vmax: L.vmax || this.vmax * (this.dir < 0 ? 0.35 : 1), acc: 0.9, dec: 1.6, aLat: 1.1, dir: this.dir });
  }

  footprint() {
    const n = Math.max(1, Math.round(this.L / this.W));
    const c = Math.cos(this.a), s = Math.sin(this.a);
    const r = this.W * 0.55;
    this.circles.length = 0;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : -this.L / 2 + r + (this.L - 2 * r) * i / (n - 1);
      this.circles.push([this.x + f * c, this.z + f * s, r]);
    }
    return this.circles;
  }

  // speed limit from obstacles in the travel corridor
  obstacleLimit(dt) {
    if (!this.mover) return Infinity;
    const T = this.t;
    const heading = this.dir < 0 ? this.a + Math.PI : this.a;
    const c = Math.cos(heading), s = Math.sin(heading);
    const look = this.v * this.v / 3 + this.L / 2 + 7;
    const half = this.W / 2 + 0.7;
    let gap = Infinity;
    const test = (cx, cz, r) => {
      const dx = cx - this.x, dz = cz - this.z;
      const f = dx * c + dz * s;
      if (f <= 0 || f > look + r) return;
      const l = -dx * s + dz * c;
      if (Math.abs(l) > half + r) return;
      gap = Math.min(gap, f - this.L / 2 - r);
    };
    if (this.ignoreVeh <= 0) {
      for (const o of T.vehicles) {
        if (o === this || o.leader === this || this.trailers.includes(o) || !o.obj.visible) continue;
        if (this.leader && (o === this.leader || this.leader.trailers.includes(o))) continue;
        for (const [x, z, r] of o.circles) test(x, z, r);
      }
    }
    for (const ac of T.movingAircraft) {
      if (ac === this.task?.ac && ac.state !== 'PUSH') continue;
      if (this.type === 'Tug' && (ac === this.task?.ac || ac === this.released)) continue;
      for (const [x, z, r] of ac.circles) test(x, z, r);
    }
    let lim = gap === Infinity ? Infinity : Math.sqrt(2 * 1.6 * Math.max(0, gap - 1.5));
    // deadlock breaker: after a long block, drive through other vehicles for a while
    if (lim < 0.1 && this.v < 0.1) { this.blocked += dt; if (this.blocked > 9) { this.ignoreVeh = 4; this.blocked = 0; } } else this.blocked = 0;
    this.ignoreVeh -= dt;
    return lim;
  }

  update(dt) {
    if (this.leader) return;                     // trailers are moved by their leader
    if (this.slaved) { this.footprint(); return; }  // tug attached to an aircraft
    if (this.mover) {
      this.mover.limit = this.obstacleLimit(dt);
      const p = this.mover.update(dt);
      const pa = this.a;
      this.x = p.x; this.z = p.z; this.a = p.a;
      this.v = this.mover.v;
      const k = p.k || 0;
      this.steerA = lerp(this.steerA, clamp(Math.atan((this.info.wheelbase || 3) * k) * this.dir, -0.6, 0.6), Math.min(1, dt * 6));
      if (this.mover.done) this._nextLeg();
      void pa;
    } else this.v = 0;
    // service lifts
    const rate = this.type === 'Catering' ? 0.07 : 0.25;
    this.lift += clamp(this.liftT - this.lift, -rate * dt, rate * dt);
    this.place(dt);
    // towed units follow the hitch (tractrix)
    let lead = this;
    for (const tr of this.trailers) {
      const hx = lead.x + Math.cos(lead.a) * lead.info.hitchRear[0], hz = lead.z + Math.sin(lead.a) * lead.info.hitchRear[0];
      const fx = tr.info.hitchFront[0];
      let dx = hx - tr.x, dz = hz - tr.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      tr.a = Math.atan2(dz, dx);
      const nx = hx - dx * fx, nz = hz - dz * fx;
      tr.v = Math.hypot(nx - tr.x, nz - tr.z) / Math.max(dt, 1e-4) * Math.sign(this.v || 0);
      tr.x = nx; tr.z = nz;
      tr.steerA = 0;
      tr.place(dt);
      lead = tr;
    }
  }

  place(dt) {
    const o = this.obj;
    o.position.set(this.x, terrainHeight(this.x, this.z) > 0.5 ? terrainHeight(this.x, this.z) : 0.06, this.z);
    o.rotation.set(0, -this.a, 0);
    const sp = this.v * (this.dir < 0 && !this.leader ? -1 : 1);
    for (const w of this.wheels) {
      if (!w.obj) continue;
      w.spin = (w.spin - sp * dt / w.r) % (Math.PI * 2);
      w.obj.rotation.set(0, w.steer ? -this.steerA : 0, w.spin, 'YZX');
    }
    const P = this.parts;
    if (P.Box) {
      const h = this.lift * 2.72;
      P.Box.obj.position.y = P.Box.pos.y + h;
      if (P.Scissor) P.Scissor.obj.scale.y = (0.6 + h) / 0.6;
      if (P.Platform) P.Platform.obj.rotation.z = Math.PI / 2 * (1 - smoothstep(0.75, 1.0, this.lift));
    }
    if (P.Belt) P.Belt.obj.rotation.z = this.lift * (this.beltAngle ?? 0.22);
    if (P.Deck) P.Deck.obj.position.y = P.Deck.pos.y + this.lift * 1.6;
    this.footprint();
  }

  lights(L, time, night) {
    if (!this.obj.visible) return;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    const moving = this.mover || this.state === 'SERVICE';
    const on = moving || this.leader;
    if (!on) return;
    // amber beacon (rotating: ~1.3 Hz flashes)
    const ph = (time * 1.3 + this.beaconPhase) % 1;
    if (ph < 0.18 && !this.info.towed) {
      const h = (this.info.height || 2) + 0.1;
      L.add({ x: this.x - c * this.L * 0.1, y: h, z: this.z - s * this.L * 0.1 }, 1.0, 0.55, 0.05, 0.45);
    }
    if (night > 0.05 && this.mover && !this.info.towed) {
      const f = this.L / 2 + 0.1, w = this.W / 2 - 0.3;
      for (const sgn of [-1, 1]) {
        L.add({ x: this.x + c * f - s * w * sgn, y: 0.9, z: this.z + s * f + c * w * sgn }, 1.0, 0.95, 0.85, 0.35);
        L.add({ x: this.x - c * f - s * w * sgn, y: 0.9, z: this.z - s * f + c * w * sgn }, 1.0, 0.1, 0.05, 0.25);
      }
    }
  }
}

// --------------------------------------------------------------------------- AI aircraft
let CALLSEQ = 0;

class AIAircraft {
  constructor(traffic, stand, liv, rnd) {
    this.t = traffic; this.stand = stand; this.liv = liv;
    this.id = ++CALLSEQ;
    this.callsign = (TELEPHONY[liv.logo] || 'Claude') + ' ' + (100 + Math.floor(rnd() * 800));
    this.x = stand.cg[0]; this.z = stand.cg[2]; this.a = -Math.PI / 2;   // facing north
    this.alt = 0; this.pitch = 0; this.bank = 0; this.v = 0; this.vs = 0;
    this.gear = 0; this.flap = 0; this.slat = 0; this.spoiler = 0; this.n1 = 0;
    this.dirSign = 1;
    this.state = 'PARKED';
    this.timer = 0;
    this.lightsOn = { nav: false, beacon: false, strobe: false, landing: false, taxi: false, logo: false };
    this.circles = [];
    this.static = traffic._staticModel(liv);
    this.art = null;
    this.mover = null;
    this.air = null;
    this.turnaround = null;
    traffic.scene.add(this.static);
    this.place(0);
  }

  get onRunway() { return Math.abs(this.z) < 40 && Math.abs(this.x) < 1800 && this.alt < 60; }

  activate() {
    if (this.art) return;
    this.art = this.t._articulated(this.liv);
    this.static.visible = false;
  }

  deactivate() {
    if (!this.art) return;
    this.t._release(this.art);
    this.art = null;
    this.static.visible = true;
  }

  place(dt) {
    const m = this.art ? this.art.obj : this.static;
    const th = this.pitch * DEG;
    const y = this.alt + 1.7 * Math.sin(th) + 5.25 * Math.cos(th) - 0.05;
    m.position.set(this.x, y, this.z);
    m.rotation.set(this.bank * DEG, -this.a, th, 'YZX');
    if (this.art) this.art.pose(this, dt);
    acCircles(this.x, this.z, this.a, this.circles);
  }

  // lights in world space
  lights(L, time) {
    const lo = this.lightsOn;
    if (!lo.nav && !lo.beacon) return;
    const m = (this.art ? this.art.obj : this.static);
    m.updateMatrixWorld();
    const mw = m.matrixWorld;
    const v = this.t._v;
    const meta = this.t.meta;
    const P = (p) => v.set(p[0], p[1], p[2]).applyMatrix4(mw);
    if (lo.nav) {
      L.add(P(meta.wingTipL), 1.0, 0.08, 0.05, 0.5);
      L.add(P(meta.wingTipR), 0.1, 1.0, 0.25, 0.5);
      L.add(P([-30.9, 1.0, 0]), 1, 1, 1, 0.35);
    }
    const ph = (time + this.id * 0.37) % 1.2;
    if (lo.beacon && ph < 0.12) { L.add(P([-2, 3.1, 0]), 1.0, 0.1, 0.05, 0.6); L.add(P([4, -3.1, 0]), 1.0, 0.1, 0.05, 0.6); }
    if (lo.strobe && (ph > 0.5 && ph < 0.56 || ph > 0.66 && ph < 0.72)) {
      L.add(P([meta.wingTipL[0] - 0.4, meta.wingTipL[1], meta.wingTipL[2]]), 1, 1, 1, 1.1);
      L.add(P([meta.wingTipR[0] - 0.4, meta.wingTipR[1], meta.wingTipR[2]]), 1, 1, 1, 1.1);
    }
    if (lo.landing) { L.add(P([9, -1.9, -5.2]), 1, 0.97, 0.9, 1.3); L.add(P([9, -1.9, 5.2]), 1, 0.97, 0.9, 1.3); }
    if (lo.taxi) L.add(P([24.2, -2.4, 0]), 1, 0.97, 0.9, 0.8);
    if (lo.logo) { L.add(P([-24, 4, -3]), 0.9, 0.9, 0.9, 0.4); L.add(P([-24, 4, 3]), 0.9, 0.9, 0.9, 0.4); }
  }
}

// --------------------------------------------------------------------------- traffic manager
export class Traffic {
  constructor(scene, worldData, meta, { gse, gseInfo, lodTemplate, livery, radio, quality }) {
    this.scene = scene; this.W = worldData; this.meta = meta; this.radio = radio;
    this.gse = gse; this.gseInfo = gseInfo; this.lodTemplate = lodTemplate; this.liveryLayout = livery;
    this.quality = quality;
    this.G = worldData.ground || {
      twyZ: -185, taxilaneZ: -262, serviceZ: -415, connectors: [-1725, -950, -80, 700, 1725], apronLinks: [-640, -240, 240, 640],
      holdZ: -89, gseDepots: [[-690, -460], [690, -460]], standLaneDX: 40,
    };
    this.lights = new LightPoints(scene);
    this._v = new THREE.Vector3();
    this.aircraft = []; this.vehicles = []; this.movingAircraft = [];
    this.time = 0;
    this.enabled = true;
    this._artPool = [];
    this._staticTpl = lodTemplate ? World.mergeByMaterial(lodTemplate.clone(true)) : null;
    this._artTpl = lodTemplate ? buildArticulated(lodTemplate.clone(true)) : null;
    this.player = { x: 0, z: 0, alt: 0, a: 0, v: 0, onGround: true, circles: [], active: false };
  }

  _staticModel(liv) {
    const o = this._staticTpl.clone(true);
    if (this.liveryLayout) dressParked(o, liv, this.liveryLayout);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = this.quality === 'high'; m.receiveShadow = true; } });
    return o;
  }

  _articulated(liv) {
    let obj = this._artPool.pop();
    if (!obj) {
      obj = new ArticulatedModel(this._artTpl.clone(true), this.meta);
      obj.obj.traverse((m) => { if (m.isMesh) { m.castShadow = this.quality === 'high'; m.receiveShadow = true; } });
      this.scene.add(obj.obj);
    }
    if (this.liveryLayout) dressParked(obj.obj, liv, this.liveryLayout);
    obj.obj.visible = true;
    return obj;
  }

  _release(art) { art.obj.visible = false; this._artPool.push(art); }

  // ------------------------------------------------------------------ setup per scenario
  reset({ stands, skipStand, randomLivery, runway, windDir, windKt, playerStand }) {
    for (const ac of this.aircraft) { this.scene.remove(ac.static); if (ac.art) this._release(ac.art); }
    for (const v of this.vehicles) this.scene.remove(v.obj);
    this.aircraft = []; this.vehicles = [];
    this._timers = [];
    this.radio?.clear();
    this.rnd = mulberry32((Math.random() * 1e9) | 0);
    this.windDir = windDir; this.windKt = windKt;
    this.rwy = runway;                                     // active runway: '27' or '09'
    this._rl = randomLivery;
    this.apronOwner = null; this.apronQueue = [];
    this.runwayOwner = null; this.lastTakeoff = -999;
    this.arrivals = [];
    this.nextDeparture = 25;
    this.playerStand = playerStand;
    if (!this._staticTpl) return;
    const occupied = new Set();
    for (const st of stands) {
      if (st.id === skipStand) continue;
      if (st.id % 4 === 0 && st.id !== 1) continue;       // a few gates free for arrivals
      const ac = new AIAircraft(this, st, randomLivery(this.rnd), this.rnd);
      this.aircraft.push(ac);
      occupied.add(st.id);
    }
    this.freeStands = stands.filter((s) => !occupied.has(s.id) && s.id !== skipStand);
    this._buildFleet();
    // start in the middle of the day: some aircraft are being turned round, one is about to leave
    const parked = this.aircraft.slice();
    for (let i = parked.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [parked[i], parked[j]] = [parked[j], parked[i]]; }
    parked.forEach((ac, i) => {
      if (i < 3) this._startTurnaround(ac, true);
      else ac.readyAt = this.time + 60 + i * 50 + this.rnd() * 40;
    });
    if (parked[3]) parked[3].readyAt = 8;
    // an inbound aircraft already on downwind, heading for a free gate
    if (this.freeStands.length) this._spawnInbound(this.freeStands.shift(), 0.35);
  }

  // ------------------------------------------------------------------ GSE fleet
  _buildFleet() {
    if (!this.gse) return;
    const make = (type) => {
      const src = this.gse.getObjectByName('GSE_' + type);
      if (!src) return null;
      const obj = src.clone(true);
      obj.position.set(0, 0, 0);
      obj.traverse((m) => { if (m.isMesh) { m.castShadow = this.quality === 'high'; m.receiveShadow = true; } });
      this.scene.add(obj);
      const v = new Vehicle(this, type, this.gseInfo[type], obj, this.vehicles.length);
      this.vehicles.push(v);
      return v;
    };
    const G = this.G;
    this.depots = G.gseDepots.map(([dx, dz], di) => ({ x: dx, z: dz, side: di === 0 ? -1 : 1, units: [] }));
    for (const dep of this.depots) {
      const cols = [];
      for (let k = 0; k < 9; k++) cols.push(dep.x - 40 + k * 10);
      if (dep.side > 0) cols.reverse();
      const plan = ['Tug', 'Tug', 'Catering', 'Fuel', 'BeltLoader', 'ULD', 'BAG', dep.side < 0 ? 'FollowMe' : 'Bus', 'Van'];
      plan.forEach((kind, k) => {
        let v;
        if (kind === 'ULD' || kind === 'BAG') {
          v = make('BagTractor');
          if (!v) return;
          v.kind = kind === 'ULD' ? 'ULDTrain' : 'BagTrain';
          for (let i = 0; i < 3; i++) {
            const tr = make(kind === 'ULD' ? 'Dolly' : 'BagCart');
            if (!tr) continue;
            tr.leader = v; v.trailers.push(tr);
          }
        } else { v = make(kind); if (!v) return; v.kind = kind; }
        v.depot = dep;
        v.home = { x: cols[k], z: -470 };
        this._park(v);
        dep.units.push(v);
      });
    }
  }

  _park(v) {
    v.setPose(v.home.x, v.home.z, -Math.PI / 2);
    v.state = 'IDLE'; v.task = null; v.liftT = 0; v.lift = 0;
    let lead = v;
    for (const tr of v.trailers) {
      const hx = lead.x + Math.cos(lead.a) * lead.info.hitchRear[0], hz = lead.z + Math.sin(lead.a) * lead.info.hitchRear[0];
      tr.setPose(hx - Math.cos(v.a) * tr.info.hitchFront[0], hz - Math.sin(v.a) * tr.info.hitchFront[0], v.a);
      lead = tr;
    }
    v.place(0);
  }

  _free(dep, kind) {
    return dep.units.find((u) => u.kind === kind && u.state === 'IDLE');
  }

  // road network: depot -> service road -> stand lanes (vehicles keep left)
  _roadOut(v) {
    const d = v.depot, s = this.G.serviceZ;
    const exitX = d.x - d.side * 45;
    const laneZ = d.side < 0 ? s - 3 : s + 3;          // west depot drives east on the north lane
    return { pts: [{ x: v.home.x, z: v.home.z }, { x: v.home.x, z: -497 }, { x: exitX, z: -497 }, { x: exitX, z: laneZ }], laneZ };
  }

  _roadHome(v) {
    const d = v.depot, s = this.G.serviceZ;
    const laneZ = d.side < 0 ? s + 3 : s - 3;          // back to the west depot on the south lane
    return { laneZ, tail: [{ x: v.home.x, z: laneZ }, { x: v.home.x, z: v.home.z }] };
  }

  // service pose and approach / departure routes around an aircraft on its stand
  _servicePlan(kind, st, laneIn, laneOut) {
    const xs = st.cg[0], zc = st.cg[2];
    const E = xs + this.G.standLaneDX, Wl = xs - this.G.standLaneDX;
    const P = (x, z, v) => ({ x, z, v });
    switch (kind) {
      case 'Catering': return {
        in: [P(E - 3, laneIn), P(E - 3, zc - 14.3), P(xs + 14, zc - 14.3, 2.5), P(xs + 7.5, zc - 14.3, 1.2)],
        pose: [xs + 7.5, zc - 14.3, Math.PI],
        rev: [P(xs + 7.5, zc - 14.3), P(xs + 17, zc - 14.3), P(xs + 17, zc - 26)],
        out: [P(xs + 17, zc - 26), P(xs + 17, zc - 20), P(E + 3, zc - 20), P(E + 3, laneOut)],
      };
      case 'BeltLoader': return {
        in: [P(E - 3, laneIn), P(E - 3, zc + 16), P(xs + 12, zc + 16, 2.5), P(xs + 6.4, zc + 16, 1.0)],
        pose: [xs + 6.4, zc + 16, Math.PI],
        rev: [P(xs + 6.4, zc + 16), P(xs + 20, zc + 16)],
        out: [P(xs + 20, zc + 16), P(xs + 13, zc + 16), P(xs + 13, zc + 30), P(E + 3, zc + 30), P(E + 3, laneOut)],
      };
      case 'BagTrain': return {
        in: [P(xs + 24, laneIn), P(xs + 24, zc + 14, 3), P(xs + 24, zc + 8, 1.2)],
        pose: [xs + 24, zc + 8, -Math.PI / 2],
        out: [P(xs + 24, zc + 8), P(xs + 24, zc - 30), P(E + 3, zc - 30), P(E + 3, laneOut)],
      };
      case 'ULDTrain': return {
        in: [P(xs + 15, laneIn), P(xs + 15, zc, 3), P(xs + 15, zc - 6, 1.2)],
        pose: [xs + 15, zc - 6, -Math.PI / 2],
        out: [P(xs + 15, zc - 6), P(xs + 15, zc - 30), P(E + 3, zc - 30), P(E + 3, laneOut)],
      };
      case 'Fuel': return {
        in: [P(Wl - 3, laneIn), P(Wl - 3, zc + 14), P(xs - 15, zc + 14, 3), P(xs - 15, zc + 1, 1.2)],
        pose: [xs - 15, zc + 1, -Math.PI / 2],
        out: [P(xs - 15, zc + 1), P(xs - 15, zc - 16), P(Wl + 3, zc - 16), P(Wl + 3, laneOut)],
      };
      case 'Tug': {
        const zg = zc - 24.13;
        return {
          in: [P(E - 3, laneIn), P(E - 3, -497), P(xs, -497, 3), P(xs, zg - 0.6, 1.0)],
          pose: [xs, zg - 0.6, Math.PI / 2],
        };
      }
      default: return null;
    }
  }

  _dispatch(ac, kind, dur, after) {
    const st = ac.stand;
    const dep = st.cg[0] < 0 ? this.depots[0] : this.depots[1];
    let v = this._free(dep, kind) || this._free(dep === this.depots[0] ? this.depots[1] : this.depots[0], kind);
    if (!v) return null;
    const plan = this._servicePlan(kind, st);
    if (!plan) return null;
    const out = this._roadOut(v);
    const pl = this._servicePlan(kind, st, out.laneZ, 0);
    const pts = out.pts.concat(pl.in);
    v.state = 'DISPATCH';
    v.task = { ac, kind, dur, plan: pl, after };
    v.go([{ path: new Path(pts, 7) }], () => { v.state = 'SERVICE'; v.task.t = 0; this._onServiceArrive(v); });
    return v;
  }

  _onServiceArrive(v) {
    const T = v.task;
    const [x, z, a] = T.plan.pose;
    v.setPose(x, z, a);
    if (v.kind === 'Catering' || v.kind === 'BeltLoader' || v.kind === 'Fuel') v.liftT = 1;
    if (v.kind === 'BeltLoader') v.beltAngle = Math.atan2(3.2 - 1.05 - 0.15, 7.3);
    for (const tr of v.trailers) if (tr.parts.ULD) tr.parts.ULD.obj.visible = T.unload ? false : tr.parts.ULD.obj.visible;
  }

  _sendHome(v) {
    const T = v.task;
    const home = this._roadHome(v);
    const pl = this._servicePlan(v.kind, T.ac.stand, 0, home.laneZ);
    v.liftT = 0;
    const legs = [];
    if (pl.rev) legs.push({ path: new Path(pl.rev, 5), dir: -1 });
    legs.push({ path: new Path(pl.out.concat(home.tail), 7) });
    v.state = 'RETURN';
    const go = () => v.go(legs, () => { this._park(v); });
    // lifts come down first
    v._waitLift = go;
  }

  // ------------------------------------------------------------------ turnaround
  _startTurnaround(ac, midway = false) {
    const T = ac.turnaround = { t: 0, jobs: [], midway };
    const jobs = [['BeltLoader', 170], ['Catering', 150], ['Fuel', 140], ['ULDTrain', 160], ['BagTrain', 150]];
    if (midway) {
      // vehicles already in place, part-way through the service
      for (const [kind, dur] of jobs) {
        const dep = ac.stand.cg[0] < 0 ? this.depots?.[0] : this.depots?.[1];
        if (!dep) continue;
        const v = this._free(dep, kind);
        if (!v) continue;
        const pl = this._servicePlan(kind, ac.stand, 0, 0);
        v.task = { ac, kind, dur, plan: pl, t: this.rnd() * dur * 0.8 };
        v.state = 'SERVICE';
        this._onServiceArrive(v);
        v.lift = v.liftT;
        if (v.trailers.length) this._alignTrain(v);
        T.jobs.push({ kind, v, done: false });
      }
    } else {
      jobs.forEach(([kind, dur], i) => T.jobs.push({ kind, dur, at: 4 + i * 9, v: null, done: false }));
    }
    ac.state = 'PARKED';
    ac.readyAt = null;
  }

  _alignTrain(v) {
    let lead = v;
    for (const tr of v.trailers) {
      const hx = lead.x + Math.cos(lead.a) * lead.info.hitchRear[0], hz = lead.z + Math.sin(lead.a) * lead.info.hitchRear[0];
      tr.setPose(hx - Math.cos(v.a) * tr.info.hitchFront[0], hz - Math.sin(v.a) * tr.info.hitchFront[0], v.a);
      lead = tr;
    }
  }

  _updateTurnaround(ac, dt) {
    const T = ac.turnaround;
    if (!T) return;
    T.t += dt;
    let allDone = true;
    for (const j of T.jobs) {
      if (j.done) continue;
      allDone = false;
      if (!j.v) {
        if (T.t < j.at) continue;
        // bag train waits for the belt loader to be in place
        if (j.kind === 'BagTrain') {
          const bl = T.jobs.find((x) => x.kind === 'BeltLoader');
          if (bl && !bl.done && (!bl.v || bl.v.state !== 'SERVICE')) continue;
        }
        j.v = this._dispatch(ac, j.kind, j.dur);
        if (!j.v) { if (T.t > j.at + 60) j.done = true; else j.at = T.t + 8; }
        continue;
      }
      const v = j.v;
      if (v.state === 'SERVICE') {
        v.task.t += dt;
        if (v.task.t > v.task.dur) { this._sendHome(v); }
      }
      if (v.state === 'RETURN') {
        if (v._waitLift && v.lift < 0.02) { const f = v._waitLift; v._waitLift = null; f(); }
        // clear of the aircraft: job done
        if (!v._waitLift && (Math.hypot(v.x - ac.x, v.z - ac.z) > 45 || v.state === 'IDLE')) j.done = true;
      }
      if (v.state === 'IDLE') j.done = true;
    }
    if (allDone) {
      ac.turnaround = null;
      ac.readyAt = this.time + 20 + this.rnd() * 70;
    }
  }

  // ------------------------------------------------------------------ flight planning
  _rw(id = this.rwy) {
    const r = this.W.runways.find((x) => x.ident === id);
    const d = id === '27' ? -1 : 1;
    return { r, id, d, tx: r.threshold[0], far: r.threshold[0] + d * r.length };
  }

  _circuitPts(fromX, fromZ, startLeg = 0) {
    const R = this._rw();
    const sv = 1;                                              // circuit to the south, over the sea
    const U = { x: R.far + R.d * 2500, z: 0 };
    const C1 = { x: U.x, z: sv * 5000 };
    const D = { x: R.tx - R.d * 9000, z: sv * 5000 };
    const F = { x: R.tx - R.d * 9000, z: 0 };
    const TD = { x: R.tx + R.d * 250, z: 0 };
    const END = { x: R.tx + R.d * 1400, z: 0 };
    const all = [U, C1, D, F, TD, END];
    const pts = [{ x: fromX, z: fromZ }].concat(all.slice(startLeg));
    return pts;
  }

  _startAir(ac, pts, legBase) {
    const path = new Path(pts, TURN_R, 25);
    const legS = path.vertexS.slice(1);
    const R = this._rw();
    ac.air = { path, s: 0, legS, legBase, tdS: path.nearestS(R.tx + R.d * 250, 0), extended: false, cleared: false, reported: {} };
    ac.state = 'AIR';
  }

  _leg(ac) {
    const A = ac.air;
    let i = 0;
    while (i < A.legS.length && A.s > A.legS[i]) i++;
    return A.legBase + i;   // 0 upwind, 1 crosswind, 2 downwind, 3 base, 4 final, 5 rollout
  }

  _spawnInbound(stand, frac) {
    const R = this._rw();
    const x = lerp(R.far + R.d * 2500, R.tx - R.d * 9000, frac);
    const ac = new AIAircraft(this, stand, this._randLiv(), this.rnd);
    ac.x = x; ac.z = 5000; ac.a = R.d > 0 ? Math.PI : 0;
    ac.alt = CIRCUIT_ALT; ac.v = 95; ac.gear = 1; ac.flap = 1; ac.slat = 0.5; ac.n1 = 62;
    ac.activate();
    Object.assign(ac.lightsOn, { nav: true, beacon: true, strobe: true, landing: false, logo: true });
    this._startAir(ac, this._circuitPts(x, 5000, 2), 2);
    ac.inbound = true;
    this.aircraft.push(ac);
    this.radio?.say(ac.callsign, `City Builder Tower, ${ac.callsign}, ${R.d < 0 ? 'left' : 'right'} downwind runway ${R.id}, full stop.`);
    this._later(3, () => this.radio?.say('TWR', `${ac.callsign}, number one, report final runway ${R.id}.`));
    return ac;
  }

  _randLiv() { return this._rl ? this._rl(this.rnd) : { name: 'Claude Air', logo: 'spark' }; }

  _later(t, f) { (this._timers || (this._timers = [])).push({ t: this.time + t, f }); }

  // ground routes -------------------------------------------------------------------
  _pushbackPts(ac) {
    const R = this._rw();
    const xs = ac.stand.cg[0], zc = ac.stand.cg[2], tl = this.G.taxilaneZ;
    // the aircraft must end up facing the departure end (taxi towards +d on the taxilane for 27:
    // east), so the tail swings the other way
    const face = R.d < 0 ? 1 : -1;
    return [{ x: xs, z: zc }, { x: xs, z: tl }, { x: xs - face * 60, z: tl }];
  }

  _taxiOutPts(ac) {
    const R = this._rw();
    const G = this.G;
    const link = R.d < 0 ? G.apronLinks[G.apronLinks.length - 1] : G.apronLinks[0];
    const conn = R.d < 0 ? G.connectors[G.connectors.length - 1] : G.connectors[0];
    const lineX = conn + R.d * 45;
    const pts = [{ x: ac.x, z: ac.z, v: 9 }, { x: link, z: G.taxilaneZ, v: 9 }, { x: link, z: G.twyZ, v: 10 }, { x: conn, z: G.twyZ, v: 9 },
      { x: conn, z: G.holdZ, v: 6 }, { x: conn, z: 0, v: 6 }, { x: lineX, z: 0, v: 4 }];
    return { pts, holdIdx: 4 };
  }

  _taxiInPts(ac) {
    const R = this._rw();
    const G = this.G;
    const conns = G.connectors.slice().sort((a, b) => (a - b) * R.d);
    const conn = conns.find((c) => (c - ac.x) * R.d > 950) ?? conns[conns.length - 1];
    const link = R.d < 0 ? G.apronLinks[1] : G.apronLinks[2];
    const xs = ac.stand.cg[0], zc = ac.stand.cg[2];
    ac.exitName = 'A' + (G.connectors.indexOf(conn) + 1);
    const pts = [{ x: ac.x, z: ac.z }, { x: conn, z: 0, v: 7 }, { x: conn, z: G.twyZ, v: 9 },
      { x: link, z: G.twyZ, v: 9 }, { x: link, z: G.taxilaneZ, v: 8 }, { x: xs, z: G.taxilaneZ, v: 7 }, { x: xs, z: zc + 30, v: 3 }, { x: xs, z: zc, v: 1.2 }];
    const rad = [0, 40, 45, 45, 40, 32, 0, 0];
    return { pts, rad, holdIdx: 3 };
  }

  // ------------------------------------------------------------------ per frame
  update(dt, env) {
    if (!this.enabled || !this._staticTpl) return;
    this.time += dt;
    const T = this;
    this.env = env;
    // player state (obstacle / runway occupancy)
    const P = this.player;
    Object.assign(P, env.player || {});
    P.active = !!env.player;
    if (P.active) acCircles(P.x, P.z, P.a, P.circles);
    this.movingAircraft = this.aircraft.filter((a) => !['PARKED', 'AIR', 'TUG', 'REQ_PUSH'].includes(a.state));
    if (P.active && P.onGround) this.movingAircraft.push(P);
    // timers
    if (this._timers) {
      for (let i = this._timers.length - 1; i >= 0; i--) if (this._timers[i].t <= this.time) { const f = this._timers[i].f; this._timers.splice(i, 1); f(); }
    }
    this._atc(dt);
    for (const ac of this.aircraft) {
      this._updateTurnaround(ac, dt);
      this._aiStep(ac, dt);
    }
    for (const v of this.vehicles) v.update(dt);
    // lights and visibility culling
    const cam = env.camera.position;
    const L = this.lights;
    L.begin();
    for (const ac of this.aircraft) ac.lights(L, this.time);
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - cam.x, v.z - cam.z, cam.y);
      v.obj.visible = d < 2600;
      for (const w of v.wheels) if (w.obj) w.obj.visible = d < 350;
      v.lights(L, this.time, env.night);
    }
    L.end();
    L.uniforms.uNight.value = env.night;
    L.uniforms.uScreen.value = window.innerHeight / (2 * Math.tan(env.camera.fov * DEG / 2));
    L.uniforms.uPR.value = Math.min(window.devicePixelRatio, 2);
    void T;
  }

  // sound from the nearest AI aircraft (for the audio engine)
  sound(cam) {
    let roar = 0, whine = 0;
    for (const ac of this.aircraft) {
      if (ac.n1 < 5) continue;
      const d = Math.max(30, Math.hypot(ac.x - cam.x, ac.alt + 5 - cam.y, ac.z - cam.z));
      const k = (60 / d) ** 1.6;
      const n = ac.n1 / 100;
      roar += k * Math.pow(n, 2.2);
      whine += k * 0.5 * (0.4 + n);
    }
    return { roar: Math.min(roar, 1.5), whine: Math.min(whine, 1.2) };
  }

  // ------------------------------------------------------------------ ATC
  _runwayBusy(except) {
    for (const ac of this.aircraft) {
      if (ac === except) continue;
      if (['LINEUP', 'WAIT_TKOF', 'TAKEOFF'].includes(ac.state) && ac.onRunwayArmed) return ac;
      if (ac.state === 'ROLLOUT' && !ac.vacated) return ac;
    }
    const P = this.player;
    if (P.active && P.alt < 50 && Math.abs(P.z) < 45 && Math.abs(P.x) < 1850) return P;
    return null;
  }

  _arrivalEta() {
    let eta = Infinity;
    for (const ac of this.aircraft) {
      if (ac.state !== 'AIR' || !ac.air) continue;
      const leg = this._leg(ac);
      if (leg < 3) continue;
      const rem = ac.air.tdS - ac.air.s;
      eta = Math.min(eta, rem / Math.max(ac.v, 50));
    }
    const P = this.player;
    if (P.active && !P.onGround && P.alt < 900 && Math.abs(P.z) < 1500) {
      const R = this._rw();
      const along = (R.tx - P.x) * R.d;          // distance before the threshold
      const hd = Math.abs(wrapPi(P.a - (R.d > 0 ? 0 : Math.PI)));
      if (along > -200 && along < 15000 && hd < 0.5) eta = Math.min(eta, along / Math.max(P.v, 50));
    }
    return eta;
  }

  _atc(dt) {
    const R = this._rw();
    // departures: schedule the next pushback
    if (this.time > this.nextDeparture) {
      const airborne = this.aircraft.filter((a) => ['AIR', 'TAKEOFF'].includes(a.state)).length;
      const outbound = this.aircraft.filter((a) => ['TUG', 'REQ_PUSH', 'PUSH', 'TAXI_OUT', 'HOLDING', 'LINEUP', 'WAIT_TKOF'].includes(a.state)).length;
      const cand = this.aircraft.filter((a) => a.state === 'PARKED' && !a.turnaround && a.readyAt != null && a.readyAt < this.time);
      if (cand.length && airborne < 3 && outbound < 2) {
        const ac = cand[Math.floor(this.rnd() * cand.length)];
        this._callTug(ac);
        this.nextDeparture = this.time + 100 + this.rnd() * 80;
      } else this.nextDeparture = this.time + 10;
    }
    // apron: one mover at a time (arrivals first)
    if (!this.apronOwner && this.apronQueue.length) {
      this.apronQueue.sort((a, b) => (a.state === 'TAXI_IN' ? 0 : 1) - (b.state === 'TAXI_IN' ? 0 : 1));
      const ac = this.apronQueue.shift();
      this.apronOwner = ac;
      if (ac.state === 'REQ_PUSH') {
        const face = R.d < 0 ? 'east' : 'west';
        this.radio?.say('GND', `${ac.callsign}, push back and start up approved, facing ${face}.`);
        this._later(2.5, () => this.radio?.say(ac.callsign, `Push and start approved, facing ${face}, ${ac.callsign}.`));
        this._later(4, () => this._beginPush(ac));
      } else if (ac.state === 'TAXI_IN') {
        this.radio?.say('GND', `${ac.callsign}, continue via apron taxilane to stand ${ac.stand.id}.`);
        if (ac.apronHold) ac.apronHold.cleared = true;
      }
    }
    // runway: line up / take-off clearance
    const busy = this._runwayBusy();
    const eta = this._arrivalEta();
    const hold = this.aircraft.filter((a) => a.state === 'HOLDING').sort((a, b) => a.holdT - b.holdT)[0];
    const lined = this.aircraft.find((a) => a.state === 'WAIT_TKOF' || (a.state === 'LINEUP'));
    if (hold && !lined && !busy && eta > 70 && this.time - this.lastTakeoff > 70) {
      hold.state = 'LINEUP';
      hold.onRunwayArmed = true;
      if (hold.lineHold) hold.lineHold.cleared = true;
      const clearNow = eta > 110;
      hold.tkofCleared = clearNow;
      if (clearNow) {
        this.radio?.say('TWR', `${hold.callsign}, wind ${hdg3(this.windDir)} at ${Math.round(this.windKt)} knots, runway ${R.id}, cleared for take-off.`);
        this._later(3, () => this.radio?.say(hold.callsign, `Cleared for take-off runway ${R.id}, ${hold.callsign}.`));
      } else {
        this.radio?.say('TWR', `${hold.callsign}, runway ${R.id}, line up and wait.`);
        this._later(2.5, () => this.radio?.say(hold.callsign, `Line up and wait runway ${R.id}, ${hold.callsign}.`));
      }
    } else if (hold && !hold.toldHold && (busy || eta <= 70)) {
      hold.toldHold = true;
      if (eta <= 70) this.radio?.say('TWR', `${hold.callsign}, hold short runway ${R.id}, landing traffic.`);
    }
    for (const ac of this.aircraft) {
      if ((ac.state === 'WAIT_TKOF' || ac.state === 'LINEUP') && !ac.tkofCleared) {
        const e = this._arrivalEta();
        if (e > 110 && !this._runwayBusy(ac)) {
          ac.tkofCleared = true;
          this.radio?.say('TWR', `${ac.callsign}, runway ${R.id}, cleared for take-off.`);
          this._later(2.5, () => this.radio?.say(ac.callsign, `Cleared for take-off, ${ac.callsign}.`));
        }
      }
    }
    // arrivals: landing clearance / go-around
    for (const ac of this.aircraft) {
      if (ac.state !== 'AIR' || !ac.air) continue;
      const leg = this._leg(ac);
      const rem = ac.air.tdS - ac.air.s;
      if (leg === 4 && !ac.air.reported.final && rem < 8000) {
        ac.air.reported.final = true;
        this.radio?.say(ac.callsign, `${ac.callsign}, final runway ${R.id}.`);
      }
      if (leg >= 4 && !ac.air.cleared && rem < 7000) {
        const b = this._runwayBusy(ac);
        if (!b || (b.state === 'TAKEOFF')) {
          ac.air.cleared = true;
          this._later(2, () => this.radio?.say('TWR', `${ac.callsign}, wind ${hdg3(this.windDir)} at ${Math.round(this.windKt)} knots, runway ${R.id}, cleared to land.`));
          this._later(5, () => this.radio?.say(ac.callsign, `Cleared to land runway ${R.id}, ${ac.callsign}.`));
        }
      }
      if (leg >= 4 && rem < 1500 && rem > 0) {
        const b = this._runwayBusy(ac);
        if (!ac.air.cleared || (b && b.state !== 'TAKEOFF')) this._goAround(ac);
      }
    }
  }

  _callTug(ac) {
    ac.state = 'TUG';
    const tug = this._dispatch(ac, 'Tug', 1e9);
    ac.tug = tug;
    ac.activate();
    Object.assign(ac.lightsOn, { nav: true, beacon: false, logo: true });
    if (!tug) { ac.state = 'REQ_PUSH'; this._requestPush(ac); }
  }

  _requestPush(ac) {
    ac.state = 'REQ_PUSH';
    ac.lightsOn.beacon = true;
    this.radio?.say(ac.callsign, `City Builder Ground, ${ac.callsign}, stand ${ac.stand.id}, request push back and start up.`);
    if (this.apronOwner || this.apronQueue.length) this._later(3, () => this.radio?.say('GND', `${ac.callsign}, standby, expect push back in two minutes.`));
    this.apronQueue.push(ac);
  }

  _beginPush(ac) {
    const pts = this._pushbackPts(ac);
    ac.mover = new Mover(new Path(pts, 45, 2), { vmax: 2.2, acc: 0.15, dec: 0.3, aLat: 0.15, dir: -1 });
    ac.state = 'PUSH';
    ac.startT = 0;
  }

  _goAround(ac) {
    const R = this._rw();
    this.radio?.say('TWR', `${ac.callsign}, go around, climb ${Math.round(CIRCUIT_ALT / FT)} feet, ${R.d < 0 ? 'left' : 'right'} hand circuit.`);
    this._later(3, () => this.radio?.say(ac.callsign, `Going around, ${ac.callsign}.`));
    ac.goAround = true;
    this._startAir(ac, this._circuitPts(ac.x, ac.z, 0), 0);
  }

  // ------------------------------------------------------------------ AI aircraft step
  _aiStep(ac, dt) {
    const R = this._rw();
    ac.timer += dt;
    switch (ac.state) {
      case 'PARKED': {
        if (ac.parkT != null) {
          ac.parkT += dt;
          ac.n1 = Math.max(0, ac.n1 - dt * 6);
          if (ac.parkT > 15) { ac.lightsOn.beacon = false; }
          if (ac.parkT > 30 && ac.art && !ac.turnaround?.midway) { ac.deactivate(); Object.assign(ac.lightsOn, { nav: false, logo: false }); ac.parkT = null; }
        }
        break;
      }
      case 'TUG': {
        const tug = ac.tug;
        if (tug && tug.state === 'SERVICE') this._requestPush(ac);
        break;
      }
      case 'REQ_PUSH': break;
      case 'PUSH': {
        ac.startT += dt;
        ac.n1 = Math.min(22, ac.n1 + dt * (ac.startT > 20 ? 1.4 : ac.startT > 8 ? 0.8 : 0));
        const p = ac.mover.update(dt);
        ac.x = p.x; ac.z = p.z; ac.a = p.a; ac.v = ac.mover.v; ac.dirSign = -1;
        const tug = ac.tug;
        if (tug) {
          // tug holds the nose gear: cradle under the gear, facing the aircraft
          const steer = clamp(Math.atan(25.8 * (p.k || 0)), -1.2, 1.2);
          const gx = ac.x + Math.cos(ac.a) * 24.13, gz = ac.z + Math.sin(ac.a) * 24.13;
          const ta = ac.a + Math.PI + steer;
          tug.x = gx - Math.cos(ta) * 0.6; tug.z = gz - Math.sin(ta) * 0.6; tug.a = ta;
          tug.v = -ac.v; tug.dir = 1; tug.steerA = 0; tug.slaved = true;
          tug.place(dt);
        }
        if (ac.mover.done && ac.startT > 25) {
          ac.state = 'TAXI_WAIT';
          ac.timer = 0;
          ac.dirSign = 1;
          if (tug) this._tugAway(tug, ac);
          ac.tug = null;
          this._later(4, () => this.radio?.say(ac.callsign, `${ac.callsign}, ready to taxi.`));
          this._later(7, () => {
            this.radio?.say('GND', `${ac.callsign}, taxi to holding point runway ${R.id} via Alpha. QNH one zero one three.`);
            this._later(3, () => this.radio?.say(ac.callsign, `Taxi to holding point runway ${R.id} via Alpha, ${ac.callsign}.`));
            this._startTaxiOut(ac);
          });
        }
        break;
      }
      case 'TAXI_WAIT': ac.n1 = Math.min(24, ac.n1 + dt); break;
      case 'TAXI_OUT':
      case 'LINEUP':
      case 'HOLDING':
      case 'WAIT_TKOF': {
        ac.lightsOn.taxi = true;
        ac.mover.limit = this._aircraftLimit(ac);
        const p = ac.mover.update(dt);
        ac.x = p.x; ac.z = p.z; ac.a = p.a; ac.v = ac.mover.v;
        ac.n1 = lerp(ac.n1, ac.v < 0.5 && ac.mover.limit > 1 ? 32 : 26, Math.min(1, dt));
        if (this.apronOwner === ac && ac.z > this.G.taxilaneZ + 25) this.apronOwner = null;
        if (ac.state === 'TAXI_OUT' && ac.mover.atHold()) {
          ac.state = 'HOLDING'; ac.holdT = this.time;
          this.radio?.say(ac.callsign, `City Builder Tower, ${ac.callsign}, holding point runway ${R.id}, ready for departure.`);
        }
        if (ac.state === 'LINEUP' && ac.mover.done) { ac.state = 'WAIT_TKOF'; }
        if (ac.state === 'LINEUP' || ac.state === 'WAIT_TKOF') Object.assign(ac.lightsOn, { strobe: true, landing: true });
        if (ac.state === 'WAIT_TKOF' && ac.tkofCleared && ac.mover.done) this._takeoff(ac);
        if (ac.state === 'LINEUP' && ac.tkofCleared && ac.mover.s > ac.mover.path.length - 25) this._takeoff(ac, true);
        break;
      }
      case 'TAKEOFF': {
        const acc = 2.25 - 0.006 * ac.v;
        ac.v += acc * dt;
        ac.n1 = lerp(ac.n1, 95, Math.min(1, dt * 0.6));
        ac.mover.v = ac.v; ac.mover.vmax = 999;
        ac.mover.s += ac.v * dt;
        const p = ac.mover.path.at(ac.mover.s, ac.mover.pose);
        ac.x = p.x; ac.z = p.z; ac.a = p.a;
        if (ac.v > 76) ac.pitch = Math.min(ac.pitch + 2.6 * dt, 12);
        if (ac.pitch > 7.5 && ac.v > 80) {
          ac.state = 'AIR';
          ac.liftoffT = this.time;
          this.lastTakeoff = this.time;
          this._startAir(ac, this._circuitPts(ac.x, ac.z, 0), 0);
          ac.onRunwayArmed = false;
          ac.lightsOn.taxi = false;
          const turn = R.d < 0 ? 'left' : 'right';
          this._later(6, () => this.radio?.say('TWR', `${ac.callsign}, after departure ${turn} turn, climb ${Math.round(CIRCUIT_ALT / FT)} feet, join ${turn} downwind runway ${R.id}, report downwind.`));
          this._later(10, () => this.radio?.say(ac.callsign, `${turn[0].toUpperCase() + turn.slice(1)} downwind runway ${R.id}, ${ac.callsign}.`));
        }
        break;
      }
      case 'AIR': this._fly(ac, dt); break;
      case 'ROLLOUT':
      case 'TAXI_IN': {
        ac.mover.limit = ac.state === 'TAXI_IN' ? this._aircraftLimit(ac) : Infinity;
        const p = ac.mover.update(dt);
        ac.x = p.x; ac.z = p.z; ac.a = p.a; ac.v = ac.mover.v;
        ac.pitch = Math.max(0, ac.pitch - dt * 2.2);
        ac.spoiler = ac.v > 15 ? 1 : Math.max(0, ac.spoiler - dt * 0.3);
        ac.n1 = ac.v > 25 ? lerp(ac.n1, 70, Math.min(1, dt * 1.2)) : lerp(ac.n1, 26, Math.min(1, dt * 0.8));
        ac.flap = ac.v < 12 ? Math.max(0, ac.flap - dt * 2) : ac.flap;
        ac.slat = ac.flap > 0 ? 1 : Math.max(0, ac.slat - dt * 0.2);
        if (ac.state === 'ROLLOUT' && Math.abs(ac.z) > 95) {
          ac.state = 'TAXI_IN'; ac.vacated = true;
          Object.assign(ac.lightsOn, { strobe: false, landing: false, taxi: true });
          this.radio?.say('TWR', `${ac.callsign}, vacate via ${ac.exitName || 'Alpha'}, contact Ground one two one decimal niner.`);
          this._later(3, () => {
            this.radio?.say(ac.callsign, `City Builder Ground, ${ac.callsign}, runway vacated, for stand ${ac.stand.id}.`);
            this._later(3, () => this.radio?.say('GND', `${ac.callsign}, taxi to stand ${ac.stand.id} via Alpha, hold short of the apron.`));
          });
        }
        if (ac.state === 'TAXI_IN' && ac.mover.atHold() && !ac.apronReq) {
          ac.apronReq = true;
          this.apronQueue.push(ac);
        }
        if (ac.state === 'TAXI_IN' && ac.mover.done) {
          ac.state = 'PARKED'; ac.parkT = 0; ac.v = 0; ac.inbound = false;
          Object.assign(ac.lightsOn, { taxi: false, strobe: false, landing: false });
          if (this.apronOwner === ac) this.apronOwner = null;
          ac.apronReq = false;
          this._startTurnaround(ac);
        }
        break;
      }
      default: break;
    }
    if (ac.art || ac.state !== 'PARKED') ac.place(dt);
    else acCircles(ac.x, ac.z, ac.a, ac.circles);
  }

  _startTaxiOut(ac) {
    const { pts, holdIdx } = this._taxiOutPts(ac);
    const path = new Path(pts, [0, 40, 40, 45, 0, 35, 0], 2);
    ac.mover = new Mover(path, { vmax: 10, acc: 0.45, dec: 0.9, aLat: 0.9 });
    const hs = path.nearestS(pts[holdIdx].x, pts[holdIdx].z);
    ac.lineHold = ac.mover.hold(hs - 2, 'hold');
    ac.state = 'TAXI_OUT';
    Object.assign(ac.lightsOn, { taxi: true, nav: true, beacon: true });
  }

  _takeoff(ac) {
    const R = this._rw();
    const path = new Path([{ x: ac.x, z: ac.z }, { x: R.far + R.d * 800, z: 0 }], 0);
    ac.mover = new Mover(path, { vmax: 999 });
    ac.mover.v = ac.v;
    ac.state = 'TAKEOFF';
    ac.onRunwayArmed = true;
    ac.flap = 5; ac.slat = 1;
    Object.assign(ac.lightsOn, { strobe: true, landing: true, taxi: false });
  }

  _tugAway(tug, ac) {
    // back away from the nose gear, then turn towards the service road and drive home
    tug.slaved = false;
    tug.released = ac;
    const c = Math.cos(tug.a), s = Math.sin(tug.a);
    const bx = tug.x - c * 16, bz = tug.z - s * 16;
    const kx = bx + c * 4, kz = bz + s * 4;
    const home = this._roadHome(tug);
    const legs = [{ path: new Path([{ x: tug.x, z: tug.z }, { x: bx, z: bz }], 0), dir: -1 },
      { path: new Path([{ x: bx, z: bz }, { x: kx, z: kz }, { x: kx, z: this.G.taxilaneZ - 60 }, { x: kx, z: home.laneZ }].concat(home.tail), 6) }];
    tug.state = 'RETURN';
    tug.task = null;
    tug.go(legs, () => { tug.released = null; this._park(tug); });
  }

  // taxiing aircraft: stop for aircraft ahead (AI and the player)
  _aircraftLimit(ac) {
    const c = Math.cos(ac.a), s = Math.sin(ac.a);
    let gap = Infinity;
    const look = ac.v * ac.v / 1.6 + 70;
    const others = this.aircraft.filter((o) => o !== ac && o.state !== 'AIR' && o.state !== 'PARKED');
    if (this.player.active && this.player.onGround) others.push(this.player);
    for (const o of others) {
      for (const [x, z, r] of o.circles) {
        const dx = x - ac.x, dz = z - ac.z;
        const f = dx * c + dz * s;
        if (f < 20 || f > look + 30) continue;
        const l = -dx * s + dz * c;
        if (Math.abs(l) > 31 + r) continue;
        gap = Math.min(gap, f - 30 - r);
      }
    }
    // ground vehicles crossing in front of the nose
    for (const v of this.vehicles) {
      if (v.slaved) continue;
      for (const [x, z, r] of v.circles) {
        const dx = x - ac.x, dz = z - ac.z;
        const f = dx * c + dz * s;
        if (f < 25 || f > look + 30) continue;
        const l = -dx * s + dz * c;
        if (Math.abs(l) > 5 + r) continue;
        gap = Math.min(gap, f - 32 - r + 12);
      }
    }
    return gap === Infinity ? Infinity : Math.sqrt(2 * 0.9 * Math.max(0, gap - 12));
  }

  // circuit flying ---------------------------------------------------------------------
  _fly(ac, dt) {
    const A = ac.air;
    const R = this._rw();
    const leg = this._leg(ac);
    const rem = A.tdS - A.s;
    // targets per leg
    let vT = 95, altT = CIRCUIT_ALT, flapT = 0, gearT = 1;
    const agl = ac.alt;
    if (leg === 0) { vT = agl < 150 ? 86 : 103; flapT = agl < 250 ? 5 : ac.v > 95 ? 1 : 5; gearT = this.time - (ac.liftoffT || 0) > 3 ? 1 : 0; }
    else if (leg === 1) { vT = 103; flapT = 0; }
    else if (leg === 2) {
      const toBase = A.legS[2 - A.legBase] !== undefined ? A.legS[2 - A.legBase] - A.s : 1e9;
      vT = toBase < 4000 ? 85 : 95; flapT = toBase < 4000 ? 5 : 1;
      if (!A.reported.downwind && leg === 2) {
        A.reported.downwind = true;
        if (!ac.inbound) {
          this.radio?.say(ac.callsign, `${ac.callsign}, ${R.d < 0 ? 'left' : 'right'} downwind runway ${R.id}.`);
          const n = 1 + this.aircraft.filter((o) => o !== ac && o.state === 'AIR' && o.air && (o.air.tdS - o.air.s) < rem).length;
          this._later(3, () => this.radio?.say('TWR', `${ac.callsign}, number ${n}, report final.`));
        }
      }
    } else if (leg === 3) { vT = 80; flapT = 20; gearT = 0; altT = BASE_ALT; }
    else if (leg >= 4) { vT = 75; flapT = 30; gearT = 0; altT = Math.max(0, rem * TAN3); }
    // base turn spacing: extend downwind while the aircraft ahead is too close
    if (leg === 2 && !A.extended) {
      const toBase = A.legS[2 - A.legBase] - A.s;
      if (toBase < TURN_R + 200 && !this._spacingOk(ac)) {
        A.extended = true;
        this.radio?.say('TWR', `${ac.callsign}, extend downwind, number two, traffic on final.`);
        const pts = [{ x: ac.x, z: ac.z }, { x: ac.x - R.d * 25000, z: ac.z }];
        const path = new Path(pts, 0);
        ac.air = Object.assign(A, { path, s: 0, legS: [1e9], legBase: 2, tdS: 1e9 });
      }
    }
    if (A.extended) {
      if (this._spacingOk(ac) || A.s > 20000) {
        A.extended = false;
        this.radio?.say('TWR', `${ac.callsign}, turn base now, number one.`);
        const bx = ac.x - R.d * TURN_R;
        this._startAir(ac, [{ x: ac.x, z: ac.z }, { x: bx, z: ac.z }, { x: bx, z: 0 }, { x: R.tx + R.d * 250, z: 0 }, { x: R.tx + R.d * 1400, z: 0 }], 2);
        ac.air.reported.downwind = true;
        return;
      }
    }
    // speed
    const aDec = leg >= 4 && agl < 7 ? 1.0 : 0.7;
    ac.v += clamp(vT - ac.v, -aDec * dt, 1.1 * dt);
    // altitude
    let vsT;
    const ground = terrainHeight(ac.x, ac.z);
    if (leg >= 4) {
      const gp = rem * TAN3;
      vsT = clamp(-ac.v * TAN3 + (gp - agl) * 0.12, -7, 1.5);
      if (agl < 7) vsT = -(0.8 + 0.3 * agl);
    } else {
      altT = Math.max(altT, ground + 250);
      vsT = clamp((altT - agl) * 0.06, leg === 3 ? -5 : -8, leg === 0 ? 12 : 8);
    }
    ac.vs += clamp(vsT - ac.vs, -1.6 * dt, 1.6 * dt);
    ac.alt += ac.vs * dt;
    // lateral
    A.s += ac.v * dt;
    const p = A.path.at(A.s, this._pp || (this._pp = {}));
    ac.x = p.x; ac.z = p.z; ac.a = p.a;
    const bankT = clamp(Math.atan(ac.v * ac.v * (p.k || 0) / G) / DEG, -28, 28);
    ac.bank += clamp(bankT - ac.bank, -7 * dt, 7 * dt);
    // attitude from flight path + angle of attack
    const ff = ac.flap / 30;
    const alpha = clamp(2 + 5.5 * (75 / Math.max(ac.v, 50)) ** 2 * (1 - 0.35 * ff), 1, 12);
    const pT = Math.atan2(ac.vs, ac.v) / DEG + alpha;
    ac.pitch += clamp(pT - ac.pitch, -3 * dt, 3 * dt);
    // configuration
    ac.flap += clamp(flapT - ac.flap, -1.5 * dt, 1.5 * dt);
    ac.slat = ac.flap > 0.5 ? 1 : Math.max(0, ac.slat - dt * 0.2);
    if (gearT > ac.gear) ac.gear = Math.min(1, ac.gear + dt / 10); else ac.gear = Math.max(0, ac.gear - dt / 10);
    ac.spoiler = 0;
    const thrust = leg === 0 ? 0.9 : clamp(0.55 + ac.vs / 25 + (vT - ac.v) * 0.05 + ac.flap / 60 + (1 - ac.gear) * 0.08, 0.3, 0.95);
    ac.n1 = lerp(ac.n1, leg >= 4 && agl < 7 ? 30 : 30 + 65 * thrust, Math.min(1, dt * 0.5));
    Object.assign(ac.lightsOn, { nav: true, beacon: true, strobe: true, landing: agl < 900, taxi: false, logo: true });
    // touchdown
    if (leg >= 4 && ac.alt <= 0.02 && A.s > A.tdS - 700) {
      ac.alt = 0; ac.vs = 0;
      this._touchdown(ac);
    }
  }

  _spacingOk(ac) {
    const R = this._rw();
    // distance I would still have to fly if I turned base now
    const mine = TURN_R * 2 + 5000 + Math.abs(ac.x - (R.tx + R.d * 250));
    for (const o of this.aircraft) {
      if (o === ac) continue;
      if (o.state === 'AIR' && o.air && !o.air.extended) {
        const leg = this._leg(o);
        if (leg >= 3 && o.air.tdS - o.air.s > mine - 7000) return false;
      }
      if (['LINEUP', 'WAIT_TKOF'].includes(o.state)) return mine > 12000;
    }
    const P = this.player;
    if (P.active && !P.onGround) {
      const along = (R.tx - P.x) * R.d;
      if (along > 0 && along < 16000 && Math.abs(P.z) < 1500 && P.alt < 900 && along > mine - 7000) return false;
    }
    return true;
  }

  _touchdown(ac) {
    const { pts, rad, holdIdx } = this._taxiInPts(ac);
    const path = new Path(pts, rad, 3);
    ac.mover = new Mover(path, { vmax: 90, acc: 0.4, dec: 2.6, aLat: 0.9, v: ac.v });
    const hs = path.nearestS(pts[holdIdx].x, pts[holdIdx].z) - 70;
    ac.apronHold = ac.mover.hold(hs, 'apron');
    ac.state = 'ROLLOUT'; ac.vacated = false;
    ac.air = null;
    ac.goAround = false;
    this.env?.touchdown?.(ac);
  }
}
