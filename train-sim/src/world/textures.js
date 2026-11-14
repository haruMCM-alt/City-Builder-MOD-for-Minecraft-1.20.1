// Procedural canvas textures for the scenery (no external images needed).
import * as THREE from 'three';
import { rng, fbm } from './noise.js';
import { UI_FONT } from '../displays.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  return t;
}

/** normal map from the luminance of a canvas */
function normalFrom(c, strength = 2) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 765;
  const out = canvas(w, h);
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
      const u = H[((y - 1 + h) % h) * w + x], d = H[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(out, { srgb: false });
}

function speckle(g, w, h, n, colors, rmin, rmax, rnd) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = rmin + rnd() * (rmax - rmin);
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, 7);
    g.fill();
  }
}

/** tileable fbm into a canvas through a colour ramp */
function noiseCanvas(w, scale, ramp, seed) {
  const c = canvas(w);
  const g = c.getContext('2d');
  const img = g.createImageData(w, w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      // tileable by blending four samples
      const fx = x / w, fy = y / w;
      const n = (fbm(fx * scale, fy * scale, 4, seed) * (1 - fx) * (1 - fy)
        + fbm((fx - 1) * scale, fy * scale, 4, seed) * fx * (1 - fy)
        + fbm(fx * scale, (fy - 1) * scale, 4, seed) * (1 - fx) * fy
        + fbm((fx - 1) * scale, (fy - 1) * scale, 4, seed) * fx * fy);
      const [r, gg, b] = ramp(n);
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** dirt: faint vertical rain streaks below window sills, grime noise, darker toward the bottom */
function weather(g, w, h, R, amt = 1, sills = []) {
  for (const [x0, x1, y] of sills) {
    for (let x = x0; x < x1; x += 2 + R() * 4) {
      const len = 6 + R() * 26;
      const grd = g.createLinearGradient(0, y, 0, y + len);
      grd.addColorStop(0, `rgba(60,55,50,${0.10 * amt})`);
      grd.addColorStop(1, 'rgba(60,55,50,0)');
      g.fillStyle = grd; g.fillRect(x, y, 1 + R() * 2, len);
    }
  }
  for (let i = 0; i < w * h / 90; i++) {
    g.fillStyle = `rgba(${R() < 0.5 ? '40,38,35' : '255,255,250'},${0.025 * amt})`;
    g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3);
  }
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(40,36,30,${0.06 * amt})`);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function makeTextures() {
  const T = {};
  const R = rng(1234);

  // ---- grass (large-scale macro variation is done in the shader via a second texture)
  {
    const c = noiseCanvas(512, 6, (n) => mix3([66, 80, 40], [132, 134, 78], Math.min(1, Math.max(0, (n - 0.3) * 2))), 3);
    const g = c.getContext('2d');
    for (let i = 0; i < 26000; i++) {
      const x = R() * 512, y = R() * 512;
      const l = 30 + R() * 50;
      g.strokeStyle = R() < 0.2 ? `rgba(${l + 90},${l + 80},${l + 20},${0.3 + R() * 0.3})` : `rgba(${l + 40},${l + 66},${l * 0.55},${0.25 + R() * 0.3})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 5); g.stroke();
    }
    T.grass = tex(c);
    T.grassN = normalFrom(c, 3);
  }
  T.macro = tex(noiseCanvas(256, 3, (n) => { const v = 150 + n * 105; return [v, v, v]; }, 9));

  // ---- ballast: crushed stone
  {
    const c = canvas(512);
    const g = c.getContext('2d');
    g.fillStyle = '#6d6862'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5200; i++) {
      const x = R() * 512, y = R() * 512, r = 3 + R() * 7;
      const l = 90 + R() * 90;
      g.fillStyle = `rgb(${l},${l * 0.97},${l * 0.93})`;
      g.beginPath();
      const n = 5 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + R() * 0.5, rr = r * (0.6 + R() * 0.5);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
      g.fillStyle = `rgba(255,255,255,${0.15 * R()})`;
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, 7); g.fill();
    }
    // rusty brown towards the rail area
    g.fillStyle = 'rgba(90,60,40,0.10)'; g.fillRect(0, 0, 512, 512);
    T.ballast = tex(c);
    T.ballastN = normalFrom(c, 5);
  }

  // ---- asphalt + road with markings (u across the road)
  {
    const c = noiseCanvas(256, 20, (n) => { const v = 52 + n * 40; return [v, v, v * 1.02]; }, 5);
    const g = c.getContext('2d');
    speckle(g, 256, 256, 2500, ['rgba(200,200,200,0.25)', 'rgba(20,20,20,0.3)'], 0.4, 1.2, R);
    T.asphalt = tex(c);
    const r = canvas(256, 512);
    const rg = r.getContext('2d');
    rg.drawImage(c, 0, 0); rg.drawImage(c, 0, 256);
    rg.fillStyle = 'rgba(235,235,230,0.9)';
    rg.fillRect(10, 0, 5, 512); rg.fillRect(241, 0, 5, 512);
    rg.fillStyle = 'rgba(240,240,235,0.85)';
    for (let y = 0; y < 512; y += 128) rg.fillRect(125, y, 6, 64);
    T.road = tex(r);
  }

  // ---- rice paddy, ripening (稲穂): light neutral texture, tinted per block by vertex colour
  {
    const c = canvas(512);
    const g = c.getContext('2d');
    g.fillStyle = '#b9ad84'; g.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 512; row += 8) {
      g.fillStyle = 'rgba(70,62,40,0.35)';
      g.fillRect(0, row + 6, 512, 2);
      for (let x = 0; x < 512; x += 5) {
        const l = 170 + R() * 70;
        g.fillStyle = `rgb(${l},${l * 0.93},${l * 0.62})`;
        g.beginPath(); g.ellipse(x + R() * 2, row + 3 + R() * 2, 3.2, 2.6, R(), 0, 7); g.fill();
        if (R() < 0.5) { g.fillStyle = `rgba(110,120,60,${0.3 + R() * 0.3})`; g.fillRect(x + R() * 4, row + R() * 5, 1, 2); }
      }
    }
    T.paddy = tex(c);
    T.paddyN = normalFrom(c, 2.5);
  }
  // ---- vegetable field: soil + crop rows
  {
    const c = noiseCanvas(512, 10, (n) => mix3([96, 72, 50], [130, 100, 70], n), 11);
    const g = c.getContext('2d');
    for (let x = 0; x < 512; x += 16) {
      for (let y = 0; y < 512; y += 5) {
        const l = 60 + R() * 70;
        g.fillStyle = `rgb(${l * 0.6},${l + 50},${l * 0.4})`;
        g.beginPath(); g.ellipse(x + 8 + (R() - 0.5) * 2, y, 3.5, 3, 0, 0, 7); g.fill();
      }
    }
    T.field = tex(c);
  }
  // ---- bare soil (ball grounds, farm yards)
  {
    const c = noiseCanvas(256, 12, (n) => mix3([150, 122, 90], [188, 160, 122], n), 13);
    const g = c.getContext('2d');
    speckle(g, 256, 256, 1800, ['rgba(90,70,50,0.3)', 'rgba(230,210,180,0.3)'], 0.5, 1.5, R);
    T.soil = tex(c);
  }
  // ---- concrete
  {
    const c = noiseCanvas(256, 8, (n) => { const v = 150 + n * 50; return [v, v * 0.99, v * 0.96]; }, 21);
    const g = c.getContext('2d');
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,55,50,${0.03 + R() * 0.05})`;
      const x = R() * 256;
      g.fillRect(x, 0, 2 + R() * 6, 256);
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    T.concrete = tex(c);
  }
  // ---- roof tiles (kawara) and colour-steel roofs (greyscale; tinted by vertex colour)
  {
    const c = canvas(256);
    const g = c.getContext('2d');
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        const grd = g.createLinearGradient(x, 0, x + 16, 0);
        grd.addColorStop(0, '#6e6e6e'); grd.addColorStop(0.5, '#c8c8c8'); grd.addColorStop(1, '#727272');
        g.fillStyle = grd; g.fillRect(x, y, 16, 15);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 14, 16, 2);
      }
    }
    T.roofTile = tex(c);
    T.roofTileN = normalFrom(c, 4);
    const m = canvas(128);
    const mg = m.getContext('2d');
    mg.fillStyle = '#b0b0b0'; mg.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) { mg.fillStyle = '#d6d6d6'; mg.fillRect(x, 0, 3, 128); mg.fillStyle = '#8a8a8a'; mg.fillRect(x + 3, 0, 2, 128); }
    T.roofMetal = tex(m);
  }

  // ---- facades: each tile = a fixed real size (see buildings.js)
  T.facadeHouse = facadeHouse(R);
  T.facadeApt = facadeApartment(R);
  T.facadeMansion = facadeMansion(R);
  T.facadeOffice = facadeOffice(R);
  T.facadeShop = facadeShop(R);
  T.facadeFactory = facadeFactory();
  T.facadeHouse.n = normalFrom(T.facadeHouse.image, 1.5);
  T.facadeApt.n = normalFrom(T.facadeApt.image, 1.2);
  T.facadeMansion.n = normalFrom(T.facadeMansion.image, 1.2);

  // ---- water ripples (normal map)
  T.waterN = normalFrom(noiseCanvas(256, 14, (n) => { const v = n * 255; return [v, v, v]; }, 31), 6);

  // ---- shop / company signs (fictional names only)
  T.signs = signAtlas(R);
  // (trees live in trees.js)
  return T;
}

// A tile 14.4 m wide (4 bays) × 2.9 m (one storey) of a Japanese detached house:
// light siding with sliding windows, some with shutters (雨戸) or curtains.
function facadeHouse(R) {
  const c = canvas(512, 104);
  const g = c.getContext('2d');
  g.fillStyle = '#e4e2dc'; g.fillRect(0, 0, 512, 104);
  for (let y = 0; y < 104; y += 4) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, 512, 1); }
  for (let b = 0; b < 4; b++) {
    const x0 = b * 128;
    if (R() < 0.2) continue;
    const w = 50 + R() * 40, h = 40 + R() * 22, x = x0 + (128 - w) / 2, y = 22;
    g.fillStyle = '#c9c9c4'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    const shutter = R() < 0.25;
    if (shutter) {
      g.fillStyle = '#a7a59f'; g.fillRect(x, y, w, h);
      for (let k = y; k < y + h; k += 3) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, k, w, 1); }
    } else {
      const grd = g.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, '#5d6d78'); grd.addColorStop(0.55, '#2c3640'); grd.addColorStop(1, '#43515c');
      g.fillStyle = grd; g.fillRect(x, y, w, h);
      if (R() < 0.6) { g.fillStyle = `rgba(${200 + R() * 50},${190 + R() * 50},${170 + R() * 50},0.75)`; g.fillRect(x + 2, y + 2, w * (0.25 + R() * 0.25), h - 4); }
      g.fillStyle = '#d8d8d4'; g.fillRect(x + w / 2 - 1, y, 2, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 3, y + h + 3, w + 6, 2);
    // aluminium sill and a little rain streaking under it
    g.fillStyle = '#b9bcbe'; g.fillRect(x - 5, y + h + 2, w + 10, 3);
    weather(g, 0, 0, R, 1.2, [[x - 2, x + w + 2, y + h + 5]]);
  }
  weather(g, 512, 104, R, 0.8);
  return tex(c);
}

// 2 units (each 6 m) × one storey (2.9 m) of a low-rise apartment: balconies with railings.
function facadeApartment(R) {
  const c = canvas(512, 124);
  const g = c.getContext('2d');
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, 512, 124);
  for (let u = 0; u < 2; u++) {
    const x0 = u * 256;
    const grd = g.createLinearGradient(0, 10, 0, 90);
    grd.addColorStop(0, '#46525c'); grd.addColorStop(1, '#2a323a');
    g.fillStyle = grd; g.fillRect(x0 + 20, 10, 216, 82);
    g.fillStyle = 'rgba(230,225,210,0.7)'; g.fillRect(x0 + 24, 14, 60 + R() * 60, 74);
    g.fillStyle = '#cfcfcb'; g.fillRect(x0 + 126, 10, 4, 82);
    // balcony railing panel
    g.fillStyle = '#eceae6'; g.fillRect(x0 + 6, 62, 244, 50);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let x = x0 + 8; x < x0 + 248; x += 6) g.fillRect(x, 62, 1, 50);
    if (R() < 0.6) { g.fillStyle = `hsl(${R() * 360},40%,70%)`; g.fillRect(x0 + 40 + R() * 100, 52, 40, 12); } // laundry
    g.fillStyle = '#a9a7a1'; g.fillRect(x0 + 248, 0, 8, 124);
  }
  g.fillStyle = '#bfbbb3'; g.fillRect(0, 112, 512, 12);
  weather(g, 512, 124, R, 1.0, [[0, 512, 112]]);
  return tex(c);
}

// 2 units × one storey of a 10+ storey condominium (マンション): glass balconies, AC units.
function facadeMansion(R) {
  const c = canvas(512, 124);
  const g = c.getContext('2d');
  g.fillStyle = '#cfc9bd'; g.fillRect(0, 0, 512, 124);
  for (let u = 0; u < 2; u++) {
    const x0 = u * 256;
    g.fillStyle = '#2d3942'; g.fillRect(x0 + 14, 8, 228, 86);
    g.fillStyle = 'rgba(210,220,225,0.35)'; g.fillRect(x0 + 14, 8, 228, 30);
    if (R() < 0.7) { g.fillStyle = 'rgba(235,230,215,0.65)'; g.fillRect(x0 + 18 + R() * 120, 12, 70, 80); }
    g.fillStyle = 'rgba(160,185,190,0.55)'; g.fillRect(x0 + 4, 60, 248, 48);
    g.fillStyle = '#e6e3dc'; g.fillRect(x0 + 4, 58, 248, 4);
    g.fillStyle = '#efefef'; g.fillRect(x0 + 200, 76, 30, 22);
    g.fillStyle = '#999'; g.beginPath(); g.arc(x0 + 213, 87, 7, 0, 7); g.fill();
    g.fillStyle = '#b5ae9f'; g.fillRect(x0 + 250, 0, 6, 124);
  }
  g.fillStyle = '#c3bcae'; g.fillRect(0, 108, 512, 16);
  weather(g, 512, 124, R, 1.0, [[0, 512, 108]]);
  return tex(c);
}

// 4 m × 3.8 m curtain-wall module of an office building
function facadeOffice(R) {
  const c = canvas(256, 244);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 244);
  grd.addColorStop(0, '#6f8ea6'); grd.addColorStop(0.5, '#3a5268'); grd.addColorStop(1, '#5e7a90');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 244);
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.08})`; g.fillRect(R() * 256, 0, 20 + R() * 60, 244); }
  // interior: ceiling lights and half-drawn blinds behind some panes
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = 'rgba(230,236,240,0.18)'; g.fillRect(x + 8, 10, 50, 6);
    if (R() < 0.5) { g.fillStyle = `rgba(215,215,205,${0.25 + R() * 0.25})`; g.fillRect(x + 5, 16, 59, 30 + R() * 90); }
  }
  g.fillStyle = '#b8bec4';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 244);
  g.fillRect(0, 190, 256, 54);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 186, 256, 4);
  return tex(c);
}

