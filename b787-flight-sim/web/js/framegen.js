// Frame generation: every second display refresh is synthesised instead of rendered.
//
// Reprojection with the *current* pose (the approach of VR positional timewarp / ASW): the
// simulation and the camera rig still run on every refresh, only the expensive scene render
// is skipped. The generated frame re-projects the last rendered image (pre-lens, display
// referred) to the camera of this refresh:
//   * every pixel is lifted back to 3D from the scene depth (logarithmic depth buffer)
//   * an object-ID pass tags the pixels of things that move on their own - the player's
//     aircraft (exterior, flight deck and cabin move with it), AI aircraft and ground
//     vehicles; each ID gets its rigid motion since the render (root matrix now * inverse
//     root matrix then), so the cabin stays glued to the window frame while the ground
//     slides past outside. ID 0 is the static world.
//   * a grid mesh (one vertex per 2x2 pixels) is displaced to the new projection and drawn
//     with depth testing: nearer surfaces win where things overlap. Triangles stretched over
//     a disocclusion (background revealed behind a moving edge) take their colour from the
//     background side of the edge instead of smearing the foreground.
//   * whatever enters the screen at the borders comes from a rotation-only reprojection.
// All the matrix products are formed in double precision on the CPU (camera-relative), so
// the shader never sees world coordinates of 100+ km.
// The HUD and every panel are DOM on top of the canvas: they are never part of the image
// that gets warped. The lens pass (rain on the windshield, grain, vignette) runs on every
// frame, rendered or generated.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const MAX_ID = 255;
export const FG_LAYER = 7;

// rotation-only reprojection for the screen borders (and the sky)
const BG_FRAG = /* glsl */`
uniform sampler2D tColor;
uniform mat4 uInvProjNow, uRot;
varying vec2 vUv;
void main() {
  vec4 v = uInvProjNow * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 c = uRot * vec4(v.xyz / v.w, 0.0);
  vec2 uv = c.w > 1e-6 ? c.xy / c.w * 0.5 + 0.5 : vUv;
  gl_FragColor = vec4(texture2D(tColor, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}`;

const WARP_VERT = /* glsl */`
uniform sampler2D tDepth, tId, tIdDepth, tMat;
uniform mat4 uInvProjSrc;
uniform float uLogF;          // log2(far + 1)
uniform vec2 uStep;           // grid step in uv
varying vec2 vSrc, vBg;
varying float vW;
mat4 idMatrix(float id) {
  return mat4(texture2D(tMat, vec2(0.125, (id + 0.5) / 256.0)), texture2D(tMat, vec2(0.375, (id + 0.5) / 256.0)),
              texture2D(tMat, vec2(0.625, (id + 0.5) / 256.0)), texture2D(tMat, vec2(0.875, (id + 0.5) / 256.0)));
}
void main() {
  vec2 uv = position.xy;
  float d = texture2D(tDepth, uv).r;
  // the moving object this pixel belongs to: the ID pass, if its surface is (about) the one
  // the scene shows here, otherwise the static world
  // (the scene depth is a multisample resolve, the ID pass is not: along silhouettes they
  // can disagree by a pixel, so the best match in the 3x3 neighbourhood decides - a near
  // surface of the aircraft wrongly sent off with the world would tear across the screen)
  float id = 0.0, bestErr = 8e-4;
  vec2 px1 = uStep / 2.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = uv + vec2(float(i), float(j)) * px1;
    float di = texture2D(tIdDepth, o).r;
    float e = abs(di - d);
    if (di < 0.99999 && e < bestErr) { bestErr = e; id = floor(texture2D(tId, o).r * 255.0 + 0.5); }
  }
  if (id == 0.0 && texture2D(tIdDepth, uv).r < d - 8e-4) id = floor(texture2D(tId, uv).r * 255.0 + 0.5);
  vec4 r4 = uInvProjSrc * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 r = r4.xyz / r4.w;
  mat4 C = idMatrix(id);
  vec4 clip;
  float wNew;
  if (d >= 0.99999) {                       // sky: a direction
    clip = C * vec4(r, 0.0);
    wNew = 1e9;
    vW = 1e7;
  } else {
    float w = exp2(d * uLogF) - 1.0;
    clip = C * vec4(r * (w / -r.z), 1.0);
    wNew = clip.w;
    vW = w;
  }
  // background side of a depth edge: the farthest texel around this vertex
  float best = d; vBg = uv;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = uv + vec2(float(i), float(j)) * uStep;
    float dn = texture2D(tDepth, o).r;
    if (dn > best + 2e-4) { best = dn; vBg = o; }
  }
  vSrc = uv;
  if (clip.w <= 1e-4) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }   // behind the camera
  float zN = d >= 0.99999 ? 0.99998 : log2(max(wNew, 1e-6) + 1.0) / uLogF * 2.0 - 1.0;
  // w = 1: the source coordinates interpolate linearly on screen (a perspective-correct
  // interpolation would bend them towards the near vertex along every depth edge)
  gl_Position = vec4(clip.xy / clip.w, min(zN, 0.99997), 1.0);
}`;

