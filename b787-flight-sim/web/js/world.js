// Environment renderer: sky + sun cycle, image-based lighting, GPU terrain,
// water, the Blender-built airport/city (world.glb), instanced trees, clouds,
// airfield / city lights and parked aircraft.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TERRAIN, TERRAIN_GLSL, FLATS_GLSL, terrainHeight } from './terrain.js';
import { patchFacade, patchStructure } from './shading.js';
import { GROUND_GLSL } from './ground.js';
import { stripTriangles, textSign, signTexts } from './signs.js';
import { clamp, smoothstep, lerp, mulberry32, DEG, northAt, freezeStatic } from './util.js';
import { GEO } from './geo_data.js';

const LIGHT_KIND = { steady: 0, directional: 1, papi: 2, sequenced: 3, blink: 4, night: 5 };
const NIGHT_ONLY = { has: (n) => /^(a\d+_)?(street|landmark|bridge|apron_flood)$/.test(n) };

// Display-referred custom shaders (clouds, light points, smoke) output sRGB-ish colours.
// When the HDR post chain is active they are converted to linear radiance instead.
export const HDR = { uLin: { value: 0 }, uGain: { value: 1 }, uGainL: { value: 1 } };
const HDR_GLSL = 'uniform float uLin, uGain, uGainL;';

export const WEATHER = {
  clear: { cover: 0.08, base: 1800, top: 2300, vis: 60000, overcast: 0, wind: 1, hum: 0.3 },
  scattered: { cover: 0.35, base: 1300, top: 2400, vis: 40000, overcast: 0, wind: 1, hum: 0.5 },
  broken: { cover: 0.7, base: 900, top: 2200, vis: 22000, overcast: 0.4, wind: 1.2, hum: 0.72 },
  overcast: { cover: 1.0, base: 450, top: 1700, vis: 7000, overcast: 1, wind: 1.4, hum: 0.9 },
  rain: { cover: 1.0, base: 320, top: 2600, vis: 3800, overcast: 1, wind: 1.6, rain: 1, hum: 1 },
};

// runway / ground wetness (0 dry .. 1 soaked), shared by the pavement shaders
export const WET = { uWet: { value: 0 } };

// Daylight balance. On a clear day the direct sun gives ~5x the illuminance of the whole sky;
// the old balance (sun 3.4 against the sky IBL + a hemisphere fill) was closer to 1 : 1, which
// is what made shadows faint and everything bluish-white. The sun is raised, the fill cut and
// the exposure lowered to match, so a sunlit white surface stays where it was on screen.
export const LIGHT = { SUN_K: 2.5, EXP_K: 0.58, HEMI_K: 0.35, dayK: 1 };

