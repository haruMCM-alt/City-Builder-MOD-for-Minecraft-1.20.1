// Fire, smoke, sparks and explosion effects (engine fires, broken wings, crash sites).
// Two GPU point clouds: additive flames / sparks and alpha-blended smoke, each particle with its
// own colour, size and opacity; flickering point lights follow the biggest fires.
import * as THREE from 'three';
import { HDR } from './world.js';

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  // soft blob with some cauliflower noise
  const h = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c2 = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v;
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (x - 63.5) / 63.5, dy = (y - 63.5) / 63.5;
    const r = Math.hypot(dx, dy);
    let n = 0, f = 3, a = 0.5;
    for (let o = 0; o < 4; o++) { n += a * noise(x / 128 * f + 7, y / 128 * f + 3); f *= 2; a *= 0.5; }
    const v = Math.max(0, 1 - r * (1.05 - 0.45 * n)) ** 1.6;
    const k = (y * 128 + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.min(255, v * 255 * (0.75 + 0.5 * n));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloud(scene, N, additive, tex) {
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(N * 3), S = new Float32Array(N), A = new Float32Array(N), C = new Float32Array(N * 3), R = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(S, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('palpha', new THREE.BufferAttribute(A, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(C, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('prot', new THREE.BufferAttribute(R, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uScreen: { value: 800 }, uLin: HDR.uLin, uGain: HDR.uGain, uAdd: { value: additive ? 1 : 0 } },
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float psize; attribute float palpha; attribute vec3 pcol; attribute float prot;
      uniform float uScreen; varying float vA; varying vec3 vC; varying float vR;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(psize * uScreen / max(-mv.z, 0.1), 0.0, 480.0);   // bounded overdraw
        vA = palpha; vC = pcol; vR = prot; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap; uniform float uLin, uGain, uAdd; varying float vA; varying vec3 vC; varying float vR;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR);
        p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
        float a = texture2D(uMap, p).a * vA;
        if (a < 0.003) discard;
        vec3 col = mix(vC, pow(vC, vec3(2.2)) * uGain * (uAdd > 0.5 ? 3.0 : 1.0), uLin);
        gl_FragColor = vec4(col * (uAdd > 0.5 ? a : 1.0), uAdd > 0.5 ? 1.0 : a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 8 : 7;
  scene.add(pts);
  const meta = Array.from({ length: N }, () => ({ life: 0 }));
  return { pts, P, S, A, C, R, meta, next: 0, N };
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const glow = puffTexture();
    this.fire = cloud(scene, 5000, true, glow);
    this.smoke = cloud(scene, 5000, false, glow);
    this.sources = [];          // persistent emitters
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 260, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, w: 0, pos: new THREE.Vector3(), flick: Math.random() * 10 });
    }
    this.flash = new THREE.PointLight(0xffd6a0, 0, 2500, 1.4);
    scene.add(this.flash);
    this.flashT = 0;
    this.time = 0;
  }

  _add(C, p, v, life, size, grow, alpha, kind, col) {
    const i = C.next; C.next = (C.next + 1) % C.N;
    const m = C.meta[i];
    m.life = life; m.max = life; m.v = [v.x, v.y, v.z]; m.grow = grow; m.s0 = size; m.a0 = alpha; m.kind = kind; m.col = col;
    m.spin = (Math.random() - 0.5) * 1.2;
    C.P[i * 3] = p.x; C.P[i * 3 + 1] = p.y; C.P[i * 3 + 2] = p.z;
    C.R[i] = Math.random() * 6.3;
  }

  // flames: hot core -> orange -> dark red, rising
  flame(p, v, life = 1.2, size = 4, grow = 1.2, alpha = 0.9) { this._add(this.fire, p, v, life, size, grow, alpha, 'flame'); }
  spark(p, v, life = 1.5) { this._add(this.fire, p, v, life, 0.35, 0, 1, 'spark'); }
  // smoke: dark = black fuel smoke, otherwise grey
  smokePuff(p, v, life = 6, size = 6, grow = 3, alpha = 0.55, dark = 1) {
    const g = 0.06 + (1 - dark) * 0.45;
    this._add(this.smoke, p, v, life, size, grow, alpha, 'smoke', [g, g * 0.97, g * 0.95]);
  }
  steam(p, v, life = 3, size = 5, grow = 2.5, alpha = 0.5) { this._add(this.smoke, p, v, life, size, grow, alpha, 'smoke', [0.92, 0.94, 0.96]); }

  // persistent emitter: getPos() -> world position (or null when gone), rate 0..1, duration (s)
  addSource(getPos, { kind = 'fire', rate = 1, size = 4, dur = 60, getVel = null, light = true } = {}) {
    const s = { getPos, kind, rate, size, dur, t: 0, acc: 0, getVel, light };
    this.sources.push(s);
    return s;
  }

  clear() {
    this.sources.length = 0;
    for (const C of [this.fire, this.smoke]) { for (const m of C.meta) m.life = 0; C.A.fill(0); }
    for (const L of this.lights) L.l.intensity = 0;
    this.flash.intensity = 0;
  }

  // explosion: fireball + shock of sparks + black mushroom of smoke + light flash
  explode(p, power = 1, vel = { x: 0, y: 0, z: 0 }) {
    const R = 18 * power;
    for (let i = 0; i < 260 * Math.min(power, 2); i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const sp = (8 + Math.random() * 30) * power;
      this.flame({ x: p.x + d.x * R * 0.2, y: p.y + d.y * R * 0.2 + 1, z: p.z + d.z * R * 0.2 },
        { x: d.x * sp + vel.x * 0.3, y: d.y * sp + 4, z: d.z * sp + vel.z * 0.3 }, 1.2 + Math.random() * 1.6, (6 + Math.random() * 10) * power, 1.8, 0.28);
    }
    for (let i = 0; i < 160; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      const sp = 25 + Math.random() * 60;
      this.spark(p, { x: d.x * sp + vel.x * 0.5, y: d.y * sp, z: d.z * sp + vel.z * 0.5 }, 1 + Math.random() * 2.5);
    }
    for (let i = 0; i < 90 * Math.min(power, 2); i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).normalize();
      this.smokePuff({ x: p.x + d.x * R * 0.5, y: p.y + 4 + d.y * R * 0.4, z: p.z + d.z * R * 0.5 },
        { x: d.x * 8, y: 6 + Math.random() * 10, z: d.z * 8 }, 14 + Math.random() * 16, (10 + Math.random() * 12) * power, 2.2, 0.75, 1);
    }
    this.flash.position.set(p.x, p.y + 15, p.z);
    this.flash.intensity = 8.0e4 * power;
    this.flashT = 1;
  }

  update(dt, camera) {
    this.time += dt;
    // emitters
    for (let k = this.sources.length - 1; k >= 0; k--) {
      const s = this.sources[k];
      s.t += dt;
      const p = s.getPos();
      if (!p || s.t > s.dur) { this.sources.splice(k, 1); continue; }
      const fade = Math.min(1, (s.dur - s.t) / 10);
      const v = s.getVel ? s.getVel() : { x: 0, y: 0, z: 0 };
      s.acc += dt * s.rate * fade * (s.kind === 'fire' ? 60 : s.kind === 'trail' ? 40 : 14);
      while (s.acc >= 1) {
        s.acc -= 1;
        const j = () => (Math.random() - 0.5) * s.size * 0.8;
        if (s.kind === 'fire' || s.kind === 'trail') {
          // flames trail behind a moving source (air stream) or rise from a burning wreck
          const mv = s.kind === 'trail' ? 0.85 : 0;
          this.flame({ x: p.x + j(), y: p.y + j() * 0.5, z: p.z + j() },
            { x: v.x * mv + (Math.random() - 0.5) * 2, y: v.y * mv + 3 + Math.random() * 4, z: v.z * mv + (Math.random() - 0.5) * 2 },
            (s.kind === 'trail' ? 0.5 : 0.9) + Math.random() * 0.8, s.size * (0.7 + Math.random() * 0.6), 1.1, 0.8);
          if (Math.random() < 0.45) this.smokePuff({ x: p.x + j(), y: p.y + s.size * 0.6, z: p.z + j() },
            { x: v.x * mv * 0.9 + (Math.random() - 0.5), y: v.y * mv * 0.9 + 3 + Math.random() * 3, z: v.z * mv * 0.9 + (Math.random() - 0.5) },
            s.kind === 'trail' ? 5 + Math.random() * 3 : 12 + Math.random() * 10, s.size * 1.4, 3, 0.55, 1);
          if (Math.random() < 0.05) this.spark({ x: p.x, y: p.y, z: p.z }, { x: v.x * 0.5 + (Math.random() - 0.5) * 8, y: 6 + Math.random() * 10, z: v.z * 0.5 + (Math.random() - 0.5) * 8 }, 1.2);
        } else if (s.kind === 'smoke') {
          this.smokePuff({ x: p.x + j(), y: p.y, z: p.z + j() }, { x: v.x * 0.8, y: v.y * 0.8 + 2, z: v.z * 0.8 }, 6 + Math.random() * 4, s.size, 3, 0.4, 0.8);
        } else if (s.kind === 'fuel') {
          // leaking fuel mist
          this.steam({ x: p.x + j() * 0.3, y: p.y, z: p.z + j() * 0.3 }, { x: v.x * 0.9, y: v.y * 0.9, z: v.z * 0.9 }, 1.5 + Math.random(), s.size * 0.5, 4, 0.35);
        }
      }
    }
    // particles
    const G = 9.81;
    for (const C of [this.fire, this.smoke]) {
      for (let i = 0; i < C.N; i++) {
        const m = C.meta[i];
        if (m.life <= 0) { C.A[i] = 0; continue; }
        m.life -= dt;
        const t = 1 - m.life / m.max;
        const v = m.v;
        if (m.kind === 'spark') { v[1] -= G * dt; v[0] *= 1 - dt * 0.3; v[2] *= 1 - dt * 0.3; }
        else if (m.kind === 'flame') { v[0] *= 1 - dt * 1.6; v[2] *= 1 - dt * 1.6; v[1] = v[1] * (1 - dt * 1.2) + 5 * dt; }
        else { v[0] *= 1 - dt * 0.5; v[2] *= 1 - dt * 0.5; v[1] = v[1] * (1 - dt * 0.4) + 1.2 * dt; }
        C.P[i * 3] += v[0] * dt; C.P[i * 3 + 1] += v[1] * dt; C.P[i * 3 + 2] += v[2] * dt;
        C.R[i] += m.spin * dt;
        if (m.kind === 'flame') {
          // colour over life: white-yellow core -> orange -> deep red / soot
          const r = 1.0, g = Math.max(0.12, 0.8 - t * 1.3), b = Math.max(0.02, 0.4 - t * 2.0);
          C.C[i * 3] = r; C.C[i * 3 + 1] = g; C.C[i * 3 + 2] = b;
          C.S[i] = m.s0 * (1 + m.grow * t);
          C.A[i] = m.a0 * (1 - t) ** 1.5 * Math.min(1, t * 10);
        } else if (m.kind === 'spark') {
          C.C[i * 3] = 1; C.C[i * 3 + 1] = 0.75 - t * 0.4; C.C[i * 3 + 2] = 0.3 - t * 0.25;
          C.S[i] = m.s0; C.A[i] = (1 - t);
        } else {
          C.C[i * 3] = m.col[0]; C.C[i * 3 + 1] = m.col[1]; C.C[i * 3 + 2] = m.col[2];
          C.S[i] = m.s0 * (1 + m.grow * t);
          C.A[i] = m.a0 * (1 - t) * Math.min(1, t * 5);
        }
      }
      const g = C.pts.geometry;
      for (const k of ['position', 'psize', 'palpha', 'pcol', 'prot']) g.attributes[k].needsUpdate = true;
      C.pts.material.uniforms.uScreen.value = window.innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    }
    // fire lights: follow the strongest fire sources, flicker
    const fires = this.sources.filter((s) => s.light && (s.kind === 'fire' || s.kind === 'trail'));
    this.lights.forEach((L, i) => {
      const s = fires[i];
      const p = s && s.getPos();
      if (!p) { L.l.intensity = 0; return; }
      L.l.position.set(p.x, p.y + 2, p.z);
      const fl = 0.75 + 0.25 * Math.sin(this.time * 17 + L.flick) * Math.sin(this.time * 7.3 + L.flick * 2);
      L.l.intensity = 700 * s.size / 4 * fl * Math.min(1, (s.dur - s.t) / 10);
    });
    if (this.flashT > 0) { this.flashT -= dt * 1.4; this.flash.intensity *= Math.exp(-dt * 5); if (this.flashT <= 0) this.flash.intensity = 0; }
  }
}
