// Builds a timetable for the chosen vehicle.
// Anchor times are the ones the conductor reads out in the recorded announcement
// (上野 8:51発 … 宇都宮 10:34着); stations in between are interpolated from a
// simulated minimum run time for the selected train.

import { tractiveAccel, resistance } from './vehicles.js';

const ANCHORS = { 上野: 8 * 3600 + 51 * 60, 赤羽: 9 * 3600 + 2 * 60, 浦和: 9 * 3600 + 10 * 60, 大宮: 9 * 3600 + 18 * 60, 蓮田: 9 * 3600 + 28 * 60, 久喜: 9 * 3600 + 39 * 60, 古河: 9 * 3600 + 53 * 60, 小山: 10 * 3600 + 7 * 60, 宇都宮: 10 * 3600 + 34 * 60 };

/** fastest reasonable run between two stops (seconds) */
export function minRunTime(route, veh, sA, sB, trainLen) {
  const dt = 0.5;
  const aBrake = (veh.brakeMax * 0.7) / 3.6;
  let s = sA, v = 0, t = 0;
  while (s < sB - 0.3 && t < 3600) {
    const vk = v * 3.6;
    // allowed speed considering limits ahead and the stop
    let allow = Math.min(veh.maxSpeed, route.limitOverTrain(s, trainLen)) - 2;
    for (const L of route.upcomingLimits(s, 1500)) {
      const d = L.s - s;
      allow = Math.min(allow, Math.sqrt((L.v - 2) ** 2 / 12.96 + 2 * aBrake * d) * 3.6);
    }
    allow = Math.min(allow, Math.sqrt(2 * aBrake * Math.max(0, sB - s)) * 3.6);
    let a;
    if (vk < allow - 3) a = tractiveAccel(veh, vk, 1) - resistance(vk);
    else if (vk > allow) a = -aBrake;
    else a = -resistance(vk);
    v = Math.max(0.6, v + a * dt);
    s += v * dt;
    t += dt;
  }
  return t + 8;
}

export function buildTimetable(route, veh, nCars, from, to) {
  const st = route.stations;
  const trainLen = nCars * 20;
  const rows = st.map((x) => ({ station: x, arr: null, dep: null, dwell: x.dwell || (x.area === 'city' ? 35 : 25) }));
  const mins = [];
  for (let i = 0; i < st.length - 1; i++) mins.push(minRunTime(route, veh, st[i].s, st[i + 1].s, trainLen));
  // walk anchor intervals over the whole line
  const anchorIdx = st.map((x, i) => (ANCHORS[x.name] !== undefined ? i : -1)).filter((i) => i >= 0);
  rows[0].dep = ANCHORS[st[0].name];
  for (let k = 0; k < anchorIdx.length - 1; k++) {
    const a = anchorIdx[k], b = anchorIdx[k + 1];
    const depA = rows[a].dep;
    let sumMin = 0, sumDwell = 0;
    for (let i = a; i < b; i++) sumMin += mins[i];
    for (let i = a + 1; i < b; i++) sumDwell += rows[i].dwell;
    const T = ANCHORS[st[b].name] - depA;
    const scale = Math.max(1.06, (T - sumDwell) / sumMin);
    let t = depA;
    for (let i = a; i < b; i++) {
      t += mins[i] * scale;
      t = Math.round(t / 5) * 5;
      const r = rows[i + 1];
      if (i + 1 === b) t = Math.max(t, ANCHORS[st[b].name]);
      r.arr = t;
      t += r.dwell;
      r.dep = t;
    }
  }
  const sub = rows.slice(from, to + 1);
  sub[0].arr = null;
  sub[sub.length - 1].dep = null;
  return sub;
}

export function fmtTime(sec, withSec = true) {
  if (sec == null) return '--:--';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor(sec / 60) % 60;
  const s = sec % 60;
  return withSec ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${h}:${String(m).padStart(2, '0')}`;
}
