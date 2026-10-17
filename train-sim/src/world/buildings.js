// Procedural buildings merged into a few big geometries per chunk.
// Every facade texture tile has a real size (TILE) so windows keep their scale.
import * as THREE from 'three';

export const TILE = {
  house: [14.4, 2.9],
  apt: [12.0, 2.9],
  mansion: [12.0, 3.0],
  office: [4.0, 3.8],
  shop: [16.0, 4.0],
  factory: [4.0, 9.0],
  roofTile: [4.0, 4.0],
  roofMetal: [3.2, 3.2],
  concrete: [6, 6],
  plain: [8, 8],
};

/** collects triangles for one material */
export class GeoBuffer {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  get empty() { return this.p.length === 0; }

  tri(a, b, c, ua, ub, uc, col, nrm) {
    const n = nrm || faceNormal(a, b, c);
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    for (let i = 0; i < 3; i++) this.c.push(col[0], col[1], col[2]);
  }

  /** quad a,b,c,d counter-clockwise when seen from outside */
  quad(a, b, c, d, uvs, col) {
    const n = faceNormal(a, b, c);
    this.tri(a, b, c, uvs[0], uvs[1], uvs[2], col, n);
    this.tri(a, c, d, uvs[0], uvs[2], uvs[3], col, n);
  }

  /** like quad/tri but flipped if needed so the face points upwards (roofs) */
  quadUp(a, b, c, d, uvs, col) {
    const n = faceNormal(a, b, c);
    if (n[1] < 0) this.quad(d, c, b, a, [uvs[3], uvs[2], uvs[1], uvs[0]], col);
    else this.quad(a, b, c, d, uvs, col);
  }

