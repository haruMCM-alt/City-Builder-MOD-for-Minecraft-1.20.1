// Headless flight test of the physics + systems (no graphics).
//   node tests/flight_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlightModel } from '../web/js/flightmodel.js';
import { Systems } from '../web/js/systems.js';
import { configureTerrain, terrainHeight } from '../web/js/terrain.js';
import { V3, KT, FT, DEG, FPM, headingVec } from '../web/js/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(fs.readFileSync(path.join(here, '../web/assets/b787-9.json')));
const world = JSON.parse(fs.readFileSync(path.join(here, '../web/assets/world.json')));
configureTerrain(world);
const rwy27 = world.runways.find((r) => r.ident === '27');

const DT = 1 / 240;
function run(fm, sys, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sys.update(DT);
    fm.step(DT);
    fm.update();
    if (each && each(i * DT) === false) return false;
    if (fm.crashed) return false;
  }
  return true;
}
const fmt = (o) => `t=${o.t?.toFixed(1)} ias=${o.ias.toFixed(1)} alt=${o.altFt.toFixed(0)}ft vs=${(o.vs / FPM).toFixed(0)} pitch=${o.pitch.toFixed(1)} bank=${o.bank.toFixed(1)} hdg=${o.hdg.toFixed(1)} a=${(o.alpha / DEG).toFixed(1)} ra=${o.raFt.toFixed(0)}`;

let ok = true;
function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); ok = ok && cond; }

// ---------------------------------------------------------------- takeoff
{
  const fm = new FlightModel(meta);
  const sys = new Systems(fm, world);
  fm.payload = 26000; fm.fuel = 45000;
  const start = new V3(rwy27.threshold[0] - 80, 0, 0);
  fm.reset(new V3(start.x, 5.05, start.z), 270, 0, 0, true);
  run(fm, sys, 4);
  const o = fm.out;
  console.log('settled:', fmt(o), 'gear loads', fm.gear.map((g) => (g.load / 1000).toFixed(0) + 'kN').join(' '),
    'nose share', (fm.gear[0].load / fm.gear.reduce((s, g) => s + g.load, 0) * 100).toFixed(1) + '%');
  check(Math.abs(o.pitch) < 1.5 && o.wow, 'aircraft rests level on its gear');
  sys.flapLever = 2; // flaps 5
  sys.speedbrakeArmed = true;
  sys.pilot.throttle = 1.0;
  const vs = sys.vspeeds();
  console.log('V-speeds: V1', vs.v1.toFixed(0), 'VR', vs.vr.toFixed(0), 'V2', vs.v2.toFixed(0), 'Vref30', vs.vref30.toFixed(0), 'mass', fm.mass);
  let rot = false, liftoff = null, rotT = null; const x0 = fm.pos.x;
  run(fm, sys, 80, (t) => {
    if (!rot && o.ias >= vs.vr) rot = true;
    // rotate at ~2.5 deg/s to 12.5 deg, then hold the attitude until 400 ft
    if (rot) sys.pilot.pitch = o.raFt < 400 ? Math.max(-0.3, Math.min(0.7, (Math.min(12.5, 2.5 * (t - rotT)) - o.pitch) * 0.25)) : 0;
    if (rot && rotT === null) rotT = t;
    if (!liftoff && !o.wow) { liftoff = { t, ias: o.ias, dist: x0 - fm.pos.x, pitch: o.pitch }; }
    if (liftoff && o.raFt > 400 && sys.gearLever) sys.gearLever = false;
    if (o.altFt > 1500) return false;
  });
  console.log('liftoff', liftoff);
  console.log('at 1500ft:', fmt(o));
  check(liftoff && liftoff.dist > 1100 && liftoff.dist < 3200, 'takeoff roll ' + (liftoff && liftoff.dist.toFixed(0)) + ' m');
  check(o.altFt >= 1400, 'climbed through 1500 ft');
  // --- flap retraction, AP on, climb to 5000 and hold 250 kt ---
  sys.pilot.pitch = 0;
  sys.flapLever = 0;
  sys.mcp.alt = 5000; sys.mcp.spd = 250; sys.mcp.hdg = 250; sys.mcp.vs = 2000;
  sys.ap.roll = 'HDG'; sys.ap.pitch = 'VS';
  sys.engageAP();
  sys.at.on = true; sys.at.mode = 'SPD';
  run(fm, sys, 240);
  console.log('after 240 s AP:', fmt(o), 'stab', (fm.ctl.stab / DEG).toFixed(2), 'elev', (fm.ctl.elevator / DEG).toFixed(2), 'N1', fm.engines[0].n1.toFixed(1));
  check(Math.abs(o.altFt - 5000) < 60, 'AP altitude hold 5000 ft (' + o.altFt.toFixed(0) + ')');
  check(Math.abs(o.hdg - 250) < 2, 'AP heading 250');
  check(Math.abs(o.ias - 250) < 6, 'A/T speed 250 kt (' + o.ias.toFixed(1) + ')');
  // --- cruise check: FL350 M0.85 trim
}

