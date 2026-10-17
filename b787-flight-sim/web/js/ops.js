// "All runways in use": the extra traffic of every airport on the runways and stands that
// blender/ops_layout.py adds (world.json / airportN.json "ops").
//
//   Haneda   runway A (34L/16R) arrivals, B (04/22) departures, D (05/23) both; 26 stands at the
//            terminal facing runway A.  Runway C (34R/16L) keeps its own traffic (traffic.js).
//   Kansai, New Chitose, Naha
//            the second runway for arrivals and departures, the main runway for departures
//            (shared with the shuttles from Haneda); the extended main pier and Kansai's
//            terminal 2 on the second island.
//
// Each flight: straight-in approach from ~20 km on a 3-degree path -> landing roll -> exit at the
// first connector it can make -> taxi (shortest path on the taxiway graph; no taxiway crosses a
// runway) -> stand -> turnaround -> push-back -> taxi to the departure runway's entry -> hold short
// until the runway is free and no arrival is close -> take-off -> climb out and leave.
// One aircraft at a time on each runway; aircraft on the ground keep their distance.  The
// traffic of an airport runs while the camera is within ~55 km of it.
import { Path, Mover } from './path.js';
import { AIAircraft } from './traffic.js';
import { aptName } from './atc.js';
import { runwayWords } from './airports.js';
import { GEO } from './geo_data.js';
import { DEG, clamp, lerp } from './util.js';

const TAN3 = Math.tan(3 * DEG);
const G = 9.81;
const ACTIVE_R = 55000, SLEEP_R = 70000;
const key = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

class Graph {
  constructor(lines, ox, oz) {
    this.nodes = []; this.idx = new Map(); this.adj = [];
    const id = (p) => {
      const x = p[0] + ox, z = p[1] + oz, k = key(x, z);
      if (!this.idx.has(k)) { this.idx.set(k, this.nodes.length); this.nodes.push({ x, z }); this.adj.push([]); }
      return this.idx.get(k);
    };
    // lines: { p: [[x, z] ...], o: 1 one-way in the order of the points }
    for (const line of lines) {
      const P = line.p;
      for (let i = 0; i + 1 < P.length; i++) {
        const a = id(P[i]), b = id(P[i + 1]);
        if (a === b) continue;
        const d = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
        this.adj[a].push([b, d]);
        if (!line.o) this.adj[b].push([a, d]);
      }
    }
  }

  find(x, z) { return this.idx.get(key(x, z)) ?? this.nearest(x, z); }

  nearest(x, z) {
    let best = 0, bd = Infinity;
    this.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // Dijkstra: node indices from a to b (inclusive), or null
  route(a, b) {
    const n = this.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[a] = 0;
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const [v, w] of this.adj[u]) if (du + w < dist[v]) { dist[v] = du + w; prev[v] = u; }
    }
    if (!isFinite(dist[b])) return null;
    const out = [];
    for (let u = b; u >= 0; u = prev[u]) out.unshift(u);
    return out;
  }
}

class Runway {
  constructor(d, ox, oz) {
    Object.assign(this, d);
    this.cx = d.c[0] + ox; this.cz = d.c[1] + oz;
    this.dx = d.dir[0]; this.dz = d.dir[1];
    this.conns = d.conns.map((c) => ({ s: c.s, rx: c.rwy[0] + ox, rz: c.rwy[1] + oz, tx: c.twy[0] + ox, tz: c.twy[1] + oz }));
    this.occ = null;          // the aircraft that holds the runway (landing roll / line-up / take-off)
    this.sgn = 1;
    this.nextArr = 0;
  }

  // flow: world direction of the airport's landings / take-offs
  setFlow(fx, fz) { this.sgn = this.dx * fx + this.dz * fz >= 0 ? 1 : -1; }
  get lx() { return this.dx * this.sgn; }
  get lz() { return this.dz * this.sgn; }
  get name() { return this.sgn > 0 ? this.names[0] : this.names[1]; }
  get words() { return runwayWords(this.name); }
  // threshold of the landing / take-off direction
  get thrX() { return this.cx - this.lx * this.len / 2; }
  get thrZ() { return this.cz - this.lz * this.len / 2; }
  along(x, z) { return (x - this.thrX) * this.lx + (z - this.thrZ) * this.lz; }
  // connectors ordered along the flow (take-off end first)
  ordered() { return this.conns.slice().sort((a, b) => (a.s - b.s) * this.sgn); }
}

