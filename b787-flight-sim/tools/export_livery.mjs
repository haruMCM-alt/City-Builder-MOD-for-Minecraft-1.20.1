import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Exports the game's JAL / ANA livery assets (fuselage title, fin canvas, fin mark, rects and
// colours from web/js/livery.js) for blender/render_wallpaper.py --livery.
//   (cd web && python3 -m http.server 8787) &   node tools/export_livery.mjs
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, 'blender/output/wallpaper_tex/livery');
fs.mkdirSync(OUT, { recursive: true });
const PAGE = path.join(ROOT, 'web/_livx.html');
fs.writeFileSync(PAGE, '<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/examples/jsm/"}}</script>');
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', String(e)));
await p.goto('http://localhost:8787/_livx.html');
const assets = ['b787-9', 'b737-800', 'b767-300er', 'ma-300', 'ma-700', 'ma-900', 'b747-400', 'atr72-600', 'ma-w8'];
const res = await p.evaluate(async (assets) => {
  const L = await import('./js/livery.js');
  await L.liveryImagesReady;
  const out = {};
  for (const a of assets) {
    const m = await (await fetch('./assets/' + a + '.json')).json();
    const lay = m.liveryLayout || await (await fetch('./assets/livery.json')).json();
    for (const id of ['jal', 'ana']) {
      const logo = L.logoById(id);
      const A = L.liveryAssets({ name: logo.name, logo: id }, lay, true);
      const v = (x) => [x.x, x.y, x.z];
      out[a + '|' + id] = {
        layout: lay, titleRect: [A.titleRect.x, A.titleRect.y, A.titleRect.z, A.titleRect.w], finRect: [A.finRect.x, A.finRect.y, A.finRect.z, A.finRect.w],
        prim: v(A.prim), prim2: v(A.prim2), acc1: v(A.acc1), acc2: v(A.acc2), nacelle: v(A.nacelle),
        plain: !!logo.plain,
        title: A.title.image.toDataURL('image/png'), tail: A.tail.image.toDataURL('image/png'), fin: A.finLogo.image.toDataURL('image/png'),
      };
    }
  }
  return out;
}, assets);
for (const [k, v] of Object.entries(res)) {
  const base = OUT + '/' + k.replace('|', '_');
  for (const n of ['title', 'tail', 'fin']) { fs.writeFileSync(`${base}_${n}.png`, Buffer.from(v[n].split(',')[1], 'base64')); delete v[n]; }
  fs.writeFileSync(base + '.json', JSON.stringify(v));
}
console.log('exported', Object.keys(res).length);
await b.close();
fs.unlinkSync(PAGE);
