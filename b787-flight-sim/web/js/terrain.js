// Procedural terrain: identical height function in JS (collision / radio altimeter)
// and GLSL (rendering).  World frame = three.js (x, y up, z); the true directions depend on
// the local north (geo_data.js, util.northAt).
//
// Geography (blender/geo.py -> geo_data.js): land polygons (Kanto, Honshu, Kinki, Hokkaido,
// Okinawa), water polygons cut out of them (Tokyo Bay, Osaka Bay, Sagami Bay, the Kii channel,
// Lake Shikotsu, Tsugaru strait ...), small islands, mountain peaks (Fuji, Rokko, Eniwa,
// Tarumae, Yotei ...), the airports' flat zones (hard = sea wall for the island airports).
// Heights: coastal plains rising inland, fbm hills, cones / ridges for the mountains; the sea
// deepens away from the coast, with a shallow coral shelf around Okinawa.

import { GEO } from './geo_data.js';
import { FLATS } from './airports.js';

export const TERRAIN = {
  flats: FLATS,
  seaDepth: -38,
  waterLevel: -0.35,
};

// kept for the old world.json fields (the flat zones now come from geo_data.js)
export function configureTerrain() {}

// ---- integer hash value noise (bit-identical to the GLSL version) ----------
function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffffff) / 16777216;
}

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f + i * 17.3, z * f - i * 9.1);
    f *= 2.03; amp *= 0.5;
  }
  return s;
}

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// ---- polygons ----------------------------------------------------------------
// packed: vertices, per polygon [start, count, kind (0 land, 1 water, 2 island)] + bounding box
const VERTS = [], POLYS = [];
for (const [kind, list] of [[0, GEO.land], [1, GEO.water], [2, GEO.islands]]) {
  for (const P of list) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    POLYS.push({ s: VERTS.length, n: P.length, kind, x0, x1, z0, z1 });
    for (const v of P) VERTS.push(v);
  }
}

// signed distance to a polygon (negative inside), Inigo Quilez
function sdPoly(px, pz, P) {
  const V = VERTS;
  // far from the polygon: the bounding box distance is a good lower bound
  const bx = Math.max(P.x0 - px, 0, px - P.x1), bz = Math.max(P.z0 - pz, 0, pz - P.z1);
  if (bx > 2000 || bz > 2000) return Math.hypot(bx, bz);
  let d = Infinity, sg = 1;
  for (let i = 0, j = P.n - 1; i < P.n; j = i, i++) {
    const vi = V[P.s + i], vj = V[P.s + j];
    const ex = vj[0] - vi[0], ez = vj[1] - vi[1];
    const wx = px - vi[0], wz = pz - vi[1];
    const t = Math.min(Math.max((wx * ex + wz * ez) / (ex * ex + ez * ez), 0), 1);
    const qx = wx - ex * t, qz = wz - ez * t;
    d = Math.min(d, qx * qx + qz * qz);
    const c1 = pz >= vi[1], c2 = pz < vj[1], c3 = ex * wz > ez * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sg = -sg;
  }
  return sg * Math.sqrt(d);
}

// signed distance to the coast (negative on land)
export function coastDist(x, z) {
  let dl = 1e9, dw = 1e9, di = 1e9;
  for (const P of POLYS) {
    const d = sdPoly(x, z, P);
    if (P.kind === 0) dl = Math.min(dl, d); else if (P.kind === 1) dw = Math.min(dw, d); else di = Math.min(di, d);
  }
  return Math.min(Math.max(dl, -dw), di) - coastWiggle(x, z);
}

// The geography polygons are 8-100 km straight segments: a ruler-straight shore from the air.
// A fractal offset adds headlands, coves and a ragged small-scale edge. It only ever moves the
// shore seawards (up to ~300 m), so nothing built on land ends up in the water, and it fades out
// around the airports (sea walls, island runways).
function coastWiggle(x, z) {
  let df = 1e9;
  for (const f of GEO.flats) df = Math.min(df, Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1)));
  const k = smooth(1500, 4500, df);
  if (k <= 0) return 0;
  const a = fbm(x / 3200 + 11.3, z / 3200 - 4.7, 3), b = fbm(x / 520 - 2.1, z / 520 + 8.9, 2);
  return k * (Math.max(0, a - 0.35) * 620 + b * 55);
}

const PEAKS = GEO.peaks;          // [x, z, h, r, cone]
const REEF = GEO.reef;            // [x, z, radius]
const FL = GEO.flats;             // {x0, x1, z0, z1, hard}

