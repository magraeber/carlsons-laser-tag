import { HUMAN_HP, EYE_HEIGHT, COLORS, TEAM_SPAWNS, FFA_SPAWNS, MONSTER_SPAWNS, COVER_POINTS, isFree, moveBody, hasLineOfSight, findPath, wallDistance, rayBody, seededRandom } from './world.js';

const names = ['DU', 'NOVA', 'ECHO', 'FLUX', 'AXEL', 'ION', 'KIRA', 'BYTE'];
const ffaColors = ['pink', 'blue', 'mint', 'violet', 'yellow', 'red', 'white'];
export const MAX_MONSTERS = 3;
export const HIT_PROTECTION = 0.38;

export function areEnemies(a, b, mode) {
  if (a === b || !b.alive) return false;
  if (a.kind === 'monster') return b.kind === 'human';
  return b.kind === 'monster' || mode === 'ffa' || a.team !== b.team;
}

export function roundOutcome(entities, mode) {
  const humans = entities.filter(e => e.kind === 'human' && e.alive);
  if (humans.length === 0) return { winner: null, draw: true };
  if (mode === 'ffa') return humans.length === 1 ? { winner: humans[0].id, name: humans[0].name, draw: false } : null;
  const teams = new Set(humans.map(e => e.team));
  return teams.size === 1 ? { winner: humans[0].team, draw: false } : null;
}

export class Game {
  constructor({ mode = 'team', team = 'pink', seed = Date.now(), onEvent = () => {} } = {}) {
    this.mode = mode; this.team = team; this.random = seededRandom(seed); this.onEvent = onEvent;
    this.entities = []; this.time = 0; this.nextMonster = 12; this.monsterSerial = 0; this.outcome = null;
    this.stats = { shots: 0, hits: 0, kills: 0 };
    if (mode === 'team') {
      const teams = [team, team === 'pink' ? 'blue' : 'pink'];
      for (const color of teams) for (const spawn of TEAM_SPAWNS[color]) this.addEntity({ ...spawn, team: color, color, yaw: color === 'pink' ? 0 : Math.PI });
    } else {
      FFA_SPAWNS.forEach((p, i) => this.addEntity({ ...p, team: i, color: ffaColors[i], yaw: Math.atan2(p.x, p.z) }));
    }
    this.player = this.entities[0]; this.player.isPlayer = true;
  }

  addEntity(data) {
    const monster = data.kind === 'monster';
    const entity = { id: this.entities.length, kind: 'human', name: names[this.entities.length] ?? 'WÄCHTER', hp: monster ? 2 : HUMAN_HP,
      alive: true, x: 0, z: 0, yaw: 0, pitch: 0, cooldown: 1 + this.random(), protection: 0,
      brainTimer: this.random() * 0.4, targetId: null, path: [], pathIndex: 0, lastX: data.x, lastZ: data.z,
      stuckTime: 0, coverUntil: 0, hitAt: -10, fireAt: -10, walk: 0, ...data };
    this.entities.push(entity); return entity;
  }

  damage(target, shooter) {
    if (!target.alive || target.protection > 0 || !areEnemies(shooter, target, this.mode)) return false;
    target.hp -= 1; target.protection = HIT_PROTECTION; target.hitAt = this.time;
    if (shooter.isPlayer) this.stats.hits += 1;
    this.onEvent({ type: 'hit', target, shooter });
    if (target.hp <= 0) {
      target.alive = false; target.path = [];
      if (shooter.isPlayer) this.stats.kills += 1;
      this.onEvent({ type: 'eliminated', target, shooter });
    }
    return true;
  }

