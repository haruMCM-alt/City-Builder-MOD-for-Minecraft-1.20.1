// Procedural terrain: identical height function in JS (collision / radio altimeter)
// and GLSL (rendering).  World frame = three.js (x east, y up, z south).
// The airport + city area (world.json flatZone) is exactly flat at height 0; the
// sea lies south of the coast, a river crosses the city, hills and mountains rise
// outside the flat zone.

export const TERRAIN = {
  flat: { x0: -5200, x1: 11200, z0: -9800, z1: 1400 },
  // second airport, ~200 km east (see airport2.js)
  flat2: { x0: 186000, x1: 214000, z0: -12500, z1: -5500 },
  coastZ: 1400,
  river: { x: 3000, w: 220, z0: -9800, z1: 1400 },
  seaDepth: -38,
  waterLevel: -0.35,
};

export function configureTerrain(world) {
  if (!world) return;
  if (world.flatZone) Object.assign(TERRAIN.flat, world.flatZone);
  if (world.coastZ !== undefined) TERRAIN.coastZ = world.coastZ;
  if (world.river) Object.assign(TERRAIN.river, { x: world.river.x, w: world.river.width, z0: world.river.z0, z1: world.river.z1 });
}

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

export function terrainHeight(x, z) {
  const F = TERRAIN.flat;
  // distance outside the flat rectangle
  const dx = Math.max(F.x0 - x, 0, x - F.x1);
  const dz = Math.max(F.z0 - z, 0, z - F.z1);
  const d = Math.hypot(dx, dz);
  const F2 = TERRAIN.flat2;
  const d2 = Math.hypot(Math.max(F2.x0 - x, 0, x - F2.x1), Math.max(F2.z0 - z, 0, z - F2.z1));
  const flatBlend = Math.min(smooth(0, 3500, d), smooth(0, 3000, d2));
  // hills + northern mountains
  const n = fbm(x / 7000, z / 7000, 6);
  let hills = 20 + 520 * n * n;
  const north = 1 - smooth(-34000, -14000, z);
  const ridge = 1 - Math.abs(2 * fbm(x / 11000 + 3.1, z / 11000, 5) - 1);
  hills += 1500 * north * ridge * ridge;
  let h = hills * flatBlend;
  // coastline (straight inside the flat zone's x-range, wavy elsewhere)
  const wx = smooth(0, 4000, Math.max(F.x0 - x, 0, x - F.x1));
  const zc = TERRAIN.coastZ + wx * (fbm(x / 16000, 7.7, 4) - 0.5) * 6000;
  const sea = smooth(zc - 30, zc + 500, z);
  h = h * (1 - sea) + TERRAIN.seaDepth * sea;
  // river through the city
  const R = TERRAIN.river;
  if (z > R.z0 - 3000 && z < R.z1 + 400) {
    const rw = R.w / 2;
    const bank = 1 - smooth(rw - 6, rw + 8, Math.abs(x - R.x));
    const along = smooth(R.z0 - 2500, R.z0, z);
    h = Math.min(h, h * (1 - bank * along) - 5 * bank * along);
  }
  return h;
}

export function isWater(x, z) {
  return terrainHeight(x, z) < TERRAIN.waterLevel;
}

// GLSL implementation (WebGL2 / GLSL ES 3.0).  Uniforms injected by the material.
const F2 = TERRAIN.flat2;
export const TERRAIN_GLSL = /* glsl */`
uniform vec4 uFlat;      // x0, x1, z0, z1
const vec4 cFlat2 = vec4(${F2.x0.toFixed(1)}, ${F2.x1.toFixed(1)}, ${F2.z0.toFixed(1)}, ${F2.z1.toFixed(1)});
uniform float uCoastZ;
uniform vec4 uRiver;     // x, w, z0, z1
uniform float uSeaDepth;

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
float terrainHeight(vec2 xz) {
  float x = xz.x, z = xz.y;
  float dx = max(max(uFlat.x - x, 0.0), x - uFlat.y);
  float dz = max(max(uFlat.z - z, 0.0), z - uFlat.w);
  float d = length(vec2(dx, dz));
  float d2 = length(vec2(max(max(cFlat2.x - x, 0.0), x - cFlat2.y), max(max(cFlat2.z - z, 0.0), z - cFlat2.w)));
  float flatBlend = min(smoothstep(0.0, 3500.0, d), smoothstep(0.0, 3000.0, d2));
  float n = t_fbm(vec2(x, z) / 7000.0, 6);
  float hills = 20.0 + 520.0 * n * n;
  float north = 1.0 - smoothstep(-34000.0, -14000.0, z);
  float ridge = 1.0 - abs(2.0 * t_fbm(vec2(x / 11000.0 + 3.1, z / 11000.0), 5) - 1.0);
  hills += 1500.0 * north * ridge * ridge;
  float h = hills * flatBlend;
  float wx = smoothstep(0.0, 4000.0, max(max(uFlat.x - x, 0.0), x - uFlat.y));
  float zc = uCoastZ + wx * (t_fbm(vec2(x / 16000.0, 7.7), 4) - 0.5) * 6000.0;
  float sea = smoothstep(zc - 30.0, zc + 500.0, z);
  h = h * (1.0 - sea) + uSeaDepth * sea;
  if (z > uRiver.z - 3000.0 && z < uRiver.w + 400.0) {
    float rw = uRiver.y * 0.5;
    float bank = 1.0 - smoothstep(rw - 6.0, rw + 8.0, abs(x - uRiver.x));
    float along = smoothstep(uRiver.z - 2500.0, uRiver.z, z);
    h = min(h, h * (1.0 - bank * along) - 5.0 * bank * along);
  }
  return h;
}
`;
