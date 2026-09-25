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

export const DEFAULT_LIVERY = { name: 'Claude Air', logo: 'spark' };

// ------------------------------------------------------------------ logo designs
// Each draw() works in a unit circle (radius 1, y down) centred at the origin.
function disc(ctx, r, fill) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function ring(ctx, r, w, stroke) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke(); }

export const LOGOS = [
  {
    id: 'spark', label: 'スパーク Spark', name: 'Claude Air',
    colors: { primary: '#b8583a', primary2: '#d9774f', accent1: '#2a211d', accent2: '#e9b98f', tailTop: '#c7623f', tailBottom: '#8f3f27' },
    ribbons: false,
    draw(ctx) {
      // hand-drawn radiant burst: 12 tapered rays of alternating length
      ctx.fillStyle = '#f7efe6';
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + 0.13, len = i % 2 ? 0.72 : 1.0, w = i % 2 ? 0.09 : 0.12;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0.08, -w * 0.55);
        ctx.quadraticCurveTo(len * 0.6, -w * 0.7, len, 0);
        ctx.quadraticCurveTo(len * 0.6, w * 0.7, 0.08, w * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      disc(ctx, 0.2, '#f7efe6');
    },
  },
  {
    id: 'crane', label: '鶴 Crane', name: 'Tsuru Airlines',
    colors: { primary: '#b3122e', primary2: '#d42a45', accent1: '#1d1d1f', accent2: '#c9a24a', tailTop: '#ffffff', tailBottom: '#eef0f3' },
    ribbons: false,
    draw(ctx) {
      disc(ctx, 1.0, '#c8102e');
      // stylised crane: two sweeping wings, neck and head crest
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-0.05, 0.15);
      ctx.bezierCurveTo(-0.45, -0.05, -0.75, -0.45, -0.8, -0.1);
      ctx.bezierCurveTo(-0.6, 0.05, -0.35, 0.2, -0.05, 0.32);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.05, 0.15);
      ctx.bezierCurveTo(0.45, -0.05, 0.75, -0.45, 0.8, -0.1);
      ctx.bezierCurveTo(0.6, 0.05, 0.35, 0.2, 0.05, 0.32);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.07, 0.34); ctx.quadraticCurveTo(0, 0.1, 0.02, -0.45);
      ctx.lineTo(0.09, -0.47); ctx.quadraticCurveTo(0.08, 0.1, 0.07, 0.34); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.02, -0.46); ctx.lineTo(0.26, -0.5); ctx.lineTo(0.08, -0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.08, 0.3); ctx.lineTo(0, 0.62); ctx.lineTo(0.08, 0.3); ctx.closePath(); ctx.fill();
      disc(ctx, 0, '#fff');
      ctx.save(); ctx.translate(0.05, -0.5); disc(ctx, 0.06, '#1d1d1f'); ctx.restore();
    },
  },
  {
    id: 'skyline', label: 'スカイライン Skyline', name: 'City Builder Airways',
    colors: { primary: '#0b2a5c', primary2: '#123f86', accent1: '#1fb4e6', accent2: '#f2b233', tailTop: '#08204a', tailBottom: '#0b2a5c' },
    ribbons: true,
    draw(ctx) {
      ring(ctx, 1.06, 0.05, '#f6f8fb');
      disc(ctx, 0.97, '#f6f8fb');
      disc(ctx, 0.9, '#f2b233');
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#0b2a5c';
      const hs = [0.4, 0.62, 0.3, 0.75, 0.5, 0.95, 1.25, 1.02, 0.58, 0.8, 0.45, 0.66, 0.35];
      const n = hs.length, w = 1.8 / n;
      for (let i = 0; i < n; i++) ctx.fillRect(-0.9 + i * w + w * 0.12, 0.35 - hs[i], w * 0.76, hs[i]);
      ctx.fillRect(-0.9 + 6 * w + w * 0.44, 0.35 - 1.45, w * 0.12, 0.3);
      ctx.fillRect(-1, 0.34, 2, 1);
      ctx.restore();
    },
  },
  {
    id: 'wave', label: '波 Wave', name: 'Pacific Wave',
    colors: { primary: '#0d5f7a', primary2: '#16809f', accent1: '#35c3d9', accent2: '#ffffff', tailTop: '#0b4d66', tailBottom: '#0d6c8a' },
    ribbons: true,
    draw(ctx) {
      disc(ctx, 1.0, '#f4fbfd');
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 0.92, 0, Math.PI * 2); ctx.clip();
      const cols = ['#35c3d9', '#1c93b3', '#0d5f7a'];
      for (let k = 0; k < 3; k++) {
        const y0 = -0.2 + k * 0.32;
        ctx.beginPath(); ctx.moveTo(-1.1, 1.2); ctx.lineTo(-1.1, y0 + 0.2);
        for (let x = -1.1; x <= 1.1; x += 0.05) {
          const ph = (x + 1.1) * 3.1 + k * 1.3;
          ctx.lineTo(x, y0 + 0.13 * Math.sin(ph) - 0.07 * Math.max(0, Math.sin(ph * 0.5 + 1)) ** 6);
        }
        ctx.lineTo(1.1, 1.2); ctx.closePath(); ctx.fillStyle = cols[k]; ctx.fill();
      }
      ctx.restore();
      ring(ctx, 0.96, 0.08, '#0d5f7a');
    },
  },
  {
    id: 'fuji', label: '富士 Fuji', name: 'Fuji Sky',
    colors: { primary: '#3b2d7a', primary2: '#5241a0', accent1: '#e85d8a', accent2: '#f5c542', tailTop: '#2f2463', tailBottom: '#4a3a93' },
    ribbons: true,
    draw(ctx) {
      disc(ctx, 1.0, '#fdf2f6');
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 0.94, 0, Math.PI * 2); ctx.clip();
      ctx.save(); ctx.translate(0.35, -0.35); disc(ctx, 0.3, '#e85d8a'); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-1.1, 0.75); ctx.lineTo(-0.22, -0.3); ctx.lineTo(0.22, -0.3); ctx.lineTo(1.1, 0.75);
      ctx.lineTo(1.1, 1.2); ctx.lineTo(-1.1, 1.2); ctx.closePath(); ctx.fillStyle = '#3b2d7a'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.22, -0.3); ctx.lineTo(0.22, -0.3); ctx.lineTo(0.43, -0.05);
      ctx.lineTo(0.25, 0.02); ctx.lineTo(0.12, -0.08); ctx.lineTo(0, 0.04); ctx.lineTo(-0.14, -0.07); ctx.lineTo(-0.28, 0.03);
      ctx.lineTo(-0.43, -0.05); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      ring(ctx, 0.97, 0.06, '#e85d8a');
    },
  },
  {
    id: 'globe', label: '地球 Globe', name: 'Globe Link',
    colors: { primary: '#0e6b47', primary2: '#16875b', accent1: '#9bd34a', accent2: '#f2c94c', tailTop: '#0b5a3b', tailBottom: '#0f7a51' },
    ribbons: false,
    draw(ctx) {
      disc(ctx, 0.8, '#ffffff');
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = '#0e6b47'; ctx.lineWidth = 0.07;
      for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(-1, k * 0.8); ctx.lineTo(1, k * 0.8); ctx.stroke(); }
      for (const k of [0.35, 0.72]) { ctx.beginPath(); ctx.ellipse(0, 0, 0.8 * k, 0.8, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 1); ctx.stroke();
      ctx.restore();
      ring(ctx, 0.8, 0.08, '#0e6b47');
      // orbit swoosh
      ctx.save(); ctx.rotate(-0.4);
      ctx.beginPath(); ctx.ellipse(0, 0, 1.0, 0.36, 0, Math.PI * 0.95, Math.PI * 2.25);
      ctx.lineWidth = 0.1; ctx.strokeStyle = '#9bd34a'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.translate(1.0 * Math.cos(Math.PI * 2.25), 0.36 * Math.sin(Math.PI * 2.25)); disc(ctx, 0.1, '#f2c94c');
      ctx.restore();
    },
  },
  {
    id: 'plane', label: '紙飛行機 Arrow', name: 'Aero Swift',
    colors: { primary: '#c8102e', primary2: '#e0303f', accent1: '#1d2a5c', accent2: '#f2b233', tailTop: '#1d2a5c', tailBottom: '#2a3b7a' },
    ribbons: true,
    draw(ctx) {
      disc(ctx, 1.0, '#c8102e');
      ctx.save(); ctx.rotate(-0.35);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0.75, 0); ctx.lineTo(-0.65, -0.42); ctx.lineTo(-0.3, 0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9dde6';
      ctx.beginPath(); ctx.moveTo(0.75, 0); ctx.lineTo(-0.3, 0.02); ctx.lineTo(-0.5, 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2b233';
      ctx.fillRect(-0.95, 0.08, 0.5, 0.06); ctx.fillRect(-0.85, 0.22, 0.32, 0.06);
      ctx.restore();
    },
  },
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
  } else {
    // a single accent sweep along the fin root
    c.beginPath(); c.moveTo(T.s0, T.z0); c.lineTo(T.s1, T.z0);
    c.lineTo(T.s1, T.z0 + 1.1 * k); c.quadraticCurveTo(sR + 4 * k, T.z0 + 0.4 * k, T.s0, T.z0 + 0.35 * k); c.closePath();
    c.fillStyle = logo.colors.accent1; c.fill();
  }
  const [cs, cz, r] = T.logo;
  c.save(); c.translate(cs, cz); c.scale(r * 1.12, -r * 1.12); logo.draw(c); c.restore();
  return cv;
}

// ------------------------------------------------------------------ title texture
function titleCanvas(name, logo, TI) {
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
    prim: col(logo.colors.primary), prim2: col(logo.colors.primary2),
    acc1: col(logo.colors.accent1), acc2: col(logo.colors.accent2),
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
      if (n === 'B787_Tail') { mm.map = a.tail; mm.color.set(0xffffff); }
      else if (n === 'B787_Navy' || n === 'B787_Nacelle') mm.color.setRGB(a.prim.x, a.prim.y, a.prim.z, THREE.LinearSRGBColorSpace);
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
