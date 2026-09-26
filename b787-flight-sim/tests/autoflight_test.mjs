// Headless test of the auto-flight mode: take-off from the home runway, cruise, descent,
// ILS autoland and stop at each remote airport (no graphics, same code as the game).
//   node tests/autoflight_test.mjs            (787-9, all destinations)
//   AC=b737-800 DEST=3 node tests/autoflight_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlightModel, SPEC } from '../web/js/flightmodel.js';
import { Systems } from '../web/js/systems.js';
import { configureTerrain, terrainHeight } from '../web/js/terrain.js';
import { REMOTES } from '../web/js/airports.js';
import { AutoFlight } from '../web/js/autoflight.js';
import { V3, FPM, headingVec } from '../web/js/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(fs.readFileSync(path.join(here, `../web/assets/${process.env.AC || 'b787-9'}.json`)));
if (meta.spec) Object.assign(SPEC, meta.spec);
const KM = SPEC.MTOW / 254011;
const world = JSON.parse(fs.readFileSync(path.join(here, '../web/assets/world.json')));
configureTerrain(world);
const GY = -meta.groundY - 0.2;

let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); ok = ok && c; };
const dests = process.env.DEST ? REMOTES.filter((r) => r.id === +process.env.DEST) : REMOTES;
for (const depId of ['27', '09']) {
  for (const ap of dests) {
    const dep = world.runways.find((r) => r.ident === depId);
    const sx = ap.x >= 0 ? 1 : -1;
    const dest = { ident: sx > 0 ? '09' : '27', apt: ap.id, threshold: [ap.x - sx * ap.len / 2, 0, ap.z], heading: sx > 0 ? 90 : 270, length: ap.len, width: ap.wid, elevation: 0,
      ils: { course: sx > 0 ? 90 : 270, glideslope: 3, gsAntennaFromThr: 300, freq: '111.10' } };
    const fm = new FlightModel(meta), sys = new Systems(fm, world);
    fm.payload = 26000 * KM; fm.fuel = (+process.env.FUEL || 45000) * KM;
    const d = headingVec(dep.heading);
    fm.reset(new V3(dep.threshold[0] + d.x * 75, GY, dep.threshold[2] + d.z * 75), dep.heading, 0, 0, true);
    sys.selectRunway(dep);
    const af = new AutoFlight(fm, sys, { dep, dest, name: 'A' + ap.id });
    const DT = 1 / 120;
    let t = 0, td = null, minAgl = 1e9, maxBank = 0, phases = [];
    while (t < 3600 && !af.done && !fm.crashed) {
      af.update(DT);
      sys.update(DT); fm.step(DT); fm.update();
      t += DT;
      const o = fm.out;
      if (phases[phases.length - 1] !== af.phase) phases.push(af.phase);
      if (!o.wow && Math.hypot(fm.pos.x, fm.pos.z) > 15000 && Math.hypot(fm.pos.x - ap.x, fm.pos.z - ap.z) > 15000) minAgl = Math.min(minAgl, fm.pos.y - Math.max(0, terrainHeight(fm.pos.x, fm.pos.z)));
      maxBank = Math.max(maxBank, Math.abs(o.bank));
      if (process.env.VERBOSE && Math.abs(t / 20 - Math.round(t / 20)) < DT / 40) console.log(`  t=${t.toFixed(0)} ${af.phase} x=${fm.pos.x.toFixed(0)} z=${fm.pos.z.toFixed(0)} alt=${o.altFt.toFixed(0)} ias=${o.ias.toFixed(0)} hdg=${o.hdg.toFixed(0)} mcpHdg=${sys.mcp.hdg} ${sys.ap.roll}/${sys.ap.pitch} arm=${JSON.stringify(sys.ap.armed)} flap=${sys.flapLever} gear=${sys.gearLever} wp=${af.wi} gs=${sys.ilsDev.gs?.toFixed(2)} loc=${sys.ilsDev.loc?.toFixed(2)}`);
      for (const e of fm.events) if (e.type === 'touchdown' && !td) {
        const hd = headingVec(dest.heading);
        const dx = fm.pos.x - dest.threshold[0], dz = fm.pos.z - dest.threshold[2];
        td = { along: dx * hd.x + dz * hd.z, lat: dx * -hd.z + dz * hd.x, vs: e.vs / FPM, t };
      }
      fm.events.length = 0;
    }
    console.log(`RWY ${depId} -> airport ${ap.id} (rwy ${dest.ident}): ${phases.join('>')} t=${(t / 60).toFixed(1)} min cruise FL${Math.round(af.cruiseFt / 100)} maxBank ${maxBank.toFixed(0)} minAGL ${minAgl.toFixed(0)} m`,
      td ? `td ${td.along.toFixed(0)} m past thr, lat ${td.lat.toFixed(1)} m, ${td.vs.toFixed(0)} fpm` : 'no touchdown', fm.crashed ? 'CRASHED' : '');
    check(!fm.crashed && af.done, `arrived at airport ${ap.id} from RWY ${depId}`);
    check(td && td.along > 100 && td.along < 1200 && Math.abs(td.lat) < 8, 'touchdown in the TDZ on the centre line');
    check(minAgl > 250, 'terrain clearance en route');
  }
}
console.log(ok ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