  shoot(shooter, direction, aimAssist = false) {
    if (!shooter.alive || shooter.cooldown > 0 || this.outcome) return null;
    shooter.cooldown = shooter.isPlayer ? 0.34 : shooter.kind === 'monster' ? 2 + this.random() * 0.8 : 1.55 + this.random();
    shooter.fireAt = this.time;
    if (shooter.isPlayer) this.stats.shots++;
    const origin = { x: shooter.x, y: shooter.kind === 'monster' ? 1.32 : EYE_HEIGHT, z: shooter.z };
    let dir = { ...direction };
    if (aimAssist) {
      let bestDot = 0.9975;
      for (const target of this.entities) {
        if (!areEnemies(shooter, target, this.mode)) continue;
        const diff = { x: target.x - origin.x, y: 1.3 - origin.y, z: target.z - origin.z };
        const length = Math.hypot(diff.x, diff.y, diff.z), dot = (dir.x * diff.x + dir.y * diff.y + dir.z * diff.z) / length;
        if (dot > bestDot && hasLineOfSight(origin, target)) { bestDot = dot; dir = { x: diff.x / length, y: diff.y / length, z: diff.z / length }; }
      }
    }
    let nearest = wallDistance(origin, dir), target = null;
    for (const entity of this.entities) {
      if (!entity.alive || entity === shooter) continue;
      const distance = rayBody(origin, dir, entity, nearest);
      if (distance < nearest) { nearest = distance; target = entity; }
    }
    const hit = target ? this.damage(target, shooter) : false;
    const end = { x: origin.x + dir.x * nearest, y: origin.y + dir.y * nearest, z: origin.z + dir.z * nearest };
    const shot = { type: 'shot', origin, end, shooter, target, hit, color: COLORS[shooter.color] };
    this.onEvent(shot); return shot;
  }

