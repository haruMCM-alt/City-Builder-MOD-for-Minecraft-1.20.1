import * as THREE from 'three';
import { CAR_LEN, BOGIE_C } from './vehicles.js';

const KIND = { C: 'cab', R: 'cab', M: 'mid', P: 'mid_panto', G: 'green' };

/** canvas texture for an LED / roll-sign destination display */
export function makeDestTexture(text, type = 'led', color = '#ff8a10') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  if (type === 'roll') {
    g.fillStyle = '#f4f4ee'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#111';
    g.font = 'bold 64px "Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text.replace(/^普通\s*/, ''), 256, 50);
  } else {
    g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 96);
    const [kind, dest] = text.split(/\s+/);
    g.fillStyle = '#0a8a3a'; g.fillRect(8, 10, 150, 76);
    g.fillStyle = '#fff';
    g.font = 'bold 54px "Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind || '普通', 83, 50);
    g.fillStyle = color;
    g.font = 'bold 62px "Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
    g.fillText(dest || '', 340, 50);
    // LED dot mask
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let x = 0; x < 512; x += 4) g.fillRect(x, 0, 1, 96);
    for (let y = 0; y < 96; y += 4) g.fillRect(0, y, 512, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

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

const UPGRADED = new WeakSet();
function upgradeMaterial(m) {
  if (!m || UPGRADED.has(m)) return;
  UPGRADED.add(m);
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
    case 'int_wall': case 'int_ceiling': case 'int_floor': case 'seat_partition':
    case 'seat_e231': case 'seat_e233': case 'seat_211': case 'seat_115': case 'seat_green': case 'seat_priority': case 'headrest_cover': case 'strap':
      m.envMapIntensity = 0.45;
      break;
    case 'int_light': case 'int_lcd':
      m.toneMapped = false;
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
  g.font = 'bold 46px "Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
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
        else if (mname === 'DEST') o.material = destMat;
        else if (mname === 'headlight') o.material = (code === 'C' && isFront) ? lights.headOn : lights.headOff;
        else if (mname === 'taillight') o.material = (code === 'R' && isRear) ? lights.tailOn : lights.tailOff;
      });
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

  /** 車側灯: red lamps on the car sides while the doors are open */
  setSideLamps(on) { this.sideLampMat.emissiveIntensity = on ? 3 : 0; }

  setVisible(i, visible) {
    this.cars[i].userData.model.visible = visible;
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables || []) d.dispose();
  }
}
