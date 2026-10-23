// Track layout across the corridor: our two running tracks, the extra platform tracks of the bigger
// stations, and the other lines beside us in pairs of tracks with their own island platforms.
// Lateral offsets: + = the down-track side, - = beyond the up track (lat of the up track = upOffset).
import { PLATFORM_LEN, TRACK_SPACING, ISLAND_W, SIDE_PF_W, PF_EDGE, STATION_TRACK } from './track-consts.js';
import { KM, NAMES, OUR_LAYOUT, lineGroups } from './layout-data.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const PAR_RAMP = 500;              // a parallel line curving away / joining over this length
const PAR_OUT = 45;                       // ... this far out
const GROUP_GAP = 4.6;                    // between two pairs of tracks
const OUR_RAMP = 220;                     // platform tracks spreading apart before a platform

/** weight 1 over [a, b], easing to 0 over `ramp` outside */
function win(s, a, b, ramp) { return smooth((s - (a - ramp)) / ramp) * (1 - smooth((s - b) / ramp)); }

/**
 * lay out a row of platform tracks / platforms (string of T, S, P) outwards from a track (prev = 'T')
 * or from a platform edge (prev = 'P'). Returns distances from the start: tracks [{d}], platforms [{d0, d1}].
 */
function parseRow(str, prev = 'T') {
  const tracks = [], platforms = [];
  let cur = 0, last = prev;
  for (const c of str) {
    if (c === 'T' || c === 'S') {
      cur = last === 'P' ? cur + PF_EDGE : last === 'gap' ? cur : cur + STATION_TRACK;
      tracks.push({ d: cur, siding: c === 'S' });
      last = 'T';
    } else if (c === 'P') {
      const d0 = cur + PF_EDGE;
      platforms.push({ d0, d1: d0 + ISLAND_W });
      cur = d0 + ISLAND_W;
      last = 'P';
    }
  }
  return { tracks, platforms, width: cur, endsWithPlatform: last === 'P' };
}

