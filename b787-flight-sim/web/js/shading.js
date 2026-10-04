// Surface-detail shader patches shared by the aircraft, AI traffic, GSE and city buildings.
// They work on top of the Blender textures: procedural weathering (grime, streaks, gloss
// variation), per-facade variation of the city buildings and randomised lit windows.
import * as THREE from 'three';

export const NOISE_GLSL = `
float shHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float shNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(shHash(i), shHash(i + vec3(1, 0, 0)), f.x), mix(shHash(i + vec3(0, 1, 0)), shHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(shHash(i + vec3(0, 0, 1)), shHash(i + vec3(1, 0, 1)), f.x), mix(shHash(i + vec3(0, 1, 1)), shHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

// Aircraft skin weathering. posExpr: GLSL expression for the vertex position in the
// aircraft frame (x forward, y up, z to the right, metres). kind: 'paint' | 'engine' | 'gear'.
const WX_KIND = { paint: [0.05, 0.06, 0.09, 0.0], engine: [0.07, 0.10, 0.06, 0.22], gear: [0.10, 0.08, 0.12, 0.0] };
export function patchWeathering(sh, posExpr, kind = 'paint') {
  const k = WX_KIND[kind] || WX_KIND.paint;
  const f = (v) => v.toFixed(3);
  if (!sh.vertexShader.includes('varying vec3 vWxP;')) {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWxP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWxP = ${posExpr};`);
  }
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWxP;\n${NOISE_GLSL}\nfloat wxMott = 0.5;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 q = vWxP;
  wxMott = shNoise(q * 0.9) * 0.6 + shNoise(q * 3.7) * 0.4;
  float streak = shNoise(vec3(q.x * 0.07, q.y * 2.4, q.z * 2.4));            // flow-wise streaks
  float belly = smoothstep(0.6, -2.4, q.y);                                   // road dust / hydraulic grime underneath
  float soot = smoothstep(0.3, 1.0, shNoise(vec3(q.x * 0.5, q.y * 4.0, q.z * 4.0))) * smoothstep(-1.0, -4.0, q.x);
  float g = ${f(k[0])} * wxMott + ${f(k[1])} * streak * streak + ${f(k[2])} * belly + ${f(k[3])} * soot;
  diffuseColor.rgb *= 1.0 - g;
}`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.78 + 0.5 * wxMott), 0.04, 1.0);`);
}

const PAINT = /(Fuselage|WingPaint|Tail|GearPaint|LeadingEdge|Navy|Stab|Fin|Wing|Flap|Slat|Door)/;
const ENGINE = /(Nacelle|CoreCowl|Exhaust|InletLip|EngineDark)/;
export function weatherKind(name) {
  if (!name || /Glass|Light|Strobe|Beacon|Window|Tire|Chrome|FanBlade|Spinner|Antenna/.test(name)) return null;
  if (ENGINE.test(name)) return 'engine';
  if (/Gear|Wheel/.test(name)) return 'gear';
  if (PAINT.test(name)) return 'paint';
  return null;
}

// AI / parked aircraft (LOD models): weathering in object space, added to any existing patch
export function weatherModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) weatherMaterial(m);
  });
}
export function weatherMaterial(m) {
  if (!m || m.userData.weathered) return;
  const kind = weatherKind(m.name);
  if (!kind) return;
  m.userData.weathered = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); patchWeathering(sh, 'position', kind); };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|wx-' + kind;
  m.needsUpdate = true;
}

