// Land use beside the line: fields, villages, suburbs, city blocks, roads, rivers.
import * as THREE from 'three';
import { fbm, hash2, rng } from './noise.js';
import { GeoBuffer, Frame, house, apartment, mansion, office, shopRow, factory, greenhouse, farBlock, pick } from './buildings.js';
import { GROUND_Y } from './sky.js';

const CELL = 24;          // land cell size (m)
const NEAR = 420;         // detailed band either side
const FAR = 1500;         // low-detail silhouettes
const BASE_Y = GROUND_Y - 0.12;   // buildings sink slightly into the ground plane

export const MATERIAL_KEYS = ['house', 'apt', 'mansion', 'office', 'shop', 'factory', 'roofTile', 'roofMetal', 'concrete', 'plain', 'glass', 'sign', 'paddy', 'field', 'road', 'asphalt', 'levee', 'far', 'water', 'dirt'];

/** road segments for one chunk, decided from deterministic hashes so neighbours agree */
export function crossingRoadsNear(route, s0, s1) {
  const out = [];
  for (let k = Math.floor(s0 / 100); k <= Math.floor(s1 / 100); k++) {
    const s = k * 100 + 50;
    if (s < s0 || s >= s1) continue;
    const dens = route.density(s);
    const p = dens > 0.68 ? 0.22 : dens > 0.35 ? 0.16 : 0.10;
    if (hash2(k, 7, 99) > p) continue;
    if (route.stations.some((st) => s > st.s - 600 && s < st.s + 260)) continue;
    if (route.riverAt(s, 250)) continue;
    const h = route.elev(s);
    if (h > 0.2 && h < 5.5) continue;           // on a ramp: no road
    out.push({ s, w: dens > 0.6 ? 8 : 6, level: h <= 0.2, k });
  }
  return out;
}

export function parallelRoad(route, s) {
  const k = Math.floor(s / 400);
  const r = hash2(k, 3, 41);
  if (r < 0.45) return null;
  return { side: r < 0.72 ? 1 : -1, w: 5.5 };
}

export class LandBuilder {
  constructor(world) {
    this.world = world;
    this.route = world.route;
  }

  /** lateral distance from our track centre to the outer edge of the railway on each side */
  edge(s, side) {
    const r = this.route;
    let e;
    if (side > 0) e = 6;
    else {
      e = -r.outerTrack(s) + 6;
    }
    const st = r.stationNear(s, 80);
    if (st) e += side > 0 ? (st.door === 'left' ? 14 : 4) : (st.door === 'left' ? 12 : 2);
    if (r.elev(s) > 3) e += 4;
    return e;
  }

  /** build land use for a chunk into material buffers + instance lists */
  build(k, s0, s1, B, inst) {
    const r = this.route;
    const R = rng(k * 9176 + 3);
    const roads = crossingRoadsNear(r, s0 - 100, s1 + 100);
    this.roads = roads;
    const p = {};
    const world = (s, l) => r.pose(s, l, p);
    const occupied = new Set();
    this.footprints = [];

    for (const side of [1, -1]) {
      // parallel road along the line
      const par = parallelRoad(r, (s0 + s1) / 2);
      for (let s = s0; s < s1; s += CELL) {
        const sc = s + CELL / 2;
        const river = r.riverAt(sc, 60);
        const edge = this.edge(sc, side);
        let lStart = edge + 2;
        let roadL = null;
        if (par && par.side === side && !river) {
          roadL = edge + 3 + par.w / 2;
          lStart = roadL + par.w / 2 + 2;
        }
        for (let l = lStart; l < NEAR; l += CELL) {
          const lc = l + CELL / 2;
          if (river) continue;
          if (roads.some((rd) => Math.abs(rd.s - sc) < rd.w / 2 + CELL / 2)) continue;
          const key = `${Math.floor(s / CELL)},${Math.floor(l / CELL)},${side}`;
          if (occupied.has(key)) continue;
          // nothing under / against the Shinkansen viaduct
          const sh = r.shinkansen(sc);
          if (sh && Math.abs(side * lc - sh.lat) < 10 + CELL / 2) continue;
          this.cell(B, inst, R, sc, side * lc, side, k, occupied, s, l);
        }
      }
      if (par && par.side === side) {
        this.parallelRoadStrip(B, inst, s0, s1, side, par);
      }
      // far silhouettes
      this.far(B, inst, R, s0, s1, side);
    }
    for (const rd of roads) this.crossingRoad(B, inst, rd, s0, s1);
    // no tree growing through a roof: drop trees whose crown would reach into a building
    const reach = { broad: 3.6, conifer: 2.2, bamboo: 4.0 };
    inst.trees = inst.trees.filter((t) => {
      const rr = reach[t.kind];
      if (!rr) return true;
      const m = rr * (t.s || 1);
      return !this.footprints.some(({ F, w, d }) => {
        const dx = t.x - F.x, dz = t.z - F.z;
        const u = dx * F.c + dz * F.s, ww = -dx * F.s + dz * F.c;
        return Math.abs(u) < w / 2 + m && Math.abs(ww) < d / 2 + m;
      });
    });
    return roads;
  }

