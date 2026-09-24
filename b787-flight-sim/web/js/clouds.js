// Volumetric clouds: ray-marched through tileable Perlin-Worley 3-D noise, composited
// in the HDR post chain against the scene depth (logarithmic depth buffer -> distance).
//   * shape   : 64^3 Perlin-Worley (billowy cumulus), detail: 32^3 Worley fbm (erosion)
//   * light   : Beer-Lambert with 5 samples towards the sun, dual-lobe Henyey-Greenstein,
//               "powder" darkening, height-dependent ambient from the sky
//   * aerial perspective: distant clouds fade into the horizon haze
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { mulberry32 } from './util.js';

// ------------------------------------------------------------------ tileable noise
function perlin3(N, period, rnd) {
  const G = new Float32Array(period * period * period * 3);
  for (let i = 0; i < G.length / 3; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    G[i * 3] = r * Math.cos(a); G[i * 3 + 1] = r * Math.sin(a); G[i * 3 + 2] = z;
  }
  const out = new Float32Array(N * N * N);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const g = (x, y, z, dx, dy, dz) => {
    const i = (((x % period) * period + (y % period)) * period + (z % period)) * 3;
    return G[i] * dx + G[i + 1] * dy + G[i + 2] * dz;
  };
  let k = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N * period, py = y / N * period, pz = z / N * period;
    const x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
    const fx = px - x0, fy = py - y0, fz = pz - z0;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const l = (a, b, t) => a + (b - a) * t;
    const n = l(l(l(g(x0, y0, z0, fx, fy, fz), g(x0 + 1, y0, z0, fx - 1, fy, fz), u),
      l(g(x0, y0 + 1, z0, fx, fy - 1, fz), g(x0 + 1, y0 + 1, z0, fx - 1, fy - 1, fz), u), v),
    l(l(g(x0, y0, z0 + 1, fx, fy, fz - 1), g(x0 + 1, y0, z0 + 1, fx - 1, fy, fz - 1), u),
      l(g(x0, y0 + 1, z0 + 1, fx, fy - 1, fz - 1), g(x0 + 1, y0 + 1, z0 + 1, fx - 1, fy - 1, fz - 1), u), v), w);
    out[k++] = n;
  }
  return out;
}

function worley3(N, cells, rnd) {
  const P = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < P.length; i++) P[i] = rnd();
  const out = new Float32Array(N * N * N);
  let k = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N * cells, py = y / N * cells, pz = z / N * cells;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy, iz = cz + dz;
      const wx = (ix + cells) % cells, wy = (iy + cells) % cells, wz = (iz + cells) % cells;
      const j = ((wz * cells + wy) * cells + wx) * 3;
      const qx = ix + P[j] - px, qy = iy + P[j + 1] - py, qz = iz + P[j + 2] - pz;
      const d = qx * qx + qy * qy + qz * qz;
      if (d < best) best = d;
    }
    out[k++] = 1 - Math.min(Math.sqrt(best), 1);
  }
  return out;
}

function tex3(data, N) {
  const u8 = new Uint8Array(N * N * N);
  for (let i = 0; i < u8.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)));
  const t = new THREE.Data3DTexture(u8, N, N, N);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

