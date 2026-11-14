// Menu: slowly orbiting studio view of the selected train (own small renderer).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TrainSet } from './trainmodel.js';

export class VehiclePreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141a21);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    this.camera = new THREE.PerspectiveCamera(28, canvas.width / canvas.height, 0.5, 300);
    const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
    key.position.set(18, 22, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -26, right: 26, top: 12, bottom: -12, near: 1, far: 80 });
    key.shadow.bias = -0.0005;
    this.scene.add(key, new THREE.HemisphereLight(0xbfd4ff, 0x30302a, 0.4));
    // turntable floor, ballast strip and rails
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(70, 0.25, 3.4), new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 1 }));
    bed.position.y = 0.06; bed.receiveShadow = true;
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9a9894, metalness: 0.9, roughness: 0.35 });
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.9 });
    this.scene.add(floor, bed);
    for (const z of [-0.5335, 0.5335]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(70, 0.16, 0.07), railMat);
      r.position.set(0, 0.26, z); r.castShadow = true;
      this.scene.add(r);
    }
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.16, 2.0), sleeperMat, 116);
    const M = new THREE.Matrix4();
    for (let i = 0; i < 116; i++) { M.makeTranslation(-34.8 + i * 0.6, 0.2, 0); sl.setMatrixAt(i, M); }
    sl.receiveShadow = true;
    this.scene.add(sl);
    this.t = 0;
    this.running = false;
    this.last = 0;
  }

  setVehicle(gltfScene, veh, key) {
    if (this.train) { this.train.dispose(); this.train = null; }
    if (!gltfScene) return;
    const destType = veh.id === 's115' || veh.id === 's211' ? 'roll' : 'led';
    this.train = new TrainSet(gltfScene, veh, 'CP', { key, dest: '普通 宇都宮', destType, passengers: true });
    // lay the cars along +x: the leading cab nose at x = +10
    this.train.cars.forEach((c, i) => {
      c.position.set(-i * 20, 0.25, 0);
      c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    });
    this.scene.add(this.train.group);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (now - this.last < 33) return;      // ~30 fps is plenty for a menu
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      const a = 0.55 + Math.sin(this.t * 0.12) * 0.75;   // swing between a 3/4 front and a side view
      const target = new THREE.Vector3(3.0, 2.0, 0);
      this.camera.position.set(target.x + Math.cos(a) * 16, 2.4 + Math.sin(this.t * 0.07) * 0.5, target.z + Math.sin(a) * 16);
      this.camera.lookAt(target);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
}
