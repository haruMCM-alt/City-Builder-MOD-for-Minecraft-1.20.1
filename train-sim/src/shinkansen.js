// 東北新幹線 trains on the viaduct beside the 宇都宮線: procedural E5 / H5 / E6 / E8 / E2 / E7 sets
// and a small traffic manager that sends them past at their real speeds (130 km/h south of 大宮,
// up to 275 km/h north of it).
import * as THREE from 'three';
import { DETAIL } from './detail.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodMaterial } from './carlod.js';

// ---------------------------------------------------------------------------
// liveries (official colour names; hex from the operator's / Wikipedia values)
// ---------------------------------------------------------------------------
const C = (h) => new THREE.Color(h);
const LIVERY = {
  // bands from the bottom up: [yTop (m above rail), colour]
  E5: { bands: [[2.02, 0xd6dad9], [2.16, 0xdf3687], [9, 0x489a83]], nose: 15, w: 3.35, h: 3.65, len: 25, head: 26.5 },
  H5: { bands: [[2.02, 0xd6dad9], [2.16, 0x6c5098], [9, 0x489a83]], nose: 15, w: 3.35, h: 3.65, len: 25, head: 26.5 },
  E6: { bands: [[1.95, 0xd6dad9], [2.08, 0x9fa3a6], [9, 0xd61b2a]], nose: 13, w: 2.945, h: 3.65, len: 20.5, head: 23 },
  E8: { bands: [[1.75, 0xf4f4f2], [2.05, 0xf2b300], [9, 0x5b2c83]], nose: 9, w: 2.945, h: 3.65, len: 20.5, head: 23 },
  E2: { bands: [[1.5, 0x2a4990], [1.64, 0xd155ab], [9, 0xd6dad9]], nose: 9.1, w: 3.38, h: 3.7, len: 25, head: 25.7 },
  E7: { bands: [[1.62, 0xf9f8f3], [1.74, 0xc09584], [1.84, 0x0158e5], [2.9, 0xf9f8f3], [9, 0x0158e5]], nose: 9.1, w: 3.38, h: 3.65, len: 25, head: 26 },
  // N700S (東海道新幹線): white with the blue window line
  N700: { bands: [[1.98, 0xf7f7f5], [2.1, 0x1b4ea3], [2.22, 0xf7f7f5], [9, 0xf7f7f5]], nose: 10.7, w: 3.36, h: 3.6, len: 25, head: 27.35 },
};
// formations as they run on the 宇都宮 side (E6 / E8 are coupled to the north end of an E5)
export const SETS = [
  { name: 'はやぶさ・こまち', parts: [['E6', 7], ['E5', 10]], w: 3, stopU: false },
  { name: 'やまびこ・つばさ', parts: [['E8', 7], ['E5', 10]], w: 3, stopU: true },
  { name: 'はやぶさ', parts: [['E5', 10]], w: 2, stopU: false },
  { name: 'はやぶさ (H5)', parts: [['H5', 10]], w: 0.6, stopU: false },
  { name: 'なすの', parts: [['E2', 10]], w: 1.5, stopU: true },
  { name: 'やまびこ', parts: [['E5', 10]], w: 1.5, stopU: true },
  { name: 'かがやき', parts: [['E7', 12]], w: 1.2, south: true },
];
/** 東海道新幹線 */
export const TOKAIDO_SETS = [{ name: 'のぞみ', parts: [['N700', 16]], w: 1 }];

// ---------------------------------------------------------------------------
// shapes
// ---------------------------------------------------------------------------
/**
 * the nose of each type (t = 0 at the nose root .. 1 at the tip):
 *   half width W·(1 − t^aw)^bw (never below tipW), roof dropping to tipTop as (1 − t^ah)^bh,
 *   can: the cab canopy bump [height, t, spread], glass: the windscreen [t0, t1, half width as a
 *   fraction of the section, roundness], lampT: where the head lights sit
 * win: side windows [bottom y, height, width, pitch]; panto: cars (from the north end) with a pantograph
 */