export class AirportOps {
  // ap: { id, x, z } (home: id 1 at 0, 0); data: the "ops" block of world.json / airportN.json
  constructor(traffic, ap, data) {
    this.t = traffic; this.ap = ap; this.data = data;
    this.g = new Graph(data.lines, ap.x, ap.z);
    this.runways = data.runways.map((r) => new Runway(r, ap.x, ap.z));
    const face = (s) => (s.face > 0 ? -Math.PI / 2 : Math.PI / 2);   // nose towards the terminal
    this.stands = data.stands.map((s) => ({ id: s.id, x: s.x + ap.x, z: s.z + ap.z, a: face(s), lx: s.lane[0] + ap.x, lz: s.lane[1] + ap.z,
      node: -1, busy: null, cg: [s.x + ap.x, 0, s.z + ap.z] }));
    for (const s of this.stands) s.node = this.g.find(s.lx, s.lz);
    this.list = [];
    this.active = false;
    this.rate = (GEO.traffic[ap.id]?.rate || 0.5);
    this.time = 0;
  }

  // ------------------------------------------------------------------ helpers
  _say(who, text, delay = 0) {
    const R = this.t.radio;
    if (!R) return;
    const w = (who === 'TWR' || who === 'GND') && this.ap.id > 1 ? who + this.ap.id : who;
    const f = () => R.say(w, text, { apt: this.ap.id });
    if (delay) this.t._later(delay, f); else f();
  }

  _twr() { return this.ap.id > 1 ? `${aptName(this.ap.id)} Tower` : 'Tower'; }

  _flow() {
    // the same direction as the airport's other traffic: Haneda C's active runway, the shuttles'
    // runway at the remote airports (Traffic.rwSide)
    if (this.ap.id === 1) return this.t.rwy === '27' ? [-1, 0] : [1, 0];
    return [this.ap.x >= 0 ? 1 : -1, 0];
  }

  _freeStand() {
    const free = this.stands.filter((s) => !s.busy);
    return free.length ? free[Math.floor(this.t.rnd() * free.length)] : null;
  }

  _newAircraft(stand) {
    const ac = new AIAircraft(this.t, stand, this.t._randLiv(), this.t.rnd);
    ac.ops = this;
    stand.busy = ac; ac.opsStand = stand;
    return ac;
  }

  _parkAt(ac, st) {
    const sh = ac.tm.standShift;
    ac.x = st.x + Math.cos(st.a) * sh; ac.z = st.z + Math.sin(st.a) * sh; ac.a = st.a;
    ac.alt = 0; ac.v = 0; ac.pitch = 0; ac.bank = 0; ac.gear = 0; ac.flap = 0; ac.slat = 0; ac.spoiler = 0; ac.n1 = 0;
  }

  _remove(ac) {
    this.t.scene.remove(ac.static);
    if (ac.art) this.t._release(ac.art);
    ac.art = null;
    if (ac.opsStand && ac.opsStand.busy === ac) ac.opsStand.busy = null;
    for (const r of this.runways) if (r.occ === ac) r.occ = null;
    this.list = this.list.filter((a) => a !== ac);
  }

  // ------------------------------------------------------------------ activation near the camera
  _activate() {
    this.active = true;
    this.time = 0;
    const [fx, fz] = this._flow();
    for (const r of this.runways) { r.setFlow(fx, fz); r.occ = null; r.nextArr = 20 + this.t.rnd() * 60; }
    // the middle of the day: most stands taken, turnarounds at every stage (a few aircraft push
    // back straight away), an arrival rolling out on every landing runway and more on final
    const parked = [];
    for (const st of this.stands) {
      if (this.t.rnd() > 0.72) continue;
      const ac = this._newAircraft(st);
      this._parkAt(ac, st);
      ac.state = 'PARK'; ac.timer = 0; ac.parkFor = 60 + this.t.rnd() * 840;
      ac.place(0);
      this.list.push(ac);
      parked.push(ac);
    }
    for (let i = parked.length - 1; i > 0; i--) { const j = Math.floor(this.t.rnd() * (i + 1)); [parked[i], parked[j]] = [parked[j], parked[i]]; }
    parked.slice(0, 5).forEach((ac, i) => { ac.parkFor = 1 + i * 14; ac.timer = 0; });
    for (const r of this.runways.filter((q) => q.use !== 'dep')) {
      const ac = this._spawnArrival(r, 1000);
      if (ac) {
        // already on the ground, slowing down in the second half of the runway
        const f = 0.45 * r.len;
        ac.x = r.thrX + r.lx * f; ac.z = r.thrZ + r.lz * f; ac.alt = 0; ac.vs = 0; ac.v = 30; ac.pitch = 0;
        ac.gear = 0; ac.flap = 30; ac.state = 'ROLL'; r.occ = ac;
      }
      for (const d of [5000, 12000]) this._spawnArrival(r, d);
    }
  }

