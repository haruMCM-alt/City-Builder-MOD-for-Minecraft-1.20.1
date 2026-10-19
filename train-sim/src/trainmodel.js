import * as THREE from 'three';
import { CAR_LEN, BOGIE_C } from './vehicles.js';
import { makeDestTexture, makeAdTexture, makeTvTexture, InfoDisplay, UI_FONT } from './displays.js';
import { passengerMesh } from './world/people.js';

const WHEEL_R = 0.43;            // tread radius of the modelled wheels (860 mm wheel)
const DOOR_OPEN_T = 1.9;         // s, pneumatic / linear-motor door stroke
const DOOR_CLOSE_T = 1.15;

const KIND = { C: 'cab', R: 'cab', M: 'mid', P: 'mid_panto', G: 'green' };

export { makeDestTexture };

// ---------------------------------------------------------------------------
// shared material upgrades (applied once per glTF material)
// ---------------------------------------------------------------------------
let brushTex = null;
function brushedTexture() {
  if (brushTex) return brushTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  // fine horizontal brushing
  for (let y = 0; y < 256; y++) {
    const v = 128 + (Math.random() - 0.5) * 50;
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    g.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 900; i++) {
    const v = Math.random() < 0.5 ? 90 : 170;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 80, 1);
  }
  brushTex = new THREE.CanvasTexture(c);
  brushTex.wrapS = brushTex.wrapT = THREE.RepeatWrapping;
  brushTex.anisotropy = 8;
  return brushTex;
}