  triUp(a, b, c, ua, ub, uc, col) {
    const n = faceNormal(a, b, c);
    if (n[1] < 0) this.tri(c, b, a, uc, ub, ua, col);
    else this.tri(a, b, c, ua, ub, uc, col);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** local frame for a building: origin, yaw → world points */
export class Frame {
  constructor(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
  }
  // local (u = along front, v = up, w = depth/back)
  p(u, v, w) { return [this.x + u * this.c - w * this.s, this.y + v, this.z + u * this.s + w * this.c]; }
}

const WHITE = [1, 1, 1];

/** vertical wall from local (u0,w0) to (u1,w1), height y0..y1, tiled facade UVs */
export function wall(buf, F, u1, w1, u0, w0, y0, y1, tile, col = WHITE, uOff = 0, vOff = 0) {
  // callers list the end points clockwise seen from above; swapped here so the face
  // points outwards and the facade reads left-to-right from outside
  const len = Math.hypot(u1 - u0, w1 - w0);
  const a = F.p(u0, y0, w0), b = F.p(u1, y0, w1), c = F.p(u1, y1, w1), d = F.p(u0, y1, w0);
  const U0 = uOff, U1 = uOff + len / tile[0], V0 = vOff + y0 / tile[1], V1 = vOff + y1 / tile[1];
  buf.quad(a, b, c, d, [[U0, V0], [U1, V0], [U1, V1], [U0, V1]], col);
}

/** box walls (4 sides) of a w × d footprint centred at the frame origin */
export function boxWalls(buf, F, w, d, y0, y1, tile, col, sides = [1, 1, 1, 1], vOff = 0) {
  const hw = w / 2, hd = d / 2;
  // front (w = -hd) faces -w, so walk +u; others go round counter-clockwise from outside
  if (sides[0]) wall(buf, F, -hw, -hd, hw, -hd, y0, y1, tile, col, 0, vOff);
  if (sides[1]) wall(buf, F, hw, -hd, hw, hd, y0, y1, tile, col, 0.37, vOff);
  if (sides[2]) wall(buf, F, hw, hd, -hw, hd, y0, y1, tile, col, 0.61, vOff);
  if (sides[3]) wall(buf, F, -hw, hd, -hw, -hd, y0, y1, tile, col, 0.13, vOff);
}

export function flatTop(buf, F, w, d, y, col, tile = TILE.plain) {
  const hw = w / 2, hd = d / 2;
  buf.quad(F.p(-hw, y, -hd), F.p(-hw, y, hd), F.p(hw, y, hd), F.p(hw, y, -hd),
    [[0, 0], [0, d / tile[1]], [w / tile[0], d / tile[1]], [w / tile[0], 0]], col);
}

/** solid box (used for small details, plain material) */
export function solid(buf, F, u, w, v0, v1, du, dw, col) {
  const s = new Frame(0, 0, 0, 0);
  void s;
  const hu = du / 2, hw = dw / 2;
  const P = (a, b, c) => F.p(u + a, c, w + b);
  const q = (a, b, c, d) => buf.quad(b, a, d, c, [[1, 0], [0, 0], [0, 1], [1, 1]], col);
  q(P(-hu, -hw, v0), P(hu, -hw, v0), P(hu, -hw, v1), P(-hu, -hw, v1));
  q(P(hu, -hw, v0), P(hu, hw, v0), P(hu, hw, v1), P(hu, -hw, v1));
  q(P(hu, hw, v0), P(-hu, hw, v0), P(-hu, hw, v1), P(hu, hw, v1));
  q(P(-hu, hw, v0), P(-hu, -hw, v0), P(-hu, -hw, v1), P(-hu, hw, v1));
  q(P(-hu, -hw, v1), P(hu, -hw, v1), P(hu, hw, v1), P(-hu, hw, v1));
}

/** gable roof along u, ridge height rh, overhang o */
export function gableRoof(roof, wallBuf, F, w, d, y, rh, o, roofCol, wallCol, tile) {
  const hw = w / 2 + o, hd = d / 2 + o;
  const slope = Math.hypot(hd, rh);
  const t = [tile[0], tile[1]];
  // front slope (towards -w)
  roof.quadUp(F.p(-hw, y - o * rh / hd, -hd), F.p(hw, y - o * rh / hd, -hd), F.p(hw, y + rh, 0), F.p(-hw, y + rh, 0),
    [[0, 0], [2 * hw / t[0], 0], [2 * hw / t[0], slope / t[1]], [0, slope / t[1]]], roofCol);
  roof.quadUp(F.p(hw, y - o * rh / hd, hd), F.p(-hw, y - o * rh / hd, hd), F.p(-hw, y + rh, 0), F.p(hw, y + rh, 0),
    [[0, 0], [2 * hw / t[0], 0], [2 * hw / t[0], slope / t[1]], [0, slope / t[1]]], roofCol);
  // gable triangles (plain wall area of the facade)
  const g = [0.05, 0.94];
  for (const s of [-1, 1]) {
    const u = s * w / 2;
    const a = F.p(u, y, s * d / 2), b = F.p(u, y, -s * d / 2), c = F.p(u, y + rh, 0);
    wallBuf.tri(a, b, c, [0, g[1]], [0.3, g[1]], [0.15, g[1] + 0.05], wallCol);
  }
}

/** hipped roof */
export function hipRoof(roof, F, w, d, y, rh, o, roofCol, tile) {
  const hw = w / 2 + o, hd = d / 2 + o;
  const r = Math.max(0, hw - hd);
  const yE = y - o * 0.4;
  const A = F.p(-hw, yE, -hd), B = F.p(hw, yE, -hd), C = F.p(hw, yE, hd), D = F.p(-hw, yE, hd);
  const E = F.p(-r, y + rh, 0), G = F.p(r, y + rh, 0);
  const t = tile;
  roof.quadUp(A, B, G, E, [[0, 0], [2 * hw / t[0], 0], [(hw + r) / t[0], hd / t[1]], [(hw - r) / t[0], hd / t[1]]], roofCol);
  roof.quadUp(C, D, E, G, [[0, 0], [2 * hw / t[0], 0], [(hw + r) / t[0], hd / t[1]], [(hw - r) / t[0], hd / t[1]]], roofCol);
  roof.triUp(B, C, G, [0, 0], [2 * hd / t[0], 0], [hd / t[0], hd / t[1]], roofCol);
  roof.triUp(D, A, E, [0, 0], [2 * hd / t[0], 0], [hd / t[0], hd / t[1]], roofCol);
}

const WALLS = [[0.93, 0.92, 0.88], [0.95, 0.93, 0.86], [0.88, 0.84, 0.76], [0.85, 0.86, 0.86], [0.80, 0.74, 0.66], [0.97, 0.96, 0.94], [0.75, 0.72, 0.68], [0.90, 0.86, 0.80]];
const ROOFS = [[0.32, 0.33, 0.36], [0.26, 0.29, 0.36], [0.42, 0.30, 0.24], [0.20, 0.20, 0.22], [0.38, 0.40, 0.42], [0.30, 0.36, 0.30], [0.50, 0.36, 0.28]];

export function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

/**
 * Builders take B = { house, apt, mansion, office, shop, factory, roofTile, roofMetal, concrete, plain, glass }
 * (GeoBuffers per material) and a random function R.
 */
export function house(B, F, R) {
  const w = 7 + R() * 4, d = 6.5 + R() * 3;
  const floors = R() < 0.82 ? 2 : 1;
  const H = floors * 2.9 + 0.4;
  const wc = pick(WALLS, R());
  boxWalls(B.house, F, w, d, 0, H, TILE.house, wc);
  const rc = pick(ROOFS, R());
  const roofKind = R();
  if (roofKind < 0.45) gableRoof(B.roofTile, B.house, F, w, d, H, 1.6 + R() * 0.8, 0.45, rc, wc, TILE.roofTile);
  else if (roofKind < 0.85) hipRoof(B.roofTile, F, w, d, H, 1.4 + R() * 0.6, 0.5, rc, TILE.roofTile);
  else { flatTop(B.plain, F, w, d, H, [0.7, 0.7, 0.68]); solid(B.plain, F, 0, 0, H, H + 0.4, w, d, wc); }
  // balcony on the front of the upper floor, entrance canopy, outdoor AC units
  if (floors === 2 && R() < 0.75) {
    const bw = 2.5 + R() * 2.5, bu = (R() - 0.5) * (w - bw);
    solid(B.plain, F, bu, -d / 2 - 0.5, 2.9, 3.0, bw, 1.0, [0.8, 0.8, 0.78]);
    solid(B.plain, F, bu, -d / 2 - 0.98, 3.0, 4.0, bw, 0.05, R() < 0.5 ? [0.92, 0.92, 0.9] : [0.35, 0.33, 0.3]);
  }
  solid(B.plain, F, -w / 4, -d / 2 - 0.5, 2.25, 2.35, 1.6, 1.0, [0.5, 0.5, 0.5]);
  solid(B.plain, F, w / 2 - 0.6, -d / 2 - 0.25, 0, 0.6, 0.8, 0.3, [0.92, 0.92, 0.9]);
  return { w, d };
}

export function apartment(B, F, R) {
  const units = 2 + Math.floor(R() * 3);
  const w = units * 6, d = 7.5;
  const floors = 2 + (R() < 0.4 ? 1 : 0);
  const H = floors * 2.9;
  const wc = pick(WALLS, R());
  wall(B.apt, F, -w / 2, -d / 2, w / 2, -d / 2, 0, H, TILE.apt, wc);
  wall(B.apt, F, w / 2, d / 2, -w / 2, d / 2, 0, H, TILE.apt, wc, 0.5);
  wall(B.house, F, w / 2, -d / 2, w / 2, d / 2, 0, H, TILE.house, wc, 0.9, 0.7);
  wall(B.house, F, -w / 2, d / 2, -w / 2, -d / 2, 0, H, TILE.house, wc, 0.9, 0.7);
  flatTop(B.plain, F, w, d, H, [0.62, 0.62, 0.6]);
  solid(B.plain, F, 0, 0, H, H + 0.6, w + 0.2, d + 0.2, wc);
  // outside steel staircase
  solid(B.plain, F, w / 2 + 1.1, 0, 0, H + 0.6, 2.0, 3.0, [0.55, 0.52, 0.48]);
  return { w: w + 2.2, d };
}

export function mansion(B, F, R, maxFloors = 14) {
  const units = 3 + Math.floor(R() * 6);
  const w = units * 6, d = 11 + R() * 3;
  const floors = 5 + Math.floor(R() * (maxFloors - 4));
  const H = floors * 3.0;
  const wc = pick([[0.86, 0.82, 0.74], [0.80, 0.78, 0.74], [0.72, 0.66, 0.58], [0.92, 0.90, 0.86], [0.66, 0.60, 0.55]], R());
  wall(B.mansion, F, -w / 2, -d / 2, w / 2, -d / 2, 0, H, TILE.mansion, wc);
  wall(B.mansion, F, w / 2, d / 2, -w / 2, d / 2, 0, H, TILE.mansion, wc, 0.5);
  wall(B.concrete, F, w / 2, -d / 2, w / 2, d / 2, 0, H, TILE.concrete, wc);
  wall(B.concrete, F, -w / 2, d / 2, -w / 2, -d / 2, 0, H, TILE.concrete, wc);
  flatTop(B.plain, F, w, d, H, [0.6, 0.6, 0.58]);
  solid(B.plain, F, 0, 0, H, H + 1.2, w + 0.3, d + 0.3, wc);
  solid(B.plain, F, w / 4, 0, H, H + 3.5, 5, 5, [0.75, 0.74, 0.7]);  // elevator machine room
  return { w, d, h: H };
}

export function office(B, F, R) {
  const w = 16 + Math.floor(R() * 6) * 4, d = 14 + R() * 10;
  const floors = 4 + Math.floor(R() * 9);
  const H = floors * 3.8;
  boxWalls(B.office, F, w, d, 0, H, TILE.office, [0.9 + R() * 0.1, 0.95, 1]);
  flatTop(B.plain, F, w, d, H, [0.55, 0.56, 0.58]);
  solid(B.plain, F, 0, 0, H, H + 2.5, w * 0.4, d * 0.4, [0.7, 0.71, 0.72]);
  return { w, d, h: H };
}

export function shopRow(B, F, R) {
  const w = 16 + Math.floor(R() * 2) * 16, d = 10;
  const upper = 1 + Math.floor(R() * 2);
  const wc = pick(WALLS, R());
  wall(B.shop, F, -w / 2, -d / 2, w / 2, -d / 2, 0, 4, TILE.shop, WHITE, Math.floor(R() * 4) / 4);
  wall(B.house, F, -w / 2, -d / 2, w / 2, -d / 2, 4, 4 + upper * 2.9, TILE.house, wc, R(), -4 / 2.9);
  wall(B.house, F, w / 2, -d / 2, w / 2, d / 2, 0, 4 + upper * 2.9, TILE.house, wc);
  wall(B.house, F, w / 2, d / 2, -w / 2, d / 2, 0, 4 + upper * 2.9, TILE.house, wc);
  wall(B.house, F, -w / 2, d / 2, -w / 2, -d / 2, 0, 4 + upper * 2.9, TILE.house, wc);
  flatTop(B.plain, F, w, d, 4 + upper * 2.9, [0.6, 0.6, 0.58]);
  return { w, d };
}

export function factory(B, F, R) {
  const w = 30 + R() * 50, d = 20 + R() * 25, H = 7 + R() * 4;
  const col = pick([[0.85, 0.88, 0.9], [0.75, 0.82, 0.88], [0.9, 0.88, 0.82], [0.7, 0.74, 0.7]], R());
  boxWalls(B.factory, F, w, d, 0, H, TILE.factory, col);
  const rc = pick([[0.45, 0.55, 0.62], [0.55, 0.55, 0.55], [0.35, 0.45, 0.4]], R());
  gableRoof(B.roofMetal, B.factory, F, w, d, H, 1.6, 0.3, rc, col, TILE.roofMetal);
  return { w, d };
}

/** ビニールハウス: arched plastic greenhouse */
export function greenhouse(B, F, R, len) {
  const w = 6, H = 3.2, n = 8;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = Math.PI * k / n;
    pts.push([-Math.cos(a) * w / 2, 1.2 + Math.sin(a) * (H - 1.2)]);
  }
  const col = [0.93, 0.95, 0.95];
  pts.unshift([-w / 2, 0]); pts.push([w / 2, 0]);
  for (let k = 0; k < pts.length - 1; k++) {
    const [w0, y0] = pts[k], [w1, y1] = pts[k + 1];
    const a = F.p(-len / 2, y0, w0), b = F.p(len / 2, y0, w0), c = F.p(len / 2, y1, w1), d = F.p(-len / 2, y1, w1);
    B.glass.quad(a, b, c, d, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [w0, y0] = pts[k], [w1, y1] = pts[k + 1];
      B.glass.tri(F.p(s * len / 2, 0, 0), F.p(s * len / 2, y0, w0), F.p(s * len / 2, y1, w1), [0, 0], [0, 0], [0, 0], col);
    }
  }
}

/** low-detail far building (no texture, vertex colour) */
export function farBlock(B, F, w, d, h, col) {
  boxWalls(B.far, F, w, d, 0, h, [1000, 1000], col);
  flatTop(B.far, F, w, d, h, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
}
