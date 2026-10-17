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
        if (mname === 'DEST') o.material = destMat;
        else if (mname === 'headlight') o.material = (code === 'C' && isFront) ? lights.headOn : lights.headOff;
        else if (mname === 'taillight') o.material = (code === 'R' && isRear) ? lights.tailOn : lights.tailOff;
      });
      const holder = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(obj);
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
      car.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      const dx = a.x - b.x, dz = a.z - b.z;
      let yaw = Math.atan2(-dz, dx);
      if (!this.forward) yaw += Math.PI;
      car.rotation.set(0, yaw, 0);
      // superelevation-ish lean on curves + a little sway
      const k = route.curvature(c);
      car.userData.inner.rotation.x = -k * 20 * (this.forward ? 1 : -1) + Math.sin(c * 0.11 + i) * sway;
    }
  }

  setVisible(i, visible) {
    this.cars[i].userData.model.visible = visible;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
