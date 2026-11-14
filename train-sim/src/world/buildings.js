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
    // zero-area triangles (e.g. a hip roof on a square plan) have no normal: the NaN
    // they produce in the shader blooms into bright streaks, so drop them
    if (!nrm && triArea2(a, b, c) < 1e-6) return;
    const n = nrm || faceNormal(a, b, c);
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    for (let i = 0; i < 3; i++) this.c.push(col[0], col[1], col[2]);
  }

  /** quad a,b,c,d counter-clockwise when seen from outside */
  quad(a, b, c, d, uvs, col) {
    let n = faceNormal(a, b, c);
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) n = faceNormal(a, c, d);
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
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

function triArea2(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) return [0, 0, 0];
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

// wall colours seen in Kanto suburbs: off-white and beige siding, warm greys, brown and
// dark navy siding on newer houses, pale yellow and salmon mortar on older ones
const WALLS = [[0.93, 0.92, 0.88], [0.95, 0.93, 0.86], [0.88, 0.84, 0.76], [0.85, 0.86, 0.86], [0.80, 0.74, 0.66], [0.97, 0.96, 0.94], [0.75, 0.72, 0.68], [0.90, 0.86, 0.80]];
const HOUSE_WALLS = [...WALLS, [0.62, 0.58, 0.54], [0.46, 0.44, 0.42], [0.36, 0.38, 0.44], [0.92, 0.86, 0.70], [0.90, 0.78, 0.70], [0.70, 0.62, 0.52], [0.98, 0.98, 0.97]];
// kawara (silver-grey, black, navy, brown), terracotta, colour steel
const ROOFS = [[0.32, 0.33, 0.36], [0.26, 0.29, 0.36], [0.42, 0.30, 0.24], [0.20, 0.20, 0.22], [0.38, 0.40, 0.42], [0.30, 0.36, 0.30], [0.50, 0.36, 0.28], [0.18, 0.22, 0.32], [0.58, 0.34, 0.22], [0.26, 0.24, 0.22]];
const CONCRETE = [0.66, 0.65, 0.62];
const STEEL = [0.42, 0.43, 0.44];
const DARK = [0.20, 0.20, 0.21];
const SOLAR = [0.42, 0.48, 0.62];

export function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

/** a textured quad facing -w (towards the viewer of the front) taking an atlas rect */
function signFace(buf, F, u0, u1, y0, y1, w, rect, col = WHITE) {
  const [a, b, c, d] = rect;   // u0, v0, u1, v1 in the atlas
  // like wall(): walk from +u to -u so the face points to -w and reads left-to-right
  buf.quad(F.p(u1, y0, w), F.p(u0, y0, w), F.p(u0, y1, w), F.p(u1, y1, w), [[a, b], [c, b], [c, d], [a, d]], col);
}

/** perpendicular sign board (袖看板) sticking out from a wall at local u, both faces textured */
function bladeSign(buf, F, u, wWall, y0, y1, out, rect) {
  const [a, b, c, d] = rect;
  const w0 = wWall - 0.15, w1 = wWall - 0.15 - out;
  // face seen from +u and from -u (mirror the u of the atlas on the other side)
  buf.quad(F.p(u + 0.06, y0, w0), F.p(u + 0.06, y0, w1), F.p(u + 0.06, y1, w1), F.p(u + 0.06, y1, w0), [[a, b], [c, b], [c, d], [a, d]], WHITE);
  buf.quad(F.p(u - 0.06, y0, w1), F.p(u - 0.06, y0, w0), F.p(u - 0.06, y1, w0), F.p(u - 0.06, y1, w1), [[a, b], [c, b], [c, d], [a, d]], WHITE);
}

