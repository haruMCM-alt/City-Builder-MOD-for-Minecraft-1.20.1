// Passenger cabin: static Blender interior + instanced seats and passengers.
// The cabin file is loaded the first time the camera goes inside (cabin / window views).
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { PaxLife, CrewService } from './cabinlife.js';
import { IFE, ifeGeometry } from './ife.js';

const TINT = new Set(['Seat_FabricY', 'Seat_FabricJ', 'Pax_Skin', 'Pax_Shirt', 'Pax_Pants', 'Pax_Hair', 'Pax_HairLong', 'Pax_HairBun', 'Pax_Brow']);
// passenger variants switched per instance (collapsed to a point when hidden)
const VARIANT = new Set(['Pax_Hair', 'Pax_HairLong', 'Pax_HairBun', 'Pax_Glasses']);
// emissive / self-lit materials keep their own light
const SELF_LIT = new Set(['Cabin_Mood', 'Cabin_Light', 'Cabin_Exit', 'Cabin_ExitSign', 'Cabin_FloorLight', 'Cabin_Screen', 'Seat_Screen']);

// ---------------------------------------------------------------------------------- cabin light
// Inside the fuselage the scene's sun and sky would light every surface as if there were no hull.
// Cabin materials replace them with a light model in the aircraft frame (x fwd, y up, z right):
// the LED-lit ceiling as a broad overhead source, the cove uplight (mood colour at night), the
// sidewall wash under the bins, daylight from the windows, and sun patches cast through the open
// part of each window (window positions and shade states come from the Blender build). The baked
// ambient occlusion (vertex colours) darkens all of it in corners, under bins and seats.
const NSH = 128;
const CAB_U = {
  uCabInv: { value: new THREE.Matrix4() }, uCabV2C: { value: new THREE.Matrix3() },
  uCabG: { value: new THREE.Vector4(-1, 1.45, 0.97, 2.6) },       // floor, ceiling, bin bottom, sidewall
  uCabB: { value: new THREE.Vector4(1.3, 0.1, 0.5, 0.13) },        // bin front, window bottom / top, half width
  uCabWin: { value: new THREE.Vector4(0, -1, 0, 0) },              // first window x, pitch (x), count
  uCabSun: { value: new THREE.Vector4(0, 1, 0, 0) },               // sun direction (cabin frame), strength
  uCabL: { value: new THREE.Vector4(1, 1, 0, 0) },                 // LED level, daylight, mood, -
  uShL: { value: new Float32Array(NSH).fill(1) }, uShR: { value: new Float32Array(NSH).fill(1) },
};
const CAB_VERT_PARS = `
uniform mat4 uCabInv;
varying vec3 vCabP;
#ifdef CAB_VARIANT
attribute float aHide;
#endif`;
const CAB_VERT = `
#ifdef CAB_VARIANT
transformed *= 1.0 - aHide;
#endif
{
  vec4 cw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
  #endif
  vCabP = (uCabInv * (modelMatrix * cw)).xyz;
}`;
const CAB_FRAG_PARS = `
uniform mat3 uCabV2C;
uniform vec4 uCabG, uCabB, uCabWin, uCabSun, uCabL;
uniform float uShL[${NSH}], uShR[${NSH}];
varying vec3 vCabP;
vec3 cabinIrradiance(vec3 p, vec3 n) {
  float fl = uCabG.x, ce = uCabG.y, bb = uCabG.z, wall = uCabG.w;
  float az = abs(p.z);
  vec3 inward = vec3(0.0, 0.0, p.z > 0.0 ? -1.0 : 1.0);
  vec3 led = vec3(1.0, 0.92, 0.80);
  float L = uCabL.x;
  // lit ceiling: a broad overhead source, stronger for up-facing surfaces and near it
  float dh = max(ce - p.y, 0.0);
  vec3 E = led * L * (0.55 + 0.45 * n.y) * (0.45 + 0.55 / (1.0 + dh * dh * 0.45));
  // cove uplight on the ceiling and the bin faces near it
  vec3 moodC = mix(led, vec3(0.58, 0.52, 1.0), uCabL.z);
  E += moodC * L * 2.2 * max(-n.y, 0.0) * smoothstep(ce - 0.45, ce + 0.05, p.y);
  E += moodC * L * 0.5 * max(dot(n, -inward), 0.0) * smoothstep(bb + 0.1, ce, p.y);
  // sidewall wash grazing down from under the bins
  float nearW = smoothstep(wall - 0.6, wall - 0.05, az);
  E += led * L * 1.2 * nearW * step(p.y, bb) * exp(-max(bb - p.y, 0.0) * 1.4) * (0.4 + 0.6 * max(dot(n, inward), 0.0));
  // daylight through the windows: soft fill from both sides, brighter close to them
  float wF = 0.3 + 0.7 * smoothstep(1.9, 0.0, wall - az);
  E += vec3(0.84, 0.91, 1.0) * uCabL.y * wF * (0.45 + 0.55 * max(dot(n, inward), 0.0)) * smoothstep(fl - 0.1, fl + 0.7, p.y);
  // bounce from the carpet / seats onto down-facing surfaces
  E += led * L * 0.15 * max(-n.y, 0.0);
  // sun patches through the open part of the windows on the sun side
  vec3 sd = uCabSun.xyz;
  if (uCabSun.w > 0.0 && abs(sd.z) > 0.03) {
    float side = sd.z > 0.0 ? 1.0 : -1.0;
    float t = (side * (wall + 0.06) - p.z) / sd.z;
    float lam = max(dot(n, sd), 0.0);
    if (t > 0.0 && lam > 0.0) {
      vec3 h = p + sd * t;
      float k = (h.x - uCabWin.x) / uCabWin.y;
      float ki = floor(k + 0.5);
      if (ki >= 0.0 && ki < uCabWin.z) {
        int ii = int(ki);
        float sh = side > 0.0 ? uShR[ii] : uShL[ii];
        float top = mix(uCabB.z, uCabB.y, sh);
        float dx = abs(k - ki) * abs(uCabWin.y);
        float soft = 0.015 + 0.02 * t;
        float inW = smoothstep(uCabB.w + soft, uCabB.w - soft, dx) * smoothstep(uCabB.y - soft, uCabB.y + soft, h.y)
                  * smoothstep(top + soft, top - soft, h.y);
        E += uCabSun.w * inW * lam * vec3(1.0, 0.95, 0.86);
      }
    }
  }
  return E;
}`;
const CAB_FRAG = `
#include <lights_fragment_end>
{
  // the hull blocks the scene's sun and sky: keep a trace of them, then add the cabin light
  reflectedLight.directDiffuse *= 0.04;
  reflectedLight.directSpecular *= 0.04;
  reflectedLight.indirectDiffuse *= 0.1;
  reflectedLight.indirectSpecular *= 0.3;
  vec3 nC = normalize(uCabV2C * normal);
  vec3 cabE = cabinIrradiance(vCabP, nC);
  reflectedLight.indirectDiffuse += cabE * BRDF_Lambert(material.diffuseColor);
  #if defined(CAB_SKIN) || defined(CAB_HAIR) || defined(CAB_CLOTH)
  vec3 vC = normalize(uCabV2C * geometryViewDir);
  float nv = clamp(dot(nC, vC), 0.0, 1.0);
  float eL = dot(cabE, vec3(0.3, 0.55, 0.15));
  #endif
  #ifdef CAB_SKIN
  // skin: light scattered under the surface comes out red around the shadow side and the
  // thin parts (ears, nose); a soft oily sheen from the ceiling light
  {
    vec3 sss = vec3(0.55, 0.16, 0.08) * material.diffuseColor * (1.0 - nv) * (1.0 - nv);
    reflectedLight.indirectDiffuse += cabE * sss * 0.6;
    vec3 rC = reflect(-vC, nC);
    reflectedLight.indirectSpecular += vec3(1.0, 0.94, 0.86) * uCabL.x * 0.035 * pow(max(rC.y, 0.0), 6.0) * (0.3 + 0.7 * pow(1.0 - nv, 3.0));
  }
  #endif
  #ifdef CAB_HAIR
  // hair: Kajiya-Kay highlights along the strands (combed down the head), a white primary and
  // a tinted, shifted secondary
  {
    vec3 tC = normalize(vec3(0.0, 1.0, 0.0) - nC * nC.y + vec3(1e-4, 0.0, 0.0));
    vec3 hC = normalize(vC + vec3(0.0, 1.0, 0.0));
    float th = dot(tC, hC);
    float s1 = pow(sqrt(max(1.0 - th * th, 0.0)), 80.0);
    float th2 = dot(normalize(tC + nC * 0.25), hC);
    float s2 = pow(sqrt(max(1.0 - th2 * th2, 0.0)), 24.0);
    reflectedLight.indirectSpecular += (vec3(0.9, 0.85, 0.78) * s1 * 0.12 + material.diffuseColor * s2 * 0.5) * eL;
  }
  #endif
  #ifdef CAB_CLOTH
  // woven fabric: soft sheen at grazing angles (fibres catching the light)
  reflectedLight.indirectDiffuse += cabE * mix(material.diffuseColor, vec3(0.5), 0.35) * pow(1.0 - nv, 4.0) * 0.45;
  #endif
}`;

