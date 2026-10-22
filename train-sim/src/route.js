// 宇都宮線 (上野 → 宇都宮) route data and track alignment.
// s = distance along the down (northbound) track in metres, 0 = 上野 stop position.
// The alignment (curves, station positions, bridges) follows the real line: see route-data.js
// (© OpenStreetMap contributors, ODbL 1.0; elevation 出典: 国土地理院 標高タイル).
import { ALIGN, OSM_STATIONS, OSM_CURVES } from './route-data.js';
import { SHINKANSEN } from './shinkansen-data.js';

const STATION_INFO = [
  { name: '上野', kana: 'うえの', en: 'Ueno', area: 'city' },
  { name: '尾久', kana: 'おく', en: 'Oku', area: 'city' },
  { name: '赤羽', kana: 'あかばね', en: 'Akabane', area: 'city' },
  { name: '浦和', kana: 'うらわ', en: 'Urawa', area: 'city' },
  { name: 'さいたま新都心', kana: 'さいたましんとしん', en: 'Saitama-Shintoshin', area: 'city' },
  { name: '大宮', kana: 'おおみや', en: 'Ōmiya', area: 'city', dwell: 50 },
  { name: '土呂', kana: 'とろ', en: 'Toro', area: 'suburb' },
  { name: '東大宮', kana: 'ひがしおおみや', en: 'Higashi-Ōmiya', area: 'suburb' },
  { name: '蓮田', kana: 'はすだ', en: 'Hasuda', area: 'suburb' },
  { name: '白岡', kana: 'しらおか', en: 'Shiraoka', area: 'suburb' },
  { name: '新白岡', kana: 'しんしらおか', en: 'Shin-Shiraoka', area: 'suburb' },
  { name: '久喜', kana: 'くき', en: 'Kuki', area: 'suburb' },
  { name: '東鷲宮', kana: 'ひがしわしのみや', en: 'Higashi-Washinomiya', area: 'rural' },
  { name: '栗橋', kana: 'くりはし', en: 'Kurihashi', area: 'rural' },
  { name: '古河', kana: 'こが', en: 'Koga', area: 'suburb' },
  { name: '野木', kana: 'のぎ', en: 'Nogi', area: 'rural' },
  { name: '間々田', kana: 'ままだ', en: 'Mamada', area: 'rural' },
  { name: '小山', kana: 'おやま', en: 'Oyama', area: 'city', dwell: 50 },
  { name: '小金井', kana: 'こがねい', en: 'Koganei', area: 'rural' },
  { name: '自治医大', kana: 'じちいだい', en: 'Jichi Medical Univ.', area: 'rural' },
  { name: '石橋', kana: 'いしばし', en: 'Ishibashi', area: 'rural' },
  { name: '雀宮', kana: 'すずめのみや', en: 'Suzumenomiya', area: 'suburb' },
  { name: '宇都宮', kana: 'うつのみや', en: 'Utsunomiya', area: 'city' },
];

// stop position of the train front = the north end of the platform (10 m short of it);
// where OSM has no platform outline, the stop node (mid-platform) + 140 m
export const STATIONS = STATION_INFO.map((st) => {
  const o = OSM_STATIONS.find((x) => x.name === st.name);
  const s = st.name === '上野' ? 0 : o.pf_s1 != null ? o.pf_s1 - 10 : o.s + 140;
  return { ...st, s: Math.round(s) };
});
const ST = Object.fromEntries(STATIONS.map((x) => [x.name, x.s]));

// Platform side for the doors (left/right as seen facing north).
// Taken from the "お出口は○側です" parts of the in-car announcements.
export const DOOR_SIDE = {
  上野: 'left', 尾久: 'right', 赤羽: 'right', 浦和: 'right', さいたま新都心: 'right', 大宮: 'right',
  土呂: 'right', 東大宮: 'right', 蓮田: 'left', 白岡: 'left', 新白岡: 'left', 久喜: 'left',
  東鷲宮: 'left', 栗橋: 'right', 古河: 'left', 野木: 'right', 間々田: 'left', 小山: 'left',
  小金井: 'right', 自治医大: 'right', 石橋: 'left', 雀宮: 'left', 宇都宮: 'left',
};

