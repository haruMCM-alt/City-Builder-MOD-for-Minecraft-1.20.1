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
let gradePass = null, bloomPass = null;
import { Route, PLATFORM_LEN } from './route.js';
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
import { atmosphere, TIME_SHIFT } from './world/atmosphere.js';
import { Rain, Windscreen } from './world/rain.js';
import { ShinkansenTraffic } from './shinkansen.js';
let shinkansen = null;
// time of day / weather: the preset in use, rain streaks, windscreen drops, our headlight, platform lamps
let atmo = null, rain = null, screen = null, headLight = null, cabFill = null, pfLamps = null, slipShown = 0;
import { SignalSystem, LeadTrain, ASPECT_SPEED } from './signals.js';
// block signals and the train running a few minutes ahead of us
let signals = null, lead = null, leadSet = null, leadVoice = null, nextSig = null;
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
let cab = null, mascon = null, cabLcd = null, cabParts = null;
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
  tod: store.get('tod', 'day'),
  weather: store.get('weather', 'clear'),
};
if (!['day', 'evening', 'night'].includes(settings.tod)) settings.tod = 'day';
if (!['clear', 'rain'].includes(settings.weather)) settings.weather = 'clear';
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
  if (composer) { composer.dispose(); composer = null; aoPass = null; gradePass = null; bloomPass = null; }
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
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), atmo ? atmo.bloom : 0.22, 0.5, 0.92);
  composer.addPass(bloomPass);
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
  const todSel = $('todSel'), wxSel = $('wxSel');
  todSel.value = settings.tod; wxSel.value = settings.weather;
  todSel.addEventListener('change', () => { settings.tod = todSel.value; store.set('tod', settings.tod); });
  wxSel.addEventListener('change', () => { settings.weather = wxSel.value; store.set('weather', settings.weather); });
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
  atmo = atmosphere(settings.tod, settings.weather);
  world = new World(renderer, scene, route, gltfs.env, settings.quality, atmo);
  applyLights(atmo);
  world.dir = view.sign;
  const service = SERVICES[settings.service];
  const tt = buildTimetable(view, veh, formation.length, settings.from, settings.to, service);
  // evening / night runs leave later in the day (same running times)
  const shift = TIME_SHIFT[settings.tod] || 0;
  for (const r of tt) { if (r.arr != null) r.arr += shift; if (r.dep != null) r.dep += shift; }
  announcer.destName = tt[tt.length - 1].station.name;
  announcer.serviceName = service.short === '快速' ? '快速ラビット' : service.name;
  physics = new TrainPhysics(veh, formation.length);
  physics.adhesion = atmo.rain ? 0.58 : 1;
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
  // per-series cab: cab_<key> roots in cab_interior.glb (E231 / E233 one-handle LCD desks, 211 / 115 two-handle)
  const cabKey = { e231: 'e231', e233: 'e233', s211: '211', s115: '115' }[veh.id] || 'e231';
  cab = (gltfs.cab.scene.getObjectByName('cab_' + cabKey) || gltfs.cab.scene).clone(true);
  cab.position.set(0, 0, 0);
  // the cab has its own roof: let it cast/receive sun shadows (sun patches through the windscreen)
  cab.traverse((o) => { if (o.isMesh) { o.castShadow = !(o.material && o.material.name && o.material.name.startsWith('LCD_')); o.receiveShadow = true; } });
  // soft fill under the ceiling (the cab otherwise only gets sky light through the glass)
  cabFill = new THREE.PointLight(0xf4f1ea, 0.9, 4.5, 1.5);
  cabFill.position.set(8.6, 3.25, 0);
  cab.add(cabFill);
  cabParts = findCabParts(cab);
  mascon = cabParts.mascon;
  if (cabParts.eye) Object.assign(EYE, cabParts.eye);
  if (cabLcd) cabLcd.dispose();
  cabLcd = new CabDisplays(cab);
  player.cars[0].userData.inner.add(cab);
  cabFill.intensity = 0.9 * atmo.cabFill;
  setupWeatherObjects();
  hud.setup(veh, tt);
  game = new Game({ route: view, physics, timetable: tt, sound, announcer, melody, hud, fromIdx: settings.from, service, up: view.up });
  traffic = new Traffic();
  if (shinkansen) shinkansen.clear();
  shinkansen = new ShinkansenTraffic(scene, route, sound);
  // the train ahead: same service a few minutes earlier, simulated up to now
  signals = new SignalSystem(view, scene);
  lead = new LeadTrain(view, tt, physics.len, 210 + Math.random() * 150);
  for (let t = tt[0].dep - lead.headwayStart; t < game.clock; t += 0.5) lead.update(0.5, t);
  leadSet = new TrainSet(gltfs[veh.id].scene, veh, formation, { key: modelKey(veh), dest: `${service.short} ${tt[tt.length - 1].station.name}`, destType: veh.id === 's115' || veh.id === 's211' ? 'roll' : 'led', forward: !view.up });
  scene.add(leadSet.group);
  trainNight(leadSet);
  leadVoice = sound.addTrain(veh, formation.length);
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

