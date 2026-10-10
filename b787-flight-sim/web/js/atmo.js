// Physically based atmosphere (after Hillaire 2020, "A Scalable and Production Ready Sky and
// Atmosphere Rendering Technique"): Rayleigh + Mie scattering, ozone absorption, a spherical
// planet, multiple scattering from a small LUT.
//   * transmittance LUT (256x64)   - optical depth to the top of the atmosphere, once per haze
//   * multi-scattering LUT (32x32) - isotropic higher-order scattering, once per haze
//   * sky-view LUT (192x108)       - the whole sky as seen from the camera altitude, per frame
//   * sky dome                     - samples the sky-view LUT, sun disc with limb darkening
//   * aerial perspective pass      - in-scattering and extinction between the camera and every
//                                    pixel of the scene (from the depth buffer), in HDR before
//                                    the tone curve; the far terrain, the sea and the sky meet
//                                    in the same haze
// The boundary-layer haze (Mie, scale height 1.2 km) follows the weather's visibility: grey
// and thick low down on a humid day, a deep blue zenith and a sharp horizon band at FL350.
// Units in the shaders: km.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const ATMO = {
  Rg: 6360, Rt: 6460,
  rayleigh: [5.802e-3, 13.558e-3, 33.1e-3], hR: 8,
  mieS: 3.996e-3, mieA: 0.444e-3, hM: 1.2, g: 0.8,
  ozone: [0.650e-3, 1.881e-3, 0.085e-3],
  albedo: [0.09, 0.1, 0.1],
};

const COMMON = /* glsl */`
precision highp float;
const float Rg = ${ATMO.Rg.toFixed(1)}, Rt = ${ATMO.Rt.toFixed(1)};
const vec3 bR = vec3(${ATMO.rayleigh.join(', ')});
const vec3 bO = vec3(${ATMO.ozone.join(', ')});
const float PI = 3.14159265;
uniform float uMie;              // Mie scattering scale (haze)
float mieS() { return ${ATMO.mieS} * uMie; }
float mieE() { return (${ATMO.mieS} + ${ATMO.mieA}) * uMie; }
void medium(float h, out vec3 scat, out vec3 ext, out vec3 sR, out float sM) {
  float dR = exp(-max(h, 0.0) / ${ATMO.hR.toFixed(1)}), dM = exp(-max(h, 0.0) / ${ATMO.hM.toFixed(2)});
  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  sR = bR * dR; sM = mieS() * dM;
  scat = sR + sM;
  ext = sR + mieE() * dM + bO * dO;
}
// distance along (r, mu) to the top of the atmosphere / to the ground (-1: misses)
float dTop(float r, float mu) { float d = r * r * (mu * mu - 1.0) + Rt * Rt; return max(0.0, -r * mu + sqrt(max(d, 0.0))); }
float dGround(float r, float mu) {
  float d = r * r * (mu * mu - 1.0) + Rg * Rg;
  if (d < 0.0 || mu > 0.0) return -1.0;
  return max(0.0, -r * mu - sqrt(d));
}
const float H = sqrt(Rt * Rt - Rg * Rg);
vec2 tUV(float r, float mu) {
  float rho = sqrt(max(r * r - Rg * Rg, 0.0));
  float d = dTop(r, mu), dmin = Rt - r, dmax = rho + H;
  return vec2((d - dmin) / max(dmax - dmin, 1e-4), rho / H);
}
float phaseR(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float phaseM(float c) {
  const float g = ${ATMO.g};
  float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + c * c) / pow(max(1.0 + g * g - 2.0 * g * c, 1e-4), 1.5);
}
`;

const FSQ_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const TRANS_FRAG = /* glsl */`${COMMON}
varying vec2 vUv;
void main() {
  float rho = H * vUv.y, r = sqrt(rho * rho + Rg * Rg);
  float dmin = Rt - r, dmax = rho + H, d = dmin + vUv.x * (dmax - dmin);
  float mu = d < 1e-4 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
  vec3 od = vec3(0.0);
  const int N = 40;
  float dt = d / float(N);
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) * dt;
    float h = sqrt(r * r + t * t + 2.0 * r * mu * t) - Rg;
    vec3 sc, ex, sR; float sM; medium(h, sc, ex, sR, sM);
    od += ex * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}`;

const TRANS_SAMPLE = /* glsl */`
uniform sampler2D tTrans;
vec3 trans(float r, float mu) { return texture2D(tTrans, tUV(r, mu)).rgb; }
// sun transmittance with the planet's shadow (soft over ~0.5 deg)
vec3 sunTrans(float r, float muS) {
  float sinH = Rg / r, cosH = -sqrt(max(1.0 - sinH * sinH, 0.0));
  return trans(r, muS) * smoothstep(-0.0087, 0.0087, muS - cosH);
}
`;

