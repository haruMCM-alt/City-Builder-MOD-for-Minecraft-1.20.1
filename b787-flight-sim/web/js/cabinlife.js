// Life in the cabin: passengers that move (look around, phones, reading, sleeping, talking,
// stretching, eating ...) and the meal service - flight attendants pushing trolleys along the
// aisles, handing a tray to every passenger row by row, then collecting the trays again.
//
// Passengers and crew are articulated instanced meshes built in Blender (cabin_b787.py): each
// body part is its own instanced mesh posed per instance about pivots exported in the metadata
// (neck, shoulders, elbows; crew: shoulders and hips).  Frame: three.js aircraft frame
// (x forward, y up, z right); a seated passenger faces +x.
import * as THREE from 'three';
import { clamp } from './util.js';

const D = Math.PI / 180;
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

// ---------------------------------------------------------------------------------- passengers
// a pose: head yaw / pitch / roll and (shoulder, elbow) angles of both arms (+ = raise forward / up)
const P = (o) => ({ hy: 0, hp: 0, hr: 0, sL: 0, eL: 0, sR: 0, eR: 0, lean: 0, ...o });
const MOTIONS = {
  rest: { w: 3, dur: [4, 12], pose: () => P({ hp: -6 }) },
  look: { w: 2, dur: [2, 5], pose: (r) => P({ hy: (r() - 0.5) * 100, hp: (r() - 0.4) * 20 }) },
  window: { w: 1.5, dur: [4, 10], pose: (r, px) => P({ hy: px.side * (55 + r() * 20), hp: -4, hr: px.side * 4 }), when: (px) => px.win },
  phone: { w: 2.5, dur: [6, 18], pose: () => P({ hp: -28, sL: 22, eL: 52, sR: 22, eR: 58 }), fid: 'phone' },
  read: { w: 1.2, dur: [8, 20], pose: () => P({ hp: -24, sL: 18, eL: 40, sR: 18, eR: 40, lean: 3 }) },
  sleep: { w: 1.5, dur: [15, 40], pose: (r) => P({ hp: -18, hr: (r() < 0.5 ? -1 : 1) * 22, sL: -4, sR: -4 }) },
  screen: { w: 3, dur: [10, 30], pose: () => P({ hp: -8 }) },
  talk: { w: 1.2, dur: [4, 10], pose: (r, px) => P({ hy: px.nb * (40 + r() * 20), hp: -3 }), anim: 'talk', when: (px) => px.nb !== 0 },
  stretch: { w: 0.35, dur: [2.5, 4], pose: () => P({ hp: 12, sL: 150, eL: 25, sR: 150, eR: 25, lean: -6 }) },
  scratch: { w: 0.4, dur: [1.5, 3], pose: (r) => (r() < 0.5 ? P({ hy: -10, sL: 105, eL: 100 }) : P({ hy: 10, sR: 105, eR: 100 })) },
  drink: { w: 0.6, dur: [3, 6], pose: () => P({ hp: -5 }), anim: 'drink' },
  armrest: { w: 1, dur: [5, 12], pose: () => P({ sL: -6, eL: 8, sR: -6, eR: 8, hp: -4 }) },
  eat: { w: 0, dur: [10, 25], pose: () => P({ hp: -22, lean: 5 }), anim: 'eat' },
};
const NAMES = Object.keys(MOTIONS);

export class PaxLife {
  constructor(cabin) {
    this.cabin = cabin;
    const info = cabin.info;
    const o = info.protoOrigin;
    const pv = info.paxPivots || {
      neck: [-0.2, 1.12, 0], shoulderL: [-0.19, 1.0, -0.21], shoulderR: [-0.19, 1.0, 0.21],
      elbowL: [-0.13, 0.7, -0.205], elbowR: [-0.13, 0.7, 0.205],
    };
    const rel = (k) => new THREE.Vector3(pv[k][0] - o[0], pv[k][1] - o[1], pv[k][2] - o[2]);
    this.pv = { neck: rel('neck'), sL: rel('shoulderL'), sR: rel('shoulderR'), eL: rel('elbowL'), eR: rel('elbowR') };
    this.list = [];
    this._m = new THREE.Matrix4(); this._a = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this.time = 0;
  }

