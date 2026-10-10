// Ground vehicles carry the name of the airport they work at: the GSE decal atlas (built by
// blender/build_gse.py) has the ground-services band, the refueller's company line and the
// catering box painted in; for each airport a copy of the atlas is made with those regions
// repainted from the airport name chosen in the menu (renamed live).
import * as THREE from 'three';

// atlas regions (pixels, top-left origin) - same as REG in build_gse.py
const AW = 2048, AH = 1024;
const REG = { ground: [1024, 384, 2048, 512], fuel: [0, 256, 1024, 512], catering: [0, 512, 1024, 768] };
const FONT = '"Liberation Sans", "Helvetica Neue", Helvetica, Arial, "Hiragino Sans", "Noto Sans JP", sans-serif';

const per = new Map();          // airport id -> { mat, canvas, tex }
let base = null;

// fit text into maxW by reducing the font size
function fitText(c, text, x, y, px, maxW, style = 'bold') {
  let s = px;
  do { c.font = `${style} ${s}px ${FONT}`; s -= 2; } while (c.measureText(text).width > maxW && s > 10);
  c.fillText(text, x, y);
  return c.measureText(text).width;
}

function paint(entry, name) {
  const c = entry.canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(base.map.image, 0, 0, AW, AH);
  const up = (name || 'Airport').toUpperCase();
  c.textBaseline = 'middle';
  // ground services band: black on yellow
  let [x0, y0, x1, y1] = REG.ground;
  c.fillStyle = 'rgb(245,190,10)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.fillStyle = 'rgb(20,20,20)'; c.textAlign = 'left';
  fitText(c, `${up} GROUND SERVICES`, x0 + 30, (y0 + y1) / 2, 64, x1 - x0 - 260);
  c.textAlign = 'right'; c.font = `bold 48px ${FONT}`; c.fillText('GSE-07', x1 - 40, (y0 + y1) / 2);
  // refueller: company line under JET A-1
  [x0, y0, x1, y1] = REG.fuel;
  c.fillStyle = 'rgb(236,238,240)'; c.fillRect(x0 + 50, y0 + 160, x1 - x0 - 280, 46);
  c.fillStyle = 'rgb(40,40,50)'; c.textAlign = 'left';
  fitText(c, `${up} AVIATION FUEL SERVICES`, x0 + 64, y0 + 187, 34, x1 - x0 - 300);
  // catering box: airport name + SKY CATERING
  [x0, y0, x1, y1] = REG.catering;
  c.fillStyle = 'rgb(240,241,243)'; c.fillRect(x0 + 20, y0 + 20, x1 - x0 - 40, 174);
  c.fillStyle = 'rgb(215,110,60)';
  const w = fitText(c, name || 'Airport', x0 + 50, y0 + 105, 100, 560, 'italic bold');
  c.fillStyle = 'rgb(40,60,110)';
  fitText(c, 'SKY CATERING', x0 + 80 + w, y0 + 115, 64, x1 - x0 - 120 - w);
  c.fillStyle = 'rgb(90,95,105)';
  fitText(c, `INFLIGHT MEALS · ${up}`, x0 + 54, y0 + 178, 26, x1 - x0 - 100);
  entry.tex.needsUpdate = true;
}

// the template's decal material (from gse.glb)
export function initGSELivery(gseRoot) {
  gseRoot?.traverse((o) => { if (!base && o.isMesh && o.material?.name === 'GSE_Decal' && o.material.map?.image) base = o.material; });
  return !!base;
}

// the decal material for an airport's vehicles
export function gseDecal(aptId, name) {
  if (!base) return null;
  let e = per.get(aptId);
  if (!e) {
    const canvas = document.createElement('canvas'); canvas.width = AW; canvas.height = AH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = base.map.flipY; tex.colorSpace = base.map.colorSpace; tex.wrapS = base.map.wrapS; tex.wrapT = base.map.wrapT;
    tex.anisotropy = 8;
    const mat = base.clone();
    mat.map = tex;
    mat.onBeforeCompile = base.onBeforeCompile;
    mat.customProgramCacheKey = base.customProgramCacheKey;
    e = { canvas, tex, mat };
    per.set(aptId, e);
    paint(e, name);
  }
  return e.mat;
}

export function renameGSE(aptId, name) {
  const e = per.get(aptId);
  if (e) paint(e, name);
}

// put an airport's decals on a vehicle model
export function dressGSE(obj, aptId, name) {
  const m = gseDecal(aptId, name);
  if (!m) return;
  obj.traverse((o) => { if (o.isMesh && o.material?.name === 'GSE_Decal') o.material = m; });
}