/** rooftop clutter of a flat-roofed block: parapet, water tank, AC units, antenna, stair house */
function rooftop(B, F, R, w, d, H, opts = {}) {
  const hw = w / 2, hd = d / 2, t = 0.18, ph = opts.parapet ?? 0.9;
  // parapet ring
  solid(B.concrete, F, 0, -hd + t / 2, H, H + ph, w, t, CONCRETE);
  solid(B.concrete, F, 0, hd - t / 2, H, H + ph, w, t, CONCRETE);
  solid(B.concrete, F, -hw + t / 2, 0, H, H + ph, t, d - 2 * t, CONCRETE);
  solid(B.concrete, F, hw - t / 2, 0, H, H + ph, t, d - 2 * t, CONCRETE);
  // stair house
  if (opts.stair !== false && w > 9) {
    const su = (R() - 0.5) * (w - 6), sw = 3 + R() * 1.5;
    solid(B.concrete, F, su, hd * 0.3, H, H + 2.8, sw, 3.2, [0.72, 0.71, 0.68]);
    solid(B.plain, F, su, hd * 0.3 - 1.61, H, H + 2.1, 0.9, 0.04, [0.45, 0.47, 0.5]);
  }
  // elevated water tank (受水槽) on a steel frame
  if (R() < (opts.tank ?? 0.55)) {
    const tu = (R() - 0.5) * (w - 4), tw = (R() - 0.5) * (d - 4), s = 1.8 + R() * 1.4;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) solid(B.plain, F, tu + a * s * 0.42, tw + b * s * 0.42, H, H + 1.4, 0.12, 0.12, STEEL);
    solid(B.plain, F, tu, tw, H + 1.4, H + 1.4 + s * 0.8, s, s, [0.86, 0.86, 0.82]);
  }
  // outdoor AC units in a row
  const nAc = Math.floor((opts.ac ?? 1) * (2 + R() * Math.min(10, w / 3)));
  const acRow = (R() - 0.5) * (d - 3);
  for (let i = 0; i < nAc; i++) {
    const u = -hw + 1.2 + (i + 0.5) * Math.min(1.25, (w - 2.4) / Math.max(1, nAc));
    solid(B.plain, F, u, acRow, H, H + 0.75, 0.85, 0.32, [0.88, 0.88, 0.86]);
    solid(B.plain, F, u, acRow - 0.17, H + 0.15, H + 0.62, 0.5, 0.02, [0.35, 0.35, 0.36]);
  }
  // antenna mast
  if (R() < 0.6) {
    const au = (R() - 0.5) * (w - 2), aw = (R() - 0.5) * (d - 2);
    solid(B.plain, F, au, aw, H, H + 4 + R() * 3, 0.07, 0.07, STEEL);
    for (let k = 0; k < 3; k++) solid(B.plain, F, au, aw, H + 2.8 + k * 0.5, H + 2.84 + k * 0.5, 1.2 - k * 0.25, 0.04, STEEL);
  }
}

/** low concrete-block wall (ブロック塀) around a lot, with a gap for the gate */
function blockWall(B, F, R, lw, ld, gateU) {
  const h = 1.0 + R() * 0.4, t = 0.13;
  const col = R() < 0.7 ? [0.70, 0.69, 0.65] : [0.80, 0.74, 0.64];
  const hw = lw / 2, hd = ld / 2;
  const gate = 2.6;
  // front with gate gap
  const segs = [[-hw, gateU - gate / 2], [gateU + gate / 2, hw]];
  for (const [a, b] of segs) if (b - a > 0.3) solid(B.concrete, F, (a + b) / 2, -hd, 0, h, b - a, t, col);
  // gate posts
  for (const s of [-1, 1]) solid(B.concrete, F, gateU + s * gate / 2, -hd, 0, h + 0.25, 0.32, 0.32, col);
  // sides and back
  solid(B.concrete, F, -hw, 0, 0, h, t, ld, col);
  solid(B.concrete, F, hw, 0, 0, h, t, ld, col);
  if (R() < 0.6) solid(B.concrete, F, 0, hd, 0, h, lw, t, col);
}

/**
 * Builders take B = { house, apt, mansion, office, shop, factory, roofTile, roofMetal, concrete, plain, glass, sign }
 * (GeoBuffers per material) and a random function R. They return the footprint and,
 * optionally, garden shrubs { shrubs: [[u, w], …] } in local coordinates.
 */
