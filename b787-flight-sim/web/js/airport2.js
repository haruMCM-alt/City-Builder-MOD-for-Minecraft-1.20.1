// Second airport, ~200 km east of the main one (terrain flat zone: TERRAIN.flat2).
// A single 3000 m runway 09/27, parallel taxiway, apron with seven nose-in stands, terminal,
// control tower and hangar, runway / approach / taxiway lights.  Built here from the world
// materials (the Blender world only covers the home airport and city); the AI traffic flies
// between both airports (traffic.js, "route" states).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { textSign, signTexts } from './signs.js';

export const A2 = {
  x: 200000, z: -9000, len: 3000, wid: 45,
  twyZ: -170, laneZ: -240, apronZ: [-410, -190], apronX: [-450, 450],
  standZ: -365, stands: [-360, -240, -120, 0, 120, 240, 360],
  conns: [-1480, 0, 1480],
  term: { x: [-470, 470], z: [-470, -410], h: 18 },
  tower: { x: 600, z: -440, h: 50 },
  hangar: { x: [700, 880], z: [-400, -280], h: 25 },
};
// ------------------------------------------------------------------ town around the airport
// Deterministic layout (same buildings for geometry, collision boxes and street lights):
// 120 m blocks north and south of the airport, a denser centre north-west of the terminal,
// nothing inside the airport fence or under the approach / departure corridors.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let _town = null;
export function townLayout() {
  if (_town) return _town;
  const R = rng(20250925), B = 120, road = 18;
  const bld = [], roads = [], lamps = [];
  const inAirport = (x, z) => x > -2100 && x < 2100 && z > -560 && z < 380;
  const inCorridor = (x, z) => Math.abs(z) < 700 && Math.abs(x) > 1500;
  const centre = [-1300, -1900];
  for (let gx = -5400; gx < 5400; gx += B) {
    for (let gz = -4200; gz < 3000; gz += B) {
      const x0 = gx + road / 2, x1 = gx + B - road / 2, z0 = gz + road / 2, z1 = gz + B - road / 2;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (inAirport(cx, cz) || inCorridor(cx, cz)) continue;
      const d = Math.hypot(cx - centre[0], cz - centre[1]);
      const dens = Math.exp(-d / 1700);
      if (R() > 0.25 + 0.75 * dens + (d < 3200 ? 0.2 : 0)) continue;       // sparser towards the edges
      roads.push([gx, gz]);
      if (R() < 0.08) continue;                                            // a park
      const lots = dens > 0.45 && R() < 0.5 ? 1 : 2 + Math.floor(R() * 3);
      for (let k = 0; k < lots; k++) {
        const wx = (x1 - x0) / (lots > 2 ? 2 : lots), wz = lots > 2 ? (z1 - z0) / 2 : z1 - z0;
        const lx = x0 + (k % 2) * wx, lz = z0 + (lots > 2 ? Math.floor(k / 2) * wz : 0);
        const ins = 4 + R() * 6;
        const h = Math.min(8 + (R() ** 2) * 30 + dens * dens * 90 * R(), Math.abs(cz) < 1400 ? 35 : 140);
        const style = h > 45 ? ['glass', 'glass2', 'office'][Math.floor(R() * 3)] : h > 18 ? ['office', 'resid', 'concrete'][Math.floor(R() * 3)] : ['resid', 'brick'][Math.floor(R() * 2)];
        bld.push({ x0: lx + ins, z0: lz + ins, x1: lx + wx - ins, z1: lz + wz - ins, h: Math.round(h / 3.2) * 3.2 || 6.4, style });
      }
      lamps.push([gx + B / 2, gz + 2], [gx + 2, gz + B / 2]);
    }
  }
  _town = { bld, roads, B, road, lamps };
  return _town;
}

// collision boxes (three.js x0, z0, x1, z1, top) for obstacles.js
export function airport2Obstacles() {
  const b = (x0, z0, x1, z1, h) => [A2.x + x0, A2.z + z0, A2.x + x1, A2.z + z1, h];
  return [...townLayout().bld.flatMap((t) => b(t.x0, t.z0, t.x1, t.z1, t.h)),
    b(A2.term.x[0], A2.term.z[0], A2.term.x[1], A2.term.z[1], A2.term.h),
    b(A2.tower.x - 8, A2.tower.z - 8, A2.tower.x + 8, A2.tower.z + 8, A2.tower.h + 8),
    b(A2.hangar.x[0], A2.hangar.z[0], A2.hangar.x[1], A2.hangar.z[1], A2.hangar.h)].flat();
}

