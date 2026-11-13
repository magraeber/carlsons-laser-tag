import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, areEnemies, roundOutcome, MAX_MONSTERS, HIT_PROTECTION } from '../src/game.js';
import { BLOCKS, TEAM_SPAWNS, FFA_SPAWNS, EYE_HEIGHT, findPath, hasLineOfSight, isFree, moveBody, rayBody } from '../src/world.js';

function duel() {
  const game = new Game({ seed: 20 });
  game.entities.forEach(e => { e.alive = false; });
  const a = game.player, b = game.entities.find(e => e.team === 'blue');
  Object.assign(a, { x: 0, z: 6, alive: true, cooldown: 0 });
  Object.assign(b, { x: 0, z: -6, alive: true, cooldown: 1000 });
  return { game, a, b };
}

test('team selection creates 4 vs 4, each human starts with exactly three lives', () => {
  for (const team of ['pink', 'blue']) {
    const game = new Game({ team, seed: 1 });
    assert.equal(game.entities.length, 8); assert.equal(game.player.team, team);
    for (const color of ['pink', 'blue']) assert.equal(game.entities.filter(e => e.team === color).length, 4);
    assert.ok(game.entities.every(e => e.hp === 3 && e.alive));
  }
});

test('a hit removes one life; invulnerability blocks stacked hits; third hit eliminates', () => {
  const { game, a, b } = duel();
  assert.equal(game.damage(b, a), true); assert.equal(b.hp, 2);
  assert.equal(b.protection, HIT_PROTECTION);
  assert.equal(game.damage(b, a), false); assert.equal(b.hp, 2);
  b.protection = 0; game.damage(b, a); assert.equal(b.hp, 1);
  b.protection = 0; game.damage(b, a); assert.equal(b.hp, 0); assert.equal(b.alive, false);
  assert.equal(game.damage(b, a), false); assert.equal(b.hp, 0);
  assert.deepEqual(game.stats, { shots: 0, hits: 3, kills: 1 });
});

test('team members cannot hurt each other, but free-for-all humans can', () => {
  const game = new Game({ seed: 2 });
  assert.equal(game.damage(game.entities[1], game.player), false);
  assert.equal(game.entities[1].hp, 3);
  const ffa = new Game({ mode: 'ffa', seed: 2 });
  assert.equal(ffa.entities.length, 7); assert.equal(ffa.damage(ffa.entities[1], ffa.player), true);
});

test('hitscan connects with a visible target, enforces cooldown and misses above it', () => {
  const { game, a, b } = duel();
  const shot = game.shoot(a, { x: 0, y: 0, z: -1 });
  assert.equal(shot.target, b); assert.equal(shot.hit, true); assert.equal(b.hp, 2);
  assert.equal(game.shoot(a, { x: 0, y: 0, z: -1 }), null);
  a.cooldown = 0; b.protection = 0;
  assert.equal(game.shoot(a, game.direction(0, .6)).target, null); assert.equal(b.hp, 2);
  assert.equal(rayBody({ x: 0, y: EYE_HEIGHT, z: 6 }, { x: 0, y: 1, z: 0 }, b, 30), Infinity);
});

test('solid cover blocks sight and laser damage, including aim assistance', () => {
  for (const assist of [false, true]) {
    const { game, a, b } = duel();
    Object.assign(a, { x: -10, z: 5 }); Object.assign(b, { x: -10, z: -5 });
    assert.equal(hasLineOfSight(a, b), false);
    const shot = game.shoot(a, { x: 0, y: 0, z: -1 }, assist);
    assert.equal(shot.target, null); assert.equal(b.hp, 3);
    assert.ok(shot.end.z > -1.6);
  }
});

test('only the nearest body is hit; friendly armor also blocks the beam', () => {
  const { game, a, b } = duel();
  const friendly = game.entities[1]; Object.assign(friendly, { alive: true, x: 0, z: 0 });
  const shot = game.shoot(a, { x: 0, y: 0, z: -1 });
  assert.equal(shot.target, friendly); assert.equal(shot.hit, false);
  assert.equal(friendly.hp, 3); assert.equal(b.hp, 3);
});

test('movement cannot tunnel through blocks or escape bounds; walls allow sliding', () => {
  const body = { x: -10, z: 5, alive: true };
  moveBody(body, 0, -20); assert.ok(body.z >= 1.85); assert.ok(isFree(body.x, body.z));
  const edge = { x: 20, z: 20, alive: true }; moveBody(edge, 100, 1);
  assert.ok(edge.x <= 20.64); assert.ok(edge.z > 20.8);
  const other = { x: 0, z: 0, alive: true }, player = { x: 0, z: 2, alive: true };
  moveBody(player, 0, -3, [other]); assert.ok(player.z >= .72);
});