const MS_FRAG = /* glsl */`${COMMON}
${TRANS_SAMPLE}
varying vec2 vUv;
uniform vec3 uAlbedo;
void main() {
  float muS = vUv.x * 2.0 - 1.0;
  float r = Rg + 0.01 + vUv.y * (Rt - Rg - 0.02);
  vec3 L2 = vec3(0.0), fms = vec3(0.0);
  const int ND = 8;
  for (int a = 0; a < ND; a++) for (int b = 0; b < ND; b++) {
    // uniform directions on the sphere
    float u = (float(a) + 0.5) / float(ND), v = (float(b) + 0.5) / float(ND);
    float cz = 1.0 - 2.0 * u, sz = sqrt(1.0 - cz * cz), ph = v * 2.0 * PI;
    vec3 dir = vec3(sz * cos(ph), cz, sz * sin(ph));
    vec3 sun = vec3(sqrt(1.0 - muS * muS), muS, 0.0);
    float mu = dir.y;
    float dg = dGround(r, mu);
    float dist = dg >= 0.0 ? dg : dTop(r, mu);
    const int NS = 20;
    float dt = dist / float(NS);
    vec3 thr = vec3(1.0), L = vec3(0.0), F = vec3(0.0);
    for (int i = 0; i < NS; i++) {
      float t = (float(i) + 0.5) * dt;
      vec3 p = vec3(0.0, r, 0.0) + dir * t;
      float rr = length(p), h = rr - Rg;
      vec3 sc, ex, sR; float sM; medium(h, sc, ex, sR, sM);
      vec3 Ts = sunTrans(rr, dot(p / rr, sun));
      vec3 Tst = exp(-ex * dt);
      vec3 S = Ts * sc / (4.0 * PI);
      L += thr * (S - S * Tst) / max(ex, vec3(1e-6));
      F += thr * (sc - sc * Tst) / max(ex, vec3(1e-6));
      thr *= Tst;
    }
    if (dg >= 0.0) {
      vec3 p = vec3(0.0, r, 0.0) + dir * dist;
      vec3 n = normalize(p);
      L += thr * sunTrans(length(p), dot(n, sun)) * max(dot(n, sun), 0.0) * uAlbedo / PI;
    }
    L2 += L; fms += F;
  }
  L2 /= float(ND * ND); fms /= float(ND * ND);
  gl_FragColor = vec4(L2 / max(1.0 - fms, vec3(1e-3)), 1.0);
}`;

const MS_SAMPLE = /* glsl */`
uniform sampler2D tMS;
vec3 msLum(float r, float muS) { return texture2D(tMS, vec2(muS * 0.5 + 0.5, clamp((r - Rg - 0.01) / (Rt - Rg - 0.02), 0.0, 1.0))).rgb; }
`;

// scattering along a ray segment from the camera (altitude r) - shared by the sky-view LUT
// and the aerial perspective
const MARCH = /* glsl */`
uniform vec3 uAlbedoG;
// L: in-scattered light (sun illuminance 1), T: transmittance
void march(vec3 o, vec3 dir, float dist, vec3 sun, int ns, bool ground, out vec3 L, out vec3 T) {
  float c = dot(dir, sun);
  float pR = phaseR(c), pM = phaseM(c);
  L = vec3(0.0); T = vec3(1.0);
  float tPrev = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= ns) break;
    // denser samples near the camera
    float f1 = (float(i) + 1.0) / float(ns);
    float t1 = dist * f1 * f1;
    float tm = 0.5 * (tPrev + t1), dt = t1 - tPrev;
    tPrev = t1;
    vec3 p = o + dir * tm;
    float rr = length(p), h = rr - Rg;
    vec3 sc, ex, sR; float sM; medium(h, sc, ex, sR, sM);
    float muS = dot(p / rr, sun);
    vec3 Ts = sunTrans(rr, muS);
    vec3 S = Ts * (sR * pR + sM * pM) + msLum(rr, muS) * sc;
    vec3 Tst = exp(-ex * dt);
    L += T * (S - S * Tst) / max(ex, vec3(1e-6));
    T *= Tst;
  }
  if (ground) {
    vec3 p = o + dir * dist;
    vec3 n = normalize(p);
    L += T * sunTrans(length(p), dot(n, sun)) * max(dot(n, sun), 0.0) * uAlbedoG / PI;
  }
}
`;

