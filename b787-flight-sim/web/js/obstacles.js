// Buildings and towers as axis-aligned boxes (world.json "obstacles": x0, z0, x1, z1, top),
// indexed in a 100 m grid for fast point queries by the flight model.
const CELL = 100;
const grid = new Map();
let boxes = null;

export function configureObstacles(world) {
  grid.clear();
  const o = world && world.obstacles;
  if (!o) { boxes = null; return; }
  boxes = new Float32Array(o);
  for (let i = 0; i < o.length; i += 5) {
    const x0 = Math.floor(o[i] / CELL), z0 = Math.floor(o[i + 1] / CELL), x1 = Math.floor(o[i + 2] / CELL), z1 = Math.floor(o[i + 3] / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x * 100003 + z;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    }
  }
}

// top of the building containing (x, z) if the point y is inside it, else -1
export function obstacleAt(x, y, z) {
  if (!boxes) return -1;
  const a = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  if (!a) return -1;
  for (const i of a) {
    if (x >= boxes[i] && x <= boxes[i + 2] && z >= boxes[i + 1] && z <= boxes[i + 3] && y < boxes[i + 4] && y > -1) return boxes[i + 4];
  }
  return -1;
}
