// 宇都宮線 (上野 → 宇都宮) route data and track alignment.
// s = distance along the down (northbound) track in metres, 0 = 上野 stop position.

export const STATIONS = [
  { name: '上野', kana: 'うえの', en: 'Ueno', s: 0, area: 'city' },
  { name: '尾久', kana: 'おく', en: 'Oku', s: 4800, area: 'city' },
  { name: '赤羽', kana: 'あかばね', en: 'Akabane', s: 12400, area: 'city' },
  { name: '浦和', kana: 'うらわ', en: 'Urawa', s: 23400, area: 'city' },
  { name: 'さいたま新都心', kana: 'さいたましんとしん', en: 'Saitama-Shintoshin', s: 27900, area: 'city' },
  { name: '大宮', kana: 'おおみや', en: 'Ōmiya', s: 29500, area: 'city', dwell: 50 },
  { name: '土呂', kana: 'とろ', en: 'Toro', s: 32500, area: 'suburb' },
  { name: '東大宮', kana: 'ひがしおおみや', en: 'Higashi-Ōmiya', s: 34600, area: 'suburb' },
  { name: '蓮田', kana: 'はすだ', en: 'Hasuda', s: 38400, area: 'suburb' },
  { name: '白岡', kana: 'しらおか', en: 'Shiraoka', s: 42700, area: 'suburb' },
  { name: '新白岡', kana: 'しんしらおか', en: 'Shin-Shiraoka', s: 45200, area: 'suburb' },
  { name: '久喜', kana: 'くき', en: 'Kuki', s: 48100, area: 'suburb' },
  { name: '東鷲宮', kana: 'ひがしわしのみや', en: 'Higashi-Washinomiya', s: 51100, area: 'rural' },
  { name: '栗橋', kana: 'くりはし', en: 'Kurihashi', s: 56400, area: 'rural' },
  { name: '古河', kana: 'こが', en: 'Koga', s: 63900, area: 'suburb' },
  { name: '野木', kana: 'のぎ', en: 'Nogi', s: 68200, area: 'rural' },
  { name: '間々田', kana: 'ままだ', en: 'Mamada', s: 73800, area: 'rural' },
  { name: '小山', kana: 'おやま', en: 'Oyama', s: 79800, area: 'city', dwell: 50 },
  { name: '小金井', kana: 'こがねい', en: 'Koganei', s: 87300, area: 'rural' },
  { name: '自治医大', kana: 'じちいだい', en: 'Jichi Medical Univ.', s: 89900, area: 'rural' },
  { name: '石橋', kana: 'いしばし', en: 'Ishibashi', s: 94600, area: 'rural' },
  { name: '雀宮', kana: 'すずめのみや', en: 'Suzumenomiya', s: 101000, area: 'suburb' },
  { name: '宇都宮', kana: 'うつのみや', en: 'Utsunomiya', s: 108700, area: 'city' },
];

// Platform side for the doors (left/right as seen facing north).
// Taken from the "お出口は○側です" parts of the in-car announcements.
export const DOOR_SIDE = {
  上野: 'left', 尾久: 'right', 赤羽: 'right', 浦和: 'right', さいたま新都心: 'right', 大宮: 'right',
  土呂: 'right', 東大宮: 'right', 蓮田: 'left', 白岡: 'left', 新白岡: 'left', 久喜: 'left',
  東鷲宮: 'left', 栗橋: 'right', 古河: 'left', 野木: 'right', 間々田: 'left', 小山: 'left',
  小金井: 'right', 自治医大: 'right', 石橋: 'left', 雀宮: 'left', 宇都宮: 'left',
};

// River crossings: [s0, s1] = levee to levee (floodplain), [w0, w1] = water channel.
export const RIVERS = [
  { name: '荒川', s0: 13250, s1: 14150, w0: 13480, w1: 13880, h: 8.0, truss: true },
  { name: '利根川', s0: 57150, s1: 58750, w0: 57600, w1: 58250, h: 8.0, truss: true },
  { name: '渡良瀬川', s0: 59700, s1: 60400, w0: 59900, w1: 60180, h: 7.0, truss: true },
  { name: '思川', s0: 76200, s1: 76850, w0: 76420, w1: 76590, h: 6.5, truss: false },
  { name: '田川', s0: 106950, s1: 107180, w0: 107040, w1: 107090, h: 3.5, truss: false },
];
// Elevated sections (高架)
export const VIADUCTS = [
  { name: '赤羽', s0: 10900, s1: 13300, h: 8.5 },
  { name: '浦和', s0: 21900, s1: 24800, h: 7.5 },
];

export const PLATFORM_LEN = 320; // 15 cars + margin
export const TRACK_SPACING = 3.8;
export const ISLAND_W = 7.0;
export const SIDE_PF_W = 6.0;
export const PF_EDGE = 1.55;