  // called by Cabin.setPassengers: one entry per seated passenger (k = instance index)
  reset(entries, rnd) {
    const seats = this.cabin.info.seats;
    // neighbours / window seats for context-aware motions
    const occupied = new Set(entries.map((e) => e.seat));
    this.list = entries.map((e) => {
      const s = seats[e.seat];
      const win = Math.abs(s.p[2]) > 1.2 && !seats.some((t) => t.r === s.r && Math.abs(t.p[2]) > Math.abs(s.p[2]) + 0.1 && Math.sign(t.p[2]) === Math.sign(s.p[2]));
      let nb = 0;
      for (const [i, t] of seats.entries()) {
        if (i === e.seat || t.r !== s.r || !occupied.has(i)) continue;
        const d = t.p[2] - s.p[2];
        if (Math.abs(d) < 0.75) { nb = d > 0 ? -1 : 1; break; }         // +z is right: turn the head right = -yaw
      }
      const px = {
        k: e.k, seat: e.seat, base: e.m.clone(), win, side: s.p[2] < 0 ? 1 : -1, nb,
        cur: P({}), tgt: P({}), motion: 'rest', t: 0, dur: 2 + rnd() * 6, ph: rnd() * 10, rnd, speed: 0.8 + rnd() * 0.6,
        meal: false,
      };
      this._choose(px, true);
      return px;
    });
  }

  _choose(px, first = false) {
    const r = px.rnd;
    let name;
    if (px.meal && r() < 0.8) name = 'eat';
    else {
      let tot = 0;
      const ok = NAMES.filter((n) => MOTIONS[n].w > 0 && (!MOTIONS[n].when || MOTIONS[n].when(px)));
      for (const n of ok) tot += MOTIONS[n].w;
      let x = r() * tot;
      name = ok[ok.length - 1];
      for (const n of ok) { x -= MOTIONS[n].w; if (x <= 0) { name = n; break; } }
    }
    const M = MOTIONS[name];
    px.motion = name;
    px.t = first ? r() * 3 : 0;
    px.dur = M.dur[0] + r() * (M.dur[1] - M.dur[0]);
    px.tgt = M.pose(r, px);
  }

  setMeal(seat, on) {
    for (const px of this.list) if (px.seat === seat) { px.meal = on; if (on) { px.motion = 'screen'; px.t = px.dur; } else if (px.motion === 'eat') px.t = px.dur; }
  }

  update(dt, visible, meshes) {
    this.time += dt;
    for (const px of this.list) {
      px.t += dt;
      if (px.t > px.dur) this._choose(px);
    }
    if (!visible) return;
    const T = this.time;
    for (const px of this.list) {
      // target pose + motion-specific animation
      const g = { ...px.tgt };
      const A = MOTIONS[px.motion].anim;
      const ph = T * px.speed + px.ph;
      if (A === 'eat') {
        // fork: tray -> mouth -> tray (right hand), left hand steadies the tray
        const c = 0.5 - 0.5 * Math.cos(ph * 2.2);
        const up = Math.max(0, Math.sin(ph * 1.1)) > 0.35 ? c : 0;
        g.sR = 14 + 44 * up; g.eR = 18 + 50 * up; g.sL = 12; g.eL = 20; g.hp = -22 + 10 * up;
      } else if (A === 'drink') {
        const up = clamp(Math.sin(ph * 1.6) * 1.6, 0, 1);
        g.sR = 10 + 48 * up; g.eR = 12 + 56 * up; g.hp = -4 + 14 * up;
      } else if (A === 'talk') {
        g.hp += Math.sin(ph * 5) * 4;
        const gest = Math.max(0, Math.sin(ph * 1.7));
        g.sL = 12 * gest; g.eL = 35 * gest + Math.sin(ph * 6) * 8 * gest;
      } else if (px.motion === 'phone') {
        g.eR += Math.sin(ph * 7) * 2; // thumb scrolling
      } else if (px.motion === 'sleep') {
        g.hp += Math.sin(ph * 0.8) * 2;
      }
      // idle breathing / micro head motion
      g.hp += Math.sin(ph * 1.3) * 1.2; g.hy += Math.sin(ph * 0.37) * 3;
      const k = Math.min(1, dt * (px.motion === 'stretch' ? 3.0 : 2.2));
      const c = px.cur;
      for (const key in g) c[key] += (g[key] - c[key]) * k;
      this._write(px, meshes);
    }
    for (const arr of Object.values(meshes)) for (const im of arr) im.instanceMatrix.needsUpdate = true;
  }