const NOSE = {
  E5: { aw: 2.4, bw: 0.55, tipW: 0.6, tipTop: 1.25, ah: 1.0, bh: 1.45, can: [0.34, 0.2, 0.11], glass: [0.1, 0.31, 0.42, 0.55], lampT: 0.52, win: [2.3, 0.42, 0.62, 1.04] },
  E6: { aw: 1.9, bw: 0.65, tipW: 0.42, tipTop: 1.15, ah: 1.0, bh: 1.3, can: [0.5, 0.25, 0.12], glass: [0.13, 0.36, 0.4, 0.5], lampT: 0.56, win: [2.22, 0.4, 0.58, 0.98] },
  E8: { aw: 2.0, bw: 0.6, tipW: 0.45, tipTop: 1.2, ah: 1.05, bh: 1.15, can: [0.36, 0.3, 0.13], glass: [0.16, 0.42, 0.42, 0.6], lampT: 0.62, win: [2.2, 0.42, 0.6, 0.98] },
  E2: { aw: 2.6, bw: 0.5, tipW: 0.6, tipTop: 1.4, ah: 1.15, bh: 0.95, can: [0.12, 0.36, 0.15], glass: [0.2, 0.46, 0.5, 0.8], lampT: 0.64, win: [1.98, 0.5, 0.68, 0.98] },
  E7: { aw: 2.2, bw: 0.55, tipW: 0.62, tipTop: 1.35, ah: 1.3, bh: 1.0, can: [0.26, 0.34, 0.14], glass: [0.18, 0.46, 0.52, 0.8], lampT: 0.64, win: [2.04, 0.52, 0.66, 1.04] },
  N700: { aw: 3.0, bw: 0.42, tipW: 0.7, tipTop: 1.15, ah: 0.85, bh: 1.7, can: [0.26, 0.3, 0.13], glass: [0.16, 0.42, 0.5, 0.75], lampT: 0.56, win: [2.22, 0.46, 0.62, 1.04] },
};
NOSE.H5 = NOSE.E5;

/** body cross-section for a 3.35 m × 3.67 m car (half, z, y above rail): bottom centre, side, roof centre */
const PROFILE = [[0, 0.95], [1.45, 0.95], [1.5, 0.96], [1.6, 1.04], [1.66, 1.25], [1.675, 1.6], [1.675, 2.35], [1.655, 2.75], [1.6, 3.02], [1.5, 3.26], [1.33, 3.45], [1.1, 3.57], [0.8, 3.635], [0.4, 3.66], [0, 3.67]];
const YB = 0.95, YT = 3.67;
const UNDER = 0x2a2c2f;

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** paint: metalness, roughness, emissive (windows glow with the saloon lights) */
const PAINT = [0.12, 0.3, 0], GLASS = [0.4, 0.06, 0.45], DARK = [0.2, 0.5, 0], METAL = [0.6, 0.5, 0], RUBBER = [0, 0.85, 0];

/** collects non-indexed triangles with colour and material per vertex, merged into one mesh per car */
class Parts {
  constructor() { this.list = []; }
  /** geometry (any; indexed or not), a colour (or null to keep its colour attribute), [metal, rough, emissive] */
  add(geo, color, mre) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (color != null || !g.attributes.color) {
      const c = new THREE.Color(color ?? 0x808080), a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    const m = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { m[i * 3] = mre[0]; m[i * 3 + 1] = mre[1]; m[i * 3 + 2] = mre[2]; }
    g.setAttribute('aMRE', new THREE.BufferAttribute(m, 3));
    this.list.push(g);
    if (g !== geo) geo.dispose();
  }
  /** a box from a to b (centre line) with thickness th and depth (z) w */
  bar(a, b, th, w, z, color, mre) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const g = new THREE.BoxGeometry(len, th, w);
    g.rotateZ(Math.atan2(dy, dx));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
    this.add(g, color, mre);
  }
  box(x0, x1, y0, y1, z0, z1, color, mre) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, color, mre);
  }
  build() {
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    g.computeBoundingSphere();
    return g;
  }
}

