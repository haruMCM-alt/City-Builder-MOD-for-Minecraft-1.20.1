// Other trains, run to a timetable: every line has trains leaving its ends at a fixed interval;
// where a train is follows from the game clock (accelerating, running, braking and standing at its
// stations), so they keep to the diagram whatever the player does. Terminals (中央線 and the 新幹線 at
// 東京) turn trains round. Only the trains near the player are built.

/** a run: piecewise constant acceleration phases {t0, dur, s0, v0, a, dir} */
class Profile {
  constructor() { this.ph = []; this.T = 0; }
  add(dur, s0, v0, a, dir, stop = null) {
    if (dur <= 1e-6) return;
    this.ph.push({ t0: this.T, dur, s0, v0, a, dir, stop });
    this.T += dur;
  }
  /** state at time tau from the start: {s, v, dir, stop, leg} */
  at(tau) {
    const ph = this.ph;
    let lo = 0, hi = ph.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ph[m].t0 <= tau) lo = m; else hi = m - 1; }
    const p = ph[lo];
    const t = Math.min(p.dur, Math.max(0, tau - p.t0));
    return { s: p.s0 + p.dir * (p.v0 * t + 0.5 * p.a * t * t), v: Math.max(0, p.v0 + p.a * t), dir: p.dir, stop: p.stop, leg: p.leg };
  }
}

/**
 * build a run through points [{s, dwell}] in order, starting at speed vIn and leaving at vOut.
 * The first point may have a dwell (a train standing at a terminal). vmax m/s, acc / dec m/s².
 * A point with turn: true reverses the direction there (the train's other end leads).
 */
function buildRun(points, { vmax, acc, dec, vIn = vmax, vOut = vmax, len = 200 }) {
  const P = new Profile();
  let leg = 0;
  let v = vIn;
  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i], B = points[i + 1];
    let from = A.s;
    // reversing at a terminal: the other end of the train leads away
    if (A.turn) { from = A.s + A.dirIn * -len; leg++; }
    const dir = Math.sign(B.s - from) || 1;
    const D = Math.abs(B.s - from);
    const vB = B.dwell ? 0 : vOut;
    // trapezoid: accelerate to vp, cruise, brake to vB
    const dA = (vmax * vmax - v * v) / (2 * acc), dB = (vmax * vmax - vB * vB) / (2 * dec);
    let vp = vmax, cruise = D - Math.max(0, dA) - dB;
    if (cruise < 0) { vp = Math.sqrt(Math.max(vB * vB, (2 * D + v * v / acc + vB * vB / dec) / (1 / acc + 1 / dec))); cruise = 0; }
    let s = from;
    const tA = Math.max(0, (vp - v) / acc);
    const mark = P.ph.length;
    if (tA > 0) { P.add(tA, s, v, acc, dir); s += dir * (v * tA + 0.5 * acc * tA * tA); }
    else if (v > vp) { const tD = (v - vp) / dec; P.add(tD, s, v, -dec, dir); s += dir * (v * tD - 0.5 * dec * tD * tD); }
    if (cruise > 0) { P.add(cruise / vp, s, vp, 0, dir); s += dir * cruise; }
    const tB = (vp - vB) / dec;
    if (tB > 0) P.add(tB, s, vp, -dec, dir);
    if (B.dwell) P.add(B.dwell, B.s, 0, 0, dir, B);
    for (let k = mark; k < P.ph.length; k++) P.ph[k].leg = leg;
    v = vB;
  }
  for (const p of P.ph) if (p.leg == null) p.leg = 0;
  return P;
}

function hash(a, b) { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }

// how each line runs: interval (s), top speed (km/h) near us, dwell (s)
const SERVICE = {
  keihin: { every: 300, v: 90, dwell: 25 },
  yamanote: { every: 240, v: 90, dwell: 25 },
  joban: { every: 600, v: 100, dwell: 35 },
  chuo: { every: 300, v: 90, dwell: 30, turn: 300 },
  sobu: { every: 300, v: 85, dwell: 30 },
  yokosuka: { every: 600, v: 110, dwell: 35 },
  saikyo: { every: 480, v: 90, dwell: 30 },
  local: { every: 600, v: 110, dwell: 35 },
  'tohoku-cargo': { every: 900, v: 110, dwell: 35 },
  freight: { every: 1200, v: 95, dwell: 0 },
  'shin-tokaido': { every: 420, v: 110, dwell: 90, turn: 840 },
  'shin-tohoku': { every: 600, v: 110, dwell: 90, turn: 1080 },
  main: { every: 720, v: 105, dwell: 35 },
};