// ---------------------------------------------------------------- cruise trim / performance
{
  const fm = new FlightModel(meta);
  const sys = new Systems(fm, world);
  fm.payload = 26000; fm.fuel = 60000;
  const alt = 35000 * FT;
  fm.reset(new V3(0, alt, -30000), 270, 0.85 * 296.5, 2.0, false);
  sys.flapLever = 0; sys.gearLever = false; fm.ctl.gearPos = 1; fm.ctl.flapAngle = 0;
  sys.airTime = 5; sys.gammaT = 0;
  sys.mcp.alt = 35000; sys.mcp.hdg = 270; sys.mcp.spd = 262;
  sys.ap.roll = 'HDG'; sys.ap.pitch = 'ALT'; sys.ap.on = true;
  // hold Mach 0.85 with A/T: set IAS target equal to M.85 CAS at FL350
  run(fm, sys, 5);
  sys.mcp.spd = Math.round(fm.out.ias);
  sys.at.on = true; sys.at.mode = 'SPD';
  run(fm, sys, 120);
  const o = fm.out;
  console.log('cruise:', fmt(o), 'M', o.mach.toFixed(3), 'N1', fm.engines[0].n1.toFixed(1), 'FF/eng', (fm.engines[0].ff * 3600).toFixed(0) + ' kg/h', 'CL', o.CL.toFixed(3));
  check(o.mach > 0.83 && o.mach < 0.87, 'cruise Mach ~0.85');
  check(fm.engines[0].n1 > 70 && fm.engines[0].n1 < 98, 'cruise N1 plausible');
  check(fm.engines[0].ff * 3600 > 2400 && fm.engines[0].ff * 3600 < 3800, 'cruise fuel flow plausible (~2.5-3.5 t/h/eng)');
}

// ---------------------------------------------------------------- ILS autoland
{
  const fm = new FlightModel(meta);
  const sys = new Systems(fm, world);
  fm.payload = 26000; fm.fuel = 18000;
  sys.selectRunway(rwy27);
  const dir = headingVec(270);
  const d = 12 * 1852;
  const p = new V3(rwy27.threshold[0] - dir.x * d + 300, 3000 * FT, rwy27.threshold[2] - dir.z * d + 900);
  fm.reset(p, 250, 180 * KT, 1.5, false);
  sys.flapLever = 4; fm.ctl.flapAngle = 20; sys.gearLever = true; fm.ctl.gearPos = 0;
  sys.airTime = 5; sys.gammaT = 0;
  sys.mcp.alt = 3000; sys.mcp.hdg = 250; sys.mcp.spd = 160;
  sys.ap.roll = 'HDG'; sys.ap.pitch = 'ALT'; sys.ap.on = true; sys.ap.armed.loc = true; sys.ap.armed.gs = true;
  sys.at.on = true; sys.at.mode = 'SPD';
  sys.speedbrakeArmed = true; sys.autobrake = 3;
  let tdT = null;
  let td = null, gsCap = null, locCap = null, maxDev = 0;
  run(fm, sys, 600, (t) => {
    const o = fm.out;
    if (!locCap && sys.ap.roll === 'LOC') locCap = t;
    if (!gsCap && sys.ap.pitch === 'GS') { gsCap = t; sys.flapLever = 6; sys.mcp.spd = Math.round(sys.vspeeds().vref30 + 5); }
    if (gsCap && o.raFt > 200 && o.raFt < 1000) maxDev = Math.max(maxDev, Math.abs(sys.ilsDev.gs));
    for (const e of fm.events) if (e.type === 'touchdown' && !td) td = { ...e, x: fm.pos.x, lat: sys.ilsDev.locM, pitch: o.pitch };
    if (td) sys.pilot.reverse = o.gs > 60 ? 1 : 0;
    if (td && Math.abs(t * 2 - Math.round(t * 2)) < DT && (process.env.VERBOSE || o.gs < 0)) console.log('  roll', t.toFixed(1), 'gs', o.gs.toFixed(0), 'hdg', o.hdg.toFixed(1), 'lat', sys.ilsDev.locM.toFixed(1), 'steer', (fm.ctl.steer / DEG).toFixed(1), 'rud', (fm.ctl.rudder / DEG).toFixed(1), 'beta', (o.beta / DEG).toFixed(1), 'ap', sys.ap.roll, 'brk', fm.ctl.brakeL.toFixed(2));
    if (td && o.gs < 5) return false;
  });
  const o = fm.out;
  console.log('LOC capture t=', locCap?.toFixed(0), 'GS capture t=', gsCap?.toFixed(0), 'max GS dev', maxDev.toFixed(2));
  console.log('touchdown', td && { vsFpm: (td.vs / FPM).toFixed(0), ias: td.ias.toFixed(0), fromThr: (rwy27.threshold[0] - td.x).toFixed(0), lateral: td.lat.toFixed(1), pitch: td.pitch.toFixed(1) });
  console.log('stopped at', (rwy27.threshold[0] - fm.pos.x).toFixed(0), 'm from threshold', fmt(o), 'crashed', fm.crashed, fm.events.filter(e=>e.type==='crash'));
  check(!!td && !fm.crashed, 'autoland touchdown without crash');
  check(td && td.vs / FPM > -400 && td.vs / FPM < -40, 'touchdown sink rate gentle');
  check(td && Math.abs(td.lat) < 6, 'touchdown on centreline');
  check(td && (rwy27.threshold[0] - td.x) > 150 && (rwy27.threshold[0] - td.x) < 900, 'touchdown in the TDZ');
}
console.log(ok ? '\nALL PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
