// Post-processing: HDR render (4x MSAA) -> bloom -> engine heat haze -> tone mapping -> lens.
//   * bloom   : lights, sun glints on the paint; stronger at night
//   * haze    : screen-space refraction in the exhaust plumes, scaled by N1
//   * lens    : vignette, slight chromatic aberration towards the edges, film grain
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CloudPass } from './clouds.js';

const HazeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    // per engine: plume start (xy) / end (zw) in uv, radii (x start, y end), strength (z)
    uA0: { value: new THREE.Vector4() }, uA1: { value: new THREE.Vector4() },
    uB0: { value: new THREE.Vector4() }, uB1: { value: new THREE.Vector4() },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAspect;
    uniform vec4 uA0, uA1, uB0, uB1;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    vec2 plume(vec4 seg, vec4 prm, vec2 uv) {
      if (prm.z <= 0.0) return vec2(0.0);
      vec2 a = seg.xy, b = seg.zw;
      vec2 pa = (uv - a) * vec2(uAspect, 1.0), ba = (b - a) * vec2(uAspect, 1.0);
      float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
      float d = length(pa - ba * t);
      float r = mix(prm.x, prm.y, t);
      float w = smoothstep(r, r * 0.25, d) * smoothstep(0.0, 0.06, t) * (1.0 - t) * prm.z;
      if (w <= 0.0) return vec2(0.0);
      // turbulent eddies advect down the plume
      vec2 q = vec2(t * 18.0 - uTime * 9.0, d / max(r, 1e-4) * 3.0);
      vec2 g = vec2(noise(q * 2.3 + 3.1), noise(q * 2.3 + 11.7)) - 0.5;
      g += 0.5 * (vec2(noise(q * 5.1 + 7.3), noise(q * 5.1 + 1.9)) - 0.5);
      return g * w * r * 0.14;
    }
    void main() {
      vec2 off = plume(uA0, uA1, vUv) + plume(uB0, uB1, vUv);
      gl_FragColor = texture2D(tDiffuse, vUv + off);
    }`,
};

// clamp extreme HDR values (spotlit ground right in front of a landing light) so they do
// not flood the bloom; after ACES anything above ~8x exposure is white anyway
const ClampShader = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: 16 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv);
      // NaN / infinite pixels (fireballs, lights right at the camera) would spread through the
      // bloom blur and black out the screen: replace them before anything else
      c.rgb = clamp(c.rgb, 0.0, 6.0e4);
      if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c.rgb = vec3(uMax);
      float m = max(max(c.r, c.g), c.b);
      gl_FragColor = vec4(c.rgb * min(1.0, uMax / max(m, 1e-4)), c.a); }`,
};

const LensShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.28 }, uCA: { value: 0.0016 },
    uGrain: { value: 0.025 }, uRes: { value: new THREE.Vector2(1, 1) },
    uRainWS: { value: 0 }, uWSpeed: { value: 0 }, uAspect: { value: 1 },
  },
  vertexShader: HazeShader.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uCA, uGrain, uRainWS, uWSpeed, uAspect; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // water on the windshield: beads at low speed, streaks blown up and outwards at speed
    vec2 drops(vec2 uv, float scale, float seed) {
      vec2 g = vec2((uv.x - 0.5) * uAspect, uv.y) * scale;
      g.y -= uTime * uWSpeed * 2.5 * scale / 28.0;
      g.x += (uv.x - 0.5) * uWSpeed * uTime * 0.6;
      vec2 id = floor(g), f = fract(g) - 0.5;
      float h = hash(id + seed);
      if (h < 0.68) return vec2(0.0);
      vec2 o = (vec2(hash(id + seed + 1.3), hash(id + seed + 7.1)) - 0.5) * 0.5;
      vec2 d = f - o;
      d.y *= mix(1.0, 0.22, uWSpeed);                   // stretched into streaks
      float r = 0.1 + 0.16 * hash(id + seed + 3.7);
      float m = smoothstep(r, r * 0.55, length(d));
      return d * m;
    }
    void main() {
      vec2 uvIn = vUv;
      float wsLight = 0.0;
      if (uRainWS > 0.001) {
        vec2 w = drops(vUv, 26.0, 0.0) + drops(vUv, 47.0, 11.0) * 0.6;
        float msk = smoothstep(0.34, 0.46, vUv.y);
        // a drop is a small lens: it shows an inverted, shrunken image of the scene
        uvIn -= w * 0.16 * uRainWS * msk;
        wsLight = (w.y * 2.0) * uRainWS * msk;
      }
      vec2 c = uvIn - 0.5;
      float r2 = dot(c, c);
      // lateral chromatic aberration grows towards the corners
      vec2 dir = c * uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uvIn + dir).r;
      col.g = texture2D(tDiffuse, uvIn).g;
      col.b = texture2D(tDiffuse, uvIn - dir).b;
      // natural vignette (cos^4 falloff approximation)
      float v = 1.0 - uVignette * smoothstep(0.05, 0.75, r2 * 2.0);
      col *= v;
      col *= 1.0 + wsLight * 0.35;                          // lit top / darker bottom of each drop
      // luminance-dependent film grain
      float n = hash(vUv * uRes + fract(uTime * 7.13) * 91.7) - 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * uGrain * (1.0 - l * 0.7);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    rt.depthTexture.type = THREE.FloatType;
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.clouds = new CloudPass(camera);
    this.composer.addPass(this.clouds);
    this.clamp = new ShaderPass(ClampShader);
    this.composer.addPass(this.clamp);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.haze = new ShaderPass(HazeShader);
    this.composer.addPass(this.haze);
    this.composer.addPass(new OutputPass());
    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    this.enabled = true;
    this.time = 0;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.lens.uniforms.uRes.value.copy(s);
    this.haze.uniforms.uAspect.value = w / h;
    this.lens.uniforms.uAspect.value = w / h;
    this.clouds.setSize(s.x, s.y);
  }

  // plumes: [{ start: Vector3, end: Vector3, r0, r1, strength }] in world space
  update(dt, { night = 0, plumes = [], clouds = null, windshield = 0, wsSpeed = 0 } = {}) {
    this.time += dt;
    if (clouds) this.clouds.update(dt, clouds); else this.clouds.enabled = false;
    // bloom works on the HDR image (before exposure): only what ends up brighter than
    // ~1.4 after exposure blooms - sun glints, lights, the sun disc
    const ex = this.renderer.toneMappingExposure || 1;
    this.bloom.strength = 0.1 + 0.25 * night;
    this.bloom.radius = 0.25 - 0.05 * night;
    this.bloom.threshold = (3.4 - 1.2 * night) / ex;
    this.clamp.uniforms.uMax.value = 7 / ex;
    this.lens.uniforms.uTime.value = this.time;
    this.lens.uniforms.uRainWS.value = windshield;
    this.lens.uniforms.uWSpeed.value = wsSpeed;
    this.haze.uniforms.uTime.value = this.time;
    const cam = this.camera;
    const slots = [[this.haze.uniforms.uA0, this.haze.uniforms.uA1], [this.haze.uniforms.uB0, this.haze.uniforms.uB1]];
    for (let i = 0; i < 2; i++) {
      const [seg, prm] = slots[i];
      const p = plumes[i];
      prm.value.z = 0;
      if (!p || p.strength <= 0.001) continue;
      const a = this._v[0].copy(p.start), b = this._v[1].copy(p.end);
      const da = a.distanceTo(cam.position), db = b.distanceTo(cam.position);
      // clip the plume against the camera plane
      const va = this._v[2].copy(a).applyMatrix4(cam.matrixWorldInverse), vb = this._v[3].copy(b).applyMatrix4(cam.matrixWorldInverse);
      if (va.z > -0.5 && vb.z > -0.5) continue;
      if (va.z > -0.5) a.lerp(b, (va.z + 0.5) / (va.z - vb.z));
      if (vb.z > -0.5) b.lerp(a, (vb.z + 0.5) / (vb.z - va.z));
      a.project(cam); b.project(cam);
      seg.value.set(a.x * 0.5 + 0.5, a.y * 0.5 + 0.5, b.x * 0.5 + 0.5, b.y * 0.5 + 0.5);
      const f = 1 / Math.tan(cam.fov * Math.PI / 360);
      prm.value.x = Math.min(0.5, p.r0 * f / Math.max(da, 1) * 0.5);
      prm.value.y = Math.min(0.6, p.r1 * f / Math.max(db, 1) * 0.5);
      prm.value.z = p.strength;
    }
  }

  render() { this.composer.render(); }
}