/** a flat rounded rectangle facing ±z (side = +1 left / -1 right), centred at (x, y), on the plane z */
function roundRect(x, y, w, h, r, z, side) {
  const pts = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= 3; i++) { const a = a0 + (i / 3) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x + w / 2 - r, y + h / 2 - r, 0); corner(x - w / 2 + r, y + h / 2 - r, Math.PI / 2);
  corner(x - w / 2 + r, y - h / 2 + r, Math.PI); corner(x + w / 2 - r, y - h / 2 + r, Math.PI * 1.5);
  const pos = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (side > 0) pos.push(x, y, z, a[0], a[1], z, b[0], b[1], z); else pos.push(x, y, z, b[0], b[1], z, a[0], a[1], z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const _mats = {};
function lampMat(tail) {
  const k = tail ? 'tail' : 'head';
  return _mats[k] || (_mats[k] = new THREE.MeshStandardMaterial({ color: tail ? 0x400404 : 0xfff6e0, emissive: tail ? 0xff1a0a : 0xfff2d8, emissiveIntensity: 3, roughness: 0.2 }));
}
/** a lamp cluster: a flattened lens set into the nose side */
const LAMP_GEO = new THREE.SphereGeometry(1, 12, 8).scale(0.34, 0.1, 0.07);

const _geoCache = new Map();
/**
 * one car, merged into a single geometry: x from 0 (rear end) to L (front end); nose = length of the
 * streamlined nose at the +x end (0 for a middle car); panto: carries a pantograph.
 * Returns { geo, lamps: [{x, y, z, sx}] } (head / tail light positions on the nose).
 */
function carGeometry(type, L, nose, panto) {
  const key = `${type}|${L}|${nose}|${panto}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const lv = LIVERY[type], ns = NOSE[type];
  const W2 = lv.w / 2, H = lv.h, ws = lv.w / 3.35;
  const bodyEnd = L - nose;
  const P = new Parts();
  const C0 = new THREE.Color();
  const band = (y) => { for (const [top, c] of lv.bands) if (y <= top) return c; return lv.bands[lv.bands.length - 1][1]; };
  // --- the ring: half profile (with paired points at each colour boundary so the stripes are sharp) ---
  const half = [];
  for (let i = 0; i < PROFILE.length; i++) {
    const [z, y] = PROFILE[i];
    const yy = YB + (y - YB) * (H - YB) / (YT - YB);
    if (i < 2) { half.push({ zn: z / 1.675, yn: (yy - YB) / (H - YB), c: UNDER }); if (i === 1) half.push({ zn: z / 1.675, yn: 0, c: band(yy) }); continue; }
    const prev = half[half.length - 1];
    const pY = YB + prev.yn * (H - YB), pZ = prev.zn;
    for (const [top] of lv.bands) {
      if (top > pY && top < yy) {
        const f = (top - pY) / (yy - pY), zz = pZ + (z / 1.675 - pZ) * f;
        half.push({ zn: zz, yn: (top - 0.004 - YB) / (H - YB), c: band(top - 0.01) });
        half.push({ zn: zz, yn: (top + 0.004 - YB) / (H - YB), c: band(top + 0.01) });
      }
    }
    half.push({ zn: z / 1.675, yn: (yy - YB) / (H - YB), c: band(yy) });
  }
  // full ring: left (+z) half from the bottom centre over the roof, then the right half back down
  const ring = [...half.map((p) => ({ ...p, side: 1 })), ...half.slice(0, -1).reverse().map((p) => ({ ...p, side: -1 }))];
  const n = ring.length;
  // --- sections: [x, half width, bottom, top, t] ---
  const secs = [];
  secs.push({ x: 0, t: -1 }, { x: bodyEnd, t: nose > 0 ? 0 : -1 });
  const NS = 44;
  if (nose > 0) for (let i = 1; i <= NS; i++) { const t = Math.pow(i / NS, 0.9); secs.push({ x: bodyEnd + nose * t, t }); }
  const sec = (t) => {
    if (t < 0) return { w: W2, bot: YB, top: H, cb: 0 };
    const w = Math.max(ns.tipW, W2 * Math.pow(Math.max(0, 1 - Math.pow(t, ns.aw)), ns.bw));
    const bot = YB - 0.4 * sstep(0.3, 0.65, t) + 0.12 * sstep(0.85, 1, t);
    let top = ns.tipTop + (H - ns.tipTop) * Math.pow(Math.max(0, 1 - Math.pow(t, ns.ah)), ns.bh);
    top = Math.max(top, bot + 0.3);
    const cb = ns.can[0] * Math.exp(-(((t - ns.can[1]) / ns.can[2]) ** 2));
    return { w, bot, top, cb };
  };
  const point = (S, p) => {
    const z = p.zn * S.w * p.side;
    let y = S.bot + p.yn * (S.top - S.bot);
    if (S.cb) y += S.cb * Math.pow(Math.max(0, 1 - (p.zn / 0.6) ** 2), 1.5) * sstep(0.55, 0.95, p.yn);
    return [z, y];
  };
  const pos = [], col = [], idx = [];
  for (const sc of secs) {
    const S = sec(sc.t);
    sc.S = S;
    // on the nose the underside curves up into view: paint it like the lower body
    const under = sc.t > 0 ? C0.set(band(1.0)).multiplyScalar(0.8).getHex() : UNDER;
    for (const p of ring) {
      const [z, y] = point(S, p);
      pos.push(sc.x, y, z);
      C0.set(p.c === UNDER ? under : p.c); col.push(C0.r, C0.g, C0.b);
    }
  }
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // end caps: the gangway end(s) flat, the nose tip closed in a point
  const cap = (iSec, x, dirOut) => {
    // own vertices, so the cap has one colour (not blended from the livery round its edge)
    const S = secs[iSec].S, base = pos.length / 3;
    C0.set(nose > 0 && iSec > 1 ? band(1.0) : UNDER);
    pos.push(x, (S.bot + S.top) / 2, 0); col.push(C0.r, C0.g, C0.b);
    for (let j = 0; j < n; j++) { pos.push(pos[(iSec * n + j) * 3], pos[(iSec * n + j) * 3 + 1], pos[(iSec * n + j) * 3 + 2]); col.push(C0.r, C0.g, C0.b); }
    for (let j = 0; j < n - 1; j++) { const a = base + 1 + j; if (dirOut > 0) idx.push(base, a, a + 1); else idx.push(base, a + 1, a); }
  };
  cap(0, 0, -1);
  if (nose > 0) cap(secs.length - 1, L + 0.06, 1); else cap(1, L, 1);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  P.add(body, null, PAINT);
  // side z of the body at height y (straight part)
  const sideZ = (y) => {
    const yn = (y - YB) / (H - YB);
    for (let i = 1; i < half.length; i++) if (half[i].yn >= yn && half[i - 1].yn <= yn && half[i].yn > half[i - 1].yn) {
      const f = (yn - half[i - 1].yn) / (half[i].yn - half[i - 1].yn);
      return (half[i - 1].zn + (half[i].zn - half[i - 1].zn) * f) * W2;
    }
    return W2;
  };
  // --- windscreen: a patch over the canopy, sampled on the nose surface ---
  if (nose > 0) {
    const [g0, g1, gw, gr] = ns.glass;
    const NT = 18, NZ = 10, gp = [];
    const topAt = (t, zf) => {
      // the canopy surface at (t, fraction of the section half width), lifted a little
      const S = sec(t);
      // top part of the ring: search the left half for the point with this z fraction
      let best = null;
      for (let i = half.length - 1; i > 0; i--) {
        const a = half[i], b = half[i - 1];
        if (b.zn >= zf && a.zn <= zf) { const f = (zf - a.zn) / Math.max(1e-6, b.zn - a.zn); best = { zn: zf, yn: a.yn + (b.yn - a.yn) * f, side: 1 }; break; }
      }
      if (!best) best = { zn: zf, yn: 1, side: 1 };
      const [, y] = point(S, best);
      return [bodyEnd + nose * t, y + 0.015, zf * S.w];
    };
    const shape = (u) => Math.pow(Math.sin(Math.PI * u), gr);   // half width along the windscreen
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NZ; j++) {
        const q = [];
        for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
          const u = (i + di) / NT, v = ((j + dj) / NZ) * 2 - 1;
          const t = g0 + (g1 - g0) * u;
          const zf = gw * shape(Math.min(0.999, Math.max(0.001, u))) * v;
          const pnt = topAt(t, Math.abs(zf));
          q.push(pnt[0], pnt[1], Math.sign(zf) * Math.abs(pnt[2]));
        }
        gp.push(...q);
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gg.computeVertexNormals();
    // make sure it faces up (outwards)
    if (gg.attributes.normal.getY(0) < 0) { const a = gg.attributes.position.array; for (let k = 0; k < a.length; k += 9) for (let c = 0; c < 3; c++) { const t = a[k + 3 + c]; a[k + 3 + c] = a[k + 6 + c]; a[k + 6 + c] = t; } gg.computeVertexNormals(); }
    P.add(gg, 0x0c1014, [0.5, 0.05, 0]);
  }
  // --- side windows, doors ---
  const [wy, wh, wwid, pitch] = ns.win;
  const doorW = 0.86 * ws + 0.1;
  const doors = nose > 0 ? [[bodyEnd - 1.9, bodyEnd - 1.9 + doorW]] : [[0.75, 0.75 + doorW], [L - 0.75 - doorW, L - 0.75]];
  const winEnd = bodyEnd - (nose > 0 ? 2.4 : 1.2);
  const zw = sideZ(wy + wh / 2) + 0.008;
  for (let x = 1.9; x + wwid / 2 < winEnd; x += pitch) {
    if (doors.some(([a, b]) => x + wwid / 2 > a - 0.25 && x - wwid / 2 < b + 0.25)) continue;
    for (const side of [1, -1]) P.add(roundRect(x, wy + wh / 2, wwid, wh, 0.09, side * zw, side), 0x10161b, GLASS);
  }
  const dz = sideZ(2.2) + 0.006;
  for (const [a, b] of doors) {
    for (const side of [1, -1]) {
      const z = side * dz, th = 0.022;
      for (const [x0, x1, y0, y1] of [[a, a + th, 1.28, 3.0], [b - th, b, 1.28, 3.0], [a, b, 3.0 - th, 3.0], [a, b, 1.28, 1.28 + th]]) {
        P.add(roundRect((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0.004, z, side), 0x3a3f44, DARK);
      }
      P.add(roundRect((a + b) / 2, wy + wh / 2, 0.26, wh * 0.9, 0.08, z + side * 0.002, side), 0x10161b, GLASS);
    }
  }
  // --- underframe: equipment box, skirts between the bogies, bogies ---
  const bog = nose > 0 ? [3.6, bodyEnd + nose * 0.16] : [3.6, L - 3.6];
  const lowC = band(1.2);
  C0.set(lowC).multiplyScalar(0.86);
  const skirtC = C0.getHex();
  P.box(1.2, (nose > 0 ? bodyEnd + 0.4 : L - 1.2), 0.5, YB + 0.01, -W2 * 0.8, W2 * 0.8, UNDER, DARK);
  const skirtSpans = [[0.6, bog[0] - 1.85], [bog[0] + 1.85, bog[1] - 1.85]];
  if (nose === 0) skirtSpans.push([bog[1] + 1.85, L - 0.6]);
  for (const [a, b] of skirtSpans) {
    if (b - a < 0.3) continue;
    for (const side of [1, -1]) P.box(a, b, 0.55, YB + 0.03, side * W2 * 0.965 - 0.02, side * W2 * 0.965 + 0.02, skirtC, PAINT);
  }
  const wheel = (x, z) => {
    const g = new THREE.CylinderGeometry(0.43, 0.43, 0.13, 14, 1);
    g.rotateX(Math.PI / 2); g.translate(x, 0.43, z);
    P.add(g, 0x4a4c4f, METAL);
  };
  for (const xb of bog) {
    P.box(xb - 1.55, xb + 1.55, 0.42, 0.68, -1.02, -0.86, 0x2b2d30, DARK);       // side frames
    P.box(xb - 1.55, xb + 1.55, 0.42, 0.68, 0.86, 1.02, 0x2b2d30, DARK);
    P.box(xb - 0.35, xb + 0.35, 0.5, 0.72, -0.86, 0.86, 0x2b2d30, DARK);         // bolster
    for (const dx of [-1.25, 1.25]) {
      for (const z of [-0.72, 0.72]) wheel(xb + dx, z);
      for (const z of [-1.0, 1.0]) P.box(xb + dx - 0.18, xb + dx + 0.18, 0.3, 0.58, z - 0.1, z + 0.1, 0x3a3c3f, DARK);   // axle boxes
    }
    for (const z of [-1.04, 1.04]) P.box(xb - 0.12, xb + 0.12, 0.6, 0.9, z - 0.07, z + 0.07, 0x151618, RUBBER);       // yaw dampers
  }
  // gangway cover (full outer bellows) at the rear end
  {
    const rp = [], rc = [], ri = [];
    const S = { w: W2 * 0.95, bot: YB + 0.05, top: H - 0.06, cb: 0 };
    for (const x of [-0.42, 0.02]) for (const p of ring) { const [z, y] = point(S, p); rp.push(x, y, z); rc.push(0.4, 0.41, 0.42); }
    for (let j = 0; j < n - 1; j++) { const a = j, b = j + 1, c = j + n, d = c + 1; ri.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    g.setIndex(ri); g.computeVertexNormals();
    P.add(g, null, RUBBER);
  }
  // pantograph (single arm, raised) with its noise shields
  if (panto) {
    const x0 = L * 0.62, y0 = H;
    for (const [dx, dz2] of [[-0.6, -0.5], [-0.6, 0.5], [0.6, -0.5], [0.6, 0.5]]) {
      const g = new THREE.CylinderGeometry(0.07, 0.09, 0.32, 8); g.translate(x0 + dx, y0 + 0.16, dz2); P.add(g, 0x7a4a2a, [0.1, 0.4, 0]);
    }
    P.box(x0 - 0.8, x0 + 0.8, y0 + 0.32, y0 + 0.42, -0.6, 0.6, 0x3a3d40, METAL);
    P.bar([x0 - 0.5, y0 + 0.45], [x0 + 0.9, y0 + 1.05], 0.08, 0.5, 0, 0x8a8e92, METAL);   // lower arm
    P.bar([x0 + 0.9, y0 + 1.05], [x0 - 0.2, y0 + 1.62], 0.06, 0.08, 0, 0x8a8e92, METAL);  // upper arm
    P.box(x0 - 0.33, x0 - 0.07, y0 + 1.6, y0 + 1.7, -0.95, 0.95, 0x2a2c2e, METAL);         // collector head
    if (/^(E5|H5|E6|E2|E7|N700)$/.test(type)) {
      for (const side of [1, -1]) P.box(x0 - 1.6, x0 + 1.9, y0 - 0.15, y0 + 0.55, side * 1.0 - 0.03, side * 1.0 + 0.03, band(H + 1), PAINT);
    }
  }
  // head light positions: low on the nose sides
  const lamps = [];
  if (nose > 0) {
    const t = ns.lampT, S = sec(t);
    const p = half.reduce((a, b) => (Math.abs(b.yn - 0.3) < Math.abs(a.yn - 0.3) ? b : a));
    for (const side of [1, -1]) {
      const [z, y] = point(S, { ...p, side });
      lamps.push({ x: bodyEnd + nose * t, y, z: z * 0.97 });
    }
  }
  const out = { geo: P.build(), lamps };
  _geoCache.set(key, out);
  return out;
}

export class ShinkansenSet {
  constructor(set) {
    this.set = set;
    this.group = new THREE.Group();
    this.cars = [];
    this.lamps = [];
    // build from the north end (index 0 = north-most car)
    // each unit (E6 / E8 + E5 run coupled nose to nose) has a nose car at both of its ends
    const list = [];
    for (const [type, n] of set.parts) for (let i = 0; i < n; i++) list.push({ type, k: i, n });
    let off = 0;
    list.forEach(({ type, k, n: nUnit }, i) => {
      const lv = LIVERY[type];
      const northEnd = k === 0, southEnd = k === nUnit - 1;
      const outer = (northEnd && i === 0) || (southEnd && i === list.length - 1);   // a lit end of the whole set
      const L = northEnd || southEnd ? lv.head : lv.len;
      const g = new THREE.Group();
      // a nose car is built with its nose at +x; the south end car is turned round
      const nose = northEnd || southEnd ? lv.nose : 0;
      const panto = !(northEnd || southEnd) && (nUnit <= 4 ? k === 1 : (k % 4 === 2));
      const geo = carGeometry(type, L, nose, panto);
      const body = new THREE.Mesh(geo.geo, lodMaterial());
      const inner = new THREE.Group();
      inner.add(body);
      if (southEnd && !northEnd) { inner.rotation.y = Math.PI; inner.position.x = L; }
      // lamps in the nose (head and tail lights share the clusters)
      for (const lp of geo.lamps) {
        const lamp = new THREE.Mesh(LAMP_GEO, lampMat(false));
        lamp.position.set(lp.x, lp.y, lp.z);
        lamp.rotation.y = Math.sign(lp.z) * 0.18;
        lamp.userData.north = northEnd;
        lamp.visible = outer;
        this.lamps.push(lamp);
        inner.add(lamp);
      }
      g.add(inner);
      g.userData = { L, off, type };
      off += L + 0.4;
      this.group.add(g);
      this.cars.push(g);
    });
    this.length = off;
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  }

  /**
   * place the train: frontS = position of its leading end (our chainage), dir = +1 northbound / -1,
   * pose(s) → {x, y, z, yaw} on its track
   */
  place(frontS, dir, pose) {
    this.cars.forEach((g) => {
      const { L, off } = g.userData;
      // car index 0 is the north end: northbound it leads, southbound it trails
      const sN = dir > 0 ? frontS - off : frontS - dir * (this.length - off - L);   // north end of this car
      const sMid = sN - L / 2;
      const p = pose(sMid);
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(0, p.yaw, 0);
      // car-local +x = north; lay the car out from -L/2 .. L/2
      g.children[0].position.x = (g.children[0].rotation.y ? L : 0) - L / 2;
    });
  }

  /** white head lights at the leading end, red tail lights at the trailing end */
  setDir(dir) {
    for (const l of this.lamps) l.material = lampMat(l.userData.north ? dir < 0 : dir > 0);
  }

  dispose() {
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// traffic
// ---------------------------------------------------------------------------
const OMIYA = 27640, UTSUNOMIYA = 105470;   // Shinkansen chainage of the stations every / some trains stop at

/** speed (km/h) at Shinkansen chainage ss for a set */
function speedAt(ss, set) {
  const acc = 0.45, dec = 0.7;                 // m/s²
  const toV = (d, a) => Math.sqrt(2 * a * Math.max(0, d)) * 3.6;
  let v = ss < OMIYA ? 125 : 275;
  v = Math.min(v, Math.max(25, toV(Math.abs(ss - OMIYA), ss < OMIYA ? dec : acc)));
  if (set.stopU) v = Math.min(v, Math.max(25, toV(Math.abs(ss - UTSUNOMIYA), dec)));
  else v = Math.min(v, 230);
  return Math.min(v, 275);
}

export class ShinkansenTraffic {
  constructor(scene, route, sound) {
    this.scene = scene;
    this.route = route;
    this.sound = sound;
    this.list = [];
    this.timer = 20 + Math.random() * 30;
    this.p = {};
  }

  /** is the Shinkansen in sight anywhere within dist of s? */
  near(s, dist) {
    for (let x = s - dist; x <= s + dist; x += 100) if (this.route.shinkansen(x)) return true;
    return false;
  }

  pick(ss) {
    const cands = SETS.filter((x) => (x.south ? ss < OMIYA : true));
    let w = cands.reduce((a, b) => a + b.w, 0) * Math.random();
    for (const c of cands) { w -= c.w; if (w <= 0) return c; }
    return cands[0];
  }

  spawn(camS) {
    const r = this.route;
    const dir = Math.random() < 0.5 ? 1 : -1;
    // start out of sight (2.5–4 km away) so it arrives at speed; overtakers come from behind
    const startS = camS - dir * (2500 + Math.random() * 1500);
    const sh = r.shinkansen(startS) || r.shinkansen(camS);
    const set = this.pick(sh ? sh.ss : camS);
    const tr = new ShinkansenSet(set);
    this.scene.add(tr.group);
    const voice = this.sound.addShinkansen ? this.sound.addShinkansen(tr.cars.length) : null;
    tr.setDir(dir);
    this.list.push({ tr, set, dir, s: startS, v: 0, voice, night: 0 });
  }

  update(dt, camS, night = 0) {
    const r = this.route;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = (50 + Math.random() * 90) / Math.max(0.05, DETAIL.shinkansen);
      if (DETAIL.shinkansen > 0.01 && this.list.length < 3 && this.near(camS, 2500)) this.spawn(camS);
    }
    const p = this.p;
    for (const t of this.list) {
      const sh = r.shinkansen(t.s);
      const ss = sh ? sh.ss : null;
      const vt = ss != null ? speedAt(ss, t.set) : (t.v || 200);
      t.v += Math.max(-1.5, Math.min(1.0, vt - t.v));
      if (!t.v) t.v = vt;
      t.s += t.dir * (t.v / 3.6) * dt;
      const lane = t.dir > 0 ? 2.15 : -2.15;   // left-hand running on the double track
      const pose = (s) => {
        const q = r.shinkansen(s) || r.shinkansen(t.s) || { lat: 0, h: 9 };
        r.pose(s, q.lat + lane, p);
        return { x: p.x, y: -0.62 + q.h + 0.62 + 0.36, z: p.z, yaw: p.yaw };
      };
      t.tr.group.visible = !!sh;
      if (sh) t.tr.place(t.s, t.dir, pose);
      // lamps: white at the leading end, red at the trailing end
      if (t.night !== night) t.night = night;
      if (t.voice) {
        const ends = [t.s, t.s - t.dir * t.tr.length / 2, t.s - t.dir * t.tr.length].map((s) => { const q = pose(s); return { x: q.x, y: q.y + 1.5, z: q.z }; });
        t.voice.update(ends, sh ? t.v : 0);
      }
    }
    // gone: far away or out of the corridor
    this.list = this.list.filter((t) => {
      const far = Math.abs(t.s - camS) > 6500 || (t.dir > 0 ? t.s - t.tr.length > camS + 3500 : t.s + t.tr.length < camS - 3500);
      if (far) { t.tr.dispose(); if (t.voice) t.voice.dispose(); }
      return !far;
    });
  }

  clear() { for (const t of this.list) { t.tr.dispose(); if (t.voice) t.voice.dispose(); } this.list = []; }
}