export class TrackLayout {
  /** route: a Route with stations / ST / upOffset / S_MIN / sMax */
  constructor(route) {
    this.route = route;
    const ours = route.stations;
    // --- sites: every station with platforms, ours and the parallel lines' --------------------
    const mids = new Map(ours.map((st) => [st.name, st.s - 150]));
    const at = (name) => {
      if (mids.has(name)) return mids.get(name);
      for (const k of Object.values(KM)) {
        if (k[name] == null) continue;
        const anchors = Object.keys(k).filter((n) => mids.has(n)).map((n) => ({ km: k[n], s: mids.get(n) })).sort((a, b) => a.km - b.km);
        if (anchors.length < 2) continue;
        let i = anchors.findIndex((x) => x.km > k[name]);
        i = i <= 0 ? (i === 0 ? 1 : anchors.length - 1) : i;
        const A = anchors[i - 1], B = anchors[i];
        const s = A.s + (k[name] - A.km) * (B.s - A.s) / (B.km - A.km);
        mids.set(name, s);
        return s;
      }
      return NaN;
    };
    this.at = at;
    this.groups = lineGroups(route.line, at, route.S_MIN).map((g, id) => ({ ...g, id, s0: Math.max(g.s0, route.S_MIN + 60), s1: Math.min(g.s1, route.sMax - 60) }));
    const sites = new Map();
    const site = (name) => {
      if (!sites.has(name)) {
        const st = ours.find((x) => x.name === name) || null;
        const mid = at(name);
        const [kana, en] = st && st.kana ? [st.kana, st.en] : (NAMES[name] || ['', '']);
        sites.set(name, { name, kana, en, mid, s: st ? st.s : mid + 150, ours: st, area: st ? st.area : 'city', groups: [] });
      }
      return sites.get(name);
    };
    for (const st of ours) site(st.name);
    for (const g of this.groups) {
      g.stops = (g.stops || []).map(([name, islands]) => {
        const mid = at(name);
        const len = g.cars * (g.shinkansen ? 25 : 20) + 10;
        const pf = [mid - len / 2, mid + len / 2];
        return { name, islands, mid, pf, a: pf[0] - 40, b: pf[1] + 40, ramp: islands > 1 ? 380 : OUR_RAMP };
      }).filter((x) => Number.isFinite(x.mid) && x.pf[0] > g.s0 - 1 && x.pf[1] < g.s1 + 1);
      for (const x of g.stops) { const si = site(x.name); si.groups.push({ g, stop: x }); x.site = si; }
    }
    this.sites = [...sites.values()].sort((a, b) => a.mid - b.mid);
    // --- our own extra tracks per station ---------------------------------------------------
    for (const si of this.sites) {
      const st = si.ours;
      si.a = si.s - PLATFORM_LEN - 60; si.b = si.s + 30;
      si.pf = [si.s - PLATFORM_LEN + 5, si.s + 15];
      if (!st) { si.plus = si.minus = null; si.blocks = []; continue; }
      const L = OUR_LAYOUT[st.name] || {};
      const left = st.door === 'left';
      const W = st.area === 'city' ? 9 : SIDE_PF_W;
      // own side platforms at left-door stations come first
      const plus = parseRow((left ? 'P' : '') + (L.plus || ''), 'T');
      if (left) { plus.platforms[0].d1 = plus.platforms[0].d0 + W; plus.platforms[0].own = true; for (const t of plus.tracks) t.d += W - ISLAND_W; for (const p of plus.platforms.slice(1)) { p.d0 += W - ISLAND_W; p.d1 += W - ISLAND_W; } plus.width += W - ISLAND_W; }
      const minus = parseRow((left ? 'P' : '') + (L.minus || ''), 'T');
      if (left) { minus.platforms[0].d1 = minus.platforms[0].d0 + SIDE_PF_W; minus.platforms[0].own = true; for (const t of minus.tracks) t.d += SIDE_PF_W - ISLAND_W; for (const p of minus.platforms.slice(1)) { p.d0 += SIDE_PF_W - ISLAND_W; p.d1 += SIDE_PF_W - ISLAND_W; } minus.width += SIDE_PF_W - ISLAND_W; }
      si.plus = plus; si.minus = minus;
      // every extra track as a distance from our down track (+) / up track (-), and further blocks after a gap
      si.extra = [];
      plus.tracks.forEach((x) => si.extra.push({ side: 1, d: x.d, siding: x.siding }));
      minus.tracks.forEach((x) => si.extra.push({ side: -1, d: x.d, siding: x.siding }));
      si.blocks = [];
      let cp = plus.width + (plus.endsWithPlatform ? 1 : 0), cm = minus.width + (minus.endsWithPlatform ? 1 : 0);
      for (const B of L.blocks || []) {
        const row = parseRow(B.str, 'gap');
        const start = (B.side > 0 ? cp : cm) + GROUP_GAP;
        si.blocks.push({ ...B, row, start });
        row.tracks.forEach((x) => si.extra.push({ side: B.side, d: start + x.d, siding: x.siding, stopSouth: B.stop === 'south' }));
        const end = start + row.width + (row.endsWithPlatform ? 1 : 0);
        if (B.side > 0) cp = end; else cm = end;
      }
      si.wPlus = cp; si.wMinus = cm;
      si.ramp = Math.min(520, Math.max(OUR_RAMP, 150 + 9 * Math.max(cp, cm)));
    }
    this.ourSites = this.sites.filter((x) => x.ours);
    this._cache = new Map();
  }

