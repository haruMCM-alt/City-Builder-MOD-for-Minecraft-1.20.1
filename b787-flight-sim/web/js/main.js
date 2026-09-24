// Boeing 787-9 / 767-300ER / 737-800 flight simulator - application entry point.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FlightModel, FLAPS, SPEC } from './flightmodel.js';
import { Systems, AUTOBRAKE } from './systems.js';
import { configureTerrain, terrainHeight } from './terrain.js';
import { World, HDR } from './world.js';
import { AircraftVisual } from './aircraft.js';
import { Instruments } from './instruments.js';
import { CameraRig, VIEW_NAMES } from './camera.js';
import { Input } from './input.js';
import { Audio, setEngineSound } from './audio.js';
import { LOGOS, logoById, drawLogoIcon, randomLivery, dressParked, loadSavedLivery, saveLivery, DEFAULT_LIVERY, liveryAssets } from './livery.js';
import { Cabin } from './cabin.js';
import { PostFX } from './postfx.js';
import { Rain } from './weatherfx.js';
import { Vapor } from './vapor.js';
import { Traffic } from './traffic.js';
import { Radio } from './atc.js';
import { MCP3D } from './mcp3d.js';
import { V3, DEG, KT, FT, FPM, clamp, headingVec, wrap360, mulberry32 } from './util.js';

const $ = (id) => document.getElementById(id);
const DT = 1 / 240;
const ASSET = './assets/';
// model files: .glb by default; a host that cannot serve .glb can set window.B787_MODEL_EXT = '.gltf.json'
const MODEL_EXT = window.B787_MODEL_EXT || '.glb';

// aircraft types (Blender builds: blender/build_b787.py with AC_TYPE) and the AI fleet mix
const TYPES = [
  { id: 'b738', asset: 'b737-800', weight: 1, short: '737-800', cls: '単通路 Narrow-body' },
  { id: 'b763', asset: 'b767-300er', weight: 1, short: '767-300ER', cls: '双通路 Wide-body' },
  { id: 'b789', asset: 'b787-9', weight: 1, short: '787-9', cls: '双通路 Wide-body' },
];
const STAND_NOSE = 24.13;       // stands are marked for the 787-9 nose gear position
const WEATHER_ICONS = { clear: ['☀', '快晴'], scattered: ['🌤', '晴れ時々曇り'], broken: ['⛅', '曇り'], overcast: ['☁', '曇天・低視程'], rain: ['🌧', '雨'] };

// --------------------------------------------------------------------- loading
function setLoad(p, msg) {
  $('loadBar').style.width = Math.round(p * 100) + '%';
  if (msg) $('loadText').textContent = msg;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': ' + r.status);
  return r.json();
}

function loadGLB(loader, url, onProgress) {
  if (url.endsWith('.gltf.json')) return loadEmbeddedGLTF(loader, url, onProgress);
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, (e) => { if (e.total) onProgress(e.loaded / e.total); }, reject);
  });
}

// glTF JSON whose geometry buffer is embedded as base64 (textures are separate files). Some
// hosts forbid fetching data: and blob: URLs,
// so the buffer is decoded here and re-packed into an in-memory GLB for loader.parse().
async function loadEmbeddedGLTF(loader, url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': ' + r.status);
  const total = +r.headers.get('content-length') || 0;
  const reader = r.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (total) onProgress(Math.min(got / total, 1));
  }
  const json = JSON.parse(await new Blob(parts).text());
  const uri = json.buffers[0].uri;
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  delete json.buffers[0].uri;
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = (enc.length + 3) & ~3, binLen = (bin.length + 3) & ~3;
  const glb = new Uint8Array(12 + 8 + jsonLen + 8 + binLen);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4E4F534A, true);
  glb.fill(0x20, 20, 20 + jsonLen); glb.set(enc, 20);
  const o = 20 + jsonLen;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004E4942, true);
  glb.set(bin, o + 8);
  onProgress(1);
  const base = url.slice(0, url.lastIndexOf('/') + 1);   // external textures sit next to the JSON
  return new Promise((resolve, reject) => loader.parse(glb.buffer, base, resolve, reject));
}

// --------------------------------------------------------------------- scenarios
const SCENARIOS = [
  { id: 'rwy27', name: '滑走路27 離陸 / Takeoff RWY 27', note: 'Flaps 5 · Shift+R で TOGA、VR で ↓ で機首上げ' },
  { id: 'rwy09', name: '滑走路09 離陸 / Takeoff RWY 09', note: '市街地方向へ離陸 (towards the port)' },
  { id: 'gate', name: 'ゲート7 プッシュバック / Gate 7', note: 'J でプッシュバック、P でパーキングブレーキ解除' },
  { id: 'ils27', name: 'ILS 27 進入 12nm / ILS approach', note: 'AP が LOC/GS を捕捉。ギア・フラップを出して着陸' },
  { id: 'final', name: 'ショートファイナル 4nm / Short final', note: '手動着陸。PAPI を見て 3° パスを維持' },
  { id: 'city', name: '都市上空 遊覧 / City sightseeing', note: '高度 2,000 ft で市街地とランドマークタワーへ' },
  { id: 'cruise', name: '巡航 FL350 M0.85 / Cruise', note: 'オートパイロット巡航。降下して空港へ戻る' },
];

class App {
  async init() {
    this.quality = 'high';
    const canvas = $('view');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true,
      powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 250000);

    setLoad(0.02, 'loading data…');
    const [world, livery, ...metas] = await Promise.all([fetchJSON(ASSET + 'world.json'),
      fetchJSON(ASSET + 'livery.json').catch(() => null),
      ...TYPES.map((t) => fetchJSON(ASSET + t.asset + '.json').catch(() => null))]);
    this.types = {};
    TYPES.forEach((t, i) => {
      const m = metas[i];
      if (!m) return;
      m.type = m.type || t.id;
      m.livery = m.liveryLayout || livery;
      this.types[t.id] = { ...t, meta: m, gltf: null, lod: null };
    });
    if (!this.types.b789) throw new Error('b787-9.json missing');
    let sel = 'b789';
    try { sel = localStorage.getItem('b787.actype') || 'b789'; } catch (e) { /* storage unavailable */ }
    if (!this.types[sel]) sel = 'b789';
    const meta = this.types[sel].meta;
    this.meta = meta; this.worldData = world;
    configureTerrain(world);
    this.world = new World(renderer, this.scene, this.quality);

    const draco = new DRACOLoader();
    draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
    // fall back to the pure-JS decoder where WebAssembly is unavailable / blocked
    try {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    } catch (e) {
      draco.setDecoderConfig({ type: 'js' });
    }
    const loader = this.loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const typeIds = Object.keys(this.types);
    const prog = { ac: 0, world: 0, lod: {}, gse: 0 };
    const lodP = () => typeIds.reduce((a, k) => a + (prog.lod[k] || 0), 0) / typeIds.length;
    const upd = () => setLoad(0.05 + 0.85 * (prog.ac * 0.3 + prog.world * 0.45 + lodP() * 0.18 + prog.gse * 0.07),
      `${this.types[sel].short} ${Math.round(prog.ac * 100)}% · airport/city ${Math.round(prog.world * 100)}% · AI fleet ${Math.round(lodP() * 100)}% · GSE ${Math.round(prog.gse * 100)}%`);
    const [acGltf, worldGltf, gseGltf, gseInfo, ...lods] = await Promise.all([
      loadGLB(loader, ASSET + this.types[sel].asset + MODEL_EXT, (p) => { prog.ac = p; upd(); }),
      loadGLB(loader, ASSET + 'world' + MODEL_EXT, (p) => { prog.world = p; upd(); }),
      loadGLB(loader, ASSET + 'gse' + MODEL_EXT, (p) => { prog.gse = p; upd(); }).catch(() => null),
      fetchJSON(ASSET + 'gse.json').catch(() => null),
      ...typeIds.map((k) => loadGLB(loader, ASSET + this.types[k].asset + '-lod' + MODEL_EXT, (p) => { prog.lod[k] = p; upd(); })
        .catch(() => null)),
    ]);
    this.types[sel].gltf = acGltf;
    typeIds.forEach((k, i) => { this.types[k].lod = lods[i] ? lods[i].scene : null; });
    const lodGltf = this.types.b789.lod ? { scene: this.types.b789.lod } : null;
    setLoad(0.92, 'building scene…');
    this.world.attachWorldGLB(worldGltf);
    this.world.buildTrees(world.trees);
    this.world.buildLights(world.lights);
    this.world.setWeather('scattered');
    this.lodTemplate = lodGltf ? lodGltf.scene : null;
    // airport traffic: AI 787s under ATC control and ground support equipment
    this.radio = new Radio($('atc'));
    this.traffic = this.lodTemplate ? new Traffic(this.scene, world, meta, {
      gse: gseGltf ? gseGltf.scene : null, gseInfo, lodTemplate: this.lodTemplate, livery,
      radio: this.radio, quality: this.quality,
      types: typeIds.filter((k) => this.types[k].lod).map((k) => ({ meta: this.types[k].meta, lod: this.types[k].lod, weight: this.types[k].weight })),
    }) : null;

