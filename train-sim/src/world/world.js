// Streams the scenery around the train in 200 m chunks.
import * as THREE from 'three';
import { stationProtos, PERSON_KEYS, SIT_KEYS, departureBoardTexture, clockTexture } from './people.js';
import { makeTextures } from './textures.js';
import { atmosphere, addWindowLights } from './atmosphere.js';
import { Environment, GROUND_Y } from './sky.js';
import { LandBuilder, MATERIAL_KEYS, carGeometry, carColor } from './land.js';
import { GeoBuffer, Frame, TILE, boxWalls, flatTop, solid } from './buildings.js';
import { makeTreeKinds } from './trees.js';
import { rng, hash2 } from './noise.js';

const CHUNK = 200;
const AHEAD = 2400;
const BEHIND = 400;
const FONT = '"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function stationSignTexture(st, prev, next, color = null) {
  // JR East style: white board, name in large type, line-colour band with neighbours
  return canvasTex(768, 288, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#111';
    g.font = `bold 96px ${FONT}`; g.fillText(st.name, w / 2, 112);
    g.font = `500 32px ${FONT}`; g.fillText(st.kana, w / 2, 42);
    g.font = `30px ${FONT}`; g.fillStyle = '#333'; g.fillText(st.en, w / 2, 176);
    if (color) { g.fillStyle = color; g.fillRect(0, 202, w, 24); }
    else { g.fillStyle = '#f68b1e'; g.fillRect(0, 202, w, 16); g.fillStyle = '#1e9645'; g.fillRect(0, 218, w, 8); }
    g.fillStyle = '#111'; g.font = `30px ${FONT}`;
    if (prev) { g.textAlign = 'left'; g.fillText('◀ ' + prev.name, 24, 256); }
    if (next) { g.textAlign = 'right'; g.fillText(next.name + ' ▶', w - 24, 256); }
    g.strokeStyle = '#9a9a9a'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }, false);
}

