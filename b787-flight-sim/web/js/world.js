// Environment renderer: sky + sun cycle, image-based lighting, GPU terrain,
// water, the Blender-built airport/city (world.glb), instanced trees, clouds,
// airfield / city lights and parked aircraft.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { TERRAIN, TERRAIN_GLSL } from './terrain.js';
import { patchFacade } from './shading.js';
import { stripTriangles, textSign, signTexts } from './signs.js';
import { clamp, smoothstep, lerp, mulberry32, DEG } from './util.js';

const LIGHT_KIND = { steady: 0, directional: 1, papi: 2, sequenced: 3, blink: 4, night: 5 };
const NIGHT_ONLY = new Set(['street', 'landmark', 'bridge', 'apron_flood', 'a2_apron_flood', 'a2_street']);

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
  const asphalt = m.name === 'W_Asphalt' || m.name === 'W_TaxiAsphalt';
  const concrete = m.name === 'W_Concrete';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = WET.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRwP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRwP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRwP;
float rwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rwNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rwHash(i), rwHash(i + vec2(1, 0)), f.x), mix(rwHash(i + vec2(0, 1)), rwHash(i + vec2(1, 1)), f.x), f.y); }
float rwRubber = 0.0;
float rwWet = 0.0;
uniform float uWet;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 wp = vRwP;
  float ax = abs(wp.x), az = abs(wp.z);
  float aa = clamp(1.0 - length(fwidth(wp.xz)) * 12.0, 0.0, 1.0);     // fade detail with distance
  if (az < 30.5 && ax < 1760.0) {
    float d = 1750.0 - ax;                                            // metres past the threshold
    float tdz = smoothstep(90.0, 260.0, d) * (1.0 - smoothstep(650.0, 1250.0, d));
    float tracks = exp(-pow((az - 4.9) / 1.7, 2.0)) + 0.55 * exp(-pow(az / 1.3, 2.0));
    float spread = smoothstep(12.0, 3.0, az);
    float streak = rwNoise(vec2(wp.x * 0.04, wp.z * 2.2)) * 0.55 + rwNoise(vec2(wp.x * 0.35, wp.z * 7.0)) * 0.45;
    rwRubber = clamp(tdz * (0.6 * tracks + 0.4 * spread) * (0.35 + streak), 0.0, 1.0);
    float wear = 0.10 * spread * (0.6 + 0.4 * rwNoise(vec2(wp.x * 0.02, wp.z * 0.7)));
    diffuseColor.rgb *= 1.0 - 0.78 * rwRubber - wear;
  }
  ${asphalt ? `
  float g = rwNoise(wp.xz * 17.0) * 0.55 + rwNoise(wp.xz * 53.0) * 0.45;
  float blot = rwNoise(wp.xz * 0.11) * 0.6 + rwNoise(wp.xz * 0.5) * 0.4;
  diffuseColor.rgb *= mix(1.0, 0.88 + 0.24 * g, aa) * (0.93 + 0.14 * blot);
  if (az < 30.5 && ax < 1760.0) {
    float jl = 1.0 - smoothstep(0.0, 0.035, abs(fract(wp.z / 7.5 + 0.5) - 0.5) * 7.5);
    float jt = 1.0 - smoothstep(0.0, 0.03, abs(fract(wp.x / 15.0 + 0.5) - 0.5) * 15.0);
    diffuseColor.rgb *= 1.0 - (0.22 * jl + 0.12 * jt) * aa;
  }` : ''}
  ${concrete ? `
  // apron slabs: 7.5 m joints, per-slab tone, tyre marks and oil / fuel stains
  vec2 sl = floor(wp.xz / 7.5);
  float slab = rwHash(sl);
  vec2 fj = abs(fract(wp.xz / 7.5 + 0.5) - 0.5) * 7.5;
  float joint = 1.0 - smoothstep(0.0, 0.05, min(fj.x, fj.y));
  float g = rwNoise(wp.xz * 21.0) * 0.5 + rwNoise(wp.xz * 3.1) * 0.5;
  float oil = smoothstep(0.62, 0.8, rwNoise(wp.xz * 0.23) * 0.6 + rwNoise(wp.xz * 1.3) * 0.4);
  float blot = rwNoise(wp.xz * 0.04);
  diffuseColor.rgb *= (0.9 + 0.1 * slab) * mix(1.0, 0.9 + 0.16 * g, aa) * (0.9 + 0.14 * blot) * (1.0 - 0.35 * oil) * (1.0 - 0.45 * joint * aa);
  rwRubber = 0.4 * oil;` : ''}
  if (uWet > 0.0) {
    // water fills the low spots first: puddles, then a continuous film
    float pud = smoothstep(0.42, 0.7, rwNoise(wp.xz * 0.07) * 0.7 + rwNoise(wp.xz * 0.31) * 0.3);
    rwWet = uWet * mix(0.55, 1.0, pud);
    diffuseColor.rgb *= 1.0 - 0.42 * rwWet;
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= 1.0 - 0.3 * rwRubber;
roughnessFactor = mix(roughnessFactor, 0.12, rwWet * 0.85);`);
  };
  m.customProgramCacheKey = () => 'rwy2-' + (asphalt ? 'a' : concrete ? 'c' : 'm');
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
    const geo = World.radialGrid(this.quality === 'low' ? 160 : 256, 70000);
    const detail = new THREE.CanvasTexture(noiseCanvas(256, 3, 3, [16, 8, 4]));
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.colorSpace = THREE.NoColorSpace;
    detail.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    const F = TERRAIN.flat, Rv = TERRAIN.river;
    this.terrainUniforms = {
      uFlat: { value: new THREE.Vector4(F.x0, F.x1, F.z0, F.z1) },
      uCoastZ: { value: TERRAIN.coastZ },
      uRiver: { value: new THREE.Vector4(Rv.x, Rv.w, Rv.z0, Rv.z1) },
      uSeaDepth: { value: TERRAIN.seaDepth },
      uCenter: { value: new THREE.Vector2() },
      uDetail: { value: detail },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.terrainUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec2 uCenter;
varying vec3 vTW; varying float vSlope;
${TERRAIN_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
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
uniform sampler2D uDetail; uniform vec4 uFlat;
const vec4 cFlat2 = vec4(${TERRAIN.flat2.x0.toFixed(1)}, ${TERRAIN.flat2.x1.toFixed(1)}, ${TERRAIN.flat2.z0.toFixed(1)}, ${TERRAIN.flat2.z1.toFixed(1)});
float tfH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
varying vec3 vTW; varying float vSlope;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 d1 = texture2D(uDetail, vTW.xz / 23.0).rgb;
  vec3 d2 = texture2D(uDetail, vTW.xz / 410.0).rgb;
  vec3 d3 = texture2D(uDetail, vTW.xz / 5300.0).rgb;
  float h = vTW.y;
  vec3 grass = mix(vec3(0.11, 0.19, 0.06), vec3(0.22, 0.29, 0.10), d2.r);
  grass = mix(grass, vec3(0.36, 0.34, 0.17), smoothstep(0.62, 0.8, d3.g) * 0.6);
  grass *= 0.78 + 0.44 * d1.r;
  // mowed airport infield
  float airport = step(-2750.0, vTW.x) * step(vTW.x, 2500.0) * step(-1150.0, vTW.z) * step(vTW.z, 1390.0);
  grass = mix(grass, grass * (0.92 + 0.12 * step(0.5, fract(vTW.x / 24.0))) * vec3(1.05, 1.08, 0.95), airport);
  vec3 forest = vec3(0.07, 0.12, 0.05) * (0.75 + 0.5 * d1.g);
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
    vec3 fc = hc < 0.28 ? vec3(0.17, 0.25, 0.07) : hc < 0.46 ? vec3(0.34, 0.31, 0.15)
            : hc < 0.62 ? vec3(0.24, 0.18, 0.11) : hc < 0.8 ? vec3(0.12, 0.21, 0.06) : vec3(0.42, 0.38, 0.19);
    fc *= 0.82 + 0.3 * d1.r + 0.12 * (tfH(cell + 3.3) - 0.5);
    float px = length(fwidth(r));
    float rows = step(0.5, fract(r.x / 3.2 + hc * 7.0)) * (1.0 - smoothstep(0.4, 1.6, px));
    fc *= 1.0 - 0.1 * rows;
    float edge = min(min(fr.x, 1.0 - fr.x) * fsz.x, min(fr.y, 1.0 - fr.y) * fsz.y);
    float hedge = 1.0 - smoothstep(1.5, 5.0 + px, edge);
    fc = mix(fc, vec3(0.05, 0.09, 0.035), hedge * 0.75);
    float outside = 1.0 - step(uFlat.x, vTW.x) * step(vTW.x, uFlat.y) * step(uFlat.z, vTW.z) * step(vTW.z, uFlat.w);
    outside *= 1.0 - step(cFlat2.x - 400.0, vTW.x) * step(vTW.x, cFlat2.y + 400.0) * step(cFlat2.z - 400.0, vTW.z) * step(vTW.z, cFlat2.w + 400.0);
    float farm = smoothstep(0.38, 0.5, d3.b * 0.8 + d2.r * 0.2) * (1.0 - fm) * (1.0 - smoothstep(60.0, 220.0, h))
               * smoothstep(0.5, 2.0, h) * (1.0 - smoothstep(0.06, 0.18, vSlope)) * outside;
    col = mix(col, fc, farm);
  }
  vec3 rock = vec3(0.33, 0.31, 0.28) * (0.7 + 0.5 * d1.b);
  col = mix(col, rock, smoothstep(0.22, 0.42, vSlope));
  col = mix(col, rock, smoothstep(750.0, 1150.0, h + d2.g * 250.0));
  float snow = smoothstep(1300.0, 1500.0, h + d2.r * 200.0) * (1.0 - smoothstep(0.45, 0.7, vSlope));
  col = mix(col, vec3(0.9, 0.93, 0.97), snow);
  vec3 sand = vec3(0.60, 0.54, 0.41) * (0.85 + 0.3 * d1.r);
  col = mix(col, sand, smoothstep(-0.05, -1.2, h));
  col = mix(col, vec3(0.16, 0.19, 0.17), smoothstep(-6.0, -30.0, h));
  diffuseColor.rgb = col;
}`);
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
    // tessellated (not a single quad) so logarithmic depth stays precise near the camera
    const g = World.radialGrid(96, size / 2);
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
        if (m.map) m.map.anisotropy = 8;
        if (m.name === 'W_Asphalt' || m.name === 'W_TaxiAsphalt') m.color.setScalar(0.62);
        if (['W_Asphalt', 'W_TaxiAsphalt', 'W_MarkWhite', 'W_MarkYellow', 'W_Concrete'].includes(m.name)) patchPavement(m);
        if (m.name.startsWith('W_facade_') || m.name === 'W_GlassTower' || m.name === 'W_Curtain') patchFacade(m);
        if (m.name === 'W_Shoulder') m.color.setScalar(0.75);
        if (m.name === 'W_Concrete') m.color.setScalar(0.66);
        if (m.name === 'W_Roof' || m.name === 'W_PaintWhite') m.color.multiplyScalar(0.72);
      }
      o.receiveShadow = true;
      const n = o.name;
      o.castShadow = this.quality === 'high' && !/Markings|Pavement/.test(n);
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
  }

  setAirportName(name) {
    if (!this.signs) return;
    for (const m of this.signs.children.slice()) { this.signs.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
    const T = signTexts(name || 'City Builder');
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
    v.sunCol.copy(this.sun.color); v.sunI = this.sun.intensity * 1.6;
    v.ambTop.copy(h.color).multiplyScalar(h.intensity * 3.0 + this.moon.intensity * 0.5);
    v.ambBot.copy(h.groundColor).lerp(h.color, 0.6).multiplyScalar(h.intensity * 2.4);
    // light pollution from the city lights up the cloud base at night
    v.ambBot.r += 0.05 * this.night; v.ambBot.g += 0.038 * this.night; v.ambBot.b += 0.028 * this.night;
    v.ambTop.r += 0.012 * this.night; v.ambTop.g += 0.012 * this.night; v.ambTop.b += 0.016 * this.night;
    v.haze.copy(this.scene.fog.color);
    v.vis = W.vis * 0.9;
    v.density = 0.02 + 0.03 * W.overcast;
    v.steps = 56;
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
      o.traverse((m) => { if (m.isMesh) { m.castShadow = this.quality === 'high'; m.receiveShadow = true; } });
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
  sunDirection(tod) {
    // latitude 35 N, spring (declination +8 deg)
    const lat = 35 * DEG, dec = 8 * DEG;
    const H = (tod - 12) * 15 * DEG;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    // az from north, clockwise
    return { el, az, v: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)) };
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.updateWet(dt);
    const W = this.weather;
    const sd = this.sunDirection(this.tod);
    this.sunDir = sd.v;
    const elDeg = sd.el / DEG;
    const day = smoothstep(-6, 8, elDeg);
    this.night = 1 - smoothstep(-4, 6, elDeg);
    const golden = smoothstep(25, 2, elDeg) * day;
    // sky
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(sd.v);
    su.turbidity.value = 1.9 + 7 * W.overcast + golden * 2;
    su.rayleigh.value = 0.95 + golden * 1.4 + (1 - day) * 1.5;
    // sun light
    const sunCol = new THREE.Color().setRGB(1, lerp(0.96, 0.62, golden), lerp(0.92, 0.38, golden));
    this.sun.color.copy(sunCol);
    this.sun.intensity = 3.4 * day * (1 - 0.7 * W.overcast);
    const f = focus || camera.position;
    this.sun.position.set(f.x + sd.v.x * 1500, f.y + sd.v.y * 1500, f.z + sd.v.z * 1500);
    this.sun.target.position.copy(f);
    this.sun.target.updateMatrixWorld();
    this.hemi.intensity = lerp(0.07, 0.55, day) * (1 + 0.4 * W.overcast);
    this.hemi.color.setRGB(lerp(0.25, 0.75, day), lerp(0.3, 0.83, day), lerp(0.45, 1.0, day));
    this.hemi.groundColor.setRGB(lerp(0.04, 0.22, day), lerp(0.04, 0.2, day), lerp(0.05, 0.15, day));
    this.moon.intensity = this.night * 0.25;
    this.moon.position.set(f.x - 800, f.y + 1500, f.z + 600);
    this.moon.target = this.sun.target;
    this.stars.material.opacity = this.night * (1 - W.overcast) * 0.9;
    this.stars.position.copy(camera.position);
    // fog / haze
    const horizon = new THREE.Color().setRGB(
      lerp(0.02, lerp(0.70, 0.93, golden), day), lerp(0.03, lerp(0.79, 0.62, golden), day), lerp(0.06, lerp(0.90, 0.48, golden), day));
    if (W.overcast > 0.5) horizon.lerp(new THREE.Color(0.55 * day + 0.03, 0.58 * day + 0.03, 0.62 * day + 0.04), 0.7);
    let density = 1 / W.vis;
    const cy = camera.position.y;
    if (W.overcast > 0.5 && cy > W.base && cy < W.base + 420) density = 1 / 180;   // inside the deck
    this.scene.fog.color.copy(horizon);
    this.scene.fog.density = density * 1.3;
    this.envGroundMat.color.setRGB(0.1 * day + 0.01, 0.12 * day + 0.01, 0.08 * day + 0.01);
    this.envDome.material.opacity = 0.92 * W.overcast;
    this.envDome.material.color.setRGB(0.55 * day + 0.02, 0.57 * day + 0.02, 0.6 * day + 0.025);
    // env map (re-render when the sun moved)
    const key = Math.round(elDeg * 2) + ':' + Math.round(sd.az / DEG / 4) + ':' + this.weatherName;
    if (key !== this._envKey) {
      this._envKey = key;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.12, 1.0, day) * (1 - 0.3 * W.overcast);
    }
    // terrain / water follow the camera
    const step = 16;
    const cx = Math.round(camera.position.x / step) * step, cz = Math.round(camera.position.z / step) * step;
    this.terrain.position.set(cx, 0, cz);
    this.terrainUniforms.uCenter.value.set(cx, cz);
    this.water.position.x = cx; this.water.position.z = cz;
    this.waterNormal.offset.set(cx / 55 + this.time * 0.012, -cz / 55 + this.time * 0.007);
    this.waterMat.color.setRGB(0.03 + 0.05 * day, 0.10 * day + 0.01, 0.14 * day + 0.02);
    // emissive windows at night
    const em = this.night;
    for (const m of this.emissiveMats) m.emissiveIntensity = m.name === 'W_GlassTower' || m.name === 'W_Sign' ? em * 2 : em * 1.4;
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
      const vis = d < ({ low: 2500, medium: 4500 }[this.quality] || 6500);
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
    this.renderer.toneMappingExposure = lerp(0.95, 0.45, day);
  }
}
