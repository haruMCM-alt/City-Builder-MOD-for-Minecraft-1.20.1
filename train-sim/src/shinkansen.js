// 東北新幹線 trains on the viaduct beside the 宇都宮線: procedural E5 / H5 / E6 / E8 / E2 / E7 sets
// and a small traffic manager that sends them past at their real speeds (130 km/h south of 大宮,
// up to 275 km/h north of it).
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// liveries (official colour names; hex from the operator's / Wikipedia values)
// ---------------------------------------------------------------------------
const C = (h) => new THREE.Color(h);
const LIVERY = {
  // bands from the bottom up: [yTop (m above rail), colour]
  E5: { bands: [[2.02, 0xd6dad9], [2.16, 0xdf3687], [9, 0x489a83]], nose: 15, w: 3.35, h: 3.65, len: 25, head: 26.5 },
  H5: { bands: [[2.02, 0xd6dad9], [2.16, 0x6c5098], [9, 0x489a83]], nose: 15, w: 3.35, h: 3.65, len: 25, head: 26.5 },
  E6: { bands: [[1.95, 0xd6dad9], [2.08, 0x9fa3a6], [9, 0xd61b2a]], nose: 13, w: 2.945, h: 3.65, len: 20.5, head: 23 },
  E8: { bands: [[1.75, 0xf4f4f2], [2.05, 0xf2b300], [9, 0x5b2c83]], nose: 9, w: 2.945, h: 3.65, len: 20.5, head: 23 },
  E2: { bands: [[1.5, 0x2a4990], [1.64, 0xd155ab], [9, 0xd6dad9]], nose: 9.1, w: 3.38, h: 3.7, len: 25, head: 25.7 },
  E7: { bands: [[1.62, 0xf9f8f3], [1.74, 0xc09584], [1.84, 0x0158e5], [2.9, 0xf9f8f3], [9, 0x0158e5]], nose: 9.1, w: 3.38, h: 3.65, len: 25, head: 26 },
};
// formations as they run on the 宇都宮 side (E6 / E8 are coupled to the north end of an E5)
const SETS = [
  { name: 'はやぶさ・こまち', parts: [['E6', 7], ['E5', 10]], w: 3, stopU: false },
  { name: 'やまびこ・つばさ', parts: [['E8', 7], ['E5', 10]], w: 3, stopU: true },
  { name: 'はやぶさ', parts: [['E5', 10]], w: 2, stopU: false },
  { name: 'はやぶさ (H5)', parts: [['H5', 10]], w: 0.6, stopU: false },
  { name: 'なすの', parts: [['E2', 10]], w: 1.5, stopU: true },
  { name: 'やまびこ', parts: [['E5', 10]], w: 1.5, stopU: true },
  { name: 'かがやき', parts: [['E7', 12]], w: 1.2, south: true },
];

/** cross-section (half, from the bottom edge up to the roof centre), metres: [z, y] for a 3.35 m body */
const PROFILE = [[1.52, 0.55], [1.63, 0.95], [1.675, 1.6], [1.675, 2.2], [1.6, 2.8], [1.4, 3.3], [1.05, 3.56], [0.5, 3.64], [0, 3.65]];

const _mats = {};
function bodyMat() {
  return _mats.body || (_mats.body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.15, envMapIntensity: 1.1 }));
}
function darkMat() {
  return _mats.dark || (_mats.dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.25, metalness: 0.3 }));
}
function underMat() {
  return _mats.under || (_mats.under = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.8, metalness: 0.2 }));
}
function lampMat(tail) {
  const k = tail ? 'tail' : 'head';
  return _mats[k] || (_mats[k] = new THREE.MeshStandardMaterial({ color: tail ? 0x400404 : 0xfff6e0, emissive: tail ? 0xff1a0a : 0xfff2d8, emissiveIntensity: 3, roughness: 0.2 }));
}

const _geoCache = new Map();
/**
 * one car: a body swept along x (0 = rear end, L = front end); nose = length of the streamlined
 * nose at the +x end (0 for a middle car). Returns {body, windows, under} geometries.
 */
