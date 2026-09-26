// Headless test of the emergency auto landing (AutoFlight.emergency): from several positions
// around the home airport, with an engine fire, an engine failure or a clipped wing (building
// strike), the crew must land on runway 27 (main gear on the 45 m wide runway at touchdown)
// and stop on it.
//   node tests/emergency_land_test.mjs        (AC=b737-800 / b767-300er for the other types)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlightModel, SPEC } from '../web/js/flightmodel.js';
import { Systems } from '../web/js/systems.js';
import { configureTerrain } from '../web/js/terrain.js';
import { configureObstacles } from '../web/js/obstacles.js';
import { AutoFlight } from '../web/js/autoflight.js';
import { V3, FT, KT, FPM, headingVec } from '../web/js/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(fs.readFileSync(path.join(here, `../web/assets/${process.env.AC || 'b787-9'}.json`)));
if (meta.spec) Object.assign(SPEC, meta.spec);
const KM = SPEC.MTOW / 254011;
const world = JSON.parse(fs.readFileSync(path.join(here, '../web/assets/world.json')));
configureTerrain(world);
configureObstacles(world);
const rw = world.runways.find((r) => r.ident === '27');

const starts = [
  { name: 'on final 8 NM', x: 16500, z: 0, ft: 2500, hdg: 270, kt: 180, flaps: 1, gear: false },
  { name: 'after take-off, beyond the airport', x: -6000, z: 0, ft: 1500, hdg: 270, kt: 190, flaps: 2, gear: false },
  { name: 'north, heading away', x: 3000, z: -15000, ft: 5000, hdg: 360, kt: 250, flaps: 0, gear: false },
  { name: 'inside the fix, crossing', x: 9000, z: -5000, ft: 3000, hdg: 180, kt: 220, flaps: 0, gear: false },
  { name: 'game ILS 27 start (12 NM, right of course, ILS armed)', x: 23974, z: -2400, ft: 3000, hdg: 295, kt: 185, flaps: 2, gear: false, wind: [260, 8], ils: true },
  { name: 'ILS 27 intercept, crosswind', x: 23000, z: 1950, ft: 3000, hdg: 295, kt: 180, flaps: 2, gear: false, wind: [260, 8] },
  { name: 'far east, high', x: 60000, z: 20000, ft: 12000, hdg: 270, kt: 280, flaps: 0, gear: false },
];
const failures = [
  ['right wing torn off', (fm) => fm.failure('wingOff', 1)],
  ['engine fire', (fm) => fm.failure('engineFire', 0)],
  ['engine failure', (fm) => fm.failure('engineFail', 1)],
  ['building strike (wing tip)', (fm) => fm.impact('wingtipL', 90, true)],
];
// both engines out: starts within gliding range (a 787 glides ~19:1 clean)
const deadStarts = [
  { name: 'dead: final 8 NM 3,500 ft', x: 16500, z: 0, ft: 3500, hdg: 270, kt: 190, flaps: 1, gear: false },
  { name: 'dead: north 15 km 8,000 ft, heading away', x: 3000, z: -15000, ft: 8000, hdg: 360, kt: 250, flaps: 0, gear: false },
  { name: 'dead: crossing 9 km out 4,000 ft', x: 9000, z: -5000, ft: 4000, hdg: 180, kt: 220, flaps: 0, gear: false },
  { name: 'dead: downwind abeam the field 3,000 ft', x: 0, z: -5500, ft: 3000, hdg: 90, kt: 200, flaps: 0, gear: false },
  { name: 'dead: beyond the airport 6,000 ft, heading away', x: -6000, z: 0, ft: 6000, hdg: 270, kt: 200, flaps: 0, gear: false },
  { name: 'dead: far east 60 km FL120', x: 60000, z: 20000, ft: 12000, hdg: 270, kt: 280, flaps: 0, gear: false },
  { name: 'dead: game ILS 27 start 3,000 ft (out of reach: relight)', x: 23974, z: -2400, ft: 3000, hdg: 295, kt: 185, flaps: 2, gear: false, relight: true, ils: true },
  { name: 'dead: ILS intercept 5,000 ft, crosswind', x: 23000, z: 1950, ft: 5000, hdg: 295, kt: 200, flaps: 1, gear: false, wind: [260, 8] },
];
const runways = world.runways.filter((r) => !r.apt);
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); ok = ok && c; };
const cases = [];
// (not the 90 m/s building strike on the left wing tip while the autopilot rolls left onto
// the localizer at 185 kt: the clipped wing cannot stop that roll - a spiral, as it would be)
for (const s of starts) for (const f of failures) if (!(s.ils && f[0].startsWith('building'))) cases.push([s, f]);
for (const s of deadStarts) cases.push([s, ['dual engine failure', (fm) => fm.failure('dualEngine')]]);
const pickS = process.env.START, pickF = process.env.FAIL;
for (const [s, [fname, fail]] of cases.filter(([s, f]) => (pickS == null || s === [...starts, ...deadStarts][+pickS]) && (pickF == null || (f[0] === 'dual engine failure' ? pickF === 'dead' : f === failures[+pickF])))) {
  const fm = new FlightModel(meta), sys = new Systems(fm, world);
  fm.payload = 26000 * KM; fm.fuel = (+process.env.FUEL || 45000) * KM;   // (a torn wing leaks ~30 t/h)
  fm.reset(new V3(s.x, s.ft * FT, s.z), s.hdg, s.kt * KT, 2, false);
  if (s.wind) { const wv = headingVec(s.wind[0]); fm.wind.set(-wv.x * s.wind[1] * KT, 0, -wv.z * s.wind[1] * KT); }
  sys.flapLever = s.flaps; sys.gearLever = s.gear; fm.ctl.gearPos = s.gear ? 0 : 1; sys.airTime = 10;
  sys.mcp.alt = s.ft; sys.mcp.hdg = s.hdg; sys.mcp.spd = s.kt; sys.ap.roll = 'HDG'; sys.ap.pitch = 'ALT'; sys.ap.on = true; sys.at.on = true; sys.at.mode = 'SPD';
  if (s.ils) { sys.selectRunway(rw); sys.ap.armed.loc = true; sys.ap.armed.gs = true; }
  const DT = 1 / 120;
  const run = (sec, af) => { for (let i = 0; i < sec / DT && !fm.crashed && !(af && af.done); i++) { af?.update(DT); sys.update(DT); fm.step(DT); fm.update(); for (const e of fm.events) if (e.type === 'touchdown' && !td) td = { vs: e.vs, x: fm.pos.x, z: fm.pos.z }; fm.events.length = 0; } };
  let td = null;
  run(2);
  fail(fm);
  run(3);
  const dead = !fm.engines.some((e) => e.running);
  const af = dead ? AutoFlight.deadstick(fm, sys, { runways, name: 'HOME' }) : AutoFlight.emergency(fm, sys, { dest: rw, name: 'HOME' });
  af.runways = runways;
  af.allowRelight = !!s.relight;
  if (process.env.VERBOSE && af.deadstick) console.log('  plan', af.dest.ident, JSON.stringify({ s: af._ds.s, len: af._ds.len | 0, need: af._ds.need | 0, ok: af._ds.ok, F: af._ds.F | 0 }));
  const lrw = () => af.dest;
  let t = 0, maxBank = 0, minFt = 1e9;
  while (t < 2400 && !af.done && !fm.crashed) {
    run(1, af); t += 1;
    maxBank = Math.max(maxBank, Math.abs(fm.out.bank));
    if (!fm.out.wow && Math.abs(fm.pos.x) > 6000) minFt = Math.min(minFt, fm.out.altFt);
    if (process.env.VERBOSE && t % (+process.env.EVERY || 20) === 0) console.log(`  t=${t} ${af.phase} x=${fm.pos.x | 0} z=${fm.pos.z | 0} alt=${fm.out.altFt | 0} ias=${fm.out.ias | 0} hdg=${fm.out.hdg | 0} ${sys.ap.roll}/${sys.ap.pitch} F=${af._ds ? (af._ds.F / 1852).toFixed(1) + (af._ds.r?.ident || '') + af._ds.s : ''} spd=${sys.mcp.spd} lvl=${af.dsLevel} sb=${sys.speedbrakeLever} ra=${fm.out.raFt|0} vs=${(fm.out.vs / FPM)|0} gear=${sys.gearLever} ga=${af.goArounds || 0} flap=${sys.flapLever} gs=${sys.ilsDev.gs?.toFixed(2)}`);
  }
  const R = lrw(), hd = headingVec(R.heading);
  const along = (fm.pos.x - R.threshold[0]) * hd.x + (fm.pos.z - R.threshold[2]) * hd.z;
  const lat = (fm.pos.x - R.threshold[0]) * -hd.z + (fm.pos.z - R.threshold[2]) * hd.x;
  console.log(`${s.name} / ${fname}: t=${(t / 60).toFixed(1)} min maxBank ${maxBank.toFixed(0)} stop ${along.toFixed(0)} m past thr, lat ${lat.toFixed(1)} m, td ${td ? (td.vs / FPM).toFixed(0) + ' fpm at ' + ((td.x - R.threshold[0]) * hd.x + (td.z - R.threshold[2]) * hd.z).toFixed(0) + ' m lat ' + (td.z - R.threshold[2]).toFixed(1) : '-'} ${fm.crashed ? 'CRASHED' : ''}`);
  const tdLat = td ? td.z - R.threshold[2] : 99;
  check(!fm.crashed && af.done && along > 200 && along < R.length && Math.abs(lat) < 12 && Math.abs(tdLat) < 17, `${s.name} / ${fname}: touched down with the main gear on the runway and stopped on it`);
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