  /** the site whose layout acts at s (stations are kilometres apart) */
  ourSiteAt(s) {
    const list = this.ourSites;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].b + list[m].ramp < s) lo = m + 1; else hi = m; }
    for (let i = lo; i < list.length && i < lo + 2; i++) { const si = list[i]; if (s >= si.a - si.ramp && s <= si.b + si.ramp) return si; }
    return null;
  }

  /** spreading weight of a site's platform tracks at s */
  siteWeight(si, s) { return win(s, si.a, si.b, si.ramp); }

  // --- our side of the corridor -----------------------------------------------------------
  /** lateral offset of extra track e of site si at s */
  ourExtraLat(si, e, s) {
    const w = e.stopSouth && s < si.b ? 1 : this.siteWeight(si, s);
    return e.side > 0 ? e.d * w : this.route.upOffset(s) - e.d * w;
  }

  /** lateral offsets of our extra station tracks at s */
  ourExtraTracks(s) {
    const si = this.ourSiteAt(s);
    if (!si) return [];
    return si.extra.filter((e) => !(e.stopSouth && s < si.pf[0] - 5)).map((e) => this.ourExtraLat(si, e, s));
  }

  /** outermost lateral of our side of the corridor (tracks and platforms), + side and - side */
  ourExtent(s) {
    const up = this.route.upOffset(s);
    const si = this.ourSiteAt(s);
    if (!si) return { plus: 0, minus: up };
    const w = this.siteWeight(si, s);
    let plus = si.wPlus * w, minus = up - si.wMinus * w;
    // terminal tracks stay at full width south of the platforms' far end
    for (const e of si.extra) if (e.stopSouth && s < si.b && s >= si.pf[0] - 5) { if (e.side > 0) plus = Math.max(plus, e.d + 1); else minus = Math.min(minus, up - e.d - 1); }
    return { plus, minus };
  }

  // --- parallel lines -------------------------------------------------------------------------
  /** island spreading of a group at s: weight and the stop it belongs to */
  groupStop(g, s) {
    let best = null, bw = 0;
    for (const x of g.stops) {
      if (s < x.a - x.ramp || s > x.b + x.ramp) continue;
      const w = win(s, x.a, x.b, x.ramp);
      if (w > bw) { bw = w; best = x; }
    }
    return { w: bw, stop: best };
  }

  /** lateral distances of a group's tracks from its inner track at s (outwards, all >= 0) */
  groupTrackDists(g, s) {
    const { w, stop } = this.groupStop(g, s);
    const d = [0, TRACK_SPACING + w * (ISLAND_W + 2 * PF_EDGE - TRACK_SPACING)];
    const n = stop ? stop.islands : 1;
    for (let k = 1; k < n; k++) {
      const a = d[1] + STATION_TRACK + (k - 1) * (2 * PF_EDGE + ISLAND_W + STATION_TRACK);
      d.push(d[1] + (a - d[1]) * w, d[1] + (a + 2 * PF_EDGE + ISLAND_W - d[1]) * w);
    }
    return d;
  }

  groupWidth(g, s) { const d = this.groupTrackDists(g, s); return d[d.length - 1]; }

  groupsIn(a, b = a) { return this.groups.filter((g) => g.s0 - PAR_RAMP <= b && g.s1 + PAR_RAMP >= a); }

  /** the inner track of a group at x (inside its extent) */
  groupBase(g, x) {
    const side = g.side;
    const ext = this.ourExtent(x);
    let base = side < 0 ? ext.minus - 5.0 : ext.plus + 5.0;
    for (const h of this.groups) {
      if (h.side !== side || h.slot >= g.slot || x < h.s0 - PAR_RAMP || x > h.s1 + PAR_RAMP) continue;
      // a lower slot that is there pushes us out by its width (plus its curving away at its ends)
      const wh = this.groupWidth(h, Math.min(h.s1, Math.max(h.s0, x)));
      const u = x < h.s0 ? smooth((h.s0 - x) / PAR_RAMP) : x > h.s1 ? smooth((x - h.s1) / PAR_RAMP) : 0;
      const kind = x < h.s0 ? h.end0 : h.end1;
      const fade = kind === 'stop' || kind === 'merge' ? u : 0;
      base += side * (wh + GROUP_GAP) * (1 - fade);
    }
    // unused lower slots keep their room (the lines do not shift sideways where another one ends)
    const used = new Set(this.groups.filter((h) => h.side === side && h.slot < g.slot && x >= h.s0 - PAR_RAMP && x <= h.s1 + PAR_RAMP).map((h) => h.slot));
    for (let k = 0; k < g.slot; k++) if (!used.has(k)) base += side * (TRACK_SPACING + GROUP_GAP);
    return base;
  }

  /** lateral offset of track i of group g at s (clamped to where it has track) */
  groupOffset(g, i, s) {
    const lo = g.end0 === 'stop' ? g.s0 : g.s0 - PAR_RAMP, hi = g.end1 === 'stop' ? g.s1 : g.s1 + PAR_RAMP;
    const x = Math.min(hi, Math.max(lo, s));
    const d = this.groupTrackDists(g, x);
    const o = this.groupBase(g, x) + g.side * d[Math.min(i, d.length - 1)];
    const end = (kind, u) => {
      if (u <= 0 || kind === 'none' || kind === 'stop') return o;
      if (kind === 'merge') return o + ((i % 2 === 0 ? 0 : this.route.upOffset(x)) - o) * u;
      return o + g.side * PAR_OUT * u * u;
    };
    if (x < g.s0) return end(g.end0, 1 - smooth((x - (g.s0 - PAR_RAMP)) / PAR_RAMP));
    if (x > g.s1) return end(g.end1, smooth((x - g.s1) / PAR_RAMP));
    return o;
  }

  /** the stretch a group's track i exists over */
  groupTrackRange(g, i) {
    const lo = g.end0 === 'stop' ? g.s0 : g.end0 === 'none' ? this.route.S_MIN : g.s0 - PAR_RAMP;
    const hi = g.end1 === 'stop' ? g.s1 : g.end1 === 'none' ? this.route.sMax : g.s1 + PAR_RAMP;
    if (i < 2) return [lo, hi];
    // the extra island tracks only exist around the stops that have them
    const k = Math.floor(i / 2);
    const st = g.stops.filter((x) => x.islands > k);
    return st.length ? [Math.max(lo, Math.min(...st.map((x) => x.a - x.ramp))), Math.min(hi, Math.max(...st.map((x) => x.b + x.ramp)))] : [0, -1];
  }

  /** extra tracks of a group around one stop: [{i, s0, s1}] */
  groupTracks(g, a, b) {
    const out = [];
    const nMax = Math.max(1, ...g.stops.map((x) => x.islands));
    for (let i = 0; i < 2 * nMax; i++) {
      if (i < 2) { const [lo, hi] = this.groupTrackRange(g, i); if (hi >= a && lo <= b) out.push({ i, s0: lo, s1: hi }); continue; }
      const k = Math.floor(i / 2);
      for (const x of g.stops) {
        if (x.islands <= k) continue;
        const lo = x.a - x.ramp, hi = x.b + x.ramp;
        if (hi >= a && lo <= b) out.push({ i, s0: lo, s1: hi });
      }
    }
    return out;
  }

  // --- everything together --------------------------------------------------------------------
  /** all tracks with any length in [a, b]: [{ off(s), s0, s1, kind, group?, i? }] */
  tracksIn(a, b) {
    const r = this.route;
    const list = [
      { off: () => 0, s0: -Infinity, s1: Infinity, kind: 'ours' },
      { off: (x) => r.upOffset(x), s0: -Infinity, s1: Infinity, kind: 'ours' },
    ];
    for (const si of this.ourSites) {
      if (si.b + si.ramp < a || si.a - si.ramp > b) continue;
      for (const e of si.extra) {
        const lo = e.stopSouth ? si.pf[0] - 5 : si.a - si.ramp, hi = si.b + si.ramp;
        list.push({ off: (x) => this.ourExtraLat(si, e, Math.min(hi, Math.max(lo, x))), s0: lo, s1: hi, kind: 'station', site: si, siding: e.siding, stopAt: e.stopSouth ? 's0' : null });
      }
    }
    for (const g of this.groupsIn(a, b)) {
      for (const t of this.groupTracks(g, a, b)) {
        list.push({ off: (x) => this.groupOffset(g, t.i, x), s0: t.s0, s1: t.s1, kind: 'group', group: g, i: t.i, stopAt: t.i < 2 ? (g.end0 === 'stop' ? 's0' : g.end1 === 'stop' ? 's1' : null) : null });
      }
    }
    return list;
  }

  /** lateral offsets of all tracks other than our two at s */
  extraTracks(s) {
    const out = this.ourExtraTracks(s);
    for (const g of this.groupsIn(s)) for (const t of this.groupTracks(g, s, s)) out.push(this.groupOffset(g, t.i, s));
    return out;
  }

  /** the corridor's outer edges at s (tracks and platforms), for embankments, viaducts and scenery */
  span(s) {
    const e = this.ourExtent(s);
    let lo = Math.min(e.minus, this.route.upOffset(s)), hi = Math.max(e.plus, 0);
    for (const x of this.extraTracks(s)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    // island platforms of the parallel lines lie between their tracks: covered by the tracks
    return { min: lo, max: hi };
  }

  /** platforms at a site: [{edgeA(s), edgeB(s), island, side, a, b, line, own}] (edgeA nearer our track) */
  platformsAt(si) {
    const r = this.route;
    const out = [];
    const st = si.ours;
    if (st) {
      const a = si.pf[0], b = si.pf[1];
      if (st.door === 'right') out.push({ edgeA: () => -PF_EDGE, edgeB: (s) => r.upOffset(s) + PF_EDGE, island: true, a, b, line: null, own: true });
      const up = (s) => r.upOffset(s);
      const plusPf = si.plus.platforms, minusPf = si.minus.platforms;
      const lastPT = si.plus.tracks.length ? si.plus.tracks[si.plus.tracks.length - 1].d : 0;
      const lastMT = si.minus.tracks.length ? si.minus.tracks[si.minus.tracks.length - 1].d : 0;
      for (const p of plusPf) {
        const island = lastPT > p.d1;
        out.push({ edgeA: () => p.d0, edgeB: () => p.d1, island, side: 1, a, b, line: null, own: !!p.own });
      }
      for (const p of minusPf) {
        const island = lastMT > p.d1;
        out.push({ edgeA: (s) => up(s) - p.d0, edgeB: (s) => up(s) - p.d1, island, side: -1, a, b, line: null, own: !!p.own });
      }
      for (const B of si.blocks) {
        const lastT = B.row.tracks.length ? B.row.tracks[B.row.tracks.length - 1].d : 0;
        for (const p of B.row.platforms) {
          const island = lastT > p.d1;
          const d0 = B.start + p.d0, d1 = B.start + p.d1;
          out.push(B.side > 0
            ? { edgeA: () => d0, edgeB: () => d1, island, side: 1, a, b, line: B.name }
            : { edgeA: (s) => up(s) - d0, edgeB: (s) => up(s) - d1, island, side: -1, a, b, line: B.name });
        }
      }
    }
    for (const { g, stop } of si.groups) {
      const n = stop.islands;
      for (let k = 0; k < n; k++) {
        // island k lies between tracks 2k+1 and 2k (k = 0) / 2k and 2k+1 (k > 0)
        const ia = k === 0 ? 0 : 2 * k, ib = k === 0 ? 1 : 2 * k + 1;
        const e = (s, i, inward) => this.groupOffset(g, i, s) + g.side * (inward ? -PF_EDGE : PF_EDGE);
        out.push({
          edgeA: (s) => e(s, ia, false), edgeB: (s) => e(s, ib, true),
          island: true, side: g.side, a: stop.pf[0], b: stop.pf[1], line: g.name, color: g.color, group: g, shinkansen: !!g.shinkansen,
        });
      }
    }
    return out;
  }

  /** sites with platforms near [a, b] */
  sitesIn(a, b) {
    return this.sites.filter((si) => {
      let lo = si.ours ? si.pf[0] : Infinity, hi = si.ours ? si.pf[1] : -Infinity;
      for (const { stop } of si.groups) { lo = Math.min(lo, stop.pf[0]); hi = Math.max(hi, stop.pf[1]); }
      return hi >= a && lo <= b;
    });
  }
}
