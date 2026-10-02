// Cities of the four airport regions (blender/city_gen.py -> assets/cityN.bin): tens of
// thousands of buildings drawn as instanced boxes.  The facade textures (and their lit-window
// emissive maps) are the ones of world.glb; the texture coordinates come from the world
// position of every wall, so windows keep their real size on buildings of any shape.
// Roofs are separate instances (flat slabs, gable roofs on the houses, rooftop plant, the
// water tanks on Okinawan roofs) with their own colours.
import * as THREE from 'three';
import { NOISE_GLSL } from './shading.js';
import { terrainHeight } from './terrain.js';

// style -> facade material (world.glb name), texture tile (m), wall tint, roof colour set
const STYLES = [
  { mat: 'W_facade_glass', tile: [12, 16], tint: [1, 1, 1], roof: ['#3c4046', '#4a4e54'] },
  { mat: 'W_facade_glass2', tile: [14.4, 16], tint: [1, 1, 1], roof: ['#3a3d42', '#55585d'] },
  { mat: 'W_facade_office', tile: [12.8, 14.4], tint: [1, 1, 1], roof: ['#5c5f63', '#6d7074'] },
  { mat: 'W_facade_resid', tile: [14, 12], tint: [1, 1, 1], roof: ['#6f6f6c', '#80807b'] },
  { mat: 'W_facade_brick', tile: [14, 12.8], tint: [1, 1, 1], roof: ['#5d5a55', '#707070'] },
  { mat: 'W_facade_concrete', tile: [16, 14], tint: [1, 1, 1], roof: ['#77766f', '#8a8983'] },
  { mat: 'W_facade_concrete', tile: [24, 18], tint: [0.8, 0.82, 0.84], roof: ['#8c9196', '#a3a8ad', '#6e7a86'] },    // industrial
  { mat: 'W_facade_resid', tile: [9, 8], tint: [1.05, 1.0, 0.92], roof: ['#3d4a5c', '#5a3b33', '#474a4d', '#2f3338', '#6b5344'] },  // house
  { mat: 'W_facade_concrete', tile: [14, 11], tint: [1.35, 1.33, 1.28], roof: ['#d9d8d0', '#c9c8c0'] },  // Okinawa
];

function wallGeometry() {
  // unit box without top / bottom, origin at the bottom centre
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const idx = g.index.array, keep = [];
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z (6 indices each x 1 face = 2 triangles)
  for (const gr of g.groups) if (gr.materialIndex !== 2 && gr.materialIndex !== 3) for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(idx[i]);
  g.setIndex(keep);
  g.clearGroups();
  return g;
}
function slabGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}
function gableGeometry() {
  // prism along x: ridge at the top centre
  const g = new THREE.BufferGeometry();
  const p = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,      // south slope
    0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0,        // north slope
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0,                  // gable ends
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
  g.computeVertexNormals();
  return g;
}

