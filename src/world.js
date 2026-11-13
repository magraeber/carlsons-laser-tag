// Shared by collision, shooting, navigation, rendering and the mechanics tests.
export const ARENA = { halfX: 21, halfZ: 23 };
export const HUMAN_HP = 3;
export const RADIUS = 0.36;
export const EYE_HEIGHT = 1.58;
export const COLORS = { pink: '#ff3897', blue: '#47c8ff', monster: '#ff9b38', violet: '#a681ff', mint: '#66f5b6', yellow: '#f4e26b', red: '#ff6470', white: '#e8efff' };

const block = (x, z, w, d, h = 2.6, stacked = false, color = 'pink') => ({ x, z, w, d, h, stacked, color });
export const BLOCKS = [
  block(-12, -15, 5, 2, 2.8, true), block(12, 15, 5, 2, 2.8, true),
  block(11, -15, 3.2, 4, 2.7), block(-11, 15, 3.2, 4, 2.7),
  block(-5, -17, 2, 4, 2.5), block(5, 17, 2, 4, 2.5),
  block(-16, -6, 2, 7, 2.7, true), block(16, 6, 2, 7, 2.7, true),
  block(16, -9, 2.2, 5, 2.8), block(-16, 9, 2.2, 5, 2.8),
  block(-6, -8, 6, 2.2, 2.6, true), block(6, 8, 6, 2.2, 2.6, true),
  block(5, -7, 2, 5, 2.5), block(-5, 7, 2, 5, 2.5),
  block(-10, 0, 4, 3, 2.5), block(10, 0, 4, 3, 2.5),
  block(-2.8, 0, 2.2, 3.8, 3.1, true), block(2.8, 0, 2.2, 3.8, 3.1, true),
  block(1, -12, 3, 1.8, 2.2), block(-1, 12, 3, 1.8, 2.2),
  block(-18, -19, 1.5, 1.5, 3.8, false, 'blue'), block(18, 19, 1.5, 1.5, 3.8, false, 'blue'),
];
export const TEAM_SPAWNS = {
  pink: [{ x: -13, z: 20 }, { x: -6, z: 20 }, { x: 1, z: 20 }, { x: 12, z: 20 }],
  blue: [{ x: 13, z: -20 }, { x: 6, z: -20 }, { x: -1, z: -20 }, { x: -12, z: -20 }],
};
export const FFA_SPAWNS = [
  { x: -13, z: 20 }, { x: 13, z: -20 }, { x: -18, z: -13 },
  { x: 18, z: 14 }, { x: -18, z: 3 }, { x: 18, z: -2 }, { x: 0, z: -20 },
];
export const MONSTER_SPAWNS = [{ x: -18, z: -21 }, { x: 18, z: 21 }, { x: -18, z: 20 }, { x: 18, z: -20 }];

export function isFree(x, z, radius = RADIUS) {
  if (Math.abs(x) > ARENA.halfX - radius || Math.abs(z) > ARENA.halfZ - radius) return false;
  return !BLOCKS.some(b => {
    const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
    return dx * dx + dz * dz < radius * radius;
  });
}

export function moveBody(body, dx, dz, others = []) {
  // Substeps prevent tunnelling on slow phones; slide along walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  const free = (x, z) => isFree(x, z) && !others.some(e => e !== body && e.alive && Math.hypot(e.x - x, e.z - z) < RADIUS * 2);
  for (let i = 0; i < steps; i++) {
    if (free(body.x + dx / steps, body.z)) body.x += dx / steps;
    if (free(body.x, body.z + dz / steps)) body.z += dz / steps;
  }
}