export class Traffic {
  /**
   * ctx: { scene, route, view, sound, clock(): seconds of day, listenerS(): route s of the listener,
   *        make(kind, forward, k): {group, length, nCars, veh, shinkansen?, place(sFront, off, dir), dispose()},
   *        axleOffsets(n), jointAt(pos, kmh, dt) }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.runs = [];
    this.live = new Map();     // key → train
    this.parked = new Map();
    this.pose = {};
    const r = ctx.route, view = ctx.view;
    // --- the other lines -----------------------------------------------------------------
    for (const g of r.parallels) {
      const S = SERVICE[g.kind] || SERVICE.keihin;
      const lo = g.end0 === 'stop' ? g.s0 : g.end0 === 'none' ? r.sMin + 50 : g.s0 - 500;
      const hi = g.end1 === 'stop' ? g.s1 : g.end1 === 'none' ? r.sMax - 50 : g.s1 + 500;
      const stopsFor = (dir, pass = g.pass) => (pass ? [] : g.stops)
        .map((x) => ({ s: dir > 0 ? x.pf[1] - 5 : x.pf[0] + 5, dwell: S.dwell * (x.islands > 1 ? 1.5 : 1), name: x.name }))
        .sort((a, b) => dir * (a.s - b.s));
      const len = g.shinkansen ? 404 : g.cars * 20;
      const base = { vmax: S.v / 3.6, acc: g.shinkansen ? 0.55 : 0.8, dec: 0.85, len };
      const term0 = g.end0 === 'stop', term1 = g.end1 === 'stop';
      const mk = (dir, points, kind = g.kind, every = S.every) => {
        const prof = buildRun(points, base);
        // when it leaves each station (seconds after it set off), for the departure boards
        const deps = [];
        for (const ph of prof.ph) if (ph.stop && ph.stop.name) deps.push({ name: ph.stop.name, tau: ph.t0 + ph.dur, dir: ph.dir === prof.ph[Math.min(prof.ph.length - 1, prof.ph.indexOf(ph) + 1)].dir ? ph.dir : -ph.dir });
        this.runs.push({ g, kind, dir, prof, deps, every, phase: hash(g.id + (kind === g.kind ? 0 : 50), dir) * every, track: (d, k, x) => trackFor(g, d, k, x), len });
      };
      const term = g.end0 === 'stop' || g.end1 === 'stop';
      const terminalStop = term ? g.stops.find((x) => Math.abs((g.end0 === 'stop' ? x.pf[0] - g.s0 : x.pf[1] - g.s1)) < 30) : null;
      const trackFor = (gg, d, k, x) => {
        const run = d > 0 ? 0 : 1;
        // at a terminal the trains spread over all its platform tracks, crossing over in the throat
        if (terminalStop) {
          const n = 2 * terminalStop.islands;
          const iPf = ((k % n) + n) % n;
          const { w, stop } = r.layout.groupStop(gg, x);
          const ws = stop === terminalStop ? w : 0;
          if (ws <= 0 || iPf === run) return r.parallelOffset(gg, run, x);
          return r.parallelOffset(gg, run, x) * (1 - ws) + r.parallelOffset(gg, iPf, x) * ws;
        }
        // northbound on the inner track, southbound on the outer; at stations with two islands every
        // other southbound train takes the second island
        const i = d > 0 ? 0 : (k % 2 && gg.stops.some((st) => st.islands > 1 && Math.abs(x - st.mid) < 900) ? 2 : 1);
        return r.parallelOffset(gg, i, x);
      };
      if (term0 || term1) {
        // trains come in, turn round at the terminal and go out again
        const tEnd = term0 ? g.s0 : g.s1;
        const inDir = term0 ? -1 : 1;
        const terminal = (g.stops.find((x) => Math.abs((term0 ? x.pf[0] : x.pf[1]) - tEnd) < 30) || g.stops[0]);
        const stIn = stopsFor(inDir).filter((x) => x.name !== terminal.name);
        const stOut = stopsFor(-inDir).filter((x) => x.name !== terminal.name);
        const stopIn = inDir > 0 ? terminal.pf[1] - 5 : terminal.pf[0] + 5;
        const points = [{ s: inDir > 0 ? lo : hi }, ...stIn, { s: stopIn, dwell: S.turn || 300, turn: true, dirIn: inDir, name: terminal.name }, ...stOut, { s: inDir > 0 ? lo : hi }];
        mk(inDir, points);
      } else {
        const both = g.end1 === 'merge' ? [-1] : g.end0 === 'merge' ? [1] : [1, -1];
        for (const dir of both) {
          const a = dir > 0 ? lo : hi, b = dir > 0 ? hi : lo;
          mk(dir, [{ s: a }, ...stopsFor(dir).filter((x) => (x.s - a) * dir > 50 && (b - x.s) * dir > 50), { s: b }]);
          // the 東北貨物線 also carries freight trains, straight through
          if (g.kind === 'tohoku-cargo') mk(dir, [{ s: a }, { s: b }], 'freight', 1800);
        }
      }
    }
    // --- our own line: trains the other way on the other track, stopping at the stations ------
    const dirM = view.up ? 1 : -1;
    const S = SERVICE.main;
    const stops = r.stations.map((st) => ({ s: dirM > 0 ? st.s : st.s - 300, dwell: st.dwell || S.dwell, name: st.name }))
      .sort((a, b) => dirM * (a.s - b.s));
    const a = dirM > 0 ? r.sMin + 50 : r.sMax - 50, b = dirM > 0 ? r.sMax - 50 : r.sMin + 50;
    const prof = buildRun([{ s: a }, ...stops.filter((x) => (x.s - a) * dirM > 50 && (b - x.s) * dirM > 50), { s: b }], { vmax: S.v / 3.6, acc: 0.7, dec: 0.8 });
    const deps = prof.ph.filter((ph) => ph.stop && ph.stop.name).map((ph) => ({ name: ph.stop.name, tau: ph.t0 + ph.dur, dir: dirM }));
    this.runs.push({ g: null, kind: 'main', dir: dirM, prof, deps, every: S.every, phase: 137, track: () => (dirM > 0 ? (() => 0) : (x) => r.upOffset(x)), len: 300 });
  }

  /** trains standing on our extra station tracks near s (built / dropped as the player moves) */
  updateParked(here) {
    const r = this.ctx.route, L = r.layout;
    const want = new Set();
    for (const si of L.ourSites) {
      if (!si.extra.length || si.b < here - 1600 || si.a > here + 1600) continue;
      si.extra.forEach((e, j) => {
        if (hash(Math.round(si.mid), j + 7) > 0.6) return;
        const key = `${si.name}|${j}`;
        want.add(key);
        if (this.parked.has(key)) return;
        // trains face either way; on terminal tracks they stand at the buffer stops
        const forward = e.stopSouth ? false : hash(j, Math.round(si.mid) + 3) < 0.5;
        const set = this.ctx.make('parked', forward, j, null);
        const lo = e.stopSouth ? si.pf[0] - 5 : si.a - si.ramp, hi = si.b + si.ramp;
        const off = (x) => L.ourExtraLat(si, e, Math.min(hi, Math.max(lo, x)));
        const front = forward ? si.pf[1] - 8 : si.pf[0] + 8;
        set.place(front, off, forward ? 1 : -1);
        this.parked.set(key, { set, s: front, dir: forward ? 1 : -1 });
      });
    }
    for (const [key, t] of this.parked) if (!want.has(key)) { t.set.dispose(); this.parked.delete(key); }
  }

