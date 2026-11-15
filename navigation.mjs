import { MAP_WIDTH, MAP_HEIGHT, walkable } from "./public/shared.js";

// A fixed navigation grid is shared by every bot. A reverse search is cached per
// destination so bots do not repeatedly scan the whole deck on each game tick.
const step = 25;
const columns = Math.ceil(MAP_WIDTH / step) + 1;
const rows = Math.ceil(MAP_HEIGHT / step) + 1;
const cells = columns * rows;
const passable = new Uint8Array(cells);
for (let y = 0; y < rows; y++)
  for (let x = 0; x < columns; x++)
    passable[y * columns + x] = Number(walkable(x * step, y * step, 18));
const routes = new Map();

function nearest(point) {
  const cx = Math.round(point.x / step),
    cy = Math.round(point.y / step);
  let best = -1,
    distance = Infinity;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx,
        y = cy + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const index = y * columns + x;
      if (!passable[index]) continue;
      const d = Math.hypot(point.x - x * step, point.y - y * step);
      if (d < distance) {
        best = index;
        distance = d;
      }
    }
  return best;
}
function field(goal) {
  if (routes.has(goal)) return routes.get(goal);
  const next = new Int32Array(cells);
  next.fill(-1);
  const queue = new Int32Array(cells);
  let head = 0,
    tail = 0;
  next[goal] = goal;
  queue[tail++] = goal;
  while (head < tail) {
    const cell = queue[head++],
      x = cell % columns,
      y = Math.floor(cell / columns);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const neighbor = ny * columns + nx;
      if (passable[neighbor] && next[neighbor] === -1) {
        next[neighbor] = cell;
        queue[tail++] = neighbor;
      }
    }
  }
  routes.set(goal, next);
  return next;
}
export function findPath(start, destination) {
  const from = nearest(start),
    goal = nearest(destination);
  if (from < 0 || goal < 0) return [];
  const next = field(goal);
  if (next[from] < 0) return [];
  const path = [];
  for (let cell = from; cell !== goal; cell = next[cell])
    path.push({
      x: (cell % columns) * step,
      y: Math.floor(cell / columns) * step,
    });
  path.push({
    x: (goal % columns) * step,
    y: Math.floor(goal / columns) * step,
  });
  path.push({ x: destination.x, y: destination.y });
  return path;
}