function textBoardTexture(text, bg, fg, w = 256, h = 256, size = 150) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${size}px ${FONT}`; g.fillText(text, w / 2, h / 2 + 6);
  }, false);
}

// departure boards of the other lines' platforms: [kind, colour, destination, cars] x 2
const BOARD_ROWS = {
  keihin: [['各駅停車', '#4cc4ff', '大宮', '10両'], ['各駅停車', '#4cc4ff', '大船', '10両']],
  yamanote: [['山手線', '#9fe060', '池袋・新宿方面', '11両'], ['山手線', '#9fe060', '東京・品川方面', '11両']],
  joban: [['快速', '#ff4a3a', '取手', '15両'], ['普通', '#ff9a1a', '土浦', '15両']],
  chuo: [['快速', '#ff4a3a', '高尾', '10両'], ['中央特快', '#4cc4ff', '青梅', '10両']],
  sobu: [['各駅停車', '#ffd400', '千葉', '10両'], ['各駅停車', '#ffd400', '三鷹', '10両']],
  yokosuka: [['快速', '#ff4a3a', '逗子', '15両'], ['普通', '#ff9a1a', '久里浜', '15両']],
  saikyo: [['各駅停車', '#4cff6a', '川越', '10両'], ['快速', '#ff4a3a', '新木場', '10両']],
  local: [['普通', '#ff9a1a', '籠原', '15両'], ['快速', '#ff4a3a', '宇都宮', '15両']],
  'tohoku-cargo': [['特別快速', '#ff4a3a', '小田原', '15両'], ['快速', '#ff4a3a', '高崎', '15両']],
  freight: [['湘南ライナー', '#4cc4ff', '小田原', '15両'], ['回送', '#ffd040', '', '15両']],
  'shin-tokaido': [['のぞみ', '#ffd040', '新大阪', '16両'], ['ひかり', '#ff6040', '名古屋', '16両']],
  'shin-tohoku': [['はやぶさ', '#4cff6a', '新函館北斗', '17両'], ['かがやき', '#ff9a1a', '金沢', '12両']],
};

/** sweeps 2D profiles along the route; the profile may change with s */
class Sweeper {
  constructor(route) { this.route = route; this.buckets = new Map(); }
  bucket(mat) {
    if (!this.buckets.has(mat)) this.buckets.set(mat, { pos: [], uv: [], idx: [] });
    return this.buckets.get(mat);
  }
  /** strips: [{ pts: [[lat,y],..] | (s)=>pts, mat, uScale, vScale, uFn }] ; y is relative to the rail top */
  sweep(s0, s1, step, offsetFn, strips, absY = false) {
    const r = this.route;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    const p = {};
    const samples = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (i / n);
      r.pose(s, 0, p);
      samples.push({ s, x: p.x, z: p.z, y: p.y, lx: p.lx, lz: p.lz, o: offsetFn(s) });
    }
    for (const strip of strips) {
      const B = this.bucket(strip.mat);
      const base = B.pos.length / 3;
      let cols = 0;
      for (const sm of samples) {
        const pts = typeof strip.pts === 'function' ? strip.pts(sm.s) : strip.pts;
        cols = pts.length;
        let acc = 0;
        for (let j = 0; j < cols; j++) {
          if (j) acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
          const lat = sm.o + pts[j][0];
          const y = absY && strip.abs && strip.abs[j] ? pts[j][1] : sm.y + pts[j][1];
          B.pos.push(sm.x + sm.lx * lat, y, sm.z + sm.lz * lat);
          const u = strip.uFn ? strip.uFn(j, pts) : acc / (strip.uScale || 1);
          B.uv.push(u, sm.s / (strip.vScale || 4));
        }
      }
      for (let i = 0; i < samples.length - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a = base + i * cols + j, b = base + (i + 1) * cols + j;
          B.idx.push(a, b + 1, a + 1, a, b, b + 1);
        }
      }
    }
  }
  build(group, disposables, cast = false) {
    for (const [mat, B] of this.buckets) {
      if (!B.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setIndex(B.idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = cast;
      group.add(m);
      disposables.push(g);
    }
  }
}

function extractParts(node) {
  const parts = [];
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  node.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push({ geometry: g, material: o.material });
  });
  return parts;
}

class InstanceBatch {
  constructor() { this.items = new Map(); }
  add(key, matrix, color) {
    if (!this.items.has(key)) this.items.set(key, { m: [], c: [] });
    const it = this.items.get(key);
    it.m.push(matrix.clone());
    it.c.push(color || null);
  }
  build(group, protos, cast = true) {
    const out = [];
    for (const [key, it] of this.items) {
      const parts = protos[key];
      if (!parts || !it.m.length) continue;
      for (const p of parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, it.m.length);
        it.m.forEach((m, i) => im.setMatrixAt(i, m));
        if (!p.noColor && it.c.some((c) => c)) it.c.forEach((c, i) => im.setColorAt(i, c || new THREE.Color(1, 1, 1)));
        im.castShadow = cast && !p.noShadow;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        group.add(im);
        out.push(im);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
export class World {
  constructor(renderer, scene, route, envGltf, quality = 'high', atmo = atmosphere()) {
    this.scene = scene;
    this.route = route;
    this.quality = quality;
    this.atmo = atmo;
    // shared "lights on" uniforms (lit windows, platform lamps)
    this.lightsU = { night: { value: atmo.night }, lit: { value: atmo.lit } };
    this.T = makeTextures();
    this.env = new Environment(renderer, scene, this.T, quality, atmo);
    this.chunks = new Map();
    this.stations = new Map();
    this.rivers = new Map();
    this.queue = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this.land = new LandBuilder(this);
    this.crossings = [];
    this.carAgents = [];
    this.time = 0;
    this.initMaterials();
    this.initProtos(envGltf);
    this.initMovingCars();
  }

  initMaterials() {
    const T = this.T;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
    const platformTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#a7a59f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},0,0.04)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#ebebe6'; g.fillRect(0, 0, w * 0.04, h);
      g.fillStyle = '#d9b51a'; g.fillRect(w * 0.20, 0, w * 0.075, h);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < h; y += 8) for (let x = w * 0.20; x < w * 0.275; x += 8) g.fillRect(x + 2, y + 2, 3, 3);
      g.fillStyle = 'rgba(0,0,0,0.07)'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 2);
      for (let x = w * 0.3; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(x, 0, 1, h); }
    });
    const fenceTex = canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(70,95,80,0.9)'; g.lineWidth = 1.4;
      for (let k = -64; k < 128; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
      g.fillStyle = 'rgba(60,80,70,1)'; g.fillRect(0, 0, 64, 3);
    });
    this.M = {
      ballast: std({ map: rep(T.ballast, 1, 1), normalMap: T.ballastN, roughness: 1, color: 0xd0ccc4 }),
      sleeper: std({ map: T.concrete, color: 0xb4b0a8, roughness: 0.9 }),
      sleeperWood: std({ color: 0x4a3a2c, roughness: 0.9 }),
      rail: std({ color: 0x5b4434, roughness: 0.75, metalness: 0.3 }),
      railTop: std({ color: 0xd8dde0, roughness: 0.18, metalness: 1.0 }),
      pfTop: std({ map: platformTex, roughness: 0.85, side: THREE.DoubleSide }),
      pfSide: std({ map: T.concrete, color: 0x9a968e, roughness: 0.95, side: THREE.DoubleSide }),
      concrete: std({ map: T.concrete, color: 0xc8c4bc, roughness: 0.92, side: THREE.DoubleSide }),
      embank: std({ map: T.grass, normalMap: T.grassN, color: 0xc8d4b0, roughness: 1, side: THREE.DoubleSide }),
      steel: std({ color: 0x6d7c84, roughness: 0.55, metalness: 0.55 }),
      girder: std({ color: 0x7a858b, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
      water: std({ color: 0x3a4a3c, roughness: 0.12, metalness: 0.0, normalMap: T.waterN, envMapIntensity: 0.75 }),
      wire: new THREE.LineBasicMaterial({ color: 0x252525 }),
      wireFeeder: new THREE.LineBasicMaterial({ color: 0x3a3a3a }),
      fence: std({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
      post: std({ color: 0x9a9a9a, roughness: 0.6, metalness: 0.4 }),
      // land buffers
      house: std({ map: T.facadeHouse, normalMap: T.facadeHouse.n, vertexColors: true, roughness: 0.85 }),
      apt: std({ map: T.facadeApt, normalMap: T.facadeApt.n, vertexColors: true, roughness: 0.8 }),
      mansion: std({ map: T.facadeMansion, normalMap: T.facadeMansion.n, vertexColors: true, roughness: 0.7 }),
      office: std({ map: T.facadeOffice, vertexColors: true, roughness: 0.15, metalness: 0.4 }),
      shop: std({ map: T.facadeShop, vertexColors: true, roughness: 0.6 }),
      factory: std({ map: T.facadeFactory, vertexColors: true, roughness: 0.55, metalness: 0.3 }),
      roofTile: std({ map: T.roofTile, normalMap: T.roofTileN, vertexColors: true, roughness: 0.75 }),
      roofMetal: std({ map: T.roofMetal, vertexColors: true, roughness: 0.5, metalness: 0.4 }),
      plain: std({ vertexColors: true, roughness: 0.85 }),
      glass: std({ vertexColors: true, roughness: 0.3, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
      paddy: std({ map: T.paddy, normalMap: T.paddyN, vertexColors: true, roughness: 0.35, metalness: 0.0 }),
      field: std({ map: T.field, vertexColors: true, roughness: 1 }),
      dirt: std({ map: T.grass, vertexColors: true, roughness: 1 }),
      road: std({ map: T.road, roughness: 0.92 }),
      asphalt: std({ map: T.asphalt, vertexColors: true, roughness: 0.92 }),
      levee: std({ map: T.grass, vertexColors: true, roughness: 1 }),
      far: std({ vertexColors: true, roughness: 0.9 }),
      carBody: std({ vertexColors: true, roughness: 0.25, metalness: 0.6 }),
      sign: std({ map: T.signs, roughness: 0.45, emissive: 0xffffff, emissiveMap: T.signs, emissiveIntensity: 0.12, side: THREE.DoubleSide }),
    };
    this.M.water.normalScale.set(0.35, 0.35);
    this.applyAtmosphere();
    for (const k of MATERIAL_KEYS) if (!this.M[k]) console.warn('missing material', k);
    this.M.dirt.map = T.soil;
    // volumetric trees: leaf-cluster cards around a trunk (see trees.js)
    this.treeKinds = makeTreeKinds();
    this.sleeperGeo = new THREE.BoxGeometry(0.24, 0.19, 2.0);
    this.sleeperGeo.translate(0, -0.25, 0);
    this.fastenerGeo = new THREE.BoxGeometry(0.16, 0.06, 0.12);
    this.carGeo = carGeometry();
  }

  /** lit windows after dark, wet surfaces in the rain, lamps on the platforms */
  applyAtmosphere() {
    const A = this.atmo, M = this.M, T = this.T;
    const lum = (r, g, b) => (r + g + b) / 3;
    if (A.night > 0) {
      const shared = this.lightsU;
      addWindowLights(M.house, T.facadeHouse, { bays: 4, shared, isWindow: (r, g, b) => b >= r + 6 && lum(r, g, b) < 135 });
      addWindowLights(M.apt, T.facadeApt, { bays: 2, shared, isWindow: (r, g, b) => b >= r + 6 && lum(r, g, b) < 135 });
      addWindowLights(M.mansion, T.facadeMansion, { bays: 2, shared, isWindow: (r, g, b) => b >= r + 6 && lum(r, g, b) < 150 });
      addWindowLights(M.office, T.facadeOffice, { bays: 4, shared, isWindow: (r, g, b) => b >= r + 15 && lum(r, g, b) < 170 });
      addWindowLights(M.shop, T.facadeShop, { bays: 4, shared, isWindow: (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 45 && lum(r, g, b) > 55 && lum(r, g, b) < 200 });
      // lit platforms (fluorescent lamps under the canopies) and glowing sign boards
      M.pfTop.emissive = new THREE.Color(0xfff4e0);
      M.pfTop.emissiveMap = M.pfTop.map;
      M.pfTop.emissiveIntensity = 0.08 * A.night;
      M.sign.emissiveIntensity = 0.12 + 0.6 * A.night;
    }
    if (A.rain) {
      // wet: darker and glossy (puddles on asphalt and platforms)
      for (const k of ['road', 'asphalt', 'pfTop', 'pfSide', 'concrete', 'roofTile', 'roofMetal', 'plain', 'house', 'apt', 'mansion', 'shop', 'factory', 'carBody', 'sleeper', 'ballast', 'embank', 'levee', 'dirt']) {
        const m = M[k]; if (!m) continue;
        m.roughness = Math.max(0.12, m.roughness * (k === 'road' || k === 'asphalt' || k === 'pfTop' ? 0.35 : 0.6));
        m.color.multiplyScalar(k === 'ballast' || k === 'sleeper' ? 0.72 : 0.85);
      }
      M.railTop.roughness = 0.1;
      if (this.env.ground) { this.env.ground.material.roughness = 0.55; this.env.ground.material.color.multiplyScalar(0.85); }
    }
  }

  initProtos(gltf) {
    this.P = {};
    for (const name of ['catenary_gate', 'platform_roof', 'bench', 'vending_machine', 'signal', 'stop_post', 'utility_pole']) {
      const node = gltf.scene.getObjectByName(name);
      if (node) this.P[name] = extractParts(node);
    }
    for (const p of this.P.signal || []) {
      if (p.material.name === 'SIG_G') { p.material = p.material.clone(); p.material.emissiveIntensity = 4; }
    }
    Object.assign(this.P, stationProtos());
    this.P.sleeper = [{ geometry: this.sleeperGeo, material: this.M.sleeper, noShadow: true }];
    this.P.sleeperWood = [{ geometry: this.sleeperGeo, material: this.M.sleeperWood, noShadow: true }];
    this.P.fastener = [{ geometry: this.fastenerGeo, material: this.M.rail, noShadow: true }];
    this.P.car = [{ geometry: this.carGeo, material: this.M.carBody }];
    const pierGeo = new THREE.BoxGeometry(1, 1, 1); pierGeo.translate(0, 0.5, 0);
    this.P.pier = [{ geometry: pierGeo, material: this.M.concrete }];
    for (const [k, parts] of Object.entries(this.treeKinds)) this.P['tree_' + k] = parts;
  }

  initMovingCars() {
    this.movingCars = new THREE.InstancedMesh(this.carGeo, this.M.carBody, 240);
    this.movingCars.count = 0;
    this.movingCars.castShadow = true;
    this.movingCars.frustumCulled = false;
    this.movingCars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.scene.add(this.movingCars);
  }

  // -------------------------------------------------------------------------
  update(s, budget = 1) {
    const r = this.route;
    // build far ahead in the running direction (dir = -1 for up trains), a little behind
    const ahead = this.dir < 0 ? BEHIND : AHEAD, behind = this.dir < 0 ? AHEAD : BEHIND;
    const first = Math.floor((s - behind) / CHUNK);
    const last = Math.floor((s + ahead) / CHUNK);
    for (let k = first; k <= last; k++) {
      if (!this.chunks.has(k) && !this.queue.includes(k) && k * CHUNK > r.sMin && k * CHUNK < r.sMax) this.queue.push(k);
    }
    this.queue.sort((a, b) => Math.abs(a * CHUNK - s) - Math.abs(b * CHUNK - s));
    for (let i = 0; i < budget && this.queue.length; i++) {
      const k = this.queue.shift();
      if (k < first || k > last) continue;
      this.chunks.set(k, this.buildChunk(k));
    }
    for (const [k, ch] of this.chunks) {
      if (k < first - 1 || k > last + 1) { this.disposeChunk(ch); this.chunks.delete(k); }
    }
    for (const si of r.sites) {
      const near = si.mid + 260 > s - behind - 50 && si.mid - 260 < s + ahead;
      if (near && !this.stations.has(si.name)) this.stations.set(si.name, this.buildStation(si));
      else if (!near && this.stations.has(si.name)) { this.disposeChunk(this.stations.get(si.name)); this.stations.delete(si.name); }
    }
    for (const rv of this.route.rivers) {
      const near = rv.s1 > s - behind - 200 && rv.s0 < s + ahead + 800;
      if (near && !this.rivers.has(rv.name)) this.rivers.set(rv.name, this.buildRiver(rv));
      else if (!near && this.rivers.has(rv.name)) { this.disposeChunk(this.rivers.get(rv.name)); this.rivers.delete(rv.name); }
    }
  }

  preload(s) {
    this.env.urban.value = Math.min(1, Math.max(0, (this.route.density(s) - 0.3) / 0.5));
    this.update(s, 0);
    while (this.queue.length) this.update(s, 4);
  }

  disposeChunk(ch) {
    ch.group.removeFromParent();
    for (const g of ch.disposables) g.dispose();
    for (const im of ch.instanced) im.dispose();
    for (const t of ch.textures || []) t.dispose();
    for (const m of ch.materials || []) m.dispose();
    if (ch.crossings) this.crossings = this.crossings.filter((c) => !ch.crossings.includes(c));
    if (ch.agents) this.carAgents = this.carAgents.filter((a) => !ch.agents.includes(a));
  }

  dispose() {
    for (const ch of this.chunks.values()) this.disposeChunk(ch);
    for (const ch of this.stations.values()) this.disposeChunk(ch);
    for (const ch of this.rivers.values()) this.disposeChunk(ch);
    this.root.removeFromParent();
    this.movingCars.removeFromParent();
    this.env.dispose();
  }

  updateFixed(camPos, s) {
    this.env.follow(camPos);
    if (s !== undefined) this.env.setUrban(Math.min(1, Math.max(0, (this.route.density(s) - 0.3) / 0.5)));
  }

  /** every track in [a, b]: ours, then the parallel lines (with the stretch each one has track on) */
  tracksIn(a, b) { return this.route.layout.tracksIn(a, b); }

  /** lateral extent of all tracks at s */
  trackSpan(s) {
    const r = this.route;
    const sp = r.span(s);
    return { min: sp.min - 2.2, max: sp.max + 2.2 };
  }

  buildChunk(k) {
    const r = this.route;
    const s0 = k * CHUNK, s1 = s0 + CHUNK;
    const group = new THREE.Group();
    const disposables = [];
    const sw = new Sweeper(r);
    const batch = new InstanceBatch();
    const tracks = this.tracksIn(s0, s1);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const p = {};
    const place = (key, s, lat, yRel = 0, yawExtra = 0, scale = null, color = null, absY = null) => {
      r.pose(s, lat, p);
      Q.setFromAxisAngle(Y, p.yaw + yawExtra);
      V.set(p.x, absY !== null ? absY : p.y + yRel, p.z);
      M4.compose(V, Q, scale || S1);
      batch.add(key, M4, color);
    };

    // split the chunk into runs: open-deck bridge vs ballasted track
    const runs = [];
    for (let s = s0; s < s1; s += 10) {
      const type = r.structureAt(s + 5).type;
      const bridge = type === 'bridge';
      if (runs.length && runs[runs.length - 1].bridge === bridge) runs[runs.length - 1].s1 = s + 10;
      else runs.push({ s0: s, s1: s + 10, bridge });
    }

    for (const t of tracks) {
      for (const full of runs) {
        const run = { bridge: full.bridge, s0: Math.max(full.s0, t.s0), s1: Math.min(full.s1, t.s1) };
        if (run.s1 - run.s0 < 1) continue;
        if (!run.bridge) {
          sw.sweep(run.s0, run.s1, 5, t.off, [{ pts: [[-2.4, -0.62], [-1.5, -0.27], [1.5, -0.27], [2.4, -0.62]], mat: this.M.ballast, uScale: 2.2, vScale: 2.2 }]);
        }
        for (const g of [-0.5335, 0.5335]) {
          sw.sweep(run.s0, run.s1, 5, t.off, [
            { pts: [[g - 0.065, -0.17], [g - 0.065, -0.155], [g - 0.01, -0.13], [g - 0.032, -0.012]], mat: this.M.rail },
            { pts: [[g + 0.032, -0.012], [g + 0.01, -0.13], [g + 0.065, -0.155], [g + 0.065, -0.17]], mat: this.M.rail },
            { pts: [[g - 0.032, 0], [g + 0.032, 0]], mat: this.M.railTop },
          ]);
        }
        for (let s = Math.ceil(run.s0 / 0.6) * 0.6; s < run.s1; s += 0.6) {
          place(run.bridge ? 'sleeperWood' : 'sleeper', s, t.off(s));
          if (!run.bridge && this.quality !== 'low') {
            place('fastener', s, t.off(s) + 0.62, -0.13);
            place('fastener', s, t.off(s) - 0.62, -0.13);
          }
        }
      }
    }

    // buffer stops (車止め) where station tracks end
    for (const t of tracks) {
      const sb = t.stopAt === 's0' ? t.s0 : t.stopAt === 's1' ? t.s1 : null;
      if (sb == null || sb < s0 || sb >= s1) continue;
      const dir = t.stopAt === 's0' ? 1 : -1;
      r.pose(sb + dir * 0.6, t.off(sb), p);
      const m = new THREE.Mesh(this.bufferGeo || (this.bufferGeo = new THREE.BoxGeometry(1.0, 1.1, 2.2)), this.M.bufferStop || (this.M.bufferStop = new THREE.MeshStandardMaterial({ color: 0xc8b23a, roughness: 0.6 })));
      m.position.set(p.x, p.y + 0.4, p.z); m.rotation.y = p.yaw; m.castShadow = true;
      group.add(m);
    }

    // structures under the track: embankment / viaduct deck + piers (bridges: see buildRiver)
    for (let s = s0; s < s1; s += 10) {
      const st = r.structureAt(s + 5);
      const h = r.elev(s + 5);
      if (st.type === 'embankment') {
        sw.sweep(s, s + 10, 5, () => 0, [{
          pts: (ss) => {
            const sp = this.trackSpan(ss), hh = r.elev(ss);
            const top = -0.62, foot = GROUND_Y - hh;
            return [[sp.max + 1.2 + hh * 1.5, foot], [sp.max + 1.2, top], [sp.min - 1.2, top], [sp.min - 1.2 - hh * 1.5, foot]];
          },
          mat: this.M.embank, uScale: 9, vScale: 9,
        }]);
      } else if (st.type === 'viaduct' && h > 1) {
        const pf = r.stationNear(s + 5, 30);
        // (the platforms are part of the track span)
        const widen = () => 0;
        void pf;
        sw.sweep(s, s + 10, 5, () => 0, [
          { pts: (ss) => { const sp = this.trackSpan(ss); const L = sp.max + 1.6 + widen(ss, 1), Rr = sp.min - 1.6 - widen(ss, -1); return [[L, -1.9], [L, -0.62], [L + 0.25, -0.62], [L + 0.25, 0.75], [L + 0.05, 0.75], [L + 0.05, -0.62]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
          { pts: (ss) => { const sp = this.trackSpan(ss); const Rr = sp.min - 1.6 - widen(ss, -1); return [[Rr - 0.05, -0.62], [Rr - 0.05, 0.75], [Rr - 0.25, 0.75], [Rr - 0.25, -0.62], [Rr, -0.62], [Rr, -1.9]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
          { pts: (ss) => { const sp = this.trackSpan(ss); const L = sp.max + 1.6 + widen(ss, 1), Rr = sp.min - 1.6 - widen(ss, -1); return [[Rr, -1.9], [L, -1.9]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
          { pts: (ss) => { const sp = this.trackSpan(ss); const L = sp.max + 1.6 + widen(ss, 1), Rr = sp.min - 1.6 - widen(ss, -1); return [[L, -0.62], [Rr, -0.62]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
        ]);
        // piers every 12 m: wide rigid-frame columns
        if (Math.floor(s / 12) !== Math.floor((s + 10) / 12)) {
          const ps = Math.floor((s + 10) / 12) * 12;
          const sp = this.trackSpan(ps), hh = r.elev(ps);
          const mid = (sp.max + sp.min) / 2, w = sp.max - sp.min;
          for (const f of [-0.42, 0.42]) {
            place('pier', ps, mid + f * w, 0, 0, new THREE.Vector3(1.4, hh - 1.9 - GROUND_Y + 0.0, 1.4), null, GROUND_Y);
          }
          place('pier', ps, mid, 0, 0, new THREE.Vector3(1.2, 1.4, w + 2), null, GROUND_Y + hh - 1.9 - 1.4 + 0.62);
        }
      }
    }

    // catenary gates every 50 m (not on truss spans) and wires
    for (let s = Math.ceil(s0 / 50) * 50; s < s1; s += 50) {
      if (r.structureAt(s).type === 'bridge') continue;
      const up = r.upOffset(s);
      if (-up < 4.6) place('catenary_gate', s, up / 2);
      else {
        place('catenary_gate', s, 0, 0, 0, new THREE.Vector3(1, 1, 0.55));
        place('catenary_gate', s, up, 0, 0, new THREE.Vector3(1, 1, 0.55));
      }
      for (const t of tracks) {
        if (t.kind === 'ours' || s < t.s0 || s > t.s1 || t.siding) continue;
        // a pair of a parallel line under one gate; station tracks and the extra island tracks each get their own
        if (t.kind === 'group' && t.i === 1) continue;
        if (t.kind === 'group' && t.i === 0) {
          const o1 = r.parallelOffset(t.group, 1, s), o0 = t.off(s);
          if (Math.abs(o1 - o0) < 4.6) { place('catenary_gate', s, (o0 + o1) / 2); continue; }
          place('catenary_gate', s, o0, 0, 0, new THREE.Vector3(1, 1, 0.55));
          place('catenary_gate', s, o1, 0, 0, new THREE.Vector3(1, 1, 0.55));
          continue;
        }
        place('catenary_gate', s, t.off(s), 0, 0, new THREE.Vector3(1, 1, 0.55));
      }
    }
    const wirePts = [], feederPts = [];
    for (const t of tracks) {
      let prev = null;
      for (let s = s0; s <= s1; s += 10) {
        if (s < t.s0 || s > t.s1) { prev = null; continue; }
        const zig = ((Math.floor(s / 50) % 2 === 0 ? 1 : -1) * (1 - 2 * ((s % 50) / 50))) * 0.2;
        r.pose(s, t.off(s) + zig, p);
        const c = new THREE.Vector3(p.x, p.y + 5.1, p.z);
        r.pose(s, t.off(s), p);
        const m = new THREE.Vector3(p.x, p.y + 6.05 - 0.25 * Math.sin(Math.PI * (s % 50) / 50), p.z);
        if (prev) wirePts.push(prev.c, c, prev.m, m);
        wirePts.push(c, m);
        prev = { c, m };
      }
    }
    // feeder lines along the gate tops
    for (const lat of [4.0, -7.6]) {
      let prev = null;
      for (let s = s0; s <= s1; s += 10) {
        r.pose(s, lat, p);
        const v = new THREE.Vector3(p.x, p.y + 7.9 - 0.5 * Math.sin(Math.PI * (s % 50) / 50), p.z);
        if (prev) feederPts.push(prev, v);
        prev = v;
      }
    }
    const wg = new THREE.BufferGeometry().setFromPoints(wirePts);
    const fg = new THREE.BufferGeometry().setFromPoints(feederPts);
    group.add(new THREE.LineSegments(wg, this.M.wire), new THREE.LineSegments(fg, this.M.wireFeeder));
    disposables.push(wg, fg);

    // trackside: speed signs, fences / sound walls (block signals with live aspects: src/signals.js)
    for (const L of r.limits) {
      if (L.s0 >= s0 && L.s0 < s1 && L.v < 120) this.speedSign(group, disposables, L.s0 - 30, L.v);
    }
    const dens = r.density(s0 + 100);
    if (r.elev(s0 + 100) < 0.3 && !r.stationNear(s0 + 100, 40)) {
      for (const side of [1, -1]) {
        const off = (ss) => side > 0 ? this.land.edge(ss, 1) - 1.0 : -(this.land.edge(ss, -1) - 1.0);
        if (dens > 0.78) {
          sw.sweep(s0, s1, 10, off, [{ pts: [[0, -0.62], [0, 2.0]], mat: this.M.concrete, uScale: 4, vScale: 4 }]);
        } else if (dens > 0.3) {
          sw.sweep(s0, s1, 10, off, [{ pts: [[0, -0.62], [0, 1.1]], mat: this.M.fence, uScale: 1.7, vScale: 1.7 }]);
        }
      }
    }

    // the 東北新幹線 viaduct beside us: deck, sound walls, slab track, piers and catenary masts
    {
      let a0 = null;
      const flush = (a, b) => {
        if (b - a < 5) return;
        const lat = (ss) => (r.shinkansen(ss) || { lat: 0 }).lat;
        const H = (ss) => (r.shinkansen(ss) || { h: 9 }).h - r.elev(ss) + GROUND_Y + 0.62;
        sw.sweep(a, b, 5, lat, [
          { pts: (ss) => { const h = H(ss); return [[5.9, h + 1.9], [5.9, h - 1.4]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
          { pts: (ss) => { const h = H(ss); return [[5.9, h - 1.4], [-5.9, h - 1.4]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
          { pts: (ss) => { const h = H(ss); return [[-5.9, h - 1.4], [-5.9, h + 1.9]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
          { pts: (ss) => { const h = H(ss); return [[5.9, h + 1.9], [5.6, h + 1.9], [5.6, h], [-5.6, h], [-5.6, h + 1.9], [-5.9, h + 1.9]]; }, mat: this.M.concrete, uScale: 6, vScale: 6 },
        ]);
        for (const g of [-2.15, 2.15]) {
          sw.sweep(a, b, 5, lat, [
            { pts: (ss) => { const h = H(ss); return [[g - 1.25, h + 0.01], [g - 1.15, h + 0.2], [g + 1.15, h + 0.2], [g + 1.25, h + 0.01]]; }, mat: this.M.concrete, uScale: 4, vScale: 4 },
            { pts: (ss) => { const h = H(ss); return [[g - 0.75, h + 0.2], [g - 0.75, h + 0.36], [g - 0.69, h + 0.36], [g - 0.69, h + 0.2]]; }, mat: this.M.rail },
            { pts: (ss) => { const h = H(ss); return [[g + 0.69, h + 0.2], [g + 0.69, h + 0.36], [g + 0.75, h + 0.36], [g + 0.75, h + 0.2]]; }, mat: this.M.rail },
          ]);
        }
        for (let ps = Math.ceil(a / 25) * 25; ps < b; ps += 25) {
          const sh = r.shinkansen(ps); if (!sh) continue;
          place('pier', ps, sh.lat, 0, 0, new THREE.Vector3(2.4, sh.h - 1.4 - GROUND_Y, 5.2), null, GROUND_Y);
          if (ps % 50 === 0) place('pier', ps, sh.lat + 5.75, 0, 0, new THREE.Vector3(0.35, 8.2, 0.35), null, GROUND_Y + sh.h + 0.62);
        }
      };
      for (let s = s0; s <= s1; s += 5) {
        const on = s < s1 && !!r.shinkansen(s);
        if (on && a0 === null) a0 = s;
        if ((!on || s === s1) && a0 !== null) { flush(a0, Math.min(s, s1)); a0 = null; }
      }
    }

    // land use beside the line
    const B = {};
    for (const key of ['house', 'apt', 'mansion', 'office', 'shop', 'factory', 'roofTile', 'roofMetal', 'concrete', 'plain', 'glass', 'sign', 'paddy', 'field', 'road', 'asphalt', 'levee', 'far', 'dirt']) B[key] = new GeoBuffer();
    const inst = { trees: [], cars: [], poles: [], roadsPar: [], crossRoads: [] };
    const R = rng(k * 31 + 7);
    const roads = this.land.build(k, s0, s1, B, inst);
    for (const [key, buf] of Object.entries(B)) {
      if (buf.empty) continue;
      const g = buf.build();
      const mesh = new THREE.Mesh(g, key === 'concrete' ? this.M.concreteV || (this.M.concreteV = new THREE.MeshStandardMaterial({ map: this.T.concrete, vertexColors: true, roughness: 0.9 })) : this.M[key]);
      mesh.castShadow = !['paddy', 'field', 'road', 'asphalt', 'dirt', 'levee', 'far'].includes(key);
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(g);
    }
    const col = new THREE.Color();
    for (const t of inst.trees) {
      Q.setFromAxisAngle(Y, t.rot);
      V.set(t.x, GROUND_Y, t.z);
      M4.compose(V, Q, t.sx ? new THREE.Vector3(t.sx, t.sy, t.sz) : new THREE.Vector3(t.s, t.s * (0.85 + (t.s % 0.3)), t.s));
      col.setHSL(0.24 + (Math.abs(t.x) % 7) * 0.006, 0.25, 0.42 + (Math.abs(t.z) % 5) * 0.02);
      batch.add('tree_' + t.kind, M4, col.clone().multiplyScalar(2.2));
    }
    for (const c of inst.cars) {
      Q.setFromAxisAngle(Y, c.yaw);
      V.set(c.x, 0, c.z);
      M4.compose(V, Q, S1);
      batch.add('car', M4, new THREE.Color(...c.color));
    }
    const polePts = [];
    let lastPole = null;
    for (const pl of inst.poles) {
      Q.setFromAxisAngle(Y, pl.yaw);
      V.set(pl.x, GROUND_Y, pl.z);
      M4.compose(V, Q, new THREE.Vector3(1, 0.95, 1));
      batch.add('utility_pole', M4);
      if (lastPole && Math.hypot(lastPole.x - pl.x, lastPole.z - pl.z) < 60) {
        for (const [dy, dl] of [[9.6, -0.6], [9.6, 0.6], [8.8, 0.0]]) {
          const n = 6;
          for (let i = 0; i < n; i++) {
            const t0 = i / n, t1 = (i + 1) / n;
            const sag = (t) => -1.2 * 4 * t * (1 - t) * 0.35;
            const P = (t) => new THREE.Vector3(lastPole.x + (pl.x - lastPole.x) * t + Math.cos(pl.yaw + Math.PI / 2) * dl, GROUND_Y + dy + sag(t), lastPole.z + (pl.z - lastPole.z) * t - Math.sin(pl.yaw + Math.PI / 2) * dl);
            polePts.push(P(t0), P(t1));
          }
        }
      }
      lastPole = pl;
    }
    if (polePts.length) {
      const pg = new THREE.BufferGeometry().setFromPoints(polePts);
      group.add(new THREE.LineSegments(pg, this.M.wire));
      disposables.push(pg);
    }
    // level crossings + cars driving across
    const crossings = [], agents = [];
    for (const rd of inst.crossRoads) {
      if (rd.level) crossings.push(this.buildCrossing(group, disposables, rd));
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        agents.push({ rd, l: (R() * 2 - 1) * 380, dir: R() < 0.5 ? 1 : -1, v: 9 + R() * 6, color: new THREE.Color(...carColor(R)) });
      }
    }
    for (const rp of inst.roadsPar) {
      const n = Math.floor(R() * 2);
      for (let i = 0; i < n; i++) agents.push({ par: rp, s: rp.s0 + R() * 200, dir: R() < 0.5 ? 1 : -1, v: 10 + R() * 5, color: new THREE.Color(...carColor(R)) });
    }
    this.crossings.push(...crossings);
    this.carAgents.push(...agents);
    void roads;

    sw.build(group, disposables);
    const instanced = batch.build(group, this.P);
    this.root.add(group);
    return { group, disposables, instanced, textures: group.userData.textures || [], materials: group.userData.materials || [], crossings, agents };
  }

  speedSign(group, disposables, s, v) {
    const r = this.route, p = {};
    const tex = textBoardTexture(String(v), '#f2f2ec', '#111', 128, 128, 70);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), mat);
    r.pose(s, 2.9, p);
    board.position.set(p.x, p.y + 2.6, p.z);
    board.rotation.y = p.yaw - Math.PI / 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6), this.M.post);
    pole.position.set(p.x, p.y + 1.0, p.z);
    group.add(board, pole);
    disposables.push(board.geometry, pole.geometry);
    (group.userData.textures ||= []).push(tex);
    (group.userData.materials ||= []).push(mat);
  }

  // -------------------------------------------------------------------------
  /** 踏切: road deck over the rails, barriers, warning lights */
  buildCrossing(group, disposables, rd) {
    const r = this.route;
    const p0 = r.pose(rd.s, 0, {});
    const span = this.trackSpan(rd.s);
    const xg = new THREE.Group();
    xg.position.set(p0.x, GROUND_Y, p0.z);
    xg.rotation.y = p0.yaw;
    // in this group: +x along the track, -z = left (track lateral +)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(rd.w, 0.06, span.max - span.min + 3), this.M.concrete);
    deck.position.set(0, 0.62 - 0.02, -(span.max + span.min) / 2);
    xg.add(deck);
    disposables.push(deck.geometry);
    const stripe = canvasTex(64, 16, (g) => { for (let i = 0; i < 64; i += 16) { g.fillStyle = '#f2c400'; g.fillRect(i, 0, 8, 16); g.fillStyle = '#111'; g.fillRect(i + 8, 0, 8, 16); } });
    stripe.repeat.set(6, 1);
    const armMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 });
    const xsignTex = canvasTex(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      g.translate(64, 64);
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        g.save(); g.rotate(a);
        for (let k = -60; k < 60; k += 20) { g.fillStyle = '#f2c400'; g.fillRect(k, -9, 10, 18); g.fillStyle = '#111'; g.fillRect(k + 10, -9, 10, 18); }
        g.restore();
      }
    }, false);
    const xsignMat = new THREE.MeshStandardMaterial({ map: xsignTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    const lampOn = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a0a, emissiveIntensity: 0 });
    const lampOn2 = lampOn.clone();
    const poleMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 });
    const arms = [], lamps = [lampOn, lampOn2];
    for (const side of [1, -1]) {          // both sides of the railway
      const zEdge = side > 0 ? -(span.max + 2.2) : -(span.min - 2.2);
      for (const lane of [-1, 1]) {
        const x = lane * (rd.w / 2 + 0.6);
        if (lane === side) {
          // warning post with X sign and two lamps
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8), poleMat);
          post.position.set(x, 1.8, zEdge);
          const xs = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), xsignMat);
          xs.position.set(x, 3.4, zEdge);
          xs.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.9), this.M.post);
          bar.position.set(x, 2.55, zEdge);
          xg.add(post, xs, bar);
          disposables.push(post.geometry, xs.geometry, bar.geometry);
          for (const [dz, m] of [[-0.32, lampOn], [0.32, lampOn2]]) {
            const L = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 14), m);
            L.rotation.z = Math.PI / 2;
            L.position.set(x + (side > 0 ? 0.08 : -0.08) * 0, 2.55, zEdge + dz);
            L.rotation.set(0, 0, Math.PI / 2);
            const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            hood.rotation.set(0, 0, Math.PI / 2);
            hood.position.copy(L.position);
            xg.add(L, hood);
            disposables.push(L.geometry, hood.geometry);
          }
          // barrier machine + arm across the lane
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), poleMat);
          box.position.set(x, 0.45 + 0.62, zEdge - side * 0.6);
          const pivot = new THREE.Group();
          pivot.position.set(x, 1.1 + 0.62, zEdge - side * 0.6);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(rd.w * 0.95, 0.07, 0.07), armMat);
          arm.position.set(-lane * rd.w * 0.475, 0, 0);
          pivot.add(arm);
          xg.add(box, pivot);
          disposables.push(box.geometry, arm.geometry);
          arms.push({ pivot, lane });
        }
      }
    }
    group.add(xg);
    (group.userData.materials ||= []).push(armMat, xsignMat, lampOn, lampOn2, poleMat);
    (group.userData.textures ||= []).push(stripe, xsignTex);
    return { s: rd.s, rd, arms, lamps, angle: 1, active: false };
  }

  /** per-frame: crossings + moving cars. trains = [{ front, len, dir }] */
  animate(dt, trains, camPos) {
    this.time += dt;
    this.M.water.normalMap.offset.x = (this.time * 0.01) % 1;
    this.M.water.normalMap.offset.y = (this.time * 0.006) % 1;
    let nearest = Infinity;
    for (const c of this.crossings) {
      let active = false;
      for (const t of trains) {
        if (t.dir > 0 && t.front > c.s - 520 && t.front - t.len < c.s + 15) active = true;
        if (t.dir < 0 && t.front < c.s + 520 && t.front + t.len > c.s - 15) active = true;
      }
      c.active = active;
      const target = active ? 0 : 1;
      c.angle += Math.sign(target - c.angle) * Math.min(Math.abs(target - c.angle), dt / 5);
      for (const a of c.arms) a.pivot.rotation.z = a.lane * c.angle * Math.PI * 0.47 * -1;
      const ph = Math.floor(this.time * 2) % 2;
      c.lamps[0].emissiveIntensity = active && ph === 0 ? 6 : 0;
      c.lamps[1].emissiveIntensity = active && ph === 1 ? 6 : 0;
      if (active && camPos) {
        const p = this.route.pose(c.s, 0, {});
        nearest = Math.min(nearest, Math.hypot(p.x - camPos.x, p.z - camPos.z));
      }
    }
    this.nearestActiveCrossing = nearest;
    // cars
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), S1 = new THREE.Vector3(1, 1, 1);
    const p = {};
    let n = 0;
    for (const a of this.carAgents) {
      if (n >= 240) break;
      if (a.rd) {
        const cross = this.crossings.find((c) => c.rd === a.rd);
        const approaching = a.dir * a.l < 0;
        const blocked = cross && cross.angle < 0.95 && approaching && Math.abs(a.l) > 7 && Math.abs(a.l) < 16;
        if (!blocked) a.l += a.dir * a.v * dt;
        if (Math.abs(a.l) > 410) a.l = -Math.sign(a.l) * 405;
        this.route.pose(a.rd.s + (a.dir > 0 ? -1.5 : 1.5), a.l, p);
        Q.setFromAxisAngle(Y, Math.atan2(-p.lz * a.dir, p.lx * a.dir));
        V.set(p.x, 0, p.z);
      } else {
        a.s += a.dir * a.v * dt;
        if (a.s > a.par.s1) a.s = a.par.s0; if (a.s < a.par.s0) a.s = a.par.s1;
        const l = a.par.side * (a.par.edgeFn(a.s) + 3 + a.par.par.w / 2 + (a.dir > 0 ? -1.3 : 1.3) * a.par.side);
        this.route.pose(a.s, l, p);
        Q.setFromAxisAngle(Y, p.yaw + (a.dir > 0 ? 0 : Math.PI));
        V.set(p.x, 0, p.z);
      }
      M4.compose(V, Q, S1);
      this.movingCars.setMatrixAt(n, M4);
      this.movingCars.setColorAt(n, a.color);
      n++;
    }
    this.movingCars.count = n;
    this.movingCars.instanceMatrix.needsUpdate = true;
    if (this.movingCars.instanceColor) this.movingCars.instanceColor.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  /** river: water, floodplain with ball fields, levees, truss / girder bridges */
  buildRiver(rv) {
    const r = this.route;
    const group = new THREE.Group();
    const disposables = [], textures = [], materials = [];
    const p = {};
    const W = 2600;
    const mk = (geoBuf, mat) => { const g = geoBuf.build(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); disposables.push(g); return m; };
    const water = new GeoBuffer(), plain = new GeoBuffer(), levee = new GeoBuffer(), dirt = new GeoBuffer(), road = new GeoBuffer();
    const at = (s, l, y) => { r.pose(s, l, p); return [p.x, y, p.z]; };
    // the river runs across the line; we model it perpendicular to the track
    // the ground plane sits at GROUND_Y, so the water is laid just above it and
    // the floodplain is raised; sloping banks join the two
    const wy = GROUND_Y + 0.03, py = GROUND_Y + 0.9, bank = 9;
    {
      // UVs in metres / 24 so the ripples keep their size; split along l to keep the quads modest
      const uv = (s, l) => [s / 24, l / 24];
      for (let l = -W; l < W; l += 400) {
        const a = rv.w0 - 2, b = rv.w1 + 2;
        water.quadUp(at(a, l, wy), at(b, l, wy), at(b, l + 400, wy), at(a, l + 400, wy), [uv(a, l), uv(b, l), uv(b, l + 400), uv(a, l + 400)], [1, 1, 1]);
      }
    }
    plain.quadUp(at(rv.w0 - bank, -W, py), at(rv.w0, -W, wy), at(rv.w0, W, wy), at(rv.w0 - bank, W, py), [[0, 0], [1, 0], [1, 60], [0, 60]], [0.62, 0.6, 0.45]);
    plain.quadUp(at(rv.w1, -W, wy), at(rv.w1 + bank, -W, py), at(rv.w1 + bank, W, py), at(rv.w1, W, wy), [[0, 0], [1, 0], [1, 60], [0, 60]], [0.62, 0.6, 0.45]);
    // floodplain grass
    for (const [a, b] of [[rv.s0 + 14, rv.w0 - bank], [rv.w1 + bank, rv.s1 - 14]]) {
      plain.quadUp(at(a, -W, py), at(b, -W, py), at(b, W, py), at(a, W, py), [[0, 0], [1, 0], [1, 1], [0, 1]], [0.82, 0.9, 0.62]);
      // baseball grounds on the floodplain (Arakawa style)
      if (b - a > 150) {
        for (let l = -1800; l < 1800; l += 240) {
          if (Math.abs(l) < 120) continue;
          const sm = (a + b) / 2;
          const dy = py + 0.03;
          dirt.quadUp(at(sm - 40, l - 40, dy), at(sm + 40, l - 40, dy), at(sm + 40, l + 40, dy), at(sm - 40, l + 40, dy), [[0, 0], [6, 0], [6, 6], [0, 6]], [0.78, 0.62, 0.45]);
        }
      }
    }
    // levees: trapezoid ridges with a road on top (堤防)
    const lh = Math.min(6, rv.h - 1.5);
    for (const [sc, dir] of [[rv.s0, 1], [rv.s1, -1]]) {
      const t0 = sc - 14, t1 = sc - 3, t2 = sc + 3, t3 = sc + 14;
      void dir;
      const y0 = GROUND_Y, y1 = GROUND_Y + lh;
      const ya = dir > 0 ? y0 : py, yb = dir > 0 ? py : y0;   // the river side ends on the floodplain
      levee.quadUp(at(t0, -W, ya), at(t1, -W, y1), at(t1, W, y1), at(t0, W, ya), [[0, 0], [1, 0], [1, 60], [0, 60]], [0.85, 0.92, 0.65]);
      levee.quadUp(at(t2, -W, y1), at(t3, -W, yb), at(t3, W, yb), at(t2, W, y1), [[0, 0], [1, 0], [1, 60], [0, 60]], [0.85, 0.92, 0.65]);
      road.quadUp(at(t1, -W, y1), at(t2, -W, y1), at(t2, W, y1), at(t1, W, y1), [[0, 0], [1, 0], [1, W / 10], [0, W / 10]], [1, 1, 1]);
    }
    mk(water, this.M.water);
    mk(plain, this.M.levee);
    mk(levee, this.M.levee);
    mk(dirt, this.M.dirt);
    mk(road, this.M.road);

    // bridges: one per track pair, truss over the channel when rv.truss, else girders
    const tb = new GeoBuffer();
    const spanLen = rv.truss ? 64 : 32;
    const nSpans = Math.max(1, Math.round((rv.w1 - rv.w0) / spanLen));
    const L = (rv.w1 - rv.w0) / nSpans;
    const mid = (rv.w0 + rv.w1) / 2;
    const offs = [0, r.upOffset(rv.w0)];
    for (const g of r.parallelsIn(rv.w0, rv.w1)) offs.push(r.parallelOffset(g, 0, mid), r.parallelOffset(g, 1, mid));
    for (const off of offs) {
      for (let k = 0; k < nSpans; k++) {
        const a = rv.w0 + k * L, b = a + L;
        if (rv.truss) this.truss(tb, a, b, off);
        else this.girder(tb, a, b, off);
      }
      // piers in the water
      for (let k = 0; k <= nSpans; k++) {
        const s = rv.w0 + k * L;
        const h = r.elev(s);
        const base = at(s, off, 0);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, h - 1.0 - wy, 7.0), this.M.concrete);
        pier.position.set(base[0], wy + (h - 1.0 - wy) / 2, base[2]);
        r.pose(s, off, p);
        pier.rotation.y = p.yaw;
        pier.castShadow = true;
        group.add(pier);
        disposables.push(pier.geometry);
      }
    }
    const tm = mk(tb, this.M.steel);
    tm.castShadow = true;
    this.root.add(group);
    return { group, disposables, instanced: [], textures, materials };
  }

  /** Warren truss (下路トラス) for one track between s=a..b */
  truss(buf, a, b, off) {
    const r = this.route;
    const H = 7.2, hw = 2.9, panels = Math.round((b - a) / 8);
    const pt = (s, l, y) => { const q = r.pose(s, off + l, {}); return [q.x, q.y + y, q.z]; };
    const beam = (P, Q, w, h) => this.beam(buf, P, Q, w, h);
    for (const side of [-1, 1]) {
      const l = side * hw;
      beam(pt(a, l, -0.9), pt(b, l, -0.9), 0.45, 0.9);                       // bottom chord
      beam(pt(a + (b - a) / panels, l, H), pt(b - (b - a) / panels, l, H), 0.45, 0.6);  // top chord
      for (let i = 0; i < panels; i++) {
        const s0 = a + (b - a) * i / panels, s1 = a + (b - a) * (i + 1) / panels;
        const top0 = i === 0 ? null : s0;
        // diagonals: zig-zag between bottom and top
        if (i === 0) beam(pt(s0, l, -0.5), pt(s1, l, H), 0.4, 0.4);
        else if (i === panels - 1) beam(pt(s0, l, H), pt(s1, l, -0.5), 0.4, 0.4);
        else if (i % 2) beam(pt(s0, l, H), pt(s1, l, -0.5), 0.35, 0.35);
        else beam(pt(s0, l, -0.5), pt(s1, l, H), 0.35, 0.35);
        if (top0 !== null) beam(pt(s0, l, -0.5), pt(s0, l, H), 0.22, 0.22);   // verticals
      }
    }
    for (let i = 1; i < panels; i++) {
      const s = a + (b - a) * i / panels;
      beam(pt(s, -hw, H), pt(s, hw, H), 0.25, 0.25);                       // top lateral struts
      beam(pt(s, -hw, -0.85), pt(s, hw, -0.85), 0.3, 0.5);                 // floor beams
    }
    for (const s of [a + (b - a) / panels, b - (b - a) / panels]) {
      beam(pt(s, -hw, H - 1.4), pt(s, hw, H - 1.4), 0.4, 0.6);             // portal
    }
    // stringers under the rails
    for (const l of [-0.75, 0.75]) beam(pt(a, l, -0.55), pt(b, l, -0.55), 0.3, 0.6);
  }

  girder(buf, a, b, off) {
    const r = this.route;
    const pt = (s, l, y) => { const q = r.pose(s, off + l, {}); return [q.x, q.y + y, q.z]; };
    for (const l of [-1.1, 1.1]) this.beam(buf, pt(a + 0.3, l, -1.1), pt(b - 0.3, l, -1.1), 0.35, 1.8);
    this.beam(buf, pt(a + 0.3, 0, -0.35), pt(b - 0.3, 0, -0.35), 3.0, 0.15);
  }

  /** box from P to Q (centre line), width w (horizontal), height h */
  beam(buf, P, Q, w, h) {
    const d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
    const len = Math.hypot(...d);
    const fx = d.map((v) => v / len);
    let up = [0, 1, 0];
    if (Math.abs(fx[1]) > 0.95) up = [1, 0, 0];
    const side = norm(cross(fx, up));
    const u2 = cross(side, fx);
    const c = (s, a, bb) => [P[0] + fx[0] * s + side[0] * a + u2[0] * bb, P[1] + fx[1] * s + side[1] * a + u2[1] * bb, P[2] + fx[2] * s + side[2] * a + u2[2] * bb];
    const hw = w / 2, hh = h / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const col = [1, 1, 1];
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = corners[i], [a1, b1] = corners[(i + 1) % 4];
      buf.quad(c(0, a0, b0), c(0, a1, b1), c(len, a1, b1), c(len, a0, b0), [[0, 0], [1, 0], [1, 1], [0, 1]], col);
    }
    buf.quad(c(0, -hw, -hh), c(0, -hw, hh), c(0, hw, hh), c(0, hw, -hh), [[0, 0], [1, 0], [1, 1], [0, 1]], col);
    buf.quad(c(len, -hw, -hh), c(len, hw, -hh), c(len, hw, hh), c(len, -hw, hh), [[0, 0], [1, 0], [1, 1], [0, 1]], col);
  }

  // -------------------------------------------------------------------------
  /** passengers: two queues at each door position (behind the tactile strip), loiterers, people on benches */
  placePeople(st, pfm, a, b, H, batch, benchAt, centre) {
    const r = this.route;
    const R = rng(st.index * 977 + (pfm.side || 0) * 31 + 5);
    const busy = st.area === 'city' ? 0.75 : st.area === 'suburb' ? 0.5 : 0.3;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const p1 = {}, p2 = {};
    const put = (key, s, lat, latFace, scale, dy = 0) => {
      r.pose(s, lat, p1); r.pose(s + 0.01, latFace, p2);
      // face toward (s, latFace): yaw of the direction from p1 to p2 (local +X forward)
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      Q.setFromAxisAngle(Y, Math.atan2(-dz, dx) + (R() - 0.5) * 0.5);
      V.set(p1.x, p1.y + H + dy, p1.z);
      S.set(scale, scale, scale);
      M4.compose(V, Q, S);
      batch.add(key, M4);
    };
    // the track edges of this platform (and which way is "towards the track")
    const edges = pfm.island ? [pfm.edgeA, pfm.edgeB] : [pfm.side > 0 ? pfm.edgeB : pfm.edgeA];
    for (const edge of edges) {
      for (let car = 0; car < 15; car++) {
        for (const d of [-7.41, -2.47, 2.45, 7.39]) {
          const sd = st.s - 10 - car * 20 + d;
          if (sd < a + 3 || sd > b - 3 || R() > busy) continue;
          const e = edge(sd), c = centre(sd);
          const inward = Math.sign(c - e);
          const n = 1 + Math.floor(R() * (st.area === 'city' ? 6 : 3));
          for (let k = 0; k < n; k++) {
            const col = k % 2 ? 1 : -1, row = Math.floor(k / 2);
            const lat = e + inward * (1.75 + row * 0.62 + R() * 0.1);
            if (Math.abs(lat - c) > Math.abs(e - c) + 0.1) break;     // ran out of platform width
            put(PERSON_KEYS[Math.floor(R() * PERSON_KEYS.length)], sd + col * (0.42 + R() * 0.08), lat, e, 0.93 + R() * 0.13);
          }
        }
      }
    }
    // people wandering / standing near the middle of the platform
    for (let s = a + 12; s < b - 8; s += 9 + R() * 14) {
      if (R() > busy) continue;
      const c = centre(s);
      const w = Math.abs(pfm.edgeA(s) - pfm.edgeB(s)) / 2 - 2.2;
      put(PERSON_KEYS[Math.floor(R() * PERSON_KEYS.length)], s, c + (R() - 0.5) * 2 * Math.max(0, w), c + (R() - 0.5) * 8, 0.92 + R() * 0.14);
    }
    // someone on most benches
    for (const s of benchAt) {
      if (R() > busy + 0.15) continue;
      const lat = centre(s) + (pfm.island ? 0 : 0.8 * (pfm.side || 1));
      const k = 1 + Math.floor(R() * 2);
      for (let i = 0; i < k; i++) put(SIT_KEYS[Math.floor(R() * SIT_KEYS.length)], s + (i - 0.5) * 0.9 + (R() - 0.5) * 0.2, lat + (pfm.island ? 0.25 : 0.25 * (pfm.side || 1)), pfm.island ? lat + 5 : lat - 5 * (pfm.side || 1), 0.95 + R() * 0.08, 0.0);
    }
  }

  /**
   * a station: every platform there (ours, our extra platform tracks, the other lines' islands,
   * the 新幹線), with roofs, signs, boards, benches and people, and the station building over it
   */
  buildStation(si) {
    const r = this.route;
    const st = si.ours;
    const group = new THREE.Group();
    const disposables = [];
    const textures = [], materials = [];
    const sw = new Sweeper(r);
    const batch = new InstanceBatch();
    const H = 1.1;
    const p = {};
    const place = (key, s, lat, y = 0, yawExtra = 0, scale = null) => {
      r.pose(s, lat, p);
      const Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw + yawExtra);
      batch.add(key, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + y, p.z), Q, scale || new THREE.Vector3(1, 1, 1)));
    };
    const elevated = r.elev(si.mid) > 3;
    const pfBottom = -0.62;
    const platforms = r.layout.platformsAt(si);
    // one sign / board texture per line here
    const signFor = new Map(), boardFor = new Map();
    const signMat = (pfm) => {
      const key = pfm.group ? pfm.group.name : '_ours';
      if (!signFor.has(key)) {
        let prev = null, next = null, color = null;
        if (pfm.group) {
          const list = pfm.group.stops;
          const i = list.findIndex((x) => x.name === si.name);
          prev = list.slice(0, i).sort((x, y) => y.mid - x.mid)[0] || null;
          next = list.slice(i + 1).sort((x, y) => x.mid - y.mid)[0] || null;
          // stops are listed either way along the line: neighbours by position
          const byPos = [...list].sort((x, y) => x.mid - y.mid), j = byPos.findIndex((x) => x.name === si.name);
          prev = byPos[j - 1] || null; next = byPos[j + 1] || null;
          color = pfm.group.color;
        } else if (st) {
          prev = r.stations[st.index - 1]; next = r.stations[st.index + 1];
        }
        const tex = stationSignTexture(si, prev, next, color);
        textures.push(tex);
        const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 });
        materials.push(sm);
        signFor.set(key, sm);
      }
      return signFor.get(key);
    };
    const boardMat = (pfm, k) => {
      const key = (pfm.group ? pfm.group.name : '_ours') + (pfm.group ? '' : '|' + (pfm.island ? 'both' : pfm.side === -1 ? 'up' : 'down')) + '|' + (k % 2);
      if (!boardFor.has(key)) {
        const pseudo = { name: si.name, index: Math.round(Math.abs(si.mid)) % 97, prefix: st ? st.prefix : true };
        let rows = pfm.group ? BOARD_ROWS[pfm.group.kind] || null : null;
        // our own platforms: our train and the trains the other way, from the timetable
        if (!pfm.group && !pfm.line && st && this.ourDepartures) rows = this.ourDepartures(st, pfm.island ? 'both' : pfm.side === -1 ? 'up' : 'down');
        // our own platforms: our train and the trains the other way, from the timetable
        if (!pfm.group && !pfm.line && st && this.ourDepartures) rows = this.ourDepartures(st, pfm.island ? 'both' : pfm.side === -1 ? 'up' : 'down');
        // with the timetable running: the next two trains, in the order they leave
        const deps = pfm.group && rows && this.departures ? this.departures(pfm.group, si.name) : null;
        if (deps && deps.length) {
          rows = deps.map((d, j) => {
            // (新幹線: both rows are trains the same way, different services)
            const r0 = (pfm.shinkansen ? rows[j % 2] : rows[d.dir > 0 ? 0 : 1]) || rows[0];
            return [r0[0], r0[1], r0[2], r0[3], Math.floor(d.t / 60) % (24 * 60)];
          });
        }
        const dbt = departureBoardTexture(pseudo, k, pfm.group ? 'both' : pfm.island ? 'both' : pfm.side === -1 ? 'up' : 'down', rows);
        textures.push(dbt);
        const dbm = new THREE.MeshBasicMaterial({ map: dbt, toneMapped: false });
        materials.push(dbm);
        boardFor.set(key, dbm);
      }
      return boardFor.get(key);
    };
    const dbc = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.4 });
    const ck = this.clockTex || (this.clockTex = clockTexture());
    const ckm = new THREE.MeshStandardMaterial({ map: ck, roughness: 0.4 });
    materials.push(dbc, ckm);
    const sg = new THREE.PlaneGeometry(2.2, 0.82);
    const dbg = new THREE.PlaneGeometry(1.9, 0.48), dbBox = new THREE.BoxGeometry(0.16, 0.56, 2.0), ckg = new THREE.CircleGeometry(0.22, 24);
    disposables.push(sg, dbg, dbBox, ckg);
    const big = si.area === 'city';

    platforms.forEach((pfm, pi) => {
      const a = pfm.a, b = pfm.b;
      const Hp = pfm.shinkansen ? 1.25 : H;
      const step = 5;
      for (let s = a; s < b; s += step) {
        const s2 = Math.min(b, s + step);
        const A0 = pfm.edgeA(s), B0 = pfm.edgeB(s);
        const hi = Math.max(A0, B0), lo = Math.min(A0, B0), mid = (hi + lo) / 2;
        const strips = [
          { pts: [[mid, Hp], [hi, Hp]], mat: this.M.pfTop, uFn: (j) => (j === 0 ? (hi - mid) / 4 : 0) },
          { pts: [[lo, Hp], [mid, Hp]], mat: this.M.pfTop, uFn: (j) => (j === 0 ? 0 : (mid - lo) / 4) },
          // overhanging edge with the dark recess under it
          { pts: [[hi, Hp], [hi, Hp - 0.18], [hi - 0.35, Hp - 0.18], [hi - 0.35, pfBottom]], mat: this.M.pfSide },
          { pts: [[lo + 0.35, pfBottom], [lo + 0.35, Hp - 0.18], [lo, Hp - 0.18], [lo, Hp]], mat: this.M.pfSide },
        ];
        if (!pfm.island) {
          const back = pfm.side > 0 ? hi : lo;
          strips.push({ pts: [[back, Hp], [back, Hp + 1.5]], mat: this.M.fence, uScale: 1.7, vScale: 1.7 });
        }
        sw.sweep(s, s2, step, () => 0, strips);
      }
      const centre = (s) => (pfm.edgeA(s) + pfm.edgeB(s)) / 2;
      const width = (s) => Math.abs(pfm.edgeA(s) - pfm.edgeB(s));
      const roofFrom = big || pfm.shinkansen ? a + 10 : (st ? st.s - 200 : (a + b) / 2 - 90);
      const roofTo = big || pfm.shinkansen ? b - 5 : (st ? b - 5 : (a + b) / 2 + 90);
      for (let s = roofFrom; s < roofTo; s += 10) place('platform_roof', s, centre(s), Hp, 0, new THREE.Vector3(1, 1, Math.min(1.3, width(s) / 6.4)));
      const benchAt = [];
      for (let s = a + 30; s < b - 20; s += 37) {
        if (st && Math.abs(s - (st.s - 160)) < 14) continue;
        const vend = Math.floor(s / 37) % 3 === 0;
        const off = pfm.island ? 0 : 0.8 * (pfm.side || 1);
        place(vend ? 'vending_machine' : 'bench', s, centre(s) + off, Hp, Math.PI / 2 * (pfm.side || 1));
        if (!vend) benchAt.push(s);
        else place('trash_bins', s + 2.4, centre(s) + off, Hp, Math.PI / 2 * (pfm.side || 1));
      }
      const pseudo = { s: b - 5, index: (Math.round(Math.abs(si.mid)) + pi * 13) % 997, area: si.area };
      this.placePeople(pseudo, pfm, a, b, Hp, batch, benchAt, centre);
      const sm = signMat(pfm);
      for (let s = a + 25; s < b - 10; s += 64) {
        const c = centre(s);
        const faces = pfm.island ? [1, -1] : [pfm.side === 1 ? 1 : -1];
        for (const f of faces) {
          r.pose(s, c - f * 0.03, p);
          const m = new THREE.Mesh(sg, sm);
          m.position.set(p.x, p.y + Hp + 2.2, p.z);
          m.rotation.y = p.yaw + (f === 1 ? 0 : Math.PI);
          group.add(m);
        }
        place('utility_pole', s, c, Hp - 5.2, 0, new THREE.Vector3(0.4, 0.62, 0.4));
      }
      // hanging departure boards (発車標) and clocks under the roof, near the stairs
      const mid = (a + b) / 2;
      const boardAt = st && !pfm.group ? [st.s - 185, st.s - 135, st.s - 60] : [mid - 40, mid + 20];
      boardAt.forEach((sb, k) => {
        if (sb < a + 8 || sb > b - 8 || (!big && st && !pfm.group && sb < st.s - 200)) return;
        const c = centre(sb);
        r.pose(sb, c, p);
        const box = new THREE.Mesh(dbBox, dbc);
        box.position.set(p.x, p.y + Hp + 2.75, p.z); box.rotation.y = p.yaw;
        group.add(box);
        const dbm = boardMat(pfm, k);
        for (const f of [1, -1]) {
          const m = new THREE.Mesh(dbg, dbm);
          m.position.set(p.x + Math.cos(p.yaw) * 0.085 * f, p.y + Hp + 2.75, p.z - Math.sin(p.yaw) * 0.085 * f);
          m.rotation.y = p.yaw + (f === 1 ? Math.PI / 2 : -Math.PI / 2);
          group.add(m);
        }
        r.pose(sb + 2.2, c, p);
        for (const f of [1, -1]) {
          const m = new THREE.Mesh(ckg, ckm);
          m.position.set(p.x + Math.cos(p.yaw) * 0.03 * f, p.y + Hp + 2.85, p.z - Math.sin(p.yaw) * 0.03 * f);
          m.rotation.y = p.yaw + (f === 1 ? Math.PI / 2 : -Math.PI / 2);
          group.add(m);
        }
      });
      // stairs up to the bridge concourse (橋上駅舎) or down from the viaduct
      const B2 = new GeoBuffer();
      const sStair = st && !pfm.group ? st.s - 160 : mid - 10;
      if (sStair > a + 6 && sStair < b - 6 && width(sStair) > 4.5) {
        r.pose(sStair, centre(sStair), p);
        const F = new Frame(p.x, p.y + Hp, p.z, -p.yaw);
        const stH = !elevated ? 6.6 : 3.0;
        boxWalls(B2, F, 12, Math.min(3.2, width(sStair) - 1.4), 0, stH, TILE.office, [0.92, 0.95, 1]);
        flatTop(B2, F, 12, Math.min(3.2, width(sStair) - 1.4), stH, [0.75, 0.76, 0.78]);
        const g2 = B2.build(); const m2 = new THREE.Mesh(g2, this.M.office); m2.castShadow = true; group.add(m2); disposables.push(g2);
      }
    });

    // 橋上駅舎: concourse spanning the tracks (ground-level stations)
    const B = new GeoBuffer(), Bp = new GeoBuffer();
    const sC = si.mid - 10;
    const sp = this.trackSpan(sC);
    const latL = sp.max + 8, latR = sp.min - 8;
    if (!elevated) {
      const len = big ? 34 : 16;
      r.pose(sC, (latL + latR) / 2, p);
      const F = new Frame(p.x, p.y + 7.6, p.z, -p.yaw);
      boxWalls(B, F, len, latL - latR, 0, big ? 6.5 : 4.6, TILE.office, [1, 1, 1]);
      flatTop(Bp, F, len, latL - latR, big ? 6.5 : 4.6, [0.7, 0.71, 0.73]);
      // columns between tracks
      const nCol = Math.max(3, Math.round((latL - latR) / 14));
      for (let k = 0; k < nCol; k++) {
        r.pose(sC, latR + 2 + (latL - latR - 4) * k / (nCol - 1), p);
        solid(Bp, new Frame(p.x, GROUND_Y, p.z, -p.yaw), 0, 0, 0, 7.6 - GROUND_Y + p.y, 1.0, 1.0, [0.8, 0.8, 0.78]);
      }
      // entrance stairs/buildings on both sides
      for (const lat of [latL + 6, latR - 6]) {
        r.pose(sC, lat, p);
        const F2 = new Frame(p.x, GROUND_Y, p.z, -p.yaw);
        boxWalls(B, F2, len, 10, 0, 7.6 + (big ? 6.5 : 4.6) - GROUND_Y, TILE.office, [1, 1, 1]);
        flatTop(Bp, F2, len, 10, 7.6 + (big ? 6.5 : 4.6) - GROUND_Y, [0.7, 0.71, 0.73]);
      }
    } else {
      // station building under / beside the viaduct
      r.pose(si.mid, latL + 10, p);
      const F = new Frame(p.x, GROUND_Y, p.z, -p.yaw);
      boxWalls(B, F, 80, 14, 0, 12, TILE.office, [1, 1, 1]);
      flatTop(Bp, F, 80, 14, 12, [0.7, 0.71, 0.73]);
    }
    if (big && (st || platforms.length >= 4)) {
      // terminal / major station: big station building + department store
      const k = Math.round(Math.abs(si.mid) / 7) % 3;
      r.pose(si.mid + 20, latL + (elevated ? 40 : 30), p);
      const F = new Frame(p.x, GROUND_Y, p.z, -p.yaw);
      boxWalls(B, F, 110, 40, 0, 28 + k * 8, TILE.office, [0.95, 0.97, 1]);
      flatTop(Bp, F, 110, 40, 28 + k * 8, [0.6, 0.6, 0.6]);
    }
    for (const [buf, mat] of [[B, this.M.office], [Bp, this.M.plain]]) {
      if (buf.empty) continue;
      const g = buf.build();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      disposables.push(g);
    }
    if (st) {
      // stop position marker "15" on the platform side of our track; up (上り) trains stop with their
      // front 300 m further back, on the up track, facing the other way (starting signals: src/signals.js)
      const ourSide = st.door === 'right' ? -1 : 1;
      const stopTex = textBoardTexture('15', '#ffd400', '#111', 128, 128, 84);
      textures.push(stopTex);
      const stopMat = new THREE.MeshStandardMaterial({ map: stopTex, emissive: 0xffffff, emissiveMap: stopTex, emissiveIntensity: 0.3 });
      materials.push(stopMat);
      const post = new THREE.Group();
      for (const part of this.P.stop_post) post.add(new THREE.Mesh(part.geometry, part.material.name === 'STOPSIGN' ? stopMat : part.material));
      r.pose(st.s, ourSide * 2.3, p);
      post.position.set(p.x, p.y + H - 0.75, p.z);
      post.rotation.y = p.yaw;
      group.add(post);
      const sUp = st.s - 300;
      const upSide = st.door === 'right' ? 1 : -1;
      const postUp = post.clone();
      r.pose(sUp, r.upOffset(sUp) + upSide * 2.3, p);
      postUp.position.set(p.x, p.y + H - 0.75, p.z);
      postUp.rotation.y = p.yaw + Math.PI;
      group.add(postUp);
    }

    sw.build(group, disposables, true);
    const instanced = batch.build(group, this.P);
    this.root.add(group);
    return { group, disposables, instanced, textures, materials };
  }
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(v) { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }
void hash2;