export function house(B, F, R) {
  const w = 7 + R() * 4, d = 6.5 + R() * 3;
  const floors = R() < 0.82 ? 2 : 1;
  const base = 0.45;
  const H = floors * 2.9 + base;
  const wc = pick(HOUSE_WALLS, R());
  const L = B.lod ?? 2;     // 2 near the line … 0 far away (silhouette only)
  // concrete foundation (基礎) showing under the siding
  if (L > 0) solid(B.concrete, F, 0, 0, 0, base, w + 0.04, d + 0.04, [0.58, 0.57, 0.54]);
  boxWalls(B.house, F, w, d, base, H, TILE.house, wc, [1, 1, 1, 1], -base / TILE.house[1]);
  const rc = pick(ROOFS, R());
  const roofKind = R();
  const rh = 1.5 + R() * 0.8;
  let slope = null;     // front roof plane, for solar panels
  if (roofKind < 0.45) {
    gableRoof(B.roofTile, B.house, F, w, d, H, rh, 0.5, rc, wc, TILE.roofTile);
    slope = { y0: H - 0.5 * rh / (d / 2 + 0.5), w0: -d / 2 - 0.5, y1: H + rh, w1: 0, half: () => w / 2 };
  } else if (roofKind < 0.85) {
    hipRoof(B.roofTile, F, w, d, H, rh * 0.85, 0.55, rc, TILE.roofTile);
    const hwr = w / 2 + 0.55, hdr = d / 2 + 0.55, r = Math.max(0, hwr - hdr);
    slope = { y0: H - 0.55 * 0.4, w0: -hdr, y1: H + rh * 0.85, w1: 0, half: (f) => r + (hwr - r) * (1 - f) };
  } else {
    // flat-roofed modern box with a parapet
    flatTop(B.concrete, F, w, d, H, [0.62, 0.62, 0.6], TILE.concrete);
    solid(B.house, F, 0, -d / 2 + 0.08, H, H + 0.5, w, 0.16, wc);
    solid(B.house, F, 0, d / 2 - 0.08, H, H + 0.5, w, 0.16, wc);
    solid(B.house, F, -w / 2 + 0.08, 0, H, H + 0.5, 0.16, d, wc);
    solid(B.house, F, w / 2 - 0.08, 0, H, H + 0.5, 0.16, d, wc);
  }
  // solar panels on the front slope of some newer houses
  if (slope && R() < 0.3 && L > 0) {
    const f0 = 0.25, f1 = 0.85;
    const at = (f) => [slope.w0 + (slope.w1 - slope.w0) * f, slope.y0 + (slope.y1 - slope.y0) * f + 0.09];
    const [wa, ya] = at(f0), [wb, yb] = at(f1);
    const hu = Math.min(slope.half(f1), w / 2) * 0.8;
    B.office.quadUp(F.p(-hu, ya, wa), F.p(hu, ya, wa), F.p(hu, yb, wb), F.p(-hu, yb, wb),
      [[0, 0], [2 * hu / 2.0, 0], [2 * hu / 2.0, 1.6], [0, 1.6]], SOLAR);
  }
  // eaves gutter line (dark fascia) on pitched roofs
  if (slope && L > 0) solid(B.plain, F, 0, slope.w0 - 0.04, slope.y0 - 0.14, slope.y0 + 0.02, w + 1.0, 0.1, R() < 0.5 ? [0.85, 0.85, 0.83] : [0.30, 0.28, 0.26]);
  // balcony on the upper floor: slab, railing panel or aluminium rails
  const res = { w, d, shrubs: [], hedges: [] };
  if (L === 0) return res;
  if (floors === 2 && R() < 0.75) {
    const bw = 2.5 + R() * 2.5, bu = (R() - 0.5) * (w - bw);
    const y = base + 2.9;
    solid(B.plain, F, bu, -d / 2 - 0.5, y - 0.12, y, bw, 1.0, [0.8, 0.8, 0.78]);
    const panel = R() < 0.5;
    solid(B.plain, F, bu, -d / 2 - 0.98, y, y + (panel ? 1.0 : 0.06), bw, 0.05, panel ? [0.92, 0.92, 0.9] : [0.35, 0.33, 0.3]);
    if (!panel && L > 1) {
      // aluminium rails: top + middle rail and a few posts
      solid(B.plain, F, bu, -d / 2 - 0.98, y + 0.95, y + 1.02, bw, 0.06, [0.35, 0.33, 0.3]);
      solid(B.plain, F, bu, -d / 2 - 0.98, y + 0.5, y + 0.54, bw, 0.03, [0.35, 0.33, 0.3]);
      for (let k = 0; k <= 2; k++) solid(B.plain, F, bu - bw / 2 + k * bw / 2, -d / 2 - 0.98, y, y + 0.95, 0.04, 0.04, [0.38, 0.36, 0.33]);
    }
    // laundry pole with washing
    if (R() < 0.5 && L > 1) {
      solid(B.plain, F, bu, -d / 2 - 0.55, y + 1.6, y + 1.63, bw * 0.9, 0.03, STEEL);
      for (let k = 0; k < 3; k++) solid(B.plain, F, bu - bw * 0.3 + k * bw * 0.3, -d / 2 - 0.55, y + 0.9, y + 1.6, 0.6, 0.02, [0.6 + R() * 0.4, 0.6 + R() * 0.4, 0.6 + R() * 0.4]);
    }
  }
  // entrance: door and canopy
  const du = (R() < 0.5 ? -1 : 1) * (w / 2 - 1.6);
  solid(B.plain, F, du, -d / 2 - 0.03, base, base + 2.1, 1.0, 0.06, pick([[0.36, 0.26, 0.18], [0.24, 0.22, 0.2], [0.55, 0.42, 0.3], [0.75, 0.74, 0.7]], R()));
  if (L < 2) return res;
  solid(B.plain, F, du, -d / 2 - 0.45, base + 2.35, base + 2.45, 1.8, 0.9, [0.5, 0.5, 0.5]);
  solid(B.concrete, F, du, -d / 2 - 0.6, 0, base, 1.6, 1.2, CONCRETE);
  // outdoor AC units, water heater, downpipe
  solid(B.plain, F, w / 2 - 0.6, -d / 2 - 0.25, 0, 0.6, 0.8, 0.3, [0.92, 0.92, 0.9]);
  if (R() < 0.6) solid(B.plain, F, -w / 2 - 0.25, d / 4, 0, 1.4, 0.4, 0.7, [0.86, 0.86, 0.84]);
  solid(B.plain, F, w / 2 + 0.05, -d / 2 + 0.05, 0, H, 0.07, 0.07, [0.4, 0.38, 0.35]);
  // lot: block wall or a hedge
  const lw = w + 2.5 + R() * 1.5, ld = d + 3 + R() * 1.5;
  if (R() < 0.6) blockWall(B, F, R, lw, ld, du);
  else {
    // a trimmed hedge along the front with a gap at the gate, often down the sides too
    const hh = 1.1 + R() * 0.5;
    res.hedges.push([-lw / 2, du - 1.1, -ld / 2, -ld / 2, hh], [du + 1.1, lw / 2, -ld / 2, -ld / 2, hh]);
    if (R() < 0.6) res.hedges.push([-lw / 2, -lw / 2, -ld / 2, ld / 2, hh], [lw / 2, lw / 2, -ld / 2, ld / 2, hh]);
  }
  // clipped shrubs in the front garden / by the gate
  if (R() < 0.7) res.shrubs.push([(R() - 0.5) * (w - 2), -d / 2 - 1.2, 0.6 + R() * 0.3]);
  if (R() < 0.5) res.shrubs.push([(R() - 0.5) * w, d / 2 + 1.2, 0.8]);
  return res;
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
  flatTop(B.concrete, F, w, d, H + 0.6, [0.6, 0.6, 0.58], TILE.concrete);
  solid(B.house, F, 0, 0, H, H + 0.6, w + 0.3, d + 0.3, wc);
  // balcony slabs + railings on the front of every upper floor, partition between units
  const L = B.lod ?? 2;
  if (L === 0) { solid(B.plain, F, w / 2 + 1.1, 0, 0, H + 0.6, 2.0, 3.0, [0.55, 0.52, 0.48]); return { w: w + 2.2, d }; }
  for (let f = 1; f < floors; f++) {
    const y = f * 2.9;
    solid(B.plain, F, 0, -d / 2 - 0.55, y - 0.15, y, w, 1.1, [0.78, 0.77, 0.74]);
    solid(B.plain, F, 0, -d / 2 - 1.08, y, y + 1.05, w, 0.06, [0.9, 0.9, 0.88]);
    if (L > 1) for (let k = 0; k < units; k++) if (R() < 0.6) solid(B.plain, F, -w / 2 + k * 6 + 4.6, -d / 2 - 0.3, y, y + 0.6, 0.8, 0.3, [0.92, 0.92, 0.9]);
  }
  if (floors > 1 && L > 1) for (let k = 0; k <= units; k++) solid(B.plain, F, -w / 2 + k * 6, -d / 2 - 0.55, 2.9, H, 0.06, 1.1, [0.85, 0.85, 0.83]);
  // outside steel staircase and the open corridor on the back
  solid(B.plain, F, w / 2 + 1.1, 0, 0, H + 0.6, 2.0, 3.0, [0.55, 0.52, 0.48]);
  if (L > 1) for (let f = 1; f < floors; f++) {
    const y = f * 2.9;
    solid(B.plain, F, 0, d / 2 + 0.6, y - 0.12, y, w, 1.2, [0.7, 0.69, 0.66]);
    solid(B.plain, F, 0, d / 2 + 1.18, y, y + 1.0, w, 0.05, [0.55, 0.52, 0.48]);
  }
  return { w: w + 2.2, d: d + 2.4 };
}

