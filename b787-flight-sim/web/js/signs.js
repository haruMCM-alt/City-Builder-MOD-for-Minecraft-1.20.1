// Airport name signs.  The Blender world bakes "CITY BUILDER INTERNATIONAL AIRPORT" (terminal,
// airside), "シティビルダー国際空港" (terminal, landside) and "CITY BUILDER" (hangars) as 3D
// letters; they are cut out of the merged meshes here and replaced by text planes drawn from
// the airport name chosen in the menu.
import * as THREE from 'three';

// drop the triangles whose centroid (world space) satisfies cut(x, y, z)
export function stripTriangles(mesh, cut) {
  const g = mesh.geometry;
  mesh.updateWorldMatrix(true, false);
  const P = g.getAttribute('position'), M = mesh.matrixWorld, v = new THREE.Vector3();
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : P.count;
  const keep = [];
  let removed = 0;
  for (let i = 0; i < n; i += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(P, idx ? idx[i + k] : i + k).applyMatrix4(M);
      cx += v.x / 3; cy += v.y / 3; cz += v.z / 3;
    }
    if (cut(cx, cy, cz)) { removed++; continue; }
    keep.push(idx ? idx[i] : i, idx ? idx[i + 1] : i + 1, idx ? idx[i + 2] : i + 2);
  }
  if (removed) g.setIndex(keep);
  return removed;
}

// one line of text on a transparent plane, letters `h` metres tall, at most maxW wide
export function textSign(text, { h, maxW = 1e9, color = '#20242a', font = '800 180px "Helvetica Neue", Helvetica, Arial, "Hiragino Sans", "Noto Sans JP", sans-serif', emissive = '#fff1d6' }) {
  const cv = document.createElement('canvas');
  let c = cv.getContext('2d');
  c.font = font;
  const tw = Math.ceil(c.measureText(text).width) + 40;
  cv.width = Math.min(4096, tw); cv.height = 240;
  c = cv.getContext('2d');
  c.font = font; c.textBaseline = 'middle'; c.fillStyle = '#ffffff';
  c.setTransform(cv.width / tw, 0, 0, 1, 0, 0);
  c.fillText(text, 20, 124);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const hPlane = h * 240 / 130;                       // cap height ~130 px of the 240 px line
  let w = hPlane * tw / 240;
  let k = 1;
  if (w > maxW) { k = maxW / w; w = maxW; }
  const mat = new THREE.MeshStandardMaterial({ map: tex, color, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0.2,
    emissive, emissiveMap: tex, emissiveIntensity: 0, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hPlane * k), mat);
  m.userData.sign = true;
  return m;
}

export const DEFAULT_AIRPORTS = { name: 'City Builder', name2: 'Minato', name3: 'Aoba', name4: 'Kaede' };
export function loadAirportNames() {
  try { return { ...DEFAULT_AIRPORTS, ...(JSON.parse(localStorage.getItem('b787.airports') || 'null') || {}) }; } catch (e) { return { ...DEFAULT_AIRPORTS }; }
}
export function saveAirportNames(a) { try { localStorage.setItem('b787.airports', JSON.stringify(a)); } catch (e) { /* ignore */ } }
const ascii = (s) => /^[\x20-\x7e]*$/.test(s);
export const signTexts = (name) => ({
  airside: ascii(name) ? `${name.toUpperCase()} INTERNATIONAL AIRPORT` : `${name}国際空港`,
  landside: ascii(name) ? `${name} International Airport` : `${name}国際空港`,
  hangar: ascii(name) ? name.toUpperCase() : name,
});