// sky-view parameterisation: x = azimuth from the sun (squared: finer near it),
// y = view zenith, non-linear around the horizon
const SKYUV = /* glsl */`
vec2 skyUV(float r, vec3 dir, vec3 sun) {
  float hz = PI - asin(clamp(Rg / r, 0.0, 1.0));          // zenith angle of the horizon
  float zen = acos(clamp(dir.y, -1.0, 1.0));
  float v;
  if (zen < hz) { float c = 1.0 - sqrt(max(1.0 - zen / hz, 0.0)); v = 0.5 * c; }
  else { float c = sqrt(clamp((zen - hz) / (PI - hz), 0.0, 1.0)); v = 0.5 + 0.5 * c; }
  vec2 a = normalize(dir.xz + vec2(1e-7, 0.0)), s = normalize(sun.xz + vec2(1e-7, 0.0));
  float az = acos(clamp(dot(a, s), -1.0, 1.0)) / PI;
  return vec2(sqrt(az), v);
}
`;

const SKYVIEW_FRAG = /* glsl */`${COMMON}
${TRANS_SAMPLE}
${MS_SAMPLE}
${MARCH}
uniform float uR;
uniform vec3 uSun;      // in the frame with the sun at azimuth 0
varying vec2 vUv;
void main() {
  float r = uR;
  float hz = PI - asin(clamp(Rg / r, 0.0, 1.0));
  float zen;
  if (vUv.y < 0.5) { float c = vUv.y * 2.0; zen = hz * (1.0 - (1.0 - c) * (1.0 - c)); }
  else { float c = vUv.y * 2.0 - 1.0; zen = hz + (PI - hz) * c * c; }
  float az = vUv.x * vUv.x * PI;
  vec3 dir = vec3(sin(zen) * cos(az), cos(zen), sin(zen) * sin(az));
  vec3 sun = uSun;
  float dg = dGround(r, dir.y);
  float dist = dg >= 0.0 ? dg : dTop(r, dir.y);
  vec3 L, T;
  march(vec3(0.0, r, 0.0), dir, dist, sun, 30, dg >= 0.0, L, T);
  gl_FragColor = vec4(L, 1.0);
}`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;          // at the far plane
  #include <logdepthbuf_vertex>
}`;

const SKY_FRAG = /* glsl */`${COMMON}
${TRANS_SAMPLE}
${SKYUV}
#include <logdepthbuf_pars_fragment>
uniform sampler2D tSky;
uniform float uR, uK, uDisc, uSunAng;
uniform vec3 uSunW;
varying vec3 vDir;
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vDir);
  vec3 L = texture2D(tSky, skyUV(uR, dir, uSunW)).rgb;
  // sun disc with limb darkening, through the atmosphere
  float c = dot(dir, uSunW);
  float ca = cos(uSunAng);
  if (uDisc > 0.0 && c > ca && dGround(uR, dir.y) < 0.0) {
    float x = clamp((1.0 - c) / (1.0 - ca), 0.0, 1.0);
    float mu = sqrt(1.0 - x);
    vec3 limb = pow(vec3(mu), vec3(0.48, 0.6, 0.75));
    L += trans(uR, dir.y) * limb * uDisc;
  }
  gl_FragColor = vec4(L * uK, 1.0);
}`;

const AERIAL_FRAG = /* glsl */`${COMMON}
${TRANS_SAMPLE}
${MS_SAMPLE}
${MARCH}
uniform sampler2D tDiffuse, tDepth;
uniform mat4 uProjInv, uCamWorld;
uniform float uFar, uR, uK, uAmt;
uniform vec3 uSunW, uCamPos;
varying vec2 vUv;
void main() {
  vec4 col = texture2D(tDiffuse, vUv);
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.99999 || uAmt <= 0.0) { gl_FragColor = col; return; }
  float w = exp2(d * log2(uFar + 1.0)) - 1.0;
  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rv = v.xyz / v.w;
  vec3 pv = rv * (w / -rv.z);
  vec3 dirW = (uCamWorld * vec4(pv, 0.0)).xyz;
  float dist = length(dirW) / 1000.0;                  // km
  if (dist < 0.02) { gl_FragColor = col; return; }
  vec3 dir = dirW / (dist * 1000.0);
  vec3 L, T;
  int ns = int(clamp(4.0 + dist * 0.5, 4.0, 14.0));
  march(vec3(0.0, uR, 0.0), dir, dist, uSunW, ns, false, L, T);
  T = mix(vec3(1.0), T, uAmt);
  gl_FragColor = vec4(col.rgb * T + L * uK * uAmt, col.a);
}`;

// --------------------------------------------------------------------- CPU side
// transmittance from altitude h (km) towards elevation el (rad), for the sun light colour
export function transmittanceCPU(hKm, el, mie = 1) {
  const { Rg, Rt, rayleigh, hR, hM, ozone } = ATMO;
  const r = Rg + Math.max(hKm, 0.001), mu = Math.sin(el);
  const disc = r * r * (mu * mu - 1) + Rt * Rt;
  const d = -r * mu + Math.sqrt(Math.max(disc, 0));
  const g = r * r * (mu * mu - 1) + Rg * Rg;
  if (g >= 0 && mu < 0) return [0, 0, 0];
  const N = 48, dt = d / N, od = [0, 0, 0];
  const mE = (ATMO.mieS + ATMO.mieA) * mie;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    const h = Math.sqrt(r * r + t * t + 2 * r * mu * t) - Rg;
    const dR = Math.exp(-Math.max(h, 0) / hR), dM = Math.exp(-Math.max(h, 0) / hM), dO = Math.max(0, 1 - Math.abs(h - 25) / 15);
    for (let k = 0; k < 3; k++) od[k] += (rayleigh[k] * dR + mE * dM + ozone[k] * dO) * dt;
  }
  return od.map((x) => Math.exp(-x));
}

// haze (Mie scale) from the meteorological visibility (Koschmieder: V = 3.912 / extinction)
export function mieFromVisibility(visM) {
  const ext = 3.912 / Math.max(visM / 1000, 1);
  return THREE.MathUtils.clamp((ext - ATMO.rayleigh[1]) / (ATMO.mieS + ATMO.mieA), 0.5, 40);
}

export class Atmosphere {
  constructor(renderer) {
    this.renderer = renderer;
    const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.transRT = rt(256, 64);
    this.msRT = rt(32, 32);
    this.skyRT = rt(192, 108);
    this.u = {
      uMie: { value: 1 }, tTrans: { value: this.transRT.texture }, tMS: { value: this.msRT.texture }, tSky: { value: this.skyRT.texture },
      uAlbedo: { value: new THREE.Vector3(...ATMO.albedo) }, uAlbedoG: { value: new THREE.Vector3(...ATMO.albedo) },
      uR: { value: ATMO.Rg + 0.05 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunW: { value: new THREE.Vector3(0, 1, 0) },
      uK: { value: 1 }, uDisc: { value: 1 }, uSunAng: { value: 0.0047 * 1.15 },
    };
    const mat = (frag) => new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader: frag, uniforms: this.u, depthTest: false, depthWrite: false });
    this.transQ = new FullScreenQuad(mat(TRANS_FRAG));
    this.msQ = new FullScreenQuad(mat(MS_FRAG));
    this.skyQ = new FullScreenQuad(mat(SKYVIEW_FRAG));
    this.skyMaterial = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.u,
      side: THREE.BackSide, depthWrite: false, fog: false });
    this._mie = -1;
  }

  _draw(q, target) {
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(target);
    q.render(r);
    r.setRenderTarget(prev);
  }

  // camHeight: m, sunDir: world unit vector, mie: haze scale
  update(camHeight, sunDir, mie) {
    const u = this.u;
    if (Math.abs(mie - this._mie) > 0.02 * Math.max(mie, 1)) {
      this._mie = mie;
      u.uMie.value = mie;
      this._draw(this.transQ, this.transRT);
      this._draw(this.msQ, this.msRT);
    }
    u.uR.value = ATMO.Rg + THREE.MathUtils.clamp(camHeight / 1000, 0.005, 60);
    u.uSunW.value.copy(sunDir);
    // the sky-view LUT lives in a frame with the sun at azimuth 0
    const h = Math.hypot(sunDir.x, sunDir.z);
    u.uSun.value.set(h, sunDir.y, 0);
    this._draw(this.skyQ, this.skyRT);
  }

  dispose() { for (const t of [this.transRT, this.msRT, this.skyRT]) t.dispose(); }
}

// aerial perspective over the scene (between the scene render and the volumetric clouds)
export class AerialPass extends Pass {
  constructor(atmo, camera, shared) {
    super();
    this.atmo = atmo; this.camera = camera; this.shared = shared;
    this.uniforms = Object.assign({}, atmo.u, {
      tDiffuse: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uFar: { value: 1 }, uAmt: { value: 1 }, uCamPos: { value: new THREE.Vector3() },
    });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader: AERIAL_FRAG, uniforms: this.uniforms,
      depthTest: false, depthWrite: false }));
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms, cam = this.camera;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.shared.depth;
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uFar.value = cam.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
