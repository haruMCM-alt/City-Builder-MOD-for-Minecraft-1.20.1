// Rain: falling streaks around the camera, and drops + wipers on the cab windscreen.
import * as THREE from 'three';

const BOX = new THREE.Vector3(80, 34, 80);   // the volume of streaks that wraps around the camera

/** falling rain streaks, wrapped around the camera in the vertex shader (no per-frame CPU work) */
export class Rain {
  constructor(scene, { count = 9000, night = 0 } = {}) {
    const pos = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2), seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * BOX.x, y = Math.random() * BOX.y, z = Math.random() * BOX.z, s = Math.random();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        seed[i * 2 + k] = s;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.u = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -9, 0) },
      uBox: { value: BOX.clone() }, uAxis: { value: new THREE.Vector2(1, 0) }, uAlong: { value: new THREE.Vector2(0, 0) }, uLat: { value: 0 }, uColor: { value: new THREE.Color(night > 0.5 ? 0x8d97a8 : 0xc8d0d8) },
      uAlpha: { value: night > 0.5 ? 0.22 : 0.3 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `attribute float aEnd; attribute float aSeed;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uVel; uniform vec3 uBox; uniform vec2 uAxis; uniform vec2 uAlong; uniform float uLat;
        varying float vA;
        void main() {
          // each drop falls at a slightly different speed; positions wrap inside a box around the camera
          vec3 v = uVel * (0.85 + 0.3 * aSeed);
          vec3 p = position + v * uTime;
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          // the streak is the drop's motion relative to the camera during ~1/40 s
          p -= v * aEnd * 0.026;
          float d = length(p - uCam);
          // keep it dry inside the train body around the camera (cab / saloon views)
          vec3 rel = p - uCam;
          float al = dot(rel.xz, uAxis), la = dot(rel.xz, vec2(-uAxis.y, uAxis.x));
          float inside = step(uAlong.x, al) * step(al, uAlong.y) * step(abs(la), uLat) * step(-3.5, rel.y) * step(rel.y, 1.5);
          vA = (1.0 - inside) * smoothstep(0.4, 1.5, d) * (1.0 - smoothstep(18.0, 40.0, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main() { gl_FragColor = vec4(uColor, uAlpha * vA); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    scene.add(this.lines);
  }

  /**
   * cam: camera world position; camVel: the camera's own velocity (world, m/s)
   * dry: { axis: Vector2 (train direction, xz), along: [min, max] m from the camera, lat: half width } or null
   */
  update(dt, cam, camVel, dry = null) {
    this.u.uTime.value = (this.u.uTime.value + dt) % 1000;
    this.u.uCam.value.copy(cam);
    // fall at ~9 m/s with a little wind; seen from a moving train the streaks slant back
    this.u.uVel.value.set(-camVel.x + 1.2, -9.0, -camVel.z + 0.6);
    if (dry) { this.u.uAxis.value.copy(dry.axis); this.u.uAlong.value.set(dry.along[0], dry.along[1]); this.u.uLat.value = dry.lat; }
    else this.u.uLat.value = 0;
  }

  dispose() { this.lines.removeFromParent(); this.lines.geometry.dispose(); this.lines.material.dispose(); }
}

/**
 * Raindrops on the cab windscreen and two wipers (drawn into a canvas on a plane just inside the glass).
 * Drops land at a rate set by the rain and the speed, creep up and outwards in the air stream when
 * running fast, and are cleared where a wiper blade sweeps.
 */
export class Windscreen {
  constructor(parent, { x = 9.43, y0 = 2.55, y1 = 3.38, z0 = -1.25, z1 = 1.25 } = {}) {
    this.W = 1024; this.H = Math.round(1024 * (y1 - y0) / (z1 - z0));
    this.c = document.createElement('canvas'); this.c.width = this.W; this.c.height = this.H;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
    // the plane faces the driver (-x); u runs left → right as seen from the seat (+z → -z is right-to-left)
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
    this.mesh.rotation.y = -Math.PI / 2;
    this.mesh.renderOrder = 10;
    parent.add(this.mesh);
    this.drops = [];
    // two wipers pivoting at the bottom of the screen (driver's side and the right-hand pane)
    this.wipers = [{ px: 0.27, len: 0.62 }, { px: 0.77, len: 0.5 }].map((w) => ({ ...w, a: 0, phase: 0 }));
    this.wipeT = 0;
    this.mode = 0;                 // 0 off, 1 intermittent, 2 continuous
    this.acc = 0;
    this.drawT = 0;
    this.onWipe = null;
  }

  /** rate: rain strength 0..1, kmh: train speed, night: dims the drops */
  update(dt, rate, kmh, night = 0) {
    const W = this.W, H = this.H;
    // new drops: more when running (the train runs into the rain)
    this.acc += dt * rate * (60 + kmh * 3.2);
    while (this.acc > 1) {
      this.acc--;
      if (this.drops.length > 700) this.drops.shift();
      this.drops.push({ x: Math.random() * W, y: Math.random() * H, r: 3.5 + Math.random() ** 2.2 * 11, vy: 0, vx: 0, life: 0 });
    }
    // air stream: at speed drops creep up and outwards, merge into trickles
    const push = Math.max(0, kmh - 25) / 60;
    for (const d of this.drops) {
      d.life += dt;
      const big = d.r > 8;
      d.vy = -push * (big ? 55 : 25) + (kmh < 20 && big ? 18 : 0);
      d.vx = (d.x / W - 0.5) * push * 30;
      d.x += d.vx * dt; d.y += d.vy * dt;
    }
    this.drops = this.drops.filter((d) => d.y > -10 && d.y < H + 10 && d.x > -10 && d.x < W + 10);
    // wipers: intermittent in light rain, continuous when it's heavy or when running fast
    this.mode = rate <= 0 ? 0 : (rate > 0.6 || kmh > 50 ? 2 : 1);
    const period = this.mode === 2 ? 1.25 : 4.5;
    if (this.mode) {
      this.wipeT += dt;
      if (this.wipeT > period) { this.wipeT = 0; if (this.onWipe) this.onWipe(); }
    }
    const sweep = 1.2;   // seconds for one there-and-back stroke
    const u = this.mode ? Math.min(1, this.wipeT / sweep) : 1;
    const prevA = this.wipers.map((w) => w.a);
    for (const w of this.wipers) w.a = u >= 1 ? 0 : Math.sin(Math.PI * u) * 1.72;  // rad from horizontal-left
    // clear the drops a blade passed over
    this.wipers.forEach((w, i) => {
      const a0 = Math.min(prevA[i], w.a), a1 = Math.max(prevA[i], w.a);
      if (a1 - a0 < 1e-4) return;
      const px = w.px * W, py = H + 0.04 * H, L = w.len * W;
      this.drops = this.drops.filter((d) => {
        const dx = d.x - px, dy = py - d.y;
        const r = Math.hypot(dx, dy); if (r > L || r < L * 0.18) return true;
        const ang = Math.atan2(dy, -dx);       // 0 = pointing left, π/2 = up
        return !(ang >= a0 - 0.04 && ang <= a1 + 0.04);
      });
    });
    // redraw at ~20 fps
    this.drawT += dt;
    if (this.drawT < 0.05) return;
    this.drawT = 0;
    const g = this.g;
    g.clearRect(0, 0, W, H);
    const k = 1 - 0.55 * night;
    for (const d of this.drops) {
      // a drop is a tiny lens: dark rim, the bright sky refracted into its lower half
      const grd = g.createRadialGradient(d.x, d.y + d.r * 0.35, d.r * 0.1, d.x, d.y, d.r);
      grd.addColorStop(0, `rgba(255,255,255,${0.6 * k})`);
      grd.addColorStop(0.55, `rgba(215,222,230,${0.28 * k})`);
      grd.addColorStop(0.85, `rgba(60,66,72,${0.45 * k})`);
      grd.addColorStop(1, `rgba(20,24,28,${0.6 * k})`);
      g.fillStyle = grd;
      g.beginPath();
      if (d.vy < -5) g.ellipse(d.x, d.y, d.r * 0.8, d.r * 1.25, 0, 0, 7); else g.arc(d.x, d.y, d.r, 0, 7);
      g.fill();
      if (d.vy < -5) { g.fillStyle = `rgba(210,220,230,${0.08 * k})`; g.fillRect(d.x - d.r * 0.3, d.y, d.r * 0.6, Math.min(40, -d.vy)); }
    }
    // a thin wet film left behind each blade
    for (const w of this.wipers) {
      if (w.a <= 0.01) continue;
      const px = w.px * W, py = H + 0.04 * H, L = w.len * W;
      const ex = px - Math.cos(w.a) * L, ey = py - Math.sin(w.a) * L;
      const sx = px - Math.cos(w.a) * L * 0.18, sy = py - Math.sin(w.a) * L * 0.18;
      g.strokeStyle = 'rgba(12,12,14,0.95)'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.lineTo(ex, ey); g.stroke();          // arm
      g.strokeStyle = 'rgba(25,25,28,0.98)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();          // blade
    }
    // parked blades lie along the bottom edge
    for (const w of this.wipers) {
      if (w.a > 0.01) continue;
      const px = w.px * W, py = H - 4;
      g.strokeStyle = 'rgba(12,12,14,0.95)'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px - w.len * W, py); g.stroke();
    }
    this.tex.needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.tex.dispose(); this.mesh.material.dispose(); }
}
