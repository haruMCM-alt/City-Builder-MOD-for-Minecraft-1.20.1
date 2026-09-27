import { GEO } from './geo_data.js';

// The remote airports (built by blender/build_airport2.py --id N): the simulator's airfield
// layout (main runway along the local x axis, parallel taxiway, seven nose-in stands) inside
// each real airport's own terminal, runways and city.  Coordinates: three.js world (x east, z south), metres; the
// layout numbers are local to the airport's runway centre.  No three.js import here: the
// terrain module (also used by the headless tests) reads the flat zones from this file.

export const LAYOUT = {
  len: 3000, wid: 45,
  twyZ: -170, laneZ: -240, apronZ: [-410, -190], apronX: [-450, 450],
  standZ: -365, standCgZ: -352, stands: [-360, -240, -120, 0, 120, 240, 360],
  conns: [-1480, 0, 1480],
  serviceZ: -398, holdZ: -66,
  term: { x: [-470, 470], z: [-530, -410], h: 22 },
  tower: { x: 600, z: -440, h: 50 },
  hangar: { x: [700, 880], z: [-400, -280], h: 32 },
};

// id 1 is the home airport (Tokyo Haneda, world.glb); 2 Osaka Kansai, 3 Sapporo New Chitose,
// 4 Okinawa Naha (geo_data.js from blender/geo.py): position, local north, runway length and
// names.  Gate letters B / C / D on the stands.
const WHERE = { 2: '西南西へ約 260 km', 3: '北北東へ約 330 km', 4: '南西へ約 420 km' };
export const REMOTES = GEO.airports.filter((g) => g.id !== 1).map((g) => {
  const half = g.rwy.len / 2;
  return {
    ...LAYOUT, id: g.id, x: g.x, z: g.z, gate: 'BCD'[g.id - 2], asset: 'airport' + g.id, where: WHERE[g.id],
    len: g.rwy.len, wid: g.rwy.wid, conns: [-(half - 20), 0, half - 20],
    key: g.key, icao: g.icao, title: g.name, jp: g.jp, north: g.north, rwy: g.rwy, ils: g.ils,
  };
});
export const HOME = GEO.airports.find((g) => g.id === 1);

export const remoteById = (id) => REMOTES.find((r) => r.id === id) || null;

// the airport whose frequencies / controllers serve a position: the nearest one (home at 0, 0)
export function nearestAirport(x, z) {
  let best = 1, bd = Math.hypot(x, z);
  for (const r of REMOTES) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < bd) { bd = d; best = r.id; }
  }
  return best;
}

// terrain flat zones of every airport (runways, aprons, the island airports' sea walls)
export const FLATS = GEO.flats;

// runway name -> radio words ("24L" -> "two four left")
const DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
export function runwayWords(name) {
  const m = /^(\d{1,2})([LRC]?)$/.exec(name || '');
  if (!m) return name;
  const side = { L: ' left', R: ' right', C: ' center' }[m[2]] || '';
  return m[1].padStart(2, '0').split('').map((d) => DIG[+d]).join(' ') + side;
}

// home runways in world.json: the real names and compass headings through Haneda's north
export function applyHomeRunways(world) {
  const H = GEO.airports.find((g) => g.id === 1);
  for (const r of world?.runways || []) {
    if (r.apt) continue;
    const k27 = r.ident === '27';
    r.name = k27 ? H.rwy.k27 : H.rwy.k09;
    r.heading = ((k27 ? 270 : 90) + H.north + 360) % 360;
    if (r.ils) { r.ils.course = r.heading; r.ils.freq = k27 ? H.ils.k27 : H.ils.k09; }
  }
  return world;
}

// main runway of every remote airport, in world.json's runway format (appended after the home
// runways, so lookups by ident still find the home airport first)
export function remoteRunways() {
  const out = [];
  for (const ap of REMOTES) {
    // key '09' is flown towards +x, '27' towards -x; the compass headings and names are the
    // real ones through the airport's local north
    const rw = (ident, sx, hdg, name, freq) => ({ ident, name, apt: ap.id, threshold: [ap.x + sx * ap.len / 2, 0, ap.z], heading: hdg,
      length: ap.len, width: ap.wid, elevation: 0, ils: { course: hdg, glideslope: 3, gsAntennaFromThr: 300, freq } });
    const h09 = (90 + ap.north + 360) % 360, h27 = (270 + ap.north + 360) % 360;
    out.push(rw('09', -1, h09, ap.rwy.k09, ap.ils.k09), rw('27', 1, h27, ap.rwy.k27, ap.ils.k27));
  }
  return out;
}