function carGeometry(type, L, nose) {
  const key = `${type}|${L}|${nose}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const lv = LIVERY[type];
  const ws = lv.w / 3.35, hs = lv.h / 3.65;
  const prof = PROFILE.map(([z, y]) => [z * ws, 0.55 + (y - 0.55) * hs]);
  // full ring, left side then mirrored right side
  const ring = [...prof.map(([z, y]) => [z, y]), ...prof.slice(0, -1).reverse().map(([z, y]) => [-z, y])];
  const colorAt = (y) => { for (const [top, c] of lv.bands) if (y <= top) return C(c); return C(lv.bands[lv.bands.length - 1][1]); };
  // stations along x: dense on the nose
  const xs = [0];
  const bodyEnd = L - nose;
  for (let x = 1.5; x < bodyEnd; x += Math.max(1.5, bodyEnd / 6)) xs.push(x);
  xs.push(bodyEnd);
  if (nose > 0) for (let i = 1; i <= 16; i++) xs.push(bodyEnd + nose * (i / 16));
  const pos = [], col = [], idx = [];
  const sec = (x) => {
    if (x <= bodyEnd || nose <= 0) return { w: 1, h: 1, drop: 0 };
    const t = (x - bodyEnd) / nose;           // 0 at the nose root, 1 at the tip
    // long, flat "double cusp" nose: width tapers late, the top drops early
    const w = Math.max(0.06, Math.sqrt(Math.max(0, 1 - t ** 2.3)));
    const h = Math.max(0.2, 1 - 0.78 * Math.pow(t, 0.75));
    return { w, h, drop: t };
  };
  for (const x of xs) {
    const { w, h, drop } = sec(x);
    for (const [z, y] of ring) {
      const yy = 0.55 + (y - 0.55) * h - (drop > 0.92 ? (drop - 0.92) * 2.5 : 0);
      pos.push(x, yy, z * w);
      let c = colorAt(y);
      // cab canopy: dark glass on the upper nose just ahead of the root
      if (nose > 0 && drop > 0.08 && drop < 0.33 && y > 2.6 * hs) c = C(0x101418);
      col.push(c.r, c.g, c.b);
    }
  }
  const n = ring.length;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // end cap at the rear (gangway end)
  const base = pos.length / 3;
  pos.push(0, 2.1 * hs, 0); col.push(0.2, 0.2, 0.2);
  for (let j = 0; j < n - 1; j++) idx.push(base, j + 1, j);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  // side windows: a row of dark panes on each side (none on the nose)
  const wins = [];
  const zW = lv.w / 2 + 0.012, y0 = (lv.bands[0][0] > 1.7 ? 2.2 : 1.85) * hs, y1 = y0 + 0.62;
  for (let x = 1.6; x < bodyEnd - 1.2; x += 1.55) {
    for (const s of [1, -1]) wins.push([x, x + 0.95, y0, y1, s * zW]);
  }
  const wp = [];
  for (const [a, b, c, d, z] of wins) wp.push(a, c, z, b, c, z, b, d, z, a, c, z, b, d, z, a, d, z);
  const windows = new THREE.BufferGeometry();
  windows.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  windows.computeVertexNormals();
  // bogie / underfloor block
  const under = new THREE.BoxGeometry(bodyEnd - 1.5 + (nose > 0 ? nose * 0.25 : 0), 0.75, lv.w * 0.8);
  under.translate((bodyEnd - 1.5 + (nose > 0 ? nose * 0.25 : 0)) / 2 + 0.75, 0.55, 0);
  const out = { body, windows, under };
  _geoCache.set(key, out);
  return out;
}

class ShinkansenSet {
  constructor(set) {
    this.set = set;
    this.group = new THREE.Group();
    this.cars = [];
    this.lamps = [];
    // build from the north end (index 0 = north-most car)
    const list = [];
    for (const [type, n] of set.parts) for (let i = 0; i < n; i++) list.push(type);
    let off = 0;
    list.forEach((type, i) => {
      const lv = LIVERY[type];
      const northEnd = i === 0, southEnd = i === list.length - 1;
      const L = northEnd || southEnd ? lv.head : lv.len;
      const g = new THREE.Group();
      // a nose car is built with its nose at +x; the south end car is turned round
      const nose = northEnd || southEnd ? lv.nose : 0;
      const geo = carGeometry(type, L, nose);
      const body = new THREE.Mesh(geo.body, bodyMat());
      const win = new THREE.Mesh(geo.windows, darkMat());
      const und = new THREE.Mesh(geo.under, underMat());
      const inner = new THREE.Group();
      inner.add(body, win, und);
      if (southEnd && !northEnd) { inner.rotation.y = Math.PI; inner.position.x = L; }
      // lamps in the nose (head and tail lights share the clusters)
      if (nose > 0) {
        for (const s of [1, -1]) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lampMat(false));
          lamp.position.set(L - nose * 0.55, 1.15, s * lv.w * 0.28);
          lamp.userData.north = northEnd;
          this.lamps.push(lamp);
          inner.add(lamp);
        }
      }
      g.add(inner);
      g.userData = { L, off, type };
      off += L + 0.4;
      this.group.add(g);
      this.cars.push(g);
    });
    this.length = off;
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  }

  /**
   * place the train: frontS = position of its leading end (our chainage), dir = +1 northbound / -1,
   * pose(s) → {x, y, z, yaw} on its track
   */
  place(frontS, dir, pose) {
    this.cars.forEach((g) => {
      const { L, off } = g.userData;
      // car index 0 is the north end: northbound it leads, southbound it trails
      const sN = dir > 0 ? frontS - off : frontS - dir * (this.length - off - L);   // north end of this car
      const sMid = sN - L / 2;
      const p = pose(sMid);
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(0, p.yaw, 0);
      // car-local +x = north; lay the car out from -L/2 .. L/2
      g.children[0].position.x = (g.children[0].rotation.y ? L : 0) - L / 2;
    });
  }

  /** white head lights at the leading end, red tail lights at the trailing end */
  setDir(dir) {
    for (const l of this.lamps) l.material = lampMat(l.userData.north ? dir < 0 : dir > 0);
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'SphereGeometry') o.geometry.dispose(); });
  }
}

// ---------------------------------------------------------------------------
// traffic
// ---------------------------------------------------------------------------
const OMIYA = 27640, UTSUNOMIYA = 105470;   // Shinkansen chainage of the stations every / some trains stop at

/** speed (km/h) at Shinkansen chainage ss for a set */
function speedAt(ss, set) {
  const acc = 0.45, dec = 0.7;                 // m/s²
  const toV = (d, a) => Math.sqrt(2 * a * Math.max(0, d)) * 3.6;
  let v = ss < OMIYA ? 125 : 275;
  v = Math.min(v, Math.max(25, toV(Math.abs(ss - OMIYA), ss < OMIYA ? dec : acc)));
  if (set.stopU) v = Math.min(v, Math.max(25, toV(Math.abs(ss - UTSUNOMIYA), dec)));
  else v = Math.min(v, 230);
  return Math.min(v, 275);
}

export class ShinkansenTraffic {
  constructor(scene, route, sound) {
    this.scene = scene;
    this.route = route;
    this.sound = sound;
    this.list = [];
    this.timer = 20 + Math.random() * 30;
    this.p = {};
  }

  /** is the Shinkansen in sight anywhere within dist of s? */
  near(s, dist) {
    for (let x = s - dist; x <= s + dist; x += 100) if (this.route.shinkansen(x)) return true;
    return false;
  }

  pick(ss) {
    const cands = SETS.filter((x) => (x.south ? ss < OMIYA : true));
    let w = cands.reduce((a, b) => a + b.w, 0) * Math.random();
    for (const c of cands) { w -= c.w; if (w <= 0) return c; }
    return cands[0];
  }

  spawn(camS) {
    const r = this.route;
    const dir = Math.random() < 0.5 ? 1 : -1;
    // start out of sight (2.5–4 km away) so it arrives at speed; overtakers come from behind
    const startS = camS - dir * (2500 + Math.random() * 1500);
    const sh = r.shinkansen(startS) || r.shinkansen(camS);
    const set = this.pick(sh ? sh.ss : camS);
    const tr = new ShinkansenSet(set);
    this.scene.add(tr.group);
    const voice = this.sound.addShinkansen ? this.sound.addShinkansen(tr.cars.length) : null;
    tr.setDir(dir);
    this.list.push({ tr, set, dir, s: startS, v: 0, voice, night: 0 });
  }

  update(dt, camS, night = 0) {
    const r = this.route;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 50 + Math.random() * 90;
      if (this.list.length < 3 && this.near(camS, 2500)) this.spawn(camS);
    }
    const p = this.p;
    for (const t of this.list) {
      const sh = r.shinkansen(t.s);
      const ss = sh ? sh.ss : null;
      const vt = ss != null ? speedAt(ss, t.set) : (t.v || 200);
      t.v += Math.max(-1.5, Math.min(1.0, vt - t.v));
      if (!t.v) t.v = vt;
      t.s += t.dir * (t.v / 3.6) * dt;
      const lane = t.dir > 0 ? 2.15 : -2.15;   // left-hand running on the double track
      const pose = (s) => {
        const q = r.shinkansen(s) || r.shinkansen(t.s) || { lat: 0, h: 9 };
        r.pose(s, q.lat + lane, p);
        return { x: p.x, y: -0.62 + q.h + 0.62 + 0.36, z: p.z, yaw: p.yaw };
      };
      t.tr.group.visible = !!sh;
      if (sh) t.tr.place(t.s, t.dir, pose);
      // lamps: white at the leading end, red at the trailing end
      if (t.night !== night) t.night = night;
      if (t.voice) {
        const ends = [t.s, t.s - t.dir * t.tr.length / 2, t.s - t.dir * t.tr.length].map((s) => { const q = pose(s); return { x: q.x, y: q.y + 1.5, z: q.z }; });
        t.voice.update(ends, sh ? t.v : 0);
      }
    }
    // gone: far away or out of the corridor
    this.list = this.list.filter((t) => {
      const far = Math.abs(t.s - camS) > 6500 || (t.dir > 0 ? t.s - t.tr.length > camS + 3500 : t.s + t.tr.length < camS - 3500);
      if (far) { t.tr.dispose(); if (t.voice) t.voice.dispose(); }
      return !far;
    });
  }

  clear() { for (const t of this.list) { t.tr.dispose(); if (t.voice) t.voice.dispose(); } this.list = []; }
}