  _sleep() {
    for (const ac of this.list.slice()) this._remove(ac);
    this.list = [];
    this.active = false;
    for (const s of this.stands) s.busy = null;
  }

  reset() { if (this.active) this._sleep(); }

  // ------------------------------------------------------------------ arrivals
  _spawnArrival(r, dist = 20000) {
    const st = this._freeStand();
    if (!st) return null;
    const ac = this._newAircraft(st);
    const tx = r.thrX, tz = r.thrZ;
    ac.x = tx - r.lx * dist; ac.z = tz - r.lz * dist; ac.a = Math.atan2(r.lz, r.lx);
    ac.alt = (dist + 300) * TAN3; ac.v = 80; ac.vs = -ac.v * TAN3; ac.gear = dist < 13000 ? 0 : 1; ac.flap = dist < 13000 ? 30 : 5; ac.slat = 1; ac.n1 = 55;
    ac.pitch = 2;
    ac.route = new Path([{ x: ac.x, z: ac.z }, { x: tx + r.lx * 300, z: tz + r.lz * 300 }, { x: tx + r.lx * r.len, z: tz + r.lz * r.len }], 0, 20);
    ac.rs = 0; ac.tdS = dist + 300;
    ac.rwy = r; ac.state = 'APP'; ac.cleared = false;
    Object.assign(ac.lightsOn, { nav: true, beacon: true, strobe: true, landing: true, logo: true, taxi: false });
    ac.place(0);
    this.list.push(ac);
    return ac;
  }

  _maybeArrive(r) {
    if (this.time < r.nextArr) return;
    r.nextArr = this.time + (80 + this.t.rnd() * 80) / Math.sqrt(Math.max(0.3, this.rate));
    // spacing: the previous arrival to this runway must be well down the approach
    for (const o of this.list) if (o.rwy === r && o.state === 'APP' && o.tdS - o.rs > 12500) return;
    this._spawnArrival(r);
  }

