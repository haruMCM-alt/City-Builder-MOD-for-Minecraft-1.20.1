// Walkable terminal: the departures hall (check-in islands, security checkpoint and, in the
// overseas style, passport control and a duty-free walk-through), the stairs down to the gate
// pier, its moving walkways and gate lounges, all the way to the boarding gate of your flight.
// Built in code (no extra download) inside the Blender terminal shell of the home airport
// (blender/build_world.py: main hall x -260..260 z -690..-548, pier x -640..640 z -548..-505,
// boarding bridges joining the pier face at stand x - 14, sill 5.3 m).
//
// Two looks, chosen in the options: 'jp' (a Japanese airport: Japanese-first dark signs,
// staffed counters with check-in machines, walk-through metal detectors, domestic flow) and
// 'intl' (an overseas airport: English-first yellow signs, self check-in and bag drop, body
// scanners, passport control and duty free before the gates).
import * as THREE from 'three';
import { LOGOS, logoById, drawLogoIcon } from './livery.js';
import { AIRPORT, aptName } from './atc.js';
import { REMOTES, remoteById } from './airports.js';
import { mulberry32 } from './util.js';

const FD = 9.0;                 // departures hall floor (the upper curb level)
const FP = 5.3;                 // pier / gate lounge floor (boarding bridge sill)
const EYE = 1.62, R = 0.3;      // eye height, body radius
const HALL = { x0: -130, x1: 130, z0: -688, z1: -556, top: 24.0 };
const WELL = { x0: -16, x1: 16, z0: -556, z1: -544 };
const PIER = { x0: -636, x1: 636, z0: -544, z1: -506, top: 15.2 };
const ISL = { z0: -664, z1: -620, xs: [-105, -70, -35, 35, 70, 105] };
const LANES = [-25, -15, -5, 5, 15, 25];
const SEC_Z = -589, FLAP_Z = -603, PASS_Z = -573;
const BELTS_X = [[40, 200], [220, 400], [420, 620]];
const BELTS_Z = [[-540.4, -538.8, 1], [-536.4, -534.8, -1]];     // z0, z1, +1: away from the centre
const LOUNGE_Z = -525;
const WALK_V = 1.6, RUN_V = 4.2, BELT_V = 1.2;
const JPF = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';
const STYLE = {
  jp: { bg: '#1c1e22', fg: '#ffffff', acc: '#f7c600', sub: '#c9ccd2', led: [1.0, 0.95, 0.86], floor: ['#d9d4ca', '#cfc9be'], wall: '#efece6', ceil: '#e9e4da' },
  intl: { bg: '#ffd200', fg: '#121212', acc: '#121212', sub: '#3a3a3a', led: [0.95, 0.97, 1.0], floor: ['#b9bcbf', '#adb0b4'], wall: '#f1f2f3', ceil: '#f4f5f6' },
};

// ------------------------------------------------------------------------------ light model
// Indoors the scene's sun and sky would light every surface as if there were no roof.  The
// interior materials use their own light instead: the ceiling lights, daylight from the
// glazed faces (landside wall of the hall, apron wall of the pier) falling off with the
// distance from the glass, sun patches cast through it (mullion shadows included), and contact
// shadows on the floor from a painted occlusion map.
export const TERM_U = {
  uTL: { value: new THREE.Vector4(1, 1, 0, 0) },          // ceiling light, daylight, night, -
  uTLed: { value: new THREE.Color(1, 0.95, 0.86) },
  uTSun: { value: new THREE.Vector4(0, 1, 0, 0) },        // towards the sun (world), strength
  uTAO: { value: null },
};
const TERM_VERT_PARS = 'varying vec3 vTP;';
const TERM_VERT = `
{
  vec4 tw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  tw = instanceMatrix * tw;
  #endif
  vTP = (modelMatrix * tw).xyz;
}`;
const TERM_FRAG_PARS = `
uniform vec4 uTL, uTSun;
uniform vec3 uTLed;
uniform sampler2D uTAO;
varying vec3 vTP;
float termFloor(vec3 p) { return p.z > -544.0 ? ${FP.toFixed(2)} : p.z < -556.0 ? ${FD.toFixed(2)} : mix(${FD.toFixed(2)}, ${FP.toFixed(2)}, clamp((p.z + 556.0) / 12.0, 0.0, 1.0)); }
// one glazed face: inward normal (xz), offset (n.p + d = distance inside), sill and head
// heights, extent along the face
vec3 termGlass(vec3 p, vec3 n, vec2 gn, float gd, float y0, float y1, float a0, float a1) {
  float dist = dot(gn, p.xz) + gd;
  if (dist < -0.3) return vec3(0.0);
  vec3 E = vec3(0.0);
  float near = exp(-max(dist, 0.0) / 13.0);
  float facing = 0.3 + 0.7 * max(dot(n, -vec3(gn.x, 0.0, gn.y)), 0.0);
  E += vec3(0.80, 0.88, 1.0) * uTL.y * 2.4 * near * facing;
  vec3 sd = uTSun.xyz;
  float c = -dot(sd.xz, gn);
  if (uTSun.w > 0.0 && c > 0.03 && dist > 0.0) {
    vec3 h = p + sd * (dist / c);
    float a = abs(gn.y) > 0.5 ? h.x : h.z;
    float m = fract(a / 3.0);
    float lit = step(y0, h.y) * step(h.y, y1) * step(a0, a) * step(a, a1)
              * smoothstep(0.0, 0.03, m) * smoothstep(1.0, 0.97, m) * (1.0 - 0.85 * step(abs(h.y - y0 - 4.2), 0.08));
    E += vec3(1.0, 0.95, 0.85) * uTSun.w * lit * max(dot(n, sd), 0.0);
  }
  return E;
}
vec3 termIrradiance(vec3 p, vec3 n) {
  float fl = termFloor(p);
  float top = p.z > -544.0 ? ${PIER.top.toFixed(2)} : ${HALL.top.toFixed(2)};
  float hgt = clamp((p.y - fl) / (top - fl), 0.0, 1.0);
  vec3 E = uTLed * uTL.x * (1.7 + 1.1 * n.y) * (0.9 + 0.25 * hgt);
  E += uTLed * uTL.x * 1.1 * max(-n.y, 0.0) * (0.6 + 0.4 * hgt);   // bounce from the floor, ceiling washers
  E += termGlass(p, n, vec2(0.0, 1.0), 688.0, ${FD.toFixed(2)}, ${HALL.top.toFixed(2)}, ${HALL.x0.toFixed(1)}, ${HALL.x1.toFixed(1)});
  E += termGlass(p, n, vec2(0.0, -1.0), -506.0, ${FP.toFixed(2)}, ${PIER.top.toFixed(2)}, ${PIER.x0.toFixed(1)}, ${PIER.x1.toFixed(1)});
  // contact shadows: the painted floor map, plus a soft darkening at the foot of every wall
  float ao = 1.0;
  if (p.y < fl + 0.08 && n.y > 0.5) {
    vec2 uv = vec2(-1.0);
    if (p.z < -556.0) uv = vec2((p.x + 130.0) / 260.0 * 0.5078, (p.z + 688.0) / 132.0 * 0.88);
    else if (p.z > -544.0) uv = vec2((p.x + 636.0) / 1272.0 * 0.9941, (536.0 + (p.z + 544.0) / 38.0 * 61.0) / 600.0);
    if (uv.x >= 0.0) ao = texture2D(uTAO, uv).r;
  }
  ao *= 1.0 - 0.3 * exp(-max(p.y - fl, 0.0) / 0.35) * (1.0 - abs(n.y));
  return E * ao;
}`;
const TERM_FRAG = `
#include <lights_fragment_end>
{
  reflectedLight.directDiffuse *= 0.0;
  reflectedLight.directSpecular *= 0.0;
  reflectedLight.indirectDiffuse *= 0.0;
  reflectedLight.indirectSpecular *= 0.35;
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  reflectedLight.indirectDiffuse += termIrradiance(vTP, nW) * BRDF_Lambert(material.diffuseColor);
}`;
function patchTerminal(m) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TERM_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERM_VERT_PARS)
      .replace('#include <project_vertex>', TERM_VERT + '\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERM_FRAG_PARS)
      .replace('#include <lights_fragment_end>', TERM_FRAG);
  };
  m.customProgramCacheKey = () => 'terminal-lit';
  m.needsUpdate = true;
  return m;
}

// The Blender shell has solid fill boxes behind its glass (W_Dark) and the hall's apron-side
// curtain wall crosses the stairwell between the hall and the pier: cut a hole there while the
// camera is inside.
export const TERM_CLIP = { uTClip: { value: 0 } };
export function patchShellClip(m) {
  if (!m || m.userData.termClip) return;
  m.userData.termClip = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTClip = TERM_CLIP.uTClip;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipP;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 cw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
  #endif
  vClipP = (modelMatrix * cw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTClip;\nvarying vec3 vClipP;')
      .replace('void main() {', `void main() {
  if (uTClip > 0.5 && abs(vClipP.x) < ${(WELL.x1 + 1).toFixed(1)} && vClipP.z > -551.0 && vClipP.z < -545.0 && vClipP.y > 0.4 && vClipP.y < 30.0) discard;`);
  };
  m.customProgramCacheKey = ((k) => () => (k ? k() : '') + '|tclip')(m.customProgramCacheKey?.bind(m));
  m.needsUpdate = true;
}

