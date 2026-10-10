// Condensation effects driven by lift and humidity:
//   * vortex trails from the wingtips and the outboard flap tips (camera-facing ribbons
//     built from a history of emission points, widening and fading with age)
//   * over-wing vapour: short-lived puffs on the upper surface when the local pressure
//     drop is large (high lift at speed in humid air), streaming aft over the flaps
import * as THREE from 'three';
import { HDR } from './world.js';
import { clamp, smoothstep } from './util.js';

const PTS = 90;           // history points per trail
const DT_EMIT = 0.025;    // s between points

export class Vapor {
  constructor(scene, meta, visual) {
    this.meta = meta; this.visual = visual;
    const src = [meta.wingTipL, meta.wingTipR, meta.flapTipL, meta.flapTipR].filter(Boolean);
    this.trails = src.map((p, i) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(PTS * 2 * 3), a = new Float32Array(PTS * 2);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('va', new THREE.BufferAttribute(a, 1));
      const idx = [];
      for (let k = 0; k < PTS - 1; k++) { const o = k * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this._mat());
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;
      scene.add(mesh);
      return { src: p, isTip: i < 2, mesh, pos, a, hist: [], acc: 0 };
    });
    this.tmp = new THREE.Vector3();
    this.strength = { trail: 0, vapor: 0 };
    this.active = true;
    this._acc = 0;
  }

  _mat() {
    if (this._m) return this._m;
    this._m = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0.9, 0.92, 0.95) }, uLin: HDR.uLin, uGain: HDR.uGain },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float va; varying float vA; varying float vS;
        void main() { vA = va; vS = float(gl_VertexID % 2) * 2.0 - 1.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uCol; uniform float uLin, uGain;
        varying float vA; varying float vS;
        void main() {
          #include <logdepthbuf_fragment>
          float a = vA * (1.0 - vS * vS);        // soft tube cross-section
          if (a < 0.003) discard;
          gl_FragColor = vec4(mix(uCol, pow(uCol, vec3(2.2)) * uGain, uLin), a);
        }`,
    });
    return this._m;
  }

  // humidity 0..1 (weather), light 0..1 (day)
  // only the flown aircraft type leaves trails (one Vapor per type)
  setActive(on) {
    this.active = on;
    for (const tr of this.trails) { tr.mesh.visible = on; if (!on) tr.hist.length = 0; }
  }

  update(dt, fm, { camera, humidity, light, emit }) {
    const o = fm.out;
    const alt = fm.pos.y;
    const hum = clamp(humidity * (1 - smoothstep(2500, 6000, alt)), 0, 1);
    const V = o.tas || 0;
    const aDeg = (o.alpha || 0) * 180 / Math.PI;
    const flaps = clamp((fm.ctl.flapAngle || 0) / 30, 0, 1);   // 0..1 (flaps 30 = 1)
    const lift = clamp((aDeg - 1.5) / 9, 0, 1.4) + flaps * 0.35;
    const onGround = fm.gear.some((g) => g.onGround);
    const trail = onGround ? 0 : hum * hum * smoothstep(0.45, 1.0, lift) * smoothstep(45, 65, V) * (1 - smoothstep(150, 190, V));
    const vapor = onGround ? 0 : Math.pow(hum, 1.5) * smoothstep(0.7, 1.15, lift) * smoothstep(60, 80, V);
    this.strength.trail = trail; this.strength.vapor = vapor;
    const col = this._m.uniforms.uCol.value;
    const k = 0.25 + 0.7 * light;
    col.setRGB(0.92 * k, 0.94 * k, 0.97 * k);

    const mw = this.visual.root.matrixWorld;
    const flex = this.visual.flex || 0;
    const camPos = camera.position;
    for (const tr of this.trails) {
      tr.acc += dt;
      // emission point follows the wing flex (same law as the vertex shader)
      const s = tr.src;
      const span = Math.max(Math.abs(s[2]) - this.visual.flexR, 0);
      const p = this.tmp.set(s[0], s[1] + flex * span * span / this.visual.flexD, s[2]).applyMatrix4(mw);
      const str = tr.isTip ? trail : trail * (0.6 + 0.8 * clamp(flaps * 2, 0, 1));
      while (tr.acc >= DT_EMIT) {
        tr.acc -= DT_EMIT;
        tr.hist.unshift({ x: p.x, y: p.y, z: p.z, age: 0, s: str * (0.8 + 0.4 * Math.random()) });
        if (tr.hist.length > PTS) tr.hist.pop();
      }
      for (const h of tr.hist) { h.age += dt; h.y -= dt * 0.8; }     // the vortex sinks slowly
      const n = tr.hist.length;
      for (let i = 0; i < PTS; i++) {
        const h = tr.hist[Math.min(i, n - 1)];
        if (!h || i >= n) { tr.a[i * 2] = tr.a[i * 2 + 1] = 0; continue; }
        const nx = tr.hist[Math.min(i + 1, n - 1)], pv = tr.hist[Math.max(i - 1, 0)];
        const tx = nx.x - pv.x, ty = nx.y - pv.y, tz = nx.z - pv.z;
        const cx = camPos.x - h.x, cy = camPos.y - h.y, cz = camPos.z - h.z;
        let sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const life = PTS * DT_EMIT;
        const w = (tr.isTip ? 0.25 : 0.4) + h.age * 1.1;
        sx *= w / sl; sy *= w / sl; sz *= w / sl;
        tr.pos.set([h.x - sx, h.y - sy, h.z - sz, h.x + sx, h.y + sy, h.z + sz], i * 6);
        const al = h.s * 0.55 * (1 - h.age / life) * Math.min(1, i / 3);
        tr.a[i * 2] = tr.a[i * 2 + 1] = Math.max(0, al);
      }
      tr.mesh.geometry.attributes.position.needsUpdate = true;
      tr.mesh.geometry.attributes.va.needsUpdate = true;
      tr.mesh.visible = trail > 0.002 || tr.hist.some((h) => h.s > 0.002 && h.age < 2);
    }

    // over-wing vapour puffs (both wings)
    if (vapor > 0.01 && this.meta.wingVapor) {
      this._acc += dt * 260 * vapor;
      const pts = this.meta.wingVapor;
      while (this._acc >= 1) {
        this._acc -= 1;
        const q = pts[Math.floor(Math.random() * pts.length)];
        const side = Math.random() < 0.5 ? 1 : -1;
        const span = Math.max(Math.abs(q[2]) - this.visual.flexR, 0);
        const lp = this.tmp.set(q[0] - Math.random() * 1.5, q[1] + 0.25 + Math.random() * 0.35 + flex * span * span / this.visual.flexD, q[2] * side).applyMatrix4(mw);
        emit({ x: lp.x, y: lp.y, z: lp.z }, { x: fm.vel.x * 0.93, y: fm.vel.y * 0.93, z: fm.vel.z * 0.93 },
          0.18 + Math.random() * 0.2, 1.2 + Math.random() * 0.8, 1.5, 0.3 * vapor);
      }
    }
  }
}