// ---------------------------------------------------------------------------
// time of day / weather
// ---------------------------------------------------------------------------
function applyLights(A) {
  sun.color.set(A.sun.color);
  sun.intensity = A.sun.intensity;
  sun.castShadow = settings.shadows && A.sun.shadows;
  hemi.color.set(A.hemi.sky); hemi.groundColor.set(A.hemi.ground); hemi.intensity = A.hemi.intensity;
  renderer.toneMappingExposure = A.exposure;
  if (bloomPass) bloomPass.strength = A.bloom;
}

/** saloon lights after dark: the interior surfaces glow as if lit (cheap stand-in for dozens of lamps) */
const INTERIOR_MAT = /^(int_wall|int_ceiling|int_floor|seat_|strap|headrest|seat_partition|roller_blind)/;
function trainNight(set) {
  const k = atmo ? atmo.night : 0;
  set.group.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.name || !INTERIOR_MAT.test(m.name) || !m.emissive) continue;
      // materials are shared between trains (and games): remember the daylight state once
      if (!m.userData.dayEmissive) m.userData.dayEmissive = { c: m.emissive.clone(), map: m.emissiveMap, i: m.emissiveIntensity };
      const d = m.userData.dayEmissive;
      if (k > 0) {
        if (m.emissiveMap !== (m.map || null)) { m.emissiveMap = m.map || null; m.needsUpdate = true; }
        m.emissive.copy(m.color); m.emissiveIntensity = 0.8 * k;
      } else {
        if (m.emissiveMap !== d.map) { m.emissiveMap = d.map; m.needsUpdate = true; }
        m.emissive.copy(d.c); m.emissiveIntensity = d.i;
      }
    }
  });
}

function setupWeatherObjects() {
  disposeWeatherObjects();
  const inner = player.cars[0].userData.inner;
  if (atmo.headlight > 0) {
    // our own headlights: they light the track ahead after dark
    headLight = new THREE.SpotLight(0xf2f5ff, 2600 * atmo.headlight, 450, 0.17, 0.6, 1.4);
    headLight.position.set(9.95, 1.35, 0);
    headLight.target.position.set(90, -0.6, 0);
    inner.add(headLight, headLight.target);
  }
  if (atmo.night > 0.3) {
    pfLamps = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xfff0d8, 0, 36, 1.3); scene.add(l); return l; });
  }
  if (atmo.rain) {
    rain = new Rain(scene, { count: settings.quality === 'low' ? 5000 : 9000, night: atmo.night });
    screen = new Windscreen(inner, windscreenRect(inner));
    screen.onWipe = () => sound.wiper();
  }
  sound.setRain(atmo.rain ? 0.8 : 0);
  trainNight(player);
}

/**
 * where the front windows are in this cab (car-local): the forward-facing glass ahead of the driver.
 * Raindrops and wipers are drawn on a plane just inside it.
 */