  /** the next departures of a line from a station after time T: [{t, dir, kind}] (soonest first) */
  departures(g, name, T, n = 2) {
    const out = [];
    for (const run of this.runs) {
      if (run.g !== g || !run.deps) continue;
      for (const d of run.deps) {
        if (d.name !== name) continue;
        const k = Math.ceil((T - run.phase - d.tau) / run.every);
        for (let j = 0; j < n; j++) out.push({ t: run.phase + (k + j) * run.every + d.tau, dir: d.dir, kind: run.kind });
      }
    }
    return out.sort((a, b) => a.t - b.t).slice(0, n);
  }

  /** trains for the level crossings: front, length, direction */
  get list() { return [...this.live.values()].map((t) => ({ s: t.s, len: t.set.length, dirReal: t.dir, set: t.set })); }

  clear() {
    for (const t of this.live.values()) this.drop(t);
    this.live.clear();
    for (const t of this.parked.values()) t.set.dispose();
    this.parked.clear();
  }

  drop(t) { t.set.dispose(); if (t.voice) t.voice.dispose(); }

  update(dt, sp) {
    const { route: r, view, sound, clock } = this.ctx;
    const T = clock();
    const here = view.toRoute(sp);
    const lis = this.ctx.listenerS();
    const near = 2400;
    this.updateParked(here);
    const want = new Map();
    let built = 0;
    for (const run of this.runs) {
      if (run.g && (run.g.s1 + 900 < here - near || run.g.s0 - 900 > here + near)) continue;
      const P = run.prof;
      const kLo = Math.ceil((T - P.T - run.phase) / run.every), kHi = Math.floor((T - run.phase) / run.every);
      for (let k = kLo; k <= kHi; k++) {
        const tau = T - run.phase - k * run.every;
        const st = P.at(tau);
        const tail = st.s - st.dir * run.len;
        if (Math.max(st.s, tail) < here - near || Math.min(st.s, tail) > here + near) continue;
        const key = `${run.kind}|${run.g ? run.g.id : 'm'}|${run.dir}|${k}|${st.leg}`;
        want.set(key, { run, k, st });
      }
    }
    for (const [key, t] of this.live) if (!want.has(key)) { this.drop(t); this.live.delete(key); }
    for (const [key, w] of want) {
      let t = this.live.get(key);
      if (!t) {
        if (built >= 1) continue;          // one new train per frame at most
        built++;
        const kind = w.run.kind;
        const set = this.ctx.make(kind, w.st.dir > 0, w.k, w.run.g);
        t = { set, key, dir: w.st.dir, s: w.st.s, v: 0, voice: null, axles: set.shinkansen ? [] : this.ctx.axleOffsets(set.nCars), torque: kind === 'freight' ? 0.5 : 0.25 };
        this.live.set(key, t);
      }
      const prev = t.s;
      t.s = w.st.s; t.v = w.st.v; t.dir = w.st.dir;
      const k = w.k, run = w.run;
      const off = run.g ? (x) => run.track(t.dir, k, x) : run.track();
      t.off = off;
      t.set.place(t.s, off, t.dir);
      // rail joints under every axle (EMUs and freight), near the listener
      if (t.axles.length && Math.abs(t.s - lis) < 700 && t.v > 0.5 && Math.abs(t.s - prev) < 50) {
        for (const ax of t.axles) {
          const a = prev - t.dir * ax, b = t.s - t.dir * ax;
          if (Math.floor(a / 25) !== Math.floor(b / 25)) {
            const sj = Math.max(Math.floor(a / 25), Math.floor(b / 25)) * 25;
            const p = r.pose(sj, off(sj), this.pose);
            sound.jointAt({ x: p.x, y: p.y + 0.3, z: p.z }, t.v * 3.6, false, Math.abs(b - sj) / Math.max(t.v, 0.5));
          }
        }
      }
      // a voice only for the trains near the listener
      const d = Math.min(Math.abs(t.s - lis), Math.abs(t.s - t.dir * t.set.length - lis));
      if (!t.voice && d < 700) t.voice = t.set.makeVoice ? t.set.makeVoice() : null;
      else if (t.voice && d > 950) { t.voice.dispose(); t.voice = null; }
      if (t.voice) {
        const pos = [0.08, 0.5, 0.92].map((f) => {
          const sv = t.s - t.dir * t.set.length * f;
          const p = r.pose(sv, off(sv), {});
          return { x: p.x, y: p.y + 0.8, z: p.z };
        });
        if (t.set.shinkansen) t.voice.update(pos, t.v * 3.6);
        else t.voice.update(pos, t.v * 3.6, t.v > 0.3 ? t.torque : 0, { curvature: r.curvature(t.s), brake: 0 });
      }
    }
  }
}