export function terrainHeight(x, z) {
  const d = coastDist(x, z);
  let h;
  if (d < 0) {
    // land: coastal plain, hills rising inland, mountains
    const inland = smooth(0, 9000, -d);
    const n = fbm(x / 7000, z / 7000, 6);
    h = 2 + (10 + 170 * n * n) * inland;
    for (const p of PEAKS) {
      const dx = x - p[0], dz = z - p[1];
      if (Math.abs(dx) > p[3] * 2.2 || Math.abs(dz) > p[3] * 2.2) continue;
      const r = Math.hypot(dx, dz) / p[3];
      if (p[4]) h += p[2] * Math.pow(Math.max(0, 1 - r), 1.6) * (0.92 + 0.16 * fbm(x / 900, z / 900, 3));
      else {
        const ridge = 1 - Math.abs(2 * fbm(x / 6000 + 3.1, z / 6000, 4) - 1);
        h += p[2] * Math.exp(-r * r * 2.2) * (0.35 + 0.9 * ridge * ridge) * inland;
      }
    }
    h *= smooth(0, 60, -d);                    // beaches / sea walls meet the water at ~0
  } else {
    // sea: shelf, then the deep ocean; a shallow coral shelf around Okinawa
    // the shore shelves down over ~250 m (a 2 m step at the coast made the waterline follow
    // the terrain grid: a staircase coast from the air)
    h = -(2 + Math.min(d * 0.01, 45) + Math.max(0, d - 8000) * 0.004) * smooth(0, 250, d);
    const rd = Math.hypot(x - REEF[0], z - REEF[1]);
    if (rd < REEF[2]) {
      const reef = -1.1 - Math.min(d * 0.0016, 3.5) - Math.max(0, d - 1800) * 0.04;
      h = Math.max(h, reef);
    }
    h = Math.max(h, -400);
  }
  // airport flat zones: exactly 0 inside; soft ones blend into the land around them
  for (const f of FL) {
    const dx = Math.max(f.x0 - x, 0, x - f.x1), dz = Math.max(f.z0 - z, 0, z - f.z1);
    if (dx === 0 && dz === 0) return 0;
    if (!f.hard && h > 0) {
      const df = Math.hypot(dx, dz);
      if (df < 3500) h *= smooth(0, 3500, df);
    }
  }
  return h;
}

export function isWater(x, z) {
  return terrainHeight(x, z) < TERRAIN.waterLevel;
}

// ---- GLSL ------------------------------------------------------------------------
const f1 = (v) => v.toFixed(1);
const v4 = (F) => `vec4(${f1(F.x0)}, ${f1(F.x1)}, ${f1(F.z0)}, ${f1(F.z1)})`;
// flat zones of every airport as GLSL constants (also used by the terrain colouring)
export const FLATS_GLSL = `const int N_FLATS = ${FL.length};
const vec4 cFlats[${FL.length}] = vec4[${FL.length}](${FL.map(v4).join(', ')});
const float cFlatHard[${FL.length}] = float[${FL.length}](${FL.map((f) => (f.hard ? '1.0' : '0.0')).join(', ')});
float flatsDist(vec2 p) {
  float d = 1e9;
  for (int i = 0; i < N_FLATS; i++) { vec4 F = cFlats[i]; d = min(d, length(vec2(max(max(F.x - p.x, 0.0), p.x - F.y), max(max(F.z - p.y, 0.0), p.y - F.w)))); }
  return d;
}
bool inFlats(vec2 p, float m) {
  for (int i = 0; i < N_FLATS; i++) { vec4 F = cFlats[i]; if (p.x > F.x - m && p.x < F.y + m && p.y > F.z - m && p.y < F.w + m) return true; }
  return false;
}`;

const vec2s = VERTS.map(([x, z]) => `vec2(${f1(x)}, ${f1(z)})`).join(', ');
const polys = POLYS.map((P) => `ivec3(${P.s}, ${P.n}, ${P.kind})`).join(', ');
const boxes = POLYS.map((P) => v4(P)).join(', ');
const peaks = PEAKS.map((p) => `vec4(${f1(p[0])}, ${f1(p[1])}, ${f1(p[2])}, ${f1(p[3] * (p[4] ? -1 : 1))})`).join(', ');

