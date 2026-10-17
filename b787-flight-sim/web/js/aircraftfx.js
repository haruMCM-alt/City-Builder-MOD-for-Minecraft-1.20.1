// Aircraft finish, high / ultra quality:
//  * EnvProbe  - live reflections: a cube map of the real surroundings (terminal, apron, the
//                other aircraft, terrain, sky) taken at the aircraft, one face per frame, so the
//                clear-coated paint, the glass and the bare metal mirror the world around them
//                instead of a sky-only environment
//  * FanBlur   - a spinning fan / propeller turns into a translucent disc: blades smeared round
//                the hub, a slowly creeping stroboscopic spoke pattern, the spinner left sharp
import * as THREE from 'three';

const EXTERIOR_SKIP = /^(Cockpit_|CkPanel_|Display_|HUD_|Cabin_|Seat_|Pax_|Crew_|Pilot_)/;

export class EnvProbe {
  constructor(renderer, scene, size = 192) {
    this.renderer = renderer; this.scene = scene;
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cam = new THREE.CubeCamera(1.5, 500000, this.rt);      // (the sky dome is ~200 km across)
    this.face = 0; this.mats = new Set(); this.root = null; this.ready = false;
  }

  // every exterior material of the aircraft reflects the probe
  attach(root) {
    if (this.root === root) return;
    for (const m of this.mats) { m.envMap = null; m.needsUpdate = true; }
    this.mats.clear();
    this.root = root;
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.isMeshStandardMaterial || (EXTERIOR_SKIP.test(m.name) && m.name !== 'Cockpit_Windshield') || this.mats.has(m)) continue;
        this.mats.add(m);
      }
    });
  }

  _apply(on) {
    for (const m of this.mats) {
      const want = on ? this.rt.texture : null;
      if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
    }
  }

  // one cube face per frame (the whole map refreshes about ten times a second at 60 fps)
  update(root, enabled, hide = []) {
    if (!enabled || !root) { if (this.ready) { this._apply(false); this.ready = false; } return; }
    this.attach(root);
    const R = this.renderer, S = this.scene;
    root.updateMatrixWorld();
    this.cam.position.setFromMatrixPosition(root.matrixWorld);
    this.cam.position.y += 1.5;
    this.cam.updateMatrixWorld(true);
    const cams = this.cam.children;
    const prevRT = R.getRenderTarget(), prevXR = R.xr.enabled, prevShadow = R.shadowMap.autoUpdate;
    const prevTone = R.toneMapping;
    const vis = root.visible;
    root.visible = false;
    const hidden = hide.filter((o) => o && o.visible);
    for (const o of hidden) o.visible = false;
    R.xr.enabled = false; R.shadowMap.autoUpdate = false; R.toneMapping = THREE.NoToneMapping;
    const n = this.ready ? 1 : 6;                     // the first time: all six faces
    for (let k = 0; k < n; k++) {
      R.setRenderTarget(this.rt, this.face);
      R.render(S, cams[this.face]);
      this.face = (this.face + 1) % 6;
    }
    R.setRenderTarget(prevRT); R.xr.enabled = prevXR; R.shadowMap.autoUpdate = prevShadow; R.toneMapping = prevTone;
    root.visible = vis;
    for (const o of hidden) o.visible = true;
    if (this.face === 0 || !this.ready) this.rt.texture.needsPMREMUpdate = true;
    if (!this.ready) { this.ready = true; this._apply(true); }
  }
}

// --------------------------------------------------------------------------------- fans
const FAN_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vP;
void main() {
  vP = position.yz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const FAN_FRAG = `
uniform float uSpin, uK, uR, uHub, uBlades, uProp;
uniform vec3 uCol;
varying vec2 vP;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vP) / uR;
  if (r > 1.0 || r < uHub) discard;
  float a = atan(vP.y, vP.x);
  // stroboscopic spokes creeping round (the eye / camera samples the blades)
  float spokes = 0.5 + 0.5 * cos(uBlades * (a - uSpin));
  float blur = mix(0.55, 0.9, spokes * 0.35);
  // radial tone: darker towards the tips (thin), a bright band where the blades twist
  float band = smoothstep(0.35, 0.6, r) * (1.0 - smoothstep(0.75, 1.0, r));
  vec3 c = uCol * (0.65 + 0.25 * band) * blur;
  float alpha = uK * (uProp > 0.5 ? (0.28 + 0.2 * spokes) * (0.6 + 0.4 * (1.0 - r)) : (0.72 + 0.18 * spokes)) * smoothstep(1.0, 0.94, r);
  gl_FragColor = vec4(c, alpha);
  #include <colorspace_fragment>
}`;

export class FanBlur {
  constructor(visual, meta) {
    this.discs = [];
    const prop = !!meta.prop;
    for (const [name, side] of visual.fanParts || []) {
      const part = visual.parts[name];
      if (!part) continue;
      const o = part.obj, parent = o.parent;
      if (!parent) continue;
      // fan face in the parent frame (the part spins about its local x axis)
      const box = new THREE.Box3();
      parent.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
      // (the blades' front face: the spinner cone sticks out ahead of it)
      const meshes = [];
      o.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const blades = meshes.filter((m) => [].concat(m.material).some((x) => /Blade/i.test(x?.name || '')));
      for (const m of blades.length ? blades : meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))); }
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const R = Math.max(size.y, size.z) / 2;
      if (R < 0.2) continue;
      const u = { uSpin: { value: 0 }, uK: { value: 0 }, uR: { value: R * 0.985 }, uHub: { value: prop ? 0.12 : 0.3 },
        uBlades: { value: meta.fanBlades || (prop ? 6 : 18) }, uProp: { value: prop ? 1 : 0 }, uCol: { value: new THREE.Color(prop ? 0x2a2c30 : 0x3d4248) } };
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FAN_VERT, fragmentShader: FAN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const g = new THREE.CircleGeometry(R, 64);
      g.rotateY(Math.PI / 2);                         // disc in the y-z plane, facing +x
      const disc = new THREE.Mesh(g, mat);
      disc.position.set(prop ? c.x : box.max.x + 0.02, c.y, c.z);
      disc.renderOrder = 4; disc.frustumCulled = false;
      parent.add(disc);
      this.discs.push({ disc, u, side, prop });
    }
  }

  update(fm, dt) {
    for (const d of this.discs) {
      const n1 = (fm.engines[d.side]?.n1 || 0) / 100;
      // blades read individually below ~25 % N1, a disc above ~55 % (props: from ground idle)
      const k = d.prop ? THREE.MathUtils.smoothstep(n1, 0.12, 0.35) : THREE.MathUtils.smoothstep(n1, 0.22, 0.55);
      d.u.uK.value = k;
      d.u.uSpin.value += dt * (0.35 + 0.6 * Math.sin(performance.now() * 0.00021 + d.side)) * n1;   // slow strobe creep
      d.disc.visible = k > 0.01;
    }
  }
}