// River crossings: [s0, s1] = levee to levee (floodplain), [w0, w1] = water channel
// (positions from the OSM bridges and the ground profile; the line runs beside the 思川, it does not cross it)
export const RIVERS = [
  { name: '荒川', s0: 10850, s1: 11580, w0: 11000, w1: 11420, h: 8.0, truss: true },
  { name: '利根川', s0: 55900, s1: 56500, w0: 56020, w1: 56400, h: 8.0, truss: true },
  { name: '渡良瀬川', s0: 60140, s1: 60900, w0: 60280, w1: 60650, h: 7.0, truss: true },
  { name: '田川', s0: 104620, s1: 104960, w0: 104740, w1: 104810, h: 3.5, truss: false },
];
// Elevated sections (高架): 赤羽 (with the 新河岸川 bridge), 浦和, 古河
export const VIADUCTS = [
  { name: '赤羽', s0: 8550, s1: 10320, h: 8.5 },
  { name: '浦和', s0: 20100, s1: 21500, h: 7.5 },
  { name: '古河', s0: 60900, s1: 62950, h: 7.5 },
];

export const PLATFORM_LEN = 320; // 15 cars + margin
export const TRACK_SPACING = 3.8;
export const ISLAND_W = 7.0;
export const SIDE_PF_W = 6.0;
export const PF_EDGE = 1.55;

const S_MIN = -1500;
const S_MAX = Math.floor(ALIGN.s0 + (ALIGN.n - 1) * ALIGN.ds) - 2;

// --- deterministic RNG -------------------------------------------------------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// --- alignment -----------------------------------------------------------------
/** OSM curve list in the shape the limits / scenery expect */
function realCurves() {
  return OSM_CURVES.map((c) => ({ s0: c.s0, sEnd: c.s1, R: c.R, dir: c.dir }));
}

export class Route {
  constructor() {
    this.stations = STATIONS.map((st, i) => ({ ...st, index: i, door: DOOR_SIDE[st.name] || 'left' }));
    this.curves = realCurves();
    const n = S_MAX - S_MIN + 1;
    this.n = n;
    this.kappa = new Float32Array(n);
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.th = new Float64Array(n);
    // cubic Hermite between the 10 m samples: positions exact at the samples, tangents from the heading
    const A = ALIGN, ds = A.ds;
    for (let i = 0; i < n; i++) {
      const s = S_MIN + i;
      const f = (s - A.s0) / ds;
      const j = Math.max(0, Math.min(A.n - 2, Math.floor(f)));
      const u = Math.min(1, Math.max(0, f - j));
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      const t0 = A.th[j], t1 = A.th[j + 1];
      this.x[i] = h00 * A.x[j] + h10 * ds * -Math.sin(t0) + h01 * A.x[j + 1] + h11 * ds * -Math.sin(t1);
      this.z[i] = h00 * A.z[j] + h10 * ds * -Math.cos(t0) + h01 * A.z[j + 1] + h11 * ds * -Math.cos(t1);
      this.th[i] = t0 + (t1 - t0) * u;
      this.kappa[i] = (A.k[j] + (A.k[j + 1] - A.k[j]) * u) * 1e-6;
    }
    // real height above sea level (for the gradient the train climbs), per 10 m
    this.realElev = Float32Array.from(A.e);
    this.buildLimits();
    this.buildElevation();
  }

  // --- vertical alignment: viaducts and bridges, joined by 12‰ ramps ------------
  buildElevation() {
    const n = Math.ceil((S_MAX - S_MIN) / 2) + 1;
    this.elevTable = new Float32Array(n);
    const feats = [...VIADUCTS, ...RIVERS];
    for (let i = 0; i < n; i++) {
      const s = S_MIN + i * 2;
      let h = 0;
      for (const f of feats) {
        const ramp = f.h / 0.012;
        let w;
        if (s >= f.s0 && s <= f.s1) w = 1;
        else if (s < f.s0) w = 1 - smooth((f.s0 - s) / ramp);
        else w = 1 - smooth((s - f.s1) / ramp);
        h = Math.max(h, f.h * w);
      }
      this.elevTable[i] = h;
    }
  }

  elev(s) {
    const f = (s - S_MIN) / 2;
    const i = Math.max(0, Math.min(this.elevTable.length - 2, Math.floor(f)));
    const t = Math.min(1, Math.max(0, f - i));
    return this.elevTable[i] + (this.elevTable[i + 1] - this.elevTable[i]) * t;
  }