  // compose the part matrices of one passenger
  _write(px, meshes) {
    const c = px.cur, pv = this.pv;
    const base = this._m.copy(px.base);
    if (c.lean) {
      // lean the whole body about the seat (hips)
      this._a.makeRotationAxis(Z, -c.lean * D);
      base.multiply(this._a);
    }
    const piv = (p, q, out) => out.makeTranslation(p.x, p.y, p.z).multiply(this._b.makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    const setAll = (arr, M) => { for (const im of arr) im.setMatrixAt(px.k, this._tmp.multiplyMatrices(M, im.userData.rel)); };
    this._tmp = this._tmp || new THREE.Matrix4();
    setAll(meshes.body, base);
    // head: yaw (about y), pitch (about z, + = up), roll (about x)
    const qh = this._q.setFromEuler(new THREE.Euler(c.hr * D, c.hy * D, c.hp * D, 'YZX'));
    const Mh = new THREE.Matrix4().multiplyMatrices(base, piv(pv.neck, qh, new THREE.Matrix4()));
    setAll(meshes.head, Mh);
    for (const sd of ['L', 'R']) {
      const sh = pv['s' + sd], el = pv['e' + sd];
      const qs = new THREE.Quaternion().setFromAxisAngle(Z, c['s' + sd] * D);
      const Ms = new THREE.Matrix4().multiplyMatrices(base, piv(sh, qs, new THREE.Matrix4()));
      setAll(meshes['u' + sd], Ms);
      const qe = new THREE.Quaternion().setFromAxisAngle(Z, c['e' + sd] * D);
      const Me = new THREE.Matrix4().multiplyMatrices(Ms, piv(el, qe, new THREE.Matrix4()));
      setAll(meshes['f' + sd], Me);
    }
  }
}

// ---------------------------------------------------------------------------------- meal service
// states of a service team (one trolley + two attendants per aisle)
//   IDLE -> OUT (meal: trays handed out front to back) -> BACK (to the galley) -> WAIT (eating)
//   -> COLLECT (trays collected) -> BACK -> IDLE
export class CrewService {
  constructor(cabin) {
    this.cabin = cabin;
    const info = cabin.info;
    const o = info.protoOrigin;
    const cp = info.crewPivots || { shoulderL: [0, 1.42, -0.2], shoulderR: [0, 1.42, 0.2], hipL: [0, 0.9, -0.09], hipR: [0, 0.9, 0.09] };
    const rel = (k) => new THREE.Vector3(cp[k][0] - o[0], cp[k][1] - o[1], cp[k][2] - o[2]);
    this.cp = { sL: rel('shoulderL'), sR: rel('shoulderR'), hL: rel('hipL'), hR: rel('hipR') };
    this.floorY = info.floorY ?? info.seats[0].p[1];
    const seats = info.seats;
    const aisles = info.aisles && info.aisles.length ? info.aisles : [0];
    this.aisles = aisles.map((az) => ({ z: az, rows: [] }));
    // group the seats by row and nearest aisle
    const byKey = new Map();
    seats.forEach((s, i) => {
      let best = 0;
      for (let a = 1; a < aisles.length; a++) if (Math.abs(s.p[2] - aisles[a]) < Math.abs(s.p[2] - aisles[best])) best = a;
      const key = best + '|' + s.r;
      if (!byKey.has(key)) byKey.set(key, { x: s.p[0], seats: [] });
      byKey.get(key).seats.push(i);
    });
    for (const [key, row] of byKey) this.aisles[+key.split('|')[0]].rows.push(row);
    for (const A of this.aisles) {
      A.rows.sort((a, b) => b.x - a.x);                 // front (larger x) first
      A.galleyX = (info.galley ?? A.rows[0].x + 1.2);
      A.state = 'IDLE'; A.x = A.galleyX; A.i = 0; A.t = 0; A.serving = null; A.walk = 0;
      A.crew = [{ yaw: 0, arm: 0, turn: 0 }, { yaw: 0, arm: 0, turn: 0 }];
    }
    this.trays = new Set();           // seat indices with a meal tray
    this.state = 'IDLE';
    this.timer = 0;
    this.m = new THREE.Matrix4();
  }