export function mansion(B, F, R, maxFloors = 14) {
  const units = 3 + Math.floor(R() * 6);
  const w = units * 6, d = 11 + R() * 3;
  const floors = 5 + Math.floor(R() * (maxFloors - 4));
  const H = floors * 3.0;
  const wc = pick([[0.86, 0.82, 0.74], [0.80, 0.78, 0.74], [0.72, 0.66, 0.58], [0.92, 0.90, 0.86], [0.66, 0.60, 0.55], [0.58, 0.52, 0.48]], R());
  wall(B.mansion, F, -w / 2, -d / 2, w / 2, -d / 2, 0, H, TILE.mansion, wc);
  wall(B.mansion, F, w / 2, d / 2, -w / 2, d / 2, 0, H, TILE.mansion, wc, 0.5);
  wall(B.concrete, F, w / 2, -d / 2, w / 2, d / 2, 0, H, TILE.concrete, wc);
  wall(B.concrete, F, -w / 2, d / 2, -w / 2, -d / 2, 0, H, TILE.concrete, wc);
  flatTop(B.concrete, F, w, d, H, [0.6, 0.6, 0.58], TILE.concrete);
  // balconies: slab, frosted-glass or concrete railing, unit partitions (gives the
  // real depth and shadow lines of a Japanese condominium front)
  const L = B.lod ?? 2;
  const glassRail = R() < 0.55;
  const railCol = glassRail ? [0.72, 0.80, 0.84] : [wc[0] * 1.05, wc[1] * 1.05, wc[2] * 1.05];
  for (let f = 1; f < floors; f++) {
    const y = f * 3.0;
    solid(B.plain, F, 0, -d / 2 - 0.75, y - 0.2, y, w + 0.4, 1.5, [wc[0] * 0.95, wc[1] * 0.95, wc[2] * 0.95]);
    solid(glassRail ? B.glass : B.plain, F, 0, -d / 2 - 1.47, y, y + 1.1, w + 0.4, 0.06, railCol);
    if (L > 1) solid(B.plain, F, 0, -d / 2 - 1.47, y + 1.1, y + 1.16, w + 0.4, 0.09, [0.5, 0.5, 0.5]);
  }
  // unit partitions as full-height fins (one box each instead of one per floor)
  for (let k = 0; k <= units; k++) solid(B.plain, F, -w / 2 + k * 6, -d / 2 - 0.75, 3.0, H, 0.12, 1.5, [0.88, 0.88, 0.86]);
  if (L < 2) { solid(B.plain, F, w / 4, 0, H, H + 3.5, 5, 5, [0.75, 0.74, 0.7]); return { w, d: d + 1.5, h: H }; }
  // ground floor: entrance hall with glass and a canopy
  const eu = (R() - 0.5) * (w - 8);
  solid(B.office, F, eu, -d / 2 - 0.05, 0, 2.8, 5, 0.1, [0.75, 0.8, 0.85]);
  solid(B.plain, F, eu, -d / 2 - 1.5, 3.0, 3.2, 6, 3.0, [0.82, 0.82, 0.8]);
  solid(B.plain, F, w / 4, 0, H, H + 3.5, 5, 5, [0.75, 0.74, 0.7]);  // elevator machine room
  rooftop(B, F, R, w, d, H, { stair: false, ac: 0.6 });
  return { w, d: d + 1.5, h: H };
}