  /** real height above sea level at s (m), from the GSI elevation along the line */
  heightAt(s) {
    const f = (s - ALIGN.s0) / ALIGN.ds;
    const i = Math.max(0, Math.min(ALIGN.n - 2, Math.floor(f)));
    const t = Math.min(1, Math.max(0, f - i));
    return this.realElev[i] + (this.realElev[i + 1] - this.realElev[i]) * t;
  }

  /** gradient the train climbs (rise per metre): the real profile, averaged over 100 m */
  grade(s) { return (this.heightAt(s + 50) - this.heightAt(s - 50)) / 100; }

  /** what carries the track at s */
  structureAt(s) {
    for (const r of RIVERS) {
      if (s >= r.s0 && s <= r.s1) return { type: s >= r.w0 && s <= r.w1 ? 'bridge' : 'viaduct', river: r };
    }
    for (const v of VIADUCTS) if (s >= v.s0 && s <= v.s1) return { type: 'viaduct', viaduct: v };
    return { type: this.elev(s) > 0.25 ? 'embankment' : 'ground' };
  }

  riverAt(s, margin = 0) {
    return RIVERS.find((r) => s > r.s0 - margin && s < r.s1 + margin) || null;
  }

  get sMin() { return S_MIN + 10; }
  get sMax() { return S_MAX - 10; }

  /** centre-line point + heading at s (metres), with lateral offset (+ = left). */
  pose(s, offset = 0, out = {}) {
    let f = s - S_MIN;
    if (f < 0) f = 0;
    if (f > this.n - 2) f = this.n - 2;
    const i = Math.floor(f);
    const t = f - i;
    const x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    const z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    const th = this.th[i] + (this.th[i + 1] - this.th[i]) * t;
    // forward d = (-sin th, 0, -cos th); left = (d.z, 0, -d.x)
    const dx = -Math.sin(th), dz = -Math.cos(th);
    const lx = dz, lz = -dx;
    out.x = x + lx * offset;
    out.z = z + lz * offset;
    out.y = this.elevTable ? this.elev(s) : 0;
    out.dx = dx; out.dz = dz;
    out.lx = lx; out.lz = lz;
    out.th = th;
    // three.js yaw that maps model +X to d
    out.yaw = Math.atan2(-dz, dx);
    return out;
  }

  curvature(s) {
    const i = Math.round(s - S_MIN);
    return i >= 0 && i < this.n ? this.kappa[i] : 0;
  }

  stationNear(s, margin = 0) {
    for (const st of this.stations) {
      if (s > st.s - PLATFORM_LEN - margin && s < st.s + 20 + margin) return st;
    }
    return null;
  }

  /** lateral offset of the up (southbound) track */
  upOffset(s) {
    let o = -TRACK_SPACING;
    for (const st of this.stations) {
      if (st.door !== 'right') continue;
      const a = st.s - PLATFORM_LEN - 60, b = st.s + 30;
      const ramp = 220;
      const w = smooth((s - (a - ramp)) / ramp) * (1 - smooth((s - b) / ramp));
      o -= w * (ISLAND_W + 2 * PF_EDGE - TRACK_SPACING);
    }
    return o;
  }

  /** extra parallel lines (京浜東北線 etc.) south of 大宮 */
  extraTracks(s) {
    if (s > ST['大宮'] + 800 || s < -1400) return [];
    let base = this.upOffset(s);
    // leave room for the up-side platform at stations with left doors
    for (const st of this.stations) {
      if (st.door !== 'left') continue;
      const a = st.s - PLATFORM_LEN - 60, b = st.s + 30, ramp = 220;
      const w = smooth((s - (a - ramp)) / ramp) * (1 - smooth((s - b) / ramp));
      base -= w * (SIDE_PF_W + 2 * PF_EDGE + 1.0);
    }
    return [base - 5.0, base - 5.0 - TRACK_SPACING];
  }