// light groups in the world.json format (World.buildLights), absolute coordinates
export function airport2Lights() {
  const L = {};
  const g = (name, color, size, kind, pts) => { L[name] = { color, size, kind, pos: pts.flat() }; };
  const X = (dx) => A2.x + dx, Z = (dz) => A2.z + dz, h = A2.len / 2;
  const edge = [], cl = [], thr = [], end = [], als = [], twy = [], flood = [], obst = [];
  for (let d = -h; d <= h + 0.1; d += 60) { edge.push([X(d), 0.4, Z(24)], [X(d), 0.4, Z(-24)]); }
  for (let d = -h + 15; d < h; d += 30) cl.push([X(d), 0.1, Z(0)]);
  for (let k = -20; k <= 20; k += 4) { thr.push([X(-h - 1), 0.4, Z(k)]); end.push([X(h + 1), 0.4, Z(k)]); }
  // approach lights for runway 09 (from the west): centre row + crossbars
  for (let d = 60; d <= 900; d += 30) {
    als.push([X(-h - d), 0.8, Z(0)]);
    if (d % 150 === 0) for (const k of [-12, -8, -4, 4, 8, 12]) als.push([X(-h - d), 0.8, Z(k)]);
  }
  for (let d = -h; d <= h; d += 60) twy.push([X(d), 0.3, Z(A2.twyZ - 13)], [X(d), 0.3, Z(A2.twyZ + 13)]);
  for (const c of A2.conns) for (let z = A2.twyZ; z < -30; z += 30) twy.push([X(c - 13), 0.3, Z(z)], [X(c + 13), 0.3, Z(z)]);
  for (let x = A2.apronX[0]; x <= A2.apronX[1]; x += 150) flood.push([X(x), 22, Z(A2.apronZ[0] + 6)]);
  obst.push([X(A2.tower.x), A2.tower.h + 9, Z(A2.tower.z)], [X((A2.hangar.x[0] + A2.hangar.x[1]) / 2), A2.hangar.h + 1, Z(A2.hangar.z[0])]);
  g('a2_rwy_edge', '#fff6dc', 1.6, 'steady', edge);
  g('a2_rwy_cl', '#ffffff', 1.0, 'steady', cl);
  g('a2_rwy_threshold', '#3cff6a', 1.8, 'steady', thr);
  g('a2_rwy_end', '#ff2a1a', 1.6, 'steady', end);
  g('a2_als', '#fff3d0', 2.2, 'steady', als);
  g('a2_twy_edge', '#3a7bff', 1.0, 'steady', twy);
  g('a2_apron_flood', '#ffe2b0', 6.0, 'steady', flood);
  g('a2_obstruction', '#ff1a1a', 3.0, 'blink', obst.concat(townLayout().bld.filter((t) => t.h > 45).map((t) => [X((t.x0 + t.x1) / 2), t.h + 0.5, Z((t.z0 + t.z1) / 2)])));
  g('a2_street', '#ffc27a', 2.2, 'steady', townLayout().lamps.map(([x, z]) => [X(x), 9, Z(z)]));
  return L;
}

// ------------------------------------------------------------------ geometry helpers (local metres)
function rectGeo(x0, z0, x1, z1, y = 0, uvScale = 25) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const P = g.getAttribute('position'), U = g.getAttribute('uv');
  for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) / uvScale, -P.getZ(i) / uvScale);
  return g;
}

// walls with facade UVs (u along the wall / tile width, v up / tile height) + flat roof
function buildingGeo(x0, z0, x1, z1, h, tw, th) {
  const walls = [], c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    const L = Math.hypot(bx - ax, bz - az);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([ax, 0, az, bx, 0, bz, bx, h, bz, ax, h, az], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L / tw, 0, L / tw, h / th, 0, h / th], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    walls.push(g);
  }
  const wall = mergeGeometries(walls);          // (0, 2, 1) winding faces outwards for this corner order
  return { wall, roof: rectGeo(x0, z0, x1, z1, h, 20) };
}

function findMaterials(root) {
  const M = {};
  root?.traverse((o) => { if (o.isMesh && o.material && !M[o.material.name]) M[o.material.name] = o.material; });
  const fb = (name, color, rough = 0.8) => M[name] || new THREE.MeshStandardMaterial({ name, color, roughness: rough });
  return {
    asphalt: fb('W_Asphalt', 0x3b3d40, 0.9), taxi: fb('W_TaxiAsphalt', 0x404246, 0.9), concrete: fb('W_Concrete', 0xa9a9a4, 0.85),
    shoulder: fb('W_Shoulder', 0x6f6f6a, 0.9), white: fb('W_MarkWhite', 0xf2f2ee, 0.7), yellow: fb('W_MarkYellow', 0xe8b923, 0.7),
    facade: fb('W_facade_terminal', 0xb8c4cc, 0.4), roof: fb('W_Roof', 0x8d9096, 0.8), glass: fb('W_GlassTower', 0x6d8aa0, 0.1),
    paint: fb('W_PaintWhite', 0xe8e8e4, 0.6), metal: fb('W_MetalPanel', 0xb9bec4, 0.5), door: fb('W_HangarDoor', 0x8e959c, 0.5),
    office: fb('W_facade_office', 0xb0b8c0, 0.5),
    f_glass: fb('W_facade_glass', 0x8fa8bb, 0.2), f_glass2: fb('W_facade_glass2', 0x7f98ab, 0.2), f_office: fb('W_facade_office', 0xb0b8c0, 0.5),
    f_resid: fb('W_facade_resid', 0xd8d0c0, 0.7), f_brick: fb('W_facade_brick', 0xa0664a, 0.8), f_concrete: fb('W_facade_concrete', 0xb5b2aa, 0.8),
    road: fb('W_Road', 0x3c3e42, 0.9), grass: fb('W_ParkGrass', 0x4f7a35, 0.95),
  };
}