export function office(B, F, R) {
  const w = 16 + Math.floor(R() * 6) * 4, d = 14 + R() * 10;
  const floors = 4 + Math.floor(R() * 9);
  const H = floors * 3.8;
  boxWalls(B.office, F, w, d, 0, H, TILE.office, [0.9 + R() * 0.1, 0.95, 1]);
  flatTop(B.concrete, F, w, d, H, [0.55, 0.56, 0.58], TILE.concrete);
  const L = B.lod ?? 2;
  // horizontal spandrel ledges every floor give the facade depth
  if (L > 0) for (let f = 1; f <= floors; f++) {
    const y = f * 3.8 - 0.5;
    solid(B.plain, F, 0, -d / 2 - 0.12, y, y + 0.5, w + 0.24, 0.24, [0.72, 0.74, 0.76]);
  }
  solid(B.plain, F, 0, 0, H, H + 2.5, w * 0.4, d * 0.4, [0.7, 0.71, 0.72]);
  if (L > 1) rooftop(B, F, R, w, d, H, { parapet: 1.1, tank: 0.3, ac: 1.2 });
  // cooling tower
  if (R() < 0.5 && L > 0) solid(B.plain, F, -w / 4, d / 5, H, H + 3.2, 3.4, 3.4, [0.62, 0.66, 0.70]);
  // a company name board on the roof edge facing the line (fictional names)
  if (R() < 0.55 && B.sign && L > 0) {
    const bw = Math.min(w * 0.7, 14), y = H + 1.2;
    for (let k = 0; k < 3; k++) solid(B.plain, F, -bw / 2 + k * bw / 2, -d / 2 + 0.6, H, y + 0.1, 0.12, 0.12, STEEL);
    signFace(B.sign, F, -bw / 2, bw / 2, y, y + bw / 7, -d / 2 + 0.5, SIGN_WIDE[Math.floor(R() * SIGN_WIDE.length)]);
  }
  return { w, d, h: H };
}

