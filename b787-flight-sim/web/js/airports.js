// The remote airports (built by blender/build_airport2.py --id N): one airfield design (runway
// 09/27, parallel taxiway, seven nose-in stands, terminal, tower, hangar), each airport at its
// own place with its own town.  Coordinates: three.js world (x east, z south), metres; the
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

// id 1 is the home airport (world.glb); gate letters B / C / D on the stands
export const REMOTES = [
  { id: 2, x: 200000, z: -9000, gate: 'B', asset: 'airport2', where: '東へ約 200 km' },
  { id: 3, x: -180000, z: -10000, gate: 'C', asset: 'airport3', where: '西へ約 180 km' },
  { id: 4, x: 300000, z: -8000, gate: 'D', asset: 'airport4', where: '東へ約 300 km' },
].map((r) => ({ ...LAYOUT, ...r }));

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

// terrain flat zone around each remote airport (runway, town)
export const FLATS = REMOTES.map((r) => ({ x0: r.x - 14000, x1: r.x + 14000, z0: r.z - 3500, z1: r.z + 3500 }));
