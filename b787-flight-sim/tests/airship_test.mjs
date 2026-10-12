// Headless test of the hybrid airship (MA-AS Kujira): moored on the runway, vectored lift-off,
// forward flight, autopilot height / heading hold, hover with the propellers up, drift in wind.
//   node tests/airship_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlightModel, SPEC } from '../web/js/flightmodel.js';
import { Systems } from '../web/js/systems.js';
import { configureTerrain } from '../web/js/terrain.js';
import { V3, KT, FT, FPM } from '../web/js/util.js';
import { applyHomeRunways } from '../web/js/airports.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(fs.readFileSync(path.join(here, '../web/assets/ma-as.json')));
Object.assign(SPEC, meta.spec);
const world = JSON.parse(fs.readFileSync(path.join(here, '../web/assets/world.json')));
configureTerrain(world);
applyHomeRunways(world);
const rwy = world.runways.find((r) => r.ident === '27');
const DT = 1 / 240;
const run = (fm, sys, sec, each) => { for (let i = 0; i < sec / DT; i++) { sys.update(DT); fm.step(DT); fm.update(); if (each && each(i * DT) === false) break; if (fm.crashed) return false; } return true; };
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); ok = ok && c; };
const st = (o) => `ias=${o.ias.toFixed(1)}kt gs=${o.gs.toFixed(1)} alt=${o.altFt.toFixed(0)}ft vs=${(o.vs / FPM).toFixed(0)}fpm pitch=${o.pitch.toFixed(1)} bank=${o.bank.toFixed(1)} hdg=${o.hdg.toFixed(0)} ra=${o.raFt.toFixed(0)}`;

const fm = new FlightModel(meta);
const sys = new Systems(fm, world);
fm.payload = 6000; fm.fuel = 6000;
const gy = -meta.groundY - 0.42;
fm.reset(new V3(rwy.threshold[0] - 300, gy, rwy.threshold[2]), rwy.heading, 0, 0, true);
fm.ctl.parkingBrake = true;
run(fm, sys, 5);
console.log('moored:', st(fm.out), 'lift', (fm.out.lift / 9.81 / 1000).toFixed(1), 't, mass', (fm.mass / 1000).toFixed(1), 't, gear', fm.gear.map((g) => (g.load / 1000).toFixed(0) + 'kN').join(' '));
check(fm.out.wow && Math.abs(fm.out.pitch) < 3, 'rests on its gear and pads');
// vectored lift-off: propellers up, full power
fm.ctl.parkingBrake = false; sys.parkingBrake = false;
sys.flapLever = 6;
run(fm, sys, 6);                         // (the ducts swing up first)
sys.pilot.throttle = 1.0;
let liftT = null;
run(fm, sys, 60, (t) => { if (liftT === null && !fm.out.wow && fm.out.raFt > 10) liftT = t; });
console.log('after vertical climb:', st(fm.out), 'lift-off at', liftT && liftT.toFixed(1), 's');
check(liftT !== null && fm.out.raFt > 40, 'climbs vertically with the propellers tilted up');
check(fm.out.gs < 8, 'little forward speed in the vertical climb (' + fm.out.gs.toFixed(1) + ' kt)');
// transition: propellers forward, climb on the hull
sys.flapLever = 0;
run(fm, sys, 120, (t) => { sys.pilot.pitch = fm.out.altFt < 1200 ? 0.6 : 0; });
console.log('forward flight:', st(fm.out));
check(fm.out.ias > 45 && fm.out.ias < 70, 'cruise speed ~50-65 kt (' + fm.out.ias.toFixed(1) + ')');
check(Math.abs(fm.out.bank) < 5, 'the hull stays level (bank ' + fm.out.bank.toFixed(1) + ')');
// autopilot: hold 1500 ft and turn to a new heading
sys.pilot.pitch = 0;
sys.mcp = { spd: 50, hdg: Math.round((fm.out.hdg + 60) % 360), alt: 1500, vs: 0 };
sys.ap.roll = 'HDG'; sys.ap.pitch = 'ALT'; sys.ap.on = true; sys.at.on = true; sys.at.mode = 'SPD';
run(fm, sys, 240);
const dh = Math.abs(((fm.out.hdg - sys.mcp.hdg + 540) % 360) - 180);
console.log('AP:', st(fm.out));
check(Math.abs(fm.out.altFt - 1500) < 150, 'AP holds 1500 ft (' + fm.out.altFt.toFixed(0) + ')');
check(dh < 5, 'AP turns onto the selected heading (off by ' + dh.toFixed(1) + ' deg)');
// hover: reverse thrust to stop, then propellers up
sys.ap.on = false; sys.at.on = false;
sys.pilot.reverse = 1; sys.pilot.throttle = 0.8;
run(fm, sys, 90, () => { if (fm.out.ias < 6) return false; });
console.log('stopped:', st(fm.out), fm.crashed ? fm.events.map((e) => e.reason).join() : '');
sys.pilot.reverse = 0; sys.flapLever = 6;
run(fm, sys, 40, () => { sys.pilot.throttle = fm.out.vs < 0 ? 0.75 : 0.45; });
console.log('hover:', st(fm.out));
check(fm.out.ias < 12, 'nearly stops in the air (' + fm.out.ias.toFixed(1) + ' kt)');
check(!fm.crashed, 'no crash');
// wind: 20 kt from the side drifts the slow airship
const ref = fm.pos.clone();
fm.wind.set(20 * KT, 0, 0);
run(fm, sys, 60, () => { sys.pilot.throttle = fm.out.vs < 0 ? 0.75 : 0.45; });
const drift = Math.hypot(fm.pos.x - ref.x, fm.pos.z - ref.z);
console.log('drift in 60 s at 20 kt wind:', drift.toFixed(0), 'm');
check(drift > 250, 'drifts with the wind');
console.log(ok ? '\nALL PASSED' : '\nSOME CHECKS FAILED');