// facade: world-space texture coordinates, weathering, per-floor lit windows at night
function cityFacade(src, tile, tint) {
  const m = new THREE.MeshStandardMaterial({
    map: src?.map || null, emissiveMap: src?.emissiveMap || null, emissive: new THREE.Color(src?.emissiveMap ? 1 : 0, src?.emissiveMap ? 1 : 0, src?.emissiveMap ? 1 : 0),
    color: new THREE.Color(...tint), roughness: src?.roughness ?? 0.6, metalness: src?.metalness ?? 0.1, envMapIntensity: 0.6,
  });
  m.name = 'City_' + (src?.name || 'facade');
  m.userData.cityFacade = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: new THREE.Vector2(...tile) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uTile;\nvarying vec3 vCtP; varying vec3 vCtN; varying float vCtSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  mat4 im = instanceMatrix;
  vec4 wp = modelMatrix * im * vec4(transformed, 1.0);
  vec3 wn = normalize(mat3(modelMatrix * im) * objectNormal);
  float ly = (im * vec4(transformed, 1.0)).y - im[3].y;          // height above the building base
  vec2 hz = normalize(wn.xz + 1e-5);
  float across = dot(wp.xz, vec2(-hz.y, hz.x));
  vCtSeed = fract(sin(dot(im[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 fuv = vec2(across / uTile.x + floor(vCtSeed * 8.0) * 0.25, ly / uTile.y);
#ifdef USE_MAP
  vMapUv = (mapTransform * vec3(fuv, 1.0)).xy;
#endif
#ifdef USE_EMISSIVEMAP
  vEmissiveMapUv = (emissiveMapTransform * vec3(fuv, 1.0)).xy;
#endif
  vCtP = vec3(across, ly, dot(wp.xz, hz));
  vCtN = wn;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCtP; varying vec3 vCtN; varying float vCtSeed;
${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // per-building tint, rain streaks below the windows, dirt near the ground
  vec3 tint = mix(vec3(0.9, 0.92, 0.97), vec3(1.07, 1.02, 0.94), vCtSeed);
  float streak = shNoise(vec3(vCtP.x * 1.7, vCtP.y * 0.05, vCtP.z)) * shNoise(vec3(vCtP.x * 0.4, vCtP.y * 0.02, vCtP.z + 7.0));
  float ground = exp(-max(vCtP.y, 0.0) / 3.0);
  diffuseColor.rgb *= tint * (1.0 - 0.2 * streak) * (1.0 - 0.25 * ground);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float fl = floor(vCtP.y / 3.4);
  float h1 = shHash(vec3(fl, vCtSeed * 91.0, 3.1));
  float h2 = shHash(vec3(floor(vCtP.x / 6.0), fl, vCtSeed * 57.0));
  float on = step(0.35, h1) * step(0.3, h2);
  vec3 warm = mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.9, 1.05), step(0.7, h2));
  totalEmissiveRadiance *= on * warm * (0.5 + 0.8 * h1);
}`);
  };
  m.customProgramCacheKey = () => 'city-facade';
  return m;
}

function sizeClass(w, d, h) {
  if (w * d < 320 && h < 14) return 's';
  if (w * d < 1600 && h < 30) return 'm';
  return '';
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Cityscape {
  // ap: { id, x, z } (airport origin); worldMats: name -> material of world.glb
  constructor(scene, ap, worldMats, quality) {
    this.scene = scene; this.ap = ap; this.mats = worldMats; this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'City' + ap.id;
    this.loaded = false; this.loading = false;
    this.obstacles = [];
    scene.add(this.group);
  }

  // buf: ArrayBuffer of cityN.bin
  build(buf) {
    if (this.loaded) return;
    this.loaded = true;
    const dv = new DataView(buf), n = Math.floor(buf.byteLength / 10);
    const { x: ox, z: oz } = this.ap;
    const rnd = mulberry(1000 + this.ap.id);
    const per = STYLES.map(() => []);
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      const x = dv.getInt16(o, true) * 2, y = dv.getInt16(o + 2, true) * 2;
      const w = dv.getUint8(o + 4), d = dv.getUint8(o + 5), h = dv.getUint16(o + 6, true) / 10;
      const rot = dv.getUint8(o + 8) / 256 * Math.PI * 2, st = Math.min(dv.getUint8(o + 9), STYLES.length - 1);
      per[st].push([ox + x, oz - y, w, d, h, rot]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const walls = wallGeometry(), slab = slabGeometry(), gable = gableGeometry();
    const roofs = [], gables = [], plant = [], tanks = [];
    const shadows = this.quality === 'high' || this.quality === 'ultra';
    this.shadows = shadows;
    // Performance: the buildings are split into TILE x TILE m tiles, one InstancedMesh per tile
    // and kind, so the frustum (and the sun's shadow camera) culls everything out of view; far
    // tiles drop the rooftop clutter and tiles beyond the haze are hidden (update()).
    const TILE = 3000;
    const tileKey = (x, z) => Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
    const tiles = new Map();
    const tileOf = (x, z) => {
      const k = tileKey(x, z);
      let t = tiles.get(k);
      if (!t) { t = { x: (Math.floor(x / TILE) + 0.5) * TILE, z: (Math.floor(z / TILE) + 0.5) * TILE, main: [], detail: [], small: [], medium: [] }; tiles.set(k, t); }
      return t;
    };
    const instanced = (geo, mat, list, setter, tile, detail, cls = '') => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((r, k) => setter(im, r, k));
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingBox(); im.computeBoundingSphere();
      im.castShadow = shadows; im.receiveShadow = true;
      im.frustumCulled = true;
      (detail ? tile.detail : cls === 's' ? tile.small : cls === 'm' ? tile.medium : tile.main).push(im);
      this.group.add(im);
    };
    const byTile = (list, xi = 0, zi = 2) => {
      const m = new Map();
      for (const r of list) { const k = tileKey(r[xi], r[zi]) + (typeof r[8] === 'string' ? r[8] : ''); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
      return m;
    };
    STYLES.forEach((S, st) => {
      const L = per[st];
      if (!L.length) return;
      const mat = cityFacade(this.mats[S.mat], S.tile, S.tint);
      const wallsByTile = new Map();
      L.forEach(([x, z, w, d, h, rot]) => {
        const g = terrainHeight(x, z);
        const base = Math.max(g, 0) - 1.5;
        // LOD class: small, low buildings (houses, shops) are under a pixel beyond ~9 km, mid-size
        // blocks beyond ~18 km (at 1080p / 55 deg); towers stay to the haze
        const cls = sizeClass(w, d, h);
        const tk = tileKey(x, z) + cls;
        if (!wallsByTile.has(tk)) wallsByTile.set(tk, []);
        wallsByTile.get(tk).push([x, base, z, w, h + 1.5, d, rot, cls]);
        const top = base + h + 1.5;
        const rc = S.roof[Math.floor(rnd() * S.roof.length)];
        if (st === 7) gables.push([x, top, z, w + 0.8, 2.2 + rnd() * 1.2, d + 0.8, rot, rc, cls]);
        else {
          roofs.push([x, top, z, w, 0.6, d, rot, rc, cls]);
          // rooftop plant rooms / AC units on the bigger roofs
          if (w > 14 && d > 14 && st !== 8) {
            const k2 = 1 + Math.floor(rnd() * 3);
            for (let j = 0; j < k2; j++) {
              const ux = (rnd() - 0.5) * (w - 8), uz = (rnd() - 0.5) * (d - 8);
              const c = Math.cos(rot), sn = Math.sin(rot);
              plant.push([x + ux * c + uz * sn, top + 0.6, z - ux * sn + uz * c, 3 + rnd() * 6, 1.5 + rnd() * 2.5, 3 + rnd() * 6, rot]);
            }
          }
          if (st === 8 && rnd() < 0.75) {
            const c = Math.cos(rot), sn = Math.sin(rot), ux = (rnd() - 0.5) * (w - 3), uz = (rnd() - 0.5) * (d - 3);
            tanks.push([x + ux * c + uz * sn, top + 0.6, z - ux * sn + uz * c]);
          }
        }
        if (h > 25) {
          const r = Math.hypot(w, d) / 2;
          this.obstacles.push(x - r, z - r, x + r, z + r, top);
        }
      });
      for (const list of wallsByTile.values()) {
        instanced(walls, mat, list, (im, r, k) => {
          q.setFromAxisAngle(up, r[6]); p.set(r[0], r[1], r[2]); s.set(r[3], r[4], r[5]);
          im.setMatrixAt(k, m4.compose(p, q, s));
        }, tileOf(list[0][0], list[0][2]), false, list[0][7]);
      }
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.5 });
    const add = (geo, list, mat, withColor = true, detail = false) => {
      if (!list.length) return;
      for (const tl of byTile(list).values()) {
        instanced(geo, mat, tl, (im, r, k) => {
          q.setFromAxisAngle(up, r[6] ?? 0);
          p.set(r[0], r[1], r[2]); s.set(r[3], r[4], r[5]);
          im.setMatrixAt(k, m4.compose(p, q, s));
          if (withColor) im.setColorAt(k, col.set(r[7] || '#8a8a86'));
        }, tileOf(tl[0][0], tl[0][2]), detail, detail ? '' : (typeof tl[0][8] === 'string' ? tl[0][8] : ''));
      }
    };
    add(slab, roofs, roofMat);
    add(gable, gables, roofMat);
    add(slab, plant, new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: 0.7, metalness: 0.3 }), false, true);
    if (tanks.length) {
      const tg = new THREE.CylinderGeometry(0.6, 0.6, 1.6, 10); tg.translate(0, 0.8, 0);
      add(tg, tanks.map((t) => [t[0], t[1], t[2], 1, 1, 1, 0]), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5, metalness: 0.2 }), false, true);
    }
    this.tiles = [...tiles.values()];
    this.group.updateMatrixWorld(true);
    for (const m of this.group.children) { m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; }
    this.count = n;
  }

  // distance LOD per tile: rooftop plant / tanks only within DETAIL_R (sub-pixel beyond), the
  // whole tile hidden past the visibility (it is in the haze anyway); shadows only near by
  update(cam, vis = 60000) {
    if (!this.tiles) return;
    const far = Math.min(Math.max(vis * 0.9, 20000), 48000) + Math.max(0, cam.y) * 2;
    const DETAIL_R = 6000, SHADOW_R = 4500, SMALL_R = 9000, MEDIUM_R = 18000;
    for (const t of this.tiles) {
      const d = Math.hypot(t.x - cam.x, t.z - cam.z) - 2121;      // to the nearest corner
      const on = d < far;
      for (const m of t.main) { m.visible = on; m.castShadow = this.shadows && d < SHADOW_R; }
      const sm = on && d < SMALL_R;
      for (const m of t.small) { m.visible = sm; m.castShadow = this.shadows && d < SHADOW_R; }
      const md = on && d < MEDIUM_R;
      for (const m of t.medium) { m.visible = md; m.castShadow = this.shadows && d < SHADOW_R; }
      const det = on && d < DETAIL_R;
      for (const m of t.detail) { m.visible = det; m.castShadow = this.shadows && d < SHADOW_R; }
    }
  }

  setNight(night) {
    if (this._night !== undefined && Math.abs(night - this._night) < 0.002) return;
    this._night = night;
    for (const m of this.group.children) {
      const mat = m.material;
      if (mat?.userData?.cityFacade) mat.emissiveIntensity = night * 1.3;
    }
  }
}
