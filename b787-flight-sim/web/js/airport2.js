// The remote airports (airports.js): each one is a Blender model (airportN.glb) placed at its
// position, plus airportN.json (stands, sign anchors, lights, collision boxes, trees) in the
// airport's local frame.  The name signs are drawn from the airport names chosen in the menu.
// The models are loaded when the camera comes near (main.js); the data is loaded at start so
// the lights, collision boxes and runways exist everywhere from the beginning.
import * as THREE from 'three';
import { textSign, signTexts } from './signs.js';
import { REMOTES } from './airports.js';

export { REMOTES, remoteById, nearestAirport, LAYOUT } from './airports.js';
export const A2 = REMOTES[0];

// runways 09 / 27 of every remote airport, in world.json's runway format (appended after the
// home runways, so lookups by ident still find the home airport first)
export function remoteRunways() {
  const out = [];
  for (const ap of REMOTES) {
    const rw = (ident, sx, hdg, freq) => ({ ident, apt: ap.id, threshold: [ap.x + sx * ap.len / 2, 0, ap.z], heading: hdg, length: ap.len,
      width: ap.wid, elevation: 0, ils: { course: hdg, glideslope: 3, gsAntennaFromThr: 300, freq } });
    out.push(rw('09', -1, 90, `11${ap.id}.10`), rw('27', 1, 270, `11${ap.id}.70`));
  }
  return out;
}

// collision boxes (three.js x0, z0, x1, z1, top) in world coordinates
export function remoteObstacles(ap, data) {
  const o = data?.obstacles || [], out = new Array(o.length);
  for (let i = 0; i < o.length; i += 5) {
    out[i] = o[i] + ap.x; out[i + 1] = o[i + 1] + ap.z; out[i + 2] = o[i + 2] + ap.x; out[i + 3] = o[i + 3] + ap.z; out[i + 4] = o[i + 4];
  }
  return out;
}

// light groups in the world.json format (World.buildLights), world coordinates; names get the
// airport prefix (a2_, a3_, ...)
export function remoteLights(ap, data) {
  const L = {}, pre = `a${ap.id}_`;
  for (const [name, g] of Object.entries(data?.lights || {})) {
    const pos = g.pos.slice();
    for (let i = 0; i < pos.length; i += 3) { pos[i] += ap.x; pos[i + 2] += ap.z; }
    L[pre + name.replace(/^a\d+_/, '')] = { ...g, pos };
  }
  return L;
}

export function remoteTrees(ap, data) {
  const t = (data?.trees || []).slice();
  for (let i = 0; i < t.length; i += 4) { t[i] += ap.x; t[i + 2] += ap.z; }
  return t;
}

export class RemoteAirport {
  // world: the World (material set-up and trees); data: airportN.json
  constructor(scene, world, ap, name, data) {
    this.ap = ap; this.world = world; this.data = data;
    this.group = new THREE.Group();
    this.group.position.set(ap.x, 0, ap.z);
    this.group.name = 'Airport' + ap.id;
    scene.add(this.group);
    this.signs = new THREE.Group();
    this.group.add(this.signs);
    this.loaded = false; this.loading = false;
    this.setName(name);
  }

  // the Blender model arrived: materials, trees
  attach(gltf) {
    if (!gltf || this.loaded) return;
    this.loaded = true;
    this.world.prepareGLB(gltf.scene);
    this.group.add(gltf.scene);
    const t = remoteTrees(this.ap, this.data);
    if (t.length) this.world.buildTrees(t);
  }

  setName(name) {
    for (const m of this.signs.children.slice()) { this.signs.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
    const T = signTexts(name || 'Airport');
    for (const g of this.data?.signs || []) {
      const m = textSign(T[g.kind] || T.airside, { h: g.h, maxW: g.maxW, color: '#eef3f7' });   // on dark fascia panels
      m.position.set(g.pos[0], g.pos[1], g.pos[2]); m.rotation.y = g.ry;
      this.signs.add(m);
    }
  }

  update(night) {
    for (const m of this.signs.children) m.material.emissiveIntensity = night * 1.2;
  }
}