// ground-floor shop fronts with plain coloured sign bands (no brands)
function facadeShop(R) {
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  const cols = ['#c8302c', '#1e6bb8', '#f0a020', '#2a8a4a', '#7a3fa0', '#e86f1c'];
  for (let k = 0; k < 4; k++) {
    const x = k * 128;
    g.fillStyle = cols[Math.floor(R() * cols.length)]; g.fillRect(x, 0, 128, 36);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 16, 12, 60 + R() * 40, 12);
    const grd = g.createLinearGradient(0, 40, 0, 128);
    grd.addColorStop(0, '#9fb0bb'); grd.addColorStop(1, '#3d4a54');
    g.fillStyle = grd; g.fillRect(x + 4, 40, 120, 88);
    g.fillStyle = 'rgba(255,240,200,0.35)'; g.fillRect(x + 4, 40, 120, 88);
    g.fillStyle = '#ccc'; g.fillRect(x + 62, 40, 3, 88);
  }
  return tex(c);
}

// corrugated steel siding, 4 m wide tile
function facadeFactory() {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#c4c8c8'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, '#9da2a3'); grd.addColorStop(0.5, '#dfe3e3'); grd.addColorStop(1, '#a2a7a8');
    g.fillStyle = grd; g.fillRect(x, 0, 8, 256);
  }
  g.fillStyle = 'rgba(80,60,40,0.12)'; g.fillRect(0, 200, 256, 56);
  return tex(c);
}