// --------------------------------------------------------------------------- mesh builder
// boxes and quads collected per material into one geometry each
class Geo {
  constructor() { this.b = {}; }
  _b(k) { return this.b[k] || (this.b[k] = { p: [], n: [], u: [] }); }
  // quad: corner o, edges a (u) and b (v); normal a x b; uv: world metres / s, or a rect
  quad(k, o, a, b, s = 1, rect = null) {
    const B = this._b(k);
    const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const P = [o, [o[0] + a[0], o[1] + a[1], o[2] + a[2]], [o[0] + a[0] + b[0], o[1] + a[1] + b[1], o[2] + a[2] + b[2]], [o[0] + b[0], o[1] + b[1], o[2] + b[2]]];
    let U;
    if (rect) { const [u0, v0, u1, v1] = rect; U = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]; } else U = [[0, 0], [la / s, 0], [la / s, lb / s], [0, lb / s]];
    for (const i of [0, 1, 2, 0, 2, 3]) { B.p.push(...P[i]); B.n.push(nx / nl, ny / nl, nz / nl); B.u.push(...U[i]); }
  }
  box(k, x0, y0, z0, x1, y1, z1, s = 1, o = {}) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    if (!o.nx) this.quad(k, [x0, y0, z0], [0, 0, dz], [0, dy, 0], s);
    if (!o.px) this.quad(k, [x1, y0, z1], [0, 0, -dz], [0, dy, 0], s);
    if (!o.nz) this.quad(k, [x1, y0, z0], [-dx, 0, 0], [0, dy, 0], s);
    if (!o.pz) this.quad(k, [x0, y0, z1], [dx, 0, 0], [0, dy, 0], s);
    if (!o.py) this.quad(k, [x0, y1, z1], [dx, 0, 0], [0, 0, -dz], s);
    if (o.ny) this.quad(k, [x0, y0, z0], [dx, 0, 0], [0, 0, dz], s);
  }
  // flat sign / screen facing one of the axis directions ('px', 'nx', 'pz', 'nz'), centred at
  // (x, y, z), w wide, h tall; uv: atlas rect.  Seen from the front, u runs to the viewer's right.
  panel(k, face, x, y, z, w, h, rect) {
    const hw = w / 2, hh = h / 2;
    if (face === 'pz') this.quad(k, [x - hw, y - hh, z], [w, 0, 0], [0, h, 0], 1, rect);
    else if (face === 'nz') this.quad(k, [x + hw, y - hh, z], [-w, 0, 0], [0, h, 0], 1, rect);
    else if (face === 'px') this.quad(k, [x, y - hh, z + hw], [0, 0, -w], [0, h, 0], 1, rect);
    else this.quad(k, [x, y - hh, z - hw], [0, 0, w], [0, h, 0], 1, rect);
  }
  geometry(k) {
    const B = this.b[k];
    if (!B || !B.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------- textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function noiseFill(c, rnd, amt, cell = 1) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
    const v = (rnd() - 0.5) * amt;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(x, y, cell, cell);
  }
}
// polished stone floor, 1.2 m tiles (texture: 2.4 m)
function floorTexture(S, rnd) {
  const c = canvas(512, 512), g = c.getContext('2d');
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    g.fillStyle = S.floor[(i + j) % 2]; g.fillRect(i * 256, j * 256, 256, 256);
    const gr = g.createLinearGradient(i * 256, j * 256, i * 256 + 256, j * 256 + 256);
    gr.addColorStop(0, `rgba(255,255,255,${0.04 + rnd() * 0.05})`); gr.addColorStop(1, `rgba(0,0,0,${0.03 + rnd() * 0.04})`);
    g.fillStyle = gr; g.fillRect(i * 256, j * 256, 256, 256);
  }
  noiseFill(c, rnd, 0.05, 2);
  // fine veins / speckle
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '60,60,60'},${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.fillStyle = 'rgba(90,90,90,0.28)';
  for (const p of [0, 256]) { g.fillRect(p, 0, 1.5, 512); g.fillRect(0, p, 512, 1.5); }
  return tex(c);
}
function carpetTexture(rnd, intl) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = intl ? '#3c4552' : '#4a5468'; g.fillRect(0, 0, 256, 256);
  noiseFill(c, rnd, 0.16, 1);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 6);
  return tex(c);
}
function woodTexture(rnd) {
  const c = canvas(512, 512), g = c.getContext('2d');
  // vertical slats 0.1 m wide on a 1 m texture, small dark gaps
  for (let i = 0; i < 10; i++) {
    const l = 0.85 + rnd() * 0.25;
    g.fillStyle = `rgb(${Math.round(178 * l)},${Math.round(132 * l)},${Math.round(88 * l)})`;
    g.fillRect(i * 51.2, 0, 51.2, 512);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(80,45,20,${0.04 + rnd() * 0.06})`; g.fillRect(i * 51.2 + rnd() * 50, 0, 1 + rnd() * 2, 512); }
    g.fillStyle = 'rgba(30,18,10,0.7)'; g.fillRect(i * 51.2 + 48, 0, 3.2, 512);
  }
  return tex(c);
}
function ceilingTexture(S) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = S.ceil; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 256; i += 64) { g.fillRect(i, 0, 2, 256); g.fillRect(0, i, 256, 2); }
  return tex(c);
}
function rollerTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, '#5e6368'); gr.addColorStop(0.5, '#d9dde0'); gr.addColorStop(1, '#5e6368'); g.fillStyle = gr; g.fillRect(0, y + 1, 64, 13); }
  return tex(c);
}
function goodsTexture(rnd) {
  // shop shelves: rows of boxes and bottles
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 512, 512);
  const cols = ['#c0392b', '#2c3e50', '#d4ac0d', '#7d3c98', '#1e8449', '#e67e22', '#2471a3', '#f5b7b1', '#a04000', '#17202a', '#f7dc6f', '#5dade2'];
  for (let row = 0; row < 4; row++) {
    const y0 = row * 128;
    g.fillStyle = '#b8b2a6'; g.fillRect(0, y0 + 118, 512, 10);
    let x = 4;
    while (x < 500) {
      const w = 14 + rnd() * 30, h = 40 + rnd() * 70;
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      if (rnd() < 0.4) { g.beginPath(); g.ellipse(x + w / 2, y0 + 118 - h * 0.85, w * 0.32, h * 0.12, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x + w * 0.2, y0 + 118 - h * 0.85, w * 0.6, h * 0.85); g.fillRect(x + w * 0.4, y0 + 118 - h, w * 0.2, h * 0.2); } else g.fillRect(x, y0 + 118 - h, w, h);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 2, y0 + 118 - h * 0.6, w * 0.3, 4);
      x += w + 3;
    }
  }
  return tex(c);
}

// ------------------------------------------------------------------------- sign atlas
class Atlas {
  constructor(W = 4096, H = 2048) {
    this.size = W; this.H = H; this.c = canvas(W, H); this.g = this.c.getContext('2d');
    this.x = 0; this.y = 0; this.row = 0;
  }
  alloc(w, h) {
    if (this.x + w > this.size) { this.x = 0; this.y += this.row + 2; this.row = 0; }
    const r = { x: this.x, y: this.y, w, h };
    this.x += w + 2; this.row = Math.max(this.row, h);
    const s = this.size, t = this.H;
    if (r.y + h > t) console.warn('terminal sign atlas full');
    r.uv = [(r.x + 0.5) / s, (r.y + 0.5) / t, (r.x + w - 0.5) / s, (r.y + h - 0.5) / t];
    return r;
  }
}
function pict(g, kind, x, y, s, col) {
  g.save(); g.translate(x + s / 2, y + s / 2); g.scale(s / 100, s / 100);
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  const person = (px, py, k = 1) => { g.beginPath(); g.arc(px, py - 30 * k, 9 * k, 0, 7); g.fill(); g.fillRect(px - 9 * k, py - 18 * k, 18 * k, 34 * k); g.fillRect(px - 9 * k, py + 14 * k, 7 * k, 30 * k); g.fillRect(px + 2 * k, py + 14 * k, 7 * k, 30 * k); };
  if (kind === 'plane' || kind === 'arr') {
    g.rotate(kind === 'arr' ? 0.5 : -0.5);
    g.beginPath();
    g.moveTo(-44, -5); g.lineTo(30, -5); g.quadraticCurveTo(46, 0, 30, 5); g.lineTo(-44, 5); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-4, -4); g.lineTo(-22, -40); g.lineTo(-12, -40); g.lineTo(16, -4); g.fill();
    g.beginPath(); g.moveTo(-4, 4); g.lineTo(-22, 40); g.lineTo(-12, 40); g.lineTo(16, 4); g.fill();
    g.beginPath(); g.moveTo(-36, -4); g.lineTo(-46, -20); g.lineTo(-40, -20); g.lineTo(-28, -4); g.fill();
    g.beginPath(); g.moveTo(-36, 4); g.lineTo(-46, 20); g.lineTo(-40, 20); g.lineTo(-28, 4); g.fill();
  } else if (kind === 'sec') {
    g.strokeRect(-30, -44, 60, 92); person(0, 0, 0.85);
  } else if (kind === 'pass') {
    g.fillRect(-28, -40, 56, 80); g.fillStyle = '#00000000';
    g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 6; g.beginPath(); g.arc(0, -6, 14, 0, 7); g.stroke(); g.fillRect(-14, 22, 28, 6); g.restore();
  } else if (kind === 'wc') {
    person(-22, 0, 0.9);
    g.beginPath(); g.arc(22, -27, 8, 0, 7); g.fill(); g.beginPath(); g.moveTo(22, -16); g.lineTo(38, 16); g.lineTo(6, 16); g.fill(); g.fillRect(14, 16, 6, 26); g.fillRect(24, 16, 6, 26);
    g.fillRect(-2, -44, 4, 88);
  } else if (kind === 'shop') {
    g.fillRect(-30, -14, 60, 52); g.lineWidth = 7; g.beginPath(); g.arc(0, -16, 16, Math.PI, 0); g.stroke();
  } else if (kind === 'cafe') {
    g.fillRect(-30, -12, 46, 40); g.lineWidth = 7; g.beginPath(); g.arc(18, 6, 12, -1.4, 1.4); g.stroke(); g.fillRect(-36, 32, 64, 6);
    for (const xx of [-18, -4]) { g.beginPath(); g.moveTo(xx, -22); g.quadraticCurveTo(xx + 6, -30, xx, -40); g.stroke(); }
  } else if (kind === 'checkin') {
    g.fillRect(-40, 8, 80, 10); g.fillRect(-34, 18, 68, 26); person(-8, -14, 0.7); g.fillRect(16, -12, 22, 20);
  } else if (kind === 'gate') {
    g.fillRect(-36, -44, 8, 88); g.fillRect(28, -44, 8, 88); g.fillRect(-36, -44, 72, 8); person(0, 6, 0.75);
  } else if (kind === 'lift') {
    g.strokeRect(-34, -44, 68, 88); g.beginPath(); g.moveTo(-16, -6); g.lineTo(-4, -24); g.lineTo(8, -6); g.fill(); g.beginPath(); g.moveTo(-16, 8); g.lineTo(-4, 26); g.lineTo(8, 8); g.fill();
  }
  g.restore();
}
function arrow(g, dir, x, y, s, col) {
  g.save(); g.translate(x + s / 2, y + s / 2);
  g.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2, upright: Math.PI / 4, upleft: -Math.PI / 4 }[dir] || 0);
  g.fillStyle = col; g.beginPath();
  const k = s / 100;
  g.moveTo(0, -44 * k); g.lineTo(40 * k, 0); g.lineTo(14 * k, 0); g.lineTo(14 * k, 44 * k); g.lineTo(-14 * k, 44 * k); g.lineTo(-14 * k, 0); g.lineTo(-40 * k, 0); g.closePath(); g.fill();
  g.restore();
}
function fitText(g, text, maxW, px, weight = 700) {
  let p = px;
  g.font = `${weight} ${p}px ${JPF}`;
  while (g.measureText(text).width > maxW && p > 8) { p *= 0.92; g.font = `${weight} ${p}px ${JPF}`; }
  return p;
}

// --------------------------------------------------------------------------------- crowd
// passengers / staff: the articulated person of arff.glb as instanced parts, one draw call
// per part and material (shirt / trousers / hair / skin colours per instance)
class Crowd {
  constructor(person, N, patch) {
    this.group = new THREE.Group();
    this.N = N; this.n = 0;
    this.parts = [];
    const mats = {};
    for (const node of person.children) {
      const m = /_(Body|ArmL|ArmR|LegL|LegR)$/.exec(node.name);
      if (!m) continue;
      const base = new THREE.Matrix4().compose(node.position, node.quaternion, node.scale);
      const meshes = [];
      node.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      node.traverse((o) => {
        if (!o.isMesh) return;
        const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const geo = o.geometry.clone().applyMatrix4(local);
        const src = o.material;
        let mat = mats[src.name];
        if (!mat) {
          mat = mats[src.name] = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: src.roughness ?? 0.7, metalness: 0 }));
          mat.userData.base = src.color.clone();
        }
        const im = new THREE.InstancedMesh(geo, mat, N);
        im.count = 0; im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(im);
        meshes.push({ im, name: src.name });
      });
      this.parts.push({ kind: m[1], base, meshes });
    }
    this._m = new THREE.Matrix4(); this._p = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
  }
  add(colors) {
    if (this.n >= this.N) return -1;
    const i = this.n++;
    for (const P of this.parts) for (const M of P.meshes) {
      const col = colors[M.name] || M.im.material.userData.base;
      M.im.setColorAt(i, this._c.set(col));
      M.im.count = this.n;
      if (M.im.instanceColor) M.im.instanceColor.needsUpdate = true;
    }
    return i;
  }
  pose(i, x, y, z, a, swing = 0, scale = 1) {
    this._q.setFromAxisAngle(this._v.set(0, 1, 0), -a);
    this._p.compose(this._v.set(x, y, z), this._q, this._s.set(scale, scale, scale));
    for (const P of this.parts) {
      let rz = 0;
      if (P.kind === 'LegL') rz = swing; else if (P.kind === 'LegR') rz = -swing;
      else if (P.kind === 'ArmL') rz = -swing * 0.8; else if (P.kind === 'ArmR') rz = swing * 0.8;
      this._m.multiplyMatrices(this._p, P.base);
      if (rz) this._m.multiply(this._r.makeRotationZ(rz));
      for (const M of P.meshes) { M.im.setMatrixAt(i, this._m); M.im.instanceMatrix.needsUpdate = true; }
    }
  }
  dispose() { for (const P of this.parts) for (const M of P.meshes) M.im.geometry.dispose(); }
}
const SHIRTS = ['#2d4a7a', '#b8423a', '#f2f2f0', '#2f6b4f', '#1d1f24', '#7a5c9e', '#d9a441', '#4f7fa8', '#8c8f94', '#c46d8e', '#3c7d86', '#e7ddc9', '#5a3b2e', '#243a5e'];
const PANTS = ['#1f2533', '#2b2d31', '#3a4a66', '#5c4a3a', '#6f6a60', '#22324a', '#111214', '#c9b79c'];
const HAIR = ['#141110', '#1c1a1a', '#0f0d0c', '#2b1d14', '#3a2a1e', '#5e4330', '#7a5a3a', '#b89a6a', '#8f8f8f'];
const SKIN = ['#f1c9a5', '#e0b896', '#c99a74', '#a8764f', '#7d5537', '#f5d7bd'];

// ------------------------------------------------------------------------------ terminal
export class Terminal {
  constructor(app) {
    this.app = app;
    this.group = null;
    this.style = null;
    this.active = false;
    this.p = { x: 10, z: -684, y: FD };
    this.prog = {};
    this.hud = null;
    this._boardT = 0; this._fidsT = 99; this._lang = 0;
  }

  get W() { return this.app.worldData; }
  stands() { return (this.W?.stands || []).slice(0, 14); }

  // the terminal can be walked when the aircraft is at the home airport
  available() {
    const f = this.app.fm?.pos;
    return !!f && !!this.W?.stands?.length && Math.hypot(f.x, f.z + 600) < 4000;
  }

  // your flight: airline, number, destination, gate (the stand the aircraft is on), seat, times
  _flight() {
    const A = this.app, f = A.fm.pos;
    let st = null, best = 70;
    for (const s of this.stands()) { const d = Math.hypot(s.cg[0] - f.x, s.cg[2] - f.z); if (d < best) { best = d; st = s; } }
    const logo = logoById(A.livery?.logo);
    const num = ((A.playerCallsign || '').match(/\d+/) || [String(100 + Math.floor(Math.random() * 800))])[0];
    const dap = remoteById(A.dest) || REMOTES[0];
    const C = A.meta?.cabin, seat = C && C.mySeat != null ? C.seats[C.mySeat] : null;
    const now = A.fids?.clock?.() ?? (A.world?.tod || 12) * 3600;
    const dep = this.flight?.dep ?? Math.ceil((now + 1800) / 300) * 300;
    return { logo, code: logo.code || 'JL', num, flight: `${logo.code || 'JL'} ${num}`, dest: aptName(dap.id), gate: st ? st.id : 7, stand: st || this.stands()[6],
      atGate: !!st, seat: seat ? `${seat.r}${seat.l}` : '23A', cls: seat ? seat.c : 'Y', dep, board: dep - 1500 };
  }

  setStyle(s) {
    s = s === 'intl' ? 'intl' : 'jp';
    if (s === this.style && this.group) return;
    const keep = this.group && this.active;
    this.style = s;
    if (this.group) this._dispose();
    if (keep) { this._build(); this._refreshHud(); }
  }

  // into the terminal: fresh = back at the entrance with nothing done yet
  enter(fresh = false) {
    if (!this.style) this.style = 'jp';
    if (fresh) this.flight = null;
    this.flight = this._flight();
    if (!this.group || this.group.userData.gate !== this.flight.gate) { if (this.group) this._dispose(); this._build(); }
    if (fresh || !this.started) {
      this.started = true;
      this.p = { x: 10, z: -684.5, y: FD };
      this.prog = { checkin: false, bag: 0, scan: false, security: false, passport: false };
      this._bars();
      this.app.rig.yaw = 0; this.app.rig.pitch = 0;
      this._announce(this.style === 'intl' ? `Welcome to ${AIRPORT.name}. Please proceed to check-in island D.` : `${AIRPORT.name}空港へようこそ。チェックインは D カウンターへお進みください`);
    }
    this.active = true;
    this.group.visible = true;
    TERM_CLIP.uTClip.value = 1;
    this._hud(true);
  }

  leave() {
    if (!this.active) return;
    this.active = false;
    if (this.group) this.group.visible = false;
    TERM_CLIP.uTClip.value = 0;
    this._hud(false);
    this._amb(false);
  }

  // ------------------------------------------------------------------------------ building
  _build() {
    const S = STYLE[this.style], intl = this.style === 'intl';
    const rnd = mulberry32(this.style === 'intl' ? 77 : 41);
    const G = new Geo();
    this.solid = []; this.aoRects = []; this.belts = []; this.acts = [];
    this.anim = { bags: [], flaps: [] };
    const solid = (x0, z0, x1, z1, ao = 0.5) => { this.solid.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); if (ao) this.aoRects.push([x0, z0, x1, z1, ao]); };
    const ao = (x0, z0, x1, z1, k = 0.4) => this.aoRects.push([x0, z0, x1, z1, k]);
    const atlas = this.atlas = new Atlas(4096, 2048);
    const signCache = new Map();
    const ag = atlas.g;
    const F = this.flight;
    // ---- signs
    const sign = (w, h, o) => {
      const key = w + 'x' + h + JSON.stringify(o);
      if (signCache.has(key)) return signCache.get(key);
      const r = atlas.alloc(w, h);
      signCache.set(key, r.uv);
      ag.save(); ag.beginPath(); ag.rect(r.x, r.y, w, h); ag.clip();
      ag.fillStyle = o.bg || S.bg; ag.fillRect(r.x, r.y, w, h);
      const fg = o.fg || S.fg, pad = h * 0.12;
      let x = r.x + pad, x1 = r.x + w - pad;
      const s = h - pad * 2;
      if (o.arrowL) { arrow(ag, o.arrowL, x, r.y + pad, s, o.accent || (o.bg ? fg : S.acc)); x += s + pad; }
      if (o.arrowR) { arrow(ag, o.arrowR, x1 - s, r.y + pad, s, o.accent || (o.bg ? fg : S.acc)); x1 -= s + pad; }
      if (o.pict) { ag.fillStyle = fg; pict(ag, o.pict, x, r.y + pad, s, fg); x += s + pad * 1.4; }
      if (o.big) {
        ag.fillStyle = o.bigCol || (o.bg ? fg : S.acc);
        const solo = o.center && !o.jp && !o.en;
        const p = fitText(ag, o.big, solo ? x1 - x : Math.min(x1 - x, s * 1.6), s * 0.95, 800);
        ag.textBaseline = 'middle'; ag.textAlign = solo ? 'center' : 'left';
        ag.fillText(o.big, solo ? (x + x1) / 2 : x, r.y + h / 2 + p * 0.04);
        x += ag.measureText(o.big).width + pad * 1.4;
      }
      const main = intl ? (o.en ?? o.jp) : (o.jp ?? o.en), sub = intl ? (o.en ? o.jp : null) : (o.jp ? o.en : null);
      ag.textAlign = o.center ? 'center' : 'left';
      const cx = o.center ? (x + x1) / 2 : x;
      if (main) {
        ag.fillStyle = fg; ag.textBaseline = 'middle';
        fitText(ag, main, x1 - x, s * (sub ? 0.56 : 0.72));
        ag.fillText(main, cx, r.y + pad + s * (sub ? 0.32 : 0.5));
      }
      if (sub) {
        ag.fillStyle = o.bg ? fg : S.sub; ag.globalAlpha = o.bg ? 0.8 : 1;
        fitText(ag, sub, x1 - x, s * 0.3, 600);
        ag.fillText(sub, cx, r.y + pad + s * 0.8);
        ag.globalAlpha = 1;
      }
      ag.restore();
      return r.uv;
    };
    const logoCanvas = (lg) => { const c = canvas(128, 128); drawLogoIcon(c, lg); return c; };
    // ---- materials (keys)
    const T = this.tex = {
      floor: floorTexture(S, rnd), carpet: carpetTexture(rnd, intl), wood: woodTexture(rnd), ceil: ceilingTexture(S),
      roller: rollerTexture(), goods: goodsTexture(rnd),
    };
    T.floor.repeat.set(1, 1);
    // ======================================================== shell
    const H = HALL;
    // floors (uv: metres / tile)
    G.quad('floor', [H.x0, FD, H.z1], [H.x1 - H.x0, 0, 0], [0, 0, H.z0 - H.z1], 2.4);
    G.quad('floor', [PIER.x0, FP, LOUNGE_Z], [PIER.x1 - PIER.x0, 0, 0], [0, 0, PIER.z0 - LOUNGE_Z], 2.4);
    G.quad('carpet', [PIER.x0, FP, PIER.z1], [PIER.x1 - PIER.x0, 0, 0], [0, 0, LOUNGE_Z - PIER.z1], 1.0);
    // ceilings
    G.quad('ceil', [H.x0, H.top, H.z0], [H.x1 - H.x0, 0, 0], [0, 0, WELL.z1 - H.z0], 4);
    G.quad('ceil', [PIER.x0, PIER.top, PIER.z0], [PIER.x1 - PIER.x0, 0, 0], [0, 0, PIER.z1 - PIER.z0], 4);
    G.quad('wall', [WELL.x1, PIER.top, WELL.z1], [WELL.x0 - WELL.x1, 0, 0], [0, H.top - PIER.top, 0], 2);
    // ceiling light lines
    for (let z = H.z0 + 8; z < WELL.z1; z += 8) G.quad('light', [H.x0 + 4, H.top - 0.03, z - 0.18], [H.x1 - H.x0 - 8, 0, 0], [0, 0, 0.36]);
    for (let z = PIER.z0 + 3; z < PIER.z1; z += 6) G.quad('light', [PIER.x0 + 3, PIER.top - 0.03, z - 0.15], [PIER.x1 - PIER.x0 - 6, 0, 0], [0, 0, 0.3]);
    // hall landside glazing with mullions, transom and the entrance doors
    G.quad('glass', [H.x0, FD, H.z0], [H.x1 - H.x0, 0, 0], [0, H.top - FD, 0]);
    for (let x = H.x0; x <= H.x1; x += 3) G.box('metal', x - 0.06, FD, H.z0 - 0.1, x + 0.06, H.top, H.z0 + 0.12);
    for (const y of [FD + 4.2, FD + 10]) G.box('metal', H.x0, y - 0.08, H.z0 - 0.1, H.x1, y + 0.08, H.z0 + 0.14);
    for (const xd of [-110, -50, 10, 70]) {
      G.box('dmetal', xd - 2.0, FD + 3.0, H.z0 + 0.1, xd + 2.0, FD + 3.5, H.z0 + 0.5);
      const r = sign(512, 96, { jp: '出発ロビー', en: 'Departures', pict: 'plane' });
      G.panel('sign', 'pz', xd, FD + 3.25, H.z0 + 0.52, 2.6, 0.48, r);
    }
    solid(H.x0, H.z0 - 2, H.x1, H.z0 + 0.15, 0.5);
    // side walls, back wall (with the stairwell opening), stairwell walls, pier walls
    const wallK = intl ? 'wall' : 'wood';
    G.quad(wallK, [H.x0, FD, H.z1], [0, 0, H.z0 - H.z1], [0, H.top - FD, 0], 1);
    G.quad(wallK, [H.x1, FD, H.z0], [0, 0, H.z1 - H.z0], [0, H.top - FD, 0], 1);
    solid(H.x0 - 2, H.z0, H.x0 + 0.1, H.z1, 0.5); solid(H.x1 - 0.1, H.z0, H.x1 + 2, H.z1, 0.5);
    for (const [a, b] of [[H.x0, WELL.x0], [WELL.x1, H.x1]]) {
      G.quad('wall', [b, FD, H.z1], [a - b, 0, 0], [0, H.top - FD, 0], 2);
      solid(a, H.z1 - 0.1, b, H.z1 + 2, 0.5);
      G.quad('wall', [a, FP, PIER.z0], [b - a, 0, 0], [0, PIER.top - FP, 0], 2);
    }
    // the pier's landside wall away from the hall (|x| > hall)
    for (const [a, b] of [[PIER.x0, H.x0], [H.x1, PIER.x1]]) G.quad(wallK, [a, FP, PIER.z0], [b - a, 0, 0], [0, PIER.top - FP, 0], 1);
    solid(PIER.x0, PIER.z0 - 12, WELL.x0, PIER.z0 + 0.1, 0.5); solid(WELL.x1, PIER.z0 - 12, PIER.x1, PIER.z0 + 0.1, 0.5);
    G.quad('wall', [WELL.x0, FP, WELL.z1], [0, 0, WELL.z0 - WELL.z1], [0, H.top - FP, 0], 2);
    G.quad('wall', [WELL.x1, FP, WELL.z0], [0, 0, WELL.z1 - WELL.z0], [0, H.top - FP, 0], 2);
    solid(WELL.x0 - 2, WELL.z0, WELL.x0 + 0.1, WELL.z1, 0); solid(WELL.x1 - 0.1, WELL.z0, WELL.x1 + 2, WELL.z1, 0);
    G.quad('wall', [PIER.x0, FP, PIER.z1], [0, 0, PIER.z0 - PIER.z1], [0, PIER.top - FP, 0], 2);
    G.quad('wall', [PIER.x1, FP, PIER.z0], [0, 0, PIER.z1 - PIER.z0], [0, PIER.top - FP, 0], 2);
    solid(PIER.x0 - 2, PIER.z0, PIER.x0 + 0.1, PIER.z1, 0.5); solid(PIER.x1 - 0.1, PIER.z0, PIER.x1 + 2, PIER.z1, 0.5);
    // stairs and escalators down to the pier
    const nSt = 23, run = (WELL.z1 - WELL.z0) / nSt, rise = (FD - FP) / nSt;
    for (let i = 0; i < nSt; i++) {
      const y = FD - (i + 1) * rise, z = WELL.z0 + i * run;
      G.box('stone', -11, y, z, 11, y + rise, z + run, 1);
      G.box('rubber', -11, y + rise - 0.004, z, 11, y + rise + 0.006, z + 0.09, 1);           // step nosing
    }
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -15.6 : 12, x1 = s < 0 ? -12 : 15.6;
      const dz = WELL.z1 - WELL.z0, dy = FP - FD;
      G.quad('rubber', [x0, FD + 0.02, WELL.z0], [0, dy, dz], [x1 - x0, 0, 0]);
      for (const xe of [x0, x1 - 0.1]) {
        G.quad('glass', [xe + 0.05, FD, WELL.z0], [0, dy, dz], [0, 1.0, 0]);
        G.quad('glass', [xe + 0.05, FD, WELL.z0], [0, 1.0, 0], [0, dy, dz]);
        G.quad('rubber', [xe, FD + 1.0, WELL.z0], [0, dy, dz], [0.1, 0, 0]);
        G.box('rubber', xe, FD + 0.95, WELL.z0 - 1.2, xe + 0.1, FD + 1.05, WELL.z0, 1);          // newel: handrail, glass, skirt
        G.box('glass', xe + 0.03, FD + 0.15, WELL.z0 - 1.2, xe + 0.07, FD + 0.95, WELL.z0, 1);
        G.box('metal', xe - 0.02, FD, WELL.z0 - 1.25, xe + 0.12, FD + 0.15, WELL.z0, 1);
        solid(xe - 0.02, WELL.z0 - 1.25, xe + 0.12, WELL.z0, 0.2);
        solid(xe, WELL.z0, xe + 0.1, WELL.z1, 0);
      }
      G.box('metal', x0 - 0.15, FD - 0.3, WELL.z0 - 1.4, x1 + 0.15, FD + 0.02, WELL.z0 + 0.4, 1);
    }
    // glass balustrade along the top of the stairwell is open: it is the way down
    // pier apron glazing, mullions, door frames at every boarding gate
    const doors = this.stands().map((s) => s.x - 14);
    let gx = PIER.x0;
    const glassSeg = (a, b) => { if (b - a > 0.05) G.quad('glass', [b, FP, PIER.z1], [a - b, 0, 0], [0, PIER.top - FP, 0]); };
    for (const d of [...doors].sort((a, b) => a - b)) { glassSeg(gx, d - 1.6); gx = d + 1.6; }
    glassSeg(gx, PIER.x1);
    for (let x = PIER.x0; x <= PIER.x1; x += 3) if (!doors.some((d) => Math.abs(x - d) < 1.8)) G.box('metal', x - 0.06, FP, PIER.z1 - 0.12, x + 0.06, PIER.top, PIER.z1 + 0.1);
    for (const y of [FP + 4.2]) G.box('metal', PIER.x0, y - 0.07, PIER.z1 - 0.14, PIER.x1, y + 0.07, PIER.z1 + 0.1);
    G.box('metal', PIER.x0, FP, PIER.z1 - 0.2, PIER.x1, FP + 0.12, PIER.z1, 1, { py: false });
    solid(PIER.x0, PIER.z1 - 0.12, PIER.x1, PIER.z1 + 2, 0.45);

    // ======================================================== check-in islands
    const others = LOGOS.filter((l) => l.id !== F.logo.id);
    const isl = ISL.xs.map((cx, i) => ({ cx, idx: i, letter: 'ABCDEF'[i], logo: i === 3 ? F.logo : others[(i < 3 ? i : i - 1) % others.length] }));
    this.island = isl[3];
    for (const I of isl) {
      const { cx } = I, z0 = ISL.z0, z1 = ISL.z1;
      // core wall with the airline band and the island header
      G.box(intl ? 'wall' : 'wood', cx - 0.3, FD, z0 + 1, cx + 0.3, FD + 3.2, z1 - 1, 1);
      solid(cx - 0.3, z0 + 1, cx + 0.3, z1 - 1, 0.3);
      const lc = logoCanvas(I.logo);
      const band = atlas.alloc(512, 96);
      ag.fillStyle = '#f7f7f5'; ag.fillRect(band.x, band.y, 512, 96);
      ag.drawImage(lc, band.x + 10, band.y + 8, 80, 80);
      ag.fillStyle = I.logo.colors.brand || '#223f9a';
      fitText(ag, I.logo.name, 400, 48, 800); ag.textBaseline = 'middle'; ag.textAlign = 'left';
      ag.fillText(I.logo.name, band.x + 104, band.y + 50);
      for (let z = z0 + 3; z < z1 - 3; z += 8) {
        G.panel('sign', 'px', cx + 0.31, FD + 2.65, z + 2, 4.6, 0.86, band.uv);
        G.panel('sign', 'nx', cx - 0.31, FD + 2.65, z + 2, 4.6, 0.86, band.uv);
      }
      const head = sign(640, 160, { big: I.letter, jp: I.logo.name, en: intl ? 'Check-in · Bag Drop' : 'チェックイン Check-in', bigCol: S.acc });
      G.box('dmetal', cx - 3.2, FD + 3.7, z0 - 0.15, cx + 3.2, FD + 5.3, z0 + 0.15, 1);
      G.panel('sign', 'nz', cx, FD + 4.5, z0 - 0.16, 6.2, 1.55, head);
      G.panel('sign', 'pz', cx, FD + 4.5, z0 + 0.16, 6.2, 1.55, head);
      G.box('metal', cx - 0.05, FD + 3.2, z0 - 0.05, cx + 0.05, FD + 3.7, z0 + 0.05);
      // counters on both faces (customer side outwards), bag scales between them, staff
      for (const s of [-1, 1]) {
        const xo = cx + s * 3.4, xi = cx + s * 2.6;
        const a = Math.min(xo, xi), b = Math.max(xo, xi);
        G.box('rubber', Math.min(cx + s * 1.0, cx + s * 0.3), FD, z0 + 1.6, Math.max(cx + s * 1.0, cx + s * 0.3), FD + 0.55, z1 - 1.6, 1);
        for (let z = z0 + 2; z + 2.6 <= z1 - 1.6; z += 2.6) {
          G.box('counter', a, FD, z, b, FD + 1.05, z + 1.8, 1);
          G.box('dmetal', a + (s < 0 ? -0.02 : 0.02), FD, z - 0.01, b + (s < 0 ? -0.02 : 0.02), FD + 0.12, z + 1.81, 1);
          G.box('dmetal', cx + s * 2.8 - 0.03, FD + 1.05, z + 0.78, cx + s * 2.8 + 0.03, FD + 1.18, z + 0.82, 1);     // monitor on its stem
          G.box('dmetal', cx + s * 2.8 - 0.025, FD + 1.18, z + 0.6, cx + s * 2.8 + 0.025, FD + 1.48, z + 1.0, 1);
          G.box('brand' + I.idx, a + (s < 0 ? -0.025 : 0.775), FD + 0.14, z + 0.05, a + (s < 0 ? 0.025 : 0.825), FD + 0.3, z + 1.75, 1);
          G.box('metal', a, FD, z + 1.85, b, FD + 0.28, z + 2.55, 1);                                                  // bag scale
          G.box('rubber', a + 0.05, FD + 0.28, z + 1.9, b - 0.05, FD + 0.3, z + 2.5, 1);
          const r = sign(128, 64, { big: String(Math.round((z - z0) / 2.6) + (s > 0 ? 20 : 1)).padStart(2, '0'), bigCol: S.fg, center: true });
          G.panel('sign', s < 0 ? 'nx' : 'px', xo + s * 0.01, FD + 0.86, z + 0.9, 0.5, 0.25, r);
        }
        // closing walls at the island ends (staff area)
        for (const ze of [z0 + 1.6, z1 - 1.8]) G.box('counter', cx - 2.6, FD, ze, cx + 2.6, FD + 1.05, ze + 0.2, 1);
      }
      solid(cx - 3.4, z0 + 1.6, cx + 3.4, z1 - 1.6, 0.55);
      // check-in machines at the front of the island
      const kiosk = sign(192, 256, { bg: '#0b3d91', fg: '#ffffff', jp: intl ? 'セルフ' : '自動チェックイン', en: intl ? 'Self check-in' : 'Check-in', pict: null });
      const nk = intl ? 5 : 3;
      for (let k = 0; k < nk; k++) {
        const kx = cx - (nk - 1) * 0.65 + k * 1.3, kz = z0 - 0.7;
        G.box('counter', kx - 0.32, FD, kz - 0.25, kx + 0.32, FD + 1.05, kz + 0.25, 1);
        G.box('dmetal', kx - 0.3, FD + 1.05, kz - 0.2, kx + 0.3, FD + 1.5, kz + 0.1, 1);
        G.panel('sign', 'nz', kx, FD + 1.28, kz - 0.21, 0.5, 0.4, kiosk);
        solid(kx - 0.32, kz - 0.25, kx + 0.32, kz + 0.25, 0.4);
      }
    }
    // your counter: island D, west face, first desk; the bag goes onto the scale beside it
    {
      const I = isl[3], z = ISL.z0 + 2;
      this.ckPos = { x: I.cx - 4.0, z: z + 0.9 };
      this.ckBag = { x: I.cx - 3.0, y: FD + 0.3, z: z + 2.2 };
      this.acts.push({ id: 'checkin', x: this.ckPos.x, z: this.ckPos.z, r: 1.7,
        label: () => intl ? 'Check in & drop your bag チェックイン' : 'チェックインする Check in', ok: () => !this.prog.checkin, act: () => this._checkin() });
    }
    // departure boards facing the entrance
    this.boardC = canvas(1024, 576);
    for (const bx of [-9, 9]) {
      G.box('dmetal', bx - 6.6, FD + 3.6, -676.3, bx + 6.6, FD + 7.6, -675.9, 1);
      G.quad('board', [bx + 6.4, FD + 3.75, -676.32], [-12.8, 0, 0], [0, 3.85, 0], 1, [0, 0, 1, 1]);
      G.box('metal', bx - 0.05, FD + 7.6, -676.15, bx + 0.05, H.top, -676.05);
    }
    // ======================================================== security checkpoint
    {
      const r = sign(900, 150, { jp: '保安検査場', en: 'Security Checkpoint', pict: 'sec' });
      G.box('dmetal', -15, FD + 4.4, -612.2, 15, FD + 6.1, -611.8, 1);
      G.panel('sign', 'nz', 0, FD + 5.25, -612.22, 14.4, 1.55, r);
      G.panel('sign', 'pz', 0, FD + 5.25, -611.78, 14.4, 1.55, sign(900, 150, { jp: '出発ロビー', en: 'Departure Lobby', pict: 'checkin' }));
      for (const x of [-12, 12]) G.box('metal', x - 0.05, FD + 6.1, -612.05, x + 0.05, H.top, -611.95);
      // queue stanchions (serpentine)
      for (let row = 0; row < 3; row++) {
        const z = -611 + row * 2.6;
        for (let x = -32; x <= 32; x += 4) {
          G.box('metal', x - 0.04, FD, z - 0.04, x + 0.04, FD + 0.98, z + 0.04, 1);
          if (x < 32 && !((row % 2 === 0 && x === 28) || (row % 2 === 1 && x === -32))) G.box('belt', x, FD + 0.9, z - 0.015, x + 4, FD + 0.96, z + 0.015, 1);
        }
        ao(-32, z - 0.1, 32, z + 0.1, 0.25);
      }
      // the partition with the lanes in it (frosted glass, 2.4 m)
      const segs = [];
      let x = H.x0;
      for (const lx of LANES) { segs.push([x, lx - 1.6]); segs.push([lx - 0.5, lx]); x = lx + 1.15; }
      segs.push([x, H.x1]);
      for (const [a, b] of segs) {
        if (b - a < 0.02) continue;
        G.box('frost', a, FD, SEC_Z - 0.06, b, FD + 2.4, SEC_Z + 0.06, 1);
        G.box('metal', a, FD + 2.4, SEC_Z - 0.08, b, FD + 2.5, SEC_Z + 0.08, 1);
        solid(a, SEC_Z - 0.08, b, SEC_Z + 0.08, 0.35);
      }
      LANES.forEach((lx, li) => {
        // boarding pass gate
        for (const [a, b] of [[lx - 0.5, lx + 0.1], [lx + 1.0, lx + 1.5]]) {
          G.box('counter', a, FD, FLAP_Z - 0.35, b, FD + 1.0, FLAP_Z + 0.35, 1);
          G.box('dmetal', a + 0.05, FD + 1.0, FLAP_Z - 0.3, b - 0.05, FD + 1.04, FLAP_Z + 0.3, 1);
          solid(a, FLAP_Z - 0.35, b, FLAP_Z + 0.35, 0.4);
        }
        const flap = { x0: lx + 0.1, x1: lx + 1.0, z: FLAP_Z, open: 0, want: 0, lane: li, kind: 'pass' };
        this.anim.flaps.push(flap);
        // X-ray: tables, the body with its tunnel, lead curtains
        G.box('metal', lx - 1.6, FD, -600, lx - 0.4, FD + 0.78, -593.5, 1);
        G.quad('roller', [lx - 1.6, FD + 0.785, -593.5], [1.2, 0, 0], [0, 0, -6.5], 0.25);
        G.box('metal', lx - 1.6, FD, -584.5, lx - 0.4, FD + 0.78, -578, 1);
        G.quad('roller', [lx - 1.6, FD + 0.785, -578], [1.2, 0, 0], [0, 0, -6.5], 0.25);
        G.box('xray', lx - 1.7, FD, -593.5, lx - 0.3, FD + 0.8, -584.5, 1);
        G.box('xray', lx - 1.7, FD + 0.8, -593.5, lx - 1.5, FD + 1.55, -584.5, 1);
        G.box('xray', lx - 0.5, FD + 0.8, -593.5, lx - 0.3, FD + 1.55, -584.5, 1);
        G.box('xray', lx - 1.7, FD + 1.55, -593.5, lx - 0.3, FD + 2.0, -584.5, 1);
        G.box('rubber', lx - 1.5, FD + 0.8, -593.5, lx - 0.5, FD + 0.82, -584.5, 1);
        for (const zc of [-593.52, -584.48]) G.quad('rubber', [lx - 1.5, FD + 0.82, zc], [1.0, 0, 0], [0, 0.73, 0]);
        G.box('dmetal', lx - 2.4, FD + 1.0, -587.4, lx - 1.8, FD + 1.45, -587.0, 1);        // operator screen
        for (let k = 0; k < 4; k++) G.box('tray', lx - 1.45, FD + 0.78 + k * 0.07, -599.6, lx - 0.55, FD + 0.84 + k * 0.07, -599.0, 1);
        solid(lx - 1.7, -600, lx - 0.3, -578, 0.5);
        // walk-through metal detector (Japan) or body scanner (overseas)
        if (!intl) {
          G.box('xray', lx - 0.15, FD, SEC_Z - 0.4, lx + 0.02, FD + 2.1, SEC_Z + 0.4, 1);
          G.box('xray', lx + 0.98, FD, SEC_Z - 0.4, lx + 1.15, FD + 2.1, SEC_Z + 0.4, 1);
          G.box('dmetal', lx - 0.15, FD + 2.1, SEC_Z - 0.4, lx + 1.15, FD + 2.35, SEC_Z + 0.4, 1);
          for (const xs of [lx + 0.03, lx + 0.95]) G.box('dmetal', xs - 0.01, FD + 0.3, SEC_Z - 0.3, xs + 0.01, FD + 1.9, SEC_Z + 0.3, 1);
        } else {
          for (const [a, b] of [[lx - 0.35, lx + 0.02], [lx + 0.98, lx + 1.35]]) { G.box('counter', a, FD, SEC_Z - 0.9, b, FD + 2.25, SEC_Z + 0.9, 1); solid(a, SEC_Z - 0.9, b, SEC_Z + 0.9, 0.3); }
          G.box('counter', lx - 0.35, FD + 2.25, SEC_Z - 0.9, lx + 1.35, FD + 2.5, SEC_Z + 0.9, 1);
          G.box('glass', lx + 0.02, FD + 0.1, SEC_Z - 0.9, lx + 0.98, FD + 0.12, SEC_Z + 0.9, 1);
        }
        G.box('lightG', lx + 0.4, FD + (intl ? 2.5 : 2.35), SEC_Z - 0.1, lx + 0.6, FD + (intl ? 2.6 : 2.45), SEC_Z + 0.1, 1);
        solid(lx - 0.15, SEC_Z - 0.4, lx + 0.02, SEC_Z + 0.4, 0.3); solid(lx + 0.98, SEC_Z - 0.4, lx + 1.15, SEC_Z + 0.4, 0.3);
        const arch = { x0: lx + 0.02, x1: lx + 0.98, z: SEC_Z, open: 0, want: 0, lane: li, kind: 'arch' };
        this.anim.flaps.push(arch);
        // lane divider (low glass)
        G.box('glass', lx + 1.5, FD, -603.4, lx + 1.6, FD + 1.1, -578, 1);
        solid(lx + 1.5, -603.4, lx + 1.6, -578, 0.15);
        G.panel('sign', 'nz', lx + 0.5, FD + 2.9, -603.5, 0.9, 0.5, sign(128, 72, { big: String(li + 1), center: true }));
        G.box('metal', lx + 0.48, FD + 3.15, -603.48, lx + 0.52, H.top, -603.44);
        this.acts.push({ id: 'tray', x: lx, z: -597.2, r: 1.4, lane: li,
          label: () => intl ? 'Put your bag in a tray 手荷物をトレーへ' : '手荷物をトレーに置く Put your bag in a tray',
          ok: () => this.prog.checkin && !this.prog.bag && this.p.z < SEC_Z, act: () => this._tray(li, lx) });
        this.acts.push({ id: 'collect', x: lx, z: -581.0, r: 1.5, lane: li,
          label: () => intl ? 'Collect your bag 手荷物を受け取る' : '手荷物を受け取る Collect your bag',
          ok: () => this.prog.bag === 2 && this.bagLane === li && this.p.z > SEC_Z, act: () => this._collect() });
      });
      // officers' area markings: footprints in the scanners
    }
    // ======================================================== passport control (overseas)
    let plazaZ0 = -577;
    if (intl) {
      plazaZ0 = PASS_Z + 1;
      const r = sign(1000, 150, { jp: '出国審査', en: 'Passport Control', pict: 'pass' });
      G.box('dmetal', -14, FD + 4.0, -579.2, 14, FD + 5.6, -578.8, 1);
      G.panel('sign', 'nz', 0, FD + 4.8, -579.22, 13.6, 1.5, r);
      for (const x of [-11, 11]) G.box('metal', x - 0.05, FD + 5.6, -579.05, x + 0.05, H.top, -578.95);
      let x = H.x0;
      const segs = [];
      for (const lx of LANES) { segs.push([x, lx - 1.6]); x = lx + 0.8; }
      segs.push([x, H.x1]);
      for (const [a, b] of segs) { G.box('frost', a, FD, PASS_Z - 0.06, b, FD + 2.2, PASS_Z + 0.06, 1); solid(a, PASS_Z - 0.06, b, PASS_Z + 0.06, 0.3); }
      LANES.forEach((lx, li) => {
        G.box('counter', lx - 1.6, FD, PASS_Z - 1.6, lx - 0.2, FD + 1.15, PASS_Z + 1.6, 1);
        G.box('glass', lx - 1.6, FD + 1.15, PASS_Z - 1.6, lx - 0.2, FD + 2.2, PASS_Z + 1.6, 1);
        G.box('dmetal', lx - 1.65, FD + 2.2, PASS_Z - 1.65, lx - 0.15, FD + 2.4, PASS_Z + 1.65, 1);
        solid(lx - 1.6, PASS_Z - 1.6, lx - 0.2, PASS_Z + 1.6, 0.45);
        G.panel('sign', 'nz', lx - 0.9, FD + 2.75, PASS_Z - 1.66, 1.2, 0.5, sign(192, 80, { big: String(li + 1), en: 'All passports', center: false }));
        this.anim.flaps.push({ x0: lx - 0.2, x1: lx + 0.8, z: PASS_Z + 0.4, open: 0, want: 0, lane: li, kind: 'booth' });
        this.acts.push({ id: 'passport', x: lx + 0.3, z: PASS_Z - 1.3, r: 1.4, lane: li,
          label: () => 'Show your passport パスポートを提示', ok: () => this.prog.security && !this.prog.passport, act: () => this._passport(li) });
      });
      // automated passport gates (decorative, closed)
      for (const ex of [-40, -37, 37, 40]) { G.box('counter', ex - 0.3, FD, PASS_Z - 1.2, ex + 0.3, FD + 1.1, PASS_Z + 1.2, 1); solid(ex - 0.3, PASS_Z - 1.2, ex + 0.3, PASS_Z + 1.2, 0.4); }
    }
    // ======================================================== airside plaza: shops / duty free
    {
      const top = sign(1100, 160, intl ? { jp: '搭乗口 1–14', en: 'All Gates 1–14', arrowL: 'down', pict: 'gate' } : { jp: '搭乗口 1–14', en: 'Gates 1–14', arrowL: 'down', pict: 'gate' });
      G.box('dmetal', -10, FD + 3.6, -558.4, 10, FD + 5.0, -558.0, 1);
      G.panel('sign', 'nz', 0, FD + 4.3, -558.42, 19.6, 1.35, top);
      for (const x of [-8, 8]) G.box('metal', x - 0.05, FD + 5.0, -558.25, x + 0.05, H.top, -558.15);
      const shop = (x0, x1, z0, z1, name, kind) => {
        G.box('shelf', x0, FD, z0, x1, FD + 2.2, z1, 1);
        const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
        if (along) { G.quad('goods', [x1, FD + 0.1, z0 - 0.01], [x0 - x1, 0, 0], [0, 2.0, 0], 1, [0, 0, (x1 - x0) / 3, 1]); G.quad('goods', [x0, FD + 0.1, z1 + 0.01], [x1 - x0, 0, 0], [0, 2.0, 0], 1, [0, 0, (x1 - x0) / 3, 1]); }
        solid(x0, z0, x1, z1, 0.5);
        if (name) {
          const r = sign(640, 120, { bg: kind === 'df' ? '#5b1f3a' : '#2b2b2b', fg: '#ffffff', jp: name[0], en: name[1], pict: kind === 'cafe' ? 'cafe' : 'shop' });
          G.panel('sign', 'nz', (x0 + x1) / 2, FD + 2.8, z0 - 0.02, Math.min(5, x1 - x0), 0.95, r);
        }
      };
      if (intl) {
        const r = sign(1200, 180, { bg: '#5b1f3a', fg: '#ffffff', jp: '免税店', en: 'DUTY FREE', pict: 'shop' });
        G.box('dmetal', -22, FD + 5.2, -571.4, 22, FD + 7.2, -571.0, 1);
        G.panel('sign', 'nz', 0, FD + 6.2, -571.42, 13.0, 1.9, r);
        for (const sx of [-34, -26, -18, 18, 26, 34]) shop(sx - 3, sx + 3, -567.5, -566.7, null, 'df');
        for (const sx of [-30, -22, 22, 30]) shop(sx - 3, sx + 3, -562.5, -561.7, null, 'df');
        shop(-44, -40, -569, -558, null, 'df'); shop(40, 44, -569, -558, null, 'df');
      }
      shop(-128, -70, -569, -567.6, ['お土産・食品', 'Souvenirs & Food'], 'shop');
      shop(-64, intl ? -48 : -24, -560.2, -558.8, ['書店・コンビニ', 'Books & News'], 'shop');
      shop(intl ? 48 : 24, 64, -560.2, -558.8, ['ラウンジ', 'Lounge'], 'shop');
      shop(70, 128, -569, -567.6, ['カフェ', 'Café & Bar'], 'cafe');
      // café tables
      for (let k = 0; k < 8; k++) {
        const tx = 76 + (k % 4) * 12, tz = -563.5 + Math.floor(k / 4) * 3.2;
        G.box('counter', tx - 0.45, FD + 0.72, tz - 0.45, tx + 0.45, FD + 0.76, tz + 0.45, 1);
        G.box('metal', tx - 0.05, FD, tz - 0.05, tx + 0.05, FD + 0.72, tz + 0.05, 1);
        solid(tx - 0.5, tz - 0.5, tx + 0.5, tz + 0.5, 0.35);
      }
    }
    // ======================================================== pier: walkways, gates, shops
    {
      // moving walkways (both directions), handrail housings, entry plates
      for (const side of [-1, 1]) for (const [a, b] of BELTS_X) for (const [z0, z1, out] of BELTS_Z) {
        const x0 = side < 0 ? -b : a, x1 = side < 0 ? -a : b;
        G.quad('rubber', [x0, FP + 0.12, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1]);
        G.box('metal', x0, FP, z0, x1, FP + 0.12, z1, 1, { py: false });
        for (const [h0, h1] of [[z0 - 0.25, z0], [z1, z1 + 0.25]]) {
          G.box('glass', x0, FP + 0.12, h0 + 0.08, x1, FP + 0.95, h1 - 0.08, 1);
          G.box('rubber', x0, FP + 0.95, h0, x1, FP + 1.05, h1, 1);
          G.box('metal', x0, FP, h0, x1, FP + 0.12, h1, 1);
          solid(x0, h0, x1, h1, 0.35);
        }
        this.belts.push({ x0, x1, z0, z1, vx: out * side * BELT_V });
      }
      // gates
      const r1 = sign(900, 140, { jp: '搭乗口 1–7', en: 'Gates 1–7', arrowR: 'right', pict: 'gate' });
      const r2 = sign(900, 140, { jp: '搭乗口 8–14', en: 'Gates 8–14', arrowL: 'left', pict: 'gate' });
      G.box('dmetal', -15, FP + 3.4, -531.2, 15, FP + 4.8, -530.8, 1);
      G.panel('sign', 'nz', -7.5, FP + 4.1, -531.22, 14.6, 1.3, r1);
      G.panel('sign', 'nz', 7.5, FP + 4.1, -531.22, 14.6, 1.3, r2);
      // (seen walking south down the stairs: the viewer's right is west, where gates 1-7 are)
      for (const s of this.stands()) {
        const xs = s.x, bx = xs - 14, mine = s.id === F.gate;
        // boarding gates (two automated lanes) and the glazed lobby to the bridge door
        for (const [a, b] of [[bx - 1.9, bx - 1.6], [bx - 0.15, bx + 0.15], [bx + 1.6, bx + 1.9]]) { G.box('counter', a, FP, -509.9, b, FP + 1.0, -509.1, 1); solid(a, -509.9, b, -509.1, 0.35); }
        for (const [a, b] of [[bx - 1.6, bx - 0.15], [bx + 0.15, bx + 1.6]]) { G.box('flap', a, FP + 0.5, -509.53, b, FP + 0.95, -509.47, 1); solid(a, -509.6, b, -509.4, 0); }
        for (const ex of [bx - 1.95, bx + 1.85]) { G.box('glass', ex, FP, -509.1, ex + 0.1, FP + 2.3, PIER.z1, 1); solid(ex, -509.1, ex + 0.1, PIER.z1, 0.2); }
        G.box('dmetal', bx - 1.6, FP, PIER.z1 - 0.05, bx + 1.6, FP + 2.6, PIER.z1 + 0.02, 1, { pz: true });
        G.box('metal', bx - 1.75, FP + 2.6, PIER.z1 - 0.12, bx + 1.75, FP + 2.8, PIER.z1 + 0.05, 1);
        G.box('metal', bx - 1.75, FP, PIER.z1 - 0.12, bx - 1.6, FP + 2.6, PIER.z1 + 0.05, 1);
        G.box('metal', bx + 1.6, FP, PIER.z1 - 0.12, bx + 1.75, FP + 2.6, PIER.z1 + 0.05, 1);
        G.quad('glass', [bx + 1.6, FP + 2.8, PIER.z1 - 0.02], [-3.2, 0, 0], [0, PIER.top - FP - 2.8, 0]);
        // counter with the gate screen
        G.box('counter', bx - 8, FP, -512.0, bx - 4.5, FP + 1.05, -511.0, 1);
        G.box('dmetal', bx - 8.02, FP, -512.02, bx - 4.48, FP + 0.12, -510.98, 1);
        solid(bx - 8, -512.0, bx - 4.5, -511.0, 0.5);
        G.box('metal', bx - 6.3, FP + 1.05, -510.75, bx - 6.2, FP + 2.0, -510.65, 1);
        G.box('dmetal', bx - 7.0, FP + 2.0, -510.8, bx - 5.5, FP + 2.9, -510.6, 1);
        if (mine) G.quad('gatedisp', [bx - 5.55, FP + 2.05, -510.82], [-1.4, 0, 0], [0, 0.8, 0], 1, [0, 0, 1, 1]);
        else G.panel('sign', 'nz', bx - 6.25, FP + 2.45, -510.82, 1.4, 0.8, this._gateIdle(s.id, sign));
        // gate number: over the door (towards the seats) and across the concourse
        const num = sign(160, 100, { big: String(s.id), center: true });
        G.box('dmetal', bx - 1.6, FP + 3.6, -512.2, bx + 1.6, FP + 5.6, -511.9, 1);
        G.panel('sign', 'nz', bx, FP + 4.6, -512.22, 3.1, 1.9, num);
        G.box('metal', bx - 0.05, FP + 5.6, -512.1, bx + 0.05, PIER.top, -512.0);
        const pole = sign(240, 176, { big: String(s.id), center: true, jp: '搭乗口', en: 'Gate' });
        G.box('dmetal', bx - 0.06, FP + 3.0, -529.6, bx + 0.06, FP + 4.6, -527.4, 1);
        G.panel('sign', 'px', bx + 0.07, FP + 3.8, -528.5, 2.1, 1.55, pole);
        G.panel('sign', 'nx', bx - 0.07, FP + 3.8, -528.5, 2.1, 1.55, pole);
        G.box('metal', bx - 0.04, FP + 4.6, -528.55, bx + 0.04, PIER.top, -528.45);
        // seats facing the apron (rows of 8, aisles between)
        for (const [ra, rb] of [[xs - 38, bx - 10], [bx + 4, xs + 34]]) {
          for (let gx0 = ra; gx0 + 4.8 <= rb + 0.01; gx0 += 6.0) for (const rz of [-516.5, -519.5, -522.5]) {
            (this.seatPos ||= []).push([gx0, rz]);
            solid(gx0, rz - 0.4, gx0 + 4.8, rz + 0.35, 0.45);
          }
        }
        // waiting area sign on the landside wall
        if (mine) {
          this.gatePos = { x: bx, z: -510.9 };
          this.acts.push({ id: 'board', x: bx, z: -510.6, r: 1.8,
            label: () => this.style === 'intl' ? `Board flight ${F.flight} ご搭乗` : `搭乗する Board ${F.flight}`, ok: () => true, act: () => this._board() });
        }
      }
      // signs to the gates along the concourse (one panel per walking direction)
      for (let x = -560; x <= 560; x += 80) {
        if (Math.abs(x) < 30) continue;
        const east = this.stands().filter((s) => s.x - 14 > x).map((s) => s.id), west = this.stands().filter((s) => s.x - 14 < x).map((s) => s.id);
        const lab = (ids) => (ids.length ? (ids.length > 1 ? `${Math.min(...ids)}–${Math.max(...ids)}` : String(ids[0])) : '');
        G.box('dmetal', x - 0.06, FP + 3.5, -543.2, x + 0.06, FP + 4.7, -533.8, 1);
        if (east.length) G.panel('sign', 'nx', x - 0.07, FP + 4.1, -538.5, 9.0, 1.1, sign(560, 68, { jp: `搭乗口 ${lab(east)}`, en: `Gates ${lab(east)}`, arrowL: 'up', pict: 'gate' }));
        if (west.length) G.panel('sign', 'px', x + 0.07, FP + 4.1, -538.5, 9.0, 1.1, sign(560, 68, { jp: `搭乗口 ${lab(west)}`, en: `Gates ${lab(west)}`, arrowL: 'up', pict: 'gate' }));
        for (const zz of [-542.5, -534.5]) G.box('metal', x - 0.04, FP + 4.7, zz - 0.04, x + 0.04, PIER.top, zz + 0.04);
      }
      // shops, cafés and toilets along the landside wall of the pier
      const units = [['カフェ', 'Café', 'cafe'], ['お手洗い', 'Toilets', 'wc'], ['売店', 'Shop', 'shop'], ['お手洗い', 'Toilets', 'wc']];
      let u = 0;
      for (let x = -600; x <= 600; x += 80) {
        if (Math.abs(x) < 40) continue;
        const [jp, en, kind] = units[u++ % units.length];
        const r = sign(600, 110, { jp, en, pict: kind, bg: kind === 'wc' ? undefined : '#2b2b2b', fg: kind === 'wc' ? undefined : '#ffffff' });
        G.panel('sign', 'pz', x, FP + 3.4, PIER.z0 + 0.03, 3.6, 0.66, r);
        if (kind === 'wc') {
          G.box('wall', x - 2.2, FP, PIER.z0, x + 2.2, FP + 3.0, PIER.z0 + 0.25, 1);
          G.box('dmetal', x - 0.9, FP, PIER.z0 + 0.25, x + 0.9, FP + 2.3, PIER.z0 + 0.27, 1);
        } else {
          G.box('shelf', x - 6, FP, PIER.z0, x + 6, FP + 2.2, PIER.z0 + 0.8, 1);
          G.quad('goods', [x - 6, FP + 0.1, PIER.z0 + 0.81], [12, 0, 0], [0, 2.0, 0], 1, [0, 0, 4, 1]);
          G.box('counter', x - 3, FP, PIER.z0 + 2.2, x + 3, FP + 1.05, PIER.z0 + 2.9, 1);
          solid(x - 6, PIER.z0, x + 6, PIER.z0 + 0.8, 0.5); solid(x - 3, PIER.z0 + 2.2, x + 3, PIER.z0 + 2.9, 0.5);
        }
      }
    }
    // ======================================================== materials, meshes
    const P = (o) => patchTerminal(new THREE.MeshStandardMaterial(o));
    const M = this.mats = {
      floor: P({ map: T.floor, roughness: 0.2, envMapIntensity: 0.35 }),
      stone: P({ map: T.floor, roughness: 0.3, envMapIntensity: 0.25 }),
      carpet: P({ map: T.carpet, roughness: 0.95 }),
      wood: P({ map: T.wood, roughness: 0.6 }),
      wall: P({ color: S.wall, roughness: 0.65 }),
      ceil: P({ map: T.ceil, roughness: 0.9 }),
      metal: P({ color: 0xb8bcc1, roughness: 0.32, metalness: 0.8 }),
      dmetal: P({ color: 0x2a2d31, roughness: 0.45, metalness: 0.4 }),
      rubber: P({ color: 0x141518, roughness: 0.85 }),
      counter: P({ color: 0xf1f0ec, roughness: 0.35 }),
      xray: P({ color: 0xd4d9de, roughness: 0.45, metalness: 0.15 }),
      tray: P({ color: 0x6e737a, roughness: 0.6 }),
      belt: P({ color: intl ? 0x1d3f8f : 0x23324f, roughness: 0.7 }),
      shelf: P({ color: 0xe8e2d6, roughness: 0.55 }),
      goods: P({ map: T.goods, roughness: 0.6 }),
      roller: P({ map: T.roller, roughness: 0.3, metalness: 0.6 }),
      flap: P({ color: 0xcfe3f2, roughness: 0.15, transparent: true, opacity: 0.75 }),
      frost: P({ color: 0xf4f6f7, roughness: 0.4, transparent: true, opacity: 0.82 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xd8e6ee, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 0.5 }),
      light: new THREE.MeshBasicMaterial({ color: new THREE.Color(S.led[0] * 2.2, S.led[1] * 2.2, S.led[2] * 2.2) }),
      lightG: new THREE.MeshBasicMaterial({ color: 0x30ff60 }),
    };
    isl.forEach((I) => { M['brand' + I.idx] = P({ color: I.logo.colors.brand || '#223f9a', roughness: 0.4 }); });
    T.atlas = tex(atlas.c, false); T.atlas.flipY = false;
    M.sign = new THREE.MeshBasicMaterial({ map: T.atlas, toneMapped: false });
    T.board = tex(this.boardC, false); T.board.flipY = false;
    M.board = new THREE.MeshBasicMaterial({ map: T.board, toneMapped: false });
    this.gateC = canvas(512, 288);
    T.gate = tex(this.gateC, false); T.gate.flipY = false;
    M.gatedisp = new THREE.MeshBasicMaterial({ map: T.gate, toneMapped: false });
    this.lightG = M.lightG;
    const group = new THREE.Group();
    group.name = 'TerminalInterior';
    group.userData.gate = F.gate;
    for (const k of Object.keys(G.b)) {
      const g = G.geometry(k);
      if (!g || !M[k]) continue;
      const mesh = new THREE.Mesh(g, M[k]);
      mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
      if (k === 'glass' || k === 'frost' || k === 'flap') mesh.renderOrder = 2;
      group.add(mesh);
    }
    // gate seats (instanced: fabric shell + metal frame)
    if (this.seatPos?.length) {
      const sg = new Geo();
      for (let i = 0; i < 8; i++) {
        const x = i * 0.6 + 0.04;
        sg.box('f', x, 0.42, -0.25, x + 0.52, 0.5, 0.22, 1);
        sg.box('f', x, 0.5, -0.33, x + 0.52, 1.0, -0.25, 1);
        sg.box('m', x - 0.04, 0.5, -0.2, x, 0.68, 0.22, 1);
      }
      sg.box('m', 0, 0.36, -0.06, 4.8, 0.42, 0.06, 1);
      for (const x of [0.3, 4.5]) sg.box('m', x - 0.04, 0, -0.25, x + 0.04, 0.36, 0.2, 1);
      const seatMats = { f: P({ color: intl ? 0x2f3540 : 0x2e4a7a, roughness: 0.8 }), m: M.metal };
      const mt = new THREE.Matrix4();
      for (const k of ['f', 'm']) {
        const im = new THREE.InstancedMesh(sg.geometry(k), seatMats[k], this.seatPos.length);
        this.seatPos.forEach(([x, z], i) => { mt.makeTranslation(x, FP, z); im.setMatrixAt(i, mt); });
        im.frustumCulled = false;
        group.add(im);
      }
      for (const [x, z] of this.seatPos) ao(x, z - 0.35, x + 4.8, z + 0.25, 0.45);
      M.seatF = seatMats.f;
    }
    // retracting glass flaps of the boarding pass gates and passport booths (two halves each)
    this.flapMeshes = [];
    for (const f of this.anim.flaps) {
      if (f.kind === 'arch') continue;
      const w = (f.x1 - f.x0) / 2, y = (f.kind === 'pass' ? FD : FD) + 0.55;
      for (const s of [0, 1]) {
        const g = new THREE.BoxGeometry(w, 0.45, 0.03); g.translate(s ? -w / 2 : w / 2, 0, 0);
        const m = new THREE.Mesh(g, M.flap);
        m.position.set(s ? f.x1 : f.x0, y, f.z); m.userData.f = f; m.renderOrder = 2;
        group.add(m); this.flapMeshes.push(m);
      }
    }
    // bags (checked bag on the scale, cabin bag in the X-ray tray)
    const bagG = new THREE.BoxGeometry(0.45, 0.65, 0.26); bagG.translate(0, 0.325, 0);
    M.bag = P({ color: 0x5a6b82, roughness: 0.5 });
    this.bagChk = new THREE.Mesh(bagG, M.bag); this.bagChk.visible = false; group.add(this.bagChk);
    const trayG = new THREE.Group();
    trayG.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6).translate(0, 0.04, 0), M.tray));
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.32).translate(0, 0.2, 0), P({ color: 0x1d1d1f, roughness: 0.6 }));
    trayG.add(cb);
    this.tray = trayG; this.tray.visible = false; group.add(trayG);
    // floor contact shadows
    this._aoMap();
    this.group = group;
    group.visible = false;
    this.app.scene.add(group);
    this.crowd = null; this._crowdTry = 0;
    this._drawBoard(); this._drawGate();
  }

  // gate screen of the gates that are not yours: number and the next AI departure if any
  _gateIdle(id, sign) {
    let txt = null;
    try {
      const rows = this.app.fids?._rows?.('home') || [];
      const r = rows.find((x) => String(x.gate) === String(id));
      if (r) txt = r;
    } catch (e) { /* no traffic */ }
    return txt ? sign(200, 112, { big: String(id), jp: `${txt.flight} ${txt.dest}`, en: `${txt.flight} ${txt.dest}`, bigCol: '#f7c600', bg: '#0c0c0e', fg: '#ffffff' })
      : sign(200, 112, { big: String(id), jp: '次の便をお待ちください', en: 'Next flight', bigCol: '#f7c600', bg: '#0c0c0e', fg: '#ffffff' });
  }

  _aoMap() {
    const c = canvas(2048, 600), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 2048, 600);
    g.filter = 'blur(3px)';
    const toPx = (x, z) => (z < -550 ? [(x - HALL.x0) * 4, (z - HALL.z0) * 4] : [(x - PIER.x0) / 1272 * 2036, 536 + (z - PIER.z0) / 38 * 61]);
    for (const [x0, z0, x1, z1, k] of this.aoRects) {
      const a = toPx(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12), b = toPx(Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12);
      g.fillStyle = `rgba(0,0,0,${k})`;
      g.fillRect(a[0], a[1], Math.max(1, b[0] - a[0]), Math.max(1, b[1] - a[1]));
    }
    g.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    this.tex.ao = t;
    TERM_U.uTAO.value = t;
  }

  _dispose() {
    this.app.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(this.mats || {})) m.dispose();
    for (const t of Object.values(this.tex || {})) t.dispose?.();
    this.crowd?.dispose();
    this.group = null; this.crowd = null; this.seatPos = null;
  }

  // the gates of each lane / booth: closed until their step is done
  _bars() {
    for (const f of this.anim?.flaps || []) { f.open = 0; f.want = 0; }
    this.prog.bag = 0; this.bagLane = -1;
    if (this.tray) this.tray.visible = false;
    if (this.bagChk) this.bagChk.visible = false;
  }

  // ------------------------------------------------------------------------------ people
  _people() {
    const kit = this.app.arff?.kit;
    if (!kit?.ok || !kit.person) return;
    const intl = this.style === 'intl';
    const crowd = this.crowd = new Crowd(kit.person, 560, patchTerminal);
    this.group.add(crowd.group);
    const rnd = mulberry32(5);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const pax = () => ({ P_Shirt: pick(SHIRTS), P_Pants: pick(PANTS), P_Hair: pick(HAIR), P_Skin: pick(SKIN) });
    const staff = (top, bottom) => ({ P_Shirt: top, P_Pants: bottom, P_Hair: pick(HAIR.slice(0, 6)), P_Skin: pick(SKIN) });
    const put = (cols, x, y, z, a, s = 0.92 + rnd() * 0.14) => { const i = crowd.add(cols); if (i >= 0) crowd.pose(i, x, y, z, a, 0, s); return i; };
    // check-in staff and passengers at the counters
    for (const cx of ISL.xs) for (const s of [-1, 1]) {
      for (let z = ISL.z0 + 2; z + 2.6 <= ISL.z1 - 1.6; z += 2.6) {
        if (rnd() < 0.55) put(staff('#1e2b4a', '#1c2030'), cx + s * 2.1, FD, z + 0.9, s < 0 ? Math.PI : 0);
        const mineDesk = cx === this.island.cx && s < 0 && Math.abs(z - (ISL.z0 + 2)) < 0.1;
        if (mineDesk) { put(staff('#1e2b4a', '#1c2030'), cx + s * 2.1, FD, z + 0.9, Math.PI); continue; }
        if (rnd() < 0.5) {
          put(pax(), cx + s * 4.0, FD, z + 0.9, s < 0 ? 0 : Math.PI);
          if (rnd() < 0.6) put(pax(), cx + s * 5.3, FD, z + 0.9 + (rnd() - 0.5) * 0.6, s < 0 ? 0 : Math.PI);
        }
      }
    }
    // security staff and the queue
    for (const lx of LANES) {
      put(staff('#9fb4cf', '#1f2533'), lx - 2.3, FD, SEC_Z + 1.2, 0);
      put(staff('#9fb4cf', '#1f2533'), lx - 2.5, FD, -587.2, 0);
      put(staff('#9fb4cf', '#1f2533'), lx + 2.2, FD, SEC_Z + 1.0, Math.PI);
      if (rnd() < 0.7) put(pax(), lx + 0.4, FD, -606 - rnd() * 3, Math.PI / 2);
      if (intl) put(staff('#1b2742', '#1b2742'), lx - 0.9, FD - 0.42, PASS_Z, 0);
    }
    for (let k = 0; k < 14; k++) put(pax(), -30 + rnd() * 60, FD, -610.6 + Math.floor(rnd() * 3) * 2.6 + 1.2, rnd() * 6.28);
    // gate staff, people waiting by the windows and at the counters
    for (const s of this.stands()) {
      const bx = s.x - 14;
      put(staff(intl ? '#5b1f3a' : '#1e2b4a', '#1c2030'), bx - 6.25, FP, -510.4, -Math.PI / 2);
      const n = s.id === this.flight.gate ? 9 : 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) put(pax(), bx - 30 + rnd() * 56, FP, -508.2 - rnd() * 2.4, Math.PI / 2 + (rnd() - 0.5) * 0.8);
    }
    // walkers: hall (aisle grid), airside plaza, pier concourse
    const HX = [-122, -87.5, -52.5, -18, 0, 18, 52.5, 87.5, 122], HZ = [-682, -670, -642, -614];
    this.walkers = [];
    const walker = (region, x, z) => {
      const i = crowd.add(pax());
      if (i < 0) return;
      this.walkers.push({ i, region, x, z, a: 0, tx: x, tz: z, wait: rnd() * 4, ph: rnd() * 6, s: 0.92 + rnd() * 0.14, v: 1.15 + rnd() * 0.35 });
    };
    for (let k = 0; k < 34; k++) walker('hall', pick(HX), pick(HZ));
    for (let k = 0; k < 10; k++) walker('plaza', -36 + rnd() * 72, intl ? -570 : -574);
    for (let k = 0; k < 46; k++) walker('pier', -620 + rnd() * 1240, -529 + rnd() * 2.5);
    this._hx = HX; this._hz = HZ; this._rnd = rnd;
  }

  _walkers(dt) {
    const C = this.crowd, rnd = this._rnd;
    if (!C || !this.walkers) return;
    const intl = this.style === 'intl';
    for (const w of this.walkers) {
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
      let sw = 0;
      if (d < 0.2) {
        w.wait -= dt;
        if (w.wait <= 0) {
          // next waypoint
          if (w.region === 'hall') {
            const ix = this._hx.indexOf(w.tx), iz = this._hz.indexOf(w.tz);
            if (rnd() < 0.5 && iz !== 2) w.tx = this._hx[Math.max(0, Math.min(this._hx.length - 1, ix + (rnd() < 0.5 ? -1 : 1)))];
            else w.tz = this._hz[Math.max(0, Math.min(this._hz.length - 1, iz + (rnd() < 0.5 ? -1 : 1)))];
          } else if (w.region === 'plaza') { w.tx = -36 + rnd() * 72; w.tz = intl ? -570.6 + rnd() * 1.4 : -575 + rnd() * 4; }
          else { w.tx = Math.max(-625, Math.min(625, w.x + (rnd() - 0.5) * 300)); w.tz = -529.5 + rnd() * 3.0; }
          w.wait = rnd() < 0.3 ? 2 + rnd() * 6 : 0;
        }
      } else {
        const step = Math.min(d, w.v * dt);
        w.x += dx / d * step; w.z += dz / d * step;
        const want = Math.atan2(dz, dx);
        let da = want - w.a; da = Math.atan2(Math.sin(da), Math.cos(da));
        w.a += da * Math.min(1, dt * 6);
        w.ph += dt * (2.2 + w.v * 2.1);
        sw = Math.sin(w.ph) * 0.42;
      }
      const y = w.region === 'pier' ? FP : FD;
      // only near the camera: far walkers keep moving but are not re-posed every frame
      if (Math.abs(w.x - this.p.x) < 90 && Math.abs(w.z - this.p.z) < 90) C.pose(w.i, w.x, y, w.z, w.a, sw, w.s);
      else if ((w._far = (w._far || 0) + dt) > 0.5) { w._far = 0; C.pose(w.i, w.x, y, w.z, w.a, 0, w.s); }
    }
  }

  // ------------------------------------------------------------------------- walking
  floorAt(x, z) { return z > WELL.z1 ? FP : z < WELL.z0 ? FD : FD + (FP - FD) * (z - WELL.z0) / (WELL.z1 - WELL.z0); }

  free(x, z) {
    if (x < PIER.x0 + R || x > PIER.x1 - R || z < HALL.z0 + R || z > PIER.z1 - R) return false;
    for (const b of this.solid) if (x > b[0] - R && x < b[2] + R && z > b[1] - R && z < b[3] + R) return false;
    for (const f of this.anim.flaps) if (f.open < 0.9 && x > f.x0 - R && x < f.x1 + R && Math.abs(z - f.z) < R + 0.05) return false;
    return true;
  }

  // camera rig hook: moves the walker, places the camera (world frame)
  place(cam, dt, rig) {
    if (!this.group) return;
    const inp = rig.walkInput || { fwd: 0, side: 0, turn: 0, run: false };
    rig.yaw -= inp.turn * 1.8 * dt;
    const yaw = rig.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let sp = (inp.run ? RUN_V : WALK_V) * dt;
    const n = Math.hypot(inp.fwd, inp.side);
    if (n > 1) sp /= n;
    let dx = (fx * inp.fwd + rx * inp.side) * sp, dz = (fz * inp.fwd + rz * inp.side) * sp;
    const p = this.p;
    for (const b of this.belts) if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) dx += b.vx * dt;
    if (this.free(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; } else if (this.free(p.x + dx, p.z)) p.x += dx; else if (this.free(p.x, p.z + dz)) p.z += dz;
    // the walk-through scanner: crossing it is part of the security check
    if (this._pz != null && this._pz < SEC_Z && p.z >= SEC_Z && this.prog.bag && !this.prog.scan) this._scanned();
    this._pz = p.z;
    const fy = this.floorAt(p.x, p.z);
    p.y += (fy - p.y) * Math.min(1, dt * 12);
    this._bob = (this._bob || 0) + Math.hypot(dx, dz) * 5.0;
    cam.position.set(p.x, p.y + EYE + 0.022 * Math.sin(this._bob), p.z);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + yaw);
    const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rig.pitch);
    cam.quaternion.copy(qy).multiply(qp);
    cam.near = 0.05;
  }

  // ------------------------------------------------------------------------- steps
  _checkin() {
    this.prog.checkin = true;
    this.bagChk.position.set(this.ckBag.x, this.ckBag.y, this.ckBag.z);
    this.bagChk.rotation.set(0, 0, 0);
    this.bagChk.visible = true; this._bagT = 0;
    this._beep(880, 0.08); setTimeout(() => this._beep(1320, 0.1), 120);
    const F = this.flight, intl = this.style === 'intl';
    this.app.toast(intl ? `✅ Checked in — ${F.flight} to ${F.dest}, gate ${F.gate}, seat ${F.seat}. Bag dropped.`
      : `✅ チェックイン完了 — ${F.flight} ${F.dest}行き・搭乗口 ${F.gate}・座席 ${F.seat}。お手荷物をお預かりしました`, 5000);
    this._refreshHud();
  }

  _tray(li, lx) {
    this.prog.bag = 1; this.bagLane = li;
    this.tray.position.set(lx - 1.0, FD + 0.79, -597);
    this.tray.visible = true; this._trayZ = -597;
    for (const f of this.anim.flaps) if (f.kind === 'arch' && f.lane === li) f.want = 1;
    this.app.toast(this.style === 'intl' ? 'Bag in the tray — now walk through the scanner' : '手荷物をトレーに置きました。ゲートをくぐってください', 3500);
    this._refreshHud();
  }

  _scanned() {
    this.prog.scan = true;
    this._beep(1046, 0.12);
    if (this.lightG) { this.lightG.color.setRGB(0.2, 1.6, 0.4); setTimeout(() => this.lightG?.color.set(0x30ff60), 1500); }
    this.app.toast(this.style === 'intl' ? '✅ Clear. Collect your bag from the belt.' : '✅ 検査完了。ベルトの先で手荷物をお受け取りください', 3200);
    this._refreshHud();
  }

  _collect(auto = false) {
    if (this.prog.bag !== 2) return;
    this.prog.bag = 3; this.prog.security = true;
    this.tray.visible = false;
    for (const f of this.anim.flaps) if (f.kind === 'arch') f.want = 0;
    const intl = this.style === 'intl';
    this.app.toast(intl ? (auto ? 'Bag collected. ' : '') + 'Security done — passport control is ahead' : (auto ? '手荷物を受け取りました。' : '') + `保安検査完了 — 搭乗口 ${this.flight.gate} へお進みください`, 4000);
    this._refreshHud();
  }

  _passport(li) {
    this.prog.passport = true;
    for (const f of this.anim.flaps) if (f.kind === 'booth' && f.lane === li) f.want = 1;
    this._beep(660, 0.06); setTimeout(() => this._beep(660, 0.06), 160);
    this.app.toast(`🛂 Departure stamp ✓ 出国審査完了 — Gate ${this.flight.gate}`, 3500);
    this._refreshHud();
  }

  _board() {
    const F = this.flight, intl = this.style === 'intl';
    if (!this.prog.security || (intl && !this.prog.passport)) { this.app.toast(intl ? 'Please complete security first' : '保安検査を済ませてください', 2500); return; }
    if (!F.atGate) { this.app.toast(intl ? 'Your aircraft is not at this gate' : 'この搭乗口に機体がいません（スポットに駐機中のときに搭乗できます）', 3500); return; }
    this._beep(1320, 0.08);
    for (const f of this.anim.flaps) f.want = f.want || 0;
    this._fade(() => this.app.boardFromTerminal?.(F));
  }

  // ------------------------------------------------------------------------- per frame
  update(dt) {
    if (!this.active || !this.group) return;
    // light: ceiling lights on, daylight / sun through the glass by day
    const Wd = this.app.world, S = STYLE[this.style];
    const night = Wd?.night ?? 0, sunK = (Wd?.sunT ?? 1) * (1 - night);
    TERM_U.uTL.value.set(1.0 + 0.25 * night, (1 - night) * (1 - 0.5 * (Wd?.weather?.overcast ?? 0)), night, 0);
    TERM_U.uTLed.value.setRGB(S.led[0] * (night ? 1.0 : 1), S.led[1] * (1 - 0.06 * night), S.led[2] * (1 - 0.14 * night));
    if (Wd?.sunDir) TERM_U.uTSun.value.set(Wd.sunDir.x, Wd.sunDir.y, Wd.sunDir.z, Wd.sunDir.y > 0 ? 3.2 * sunK * (1 - (Wd?.weather?.overcast ?? 0)) : 0);
    if (!this.crowd && (this._crowdTry -= dt) <= 0) { this._crowdTry = 1; this._people(); }
    this._walkers(dt);
    // gates and flaps
    for (const f of this.anim.flaps) {
      if (f.kind === 'pass') f.want = this.prog.checkin && Math.abs(this.p.x - (f.x0 + f.x1) / 2) < 1.6 && Math.abs(this.p.z - f.z) < 2.2 ? 1 : (f.open > 0.9 && Math.abs(this.p.z - f.z) < 0.8 ? 1 : 0);
      if (f.kind === 'pass' && f.want && f.open < 0.05) this._beep(1568, 0.05);
      f.open += Math.sign(f.want - f.open) * Math.min(Math.abs(f.want - f.open), dt * 2.5);
    }
    // the checked bag rides into the island, the tray through the X-ray
    if (this.bagChk.visible) {
      this._bagT += dt;
      if (this._bagT > 1.2) this.bagChk.position.x += dt * 0.6;
      if (this.bagChk.position.x > this.island.cx - 0.9) this.bagChk.visible = false;
    }
    if (this.prog.bag === 1) {
      this._trayZ += dt * 1.1;
      if (this._trayZ >= -581) { this._trayZ = -581; this.prog.bag = 2; this._refreshHud(); }
      this.tray.position.z = this._trayZ;
    }
    if (this.prog.bag === 2 && this.p.z > -577.5) this._collect(true);
    // the cabin model loads while you walk to the gate (boarding goes straight into it)
    if (this.p.z > WELL.z0 && !this._cabinPre) { this._cabinPre = true; this.app.cabin?.ensure?.(); }
    // the boarding pass gates stay shut before check-in
    if (!this.prog.checkin && Math.abs(this.p.z - FLAP_Z) < 2.4 && LANES.some((lx) => Math.abs(this.p.x - lx - 0.55) < 1.2) && (this._hintT = (this._hintT || 0) - dt) <= 0) {
      this._hintT = 6;
      this.app.toast(this.style === 'intl' ? 'Please check in first (island D)' : '先にチェックインを済ませてください（D カウンター）', 3000);
    }
    for (const fm of this.flapMeshes || []) fm.scale.x = Math.max(0.02, 1 - fm.userData.f.open);
    // boards and gate screen
    if ((this._fidsT += dt) > 4) { this._fidsT = 0; this._lang ^= 1; this._drawBoard(); this._drawGate(); }
    // interaction prompt, guidance
    let best = null, bd = 1e9;
    for (const a of this.acts) {
      const d = Math.hypot(a.x - this.p.x, a.z - this.p.z);
      if (d < a.r && d < bd && a.ok()) { best = a; bd = d; }
    }
    this.cur = best;
    this._hudFrame();
    this._amb(true);
  }

  interact() {
    if (this.active && this.cur) this.cur.act();
  }

  // ------------------------------------------------------------------------- boards
  _rows() {
    let rows = [];
    try { rows = (this.app.fids?._rows?.('home') || []).slice(0, 9); } catch (e) { rows = []; }
    const F = this.flight;
    const now = this.app.fids?.clock?.() ?? 0;
    const left = F.dep - now;
    const mine = { t: F.dep, logo: F.logo.id, flight: F.flight, dest: F.dest, gate: F.gate, rem: left < 600 ? 'final' : left < 1800 ? 'boarding' : 'ontime', me: true };
    rows = rows.filter((r) => r.flight !== F.flight);
    rows.push(mine);
    rows.sort((a, b) => a.t - b.t);
    return rows.slice(0, 9);
  }

  _drawBoard() {
    const c = this.boardC, g = c.getContext('2d'), W = c.width, H = c.height;
    const en = this.style === 'intl' ? this._lang === 0 : this._lang === 1;
    const hh = (s) => { const m = Math.floor(((s / 60) % 1440 + 1440) % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    g.fillStyle = '#050607'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#12161c'; g.fillRect(0, 0, W, 70);
    g.fillStyle = '#f7c600'; g.font = `800 40px ${JPF}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(en ? '✈ Departures' : '✈ 出発  Departures', 18, 36);
    g.fillStyle = '#ffffff'; g.textAlign = 'right'; g.font = `700 34px ${JPF}`;
    g.fillText(hh(this.app.fids?.clock?.() ?? 0), W - 18, 36);
    const cols = en ? ['Time', 'Flight', 'Destination', 'Gate', 'Remarks'] : ['時刻', '便名', '行先', '搭乗口', '備考'];
    const X = [18, 150, 380, 690, 800];
    g.fillStyle = '#9aa3ad'; g.font = `600 22px ${JPF}`; g.textAlign = 'left';
    cols.forEach((t, i) => g.fillText(t, X[i], 92));
    const REM = { ontime: ['定刻', 'On time', '#7fe08a'], boarding: ['搭乗中', 'Boarding', '#5cc8ff'], final: ['最終案内', 'Final call', '#ff7a6b'],
      closed: ['搭乗終了', 'Gate closed', '#c0c0c0'], departed: ['出発済', 'Departed', '#8a8a8a'], delayed: ['遅延', 'Delayed', '#ffb44a'] };
    this._rows().forEach((r, k) => {
      const y = 132 + k * 49;
      if (r.me) { g.fillStyle = 'rgba(247,198,0,0.14)'; g.fillRect(6, y - 22, W - 12, 44); }
      g.fillStyle = k % 2 ? '#0b0d10' : 'transparent'; if (k % 2 && !r.me) g.fillRect(6, y - 22, W - 12, 44);
      g.font = `700 28px ${JPF}`;
      g.fillStyle = '#f7c600'; g.fillText(hh(r.t), X[0], y);
      g.fillStyle = '#ffffff'; g.fillText(r.flight, X[1], y);
      fitText(g, r.dest, 290, 28); g.fillText(r.dest, X[2], y);
      g.font = `700 28px ${JPF}`; g.fillText(String(r.gate), X[3] + 20, y);
      const R = REM[r.rem] || REM.ontime;
      g.fillStyle = R[2]; fitText(g, en ? R[1] : R[0], 210, 26); g.fillText(en ? R[1] : R[0], X[4], y);
    });
    this.tex.board.needsUpdate = true;
  }

  _drawGate() {
    const c = this.gateC, g = c.getContext('2d'), W = c.width, H = c.height, F = this.flight;
    const now = this.app.fids?.clock?.() ?? 0, left = F.dep - now;
    const hh = (s) => { const m = Math.floor(((s / 60) % 1440 + 1440) % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    const en = this.style === 'intl' || this._lang === 1;
    g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, W, H);
    g.fillStyle = F.logo.colors.brand || '#223f9a'; g.fillRect(0, 0, W, 64);
    const lc = canvas(96, 96); drawLogoIcon(lc, F.logo); g.drawImage(lc, 8, 4, 56, 56);
    g.fillStyle = '#fff'; g.font = `800 36px ${JPF}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(F.flight, 76, 34);
    g.textAlign = 'right'; g.font = `800 40px ${JPF}`; g.fillText(String(F.gate), W - 14, 34);
    g.textAlign = 'left';
    g.fillStyle = '#f7c600'; g.font = `800 52px ${JPF}`; g.fillText(hh(F.dep), 16, 112);
    g.fillStyle = '#fff'; fitText(g, F.dest, 300, 46); g.fillText(F.dest, 190, 112);
    const st = left < 600 ? ['最終案内', 'Final call', '#ff7a6b'] : left < 1500 ? ['搭乗中', 'Now boarding', '#5cc8ff'] : ['定刻', 'On time', '#7fe08a'];
    g.fillStyle = st[2]; g.font = `800 44px ${JPF}`; g.fillText(en ? st[1] : st[0], 16, 180);
    g.fillStyle = '#aab'; g.font = `600 24px ${JPF}`;
    g.fillText(en ? `Boarding ${hh(F.board)} · Seat ${F.seat}` : `搭乗開始 ${hh(F.board)} ・ 座席 ${F.seat}`, 16, 236);
    this.tex.gate.needsUpdate = true;
  }

  // ------------------------------------------------------------------------- HUD
  _steps() {
    const intl = this.style === 'intl', P = this.prog, F = this.flight;
    const lane = LANES.reduce((b, l) => (Math.abs(l + 0.5 - this.p.x) < Math.abs(b + 0.5 - this.p.x) ? l : b), LANES[0]);
    const s = [
      { k: 'checkin', done: P.checkin, jp: `チェックイン（${this.island.letter} カウンター）`, en: `Check-in — island ${this.island.letter}`, x: this.ckPos.x, z: this.ckPos.z },
      { k: 'security', done: P.security, jp: '保安検査（手荷物をトレーへ → ゲート通過 → 受け取り）', en: 'Security — tray, scanner, collect bag',
        x: (P.bag ? LANES[this.bagLane] ?? lane : lane) + (P.bag ? 0 : 0.55), z: P.bag ? (P.scan || this.p.z > SEC_Z ? -581 : SEC_Z + 1) : FLAP_Z - 1.5 },
    ];
    if (intl) s.push({ k: 'passport', done: P.passport, jp: '出国審査', en: 'Passport control', x: lane + 0.3, z: PASS_Z - 1.4 });
    s.push({ k: 'gate', done: false, jp: `搭乗口 ${F.gate} から搭乗`, en: `Board at gate ${F.gate}`, x: this.gatePos?.x ?? 0, z: this.gatePos?.z ?? -511 });
    return s;
  }

  _hud(on) {
    if (!this.hud) {
      const d = document.createElement('div');
      d.id = 'termHud';
      d.innerHTML = `<style>
#termHud{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:${JPF.replace(/"/g, "'")};color:#fff}
#termHud .tCard{position:absolute;left:12px;top:72px;width:min(290px,calc(100vw - 24px));background:rgba(14,16,20,.78);border-radius:10px;padding:9px 11px;backdrop-filter:blur(6px);box-shadow:0 6px 24px rgba(0,0,0,.35)}
#termHud .tPass{display:flex;gap:10px;align-items:center;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:8px;margin-bottom:8px}
#termHud .tPass img{width:32px;height:32px;border-radius:7px}
#termHud .tPass b{font-size:15px}#termHud .tPass small{display:block;color:#b8c0cc;font-size:11px}
#termHud .tGate{margin-left:auto;text-align:right;font-size:11px;color:#b8c0cc;white-space:nowrap}#termHud .tGate b{display:block;font-size:21px;color:#f7c600}
#termHud ol{margin:0;padding:0;list-style:none;font-size:12px;line-height:1.4}
#termHud li{padding:3px 0 3px 24px;position:relative;color:#d8dde5}#termHud li:before{content:'○';position:absolute;left:4px;color:#8a93a0}
#termHud li.done{color:#7fd38a}#termHud li.done:before{content:'✓';color:#7fd38a}#termHud li.cur{color:#fff;font-weight:700}#termHud li.cur:before{content:'▶';color:#f7c600}
#termHud li small{display:none;color:#98a2af;font-weight:400;font-size:10.5px}#termHud li.cur small{display:block}
#termHud .tGuide{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:rgba(14,16,20,.75);border-radius:20px;padding:6px 14px;font-size:14px;display:flex;gap:8px;align-items:center;white-space:nowrap}
#termHud .tGuide i{display:inline-block;font-style:normal;color:#f7c600;font-size:20px;transition:transform .1s linear}
#termHud .tPrompt{position:absolute;left:50%;bottom:116px;transform:translateX(-50%);pointer-events:auto;cursor:pointer;background:#f7c600;color:#111;border:0;border-radius:24px;padding:10px 20px;font:700 16px ${JPF.replace(/"/g, "'")};box-shadow:0 4px 16px rgba(0,0,0,.4)}
#termHud .tPrompt kbd{background:#111;color:#f7c600;border-radius:5px;padding:1px 7px;margin-right:8px;font-size:13px}
#termHud .tHelp{position:absolute;left:16px;bottom:16px;font-size:12px;color:#c9d0d9;background:rgba(14,16,20,.6);padding:6px 10px;border-radius:8px}
#termHud .tFade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .6s}
#termHud.intl .tGuide i,#termHud.intl li.cur:before{color:#ffd200}
</style><div class="tCard"><div class="tPass"></div><ol></ol></div><div class="tGuide"><i>▲</i><span></span></div>
<button class="tPrompt hidden"></button><div class="tHelp">W A S D 歩く ・ Shift 走る ・ Q E / ドラッグ 向き ・ Enter / Space 決定 ・ C 視点</div><div class="tFade"></div>`;
      document.body.appendChild(d);
      this.hud = d;
      d.querySelector('.tPrompt').addEventListener('click', () => this.interact());
    }
    this.hud.style.display = on ? '' : 'none';
    if (on) this._refreshHud();
  }

  _refreshHud() {
    if (!this.hud || !this.flight) return;
    const F = this.flight, intl = this.style === 'intl';
    this.hud.classList.toggle('intl', intl);
    const lc = canvas(76, 76); drawLogoIcon(lc, F.logo);
    const hh = (s) => { const m = Math.floor(((s / 60) % 1440 + 1440) % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    this.hud.querySelector('.tPass').innerHTML = `<img src="${lc.toDataURL()}" alt=""><div><b>${F.flight} → ${F.dest}</b>
      <small>${this.prog.checkin ? (intl ? `Boarding pass · Seat ${F.seat} · Boarding ${hh(F.board)}` : `搭乗券 ・ 座席 ${F.seat} ・ 搭乗開始 ${hh(F.board)}`) : (intl ? `Departs ${hh(F.dep)} · not checked in` : `出発 ${hh(F.dep)} ・ 未チェックイン`)}</small></div>
      <div class="tGate">${intl ? 'Gate' : '搭乗口'}<b>${F.gate}</b></div>`;
    const steps = this._steps();
    const cur = steps.find((s) => !s.done);
    this.hud.querySelector('ol').innerHTML = steps.map((s) => `<li class="${s.done ? 'done' : s === cur ? 'cur' : ''}">${intl ? s.en : s.jp}<small>${intl ? s.jp : s.en}</small></li>`).join('');
    this._goal = cur;
  }

  _hudFrame() {
    if (!this.hud) return;
    const b = this.hud.querySelector('.tPrompt');
    const lab = this.cur ? this.cur.label() : '';
    if (b.dataset.lab !== lab) { b.dataset.lab = lab; b.innerHTML = `<kbd>Enter</kbd>${lab}`; b.classList.toggle('hidden', !lab); b.style.display = lab ? '' : 'none'; }
    const g = this._goal, gd = this.hud.querySelector('.tGuide');
    if (!g) { gd.style.display = 'none'; return; }
    gd.style.display = '';
    // a route through the building: stairs between the hall and the pier
    let tx = g.x, tz = g.z;
    const inHall = this.p.z < WELL.z0 + 0.5, goalPier = tz > WELL.z1 - 0.5;
    if (inHall && goalPier) { tx = 0; tz = WELL.z0 + 4; }
    else if (!inHall && !goalPier && this.p.z > WELL.z1 - 2) { tx = 0; tz = WELL.z1 - 3; }
    const dx = tx - this.p.x, dz = tz - this.p.z;
    const ang = Math.atan2(dx, dz) - this.app.rig.yaw;
    const dist = Math.hypot(g.x - this.p.x, g.z - this.p.z);
    gd.querySelector('i').style.transform = `rotate(${-ang}rad)`;
    const intl = this.style === 'intl';
    gd.querySelector('span').textContent = `${intl ? g.en : g.jp.replace(/（.*）/, '')} ・ ${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km'}`;
  }

  _fade(mid) {
    const f = this.hud?.querySelector('.tFade');
    if (!f) { mid(); return; }
    f.style.opacity = '1';
    setTimeout(() => { mid(); setTimeout(() => { f.style.opacity = '0'; }, 250); }, 650);
  }

  _announce(msg) { this.app.toast?.('📢 ' + msg, 5000); this._chime(); }

  // ------------------------------------------------------------------------- sound
  _ctx() { const a = this.app.audio; return a?.ctx && a.enabled !== false ? a : null; }
  _beep(f, d) {
    const A = this._ctx(); if (!A) return;
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.05);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + d + 0.1);
  }
  _chime() {
    const A = this._ctx(); if (!A) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => this._beep(f, 0.5), i * 260));
  }
  // murmur of the hall: filtered noise, quieter in the pier
  _amb(on) {
    const A = this._ctx();
    if (!A) return;
    if (!this._ambN && on) {
      const c = A.ctx, len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(A.master); src.start();
      this._ambN = { src, g };
    }
    if (this._ambN) {
      const want = on ? (this.p.z < WELL.z0 ? 0.16 : 0.09) : 0;
      this._ambN.g.gain.setTargetAtTime(want, A.ctx.currentTime, 0.4);
    }
  }
}
