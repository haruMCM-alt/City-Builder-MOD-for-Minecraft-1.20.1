// Time of day (朝・夕方・夜) and weather (晴れ・雨): one preset drives the sky, sun / moon,
// ambient light, fog, clouds, far scenery, exposure and the "lights on" level of the world.
import * as THREE from 'three';

export const TIMES = { day: '朝（9時台）', evening: '夕方', night: '夜' };
export const WEATHERS = { clear: '晴れ', rain: '雨' };
/** timetable shift for the chosen time of day (s): the run starts at 8:51 by day */
export const TIME_SHIFT = { day: 0, evening: 7 * 3600 + 55 * 60, night: 11 * 3600 };

const C = (h) => new THREE.Color(h);

/**
 * night: how many windows / lamps are lit (0..1)
 * sky: 'sky' = analytic daylight sky (three Sky), 'grad' = gradient dome (overcast / night)
 */
export function atmosphere(tod = 'day', weather = 'clear') {
  const rain = weather === 'rain';
  const P = {
    tod, weather, rain: rain ? 1 : 0,
    night: 0, lit: 0,
    sun: { elev: 42, azim: 140, color: 0xfff0d8, intensity: 3.5, shadows: true },
    hemi: { sky: 0xcfe3ff, ground: 0x6b6250, intensity: 0.22 },
    env: 0.72, exposure: 1.05, bloom: 0.22,
    fog: { color: 0xa9bccc, density: 0.00026 },
    sky: { kind: 'sky', turbidity: 3.2, rayleigh: 1.9, mie: 0.004, mieG: 0.8, dim: 0.5, envDim: 0.55 },
    groundEnv: 0x4a4f3e,
    clouds: { tint: 0xffffff, opacity: 0.85, show: true },
    far: { tint: 0xffffff, mountains: true, nightTowns: false },
    stars: false, moon: false,
    headlight: 0, cabFill: 0.9,
  };
  if (tod === 'evening') {
    Object.assign(P, {
      night: 0.5, lit: 0.35, env: 0.5, exposure: 1.12, bloom: 0.3,
      sun: { elev: 3.5, azim: 248, color: 0xffa060, intensity: 2.4, shadows: true },
      hemi: { sky: 0xffc9a0, ground: 0x3e3440, intensity: 0.16 },
      fog: { color: 0xc4a596, density: 0.00032 },
      sky: { kind: 'sky', turbidity: 5.5, rayleigh: 3.0, mie: 0.006, mieG: 0.86, dim: 0.62, envDim: 0.6 },
      groundEnv: 0x3a3430,
      clouds: { tint: 0xffb48c, opacity: 0.85, show: true },
      far: { tint: 0xb39894, mountains: true, nightTowns: false },
      headlight: 0.4, cabFill: 0.5,
    });
  }
  if (tod === 'night') {
    Object.assign(P, {
      night: 1, lit: 0.42, env: 0.22, exposure: 1.3, bloom: 0.4,
      sun: { elev: 38, azim: 150, color: 0x9db4e8, intensity: 0.32, shadows: true },
      hemi: { sky: 0x34466c, ground: 0x1a1612, intensity: 0.2 },
      fog: { color: 0x0a0f18, density: 0.00045 },
      sky: { kind: 'grad', top: 0x02040b, horizon: 0x111a2c, bottom: 0x040507, glow: 0x3a2c22, glowAzim: 200 },
      groundEnv: 0x07080a,
      clouds: { tint: 0x1a2232, opacity: 0.45, show: true },
      far: { tint: 0x1a2130, mountains: true, nightTowns: true },
      stars: true, moon: true,
      headlight: 1, cabFill: 0.16,
    });
  }
  if (rain) {
    if (tod === 'day') {
      Object.assign(P, {
        lit: 0.15, night: 0.15, env: 0.9, exposure: 1.0,
        sun: { elev: 55, azim: 150, color: 0xdfe6ee, intensity: 0.55, shadows: false },
        hemi: { sky: 0xc9d2da, ground: 0x55554e, intensity: 1.1 },
        fog: { color: 0x9aa2a9, density: 0.0012 },
        sky: { kind: 'grad', top: 0x858d95, horizon: 0xa2a9af, bottom: 0x5a5d61 },
        groundEnv: 0x45474a,
        clouds: { tint: 0x8c939a, opacity: 0.9, show: true },
        headlight: 0.25, cabFill: 0.8,
      });
    } else if (tod === 'evening') {
      Object.assign(P, {
        lit: 0.5, night: 0.75, env: 0.4, exposure: 1.12,
        sun: { elev: 5, azim: 248, color: 0xff9a70, intensity: 0.25, shadows: false },
        hemi: { sky: 0x9a8c94, ground: 0x2e2a2a, intensity: 0.5 },
        fog: { color: 0x58545e, density: 0.0013 },
        sky: { kind: 'grad', top: 0x3c3a44, horizon: 0x6c6064, bottom: 0x29272b },
        groundEnv: 0x232224,
        clouds: { tint: 0x4d4a54, opacity: 0.9, show: true },
        headlight: 0.6, cabFill: 0.4,
      });
    } else {
      Object.assign(P, {
        env: 0.1,
        sun: { elev: 50, azim: 150, color: 0x8090b0, intensity: 0.05, shadows: false },
        hemi: { sky: 0x2f3546, ground: 0x15130f, intensity: 0.22 },
        fog: { color: 0x10141a, density: 0.0014 },
        sky: { kind: 'grad', top: 0x07090c, horizon: 0x171b22, bottom: 0x050607, glow: 0x2c2620, glowAzim: 200 },
        clouds: { tint: 0x1a1d24, opacity: 0.6, show: false },
        stars: false, moon: false,
      });
    }
    P.far = { ...P.far, mountains: false };
  }
  return P;
}

