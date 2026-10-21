// Station life: low-poly passengers (several outfits), hanging departure boards (発車標) and clocks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LED_FONT } from '../displays.js';

/** colour a geometry (vertex colours) and place it */
function part(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) {
  geo.scale(sx, sy, sz);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

const SKIN = ['#e9c4a6', '#dcb08e', '#f0cdb2'];
// outfits: [coat/top, trousers or skirt, skirt?, shoes, hair, bag colour or null, shirt/collar]
const OUTFITS = [
  { top: '#1d2433', legs: '#1d2433', shoes: '#111111', hair: '#151210', bag: '#141414', collar: '#f2f2f2' },     // navy suit, briefcase
  { top: '#2b2b2e', legs: '#2b2b2e', shoes: '#151515', hair: '#1a1714', bag: null, collar: '#e8e8e8' },          // charcoal suit
  { top: '#c8b48c', legs: '#3a4a66', shoes: '#5a4030', hair: '#3a2a1e', bag: '#7a5a3a', collar: '#c8b48c' },     // beige coat + jeans
  { top: '#111522', legs: '#111522', shoes: '#101010', hair: '#0f0d0c', bag: '#1a2a5a', collar: '#111522' },     // 学ラン
  { top: '#1f2a44', legs: '#1f2a44', skirt: true, shoes: '#2a1a12', hair: '#14110f', bag: '#22283a', collar: '#f5f5f5' }, // セーラー服
  { top: '#7d8a8f', legs: '#2e2e32', skirt: true, shoes: '#2a2a2a', hair: '#4a3020', bag: '#a83a3a', collar: '#7d8a8f' }, // grey coat, skirt
  { top: '#5c4a3c', legs: '#4a4a4a', shoes: '#3a3030', hair: '#b8b8b8', bag: null, collar: '#5c4a3c', hat: '#4a4038' }, // elderly, hat
  { top: '#e8e4dc', legs: '#2c3240', shoes: '#e0e0e0', hair: '#2a1e16', bag: '#202020', collar: '#e8e4dc' },     // light jacket, backpack
];

/** one standing person ~1.0 high (scaled per instance), facing +X */
function personGeometry(o, skin, seated = false) {
  const parts = [];
  const legTop = seated ? 0.47 : 0.84;
  // shoes
  for (const z of [-0.09, 0.09]) parts.push(part(new THREE.BoxGeometry(0.26, 0.08, 0.1), o.shoes, seated ? 0.4 : 0.04, 0.04, z));
  if (seated) {
    // thighs horizontal, shins vertical
    for (const z of [-0.09, 0.09]) {
      parts.push(part(new THREE.BoxGeometry(0.42, 0.14, 0.13), o.legs, 0.2, legTop, z));
      parts.push(part(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 6, 1, false), o.skirt ? skin : o.legs, 0.38, 0.25, z));
    }
  } else if (o.skirt) {
    parts.push(part(new THREE.CylinderGeometry(0.15, 0.22, 0.34, 6, 1, false), o.legs, 0, legTop - 0.17, 0, 1, 1, 0.85));
    for (const z of [-0.08, 0.08]) parts.push(part(new THREE.CylinderGeometry(0.05, 0.045, legTop - 0.36, 6, 1, false), skin, 0, (legTop - 0.34) / 2 + 0.06, z));
  } else {
    for (const z of [-0.085, 0.085]) parts.push(part(new THREE.CylinderGeometry(0.075, 0.06, legTop - 0.06, 6, 1, false), o.legs, 0, (legTop - 0.06) / 2 + 0.06, z));
  }
  // torso (elliptical, tapering to the waist) + collar / shirt front
  const tb = legTop - 0.02, tt = tb + 0.58;
  parts.push(part(new THREE.CylinderGeometry(0.2, 0.16, tt - tb, 6, 1, false), o.top, 0, (tb + tt) / 2, 0, 0.62, 1, 1));
  parts.push(part(new THREE.BoxGeometry(0.02, 0.2, 0.09), o.collar, 0.12, tt - 0.12, 0));
  // shoulders
  parts.push(part(new THREE.SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), o.top, 0, tt - 0.04, 0, 0.62, 0.35, 1));
  // arms (slightly forward when seated)
  for (const z of [-0.215, 0.215]) {
    parts.push(part(new THREE.CylinderGeometry(0.055, 0.045, 0.56, 6, 1, false), o.top, seated ? 0.08 : 0, tt - 0.3, z, 1, 1, 1, seated ? 0.5 : 0.04));
    parts.push(part(new THREE.SphereGeometry(0.045, 4, 3), skin, seated ? 0.2 : 0.01, tt - 0.6, z));
  }
  // neck, head, hair
  parts.push(part(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 6, 1, false), skin, 0, tt + 0.03, 0));
  parts.push(part(new THREE.SphereGeometry(0.105, 8, 6), skin, 0.01, tt + 0.16, 0, 1, 1.12, 0.92));
  parts.push(part(new THREE.SphereGeometry(0.112, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), o.hair, -0.012, tt + 0.175, 0, 1, 1.1, 0.95));
  if (o.hat) parts.push(part(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 6, 1, false), o.hat, 0, tt + 0.27, 0));
  if (o.bag) {
    if (o.top === '#e8e4dc' || o.top === '#111522') parts.push(part(new THREE.BoxGeometry(0.14, 0.36, 0.28), o.bag, -0.17, tt - 0.22, 0));  // backpack
    else parts.push(part(new THREE.BoxGeometry(0.34, 0.25, 0.08), o.bag, 0.02, tt - 0.62, 0.27));                                     // hand bag
  }
  // keep each primitive's own smooth normals (scale() transforms them correctly)
  return mergeGeometries(parts, false);
}

