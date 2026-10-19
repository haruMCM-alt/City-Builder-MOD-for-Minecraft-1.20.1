// Trees built as volumes of leaf-cluster cards around a real trunk, so they read as
// round canopies from the cab, from the trackside and from above (chase view).
// Normals point away from the canopy centre and a baked vertex colour darkens the
// inside and underside, which gives the soft self-shadowing of real foliage.
import * as THREE from 'three';
import { rng } from './noise.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function leafTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

/** a ragged cluster of small leaves with gaps (broadleaf: keyaki, sakura, kashi …) */
function broadCluster(R, cols, leafSize = [5, 11], n = 2400) {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // a few twigs showing through
  g.strokeStyle = 'rgba(70,52,38,0.9)';
  for (let i = 0; i < 6; i++) {
    g.lineWidth = 1.5 + R() * 1.5;
    g.beginPath(); g.moveTo(128, 250);
    g.quadraticCurveTo(128 + (R() - 0.5) * 80, 160, 40 + R() * 176, 30 + R() * 120); g.stroke();
  }
  // lobes: the outline is a union of blobs, so the card edge is irregular
  const lobes = [];
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, d = 30 + R() * 50;
    lobes.push([128 + Math.cos(a) * d, 120 + Math.sin(a) * d * 0.85, 40 + R() * 34]);
  }
  lobes.push([128, 120, 70]);
  for (let i = 0; i < n; i++) {
    const L = lobes[Math.floor(R() * lobes.length)];
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * L[2];
    const x = L[0] + Math.cos(a) * d, y = L[1] + Math.sin(a) * d;
    // light from the top (sun), darker low and inside the lobe
    const top = 1 - (y - 20) / 220;
    const rim = d / L[2];
    const k = 0.55 + 0.35 * top + 0.25 * rim + (R() - 0.5) * 0.25;
    const col = cols[Math.floor(R() * cols.length)];
    g.fillStyle = `rgb(${Math.min(255, col[0] * k) | 0},${Math.min(255, col[1] * k) | 0},${Math.min(255, col[2] * k) | 0})`;
    const s = leafSize[0] + R() * (leafSize[1] - leafSize[0]);
    g.beginPath(); g.ellipse(x, y, s * 0.55, s * 0.32, R() * Math.PI, 0, 7); g.fill();
  }
  return leafTex(c);
}

/** cedar / cypress (sugi, hinoki) spray: twigs fanning out and down from the top edge (= the stem) */
function coniferCluster(R) {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const x0 = 128 + (R() - 0.5) * 60, y0 = 6 + R() * 24;
    const ex = 128 + (R() - 0.5) * 236, ey = 120 + R() * 125;
    const l = 0.7 + R() * 0.4;
    g.strokeStyle = `rgba(${44 * l | 0},${60 * l | 0},${34 * l | 0},0.95)`;
    g.lineWidth = 2;
    const mx = (x0 + ex) / 2, my = (y0 + ey) / 2 - 18;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    for (let t = 0.12; t <= 1.0; t += 0.05) {
      const q = 1 - t;
      const px = q * q * x0 + 2 * q * t * mx + t * t * ex, py = q * q * y0 + 2 * q * t * my + t * t * ey;
      const sh = (0.6 + 0.4 * (1 - py / 256)) * l + (R() - 0.5) * 0.15;
      g.fillStyle = `rgb(${42 * sh | 0},${76 * sh | 0},${40 * sh | 0})`;
      g.beginPath(); g.ellipse(px + (R() - 0.5) * 4, py + (R() - 0.5) * 4, 6 + R() * 6, 3 + R() * 3, R() * 3, 0, 7); g.fill();
    }
  }
  return leafTex(c);
}

/** bamboo grove sprite: culms + feathery leaves (kept as tall cards) */
function bambooSprite(R) {
  const c = canvas(256, 512);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 512);
  for (let i = 0; i < 22; i++) {
    const x = 20 + R() * 216, top = 30 + R() * 90, bend = (R() - 0.5) * 70;
    const l = 0.8 + R() * 0.4;
    g.strokeStyle = `rgb(${110 * l | 0},${140 * l | 0},${70 * l | 0})`;
    g.lineWidth = 3 + R() * 2.5;
    g.beginPath(); g.moveTo(x, 512); g.quadraticCurveTo(x + bend * 0.3, 280, x + bend, top); g.stroke();
    // nodes
    g.strokeStyle = 'rgba(60,70,40,0.6)'; g.lineWidth = 1;
    for (let y = 500; y > top + 40; y -= 26 + R() * 8) { g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.stroke(); }
  }
  for (let i = 0; i < 2600; i++) {
    const x = 10 + R() * 236, y = 20 + Math.pow(R(), 1.6) * 330;
    const sh = 0.6 + 0.5 * (1 - y / 360) + (R() - 0.5) * 0.25;
    g.fillStyle = `rgb(${(80 + R() * 40) * sh | 0},${(120 + R() * 40) * sh | 0},${(45 + R() * 20) * sh | 0})`;
    g.beginPath(); g.ellipse(x, y, 7 + R() * 5, 1.6 + R(), (R() - 0.5) * 1.2 + 0.3, 0, 7); g.fill();
  }
  return leafTex(c);
}

