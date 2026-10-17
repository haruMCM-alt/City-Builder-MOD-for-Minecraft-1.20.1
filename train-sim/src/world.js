import * as THREE from 'three';
import { mulberry32, PLATFORM_LEN, PF_EDGE, SIDE_PF_W, TRACK_SPACING } from './route.js';

const CHUNK = 200;
const AHEAD = 2200;
const BEHIND = 400;
const GROUND_Y = -0.62;
const FONT = '"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';

// ---------------------------------------------------------------------------
// procedural textures
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

function noiseFill(g, w, h, base, amp, n = 6000, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

function makeTextures() {
  const T = {};
  T.grass = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#5d7a3a', 0.25, 9000, 3);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 40},${110 + Math.random() * 30},50,0.25)`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 0, 7); g.fill();
    }
  });
  T.ballast = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#8a8580', 0.5, 5000, 2));
  T.platform = canvasTex(256, 256, (g, w, h) => {
    // u: 0 = platform edge, 1 = 4 m in; v along the platform
    noiseFill(g, w, h, '#a9a7a2', 0.12, 3000, 2);
    g.fillStyle = '#e8e8e4'; g.fillRect(0, 0, w * 0.04, h);
    g.fillStyle = '#d9b51a'; g.fillRect(w * 0.20, 0, w * 0.08, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 8) for (let x = w * 0.20; x < w * 0.28; x += 8) g.fillRect(x + 2, y + 2, 3, 3);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 2);
  });
  T.window = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d8d6d0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b3a48'; g.fillRect(8, 14, 48, 34);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(8, 14, 24, 34);
    g.fillStyle = '#b8b5ae'; g.fillRect(0, 54, w, 10);
  });
  T.field = canvasTex(128, 128, (g, w, h) => {
    noiseFill(g, w, h, '#ffffff', 0.18, 2000, 2);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
  });
  return T;
}

function stationSignTexture(st, prev, next) {
  return canvasTex(768, 288, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#333'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#111';
    g.font = `bold 92px ${FONT}`; g.fillText(st.name, w / 2, 108);
    g.font = `34px ${FONT}`; g.fillText(st.kana, w / 2, 40);
    g.font = `30px ${FONT}`; g.fillStyle = '#333'; g.fillText(st.en, w / 2, 170);
    g.fillStyle = '#1f8a3c'; g.fillRect(0, 198, w, 22);
    g.fillStyle = '#111'; g.font = `30px ${FONT}`;
    if (prev) { g.textAlign = 'left'; g.fillText('◀ ' + prev.name, 24, 250); }
    if (next) { g.textAlign = 'right'; g.fillText(next.name + ' ▶', w - 24, 250); }
  }, false);
}