export class Airport2 {
  constructor(scene, worldRoot, name) {
    this.group = new THREE.Group();
    this.group.position.set(A2.x, 0, A2.z);
    this.group.name = 'Airport2';
    scene.add(this.group);
    this.M = findMaterials(worldRoot);
    this._build();
    this.signs = new THREE.Group();
    this.group.add(this.signs);
    this.setName(name);
  }

  _add(geo, mat, shadow = false) {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.castShadow = shadow;
    this.group.add(m);
    return m;
  }

  _build() {
    const M = this.M, h = A2.len / 2, w = A2.wid / 2;
    // pavement: runway (+ shoulders), taxiway, connectors, apron
    this._add(mergeGeometries([rectGeo(-h - 60, -w - 7.5, h + 60, w + 7.5, 0.10)]), M.shoulder);
    this._add(rectGeo(-h, -w, h, w, 0.12), M.asphalt);
    const twy = [rectGeo(-h - 30, A2.twyZ - 11.5, h + 30, A2.twyZ + 11.5, 0.11)];
    for (const c of A2.conns) twy.push(rectGeo(c - 11.5, A2.twyZ + 11.5, c + 11.5, -w - 7.5, 0.105));
    twy.push(rectGeo(-h - 30, A2.twyZ, -h - 7, 0, 0.104), rectGeo(h + 7, A2.twyZ, h + 30, 0, 0.104));   // end turn-offs
    this._add(mergeGeometries(twy), M.taxi);
    this._add(rectGeo(A2.apronX[0], A2.apronZ[0], A2.apronX[1], A2.apronZ[1], 0.115), M.concrete);
    // runway markings: threshold piano keys, designators, aiming points, TDZ, centre line, edges
    const wm = [], ym = [];
    const bar = (arr, x0, z0, x1, z1, y = 0.15) => arr.push(rectGeo(x0, z0, x1, z1, y, 5));
    for (const s of [-1, 1]) {
      const t = s * h;                                   // threshold x (s=-1: runway 09 end)
      for (let k = 0; k < 12; k++) { const z = -w + 3 + k * 3.55 + (k >= 6 ? 3.2 : 0); bar(wm, t - s * 6, z, t - s * 36, z + 1.8); }
      bar(wm, t - s * 390, -8.5, t - s * 450, -1.2); bar(wm, t - s * 390, 1.2, t - s * 450, 8.5);       // aiming points
      for (const d of [150, 300, 600, 750, 900]) { bar(wm, t - s * d, -8, t - s * (d + 22), -6); bar(wm, t - s * d, 6, t - s * (d + 22), 8); }
    }
    for (let d = -h + 90; d < h - 90; d += 50) bar(wm, d, -0.45, d + 30, 0.45);
    bar(wm, -h, -w + 0.2, h, -w + 1.1); bar(wm, -h, w - 1.1, h, w - 0.2);
    // taxiway / stand guidance lines
    bar(ym, -h - 30, A2.twyZ - 0.15, h + 30, A2.twyZ + 0.15, 0.14);
    for (const c of A2.conns) { bar(ym, c - 0.15, A2.twyZ, c + 0.15, -w - 2, 0.14); bar(ym, c - 11, -w - 18, c + 11, -w - 17.4, 0.14); }
    bar(ym, A2.apronX[0], A2.laneZ - 0.15, A2.apronX[1], A2.laneZ + 0.15, 0.14);
    for (const sx of A2.stands) bar(ym, sx - 0.15, A2.standZ - 8, sx + 0.15, A2.laneZ, 0.14);
    this._add(mergeGeometries(wm), M.white);
    this._add(mergeGeometries(ym), M.yellow);
    // runway designators (canvas text on the pavement)
    for (const [txt, x, rot] of [['09', -h + 60, -Math.PI / 2], ['27', h - 60, Math.PI / 2]]) {
      const m = textSign(txt, { h: 9, color: '#f2f2ee', emissive: '#000000' });
      m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, 0.16, 0);
      m.material.side = THREE.FrontSide;
      this.group.add(m);
    }
    // terminal, tower, hangar
    const T = A2.term;
    const tb = buildingGeo(T.x[0], T.z[0], T.x[1], T.z[1], T.h, 24, 9);
    this._add(tb.wall, M.facade, true); this._add(tb.roof, M.roof);
    const ob = buildingGeo(T.x[0] + 40, T.z[0] - 60, T.x[0] + 200, T.z[0], 30, 12.8, 14.4);
    this._add(ob.wall, M.office, true); this._add(ob.roof, M.roof);
    const tw = A2.tower;
    const shaft = new THREE.CylinderGeometry(4.5, 6, tw.h, 24); shaft.translate(tw.x, tw.h / 2, tw.z);
    this._add(shaft, M.paint, true);
    const cab = new THREE.CylinderGeometry(10, 8.5, 6, 8); cab.translate(tw.x, tw.h + 3, tw.z);
    this._add(cab, M.glass, true);
    const cap = new THREE.CylinderGeometry(10.5, 10.5, 1.2, 8); cap.translate(tw.x, tw.h + 6.6, tw.z);
    this._add(cap, M.roof, true);
    const H = A2.hangar;
    const hb = buildingGeo(H.x[0], H.z[0], H.x[1], H.z[1], H.h, 12, 12);
    this._add(hb.wall, M.metal, true); this._add(hb.roof, M.roof);
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(H.x[1] - H.x[0] - 20, H.h - 5), M.door);
    dm.position.set((H.x[0] + H.x[1]) / 2, (H.h - 5) / 2, H.z[1] + 0.3);
    this.group.add(dm);
    // car park
    this._add(rectGeo(T.x[0], T.z[0] - 140, T.x[1], T.z[0] - 20, 0.1), M.taxi);
    this._buildTown();
  }

  // the town: facade boxes merged per material, flat roofs, block pavements with streets
  _buildTown() {
    const M = this.M, TW = townLayout();
    const tiles = { glass: [12.0, 16.0], glass2: [14.4, 16.0], office: [12.8, 14.4], resid: [14.0, 12.0], brick: [14.0, 12.8], concrete: [16.0, 14.0] };
    const walls = {}, roofs = [];
    for (const b of TW.bld) {
      const [tw, th] = tiles[b.style];
      const g = buildingGeo(b.x0, b.z0, b.x1, b.z1, b.h, tw, th);
      (walls[b.style] ||= []).push(g.wall); roofs.push(g.roof);
    }
    for (const [st, list] of Object.entries(walls)) {
      for (let i = 0; i < list.length; i += 400) this._add(mergeGeometries(list.slice(i, i + 400)), M['f_' + st], true);
    }
    for (let i = 0; i < roofs.length; i += 600) this._add(mergeGeometries(roofs.slice(i, i + 600)), M.roof);
    // streets: the block grid as asphalt, blocks as pavement
    const streets = [], blocks = [];
    for (const [gx, gz] of TW.roads) {
      streets.push(rectGeo(gx - TW.road / 2, gz - TW.road / 2, gx + TW.B + TW.road / 2, gz + TW.road / 2, 0.06, 20));
      streets.push(rectGeo(gx - TW.road / 2, gz, gx + TW.road / 2, gz + TW.B, 0.061, 20));
      blocks.push(rectGeo(gx + TW.road / 2, gz + TW.road / 2, gx + TW.B - TW.road / 2, gz + TW.B - TW.road / 2, 0.05, 25));
    }
    for (let i = 0; i < streets.length; i += 800) this._add(mergeGeometries(streets.slice(i, i + 800)), M.road);
    for (let i = 0; i < blocks.length; i += 800) this._add(mergeGeometries(blocks.slice(i, i + 800)), M.concrete);
  }

  setName(name) {
    for (const m of this.signs.children.slice()) { this.signs.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
    const T = signTexts(name || 'Minato');
    const add = (text, h, maxW, x, y, z, ry, color = '#20242a') => {
      const m = textSign(text, { h, maxW, color });
      m.position.set(x, y, z); m.rotation.y = ry;
      this.signs.add(m);
    };
    add(T.airside, 3.6, 600, 0, 13.5, A2.term.z[1] + 0.4, 0);
    add(T.landside, 4.0, 600, 0, 13.5, A2.term.z[0] - 0.4, Math.PI);
    add(T.hangar, 5.0, 170, (A2.hangar.x[0] + A2.hangar.x[1]) / 2, A2.hangar.h - 2.5, A2.hangar.z[1] + 0.5, 0, '#c8401f');
  }

  update(night) {
    for (const m of this.signs.children) m.material.emissiveIntensity = night * 1.2;
  }
}