// ------------------------------------------------------------------ textures
function noiseCanvas(size, seed, channels = 3, scales = [8, 32, 4]) {
  // tileable value noise, two octaves per channel (each octave has its own lattice)
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(seed);
  const lattice = (cells) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return { cells, g };
  };
  const layers = scales.map((cells) => [lattice(cells), lattice(cells * 2), lattice(cells * 4)]);
  const sample = (L, u, v) => {
    const n = L.cells;
    const fx = u * n, fy = v * n;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const x0 = ix % n, x1 = (ix + 1) % n, y0 = iy % n, y1 = (iy + 1) % n;
    const a = L.g[y0 * n + x0], b = L.g[y0 * n + x1], cc = L.g[y1 * n + x0], d = L.g[y1 * n + x1];
    return lerp(lerp(a, b, sx), lerp(cc, d, sx), sy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const L = layers[Math.min(ch, layers.length - 1)];
        let n = sample(L[0], u, v) * 0.6 + sample(L[1], u, v) * 0.28 + sample(L[2], u, v) * 0.12;
        if (ch >= channels) n = 0;
        img.data[i + ch] = Math.round(n * 255);
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function waterNormalCanvas(size = 256, seed = 5) {
  // sum of periodic waves -> height -> normal
  const rnd = mulberry32(seed);
  const waves = [];
  for (let i = 0; i < 18; i++) {
    const kx = Math.round((rnd() * 2 - 1) * 9), ky = Math.round((rnd() * 2 - 1) * 9);
    waves.push({ kx: kx || 1, ky, a: 1 / (1 + Math.hypot(kx, ky)), ph: rnd() * Math.PI * 2 });
  }
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (const w of waves) s += w.a * Math.sin(2 * Math.PI * (w.kx * x + w.ky * y) / size + w.ph);
      h[y * size + x] = s;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + (x + 1) % size] - h[y * size + (x - 1 + size) % size];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function puffCanvas(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(99);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const r = size * (0.12 + rnd() * 0.2);
    const x = size / 2 + (rnd() - 0.5) * size * 0.5;
    const y = size / 2 + (rnd() - 0.5) * size * 0.35;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// Runway surface detail in the shader (world frame: runway 09/27 along x, +/-1750 m, 60 m wide):
// tyre rubber in the touchdown zones concentrated on the main-gear and nose-gear tracks,
// worn centre lanes, fine aggregate grain and longitudinal paving joints.
function patchPavement(m) {
  const kind = { W_Asphalt: 'asphalt', W_TaxiAsphalt: 'taxi', W_Shoulder: 'shoulder', W_Concrete: 'concrete',
    W_MarkWhite: 'mark', W_MarkYellow: 'mark', W_Road: 'road' }[m.name];
  const asphalt = kind === 'asphalt' || kind === 'taxi' || kind === 'shoulder' || kind === 'road';
  const concrete = kind === 'concrete';
  const mark = kind === 'mark';
  m.metalness = 0;
  m.envMapIntensity = 0.42;      // sky light : sun about 1 : 5 on a clear day (was ~1 : 1)
  // aged asphalt reflects ~11 %, concrete ~33 %: the colours below are physical albedos
  const base = { asphalt: '0.106, 0.099, 0.090', taxi: '0.092, 0.088, 0.082', shoulder: '0.140, 0.134, 0.124',
    road: '0.085, 0.082, 0.078' }[kind];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = WET.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRwP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRwP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRwP;
${GROUND_GLSL}
float rwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rwNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rwHash(i), rwHash(i + vec2(1, 0)), f.x), mix(rwHash(i + vec2(0, 1)), rwHash(i + vec2(1, 1)), f.x), f.y); }
float rwRubber = 0.0;
float rwWet = 0.0;
float gH = 0.0;
float gRough = 0.9;
uniform float uWet;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 wp = vRwP;
  vec2 p = wp.xz;
  float ax = abs(wp.x), az = abs(wp.z);
  float px = length(fwidth(p));                          // metres per pixel
  float aa = 1.0 - smoothstep(0.015, 0.2, px);           // millimetre-scale detail
  float mm = 1.0 - smoothstep(0.25, 2.5, px);            // decimetre-scale detail
  bool rwy = az < 30.5 && ax < 1760.0;
  if (rwy) {
    float d = 1750.0 - ax;                                 // metres past the threshold
    float tdz = smoothstep(90.0, 260.0, d) * (1.0 - smoothstep(650.0, 1250.0, d));
    float tracks = exp(-pow((az - 4.9) / 1.7, 2.0)) + 0.55 * exp(-pow(az / 1.3, 2.0));
    float spread = smoothstep(12.0, 3.0, az);
    float streak = rwNoise(vec2(wp.x * 0.04, wp.z * 2.2)) * 0.55 + rwNoise(vec2(wp.x * 0.35, wp.z * 7.0)) * 0.45;
    rwRubber = clamp(tdz * (0.6 * tracks + 0.4 * spread) * (0.35 + streak), 0.0, 1.0);
  }
  ${asphalt ? `
  // paving lanes along the runway, repair patches, aggregate stones in the bitumen,
  // wandering cracks and the sealant over the lane joints
  float lane = rwy ? gHash(vec2(floor((wp.z + 30.0) / 7.5), 1.0)) : 0.5;
  float patchN = gFbm(p * 0.03);
  float repair = smoothstep(0.78, 0.8, gNoise(floor(p / 6.0) * 0.37 + 11.0)) * mm;
  float cell = gCell(p * 26.0);
  float stone = (1.0 - smoothstep(0.16, 0.4, cell)) * gHash(floor(p * 26.0) + 3.0);
  float grain = gNoise(p * 95.0);
  float agg = mix(1.0, (0.84 + 0.28 * grain) * (1.0 + 0.7 * stone), aa);
  // rare thin random cracks, and on the runway transverse cracks every 8-25 m sealed with
  // tar ("tar snakes"), slightly wandering and not always across the full width
  float crackMask = smoothstep(0.62, 0.8, gFbm(p * 0.045 + 7.0));
  float cr = gCrack(p * 0.33, 0.006) * crackMask * mm * 0.7;
  if (rwy) {
    float cx = floor(wp.x / 14.0);
    float xc = cx * 14.0 + 2.5 + gHash(vec2(cx, 5.0)) * 9.0 + (gNoise(vec2(wp.z * 0.18, cx)) - 0.5) * 1.6
             + (gNoise(vec2(wp.z * 1.3, cx * 1.7)) - 0.5) * 0.22;
    float present = step(0.3, gHash(vec2(cx, 9.0))) * smoothstep(0.25, 0.5, gNoise(vec2(wp.z * 0.05, cx * 3.0)));
    cr = max(cr, (1.0 - smoothstep(0.02, 0.035 + px, abs(wp.x - xc))) * present * mm);
  }
  float seal = rwy ? (1.0 - smoothstep(0.025, 0.08, abs(fract((wp.z + 30.0) / 7.5 + 0.5) - 0.5) * 7.5)) * mm : 0.0;
  vec3 col = vec3(${base}) * (0.93 + 0.12 * lane) * (0.88 + 0.24 * patchN) * agg;
  col *= 1.0 - 0.18 * repair;
  col = mix(col, vec3(0.045, 0.043, 0.041), max(cr * 0.75, seal * 0.35));
  // bleached, oxidised surface away from the traffic, darker where the wheels run
  if (rwy) col *= 1.0 - 0.12 * smoothstep(14.0, 4.0, az) - 0.8 * rwRubber;
  diffuseColor.rgb = col;
  gH = ((0.3 - cell) * 0.006 * (0.5 + stone) + (grain - 0.5) * 0.0015) * aa - cr * 0.004 + seal * 0.0015;
  gRough = 0.93 - 0.2 * seal - 0.08 * repair;` : ''}
  ${concrete ? `
  // apron slabs: 7.5 m joints with dark sealant, per-slab tone, replaced slabs, broom
  // texture, corner cracks, tyre marks and oil / hydraulic stains
  vec2 sl = floor(p / 7.5);
  vec2 fr = fract(p / 7.5);
  float slab = gHash(sl);
  float newer = step(0.93, gHash(sl + 7.0));
  vec2 fj = abs(fr - 0.5) * 7.5;
  // 2 cm sealed joint: coverage scales with the pixel footprint, so from a distance the joints
  // fade to a faint grid instead of drawing thick black lines
  float jd = 3.75 - max(fj.x, fj.y);
  float joint = (1.0 - smoothstep(0.01, 0.01 + px, jd)) * min(1.0, 0.03 / max(px, 1e-4));
  float broom = gNoise(vec2(p.x * 1.3, p.y * 60.0)) * 0.6 + gNoise(vec2(p.x * 3.1, p.y * 140.0)) * 0.4;
  float sand = gNoise(p * 120.0);
  float blot = gFbm(p * 0.06);
  float oil = smoothstep(0.64, 0.8, gFbm(p * 0.22 + 3.0)) * (0.6 + 0.4 * gNoise(p * 2.3));
  float rust = smoothstep(0.8, 0.9, gFbm(p * 0.5 + 9.0)) * 0.5;
  float tyre = smoothstep(0.7, 0.85, gNoise(vec2(p.x * 0.05, p.y * 1.1) + sl.y * 3.1)) * mm;
  // corner crack: a short, slightly jagged line cutting one corner of some slabs
  float cmask = step(0.8, gHash(sl + 13.0));
  vec2 cq = vec2(gHash(sl + 21.0) < 0.5 ? fr.x : 1.0 - fr.x, gHash(sl + 22.0) < 0.5 ? fr.y : 1.0 - fr.y) * 7.5;
  float cL = 1.2 + 2.2 * gHash(sl + 23.0);
  float cd = abs(cq.x + cq.y * (0.7 + 0.6 * gHash(sl + 24.0)) - cL + (gNoise(p * 3.0) - 0.5) * 0.25);
  float ccr = (1.0 - smoothstep(0.008, 0.02 + px, cd)) * step(cq.x, cL) * step(cq.y, cL * 1.4) * cmask * mm;
  vec3 col = vec3(0.285, 0.275, 0.255) * (0.92 + 0.12 * slab) * (0.9 + 0.2 * blot);
  col = mix(col, vec3(0.34, 0.33, 0.30), newer);
  col *= mix(1.0, (0.9 + 0.12 * broom) * (0.93 + 0.1 * sand), aa);
  col = mix(col, vec3(0.08, 0.075, 0.07), oil * 0.55);
  col = mix(col, vec3(0.30, 0.21, 0.14), rust * 0.35);
  col *= 1.0 - 0.18 * tyre;
  col = mix(col, vec3(0.07, 0.068, 0.064), max(joint * 0.8, ccr * 0.8));
  diffuseColor.rgb = col;
  rwRubber = 0.5 * oil;
  gH = (broom - 0.5) * 0.0012 * aa + (sand - 0.5) * 0.0006 * aa - joint * 0.008 * mm - ccr * 0.003;
  gRough = 0.86 - 0.3 * oil;` : ''}
  ${mark ? `
  // paint: worn and chipped (more in the touchdown zone), slightly raised
  // worn zones where the paint has thinned: the tops of the aggregate show through as fine
  // dark speckles (not blotches); most wear where the wheels run
  float worn = smoothstep(0.45, 0.8, gFbm(p * 0.6)) * 0.6 + (rwy ? 0.6 * rwRubber : 0.0);
  float fine = gNoise(p * 70.0) * 0.6 + (1.0 - smoothstep(0.1, 0.35, gCell(p * 26.0))) * 0.4;
  float wear = smoothstep(1.0 - worn * 0.7, 1.05 - worn * 0.6, fine) * mm;
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.8 * (0.94 + 0.08 * gNoise(p * 9.0)), vec3(0.1, 0.095, 0.09), wear * 0.9);
  diffuseColor.rgb *= 1.0 - 0.7 * rwRubber;
  gH = (1.0 - wear) * 0.0012 * aa;
  gRough = 0.72;` : ''}
  if (uWet > 0.0) {
    // water fills the low spots first: puddles, then a continuous film
    float pud = smoothstep(0.42, 0.7, rwNoise(wp.xz * 0.07) * 0.7 + rwNoise(wp.xz * 0.31) * 0.3);
    rwWet = uWet * mix(0.55, 1.0, pud);
    diffuseColor.rgb *= 1.0 - 0.42 * rwWet;
    gH *= 1.0 - rwWet * pud;                              // standing water is flat
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = gRough;
roughnessFactor *= 1.0 - 0.3 * rwRubber;
roughnessFactor = mix(roughnessFactor, 0.08, rwWet * 0.85);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = gBump(normal, - vViewPosition, gH, 1.0);`);
  };
  m.customProgramCacheKey = () => 'rwy3-' + kind;
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ world
export class World {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.time = 0;
    this.tod = 15.5;
    this.weather = WEATHER.scattered;
    this.weatherName = 'scattered';
    this.night = 0;
    this.emissiveMats = [];
    this.treeChunks = [];
    this.parked = [];
    this._envKey = '';

    // --- sky -----------------------------------------------------------------
    this.sky = new Sky();
    this.sky.scale.setScalar(900000);
    this.sky.frustumCulled = false;
    const su = this.sky.material.uniforms;
    su.turbidity.value = 2.0;
    su.rayleigh.value = 1.0;
    su.mieCoefficient.value = 0.003;
    su.mieDirectionalG.value = 0.82;
    scene.add(this.sky);
    // environment scene for PMREM (sky + dark ground)
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envSky.material = this.sky.material;
    this.envScene.add(this.envSky);
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32),
      new THREE.MeshBasicMaterial({ color: 0x1b2216 }));
    envGround.rotation.x = -Math.PI / 2;
    envGround.position.y = -8;
    this.envGroundMat = envGround.material;
    this.envScene.add(envGround);
    // overcast: a grey dome in the reflection environment (wet runway reflects grey, not blue)
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12),   // inside the PMREM far plane (100)
      new THREE.MeshBasicMaterial({ color: 0x8c9096, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false }));
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    // --- stars ---------------------------------------------------------------------
    const sg = new THREE.BufferGeometry();
    const sp = [], rnd = mulberry32(7);
    for (let i = 0; i < 2500; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      if (u < -0.05) continue;
      sp.push(r * Math.cos(a) * 800000, u * 800000, r * Math.sin(a) * 800000);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // --- lights -------------------------------------------------------------------
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 3000;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd7ff, 0x3a3a2c, 0.6);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8fa6d8, 0);
    scene.add(this.moon);

    scene.fog = new THREE.FogExp2(0xbfd0e0, 1 / 40000);

    this._buildTerrain();
    this._buildWater();
  }

  // ---------------------------------------------------------------------- terrain
  // camera-centred grid, dense near the centre and coarse at the horizon
  static radialGrid(N, R, a = 0.018) {
    const f = (t) => Math.sign(t) * R * (a * Math.abs(t) + (1 - a) * Math.pow(Math.abs(t), 3.3));
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    let k = 0;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        pos[k++] = f(i / N * 2 - 1); pos[k++] = 0; pos[k++] = f(j / N * 2 - 1);
      }
    }
    const idx = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a0 = j * (N + 1) + i, b0 = a0 + 1, c0 = a0 + N + 1, d0 = c0 + 1;
        idx.push(a0, c0, b0, b0, c0, d0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).fill(0), 3));
    geo.setIndex(idx);
    return geo;
  }

  _buildTerrain() {
    const NG = this.quality === 'low' ? 160 : 256;
    const geo = World.radialGrid(NG, 70000);
    // Performance: height and normal of every grid vertex (the full terrain function: coast
    // polygons, wiggle, peaks, flats - evaluated three times for the normal) are baked into a
    // float texture only when the grid moves (16 m steps); the vertex shader just reads one
    // texel. Same function, same values: the picture does not change, the cost per frame does.
    this._bakeOK = this.renderer.capabilities.isWebGL2 && this.renderer.extensions.has('EXT_color_buffer_float');
    if (this._bakeOK) {
      const ga = new Float32Array((NG + 1) * (NG + 1) * 2);
      for (let j = 0, k = 0; j <= NG; j++) for (let i = 0; i <= NG; i++) { ga[k++] = i; ga[k++] = j; }
      geo.setAttribute('aGrid', new THREE.BufferAttribute(ga, 2));
      this.terrainRT = new THREE.WebGLRenderTarget(NG + 1, NG + 1, { type: THREE.FloatType, format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
      this.terrainBakeU = { uCenter: { value: new THREE.Vector2() }, uN: { value: NG } };
      this.terrainBake = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: this.terrainBakeU, depthTest: false, depthWrite: false,
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `precision highp float;
uniform vec2 uCenter; uniform float uN;
${TERRAIN_GLSL}
float gmap(float t) { return sign(t) * 70000.0 * (0.018 * abs(t) + 0.982 * pow(abs(t), 3.3)); }
void main() {
  vec2 ij = floor(gl_FragCoord.xy);
  vec2 t = ij / uN * 2.0 - 1.0;
  vec2 pos = vec2(gmap(t.x), gmap(t.y));
  vec2 wxz = pos + uCenter;
  float h0 = terrainHeight(wxz);
  float e = max(3.0, length(pos) * 0.006);
  float hx = terrainHeight(wxz + vec2(e, 0.0));
  float hz = terrainHeight(wxz + vec2(0.0, e));
  gl_FragColor = vec4(h0, normalize(vec3(h0 - hx, e, h0 - hz)));
}`,
      }));
      this._bakedAt = null;
    }
    const detail = new THREE.CanvasTexture(noiseCanvas(256, 3, 3, [16, 8, 4]));
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.colorSpace = THREE.NoColorSpace;
    detail.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, envMapIntensity: 0.42 });
    this.terrainUniforms = {
      uCenter: { value: new THREE.Vector2() },
      uDetail: { value: detail },
      uTerrH: { value: this.terrainRT ? this.terrainRT.texture : null },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.terrainUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', this._bakeOK ? `#include <common>
uniform vec2 uCenter; uniform sampler2D uTerrH; attribute vec2 aGrid;
varying vec3 vTW; varying float vSlope;` : `#include <common>
uniform vec2 uCenter;
varying vec3 vTW; varying float vSlope;
${TERRAIN_GLSL}`)
        .replace('#include <beginnormal_vertex>', this._bakeOK ? `
vec2 wxz = position.xz + uCenter;
vec4 tH = texelFetch(uTerrH, ivec2(aGrid + 0.5), 0);
float h0 = tH.x;
vec3 objectNormal = tH.yzw;
vSlope = 1.0 - objectNormal.y;
vTW = vec3(wxz.x, h0, wxz.y);` : `
vec2 wxz = position.xz + uCenter;
float h0 = terrainHeight(wxz);
float e = max(3.0, length(position.xz) * 0.006);
float hx = terrainHeight(wxz + vec2(e, 0.0));
float hz = terrainHeight(wxz + vec2(0.0, e));
vec3 objectNormal = normalize(vec3(h0 - hx, e, h0 - hz));
vSlope = 1.0 - objectNormal.y;
vTW = vec3(wxz.x, h0, wxz.y);`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, h0, position.z);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uDetail;
${FLATS_GLSL}
const vec2 cCTS = vec2(${GEO.airports[2].x.toFixed(1)}, ${GEO.airports[2].z.toFixed(1)});
const vec2 cOKA = vec2(${GEO.airports[3].x.toFixed(1)}, ${GEO.airports[3].z.toFixed(1)});
const int N_URB = ${GEO.urban.length};
const vec4 cUrb[N_URB] = vec4[N_URB](${GEO.urban.map((u) => `vec4(${u[0].toFixed(1)}, ${u[1].toFixed(1)}, ${u[2].toFixed(1)}, ${u[3].toFixed(3)})`).join(', ')});
float tfH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
${GROUND_GLSL}
float gH = 0.0;
float gRough = 0.97;
varying vec3 vTW; varying float vSlope;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 d1 = texture2D(uDetail, vTW.xz / 23.0).rgb;
  vec3 d2 = texture2D(uDetail, vTW.xz / 410.0).rgb;
  vec3 d3 = texture2D(uDetail, vTW.xz / 5300.0).rgb;
  float h = vTW.y;
  // grass at real-world albedo (lush ~0.07, dry ~0.2): tones mixed at several scales, dry
  // and lush patches, and close up clumps, bare soil and single blades
  float tpx = length(fwidth(vTW.xz));                    // metres per pixel
  float nearC = 1.0 - smoothstep(0.06, 0.5, tpx);        // clump scale visible
  float nearB = 1.0 - smoothstep(0.008, 0.06, tpx);      // blade scale visible
  float nA = gFbm(vTW.xz / 55.0);
  float nB = gFbm(vTW.xz / 7.5);
  float nC = gNoise(vTW.xz / 1.1) * 0.6 + gNoise(vTW.xz / 0.37) * 0.4;
  float nD = gNoise(vTW.xz * 7.0) * 0.6 + gNoise(vTW.xz * 19.0) * 0.4;
  vec3 lush = vec3(0.052, 0.095, 0.024), midG = vec3(0.10, 0.145, 0.042), dry = vec3(0.23, 0.205, 0.105);
  vec3 grass = mix(lush, midG, smoothstep(0.25, 0.75, d2.r * 0.55 + nA * 0.45));
  grass = mix(grass, dry, smoothstep(0.58, 0.82, d3.g * 0.55 + nA * 0.45) * 0.75);
  grass *= 0.8 + 0.4 * mix(d1.r, nB, 0.6);
  grass *= mix(1.0, 0.72 + 0.56 * nC, nearC);
  float soil = smoothstep(0.74, 0.86, nB * 0.6 + nC * 0.4) * nearC * 0.6;
  grass = mix(grass, vec3(0.13, 0.10, 0.07) * (0.8 + 0.4 * nD), soil);
  grass *= mix(1.0, 0.7 + 0.6 * nD, nearB);
  // mowed airport infield: alternating stripes, greener where it is watered by the drains
  float airport = inFlats(vTW.xz, 0.0) ? 1.0 : 0.0;
  // regional climate: Hokkaido (snow lower, paler grass), Okinawa (lush, coral sand)
  float hok = 1.0 - smoothstep(60000.0, 150000.0, length(vTW.xz - cCTS));
  float oki = 1.0 - smoothstep(60000.0, 140000.0, length(vTW.xz - cOKA));
  grass = mix(grass, grass * vec3(1.06, 1.02, 0.92), hok * 0.6);
  grass = mix(grass, grass * vec3(0.9, 1.12, 0.85), oki);
  grass = mix(grass, grass * (0.9 + 0.14 * step(0.5, fract(vTW.x / 24.0))) * vec3(0.95, 1.06, 0.9), airport);
  // airfield grass is not a lawn: sun-dried, yellowed patches on the sandy reclaimed ground,
  // greener lines along the drainage ditches (~180 m apart) and bare, darker soil strips
  {
    float dryA = smoothstep(0.42, 0.72, gFbm(vTW.xz / 380.0 + 7.1) * 0.75 + nB * 0.25);
    float ditch = 1.0 - smoothstep(1.5, 4.0 + tpx, abs(fract(vTW.z / 180.0 + gNoise(vTW.xz / 900.0) * 0.08) - 0.5) * 180.0);
    vec3 dryG = vec3(0.24, 0.215, 0.12) * (0.85 + 0.3 * nC);
    grass = mix(grass, mix(grass, dryG, 0.7 * dryA), airport);
    grass = mix(grass, vec3(0.04, 0.08, 0.025), airport * ditch * 0.6);
  }
  gH = ((nB - 0.5) * 0.08 + (nC - 0.5) * 0.05 * nearC + (nD - 0.5) * 0.02 * nearB) * (1.0 - soil * 0.5);
  vec3 forest = vec3(0.035, 0.065, 0.022) * (0.7 + 0.6 * d1.g) * (0.8 + 0.4 * nB);
  float fm = smoothstep(0.52, 0.6, d3.r * 0.7 + d2.b * 0.3) * smoothstep(15.0, 60.0, h);
  vec3 col = mix(grass, forest, fm);
  // farmland patchwork outside the city: rotated field blocks, crops, soil, hedgerows
  {
    vec2 fp = vTW.xz;
    vec2 blk = floor(fp / 2400.0);
    float an = (tfH(blk) - 0.5) * 0.9;
    vec2 r = mat2(cos(an), -sin(an), sin(an), cos(an)) * fp;
    vec2 fsz = vec2(230.0, 150.0) * (0.8 + 0.5 * tfH(blk + 5.0));
    vec2 cell = floor(r / fsz), fr = fract(r / fsz);
    float hc = tfH(cell + blk * 37.0);
    vec3 fc = hc < 0.28 ? vec3(0.085, 0.14, 0.035) : hc < 0.46 ? vec3(0.25, 0.22, 0.11)
            : hc < 0.62 ? vec3(0.14, 0.105, 0.07) : hc < 0.8 ? vec3(0.06, 0.115, 0.03) : vec3(0.31, 0.27, 0.13);
    fc *= 0.82 + 0.3 * d1.r + 0.12 * (tfH(cell + 3.3) - 0.5);
    float px = length(fwidth(r));
    float rows = step(0.5, fract(r.x / 3.2 + hc * 7.0)) * (1.0 - smoothstep(0.4, 1.6, px));
    fc *= 1.0 - 0.1 * rows;
    float edge = min(min(fr.x, 1.0 - fr.x) * fsz.x, min(fr.y, 1.0 - fr.y) * fsz.y);
    float hedge = 1.0 - smoothstep(1.5, 5.0 + px, edge);
    fc = mix(fc, vec3(0.05, 0.09, 0.035), hedge * 0.75);
    float outside = inFlats(vTW.xz, 400.0) ? 0.0 : 1.0;
    float farm = smoothstep(0.38, 0.5, d3.b * 0.8 + d2.r * 0.2) * (1.0 - fm) * (1.0 - smoothstep(60.0, 220.0, h))
               * smoothstep(-0.2, 0.4, h) * (1.0 - smoothstep(0.06, 0.18, vSlope)) * outside;
    col = mix(col, fc, farm);
  }
  // urban fabric of Tokyo, Osaka, Sapporo and Naha (geo.py districts): roofs and paving in
  // ~90 m blocks with darker streets and pocket parks under the instanced buildings
  {
    float urb = 0.0;
    for (int i = 0; i < N_URB; i++) {
      vec4 u = cUrb[i];
      float d = length(vTW.xz - u.xy) + (nA - 0.5) * u.z * 0.35;
      urb = max(urb, u.w * (1.0 - smoothstep(u.z * 0.5, u.z, d)));
    }
    // land test, not height: the terrain around the airports is levelled to ~0 m for 3.5 km,
    // which used to leave a golf-course lawn where Ota / Izumisano / Chitose / Naha are
    urb *= smoothstep(-0.2, 0.4, h) * (1.0 - smoothstep(0.12, 0.3, vSlope)) * (inFlats(vTW.xz, 150.0) ? 0.0 : 1.0);
    if (urb > 0.001) {
      vec2 bc = floor(vTW.xz / 90.0), bf = fract(vTW.xz / 90.0);
      float edge = min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)) * 90.0;
      float street = 1.0 - smoothstep(5.0, 6.0 + tpx, edge);
      float lt = tfH(floor(vTW.xz / 22.0) + bc * 3.1);
      vec3 lot = lt < 0.3 ? vec3(0.27, 0.26, 0.245) : lt < 0.55 ? vec3(0.13, 0.13, 0.135)
               : lt < 0.8 ? vec3(0.31, 0.285, 0.25) : vec3(0.18, 0.19, 0.2);
      lot *= 0.8 + 0.35 * d1.r;
      float park = step(tfH(bc + 9.7), 0.1 * (1.2 - urb));
      lot = mix(lot, grass * 1.1, park);
      vec3 ucol = mix(lot, vec3(0.085, 0.085, 0.09) * (0.9 + 0.2 * nB), street);
      col = mix(col, ucol, clamp(urb * 1.5, 0.0, 0.94));
      gH *= 1.0 - clamp(urb * 1.5, 0.0, 1.0) * 0.8;
    }
  }
  vec3 rock = vec3(0.24, 0.225, 0.2) * (0.7 + 0.5 * d1.b) * (0.8 + 0.4 * nB);
  gH += smoothstep(0.22, 0.42, vSlope) * (nB - 0.5) * 0.4;
  col = mix(col, rock, smoothstep(0.22, 0.42, vSlope));
  col = mix(col, rock, smoothstep(750.0, 1150.0, h + d2.g * 250.0));
  float snowLine = mix(1500.0, 750.0, hok);
  float snow = smoothstep(snowLine - 200.0, snowLine, h + d2.r * 200.0) * (1.0 - smoothstep(0.45, 0.7, vSlope));
  col = mix(col, vec3(0.9, 0.93, 0.97), snow);
  vec3 sand = mix(vec3(0.42, 0.37, 0.27), vec3(0.62, 0.6, 0.53), oki) * (0.85 + 0.3 * d1.r) * mix(1.0, 0.85 + 0.3 * nD, nearB);
  col = mix(col, sand, smoothstep(-0.05, -1.2, h));
  col = mix(col, vec3(0.16, 0.19, 0.17), smoothstep(-6.0, -30.0, h));
  diffuseColor.rgb = col;
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = gBump(normal, - vViewPosition, gH, 1.0);`);
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.frustumCulled = false;
    this.terrain.receiveShadow = true;
    this.terrain.renderOrder = -1;
    this.scene.add(this.terrain);
  }

  _buildWater() {
    const nt = new THREE.CanvasTexture(waterNormalCanvas());
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
    nt.colorSpace = THREE.NoColorSpace;
    const size = 140000;
    nt.repeat.set(size / 55, size / 55);
    nt.anisotropy = 8;
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0c2a3a, roughness: 0.07, metalness: 0.0, normalMap: nt,
      normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 1.0, clearcoat: 0.0,
    });
    this.waterNormal = nt;
    // three wave scales (swell, wind waves, ripples) drifting in different directions break the
    // tiling; the depth from the terrain gives shallow water its colour and the shore its foam
    this.waterU = { uWTime: { value: 0 }, uWaterLevel: { value: TERRAIN.waterLevel } };
    // water depth per vertex from a baked copy of the terrain function as well (see _buildTerrain)
    if (this._bakeOK) {
      this.waterRT = new THREE.WebGLRenderTarget(97, 97, { type: THREE.FloatType, format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
      const wm = this.terrainBake.material.clone();
      wm.uniforms = { uCenter: { value: new THREE.Vector2() }, uN: { value: 96 } };
      this.waterBakeU = wm.uniforms;
      this.waterBake = new FullScreenQuad(wm);
      this.waterU.uWaterH = { value: this.waterRT.texture };
    }
    this.waterMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.waterU, this.terrainUniforms);
      // the water depth comes from the terrain function, per vertex (the grid is dense near the
      // camera) - the polygon coastline is too expensive per pixel
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', this._bakeOK ? `#include <common>
varying vec3 vWW; varying float vWDepth;
uniform float uWaterLevel; uniform sampler2D uWaterH; attribute vec2 aGrid;` : `#include <common>
varying vec3 vWW; varying float vWDepth;
uniform float uWaterLevel;
${TERRAIN_GLSL}`)
        .replace('#include <begin_vertex>', this._bakeOK ? `#include <begin_vertex>
vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWDepth = uWaterLevel - texelFetch(uWaterH, ivec2(aGrid + 0.5), 0).x;` : `#include <begin_vertex>
vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWDepth = uWaterLevel - terrainHeight(vWW.xz);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWW; varying float vWDepth;
uniform float uWTime, uWaterLevel;
${GROUND_GLSL}
float wFoam = 0.0, wSlick = 0.0, wGust = 0.5;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float depth = vWDepth;
  // deep water: dark blue-green body colour, shallow: sand showing through (turquoise)
  vec3 deep = vec3(0.012, 0.045, 0.06), shallow = vec3(0.06, 0.2, 0.19), sandC = vec3(0.3, 0.27, 0.19);
  float sh = exp(-max(depth, 0.0) / 3.5);
  vec3 wc = mix(deep, shallow, exp(-max(depth, 0.0) / 14.0));
  wc = mix(wc, sandC, sh * 0.55);
  // breaking foam along the shore, pulsing with the swell
  float swell = 0.5 + 0.5 * sin(uWTime * 0.8 - depth * 2.2 + gNoise(vWW.xz * 0.05) * 6.0);
  float fn = gFbm(vWW.xz * 0.35 + vec2(uWTime * 0.05, 0.0));
  // surf: a narrow broken line where the shelf gets shallow, not a wide white band
  wFoam = smoothstep(0.75, 0.12, depth) * smoothstep(0.42, 0.8, fn * 0.7 + swell * 0.5) * step(-0.5, depth) * 0.85;
  // open water seen from the air is never one flat colour: gust patches (cat's paws) darken and
  // roughen it at km scale, wind-row slicks lie as smooth, brighter streaks along the wind,
  // scattered whitecaps where the wind is strongest
  vec2 wp = vWW.xz + vec2(uWTime * 1.5, uWTime * 0.6);
  wGust = gFbm(wp / 2200.0) * 0.65 + gFbm(wp / 600.0 + 3.7) * 0.35;
  wSlick = smoothstep(0.62, 0.8, gNoise(vec2(wp.x / 900.0, wp.y / 70.0 + gNoise(wp / 1500.0) * 3.0))) * (1.0 - wGust * 0.6);
  float deepK = smoothstep(2.0, 8.0, depth);
  wc *= mix(1.0, 0.75 + 0.45 * (1.0 - wGust), deepK);
  wc = mix(wc, wc * 1.18 + vec3(0.004, 0.008, 0.01), wSlick * deepK);
  float wpx = length(fwidth(vWW.xz));
  float capN = gNoise(vWW.xz / 7.0 + vec2(uWTime * 0.35, -uWTime * 0.2)) * 0.6 + gNoise(vWW.xz / 2.3 + 9.1) * 0.4;
  float caps = smoothstep(0.86, 0.95, capN) * smoothstep(0.5, 0.85, wGust) * deepK;
  // beyond the resolving distance the caps average out to a faint lightening, not sparkle
  caps = mix(caps, smoothstep(0.5, 0.9, wGust) * 0.04 * deepK, smoothstep(0.4, 3.0, wpx));
  wFoam = max(wFoam, caps * 0.9);
  diffuseColor.rgb = mix(wc, vec3(0.8, 0.82, 0.82), wFoam) * diffuse;
}`)
        .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 0.27 + vec2( uWTime * 0.0021, - uWTime * 0.0033 ) ).xyz * 2.0 - 1.0;
  vec3 mapN3 = texture2D( normalMap, vNormalMapUv * 2.3 + vec2( - uWTime * 0.021, uWTime * 0.014 ) ).xyz * 2.0 - 1.0;
  float wfade = clamp( 1.0 - length( fwidth( vNormalMapUv ) ) * 3.0, 0.35, 1.0 );
  // long swell (stays visible to the horizon) plus gust-dependent wind waves
  vec3 mapN4 = texture2D( normalMap, vNormalMapUv * 0.043 + vec2( uWTime * 0.0006, uWTime * 0.0004 ) ).xyz * 2.0 - 1.0;
  float gk = 0.65 + 0.7 * wGust - 0.5 * wSlick;
  mapN = normalize( vec3( ( ( mapN.xy + mapN2.xy * 1.1 + mapN3.xy * 0.45 * wfade ) * wfade * gk + mapN4.xy * 0.55 ) * ( 1.0 - wFoam * 0.6 ), mapN.z ) );`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, wFoam);