/** sun (or moon) direction for the preset */
export function sunDirection(P) {
  const elev = THREE.MathUtils.degToRad(P.sun.elev), azim = THREE.MathUtils.degToRad(P.sun.azim);
  return new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
}

/** a gradient sky dome for overcast and night skies (optional warm light-pollution glow near the horizon) */
export function gradientSky(P) {
  const s = P.sky;
  const glowDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2, THREE.MathUtils.degToRad(s.glowAzim || 0));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: C(s.top) }, horizon: { value: C(s.horizon) }, bottom: { value: C(s.bottom) },
      glow: { value: C(s.glow || 0x000000) }, glowDir: { value: glowDir },
    },
    vertexShader: `varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 glow; uniform vec3 glowDir;
      varying vec3 vWorldPosition;
      void main() {
        vec3 d = normalize(vWorldPosition - cameraPosition);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.55)) : mix(horizon, bottom, pow(min(1.0, -h * 4.0), 0.5));
        float side = 0.55 + 0.45 * max(0.0, dot(normalize(d.xz + 1e-5), normalize(glowDir.xz)));
        c += glow * exp(-max(h, 0.0) * 9.0) * side * step(-0.05, h);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  m.frustumCulled = false;
  return m;
}

/** stars (and the moon) for clear nights; the group follows the camera */
export function nightSky(P, moonDir) {
  const g = new THREE.Group();
  if (P.stars) {
    const n = 2200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let seed = 12345;
    const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) {
      // upper hemisphere, fewer close to the (light-polluted) horizon
      const y = Math.pow(R(), 0.7), a = R() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 9000, (y * 0.98 + 0.02) * 9000, Math.sin(a) * r * 9000], i * 3);
      const b = Math.pow(R(), 3) * 0.9 + 0.1, t = R();
      col.set([b * (0.85 + 0.15 * t), b * 0.9, b * (1.05 - 0.15 * t)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    pts.renderOrder = -2;
    g.add(pts);
  }
  if (P.moon) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const halo = x.createRadialGradient(64, 64, 8, 64, 64, 64);
    halo.addColorStop(0, 'rgba(220,228,255,0.55)'); halo.addColorStop(0.35, 'rgba(160,180,230,0.12)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = halo; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#f2f0e6'; x.beginPath(); x.arc(64, 64, 11, 0, 7); x.fill();
    x.fillStyle = 'rgba(150,150,140,0.35)';
    for (const [dx, dy, r] of [[-3, -2, 3], [3, 3, 2.5], [1, -5, 2]]) { x.beginPath(); x.arc(64 + dx, 64 + dy, r, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true }));
    s.position.copy(moonDir).multiplyScalar(8500);
    s.scale.setScalar(900);
    g.add(s);
  }
  return g;
}

/**
 * lit windows at night: an emissive mask from the facade texture (dark glass = window),
 * switched on per window bay / storey by a hash so every building has its own pattern
 */
export function addWindowLights(mat, facadeTex, { bays = 4, isWindow, shared }) {
  const src = facadeTex.image;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = isWindow(d[i], d[i + 1], d[i + 2]) ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const mask = new THREE.CanvasTexture(c);
  mask.wrapS = mask.wrapT = THREE.RepeatWrapping;
  mask.colorSpace = THREE.NoColorSpace;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWinMask = { value: mask };
    sh.uniforms.uNight = shared.night;
    sh.uniforms.uLit = shared.lit;
    sh.uniforms.uBays = { value: bays };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uWinMask; uniform float uNight; uniform float uLit; uniform float uBays;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_MAP
        if (uNight > 0.001) {
          float wm = texture2D(uWinMask, vMapUv).r;
          vec2 cell = floor(vMapUv * vec2(uBays, 1.0));
          #ifdef USE_COLOR
          cell += vColor.rg * 97.0;
          #endif
          float hs = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float on = step(hs, uLit);
          vec3 tint = fract(hs * 7.31) > 0.68 ? vec3(0.82, 0.9, 1.0) : vec3(1.0, 0.74, 0.46);
          totalEmissiveRadiance += wm * on * tint * uNight * (0.3 + 0.35 * fract(hs * 3.7));
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'winlights';
  mat.needsUpdate = true;
}
