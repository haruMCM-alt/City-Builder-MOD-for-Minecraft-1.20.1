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
// final grade in display space: filmic contrast, saturation, warm highlights / cool shadows,
// a soft vignette and fine film grain (hides banding in the sky gradients)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.14);                                   // saturation
      c = (c - 0.5) * 1.10 + 0.5 + 0.012;                          // contrast around mid grey
      c = clamp(c, 0.0, 1.0);
      // split toning: cool shadows, slightly warm mid-highlights (not the sky: keep saturated blues blue)
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      vec3 warm = mix(vec3(1.025, 1.0, 0.965), vec3(1.0), smoothstep(0.08, 0.25, sat * step(c.r, c.b)));
      c *= mix(vec3(0.975, 0.99, 1.03), warm, smoothstep(0.2, 0.7, l));
      vec2 q = vUv - 0.5;
      c *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(q, q) * 2.2);  // vignette
      c += (h(vUv * 1024.0 + uTime) - 0.5) * 0.012;                // grain / dither
      gl_FragColor = vec4(c, 1.0);
    }`,
};
let gradePass = null;
import { Route } from './route.js';
import { VEHICLES, DEFAULT_VEHICLE, CAR_LEN, BOGIE_C } from './vehicles.js';
import { World } from './world/world.js';
import { TrainSet } from './trainmodel.js';
import { TrainPhysics } from './physics.js';
import { SoundEngine } from './audio/sound.js';
import { Announcer } from './audio/announce.js';
import { MelodyPlayer } from './audio/melody.js';
import { MELODY_CLIPS } from './audio/melody-cues.js';
import { buildTimetable, fmtTime } from './timetable.js';
import { SERVICES, DEFAULT_SERVICE } from './services.js';
import { TrackView } from './trackview.js';
import { HUD } from './hud.js';
import { CabDisplays } from './cabdisplays.js';
import { loadFonts } from './displays.js';
import { VehiclePreview } from './preview.js';
let preview = null;
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
// the line as seen in the running direction (下り or 上り); physics / game positions are in its coordinates
let view = null;
let cab = null, mascon = null, cabLcd = null;
let carIdx = 1, carLights = null;     // passenger view: which car, and its saloon lights
// driver's eye (ref2/cab spec: high cab, eye 2.965 m above rail), car-local three.js coords
const EYE = { x: 8.32, y: 2.965, z: -0.85, pitch: -0.07 };
// standing passenger in the aisle of a motor car (floor 1.17 m above rail + 1.58 m eye), looking forward
const CAR_EYE = { x: -4.6, y: 2.75, z: 0.32, pitch: -0.06 };
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
  vvvf: store.get('vvvf', 'new'),
  service: store.get('service', DEFAULT_SERVICE),
  dir: store.get('dir', 'down'),
};
if (settings.dir !== 'up') settings.dir = 'down';
if (!SERVICES[settings.service]) settings.service = DEFAULT_SERVICE;
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
  hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b6250, 0.22);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff0d8, 3.5);
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
  if (composer) { composer.dispose(); composer = null; aoPass = null; gradePass = null; }
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
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.5, 0.92));
  composer.addPass(new OutputPass());
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
}

function draw() {
  if (gradePass) gradePass.uniforms.uTime.value = (performance.now() % 10000) / 10;
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
    showPreview();
    updateFormationNote();
  }));
  const carsSel = $('carsSel');
  carsSel.value = String(settings.cars);
  carsSel.addEventListener('change', () => { settings.cars = Number(carsSel.value); store.set('cars', settings.cars); updateFormationNote(); });
  const fromSel = $('fromSel'), toSel = $('toSel');
  const fillStations = () => {
    const list = menuView().stations;
    const opts = list.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    fromSel.innerHTML = opts; toSel.innerHTML = opts;
    settings.from = Math.min(settings.from, list.length - 2);
    settings.to = Math.min(Math.max(settings.to, settings.from + 1), list.length - 1);
    fromSel.value = String(settings.from); toSel.value = String(settings.to);
  };
  fillStations();
  melody.setDirection(settings.dir);
  const dirSel = $('dirSel');
  dirSel.value = settings.dir;
  dirSel.addEventListener('change', () => {
    settings.dir = dirSel.value; store.set('dir', settings.dir);
    melody.setDirection(settings.dir);
    // a new direction starts from its first station
    settings.from = 0; settings.to = route.stations.length - 1;
    store.set('from', settings.from); store.set('to', settings.to);
    fillStations();
    updateFormationNote();
  });
  const fix = () => {
    let f = Number(fromSel.value), t = Number(toSel.value);
    if (t <= f) { t = Math.min(route.stations.length - 1, f + 1); toSel.value = String(t); }
    if (f >= route.stations.length - 1) { f = route.stations.length - 2; fromSel.value = String(f); }
    settings.from = f; settings.to = t; store.set('from', f); store.set('to', t);
    updateFormationNote();
  };
  fromSel.addEventListener('change', fix); toSel.addEventListener('change', fix);
  const svcSel = $('svcSel');
  svcSel.innerHTML = Object.values(SERVICES).map((x) => `<option value="${x.id}">${x.name}${x.original ? '（ゲームオリジナル）' : ''}</option>`).join('');
  svcSel.value = settings.service;
  svcSel.addEventListener('change', () => { settings.service = svcSel.value; store.set('service', settings.service); updateFormationNote(); });
  const vvvfSel = $('vvvfSel');
  vvvfSel.value = settings.vvvf;
  vvvfSel.addEventListener('change', () => { settings.vvvf = vvvfSel.value; store.set('vvvf', settings.vvvf); });
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

/** a TrackView for the menu's direction (cached) */
let _menuView = null;
function menuView() {
  if (!_menuView || _menuView.dir !== settings.dir) _menuView = new TrackView(route, settings.dir);
  return _menuView;
}

function updateFormationNote() {
  const v = VEHICLES[settings.vehicle];
  const f = v.formations[settings.cars] || v.formations[15];
  const g = (f.match(/G/g) || []).length;
  const st = menuView().stations;
  const svc = SERVICES[settings.service];
  const nStops = st.filter((x, i) => i >= settings.from && i <= settings.to && (i === settings.from || i === settings.to || !svc.stops || svc.stops.includes(x.name))).length;
  if ($('svcNote')) $('svcNote').textContent = `${svc.desc}（この区間の停車駅 ${nStops} 駅）`;
  $('formNote').textContent = `${f.length}両編成${g ? `（グリーン車 ${g}両）` : ''} ・ ${st[settings.from].name} → ${st[settings.to].name}  ${(Math.abs(st[settings.to].realS - st[settings.from].realS) / 1000).toFixed(1)} km`;
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
  const opts = MELODY_CLIPS.map((c) => `<option value="${c.no}" title="${c.where}">${c.name}${c.retired ? '（使用終了）' : ''} ・ ${c.where}</option>`).join('');
  const dirName = settings.dir === 'up' ? '上野方面（上り）' : '宇都宮方面（下り）';
  document.querySelector('#melAssign h2').textContent = `発車メロディの割り当て ・ ${dirName}`;
  document.querySelector('#melAssign .note').textContent = `初期値は、動画に表示される曲名・使用駅と各駅ののりば（方向）から割り当てています。▶で試聴して、${dirName}へ発車するときの曲を変えることもできます（方向ごとにこのブラウザに保存されます）。`;
  list.innerHTML = menuView().stations.slice(0, -1).map((st) => `
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
/** 3D studio preview of the selected vehicle in the menu */
function showPreview() {
  const veh = VEHICLES[settings.vehicle];
  if (!gltfs[veh.id]) return;
  try {
    if (!preview) preview = new VehiclePreview($('vehPreview'));
    preview.setVehicle(gltfs[veh.id].scene, veh, modelKey(veh));
    preview.start();
  } catch (e) { console.warn('preview unavailable', e); }
}