/** stainless: object-space brushed finish + brake-dust grime low down + rain streaks under windows */
function stainlessPatch(mat, strength = 1) {
  if (mat.userData.patched) return;
  mat.userData.patched = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.brushMap = { value: brushedTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nuniform sampler2D brushMap;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float br = texture2D(brushMap, vec2(vObjPos.x * 0.35 + vObjPos.z * 0.35, vObjPos.y * 6.0)).r;
        float streak = texture2D(brushMap, vec2(vObjPos.x * 3.1 + vObjPos.z * 3.1, 0.3)).r;
        float grime = smoothstep(1.45, 1.06, vObjPos.y) * 0.55 + smoothstep(1.85, 1.2, vObjPos.y) * (streak - 0.4) * 0.5;
        grime = clamp(grime, 0.0, 1.0) * ${strength.toFixed(2)};
        roughnessFactor = clamp(roughnessFactor * mix(0.75, 1.3, br) + grime * 0.35, 0.04, 1.0);
        diffuseColor.rgb *= mix(0.93, 1.05, br) * (1.0 - grime * 0.42);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.25, 0.20) * diffuseColor.rgb * 1.6, grime * 0.5);`);
  };
  mat.customProgramCacheKey = () => 'stainless' + strength;
  mat.needsUpdate = true;
}

let fabricTex = null;
/** moquette weave (small woven pattern) used in object space on seat cushions and the floor speckle */
function fabricTexture() {
  if (fabricTex) return fabricTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 0.86 : 1.0;          // twill-ish weave
      const fleck = Math.random() < 0.06 ? 0.7 + Math.random() * 0.6 : 1.0;
      const v = Math.max(0, Math.min(255, 168 * weave * fleck + (Math.random() - 0.5) * 34));
      const k = (y * 128 + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  fabricTex = new THREE.CanvasTexture(c);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.anisotropy = 4;
  return fabricTex;
}

/** object-space texture detail for cloth / floor materials (they have no UVs) */
function detailPatch(mat, scale, amount, roughAdd) {
  if (mat.userData.patched) return;
  mat.userData.patched = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: fabricTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;\nuniform sampler2D detailMap;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec3 an = abs(normalize(vObjN)); an /= (an.x + an.y + an.z);
        float d = texture2D(detailMap, vObjPos.zy * ${scale.toFixed(1)}).r * an.x
                + texture2D(detailMap, vObjPos.xz * ${scale.toFixed(1)}).r * an.y
                + texture2D(detailMap, vObjPos.xy * ${scale.toFixed(1)}).r * an.z;
        diffuseColor.rgb *= mix(1.0 - ${amount.toFixed(2)}, 1.0 + ${amount.toFixed(2)} * 0.5, d);
        roughnessFactor = clamp(roughnessFactor + ${roughAdd.toFixed(2)} * (1.0 - d), 0.0, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'detail' + scale + amount;
  mat.needsUpdate = true;
}

const UPGRADED = new WeakSet();
function upgradeMaterial(m) {
  if (!m || UPGRADED.has(m)) return;
  UPGRADED.add(m);
  if (m.name && m.name.startsWith('FRONT_')) {
    // painted cab face: keep its maps, add the brushed finish + grime like the body
    m.envMapIntensity = 1.1;
    if (m.map) m.map.anisotropy = 8;
    stainlessPatch(m, 0.5);
    return;
  }
  switch (m.name) {
    case 'stainless_body': case 'stainless_door': case 'silver_paint': case 'stainless_seam':
      m.envMapIntensity = 1.15;
      stainlessPatch(m, m.name === 'stainless_door' ? 0.6 : 1);
      break;
    case 'white_frp': case 'skirt_white': case 'shonan_orange': case 'shonan_green': case 'paint_orange': case 'paint_green': case 'crew_door_green':
      stainlessPatch(m, 0.7);
      break;
    case 'side_glass':
      m.transparent = true;
      m.opacity = 0.45;
      m.depthWrite = false;
      m.roughness = 0.04;
      m.metalness = 0.0;
      m.envMapIntensity = 1.6;
      m.color.setRGB(0.10, 0.14, 0.13);
      break;
    case 'window_glass': case 'front_black':
      m.envMapIntensity = 1.5;
      break;
    case 'seat_e231': case 'seat_e233': case 'seat_211': case 'seat_115': case 'seat_green': case 'seat_priority': case 'headrest_cover':
      m.envMapIntensity = 0.3;
      m.roughness = Math.max(m.roughness, 0.9);
      detailPatch(m, 38, 0.32, 0.1);
      break;
    case 'int_floor':
      m.envMapIntensity = 0.5;
      detailPatch(m, 6, 0.18, 0.15);
      break;
    case 'int_wall': case 'int_ceiling': case 'seat_partition': case 'strap': case 'strap_belt': case 'strap_priority': case 'roller_blind':
      m.envMapIntensity = 0.45;
      break;
    case 'int_light': case 'int_lcd':
      m.toneMapped = false;
      if (m.emissive) m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.6);
      break;
    case 'bogie':
      m.color.setRGB(0.055, 0.048, 0.042);
      break;
    case 'underfloor':
      m.color.setRGB(0.10, 0.10, 0.105);
      break;
    default:
  }
}

/** screens are modelled as thin boxes: show the picture on the faces looking into the car only,
 *  the edges sample the texture's black bezel (u, v = 0) */
const SCREEN_FIXED = new WeakSet();
function screenFrontOnly(geo) {
  if (SCREEN_FIXED.has(geo) || !geo.attributes.normal || !geo.attributes.uv) return;
  SCREEN_FIXED.add(geo);
  const n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < n.count; i++) if (Math.abs(n.getZ(i)) < 0.7) uv.setXY(i, 0.002, 0.002);
  uv.needsUpdate = true;
}

// advertising posters are shared by every train (fictional, generic)
let AD_MATS = null;
function adMaterials() {
  if (!AD_MATS) {
    AD_MATS = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: makeAdTexture(i), roughness: 0.55, envMapIntensity: 0.4 }));
    AD_MATS.tv = new THREE.MeshBasicMaterial({ map: makeTvTexture(), toneMapped: false });
  }
  return AD_MATS;
}

/** cushion centres of the long seats, found from the seat material's up-facing top faces (cached per car type) */
const SEAT_CACHE = new Map();
function seatCushions(tmpl, obj) {
  if (SEAT_CACHE.has(tmpl.name)) return SEAT_CACHE.get(tmpl.name);
  const pts = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  obj.traverse((o) => {
    const n = o.isMesh && o.material && o.material.name;
    if (!n || !/^seat_(e231|e233|211|115|priority)$/.test(n)) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(o.matrixWorld);
      e1.subVectors(v[1], v[0]); e2.subVectors(v[2], v[0]);
      const nn = e1.cross(e2).normalize();
      const cy = (v[0].y + v[1].y + v[2].y) / 3;
      // cushion tops: horizontal faces 0.40-0.47 m above the 1.17 m floor
      if (Math.abs(nn.y) > 0.95 && cy > 1.57 && cy < 1.64) pts.push({ x: (v[0].x + v[1].x + v[2].x) / 3, z: (v[0].z + v[1].z + v[2].z) / 3 });
    }
  });
  // two triangles per cushion: merge centroids closer than 0.2 m
  pts.sort((a, b) => a.z - b.z || a.x - b.x);
  const seats = [];
  for (const p of pts) {
    const s = seats.find((q) => Math.abs(q.x - p.x) < 0.2 && Math.abs(q.z - p.z) < 0.2);
    if (s) { s.x = (s.x + p.x) / 2; s.z = (s.z + p.z) / 2; } else seats.push({ ...p });
  }
  const out = seats.filter((s) => Math.abs(s.z) > 0.6);
  SEAT_CACHE.set(tmpl.name, out);
  return out;
}

const SERIES_NO = { e231: ['E231', 'E230', 1000], e233: ['E233', 'E232', 3000], s211: ['211', '210', 3000], s115: ['115', '114', 1000] };
/** car type + number painted on the body side ("モハE231-1012") */
function carNumbers(veh, formation) {
  const [a, b, base] = SERIES_NO[veh.id] || SERIES_NO.e231;
  const set = 10 + Math.floor(Math.random() * 40);
  const out = [];
  let g = 0;
  for (let i = 0; i < formation.length; i++) {
    const c = formation[i], prev = formation[i - 1];
    let t;
    if (c === 'C') t = 'クハ' + a;
    else if (c === 'R') t = 'クハ' + b;
    else if (c === 'P') t = 'モハ' + a;
    else if (c === 'G') t = 'サロ' + (g++ % 2 ? b : a);
    else t = prev === 'P' ? 'モハ' + b : 'サハ' + a;
    out.push(`${t}-${base + set + (i >= 10 ? 0 : 0)}`);
  }
  return out;
}

function numberTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 64);
  g.fillStyle = '#151515';
  g.font = `700 46px ${UI_FONT}`;
  g.textBaseline = 'middle';
  g.fillText(text, 6, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class TrainSet {
  /**
   * @param gltfScene loaded glTF scene for the series
   * @param veh vehicle definition
   * @param formation string like "CPMMR..."
   * @param opts { key, dest, destType, forward (true = runs toward +s) }
   */
  constructor(gltfScene, veh, formation, opts) {
    this.veh = veh;
    this.formation = formation;
    this.forward = opts.forward !== false;
    this.group = new THREE.Group();
    this.cars = [];
    const key = opts.key;
    const destTex = makeDestTexture(opts.dest || '普通 宇都宮', opts.destType || 'led', veh.destColor);
    const destMat = new THREE.MeshBasicMaterial({ map: destTex, toneMapped: false });
    const lamp = (name, on) => {
      const m = new THREE.MeshStandardMaterial({
        color: on ? (name === 'head' ? 0xfffbe8 : 0xff2a1a) : 0x222222,
        emissive: on ? (name === 'head' ? 0xfff2cc : 0xff1505) : 0x000000,
        emissiveIntensity: on ? 2.5 : 0,
        roughness: 0.3,
      });
      return m;
    };
    const lights = {
      headOn: lamp('head', true), headOff: lamp('head', false),
      tailOn: lamp('tail', true), tailOff: lamp('tail', false),
    };
    const n = formation.length;
    this.sideLampMat = new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xff1a08, emissiveIntensity: 0, roughness: 0.3 });
    const numbers = carNumbers(veh, formation);
    this.disposables = [];
    this.wheels = [];          // { obj, sign }   wheelsets (rotate about the axle)
    this.leaves = [];          // sliding door leaves
    this.wheelAngle = 0;
    this.lastS = null;
    this.doorState = { left: 0, right: 0 };     // 0 closed .. 1 open
    this.doorTarget = { left: 0, right: 0 };
    // in-car passenger information display (one canvas shared by every door of this train)
    this.info = opts.info ? new InfoDisplay(veh.id === 'e233' ? 'lcd' : 'led') : null;
    const infoOff = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.25 });
    this.disposables.push(infoOff);
    const ads = adMaterials();
    for (let i = 0; i < n; i++) {
      const code = formation[i];
      const tmpl = gltfScene.getObjectByName(`${key}_${KIND[code]}`) || gltfScene.getObjectByName(`${key}_mid`);
      const obj = tmpl.clone(true);
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      const isFront = i === 0, isRear = i === n - 1;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = false;
        const mname = o.material && o.material.name;
        upgradeMaterial(o.material);
        if (mname === 'side_glass') { o.castShadow = false; o.renderOrder = 2; }
        if (mname && (mname.startsWith('int_') || mname.startsWith('seat') || mname === 'strap' || mname === 'pole' || mname === 'headrest_cover')) {
          o.castShadow = false; o.receiveShadow = true;
        }
        if (mname === 'SIDELAMP') o.material = this.sideLampMat;
        else if (mname === 'LCD_INFO') { screenFrontOnly(o.geometry); o.material = this.info ? this.info.mat : infoOff; }
        else if (mname === 'LCD_ADTV') { screenFrontOnly(o.geometry); o.material = this.info ? ads.tv : infoOff; }
        else if (mname && /^AD_\d$/.test(mname)) o.material = ads[Number(mname[3])];
        else if (mname === 'DEST') o.material = destMat;
        else if (mname === 'headlight') o.material = (code === 'C' && isFront) ? lights.headOn : lights.headOff;
        else if (mname === 'taillight') o.material = (code === 'R' && isRear) ? lights.tailOn : lights.tailOff;
      });
      // moving parts exported as separate nodes from Blender
      const isR = code === 'R';
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (/_ws\d+$/.test(o.name)) this.wheels.push({ obj: o, sign: isR ? -1 : 1 });
        const m = /_door(\d+)_(L|R)_(a|b)$/.exec(o.name);
        if (m) {
          const box = new THREE.Box3().setFromObject(o);
          const w = box.max.x - box.min.x;
          // L = the model's left (Blender +Y); a reversed cab car is turned round
          const left = (m[2] === 'L') !== isR;
          this.leaves.push({ obj: o, x0: o.position.x, dir: m[3] === 'a' ? -1 : 1, travel: w - 0.01, side: left ? 'left' : 'right', car: i, cx: (box.max.x + box.min.x) / 2 + (m[3] === 'a' ? w / 2 : -w / 2) });
        }
      });
      // passengers (not in the double-deck green cars; fewer on passing trains)
      if (code !== 'G' && opts.passengers !== false) {
        const seats = seatCushions(tmpl, obj);
        const doorX = [];
        for (const l of this.leaves) if (l.car === i && l.dir < 0 && l.side === 'left') doorX.push(l.cx);
        const rnd = mulberry(i * 7919 + (opts.forward === false ? 101 : 1));
        const pm = passengerMesh(seats, doorX.length ? doorX : [-4.9, 0, 4.9], 1.17, rnd, opts.forward === false ? 0.35 : 0.42);
        if (pm) { obj.add(pm); this.disposables.push(pm.geometry); }
      }
      const holder = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(obj);
      // car number decals on both sides near the car end
      const nt = numberTexture(numbers[i]);
      const nm = new THREE.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false, toneMapped: true, color: 0x9a9a9a });
      const ng = new THREE.PlaneGeometry(0.80, 0.10);
      this.disposables.push(nt, nm, ng);
      for (const side of [-1, 1]) {
        const d = new THREE.Mesh(ng, nm);
        // three.js car space: +x forward, +y up, -z = left
        const hw = { e231: 1.462, e233: 1.462, s211: 1.472, s115: 1.457 }[veh.id] || 1.465;
        d.position.set(side > 0 ? -8.55 : 8.55, 1.30, side * -hw);
        d.rotation.y = side > 0 ? Math.PI : 0;
        obj.add(d);
      }
      if (code === 'R') inner.rotation.y = Math.PI; // cab faces backwards
      holder.add(inner);
      holder.userData = { code, inner, model: obj };
      this.group.add(holder);
      this.cars.push(holder);
    }
    this.length = n * CAR_LEN;
    this._p1 = {}; this._p2 = {};
  }

  /** place along the route; sFront = s of the leading coupler; offsetFn(s) = lateral offset */
  place(route, sFront, offsetFn, sway = 0) {
    const dir = this.forward ? 1 : -1;
    // wheels roll with the distance travelled
    if (this.lastS != null) {
      const ds = sFront - this.lastS;
      if (Math.abs(ds) < 50) this.wheelAngle = (this.wheelAngle - (ds * dir) / WHEEL_R) % (Math.PI * 2);
    }
    this.lastS = sFront;
    for (const w of this.wheels) w.obj.rotation.z = this.wheelAngle * w.sign;
    for (let i = 0; i < this.cars.length; i++) {
      const c = sFront - dir * (CAR_LEN / 2 + i * CAR_LEN);
      const sa = c + BOGIE_C, sb = c - BOGIE_C;
      const a = route.pose(sa, offsetFn(sa), this._p1);
      const b = route.pose(sb, offsetFn(sb), this._p2);
      const car = this.cars[i];
      car.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const dx = a.x - b.x, dz = a.z - b.z;
      let yaw = Math.atan2(-dz, dx);
      let pitch = Math.atan2(a.y - b.y, Math.hypot(dx, dz));
      if (!this.forward) { yaw += Math.PI; pitch = -pitch; }
      car.rotation.set(0, yaw, pitch);
      // superelevation-ish lean on curves + a little sway
      const k = route.curvature(c);
      car.userData.inner.rotation.x = -k * 20 * (this.forward ? 1 : -1) + Math.sin(c * 0.11 + i) * sway;
    }
  }

  /** open (true) or close the doors on one side of the train ('left' / 'right' in the running direction) */
  setDoors(side, open) {
    this.doorTarget.left = side === 'left' && open ? 1 : 0;
    this.doorTarget.right = side === 'right' && open ? 1 : 0;
    if (!open) this.doorTarget.left = this.doorTarget.right = 0;
  }

  /** door leaf motion + passenger information display */
  animate(dt, info) {
    for (const side of ['left', 'right']) {
      const cur = this.doorState[side], tgt = this.doorTarget[side];
      if (cur === tgt) continue;
      const rate = 1 / (tgt > cur ? DOOR_OPEN_T : DOOR_CLOSE_T);
      this.doorState[side] = tgt > cur ? Math.min(tgt, cur + rate * dt) : Math.max(tgt, cur - rate * dt);
      const u = this.doorState[side];
      // opening: quick start, cushioned end; closing: accelerates then a soft cushion just before the bang
      const k = tgt > cur ? 1 - (1 - u) ** 2.2 : u * u * (3 - 2 * u);
      for (const l of this.leaves) if (l.side === side) l.obj.position.x = l.x0 + l.dir * l.travel * k;
    }
    if (this.info && info) this.info.update(dt, info);
  }

  get doorsMoving() { return this.doorState.left !== this.doorTarget.left || this.doorState.right !== this.doorTarget.right; }

  /** 車側灯: red lamps on the car sides while the doors are open */
  setSideLamps(on) { this.sideLampMat.emissiveIntensity = on ? 3 : 0; }

  setVisible(i, visible) {
    this.cars[i].userData.model.visible = visible;
  }

  dispose() {
    this.group.removeFromParent();
    if (this.info) { this.info.t.dispose(); this.info.mat.dispose(); }
    for (const d of this.disposables || []) d.dispose();
  }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
