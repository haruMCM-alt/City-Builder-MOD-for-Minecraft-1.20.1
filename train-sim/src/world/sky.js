// Sky, sun, clouds, distant mountains and the ground plane.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fbm, rng } from './noise.js';

export const GROUND_Y = -0.62;

export class Environment {
  constructor(renderer, scene, T, quality) {
    this.scene = scene;
    this.renderer = renderer;
    // sun: late morning, south-east (the timetable runs 8:51–10:34)
    const elev = THREE.MathUtils.degToRad(42), azim = THREE.MathUtils.degToRad(140);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);

    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    dimSky(this.sky, 0.62);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 1.3;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(this.sunDir);
    scene.add(this.sky);

    // image based lighting from the very same sky
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky();
    sky2.scale.setScalar(1000);
    dimSky(sky2, 0.62);
    Object.assign(sky2.material.uniforms.turbidity, { value: 4.5 });
    sky2.material.uniforms.rayleigh.value = 1.3;
    sky2.material.uniforms.mieCoefficient.value = 0.004;
    sky2.material.uniforms.mieDirectionalG.value = 0.8;
    sky2.material.uniforms.sunPosition.value.copy(this.sunDir);
    envScene.add(sky2);
    // a dim ground hemisphere so reflections below the horizon are not sky-blue
    const gnd = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x4a4f3e, side: THREE.BackSide }));
    envScene.add(gnd);
    this.envMap = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.85;

    this.fogColor = new THREE.Color(0xa9bccc);
    scene.fog = new THREE.FogExp2(this.fogColor, quality !== 'low' ? 0.00026 : 0.00036);
    this.urban = { value: 0.8 };

    this.initClouds();
    this.initMountains();
    this.initGround(T);
    this.initHorizon();
  }

  /** two rings of distant tree lines, towns and pylons (the flat Kanto plain horizon) */
  initHorizon() {
    const R = rng(5150);
    const mkTex = (w, h, town) => {
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
    this.horizon = new THREE.Group();
    for (const [radius, height, town, rep] of [[3200, 40, true, 6], [6500, 70, false, 9]]) {
      const tx = mkTex(2048, 128, town);
      tx.repeat.set(rep, 1);
      const g = new THREE.CylinderGeometry(radius, radius, height, 160, 1, true);
      g.translate(0, height / 2 + GROUND_Y - 0.5, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tx, transparent: true, alphaTest: 0.4, side: THREE.BackSide, depthWrite: true, color: 0xcfd6d8 }));
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

  /** ring of distant ranges: Nikko mountains NW, Tsukuba E, low hills elsewhere */
  initMountains() {
    const N = 360, R0 = 11000;
    const pos = [], col = [], idx = [];
    const peak = (a, center, width, height) => {
      let d = Math.abs(((a - center + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return Math.max(0, 1 - d / width) ** 1.5 * height;
    };
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;  // angle from +x towards -z (north = -z)
      let h = 60 + fbm(i * 0.08, 3.3, 4, 5) * 220;
      // world heading: our route runs roughly north (-z); north-west = Nikko
      h += peak(a, Math.PI * 0.62, 0.55, 1500) * (0.6 + 0.4 * fbm(i * 0.2, 1.1, 3, 8));   // 日光連山
      h += peak(a, Math.PI * 0.30, 0.12, 700);                                                // 筑波山 (twin peak)
      h += peak(a, Math.PI * 0.27, 0.05, 120);
      h += peak(a, Math.PI * 1.10, 0.35, 500) * fbm(i * 0.3, 9.1, 3, 2);                     // 秩父 / 丹沢 far SW
      const x = Math.cos(a) * R0, z = -Math.sin(a) * R0;
      pos.push(x, -40, z, x, h, z);
      const hz = [0.62, 0.70, 0.78], top = [0.50, 0.58, 0.66];
      col.push(...hz, ...top);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mountains = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    this.mountains.renderOrder = -1;
    this.scene.add(this.mountains);
  }

  initGround(T) {
    T.grass.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: T.grass, normalMap: T.grassN, roughness: 1, color: 0xd2dcc0 });
    mat.normalScale.set(0.6, 0.6);
    // world-space UVs + a large scale colour variation to hide tiling
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.macroMap = { value: T.macro };
      sh.uniforms.uUrban = this.urban;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;\nuniform sampler2D macroMap;\nuniform float uUrban;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
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
          vec2 uc = floor(vWorldXZ / 26.0);
          float uh = h21(uc);
          vec3 town = mix(vec3(0.46, 0.45, 0.43), vec3(0.62, 0.60, 0.57), uh) * (0.85 + 0.3 * m2);
          town = mix(town, vec3(0.22, 0.30, 0.17) * lum, step(0.86, uh));
          float farmAmt = (1.0 - uUrban) * smoothstep(0.3, 0.5, m);
          vec3 col = mix(sampledDiffuseColor.rgb, farmCol, farmAmt);
          col = mix(col, town, uUrban * 0.85);
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
  }

  dispose() {
    for (const o of [this.sky, this.clouds, this.mountains, this.ground, this.horizon]) o.removeFromParent();
  }
}

/** scale the analytic sky's radiance (it is far too bright for our exposure) */
function dimSky(sky, k) {
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( retColor, 1.0 );',
    `gl_FragColor = vec4( retColor * ${k.toFixed(3)}, 1.0 );`);
  sky.material.needsUpdate = true;
}
