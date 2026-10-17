import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// tiny sun glints on glass / polished metal can overflow the half-float buffer;
// one Inf/NaN pixel would then smear across the screen through the bloom blur
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(16.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 32.0), 1.0);
    }`,
};
import { Route } from './route.js';
import { VEHICLES, DEFAULT_VEHICLE, CAR_LEN } from './vehicles.js';
import { World } from './world/world.js';
import { TrainSet } from './trainmodel.js';
import { TrainPhysics } from './physics.js';
import { SoundEngine } from './audio/sound.js';
import { Announcer } from './audio/announce.js';
import { MelodyPlayer } from './audio/melody.js';
import { MELODY_CLIPS } from './audio/melody-cues.js';
import { buildTimetable, fmtTime } from './timetable.js';
import { HUD } from './hud.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('tsim.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tsim.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------------------------------------------------------------------------
// globals
// ---------------------------------------------------------------------------
const route = new Route();
const sound = new SoundEngine();
const announcer = new Announcer(sound);
const melody = new MelodyPlayer(sound);
const hud = new HUD();
const gltfs = {};
let renderer, scene, camera, sun, hemi, composer = null, aoPass = null;
let world = null, player = null, physics = null, game = null, traffic = null;
let cab = null, mascon = null;
let running = false, paused = false;
let camMode = 'cab';
const look = { yaw: 0, pitch: -0.05, drag: false, lx: 0, ly: 0 };
const bob = { y: 0, v: 0 };
let tracksideCam = null;

const settings = {
  vehicle: store.get('vehicle', DEFAULT_VEHICLE),
  cars: store.get('cars', 15),
  from: store.get('from', 0),
  to: store.get('to', route.stations.length - 1),
  annMode: store.get('annMode', 'file'),
  melMode: store.get('melMode', 'on'),
  shadows: store.get('shadows', true),
  quality: store.get('quality', 'high'),
};
if (!VEHICLES[settings.vehicle]) settings.vehicle = DEFAULT_VEHICLE;

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------
async function loadAssets() {
  const loader = new GLTFLoader();
  const files = { e231: 'e231', e233: 'e233', s211: '211', s115: '115', cab: 'cab_interior', env: 'environment' };
  const entries = Object.entries(files);
  let done = 0;
  await Promise.all(entries.map(async ([k, f]) => {
    gltfs[k] = await loader.loadAsync(`assets/models/${f}.glb`);
    done++;
    $('loadBar').style.width = `${(done / entries.length) * 100}%`;
  }));
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('view').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  // sky, image based lighting and fog come from the World's Environment
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.25, 30000);
  camera.rotation.order = 'YXZ';
  hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b6250, 0.35);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

/** post-processing chain for the chosen quality: HDR + MSAA, (GTAO), bloom, tone mapping */
function setupComposer(q) {
  if (composer) { composer.dispose(); composer = null; aoPass = null; }
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.5));
  sun.shadow.mapSize.set(q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024, q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (q === 'low') return;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(SanitizeShader));
  if (q === 'ultra') {
    aoPass = new GTAOPass(scene, camera, w, h);
    aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 });
    aoPass.blendIntensity = 0.85;
    composer.addPass(aoPass);
  }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.45, 0.95));
  composer.addPass(new OutputPass());
}

function draw() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// menu
// ---------------------------------------------------------------------------
function buildMenu() {
  const vl = $('vehList');
  vl.innerHTML = Object.values(VEHICLES).map((v) => `
    <button class="veh ${v.id === settings.vehicle ? 'sel' : ''}" data-id="${v.id}">
      <span class="vname">${v.name}</span><span class="vtag">${v.tag}</span>
      <span class="vdesc">${v.desc}</span>
      <span class="vspec">最高 ${v.maxSpeed} km/h ・ 加速 ${v.accel} km/h/s ・ P${v.powerNotches}/B${v.brakeNotches}</span>
    </button>`).join('');
  vl.querySelectorAll('.veh').forEach((b) => b.addEventListener('click', () => {
    settings.vehicle = b.dataset.id; store.set('vehicle', settings.vehicle);
    vl.querySelectorAll('.veh').forEach((x) => x.classList.toggle('sel', x === b));
    updateFormationNote();
  }));
  const carsSel = $('carsSel');
  carsSel.value = String(settings.cars);
  carsSel.addEventListener('change', () => { settings.cars = Number(carsSel.value); store.set('cars', settings.cars); updateFormationNote(); });
  const fromSel = $('fromSel'), toSel = $('toSel');
  const opts = route.stations.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
  fromSel.innerHTML = opts; toSel.innerHTML = opts;
  fromSel.value = String(settings.from); toSel.value = String(settings.to);
  const fix = () => {
    let f = Number(fromSel.value), t = Number(toSel.value);
    if (t <= f) { t = Math.min(route.stations.length - 1, f + 1); toSel.value = String(t); }
    if (f >= route.stations.length - 1) { f = route.stations.length - 2; fromSel.value = String(f); }
    settings.from = f; settings.to = t; store.set('from', f); store.set('to', t);
    updateFormationNote();
  };
  fromSel.addEventListener('change', fix); toSel.addEventListener('change', fix);
  const qualSel = $('qualSel');
  qualSel.value = settings.quality;
  qualSel.addEventListener('change', () => { settings.quality = qualSel.value; store.set('quality', settings.quality); });
  const shadowChk = $('shadowChk');
  shadowChk.checked = settings.shadows;
  shadowChk.addEventListener('change', () => { settings.shadows = shadowChk.checked; store.set('shadows', settings.shadows); });

  // announcements
  const annSel = $('annMode');
  annSel.value = settings.annMode;
  annSel.addEventListener('change', () => { settings.annMode = annSel.value; store.set('annMode', settings.annMode); updateAnnStatus(); });

  // departure melodies
  const melSel = $('melMode');
  melSel.value = settings.melMode;
  melSel.addEventListener('change', () => { settings.melMode = melSel.value; store.set('melMode', settings.melMode); updateMelStatus(); });
  $('melFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('melStatus').textContent = '読み込み中…';
    try { await melody.loadFile(f); } catch (err) { $('melStatus').textContent = err.message; return; }
    updateMelStatus();
  });
  $('melAssignBtn').addEventListener('click', () => { buildMelodyAssign(); $('melAssign').classList.remove('hidden'); });
  $('melAssignClose').addEventListener('click', () => { $('melAssign').classList.add('hidden'); if (melody.audio) melody.audio.pause(); });
  $('melAssignReset').addEventListener('click', () => { melody.resetAssign(); buildMelodyAssign(); });
  $('startBtn').addEventListener('click', startGame);
  updateFormationNote();
  updateAnnStatus();
  updateMelStatus();
}

function updateFormationNote() {
  const v = VEHICLES[settings.vehicle];
  const f = v.formations[settings.cars] || v.formations[15];
  const g = (f.match(/G/g) || []).length;
  const st = route.stations;
  $('formNote').textContent = `${f.length}両編成${g ? `（グリーン車 ${g}両）` : ''} ・ ${st[settings.from].name} → ${st[settings.to].name}  ${((st[settings.to].s - st[settings.from].s) / 1000).toFixed(1)} km`;
}

function updateMelStatus() {
  const el = $('melStatus');
  if (settings.melMode === 'off') el.textContent = '発車メロディなし';
  else if (melody.audio) el.textContent = `✔ ${melody.fileName}${melody.durationWarning ? '（長さが想定と違います。区切り位置がずれる可能性があります）' : ''}`;
  else el.textContent = '添付の発車メロディ集（.m4a）を選択してください。未選択の場合は仮の合成メロディを鳴らします。';
  $('melAssignBtn').disabled = !melody.audio;
}

/** per-station melody picker with preview */
function buildMelodyAssign() {
  const list = $('melAssignList');
  const opts = MELODY_CLIPS.map((c) => `<option value="${c.no}">No.${c.no}${c.retired ? '（使用終了）' : ''} ・ ${(c.end - c.start).toFixed(0)}秒</option>`).join('');
  list.innerHTML = route.stations.slice(0, -1).map((st) => `
    <div class="ma-row"><span class="ma-st">${st.name}</span>
      <select data-st="${st.name}">${opts}</select>
      <button class="ma-play" data-st="${st.name}" aria-label="${st.name}のメロディを試聴">▶</button></div>`).join('');
  list.querySelectorAll('select').forEach((sel) => {
    sel.value = String(melody.assign[sel.dataset.st]);
    sel.addEventListener('change', () => melody.setAssign(sel.dataset.st, Number(sel.value)));
  });
  list.querySelectorAll('.ma-play').forEach((b) => b.addEventListener('click', () => melody.preview(melody.assign[b.dataset.st])));
}

function updateAnnStatus() {
  const el = $('annStatus');
  if (settings.annMode === 'off') el.textContent = '車内放送なし';
  else if (settings.annMode === 'tts') el.textContent = 'ブラウザの音声合成で放送します';
  else if (announcer.audio) el.textContent = '✔ 収録音声を内蔵（宇都宮線 普通宇都宮行き 上野→宇都宮／収録：ひごくま氏）';
  else el.textContent = '収録音声を読み込み中…（読み込めない場合は音声合成で代用します）';
}

// ---------------------------------------------------------------------------
// game start
// ---------------------------------------------------------------------------
async function startGame() {
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');
  await sound.init();
  if (announcer.loading) { try { await announcer.loading; } catch { /* falls back below */ } }
  if (settings.annMode === 'file' && !announcer.audio) {
    if (!(await announcer.loadBuiltIn())) announcer.mode = 'tts';
  }
  if (settings.annMode === 'tts') announcer.mode = 'tts';
  if (settings.annMode === 'off') announcer.mode = 'off';
  if (settings.annMode === 'file' && announcer.audio) announcer.mode = 'file';
  announcer.attach();
  if (melody.loading) { try { await melody.loading; } catch { /* fallback jingle */ } }
  melody.enabled = settings.melMode !== 'off';
  melody.attach();

  const veh = VEHICLES[settings.vehicle];
  const formation = veh.formations[settings.cars] || veh.formations[15];
  sound.setVehicle(veh);
  setupComposer(settings.quality);
  renderer.shadowMap.enabled = settings.shadows;
  sun.castShadow = settings.shadows;

  if (world) { teardown(); }
  world = new World(renderer, scene, route, gltfs.env, settings.quality);
  const tt = buildTimetable(route, veh, formation.length, settings.from, settings.to);
  physics = new TrainPhysics(veh, formation.length);
  player = new TrainSet(gltfs[veh.id].scene, veh, formation, { key: modelKey(veh), dest: '普通 宇都宮', destType: veh.id === 's115' ? 'roll' : 'led' });
  scene.add(player.group);
  // cab interior on the leading car
  cab = gltfs.cab.scene.clone(true);
  cab.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  mascon = cab.getObjectByName('mascon_handle');
  player.cars[0].userData.inner.add(cab);
  hud.setup(veh, tt);
  game = new Game({ route, physics, timetable: tt, sound, announcer, melody, hud, fromIdx: settings.from });
  traffic = new Traffic();
  world.preload(physics.s);
  setCamMode('cab');
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('ttPanel').innerHTML = tt.map((r) => `<tr><td>${r.station.name}</td><td>${r.arr ? fmtTime(r.arr, true) : ''}</td><td>${r.dep ? fmtTime(r.dep, true) : ''}</td></tr>`).join('');
  hud.message(`${veh.name} ${formation.length}両<br><small>${tt[0].station.name} ${fmtTime(tt[0].dep)} 発 → ${tt[tt.length - 1].station.name} ${fmtTime(tt[tt.length - 1].arr)} 着</small>`, 'info', 5);
  running = true;
  paused = false;
  resultShown = false;
}

function modelKey(veh) { return { e231: 'e231', e233: 'e233', s211: '211', s115: '115' }[veh.id]; }

function teardown() {
  if (player) player.dispose();
  if (traffic) traffic.clear();
  if (world) world.dispose();
  announcer.stop(true);
  melody.stopClip(true);
  sound.horn(false); sound.atsBell(false);
}

function backToMenu() {
  running = false;
  teardown();
  world = null;
  $('hud').classList.add('hidden');
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('menu').classList.remove('hidden');
  updateAnnStatus();
}

// ---------------------------------------------------------------------------
// oncoming / parallel traffic
// ---------------------------------------------------------------------------
class Traffic {
  constructor() {
    this.list = [];
    this.timer = { up: 20, ex: 10 };
    this.pose = {};
  }
  clear() { for (const t of this.list) t.set.dispose(); this.list = []; }
  spawn(kind, s) {
    const pick = kind === 'keihin' ? 'e233' : ['e231', 'e233', 'e231', 's211'][Math.floor(Math.random() * 4)];
    const veh = VEHICLES[pick];
    let formation, opts;
    if (kind === 'keihin') {
      formation = 'CPMMPMMPMR';
      opts = { key: 'e233', dest: '各駅停車 大船', forward: false, recolor: true };
    } else {
      formation = Math.random() < 0.6 ? veh.formations[15] : veh.formations[10];
      opts = { key: modelKey(veh), dest: Math.random() < 0.5 ? '普通 上野' : '快速 小田原', forward: false };
    }
    const set = new TrainSet(gltfs[pick].scene, veh, formation, opts);
    if (opts.recolor) recolorKeihin(set);
    scene.add(set.group);
    const track = kind === 'keihin' ? (x) => route.extraTracks(x)[1] ?? route.upOffset(x) - 8.8 : (x) => route.upOffset(x);
    this.list.push({ set, s, v: (kind === 'keihin' ? 75 : 95 + Math.random() * 15) / 3.6, track, passed: false, kind });
  }
  update(dt, sp) {
    this.timer.up -= dt;
    if (this.timer.up <= 0) {
      this.timer.up = 150 + Math.random() * 200;
      const s = sp + 2600;
      if (s < route.sMax - 200) this.spawn('main', s);
    }
    if (sp < 29000) {
      this.timer.ex -= dt;
      if (this.timer.ex <= 0) {
        this.timer.ex = 120 + Math.random() * 150;
        this.spawn('keihin', sp + 2400);
      }
    }
    for (const t of this.list) {
      t.s -= t.v * dt;
      t.set.place(route, t.s, t.track, 0.004);
      if (!t.passed && t.s < sp) {
        t.passed = true;
        sound.passBy(camMode === 'cab' ? 0.7 : 1);
      }
    }
    this.list = this.list.filter((t) => {
      const keep = t.s + t.set.length > sp - 900 && t.s > route.sMin + 100;
      if (!keep) t.set.dispose();
      return keep;
    });
  }
}

function recolorKeihin(set) {
  const blue = new THREE.MeshStandardMaterial({ color: 0x18a7e0, roughness: 0.45 });
  set.group.traverse((o) => {
    if (o.isMesh && (o.material.name === 'shonan_orange' || o.material.name === 'shonan_green')) o.material = blue;
  });
}

// ---------------------------------------------------------------------------
// cameras
// ---------------------------------------------------------------------------
const CAMS = ['cab', 'front', 'side', 'chase', 'trackside'];
const CAM_LABEL = { cab: '運転台', front: '正面', side: '側面', chase: '後方上空', trackside: '沿線' };
function setCamMode(m) {
  camMode = m;
  $('camLabel').textContent = CAM_LABEL[m];
  const inCab = m === 'cab';
  sound.setInCab(inCab);
  if (player) player.setVisible(0, !inCab);
  if (cab) cab.visible = inCab;
  if (camera.parent) camera.parent.remove(camera);
  if (inCab) {
    player.cars[0].userData.inner.add(camera);
    camera.position.set(8.45, 2.42, -0.62);
    camera.fov = 58;
    look.yaw = 0; look.pitch = -0.05;
  } else {
    scene.add(camera);
    camera.fov = 50;
    tracksideCam = null;
  }
  camera.updateProjectionMatrix();
}

function updateCamera(dt) {
  if (!player) return;
  const p = {}, q = {};
  if (camMode === 'cab') {
    // head bob + joint jolts
    bob.v += (-bob.y * 120 - bob.v * 9) * dt;
    bob.y += bob.v * dt;
    const t = performance.now() / 1000;
    const vib = Math.min(1, physics.kmh / 100) * 0.006;
    camera.position.y = 2.42 + bob.y + Math.sin(t * 13.1) * vib * 0.4;
    camera.position.z = -0.62 + Math.sin(t * 2.3) * vib;
    camera.rotation.set(look.pitch, -Math.PI / 2 + look.yaw, 0);
  } else if (camMode === 'side') {
    route.pose(physics.s - 12, 16, p);
    camera.position.set(p.x, p.y + 3.2, p.z);
    route.pose(physics.s - 22, 0, q);
    camera.lookAt(q.x, q.y + 2.0, q.z);
  } else if (camMode === 'front') {
    // ahead of the train, like a platform-end photo of the cab
    route.pose(physics.s + 15, 3.4, p);
    camera.position.set(p.x, p.y + 2.0, p.z);
    route.pose(physics.s - 9, 0.2, q);
    camera.lookAt(q.x, q.y + 1.9, q.z);
  } else if (camMode === 'chase') {
    route.pose(physics.s - 70, 0, p);
    camera.position.set(p.x, p.y + 22, p.z);
    route.pose(physics.s + 40, 0, q);
    camera.lookAt(q.x, q.y, q.z);
  } else if (camMode === 'trackside') {
    if (!tracksideCam || physics.s > tracksideCam.s + physics.len + 40) {
      const s = physics.s + 260 + Math.random() * 120;
      const st = route.structureAt(s).type;
      // on viaducts / bridges stand at ground level and look up; else beside the line
      const lat = st === 'ground' ? 6.2 + Math.random() * 1.2 : 18 + Math.random() * 10;
      route.pose(s, lat, p);
      const gy = st === 'ground' || st === 'embankment' ? p.y : 0;
      tracksideCam = { s, x: p.x, z: p.z, y: gy + 1.6 + Math.random() * 2 };
    }
    camera.position.set(tracksideCam.x, tracksideCam.y, tracksideCam.z);
    route.pose(physics.s - 15, 0, q);
    camera.lookAt(q.x, q.y + 2.2, q.z);
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
function handleDelta(d) {
  if (!physics || paused) return;
  const before = physics.handle;
  physics.setHandle(physics.handle + d);
  if (physics.handle !== before) {
    sound.playBuf && sound.ready && sound.playBuf(sound.camBuf, 0.18, 1.6, 0, sound.master);
  }
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', ' ', 'PageUp', 'PageDown'].includes(k)) e.preventDefault();
    if (e.repeat && !['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S'].includes(k)) return;
    switch (k) {
      case 'ArrowUp': case 'w': case 'W': case 'z': case 'Z': handleDelta(+1); break;
      case 'ArrowDown': case 's': case 'S': case 'a': case 'A': handleDelta(-1); break;
      case ' ': case 'n': case 'N': if (physics) physics.setHandle(0); break;
      case 'e': case 'E': case 'Backspace': if (physics) physics.setHandle(physics.EB); break;
      case 'q': case 'Q': if (physics) physics.setHandle(-physics.veh.brakeNotches); break;
      case 'h': case 'H': sound.horn(true); break;
      case 'c': case 'C': case 'v': case 'V': setCamMode(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]); break;
      case 'Enter': case 'f': case 'F': if (game) game.skipWait(); break;
      case 'm': case 'M': sound.setMuted(!sound.muted); break;
      case 't': case 'T': $('ttBox').classList.toggle('hidden'); break;
      case 'Escape': case 'p': case 'P': togglePause(); break;
      default: break;
    }
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'h' || e.key === 'H') sound.horn(false); });
  $('view').addEventListener('wheel', (e) => { if (running) { e.preventDefault(); handleDelta(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
  const v = $('view');
  v.addEventListener('pointerdown', (e) => { look.drag = true; look.lx = e.clientX; look.ly = e.clientY; });
  window.addEventListener('pointerup', () => { look.drag = false; });
  window.addEventListener('pointermove', (e) => {
    if (!look.drag || camMode !== 'cab') return;
    look.yaw = Math.max(-1.4, Math.min(1.4, look.yaw - (e.clientX - look.lx) * 0.004));
    look.pitch = Math.max(-0.6, Math.min(0.5, look.pitch - (e.clientY - look.ly) * 0.004));
    look.lx = e.clientX; look.ly = e.clientY;
  });
  v.addEventListener('dblclick', () => { look.yaw = 0; look.pitch = -0.05; });
  // on-screen buttons
  const hold = (id, fn) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); fn(); });
  };
  hold('btnPow', () => handleDelta(+1));
  hold('btnBrk', () => handleDelta(-1));
  hold('btnN', () => physics && physics.setHandle(0));
  hold('btnEB', () => physics && physics.setHandle(physics.EB));
  hold('btnCam', () => setCamMode(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]));
  hold('btnSkip', () => game && game.skipWait());
  const horn = $('btnHorn');
  horn.addEventListener('pointerdown', (e) => { e.stopPropagation(); sound.horn(true); });
  horn.addEventListener('pointerup', () => sound.horn(false));
  horn.addEventListener('pointerleave', () => sound.horn(false));
  hold('btnPause', togglePause);
  $('resumeBtn').addEventListener('click', togglePause);
  $('quitBtn').addEventListener('click', backToMenu);
  $('menuBtn').addEventListener('click', backToMenu);
  $('retryBtn').addEventListener('click', () => { $('result').classList.add('hidden'); startGame(); });
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  $('pause').classList.toggle('hidden', !paused);
  announcer.setPaused(paused);
  melody.setPaused(paused);
  if (sound.ctx) paused ? sound.ctx.suspend() : sound.ctx.resume();
}

// gamepad: left stick Y or D-pad as one-handle controller
let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) return;
  const pressed = (i) => gp.buttons[i] && gp.buttons[i].pressed;
  const edge = (i) => { const p = pressed(i); const r = p && !padPrev[i]; padPrev[i] = p; return r; };
  if (edge(12)) handleDelta(+1);
  if (edge(13)) handleDelta(-1);
  if (edge(0)) physics && physics.setHandle(0);
  if (edge(1)) physics && physics.setHandle(physics.EB);
  if (edge(3)) setCamMode(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]);
  if (edge(9)) togglePause();
  if (edge(2)) game && game.skipWait();
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
const AXLES = [];
for (let c = 0; c < 4; c++) for (const b of [-6.9, 6.9]) for (const a of [-1.05, 1.05]) AXLES.push(CAR_LEN / 2 + c * CAR_LEN - b - a);
AXLES.sort((a, b) => a - b);
let atsWasBraking = false;
let lastT = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running || !renderer) { if (renderer && scene) renderer.render(scene, camera); return; }
  if (window.__noRender) return;
  pollGamepad();
  if (paused) { draw(); return; }
  simStep(dt);
  updateView(dt);
  draw();
  if (game.finished && !resultShown) showResult();
}

/** one logic step: physics, game flow, sounds */
function simStep(dt) {
  const prevS = physics.s;
  const n = Math.ceil(dt / (1 / 120));
  const target = game.target;
  const stopLimit = game.terminal && target ? target.station.s + 60 : null;
  if (physics.updateATS(route, stopLimit)) {
    hud.message('ATS-P ブレーキ動作 <small>-10</small>', 'bad', 3);
    game.addScore(-10);
  }
  if (physics.ats.braking !== atsWasBraking) { sound.atsBell(physics.ats.braking); atsWasBraking = physics.ats.braking; }
  physics.grade = route.grade(physics.s - physics.len / 2);
  for (let i = 0; i < n; i++) physics.step(dt / n);
  game.update(dt);

  // rail joint sounds (every 25 m, plus turnouts at station throats)
  if (physics.s - prevS > 0) {
    for (let i = 0; i < AXLES.length; i++) {
      const off = AXLES[i];
      const a = prevS - off, b = physics.s - off;
      if (Math.floor(a / 25) !== Math.floor(b / 25) || turnoutBetween(a, b)) {
        const dist = camMode === 'cab' ? Math.abs(off - 1.2) : 8;
        sound.joint(1 / (1 + dist / 7), physics.kmh);
        if (camMode === 'cab' && i < 2) bob.v -= 0.02 * Math.min(1, physics.kmh / 80);
      }
    }
  }
  sound.update({ v: physics.kmh, torque: physics.torque, brake: physics.brake, curvature: route.curvature(physics.s) });
  announcer.update();
  melody.update();
  traffic.update(dt, physics.s);
}

/** scene, camera and HUD for the current state */
function updateView(dt) {
  player.place(route, physics.s, () => 0, 0.0025 * Math.min(1, physics.kmh / 80));
  world.update(physics.s, 1);
  if (mascon) mascon.rotation.z = physics.handle * 0.11;
  player.setSideLamps(!!physics.doorsOpen);
  updateCamera(dt);
  const cp = new THREE.Vector3();
  camera.getWorldPosition(cp);
  world.updateFixed(cp, physics.s);
  const trains = [{ front: physics.s, len: physics.len, dir: 1 }];
  for (const t of traffic.list) trains.push({ front: t.s, len: t.set.length, dir: -1 });
  world.animate(dt, trains, cp);
  sound.crossing(world.nearestActiveCrossing);
  const fp = route.pose(physics.s - 20, 0, {});
  const sd = world.env.sunDir;
  sun.position.set(fp.x + sd.x * 300, fp.y + sd.y * 300, fp.z + sd.z * 300);
  sun.target.position.set(fp.x, fp.y, fp.z);
  const limit = route.limitOverTrain(physics.s, physics.len);
  const ups = route.upcomingLimits(physics.s, 1500).find((l) => l.v < limit) || null;
  hud.update(dt, {
    kmh: physics.kmh, limit: Math.min(limit, physics.veh.maxSpeed), pattern: physics.ats.pattern,
    atsNear: physics.ats.near, atsBrake: physics.ats.braking, handle: physics.handle, notchLabel: physics.notchLabel(),
    clock: game.clock, score: game.score, doorsOpen: !!physics.doorsOpen,
    nextLimit: ups ? { v: ups.v, d: ups.s - physics.s } : null,
    ...game.hudData(),
  });
}

function turnoutBetween(a, b) {
  for (const st of route.stations) {
    for (const t of [st.s - 345, st.s - 338, st.s - 331, st.s + 42, st.s + 49, st.s + 56]) if (a < t && b >= t) return true;
  }
  return false;
}

let resultShown = false;
function showResult() {
  resultShown = true;
  setTimeout(() => {
    const rs = game.results;
    const stops = Math.max(1, rs.length);
    const avg = game.score / stops;
    const grade = avg >= 40 ? 'S' : avg >= 28 ? 'A' : avg >= 16 ? 'B' : avg >= 5 ? 'C' : 'D';
    $('resGrade').textContent = grade;
    $('resScore').textContent = game.score;
    $('resRows').innerHTML = rs.map((r) => `<tr><td>${r.name}</td><td>${r.pass ? '通過' : (r.err >= 0 ? '+' : '−') + Math.abs(r.err).toFixed(2) + ' m'}</td><td>${r.pass ? '' : r.tl}</td><td class="${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts >= 0 ? '+' : ''}${r.pts}</td></tr>`).join('');
    $('result').classList.remove('hidden');
    running = false;
  }, 3500);
}

// ---------------------------------------------------------------------------
async function boot() {
  initRenderer();
  setupInput();
  buildMenu();
  requestAnimationFrame(frame);
  try {
    await loadAssets();
    $('startBtn').disabled = false;
    $('startBtn').textContent = '運転開始';
    // a nice idle backdrop: the selected train at 上野
    $('bootLoad').classList.add('hidden');
  } catch (e) {
    console.error(e);
    $('bootLoad').textContent = 'モデルの読み込みに失敗しました。ローカルサーバー経由で開いてください（README参照）。';
  }
  // auto-detect a locally placed announcement file
  if (!announcer.audio) { await announcer.loadBuiltIn(); updateAnnStatus(); }
  if (!melody.audio && (await melody.tryLocal())) updateMelStatus();
}

boot();

// debugging handle (used by automated tests)
window.__sim = {
  get physics() { return physics; }, get game() { return game; }, get world() { return world; },
  setCamMode, route, sound, announcer, melody, simStep, updateView,
  get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; }, draw,
  /** fast-forward the logic by `sec` seconds in fixed steps (no rendering) */
  advance(sec, dt = 0.05, each) { for (let t = 0; t < sec && !game.finished; t += dt) { if (each) each(); simStep(dt); } updateView(0.016); },
};