export const TERRAIN_GLSL = /* glsl */`
${FLATS_GLSL}
const int N_VERTS = ${VERTS.length};
const int N_POLYS = ${POLYS.length};
const int N_PEAKS = ${PEAKS.length};
const vec2 cVerts[${VERTS.length}] = vec2[${VERTS.length}](${vec2s});
const ivec3 cPolys[${POLYS.length}] = ivec3[${POLYS.length}](${polys});
const vec4 cBoxes[${POLYS.length}] = vec4[${POLYS.length}](${boxes});
const vec4 cPeaks[${PEAKS.length}] = vec4[${PEAKS.length}](${peaks});
const vec3 cReef = vec3(${f1(REEF[0])}, ${f1(REEF[1])}, ${f1(REEF[2])});

float t_hash2(int ix, int iz) {
  uint h = uint(ix) * 374761393u + uint(iz) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return float(h & 0xffffffu) / 16777216.0;
}
float t_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int ix = int(i.x), iz = int(i.y);
  float a = t_hash2(ix, iz), b = t_hash2(ix + 1, iz), c = t_hash2(ix, iz + 1), d = t_hash2(ix + 1, iz + 1);
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float t_fbm(vec2 p, int oct) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += amp * t_vnoise(p * f + vec2(float(i) * 17.3, -float(i) * 9.1));
    f *= 2.03; amp *= 0.5;
  }
  return s;
}
float t_sdPoly(vec2 p, int k) {
  vec4 B = cBoxes[k];
  vec2 bb = vec2(max(max(B.x - p.x, 0.0), p.x - B.y), max(max(B.z - p.y, 0.0), p.y - B.w));
  if (bb.x > 2000.0 || bb.y > 2000.0) return length(bb);
  ivec3 P = cPolys[k];
  float d = 1e18, sg = 1.0;
  for (int i = 0, j = P.y - 1; i < P.y; j = i, i++) {
    vec2 vi = cVerts[P.x + i], vj = cVerts[P.x + j];
    vec2 e = vj - vi, w = p - vi;
    vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(q, q));
    bool c1 = p.y >= vi.y, c2 = p.y < vj.y, c3 = e.x * w.y > e.y * w.x;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sg = -sg;
  }
  return sg * sqrt(d);
}
float coastDist(vec2 p) {
  float dl = 1e9, dw = 1e9, di = 1e9;
  for (int k = 0; k < N_POLYS; k++) {
    float d = t_sdPoly(p, k);
    int kind = cPolys[k].z;
    if (kind == 0) dl = min(dl, d); else if (kind == 1) dw = min(dw, d); else di = min(di, d);
  }
  float dfl = flatsDist(p);
  float kw = smoothstep(1500.0, 4500.0, dfl);
  float wig = 0.0;
  if (kw > 0.0) {
    float a = t_fbm(p / 3200.0 + vec2(11.3, -4.7), 3), b = t_fbm(p / 520.0 + vec2(-2.1, 8.9), 2);
    wig = kw * (max(0.0, a - 0.35) * 620.0 + b * 55.0);
  }
  return min(max(dl, -dw), di) - wig;
}
float terrainHeight(vec2 xz) {
  float x = xz.x, z = xz.y;
  float d = coastDist(xz);
  float h;
  if (d < 0.0) {
    float inland = smoothstep(0.0, 9000.0, -d);
    float n = t_fbm(xz / 7000.0, 6);
    h = 2.0 + (10.0 + 170.0 * n * n) * inland;
    for (int i = 0; i < N_PEAKS; i++) {
      vec4 P = cPeaks[i];
      float R = abs(P.w);
      vec2 dd = xz - P.xy;
      if (abs(dd.x) > R * 2.2 || abs(dd.y) > R * 2.2) continue;
      float r = length(dd) / R;
      if (P.w < 0.0) h += P.z * pow(max(0.0, 1.0 - r), 1.6) * (0.92 + 0.16 * t_fbm(xz / 900.0, 3));
      else {
        float ridge = 1.0 - abs(2.0 * t_fbm(xz / 6000.0 + vec2(3.1, 0.0), 4) - 1.0);
        h += P.z * exp(-r * r * 2.2) * (0.35 + 0.9 * ridge * ridge) * inland;
      }
    }
    h *= smoothstep(0.0, 60.0, -d);
  } else {
    h = -(2.0 + min(d * 0.01, 45.0) + max(0.0, d - 8000.0) * 0.004) * smoothstep(0.0, 250.0, d);
    float rd = length(xz - cReef.xy);
    if (rd < cReef.z) {
      float reef = -1.1 - min(d * 0.0016, 3.5) - max(0.0, d - 1800.0) * 0.04;
      h = max(h, reef);
    }
    h = max(h, -400.0);
  }
  for (int i = 0; i < N_FLATS; i++) {
    vec4 F = cFlats[i];
    vec2 df2 = vec2(max(max(F.x - x, 0.0), x - F.y), max(max(F.z - z, 0.0), z - F.w));
    if (df2.x == 0.0 && df2.y == 0.0) return 0.0;
    if (cFlatHard[i] < 0.5 && h > 0.0) {
      float df = length(df2);
      if (df < 3500.0) h *= smoothstep(0.0, 3500.0, df);
    }
  }
  return h;
}
`;