  get active() { return this.state !== 'IDLE'; }

  start() {
    if (this.state !== 'IDLE') return false;
    this.state = 'OUT';
    for (const A of this.aisles) { A.state = 'MOVE'; A.i = 0; A.x = A.galleyX; A.t = 0; }
    return true;
  }

  stop() {
    this.state = 'IDLE';
    for (const s of [...this.trays]) this._tray(s, false);
    for (const A of this.aisles) { A.state = 'IDLE'; A.x = A.galleyX; A.serving = null; }
  }

  _tray(seat, on) {
    if (on) this.trays.add(seat); else this.trays.delete(seat);
    this.cabin.life?.setMeal(seat, on);
    this.dirty = true;
  }

  update(dt) {
    const occ = this.cabin.occupied;
    if (this.state === 'WAIT') {
      this.timer += dt;
      if (this.timer > 110) { this.state = 'COLLECT'; for (const A of this.aisles) { A.state = 'MOVE'; A.i = 0; A.x = A.galleyX; } }
    }
    let allHome = true;
    for (const A of this.aisles) {
      if (A.state === 'IDLE') continue;
      allHome = false;
      A.walk = 0;
      if (A.state === 'MOVE') {
        const row = A.rows[A.i];
        const tx = row ? row.x + 0.35 : A.galleyX;
        const d = tx - A.x;
        const v = 0.55;
        if (Math.abs(d) > 0.01) { A.x += Math.sign(d) * Math.min(Math.abs(d), v * dt); A.walk = 1; }
        else if (row) {
          // serve every occupied seat in this row (meal) / every tray (collect)
          A.queue = row.seats.filter((s) => occ.has(s) && (this.state === 'OUT' ? !this.trays.has(s) : this.trays.has(s)));
          A.state = A.queue.length ? 'SERVE' : 'NEXT';
          A.t = 0;
        }
      }
      if (A.state === 'SERVE') {
        A.t += dt;
        const seat = A.queue[0];
        A.serving = seat;
        if (A.t > 1.3) {
          this._tray(seat, this.state === 'OUT');
          A.queue.shift();
          A.t = 0;
          if (!A.queue.length) { A.state = 'NEXT'; A.serving = null; }
        }
      }
      if (A.state === 'NEXT') {
        A.i++;
        if (A.i >= A.rows.length) A.state = 'HOME';
        else A.state = 'MOVE';
      }
      if (A.state === 'HOME') {
        const d = A.galleyX - A.x;
        if (Math.abs(d) > 0.01) { A.x += Math.sign(d) * Math.min(Math.abs(d), 0.9 * dt); A.walk = 1.3; }
        else A.state = 'DONE';
      }
      if (A.state !== 'DONE') allHome = false;
    }
    if (this.aisles.every((A) => A.state === 'DONE' || A.state === 'IDLE')) {
      if (this.state === 'OUT') { this.state = 'WAIT'; this.timer = 0; for (const A of this.aisles) A.state = 'IDLE'; }
      else if (this.state === 'COLLECT') { this.state = 'IDLE'; for (const A of this.aisles) A.state = 'IDLE'; }
    }
    return allHome;
  }