function windscreenRect(inner) {
  inner.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(inner.matrixWorld).invert();
  const M = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const box = new THREE.Box3();
  inner.traverse((o) => {
    if (!o.isMesh || !o.material || !/glass/i.test(o.material.name || '')) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    M.multiplyMatrices(inv, o.matrixWorld);
    const nt = idx ? idx.count / 3 : pos.count / 3;
    for (let i = 0; i < nt; i++) {
      const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(M); b.fromBufferAttribute(pos, i1).applyMatrix4(M); c.fromBufferAttribute(pos, i2).applyMatrix4(M);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      // forward-facing panes ahead of the driver, at eye height
      if (Math.abs(n.x) < 0.55 || Math.min(a.x, b.x, c.x) < EYE.x + 0.3 || Math.max(a.y, b.y, c.y) < EYE.y - 0.7) continue;
      box.expandByPoint(a); box.expandByPoint(b); box.expandByPoint(c);
    }
  });
  if (box.isEmpty() || box.max.z - box.min.z < 0.8) return {};
  return { x: box.min.x - 0.03, y0: Math.max(box.min.y, EYE.y - 0.75), y1: box.max.y, z0: box.min.z, z1: box.max.z };
}

function disposeWeatherObjects() {
  if (headLight) { headLight.target.removeFromParent(); headLight.removeFromParent(); headLight.dispose(); headLight = null; }
  if (pfLamps) { for (const l of pfLamps) { l.removeFromParent(); l.dispose(); } pfLamps = null; }
  if (rain) { rain.dispose(); rain = null; }
  if (screen) { screen.dispose(); screen = null; }
  sound.setRain(0);
}

const _lastCam = new THREE.Vector3(), _camVel = new THREE.Vector3(), _axis = new THREE.Vector2();
let _lastCamOk = false;
function updateWeather(dt, cp) {
  if (_lastCamOk && dt > 0) {
    _camVel.subVectors(cp, _lastCam).divideScalar(dt);
    if (_camVel.length() > 70) _camVel.set(0, 0, 0);     // a camera cut, not motion
  }
  _lastCam.copy(cp); _lastCamOk = true;
  if (rain) {
    let dry = null;
    if (camMode === 'cab' || camMode === 'car') {
      const p = view.pose(physics.s, 0, {});
      _axis.set(p.dx, p.dz).normalize();
      dry = camMode === 'cab' ? { axis: _axis, along: [-25, 1.15], lat: 1.55 } : { axis: _axis, along: [-14, 14], lat: 1.55 };
    }
    rain.update(dt, cp, _camVel, dry);
  }
  if (screen) {
    screen.mesh.visible = camMode === 'cab';
    screen.update(dt, 0.8, physics.kmh, atmo.night);
  }
  if (pfLamps) {
    // fluorescent lamps along the platform the train is at
    const fr = view.toRoute(physics.s);
    const st = route.stations.find((x) => fr > x.s - PLATFORM_LEN - 150 && fr < x.s + 150);
    pfLamps.forEach((l, i) => {
      if (!st) { l.intensity = 0; return; }
      const s = Math.min(st.s, Math.max(st.s - PLATFORM_LEN, fr + (i - 1.5) * 38 - view.sign * 60));
      const p = route.pose(s, 0, {});
      l.position.set(p.x, p.y + 5.6, p.z);
      l.intensity = 90 * atmo.night;
    });
  }
}

function modelKey(veh) { return { e231: 'e231', e233: 'e233', s211: '211', s115: '115' }[veh.id]; }