function buildNoise() {
  const rnd = mulberry32(7);
  const N = 64;
  const p = perlin3(N, 4, rnd), p2 = perlin3(N, 8, rnd);
  const w1 = worley3(N, 4, rnd), w2 = worley3(N, 8, rnd), w3 = worley3(N, 16, rnd);
  const shape = new Float32Array(N * N * N);
  for (let i = 0; i < shape.length; i++) {
    const per = 0.5 + 0.5 * (p[i] * 0.75 + p2[i] * 0.35);          // ~0..1
    const wor = w1[i] * 0.625 + w2[i] * 0.25 + w3[i] * 0.125;
    // Perlin-Worley: remap perlin by the inverted worley fbm -> billowy shapes
    const pw = Math.min(1, Math.max(0, (per - (1 - wor)) / Math.max(1 - (1 - wor), 1e-3)));
    shape[i] = pw * 0.55 + wor * 0.45;
  }
  // stretch to 0..1 (2nd..98th percentile) so "cover" maps to sky fraction
  const stretch = (arr) => {
    const srt = Float32Array.from(arr).sort();
    const lo = srt[Math.floor(srt.length * 0.02)], hi = srt[Math.floor(srt.length * 0.98)];
    for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, Math.max(0, (arr[i] - lo) / (hi - lo)));
  };
  stretch(shape);
  const D = 32;
  const d1 = worley3(D, 4, rnd), d2 = worley3(D, 8, rnd), d3 = worley3(D, 16, rnd);
  const detail = new Float32Array(D * D * D);
  for (let i = 0; i < detail.length; i++) detail[i] = d1[i] * 0.625 + d2[i] * 0.25 + d3[i] * 0.125;
  stretch(detail);
  return { shape: tex3(shape, N), detail: tex3(detail, D) };
}

// ------------------------------------------------------------------ pass
const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
uniform sampler2D tDiffuse, tDepth;
uniform sampler3D uShape, uDetail;
uniform mat4 uProjInv, uCamWorld;
uniform vec3 uCam, uSunDir, uSunCol, uAmbTop, uAmbBot, uHaze;
uniform float uBase, uTop, uCover, uDensity, uFar, uTime, uVis, uSteps;
uniform vec2 uRes;
uniform vec2 uWind;
varying vec2 vUv;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

float heightFrac(float y) { return clamp((y - uBase) / max(uTop - uBase, 1.0), 0.0, 1.0); }

float density(vec3 p, bool cheap) {
  float h = heightFrac(p.y);
  // cumulus profile: rounded bottom, anvil-less taper at the top
  float prof = smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.55, h);
  vec3 q = p + vec3(uWind.x, 0.0, uWind.y) * uTime;
  float s = texture(uShape, q * vec3(1.0 / 7000.0, 1.0 / 3400.0, 1.0 / 7000.0)).r;
  // large-scale coverage variation (cloud streets / gaps)
  float cov = texture(uShape, q * vec3(1.0 / 38000.0, 0.0, 1.0 / 38000.0) + 0.37).r;
  float c = mix(clamp(uCover * (0.55 + 0.9 * cov), 0.0, 1.0), 1.0, smoothstep(0.85, 1.0, uCover));   // decks have no holes
  float base = remap(s * prof, 1.0 - c, 1.0, 0.0, 1.0);
  if (base <= 0.0 || cheap) return max(base, 0.0) * uDensity;
  float d = texture(uDetail, q * (1.0 / 900.0) + vec3(0.0, uTime * 0.004, 0.0)).r;
  // erode the edges more at the bottom (wispy) than the top (billows)
  float er = mix(d, 1.0 - d, clamp(h * 3.0, 0.0, 1.0)) * 0.35;
  return max(remap(base, er, 1.0, 0.0, 1.0), 0.0) * uDensity;
}

float lightMarch(vec3 p) {
  float t = 0.0, od = 0.0;
  float ds = (uTop - uBase) * 0.12;
  for (int i = 0; i < 5; i++) {
    t += ds * (1.0 + float(i) * 0.6);
    vec3 q = p + uSunDir * t;
    if (q.y > uTop || q.y < uBase) break;
    od += density(q, i > 2) * ds * (1.0 + float(i) * 0.6);
  }
  return od;
}