    // aircraft (the selected type; the others are loaded when picked in the menu)
    this.post = new PostFX(renderer, this.scene, this.camera);
    this.rain = new Rain(this.scene);
    this._camPrev = new THREE.Vector3(); this.camVel = new THREE.Vector3();
    this.resize();
    this.livery = loadSavedLivery();
    this.instruments = new Instruments($('pfd'), $('nd'), $('eicas'), $('hud'), world);
    this.rig = new CameraRig(this.camera, canvas, meta, world);
    this.installType(sel);
    this.input = new Input((c) => this.command(c));
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) this.input.bindTouch($('touch'));
    this.audio = new Audio();
    this.panelOn = true;
    this.paused = true;
    this.acc = 0;
    this.events = [];
    this.buildMenu();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // warm-up render (compiles shaders while the menu is shown)
    this.startScenario('rwy27', false);
    setLoad(1, 'ready');
    $('loading').classList.add('hidden');
    $('menu').classList.remove('hidden');
    this.last = performance.now();
    this.fps = 60;
    renderer.setAnimationLoop((t) => this.frame(t));
  }

  // make type `id` (already loaded) the flown aircraft: visual, cabin, vapour, flight model, systems
  installType(id) {
    const T = this.types[id];
    const prev = this.cur;
    if (prev && prev !== T) {
      prev.visual.root.visible = false;
      if (prev.visual.particles) prev.visual.particles.visible = false;
      prev.vapor.setActive(false);
      prev.cabin.update(false, 0);
    }
    if (!T.visual) {
      const m = T.meta;
      T.visual = new AircraftVisual(T.gltf, m, this.scene, this.quality);
      T.visual.setDisplayTextures(this.instruments.textures);
      // live face of the 3-D MCP on the glareshield
      if (m.mcp && T.visual.displayMats.MCP) { T.mcp3d = new MCP3D(m.mcp); T.mcp3d.apply(T.visual.displayMats.MCP); }
      T.cabin = new Cabin(T.visual, m, () => loadGLB(this.loader, ASSET + T.asset + '-cabin' + MODEL_EXT, () => {}));
      T.vapor = new Vapor(this.scene, m, T.visual);
      if (m.ao !== false && T.id === 'b789') {
        // baked ambient occlusion (Blender / Cycles) for the 787 fuselage and wings
        const tl = new THREE.TextureLoader();
        const ld = (f) => new Promise((res) => tl.load(ASSET + f, (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; res(t); }, undefined, () => res(null)));
        Promise.all([ld('ao_fuselage.png'), ld('ao_wing.png')]).then(([f, w]) => T.visual.setAO(f, w));
      }
    }
    T.visual.root.visible = true;
    if (T.visual.particles) T.visual.particles.visible = true;
    T.vapor.setActive(true);
    this.cur = T; this.typeId = id;
    this.meta = T.meta; this.visual = T.visual; this.cabin = T.cabin; this.vapor = T.vapor; this.mcp3d = T.mcp3d || null;
    Object.assign(SPEC, T.meta.spec || {});
    this.fm = new FlightModel(T.meta);
    this.sys = new Systems(this.fm, this.worldData);
    this.rig.meta = T.meta;
    setEngineSound(id);
    if (this.traffic) this.traffic.setPlayerMeta(T.meta);
    this.applyLivery();
    this.updateWeights();
    try { localStorage.setItem('b787.actype', id); } catch (e) { /* ignore */ }
    const t = $('menuTitle');
    if (t) t.innerHTML = `B${T.short} <span>Flight Simulator</span>`;
    document.title = `B${T.short} Flight Simulator`;
  }

  // menu: pick a type (loads its model the first time)
  async selectType(id) {
    const T = this.types[id];
    if (!T || this._typeLoading) return;
    if (!T.gltf) {
      this._typeLoading = true;
      const btn = document.querySelector(`#typePick button[data-id="${id}"]`);
      const note = $('typeNote');
      if (btn) btn.classList.add('loading');
      try {
        T.gltf = await loadGLB(this.loader, ASSET + T.asset + MODEL_EXT, (p) => { if (note) note.textContent = `${T.short} を読み込み中… ${Math.round(p * 100)}%`; });
      } catch (e) {
        if (note) note.textContent = `読み込みに失敗しました: ${e.message}`;
        this._typeLoading = false;
        if (btn) btn.classList.remove('loading');
        return;
      }
      if (btn) btn.classList.remove('loading');
      this._typeLoading = false;
    }
    this.installType(id);
    this.startScenario(this.scenario, false);
    this.refreshTypePick();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const hud = $('hud');
    const pr = Math.min(window.devicePixelRatio, 2);
    hud.width = w * pr; hud.height = h * pr;
    this.hudScale = pr;
    if (this.post) this.post.setSize(w, h);
  }

  // ------------------------------------------------------------------- menu
  buildMenu() {
    const box = $('scenarios');
    this.scenario = 'rwy27';
    for (const s of SCENARIOS) {
      const b = document.createElement('button');
      b.innerHTML = `<b>${s.name}</b><br><span style="color:var(--muted);font-size:12px">${s.note}</span>`;
      b.dataset.id = s.id;
      b.onclick = () => {
        this.scenario = s.id;
        box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.id === s.id));
        this.updateSummary();
      };
      if (s.id === this.scenario) b.classList.add('sel');
      box.appendChild(b);
    }
    const bind = (id, out, fmt) => {
      const el = $(id);
      const f = () => { $(out).textContent = fmt(+el.value); this.updateGW(); };
      el.addEventListener('input', f); f();
    };
    bind('tod', 'todVal', (v) => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`);
    bind('windSpd', 'windVal', (v) => `${v} kt`);
    bind('windDir', 'windDirVal', (v) => `${String(v).padStart(3, '0')}°`);
    bind('turb', 'turbVal', (v) => (v === 0 ? 'なし' : v.toFixed(1)));
    ['tod', 'windSpd', 'windDir'].forEach((id) => $(id).addEventListener('input', () => this.updateSummary()));
    bind('fuel', 'fuelVal', (v) => `${(v / 1000).toFixed(1)} t`);
    bind('payload', 'payVal', (v) => `${(v / 1000).toFixed(1)} t` +
      (this.meta.cabin ? `（乗客 ${Math.min(this.meta.cabin.total, Math.floor(v / (this.meta.cabin.paxMass || 100)))} 名）` : ''));
    this.buildLiveryMenu();
    this.buildIFE();
    this.buildTypePick();
    this.buildWeatherPick();
    this.buildWizard();
    $('startBtn').onclick = () => this.startFromMenu();
    $('retryBtn').onclick = () => { $('crash').classList.add('hidden'); this.startScenario(this.scenario, true); };
    $('menuBtn').onclick = () => { $('crash').classList.add('hidden'); this.openMenu(); };
    $('btnView').onclick = () => this.command('view');
    $('atcHint').onclick = () => this.command('atc');
    $('btnPanel').onclick = () => this.command('panel');
    $('btnMenu').onclick = () => this.command('menu');
    $('resumeBtn').onclick = () => this.resume();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ['menu', 'crash', 'pause'].every((id) => $(id).classList.contains('hidden'))) this.pause();
    });
    $('restartBtn').onclick = () => { $('pause').classList.add('hidden'); this.audio.start(); this.startScenario(this.scenario, true); };
    $('toMenuBtn').onclick = () => this.openMenu();
    // MCP
    document.querySelectorAll('.mcpbtn').forEach((b) => { b.onclick = () => this.command(b.dataset.cmd === 'ap' ? 'ap' : b.dataset.cmd === 'at' ? 'at' : b.dataset.cmd); });
    document.querySelectorAll('.num').forEach((n) => {
      n.addEventListener('wheel', (e) => {
        e.preventDefault();
        const f = n.dataset.field, s = this.sys.mcp, dir = e.deltaY < 0 ? 1 : -1, big = e.shiftKey;
        if (f === 'spd') s.spd = clamp(s.spd + dir * (big ? 10 : 1), 100, 350);
        if (f === 'hdg') s.hdg = wrap360(s.hdg + dir * (big ? 10 : 1)) || 360;
        if (f === 'alt') s.alt = clamp(s.alt + dir * (big ? 1000 : 100), 0, 43000);
        if (f === 'vs') s.vs = clamp(s.vs + dir * 100, -6000, 6000);
        this.updateMCP(true);
      }, { passive: false });
      n.addEventListener('click', (e) => {
        const f = n.dataset.field, s = this.sys.mcp, o = this.fm.out;
        if (f === 'hdg') s.hdg = Math.round(o.hdg) || 360;
        if (f === 'alt') s.alt = Math.round(o.altFt / 100) * 100;
        if (f === 'spd') s.spd = Math.round(o.ias);
        if (f === 'vs') s.vs = Math.round(o.vs / FPM / 100) * 100;
        this.updateMCP(true);
      });
    });
  }

  updateGW() {
    const f = +$('fuel').value, p = +$('payload').value;
    const gw = SPEC.OEW + f + p;
    $('gwVal').textContent = `${(gw / 1000).toFixed(1)} t` + (gw > SPEC.MTOW ? ' ⚠ > MTOW' : ` (MTOW ${(SPEC.MTOW / 1000).toFixed(1)} t)`);
    $('gwVal').style.color = gw > SPEC.MTOW ? 'var(--bad)' : '';
    this.updateSummary?.();
  }

  // fuel / payload ranges for the current type (keeps the same fraction of capacity)
  updateWeights() {
    const fuel = $('fuel'), pay = $('payload');
    if (!fuel || !pay) return;
    const fr = (+fuel.value - +fuel.min) / Math.max(1, +fuel.max - +fuel.min);
    const pr = +pay.value / Math.max(1, +pay.max);
    const fmax = Math.floor(SPEC.fuelCapacity / 500) * 500, pmax = Math.floor((SPEC.MZFW - SPEC.OEW) / 500) * 500;
    const fmin = Math.round(fmax * 0.08 / 500) * 500;
    fuel.min = fmin; fuel.max = fmax; fuel.step = 500;
    pay.max = pmax; pay.step = 500;
    if (this._wInit) { fuel.value = Math.round((fmin + fr * (fmax - fmin)) / 500) * 500; pay.value = Math.round(pr * pmax / 500) * 500; }
    else { fuel.value = Math.round(fmax * 0.45 / 500) * 500; pay.value = Math.round(pmax * 0.5 / 500) * 500; this._wInit = true; }
    fuel.dispatchEvent(new Event('input')); pay.dispatchEvent(new Event('input'));
  }

  // ------------------------------------------------------------------- menu wizard
  buildWizard() {
    this.wizStep = 0;
    const go = (i) => {
      this.wizStep = Math.max(0, Math.min(2, i));
      $('wizTrack').style.transform = `translateX(${-100 * this.wizStep}%)`;
      document.querySelectorAll('#wizSteps li').forEach((li, k) => {
        li.classList.toggle('on', k === this.wizStep); li.classList.toggle('done', k < this.wizStep);
      });
      document.querySelectorAll('#wizDots i').forEach((d, k) => d.classList.toggle('on', k === this.wizStep));
      $('wizBack').disabled = this.wizStep === 0;
      $('wizNext').classList.toggle('hidden', this.wizStep === 2);
      $('startBtn').classList.toggle('hidden', this.wizStep !== 2);
      document.querySelectorAll('#wizTrack .slide').forEach((s, k) => { s.inert = k !== this.wizStep; s.scrollTop = 0; });
      this.updateSummary();
    };
    this.wizGo = go;
    $('wizBack').onclick = () => go(this.wizStep - 1);
    $('wizNext').onclick = () => go(this.wizStep + 1);
    document.querySelectorAll('#wizSteps li').forEach((li) => { li.onclick = () => go(+li.dataset.i); });
    // swipe between the slides on touch screens
    let sx = null;
    const tr = $('wizTrack');
    tr.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    tr.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60 && !(e.target.closest && e.target.closest('input, select, .logos'))) go(this.wizStep + (dx < 0 ? 1 : -1));
    }, { passive: true });
    go(0);
  }

  updateSummary() {
    const el = $('wizSummary');
    if (!el || !this.types || !this.cur) return;
    const sc = SCENARIOS.find((s) => s.id === this.scenario);
    const wx = WEATHER_ICONS[$('weather').value] || ['', $('weather').value];
    const tod = +$('tod').value;
    const gw = SPEC.OEW + +$('fuel').value + +$('payload').value;
    el.innerHTML = `<b>${sc ? sc.name : ''}</b> · <b>Boeing ${this.cur.short}</b>（${(this.livery?.name || '')}）` +
      ` · 総重量 <b>${(gw / 1000).toFixed(1)} t</b> · <b>${String(Math.floor(tod)).padStart(2, '0')}:${String(Math.round((tod % 1) * 60)).padStart(2, '0')}</b>` +
      ` · ${wx[0]} ${wx[1]} · 風 <b>${String($('windDir').value).padStart(3, '0')}° / ${$('windSpd').value} kt</b>`;
  }

  buildTypePick() {
    const box = $('typePick');
    if (!box) return;
    box.innerHTML = '';
    for (const t of TYPES) {
      const T = this.types[t.id];
      if (!T) continue;
      const m = T.meta, s = m.spec || {};
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = t.id;
      const seats = m.cabin ? m.cabin.total : '—';
      b.innerHTML = `<img alt="" src="${ASSET}type_${t.id}.jpg" onerror="this.style.display='none'">` +
        `<div class="tb"><div class="tn">Boeing ${t.short}<em>${t.cls}</em></div>` +
        `<div class="ts">全長 ${m.length.toFixed(2)} m · 全幅 ${m.span.toFixed(2)} m · 全高 ${m.height.toFixed(2)} m<br>` +
        `最大離陸重量 ${(s.MTOW / 1000).toFixed(1)} t · 座席 ${seats}<br>${m.engineName || ''} ×2 · Mmo ${s.MMO}</div></div>`;
      b.onclick = () => this.selectType(t.id);
      box.appendChild(b);
    }
    this.refreshTypePick();
  }

  refreshTypePick() {
    document.querySelectorAll('#typePick button').forEach((b) => b.classList.toggle('sel', b.dataset.id === this.typeId));
    const note = $('typeNote');
    if (note && this.cur) {
      const s = SPEC;
      note.textContent = `${this.cur.short}: 燃料容量 ${(s.fuelCapacity / 1000).toFixed(1)} t · 最大着陸重量 ${(s.MLW / 1000).toFixed(1)} t · ` +
        `推力 ${(s.thrustSL / 1000).toFixed(0)} kN ×2 — 機種を変えると重量の範囲も切り替わります。`;
    }
    this.updateSummary();
  }

  buildWeatherPick() {
    const box = $('wxPick'), sel = $('weather');
    if (!box) return;
    const upd = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.id === sel.value));
    for (const o of sel.options) {
      const [icon, name] = WEATHER_ICONS[o.value] || ['', o.textContent];
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = o.value;
      b.innerHTML = `<b>${icon}</b>${name}`;
      b.onclick = () => { sel.value = o.value; upd(); this.updateSummary(); };
      box.appendChild(b);
    }
    upd();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    const o = this.fm.out;
    const sc = SCENARIOS.find((x) => x.id === this.scenario);
    $('pauseInfo').textContent = `${sc ? sc.name : ''} — IAS ${Math.round(o.ias)} kt · ALT ${Math.round(o.altFt)} ft · ` +
      `HDG ${String(Math.round(o.hdg) % 360).padStart(3, '0')} · FLAPS ${FLAPS[this.sys.flapLever].name} · ` +
      `GEAR ${this.fm.ctl.gearPos < 0.5 ? 'DOWN' : 'UP'}`;
    $('pause').classList.remove('hidden');
    this.audio.suspend();
  }

  resume() {
    $('pause').classList.add('hidden');
    this.paused = false;
    this.acc = 0;
    this.input.keys.clear();
    this.audio.start();
    $('view').focus();
  }

  openMenu() {
    $('pause').classList.add('hidden');
    this.paused = true;
    $('menu').classList.remove('hidden');
    ['mcp', 'panel', 'status', 'corner', 'touch', 'atc', 'atcHint'].forEach((i) => $(i).classList.add('hidden'));
  }

  applyLivery() {
    this.visual.setLivery(this.livery);
    this.cabin.setAirline(this.livery?.name || 'Claude Air');
    if (this.meta.livery) this.cabin.setLivery(liveryAssets(this.livery, this.meta.livery, true));
  }

  // in-flight entertainment controls (your seat view)
  buildIFE() {
    const box = $('ifeBtns');
    if (!box) return;
    const chans = [['menu', '🏠 ホーム'], ['map', '🗺 マップ'], ['info', '✈ 情報'], ['movieA', '🎬 空の旅'], ['movieB', '🎬 海の物語'],
      ['movieC', '🎬 夜の街'], ['movieD', '🎬 宇宙ねこ'], ['music', '🎵 音楽'], ['news', '📰 ニュース'], ['camera', '📷 機外カメラ'], ['game', '🎮 ゲーム']];
    for (const [id, label] of chans) {
      const b = document.createElement('button');
      b.dataset.id = id; b.textContent = label;
      b.onclick = () => { this.cabin.ife.select(id); this.refreshIFE(); $('view').focus(); };
      box.appendChild(b);
    }
    const hold = (el, d) => {
      const on = (e) => { e.preventDefault(); this.cabin.ife.steer(d); };
      const off = () => this.cabin.ife.steer(0);
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off);
    };
    hold($('ifeL'), -1); hold($('ifeR'), 1);
    $('ifeMeal').onclick = () => this.command('service');
  }

  refreshIFE() {
    const ch = this.cabin.ife.channel;
    document.querySelectorAll('#ifeBtns button').forEach((b) => b.classList.toggle('sel', b.dataset.id === ch));
    $('ifeGame').classList.toggle('hidden', ch !== 'game');
  }

  buildLiveryMenu() {
    const nameEl = $('airlineName'), box = $('logoPick'), prev = $('liveryPreview');
    if (!nameEl || !this.meta.livery) { if ($('liveryBox')) $('liveryBox').style.display = 'none'; return; }
    nameEl.value = this.livery.name;
    const apply = () => {
      saveLivery(this.livery);
      this.applyLivery();
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.id === this.livery.logo));
      // flat preview: logo + title in the scheme colours
      const c = prev.getContext('2d'), W = prev.width, H = prev.height, lg = logoById(this.livery.logo);
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#f5f7f9'; c.fillRect(0, 0, W, H);
      c.fillStyle = lg.colors.primary; c.fillRect(0, H * 0.78, W, H * 0.22);
      c.fillStyle = lg.colors.accent1; c.fillRect(0, H * 0.72, W, H * 0.04);
      c.save(); c.translate(H * 0.42, H * 0.4); c.scale(H * 0.32, H * 0.32); lg.draw(c); c.restore();
      const words = (this.livery.name || ' ').trim().split(/\s+/), last = words.length > 1 ? words.pop() : '';
      let px = H * 0.34;
      const font = () => `italic 800 ${px}px "Helvetica Neue", Helvetica, Arial, "Hiragino Sans", sans-serif`;
      c.font = font();
      const tw = () => c.measureText(words.join(' ') + (last ? '  ' + last : '')).width;
      while (tw() > W - H * 0.95 && px > 8) { px -= 1; c.font = font(); }
      let x = H * 0.85;
      c.fillStyle = lg.colors.primary; c.fillText(words.join(' '), x, H * 0.52);
      if (last) { x += c.measureText(words.join(' ') + '  ').width; c.fillStyle = lg.colors.accent1 === '#ffffff' ? lg.colors.primary2 : lg.colors.accent1; c.fillText(last, x, H * 0.52); }
    };
    for (const lg of LOGOS) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = lg.id; b.title = lg.label;
      const cv = document.createElement('canvas'); cv.width = cv.height = 56;
      drawLogoIcon(cv, lg);
      b.appendChild(cv);
      const sp = document.createElement('span'); sp.textContent = lg.label; b.appendChild(sp);
      b.onclick = () => { this.livery = { ...this.livery, logo: lg.id }; apply(); };
      box.appendChild(b);
    }
    let tmr = 0;
    nameEl.addEventListener('input', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => { this.livery = { ...this.livery, name: nameEl.value.slice(0, 28) || DEFAULT_LIVERY.name }; apply(); }, 250);
    });
    $('liveryReset').onclick = () => { this.livery = { ...DEFAULT_LIVERY }; nameEl.value = this.livery.name; apply(); };
    apply();
  }

  startFromMenu() {
    const q = $('quality').value;
    if (q !== this.quality) this.setQuality(q);
    this.audio.enabled = $('sound').checked;
    this.audio.start();
    $('menu').classList.add('hidden');
    this.startScenario(this.scenario, true);
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : q === 'medium' ? 1 : 0.75);
    r.shadowMap.enabled = q !== 'low';
    this.world.sun.castShadow = q !== 'low';
    const sm = q === 'high' ? 4096 : 2048;
    this.world.sun.shadow.mapSize.set(sm, sm);
    if (this.world.sun.shadow.map) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
    this.world.quality = q;
    this.resize();
  }

  // ------------------------------------------------------------------- scenario setup
  startScenario(id, run) {
    const fm = this.fm, sys = this.sys, W = this.worldData;
    this.scenario = id;
    fm.fuel = +$('fuel').value;
    fm.payload = +$('payload').value;
    this.cabin.setPassengers(fm.payload, 1 + Math.floor(Math.random() * 1e6));
    this.world.tod = +$('tod').value;
    const wname = $('weather').value;
    if (wname !== this.world.weatherName) this.world.setWeather(wname);
    const wdir = +$('windDir').value, wspd = +$('windSpd').value * KT;
    const wv = headingVec(wdir);
    this.windBase = new V3(-wv.x * wspd, 0, -wv.z * wspd);
    fm.wind.copy(this.windBase);
    this.turb = +$('turb').value;
    // reset systems
    Object.assign(sys, new Systems(fm, W));
    sys.callouts.length = 0;
    const r27 = W.runways.find((r) => r.ident === '27'), r09 = W.runways.find((r) => r.ident === '09');
    const L = this.visual.lightsOn;
    Object.assign(L, { nav: true, beacon: true, strobe: false, landing: false, taxi: false, logo: true });
    const gy = -this.meta.groundY - 0.42;          // CG height at rest on the gear
    const setAir = (flapLever, gearDown) => {
      sys.flapLever = flapLever; fm.ctl.flapAngle = FLAPS[flapLever].angle; fm.ctl.slat = flapLever > 0 ? 1 : 0;
      sys.gearLever = gearDown; fm.ctl.gearPos = gearDown ? 0 : 1;
      sys.airTime = 10; sys.groundTime = 0;
    };
    let skipStand = null;
    fm.ctl.pushback = 0;
    const spd = (kt, altM) => kt * KT * Math.sqrt(1.225 / (1.225 * Math.pow(1 - 2.2558e-5 * altM, 4.256)));
    if (id === 'rwy27' || id === 'rwy09') {
      const r = id === 'rwy27' ? r27 : r09;
      const d = headingVec(r.heading);
      fm.reset(new V3(r.threshold[0] + d.x * 75, gy, r.threshold[2] + d.z * 75), r.heading, 0, 0, true);
      sys.flapLever = 2; fm.ctl.flapAngle = 5; fm.ctl.slat = 1;
      sys.mcp = { spd: Math.round(sys.vspeeds().v2 + 10), hdg: r.heading, alt: 5000, vs: 2000 };
      sys.selectRunway(r);
      sys.autobrake = 6; sys.speedbrakeArmed = true;
      Object.assign(L, { strobe: true, landing: true, taxi: true });
      this.rig.setView('chase');
    } else if (id === 'gate') {
      const st = W.stands[6];
      skipStand = st.id;
      fm.reset(new V3(st.cg[0], gy, st.cg[2] - (STAND_NOSE - this.meta.noseGear[0])), 0, 0, 0, true);
      fm.ctl.parkingBrake = true;
      sys.mcp = { spd: 160, hdg: 270, alt: 5000, vs: 2000 };
      sys.selectRunway(r27);
      this.rig.setView('orbit');
      this.rig.orbitYaw = 0.9; this.rig.dist = 120;
    } else if (id === 'ils27' || id === 'final') {
      const r = r27;
      const d = headingVec(r.heading);
      const right = new V3(-d.z, 0, d.x);
      if (id === 'ils27') {
        const dist = 12 * 1852;
        const p = new V3(r.threshold[0] - d.x * dist - right.x * 2400, 3000 * FT, r.threshold[2] - d.z * dist - right.z * 2400);
        fm.reset(p, wrap360(r.heading + 25), spd(185, 914), 1.5, false);
        setAir(2, false);
        sys.mcp = { spd: 180, hdg: wrap360(r.heading + 25), alt: 3000, vs: -1000 };
        sys.selectRunway(r);
        sys.mcp.hdg = wrap360(r.heading + 25);
        sys.ap.roll = 'HDG'; sys.ap.pitch = 'ALT'; sys.ap.on = true;
        sys.ap.armed.loc = true; sys.ap.armed.gs = true;
        sys.at.on = true; sys.at.mode = 'SPD';
        sys.gammaT = 0; sys.phiT = 0;
        this.rig.setView('chase');
      } else {
        const dist = 4 * 1852;
        const h = Math.tan(3 * DEG) * (dist + r.ils.gsAntennaFromThr) + 1.5 - this.meta.groundY;
        const p = new V3(r.threshold[0] - d.x * dist, h, r.threshold[2] - d.z * dist);
        setAir(6, true);
        const vref = sys.vspeeds().vref30;
        fm.reset(p, r.heading, spd(vref + 5, h), 2.2, false);
        fm.vel.y = -Math.tan(3 * DEG) * (vref + 5) * KT;
        sys.mcp = { spd: Math.round(vref + 5), hdg: r.heading, alt: 3000, vs: -700 };
        sys.selectRunway(r);
        sys.at.on = true; sys.at.mode = 'SPD';
        sys.gammaT = -3; sys.phiT = 0;
        sys.speedbrakeArmed = true; sys.autobrake = 3;
        sys.tla[0] = sys.tla[1] = sys.pilot.throttle = 0.42;
        for (const e of fm.engines) e.n1 = 60;
        fm.ctl.stab = 5 * DEG;
        this.rig.setView('cockpit');
      }
      Object.assign(L, { strobe: true, landing: true, taxi: id === 'final' });
    } else if (id === 'city') {
      fm.reset(new V3(1500, 2000 * FT, 2600), 20, spd(210, 610), 2, false);
      setAir(1, false);
      sys.mcp = { spd: 210, hdg: 20, alt: 2000, vs: 1000 };
      sys.at.on = true; sys.at.mode = 'SPD';
      sys.gammaT = 0; sys.phiT = 0;
      sys.selectRunway(r27);
      for (const e of fm.engines) e.n1 = 62;
      sys.tla[0] = sys.tla[1] = sys.pilot.throttle = 0.45;
      fm.ctl.stab = 2 * DEG;
      Object.assign(L, { strobe: true, landing: true });
      this.rig.setView('chase');
    } else if (id === 'cruise') {
      const alt = 35000 * FT;
      fm.reset(new V3(-70000, alt, 9000), 75, Math.min(0.85, SPEC.MMO - 0.04) * 296.5, 2, false);
      setAir(0, false);
      sys.mcp = { spd: 270, hdg: 75, alt: 35000, vs: -1500 };
      sys.ap.roll = 'HDG'; sys.ap.pitch = 'ALT'; sys.ap.on = true;
      sys.at.on = true; sys.at.mode = 'SPD';
      sys.gammaT = 0;
      for (const e of fm.engines) e.n1 = 82;
      sys.tla[0] = sys.tla[1] = sys.pilot.throttle = 0.72;
      sys.selectRunway(r27);
      Object.assign(L, { strobe: true });
      this.rig.setView('chase');
      this.fm.step(0); this.fm.update();
      sys.mcp.spd = Math.round(this.fm.out.ias);
    }
    this.input.axes = { pitch: 0, roll: 0, yaw: 0 };
    // parked / AI aircraft and ground vehicles
    if (this.traffic) {
      const wdir = +$('windDir').value, wkt = +$('windSpd').value;
      // active runway: the one with a headwind component (27 in calm wind)
      const head27 = Math.cos((wdir - 270) * DEG) * wkt;
      this.traffic.enabled = $('traffic') ? $('traffic').checked : true;
      this.radio.voice = $('atcVoice') ? $('atcVoice').checked : true;
      this.radio.enabled = run;
      const tel = (this.livery?.name || 'Claude').split(/\s+/)[0];
      this.playerCallsign = `${tel} ${100 + Math.floor(Math.random() * 800)}`;
      this.traffic.reset({ stands: W.stands, skipStand, randomLivery, runway: head27 < -3 ? '09' : '27', windDir: wdir, windKt: wkt,
        playerCallsign: this.playerCallsign });
      this.radio.enabled = true;
      this.trafficFocus = null;
    }
    this.crashShown = false;
    this._serviceDone = false;
    this.acc = 0;
    this.tdReport = null;
    if (run) {
      this.paused = false;
      ['mcp', 'status', 'corner'].forEach((i) => $(i).classList.remove('hidden'));
      if (this.isTouch) $('touch').classList.remove('hidden');
      $('view').focus();
      $('panel').classList.toggle('hidden', !this.panelOn || this.rig.view === 'cockpit' || this.rig.view === 'ife');
      this.toast(SCENARIOS.find((s) => s.id === id).name + ' — ' + SCENARIOS.find((s) => s.id === id).note, 5000);
      this.updateMCP(true);
    }
  }

  // ------------------------------------------------------------------- commands
  command(c) {
    const sys = this.sys, fm = this.fm, o = fm.out;
    if (c === 'menu') {
      // Esc: in flight -> pause screen; on the pause screen -> resume; in the main menu -> start
      if (!$('pause').classList.contains('hidden')) this.resume();
      else if (!$('menu').classList.contains('hidden')) this.startFromMenu();
      else if ($('crash').classList.contains('hidden')) this.pause();
      return;
    }
    if (this.paused) return;
    switch (c) {
      case 'gear': sys.gearLever = !sys.gearLever; this.toast('ギア Gear ' + (sys.gearLever ? 'DOWN' : 'UP')); break;
      case 'flapsDown': sys.flapLever = Math.min(sys.flapLever + 1, FLAPS.length - 1); this.toast('フラップ Flaps ' + FLAPS[sys.flapLever].name); break;
      case 'flapsUp': sys.flapLever = Math.max(sys.flapLever - 1, 0); this.toast('フラップ Flaps ' + FLAPS[sys.flapLever].name); break;
      case 'speedbrake': {
        // cycle: DOWN -> ARMED -> FLIGHT (50%) -> UP (100%) -> DOWN
        if (!sys.speedbrakeArmed && sys.speedbrakeLever === 0) { sys.speedbrakeArmed = true; }
        else if (sys.speedbrakeArmed) { sys.speedbrakeArmed = false; sys.speedbrakeLever = 0.5; }
        else if (sys.speedbrakeLever < 1) { sys.speedbrakeLever = 1; }
        else { sys.speedbrakeLever = 0; }
        this.toast('スピードブレーキ Speedbrake ' + (sys.speedbrakeArmed ? 'ARMED' : sys.speedbrakeLever ? Math.round(sys.speedbrakeLever * 100) + '%' : 'DOWN'));
        break;
      }
      case 'parking': fm.ctl.parkingBrake = !fm.ctl.parkingBrake; this.toast('パーキングブレーキ Parking brake ' + (fm.ctl.parkingBrake ? 'SET' : 'OFF')); break;
      case 'autobrake': sys.autobrake = (sys.autobrake + 1) % AUTOBRAKE.length; this.toast('オートブレーキ Autobrake ' + AUTOBRAKE[sys.autobrake]); break;
      case 'reverse': sys.pilot.reverse = sys.pilot.reverse > 0 ? 0 : (o.wow ? 1 : 0); if (sys.pilot.reverse) { sys.pilot.throttle = 0; } this.toast('逆噴射 Reverse ' + (sys.pilot.reverse ? 'ON' : 'OFF')); break;
      case 'toga':
        sys.pilot.throttle = 1;
        if (sys.at.on || o.wow) { sys.at.on = true; sys.at.mode = 'TOGA'; }
        if (!o.wow && sys.ap.on && ['GS', 'FLARE', 'LOC'].includes(sys.ap.pitch)) { sys.ap.pitch = 'VS'; sys.mcp.vs = 2000; sys.mcp.alt = 3000; sys.ap.roll = 'HDG'; }
        this.toast('TOGA');
        break;
      case 'idle': sys.pilot.throttle = 0; if (sys.at.on) sys.at.on = false; break;
      case 'ap':
        if (sys.ap.on) { sys.apDisconnect(true); this.toast('A/P DISCONNECT'); }
        else if (sys.engageAP()) this.toast('A/P ENGAGED'); else this.toast('A/P: 離陸後に使用できます (airborne only)');
        break;
      case 'at':
        sys.at.on = !sys.at.on; sys.at.mode = 'SPD'; sys.at.integ = 0;
        if (sys.at.on && !o.wow) sys.mcp.spd = Math.round(o.ias);
        this.toast('A/T ' + (sys.at.on ? 'ON' : 'OFF'));
        break;
      case 'spd': sys.at.on = true; sys.at.mode = 'SPD'; break;
      case 'fd': sys.fdOn = !sys.fdOn; break;
      case 'hdg': sys.ap.roll = 'HDG'; sys.ap.armed.loc = false; if (!sys.ap.on) sys.mcp.hdg = Math.round(o.hdg) || 360; break;
      case 'alt': sys.ap.pitch = 'ALT'; sys.mcp.alt = sys.ap.on ? sys.mcp.alt : Math.round(o.altFt / 100) * 100; break;
      case 'vs': sys.ap.pitch = 'VS'; if (Math.abs(sys.mcp.vs) < 100) sys.mcp.vs = sys.mcp.alt > o.altFt ? 1500 : -1500; break;
      case 'flch': sys.ap.pitch = 'FLCH'; sys._flchG = o.gammaAir; sys.at.on = true; sys.at.mode = 'SPD'; break;
      case 'loc': sys.ap.armed.loc = !sys.ap.armed.loc; if (!sys.ils) sys.selectRunway(this.nearestRunway()); break;
      case 'app':
        if (!sys.ils) sys.selectRunway(this.nearestRunway());
        sys.ap.armed.loc = sys.ap.roll !== 'LOC'; sys.ap.armed.gs = true;
        this.toast('APP armed: ILS ' + sys.ils.ident);
        break;
      case 'view': {
        const v = this.rig.next();
        if ((v === 'cabin' || v === 'wing' || v === 'ife') && !this.cabin.group && this.cabin.available) this.toast('機内を読み込み中… Loading cabin');
        $('panel').classList.toggle('hidden', !this.panelOn || v === 'cockpit' || v === 'ife');
        this.toast('視点 ' + VIEW_NAMES[v]);
        break;
      }
      case 'panel': this.panelOn = !this.panelOn; $('panel').classList.toggle('hidden', !this.panelOn || this.rig.view === 'cockpit' || this.rig.view === 'ife'); break;
      case 'hud': this.instruments.hudOn = !this.instruments.hudOn; break;
      case 'lights': {
        const L = this.visual.lightsOn;
        const on = !L.landing;
        Object.assign(L, { landing: on, taxi: on && o.gs < 60, strobe: on || !o.wow });
        this.toast('着陸灯 Landing lights ' + (on ? 'ON' : 'OFF'));
        break;
      }
      case 'time': this.world.tod = (this.world.tod + 1) % 24; $('tod').value = this.world.tod; this.toast(`時刻 ${Math.floor(this.world.tod)}:00`); break;
      case 'pushback':
        if (!o.wow || o.gs > 3) break;
        fm.ctl.pushback = fm.ctl.pushback ? 0 : -1.3;
        if (fm.ctl.pushback) fm.ctl.parkingBrake = false;
        this.toast(fm.ctl.pushback ? 'プッシュバック開始 (Q/E で操向)' : 'プッシュバック終了');
        break;
      case 'direct': sys.lawDirect = !sys.lawDirect; this.toast('Flight controls ' + (sys.lawDirect ? 'DIRECT (Home/End でトリム)' : 'NORMAL')); break;
      case 'mute': this.audio.enabled = !this.audio.enabled; this.toast('Sound ' + (this.audio.enabled ? 'ON' : 'OFF')); break;
      case 'atc':
        if (this.traffic && !this.paused) this.traffic.pc.request();
        break;
      case 'trafficNext':
        if (!this.traffic) break;
        if (this.rig.view !== 'traffic') { this.rig.setView('traffic'); $('panel').classList.add('hidden'); }
        this.rig.trafficTarget = this.pickTrafficFocus(true);
        break;
      case 'atcVoice':
        if (!this.radio) break;
        this.radio.voice = !this.radio.voice;
        if ($('atcVoice')) $('atcVoice').checked = this.radio.voice;
        if (!this.radio.voice) this.radio.clear();
        this.toast('ATC 音声 voice ' + (this.radio.voice ? 'ON' : 'OFF'));
        break;
      case 'reset': this.startScenario(this.scenario, true); break;
      case 'service': {
        if (!this.cabin.available) break;
        if (!this.cabin.group) { this.cabin.ensure().then(() => this.cabin.startService()); this.toast('機内食サービスを開始します Meal service'); break; }
        if (this.cabin.startService()) this.toast('客室乗務員が機内食サービスを始めます 🍱 Meal service started');
        else this.toast(this.cabin.service.status() || 'サービス中です');
        break;
      }
    }
    this.updateMCP(true);
  }

  nearestRunway() {
    const W = this.worldData, p = this.fm.pos;
    let best = W.runways[0], bd = 1e12;
    for (const r of W.runways) {
      const d = headingVec(r.heading);
      // prefer the runway we are lined up with / approaching
      const dx = p.x - r.threshold[0], dz = p.z - r.threshold[2];
      const along = -(dx * d.x + dz * d.z);
      const score = Math.hypot(dx, dz) - (along > 0 ? 5000 : 0);
      if (score < bd) { bd = score; best = r; }
    }
    return best;
  }

  toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.opacity = 1;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.classList.add('hidden'), 400); }, ms);
  }

  updateMCP(force) {
    const s = this.sys;
    if (!force && this._mcpT && performance.now() - this._mcpT < 150) return;
    this._mcpT = performance.now();
    $('mcpSpd').textContent = Math.round(s.mcp.spd);
    $('mcpHdg').textContent = String(Math.round(s.mcp.hdg) % 360 || 360).padStart(3, '0');
    $('mcpAlt').textContent = Math.round(s.mcp.alt);
    $('mcpVs').textContent = (s.mcp.vs > 0 ? '+' : '') + Math.round(s.mcp.vs);
    const set = (cmd, on, arm) => {
      const b = document.querySelector(`.mcpbtn[data-cmd="${cmd}"]`);
      if (!b) return;
      b.classList.toggle('on', !!on);
      b.classList.toggle('arm', !on && !!arm);
    };
    set('ap', s.ap.on); set('at', s.at.on); set('fd', s.fdOn);
    set('hdg', s.ap.on && s.ap.roll === 'HDG'); set('loc', s.ap.on && s.ap.roll === 'LOC', s.ap.armed.loc);
    set('alt', s.ap.on && s.ap.pitch === 'ALT'); set('vs', s.ap.on && s.ap.pitch === 'VS'); set('flch', s.ap.on && s.ap.pitch === 'FLCH');
    set('app', s.ap.on && s.ap.pitch === 'GS', s.ap.armed.gs); set('spd', s.at.on && s.at.mode === 'SPD');
  }

  // ------------------------------------------------------------------- per frame
  frame(now) {
    const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.1));
    this.last = now;
    this.fps += ((1 / Math.max(dt, 1e-3)) - this.fps) * 0.05;
    const fm = this.fm, sys = this.sys;
    const events = [];
    if (!this.paused && !fm.crashed) {
      this.input.update(dt, sys.pilot, sys);
      if (sys.ap.on && (Math.abs(sys.pilot.pitch) > 0.6 || Math.abs(sys.pilot.roll) > 0.6)) { sys.apDisconnect(true); this.toast('A/P DISCONNECT (操縦入力)'); }
      // turbulence (filtered noise, stronger low and in clouds)
      this._gt = (this._gt || 0) + dt;
      const T = this.turb * (1 + (this.world.weather.overcast > 0.5 && fm.pos.y > this.world.weather.base && fm.pos.y < this.world.weather.top ? 1.5 : 0));
      if (!this._rng) this._rng = mulberry32(3);
      const g = fm.gust, k = Math.min(1, dt * 1.5), amp = T * 3.2 * (fm.pos.y < 600 ? 1 : 0.6);
      g.x += ((this._rng() - 0.5) * 2 * amp - g.x) * k;
      g.y += ((this._rng() - 0.5) * 2 * amp * 0.7 - g.y) * k;
      g.z += ((this._rng() - 0.5) * 2 * amp - g.z) * k;
      const shear = clamp(fm.pos.y / 300, 0.35, 1);
      fm.wind.set(this.windBase.x * shear, 0, this.windBase.z * shear);
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 48) {
        sys.update(DT);
        fm.step(DT);
        fm.update();
        this.acc -= DT; n++;
        while (fm.events.length) events.push(fm.events.shift());
      }
      if (n >= 48) this.acc = 0;
    }
    for (const e of events) this.onEvent(e);
    if (this.traffic && !this.paused) {
      const o = fm.out;
      this.traffic.update(dt, {
        player: { x: fm.pos.x, z: fm.pos.z, alt: o.ra ?? 0, a: ((o.hdg || 0) - 90) * DEG, v: (o.gs || 0) * KT, onGround: !!o.wow },
        camera: this.camera, night: this.world.night, touchdown: (ac) => this.aiTouchdown(ac),
      });
    }
    if (this.rig.view === 'traffic' && this.traffic) this.rig.trafficTarget = this.pickTrafficFocus();
    const cockpit = this.rig.view === 'cockpit';
    fm.wet = this.world.wet || 0;
    this.visual.update(dt, fm, sys, { night: this.world.night, camera: this.camera, cockpitView: cockpit, events, wet: fm.wet });
    {
      // cabin: passengers, crew and the IFE (live flight data for the maps / info channels)
      const v = this.rig.view, o = fm.out;
      const inside = v === 'cabin' || v === 'wing' || v === 'ife';
      const tod = this.world.tod || 0;
      const dist = Math.hypot(fm.pos.x, fm.pos.z) / 1000;
      this.cabin.update(inside, this.world.night, this.paused ? 0 : dt, {
        altFt: o.altFt || 0, gs: o.gs || 0, hdg: o.hdg || 0, oat: 15 - 1.98 * (o.altFt || 0) / 1000, x: fm.pos.x, z: fm.pos.z, dist,
        clock: `${String(Math.floor(tod)).padStart(2, '0')}:${String(Math.floor((tod % 1) * 60)).padStart(2, '0')}`,
        callsign: this.playerCallsign || '', type: 'Boeing ' + (this.cur?.short || ''),
      }, v === 'ife');
      // automatic meal service once established in the climb / cruise
      if (!this.paused && !this._serviceDone && (o.altFt || 0) > 10000 && this.cabin.group && this.cabin.startService()) this._serviceDone = true;
      const ifeOn = v === 'ife' && !this.paused;
      $('ife').classList.toggle('hidden', !ifeOn);
      if (ifeOn) {
        this.refreshIFE();
        const st = this.cabin.service ? this.cabin.service.status() : '';
        if ($('ifeStatus').textContent !== st) $('ifeStatus').textContent = st;
      }
      this.tailCamFrame(ifeOn && this.cabin.ife.channel === 'camera');
    }
    this.rig.update(dt, fm, this.visual.root);
    this.world.update(dt, this.camera, new THREE.Vector3(fm.pos.x, fm.pos.y, fm.pos.z));
    this.instruments.update(dt, fm, sys, { panel: this.panelOn && !cockpit && !this.paused, cockpit });
    if (this.mcp3d && this.visual.cockpitVisible && (this._mcpT3 = (this._mcpT3 || 0) + dt) > 0.12) { this._mcpT3 = 0; this.mcp3d.update(sys, this.world.night); }
    const hud = $('hud');
    const hctx = hud.getContext('2d');
    if (cockpit && !this.paused) {
      hctx.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
      this.instruments.drawHUD(hctx, fm, sys, this.camera, hud.width / this.hudScale, hud.height / this.hudScale);
      this._hudDrawn = true;
    } else if (this._hudDrawn) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hud.width, hud.height); this._hudDrawn = false; }
    const root = this.visual.root, mw = root.matrixWorld;
    if (!this._L) this._L = { camRight: new THREE.Vector3(), fwd: new THREE.Vector3(), engines: [new THREE.Vector3(), new THREE.Vector3()] };
    const L = this._L;
    L.view = this.rig.view; L.acPos = root.position; L.camPos = this.camera.position;
    L.rain = this.world.rain || 0;
    L.traffic = this.traffic && this.traffic.enabled ? this.traffic.sound(this.camera.position) : null;
    L.camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    L.fwd.set(1, 0, 0).applyQuaternion(root.quaternion);
    L.engines[0].fromArray(this.meta.engineAxisL).applyMatrix4(mw);
    L.engines[1].fromArray(this.meta.engineAxisR).applyMatrix4(mw);
    this.audio.update(dt, fm, sys, L);
    // camera velocity (for rain streaks) from the frame-to-frame motion
    if (dt > 0) {
      const cv = this._camTmp || (this._camTmp = new THREE.Vector3());
      cv.copy(this.camera.position).sub(this._camPrev).divideScalar(dt);
      if (cv.length() < 400) this.camVel.lerp(cv, Math.min(1, dt * 10));
      this._camPrev.copy(this.camera.position);
    }
    this.vapor.update(dt, fm, { camera: this.camera, humidity: this.world.weather.hum ?? 0.5, light: 1 - this.world.night,
      emit: (p, v, life, size, grow, alpha) => this.visual.emit(p, v, life, size, grow, alpha) });
    this.rain.update(dt, { camera: this.camera, amount: this.world.rain || 0, wind: fm.wind, camVel: this.camVel,
      inside: cockpit || this.rig.view === 'cabin' || this.rig.view === 'wing' || this.rig.view === 'ife', night: this.world.night });
    const hdr = !!this.post && this.quality !== 'low';
    HDR.uLin.value = hdr ? 1 : 0;
    // clouds / smoke: lit like white surfaces; point lights: bright enough to bloom at night
    HDR.uGain.value = this.world.sun.intensity * 0.85 + 0.45;
    HDR.uGainL.value = 1.1 / Math.max(this.renderer.toneMappingExposure, 0.3);
    if (hdr) {
      const rainAmt = this.world.rain || 0;
      this.post.update(dt, { night: this.world.night, plumes: this.plumes(), clouds: this.world.volumetricState(this.quality === 'high'),
        windshield: cockpit ? rainAmt : 0, wsSpeed: Math.min(1, (fm.out.ias || 0) / 120) });
      this.post.render();
    } else { this.world.volumetricState(false); this.renderer.render(this.scene, this.camera); }
    if (!this.paused) this.updateUI();
  }

  // IFE tail camera: the scene from the top of the fin, rendered into your seat monitor
  tailCamFrame(on) {
    if (!on) { this.cabin.setScreenTexture(null); return; }
    if (!this._tailRT) {
      this._tailRT = new THREE.WebGLRenderTarget(512, 320, { samples: 2, type: THREE.HalfFloatType });
      this._tailRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
      this._tailCam = new THREE.PerspectiveCamera(58, 512 / 320, 0.5, 60000);
    }
    this._tailN = (this._tailN || 0) + 1;
    if (this._tailN % 3 !== 1) return;
    const m = this.meta;
    const cam = this._tailCam, root = this.visual.root;
    const x = -(m.length - (m.sCG ?? 31.85)) + 2.5, y = m.height + m.groundY - 0.3;
    cam.position.set(x, y, 0).applyMatrix4(root.matrixWorld);
    cam.quaternion.copy(root.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.16));
    cam.updateMatrixWorld();
    const r = this.renderer, prev = r.getRenderTarget();
    const cg = this.cabin.group, vis = cg ? cg.visible : false;
    if (cg) cg.visible = false;
    r.setRenderTarget(this._tailRT);
    r.render(this.scene, cam);
    r.setRenderTarget(prev);
    if (cg) cg.visible = vis;
    this.cabin.setScreenTexture(this._tailRT.texture);
  }

  // AI traffic: tyre smoke on touchdown
  aiTouchdown(ac) {
    const c = Math.cos(ac.a), s = Math.sin(ac.a);
    const aft = ac.tm ? ac.tm.mainAft : 1.7, tr = ac.tm ? Math.abs(ac.tm.meta.mainGearL[2]) : 4.9;
    for (const side of [-1, 1]) {
      const p = { x: ac.x - c * aft - s * tr * side, y: 0.5, z: ac.z - s * aft + c * tr * side };
      for (let i = 0; i < 6; i++) {
        this.visual.emit(p, { x: c * ac.v * 0.5 + (Math.random() - 0.5) * 3, y: 0.8 + Math.random(), z: s * ac.v * 0.5 + (Math.random() - 0.5) * 3 },
          1.6 + Math.random(), 1.2, 3.5, 0.35);
      }
    }
  }

  // camera target for the traffic view: keep following one moving AI aircraft (B: next)
  pickTrafficFocus(next = false) {
    const T = this.traffic;
    const act = T.aircraft.filter((a) => a.state !== 'PARKED');
    const prio = { TAKEOFF: 0, ROLLOUT: 0, AIR: 1, LINEUP: 1, WAIT_TKOF: 2, PUSH: 2, TAXI_OUT: 3, TAXI_IN: 3, HOLDING: 4 };
    let f = this.trafficFocus;
    if (next || !f || (f.kind === 'ac' && f.obj.state === 'PARKED' && (f.t = (f.t || 0) + 1) > 600)) {
      const list = act.map((a) => ({ kind: 'ac', obj: a })).concat(T.vehicles.filter((v) => v.mover && !v.leader).map((v) => ({ kind: 'veh', obj: v })));
      list.sort((a, b) => (a.kind === 'ac' ? (prio[a.obj.state] ?? 5) : 6) - (b.kind === 'ac' ? (prio[b.obj.state] ?? 5) : 6));
      if (!list.length) return null;
      let i = 0;
      if (next && f) i = (list.findIndex((x) => x.obj === f.obj) + 1) % list.length;
      f = this.trafficFocus = list[i];
      this.toast(f.kind === 'ac' ? `追跡 Tracking ${f.obj.callsign}` : `追跡 Tracking ${f.obj.type}`, 2000);
    }
    const o = f.obj;
    this._tf = this._tf || new THREE.Vector3();
    return this._tf.set(o.x, (f.kind === 'ac' ? o.alt + 5 : 1.5), o.z);
  }

  // exhaust plumes for the heat-haze pass (world space)
  plumes() {
    const out = [];
    const mw = this.visual.root.matrixWorld;
    this._pl = this._pl || [0, 1].map(() => ({ start: new THREE.Vector3(), end: new THREE.Vector3(), r0: 0.9, r1: 5, strength: 0 }));
    [this.meta.engineAxisL, this.meta.engineAxisR].forEach((ax, i) => {
      const e = this.fm.engines[i], p = this._pl[i];
      p.start.set(ax[0] - 2.0 * ((this.meta.fanRadius || 1.41) / 1.41), ax[1], ax[2]).applyMatrix4(mw);
      p.end.set(ax[0] - 38, ax[1] - 0.8, ax[2]).applyMatrix4(mw);
      const n = Math.max(0, Math.min(1, (e.n1 - 15) / 85));
      p.strength = e.running ? 0.35 + 0.65 * n : 0;
      p.r1 = 4 + 3 * n;
      out.push(p);
    });
    return out;
  }

  onEvent(e) {
    if (e.type === 'touchdown') {
      const fpm = e.vs / FPM;
      this.rig.impulse(Math.min(1, Math.abs(fpm) / 600));
      const r = this.nearestRunway();
      const d = headingVec(r.heading);
      const dx = this.fm.pos.x - r.threshold[0], dz = this.fm.pos.z - r.threshold[2];
      const along = dx * d.x + dz * d.z;
      const lat = dx * -d.z + dz * d.x;
      const onRwy = along > -50 && along < r.length && Math.abs(lat) < r.width / 2;
      const grade = fpm > -120 ? 'Butter! 🧈' : fpm > -300 ? 'Good' : fpm > -500 ? 'Firm' : 'Hard';
      this.audio.thump(clamp(-e.vs / 3, 0.15, 1.2));
      this.toast(`接地 Touchdown ${Math.round(fpm)} fpm · ${Math.round(e.ias)} kt · ` +
        (onRwy ? `滑走路端から ${Math.round(along)} m · 中心線 ${lat.toFixed(1)} m — ${grade}` : '滑走路外 Off runway!'), 6500);
    } else if (e.type === 'crash' && !this.crashShown) {
      this.crashShown = true;
      $('crashTitle').textContent = e.reason.includes('water') ? '着水 DITCHED' : '墜落 CRASH';
      $('crashText').textContent = e.reason;
      setTimeout(() => $('crash').classList.remove('hidden'), 900);
    } else if (e.type === 'scrape') {
      this.toast('⚠ ' + (e.part === 'tail' ? 'テールストライク Tail strike!' : e.part + ' strike'), 3000);
    }
  }

  updateUI() {
    const now = performance.now();
    if (this._uiT && now - this._uiT < 120) return;
    this._uiT = now;
    const o = this.fm.out, s = this.sys;
    const f = FLAPS[s.flapLever].name;
    const gear = this.fm.ctl.gearPos < 0.01 ? 'DN' : this.fm.ctl.gearPos > 0.99 ? 'UP' : '▲▼';
    $('status').textContent =
      `${VIEW_NAMES[this.rig.view]}   ${Math.round(this.fps)} fps\n` +
      `IAS ${Math.round(o.ias)} kt  GS ${Math.round(o.gs)}  M ${o.mach.toFixed(2)}\n` +
      `ALT ${Math.round(o.altFt)} ft  RA ${o.raFt < 2500 ? Math.round(o.raFt) : '---'}  VS ${Math.round(o.vs / FPM)}\n` +
      `HDG ${String(Math.round(o.hdg) % 360).padStart(3, '0')}  PITCH ${o.pitch.toFixed(1)}  BANK ${o.bank.toFixed(0)}\n` +
      `FLAPS ${f}  GEAR ${gear}  THR ${Math.round(s.tla[0] * 100)}%  ${s.pilot.reverse ? 'REV ' : ''}${this.fm.ctl.parkingBrake ? 'PRK ' : ''}${s.mode}`;
    const W = s.warn;
    const b = $('banner');
    const txt = this.fm.crashed ? '' : W.stall ? 'STALL' : W.pullUp ? 'PULL UP' : W.overspeed ? 'OVERSPEED' : W.config ? 'CONFIG' :
      W.sinkRate ? 'SINK RATE' : W.tooLowGear ? 'TOO LOW GEAR' : W.bankAngle ? 'BANK ANGLE' : '';
    b.textContent = txt;
    b.classList.toggle('hidden', !txt);
    this.updateMCP(false);
    if (s._apWasOn !== s.ap.on) s._apWasOn = s.ap.on;
    // radio: what the player can ask ATC next
    if (this.traffic && this.traffic.enabled) {
      const h = this.traffic.pc.hint();
      const el = $('atcHint');
      const txt = h ? `📻 ${this.playerCallsign} — <b>Y</b> ${h}` : `📻 ${this.playerCallsign}`;
      if (el.innerHTML !== txt) el.innerHTML = txt;
      el.classList.remove('hidden');
      el.classList.toggle('ready', !!h);
    }
  }
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'エラー Error: ' + e.message + ' — ローカルでは web/ フォルダで "python3 -m http.server" を実行して開いてください。';
});
window.app = app;
