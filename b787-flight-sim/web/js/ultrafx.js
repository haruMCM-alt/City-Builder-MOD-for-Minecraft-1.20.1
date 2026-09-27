// "Ultra" post effects, all working from the resolved scene depth (logarithmic depth buffer):
//   * DepthGrab : remembers the depth texture of the scene render for the passes further down
//                 the chain (the composer ping-pongs between two targets)
//   * SSAO      : scalable ambient obscurance (SAO) from depth only, half resolution,
//                 depth-aware upsampling; contact shadows under the gear, in the jet bridges,
//                 between the city blocks - the radius grows with distance
//   * GodRays   : crepuscular rays - radial blur of the bright, unoccluded sky towards the
//                 sun (clouds and buildings cut the shafts), half resolution
//   * Flare     : physically inspired lens flare - ghosts along the optical axis, a chromatic
//                 halo ring, a starburst and an anamorphic streak; occlusion measured on the
//                 GPU around the sun disc (clouds dim it, the fuselage hides it)
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DEPTH_GLSL = /* glsl */`
uniform sampler2D tDepth;
uniform float uFar;
uniform mat4 uProjInv;
float rawDepth(vec2 uv) { return texture2D(tDepth, uv).r; }
float viewW(vec2 uv) { float d = rawDepth(uv); return d >= 0.99999 ? 1e7 : exp2(d * log2(uFar + 1.0)) - 1.0; }
vec3 viewPos(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 r = v.xyz / v.w;
  return r * (viewW(uv) / -r.z);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// ------------------------------------------------------------------------------ depth grab
export class DepthGrabPass extends Pass {
  constructor(shared) { super(); this.shared = shared; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) { this.shared.depth = readBuffer.depthTexture; }
}

// ------------------------------------------------------------------------------ SSAO
const AO_FRAG = /* glsl */`
${DEPTH_GLSL}
uniform vec2 uTexel;          // full-resolution texel
uniform float uAspect, uRadius, uMaxDist, uProjY, uTime;
varying vec2 vUv;
const int N = 16;
void main() {
  float w = viewW(vUv);
  // (half float target: keep the stored distance finite)
  if (w > uMaxDist) { gl_FragColor = vec4(1.0, min(w, 60000.0), 0.0, 1.0); return; }
  vec3 P = viewPos(vUv);
  // normal from the depth: pick the smoother side at silhouettes
  vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0)), pl = viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y)), pd = viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 Nn = normalize(cross(dx, dy));
  // world radius: ~1.2 m close by (gear, doors), tens of metres over the city
  float R = uRadius * (1.0 + w * 0.012);
  float ssR = min(R * uProjY * 0.5 / w, 0.12);
  if (ssR < uTexel.y * 2.0) { gl_FragColor = vec4(1.0, w, 0.0, 1.0); return; }
  float ang = hash12(gl_FragCoord.xy + fract(uTime) * 61.0) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < N; i++) {
    float fi = (float(i) + 0.5) / float(N);
    float a = ang + fi * 7.0 * 6.2831853;
    vec2 o = vec2(cos(a) / uAspect, sin(a)) * ssR * fi;
    vec3 v = viewPos(vUv + o) - P;
    float vv = dot(v, v);
    float fall = max(1.0 - vv / (R * R), 0.0);
    // distance-scaled bias: the depth precision (and the normal from it) degrades far away,
    // flat ground / water must not self-shadow into bands
    occ += fall * max((dot(v, Nn) - 0.0015 * w) * inversesqrt(vv + 1e-4) - 0.15, 0.0);
  }
  float ao = clamp(1.0 - occ * 2.2 / float(N), 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(uMaxDist * 0.6, uMaxDist, w));
  gl_FragColor = vec4(ao, w, 0.0, 1.0);
}`;

const AO_COMP = /* glsl */`
uniform sampler2D tDiffuse, tAO, tDepth;
uniform float uFar, uStrength, uExposure;
uniform vec2 uAOTexel;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.99999) { gl_FragColor = c; return; }
  float w = exp2(d * log2(uFar + 1.0)) - 1.0;
  // depth-aware 3x3 upsample of the half-resolution AO
  float s = 0.0, ws = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 t = min(texture2D(tAO, vUv + vec2(float(i), float(j)) * uAOTexel).rg, vec2(1.0, 60000.0));
    float k = exp(-min(abs(t.y - w) / (0.02 * w + 0.05), 30.0)) * (i == 0 && j == 0 ? 2.0 : 1.0);
    s += t.x * k; ws += k;
  }
  float ao = ws > 1e-4 ? clamp(s / ws, 0.0, 1.0) : 1.0;
  if (!(ao == ao) || w > 50000.0) ao = 1.0;
  // sunlit surfaces keep more of their light (AO mainly takes away the sky light)
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
  ao = mix(ao, 1.0, smoothstep(0.7, 2.5, l) * 0.5);
  gl_FragColor = vec4(c.rgb * mix(1.0, ao, uStrength), c.a);
}`;

export class SSAOPass extends Pass {
  constructor(camera, shared) {
    super();
    this.camera = camera; this.shared = shared;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.u = {
      tDepth: { value: null }, uFar: { value: 250000 }, uProjInv: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uRadius: { value: 1.2 },
      uMaxDist: { value: 1800 }, uProjY: { value: 1 }, uTime: { value: 0 },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: AO_FRAG,
      depthTest: false, depthWrite: false }));
    this.cu = {
      tDiffuse: { value: null }, tAO: { value: this.rt.texture }, tDepth: { value: null }, uFar: { value: 250000 },
      uStrength: { value: 0.85 }, uExposure: { value: 1 }, uAOTexel: { value: new THREE.Vector2() },
    };
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.cu, vertexShader: VERT, fragmentShader: AO_COMP,
      depthTest: false, depthWrite: false }));
  }

  setSize(w, h) {
    const aw = Math.max(1, Math.round(w / 2)), ah = Math.max(1, Math.round(h / 2));
    this.rt.setSize(aw, ah);
    this.u.uTexel.value.set(1 / w, 1 / h);
    this.u.uAspect.value = w / h;
    this.cu.uAOTexel.value.set(1 / aw, 1 / ah);
  }

  update(dt, exposure) {
    const cam = this.camera;
    this.u.uFar.value = this.cu.uFar.value = cam.far;
    this.u.uProjInv.value.copy(cam.projectionMatrixInverse);
    this.u.uProjY.value = cam.projectionMatrix.elements[5];
    this.u.uTime.value += dt;
    this.cu.uExposure.value = exposure;
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = this.shared.depth || readBuffer.depthTexture;
    this.u.tDepth.value = depth;
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    this.cu.tDiffuse.value = readBuffer.texture;
    this.cu.tDepth.value = depth;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
}

// ------------------------------------------------------------------------------ god rays
const RAY_FRAG = /* glsl */`
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uSun;
uniform float uExposure, uAspect, uTime;
varying vec2 vUv;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float srcMask(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  if (texture2D(tDepth, uv).r < 0.99999) return 0.0;            // geometry blocks the light
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
  vec2 dd = (uv - uSun) * vec2(uAspect, 1.0);
  float near = exp(-dot(dd, dd) * 7.0);
  return smoothstep(0.9, 5.0, l) * near;
}
const int N = 48;
void main() {
  vec2 delta = (vUv - uSun) * (0.92 / float(N));
  vec2 uv = vUv - delta * hash12(gl_FragCoord.xy + fract(uTime) * 37.0);
  float illum = 1.0, acc = 0.0;
  for (int i = 0; i < N; i++) {
    acc += srcMask(uv) * illum;
    illum *= 0.955;
    uv -= delta;
  }
  gl_FragColor = vec4(vec3(acc / float(N)), 1.0);
}`;

const RAY_COMP = /* glsl */`
uniform sampler2D tDiffuse, tRays;
uniform vec3 uColor;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float r = texture2D(tRays, vUv).r * 0.4
    + (texture2D(tRays, vUv + uTexel).r + texture2D(tRays, vUv - uTexel).r
     + texture2D(tRays, vUv + vec2(uTexel.x, -uTexel.y)).r + texture2D(tRays, vUv - vec2(uTexel.x, -uTexel.y)).r) * 0.15;
  gl_FragColor = vec4(c.rgb + uColor * r, c.a);
}`;

export class GodRayPass extends Pass {
  constructor(camera, shared) {
    super();
    this.camera = camera; this.shared = shared;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.u = { tDiffuse: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() },
      uExposure: { value: 1 }, uAspect: { value: 1 }, uTime: { value: 0 } };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: RAY_FRAG,
      depthTest: false, depthWrite: false }));
    this.cu = { tDiffuse: { value: null }, tRays: { value: this.rt.texture }, uColor: { value: new THREE.Color() },
      uTexel: { value: new THREE.Vector2() } };
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.cu, vertexShader: VERT, fragmentShader: RAY_COMP,
      depthTest: false, depthWrite: false }));
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3();
  }

  setSize(w, h) {
    const rw = Math.max(1, Math.round(w / 2)), rh = Math.max(1, Math.round(h / 2));
    this.rt.setSize(rw, rh);
    this.u.uAspect.value = w / h;
    this.cu.uTexel.value.set(0.8 / rw, 0.8 / rh);
  }

  // sun: { dir: Vector3 (world, unit), color: Color, strength }
  update(dt, exposure, sun) {
    this.u.uTime.value += dt;
    this.u.uExposure.value = exposure;
    const cam = this.camera;
    const fwd = cam.getWorldDirection(this._f);
    const facing = THREE.MathUtils.smoothstep(fwd.dot(sun.dir), -0.1, 0.55);
    const k = sun.strength * facing;
    this.enabled = k > 0.002;
    if (!this.enabled) return;
    const p = this._v.copy(sun.dir).multiplyScalar(1e4).add(cam.position).project(cam);
    this.u.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    this.cu.uColor.value.copy(sun.color).multiplyScalar(k * 0.38 / Math.max(exposure, 0.2));
  }

  render(renderer, writeBuffer, readBuffer) {
    this.u.tDiffuse.value = readBuffer.texture;
    this.u.tDepth.value = this.shared.depth || readBuffer.depthTexture;
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    this.cu.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
}

// ------------------------------------------------------------------------------ lens flare
const VIS_FRAG = /* glsl */`
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uSun;
uniform float uAspect, uExposure, uR;
varying vec2 vUv;
void main() {
  float v = 0.0;
  for (int i = 0; i < 32; i++) {
    float fi = (float(i) + 0.5) / 32.0;
    float a = fi * 2.39996 * 32.0;
    vec2 uv = uSun + vec2(cos(a) / uAspect, sin(a)) * uR * sqrt(fi);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    if (texture2D(tDepth, uv).r < 0.99999) continue;
    float l = dot(texture2D(tDiffuse, uv).rgb, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
    v += smoothstep(1.2, 6.0, l);
  }
  gl_FragColor = vec4(v / 32.0);
}`;

const FLARE_FRAG = /* glsl */`
uniform sampler2D tDiffuse, tVis;
uniform vec2 uSun;
uniform float uAspect, uI;
uniform vec3 uColor;
varying vec2 vUv;
float hexD(vec2 p) { p = abs(p); return max(p.x * 0.866025 + p.y * 0.5, p.y); }
vec3 ghost(vec2 uv, vec2 s, float t, float r, vec3 tint, float hex) {
  vec2 c = s * t;
  vec2 d = uv - c;
  float dist = mix(length(d), hexD(d), hex);
  float disc = smoothstep(r, r * 0.82, dist);
  float rim = smoothstep(r * 0.78, r * 0.95, dist) * disc;
  return tint * (disc * 0.55 + rim * 0.8);
}
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float vis = texture2D(tVis, vec2(0.5)).r;
  if (vis * uI < 0.002) { gl_FragColor = c; return; }
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 s = (uSun - 0.5) * vec2(uAspect, 1.0);
  float sl = length(s);
  vec3 f = vec3(0.0);
  // ghosts: reflections between the lens elements, mirrored through the centre
  f += ghost(uv, s, -0.35, 0.050, vec3(0.30, 0.55, 1.00), 1.0);
  f += ghost(uv, s, -0.62, 0.085, vec3(0.35, 1.00, 0.55), 1.0) * 0.6;
  f += ghost(uv, s, -1.05, 0.140, vec3(1.00, 0.55, 0.25), 0.0) * 0.35;
  f += ghost(uv, s,  0.42, 0.030, vec3(1.00, 0.85, 0.50), 1.0) * 0.8;
  f += ghost(uv, s, -0.18, 0.022, vec3(0.80, 0.40, 1.00), 1.0);
  f += ghost(uv, s, -1.45, 0.220, vec3(0.25, 0.60, 1.00), 0.0) * 0.18;
  f *= 0.06;
  // chromatic halo ring around the image centre, strongest on the sun side
  vec2 hd = uv - s * -0.25;
  float hl = length(hd);
  vec3 halo = vec3(smoothstep(0.03, 0.0, abs(hl - 0.46)), smoothstep(0.03, 0.0, abs(hl - 0.47)), smoothstep(0.03, 0.0, abs(hl - 0.48)));
  f += halo * 0.02 * smoothstep(-0.2, 0.6, dot(normalize(hd), normalize(s + 1e-5)));
  // starburst at the sun (aperture diffraction) and a faint anamorphic streak
  vec2 ds = uv - s;
  float d = length(ds);
  float an = atan(ds.y, ds.x);
  float rays = pow(abs(cos(an * 3.0)), 60.0) + pow(abs(cos(an * 3.0 + 1.0472)), 60.0) * 0.6 + pow(abs(sin(an * 11.0 + 0.4)), 20.0) * 0.35;
  f += vec3(1.0, 0.95, 0.85) * rays * 0.018 / (d * 6.0 + 0.02) * smoothstep(0.6, 0.0, d);
  f += vec3(1.0, 0.92, 0.8) * 0.04 / (d * 18.0 + 0.3) * smoothstep(0.35, 0.0, d);
  f += vec3(0.55, 0.7, 1.0) * exp(-abs(ds.y) * 260.0) * exp(-abs(ds.x) * 2.2) * 0.08;
  // flare fades when the sun leaves the frame
  f *= smoothstep(1.25, 0.6, sl);
  gl_FragColor = vec4(c.rgb + f * uColor * vis * uI, c.a);
}`;

export class FlarePass extends Pass {
  constructor(camera, shared) {
    super();
    this.camera = camera; this.shared = shared;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.vu = { tDiffuse: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() },
      uAspect: { value: 1 }, uExposure: { value: 1 }, uR: { value: 0.012 } };
    this.vis = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.vu, vertexShader: VERT, fragmentShader: VIS_FRAG,
      depthTest: false, depthWrite: false }));
    this.u = { tDiffuse: { value: null }, tVis: { value: this.rt.texture }, uSun: this.vu.uSun, uAspect: this.vu.uAspect,
      uI: { value: 0 }, uColor: { value: new THREE.Color() } };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FLARE_FRAG,
      depthTest: false, depthWrite: false }));
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3();
  }

  setSize(w, h) { this.vu.uAspect.value = w / h; }

  update(dt, exposure, sun) {
    const cam = this.camera;
    const fwd = cam.getWorldDirection(this._f);
    const k = sun.strength * THREE.MathUtils.smoothstep(fwd.dot(sun.dir), 0.2, 0.5);
    this.enabled = k > 0.002;
    if (!this.enabled) return;
    const p = this._v.copy(sun.dir).multiplyScalar(1e4).add(cam.position).project(cam);
    this.vu.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    this.vu.uExposure.value = exposure;
    this.u.uI.value = k;
    this.u.uColor.value.copy(sun.color).multiplyScalar(1 / Math.max(exposure, 0.2));
  }

  render(renderer, writeBuffer, readBuffer) {
    this.vu.tDiffuse.value = readBuffer.texture;
    this.vu.tDepth.value = this.shared.depth || readBuffer.depthTexture;
    renderer.setRenderTarget(this.rt);
    this.vis.render(renderer);
    this.u.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