export function shopRow(B, F, R) {
  const w = 16 + Math.floor(R() * 2) * 16, d = 10;
  const upper = 1 + Math.floor(R() * 2);
  const wc = pick(WALLS, R());
  const top = 4 + upper * 2.9;
  wall(B.shop, F, -w / 2, -d / 2, w / 2, -d / 2, 0, 4, TILE.shop, WHITE, Math.floor(R() * 4) / 4);
  wall(B.house, F, -w / 2, -d / 2, w / 2, -d / 2, 4, top, TILE.house, wc, R(), -4 / 2.9);
  wall(B.house, F, w / 2, -d / 2, w / 2, d / 2, 0, top, TILE.house, wc);
  wall(B.house, F, w / 2, d / 2, -w / 2, d / 2, 0, top, TILE.house, wc);
  wall(B.house, F, -w / 2, d / 2, -w / 2, -d / 2, 0, top, TILE.house, wc);
  flatTop(B.concrete, F, w, d, top, [0.6, 0.6, 0.58], TILE.concrete);
  const L = B.lod ?? 2;
  const n = L > 0 ? w / 4 : 0;
  for (let i = 0; i < n; i++) {
    const u0 = -w / 2 + i * 4, uc = u0 + 2;
    // sign board over each shop front + awning (テント)
    if (B.sign) signFace(B.sign, F, u0 + 0.15, u0 + 3.85, 3.15, 3.9, -d / 2 - 0.12, SIGN_WIDE[Math.floor(R() * SIGN_WIDE.length)]);
    if (R() < 0.55) {
      const c = pick([[0.75, 0.18, 0.15], [0.15, 0.35, 0.6], [0.2, 0.45, 0.28], [0.85, 0.6, 0.15], [0.5, 0.5, 0.5], [0.9, 0.9, 0.86]], R());
      B.plain.quadUp(F.p(u0 + 0.2, 3.05, -d / 2), F.p(u0 + 3.8, 3.05, -d / 2), F.p(u0 + 3.8, 2.55, -d / 2 - 1.1), F.p(u0 + 0.2, 2.55, -d / 2 - 1.1), [[0, 0], [1, 0], [1, 1], [0, 1]], c);
      B.plain.quad(F.p(u0 + 3.8, 2.35, -d / 2 - 1.1), F.p(u0 + 0.2, 2.35, -d / 2 - 1.1), F.p(u0 + 0.2, 2.55, -d / 2 - 1.1), F.p(u0 + 3.8, 2.55, -d / 2 - 1.1), [[0, 0], [1, 0], [1, 1], [0, 1]], c);
    }
    // vertical blade sign on the upper floors
    if (R() < 0.35 && B.sign && L > 1) bladeSign(B.sign, F, u0 + 0.3, -d / 2, 4.3, Math.min(top - 0.2, 4.3 + 2.6), 0.75, SIGN_TALL[Math.floor(R() * SIGN_TALL.length)]);
    // shop-front clutter: vending machine, bicycles, A-board
    if (R() < 0.25 && L > 1) solid(B.plain, F, uc + 1.2, -d / 2 - 0.45, 0, 1.83, 1.0, 0.75, pick([[0.85, 0.15, 0.12], [0.15, 0.4, 0.75], [0.92, 0.92, 0.9]], R()));
  }
  // air-con units on the roof edge
  if (L > 1) rooftop(B, F, R, w, d, top, { stair: false, tank: 0.35, ac: 0.5, parapet: 0.6 });
  return { w, d: d + 1.1 };
}