function teardown() {
  if (player) player.dispose();
  if (traffic) traffic.clear();
  if (shinkansen) { shinkansen.clear(); shinkansen = null; }
  if (signals) { signals.dispose(); signals = null; }
  if (leadSet) { leadSet.dispose(); leadSet = null; }
  if (leadVoice) { leadVoice.dispose(); leadVoice = null; }
  lead = null;
  disposeWeatherObjects();
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
    trainNight(set);
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
            const sj = Math.max(Math.floor(a / 25), Math.floor(b / 25)) * 25;
            const p = route.pose(sj, t.track(sj), this.pose);
            sound.jointAt({ x: p.x, y: p.y + 0.3, z: p.z }, t.v * 3.6, false, Math.abs(b - sj) / Math.max(t.v, 0.5));
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

// 京浜東北線 E233系1000番台: sky-blue (スカイブルー) instead of the 湘南色 bands, on the sides
// and on the painted cab front (the orange / green pixels of its texture are re-coloured)
let keihinMats = null;
function keihinFront(mat) {
  const img = mat.map && mat.map.image;
  if (!img || !img.width) return mat;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx - mn < 60) continue;                                   // greys, black, white, glass
    const orange = r > gg && gg > b && r > 150;
    const green = gg > r + 25 && gg > b + 10;
    if (!orange && !green) continue;
    const l = (mx + mn) / 510;                                    // keep the shading
    px[i] = 24 * (0.6 + l); px[i + 1] = 167 * (0.6 + l); px[i + 2] = 224 * (0.6 + l);
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = mat.map.flipY;
  t.anisotropy = 8;
  const m2 = mat.clone();
  m2.map = t;
  return m2;
}
function recolorKeihin(set) {
  if (!keihinMats) keihinMats = { blue: new THREE.MeshStandardMaterial({ color: 0x18a7e0, roughness: 0.45, name: 'keihin_blue' }), front: new Map() };
  set.group.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name || '';
    if (n === 'shonan_orange' || n === 'shonan_green') o.material = keihinMats.blue;
    else if (n.startsWith('FRONT_')) {
      if (!keihinMats.front.has(o.material)) keihinMats.front.set(o.material, keihinFront(o.material));
      o.material = keihinMats.front.get(o.material);
    }
  });
}

// ---------------------------------------------------------------------------
// cameras
// ---------------------------------------------------------------------------
const CAMS = ['cab', 'car', 'front', 'side', 'chase', 'trackside', 'free'];
const CAM_LABEL = { cab: '運転台', car: '車内', front: '正面', side: '側面', chase: '後方上空', trackside: '沿線', free: 'フリー' };
// free camera: position + look angles in the world; optionally carried along with the train
const free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, follow: true, last: null };
const keysDown = new Set();
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
    // start the free camera where the previous view was looking from
    if (m === 'free') {
      hud.message('フリーカメラ<br><small>ドラッグで向き・I/J/K/L で移動・U/O で上下・Shift で速く・G で列車に追従／固定</small>', 'info', 5);
      camera.updateMatrixWorld();
      camera.getWorldPosition(free.pos);
      const d = new THREE.Vector3(); camera.getWorldDirection(d);
      free.yaw = Math.atan2(-d.x, -d.z); free.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      free.last = null;
    }
    scene.add(camera);
    camera.fov = m === 'free' ? 60 : 50;
    tracksideCam = null;
  }
  camera.updateProjectionMatrix();
}

