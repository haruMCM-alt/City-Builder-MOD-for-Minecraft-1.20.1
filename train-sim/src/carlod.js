// Simplified cars for trains seen from outside: the exterior of a car merged into a few meshes
// (body, one per group of door leaves that slide together, plus the few parts whose material changes
// per train: lamps, destination, livery bands, painted fronts). Interiors are left out; the windows
// show a lit interior colour. Each part keeps its own metalness / roughness through a vertex
// attribute, so a whole car body is one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// seen only from inside the car
const INTERIOR = /^(int_|seat|strap|pole|headrest|floor|roller_blind|LCD_|AD_\d|luggage|handrail|grab|door_in|ceiling|curtain)/;
// materials that each train sets for itself (lamps, destination, livery), or that carry a texture
const SEPARATE = /^(headlight|taillight|DEST|SIDELAMP|FRONT_)/;
const LEAF = /_door(\d+)_(L|R)_(a|b)$/;

const uniforms = { uLit: { value: 0.3 } };
let bodyMat = null;
function lodMaterial() {
  if (bodyMat) return bodyMat;
  bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3, name: 'lod_body' });
  bodyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uLit = uniforms.uLit;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aMRE;\nvarying vec3 vMRE;\nvarying float vLY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMRE = aMRE;\nvLY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMRE;\nvarying float vLY;\nuniform float uLit;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMRE.x;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMRE.y;')
      // windows: the saloon behind the glass — lit ceiling at the top, seats and people lower down
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 saloon = mix(vec3(0.10, 0.12, 0.20), vec3(0.95, 0.92, 0.84), smoothstep(2.15, 2.85, vLY));
        totalEmissiveRadiance += saloon * vMRE.z * uLit;`);
  };
  return bodyMat;
}

/** how brightly the windows glow (saloon lights on): 0 by day .. 1 at night */
export function setLodNight(k) { uniforms.uLit.value = 0.32 + 0.7 * k; }

const cache = new Map();

/** the merged parts of a car template (built once per template) */
function build(tmpl, bands) {
  const root = tmpl.clone(true);
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const buckets = new Map();        // 'body' | leaf key → [geometry]
  const separate = [];
  const leafInfo = new Map();
  const col = new THREE.Color();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material) return;
    const mat = o.material;
    const name = mat.name || '';
    if (o.name === 'passengers' || INTERIOR.test(name)) return;
    if (/^LCD|^AD_/.test(name)) return;
    // which door leaf (if any) this part slides with
    let leaf = null;
    for (let p = o; p && p !== root; p = p.parent) { const m = LEAF.exec(p.name); if (m) { leaf = { key: `${m[2]}_${m[3]}`, side: m[2], dir: m[3] === 'a' ? -1 : 1, node: p }; break; } }
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (SEPARATE.test(name) || mat.map) {
      separate.push({ geometry: g, material: mat, leafKey: leaf ? leaf.key : null });
      return;
    }
    const glass = /glass/.test(name) || (mat.transparent && mat.opacity < 0.9);
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const n = ng.attributes.position.count;
    const c = new Float32Array(n * 3), mre = new Float32Array(n * 3);
    // glass: the lit saloon seen through it; everything else in its own colour
    if (glass) col.setRGB(0.035, 0.04, 0.045);
    else if (bands && name === 'shonan_orange') col.set(bands[0]);        // the line's livery bands
    else if (bands && name === 'shonan_green') col.set(bands[1]);
    else col.copy(mat.color || col.setRGB(0.6, 0.6, 0.6));
    const metal = glass ? 0.35 : (mat.metalness ?? 0.2), rough = glass ? 0.08 : (mat.roughness ?? 0.6);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      mre[i * 3] = metal; mre[i * 3 + 1] = rough; mre[i * 3 + 2] = glass ? 1 : 0;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    ng.setAttribute('aMRE', new THREE.BufferAttribute(mre, 3));
    const key = leaf ? leaf.key : 'body';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ng);
    if (leaf && !leafInfo.has(key)) {
      const box = new THREE.Box3().setFromObject(leaf.node);
      leafInfo.set(key, { side: leaf.side, dir: leaf.dir, travel: box.max.x - box.min.x - 0.01 });
    }
  });
  // parts with their own material: one mesh per material (and door-leaf group)
  const sepBuckets = new Map();
  for (const s of separate) {
    const k = s.material.uuid + '|' + (s.leafKey || '');
    if (!sepBuckets.has(k)) sepBuckets.set(k, { material: s.material, leafKey: s.leafKey, list: [] });
    sepBuckets.get(k).list.push(s.geometry);
  }
  const sep = [];
  for (const b of sepBuckets.values()) {
    const keep = ['position', 'normal', 'uv'].filter((a) => b.list.every((g) => g.attributes[a]));
    const list = b.list.map((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(ng.attributes)) if (!keep.includes(k)) ng.deleteAttribute(k);
      return ng;
    });
    const geo = list.length > 1 ? mergeGeometries(list, false) : list[0];
    geo.computeBoundingSphere();
    sep.push({ geometry: geo, material: b.material, leafKey: b.leafKey });
  }
  const parts = [];
  for (const [key, list] of buckets) {
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    geo.computeBoundingSphere();
    parts.push({ key, geometry: geo, leaf: leafInfo.get(key) || null });
  }
  return { parts, separate: sep };
}

/**
 * a simplified car: a Group of meshes sharing the cached geometry. bands: [orange, green] colours
 * replacing the 湘南色 bands (other lines' liveries). Door-leaf groups are returned in
 * leaves: [{ obj, side: 'L' | 'R', dir, travel }] (they slide along x like the real leaves).
 */
export function lodCar(tmpl, bands = null) {
  const key = tmpl.uuid + (bands ? '|' + bands.join(',') : '');
  let e = cache.get(key);
  if (!e) { e = build(tmpl, bands); cache.set(key, e); }
  const group = new THREE.Group();
  group.name = tmpl.name + '_lod';
  const leaves = [];
  const leafObj = new Map();
  for (const p of e.parts) {
    const m = new THREE.Mesh(p.geometry, lodMaterial());
    m.castShadow = p.key === 'body';
    m.receiveShadow = false;
    group.add(m);
    if (p.leaf) { leaves.push({ obj: m, ...p.leaf }); leafObj.set(p.key, m); }
  }
  for (const s of e.separate) {
    const m = new THREE.Mesh(s.geometry, s.material);
    m.castShadow = false;
    (s.leafKey && leafObj.get(s.leafKey) ? leafObj.get(s.leafKey) : group).add(m);
  }
  return { group, leaves };
}

/**
 * one mesh from simple parts: [{ geometry (in the parent's frame), color, metal, rough }] (for trains
 * built from boxes, like the freight wagons)
 */
export function mergedMesh(items) {
  const list = items.map(({ geometry, color, metal = 0.2, rough = 0.6 }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3), mre = new Float32Array(n * 3);
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      mre[i * 3] = metal; mre[i * 3 + 1] = rough; mre[i * 3 + 2] = 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aMRE', new THREE.BufferAttribute(mre, 3));
    return g;
  });
  const geo = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, lodMaterial());
  m.castShadow = true;
  return m;
}