export function rayBox(origin, dir, box, max = Infinity) {
  let near = 0, far = max;
  for (const [axis, low, high] of [['x', box.x - box.w / 2, box.x + box.w / 2], ['y', 0, box.h], ['z', box.z - box.d / 2, box.z + box.d / 2]]) {
    if (Math.abs(dir[axis]) < 1e-8) {
      if (origin[axis] < low || origin[axis] > high) return Infinity;
    } else {
      let a = (low - origin[axis]) / dir[axis], b = (high - origin[axis]) / dir[axis];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return near;
}

export function wallDistance(origin, dir, max = 65) {
  let nearest = max;
  for (const b of BLOCKS) nearest = Math.min(nearest, rayBox(origin, dir, b, nearest));
  // Bounds are solid walls, including the ceiling and floor.
  for (const [axis, low, high] of [['x', -21, 21], ['z', -23, 23], ['y', 0, 7]]) {
    if (dir[axis] > 1e-8) nearest = Math.min(nearest, Math.max(0, (high - origin[axis]) / dir[axis]));
    else if (dir[axis] < -1e-8) nearest = Math.min(nearest, Math.max(0, (low - origin[axis]) / dir[axis]));
  }
  return nearest;
}

export function hasLineOfSight(a, b) {
  const dy = (b.y ?? 1.3) - (a.y ?? EYE_HEIGHT);
  const distance = Math.hypot(b.x - a.x, b.z - a.z, dy);
  if (distance < 0.01) return true;
  const dir = { x: (b.x - a.x) / distance, y: dy / distance, z: (b.z - a.z) / distance };
  return wallDistance({ x: a.x, y: a.y ?? EYE_HEIGHT, z: a.z }, dir, distance) >= distance - 0.01;
}

export function rayBody(origin, dir, entity, max) {
  const radius = entity.kind === 'monster' ? 0.46 : 0.4;
  const ox = origin.x - entity.x, oz = origin.z - entity.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-8) return Infinity;
  const b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
  const leave = (-b + Math.sqrt(discriminant)) / (2 * a);
  const t = entry > 0.01 ? entry : leave;
  const y = origin.y + dir.y * t;
  return t > 0.01 && t < max && y >= 0.15 && y <= (entity.kind === 'monster' ? 1.8 : 1.98) ? t : Infinity;
}

const GRID_W = 42, GRID_H = 46;
const cellIndex = (x, z) => z * GRID_W + x;
const grid = Array.from({ length: GRID_W * GRID_H }, (_, i) => isFree(i % GRID_W - 20.5, Math.floor(i / GRID_W) - 22.5, 0.5));
const pointOf = i => ({ x: i % GRID_W - 20.5, z: Math.floor(i / GRID_W) - 22.5 });
function nearestCell(p) {
  const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor(p.x + 21)));
  const cz = Math.max(0, Math.min(GRID_H - 1, Math.floor(p.z + 23)));
  for (let r = 0; r < 5; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, z = cz + dz, i = cellIndex(x, z);
    if (x >= 0 && x < GRID_W && z >= 0 && z < GRID_H && grid[i]) return i;
  }
  return -1;
}
export function findPath(start, goal) {
  const from = nearestCell(start), to = nearestCell(goal);
  if (from < 0 || to < 0) return [];
  const queue = [from], previous = new Int32Array(grid.length).fill(-1);
  previous[from] = from;
  for (let head = 0; head < queue.length && previous[to] === -1; head++) {
    const current = queue[head], x = current % GRID_W, z = Math.floor(current / GRID_W);
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, nz = z + dz, next = cellIndex(nx, nz);
      if (nx < 0 || nx >= GRID_W || nz < 0 || nz >= GRID_H || !grid[next] || previous[next] !== -1) continue;
      previous[next] = current; queue.push(next);
    }
  }
  if (previous[to] === -1) return [];
  const path = [];
  for (let at = to; at !== from; at = previous[at]) path.push(pointOf(at));
  return path.reverse();
}

export const COVER_POINTS = BLOCKS.flatMap(b => [
  { x: b.x - b.w / 2 - 0.9, z: b.z - b.d / 2 - 0.9 },
  { x: b.x + b.w / 2 + 0.9, z: b.z - b.d / 2 - 0.9 },
  { x: b.x - b.w / 2 - 0.9, z: b.z + b.d / 2 + 0.9 },
  { x: b.x + b.w / 2 + 0.9, z: b.z + b.d / 2 + 0.9 },
]).filter(p => isFree(p.x, p.z, 0.5));

export function seededRandom(seed = 12345) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