async function startGame() {
  if (preview) preview.stop();
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
  sound.altSound = settings.vvvf === 'old';
  sound.setVehicle(veh);
  setupComposer(settings.quality);
  renderer.shadowMap.enabled = settings.shadows;
  sun.castShadow = settings.shadows;

  if (world) { teardown(); }
  view = new TrackView(route, settings.dir);
  world = new World(renderer, scene, route, gltfs.env, settings.quality);
  world.dir = view.sign;
  const service = SERVICES[settings.service];
  const tt = buildTimetable(view, veh, formation.length, settings.from, settings.to, service);
  announcer.destName = tt[tt.length - 1].station.name;
  announcer.serviceName = service.short === '快速' ? '快速ラビット' : service.name;
  physics = new TrainPhysics(veh, formation.length);
  player = new TrainSet(gltfs[veh.id].scene, veh, formation, { key: modelKey(veh), dest: `${service.short} ${tt[tt.length - 1].station.name}`, destType: veh.id === 's115' || veh.id === 's211' ? 'roll' : 'led', info: true, service, forward: !view.up });
  scene.add(player.group);
  // the passenger view rides in the first motor car
  carIdx = Math.max(1, formation.indexOf('P'));
  if (carLights) carLights.removeFromParent();
  carLights = new THREE.Group();
  for (const x of [-6.5, -2.2, 2.2, 6.5]) {
    const l = new THREE.PointLight(0xfff6ea, 1.5, 7.5, 1.6);
    l.position.set(x, 3.25, 0);
    carLights.add(l);
  }
  carLights.visible = false;
  player.cars[carIdx].userData.inner.add(carLights);
  sound.setTrain(formation, veh);
  AXLES = axleOffsets(formation.length);
  // cab interior on the leading car
  cab = gltfs.cab.scene.clone(true);
  // the cab has its own roof: let it cast/receive sun shadows (sun patches through the windscreen)
  cab.traverse((o) => { if (o.isMesh) { o.castShadow = !(o.material && o.material.name && o.material.name.startsWith('LCD_')); o.receiveShadow = true; } });
  // soft fill under the ceiling (the cab otherwise only gets sky light through the glass)
  const cabFill = new THREE.PointLight(0xf4f1ea, 0.9, 4.5, 1.5);
  cabFill.position.set(8.6, 3.25, 0);
  cab.add(cabFill);
  mascon = cab.getObjectByName('mascon_handle');
  if (cabLcd) cabLcd.dispose();
  cabLcd = new CabDisplays(cab);
  player.cars[0].userData.inner.add(cab);
  hud.setup(veh, tt);
  game = new Game({ route: view, physics, timetable: tt, sound, announcer, melody, hud, fromIdx: settings.from, service, up: view.up });
  traffic = new Traffic();
  world.preload(view.toRoute(physics.s));
  setCamMode('cab');
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('ttPanel').innerHTML = tt.map((r) => `<tr><td>${r.station.name}</td><td>${r.arr ? fmtTime(r.arr, true) : ''}</td><td>${r.dep ? fmtTime(r.dep, true) : ''}</td></tr>`).join('');
  hud.message(`${service.name} ${veh.name} ${formation.length}両<br><small>${tt[0].station.name} ${fmtTime(tt[0].dep)} 発 → ${tt[tt.length - 1].station.name} ${fmtTime(tt[tt.length - 1].arr)} 着</small>`, 'info', 5);
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
  if (preview) preview.start();
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
  clear() { for (const t of this.list) { t.set.dispose(); if (t.voice) t.voice.dispose(); } this.list = []; }
  /** s = spawn position in view coordinates (ahead of us); trains run toward us on the other track */
  spawn(kind, sView) {
    const s = view.toRoute(sView);
    const dirReal = -view.sign;              // they run the opposite way to us
    const pick = kind === 'keihin' ? 'e233' : ['e231', 'e233', 'e231', 's211'][Math.floor(Math.random() * 4)];
    const veh = VEHICLES[pick];
    let formation, opts;
    if (kind === 'keihin') {
      formation = 'CPMMPMMPMR';
      opts = { key: 'e233', dest: view.up ? '各駅停車 大宮' : '各駅停車 大船', forward: dirReal > 0, recolor: true };
    } else {
      formation = Math.random() < 0.6 ? veh.formations[15] : veh.formations[10];
      opts = view.up
        ? { key: modelKey(veh), dest: Math.random() < 0.5 ? '普通 宇都宮' : '快速 小金井', forward: true }
        : { key: modelKey(veh), dest: Math.random() < 0.5 ? '普通 上野' : '快速 小田原', forward: false };
    }
    const set = new TrainSet(gltfs[pick].scene, veh, formation, opts);
    if (opts.recolor) recolorKeihin(set);
    scene.add(set.group);
    // (the 京浜東北線 runs both ways on its own pair of tracks; main-line traffic uses the track we are not on)
    const track = kind === 'keihin' ? (x) => route.extraTracks(x)[1] ?? route.upOffset(x) - 8.8 : view.up ? () => 0 : (x) => route.upOffset(x);
    const voice = sound.addTrain(kind === 'keihin' ? VEHICLES.e233 : veh, formation.length);
    this.list.push({ set, s, dirReal, v: (kind === 'keihin' ? 75 : 95 + Math.random() * 15) / 3.6, track, passed: false, kind, voice, axles: axleOffsets(formation.length), torque: Math.random() < 0.5 ? 0.3 : 0 });
  }
  update(dt, sp) {
    this.timer.up -= dt;
    if (this.timer.up <= 0) {
      this.timer.up = 150 + Math.random() * 200;
      const s = sp + 2600;
      if (s < view.sMax - 200) this.spawn('main', s);
    }
    if (view.toRoute(sp) < 29000) {
      this.timer.ex -= dt;
      if (this.timer.ex <= 0) {
        this.timer.ex = 120 + Math.random() * 150;
        this.spawn('keihin', sp + 2400);
      }
    }
    const lp = view.toRoute(listenerS());
    for (const t of this.list) {
      const prev = t.s;
      t.s += t.dirReal * t.v * dt;
      t.set.place(route, t.s, t.track, 0.004);
      // rail joints under every axle (its cars trail behind the front, against its direction)
      if (Math.abs(t.s - lp) < 700) {
        for (const off of t.axles) {
          const a = prev - t.dirReal * off, b = t.s - t.dirReal * off;
          if (Math.floor(a / 25) !== Math.floor(b / 25)) {
            const sj = Math.floor(a / 25) * 25;
            const p = route.pose(sj, t.track(sj), this.pose);
            sound.jointAt({ x: p.x, y: p.y + 0.3, z: p.z }, t.v * 3.6, false);
          }
        }
      }
      if (t.voice) {
        const pos = [0.12, 0.5, 0.88].map((f) => {
          const sv = t.s - t.dirReal * t.set.length * f;
          const p = route.pose(sv, t.track(sv), {});
          return { x: p.x, y: p.y + 0.8, z: p.z };
        });
        t.voice.update(pos, t.v * 3.6, t.torque, { curvature: route.curvature(t.s), brake: 0 });
      }
    }
    this.list = this.list.filter((t) => {
      const tv = view.fromRoute(t.s);     // its front in our coordinates (it comes toward us)
      const keep = tv + t.set.length > sp - 900 && t.s > route.sMin + 100 && t.s < route.sMax - 100;
      if (!keep) { t.set.dispose(); if (t.voice) t.voice.dispose(); }
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
const CAMS = ['cab', 'car', 'front', 'side', 'chase', 'trackside'];
const CAM_LABEL = { cab: '運転台', car: '車内', front: '正面', side: '側面', chase: '後方上空', trackside: '沿線' };
function setCamMode(m) {
  camMode = m;
  $('camLabel').textContent = CAM_LABEL[m];
  const inCab = m === 'cab';
  sound.cut();
  sound.setListenerMode(m === 'cab' ? 'cab' : m === 'car' ? 'car' : 'outside');
  if (player) player.setVisible(0, !inCab);
  if (cab) cab.visible = inCab;
  if (carLights) carLights.visible = m === 'car';
  if (camera.parent) camera.parent.remove(camera);
  if (inCab) {
    player.cars[0].userData.inner.add(camera);
    camera.position.set(EYE.x, EYE.y, EYE.z);
    camera.fov = 60;
    look.yaw = 0; look.pitch = EYE.pitch;
  } else if (m === 'car') {
    player.cars[carIdx].userData.inner.add(camera);
    camera.position.set(CAR_EYE.x, CAR_EYE.y, CAR_EYE.z);
    camera.fov = 68;
    look.yaw = 0; look.pitch = CAR_EYE.pitch;
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
  if (camMode === 'cab' || camMode === 'car') {
    // head bob + joint jolts
    const E = camMode === 'cab' ? EYE : CAR_EYE;
    bob.v += (-bob.y * 120 - bob.v * 9) * dt;
    bob.y += bob.v * dt;
    const t = performance.now() / 1000;
    const vib = Math.min(1, physics.kmh / 100) * (camMode === 'car' ? 0.009 : 0.006);
    camera.position.y = E.y + bob.y + Math.sin(t * 13.1) * vib * 0.4;
    camera.position.z = E.z + Math.sin(t * 2.3) * vib;
    camera.rotation.set(look.pitch, -Math.PI / 2 + look.yaw, 0);
  } else if (camMode === 'side') {
    view.pose(physics.s - 12, 16, p);
    camera.position.set(p.x, p.y + 3.2, p.z);
    view.pose(physics.s - 22, 0, q);
    camera.lookAt(q.x, q.y + 2.0, q.z);
  } else if (camMode === 'front') {
    // ahead of the train, like a platform-end photo of the cab
    view.pose(physics.s + 11, 2.7, p);
    camera.position.set(p.x, p.y + 1.7, p.z);
    view.pose(physics.s - 8, 0.0, q);
    camera.lookAt(q.x, q.y + 1.9, q.z);
  } else if (camMode === 'chase') {
    view.pose(physics.s - 70, 0, p);
    camera.position.set(p.x, p.y + 22, p.z);
    view.pose(physics.s + 40, 0, q);
    camera.lookAt(q.x, q.y, q.z);
  } else if (camMode === 'trackside') {
    if (!tracksideCam || physics.s > tracksideCam.s + physics.len + 40) {
      const s = physics.s + 260 + Math.random() * 120;
      const st = view.structureAt(s).type;
      // on viaducts / bridges stand at ground level and look up; else beside the line
      const lat = st === 'ground' ? 6.2 + Math.random() * 1.2 : 18 + Math.random() * 10;
      view.pose(s, lat, p);
      const gy = st === 'ground' || st === 'embankment' ? p.y : 0;
      tracksideCam = { s, x: p.x, z: p.z, y: gy + 1.6 + Math.random() * 2 };
      sound.cut();
    }
    camera.position.set(tracksideCam.x, tracksideCam.y, tracksideCam.z);
    view.pose(physics.s - 15, 0, q);
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
    if (!look.drag || (camMode !== 'cab' && camMode !== 'car')) return;
    const lim = camMode === 'car' ? Math.PI : 1.4;
    look.yaw = Math.max(-lim, Math.min(lim, look.yaw - (e.clientX - look.lx) * 0.004));
    look.pitch = Math.max(-0.6, Math.min(0.5, look.pitch - (e.clientY - look.ly) * 0.004));
    look.lx = e.clientX; look.ly = e.clientY;
  });
  v.addEventListener('dblclick', () => { look.yaw = 0; look.pitch = camMode === 'car' ? CAR_EYE.pitch : EYE.pitch; });
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
/** axle positions measured back from the leading coupler, for an n-car train */
function axleOffsets(n) {
  const out = [];
  for (let c = 0; c < n; c++) for (const b of [-BOGIE_C, BOGIE_C]) for (const a of [-1.05, 1.05]) out.push(CAR_LEN / 2 + c * CAR_LEN - b - a);
  return out.sort((a, b) => a - b);
}
let AXLES = axleOffsets(4);
const _jp = {};
/** where along the line the listener is (for culling far-away joint clicks) */
function listenerS() {
  if (camMode === 'trackside' && tracksideCam) return tracksideCam.s;
  return physics ? physics.s - (camMode === 'car' ? (carIdx + 0.5) * CAR_LEN : 0) : 0;
}
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
  if (physics.updateATS(view, stopLimit)) {
    hud.message('ATS-P ブレーキ動作 <small>-10</small>', 'bad', 3);
    game.addScore(-10);
  }
  if (physics.ats.braking !== atsWasBraking) { sound.atsBell(physics.ats.braking); atsWasBraking = physics.ats.braking; }
  physics.grade = view.grade(physics.s - physics.len / 2);
  for (let i = 0; i < n; i++) physics.step(dt / n);
  game.update(dt);

  // rail joint sounds under every axle (every 25 m, plus turnouts at station throats),
  // emitted where the joint is so they are delayed / panned / attenuated for the listener
  if (physics.s - prevS > 0) {
    const ls = listenerS();
    const bobLo = camMode === 'car' ? carIdx * CAR_LEN : 0, bobHi = bobLo + CAR_LEN;
    for (let i = 0; i < AXLES.length; i++) {
      const off = AXLES[i];
      const a = prevS - off, b = physics.s - off;
      const joint = Math.floor(a / 25) !== Math.floor(b / 25);
      if (joint || turnoutBetween(a, b)) {
        if (Math.abs(b - ls) < 600) {
          const sj = joint ? Math.floor(b / 25) * 25 : b;
          const p = view.pose(sj, 0, _jp);
          sound.jointAt({ x: p.x, y: p.y + 0.3, z: p.z }, physics.kmh, true);
        }
        if ((camMode === 'cab' || camMode === 'car') && off > bobLo && off < bobHi) bob.v -= 0.012 * Math.min(1, physics.kmh / 80);
      }
    }
  }
  announcer.update();
  melody.update();
  traffic.update(dt, physics.s);
}

/** listener at the camera, own train positions, crossing bells */
const _lv = { p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3() };
function updateSound() {
  if (!sound.ready || !player) return;
  camera.updateMatrixWorld();
  camera.getWorldPosition(_lv.p);
  camera.getWorldDirection(_lv.f);
  _lv.r.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  sound.setListener(_lv.p, _lv.f, _lv.r);
  const cars = [], bridge = [];
  for (let i = 0; i < player.cars.length; i++) {
    cars.push(player.cars[i].position);
    const st = view.structureAt(physics.s - (i + 0.5) * CAR_LEN);
    bridge.push(st.type === 'bridge' ? (st.river.truss ? 1 : 0.55) : st.type === 'viaduct' ? 0.12 : 0);
  }
  const fp = view.pose(physics.s - 0.5, 0, {});
  sound.update({
    v: physics.kmh, torque: physics.torque, brake: physics.brake, curvature: view.curvature(physics.s),
    doorsOpen: physics.doorsOpen === true, cars, front: fp, bridge,
  });
  const bells = [];
  if (world) {
    for (const c of world.crossings) {
      if (!c.active) continue;
      const p = route.pose(c.s, -6.5, {});
      bells.push({ id: c.s, x: p.x, y: p.y + 2.6, z: p.z });
    }
  }
  sound.crossing(bells);
  // ambience: platform murmur near stations, birds in the countryside
  const lsS = view.toRoute(listenerS());
  const st = route.stationNear(lsS, 260);
  const near = st ? Math.max(0, 1 - Math.abs(st.s - 140 - lsS) / 260) : 0;
  const busy = st ? (st.area === 'city' ? 1 : st.area === 'suburb' ? 0.65 : 0.4) : 0;
  let area = 'city', bestD = Infinity;
  for (const x of route.stations) { const d = Math.abs(x.s - lsS); if (d < bestD) { bestD = d; area = x.area; } }
  sound.ambience({ station: near * busy * (physics.kmh < 30 ? 1 : 0.4), rural: area === 'rural' ? 1 : area === 'suburb' ? 0.4 : 0.12 });
}

/** scene, camera and HUD for the current state */
function updateView(dt) {
  player.place(route, view.toRoute(physics.s), (x) => view.trackOffset(x), 0.0025 * Math.min(1, physics.kmh / 80));
  world.update(view.toRoute(physics.s), 1);
  if (mascon) {
    // one-handle T grip: pull toward the driver for power (up to +45°), push forward to brake / EB (−50°)
    const h = physics.handle, v = physics.veh;
    mascon.rotation.z = h >= 0 ? (h / v.powerNotches) * 0.785 : (h / (v.brakeNotches + 1)) * 0.873;
  }
  if (cabLcd && camMode === 'cab') cabLcd.update(dt, { physics, game, route: view });
  player.setSideLamps(!!physics.doorsOpen);
  player.setDoors(game.doorSide, physics.doorsOpen === true);
  const tgt = game.target;
  player.animate(dt, {
    next: tgt ? tgt.station : null,
    arriving: game.state === 'arrived' || (game.state === 'running' && tgt && tgt.station.s - physics.s < 700),
    carNo: player.cars.length - carIdx,          // 1号車 is the Ueno end
    kind: game.service ? game.service.short : '普通',
    dest: game.tt[game.tt.length - 1].station.name,
    clock: fmtTime(game.clock, false),
  });
  updateCamera(dt);
  updateSound();
  const cp = new THREE.Vector3();
  camera.getWorldPosition(cp);
  world.updateFixed(cp, view.toRoute(physics.s));
  const trains = [{ front: view.toRoute(physics.s), len: physics.len, dir: view.sign }];
  for (const t of traffic.list) trains.push({ front: t.s, len: t.set.length, dir: t.dirReal });
  world.animate(dt, trains, cp);
  const fp = view.pose(physics.s - 20, 0, {});
  const sd = world.env.sunDir;
  sun.position.set(fp.x + sd.x * 300, fp.y + sd.y * 300, fp.z + sd.z * 300);
  sun.target.position.set(fp.x, fp.y, fp.z);
  const limit = view.limitOverTrain(physics.s, physics.len);
  const ups = view.upcomingLimits(physics.s, 1500).find((l) => l.v < limit) || null;
  hud.update(dt, {
    kmh: physics.kmh, limit: Math.min(limit, physics.veh.maxSpeed), pattern: physics.ats.pattern,
    atsNear: physics.ats.near, atsBrake: physics.ats.braking, handle: physics.handle, notchLabel: physics.notchLabel(),
    clock: game.clock, score: game.score, doorsOpen: !!physics.doorsOpen,
    nextLimit: ups ? { v: ups.v, d: ups.s - physics.s } : null,
    ...game.hudData(),
  });
}

/** a turnout at a station throat between view positions a..b (both directions use the same points) */
function turnoutBetween(a, b) {
  let lo = view.toRoute(a), hi = view.toRoute(b);
  if (lo > hi) [lo, hi] = [hi, lo];
  for (const st of route.stations) {
    for (const t of [st.s - 345, st.s - 338, st.s - 331, st.s + 42, st.s + 49, st.s + 56]) if (lo < t && hi >= t) return true;
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
    await Promise.all([loadAssets(), loadFonts()]);
    $('startBtn').disabled = false;
    $('startBtn').textContent = '運転開始';
    showPreview();
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
  get physics() { return physics; }, get game() { return game; }, get world() { return world; }, get view() { return view; },
  setCamMode, route, sound, announcer, melody, simStep, updateView,
  get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; }, draw,
  /** fast-forward the logic by `sec` seconds in fixed steps (no rendering) */
  advance(sec, dt = 0.05, each) { for (let t = 0; t < sec && !game.finished; t += dt) { if (each) each(); simStep(dt); } updateView(0.016); },
};