  // ------------------------------------------------------------------ ground routes
  _taxiPath(nodes, head, tail, vmax = 12) {
    const N = this.g.nodes;
    const pts = head.slice();
    for (const i of nodes) {
      const p = N[i];
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 1) pts.push({ x: p.x, z: p.z, v: vmax });
    }
    for (const p of tail) pts.push(p);
    return new Path(pts, 38, 2);
  }

  _exitFor(ac) {
    const r = ac.rwy;
    const s0 = r.along(ac.x, ac.z);
    const need = ac.v * ac.v / (2 * 1.4) + 60;
    const cs = r.ordered().map((c) => ({ c, s: r.along(c.rx, c.rz) })).filter((o) => o.s > s0 + need);
    return (cs.length ? cs[0] : r.ordered().map((c) => ({ c, s: r.along(c.rx, c.rz) })).pop()).c;
  }

  _startTaxiIn(ac) {
    const r = ac.rwy, c = this._exitFor(ac), st = ac.opsStand;
    const from = this.g.find(c.tx, c.tz);
    const nodes = this.g.route(from, st.node) || [from, st.node];
    // connectors are two-way: the exit connector's taxiway node is reached from the runway
    const fx = Math.cos(st.a), fz = Math.sin(st.a), sh = ac.tm.standShift;
    const px = st.x + fx * sh, pz = st.z + fz * sh;
    const head = [{ x: ac.x, z: ac.z }, { x: c.rx, z: c.rz, v: 14 }];
    const tail = [{ x: px - fx * 45, z: pz - fz * 45, v: 4 }, { x: px, z: pz, v: 1.2 }];
    ac.mover = new Mover(this._taxiPath(nodes, head, tail), { vmax: 90, acc: 0.4, dec: 1.6, aLat: 0.9, v: ac.v });
    ac.state = 'TAXI_IN'; ac.spoiler = 1; ac.exitC = c;
    if (this.t.rnd() < 0.5) this._say(ac.callsign, `${this.ap.id > 1 ? aptName(this.ap.id) + ' ' : ''}Ground, ${ac.callsign}, runway ${r.words} vacated, stand ${st.id}.`, 18);
  }

  _startPush(ac) {
    const st = ac.opsStand;
    const r = this._depRunway(ac);
    ac.depR = r;
    const entry = this._entry(r);
    const nodes = this.g.route(st.node, this.g.find(entry.tx, entry.tz));
    // push the tail towards the side the route does not take
    let side = 1;
    if (nodes && nodes.length > 1) {
      const n1 = this.g.nodes[nodes[1]];
      side = Math.sign((st.lx - n1.x) || (st.lz - n1.z) || 1);
    }
    const lx = st.lx, lz = st.lz;
    const along = Math.abs(Math.sin(st.a)) > 0.5 ? [1, 0] : [0, 1];      // the lane runs across the stand heading
    const ex = lx + along[0] * side * 55, ez = lz + along[1] * side * 55;
    ac.pushRoute = nodes;
    ac.mover = new Mover(new Path([{ x: ac.x, z: ac.z }, { x: lx, z: lz }, { x: ex, z: ez }], [0, 32, 0], 2),
      { vmax: 1.6, acc: 0.3, dec: 0.5, aLat: 0.5, dir: -1 });
    ac.state = 'PUSH'; ac.dirSign = -1;
    Object.assign(ac.lightsOn, { nav: true, beacon: true, logo: true, taxi: false, strobe: false, landing: false });
    if (st.busy === ac) st.busy = null;
    ac.opsStand = null;
  }

  // the departure runway: the shortest taxi, plus ~1 km for every aircraft already in its queue
  _depRunway(ac) {
    const deps = this.runways.filter((r) => r.use !== 'arr');
    const st = ac.opsStand;
    let best = deps[0], bc = Infinity;
    for (const r of deps) {
      const c = this._entry(r), nodes = this.g.route(st.node, this.g.find(c.tx, c.tz));
      if (!nodes) continue;
      let len = 0;
      for (let i = 1; i < nodes.length; i++) { const a = this.g.nodes[nodes[i - 1]], b = this.g.nodes[nodes[i]]; len += Math.hypot(a.x - b.x, a.z - b.z); }
      const q = this.list.filter((o) => o.depR === r && ['PUSH', 'TAXI_OUT', 'LINEUP'].includes(o.state)).length;
      const cost = len + q * 1000 + this.t.rnd() * 300;
      if (cost < bc) { bc = cost; best = r; }
    }
    return best;
  }

  _entry(r) { return r.ordered()[0]; }

  _startTaxiOut(ac) {
    const r = ac.depR, c = this._entry(r);
    const to = this.g.find(c.tx, c.tz);
    // after the push-back the aircraft faces the route it was pushed for
    const nodes = ac.pushRoute || this.g.route(this.g.nearest(ac.x, ac.z), to) || [to];
    ac.pushRoute = null;
    const head = [{ x: ac.x, z: ac.z }];
    // on to the holding position on the connector, 90 m from the runway centre line (clear of
    // the parallel taxiway)
    const cl = Math.hypot(c.rx - c.tx, c.rz - c.tz), f = Math.max(0, 1 - 90 / cl);
    const hx = c.tx + (c.rx - c.tx) * f, hz = c.tz + (c.rz - c.tz) * f;
    const path = this._taxiPath(nodes, head, [{ x: hx, z: hz, v: 6 }]);
    ac.mover = new Mover(path, { vmax: 12, acc: 0.5, dec: 0.9, aLat: 0.9 });
    ac.mover.hold(path.length - 0.5, 'rwy');
    ac.state = 'TAXI_OUT'; ac.dirSign = 1; ac.entryC = c;
    Object.assign(ac.lightsOn, { taxi: true, strobe: false, landing: false });
  }

  _runwayFree(r, ac) {
    // line up behind a departure that is already well down the runway / airborne
    const o = r.occ;
    if (o && o !== ac && !(o.state === 'DEP' || (o.state === 'TKOF' && r.along(o.x, o.z) > 1200))) return false;
    for (const o of this.list) if (o.rwy === r && o.state === 'APP' && o.tdS - o.rs < 9000) return false;
    // the main runway at the remote airports: shuttles landing / taking off / on it
    if (r.main) {
      const ap = this.ap;
      if (this.t.pc?.runwayClaim?.(ap.id)) return false;
      for (const s of this.t.remote || []) {
        if (s.rap !== ap) continue;
        if (s.state === 'R_TKOF') return false;
        if (s.state === 'R_OUT' && s.route && s.route.path.length - s.route.s < 12000) return false;
        if (s.state === 'R_TAXI' && Math.abs(s.z - ap.z) < 45) return false;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ separation on the ground
  _groundLimit(ac) {
    const c = Math.cos(ac.a) * (ac.dirSign || 1), s = Math.sin(ac.a) * (ac.dirSign || 1);
    let lim = Infinity, blocker = null;
    const test = (o) => {
      if (o === ac || o.alt > 20) return;
      const dx = o.x - ac.x, dz = o.z - ac.z;
      if (Math.abs(dx) > 140 || Math.abs(dz) > 140) return;
      const along = dx * c + dz * s, lat = Math.abs(-dx * s + dz * c);
      if (along > 0 && along < 115 && lat < 42) {
        const v = Math.max(0, (along - 72) * 0.35);
        if (v < lim) { lim = v; blocker = o; }
      }
    };
    for (const o of this.list) if (o.state !== 'PARK' && o.state !== 'APP' && o.state !== 'DEP') test(o);
    for (const o of this.t.remote || []) if (o.rap === this.ap && o.state !== 'R_PARK' && o.alt < 5) test(o);
    // deadlock (two aircraft waiting for each other): the older one goes first
    if (blocker && lim < 0.1) {
      ac.blockT = (ac.blockT || 0) + this._dt;
      if (ac.blockT > 25 && blocker.blockedBy === ac && ac.id < blocker.id) { lim = 6; }
    } else ac.blockT = 0;
    ac.blockedBy = lim < 0.1 ? blocker : null;
    return lim;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, cam) {
    this._dt = dt;
    const d = Math.hypot(cam.x - this.ap.x, cam.z - this.ap.z);
    if (!this.active) { if (d < ACTIVE_R && this.t.rnd) this._activate(); else return; }
    else if (d > SLEEP_R) { this._sleep(); return; }
    this.time += dt;
    const [fx, fz] = this._flow();
    for (const r of this.runways) {
      if (!r.occ && !this.list.some((o) => o.rwy === r && o.state === 'APP')) r.setFlow(fx, fz);
      if (r.use !== 'dep') this._maybeArrive(r);
    }
    for (const ac of this.list.slice()) {
      this._step(ac, dt);
      const dc = Math.hypot(ac.x - cam.x, ac.z - cam.z);
      const moving = ac.state !== 'PARK';
      // articulated (≈40 parts) only where flaps / gear can be seen: beyond ~3 km an airliner is
      // ~25 px wide and the merged static model looks the same at a fraction of the draw calls
      if (moving && dc < 3000 && !ac.art) ac.activate();
      else if ((!moving || dc > 3800) && ac.art) ac.deactivate();
      ac.static.visible = !ac.art && dc < 45000;
      if (dc < 45000) ac.place(dt);
    }
  }

  lights(L, cam) {
    if (!this.active) return;
    for (const ac of this.list) if (Math.hypot(ac.x - cam.x, ac.z - cam.z) < 30000) ac.lights(L, this.t.time);
  }

  _step(ac, dt) {
    ac.timer = (ac.timer || 0) + dt;
    switch (ac.state) {
      case 'APP': this._approach(ac, dt); break;
      case 'ROLL': {
        // landing roll to taxi speed, then off at the next connector
        const r = ac.rwy;
        ac.v = Math.max(16, ac.v - (ac.v > 30 ? 2.3 : 1.2) * dt);
        ac.x += r.lx * ac.v * dt; ac.z += r.lz * ac.v * dt; ac.a = Math.atan2(r.lz, r.lx);
        ac.pitch = Math.max(0, ac.pitch - 2 * dt);
        ac.n1 = lerp(ac.n1, ac.v > 40 ? 70 : 28, Math.min(1, dt));        // reversers, then idle
        ac.spoiler = 1; ac.flap = 30;
        if (ac.v <= 16.5) this._startTaxiIn(ac);
        break;
      }
      case 'TAXI_IN': case 'TAXI_OUT': case 'PUSH': case 'LINEUP': {
        if (ac.state !== 'LINEUP') ac.mover.limit = ac.state === 'PUSH' ? Infinity : this._groundLimit(ac);
        const p = ac.mover.update(dt);
        ac.x = p.x; ac.z = p.z; ac.a = p.a; ac.v = ac.mover.v;
        ac.n1 = ac.state === 'PUSH' ? Math.min(22, ac.n1 + dt * 4) : lerp(ac.n1, ac.v < 0.5 && ac.mover.limit > 1 ? 32 : 26, Math.min(1, dt));
        ac.spoiler = ac.state === 'TAXI_IN' && ac.v > 20 ? 1 : 0;
        ac.flap = ac.state === 'TAXI_OUT' || ac.state === 'LINEUP' ? Math.min(5, ac.flap + dt) : Math.max(0, ac.flap - dt * 2);
        ac.slat = ac.flap > 0.5 ? 1 : Math.max(0, ac.slat - dt * 0.2);
        ac.dirSign = ac.state === 'PUSH' ? -1 : 1;
        if (ac.state !== 'PUSH') Object.assign(ac.lightsOn, { nav: true, beacon: true, taxi: true, logo: true, strobe: ac.state === 'LINEUP', landing: ac.state === 'LINEUP' });
        // the landing runway is free once the aircraft is past the holding position
        if (ac.state === 'TAXI_IN' && ac.rwy && ac.rwy.occ === ac) {
          const r = ac.rwy, off = Math.abs(-(ac.x - r.cx) * r.dz + (ac.z - r.cz) * r.dx);
          if (off > 85) { r.occ = null; ac.rwy = null; }
        }
        if (ac.state === 'TAXI_OUT' && ac.mover.atHold()) {
          const r = ac.depR;
          if (this._runwayFree(r, ac)) {
            r.occ = ac;
            const c = ac.entryC;
            ac.mover = new Mover(new Path([{ x: ac.x, z: ac.z }, { x: c.rx, z: c.rz, v: 5 }, { x: c.rx + r.lx * 60, z: c.rz + r.lz * 60 }], [0, 30, 0], 2),
              { vmax: 6, acc: 0.5, dec: 0.8, aLat: 0.8, v: 0 });
            ac.state = 'LINEUP';
            this._say('TWR', `${ac.callsign}, runway ${r.words}, cleared for takeoff.`);
            this._say(ac.callsign, `Cleared for takeoff runway ${r.words}, ${ac.callsign}.`, 3);
          }
        }
        if (ac.state === 'LINEUP' && ac.mover.done && !this.list.some((o) => o !== ac && o.depR === ac.depR && o.state === 'TKOF')) {
          ac.state = 'TKOF'; ac.v = 0; ac.pitch = 0;
        }
        if (!ac.mover.done) break;
        if (ac.state === 'TAXI_IN') {
          ac.state = 'PARK'; ac.timer = 0; ac.v = 0; ac.mover = null;
          ac.parkFor = (420 + this.t.rnd() * 540) * (0.75 / Math.max(0.3, this.rate)) ** 0.5;
          this._parkAt(ac, ac.opsStand);
        } else if (ac.state === 'PUSH') {
          this._startTaxiOut(ac);
        }
        break;
      }
      case 'PARK': {
        ac.n1 = Math.max(0, ac.n1 - dt * 6);
        if (ac.timer > 30) Object.assign(ac.lightsOn, { nav: false, beacon: false, taxi: false, strobe: false, landing: false });
        if (ac.timer > ac.parkFor) {
          // the lane behind the stand must be clear
          const st = ac.opsStand;
          const busy = this.list.some((o) => o !== ac && o.state !== 'PARK' && o.alt < 5 && Math.hypot(o.x - st.lx, o.z - st.lz) < 160);
          if (!busy) this._startPush(ac); else ac.parkFor += 20;
        }
        break;
      }
      case 'TKOF': {
        const r = ac.depR;
        ac.v += (2.25 - 0.006 * ac.v) * dt;
        ac.x += r.lx * ac.v * dt; ac.z += r.lz * ac.v * dt; ac.a = Math.atan2(r.lz, r.lx);
        ac.n1 = lerp(ac.n1, 95, Math.min(1, dt * 0.6));
        if (ac.v > 76) ac.pitch = Math.min(ac.pitch + 2.6 * dt, 12);
        if (ac.pitch > 7.5 && ac.v > 80) {
          // climb out straight, then turn away and leave
          ac.state = 'DEP'; ac.vs = 3;
          const turn = (this.t.rnd() - 0.5) * 1.6;
          const h = Math.atan2(r.lz, r.lx) + turn;
          const p1 = { x: ac.x + r.lx * 6000, z: ac.z + r.lz * 6000 };
          ac.route = new Path([{ x: ac.x, z: ac.z }, p1, { x: p1.x + Math.cos(h) * 40000, z: p1.z + Math.sin(h) * 40000 }], 3000, 25);
          ac.rs = 0;
          Object.assign(ac.lightsOn, { landing: true, strobe: true, taxi: false });
        }
        break;
      }
      case 'DEP': {
        const P = ac.route;
        ac.v = Math.min(140, ac.v + 1.2 * dt);
        ac.rs += ac.v * dt;
        const p = P.at(Math.min(ac.rs, P.length), this._p || (this._p = {}));
        ac.x = p.x; ac.z = p.z; ac.a = p.a;
        ac.vs += clamp(9 - ac.vs, -1, 1) * dt;
        ac.alt += ac.vs * dt;
        ac.pitch = lerp(ac.pitch, Math.atan2(ac.vs, ac.v) / DEG + 4, Math.min(1, dt));
        ac.bank = clamp(Math.atan(ac.v * ac.v * (p.k || 0) / G) / DEG, -25, 25);
        if (ac.alt > 120) ac.gear = Math.min(1, ac.gear + dt / 8);
        if (ac.alt > 400) { ac.flap = Math.max(0, ac.flap - dt); ac.slat = ac.flap > 0.5 ? 1 : 0; }
        if (ac.alt > 150 && ac.depR && ac.depR.occ === ac) ac.depR.occ = null;
        if (ac.alt > 3000) Object.assign(ac.lightsOn, { landing: false });
        if (ac.rs >= P.length - 1) this._remove(ac);
        break;
      }
      default: break;
    }
  }

  _approach(ac, dt) {
    const r = ac.rwy, P = ac.route;
    const rem = ac.tdS - ac.rs;
    ac.v += clamp((rem < 6000 ? 72 : 80) - ac.v, -0.8 * dt, 0.8 * dt);
    ac.rs += ac.v * dt;
    const p = P.at(Math.min(ac.rs, P.length), this._p || (this._p = {}));
    ac.x = p.x; ac.z = p.z; ac.a = p.a;
    const altT = Math.max(0, rem * TAN3);
    const vsT = rem > 400 ? clamp(-ac.v * TAN3 + (altT - ac.alt) * 0.15, -8, 2) : -(0.7 + 0.25 * ac.alt);
    ac.vs += clamp(vsT - ac.vs, -1.5 * dt, 1.5 * dt);
    ac.alt = Math.max(0, ac.alt + ac.vs * dt);
    ac.pitch = lerp(ac.pitch, rem < 500 ? 5 : 2.5, Math.min(1, dt * 0.5));
    ac.bank = lerp(ac.bank, 0, Math.min(1, dt));
    if (rem < 13000) { ac.gear = Math.max(0, ac.gear - dt / 10); ac.flap = Math.min(30, ac.flap + dt * 1.5); }
    ac.n1 = lerp(ac.n1, 52, Math.min(1, dt * 0.5));
    if (!ac.cleared && rem < 10000) {
      // the runway is kept for this arrival from here (departures wait); cleared to land
      ac.cleared = true;
      if (this.t.rnd() < 0.6) {
        this._say(ac.callsign, `${this._twr()}, ${ac.callsign}, ILS runway ${r.words}.`);
        this._say('TWR', `${ac.callsign}, runway ${r.words}, wind check, cleared to land.`, 3);
      }
    }
    if (rem < 1800 && !r.occ) r.occ = ac;
    if (ac.alt <= 0.01 && rem < 600) {
      ac.alt = 0; ac.vs = 0; ac.state = 'ROLL';
      if (!r.occ) r.occ = ac;
    }
  }

  // aircraft of this airport's extra traffic that a shuttle / home aircraft must keep clear of
  groundAircraft() { return this.active ? this.list.filter((o) => o.alt < 5 && o.state !== 'PARK') : []; }
}
