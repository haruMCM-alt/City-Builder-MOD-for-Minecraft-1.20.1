// B787-9 Flight Simulator - application entry point.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FlightModel, FLAPS } from './flightmodel.js';
import { Systems, AUTOBRAKE } from './systems.js';
import { configureTerrain, terrainHeight } from './terrain.js';
import { World } from './world.js';
import { AircraftVisual } from './aircraft.js';
import { Instruments } from './instruments.js';
import { CameraRig, VIEW_NAMES } from './camera.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { V3, DEG, KT, FT, FPM, clamp, headingVec, wrap360, mulberry32 } from './util.js';

const $ = (id) => document.getElementById(id);
const DT = 1 / 240;
const ASSET = './assets/';
// model files: .glb by default; a host that cannot serve .glb can set window.B787_MODEL_EXT = '.gltf.json'
const MODEL_EXT = window.B787_MODEL_EXT || '.glb';

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
    const [meta, world] = await Promise.all([fetchJSON(ASSET + 'b787-9.json'), fetchJSON(ASSET + 'world.json')]);
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
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const prog = { ac: 0, world: 0, lod: 0 };
    const upd = () => setLoad(0.05 + 0.85 * (prog.ac * 0.35 + prog.world * 0.5 + prog.lod * 0.15),
      `787-9 ${Math.round(prog.ac * 100)}% · airport/city ${Math.round(prog.world * 100)}%`);
    const [acGltf, worldGltf, lodGltf] = await Promise.all([
      loadGLB(loader, ASSET + 'b787-9' + MODEL_EXT, (p) => { prog.ac = p; upd(); }),
      loadGLB(loader, ASSET + 'world' + MODEL_EXT, (p) => { prog.world = p; upd(); }),
      loadGLB(loader, ASSET + 'b787-9-lod' + MODEL_EXT, (p) => { prog.lod = p; upd(); }).catch(() => null),
    ]);
    setLoad(0.92, 'building scene…');
    this.world.attachWorldGLB(worldGltf);
    this.world.buildTrees(world.trees);
    this.world.buildLights(world.lights);
    this.world.setWeather('scattered');
    this.lodTemplate = lodGltf ? lodGltf.scene : null;

    // aircraft
    this.fm = new FlightModel(meta);
    this.sys = new Systems(this.fm, world);
    this.visual = new AircraftVisual(acGltf, meta, this.scene, this.quality);
    this.instruments = new Instruments($('pfd'), $('nd'), $('eicas'), $('hud'), world);
    this.visual.setDisplayTextures(this.instruments.textures);
    this.rig = new CameraRig(this.camera, canvas, meta, world);
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

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const hud = $('hud');
    const pr = Math.min(window.devicePixelRatio, 2);
    hud.width = w * pr; hud.height = h * pr;
    this.hudScale = pr;
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
    bind('fuel', 'fuelVal', (v) => `${(v / 1000).toFixed(0)} t`);
    bind('payload', 'payVal', (v) => `${(v / 1000).toFixed(0)} t`);
    $('startBtn').onclick = () => this.startFromMenu();
    $('retryBtn').onclick = () => { $('crash').classList.add('hidden'); this.startScenario(this.scenario, true); };
    $('menuBtn').onclick = () => { $('crash').classList.add('hidden'); this.openMenu(); };
    $('btnView').onclick = () => this.command('view');
    $('btnPanel').onclick = () => this.command('panel');
    $('btnMenu').onclick = () => this.command('menu');
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
    const gw = 128850 + f + p;
    $('gwVal').textContent = `${(gw / 1000).toFixed(1)} t` + (gw > 254011 ? ' ⚠ > MTOW' : '');
    $('gwVal').style.color = gw > 254011 ? 'var(--bad)' : '';
  }

  openMenu() {
    this.paused = true;
    $('menu').classList.remove('hidden');
    ['mcp', 'panel', 'status', 'corner', 'touch'].forEach((i) => $(i).classList.add('hidden'));
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
    const gy = 5.0 - 0.17;
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
      fm.reset(new V3(st.cg[0], gy, st.cg[2]), 0, 0, 0, true);
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
        const h = Math.tan(3 * DEG) * (dist + r.ils.gsAntennaFromThr) + 1.5 + 5.25;
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
      fm.reset(new V3(-70000, alt, 9000), 75, 0.85 * 296.5, 2, false);
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
    // parked aircraft
    if (this.lodTemplate) {
      for (const o of this.world.parked) this.scene.remove(o);
      this.world.parked = [];
      this.world.addParkedAircraft(this.lodTemplate, W.stands.filter((s) => s.id % 4 !== 0 || s.id === 1), skipStand);
    }
    this.crashShown = false;
    this.acc = 0;
    this.tdReport = null;
    if (run) {
      this.paused = false;
      ['mcp', 'status', 'corner'].forEach((i) => $(i).classList.remove('hidden'));
      if (this.isTouch) $('touch').classList.remove('hidden');
      $('view').focus();
      $('panel').classList.toggle('hidden', !this.panelOn || this.rig.view === 'cockpit');
      this.toast(SCENARIOS.find((s) => s.id === id).name + ' — ' + SCENARIOS.find((s) => s.id === id).note, 5000);
      this.updateMCP(true);
    }
  }

  // ------------------------------------------------------------------- commands
  command(c) {
    const sys = this.sys, fm = this.fm, o = fm.out;
    if (c === 'menu') { if (this.paused && !$('menu').classList.contains('hidden')) { this.startFromMenu(); } else this.openMenu(); return; }
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
        $('panel').classList.toggle('hidden', !this.panelOn || v === 'cockpit');
        this.toast('視点 ' + VIEW_NAMES[v]);
        break;
      }
      case 'panel': this.panelOn = !this.panelOn; $('panel').classList.toggle('hidden', !this.panelOn || this.rig.view === 'cockpit'); break;
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
      case 'reset': this.startScenario(this.scenario, true); break;
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
    const dt = Math.min((now - this.last) / 1000, 0.1);
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
    const cockpit = this.rig.view === 'cockpit';
    this.visual.update(dt, fm, sys, { night: this.world.night, camera: this.camera, cockpitView: cockpit, events });
    this.rig.update(dt, fm, this.visual.root);
    this.world.update(dt, this.camera, new THREE.Vector3(fm.pos.x, fm.pos.y, fm.pos.z));
    this.instruments.update(dt, fm, sys, { panel: this.panelOn && !cockpit && !this.paused, cockpit });
    const hud = $('hud');
    const hctx = hud.getContext('2d');
    if (cockpit && !this.paused) {
      hctx.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
      this.instruments.drawHUD(hctx, fm, sys, this.camera, hud.width / this.hudScale, hud.height / this.hudScale);
      this._hudDrawn = true;
    } else if (this._hudDrawn) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hud.width, hud.height); this._hudDrawn = false; }
    this.audio.update(dt, fm, sys, this.rig.view, this.camera.position.distanceTo(this.visual.root.position));
    this.renderer.render(this.scene, this.camera);
    if (!this.paused) this.updateUI();
  }

  onEvent(e) {
    if (e.type === 'touchdown') {
      const fpm = e.vs / FPM;
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
  }
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'エラー Error: ' + e.message + ' — ローカルでは web/ フォルダで "python3 -m http.server" を実行して開いてください。';
});
window.app = app;