function barkTex(R) {
  const c = canvas(64, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#5a4838'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 70; i++) {
    const l = 50 + R() * 60;
    g.fillStyle = `rgba(${l + 20},${l + 8},${l},0.6)`;
    g.fillRect(R() * 64, R() * 128, 1 + R() * 2, 6 + R() * 26);
  }
  const t = leafTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------
class CardBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }

  /**
   * one square leaf card centred at c, plane spanned by unit vectors a and b,
   * normal nrm (shared by its 4 corners), brightness k
   */
  card(c, a, b, size, nrm, k, uvRect = [0, 0, 1, 1]) {
    const base = this.p.length / 3;
    const h = size / 2;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const [u0, v0, u1, v1] = uvRect;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    corners.forEach(([sa, sb], j) => {
      this.p.push(c.x + (a.x * sa + b.x * sb) * h, c.y + (a.y * sa + b.y * sb) * h, c.z + (a.z * sa + b.z * sb) * h);
      this.n.push(nrm.x, nrm.y, nrm.z);
      this.uv.push(uvs[j][0], uvs[j][1]);
      // underside of the card a little darker
      const kk = k * (sb < 0 ? 0.88 : 1.0);
      this.c.push(kk, kk, kk);
    });
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** ellipsoid canopy of outward-facing cards */
function ellipsoidCanopy(R, center, radii, nCards, size, inner = 0.25) {
  const B = new CardBuilder();
  const up = V(0, 1, 0);
  for (let i = 0; i < nCards; i++) {
    // directions spread evenly (golden spiral) with jitter; fewer cards straight below
    const t = (i + 0.5) / nCards;
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * 2.399963 + R() * 0.4;
    const dir = V(Math.cos(phi) * r, y * 0.92 + 0.08, Math.sin(phi) * r).normalize();
    if (dir.y < -0.75 && R() < 0.6) continue;
    const isInner = R() < inner;
    const dist = isInner ? 0.25 + R() * 0.35 : 0.62 + R() * 0.3;
    const c = V(center.x + dir.x * radii.x * dist, center.y + dir.y * radii.y * dist, center.z + dir.z * radii.z * dist);
    // card plane perpendicular to the radial direction, rolled randomly
    const nrm = V(dir.x / radii.x, dir.y / radii.y, dir.z / radii.z).normalize();
    let a = new THREE.Vector3().crossVectors(Math.abs(nrm.y) > 0.95 ? V(1, 0, 0) : up, nrm).normalize();
    let b = new THREE.Vector3().crossVectors(nrm, a).normalize();
    const roll = R() * Math.PI * 2;
    const a2 = a.clone().multiplyScalar(Math.cos(roll)).addScaledVector(b, Math.sin(roll));
    const b2 = new THREE.Vector3().crossVectors(nrm, a2).normalize();
    // tilt the card a little so neighbouring cards interleave
    a2.addScaledVector(nrm, (R() - 0.5) * 0.5).normalize();
    const shade = (0.62 + 0.38 * (dir.y * 0.5 + 0.5)) * (isInner ? 0.72 : 1.0) * (0.92 + R() * 0.16);
    // shading normal: radial, slightly lifted (foliage scatters light from above)
    const sn = nrm.clone().addScaledVector(up, 0.35).normalize();
    B.card(c, a2, b2, size * (0.8 + R() * 0.45), sn, shade);
  }
  return B;
}

/** a tiered cedar crown: rings of drooping sprays around the stem */
function coniferCrown(R, y0, y1, r0) {
  const B = new CardBuilder();
  const up = V(0, 1, 0);
  for (let y = y0; y < y1; y += 1.25) {
    const f = (y - y0) / (y1 - y0);
    const rad = r0 * (1 - f) ** 0.9 + 0.25;
    const n = Math.max(3, Math.round(3 + rad * 1.6));
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2 + R() * 0.7 + y * 1.7;
      const dir = V(Math.cos(phi), 0, Math.sin(phi));
      const c = V(dir.x * rad * 0.55, y + 0.15, dir.z * rad * 0.55);
      // card hangs from the stem: one edge toward the stem/top, drooping outward
      const a = V(-dir.z, 0, dir.x);                       // tangential
      const b = V(dir.x * 0.75, 0.66, dir.z * 0.75).normalize();   // up-and-in (texture top = stem)
      const nrm = new THREE.Vector3().crossVectors(a, b).normalize();
      if (nrm.dot(dir) < 0) nrm.negate();
      const sn = nrm.clone().addScaledVector(up, 0.5).normalize();
      const shade = (0.55 + 0.45 * f) * (0.9 + R() * 0.2);
      B.card(c, a, b, rad * 1.7 + 1.0, sn, shade);
    }
  }
  // tip
  B.card(V(0, y1 + 0.3, 0), V(1, 0, 0), V(0, 1, 0), 1.6, V(0, 1, 0), 1.0);
  B.card(V(0, y1 + 0.3, 0), V(0, 0, 1), V(0, 1, 0), 1.6, V(0, 1, 0), 1.0);
  return B;
}

