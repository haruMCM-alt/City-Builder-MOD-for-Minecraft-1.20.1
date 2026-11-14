// Sky, sun, clouds, distant mountains and the ground plane.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fbm, rng } from './noise.js';
import { atmosphere, sunDirection, gradientSky, nightSky } from './atmosphere.js';

export const GROUND_Y = -0.62;

export class Environment {
  constructor(renderer, scene, T, quality, atmo = atmosphere()) {
    this.scene = scene;
    this.renderer = renderer;
    this.atmo = atmo;
    // sun (or moon at night): by day late morning, south-east (the timetable runs 8:51–10:34)
    this.sunDir = sunDirection(atmo);

    const makeSky = (scale, dim) => {
      if (atmo.sky.kind === 'grad') { const m = gradientSky(atmo); m.scale.setScalar(scale * 0.5); return m; }
      const sky = new Sky();
      sky.scale.setScalar(scale);
      dimSky(sky, dim);
      const u = sky.material.uniforms;
      u.turbidity.value = atmo.sky.turbidity;
      u.rayleigh.value = atmo.sky.rayleigh;
      u.mieCoefficient.value = atmo.sky.mie;
      u.mieDirectionalG.value = atmo.sky.mieG;
      u.sunPosition.value.copy(this.sunDir);
      return sky;
    };
    this.sky = makeSky(20000, atmo.sky.dim);
    scene.add(this.sky);

    // image based lighting from the very same sky
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(makeSky(1000, atmo.sky.envDim));
    // a dim ground hemisphere so reflections below the horizon are not sky-blue
    const gnd = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: atmo.groundEnv, side: THREE.BackSide }));
    envScene.add(gnd);
    this.envMap = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = atmo.env;

    this.fogColor = new THREE.Color(atmo.fog.color);
    scene.fog = new THREE.FogExp2(this.fogColor, atmo.fog.density * (quality !== 'low' ? 1 : 1.38));
    this.urban = { value: 0.8 };

    this.initClouds();
    this.initMountains();
    this.initGround(T);
    this.initHorizon();
    this.night = nightSky(atmo, this.sunDir);
    scene.add(this.night);
    // far scenery is unlit (MeshBasic): tint it for dusk / night
    const far = new THREE.Color(atmo.far.tint);
    this.mountains.visible = atmo.far.mountains;
    this.mountains.children.forEach((m) => m.material.color.copy(far));
    this.horizon.children.forEach((m) => { if (!atmo.far.nightTowns) m.material.color.multiply(far); });
    this.clouds.visible = atmo.clouds.show;
    this.clouds.children.forEach((s) => { s.material.color.set(atmo.clouds.tint); s.material.opacity = atmo.clouds.opacity; });
    if (atmo.rain) this.clouds.children.forEach((s) => { s.position.y *= 0.55; s.scale.multiplyScalar(1.6); });
  }

  /** two rings of distant tree lines, towns and pylons (the flat Kanto plain horizon) */
  initHorizon() {
    const R = rng(5150);
    const nightTowns = this.atmo && this.atmo.far.nightTowns;
    const mkTex = (w, h, town) => {
      if (nightTowns) return mkNight(w, h, town);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      // tree lines: bumpy blobs
      for (let x = 0; x < w; x += 3) {
        const th = h * (0.18 + 0.22 * fbm(x / 40, 1.3, 3, 4) + (R() < 0.04 ? 0.15 : 0));
        g.fillStyle = `rgb(${50 + R() * 20},${66 + R() * 20},${52 + R() * 15})`;
        g.beginPath(); g.arc(x, h - th, 4 + R() * 6, 0, 7); g.fill();
        g.fillRect(x - 2, h - th, 5, th);
      }
      // town blocks / factories / apartment slabs
      for (let i = 0; i < (town ? 260 : 110); i++) {
        const x = R() * w, bw = 6 + R() * (town ? 40 : 22), bh = h * (0.12 + R() * (town ? 0.55 : 0.25)) * (R() < 0.08 ? 1.6 : 1);
        const v = 150 + R() * 70;
        g.fillStyle = `rgb(${v},${v * 0.99},${v * 0.97})`;
        g.fillRect(x, h - bh, bw, bh);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + bw * 0.6, h - bh, bw * 0.4, bh);
      }
      // power line pylons (鉄塔)
      for (let i = 0; i < 14; i++) {
        const x = R() * w, ph = h * (0.55 + R() * 0.2);
        g.strokeStyle = 'rgba(70,75,80,0.9)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - 5, h); g.lineTo(x, h - ph); g.lineTo(x + 5, h); g.stroke();
        for (const k of [0.75, 0.88]) { g.beginPath(); g.moveTo(x - 7, h - ph * k); g.lineTo(x + 7, h - ph * k); g.stroke(); }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    // night: dark silhouettes with lit windows, street lights and red aviation lamps on the pylons
    function mkNight(w, h, town) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      for (let x = 0; x < w; x += 3) {
        const th = h * (0.18 + 0.22 * fbm(x / 40, 1.3, 3, 4));
        g.fillStyle = 'rgb(6,8,10)'; g.beginPath(); g.arc(x, h - th, 4 + R() * 6, 0, 7); g.fill(); g.fillRect(x - 2, h - th, 5, th);
      }
      for (let i = 0; i < (town ? 260 : 110); i++) {
        const x = R() * w, bw = 6 + R() * (town ? 40 : 22), bh = h * (0.12 + R() * (town ? 0.55 : 0.25)) * (R() < 0.08 ? 1.6 : 1);
        g.fillStyle = 'rgb(9,11,15)'; g.fillRect(x, h - bh, bw, bh);
        for (let k = 0; k < bw * bh / 30; k++) {
          if (R() < 0.45) continue;
          g.fillStyle = R() < 0.7 ? 'rgba(255,205,140,0.9)' : 'rgba(210,230,255,0.85)';
          g.fillRect(x + 1 + R() * (bw - 2), h - bh + 2 + R() * (bh - 4), 1.2, 1);
        }
      }
      for (let i = 0; i < (town ? 160 : 60); i++) { g.fillStyle = 'rgba(255,190,110,0.8)'; g.fillRect(R() * w, h - 2 - R() * 4, 1.4, 1.4); }
      for (let i = 0; i < 14; i++) { const x = R() * w, ph = h * (0.55 + R() * 0.2); g.fillStyle = 'rgba(255,40,30,0.95)'; g.fillRect(x - 1, h - ph - 1, 2, 2); }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
      return t;
    }
    this.horizon = new THREE.Group();
    for (const [radius, height, town, rep] of [[3200, 40, true, 6], [6500, 70, false, 9]]) {
      const tx = mkTex(2048, 128, town);
      tx.repeat.set(rep, 1);
      const g = new THREE.CylinderGeometry(radius, radius, height, 160, 1, true);
      g.translate(0, height / 2 + GROUND_Y - 0.5, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tx, transparent: true, alphaTest: 0.4, side: THREE.BackSide, depthWrite: true, color: nightTowns ? 0xffffff : 0xcfd6d8, fog: !nightTowns }));
      this.horizon.add(m);
    }
    this.scene.add(this.horizon);
  }

  initClouds() {
    const R = rng(77);
    const mk = (w, h, puffs) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      for (let i = 0; i < puffs; i++) {
        const x = w * (0.15 + R() * 0.7), y = h * (0.35 + R() * 0.4), r = h * (0.12 + R() * 0.25);
        const grd = g.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.95)');
        grd.addColorStop(0.6, 'rgba(240,244,250,0.6)');
        grd.addColorStop(1, 'rgba(220,228,238,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      // flat grey base
      const base = g.createLinearGradient(0, h * 0.5, 0, h);
      base.addColorStop(0, 'rgba(180,190,205,0)'); base.addColorStop(1, 'rgba(160,170,185,0.35)');
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const texs = [mk(512, 256, 40), mk(512, 256, 30), mk(512, 256, 55)];
    this.clouds = new THREE.Group();
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 3], fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
      const a = R() * Math.PI * 2, r = 2500 + R() * 6500;
      m.position.set(Math.cos(a) * r, 900 + R() * 900, Math.sin(a) * r);
      const s = 900 + R() * 1400;
      m.scale.set(s, s * 0.45, 1);
      this.clouds.add(m);
    }
    this.scene.add(this.clouds);
  }

  /** rings of distant ranges: Nikko mountains NW, Tsukuba E, Chichibu SW; two layers with aerial perspective */
  initMountains() {
    const N = 1440;
    const peak = (a, center, width, height) => {
      const d = Math.abs(((a - center + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const t = Math.max(0, 1 - d / width);
      return t * t * (3 - 2 * t) * height;
    };
    // ridged multi-octave noise: sharp crests, rounded valleys
    const ridge = (x, seed) => {
      let h = 0, amp = 1, f = 1;
      for (let o = 0; o < 6; o++) { h += (1 - Math.abs(fbm(x * f, seed + o * 7.1, 1, 2) * 2 - 1)) * amp; amp *= 0.5; f *= 2.1; }
      return h / 1.97;
    };
    // seamless around the ring: cross-fade with the same noise one lap earlier
    const ridgeLoop = (i, k, seed) => { const t = i / N; return ridge(i * k, seed) * (1 - t) + ridge((i - N) * k, seed) * t; };
    const fogC = this.fogColor || new THREE.Color(0xa9bccc);
    this.mountains = new THREE.Group();
    // far layer (big ranges) and near layer (low foothills, darker and greener)
    for (const [R0, scale, seed, tint, haze] of [[12500, 1.0, 3.3, [0.36, 0.45, 0.58], 0.55], [7800, 0.32, 8.8, [0.30, 0.38, 0.36], 0.38]]) {
      const pos = [], col = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;  // angle from +x towards -z (north = -z)
        const r = ridgeLoop(i, 0.012, seed);
        let h = 40 + r * 160;
        // 日光連山 (男体山 / 女峰山 / 白根山): a broad massif with several summits
        const nikko = peak(a, Math.PI * 0.62, 0.5, 1.0);
        h += nikko * (900 + 700 * ridgeLoop(i, 0.03, seed + 2)) + peak(a, Math.PI * 0.58, 0.06, 420) + peak(a, Math.PI * 0.66, 0.05, 330);
        // 筑波山: twin peaks rising from the plain
        h += peak(a, Math.PI * 0.30, 0.10, 520) + peak(a, Math.PI * 0.287, 0.035, 160) + peak(a, Math.PI * 0.313, 0.03, 120);
        // 秩父 / 奥多摩 far to the south-west
        h += peak(a, Math.PI * 1.10, 0.45, 1.0) * (300 + 500 * ridgeLoop(i, 0.025, seed + 5));
        h *= scale;
        const x = Math.cos(a) * R0, z = -Math.sin(a) * R0;
        pos.push(x, -40, z, x, h, z);
        // aerial perspective: base melts into the haze, crests are darker and bluer
        const k = Math.min(1, h / 900);
        const base = fogC.clone().lerp(new THREE.Color(...tint), 0.15);
        const top = fogC.clone().lerp(new THREE.Color(...tint), haze * (0.6 + 0.4 * k));
        col.push(base.r, base.g, base.b, top.r, top.g, top.b);
      }
      for (let i = 0; i < N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -1;
      this.mountains.add(m);
    }
    this.scene.add(this.mountains);
  }

  /** fine ground detail (grass blades / grit), tiled every ~1.6 m so the ground holds up close to the camera */
  detailTexture() {
    const N = 256, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const R = rng(911);
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 5200; i++) {
      // short strokes in random directions (blades / grit), bright and dark
      const x = R() * N, y = R() * N, a = R() * Math.PI, l = 1 + R() * 5;
      const v = R() < 0.5 ? 70 + R() * 40 : 170 + R() * 60;
      g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 0.6 + R();
      for (const dx of [0, -N, N]) for (const dy of [0, -N, N]) {
        g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  initGround(T) {
    T.grass.repeat.set(1, 1);
    const detail = this.detailTexture();
    const mat = new THREE.MeshStandardMaterial({ map: T.grass, normalMap: T.grassN, roughness: 1, color: 0xd2dcc0 });
    mat.normalScale.set(0.6, 0.6);
    // world-space UVs + a large scale colour variation to hide tiling
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.macroMap = { value: T.macro };
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.uUrban = this.urban;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;\nuniform sampler2D macroMap;\nuniform sampler2D detailMap;\nuniform float uUrban;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <map_fragment>', `
          vec4 g1 = texture2D(map, vWorldXZ / 9.0);
          vec4 g2 = texture2D(map, vWorldXZ / 37.0 + 0.31);
          float m = texture2D(macroMap, vWorldXZ / 700.0).r;
          float m2 = texture2D(macroMap, vWorldXZ / 160.0 + 0.5).r;
          vec4 sampledDiffuseColor = mix(g1, g2, 0.45);
          sampledDiffuseColor.rgb *= mix(0.72, 1.18, m) * mix(0.9, 1.08, m2);
          sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(1.15, 1.05, 0.75), smoothstep(0.55, 0.8, m));
          // patchwork of paddies / fields (rotated grid) and grey town fabric
          float lum = dot(sampledDiffuseColor.rgb, vec3(0.333)) * 2.4;
          vec2 rp = vec2(vWorldXZ.x * 0.966 - vWorldXZ.y * 0.259, vWorldXZ.x * 0.259 + vWorldXZ.y * 0.966);
          vec2 fc = rp / vec2(92.0, 46.0);
          vec2 cid = floor(fc), cf = fract(fc);
          float hh = h21(cid);
          vec3 crop = hh < 0.42 ? vec3(0.78, 0.64, 0.30) : hh < 0.66 ? vec3(0.50, 0.40, 0.27) : hh < 0.84 ? vec3(0.40, 0.52, 0.24) : vec3(0.58, 0.55, 0.36);
          float inside = step(0.025, cf.x) * step(cf.x, 0.975) * step(0.05, cf.y) * step(cf.y, 0.95);
          vec3 farmCol = mix(sampledDiffuseColor.rgb * 0.9, crop * lum, inside);
          float village = smoothstep(0.58, 0.66, texture2D(macroMap, vWorldXZ / 1300.0 + 0.2).r);
          farmCol = mix(farmCol, vec3(0.20, 0.27, 0.16) * lum, village * 0.85);
          // town ground: a patchwork of lots - asphalt car parks, concrete, gravel, gardens - with curbs
          vec2 up = vWorldXZ / vec2(23.0, 17.0);
          vec2 uc = floor(up), uf = fract(up);
          float uh = h21(uc), uh2 = h21(uc + 17.3);
          // (linear colours) asphalt car parks and lanes, concrete yards, gravel, small gardens
          vec3 asphalt = vec3(0.075, 0.075, 0.08) * (0.85 + 0.3 * m2);
          vec3 concrete = vec3(0.26, 0.255, 0.24);
          vec3 gravel = vec3(0.21, 0.19, 0.16);
          vec3 garden = vec3(0.07, 0.11, 0.04) * lum;
          vec3 town = uh < 0.42 ? asphalt : uh < 0.72 ? concrete : uh < 0.87 ? gravel : garden;
          town *= 0.88 + 0.24 * uh2;
          float curb = 1.0 - step(0.012, uf.x) * step(uf.x, 0.988) * step(0.016, uf.y) * step(uf.y, 0.984);
          town = mix(town, vec3(0.30, 0.30, 0.28), curb * 0.5);
          float farmAmt = (1.0 - uUrban) * smoothstep(0.3, 0.5, m);
          vec3 col = mix(sampledDiffuseColor.rgb, farmCol, farmAmt);
          col = mix(col, town, uUrban * 0.85);
          // fine detail, strongest close to the camera (fades before it can alias)
          float dd = texture2D(detailMap, vWorldXZ / 1.6).r * 0.6 + texture2D(detailMap, vWorldXZ / 0.45 + 0.37).r * 0.4;
          float near = 1.0 - smoothstep(30.0, 140.0, length(vWorldXZ - cameraPosition.xz));
          col *= mix(1.0, 0.72 + 0.56 * dd, 0.35 + 0.45 * near);
          // dry / worn patches in the grass
          float dry = smoothstep(0.55, 0.75, texture2D(macroMap, vWorldXZ / 55.0 + 0.71).r) * (1.0 - uUrban);
          col = mix(col, col * vec3(1.18, 1.05, 0.72), dry * 0.6);
          sampledDiffuseColor.rgb = col;
          diffuseColor *= sampledDiffuseColor;`)
        .replace('#include <normal_fragment_maps>', `
          vec3 mapN = texture2D( normalMap, vWorldXZ / 9.0 ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );`);
    };
    // radial grid, fine near the camera: huge triangles interpolate depth too
    // coarsely and would poke through the track bed close to the viewer
    const radii = [0];
    for (let r = 6; r < 13000; r *= 1.35) radii.push(r);
    radii.push(13000);
    const SEG = 64;
    const pos = [0, 0, 0], idx = [];
    for (let i = 1; i < radii.length; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
      }
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
    for (let i = 1; i < radii.length - 1; i++) {
      const b0 = 1 + (i - 1) * SEG, b1 = 1 + i * SEG;
      for (let j = 0; j < SEG; j++) {
        const j2 = (j + 1) % SEG;
        idx.push(b0 + j, b0 + j2, b1 + j, b0 + j2, b1 + j2, b1 + j);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.setIndex(idx);
    this.ground = new THREE.Mesh(g, mat);
    // a little below GROUND_Y so paddies, roads and water laid just above GROUND_Y never z-fight with it
    this.ground.position.y = GROUND_Y - 0.07;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  setUrban(u) { this.urban.value += (u - this.urban.value) * 0.02; }

  follow(cam) {
    this.horizon.position.set(cam.x, 0, cam.z);
    this.ground.position.x = cam.x; this.ground.position.z = cam.z;
    this.mountains.position.set(cam.x, 0, cam.z);
    this.clouds.position.set(cam.x * 0.92, 0, cam.z * 0.92);
    this.sky.position.copy(cam);
    this.night.position.copy(cam);
  }

  dispose() {
    for (const o of [this.sky, this.clouds, this.mountains, this.ground, this.horizon, this.night]) o.removeFromParent();
  }
}

/** scale the analytic sky's radiance (it is far too bright for our exposure) */
function dimSky(sky, k) {
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( retColor, 1.0 );',
    `vec3 rc = retColor * ${k.toFixed(3)};
     float rl = dot(rc, vec3(0.2126, 0.7152, 0.0722));
     // the analytic model is pale; a clear Kanto autumn morning is a deeper blue overhead
     rc = max(mix(vec3(rl), rc, 1.55), 0.0);
     gl_FragColor = vec4( rc, 1.0 );`);
  sky.material.needsUpdate = true;
}