function textBoardTexture(text, bg, fg, w = 256, h = 256, size = 150) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${size}px ${FONT}`; g.fillText(text, w / 2, h / 2 + 6);
  }, false);
}

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
/**
 * Sweep 2D profile strips along the route.
 * strips: [{ pts: [[lat, y], ...], mat, u: 'dist'|fn }] ; lateral + = left.
 * The outward normal of a step (dl, dy) is (-dy, dl).
 */
class Sweeper {
  constructor() { this.buckets = new Map(); }
  bucket(mat) {
    if (!this.buckets.has(mat)) this.buckets.set(mat, { pos: [], uv: [], idx: [] });
    return this.buckets.get(mat);
  }
  sweep(route, s0, s1, step, offsetFn, strips, vScale = 4) {
    const samples = [];
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    const p = {};
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (i / n);
      route.pose(s, 0, p);
      samples.push({ s, x: p.x, z: p.z, lx: p.lx, lz: p.lz, o: offsetFn(s) });
    }
    for (const strip of strips) {
      const B = this.bucket(strip.mat);
      const pts = strip.pts;
      const base = B.pos.length / 3;
      const cols = pts.length;
      // u coordinate along the strip
      const us = [0];
      for (let j = 1; j < cols; j++) us.push(us[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      for (const sm of samples) {
        for (let j = 0; j < cols; j++) {
          const lat = sm.o + pts[j][0];
          B.pos.push(sm.x + sm.lx * lat, pts[j][1], sm.z + sm.lz * lat);
          const u = strip.uFn ? strip.uFn(j) : us[j] / (strip.uScale || 1);
          B.uv.push(u, sm.s / vScale);
        }
      }
      for (let i = 0; i < samples.length - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a = base + i * cols + j, b = base + (i + 1) * cols + j;
          const c = b + 1, d = a + 1;
          // winding chosen so a profile step (dl, dy) has outward normal (-dy, dl)
          B.idx.push(a, c, d, a, b, c);
        }
      }
    }
  }
  build(group, disposables, opts = {}) {
    for (const [mat, B] of this.buckets) {
      if (!B.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setIndex(B.idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = !!opts.cast;
      group.add(m);
      disposables.push(g);
    }
  }
}

/** collect sub-meshes of a glTF node with transforms baked relative to the node */
function extractParts(node) {
  const parts = [];
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  node.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(m);
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
  build(group, protos, opts = {}) {
    const out = [];
    for (const [key, it] of this.items) {
      const parts = protos[key];
      if (!parts) continue;
      for (const p of parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, it.m.length);
        it.m.forEach((m, i) => im.setMatrixAt(i, m));
        if (it.c.some((c) => c)) it.c.forEach((c, i) => im.setColorAt(i, c || new THREE.Color(1, 1, 1)));
        im.castShadow = opts.cast !== false;
        im.receiveShadow = true;
        im.frustumCulled = false;
        group.add(im);
        out.push(im);
      }
    }
    return out;
  }
}

function boxGeo(w, h, d, tile = [4, 3.5]) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv');
  // faces: px nx py ny pz nz, 4 verts each
  const sizes = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sizes[f][0] / tile[0], uv.getY(i) * sizes[f][1] / tile[1]);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
export class World {
  constructor(scene, route, envGltf) {
    this.scene = scene;
    this.route = route;
    this.T = makeTextures();
    this.chunks = new Map();
    this.stations = new Map();
    this.queue = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this.initMaterials();
    this.initProtos(envGltf);
    this.initSky();
    this.initGround();
  }

  initMaterials() {
    const T = this.T;
    this.M = {
      ballast: new THREE.MeshStandardMaterial({ map: T.ballast, roughness: 1, color: 0xb0aca6, side: THREE.DoubleSide }),
      rail: new THREE.MeshStandardMaterial({ color: 0x6b5a4e, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
      railTop: new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide }),
      sleeper: new THREE.MeshStandardMaterial({ color: 0x8b8781, roughness: 0.9 }),
      pfTop: new THREE.MeshStandardMaterial({ map: T.platform, roughness: 0.9, side: THREE.DoubleSide }),
      pfSide: new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 0.95, side: THREE.DoubleSide }),
      wire: new THREE.LineBasicMaterial({ color: 0x2a2a2a }),
      wall: new THREE.MeshStandardMaterial({ map: T.window, roughness: 0.85 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.9 }),
      field: new THREE.MeshStandardMaterial({ map: T.field, roughness: 1 }),
      fence: new THREE.MeshStandardMaterial({ color: 0x5b6b5b, roughness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      post: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6, metalness: 0.4 }),
    };
    this.M.wall.map.repeat.set(1, 1);
    this.sleeperGeo = new THREE.BoxGeometry(0.24, 0.16, 2.0);
    this.sleeperGeo.translate(0, -0.23, 0);
    this.buildingGeos = {
      city: [[14, 24, 12], [18, 36, 14], [22, 48, 16], [12, 15, 10], [26, 30, 20], [11, 62, 11], [16, 20, 30]].map((s) => boxGeo(...s)),
      suburb: [[24, 12, 9], [30, 15, 10], [10, 7, 10], [16, 9, 12]].map((s) => boxGeo(...s)),
    };
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.unitBox.translate(0, 0.5, 0);
    this.fieldGeo = new THREE.PlaneGeometry(1, 1);
    this.fieldGeo.rotateX(-Math.PI / 2);
  }

  initProtos(gltf) {
    this.P = {};
    for (const name of ['catenary_gate', 'platform_roof', 'bench', 'vending_machine', 'signal', 'stop_post', 'house_a', 'house_b', 'tree', 'utility_pole']) {
      const node = gltf.scene.getObjectByName(name);
      if (node) this.P[name] = extractParts(node);
    }
    // building templates as prototypes
    const wallMats = [this.M.wall, this.M.wall, this.M.roof, this.M.roof, this.M.wall, this.M.wall];
    this.buildingGeos.city.forEach((g, i) => { this.P['city' + i] = [{ geometry: g, material: wallMats }]; });
    this.buildingGeos.suburb.forEach((g, i) => { this.P['sub' + i] = [{ geometry: g, material: wallMats }]; });
    this.P.field = [{ geometry: this.fieldGeo, material: this.M.field }];
    // signal: green aspect lit
    for (const p of this.P.signal || []) {
      if (p.material.name === 'SIG_G') {
        p.material = p.material.clone();
        p.material.emissiveIntensity = 3;
      }
    }
  }

  initSky() {
    const geo = new THREE.SphereGeometry(4000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d7cc9) }, mid: { value: new THREE.Color(0x9cc4ea) }, bot: { value: new THREE.Color(0xd9e6ef) } },
      vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vp;
        void main(){ float h = normalize(vp).y; vec3 c = h>0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.6)) : bot;
        c = mix(bot, c, smoothstep(-0.02, 0.08, h)); gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    // a few clouds
    const cloudTex = canvasTex(256, 128, (g, w, h) => {
      for (let i = 0; i < 22; i++) {
        const x = 40 + Math.random() * (w - 80), y = 50 + Math.random() * 40, r = 18 + Math.random() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    }, false);
    this.clouds = new THREE.Group();
    const rnd = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, opacity: 0.9 }));
      const a = rnd() * Math.PI * 2, r = 1200 + rnd() * 1800;
      m.position.set(Math.cos(a) * r, 300 + rnd() * 500, Math.sin(a) * r);
      m.scale.set(600 + rnd() * 600, 220 + rnd() * 160, 1);
      this.clouds.add(m);
    }
    this.scene.add(this.clouds);
  }

  initGround() {
    const tex = this.T.grass;
    tex.repeat.set(400, 400);
    const g = new THREE.PlaneGeometry(8000, 8000);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0xb8c9a0 }));
    this.ground.position.y = GROUND_Y;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  /** follow the camera so the horizon never ends */
  updateFixed(camPos) {
    const tile = 20; // 8000 / 400
    this.ground.position.x = Math.round(camPos.x / tile) * tile;
    this.ground.position.z = Math.round(camPos.z / tile) * tile;
    this.sky.position.copy(camPos);
    this.clouds.position.set(camPos.x, 0, camPos.z);
  }

  /** stream chunks; s = train front position */
  update(s, budget = 1) {
    const r = this.route;
    const first = Math.floor((s - BEHIND) / CHUNK);
    const last = Math.floor((s + AHEAD) / CHUNK);
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
    // stations (built as a whole)
    for (const st of r.stations) {
      const near = st.s > s - BEHIND - 50 && st.s - PLATFORM_LEN < s + AHEAD;
      if (near && !this.stations.has(st.name)) this.stations.set(st.name, this.buildStation(st));
      else if (!near && this.stations.has(st.name)) { this.disposeChunk(this.stations.get(st.name)); this.stations.delete(st.name); }
    }
  }

  /** synchronous preload around s (used at start) */
  preload(s) {
    this.update(s, 0);
    while (this.queue.length) this.update(s, 4);
  }

  disposeChunk(ch) {
    ch.group.removeFromParent();
    for (const g of ch.disposables) g.dispose();
    for (const im of ch.instanced) im.dispose();
    for (const t of ch.textures || []) t.dispose();
    for (const m of ch.materials || []) m.dispose();
  }

  tracksAt(s) {
    const r = this.route;
    const list = [{ off: () => 0 }, { off: (x) => r.upOffset(x) }];
    if (r.extraTracks(s).length) {
      list.push({ off: (x) => r.extraTracks(x)[0] ?? r.upOffset(x) - 5 });
      list.push({ off: (x) => r.extraTracks(x)[1] ?? r.upOffset(x) - 8.8 });
    }
    return list;
  }

  buildChunk(k) {
    const r = this.route;
    const s0 = k * CHUNK, s1 = s0 + CHUNK;
    const group = new THREE.Group();
    const disposables = [];
    const sw = new Sweeper();
    const tracks = this.tracksAt(s0 + CHUNK / 2);
    const batch = new InstanceBatch();
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    const p = {};
    const place = (key, s, lat, y = 0, yawExtra = 0, scale = null, color = null) => {
      r.pose(s, lat, p);
      Q.setFromAxisAngle(Y, p.yaw + yawExtra);
      V.set(p.x, y, p.z);
      M4.compose(V, Q, scale || S1);
      batch.add(key, M4, color);
    };

    for (const t of tracks) {
      // ballast bed
      sw.sweep(r, s0, s1, 5, t.off, [{ pts: [[-2.3, GROUND_Y], [-1.45, -0.26], [1.45, -0.26], [2.3, GROUND_Y]], mat: this.M.ballast, uScale: 2 }]);
      // rails: inner side, top, outer side
      for (const g of [-0.5335, 0.5335]) {
        sw.sweep(r, s0, s1, 5, t.off, [
          { pts: [[g - 0.07, -0.16], [g - 0.035, -0.012]], mat: this.M.rail },
          { pts: [[g + 0.035, -0.012], [g + 0.07, -0.16]], mat: this.M.rail },
          { pts: [[g - 0.035, 0], [g + 0.035, 0]], mat: this.M.railTop },
        ]);
      }
      // sleepers
      for (let s = Math.ceil(s0 / 0.62) * 0.62; s < s1; s += 0.62) place('sleeper', s, t.off(s));
    }

    // catenary: gates every 50 m spanning the down + up tracks, wires per track
    const pf = r.stationNear(s0 + CHUNK / 2, 120);
    for (let s = Math.ceil(s0 / 50) * 50; s < s1; s += 50) {
      const up = r.upOffset(s);
      const span = -up;
      if (span < 4.6) place('catenary_gate', s, up / 2);
      else {
        // island platform: separate gates over each track
        place('catenary_gate', s, -1.9 + 1.9, 0, 0, new THREE.Vector3(1, 1, 0.55));
        place('catenary_gate', s, up + 1.9 - 1.9, 0, 0, new THREE.Vector3(1, 1, 0.55));
      }
      const ex = r.extraTracks(s);
      if (ex.length) place('catenary_gate', s, (ex[0] + ex[1]) / 2);
    }
    const wirePts = [];
    for (const t of tracks) {
      let prev = null;
      for (let s = s0; s <= s1; s += 10) {
        const zig = ((Math.floor(s / 50) % 2 === 0 ? 1 : -1) * (1 - 2 * ((s % 50) / 50))) * 0.2;
        r.pose(s, t.off(s) + zig, p);
        const c = new THREE.Vector3(p.x, 5.1, p.z);
        r.pose(s, t.off(s), p);
        const m = new THREE.Vector3(p.x, 6.05 - 0.25 * Math.sin(Math.PI * (s % 50) / 50), p.z);
        if (prev) { wirePts.push(prev.c, c, prev.m, m); }
        wirePts.push(c, m);
        prev = { c, m };
      }
    }
    const wg = new THREE.BufferGeometry().setFromPoints(wirePts);
    group.add(new THREE.LineSegments(wg, this.M.wire));
    disposables.push(wg);

    // speed limit signs
    for (const L of r.limits) {
      if (L.s0 >= s0 && L.s0 < s1 && L.v < 120) this.speedSign(group, disposables, L.s0 - 30, L.v);
    }

    // scenery
    this.scenery(k, s0, s1, place, pf);

    sw.build(group, disposables);
    const instanced = batch.build(group, { ...this.P, sleeper: [{ geometry: this.sleeperGeo, material: this.M.sleeper }] });
    for (const im of instanced) if (im.geometry === this.sleeperGeo) im.castShadow = false;
    this.root.add(group);
    return { group, disposables, instanced, textures: group.userData.textures || [], materials: group.userData.materials || [] };
  }

  speedSign(group, disposables, s, v) {
    const r = this.route, p = {};
    const tex = textBoardTexture(String(v), '#f2f2ec', '#111', 128, 128, 70);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), mat);
    r.pose(s, 2.9, p);
    board.position.set(p.x, 2.6, p.z);
    board.rotation.y = p.yaw - Math.PI / 2; // face the approaching train
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6), this.M.post);
    pole.position.set(p.x, 1.3 - 0.3, p.z);
    group.add(board, pole);
    disposables.push(board.geometry, pole.geometry);
    (group.userData.textures ||= []).push(tex);
    (group.userData.materials ||= []).push(mat);
  }

  scenery(k, s0, s1, place, pf) {
    const r = this.route;
    const rnd = mulberry32(k * 7919 + 17);
    const col = (h, s, l) => new THREE.Color().setHSL(h, s, l);
    for (const side of [1, -1]) {
      let s = s0 + rnd() * 10;
      while (s < s1) {
        const dens = r.density(s);
        const st = r.stationNear(s, 60);
        // lateral start beyond the outermost track on that side
        let edge;
        if (side > 0) edge = 9 + (st && st.door === 'left' ? SIDE_PF_W + 10 : 0);
        else {
          const ex = r.extraTracks(s);
          edge = -(ex.length ? ex[1] : r.upOffset(s)) + 9 + (st && st.door === 'left' ? SIDE_PF_W + 4 : 0);
        }
        // utility poles along the line side
        if (dens > 0.25 && rnd() < 0.35) place('utility_pole', s, side * (edge - 2), GROUND_Y);
        let lat = edge + 4 + rnd() * 8;
        while (lat < 420) {
          const fall = Math.exp(-lat / (120 + dens * 400));
          if (dens > 0.68) {
            if (rnd() < 0.8 * fall + 0.05) {
              const tall = lat > 60 || rnd() < 0.5;
              const key = tall ? 'city' + Math.floor(rnd() * 7) : (rnd() < 0.5 ? 'house_a' : 'house_b');
              const c = col(0.08 + rnd() * 0.08, 0.1 + rnd() * 0.15, 0.6 + rnd() * 0.3);
              place(key, s, side * lat, GROUND_Y, Math.round(rnd()) * Math.PI / 2 + (rnd() - 0.5) * 0.1, null, key.startsWith('city') ? c : null);
            }
            lat += 22 + rnd() * 18;
          } else if (dens > 0.35) {
            const u = rnd();
            if (u < 0.75 * fall + 0.1) {
              const key = u < 0.1 ? 'sub' + Math.floor(rnd() * 4) : (rnd() < 0.5 ? 'house_a' : 'house_b');
              const c = col(0.1 + rnd() * 0.1, 0.12, 0.62 + rnd() * 0.25);
              place(key, s, side * lat, GROUND_Y, (rnd() - 0.5) * 0.4 + (rnd() < 0.3 ? Math.PI / 2 : 0), null, key.startsWith('sub') ? c : null);
            } else if (u < 0.9) place('tree', s, side * lat, GROUND_Y, rnd() * 6, new THREE.Vector3(0.8 + rnd() * 0.6, 0.8 + rnd() * 0.7, 0.8 + rnd() * 0.6));
            lat += 16 + rnd() * 14;
          } else {
            const u = rnd();
            if (u < 0.55) {
              // rice paddies / fields
              const w = 25 + rnd() * 40, d = 30 + rnd() * 50;
              const c = rnd() < 0.7 ? col(0.22 + rnd() * 0.06, 0.45, 0.32 + rnd() * 0.1) : col(0.1, 0.35, 0.38);
              place('field', s, side * (lat + w / 2), GROUND_Y + 0.03, 0, new THREE.Vector3(d, 1, w), c);
              lat += w + 3;
            } else if (u < 0.7) {
              for (let j = 0; j < 4; j++) place('tree', s + (rnd() - 0.5) * 20, side * (lat + rnd() * 12), GROUND_Y, rnd() * 6, new THREE.Vector3(1 + rnd() * 0.5, 0.9 + rnd() * 0.8, 1 + rnd() * 0.5));
              lat += 25;
            } else if (u < 0.78) {
              place(rnd() < 0.5 ? 'house_a' : 'house_b', s, side * lat, GROUND_Y, rnd() * 0.3);
              place('tree', s + 10, side * (lat + 9), GROUND_Y, 0);
              lat += 20;
            } else lat += 30 + rnd() * 30;
          }
        }
        s += dens > 0.68 ? 18 + rnd() * 10 : dens > 0.35 ? 22 + rnd() * 16 : 45 + rnd() * 30;
      }
    }
  }

  buildStation(st) {
    const r = this.route;
    const group = new THREE.Group();
    const disposables = [];
    const textures = [], materials = [];
    const sw = new Sweeper();
    const batch = new InstanceBatch();
    const a = st.s - PLATFORM_LEN + 5, b = st.s + 15;
    const H = 1.1;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const p = {};
    const place = (key, s, lat, y = 0, yawExtra = 0, scale = null) => {
      r.pose(s, lat, p);
      Q.setFromAxisAngle(Y, p.yaw + yawExtra);
      V.set(p.x, y, p.z);
      M4.compose(V, Q, scale || new THREE.Vector3(1, 1, 1));
      batch.add(key, M4);
    };
    const W = st.area === 'city' ? 9 : SIDE_PF_W;
    const platforms = []; // {inner(lat fn), outer(lat fn), dir: +1 platform extends to +lat}
    if (st.door === 'right') {
      platforms.push({ edgeA: () => -PF_EDGE, edgeB: (s) => r.upOffset(s) + PF_EDGE, island: true });
    } else {
      platforms.push({ edgeA: () => PF_EDGE + W, edgeB: () => PF_EDGE, island: false, side: 1 });
      platforms.push({ edgeA: (s) => r.upOffset(s) - PF_EDGE, edgeB: (s) => r.upOffset(s) - PF_EDGE - SIDE_PF_W, island: false, side: -1 });
    }
    for (const pfm of platforms) {
      // build with offset = 0 and absolute lateral positions computed per sample
      const step = 5;
      for (let s = a; s < b; s += step) {
        const s2 = Math.min(b, s + step);
        const A0 = pfm.edgeA(s), B0 = pfm.edgeB(s);
        const hi = Math.max(A0, B0), lo = Math.min(A0, B0);
        // top surface split into edge strips (textured with edge line + tactile blocks)
        const strips = [];
        const mid = (hi + lo) / 2;
        // left half: from mid to hi; u measured from the edge at hi
        strips.push({ pts: [[mid, H], [hi, H]], mat: this.M.pfTop, uFn: (j) => (j === 0 ? (hi - mid) / 4 : 0) });
        strips.push({ pts: [[lo, H], [mid, H]], mat: this.M.pfTop, uFn: (j) => (j === 0 ? 0 : (mid - lo) / 4) });
        strips.push({ pts: [[hi, H], [hi, -0.3]], mat: this.M.pfSide });
        strips.push({ pts: [[lo, -0.3], [lo, H]], mat: this.M.pfSide });
        sw.sweep(r, s, s2, step, () => 0, strips);
      }
      const centre = (s) => (pfm.edgeA(s) + pfm.edgeB(s)) / 2;
      const roofFrom = st.area === 'city' ? a + 10 : st.s - 190;
      for (let s = roofFrom; s < b - 5; s += 10) place('platform_roof', s, centre(s), H, 0, new THREE.Vector3(1, 1, Math.min(1.25, Math.abs(pfm.edgeA(s) - pfm.edgeB(s)) / 6.4)));
      for (let s = a + 30; s < b - 20; s += 37) {
        place(Math.floor(s / 37) % 3 === 0 ? 'vending_machine' : 'bench', s, centre(s), H, Math.PI / 2 * (pfm.side || 1));
      }
      // station name signs
      const i = st.index;
      const prev = r.stations[i - 1], next = r.stations[i + 1];
      const tex = stationSignTexture(st, prev, next);
      textures.push(tex);
      const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
      materials.push(sm);
      const sg = new THREE.PlaneGeometry(2.2, 0.82);
      disposables.push(sg);
      for (let s = a + 25; s < b - 10; s += 64) {
        const c = centre(s);
        const faces = pfm.island ? [1, -1] : [pfm.side === 1 ? 1 : -1];
        for (const f of faces) {
          r.pose(s, c - f * 0.03, p);
          const m = new THREE.Mesh(sg, sm);
          m.position.set(p.x, H + 2.2, p.z);
          // plane faces +Z; rotate so it faces the track on side f (f=+1 → faces left (−Z local))
          m.rotation.y = p.yaw + (f === 1 ? 0 : Math.PI);
          group.add(m);
        }
        place('utility_pole', s, c, H - 5.2, 0, new THREE.Vector3(0.4, 0.62, 0.4));
      }
    }
    // stop position marker "15" and starting signal on the platform side of our track
    const ourSide = st.door === 'right' ? -1 : 1;
    const stopTex = textBoardTexture('15', '#ffd400', '#111', 128, 128, 84);
    textures.push(stopTex);
    const stopMat = new THREE.MeshStandardMaterial({ map: stopTex, emissive: 0xffffff, emissiveMap: stopTex, emissiveIntensity: 0.3 });
    materials.push(stopMat);
    const post = new THREE.Group();
    for (const part of this.P.stop_post) {
      const m = new THREE.Mesh(part.geometry, part.material.name === 'STOPSIGN' ? stopMat : part.material);
      post.add(m);
    }
    r.pose(st.s, ourSide * 2.3, p);
    post.position.set(p.x, H - 0.75, p.z);
    post.rotation.y = p.yaw;
    group.add(post);
    place('signal', st.s + 90, ourSide * 2.6, 0);

    // station building beside left-hand platforms / big stations
    if (st.door === 'left' || st.area === 'city') {
      const lat = st.door === 'left' ? PF_EDGE + W + 9 : -(-r.upOffset(st.s) + PF_EDGE + 16);
      const bw = st.area === 'city' ? 70 : 28, bh = st.area === 'city' ? 18 : 8;
      const bg = boxGeo(bw, bh, 16, [6, 4]);
      disposables.push(bg);
      const bm = new THREE.Mesh(bg, [this.M.wall, this.M.wall, this.M.roof, this.M.roof, this.M.wall, this.M.wall]);
      r.pose(st.s - 120, lat, p);
      bm.position.set(p.x, GROUND_Y, p.z);
      bm.rotation.y = p.yaw;
      bm.castShadow = true;
      group.add(bm);
    }
    sw.build(group, disposables);
    const instanced = batch.build(group, this.P);
    this.root.add(group);
    return { group, disposables, instanced, textures, materials };
  }
}

export { TRACK_SPACING };