  /**
   * building frame at (s, l): local u runs along the track, the front (local -w) faces the line.
   * (Frame rotates the opposite way to three.js' yaw, hence -yaw.)
   */
  frameAt(s, l, extraYaw = 0) {
    const r = this.route;
    const q = r.pose(s, l, {}), t = r.pose(s, 0, {});
    let th = -q.yaw;
    if (-Math.sin(th) * (t.x - q.x) + Math.cos(th) * (t.z - q.z) > 0) th += Math.PI;
    return new Frame(q.x, BASE_Y, q.z, th + extraYaw);
  }

  landUse(s, l, wx, wz) {
    const r = this.route;
    let u = r.density(s);
    const n = fbm(wx / 300, wz / 300, 3, 1);
    if (u > 0.68) return { kind: 'city', n };
    if (u > 0.35) return { kind: n > 0.62 ? 'farm' : 'suburb', n };
    // rural: villages (集落) as blobs
    const v = fbm(wx / 420, wz / 420, 3, 2);
    if (v > 0.6 || (Math.abs(l) < 60 && v > 0.52)) return { kind: 'village', n };
    return { kind: 'farm', n };
  }

  cell(B, inst, R, sc, lc, side, k, occupied, s, l) {
    const r = this.route;
    const p = r.pose(sc, lc, {});
    const lu = this.landUse(sc, lc, p.x, p.z);
    // level of detail for the buildings of this cell: full close to the line, silhouettes far away
    const al = Math.abs(lc);
    // (non-enumerable: the chunk builder iterates B expecting only GeoBuffers)
    Object.defineProperty(B, 'lod', { value: al < 80 ? 2 : al < 170 ? 1 : 0, writable: true, enumerable: false, configurable: true });
    const yaw = p.yaw + (side > 0 ? 0 : Math.PI);   // buildings face the line
    const jit = () => (R() - 0.5) * 3;
    const place = (fn, ...args) => {
      const F = this.frameAt(sc + jit(), lc + jit() * side, (R() - 0.5) * 0.08);
      const res = fn(B, F, R, ...args);
      if (res && res.w) this.footprints.push({ F, w: res.w, d: res.d });
      // garden hedges / shrubs the builder asked for (local u, w, scale)
      if (res && res.shrubs) {
        for (const [u, w, sc] of res.shrubs) {
          const [x, , z] = F.p(u, 0, w);
          inst.trees.push({ kind: 'shrub', x, z, s: sc * (0.8 + R() * 0.4), rot: R() * 6.28 });
        }
      }
      if (res && res.hedges) {
        for (const [u0, u1, w0, w1, h] of res.hedges) {
          const a = F.p(u0, 0, w0), b = F.p(u1, 0, w1);
          const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
          if (len < 0.8) continue;
          inst.trees.push({ kind: 'hedge', x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2, sx: len, sy: h, sz: 0.7, rot: Math.atan2(-(b[2] - a[2]), b[0] - a[0]) });
        }
      }
      return res;
    };
    // factories are big (up to 70 m × 40 m): never centre them in the 24 m cell like a house,
    // put the front wall on the cell's inner edge and grow away from the line, and only where
    // the railway boundary, stations and crossing roads stay clear along the whole length
    const placeFactory = () => {
      const w = 30 + R() * 40, d = 18 + R() * 22;
      for (let ss = s - 2; ss <= s + w + 2; ss += 6) if (this.edge(ss, side) + 4 > l) return false;
      if ((this.roads || []).some((rd) => rd.s > s - rd.w / 2 - 4 && rd.s < s + w + rd.w / 2 + 4)) return false;
      const F = this.frameAt(s + w / 2, side * (l + 2 + d / 2));
      factory(B, F, R, w, d);
      this.footprints.push({ F, w, d });
      // claim the cells it covers so nothing else is built inside it
      for (let a = 0; a <= Math.ceil(w / CELL); a++) for (let b = 0; b <= Math.ceil((d + 2) / CELL); b++) {
        occupied.add(`${Math.floor(s / CELL) + a},${Math.floor(l / CELL) + b},${side}`);
      }
      return true;
    };
    const tree = (kind, s2, l2, scl) => {
      const q = r.pose(s2, l2, {});
      inst.trees.push({ kind, x: q.x, z: q.z, s: scl * (0.8 + R() * 0.5), rot: R() * 6.28 });
    };
    switch (lu.kind) {
      case 'city': {
        const near = Math.abs(lc) < 90;
        const x = R();
        const big = (Math.floor(s / CELL) % 2 === 0) && (Math.floor(l / CELL) % 2 === 0) && R() < 0.55;
        if (big) {
          for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) occupied.add(`${Math.floor(s / CELL) + a},${Math.floor(l / CELL) + b},${side}`);
          const F = this.frameAt(sc + CELL / 2, lc + side * CELL / 2);
          if (x < 0.55) mansion(B, F, R, near ? 15 : 12);
          else office(B, F, R);
        } else if (x < 0.35) place(house);
        else if (x < 0.6) place(apartment);
        else if (x < 0.8) place(shopRow);
        else { this.parking(B, inst, R, sc, lc); }
        if (R() < 0.25) tree('broad', sc + 9, lc + side * 9, 0.8);
        break;
      }
      case 'suburb': {
        const x = R();
        if (x < 0.62) { place(house); if (R() < 0.6) tree(R() < 0.7 ? 'broad' : 'conifer', sc + 8, lc + side * (R() * 8), 0.75); }
        else if (x < 0.78) place(apartment);
        else if (x < 0.84) place(shopRow);
        else if (x < 0.88) { if (!(lu.n > 0.5 && placeFactory())) this.parking(B, inst, R, sc, lc); }
        else if (x < 0.95) this.fieldCell(B, inst, R, sc, lc, side, 'field');
        else tree('broad', sc, lc, 1.1);
        break;
      }
      case 'village': {
        const x = R();
        if (x < 0.55) {
          place(house);
          // farmhouse with windbreak trees (屋敷林) behind
          if (R() < 0.7) for (let t = 0; t < 3; t++) tree(R() < 0.6 ? 'conifer' : 'broad', sc + (R() - 0.5) * 20, lc + side * (8 + R() * 6), 1.15);
        } else if (x < 0.62) { if (!placeFactory()) this.fieldCell(B, inst, R, sc, lc, side, 'field'); }
        else if (x < 0.78) this.fieldCell(B, inst, R, sc, lc, side, 'field');
        else if (x < 0.9) { for (let t = 0; t < 4; t++) tree(R() < 0.5 ? 'conifer' : 'broad', sc + (R() - 0.5) * 20, lc + (R() - 0.5) * 20, 1.2); }
        else { for (let t = 0; t < 5; t++) tree('bamboo', sc + (R() - 0.5) * 16, lc + (R() - 0.5) * 16, 1.0); }
        break;
      }
      default: {
        // farmland in blocks (≈ 90 m × 48 m paddies like the Kanto plain)
        const bs = Math.floor(sc / 96), bl = Math.floor(Math.abs(lc) / 48) * Math.sign(lc);
        const h = hash2(bs, bl, 17);
        let kind = h < 0.62 ? 'paddy' : h < 0.8 ? 'field' : h < 0.88 ? 'greenhouse' : h < 0.95 ? 'fallow' : 'grove';
        if (kind === 'greenhouse') {
          if ((Math.floor(sc / CELL) % 4) === 0 && (Math.floor(Math.abs(lc) / CELL) % 2) === 0) {
            const q = r.pose(sc + CELL, lc, {});
            for (let g = 0; g < 3; g++) {
              greenhouse(B, this.frameAt(sc + CELL * 0.5, lc + side * (g * 7 - 7)), R, 40);
              void q;
            }
          }
          this.fieldCell(B, inst, R, sc, lc, side, 'fallow');
        } else if (kind === 'grove') {
          for (let t = 0; t < 4; t++) tree(R() < 0.5 ? 'conifer' : 'broad', sc + (R() - 0.5) * 22, lc + (R() - 0.5) * 22, 1.25);
        } else this.fieldCell(B, inst, R, sc, lc, side, kind, bs, bl);
      }
    }
  }

  /** one 24 m cell of field/paddy with levees (畦) on the block border */
  fieldCell(B, inst, R, sc, lc, side, kind, bs, bl) {
    const r = this.route;
    const h = CELL / 2;
    const corners = [[sc - h, lc - h], [sc + h, lc - h], [sc + h, lc + h], [sc - h, lc + h]].map(([s, l]) => r.pose(s, l, {}));
    const buf = kind === 'paddy' ? B.paddy : kind === 'field' ? B.field : B.dirt;
    const y = GROUND_Y + (kind === 'paddy' ? 0.02 : 0.04);
    let c;
    if (kind === 'paddy') {
      // block-wise: golden ripe / harvested stubble / still green
      const h = hash2(bs ?? 0, bl ?? 0, 5);
      c = h < 0.5 ? [0.95, 0.80, 0.36] : h < 0.8 ? [0.62, 0.50, 0.36] : [0.50, 0.70, 0.30];
      const j = 0.94 + R() * 0.08;
      c = c.map((v) => v * j);
    } else c = kind === 'fallow' ? [0.75, 0.82, 0.55] : [0.92 + R() * 0.12, 0.95 + R() * 0.08, 0.9];
    const P = (q) => [q.x, y, q.z];
    // texture in metres (cells line up seamlessly)
    const uv = (s, l) => [l / 12, s / 12];
    const S = [[sc - h, lc - h], [sc + h, lc - h], [sc + h, lc + h], [sc - h, lc + h]];
    buf.quadUp(P(corners[0]), P(corners[3]), P(corners[2]), P(corners[1]), [uv(...S[0]), uv(...S[3]), uv(...S[2]), uv(...S[1])], c);
    if (bs !== undefined) {
      // levee strips on block edges
      const sMod = ((sc - h) % 96 + 96) % 96;
      const lMod = ((Math.abs(lc) - h) % 48 + 48) % 48;
      if (sMod < 1) this.strip(B.levee, sc - h, lc - h, sc - h, lc + h, 0.5, 0.25);
      if (lMod < 1) this.strip(B.levee, sc - h, Math.sign(lc) * (Math.abs(lc) - h), sc + h, Math.sign(lc) * (Math.abs(lc) - h), 0.5, 0.25);
    }
    void inst; void side;
  }

  /** thin raised strip between two (s,l) points */
  strip(buf, sa, la, sb, lb, w, hgt) {
    const r = this.route;
    const a = r.pose(sa, la, {}), b = r.pose(sb, lb, {});
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * w / 2, nz = dx / len * w / 2;
    const y0 = GROUND_Y, y1 = GROUND_Y + hgt;
    const col = [0.8, 0.86, 0.6];
    buf.quadUp([a.x - nx, y1, a.z - nz], [b.x - nx, y1, b.z - nz], [b.x + nx, y1, b.z + nz], [a.x + nx, y1, a.z + nz], [[0, 0], [len / 8, 0], [len / 8, 0.1], [0, 0.1]], col);
    buf.quad([a.x + nx, y0, a.z + nz], [b.x + nx, y0, b.z + nz], [b.x + nx, y1, b.z + nz], [a.x + nx, y1, a.z + nz], [[0, 0], [len / 8, 0], [len / 8, 0.05], [0, 0.05]], col);
    buf.quad([b.x - nx, y0, b.z - nz], [a.x - nx, y0, a.z - nz], [a.x - nx, y1, a.z - nz], [b.x - nx, y1, b.z - nz], [[0, 0], [len / 8, 0], [len / 8, 0.05], [0, 0.05]], col);
  }

  parking(B, inst, R, sc, lc) {
    const r = this.route;
    const h = CELL / 2 - 1;
    const q = [[sc - h, lc - h], [sc + h, lc - h], [sc + h, lc + h], [sc - h, lc + h]].map(([s, l]) => r.pose(s, l, {}));
    const y = GROUND_Y + 0.03;
    B.asphalt.quadUp([q[0].x, y, q[0].z], [q[1].x, y, q[1].z], [q[2].x, y, q[2].z], [q[3].x, y, q[3].z], [[0, 0], [2, 0], [2, 2], [0, 2]], [0.95, 0.95, 0.95]);
    for (let i = 0; i < 6; i++) {
      if (R() < 0.35) continue;
      const pp = r.pose(sc - 8 + i * 3, lc + (R() < 0.5 ? -5 : 5), {});
      inst.cars.push({ x: pp.x, z: pp.z, yaw: pp.yaw + Math.PI / 2, color: carColor(R) });
    }
  }

  parallelRoadStrip(B, inst, s0, s1, side, par) {
    const r = this.route;
    const step = 10;
    for (let s = s0; s < s1; s += step) {
      if (r.riverAt(s + step / 2, 60)) continue;
      const e0 = this.edge(s, side), e1 = this.edge(s + step, side);
      const l0 = side * (e0 + 3 + par.w / 2), l1 = side * (e1 + 3 + par.w / 2);
      const a1 = r.pose(s, l0 - par.w / 2, {}), a2 = r.pose(s, l0 + par.w / 2, {});
      const b1 = r.pose(s + step, l1 - par.w / 2, {}), b2 = r.pose(s + step, l1 + par.w / 2, {});
      const y = GROUND_Y + 0.05;
      B.road.quadUp([a1.x, y, a1.z], [a2.x, y, a2.z], [b2.x, y, b2.z], [b1.x, y, b1.z], [[0, s / 20], [1, s / 20], [1, (s + step) / 20], [0, (s + step) / 20]], [1, 1, 1]);
      // utility poles + wires on the outer edge
      if (Math.floor(s / step) % 4 === 0) {
        const pp = r.pose(s, side * (e0 + 3 + par.w + 0.8), {});
        inst.poles.push({ x: pp.x, z: pp.z, yaw: pp.yaw, s });
      }
    }
    inst.roadsPar.push({ s0, s1, side, par, edgeFn: (s) => this.edge(s, side) });
  }

  crossingRoad(B, inst, rd, s0, s1) {
    if (rd.s < s0 || rd.s >= s1) return;
    const r = this.route;
    const p0 = r.pose(rd.s, 0, {});
    const y = GROUND_Y + 0.05;
    // straight road perpendicular to the track at rd.s
    const nx = p0.lx, nz = p0.lz, dx = p0.dx, dz = p0.dz;
    const half = rd.w / 2;
    for (const [la, lb] of [[-NEAR, -2.5], [2.5, NEAR]]) {
      const A = [p0.x + nx * la - dx * half, y, p0.z + nz * la - dz * half];
      const Bp = [p0.x + nx * la + dx * half, y, p0.z + nz * la + dz * half];
      const C = [p0.x + nx * lb + dx * half, y, p0.z + nz * lb + dz * half];
      const D = [p0.x + nx * lb - dx * half, y, p0.z + nz * lb - dz * half];
      B.road.quadUp(A, Bp, C, D, [[0, la / 20], [1, la / 20], [1, lb / 20], [0, lb / 20]], [1, 1, 1]);
    }
    inst.crossRoads.push(rd);
  }

  /** silhouettes beyond the detailed band: town blocks and tree lines */
  far(B, inst, R, s0, s1, side) {
    const r = this.route;
    for (let s = s0; s < s1; s += 60) {
      for (let l = NEAR + 30; l < FAR; l += 70) {
        const lc = side * (l + R() * 40);
        const q = r.pose(s + R() * 50, lc, {});
        const lu = this.landUse(s, lc, q.x, q.z);
        if (lu.kind === 'farm') {
          if (R() < 0.35) for (let t = 0; t < 3; t++) inst.trees.push({ kind: R() < 0.5 ? 'conifer' : 'broad', x: q.x + (R() - 0.5) * 30, z: q.z + (R() - 0.5) * 30, s: 1.4 + R(), rot: R() * 6 });
          continue;
        }
        const n = lu.kind === 'city' ? 3 : lu.kind === 'suburb' ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const F = new Frame(q.x + (R() - 0.5) * 50, BASE_Y, q.z + (R() - 0.5) * 50, -q.yaw);
          const tall = lu.kind === 'city' ? 8 + R() * 40 : 5 + R() * 4;
          const c = pick([[0.78, 0.76, 0.72], [0.70, 0.70, 0.70], [0.82, 0.80, 0.76], [0.60, 0.62, 0.64]], R());
          farBlock(B, F, 10 + R() * 18, 8 + R() * 12, tall, c);
        }
        if (R() < 0.3) inst.trees.push({ kind: 'broad', x: q.x, z: q.z, s: 1.3, rot: R() * 6 });
      }
    }
  }
}