void main() {
  // world ray
  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dirV = normalize(v.xyz / v.w);
  vec3 dir = normalize((uCamWorld * vec4(dirV, 0.0)).xyz);
  // scene distance from the logarithmic depth buffer
  float dz = texture2D(tDepth, vUv).r;
  float w = exp2(dz * log2(uFar + 1.0)) - 1.0;
  float sceneT = dz >= 0.99999 ? 1e9 : w / max(-dirV.z, 1e-4);
  // intersect the cloud slab
  float t0, t1;
  if (abs(dir.y) < 1e-5) { if (uCam.y < uBase || uCam.y > uTop) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } t0 = 0.0; t1 = 60000.0; }
  else {
    float ta = (uBase - uCam.y) / dir.y, tb = (uTop - uCam.y) / dir.y;
    t0 = max(min(ta, tb), 0.0); t1 = max(ta, tb);
  }
  // inside the layer the visibility is short anyway: keep the steps small
  // geometry in front of the layer (the aircraft) is masked at full resolution in the
  // composite; march the clouds behind it so the half-res buffer has no holes (no halos)
  if (sceneT < t0) sceneT = 1e9;
  bool inside = uCam.y > uBase && uCam.y < uTop;
  float tCap = inside ? 18000.0 : 60000.0;
  // a solid deck extends to the horizon: beyond the march range it is just haze-lit cloud
  bool deck = uCover > 0.85 && t1 > tCap && sceneT > tCap;
  t1 = min(t1, min(sceneT, tCap));
  if (t1 <= t0) {
    if (deck) { gl_FragColor = vec4(uHaze, 0.0); return; }
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return;
  }
  int N = int(uSteps);
  float span = t1 - t0;
  float ds = span / float(N);
  // inside or close to the layer, march finer near the camera
  float jitter = hash12(gl_FragCoord.xy + fract(uTime * 13.7) * 100.0);
  float T = 1.0;
  vec3 L = vec3(0.0);
  float cosT = dot(dir, uSunDir);
  float phase = mix(hg(cosT, 0.65), hg(cosT, -0.25), 0.3) * 4.0 * 3.14159;
  float firstHit = -1.0;
  for (int i = 0; i < 96; i++) {
    if (i >= N || T < 0.02) break;
    // quadratic step distribution: fine near the entry point, coarse far away
    float u = (float(i) + jitter) / float(N);
    float t = t0 + span * u * u;
    ds = max(span * 2.0 * u / float(N), 4.0);
    vec3 p = uCam + dir * t;
    float d = density(p, false);
    if (d > 0.001) {
      if (firstHit < 0.0) firstHit = t;
      float od = lightMarch(p);
      // multiple scattering approximated by extra, weaker-extinction octaves
      float beer = exp(-od) + 0.35 * exp(-od * 0.25) + 0.12 * exp(-od * 0.06);
      float powder = 1.0 - exp(-d * ds * 2.0);
      float sun = beer * mix(1.0, powder, 0.3) * phase;
      float h = heightFrac(p.y);
      vec3 amb = mix(uAmbBot, uAmbTop, h);
      vec3 S = (uSunCol * sun + amb) * d;
      float a = exp(-d * ds);
      // energy-conserving integration of in-scattered light over the step
      L += T * S * (1.0 - a) / max(d, 1e-4);
      T *= a;
    }
  }
  // aerial perspective: fade distant clouds into the haze colour
  float dist = firstHit < 0.0 ? t1 : firstHit;
  float haze = 1.0 - exp(-dist / uVis);
  L = mix(L, uHaze * (1.0 - T), haze);
  if (deck) { L += T * uHaze; T = 0.0; }
  gl_FragColor = vec4(L, T);
}`;

// full-resolution composite of the half-resolution cloud buffer
const COMP = /* glsl */`
uniform sampler2D tDiffuse, tDepth, tCloud;
uniform vec2 uTexel;
uniform mat4 uProjInv, uCamWorld;
uniform vec3 uCam;
uniform float uBase, uTop, uFar;
varying vec2 vUv;
void main() {
  vec4 scene = texture2D(tDiffuse, vUv);
  // 5-tap tent filter hides the per-pixel ray jitter
  vec4 c = texture2D(tCloud, vUv) * 0.4
    + (texture2D(tCloud, vUv + uTexel * vec2(1.0, 1.0)) + texture2D(tCloud, vUv + uTexel * vec2(-1.0, 1.0))
     + texture2D(tCloud, vUv + uTexel * vec2(1.0, -1.0)) + texture2D(tCloud, vUv + uTexel * vec2(-1.0, -1.0))) * 0.15;
  // geometry nearer than the cloud layer is never covered (sharp aircraft edges)
  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dirV = normalize(v.xyz / v.w);
  vec3 dir = normalize((uCamWorld * vec4(dirV, 0.0)).xyz);
  float dz = texture2D(tDepth, vUv).r;
  float sceneT = dz >= 0.99999 ? 1e9 : (exp2(dz * log2(uFar + 1.0)) - 1.0) / max(-dirV.z, 1e-4);
  float t0 = 0.0;
  if (uCam.y < uBase) t0 = dir.y > 1e-5 ? (uBase - uCam.y) / dir.y : 1e9;
  else if (uCam.y > uTop) t0 = dir.y < -1e-5 ? (uTop - uCam.y) / dir.y : 1e9;
  if (sceneT < t0) c = vec4(0.0, 0.0, 0.0, 1.0);
  gl_FragColor = vec4(scene.rgb * c.a + c.rgb, scene.a);
}`;

export class CloudPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.needsSwap = true;
    const noise = buildNoise();
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: null }, uShape: { value: noise.shape }, uDetail: { value: noise.detail },
      uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uAmbTop: { value: new THREE.Color(0.6, 0.7, 0.9) }, uAmbBot: { value: new THREE.Color(0.3, 0.35, 0.45) },
      uHaze: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uBase: { value: 1200 }, uTop: { value: 2400 }, uCover: { value: 0.4 }, uDensity: { value: 0.03 },
      uFar: { value: 250000 }, uTime: { value: 0 }, uVis: { value: 30000 }, uSteps: { value: 64 }, uWind: { value: new THREE.Vector2(6, 2) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.compU = {
      tDiffuse: { value: null }, tDepth: { value: null }, tCloud: { value: this.rt.texture }, uTexel: { value: new THREE.Vector2() },
      uProjInv: this.uniforms.uProjInv, uCamWorld: this.uniforms.uCamWorld, uCam: this.uniforms.uCam,
      uBase: this.uniforms.uBase, uTop: this.uniforms.uTop, uFar: this.uniforms.uFar,
    };
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.compU, vertexShader: VERT, fragmentShader: COMP,
      depthTest: false, depthWrite: false }));
    this.scale = 0.5;
  }

  setSize(w, h) {
    const cw = Math.max(1, Math.round(w * this.scale)), ch = Math.max(1, Math.round(h * this.scale));
    this.rt.setSize(cw, ch);
    this.compU.uTexel.value.set(0.75 / cw, 0.75 / ch);
  }

  update(dt, s) {
    const u = this.uniforms, cam = this.camera;
    u.uTime.value += dt;
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCam.value.copy(cam.position);
    u.uFar.value = cam.far;
    Object.assign(this, { enabled: s.enabled });
    u.uBase.value = s.base; u.uTop.value = s.top; u.uCover.value = s.cover;
    u.uSunDir.value.copy(s.sunDir);
    u.uSunCol.value.copy(s.sunCol).multiplyScalar(s.sunI);
    u.uAmbTop.value.copy(s.ambTop); u.uAmbBot.value.copy(s.ambBot);
    u.uHaze.value.copy(s.haze);
    u.uVis.value = s.vis;
    u.uDensity.value = s.density;
    u.uSteps.value = s.steps;
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    this.compU.tDiffuse.value = readBuffer.texture;
    this.compU.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }

  dispose() { this.material.dispose(); this.quad.dispose(); this.comp.dispose(); this.rt.dispose(); }
}