  // write crew / cart / tray instance matrices
  draw(time, meshes) {
    const info = this.cabin.info;
    const seats = info.seats;
    const m = this.m, tmp = new THREE.Matrix4();
    const cp = this.cp;
    const visible = this.state === 'OUT' || this.state === 'COLLECT' || this.aisles.some((A) => A.state !== 'IDLE');
    let c = 0;
    this.aisles.forEach((A, ai) => {
      const show = visible && A.state !== 'IDLE' && A.state !== 'DONE';
      for (const im of meshes.cart) {
        im.setMatrixAt(ai, tmp.multiplyMatrices(m.compose(new THREE.Vector3(A.x, this.floorY, A.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, show ? 1 : 0.0001)), im.userData.rel));
      }
      // two attendants: one each side of the trolley along the aisle
      for (let k = 0; k < 2; k++) {
        const cr = A.crew[k];
        const x = A.x + (k === 0 ? 0.72 : -0.72);
        let yaw = k === 0 ? Math.PI : 0;             // both face the trolley
        let arm = 0.35;                               // hands on the trolley
        if (A.state === 'HOME' || A.state === 'MOVE') arm = 0.45;
        let turn = 0;
        if (A.serving != null && k === A.serving % 2) {
          // turn towards the passenger and hand over the tray
          const s = seats[A.serving];
          const side = Math.sign(s.p[2] - A.z) || 1;
          const want = side > 0 ? -Math.PI / 2 : Math.PI / 2;          // facing +z / -z
          let d = want - yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          turn = d * 0.8;
          arm = 0.3 + 1.0 * Math.sin(Math.min(1, A.t / 1.3) * Math.PI);
        }
        cr.turn += (turn - cr.turn) * 0.15; cr.arm += (arm - cr.arm) * 0.2;
        yaw += cr.turn;
        const walk = A.walk ? Math.sin(time * 7 + k) * 0.4 : 0;
        const base = new THREE.Matrix4().compose(new THREE.Vector3(x, this.floorY + Math.abs(walk) * 0.02, A.z),
          new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(1, 1, show ? 1 : 0.0001));
        const idx = ai * 2 + k;
        for (const im of meshes.crew) im.setMatrixAt(idx, tmp.multiplyMatrices(base, im.userData.rel));
        const piv = (p, ang) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationAxis(Z, ang)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
        for (const [key, arr, ang] of [['sL', meshes.armL, cr.arm - walk * 0.5], ['sR', meshes.armR, (A.serving != null ? cr.arm : cr.arm) + walk * 0.5],
          ['hL', meshes.legL, walk], ['hR', meshes.legR, -walk]]) {
          const M = new THREE.Matrix4().multiplyMatrices(base, piv(cp[key], ang));
          for (const im of arr) im.setMatrixAt(idx, tmp.multiplyMatrices(M, im.userData.rel));
        }
        c++;
      }
    });
    for (const arr of [meshes.cart, meshes.crew, meshes.armL, meshes.armR, meshes.legL, meshes.legR]) for (const im of arr) im.instanceMatrix.needsUpdate = true;
    // trays in front of the passengers who have a meal
    if (this.dirty) {
      this.dirty = false;
      let n = 0;
      const jo = info.jOffset || [0, 0, 0];
      for (const s of this.trays) {
        const st = seats[s];
        const j = st.c === 'J';
        m.makeTranslation(st.p[0] + (j ? jo[0] - 0.25 : 0), st.p[1], st.p[2]);
        for (const im of meshes.tray) im.setMatrixAt(n, tmp.multiplyMatrices(m, im.userData.rel));
        n++;
      }
      for (const im of meshes.tray) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    }
    return c;
  }

  status() {
    const s = this.state;
    if (s === 'IDLE') return '';
    const served = this.trays.size;
    return s === 'OUT' ? `機内食サービス中 Meal service · ${served} 食` : s === 'WAIT' ? `お食事中 Dining · ${served} 食` : `トレイ回収中 Collecting · 残り ${served}`;
  }
}