/** tapered trunk with a couple of main limbs */
function trunkGeometry(R, h, r0, limbs) {
  const parts = [];
  // open-ended: the caps are never seen and cost as much as the sides
  const tr = new THREE.CylinderGeometry(r0 * 0.6, r0, h, 6, 1, true);
  tr.translate(0, h / 2, 0);
  parts.push(tr);
  for (let i = 0; i < limbs; i++) {
    const len = h * (0.45 + R() * 0.3);
    const lg = new THREE.CylinderGeometry(r0 * 0.25, r0 * 0.45, len, 4, 1, true);
    lg.translate(0, len / 2, 0);
    lg.rotateZ(0.5 + R() * 0.4);
    lg.rotateY(R() * Math.PI * 2);
    lg.translate(0, h * (0.7 + R() * 0.25), 0);
    parts.push(lg);
  }
  // merge (positions, normals, uvs)
  const pos = [], nrm = [], uv = [], idx = [];
  let base = 0;
  for (const p of parts) {
    const P = p.getAttribute('position'), N = p.getAttribute('normal'), U = p.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i) * 2, U.getY(i) * h / 2);
    }
    for (const i of p.index.array) idx.push(i + base);
    base += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** crossed tall planes (bamboo) with vertex colour for the shared material */
function crossedCards(n, w, h) {
  const B = new CardBuilder();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const nrm = V(-dir.z, 0.6, dir.x).normalize();
    // non-square card: emulate with scaled b axis
    const c = V(0, h / 2, 0);
    const B2 = { x: 0, y: h / w, z: 0 };
    B.card(c, dir, B2, w, nrm, 0.95);
  }
  return B;
}

/**
 * All tree kinds: { parts: [{ geometry, material, noColor? }] } ready for the
 * world's instancing. Sizes match the previous sprites (broad ≈ 9 × 10 m …).
 */
export function makeTreeKinds() {
  const R = rng(4242);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const leafMat = (map) => {
    const m = std({
      map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, vertexColors: true,
      envMapIntensity: 0.55,
    });
    // keep the outward canopy normal on the back of a card too (three flips it for
    // double-sided materials, which made the far side of a crown look black)
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;');
    };
    m.customProgramCacheKey = () => 'leafcard';
    return m;
  };
  const bark = std({ map: barkTex(R), roughness: 0.95, color: 0xb8aa98 });

  const broadTex = broadCluster(R, [[62, 104, 40], [92, 132, 52], [44, 78, 32], [118, 146, 64], [76, 116, 46]]);
  const shrubTex = broadCluster(R, [[58, 98, 40], [84, 126, 54], [40, 70, 30]], [4, 8], 2800);
  const conTex = coniferCluster(R);
  const bambooTex = bambooSprite(R);

  const kinds = {};
  // broadleaf: trunk to ~3.5 m, round crown 7.5 m wide centred at 6.2 m
  {
    const crown = ellipsoidCanopy(R, V(0, 6.2, 0), V(3.8, 3.2, 3.8), 20, 4.4).build();
    kinds.broad = [
      { geometry: crown, material: leafMat(broadTex) },
      { geometry: trunkGeometry(R, 5.2, 0.26, 2), material: bark, noColor: true },
    ];
  }
  // cedar / cypress windbreaks (屋敷林): slim tall cone, bare stem below
  {
    const crown = coniferCrown(R, 3.2, 13.0, 2.4).build();
    kinds.conifer = [
      { geometry: crown, material: leafMat(conTex) },
      { geometry: trunkGeometry(R, 13.5, 0.22, 0), material: bark, noColor: true },
    ];
  }
  // bamboo grove clump
  kinds.bamboo = [{ geometry: crossedCards(5, 8, 13).build(), material: leafMat(bambooTex) }];
  // hedge / garden shrub
  kinds.shrub = [{ geometry: ellipsoidCanopy(R, V(0, 1.15, 0), V(1.5, 1.15, 1.5), 9, 2.0, 0.1).build(), material: leafMat(shrubTex) }];
  return kinds;
}