const S_MIN = -1500;
const S_MAX = 110500;

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
// Curves are generated once from a fixed seed so the route is always the same.
function buildCurves() {
  const rnd = mulberry32(1872);
  const curves = [];
  const radii = [600, 800, 1000, 1200, 1600, 2000, 3000];
  let heading = 0; // radians, 0 = north. positive = turned left (west)
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i].s + 450;
    const b = STATIONS[i + 1].s - PLATFORM_LEN - 350;
    let s = a;
    while (s < b - 400) {
      const gap = 300 + rnd() * 1800;
      s += gap;
      let R = radii[Math.floor(rnd() * radii.length)];
      if (i < 2 && R > 1000) R = 600 + rnd() * 400; // tight curves near Ueno
      const ang = (6 + rnd() * 26) * (Math.PI / 180);
      const trans = 50 + Math.min(130, R / 12);
      const arc = R * ang;
      const len = arc + trans;
      if (s + len > b) break;
      // keep bridges and elevated stations straight
      if (RIVERS.some((r) => s < r.s1 + 300 && s + len > r.s0 - 300) || VIADUCTS.some((v) => s < v.s1 && s + len > v.s0)) { s += len; continue; }
      // steer back toward north/north-north-east
      const target = -0.25; // slightly east of north overall
      let dir = heading > target ? -1 : 1;
      if (rnd() < 0.3) dir = -dir;
      curves.push({ s0: s, trans, arc, R, dir });
      heading += dir * ang;
      s += len;
    }
  }
  return curves;
}

export class Route {
  constructor() {
    this.stations = STATIONS.map((st, i) => ({ ...st, index: i, door: DOOR_SIDE[st.name] || 'left' }));
    this.curves = buildCurves();
    const n = S_MAX - S_MIN + 1;
    this.n = n;
    this.kappa = new Float32Array(n);
    for (const c of this.curves) {
      const k = c.dir / c.R;
      const s0 = Math.round(c.s0 - S_MIN);
      const t = Math.round(c.trans);
      const body = Math.round(c.arc - c.trans);
      // trans-in, body, trans-out (clothoid-ish via linear curvature ramps)
      for (let j = 0; j < t; j++) this.kappa[s0 + j] = k * (j / t);
      for (let j = 0; j < Math.max(0, body); j++) this.kappa[s0 + t + j] = k;
      for (let j = 0; j < t; j++) this.kappa[s0 + t + Math.max(0, body) + j] = k * (1 - j / t);
      c.sEnd = c.s0 + 2 * t + Math.max(0, body);
    }
    // integrate (heading 0 = -Z / north in three.js)
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.th = new Float64Array(n);
    let x = 0, z = 0, th = 0;
    // integrate from s=0 outwards so that 上野 sits at the origin
    const i0 = -S_MIN;
    this.x[i0] = 0; this.z[i0] = 0; this.th[i0] = 0;
    for (let i = i0 + 1; i < n; i++) {
      th += this.kappa[i - 1];
      x += -Math.sin(th);
      z += -Math.cos(th);
      this.x[i] = x; this.z[i] = z; this.th[i] = th;
    }
    x = 0; z = 0; th = 0;
    for (let i = i0 - 1; i >= 0; i--) {
      th -= this.kappa[i];
      x -= -Math.sin(th);
      z -= -Math.cos(th);
      this.x[i] = x; this.z[i] = z; this.th[i] = th;
    }
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

  /** gradient (rise per metre) */
  grade(s) { return (this.elev(s + 5) - this.elev(s - 5)) / 10; }

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
    if (s > 30300 || s < -1400) return [];
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
    L.push({ s0: 650, s1: 12900, v: 95 });
    L.push({ s0: 28700, s1: 30200, v: 85, why: '大宮構内' });
    L.push({ s0: 79000, s1: 80300, v: 95, why: '小山構内' });
    L.push({ s0: 107600, s1: 110500, v: 70, why: '宇都宮構内' });
    for (const c of this.curves) {
      let v = 120;
      if (c.R <= 600) v = 85;
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

  /** area density 0..1 for scenery */
  density(s) {
    let d = 0.15;
    if (s < 30500) d = 0.85;
    else if (s < 36000) d = 0.55;
    else if (s > 106500) d = 0.7;
    for (const st of this.stations) {
      const k = st.area === 'city' ? 0.75 : st.area === 'suburb' ? 0.55 : 0.35;
      const r = st.area === 'city' ? 1800 : 1100;
      const w = Math.max(0, 1 - Math.abs(s - st.s) / r);
      d = Math.max(d, k * w + 0.1);
    }
    return Math.min(1, d);
  }
}