// surface kinds with their own shading (skin, hair, fabric)
function cabinKind(name) {
  if (/(_Skin)$/.test(name)) return 'SKIN';
  if (/^(Pax_Hair|Pax_HairLong|Pax_HairBun|Pax_Brow|Crew_Hair)$/.test(name)) return 'HAIR';
  if (/^(Pax_Shirt|Pax_Pants|Seat_Fabric|Crew_Uniform|Crew_Pants|Crew_Jacket|Cabin_Carpet)/.test(name)) return 'CLOTH';
  return '';
}
function patchCabinMaterial(m, variant) {
  m.userData.cabinLit = true;
  const kind = cabinKind(m.name);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CAB_U);
    if (kind) sh.fragmentShader = '#define CAB_' + kind + '\n' + sh.fragmentShader;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', (variant ? '#define CAB_VARIANT\n' : '') + '#include <common>' + CAB_VERT_PARS)
      .replace('#include <project_vertex>', CAB_VERT + '\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + CAB_FRAG_PARS)
      .replace('#include <lights_fragment_end>', CAB_FRAG);
  };
  m.customProgramCacheKey = () => 'cabin-lit' + (variant ? '-v' : '') + kind;
  m.needsUpdate = true;
}
// articulated passenger / crew parts (Blender prototypes)
// (bodyF: the female body, switched per passenger like the hair styles; older cabins have none)
const PAX_PARTS = { body: 'Proto_Pax', bodyF: 'Proto_PaxF', head: 'Proto_PaxHead', uL: 'Proto_PaxUArmL', uR: 'Proto_PaxUArmR', fL: 'Proto_PaxFArmL', fR: 'Proto_PaxFArmR' };
const CREW_PARTS = { crew: 'Proto_Crew', armL: 'Proto_CrewArmL', armR: 'Proto_CrewArmR', legL: 'Proto_CrewLegL', legR: 'Proto_CrewLegR', cart: 'Proto_Cart', tray: 'Proto_Tray' };
const SHIRTS = ['#2d4a7a', '#b8423a', '#f2f2f0', '#2f6b4f', '#1d1f24', '#7a5c9e', '#d9a441', '#4f7fa8', '#8c8f94',
  '#c46d8e', '#3c7d86', '#e7ddc9', '#5a3b2e', '#243a5e'];
