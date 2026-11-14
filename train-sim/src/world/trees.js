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

/** bamboo grove sprite: many slender culms, arching tops, feathery leaf sprays (kept as tall cards) */
function bambooSprite(R) {
  const c = canvas(256, 512);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 512);
  // culms: slender, grey-green to yellow-green, leaning and arching at the top
  for (let i = 0; i < 46; i++) {
    const x = 8 + R() * 240, top = 40 + R() * 120, bend = (R() - 0.5) * 90;
    const l = 0.7 + R() * 0.45, y = R() < 0.3;
    g.strokeStyle = `rgb(${(y ? 120 : 92) * l | 0},${128 * l | 0},${(y ? 66 : 74) * l | 0})`;
    g.lineWidth = 1.2 + R() * 1.6;
    g.beginPath(); g.moveTo(x, 512); g.quadraticCurveTo(x + bend * 0.15, 300, x + bend, top); g.stroke();
    g.strokeStyle = 'rgba(50,60,36,0.55)'; g.lineWidth = 1;
    for (let yy = 505; yy > top + 60; yy -= 24 + R() * 10) { g.beginPath(); g.moveTo(x - 2, yy); g.lineTo(x + 2, yy); g.stroke(); }
  }
  // leaves: narrow lanceolate leaves in sprays, dense at the top, thinning toward mid height
  for (let i = 0; i < 4200; i++) {
    const yy = 20 + Math.pow(R(), 1.35) * 380, x = 6 + R() * 244;
    const sh = 0.55 + 0.55 * (1 - yy / 400) + (R() - 0.5) * 0.3;
    g.fillStyle = `rgb(${(70 + R() * 40) * sh | 0},${(104 + R() * 36) * sh | 0},${(40 + R() * 20) * sh | 0})`;
    g.beginPath(); g.ellipse(x, yy, 5 + R() * 4, 1.1 + R() * 0.7, 0.5 + (R() - 0.5) * 1.6, 0, 7); g.fill();
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
      const c = V(dir.x * rad * 0.62, y + 0.15, dir.z * rad * 0.62);
      // card hangs from the stem: one edge toward the stem/top, drooping outward
      const a = V(-dir.z, 0, dir.x);                       // tangential
      const b = V(dir.x * 0.75, 0.66, dir.z * 0.75).normalize();   // up-and-in (texture top = stem)
      const nrm = new THREE.Vector3().crossVectors(a, b).normalize();
      if (nrm.dot(dir) < 0) nrm.negate();
      const sn = nrm.clone().addScaledVector(up, 0.5).normalize();
      const shade = (0.55 + 0.45 * f) * (0.9 + R() * 0.2);
      B.card(c, a, b, rad * 1.05 + 0.7, sn, shade);
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

// ---------------------------------------------------------------------------
// solid foliage: clipped shrubs, hedges and the dense core of tree crowns.
// A leaf texture mapped in world space (three planes blended by the normal) so it keeps its
// scale on hedges of any length and never shows a seam; the surface is bumped by noise.
// ---------------------------------------------------------------------------
function foliageTex(R, cols, leaf = [3, 6], n = 5200) {
  const N = 256, c = canvas(N);
  const g = c.getContext('2d');
  const base = cols[0];
  g.fillStyle = `rgb(${base[0] * 0.45 | 0},${base[1] * 0.45 | 0},${base[2] * 0.45 | 0})`;
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < n; i++) {
    const x = R() * N, y = R() * N, col = cols[Math.floor(R() * cols.length)];
    const k = 0.55 + R() * 0.6;
    g.fillStyle = `rgb(${Math.min(255, col[0] * k) | 0},${Math.min(255, col[1] * k) | 0},${Math.min(255, col[2] * k) | 0})`;
    const s = leaf[0] + R() * (leaf[1] - leaf[0]), rot = R() * Math.PI;
    // draw wrapped so the texture tiles
    for (const dx of [0, -N, N]) for (const dy of [0, -N, N]) {
      if (x + dx < -10 || x + dx > N + 10 || y + dy < -10 || y + dy > N + 10) continue;
      g.beginPath(); g.ellipse(x + dx, y + dy, s * 0.6, s * 0.33, rot, 0, 7); g.fill();
    }
  }
  const tx = leafTex(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

function solidFoliageMat(map, scale = 1 / 1.1) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.88, envMapIntensity: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFolPos; varying vec3 vFolN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fwp = vec4(transformed, 1.0);
        vec3 fwn = objectNormal;
        #ifdef USE_INSTANCING
        fwp = instanceMatrix * fwp;
        fwn = mat3(instanceMatrix) * fwn;
        #endif
        vFolPos = (modelMatrix * fwp).xyz;
        vFolN = normalize(mat3(modelMatrix) * fwn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFolPos; varying vec3 vFolN;')
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(vFolN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        float S = ${scale.toFixed(4)};
        vec4 tx = texture2D(map, vFolPos.zy * S) * bw.x + texture2D(map, vFolPos.xz * S) * bw.y + texture2D(map, vFolPos.xy * S + 0.37) * bw.z;
        // a little darker deep in the bush (low down / facing the ground)
        tx.rgb *= 0.78 + 0.32 * clamp(vFolN.y * 0.5 + 0.5, 0.0, 1.0);
        diffuseColor *= tx;`);
  };
  m.customProgramCacheKey = () => 'solidfoliage' + scale.toFixed(4);
  return m;
}

/** smooth lumpy noise on a sphere direction */
function lump(R) {
  const w = [];
  for (let i = 0; i < 7; i++) w.push([R() * 6.28, R() * 6.28, R() * 6.28, 1.5 + R() * 3.5, 0.5 + R() * 0.5]);
  return (d) => {
    let v = 0, sum = 0;
    for (const [a, b, c, f, amp] of w) { v += Math.sin(d.x * f + a) * Math.sin(d.y * f + b) * Math.sin(d.z * f + c) * amp; sum += amp; }
    return v / sum;
  };
}

/** a clipped, slightly lumpy ellipsoid (bush / crown core) */
function blobGeometry(R, center, radii, bumps = 0.12, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const P = g.attributes.position, L = lump(R), d = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    d.fromBufferAttribute(P, i).normalize();
    // flatter underside (clipped bushes sit on a flat base)
    const k = 1 + L(d) * bumps * 2;
    let y = d.y;
    if (y < -0.35) y = -0.35 - (y + 0.35) * 0.35;
    P.setXYZ(i, center.x + d.x * radii.x * k, center.y + y * radii.y * k, center.z + d.z * radii.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** a trimmed hedge: unit box (x = length, y = height, z = depth) with rounded top edges and a slightly uneven face */
function hedgeGeometry(R) {
  const g = new THREE.BoxGeometry(1, 1, 1, 12, 4, 3);
  g.translate(0, 0.5, 0);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y > 0.98 && Math.abs(z) > 0.49) { z *= 0.8; y -= 0.06; }           // rounded top edges
    if (y > 0.02) { z += (R() - 0.5) * 0.06; y += y > 0.98 ? (R() - 0.5) * 0.04 : 0; x += (R() - 0.5) * 0.01; }
    P.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** a cedar / cypress core: a tall cone with soft tiers */
function coniferCore(R, y0, y1, r0) {
  const pts = [];
  const n = 18;
  pts.push(new THREE.Vector2(0.05, y0 - 0.2));
  for (let i = 0; i <= n; i++) {
    const f = i / n, y = y0 + (y1 - y0) * f;
    const tier = 0.82 + 0.18 * Math.abs(Math.sin(f * Math.PI * 4.5));
    pts.push(new THREE.Vector2(Math.max(0.08, r0 * Math.pow(1 - f, 0.85) * tier * 0.78), y));
  }
  pts.push(new THREE.Vector2(0.02, y1 + 0.6));
  const g = new THREE.LatheGeometry(pts, 12);
  const P = g.attributes.position, L = lump(R), d = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    d.set(P.getX(i), P.getY(i) * 0.25, P.getZ(i)).normalize();
    const k = 1 + L(d) * 0.18;
    P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
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
  const broadSolid = solidFoliageMat(foliageTex(R, [[62, 104, 40], [92, 132, 52], [44, 78, 32], [76, 116, 46]], [4, 8]), 1 / 1.6);
  const conSolid = solidFoliageMat(foliageTex(R, [[42, 76, 40], [52, 88, 46], [34, 62, 34]], [3, 6], 6500), 1 / 1.3);
  const shrubSolid = solidFoliageMat(foliageTex(R, [[58, 98, 40], [84, 126, 54], [46, 82, 34], [70, 110, 44]], [2.5, 5], 7000), 1 / 0.9);
  // broadleaf: trunk to ~3.5 m, round crown 7.5 m wide centred at 6.2 m; a dense core inside the
  // leaf cards so the crown never shows the cards' flat edges or the sky through them
  {
    const crown = ellipsoidCanopy(R, V(0, 6.2, 0), V(3.8, 3.2, 3.8), 26, 3.6, 0.15).build();
    kinds.broad = [
      { geometry: crown, material: leafMat(broadTex) },
      { geometry: blobGeometry(R, V(0, 6.1, 0), V(3.0, 2.5, 3.0), 0.14, 3), material: broadSolid },
      { geometry: trunkGeometry(R, 5.2, 0.26, 2), material: bark, noColor: true },
    ];
  }
  // cedar / cypress windbreaks (屋敷林): slim tall cone with soft tiers, short sprays around it
  {
    const crown = coniferCrown(R, 3.2, 13.0, 2.4).build();
    kinds.conifer = [
      { geometry: coniferCore(R, 3.0, 12.8, 2.5), material: conSolid },
      { geometry: crown, material: leafMat(conTex) },
      { geometry: trunkGeometry(R, 13.5, 0.22, 0), material: bark, noColor: true },
    ];
  }
  // bamboo grove clump
  kinds.bamboo = [
    { geometry: crossedCards(7, 8, 13).build(), material: leafMat(bambooTex) },
    { geometry: blobGeometry(R, V(0, 9.6, 0), V(2.6, 2.4, 2.6), 0.16, 2), material: broadSolid },
  ];
  // garden shrub: a clipped, rounded bush (ツツジ / ツゲの玉物)
  kinds.shrub = [{ geometry: blobGeometry(R, V(0, 0.95, 0), V(1.35, 0.95, 1.35), 0.1, 3), material: shrubSolid }];
  // trimmed hedge (生け垣): unit box scaled per instance to its length / height / depth
  kinds.hedge = [{ geometry: hedgeGeometry(R), material: shrubSolid }];
  void shrubTex;
  return kinds;
}
