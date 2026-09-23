// Visual 787-9: animates the Blender-built model from the flight model state.
import * as THREE from 'three';
import { DEG, clamp, lerp, smoothstep } from './util.js';
import { glowTexture, HDR } from './world.js';
import { liveryUniforms, patchLiveryShader, liveryAssets, setLiveryUniforms } from './livery.js';

const COCKPIT_PARTS = ['CockpitShell', 'CockpitInterior', 'HUD_Combiner', 'Throttle_L', 'Throttle_R', 'Yoke_L', 'Yoke_R',
  'Display_PFD_L', 'Display_ND_L', 'Display_EICAS', 'Display_ND_R', 'Display_PFD_R'];

const LIGHTS = {
  NavLight_L: { color: 0xff2020, kind: 'nav', size: 1.6 },
  NavLight_R: { color: 0x20ff50, kind: 'nav', size: 1.6 },
  NavTail_L: { color: 0xffffff, kind: 'nav', size: 1.1 },
  NavTail_R: { color: 0xffffff, kind: 'nav', size: 1.1 },
  Strobe_L: { color: 0xffffff, kind: 'strobe', size: 5.0 },
  Strobe_R: { color: 0xffffff, kind: 'strobe', size: 5.0 },
  Strobe_Tail: { color: 0xffffff, kind: 'strobe', size: 4.0 },
  Beacon_Top: { color: 0xff2010, kind: 'beacon', size: 3.0 },
  Beacon_Bottom: { color: 0xff2010, kind: 'beacon', size: 3.0 },
  LandingLight_L: { color: 0xfff4e0, kind: 'landing', size: 4.0 },
  LandingLight_R: { color: 0xfff4e0, kind: 'landing', size: 4.0 },
  TurnoffLight_L: { color: 0xfff4e0, kind: 'taxi', size: 2.4 },
  TurnoffLight_R: { color: 0xfff4e0, kind: 'taxi', size: 2.4 },
  LogoLight_L: { color: 0xfff4e0, kind: 'logo', size: 0.8 },
  LogoLight_R: { color: 0xfff4e0, kind: 'logo', size: 0.8 },
};