const PANTS = ['#1f2533', '#2b2d31', '#3a4a66', '#5c4a3a', '#6f6a60', '#22324a', '#111214'];
const SKIN = ['#f1c9a5', '#e0b896', '#c99a74', '#a8764f', '#7d5537', '#5a3a26', '#f5d7bd'];
// (mostly dark hair on these routes; some brown, dyed, grey)
const HAIR = ['#141110', '#1c1a1a', '#0f0d0c', '#2b1d14', '#22170f', '#3a2a1e', '#4a3222', '#5e4330', '#7a5a3a', '#b89a6a', '#8f8f8f', '#cfcac2'];

export class Cabin {
  constructor(visual, meta, load) {
    this.visual = visual;
    this.info = meta.cabin;
    this.load = load;
    this.group = null;
    this.loading = null;
    this.inst = { Y: [], J: [], pax: [] };
    this.occupied = new Set();
    this.ife = new IFE(this);
    this.ifeGeo = ifeGeometry(this.info);
    this.paxCount = 0;
    this.pax = 0;
    this.visible = false;
    this._sun = new THREE.Vector3(0, 1, 0); this._sunK = 0;
  }

  // sun direction (world, towards the sun) and strength (0 at night / under cloud)
  setSun(dir, k) { if (dir) this._sun.copy(dir); this._sunK = k; }

  _setLightInfo() {
    const L = this.info.light;
    if (!L) return;
    CAB_U.uCabG.value.set(L.floor, L.ceil, L.binBot, L.wall);
    CAB_U.uCabB.value.set(L.binFront, L.winY[0], L.winY[1], L.winW / 2);
    const n = Math.min(NSH, L.shadeL.length);
    CAB_U.uCabWin.value.set(L.winX0, L.winDX, n, 0);
    CAB_U.uShL.value.fill(1); CAB_U.uShR.value.fill(1);
    for (let k = 0; k < n; k++) { CAB_U.uShL.value[k] = L.shadeL[k]; CAB_U.uShR.value[k] = L.shadeR[k]; }
  }