export function factory(B, F, R, W, D) {
  const w = W ?? 30 + R() * 50, d = D ?? 20 + R() * 25, H = 7 + R() * 4;
  const col = pick([[0.85, 0.88, 0.9], [0.75, 0.82, 0.88], [0.9, 0.88, 0.82], [0.7, 0.74, 0.7]], R());
  boxWalls(B.factory, F, w, d, 0, H, TILE.factory, col);
  const rc = pick([[0.45, 0.55, 0.62], [0.55, 0.55, 0.55], [0.35, 0.45, 0.4]], R());
  gableRoof(B.roofMetal, B.factory, F, w, d, H, 1.6, 0.3, rc, col, TILE.roofMetal);
  const L = B.lod ?? 2;
  if (L === 0) return { w, d };
  // ridge ventilators
  for (let u = -w / 2 + 3; u < w / 2 - 2; u += 6) solid(B.roofMetal, F, u, 0, H + 1.4, H + 2.3, 1.6, 1.2, [rc[0] * 0.9, rc[1] * 0.9, rc[2] * 0.9]);
  // roller shutters + office annex with windows at the front
  const ns = 1 + Math.floor(R() * 3);
  for (let i = 0; i < ns; i++) solid(B.plain, F, -w / 2 + 6 + i * 7, -d / 2 - 0.04, 0, 4.5, 4.5, 0.06, [0.62, 0.64, 0.66]);
  if (R() < 0.6) {
    const aw = 10 + R() * 6;
    boxWalls(B.apt, F, aw, 5, 0, 5.8, TILE.apt, [0.92, 0.92, 0.9]);
    flatTop(B.concrete, F, aw, 5, 5.8, CONCRETE, TILE.concrete);
  }
  if (B.sign && R() < 0.6) signFace(B.sign, F, -6, 6, H - 1.8, H - 0.3, -d / 2 - 0.06, SIGN_WIDE[Math.floor(R() * SIGN_WIDE.length)]);
  return { w, d };
}

// atlas rects of the sign texture (see textures.js signAtlas): u0, v0, u1, v1
export const SIGN_WIDE = [];
export const SIGN_TALL = [];
// wide boards: 2 × 8 cells of 512 × 64 px in the lower half; tall blade signs: 8 cells of 128 × 512 px on top
for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) SIGN_WIDE.push([c / 2 + 0.004, r / 16 + 0.003, (c + 1) / 2 - 0.004, (r + 1) / 16 - 0.003]);
for (let c = 0; c < 8; c++) SIGN_TALL.push([c / 8 + 0.004, 0.502, (c + 1) / 8 - 0.004, 0.998]);

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