// Sign atlas 1024 × 1024: lower half = 16 wide boards (512 × 64), upper half = 8 vertical
// blade signs (128 × 512). All names are made up.
const WIDE_SIGNS = [
  ['さくら食堂', '#c8302c', '#fff'], ['ふくや商店', '#1e6bb8', '#fff'], ['ミヤタ電器', '#ffffff', '#1a4f9c'], ['焼鳥 とり吉', '#2a2420', '#f2c14e'],
  ['クリーニング 白鳥', '#e8f2fb', '#1e6bb8'], ['かとう歯科医院', '#ffffff', '#2a8a4a'], ['あおば学習塾', '#2a8a4a', '#fff'], ['みどり不動産', '#f6f1e3', '#2d6a3e'],
  ['パン工房 こむぎ', '#7a4a2a', '#fbe9c8'], ['中華料理 福来', '#d4231c', '#ffe066'], ['花のアトリエ', '#f7d6e0', '#a0304d'], ['そば処 一休', '#1d2a3a', '#f4efe1'],
  ['ひかり整骨院', '#ffffff', '#e0701c'], ['美容室 Lino', '#222222', '#f0f0f0'], ['北関東精機株式会社', '#ffffff', '#123c7a'], ['東栄ビルディング', '#0f3b6e', '#ffffff'],
];
const TALL_SIGNS = [
  ['喫茶', '#7a3fa0', '#fff'], ['薬', '#2a8a4a', '#fff'], ['居酒屋', '#c8302c', '#fff'], ['歯科', '#ffffff', '#1e6bb8'],
  ['ラーメン', '#f0a020', '#222'], ['理容', '#ffffff', '#c8302c'], ['カラオケ', '#e0115f', '#fff'], ['不動産', '#1e6bb8', '#fff'],
];

function signAtlas() {
  const c = canvas(1024);
  const g = c.getContext('2d');
  g.fillStyle = '#777'; g.fillRect(0, 0, 1024, 1024);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  WIDE_SIGNS.forEach(([name, bg, fg], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col * 512, y = 1024 - (row + 1) * 64;
    g.fillStyle = bg; g.fillRect(x, y, 512, 64);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 60, 512, 4);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, 506, 58);
    g.fillStyle = fg; g.font = `700 40px ${UI_FONT}`;
    g.fillText(name, x + 256, y + 33, 480);
  });
  TALL_SIGNS.forEach(([name, bg, fg], i) => {
    const x = i * 128;
    g.fillStyle = bg; g.fillRect(x, 0, 128, 512);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 6; g.strokeRect(x + 3, 3, 122, 506);
    g.fillStyle = fg;
    const chars = [...name];
    const step = Math.min(110, 470 / chars.length);
    g.font = `700 ${Math.floor(step * 0.82)}px ${UI_FONT}`;
    chars.forEach((ch, k) => g.fillText(ch, x + 64, 256 + (k - (chars.length - 1) / 2) * step));
  });
  return tex(c, { repeat: false, aniso: 8 });
}