  get available() { return !!this.info; }

  ensure() {
    if (!this.info) return Promise.resolve(null);
    if (!this.loading) this.loading = this.load().then((g) => (Array.isArray(g) ? this._build(g[0], g[1]) : this._build(g))).catch((e) => { console.warn('cabin', e); this.loading = null; });
    return this.loading;
  }

  // protoGltf: the shared prototypes file (seats, passengers, crew; older cabins carry their own)
  _build(gltf, protoGltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const src = protoGltf ? protoGltf.scene : root;
    src.updateMatrixWorld(true);
    const protos = {};
    for (const n of ['Proto_SeatY', 'Proto_SeatJ', ...Object.values(PAX_PARTS), ...Object.values(CREW_PARTS)]) protos[n] = src.getObjectByName(n);
    if (!protoGltf) for (const p of Object.values(protos)) if (p) p.parent.remove(p);
    this.mats = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      this._prepMat(o.material);
    });
    this.group = new THREE.Group();
    this.group.name = 'Cabin';
    this.group.add(root);
    // instanced seats and passengers
    const seats = this.info.seats;
    const Y = seats.filter((s) => s.c !== 'J'), J = seats.filter((s) => s.c === 'J');
    this.seatY = Y; this.seatJ = J;
    this.inst.Y = this._instances(protos.Proto_SeatY, Y.length);
    this.inst.J = this._instances(protos.Proto_SeatJ, J.length);
    this.parts = {};
    for (const [k, n] of Object.entries(PAX_PARTS)) this.parts[k] = this._instances(protos[n], seats.length, (k === 'body' || k === 'bodyF') && !!protos.Proto_PaxF);
    this.inst.pax = Object.values(this.parts).flat();
    const na = (this.info.aisles || [0]).length;
    this.crewParts = {};
    for (const [k, n] of Object.entries(CREW_PARTS)) {
      this.crewParts[k] = this._instances(protos[n], k === 'cart' ? na : k === 'tray' ? seats.length : na * 2);
      for (const im of this.crewParts[k]) { im.count = k === 'tray' ? 0 : im.count; this.group.add(im); }
    }
    this.life = new PaxLife(this);
    this.service = new CrewService(this);
    // your own seat-back monitor (high resolution, interactive)
    if (this.ifeGeo) {
      const g = this.ifeGeo;
      this.myScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.236, 0.148),
        new THREE.MeshBasicMaterial({ map: this.ife.ptex, toneMapped: false }));
      this.myScreen.position.set(g.screen[0], g.screen[1], g.screen[2]);
      this.myScreen.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), g.tilt)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
      this.group.add(this.myScreen);
    }
    const m = new THREE.Matrix4(), sc = new THREE.Vector3();
    const place = (list, arr, cls) => list.forEach((s, i) => {
      // premium economy: the economy seat, a little wider
      sc.set(1, 1, s.c === 'W' ? s.w / 0.46 : 1);
      m.compose(new THREE.Vector3(s.p[0], s.p[1], s.p[2]), new THREE.Quaternion(), sc);
      for (const im of arr) im.setMatrixAt(i, m.clone().multiply(im.userData.rel));
    });
    place(Y, this.inst.Y); place(J, this.inst.J);
    for (const im of [...this.inst.Y, ...this.inst.J]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    this.screens = [...this.inst.Y.map((im) => ({ im, list: Y })), ...this.inst.J.map((im) => ({ im, list: J }))]
      .filter((x) => x.im.userData.mat === 'Seat_Screen');
    for (const im of [...this.inst.Y, ...this.inst.J, ...this.inst.pax]) this.group.add(im);
    this.visual.root.add(this.group);
    this.group.visible = this.visible;
    this._setLightInfo();
    if (this._livery) this.setLivery(this._livery);
    this.setPassengers(this.pax, this._seed || 1);
    return this;
  }

  _prepMat(m) {
    if (!m || this.mats.has(m)) return;
    this.mats.add(m);
    if (m.name === 'Seat_Screen') { this.ife.patchScreen(m); return; }
    m.envMapIntensity = 0.7;
    if (m.name === 'Cabin_Sidewall') { m.alphaTest = 0.5; m.transparent = false; m.depthWrite = true; }
    if (m.name === 'Cabin_WindowPane') { m.transparent = true; m.depthWrite = false; m.opacity = 0.16; return; }
    if (SELF_LIT.has(m.name)) return;
    // (every passenger material can collapse hidden variants; meshes without aHide read 0 = shown)
    patchCabinMaterial(m, VARIANT.has(m.name) || m.name.startsWith('Pax_'));
  }

  // variant: every mesh of this prototype can be hidden per instance (aHide)
  _instances(proto, count, variant = false) {
    if (!proto || !count) return [];
    proto.updateMatrixWorld(true);
    const o = this.info.protoOrigin;
    // prototypes sit at the design origin (three: protoOrigin); move them to 0 first
    const inv = new THREE.Matrix4().makeTranslation(-o[0], -o[1], -o[2]).multiply(proto.matrixWorld.clone().invert());
    const out = [];
    proto.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material;
      this._prepMat(mat);
      const im = new THREE.InstancedMesh(o.geometry, mat, count);
      im.userData.rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      im.userData.mat = mat.name;
      im.userData.part = proto.name;
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = false;
      if (TINT.has(mat.name)) {
        mat.color.set(0xffffff);
        mat.envMapIntensity = 1.0;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
      }
      if (VARIANT.has(mat.name) || variant) {
        im.geometry = im.geometry.clone();
        im.geometry.setAttribute('aHide', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
      }
      out.push(im);
    });
    return out;
  }

  // seat fabrics follow the airline colours
  setLivery(a) {
    this._livery = a;
    if (!this.group) return;
    const b = a.brand || a.prim, prim = new THREE.Color().setRGB(b.x, b.y, b.z, THREE.LinearSRGBColorSpace);
    const grey = new THREE.Color('#2f343c');
    const cY = prim.clone().lerp(grey, 0.72), cW = prim.clone().lerp(grey, 0.5), cJ = prim.clone().lerp(new THREE.Color('#2a2522'), 0.6);
    for (const im of this.inst.Y) {
      if (!im.instanceColor) continue;
      this.seatY.forEach((s, i) => im.setColorAt(i, s.c === 'W' ? cW : cY));
      im.instanceColor.needsUpdate = true;
    }
    for (const im of this.inst.J) {
      if (!im.instanceColor) continue;
      this.seatJ.forEach((s, i) => im.setColorAt(i, cJ));
      im.instanceColor.needsUpdate = true;
    }
    // cabin crew uniform in the airline colour
    for (const im of Object.values(this.crewParts || {}).flat()) {
      if (im.material.name === 'Crew_Uniform') im.material.color.copy(prim).lerp(grey, 0.15);
    }
    this.ife.setLogo(a.logo, this._airline);
  }

  setAirline(name) { this._airline = name; this.ife.d.airline = name; }

  // your monitor shows the tail camera (render target) or the IFE canvas
  setScreenTexture(tex) {
    if (!this.myScreen) return;
    const t = tex || this.ife.ptex;
    const M = this.myScreen.material;
    // the tail camera is an HDR render of the scene: tone-map it like the main view
    if (M.map !== t) { M.map = t; M.toneMapped = !!tex; M.color.setScalar(tex ? 0.5 : 1); M.needsUpdate = true; }
  }

  // safety video on every monitor (src: video file, audio: the game's Audio for routing)
  ifeSafety(on, src, audio) { if (on) return this.ife.startSafety(src, audio); this.ife.stopSafety(); return false; }

  startService() { return this.service ? this.service.start() : false; }

  // fill seats from the payload (passenger + bags ~100 kg); the rest is cargo
  paxFor(payload) {
    if (!this.info) return 0;
    return Math.min(this.info.total, Math.floor(payload / (this.info.paxMass || 100)));
  }

  setPassengers(payload, seed = 1) {
    this.pax = payload; this._seed = seed;
    this.paxCount = Math.min(this.paxFor(payload), this.info.total - (this.info.mySeat != null ? 1 : 0));
    if (!this.group) return;
    const seats = this.info.seats;
    const rnd = mulberry32(seed * 7919 + 17);
    const order = seats.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const jo = this.info.jOffset || [0, 0, 0];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const pick = (arr) => new THREE.Color(arr[Math.floor(rnd() * arr.length)]);
    const n = this.paxCount;
    // the window view is "your" seat: keep it free
    const mine = this.info.mySeat ?? -1;
    const oi = order.indexOf(mine);
    if (oi >= 0) { order.splice(oi, 1); order.push(mine); }
    const entries = [];
    this.occupied = new Set(order.slice(0, n));
    for (let k = 0; k < n; k++) {
      const s = seats[order[k]];
      const j = s.c === 'J';
      p.set(s.p[0] + (j ? jo[0] : 0), s.p[1] + (j ? jo[1] : 0), s.p[2]);
      const size = 0.92 + rnd() * 0.14;
      sc.set(size, size, size * (0.95 + rnd() * 0.1));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.12);
      m.compose(p, q, sc);
      entries.push({ k, seat: order[k], m: m.clone() });
      const hair = pick(HAIR);
      const cols = { Pax_Skin: pick(SKIN), Pax_Shirt: pick(SHIRTS), Pax_Pants: pick(PANTS), Pax_Hair: hair, Pax_HairLong: hair, Pax_HairBun: hair, Pax_Brow: hair };
      // body (female / male), hair style (short / long / bun / bald) and glasses
      const female = rnd() < 0.48, r1 = rnd(), r2 = rnd();
      const style = female ? (r1 < 0.55 ? 'long' : r1 < 0.8 ? 'bun' : 'short') : (r1 < 0.05 ? 'bald' : r1 < 0.09 ? 'long' : 'short');
      const hide = { Pax_Hair: style === 'bald' ? 1 : 0, Pax_HairLong: style === 'long' ? 0 : 1, Pax_HairBun: style === 'bun' ? 0 : 1, Pax_Glasses: r2 < 0.24 ? 0 : 1 };
      for (const im of this.inst.pax) {
        im.setMatrixAt(k, m.clone().multiply(im.userData.rel));
        if (im.instanceColor && cols[im.userData.mat]) im.setColorAt(k, cols[im.userData.mat]);
        const ah = im.geometry.attributes.aHide;
        if (!ah) continue;
        const part = im.userData.part;
        ah.array[k] = part === 'Proto_PaxF' ? (female ? 0 : 1) : part === 'Proto_Pax' ? (female ? 1 : 0) : (hide[im.userData.mat] ?? 0);
      }
    }
    for (const im of this.inst.pax) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      if (im.geometry.attributes.aHide) im.geometry.attributes.aHide.needsUpdate = true;
    }
    this.service.stop();
    this.life.reset(entries, rnd);
    this.ife.assign(this.screens, this.occupied);
    if (this.aboard != null) this.setAboard(this.aboard);
  }

  // evacuation: only this many passengers are still on board (seats empty from the end of the
  // boarding order); null = everybody
  setAboard(n) {
    this.aboard = n == null ? null : Math.max(0, Math.min(this.paxCount, Math.round(n)));
    if (!this.group) return;
    const k = this.aboard ?? this.paxCount;
    for (const im of this.inst.pax) im.count = k;
    this.life?.setAboard?.(k);
  }

  // data: live flight values for the IFE (altitude, speed, position ...); ifeView: your monitor in view
  update(inside, night, dt = 0, data = null, ifeView = false) {
    this.visible = inside;
    if (inside && !this.group) this.ensure();
    if (!this.group) return;
    this.group.visible = inside;
    if (dt > 0) {
      this.life.update(dt, inside, this.parts);
      this.service.update(dt);
      if (inside) this.service.draw(this._time = (this._time || 0) + dt, this.crewParts);
      this.ife.update(dt, inside, ifeView, data || {});
    }
    if (!inside) return;
    // cabin frame: the aircraft group's inverse, and view -> cabin for the normals
    const g = this.group;
    g.updateMatrixWorld();
    const inv = CAB_U.uCabInv.value.copy(g.matrixWorld).invert();
    const cam = this.camera || null;
    if (cam) CAB_U.uCabV2C.value.setFromMatrix4(this._m4 = (this._m4 || new THREE.Matrix4()).multiplyMatrices(inv, cam.matrixWorld));
    const sd = this._sd = (this._sd || new THREE.Vector3()).copy(this._sun).transformDirection(inv);
    const day = 1 - night;
    // LEDs: bright warm white by day, dimmed with the mood colour at night
    CAB_U.uCabL.value.set(Math.PI * (0.78 - 0.48 * night), Math.PI * 0.85 * day * (0.35 + 0.65 * this._sunK), night, 0);
    CAB_U.uCabSun.value.set(sd.x, sd.y, sd.z, Math.PI * 9.0 * this._sunK * day);
  }
}