  buildLimits() {
    // piecewise speed limits {s0, s1, v}
    const L = [];
    L.push({ s0: -1500, s1: 650, v: 45, why: '構内' });
    L.push({ s0: 650, s1: ST['赤羽'] + 250, v: 95 });
    L.push({ s0: ST['大宮'] - 1000, s1: ST['大宮'] + 500, v: 85, why: '大宮構内' });
    L.push({ s0: ST['小山'] - 800, s1: ST['小山'] + 500, v: 95, why: '小山構内' });
    L.push({ s0: ST['宇都宮'] - 1100, s1: S_MAX, v: 70, why: '宇都宮構内' });
    // curves (real radii): the usual limits for cant-equipped curves
    for (const c of this.curves) {
      let v = 120;
      if (c.R <= 350) v = 65;
      else if (c.R <= 450) v = 75;
      else if (c.R <= 600) v = 85;
      else if (c.R <= 800) v = 95;
      else if (c.R <= 1000) v = 105;
      else if (c.R <= 1200) v = 115;
      if (v < 120) L.push({ s0: c.s0 - 20, s1: c.sEnd + 20, v, why: `R${Math.round(c.R)}` });
    }
    this.limits = L;
    // per-10m table of the effective line limit
    const n = Math.ceil((S_MAX - S_MIN) / 10) + 1;
    this.limitTable = new Uint8Array(n).fill(120);
    for (const l of L) {
      const a = Math.max(0, Math.floor((l.s0 - S_MIN) / 10));
      const b = Math.min(n - 1, Math.ceil((l.s1 - S_MIN) / 10));
      for (let i = a; i <= b; i++) this.limitTable[i] = Math.min(this.limitTable[i], l.v);
    }
  }

  limitAt(s) {
    const i = Math.round((s - S_MIN) / 10);
    if (i < 0) return this.limitTable[0];
    if (i >= this.limitTable.length) return this.limitTable[this.limitTable.length - 1];
    return this.limitTable[i];
  }

  /** the most restrictive limit over a train of length len ending at s (front) */
  limitOverTrain(s, len) {
    let v = 999;
    for (let x = s - len; x <= s; x += 10) v = Math.min(v, this.limitAt(x));
    return v;
  }

  /** upcoming limit changes ahead of s within dist: [{s, v}] */
  upcomingLimits(s, dist) {
    const out = [];
    let prev = this.limitAt(s);
    for (let x = s + 10; x < s + dist; x += 10) {
      const v = this.limitAt(x);
      if (v !== prev) { out.push({ s: x, v }); prev = v; }
    }
    return out;
  }

  /**
   * the 東北新幹線 viaduct where it runs within sight beside us:
   * { lat (+ = left of the down track), h (deck height above ground), ss (its own chainage) } or null
   */
  shinkansen(s) {
    const S = SHINKANSEN;
    const f = (s - S.s0) / S.ds;
    const i = Math.floor(f);
    if (i < 0 || i >= S.off.length - 1) return null;
    const u = f - i;
    // stay clear of tunnels (上野–日暮里, 赤羽台) and their portals
    for (let j = Math.max(0, i - 2); j <= Math.min(S.off.length - 1, i + 3); j++) if (S.tunnel[j]) return null;
    const raw = -(S.off[i] + (S.off[i + 1] - S.off[i]) * u);   // + = left
    if (Math.abs(raw) > 190) return null;
    // keep a real-looking gap to our outermost track (OSM may give the nearer Shinkansen track)
    const clear = (j) => {
      const o = -(S.off[j]), x = S.s0 + j * S.ds;
      if (Math.abs(o) < 7) return o;                            // crossing over the line
      if (o > 0) return Math.max(o, 13);
      const ex = this.extraTracks(x), outer = ex.length ? ex[1] : this.upOffset(x);
      return Math.min(o, outer - 13);
    };
    const lat = clear(i) + (clear(i + 1) - clear(i)) * u;
    // higher where it crosses over the line
    const h = 9 + 4 * Math.max(0, Math.min(1, 1 - (Math.abs(raw) - 4) / 6));
    return { lat, h, ss: S.ss[i] + (S.ss[i + 1] - S.ss[i]) * u };
  }

  /** area density 0..1 for scenery */
  density(s) {
    let d = 0.15;
    if (s < ST['大宮'] + 800) d = 0.85;
    else if (s < ST['東大宮'] + 1400) d = 0.55;
    else if (s > ST['宇都宮'] - 2200) d = 0.7;
    for (const st of this.stations) {
      const k = st.area === 'city' ? 0.75 : st.area === 'suburb' ? 0.55 : 0.35;
      const r = st.area === 'city' ? 1800 : 1100;
      const w = Math.max(0, 1 - Math.abs(s - st.s) / r);
      d = Math.max(d, k * w + 0.1);
    }
    return Math.min(1, d);
  }
}
