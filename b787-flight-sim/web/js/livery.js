// Customisable airline livery: airline name + logo (with its colour scheme).
//
// The Blender fuselage texture is bare white paint with windows, doors and panel
// lines.  The belly colour, pin-stripes and the airline title are painted by a
// fragment-shader patch from the skin position in the design frame (the same
// frame the texture generator uses, see assets/livery.json), multiplying the
// baked detail like real paint.  The fin is a canvas texture drawn in metres on
// the fin's planar UV projection.
import * as THREE from 'three';
import { weatherMaterial } from './shading.js';
import { JAL_ICON, JAL_WORDMARK, ANA_LOGO, ANA_ASPECT, JAL_WORD_ASPECT } from './airlinelogos.js';
import { AIRLINE_SVG } from './airlinelogos2.js';

// ------------------------------------------------------------------ real airline marks (SVG images)
const IMG = {};
function svgImage(key, svg) {
  return new Promise((res) => {
    const im = new Image();
    IMG[key] = im;
    im.onload = () => res(); im.onerror = () => res();
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
// the menu, the aircraft and the AI fleet are drawn once these have loaded
// a single-colour copy of a mark (white on a dark fin, red title for a mono logo ...)
function tinted(key, color) {
  const k = key + '@' + color;
  if (!IMG[k] && imgOk(key)) {
    const src = IMG[key], cv = document.createElement('canvas');
    cv.width = Math.min(2048, src.naturalWidth * 2); cv.height = Math.round(cv.width * src.naturalHeight / src.naturalWidth);
    const c = cv.getContext('2d');
    c.drawImage(src, 0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
    IMG[k] = cv;
  }
  return k;
}
export const liveryImagesReady = typeof Image === 'undefined' ? Promise.resolve() : Promise.all([
  svgImage('jalIcon', JAL_ICON),
  svgImage('jalWord', JAL_WORDMARK),
  svgImage('ana', ANA_LOGO),
  svgImage('anaWhite', ANA_LOGO.replace(/#223f9a/gi, '#ffffff')),
  ...Object.entries(AIRLINE_SVG).flatMap(([k, v]) => [svgImage(k + 'Icon', v.icon), svgImage(k + 'Word', v.word)]),
]).then(() => {
  // single-colour variants used by the liveries
  for (const l of LOGOS) {
    if (l.markTint) tinted(l.id + 'Icon', l.markTint);
    if (l.titleTint) l.title.img = tinted(l.id + 'Word', l.titleTint);
  }
});
function imgOk(k) {
  const im = IMG[k];
  return !!im && (im.getContext ? im.width > 0 : im.complete && im.naturalWidth > 0);
}
function drawImg(ctx, key, x, y, w, h) { if (imgOk(key)) ctx.drawImage(IMG[key], x, y, w, h); }
// menu preview: the real wordmark at (x, y centre) with height h px; false for text liveries
export function drawLogoTitle(ctx, logo, x, y, h, maxW) {
  const T = logo.title;
  if (!T || !T.img) return false;
  let w = h * T.aspect;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  drawImg(ctx, T.img, x, y - h / 2, w, h);
  return true;
}

export const DEFAULT_LIVERY = { name: 'Japan Airlines', logo: 'jal' };

// ------------------------------------------------------------------ logo designs
// Each draw() works in a unit circle (radius 1, y down) centred at the origin.
function disc(ctx, r, fill) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function ring(ctx, r, w, stroke) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke(); }

// ------------------------------------------------------------------ major airlines (Japan + world)
// The scheme is painted from these parameters: belly colour below the cheat line (primary /
// primary2; plain = all-white fuselage), two pin-stripes (accent1 / accent2), the fin colours
// (tailTop / tailBottom, optional ribbons in the accent colours), the fin mark (the airline's
// icon, in its own colours or tinted) and the wordmark as the fuselage title.
const AIRLINE_SPEC = [
  // id, label, name, telephony, IATA, colours, options
  ['peach', 'Peach ピーチ', 'Peach Aviation', 'Air Peach', 'MM', { tailTop: '#c4007a', tailBottom: '#e0258f', nacelle: '#eef0f3' }, { plain: true, markTint: '#ffffff', titleH: 1.9 }],
  ['jetstar', 'Jetstar ジェットスター', 'Jetstar Japan', 'Orange Liner', 'GK', { tailTop: '#141414', tailBottom: '#262626', nacelle: '#eef0f3' }, { plain: true, titleH: 1.9 }],
  ['aa', 'American アメリカン航空', 'American Airlines', 'American', 'AA', { primary: '#b9bec5', primary2: '#cbd0d5', accent1: '#aeb4bb', accent2: '#cbd0d5', tailTop: '#eceef1', tailBottom: '#dadee3', nacelle: '#c3c8ce' }, { titleH: 1.25, tailScale: 1.35 }],
  ['delta', 'Delta デルタ航空', 'Delta Air Lines', 'Delta', 'DL', { primary: '#0b2b5c', primary2: '#123a73', accent1: '#123a73', accent2: '#123a73', tailTop: '#0b2b5c', tailBottom: '#123f7c', nacelle: '#0e3166' }, { titleH: 1.25 }],
  ['united', 'United ユナイテッド航空', 'United Airlines', 'United', 'UA', { primary: '#1c3f94', primary2: '#2449a3', accent1: '#2449a3', accent2: '#2449a3', tailTop: '#122f72', tailBottom: '#1c3f94', nacelle: '#1c3f94' }, { titleH: 1.3 }],
  ['ba', 'British Airways 英国航空', 'British Airways', 'Speedbird', 'BA', { primary: '#1f2f5f', primary2: '#26386e', accent1: '#d71921', accent2: '#f5f7f9', tailTop: '#1f2f5f', tailBottom: '#2c4687', nacelle: '#1f2f5f' }, { ribbons: true, markTint: '#ffffff', titleH: 1.3, tailScale: 1.3 }],
  ['lh', 'Lufthansa ルフトハンザ', 'Lufthansa', 'Lufthansa', 'LH', { tailTop: '#05164d', tailBottom: '#0a2066', nacelle: '#05164d' }, { plain: true, markTint: '#ffffff', titleH: 1.3 }],
  ['af', 'Air France エールフランス', 'Air France', 'Airfrans', 'AF', { accent1: '#002157', accent2: '#e3001b', tailTop: '#f7f8fa', tailBottom: '#eef0f3', nacelle: '#eef0f3' }, { plain: true, ribbons: true, titleH: 0.95 }],
  ['klm', 'KLM オランダ航空', 'KLM', 'KLM', 'KL', { primary: '#00a1de', primary2: '#0093cf', accent1: '#003e7e', accent2: '#f5f7f9', tailTop: '#009ad8', tailBottom: '#1ab0ea', nacelle: '#00a1de' }, { markTint: '#ffffff', titleH: 1.25 }],
  ['ek', 'Emirates エミレーツ', 'Emirates', 'Emirates', 'EK', { accent1: '#d71a21', accent2: '#00843d', tailTop: '#f7f8fa', tailBottom: '#eef0f3', nacelle: '#eef0f3' }, { plain: true, ribbons: true, titleH: 3.2, tailScale: 1.3 }],
  ['qr', 'Qatar カタール航空', 'Qatar Airways', 'Qatari', 'QR', { primary: '#c3c5c8', primary2: '#d3d5d8', accent1: '#c3c5c8', accent2: '#d3d5d8', tailTop: '#5c0632', tailBottom: '#72103f', nacelle: '#5c0632' }, { markTint: '#ffffff', titleH: 2.0, tailScale: 1.3 }],
  ['sq', 'Singapore シンガポール航空', 'Singapore Airlines', 'Singapore', 'SQ', { accent1: '#1d2c68', accent2: '#f99f1c', tailTop: '#1d2c68', tailBottom: '#28397f', nacelle: '#1d2c68' }, { plain: true, titleH: 2.4, tailScale: 1.3 }],
  ['cx', 'Cathay キャセイ', 'Cathay Pacific', 'Cathay', 'CX', { primary: '#a9b1b4', primary2: '#bcc3c6', accent1: '#006564', accent2: '#bcc3c6', tailTop: '#006564', tailBottom: '#00807c', nacelle: '#bcc3c6' }, { markTint: '#ffffff', titleH: 1.7, tailScale: 1.3 }],
  ['ke', 'Korean Air 大韓航空', 'Korean Air', 'Korean Air', 'KE', { primary: '#8cc4ea', primary2: '#a3d0f0', accent1: '#b8bec5', accent2: '#a3d0f0', tailTop: '#f7f8fa', tailBottom: '#eef0f3', nacelle: '#8cc4ea' }, { titleH: 1.25, tailScale: 1.3 }],
  ['qf', 'Qantas カンタス', 'Qantas', 'Qantas', 'QF', { tailTop: '#e40000', tailBottom: '#c60c30', nacelle: '#eef0f3' }, { plain: true, markTint: '#ffffff', titleTint: '#e40000', titleH: 1.5, tailScale: 1.35 }],
];
function REAL_AIRLINES() {
  const white = '#f5f7f9';
  return AIRLINE_SPEC.map(([id, label, name, tel, code, col, o]) => {
    const A = AIRLINE_SVG[id], ia = A.iconAspect;
    const colors = { primary: white, primary2: white, accent1: white, accent2: white, brand: col.tailTop, ...col };
    return {
      id, label, name, tel, code, real: true, colors,
      plain: !!o.plain, ribbons: !!o.ribbons, noSweep: true, tailScale: o.tailScale || 1.45, boxAspect: ia,
      markTint: o.markTint || null, titleTint: o.titleTint || null,
      title: { img: id + 'Word', aspect: A.wordAspect, h: o.titleH || 1.3 },
      // fin mark in a unit box (width 2 for wide marks, height 2 for tall ones)
      draw(ctx) {
        const w = ia >= 1 ? 2 : 2 * ia, h = w / ia;
        drawImg(ctx, o.markTint ? id + 'Icon@' + o.markTint : id + 'Icon', -w / 2, -h / 2, w, h);
      },
    };
  });
}

export const LOGOS = [
  {
    // Japan Airlines, 2011 "Tsurumaru" livery: all-white aircraft, red crane on the fin
    id: 'jal', label: 'JAL 日本航空', name: 'Japan Airlines', real: true, tel: 'Japan Air', code: 'JL',
    colors: { primary: '#f5f7f9', primary2: '#f5f7f9', accent1: '#f5f7f9', accent2: '#f5f7f9', tailTop: '#f7f8fa', tailBottom: '#f3f4f6', nacelle: '#eceef1', brand: '#e50012' },
    plain: true, noSweep: true, tailScale: 1.45, boxAspect: 1,
    title: { img: 'jalWord', aspect: JAL_WORD_ASPECT, h: 0.62 },
    draw(ctx) { drawImg(ctx, 'jalIcon', -1, -1, 2, 2); },
  },
  {
    // ANA "Triton Blue": white upper fuselage, Triton-blue belly with a Mohican-blue line,
    // Triton-blue fin with the white ANA mark
    id: 'ana', label: 'ANA 全日空', name: 'ANA', real: true, tel: 'All Nippon', code: 'NH',
    colors: { primary: '#1d3a91', primary2: '#223f9a', accent1: '#00b3f0', accent2: '#f5f7f9', tailTop: '#1a3688', tailBottom: '#223f9a', nacelle: '#eef0f3', brand: '#223f9a' },
    tailScale: 1.6, boxAspect: ANA_ASPECT,
    title: { img: 'ana', aspect: ANA_ASPECT, h: 1.9 },
    draw(ctx, onDark = true) { const w = 2, h = w / ANA_ASPECT; drawImg(ctx, onDark ? 'anaWhite' : 'ana', -w / 2, -h / 2, w, h); },
  },
  ...REAL_AIRLINES(),
];

export const logoById = (id) => LOGOS.find((l) => l.id === id) || LOGOS[0];

export function randomLivery(rnd = Math.random) {
  const l = LOGOS[Math.floor(rnd() * LOGOS.length)];
  return { name: l.name, logo: l.id };
}

// small preview icon for the menu
export function drawLogoIcon(canvas, logo) {
  const c = canvas.getContext('2d'), s = canvas.width;
  c.clearRect(0, 0, s, s);
  const g = c.createLinearGradient(0, s, s, 0);
  g.addColorStop(0, logo.colors.tailBottom); g.addColorStop(1, logo.colors.tailTop);
  c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(0, 0, s, s, s * 0.18) : c.rect(0, 0, s, s); c.fill();
  c.save(); c.translate(s / 2, s / 2); c.scale(s * 0.4, s * 0.4); logo.draw(c); c.restore();
}

// ------------------------------------------------------------------ fin texture
function tailCanvas(logo, T, W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const sx = W / (T.s1 - T.s0), sy = H / (T.z1 - T.z0);
  // draw in metres: x = s (aft), y = z (up); image top = fin tip (glTF v = 0)
  c.setTransform(sx, 0, 0, -sy, -T.s0 * sx, T.z1 * sy);
  const g = c.createLinearGradient(T.s0, T.z0, T.s1, T.z1);
  g.addColorStop(0, logo.colors.tailBottom); g.addColorStop(1, logo.colors.tailTop);
  c.fillStyle = g; c.fillRect(T.s0 - 1, T.z0 - 1, T.s1 - T.s0 + 2, T.z1 - T.z0 + 2);
  // fin artwork is laid out for the 787-9 fin (k = 1, sRef = 48 m) and scaled to the other fins
  const k = T.k ?? 1, sR = T.sRef ?? 48.0;
  if (logo.ribbons) {
    for (const [off, w, col] of [[0.0, 0.34, logo.colors.accent1], [0.55, 0.07, logo.colors.accent2]]) {
      const zc = (S) => T.z0 + (1.2 + off) * k + (S - sR) * 0.36 + 0.035 * (S - sR) ** 2 / k;
      c.beginPath();
      for (let S = sR - k; S <= T.s1 + 0.01; S += 0.1) c.lineTo(S, zc(S) + w * k / 2);
      for (let S = T.s1; S >= sR - k; S -= 0.1) c.lineTo(S, zc(S) - w * k / 2);
      c.closePath(); c.fillStyle = col; c.fill();
    }
  } else if (!logo.noSweep) {
    // a single accent sweep along the fin root
    c.beginPath(); c.moveTo(T.s0, T.z0); c.lineTo(T.s1, T.z0);
    c.lineTo(T.s1, T.z0 + 1.1 * k); c.quadraticCurveTo(sR + 4 * k, T.z0 + 0.4 * k, T.s0, T.z0 + 0.35 * k); c.closePath();
    c.fillStyle = logo.colors.accent1; c.fill();
  }
  const [cs, cz, r] = T.logo;
  const ts = r * 1.12 * (logo.tailScale || 1);
  void cs; void cz; void ts;
  return cv;
}

// fin mark as its own texture: the fin shader draws it readable on both sides (mirrored on
// the right-hand skin, where the planar fin UVs run backwards)
function finLogoCanvas(logo, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.translate(size / 2, size / 2); c.scale(size / 2, size / 2);
  logo.draw(c);
  return cv;
}
function finRect(logo, T) {
  const [cs, cz, r] = T.logo, k = T.k ?? 1, sh = logo.tailShift || [0, 0];
  const rMax = r * 1.12 * (logo.tailScale || 1);
  if (T.fin && T.fin.length > 3) {
    const f = fitFin(T.fin, rMax, logo.boxAspect || 1);
    if (f) return new THREE.Vector4(f[0], f[1], f[2], 0);
  }
  return new THREE.Vector4(cs + sh[0] * k, cz + sh[1] * k, rMax, 0);
}

// Largest mark (half-width R, box aspect a = width / height) that fits inside the fin outline
// [z, leading edge s, trailing edge s], low on the fin and as far aft as it goes.
function fitFin(F, rMax, a) {
  const at = (z, c) => {
    if (z <= F[0][0]) return F[0][c];
    for (let i = 1; i < F.length; i++) if (z <= F[i][0]) { const t = (z - F[i - 1][0]) / (F[i][0] - F[i - 1][0]); return F[i - 1][c] + t * (F[i][c] - F[i - 1][c]); }
    return F[F.length - 1][c];
  };
  const z0 = F[0][0], zTop = F[F.length - 1][0], H = zTop - z0, m = 0.035 * H;
  let best = null;
  for (let fb = 0.22; fb <= 0.451; fb += 0.01) {
    const zb = z0 + fb * H;
    let R = rMax;
    for (let it = 0; it < 60; it++, R *= 0.97) {
      const zt = zb + 2 * R / a;
      if (zt > zTop - m) continue;
      let le = -1e9, te = 1e9;
      for (let z = zb; z <= zt + 1e-6; z += 0.1) { le = Math.max(le, at(z, 1)); te = Math.min(te, at(z, 2)); }
      if (te - le - 2 * m >= 2 * R) {
        if (!best || R > best[2] + 1e-3) best = [te - m - R, zb + R / a, R];
        break;
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ title texture
// real airline wordmark as the fuselage title (height in metres = capHeight * title.h)
function imageTitleCanvas(logo, TI) {
  const T = logo.title;
  let hM = TI.capHeight * T.h, lenM = hM * T.aspect;
  if (lenM > TI.maxLen) { lenM = TI.maxLen; hM = lenM / T.aspect; }
  const H = 256, W = Math.min(4096, Math.round(H * T.aspect));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  drawImg(cv.getContext('2d'), T.img, 0, 0, W, H);
  return { canvas: cv, len: lenM, height: hM };
}

function titleCanvas(name, logo, TI) {
  if (logo.title && logo.title.img) return imageTitleCanvas(logo, TI);
  const H = 192, boxM = TI.capHeight * 1.5;           // box height (m) includes descenders
  let ppm = H / boxM;
  const font = (px) => `italic 800 ${px}px "Helvetica Neue", Helvetica, Arial, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  let capPx = TI.capHeight * ppm, fontPx = capPx / 0.72;
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  const first = words.join(' ');
  const cv = document.createElement('canvas');
  let c = cv.getContext('2d');
  const measure = () => {
    c.font = font(fontPx);
    const gap = last ? c.measureText(' ').width * 1.4 : 0;
    return { w1: c.measureText(first).width, gap, w2: last ? c.measureText(last).width : 0 };
  };
  let m = measure();
  let wPx = m.w1 + m.gap + m.w2 + 8;
  // long names: shrink to fit the space between the forward door and the wing
  const maxPx = TI.maxLen * ppm;
  if (wPx > maxPx) { fontPx *= maxPx / wPx; capPx = fontPx * 0.72; m = measure(); wPx = m.w1 + m.gap + m.w2 + 8; }
  cv.width = Math.min(4096, Math.ceil(wPx)); cv.height = H;
  if (cv.width < wPx) ppm *= cv.width / wPx;        // clamp: scale the metre mapping instead
  c = cv.getContext('2d');
  c.font = font(fontPx);
  c.textBaseline = 'alphabetic';
  const base = H / 2 + capPx / 2;
  const k = cv.width / wPx;
  c.setTransform(k, 0, 0, 1, 0, 0);
  c.fillStyle = logo.colors.accent1 === '#ffffff' ? logo.colors.primary : logo.colors.primary;
  c.fillText(first, 4, base);
  if (last) { c.fillStyle = contrastOnWhite(logo.colors.accent1) ? logo.colors.accent1 : logo.colors.primary2; c.fillText(last, 4 + m.w1 + m.gap, base); }
  return { canvas: cv, len: wPx / ppm, height: H / ppm };
}

function contrastOnWhite(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.45;   // linear luminance
}

// ------------------------------------------------------------------ cache
const cache = new Map();
function canvasTex(cv, premul) {
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.premultiplyAlpha = !!premul;
  return t;
}

export function liveryAssets(liv, layout, big = true) {
  // the fin / title layout differs per aircraft type
  const key = liv.logo + '|' + liv.name + '|' + (big ? 1 : 0) + '|' + layout.tail.s0 + '|' + layout.tail.z1 + '|' + layout.title.s0;
  if (cache.has(key)) return cache.get(key);
  const logo = logoById(liv.logo);
  const tail = canvasTex(tailCanvas(logo, layout.tail, big ? 2048 : 768, big ? 1536 : 576));
  const tt = titleCanvas(liv.name || ' ', logo, layout.title);
  const title = canvasTex(tt.canvas, true);
  const col = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
  const a = {
    logo, tail, title,
    prim: col(logo.plain ? layout.white : logo.colors.primary), prim2: col(logo.plain ? layout.white : logo.colors.primary2),
    acc1: col(logo.plain ? layout.white : logo.colors.accent1), acc2: col(logo.plain ? layout.white : logo.colors.accent2),
    finLogo: canvasTex(finLogoCanvas(logo, big ? 1024 : 256), false), finRect: finRect(logo, layout.tail),
    nacelle: col(logo.colors.nacelle || logo.colors.primary), brand: col(logo.colors.brand || logo.colors.primary),
    titleRect: new THREE.Vector4(layout.title.s0, tt.len, layout.title.zc + tt.height / 2, tt.height),
  };
  cache.set(key, a);
  return a;
}

// ------------------------------------------------------------------ shader
export function liveryUniforms(layout) {
  const B = layout.belly;
  const w = new THREE.Color(layout.white);
  return {
    uLivSCG: { value: layout.sCG },
    uLivBS: { value: B.s.slice() }, uLivBZ: { value: B.z.slice() },
    uLivFade: { value: B.fade },
    uLivStripes: { value: new THREE.Vector4(B.stripes[0][0], B.stripes[0][1], B.stripes[1][0], B.stripes[1][1]) },
    uLivStripeS0: { value: B.stripeS0 },
    uLivWhite: { value: new THREE.Vector3(w.r, w.g, w.b) },
    uLivPrim: { value: new THREE.Vector3() }, uLivPrim2: { value: new THREE.Vector3() },
    uLivAcc1: { value: new THREE.Vector3() }, uLivAcc2: { value: new THREE.Vector3() },
    uLivTitle: { value: null }, uLivTitleRect: { value: new THREE.Vector4() },
  };
}

export function setLiveryUniforms(u, a) {
  u.uLivPrim.value.copy(a.prim); u.uLivPrim2.value.copy(a.prim2);
  u.uLivAcc1.value.copy(a.acc1); u.uLivAcc2.value.copy(a.acc2);
  u.uLivTitle.value = a.title; u.uLivTitleRect.value.copy(a.titleRect);
}

export function finUniforms(layout) {
  return { uFinLogo: { value: null }, uFinRect: { value: new THREE.Vector4() }, uFinSCG: { value: layout.sCG } };
}
export function setFinUniforms(u, a) { u.uFinLogo.value = a.finLogo; u.uFinRect.value.copy(a.finRect); }
// localExpr: vertex position in the aircraft root frame (x = sCG - s, y = z, z = -y)
export function patchFinShader(sh, uniforms, localExpr) {
  Object.assign(sh.uniforms, uniforms);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFinP;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvFinP = ${localExpr};`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFinP;\nuniform sampler2D uFinLogo; uniform vec4 uFinRect; uniform float uFinSCG;')
    .replace('#include <map_fragment>', `#include <map_fragment>
{
  float s = uFinSCG - vFinP.x, z = vFinP.y;
  vec2 fu = vec2((s - uFinRect.x) / (2.0 * uFinRect.z) + 0.5, 0.5 - (z - uFinRect.y) / (2.0 * uFinRect.z));
  if (vFinP.z > 0.0) fu.x = 1.0 - fu.x;       // right-hand side: read front-to-back the other way
  if (fu.x > 0.0 && fu.x < 1.0 && fu.y > 0.0 && fu.y < 1.0) {
    vec4 lc = texture2D(uFinLogo, fu);
    diffuseColor.rgb = mix(diffuseColor.rgb, lc.rgb, lc.a);
  }
}`);
}

// localExpr: GLSL expression giving the vertex position in the aircraft root frame
export function patchLiveryShader(sh, uniforms, localExpr) {
  Object.assign(sh.uniforms, uniforms);
  const n = uniforms.uLivBS.value.length;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLivP;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLivP = ${localExpr};`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vLivP;
uniform float uLivSCG, uLivFade, uLivStripeS0;
uniform float uLivBS[${n}], uLivBZ[${n}];
uniform vec4 uLivStripes, uLivTitleRect;
uniform vec3 uLivWhite, uLivPrim, uLivPrim2, uLivAcc1, uLivAcc2;
uniform sampler2D uLivTitle;
float livBelly(float s) {
  float z = uLivBZ[0];
  for (int i = 1; i < ${n}; i++) {
    if (s >= uLivBS[i - 1] && s <= uLivBS[i]) z = mix(uLivBZ[i - 1], uLivBZ[i], (s - uLivBS[i - 1]) / max(uLivBS[i] - uLivBS[i - 1], 1e-4));
  }
  if (s > uLivBS[${n - 1}]) z = uLivBZ[${n - 1}];
  return z;
}`)
    .replace('#include <map_fragment>', `#include <map_fragment>
{
  float s = uLivSCG - vLivP.x, z = vLivP.y;
  float zl = livBelly(s);
  float aw = max(fwidth(z), 1e-4) * 0.9 + 0.003;
  vec3 f = vec3(1.0);
  float paint = clamp(0.5 - (z - zl) / aw, 0.0, 1.0);
  f = mix(f, mix(uLivPrim2, uLivPrim, clamp((zl - z) / uLivFade, 0.0, 1.0)) / uLivWhite, paint);
  if (s > uLivStripeS0) {
    float d1 = abs(z - (zl + uLivStripes.x)) - 0.5 * uLivStripes.y;
    f = mix(f, uLivAcc1 / uLivWhite, clamp(0.5 - d1 / aw, 0.0, 1.0));
    float d2 = abs(z - (zl + uLivStripes.z)) - 0.5 * uLivStripes.w;
    f = mix(f, uLivAcc2 / uLivWhite, clamp(0.5 - d2 / aw, 0.0, 1.0));
  }
  bool leftSide = vLivP.z < 0.0;
  float tu = leftSide ? (s - uLivTitleRect.x) / uLivTitleRect.y : (uLivTitleRect.x + uLivTitleRect.y - s) / uLivTitleRect.y;
  float tv = (uLivTitleRect.z - z) / uLivTitleRect.w;
  if (tu > 0.0 && tu < 1.0 && tv > 0.0 && tv < 1.0 && abs(vLivP.z) > 1.2) {
    vec4 tc = texture2D(uLivTitle, vec2(tu, tv));
    f = f * (1.0 - tc.a) + tc.rgb / uLivWhite;
  }
  diffuseColor.rgb *= f;
}`);
}

// ------------------------------------------------------------------ persistence
export function loadSavedLivery() {
  try {
    const v = JSON.parse(localStorage.getItem('b787.livery') || 'null');
    if (v && typeof v.name === 'string' && LOGOS.some((l) => l.id === v.logo)) return { name: v.name.slice(0, 28), logo: v.logo };
  } catch (e) { /* storage unavailable */ }
  return { ...DEFAULT_LIVERY };
}
export function saveLivery(l) {
  try { localStorage.setItem('b787.livery', JSON.stringify(l)); } catch (e) { /* ignore */ }
}

// ------------------------------------------------------------------ parked aircraft
const matCache = new Map();
export function dressParked(group, liv, layout) {
  const a = liveryAssets(liv, layout, false);
  const key = liv.logo + '|' + liv.name;
  group.traverse((m) => {
    if (!m.isMesh) return;
    const base = m.material;       // fresh clones share the template's materials
    const n = base.name;
    if (!['B787_Fuselage', 'B787_Tail', 'B787_Navy', 'B787_Nacelle'].includes(n)) return;
    const k = base.uuid + '|' + key;
    if (!matCache.has(k)) {
      const mm = base.clone();
      delete mm.userData.weathered;
      mm.onBeforeCompile = () => {};
      mm.customProgramCacheKey = () => '';
      if (n === 'B787_Tail') {
        mm.map = a.tail; mm.color.set(0xffffff);
        const fu = finUniforms(layout); setFinUniforms(fu, a);
        mm.onBeforeCompile = (sh) => patchFinShader(sh, fu, 'position');
        mm.customProgramCacheKey = () => 'fin';
      }
      else if (n === 'B787_Navy' || n === 'B787_Nacelle') mm.color.setRGB(a.nacelle.x, a.nacelle.y, a.nacelle.z, THREE.LinearSRGBColorSpace);
      else {
        const u = liveryUniforms(layout); setLiveryUniforms(u, a);
        mm.onBeforeCompile = (sh) => patchLiveryShader(sh, u, 'position');
        mm.customProgramCacheKey = () => 'livery';
      }
      weatherMaterial(mm);
      matCache.set(k, mm);
    }
    m.material = matCache.get(k);
  });
}