// Ground vehicles: dirty lower body, worn paint, gloss variation (object space, metres)
export function weatherGSE(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.userData.weathered || !/^GSE_(Yellow|DarkGrey|Grey|White|Blue|Orange|Tail|Metal|Black)/.test(m.name)) continue;
      m.userData.weathered = true;
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGxP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGxP = position;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec3 vGxP;\n${NOISE_GLSL}\nfloat gxW = 0.0, gxM = 0.5;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 q = vGxP;
  gxM = shNoise(q * 2.3) * 0.6 + shNoise(q * 9.0) * 0.4;
  float low = 1.0 - smoothstep(0.15, 1.1, q.y);                               // road spray on the lower body
  float spray = low * (0.55 + 0.45 * shNoise(vec3(q.x * 6.0, q.y * 1.5, q.z * 6.0)));
  float streak = shNoise(vec3(q.x * 5.0, q.y * 0.35, q.z * 5.0));
  gxW = smoothstep(0.72, 0.9, shNoise(q * 6.5) * 0.7 + shNoise(q * 23.0) * 0.3);  // chipped paint
  vec3 dirt = vec3(0.34, 0.30, 0.25);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * dirt * 1.6, clamp(0.55 * spray + 0.12 * streak * streak, 0.0, 0.8));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.33, 0.34), gxW * 0.6);
  diffuseColor.rgb *= 0.93 + 0.1 * gxM;
}`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.8 + 0.45 * gxM) + 0.25 * gxW, 0.05, 1.0);`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.85, gxW * 0.6);`);
      };
      m.customProgramCacheKey = () => 'gse-wx';
      m.needsUpdate = true;
    }
  });
}

// City facades: per-facade tint, rain streaks below the windows, dirt near the ground,
// large-scale breakup of the tiled texture and randomised lit windows at night.
// allLit: every window lit (terminal glazing) instead of a random pattern of lit floors
export function patchFacade(m, allLit = false) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFcP; varying vec3 vFcN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFcP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vFcN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFcP; varying vec3 vFcN;
${NOISE_GLSL}
float fcFace = 0.5, fcWet = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 n = normalize(vFcN);
  float wall = 1.0 - smoothstep(0.5, 0.8, abs(n.y));
  vec2 hz = normalize(n.xz + 1e-5);
  float across = dot(vFcP.xz, vec2(-hz.y, hz.x));                 // horizontal coordinate along the facade
  float depth = dot(vFcP.xz, hz);                                 // facade plane offset
  fcFace = shHash(vec3(floor(depth * 0.5), floor(hz.x * 3.0 + 3.5), floor(hz.y * 3.0 + 3.5)));
  vec3 tint = mix(vec3(0.94, 0.95, 1.0), vec3(1.06, 1.02, 0.95), fcFace);
  float big = shNoise(vec3(across * 0.02, vFcP.y * 0.03, depth * 0.02));
  float streak = shNoise(vec3(across * 1.7, vFcP.y * 0.05, depth)) * shNoise(vec3(across * 0.4, vFcP.y * 0.02, depth + 7.0));
  float ground = exp(-max(vFcP.y, 0.0) / 3.0);
  float f = (0.9 + 0.2 * big) * (1.0 - 0.22 * streak * wall) * (1.0 - 0.28 * ground * wall);
  diffuseColor.rgb *= mix(vec3(1.0), tint, wall) * f;
  fcWet = streak * wall;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.85 + 0.3 * fcWet), 0.03, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // windows lit per floor band and facade differently from the repeating texture
  float fl = floor(vFcP.y / 3.6);
  float h1 = shHash(vec3(fl, fcFace * 91.0, 3.1));
  float h2 = shHash(vec3(floor(dot(vFcP.xz, normalize(vec2(-vFcN.z, vFcN.x) + 1e-5)) / 7.0), fl, fcFace * 57.0));
  float on = ${allLit ? '0.85 + 0.15 * h2' : 'step(0.3, h1) * step(0.25, h2)'};
  vec3 warm = mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.9, 1.05), step(0.7, h2));
  totalEmissiveRadiance *= on * warm * (0.6 + 0.8 * h1);
}`);
  };
  m.customProgramCacheKey = () => (allLit ? 'facade-lit' : 'facade-wx');
  m.needsUpdate = true;
}