export class AircraftVisual {
  constructor(gltf, meta, scene, quality) {
    this.meta = meta;
    this.scene = scene;
    this.root = gltf.scene;
    this.quality = quality;
    this.flexUniforms = {
      uFlex: { value: 0 }, uRootInv: { value: new THREE.Matrix4() }, uRootUp: { value: new THREE.Vector3(0, 1, 0) },
    };
    this.flex = 0; this.flexVel = 0;
    this.livU = meta.livery ? liveryUniforms(meta.livery) : null;
    this.parts = {};
    for (const p of meta.parts) {
      const o = this.root.getObjectByName(p.name);
      if (!o) continue;
      this.parts[p.name] = { obj: o, rest: o.quaternion.clone(), pos: o.position.clone(), info: p };
    }
    this.wheelParts = meta.parts.filter((p) => p.kind === 'wheel').map((p) => [p.name, p.gear]);
    const wr = (g) => (meta.parts.find((p) => p.kind === 'wheel' && p.gear === g) || { radius: 0.6 }).radius;
    this.wheelR = [wr(0), wr(1)];
    this.cockpit = COCKPIT_PARTS.map((n) => this.root.getObjectByName(n)).filter(Boolean);
    // wings get their own copy of the wing paint so the baked AO (wing UVs) is not
    // applied to the tailplane, pylons and fairings that share the material
    this.wingAOMats = [];
    for (const n of ['Wing_L', 'Wing_R']) {
      const w = this.root.getObjectByName(n);
      if (!w) continue;
      w.traverse((o) => {
        if (!o.isMesh) return;
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        const out = arr.map((m) => {
          if (m.name !== 'B787_WingPaint') return m;
          if (!this._wingClone) { this._wingClone = m.clone(); this.wingAOMats.push(this._wingClone); }
          return this._wingClone;
        });
        o.material = Array.isArray(o.material) ? out : out[0];
      });
    }
    this.fuselageMats = [];
    this.displayMats = {};
    this.lightMats = {};
    const self = this;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = quality !== 'low';
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || m.userData.prepared) continue;
        m.userData.prepared = true;
        if (m.map) m.map.anisotropy = 8;
        m.envMapIntensity = 1.0;
        if (m.name === 'Cockpit_Shell') {
          m.alphaTest = 0.5; m.transparent = false; m.side = THREE.FrontSide;
          m.color.setScalar(0.45); m.envMapIntensity = 0.15;
          continue;
        }
        if (m.name.startsWith('Cockpit_')) { m.envMapIntensity = 0.25; }
        if (m.name === 'HUD_Glass') { m.opacity = 0.02; m.depthWrite = false; m.envMapIntensity = 0.05; }
        if (m.name === 'Cockpit_Panel') { m.color.set(0x16181b); m.envMapIntensity = 0.08; m.roughness = 0.95; }   // anti-glare
        if (m.name.startsWith('Display_')) { this.displayMats[m.name.slice(8)] = m; continue; }
        if (m.name.startsWith('Cockpit_') || m.name === 'HUD_Glass') continue;
        if (['B787_Strobe', 'B787_Beacon', 'B787_LandingLight', 'B787_LightRed', 'B787_LightGreen', 'B787_LightWhite'].includes(m.name)) {
          this.lightMats[m.name] = m;
          m.emissive = new THREE.Color(m.color);
        }
        if (m.name === 'B787_Fuselage') { this.fuselageMat = m; this.fuselageMats.push(m); m.emissive = new THREE.Color(1, 1, 1); }
        // wing flex: bend everything outboard of the fuselage side
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, self.flexUniforms);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
uniform float uFlex; uniform mat4 uRootInv; uniform vec3 uRootUp;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 wpF = modelMatrix * vec4(transformed, 1.0);
  vec3 lp = (uRootInv * wpF).xyz;
  float span = max(abs(lp.z) - 3.0, 0.0);
  float fl = uFlex * span * span / 729.0 * step(-15.5, lp.x);
  transformed += inverse(mat3(modelMatrix)) * (uRootUp * fl);
}`);
          if (m.name === 'B787_Fuselage' && self.livU) patchLiveryShader(sh, self.livU, '(uRootInv * modelMatrix * vec4(position, 1.0)).xyz');
        };
        m.customProgramCacheKey = () => (m.name === 'B787_Fuselage' ? 'flex-livery' : 'flex');
        if (m.name === 'B787_Tail') this.tailMat = m;
        if (m.name === 'B787_Navy' || m.name === 'B787_Nacelle') (this.paintMats ||= []).push(m);
      }
    });
    // glow sprites for the aircraft lights
    const gt = glowTexture();
    this.lights = [];
    for (const [name, L] of Object.entries(LIGHTS)) {
      const o = this.root.getObjectByName(name);
      if (!o) continue;
      const sm = new THREE.SpriteMaterial({ map: gt, color: L.color, blending: THREE.AdditiveBlending, depthWrite: false,
        transparent: true, fog: false });
      sm.toneMapped = false;
      const sp = new THREE.Sprite(sm);
      // put the sprite at the mesh centre
      const box = new THREE.Box3().setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      o.updateWorldMatrix(true, false);
      sp.position.copy(o.worldToLocal(c.clone()));
      o.add(sp);
      // the light meshes bend with the wing in the vertex shader; the glow sprite follows in JS
      const lp = c.clone().applyMatrix4(this.root.matrixWorld.clone().invert());
      const span = Math.max(Math.abs(lp.z) - 3.0, 0);
      const flexK = lp.x > -15.5 ? span * span / 729 : 0;
      this.lights.push({ name, obj: o, sprite: sp, ...L, intensity: 0, base: sp.position.clone(), flexK });
    }
    // landing / taxi spotlights
    this.spots = [];
    const mk = (pos, target, angle, intensity) => {
      const s = new THREE.SpotLight(0xfff1dc, 0, 2200, angle, 0.45, 2.0);   // physical fall-off
      s.position.set(...pos);
      s.target.position.set(...target);
      this.root.add(s, s.target);
      s.userData.max = intensity;
      this.spots.push(s);
      return s;
    };
    const eyeX = meta.eye[0];
    // scene units: sun ~3.4 = ~100 klx, so a 600 W landing light is a few thousand units
    mk([8, -2.2, -3.5], [300, -30, -8], 0.16, 2500);
    mk([8, -2.2, 3.5], [300, -30, 8], 0.16, 2500);
    this.taxiSpot = mk([eyeX - 3.5, -3.2, 0], [80, -9, 0], 0.5, 180);
    scene.add(this.root);
    // particles (tyre smoke, contrails)
    this._initParticles();
    this.lightsOn = { nav: true, beacon: true, strobe: false, landing: false, taxi: false, logo: true };
    this.cockpitVisible = true;
  }

  setAO(fus, wing) {
    const apply = (m, t) => { if (!t) return; m.aoMap = t; m.aoMapIntensity = 1.0; m.needsUpdate = true; };
    for (const m of this.fuselageMats) apply(m, fus);
    for (const m of this.wingAOMats) apply(m, wing);
  }

  // airline name + logo (see livery.js)
  setLivery(liv) {
    if (!this.livU) return;
    const a = liveryAssets(liv, this.meta.livery, true);
    setLiveryUniforms(this.livU, a);
    if (this.tailMat) { this.tailMat.map = a.tail; this.tailMat.color.set(0xffffff); this.tailMat.needsUpdate = true; }
    for (const m of this.paintMats || []) m.color.setRGB(a.prim.x, a.prim.y, a.prim.z, THREE.LinearSRGBColorSpace);
  }

  setDisplayTextures(textures) {
    for (const [name, tex] of Object.entries(textures)) {
      const m = this.displayMats[name];
      if (!m) continue;
      m.map = null;
      m.color.set(0x000000);
      m.emissive = new THREE.Color(1, 1, 1);
      m.emissiveMap = tex;
      m.emissiveIntensity = 1.2;
      m.toneMapped = false;
      m.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  _initParticles() {
    const tex = glowTexture();
    const N = 600;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pSize = new Float32Array(N);
    this.pAlpha = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.pAlpha, 1));
    this.pMeta = Array.from({ length: N }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 }));
    this.pNext = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uScreen: { value: 800 }, uCol: { value: new THREE.Color(0.9, 0.9, 0.92) }, uLin: HDR.uLin, uGain: HDR.uGain },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float psize; attribute float palpha; uniform float uScreen; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(psize * uScreen / max(-mv.z,0.1), 0.0, 400.0);
          vA = palpha; gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D uMap; uniform vec3 uCol; varying float vA; uniform float uLin, uGain;
        void main(){
          #include <logdepthbuf_fragment>
          float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(mix(uCol, pow(uCol, vec3(2.2)) * uGain, uLin), a); }`,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  emit(p, v, life, size, grow, alpha = 0.6) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % this.pMeta.length;
    const m = this.pMeta[i];
    m.life = life; m.max = life; m.vx = v.x; m.vy = v.y; m.vz = v.z; m.grow = grow; m.a0 = alpha; m.s0 = size;
    this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
  }

  _updateParticles(dt, camera) {
    for (let i = 0; i < this.pMeta.length; i++) {
      const m = this.pMeta[i];
      if (m.life <= 0) { this.pAlpha[i] = 0; continue; }
      m.life -= dt;
      const t = 1 - m.life / m.max;
      this.pPos[i * 3] += m.vx * dt; this.pPos[i * 3 + 1] += m.vy * dt; this.pPos[i * 3 + 2] += m.vz * dt;
      m.vx *= 1 - dt * 0.6; m.vz *= 1 - dt * 0.6; m.vy *= 1 - dt * 0.6;
      this.pSize[i] = m.s0 * (1 + m.grow * t);
      this.pAlpha[i] = m.a0 * (1 - t) * Math.min(1, t * 8);
    }
    const g = this.particles.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
    g.attributes.palpha.needsUpdate = true;
    this.particles.material.uniforms.uScreen.value = window.innerHeight / (2 * Math.tan(camera.fov * DEG / 2));
  }

  // ---------------------------------------------------------------------------
  setPart(name, angleRad) {
    const p = this.parts[name];
    if (!p) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleRad);
    p.obj.quaternion.copy(p.rest).multiply(q);
  }

  update(dt, fm, sys, env) {
    const ctl = fm.ctl;
    // ---- place the model: physics CG -> model origin ------------------------
    const q = new THREE.Quaternion(fm.q.x, fm.q.y, fm.q.z, fm.q.w);
    const off = new THREE.Vector3(fm.cgOffset.x, fm.cgOffset.y, fm.cgOffset.z).applyQuaternion(q);
    this.root.position.set(fm.pos.x - off.x, fm.pos.y - off.y, fm.pos.z - off.z);
    this.root.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    this.flexUniforms.uRootInv.value.copy(this.root.matrixWorld).invert();
    this.flexUniforms.uRootUp.value.set(0, 1, 0).applyQuaternion(q);
    // ---- wing flex (spring-damper driven by wing lift) ----------------------
    const lift = fm.out.liftN || 0;
    const target = 2.6 * clamp(lift / (fm.mass * 9.81), -0.6, 2.6) - 0.15;
    const acc = 14 * (target - this.flex) - 2.2 * this.flexVel;
    this.flexVel += acc * dt;
    this.flex += this.flexVel * dt;
    this.flexUniforms.uFlex.value = this.flex;
    // ---- surfaces ----------------------------------------------------------------
    const fa = ctl.flapAngle;
    const ail = ctl.aileron;                       // + right roll
    const flapDeg = fa * 1.1;
    this.setPart('FlapInbd_L', flapDeg * DEG); this.setPart('FlapInbd_R', flapDeg * DEG);
    this.setPart('FlapOutbd_L', flapDeg * DEG); this.setPart('FlapOutbd_R', flapDeg * DEG);
    const droop = Math.min(fa * 0.55, 18) * DEG;
    this.setPart('Flaperon_L', clamp(droop + ail * 0.8, -20 * DEG, 30 * DEG));
    this.setPart('Flaperon_R', clamp(droop - ail * 0.8, -20 * DEG, 30 * DEG));
    const aDroop = Math.min(fa * 0.2, 5) * DEG;
    this.setPart('Aileron_L', clamp(aDroop + ail, -25 * DEG, 25 * DEG));
    this.setPart('Aileron_R', clamp(aDroop - ail, -25 * DEG, 25 * DEG));
    const sbDeg = ctl.speedbrake * 32 + ctl.groundSpoiler * 60;
    const rs = ctl.rollSpoiler;
    for (let i = 1; i <= 7; i++) {
      const rollL = Math.max(0, -rs - 0.15) * 38 * (i >= 3 ? 1 : 0.3);
      const rollR = Math.max(0, rs - 0.15) * 38 * (i >= 3 ? 1 : 0.3);
      this.setPart('Spoiler' + i + '_L', Math.min(60, sbDeg + rollL) * DEG);
      this.setPart('Spoiler' + i + '_R', Math.min(60, sbDeg + rollR) * DEG);
    }
    for (let i = 1; i <= 6; i++) {
      const s = ctl.slat * 22 * DEG;
      this.setPart('Slat' + i + '_L', s); this.setPart('Slat' + i + '_R', s);
    }
    this.setPart('HStab', -ctl.stab * 0.6);
    this.setPart('Elevator_L', ctl.elevator); this.setPart('Elevator_R', ctl.elevator);
    this.setPart('Rudder', ctl.rudder);
    // ---- gear: doors open in transit, legs swing, struts compress ------------------
    const gp = ctl.gearPos;
    const legT = smoothstep(0.18, 0.86, gp);
    const doorT = gp <= 0.001 ? 0 : clamp(Math.min(gp / 0.16, (1 - gp) / 0.12), 0, 1);
    this.setPart('NoseGear', legT * 100 * DEG);
    this.setPart('MainGear_L', legT * 90 * DEG);
    this.setPart('MainGear_R', legT * 90 * DEG);
    this.setPart('NoseDoor_L', doorT * 88 * DEG); this.setPart('NoseDoor_R', doorT * 88 * DEG);
    this.setPart('MainDoor_L', doorT * 85 * DEG); this.setPart('MainDoor_R', doorT * 85 * DEG);
    const gearVis = gp < 0.97;
    const strut = [['NoseGear', fm.gear[0]], ['MainGear_L', fm.gear[1]], ['MainGear_R', fm.gear[2]]];
    // main gear: in the last part of the swing the leg also moves up / inboard so the
    // bogie (axles vertical, tyres flat) tucks into the belly wheel well instead of
    // poking out beside the fuselage
    const stow = smoothstep(0.55, 1.0, legT);
    for (const [n, g] of strut) {
      const p = this.parts[n];
      if (!p) continue;
      p.obj.visible = gearVis;
      const ext = gp < 0.05 ? (g.compression - fm.gearExt) : 0;
      p.obj.position.copy(p.pos);
      p.obj.position.y += ext;
      if (n !== 'NoseGear') {
        p.obj.position.y += 0.55 * stow;
        p.obj.position.z -= Math.sign(p.pos.z) * 1.0 * stow;
      }
    }
    // ---- wheels roll with the ground speed, spin down after lift-off ----------------
    const fwd = this._fwd || (this._fwd = new THREE.Vector3());
    fwd.set(1, 0, 0).applyQuaternion(this.root.quaternion);
    const vFwd = fm.vel.x * fwd.x + fm.vel.y * fwd.y + fm.vel.z * fwd.z;
    this.wheelW = this.wheelW || [0, 0, 0];
    this.wheelA = this.wheelA || [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const g = fm.gear[i];
      const R = i === 0 ? this.wheelR[0] : this.wheelR[1];
      if (g.onGround) this.wheelW[i] = vFwd / R;
      else this.wheelW[i] *= Math.exp(-dt * (gp > 0.02 ? 2.5 : 0.25));   // brakes on retraction
      // cap the visual rate so fast rotation does not alias into a backwards spin
      const w = clamp(this.wheelW[i], -2 * Math.PI * 9, 2 * Math.PI * 9);
      this.wheelA[i] = (this.wheelA[i] + w * dt) % (Math.PI * 2);
    }
    for (const [name, i] of this.wheelParts) this.setPart(name, this.wheelA[i]);
    // ---- engines -------------------------------------------------------------------
    this.fanAngle = (this.fanAngle || [0, 0]);
    for (let i = 0; i < 2; i++) {
      const rps = fm.engines[i].n1 / 100 * 7.5;      // visual rate (avoids wagon-wheel aliasing)
      this.fanAngle[i] = (this.fanAngle[i] + rps * dt * Math.PI * 2) % (Math.PI * 2);
      this.setPart(i === 0 ? 'Fan_L' : 'Fan_R', this.fanAngle[i]);
    }
    // cockpit levers
    this.setPart('Throttle_L', (sys.tla[0] * 32 - 8) * DEG);
    this.setPart('Throttle_R', (sys.tla[1] * 32 - 8) * DEG);
    this.setPart('Yoke_L', -sys.pilot.pitch * 9 * DEG);
    this.setPart('Yoke_R', -sys.pilot.pitch * 9 * DEG);
    // ---- lights --------------------------------------------------------------------
    const t = fm.time;
    const L = this.lightsOn;
    const night = env.night;
    const strobe = L.strobe && ((t % 1.25) < 0.05 || ((t % 1.25) > 0.12 && (t % 1.25) < 0.17));
    const beacon = L.beacon && (t % 1.1) < 0.18;
    const camPos = env.camera.position;
    for (const l of this.lights) {
      let on = 0;
      if (l.kind === 'nav') on = L.nav ? 1 : 0;
      else if (l.kind === 'strobe') on = strobe ? 1 : 0;
      else if (l.kind === 'beacon') on = beacon ? 1 : 0;
      else if (l.kind === 'landing') on = L.landing ? 1 : 0;
      else if (l.kind === 'taxi') on = L.taxi ? 1 : 0;
      else if (l.kind === 'logo') on = L.logo && night > 0.2 ? 1 : 0;
      l.sprite.position.copy(l.base);
      l.sprite.position.y += this.flex * l.flexK;
      const wp = l.sprite.getWorldPosition(new THREE.Vector3());
      const d = wp.distanceTo(camPos);
      const s = l.size * (0.35 + d * 0.004) * lerp(0.55, 1.0, night);
      l.sprite.scale.set(s, s, s);
      l.sprite.material.opacity = on * lerp(l.kind === 'strobe' ? 0.9 : 0.35, 1.0, night);
      l.sprite.visible = on > 0 && d > 2;
    }
    const lm = this.lightMats;
    if (lm.B787_Strobe) lm.B787_Strobe.emissiveIntensity = strobe ? 20 : 0;
    if (lm.B787_Beacon) lm.B787_Beacon.emissiveIntensity = beacon ? 12 : 0.2;
    if (lm.B787_LandingLight) lm.B787_LandingLight.emissiveIntensity = (L.landing || L.taxi) ? 12 : 0;
    if (lm.B787_LightRed) lm.B787_LightRed.emissiveIntensity = L.nav ? 6 : 0;
    if (lm.B787_LightGreen) lm.B787_LightGreen.emissiveIntensity = L.nav ? 6 : 0;
    for (const s of this.spots) {
      const on = s === this.taxiSpot ? (L.taxi && ctl.gearPos < 0.1) : L.landing;
      s.intensity = on ? s.userData.max * (0.25 + 0.75 * night) : 0;
      s.visible = on && night > 0.05;
    }
    for (const fm_ of this.fuselageMats) fm_.emissiveIntensity = night * 1.3;
    // ---- cockpit interior only when close ------------------------------------------
    const dCam = camPos.distanceTo(this.root.position);
    const wantCockpit = env.cockpitView || dCam < 45;
    if (wantCockpit !== this.cockpitVisible) {
      this.cockpitVisible = wantCockpit;
      for (const o of this.cockpit) o.visible = wantCockpit;
    }
    // ---- particles: tyre smoke on touchdown, contrails at altitude -------------------
    for (const e of env.events || []) {
      if (e.type === 'touchdown') {
        const n = clamp(Math.round(-e.vs * 12 + 10), 10, 60);
        for (const g of [fm.gear[1], fm.gear[2]]) {
          const wp = new THREE.Vector3(g.p.x, g.p.y, g.p.z).applyQuaternion(q).add(new THREE.Vector3(fm.pos.x, fm.pos.y, fm.pos.z));
          for (let k = 0; k < n; k++) {
            this.emit({ x: wp.x + (Math.random() - 0.5) * 2, y: wp.y + 0.5, z: wp.z + (Math.random() - 0.5) * 2 },
              { x: fm.vel.x * 0.25 + (Math.random() - 0.5) * 3, y: Math.random() * 2, z: fm.vel.z * 0.25 + (Math.random() - 0.5) * 3 },
              2.5 + Math.random() * 2, 3, 5, 0.5);
          }
        }
      }
    }
    if (fm.pos.y > 8000 && fm.out.atm && fm.out.atm.T < 233) {
      this._contrail = (this._contrail || 0) + dt;
      if (this._contrail > 0.03) {
        this._contrail = 0;
        for (const ax of [this.meta.engineAxisL, this.meta.engineAxisR]) {
          const wp = new THREE.Vector3(ax[0] - 30, ax[1], ax[2]).applyMatrix4(this.root.matrixWorld);
          this.emit(wp, { x: 0, y: 0, z: 0 }, 25, 5, 8, 0.35);
        }
      }
    }
    this._updateParticles(dt, env.camera);
  }
}