test('every spawn is walkable and all spawn pairs have navigable routes', () => {
  const spawns = [...TEAM_SPAWNS.pink, ...TEAM_SPAWNS.blue, ...FFA_SPAWNS];
  for (const start of spawns) {
    assert.ok(isFree(start.x, start.z), JSON.stringify(start));
    for (const end of spawns) {
      if (start.x === end.x && start.z === end.z) continue;
      const path = findPath(start, end); assert.ok(path.length > 0, `no route: ${JSON.stringify([start, end])}`);
      assert.ok(path.every(p => isFree(p.x, p.z, .49)));
      for (let i = 1; i < path.length; i++) assert.ok(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) <= 1.01);
    }
  }
});

test('team outcome waits for surviving AI teammates after player elimination', () => {
  const game = new Game({ seed: 3 }); game.player.alive = false;
  assert.equal(roundOutcome(game.entities, 'team'), null);
  game.entities.filter(e => e.team === 'blue').forEach(e => { e.alive = false; });
  assert.deepEqual(roundOutcome(game.entities, 'team'), { winner: 'pink', draw: false });
});

test('free-for-all continues after the player dies; only the final human wins', () => {
  const game = new Game({ mode: 'ffa', seed: 3 }); game.player.alive = false;
  assert.equal(roundOutcome(game.entities, 'ffa'), null);
  game.entities.slice(2).forEach(e => { e.alive = false; });
  assert.equal(roundOutcome(game.entities, 'ffa').winner, game.entities[1].id);
  game.entities[1].alive = false; assert.equal(roundOutcome(game.entities, 'ffa').draw, true);
});

test('monsters attack all teams, have two lives and never decide victory', () => {
  const game = new Game({ seed: 4 }); game.spawnMonster();
  const monster = game.entities.find(e => e.kind === 'monster'); assert.equal(monster.hp, 2);
  for (const human of game.entities.filter(e => e.kind === 'human')) {
    assert.equal(areEnemies(monster, human, 'team'), true); assert.equal(areEnemies(human, monster, 'team'), true);
  }
  game.entities.filter(e => e.team === 'blue').forEach(e => { e.alive = false; });
  assert.equal(roundOutcome(game.entities, 'team').winner, 'pink');
  game.entities.filter(e => e.kind === 'human').forEach(e => { e.alive = false; });
  assert.equal(roundOutcome(game.entities, 'team').draw, true);
});

test('monster count and entity allocation stay bounded during long rounds', () => {
  const game = new Game({ seed: 4 });
  for (let i = 0; i < 100; i++) game.spawnMonster();
  assert.equal(game.entities.filter(e => e.kind === 'monster').length, MAX_MONSTERS);
  for (let i = 0; i < 100; i++) {
    game.entities.find(e => e.kind === 'monster' && e.alive).alive = false; game.spawnMonster();
  }
  assert.equal(game.entities.length, 8 + MAX_MONSTERS);
});

test('bot rounds progress, avoid solids and reach the correct human-only outcome', () => {
  for (const mode of ['team', 'ffa']) for (const seed of [11, 27, 84, 101]) {
    let kills = 0;
    const game = new Game({ mode, seed, onEvent: event => { if (event.type === 'eliminated') kills++; } });
    // Let AI control the human seat as well, to test full battles reproducibly.
    game.player.isPlayer = false;
    let steps = 0;
    while (!game.outcome && steps++ < 7200) {
      game.update(.05);
      if (steps % 100 === 0) for (const entity of game.entities.filter(e => e.alive)) assert.ok(isFree(entity.x, entity.z), `${mode}/${seed}: body in solid`);
    }
    assert.ok(kills >= 4, `${mode}/${seed}: no battle progress`);
    assert.ok(game.outcome, `${mode}/${seed}: round stalled after ${game.time.toFixed(0)}s`);
    assert.deepEqual(game.outcome, roundOutcome(game.entities, mode));
    assert.ok(game.entities.every(e => e.hp <= (e.kind === 'human' ? 3 : 2)));
    console.log(`${mode}/${seed}: ${game.time.toFixed(1)}s, ${kills} eliminations`);
  }
});
