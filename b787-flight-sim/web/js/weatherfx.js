// Rain: streaks in a box that follows the camera. Each drop falls at ~9 m/s plus the wind,
// seen from the moving camera; streak length = relative speed x shutter time, so at
// approach speed the rain lashes almost horizontally past the windshield.
import * as THREE from 'three';
import { HDR } from './world.js';

const N = 9000;
const BOX = 38;

export class Rain {
  constructor(scene) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    // quad: x in {-0.5, 0.5} = side, y in {-0.5, 0.5} = along the streak
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const off = new Float32Array(N * 3), rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) { off[i * 3] = Math.random(); off[i * 3 + 1] = Math.random(); off[i * 3 + 2] = Math.random(); rnd[i] = Math.random(); }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 1));
    geo.instanceCount = N;
    this.uniforms = {
      uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -9, 0) }, uRel: { value: new THREE.Vector3(0, -9, 0) }, uTime: { value: 0 },
      uAmount: { value: 0 }, uMinDist: { value: 1.0 }, uLight: { value: new THREE.Color(0.6, 0.62, 0.66) },
      uLin: HDR.uLin, uGain: HDR.uGain,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aOff; attribute float aRnd;
        uniform vec3 uCam, uVel, uRel; uniform float uTime, uAmount, uMinDist;
        varying float vA; varying float vX;
        void main() {
          float B = ${BOX.toFixed(1)};
          vec3 v = uVel * (0.85 + 0.3 * aRnd);
          vec3 q = fract(aOff + v * uTime / B + uCam / B) * B - 0.5 * B;   // wraps with the camera
          vec3 head = uCam + q;
          vec3 r = uRel * (0.85 + 0.3 * aRnd);        // motion relative to the camera -> streak
          float speed = length(r);
          vec3 sd = r / max(speed, 1e-3);
          float len = clamp(speed * 0.016, 0.25, 6.0);
          vec3 p = head - sd * len * (position.y + 0.5);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(sd, toCam));
          float d = length(q);
          p += side * position.x * 0.009 * (1.0 + d * 0.02);
          vX = position.x * 2.0;
          vA = uAmount * step(aRnd, uAmount) * smoothstep(uMinDist, uMinDist + 1.5, d) * smoothstep(0.5 * B, 0.3 * B, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uLight; uniform float uLin, uGain;
        varying float vA; varying float vX;
        void main() {
          #include <logdepthbuf_fragment>
          float a = vA * (1.0 - vX * vX) * 0.45;
          if (a < 0.003) discard;
          vec3 c = mix(uLight, pow(uLight, vec3(2.2)) * uGain, uLin);
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // wind: air velocity (world); camVel: camera velocity (world)
  update(dt, { camera, amount, wind, camVel, inside, night }) {
    const u = this.uniforms;
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    u.uTime.value += dt;
    u.uCam.value.copy(camera.position);
    u.uVel.value.set(wind.x, wind.y - 9, wind.z);
    u.uRel.value.set(wind.x - camVel.x, wind.y - 9 - camVel.y, wind.z - camVel.z);
    u.uAmount.value = amount;
    u.uMinDist.value = inside ? 2.2 : 0.6;
    const k = 0.25 + 0.55 * (1 - night);
    u.uLight.value.setRGB(0.62 * k, 0.65 * k, 0.7 * k);
  }
}