/** prototypes for the instancing batches: person_0..7 (standing), sit_0..3, and station fittings */
export function stationProtos() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const P = {};
  OUTFITS.forEach((o, i) => {
    P['person_' + i] = [{ geometry: personGeometry(o, SKIN[i % 3]), material: mat }];
  });
  for (let i = 0; i < 4; i++) P['sit_' + i] = [{ geometry: personGeometry(OUTFITS[(i * 3 + 1) % OUTFITS.length], SKIN[i % 3], true), material: mat }];
  // trash bins (分別ゴミ箱): three bins in a stainless frame
  const bins = [];
  ['#2a6ab0', '#2e8a3e', '#c8a020'].forEach((c, k) => {
    bins.push(part(new THREE.BoxGeometry(0.4, 0.9, 0.42), '#b8bcc0', 0, 0.45, (k - 1) * 0.44));
    bins.push(part(new THREE.BoxGeometry(0.02, 0.12, 0.3), c, 0.21, 0.78, (k - 1) * 0.44));
  });
  const bg = mergeGeometries(bins, false);
  P.trash_bins = [{ geometry: bg, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }) }];
  return P;
}

/** person keys for a seeded random pick */
export const PERSON_KEYS = OUTFITS.map((_, i) => 'person_' + i);
export const SIT_KEYS = [0, 1, 2, 3].map((i) => 'sit_' + i);

/** LED departure board (発車標) texture: two trains, amber/green dot text on black */
export function departureBoardTexture(st, seed, dir = 'down') {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#060606'; g.fillRect(0, 0, W, H);
  const base = 9 * 60 + ((st.index * 7 + seed * 13) % 50);
  const downRow = (k) => (k ? ['快速', '#ff4a3a', '宇都宮', base + 12, '15両'] : ['普通', '#ff9a1a', st.index >= 22 ? '回送' : '宇都宮', base, '15両']);
  // up trains run through 上野 onto the 上野東京ライン
  const upRow = (k) => (k ? ['普通', '#ff9a1a', '熱海', base + 9, '15両'] : ['普通', '#ff9a1a', st.index === 0 ? '回送' : '上野', base + 3, '10両']);
  const rows = dir === 'up' ? [upRow(0), upRow(1)] : dir === 'both' ? [downRow(seed % 2), upRow(0)] : [downRow(0), downRow(seed % 2)];
  g.textBaseline = 'middle';
  rows.forEach(([kind, kc, dest, t, cars], i) => {
    const y = 34 + i * 58;
    g.font = `26px ${LED_FONT}`;
    g.fillStyle = kc; g.textAlign = 'left'; g.fillText(kind, 14, y);
    g.fillStyle = '#ffb030'; g.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 104, y);
    g.fillStyle = '#ffd040'; g.fillText(dest, 214, y);
    g.fillStyle = '#4cff6a'; g.textAlign = 'right'; g.fillText(cars, W - 16, y);
  });
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** station clock face showing the running time of day (~9 o'clock) */
export function clockTexture() {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 4; g.stroke();
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    g.lineWidth = k % 3 ? 2 : 4;
    g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke();
  }
  const hand = (a, l, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a) * l, 64 - Math.cos(a) * l); g.stroke(); };
  hand((9 + 12 / 60) / 12 * Math.PI * 2, 30, 5);
  hand(12 / 60 * Math.PI * 2, 46, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// passengers inside the trains
// ---------------------------------------------------------------------------
let PAX = null;
function paxProtos() {
  if (PAX) return PAX;
  PAX = {
    stand: OUTFITS.map((o, i) => personGeometry(o, SKIN[i % 3])),
    sit: OUTFITS.map((o, i) => personGeometry(o, SKIN[(i + 1) % 3], true)),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.5 }),
  };
  return PAX;
}

/**
 * one merged mesh of passengers for a car (model-local coordinates, local +X = forward).
 * seats: [{x, z, y}] cushion centres (top surface); doors: [x] door centres
 */
export function passengerMesh(seats, doors, floorY, rnd, load = 0.45) {
  const P = paxProtos();
  const geos = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const add = (g, x, y, z, yaw, sc) => {
    Q.setFromAxisAngle(Y, yaw); V.set(x, y, z); S.set(sc, sc, sc);
    M.compose(V, Q, S);
    geos.push(g.clone().applyMatrix4(M));
  };
  for (const s of seats) {
    if (rnd() > load) continue;
    const side = Math.sign(s.z) || 1;
    // sit with the back against the backrest, facing the aisle (-side in z)
    add(P.sit[Math.floor(rnd() * P.sit.length)], s.x, floorY, s.z + side * 0.12, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.94 + rnd() * 0.1);
  }
  for (const d of doors) {
    const n = rnd() < load ? 1 + Math.floor(rnd() * 2) : 0;
    for (let k = 0; k < n; k++) {
      add(P.stand[Math.floor(rnd() * P.stand.length)], d + (rnd() - 0.5) * 1.6, floorY, (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.35), rnd() * Math.PI * 2, 0.93 + rnd() * 0.12);
    }
  }
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false);
  geos.forEach((x) => x.dispose());
  const m = new THREE.Mesh(g, P.mat);
  m.castShadow = false; m.receiveShadow = true;
  m.name = 'passengers';
  return m;
}