// Airport structures (jet bridges, terminal cladding, hangars, masts): nothing outdoors stays
// factory-clean. World-space weathering: rain streaks running down vertical faces from the
// top edges, dust on upward faces, grime splashed up from the apron at the foot of walls,
// and slightly uneven paint / panel tone and gloss.
export function patchStructure(m) {
  if (!m || m.userData.structure) return;
  m.userData.structure = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStP; varying vec3 vStN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vStP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vStN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vStP; varying vec3 vStN;\n${NOISE_GLSL}\nfloat stMott = 0.5;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 q = vStP;
  vec3 n = normalize(vStN);
  float px = length(fwidth(q));
  float fine = 1.0 - smoothstep(0.05, 0.6, px);
  stMott = shNoise(q * 0.35) * 0.55 + shNoise(q * 1.7) * 0.3 + shNoise(q * 7.0) * 0.15 * fine;
  float vert = 1.0 - abs(n.y);
  // streaks: long in y, narrow across; stronger just below ledges (period ~ storey height)
  vec2 hz = abs(n.x) > abs(n.z) ? q.zy : q.xy;
  float st = shNoise(vec3(hz.x * 2.2, hz.y * 0.12, 3.1)) * 0.7 + shNoise(vec3(hz.x * 7.0, hz.y * 0.3, 8.4)) * 0.3;
  float ledge = 0.55 + 0.45 * smoothstep(0.35, 0.0, fract(q.y / 4.2));
  float streak = smoothstep(0.52, 0.85, st) * vert * ledge;
  float dust = smoothstep(0.3, 0.9, n.y) * (0.5 + 0.5 * shNoise(q * 0.8));
  float splash = vert * smoothstep(1.2, 0.0, q.y - floor(q.y / 400.0) * 0.0) * (0.6 + 0.4 * shNoise(q * 3.0));
  float g = 0.07 * (stMott - 0.5) * 2.0 + 0.16 * streak + 0.1 * dust + 0.14 * splash;
  diffuseColor.rgb *= clamp(1.0 - g, 0.6, 1.08);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.99, 0.94), 0.5 * dust + 0.4 * streak);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.85 + 0.35 * stMott), 0.05, 1.0);`);
  };
  m.customProgramCacheKey = ((k) => () => (k ? k() : '') + '|structure')(m.customProgramCacheKey?.bind(m));
  m.needsUpdate = true;
}

// Real-world finishes for the aircraft (player and AI models), high / ultra quality:
//  * paint: a clear coat over the base colour -- the glossy, sharp sky reflection on an airliner
//  * leading edges, inlet lips: polished bare aluminium / titanium
//  * tyres: dull rubber with a dusty sheen
// The glTF materials are standard ones; paint materials become MeshPhysicalMaterial in place.
const FINISH = {
  B787_Fuselage: { clearcoat: 0.8, clearcoatRoughness: 0.07 },
  B787_Tail: { clearcoat: 0.8, clearcoatRoughness: 0.07 },
  B787_WingPaint: { clearcoat: 0.45, clearcoatRoughness: 0.16 },
  B787_Nacelle: { clearcoat: 0.7, clearcoatRoughness: 0.09 },
  B787_Navy: { clearcoat: 0.7, clearcoatRoughness: 0.09 },
  B787_GearPaint: { clearcoat: 0.35, clearcoatRoughness: 0.3 },
};
export function upgradeAircraftMaterials(root, quality) {
  if (quality !== 'high' && quality !== 'ultra') return;
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const one = (m) => {
      if (!m) return m;
      if (done.has(m)) return done.get(m);
      let out = m;
      const f = FINISH[m.name];
      if (f && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) {
        const p = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(p, m);
        p.defines = { STANDARD: '', PHYSICAL: '' };          // (the standard copy drops PHYSICAL)
        p.userData = { ...m.userData };
        p.clearcoat = f.clearcoat; p.clearcoatRoughness = f.clearcoatRoughness;
        out = p;
      } else if (m.name === 'B787_LeadingEdge' || m.name === 'B787_InletLip') {
        m.metalness = 1.0; m.roughness = m.name === 'B787_InletLip' ? 0.16 : 0.22;
        m.color.setRGB(0.80, 0.81, 0.82);
      } else if (m.name === 'B787_Tire' && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) {
        const p = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(p, m);
        p.defines = { STANDARD: '', PHYSICAL: '' };
        p.userData = { ...m.userData };
        p.roughness = 0.93; p.sheen = 0.5; p.sheenRoughness = 0.8; p.sheenColor = new THREE.Color(0.25, 0.23, 0.21);
        out = p;
      }
      done.set(m, out);
      return out;
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
}