// unresolved waves far away scatter the reflection; slicks stay glassy
roughnessFactor = clamp(roughnessFactor + 0.12 * smoothstep(0.5, 8.0, length(fwidth(vWW.xz))) + 0.16 * smoothstep(0.35, 0.8, wGust) - 0.06 * wSlick, 0.03, 1.0);`);
    };
    // tessellated (not a single quad) so logarithmic depth stays precise near the camera
    const g = World.radialGrid(96, size / 2);
    if (this._bakeOK) {
      const ga = new Float32Array(97 * 97 * 2);
      for (let j = 0, k = 0; j <= 96; j++) for (let i = 0; i <= 96; i++) { ga[k++] = i; ga[k++] = j; }
      g.setAttribute('aGrid', new THREE.BufferAttribute(ga, 2));
    }
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const p = g.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / size + 0.5; uv[i * 2 + 1] = -p.getZ(i) / size + 0.5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.position.y = TERRAIN.waterLevel;
    this.water.frustumCulled = false;
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  // ---------------------------------------------------------------------- world.glb
  // material tuning + shadows shared by world.glb and airport2.glb
  prepareGLB(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || m.userData.prepared) continue;
        m.userData.prepared = true;
        m.envMapIntensity = 0.6;
        if (m.emissiveMap) {
          m.emissive = new THREE.Color(1, 1, 1);
          this.emissiveMats.push(m);
        }
        if (m.name === 'W_GlassTower' || m.name === 'W_Sign') this.emissiveMats.push(m);
        // terminal glazing: the halls and gate lounges are lit all night (warm white)
        if (m.name === 'W_Curtain') { m.emissive = new THREE.Color(1.0, 0.86, 0.66); m.userData.allLit = true; this.emissiveMats.push(m); }
        if (m.map) m.map.anisotropy = 8;
        if (['W_Asphalt', 'W_TaxiAsphalt', 'W_Shoulder', 'W_MarkWhite', 'W_MarkYellow', 'W_Concrete', 'W_Road'].includes(m.name)) patchPavement(m);
        if (m.name.startsWith('W_facade_') || m.name === 'W_GlassTower' || m.name === 'W_Curtain') patchFacade(m, !!m.userData.allLit);
        if (m.name === 'W_Roof' || m.name === 'W_PaintWhite') m.color.multiplyScalar(0.72);
        if (/^W_(PaintWhite|PaintGrey|MetalPanel|Steel|Roof|Tank|BridgeWhite|HangarDoor|PAPIBox|TowerOrange|SignYellow|Granite|Skytree)$/.test(m.name)) patchStructure(m);
        // openings (jet bridge cab, hangar interiors) are dim, not a pure black hole
        if (m.name === 'W_Dark') { m.color.setRGB(0.045, 0.046, 0.048); m.roughness = 0.8; }
      }
      o.receiveShadow = true;
      const n = o.name;
      o.castShadow = (this.quality === 'high' || this.quality === 'ultra') && !/Markings|Pavement/.test(n);
      if (n.startsWith('TreeProto')) o.visible = false;
    });
  }

  attachWorldGLB(gltf) {
    const root = gltf.scene;
    this.prepareGLB(root);
    this.scene.add(root);
    this.worldRoot = root;
    // baked airport-name letters are replaced by signs drawn from the chosen name
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mn = o.material.name;
      if (mn === 'W_Sign') {
        this.signColor = '#' + o.material.color.getHexString();
        stripTriangles(o, (x, y, z) => Math.abs(x) < 140 && ((Math.abs(z + 504.6) < 1.3 && y > 10.4) || (Math.abs(z + 690.6) < 1.3 && y > 16.6)));
      }
      if (mn === 'W_TowerOrange') stripTriangles(o, (x, y, z) => Math.abs(z + 329.4) < 1.2 && y > 26 && y < 36 && x > 880 && x < 1260);
    });
    this.signs = new THREE.Group();
    this.scene.add(this.signs);
    // tree prototypes
    this.treeProtos = [0, 1].map((k) => root.getObjectByName('TreeProto_' + k));
    freezeStatic(root);
  }

  setAirportName(name) {
    if (!this.signs) return;
    for (const m of this.signs.children.slice()) { this.signs.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
    const T = signTexts(name || 'Tokyo');
    const col = this.signColor || '#20242a';
    const add = (text, h, maxW, x, y, z, ry, color = col) => {
      const m = textSign(text, { h, maxW, color });
      m.position.set(x, y, z); m.rotation.y = ry;
      this.signs.add(m);
    };
    if (this.signAnchors?.length) {
      // anchors exported by the Blender build (light letters on dark fascia panels)
      for (const g of this.signAnchors) add(T[g.kind] || T.airside, g.h, g.maxW, g.pos[0], g.pos[1], g.pos[2], g.ry, g.kind === 'hangar' ? '#c8401f' : '#eef3f7');
      return;
    }
    add(T.airside, 4.2, 150, 0, 13.0, -504.1, 0);                 // pier fascia, facing the runway
    add(T.landside, 5.0, 200, 0, 20.0, -691.0, Math.PI);          // landside, facing the city
    for (const xc of [970, 1170]) add(T.hangar, 7.0, 150, xc, 31.0, -329.0, 0, '#c8401f');
  }

  buildTrees(treeData) {
    if (!treeData || !this.treeProtos || !this.treeProtos[0]) return;
    const CH = 3000;
    const buckets = new Map();
    for (let i = 0; i < treeData.length; i += 4) {
      const x = treeData[i], h = treeData[i + 1], z = treeData[i + 2], kind = treeData[i + 3];
      const key = Math.floor(x / CH) + ',' + Math.floor(z / CH) + ',' + kind;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(x, h, z);
    }
    const rnd = mulberry32(11);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (const [key, arr] of buckets) {
      const kind = +key.split(',')[2];
      const proto = this.treeProtos[kind];
      const meshes = [];
      proto.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const n = arr.length / 3;
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += arr[i * 3]; cz += arr[i * 3 + 2]; }
      cx /= n; cz /= n;
      const group = [];
      const mats = [];
      for (let i = 0; i < n; i++) {
        const h = arr[i * 3 + 1];
        p.set(arr[i * 3], 0, arr[i * 3 + 2]);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
        const w = h * (0.85 + rnd() * 0.3);
        s.set(w, h, w);
        mats.push(m4.compose(p, q, s).clone());
      }
      for (const src of meshes) {
        const geo = src.geometry.clone();
        // the prototype was parked at -1000 m in Blender; bake its local transform
        src.updateWorldMatrix(true, false);
        const local = src.matrixWorld.clone();
        local.elements[13] += 1000;   // undo the park offset
        geo.applyMatrix4(local);
        const im = new THREE.InstancedMesh(geo, src.material, n);
        for (let i = 0; i < n; i++) {
          im.setMatrixAt(i, mats[i]);
          col.setHSL(0.26 + (rnd() - 0.5) * 0.06, 0.35 + rnd() * 0.2, 0.42 + rnd() * 0.22);
          im.setColorAt(i, col);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.receiveShadow = true;
        im.castShadow = false;
        this.scene.add(im);
        group.push(im);
      }
      this.treeChunks.push({ x: cx, z: cz, meshes: group });
    }
  }

  // ---------------------------------------------------------------------- lights
  buildLights(lights) {
    const pos = [], col = [], size = [], dir = [], kind = [], phase = [];
    const c = new THREE.Color();
    for (const [name, g] of Object.entries(lights)) {
      c.set(g.color || '#ffffff');
      c.convertSRGBToLinear();
      const n = g.pos.length / 3;
      let k = LIGHT_KIND[g.kind] ?? 0;
      if (NIGHT_ONLY.has(name)) k = LIGHT_KIND.night;
      for (let i = 0; i < n; i++) {
        pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
        col.push(c.r, c.g, c.b);
        size.push(g.size || 1);
        if (g.dir && g.dir.length) dir.push(g.dir[i * 3], g.dir[i * 3 + 1], g.dir[i * 3 + 2]);
        else dir.push(0, 1, 0);
        kind.push(k);
        phase.push(k === LIGHT_KIND.sequenced ? (i % 20) / 20 : Math.random());
      }
    }
    // sequenced flashers run towards the threshold: order by distance
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('lcolor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('lsize', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('ldir', new THREE.Float32BufferAttribute(dir, 3));
    geo.setAttribute('lkind', new THREE.Float32BufferAttribute(kind, 1));
    geo.setAttribute('lphase', new THREE.Float32BufferAttribute(phase, 1));
    this.lightUniforms = {
      uTime: { value: 0 }, uNight: { value: 0 }, uScreen: { value: 800 }, uPR: { value: 1 },
      uFogDensity: { value: 0 }, uMap: { value: glowTexture() },
      uLin: HDR.uLin, uGain: HDR.uGain, uGainL: HDR.uGainL,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.lightUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 lcolor; attribute float lsize; attribute vec3 ldir; attribute float lkind; attribute float lphase;
        uniform float uTime, uNight, uScreen, uPR, uFogDensity;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mv.z, 0.1);
          vec3 toCam = cameraPosition - position;
          float d = length(toCam);
          vec3 v = toCam / max(d, 0.001);
          float inten = 1.0;
          vec3 col = lcolor;
          if (lkind > 0.5 && lkind < 1.5) {
            inten *= smoothstep(-0.05, 0.35, dot(v, normalize(ldir)));
          } else if (lkind > 1.5 && lkind < 2.5) {
            vec2 hd = normalize(ldir.xz);
            inten *= smoothstep(0.3, 0.7, dot(normalize(v.xz), hd)) * 1.6;
            float elev = toCam.y / max(length(toCam.xz), 1.0);
            col = elev > ldir.y ? vec3(1.0, 0.97, 0.9) : vec3(1.0, 0.05, 0.03);
          } else if (lkind > 2.5 && lkind < 3.5) {
            inten *= smoothstep(-0.05, 0.3, dot(v, normalize(ldir)));
            float t = fract(uTime * 2.0 - lphase);
            inten *= step(t, 0.07) * 2.5;
          } else if (lkind > 3.5 && lkind < 4.5) {
            inten *= 0.15 + 0.85 * step(0.55, fract(uTime * 0.7 + lphase));
          } else if (lkind > 4.5) {
            inten *= uNight;
          }
          float dayScale = mix(0.22, 1.0, uNight);
          float proj = lsize * uScreen / dist;
          float px = clamp(proj * mix(0.9, 3.2, uNight), mix(1.6, 3.6, uNight) * uPR, mix(10.0, 48.0, uNight) * uPR);
          float fog = exp(-uFogDensity * uFogDensity * dist * dist);
          vAlpha = inten * dayScale * clamp(proj * 2.0 + 0.5, 0.0, 1.2) * fog;
          gl_PointSize = px * (0.7 + 0.3 * min(inten, 1.0));
          vColor = col;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${HDR_GLSL}
        uniform sampler2D uMap;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          float a = exp(-r2 * 5.0) + 0.9 * exp(-r2 * 40.0);
          if (vAlpha * a < 0.003) discard;
          gl_FragColor = vec4(vColor * a * vAlpha * 2.2, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, pow(max(gl_FragColor.rgb, 0.0), vec3(2.2)) * uGainL, uLin);
        }`,
    });
    mat.toneMapped = false;
    this.lightPoints = new THREE.Points(geo, mat);
    this.lightPoints.frustumCulled = false;
    this.lightPoints.renderOrder = 5;
    this.scene.add(this.lightPoints);
    // reflections in the wet pavement: the same lights mirrored in the ground plane, drawn as
    // vertical streaks; depth taken from the real light so the aircraft still hides them
    const rm = mat.clone();
    rm.uniforms = this.lightUniforms;
    rm.defines = { MIRROR: 1 };
    rm.vertexShader = mat.vertexShader
      .replace('vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        'vec4 mvO = modelViewMatrix * vec4(position, 1.0);\n          vec4 mv = modelViewMatrix * vec4(position.x, -position.y - 0.25, position.z, 1.0);')
      .replace('#include <logdepthbuf_vertex>', `#include <logdepthbuf_vertex>
          #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
          vFragDepth = 1.0 + max(-mvO.z, 0.1) * 0.8;
          #endif
          vAlpha *= uWet * smoothstep(3.0, 0.3, position.y) * 0.4;
          gl_PointSize *= 1.6;`)
      .replace('uniform float uTime, uNight, uScreen, uPR, uFogDensity;', 'uniform float uTime, uNight, uScreen, uPR, uFogDensity, uWet;');
    rm.fragmentShader = mat.fragmentShader.replace('float a = exp(-r2 * 5.0) + 0.9 * exp(-r2 * 40.0);',
      'float a = exp(-(c.x * c.x * 60.0 + c.y * c.y * 3.5)) * (0.75 + 0.25 * fract(sin(dot(floor(gl_FragCoord.xy / vec2(3.0, 9.0)) + floor(uTime * 12.0), vec2(12.9898, 78.233))) * 43758.5453));')
      .replace('uniform sampler2D uMap;', 'uniform sampler2D uMap; uniform float uTime;');
    this.lightUniforms.uWet = WET.uWet;
    this.lightReflect = new THREE.Points(geo, rm);
    this.lightReflect.frustumCulled = false;
    this.lightReflect.renderOrder = 4;
    this.scene.add(this.lightReflect);
  }

  // ---------------------------------------------------------------------- clouds
  buildClouds() {
    if (this.clouds) { this.scene.remove(this.clouds); this.clouds.geometry.dispose(); }
    const W = this.weather;
    const rnd = mulberry32(1234);
    const TILE = 60000;
    const offs = [], scl = [], seed = [];
    const nClusters = Math.round(40 + 420 * W.cover);
    for (let c = 0; c < nClusters; c++) {
      const cx = (rnd() - 0.5) * TILE, cz = (rnd() - 0.5) * TILE;
      const size = 600 + rnd() * 1600 * (0.6 + W.cover);
      const puffs = 6 + Math.floor(rnd() * 10);
      const thick = (W.top - W.base) * (0.4 + 0.6 * rnd());
      for (let i = 0; i < puffs; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * size * 0.5;
        const y = W.base + Math.pow(rnd(), 1.4) * thick;
        offs.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
        scl.push((260 + rnd() * 520) * (1 - 0.35 * (y - W.base) / Math.max(thick, 1)) * (0.8 + 0.5 * W.cover));
        seed.push(rnd());
      }
    }
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(new Float32Array(scl), 1));
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 1));
    geo.instanceCount = scl.length;
    const tex = new THREE.CanvasTexture(puffCanvas());
    this.cloudUniforms = this.cloudUniforms || {
      uMap: { value: tex }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uAmb: { value: new THREE.Color(0.6, 0.65, 0.75) }, uCam: { value: new THREE.Vector3() }, uTile: { value: TILE },
      uDrift: { value: new THREE.Vector2() }, uFogCol: { value: new THREE.Color() }, uFogDensity: { value: 0 },
      uBase: { value: 1000 }, uTop: { value: 2000 }, uDark: { value: 0 },
      uLin: HDR.uLin, uGain: HDR.uGain, uGainL: HDR.uGainL,
    };
    this.cloudUniforms.uBase.value = W.base;
    this.cloudUniforms.uTop.value = W.top;
    this.cloudUniforms.uDark.value = W.overcast;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 iOffset; attribute float iScale; attribute float iSeed;
        uniform vec3 uCam; uniform float uTile; uniform vec2 uDrift; uniform float uBase, uTop;
        varying vec2 vUv; varying float vH; varying float vDist; varying float vSeed; varying vec3 vWorld;
        void main() {
          vec3 p = iOffset;
          p.xz += uDrift;
          p.xz = mod(p.xz - uCam.xz + 0.5 * uTile, uTile) - 0.5 * uTile + uCam.xz;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float ang = iSeed * 6.2831;
          vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * position.xy;
          mv.xy += q * iScale;
          vUv = uv; vSeed = iSeed;
          vH = clamp((p.y + position.y * iScale * 0.6 - uBase) / max(uTop - uBase, 1.0), 0.0, 1.0);
          vDist = -mv.z; vWorld = p;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${HDR_GLSL}
        uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
        uniform vec3 uFogCol; uniform float uFogDensity; uniform float uDark;
        varying vec2 vUv; varying float vH; varying float vDist; varying float vSeed; varying vec3 vWorld;
        void main() {
          #include <logdepthbuf_fragment>
          float a = texture2D(uMap, vUv).a;
          if (a < 0.01) discard;
          float lit = mix(0.45, 1.0, vH) * (0.75 + 0.25 * clamp(uSunDir.y * 3.0, 0.0, 1.0));
          lit *= 1.0 - 0.45 * uDark;
          vec3 col = uAmb * 0.75 + uSunCol * lit * 0.85;
          float fade = smoothstep(80.0, 400.0, vDist);
          float fog = exp(-uFogDensity * uFogDensity * vDist * vDist * 0.5);
          col = mix(uFogCol, col, fog);
          col = mix(col, pow(max(col, 0.0), vec3(2.2)) * uGain, uLin);
          gl_FragColor = vec4(col, a * fade * 0.92);
        }`,
    });
    this.clouds = new THREE.Mesh(geo, mat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 10;
    this.scene.add(this.clouds);
    // overcast deck (flat layer at the base)
    if (this.deck) { this.scene.remove(this.deck); this.deck = null; }
    if (W.overcast > 0) {
      const t = new THREE.CanvasTexture(noiseCanvas(256, 17, 3, [6, 12, 24]));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(40, 40);
      const dm = new THREE.MeshBasicMaterial({ map: t, color: 0x9aa3ad, transparent: true, opacity: 0.55 + 0.4 * W.overcast,
        side: THREE.DoubleSide, depthWrite: false });
      this.deck = new THREE.Mesh(new THREE.PlaneGeometry(140000, 140000).rotateX(-Math.PI / 2), dm);
      this.deck.position.y = W.base + 120;
      this.deck.frustumCulled = false;
      this.deck.renderOrder = 9;
      this.scene.add(this.deck);
    }
  }

  // state for the volumetric cloud pass (null = sprite clouds)
  volumetricState(on) {
    const W = this.weather;
    this._volOn = on;
    if (this.clouds) this.clouds.visible = !on;
    if (this.deck) this.deck.visible = !on;
    if (!on) return null;
    const h = this.hemi;
    this._vs = this._vs || { ambTop: new THREE.Color(), ambBot: new THREE.Color(), sunCol: new THREE.Color(), haze: new THREE.Color(), sunDir: new THREE.Vector3() };
    const v = this._vs;
    v.enabled = true;
    v.base = W.base; v.top = W.top + (W.overcast > 0.5 ? 0 : 900);
    v.cover = Math.min(1, W.cover * 0.95 + 0.05);
    v.sunDir.copy(this.sunDir || new THREE.Vector3(0, 1, 0));
    // the sky fill on the clouds is not reduced with the ground fill (compensated for the
    // lower exposure)
    const ek = 1 / (this.expK || 1);
    // sunlit sides: the real sun (same light as the ground), so the evening colour survives
    // instead of burning out to white
    v.sunCol.copy(this.sun.color); v.sunI = this.sun.intensity * 1.25;
    const hi = this.hemiBase ?? h.intensity;
    // at night the tops only get moon/starlight: dim grey shapes, not white ones
    // the sky dims much faster than the hemisphere fill around sunset: clouds would glow white
    // against a dark sky; instead they take the sky's level and the evening colour of the horizon
    const el = this.elDeg ?? 30;
    const nk = lerp(1, 0.3, this.night) * lerp(0.3, 1, smoothstep(-3, 12, el));
    v.ambTop.copy(h.color).multiplyScalar((hi * 3.0 + this.moon.intensity * 0.5) * ek * nk);
    v.ambBot.copy(h.groundColor).lerp(h.color, 0.6).multiplyScalar(hi * 2.4 * ek * nk);
    const dusk = smoothstep(14, 2, el) * smoothstep(-7, -1, el);
    if (dusk > 0) {
      const fc = this.scene.fog.color, fl = Math.max(0.05, (fc.r + fc.g + fc.b) / 3);
      const tint = this._tint || (this._tint = new THREE.Color());
      for (const c of [v.ambTop, v.ambBot]) {
        const l = (c.r + c.g + c.b) / 3;
        tint.setRGB(fc.r / fl * l, fc.g / fl * l, fc.b / fl * l);
        c.lerp(tint, 0.6 * dusk);
      }
    }
    // light pollution from the city lights up the cloud base at night
    v.ambBot.r += 0.03 * this.night; v.ambBot.g += 0.022 * this.night; v.ambBot.b += 0.015 * this.night;
    v.ambTop.r += 0.004 * this.night; v.ambTop.g += 0.004 * this.night; v.ambTop.b += 0.006 * this.night;
    v.haze.copy(this.scene.fog.color);
    v.vis = W.vis * 0.9;
    v.density = 0.02 + 0.03 * W.overcast;
    v.steps = this.quality === 'ultra' ? 88 : 56;
    return v;
  }

  // rain / wetness: soaks quickly in rain, dries slowly afterwards
  updateWet(dt) {
    const r = this.weather.rain || 0;
    this.rain = r;
    this.wet = r > 0 ? Math.min(1, (this.wet || 0) + dt / 40) : Math.max(0, (this.wet || 0) - dt / 900);
    WET.uWet.value = this.wet;
  }

  setWeather(name) {
    this.weatherName = name;
    this.weather = WEATHER[name] || WEATHER.scattered;
    this.wet = this.weather.rain ? 1 : 0;
    WET.uWet.value = this.wet;
    this.buildClouds();
    this._envKey = '';
  }

  // ---------------------------------------------------------------------- parked aircraft
  addParkedAircraft(template, stands, skipStand, dress) {
    if (!this._parkedTemplate) this._parkedTemplate = World.mergeByMaterial(template);
    for (const st of stands) {
      if (st.id === skipStand) continue;
      const o = this._parkedTemplate.clone(true);
      if (dress) dress(o);
      o.position.set(st.cg[0], -0.55 + 0.55 + 5.25 - 0.05, st.cg[2]);
      o.rotation.y = Math.PI / 2 - st.heading * DEG;   // heading 0 = north (-z)
      o.traverse((m) => { if (m.isMesh) { m.castShadow = (this.quality === 'high' || this.quality === 'ultra'); m.receiveShadow = true; } });
      this.scene.add(o);
      this.parked.push(o);
    }
  }

  // bake a multi-object model into one mesh per material (few draw calls)
  static mergeByMaterial(root) {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const buckets = new Map();
    root.traverse((m) => {
      if (!m.isMesh) return;
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      const ng = g.index ? g.toNonIndexed() : g;
      const key = m.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [] });
      buckets.get(key).geos.push(ng);
    });
    const group = new THREE.Group();
    for (const { mat, geos } of buckets.values()) {
      let total = 0;
      for (const g of geos) total += g.getAttribute('position').count;
      const out = new THREE.BufferGeometry();
      for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        const arr = new Float32Array(total * size);
        let o = 0;
        for (const g of geos) { const a = g.getAttribute(name); arr.set(a.array.subarray(0, a.count * size), o); o += a.count * size; }
        out.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      out.computeBoundingSphere();
      group.add(new THREE.Mesh(out, mat));
    }
    return group;
  }

  // ---------------------------------------------------------------------- per frame
  sunDirection(tod, x = 0, z = 0) {
    // latitude of the nearest airport (26 N Naha .. 43 N Sapporo), spring (declination +8 deg)
    let near = GEO.airports[0], bd = Infinity;
    for (const a of GEO.airports) { const d = Math.hypot(x - a.x, z - a.z); if (d < bd) { bd = d; near = a; } }
    const lat = (near.lat ?? 35) * DEG, dec = 8 * DEG;
    const H = (tod - 12) * 15 * DEG;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    // az from north, clockwise -> world (the local north, util.northAt)
    az -= northAt(x, z) * DEG;
    return { el, az, v: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)) };
  }

  // Ultra: the sun's shadow box follows what the camera sees. On the ground it stays tight
  // around the aircraft (2 cm texels on an 8k map); climbing out it grows with the height
  // above the ground and moves ahead of the camera, so the city blocks and the terminal
  // cast shadows too. The box centre is snapped to whole shadow texels (no shimmering).
  _shadowFocus(camera, focus, sunV) {
    const sc = this.sun.shadow.camera;
    const ext = this._shadowExt || (this._shadowExt = { r: 110, dist: 1500 });
    const out = this._sfv || (this._sfv = new THREE.Vector3());
    if (this.quality !== 'ultra') {
      if (ext.r !== 110) {
        ext.r = 110; ext.dist = 1500; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.far = 3000; sc.updateProjectionMatrix();
        this.sun.shadow.normalBias = 0.06;
      }
      return out.copy(focus);
    }
    const agl = Math.max(0, camera.position.y - Math.max(0, terrainHeight(camera.position.x, camera.position.z)));
    const dFocus = camera.position.distanceTo(focus);
    let r = 130;
    if (agl > 120 || dFocus > 400) r = THREE.MathUtils.clamp(Math.max(agl * 1.1, dFocus * 0.6), 130, 2600);
    // hysteresis: re-fit only on a real change (a projection change reallocates nothing, but
    // a constantly breathing box shimmers)
    if (Math.abs(r - ext.r) > ext.r * 0.15 || (r === 130 && ext.r !== 130)) {
      ext.r = r; ext.dist = Math.max(1500, r * 2.2);
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = ext.dist * 2 + r * 2;
      sc.updateProjectionMatrix();
      this.sun.shadow.normalBias = Math.max(0.05, (2 * r / this.sun.shadow.mapSize.x) * 1.6);
    }
    if (ext.r <= 130) out.copy(focus);
    else {
      // centre on the ground a bit ahead of the camera
      const fw = camera.getWorldDirection(this._sfd || (this._sfd = new THREE.Vector3()));
      const h = Math.hypot(fw.x, fw.z) || 1;
      const ahead = ext.r * 0.55;
      out.set(camera.position.x + fw.x / h * ahead, 0, camera.position.z + fw.z / h * ahead);
      if (agl < 400) out.lerp(focus, 0.35);
    }
    // texel snap in the light's frame
    const texel = (2 * ext.r) / this.sun.shadow.mapSize.x;
    const up = Math.abs(sunV.y) > 0.99 ? this._X || (this._X = new THREE.Vector3(1, 0, 0)) : this._Y || (this._Y = new THREE.Vector3(0, 1, 0));
    const ax = (this._sax || (this._sax = new THREE.Vector3())).crossVectors(up, sunV).normalize();
    const ay = (this._say || (this._say = new THREE.Vector3())).crossVectors(sunV, ax);
    const px = out.dot(ax), py = out.dot(ay);
    out.addScaledVector(ax, Math.round(px / texel) * texel - px).addScaledVector(ay, Math.round(py / texel) * texel - py);
    return out;
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.updateWet(dt);
    const W = this.weather;
    const sd = this.sunDirection(this.tod, camera.position.x, camera.position.z);
    this.sunDir = sd.v;
    const elDeg = sd.el / DEG;
    this.elDeg = elDeg;
    const day = smoothstep(-6, 8, elDeg);
    this.night = 1 - smoothstep(-4, 6, elDeg);
    const golden = smoothstep(25, 2, elDeg) * day;
    // sky
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(sd.v);
    su.turbidity.value = 1.9 + 7 * W.overcast + golden * 2;
    su.rayleigh.value = 0.95 + golden * 1.4 + (1 - day) * 1.5;
    // the sky shader's own flat cloud layer (three's default coverage 0.4 drew it in every
    // weather, a second, painted-looking layer): only as the low-quality stand-in for the
    // volumetric clouds, and then following the weather
    if (su.cloudCoverage) { su.cloudCoverage.value = this._volOn ? 0 : W.cover * 0.7; su.cloudDensity.value = this._volOn ? 0 : 0.4; }
    // sun light
    const sunCol = (this._sunColT || (this._sunColT = new THREE.Color())).setRGB(1, lerp(0.96, 0.62, golden), lerp(0.92, 0.38, golden));
    this.sun.color.copy(sunCol);
    // clear-sky balance only while the sun is up and not hidden by an overcast
    const kSun = lerp(1, LIGHT.SUN_K, day * (1 - W.overcast));
    LIGHT.dayK = kSun;
    // atmospheric extinction along the sun's path (Kasten-Young air mass, Meinel transmittance,
    // normalised to the sun overhead): ~0.9 at 45 deg, 0.45 at 10 deg, 0.25 at 5 deg - the
    // evening light is weaker as well as redder, so sunlit clouds keep their colour
    const elC = Math.max(elDeg, 0.3);
    const am = 1 / (Math.sin(elC * DEG) + 0.50572 * Math.pow(elC + 6.07995, -1.6364));
    const tSun = Math.pow(0.7, Math.pow(am, 0.678)) / 0.7;
    this.sunT = tSun;
    this.sun.intensity = 3.4 * day * (1 - 0.7 * W.overcast) * kSun * tSun;
    const f = this._shadowFocus(camera, focus || camera.position, sd.v);
    const sr = this._shadowExt;
    this.sun.position.set(f.x + sd.v.x * sr.dist, f.y + sd.v.y * sr.dist, f.z + sd.v.z * sr.dist);
    this.sun.target.position.copy(f);
    this.sun.target.updateMatrixWorld();
    this.hemiBase = lerp(0.07, 0.55, day) * (1 + 0.4 * W.overcast);
    this.hemi.intensity = this.hemiBase * lerp(1, LIGHT.HEMI_K, (kSun - 1) / (LIGHT.SUN_K - 1));
    this.hemi.color.setRGB(lerp(0.25, 0.75, day), lerp(0.3, 0.83, day), lerp(0.45, 1.0, day));
    this.hemi.groundColor.setRGB(lerp(0.04, 0.22, day), lerp(0.04, 0.2, day), lerp(0.05, 0.15, day));
    this.moon.intensity = this.night * 0.25;
    this.moon.position.set(f.x - 800, f.y + 1500, f.z + 600);
    this.moon.target = this.sun.target;
    this.stars.material.opacity = this.night * (1 - W.overcast) * 0.9;
    this.stars.position.copy(camera.position);
    // fog / haze
    const horizon = (this._horizonT || (this._horizonT = new THREE.Color())).setRGB(
      lerp(0.02, lerp(0.70, 0.93, golden), day), lerp(0.03, lerp(0.79, 0.62, golden), day), lerp(0.06, lerp(0.90, 0.48, golden), day));
    if (W.overcast > 0.5) horizon.lerp((this._ovcT || (this._ovcT = new THREE.Color())).setRGB(0.55 * day + 0.03, 0.58 * day + 0.03, 0.62 * day + 0.04), 0.7);
    let density = 1 / W.vis;
    const cy = camera.position.y;
    if (W.overcast > 0.5 && cy > W.base && cy < W.base + 420) density = 1 / 180;   // inside the deck
    this.scene.fog.color.copy(horizon);
    this.scene.fog.density = density * 1.3;
    // ground bounce in the sky light: sunlit concrete and grass reflect 15-30 % of the sun, a
    // warm grey fill that keeps shadows from turning pure sky-blue
    const gb = day * (0.25 + 0.75 * (this.sunT ?? 1)) * (1 - 0.6 * W.overcast);
    this.envGroundMat.color.setRGB(0.34 * gb + 0.01, 0.33 * gb + 0.01, 0.28 * gb + 0.01);
    this.envDome.material.opacity = 0.92 * W.overcast;
    this.envDome.material.color.setRGB(0.55 * day + 0.02, 0.57 * day + 0.02, 0.6 * day + 0.025);
    // env map (re-render when the sun moved)
    const key = Math.round(elDeg * 2) + ':' + Math.round(sd.az / DEG / 4) + ':' + this.weatherName;
    if (key !== this._envKey) {
      this._envKey = key;
      if (this.envRT) this.envRT.dispose();
      // the sun is the DirectionalLight (with shadows): keep its disc out of the sky light, or
      // it leaks into every shadow as "ambient" and flattens the whole image
      const su2 = this.sky.material.uniforms;
      if (su2.showSunDisc) su2.showSunDisc.value = 0;
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      if (su2.showSunDisc) su2.showSunDisc.value = 1;
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.12, 1.0, day) * (1 - 0.3 * W.overcast);
    }
    // terrain / water follow the camera
    const step = 16;
    const cx = Math.round(camera.position.x / step) * step, cz = Math.round(camera.position.z / step) * step;
    this.terrain.position.set(cx, 0, cz);
    this.terrainUniforms.uCenter.value.set(cx, cz);
    if (this._bakeOK && (!this._bakedAt || this._bakedAt.x !== cx || this._bakedAt.y !== cz)) {
      this._bakedAt = (this._bakedAt || new THREE.Vector2()).set(cx, cz);
      this.terrainBakeU.uCenter.value.set(cx, cz);
      const prev = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.terrainRT);
      this.terrainBake.render(this.renderer);
      if (this.waterBake) {
        this.waterBakeU.uCenter.value.set(cx, cz);
        this.renderer.setRenderTarget(this.waterRT);
        this.waterBake.render(this.renderer);
      }
      this.renderer.setRenderTarget(prev);
    }
    this.water.position.x = cx; this.water.position.z = cz;
    this.waterNormal.offset.set(cx / 55 + this.time * 0.012, -cz / 55 + this.time * 0.007);
    this.waterMat.color.setRGB(0.35 + 0.65 * day, 0.35 + 0.65 * day, 0.4 + 0.6 * day);   // tints the shader's body colour
    if (this.waterU) this.waterU.uWTime.value = this.time;
    // emissive windows at night
    const em = this.night;
    for (const m of this.emissiveMats) m.emissiveIntensity = m.name === 'W_GlassTower' || m.name === 'W_Sign' ? em * 2 : m.name === 'W_Curtain' ? em * 2.6 : em * 1.4;
    if (this.signs) for (const m of this.signs.children) m.material.emissiveIntensity = em * 1.2;
    // lights
    if (this.lightUniforms) {
      const lu = this.lightUniforms;
      lu.uTime.value = this.time;
      lu.uNight.value = this.night;
      lu.uPR.value = this.renderer.getPixelRatio();
      const h = this.renderer.domElement.height;
      lu.uScreen.value = h / (2 * Math.tan(camera.fov * DEG / 2));
      lu.uFogDensity.value = this.scene.fog.density;
    }
    // trees: distance culling
    for (const c of this.treeChunks) {
      const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z) - camera.position.y * 0.5;
      const vis = d < ({ low: 2500, medium: 4500, ultra: 11000 }[this.quality] || 6500);
      for (const m of c.meshes) m.visible = vis;
    }
    // clouds
    if (this.cloudUniforms) {
      const cu = this.cloudUniforms;
      cu.uCam.value.copy(camera.position);
      cu.uSunDir.value.copy(sd.v);
      cu.uSunCol.value.copy(sunCol).multiplyScalar(lerp(0.05, 1.0, day));
      cu.uAmb.value.copy(horizon).multiplyScalar(lerp(0.4, 0.9, day));
      cu.uFogCol.value.copy(horizon);
      cu.uFogDensity.value = this.scene.fog.density;
      cu.uDrift.value.x += dt * 4; cu.uDrift.value.y += dt * 1.5;
    }
    if (this.deck) {
      this.deck.position.x = camera.position.x; this.deck.position.z = camera.position.z;
      this.deck.material.color.setRGB(0.62 * day + 0.03, 0.65 * day + 0.03, 0.7 * day + 0.04);
      this.deck.material.map.offset.set(camera.position.x / 3500, -camera.position.z / 3500);
    }
    // AgX (ACES had a built-in x1/0.6); lower in the stronger clear-day sun
    this.expK = lerp(1, LIGHT.EXP_K, (kSun - 1) / (LIGHT.SUN_K - 1));
    // the eye / camera adapts only part of the way to the dimmer low sun
    this.renderer.toneMappingExposure = lerp(0.95, 0.32, day) * 1.8 * this.expK * Math.pow(lerp(1, this.sunT, day), -0.55);
  }
}