function updateCamera(dt) {
  if (!player) return;
  if (camMode === 'free') {
    // carried along with the train (G toggles) so it does not get left behind at speed
    const fp = view.pose(physics.s, 0, {});
    if (free.follow && free.last) free.pos.add(new THREE.Vector3(fp.x - free.last.x, fp.y - free.last.y, fp.z - free.last.z));
    free.last = { x: fp.x, y: fp.y, z: fp.z };
    const sp = (keysDown.has('shift') ? 45 : 12) * dt;
    const fwd = new THREE.Vector3(-Math.sin(free.yaw) * Math.cos(free.pitch), Math.sin(free.pitch), -Math.cos(free.yaw) * Math.cos(free.pitch));
    const right = new THREE.Vector3(Math.cos(free.yaw), 0, -Math.sin(free.yaw));
    if (keysDown.has('i')) free.pos.addScaledVector(fwd, sp);
    if (keysDown.has('k')) free.pos.addScaledVector(fwd, -sp);
    if (keysDown.has('l')) free.pos.addScaledVector(right, sp);
    if (keysDown.has('j')) free.pos.addScaledVector(right, -sp);
    if (keysDown.has('o')) free.pos.y += sp;
    if (keysDown.has('u')) free.pos.y -= sp;
    free.pos.y = Math.max(-0.3, free.pos.y);
    camera.position.copy(free.pos);
    camera.rotation.set(free.pitch, free.yaw, 0);
    return;
  }
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
  window.addEventListener('keyup', (e) => { keysDown.delete(e.key.toLowerCase()); if (e.key === 'h' || e.key === 'H') sound.horn(false); });
  window.addEventListener('keydown', (e) => {
    keysDown.add(e.key.toLowerCase());
    if (camMode === 'free' && (e.key === 'g' || e.key === 'G') && !e.repeat) { free.follow = !free.follow; free.last = null; hud.message(free.follow ? 'フリーカメラ：列車に追従' : 'フリーカメラ：その場に固定', 'info', 1.5); }
  });
  window.addEventListener('blur', () => keysDown.clear());
  $('view').addEventListener('wheel', (e) => { if (running) { e.preventDefault(); handleDelta(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
  const v = $('view');
  v.addEventListener('pointerdown', (e) => { look.drag = true; look.lx = e.clientX; look.ly = e.clientY; });
  window.addEventListener('pointerup', () => { look.drag = false; });
  window.addEventListener('pointermove', (e) => {
    if (look.drag && camMode === 'free') {
      free.yaw -= (e.clientX - look.lx) * 0.004;
      free.pitch = Math.max(-1.45, Math.min(1.45, free.pitch - (e.clientY - look.ly) * 0.004));
      look.lx = e.clientX; look.ly = e.clientY;
      return;
    }
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
  // signals: the train ahead occupies its blocks; ATS-P stops us short of a red signal
  if (lead) {
    lead.update(dt, game.clock);
    const ev = signals.update(physics.s, lead.done ? [] : [{ front: lead.x, rear: lead.rear }]);
    if (ev) {
      const lim = ASPECT_SPEED[ev.aspect];
      if (ev.aspect === 'R') { hud.message('赤信号を冒進 <small>-50</small>', 'bad', 3); game.addScore(-50); }
      else if (lim < 999 && physics.kmh > lim + 5) { hud.message(`信号の速度を超過（${ev.aspect} ${lim} km/h） <small>-5</small>`, 'bad', 2.5); game.addScore(-5); }
    }
  }
  nextSig = signals ? signals.next(physics.s) : null;
  const sigStop = nextSig && nextSig.aspect === 'R' ? nextSig.x - 12 : null;
  if (physics.updateATS(view, sigStop != null && (stopLimit == null || sigStop < stopLimit) ? sigStop : stopLimit)) {
    hud.message('ATS-P ブレーキ動作 <small>-10</small>', 'bad', 3);
    game.addScore(-10);
  }
  if (physics.ats.braking !== atsWasBraking) { sound.atsBell(physics.ats.braking); atsWasBraking = physics.ats.braking; }
  physics.grade = view.grade(physics.s - physics.len / 2);
  for (let i = 0; i < n; i++) physics.step(dt / n);
  if ((physics.slip > 0.35 || physics.slide > 0.35) && performance.now() - slipShown > 2500) {
    slipShown = performance.now();
    hud.message(physics.slip > physics.slide ? '空転 <small>雨でレールが滑りやすい</small>' : '滑走 <small>ブレーキを緩めて</small>', 'info', 1.4);
  }
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
          sound.jointAt({ x: p.x, y: p.y + 0.3, z: p.z }, physics.kmh, true, (b - sj) / Math.max(physics.v, 0.5));
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

/** handles, gauge needles and the eye point of a cab (names from blender/build_models.py make_cab) */
function findCabParts(root) {
  const parts = { mascon: null, brake: null, needles: [], eye: null };
  root.traverse((o) => {
    const n = o.name || '';
    if (n.startsWith('mascon_handle')) parts.mascon = o;
    else if (n.startsWith('brake_handle')) parts.brake = o;
    else if (n.startsWith('needle_')) { o.userData.q0 = o.quaternion.clone(); o.userData.kind = n.split('_')[1]; parts.needles.push(o); }
    else if (n.startsWith('eye_')) parts.eye = { x: o.position.x, y: o.position.y, z: o.position.z };
  });
  return parts;
}

const _needleQ = new THREE.Quaternion(), _needleZ = new THREE.Vector3(0, 0, 1);
function animateCab(parts) {
  const h = physics.handle, v = physics.veh;
  if (parts.brake) {
    // two-handle cab: master controller and brake valve turn about vertical axes (clockwise = power,
    // counter-clockwise = brake, 運転 -> 非常 ≈ 100°)
    if (parts.mascon) parts.mascon.rotation.y = -(Math.max(0, h) / v.powerNotches) * 1.40;
    parts.brake.rotation.y = (Math.max(0, -h) / (v.brakeNotches + 1)) * 1.75;
  } else if (parts.mascon) {
    // one-handle T grip: pull toward the driver for power (up to +45°), push forward to brake / EB (−50°)
    parts.mascon.rotation.z = h >= 0 ? (h / v.powerNotches) * 0.785 : (h / (v.brakeNotches + 1)) * 0.873;
  }
  if (!parts.needles.length || camMode !== 'cab') return;
  // air pressures (kPa) as on the LCD meter; dials: 0-120 km/h, 0-1000 kPa, 270° sweep from 7:30
  const bc = Math.min(800, physics.brake * 440 + (physics.ebActive ? 120 : 0));
  const mr = 830 + 40 * Math.sin(performance.now() / 9000);
  const bp = Math.max(0, 490 - bc * 0.39);
  const val = { speed: physics.kmh / 120, bc: bc / 1000, mr: mr / 1000, er: bp / 1000, bp: bp / 1000, amp: 0.08 + physics.power * 0.6 };
  for (const o of parts.needles) {
    const f = Math.max(0, Math.min(1.02, val[o.userData.kind] ?? 0));
    const k = o.userData.f === undefined ? f : o.userData.f + (f - o.userData.f) * 0.25;   // needle damping
    o.userData.f = k;
    o.quaternion.copy(o.userData.q0).multiply(_needleQ.setFromAxisAngle(_needleZ, -(-135 + 270 * k) * Math.PI / 180));
  }
}

/** scene, camera and HUD for the current state */
function updateView(dt) {
  player.place(route, view.toRoute(physics.s), (x) => view.trackOffset(x), 0.0025 * Math.min(1, physics.kmh / 80));
  world.update(view.toRoute(physics.s), 1);
  if (cabParts) animateCab(cabParts);
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
  updateWeather(dt, cp);
  if (shinkansen) shinkansen.update(dt, view.toRoute(listenerS()), atmo ? atmo.night : 0);
  const trains = [{ front: view.toRoute(physics.s), len: physics.len, dir: view.sign }];
  if (lead && !lead.done && leadSet) {
    leadSet.place(route, view.toRoute(lead.x), (x) => view.trackOffset(x), 0.002);
    trains.push({ front: view.toRoute(lead.x), len: physics.len, dir: view.sign });
    if (leadVoice) {
      const pos = [0.12, 0.5, 0.88].map((f) => { const p = view.pose(lead.x - physics.len * f, 0, {}); return { x: p.x, y: p.y + 0.8, z: p.z }; });
      leadVoice.update(pos, lead.v * 3.6, lead.v > 0.5 && !lead.dwell ? 0.3 : 0, { curvature: view.curvature(lead.x), brake: 0 });
    }
  } else if (leadSet && lead && lead.done) { leadSet.dispose(); leadSet = null; if (leadVoice) { leadVoice.dispose(); leadVoice = null; } }
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
    signal: nextSig ? { aspect: nextSig.aspect, d: nextSig.d } : null,
    signalLimit: signals ? signals.currentLimit() : 999,
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
  get physics() { return physics; }, get game() { return game; }, get world() { return world; }, get view() { return view; }, get traffic() { return traffic; }, get signals() { return signals; }, get shinkansen() { return shinkansen; }, get lead() { return lead; },
  setCamMode, route, sound, announcer, melody, simStep, updateView, THREE,
  get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; }, draw,
  /** fast-forward the logic by `sec` seconds in fixed steps (no rendering) */
  advance(sec, dt = 0.05, each) { for (let t = 0; t < sec && !game.finished; t += dt) { if (each) each(); simStep(dt); } updateView(0.016); },
};