export function carColor(R) {
  const c = [[0.95, 0.95, 0.95], [0.12, 0.12, 0.13], [0.6, 0.62, 0.64], [0.75, 0.1, 0.1], [0.15, 0.25, 0.5], [0.8, 0.8, 0.82], [0.35, 0.36, 0.4], [0.9, 0.85, 0.7]];
  return c[Math.floor(R() * c.length)];
}

/** a small car mesh (~5 m) with vertex colours: body tinted by instance colour */
export function carGeometry() {
  const B = new GeoBuffer();
  const F = new Frame(0, 0, 0, 0);
  const box = (u, w, y0, y1, du, dw, col) => {
    const hu = du / 2, hw = dw / 2;
    const P = (a, b, c) => F.p(u + a, c, w + b);
    const q = (a, b, c, d) => B.quad(b, a, d, c, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
    q(P(-hu, -hw, y0), P(hu, -hw, y0), P(hu, -hw, y1), P(-hu, -hw, y1));
    q(P(hu, -hw, y0), P(hu, hw, y0), P(hu, hw, y1), P(hu, -hw, y1));
    q(P(hu, hw, y0), P(-hu, hw, y0), P(-hu, hw, y1), P(hu, hw, y1));
    q(P(-hu, hw, y0), P(-hu, -hw, y0), P(-hu, -hw, y1), P(-hu, hw, y1));
    q(P(-hu, -hw, y1), P(hu, -hw, y1), P(hu, hw, y1), P(-hu, hw, y1));
  };
  box(0, 0, 0.25, 0.85, 4.4, 1.75, [1, 1, 1]);
  box(-0.2, 0, 0.85, 1.42, 2.4, 1.6, [0.22, 0.26, 0.3]);
  box(-0.2, 0, 1.40, 1.46, 2.2, 1.5, [1, 1, 1]);
  for (const a of [-1.4, 1.4]) for (const b of [-0.82, 0.82]) box(a, b, 0, 0.6, 0.62, 0.22, [0.05, 0.05, 0.05]);
  const g = B.build();
  g.translate(0, GROUND_Y, 0);
  return g;
}