const WARP_FRAG = /* glsl */`
uniform sampler2D tColor;
uniform vec2 uSize;
varying vec2 vSrc, vBg;
varying float vW;
void main() {
  vec3 c = texture2D(tColor, vSrc).rgb;
  // disocclusion: the triangle spans a depth edge and got stretched open
  vec2 px = vSrc * uSize;
  float area = abs(dFdx(px).x * dFdy(px).y - dFdx(px).y * dFdy(px).x);
  float edge = fwidth(log2(vW + 1.0));
  // torn far apart (moving and static surfaces on one triangle): leave the hole to the
  // rotation-only background
  if (area < 0.03 && edge > 0.05) discard;
  float k = smoothstep(0.08, 0.35, edge) * smoothstep(0.75, 0.3, area);
  if (k > 0.0) c = mix(c, texture2D(tColor, vBg).rgb, k);
  gl_FragColor = vec4(c, 1.0);
}`;

const FSQ_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FrameGen {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.roots = [];            // moving roots of this frame (index = id - 1)
    // the scene depth is copied right after the scene render (the later passes reuse the
    // composer targets): raw logarithmic depth, 32-bit float
    this.depthCopy = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tDepth, vUv).r, 0.0, 0.0, 1.0); }',
      uniforms: { tDepth: { value: null } } }));
    this.matData = new Float32Array(4 * 4 * 256);
    this.matTex = new THREE.DataTexture(this.matData, 4, 256, THREE.RGBAFormat, THREE.FloatType);
    this.matTex.minFilter = this.matTex.magFilter = THREE.NearestFilter;
    this.bgQuad = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader: BG_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, uInvProjNow: { value: new THREE.Matrix4() }, uRot: { value: new THREE.Matrix4() } } }));
    this.warpMat = new THREE.ShaderMaterial({ vertexShader: WARP_VERT, fragmentShader: WARP_FRAG,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, tId: { value: null }, tIdDepth: { value: null }, tMat: { value: this.matTex },
        uInvProjSrc: { value: new THREE.Matrix4() }, uLogF: { value: 1 }, uStep: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() } } });
    this.warpMat.extensions = { derivatives: true };
    this.warpScene = new THREE.Scene();
    this.warpCam = new THREE.Camera();
    this.src = { view: new THREE.Matrix4(), proj: new THREE.Matrix4(), projInv: new THREE.Matrix4(), roots: [], color: null, depth: null, valid: false };
    this._m = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
    this.size = new THREE.Vector2();
    this.step = 2;
  }

  setSize(w, h) {
    this.size.set(w, h);
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.FloatType;
    this.idRT?.dispose();
    this.idRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: dt });
    this.depthRT?.dispose();
    this.depthRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.genRT?.dispose();
    this.genRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: true });
    this.genRT.texture.colorSpace = THREE.NoColorSpace;
    // the warp grid
    const s = this.step, nx = Math.ceil(w / s) + 1, ny = Math.ceil(h / s) + 1;
    const pos = new Float32Array(nx * ny * 3);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k += 3) {
      pos[k] = Math.min(i * s + 0.5, w - 0.5) / w; pos[k + 1] = Math.min(j * s + 0.5, h - 0.5) / h;
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    for (let j = 0, k = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++, k += 6) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[k] = a; idx[k + 1] = b; idx[k + 2] = d; idx[k + 3] = a; idx[k + 4] = d; idx[k + 5] = c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (this.grid) { this.warpScene.remove(this.grid); this.grid.geometry.dispose(); }
    this.grid = new THREE.Mesh(g, this.warpMat);
    this.grid.frustumCulled = false;
    this.warpScene.add(this.grid);
    this.warpMat.uniforms.uStep.value.set(s / w, s / h);
    this.warpMat.uniforms.uSize.value.set(w, h);
    this.src.valid = false;
  }

  // the moving roots. The ID pass draws their meshes with clones of their own materials, so
  // every vertex deformation (wing flex, the broken-wing cut, passenger variants, skinning)
  // is exactly the one of the scene render; the clones return the ID straight after the
  // alpha test (no lighting). Glass and other see-through surfaces are left out - they
  // would hide the world behind the cockpit windows.
  _clone(m, pid) {
    const c = m.clone();
    if (m.isShaderMaterial) c.uniforms = Object.assign({}, m.uniforms);
    const u = { value: pid };
    const obc = m.onBeforeCompile, key = m.customProgramCacheKey;
    c.onBeforeCompile = (sh, r) => {
      obc.call(c, sh, r);
      sh.uniforms.uFGId = u;
      let f = sh.fragmentShader;
      // after the alpha test (cut-outs such as the window openings in the cabin sidewall)
      const hook = ['#include <alphahash_fragment>', '#include <alphatest_fragment>', '#include <logdepthbuf_fragment>'].find((h) => f.includes(h));
      const out = '\n  if (uFGId > 0.0) { gl_FragColor = vec4(uFGId / 255.0, 0.0, 0.0, 1.0); return; }\n';
      if (hook) f = f.replace(hook, hook + out);
      else f = f.replace(/void\s+main\s*\(\s*(void)?\s*\)\s*\{/, (x) => x + out);
      sh.fragmentShader = 'uniform float uFGId;\n' + f;
    };
    c.customProgramCacheKey = () => key.call(m) + '|fgid';
    c.userData = { fgSrc: m };
    return c;
  }

  _tag(root) {
    const ud = root.userData;
    let n = 0;
    root.traverse((o) => { if (o.isMesh) n++; });
    if (ud.fgCount === n && ud.fgList) return;
    ud.fgCount = n;
    if (!ud.fgPid) { this._pid = (this._pid || 0) % (MAX_ID - 1) + 1; ud.fgPid = this._pid; }
    const cache = ud.fgClones || (ud.fgClones = new Map());
    const list = ud.fgList = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isPoints || o.isLine) return;
      const arr = Array.isArray(o.material);
      const mats = arr ? o.material : [o.material];
      if (!mats.some((m) => m && !m.transparent && m.depthWrite !== false && m.colorWrite !== false)) return;
      const cl = mats.map((m) => {
        if (!m) return m;
        let c = cache.get(m);
        if (!c) { c = this._clone(m, ud.fgPid); cache.set(m, c); }
        return c;
      });
      list.push({ o, mat: o.material, id: arr ? cl : cl[0] });
    });
  }

  _lights() {
    this.scene.traverse((o) => { if (o.isLight) o.layers.enable(FG_LAYER); });
  }

  // straight after the scene render (a pass in the composer)
  copyDepth(depthTex) {
    if (!this.depthRT || !depthTex) return;
    this.depthCopy.material.uniforms.tDepth.value = depthTex;
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.depthRT);
    this.depthCopy.render(r);
    r.setRenderTarget(prev);
    this._depthOK = true;
  }

  // after the scene render of a real frame: remember the pose, draw the object IDs
  capture(color, roots) {
    const r = this.renderer, cam = this.camera, S = this.src;
    if (!this.idRT) return;
    const n = Math.min(roots.length, MAX_ID - 1);
    S.roots.length = 0;
    this._tick = (this._tick || 0) + 1;
    if (this._tick % 120 === 1) this._lights();
    const swapped = [];
    for (let i = 0; i < n; i++) {
      const o = roots[i];
      if (!o) continue;
      this._tag(o);
      const pid = o.userData.fgPid;
      S.roots.push({ obj: o, pid, m: (o.userData.fgM || (o.userData.fgM = new THREE.Matrix4())).copy(o.matrixWorld) });
      for (const e of o.userData.fgList) {
        const cur = e.o.material;
        if (cur !== e.mat) continue;            // material changed since the tag: skip until re-tagged
        if (Array.isArray(e.id)) { for (let k = 0; k < e.id.length; k++) if (e.id[k]) { e.id[k].visible = e.mat[k].visible; e.id[k].side = e.mat[k].side; } }
        else { e.id.visible = e.mat.visible; e.id.side = e.mat.side; }
        e.o.material = e.id;
        e.o.layers.enable(FG_LAYER);
        swapped.push(e);
      }
    }
    // object-ID pass: moving things only (no sky, no shadow map update)
    const bg = this.scene.background;
    const auto = r.shadowMap.autoUpdate, mask = cam.layers.mask;
    const cc = r.getClearColor(this._cc || (this._cc = new THREE.Color())), ca = r.getClearAlpha();
    this.scene.background = null;
    r.shadowMap.autoUpdate = false;
    cam.layers.set(FG_LAYER);
    r.setRenderTarget(this.idRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    if (swapped.length) r.render(this.scene, cam);
    cam.layers.mask = mask;
    this.scene.background = bg;
    r.shadowMap.autoUpdate = auto;
    r.setClearColor(cc, ca);
    r.setRenderTarget(null);
    for (const e of swapped) { e.o.material = e.mat; e.o.layers.disable(FG_LAYER); }
    S.view.copy(cam.matrixWorldInverse);
    S.proj.copy(cam.projectionMatrix);
    S.projInv.copy(cam.projectionMatrixInverse);
    S.color = color; S.depth = this.depthRT.texture;
    S.valid = !!(color && this._depthOK);
    this._depthOK = false;
  }

  // synthesise the frame for the camera as it is now into genRT (display referred)
  generate() {
    const S = this.src, cam = this.camera, r = this.renderer;
    if (!S.valid) return null;
    const [A, B, D] = this._m;
    cam.updateMatrixWorld();
    for (const e of S.roots) e.obj.updateWorldMatrix(true, false);
    // C(id) = P_now * V_now * (M_now * M_then^-1) * V_then^-1, double precision
    const PV = A.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const Vinv = B.copy(S.view).invert();
    const put = (id, M) => { this.matData.set(M.elements, id * 16); };
    put(0, D.multiplyMatrices(PV, Vinv));
    this.bgQuad.material.uniforms.uRot.value.copy(D);
    const T = this._m3 || (this._m3 = new THREE.Matrix4());
    for (let i = 0; i < S.roots.length; i++) {
      const e = S.roots[i];
      T.copy(e.m).invert().premultiply(e.obj.matrixWorld);      // M_now * M_then^-1
      D.multiplyMatrices(PV, T).multiply(Vinv);
      put(e.pid, D);
    }
    this.matTex.needsUpdate = true;
    const u = this.warpMat.uniforms;
    u.tColor.value = S.color; u.tDepth.value = S.depth;
    u.tId.value = this.idRT.texture; u.tIdDepth.value = this.idRT.depthTexture;
    u.uInvProjSrc.value.copy(S.projInv);
    u.uLogF.value = Math.log2(cam.far + 1);
    const bu = this.bgQuad.material.uniforms;
    bu.tColor.value = S.color;
    bu.uInvProjNow.value.copy(cam.projectionMatrixInverse);
    const ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.genRT);
    r.clear(true, true, false);
    this.bgQuad.render(r);
    r.render(this.warpScene, this.warpCam);
    r.setRenderTarget(null);
    r.autoClear = ac;
    return this.genRT;
  }

  dispose() { this.idRT?.dispose(); this.depthRT?.dispose(); this.genRT?.dispose(); this.matTex.dispose(); }
}