  direction(yaw, pitch = 0) { return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }; }

  movePlayer(dx, dz, dt) {
    if (!this.player.alive || this.outcome) return;
    const p = this.player, length = Math.max(1, Math.hypot(dx, dz)), speed = 4.5 * dt;
    const x = (Math.cos(p.yaw) * dx + Math.sin(p.yaw) * dz) / length;
    const z = (-Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / length;
    moveBody(p, x * speed, z * speed, this.entities);
    p.walk += Math.hypot(x, z) * dt * 9;
  }

  chooseGoal(bot, target, visible, distance) {
    if (bot.coverGoal && this.time < bot.coverUntil) return bot.coverGoal;
    if (visible && distance < 15 && (bot.hp < 3 || this.random() < 0.55)) {
      let best = null, bestScore = Infinity;
      for (const p of COVER_POINTS) {
        const travel = Math.hypot(p.x - bot.x, p.z - bot.z), enemyDistance = Math.hypot(p.x - target.x, p.z - target.z);
        if (travel < 1 || travel > 8 || enemyDistance < 3 || enemyDistance > 20) continue;
        const hidden = !hasLineOfSight(p, target);
        const score = travel + Math.abs(enemyDistance - 9) * 0.3 - (hidden ? 3 : 0) + this.random() * 2;
        if (score < bestScore) { best = p; bestScore = score; }
      }
      if (best) {
        bot.coverUntil = this.time + Math.hypot(best.x - bot.x, best.z - bot.z) / 2.65 + .7;
        bot.coverGoal = best; return best;
      }
    }
    if (visible && distance > 5 && distance < 16) {
      const side = bot.id % 2 ? 1 : -1;
      const x = bot.x + (target.z - bot.z) / distance * side * 3;
      const z = bot.z - (target.x - bot.x) / distance * side * 3;
      if (isFree(x, z, 0.6)) return { x, z };
    }
    return target;
  }

  updateBot(bot, dt) {
    bot.brainTimer -= dt;
    if (bot.brainTimer <= 0) {
      bot.brainTimer = 0.6 + this.random() * 0.3;
      let bestScore = Infinity, target = null;
      for (const other of this.entities) {
        if (!areEnemies(bot, other, this.mode)) continue;
        const d = Math.hypot(other.x - bot.x, other.z - bot.z);
        const visible = hasLineOfSight(bot, other);
        const score = d * (visible ? 0.7 : 1.3) * (other.kind === 'monster' ? 1.1 : 1);
        if (score < bestScore) { target = other; bestScore = score; }
      }
      bot.targetId = target?.id ?? null;
      if (target) {
        const visible = hasLineOfSight(bot, target), distance = Math.hypot(target.x - bot.x, target.z - bot.z);
        const goal = this.chooseGoal(bot, target, visible, distance);
        bot.path = findPath(bot, goal); bot.pathIndex = 0;
      }
    }
    const target = this.entities[bot.targetId];
    if (!target?.alive) return;
    const visible = hasLineOfSight(bot, target);
    const distance = Math.hypot(target.x - bot.x, target.z - bot.z);
    if (visible) {
      bot.yaw = Math.atan2(-(target.x - bot.x), -(target.z - bot.z));
      if (bot.cooldown <= 0 && distance < 28) {
        const error = (bot.kind === 'monster' ? 0.085 : 0.058) + distance * 0.002;
        const yaw = bot.yaw + (this.random() - 0.5) * error * 2;
        const pitch = Math.atan2(1.25 - (bot.kind === 'monster' ? 1.32 : EYE_HEIGHT), distance) + (this.random() - 0.5) * error;
        this.shoot(bot, this.direction(yaw, pitch));
      }
    }
    let waypoint = bot.path[bot.pathIndex];
    if (waypoint && Math.hypot(waypoint.x - bot.x, waypoint.z - bot.z) < 0.22) waypoint = bot.path[++bot.pathIndex];
    if (waypoint) {
      const dx = waypoint.x - bot.x, dz = waypoint.z - bot.z, length = Math.hypot(dx, dz);
      const speed = (bot.kind === 'monster' ? 2.15 : 2.65) * dt;
      const oldX = bot.x, oldZ = bot.z;
      moveBody(bot, dx / length * Math.min(length, speed), dz / length * Math.min(length, speed), this.entities);
      const moved = Math.hypot(bot.x - oldX, bot.z - oldZ);
      bot.walk += moved * 3.6;
      if (!visible) bot.yaw = Math.atan2(-dx, -dz);
      if (moved < speed * 0.2) {
        bot.stuckTime += dt;
        // A little sideways steering lets two agents pass in narrow lanes.
        moveBody(bot, -dz / length * speed * (bot.id % 2 ? 1 : -1), dx / length * speed * (bot.id % 2 ? 1 : -1), this.entities);
        if (bot.stuckTime > 0.8) { bot.brainTimer = 0; bot.stuckTime = 0; }
      } else bot.stuckTime = 0;
    }
  }

  spawnMonster() {
    if (this.entities.filter(e => e.kind === 'monster' && e.alive).length >= MAX_MONSTERS) return;
    // Recycle dead monster records, so long rounds cannot grow the entity array.
    const old = this.entities.find(e => e.kind === 'monster' && !e.alive);
    const humans = this.entities.filter(e => e.kind === 'human' && e.alive);
    const spawn = [...MONSTER_SPAWNS].sort((a, b) => {
      const nearest = p => Math.min(...humans.map(h => Math.hypot(h.x - p.x, h.z - p.z)));
      return nearest(b) - nearest(a);
    }).find(p => !this.entities.some(e => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 1));
    if (!spawn) return;
    const data = { ...spawn, kind: 'monster', team: 'monster', color: 'monster', name: `WÄCHTER ${++this.monsterSerial}`, hp: 2, alive: true, isPlayer: false, protection: 1, cooldown: 2, path: [], pathIndex: 0, brainTimer: 0, coverGoal: null, coverUntil: 0, stuckTime: 0, targetId: null, hitAt: -10, fireAt: -10, walk: 0 };
    const monster = old ? Object.assign(old, data) : this.addEntity(data);
    this.onEvent({ type: 'monster', target: monster });
  }

  update(dt) {
    if (this.outcome) return;
    dt = Math.min(dt, 0.05); this.time += dt;
    for (const e of this.entities) {
      e.cooldown = Math.max(0, e.cooldown - dt); e.protection = Math.max(0, e.protection - dt);
    }
    // A brief initial grace period gives the player time to orient themselves.
    if (this.time > 2) for (const e of this.entities) if (e.alive && !e.isPlayer) this.updateBot(e, dt);
    if (this.time >= this.nextMonster) { this.spawnMonster(); this.nextMonster = this.time + 15; }
    this.outcome = roundOutcome(this.entities, this.mode);
    if (this.outcome) this.onEvent({ type: 'end', outcome: this.outcome });
  }
}
