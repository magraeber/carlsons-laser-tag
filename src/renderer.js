import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, BLOCKS, COLORS, EYE_HEIGHT, MONSTER_SPAWNS } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const transform = new THREE.Object3D();
function mergedBoxes(boxes) {
  return mergeGeometries(boxes.map(([x, y, z, w, h, d, rot = 0]) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.rotateZ(rot); geo.translate(x, y, z); return geo;
  }));
}
function instances(scene, boxes, material) {
  const mesh = new THREE.InstancedMesh(boxGeo, material, boxes.length);
  boxes.forEach(([x, y, z, w, h, d], i) => {
    transform.position.set(x, y, z); transform.rotation.set(0, 0, 0); transform.scale.set(w, h, d); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); scene.add(mesh); return mesh;
}
const basic = color => new THREE.MeshBasicMaterial({ color });
const armorMat = new THREE.MeshStandardMaterial({ color: '#252a3e', metalness: 0.65, roughness: 0.42 });
const jointMat = new THREE.MeshStandardMaterial({ color: '#090d1a', metalness: 0.2, roughness: 0.8 });
const gunMat = new THREE.MeshStandardMaterial({ color: '#303849', metalness: 0.75, roughness: 0.35 });

function characterGeometry(monster) {
  if (monster) return {
    armor: mergedBoxes([[0, 1.02, 0, .8, .63, .5], [0, 1.53, -.01, .6, .38, .5], [-.46, 1.15, 0, .24, .38, .42], [.46, 1.15, 0, .24, .38, .42], [-.25, 1.87, 0, .1, .35, .1, -.35], [.25, 1.87, 0, .1, .35, .1, .35], [.48, .86, -.29, .22, .22, .65]]),
    neon: mergedBoxes([[0, 1.53, -.27, .48, .1, .035], [0, 1.1, -.27, .5, .16, .025], [-.46, 1.25, -.23, .2, .07, .025], [.46, 1.25, -.23, .2, .07, .025], [.48, .86, -.63, .13, .13, .04]]),
    leg: mergedBoxes([[0, -.23, 0, .26, .46, .3], [0, -.49, -.05, .3, .14, .42]]),
  };
  return {
    armor: mergedBoxes([[0, 1.22, 0, .58, .58, .33], [0, .86, 0, .48, .19, .32], [0, 1.76, 0, .4, .39, .38], [-.4, 1.41, 0, .24, .23, .38], [.4, 1.41, 0, .24, .23, .38], [-.39, 1.12, -.12, .19, .42, .22, -.16], [.39, 1.15, -.22, .19, .37, .22, .12], [.38, 1.15, -.5, .16, .17, .48], [.38, 1.02, -.37, .12, .22, .15]]),
    neon: mergedBoxes([[0, 1.78, -.201, .35, .092, .026], [0, 1.29, -.18, .12, .28, .025], [0, 1.29, -.183, .4, .065, .026], [-.4, 1.43, -.198, .17, .065, .025], [.4, 1.43, -.198, .17, .065, .025], [0, 1.25, .18, .13, .32, .025], [.38, 1.15, -.755, .09, .09, .025]]),
    leg: mergedBoxes([[0, -.22, 0, .2, .4, .24], [0, -.51, 0, .2, .25, .23], [0, -.67, -.07, .23, .13, .38]]),
  };
}
const humanGeometry = characterGeometry(false), monsterGeometry = characterGeometry(true);

export class ArenaRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.35 : 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#090a16');
    this.scene.fog = new THREE.FogExp2('#0b0b1b', .024);
    this.camera = new THREE.PerspectiveCamera(74, 1, .06, 100); this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera); this.models = new Map(); this.traces = []; this.spectatorId = null;
    this.neonMats = Object.fromEntries(Object.entries(COLORS).map(([key, value]) => [key, basic(value)]));
    this.buildArena(); this.buildWeapon(); this.buildTraces(); this.resize();
    this.resizeHandler = () => this.resize(); window.addEventListener('resize', this.resizeHandler);
    this.slowFrames = 0; this.qualityReduced = false;
  }

  buildArena() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#b5baf5', '#302141', 1.25));
    const overhead = new THREE.DirectionalLight('#a8b9ff', 1.6); overhead.position.set(2, 9, 4); scene.add(overhead);
    for (const [x, z, color] of [[-8, 8, '#ff2794'], [8, -8, '#6a78ff'], [-10, -15, '#ff2794'], [10, 15, '#ff2794']]) {
      const light = new THREE.PointLight(color, 21, 16, 2); light.position.set(x, 3.4, z); scene.add(light);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(42, 46), new THREE.MeshStandardMaterial({ color: '#171526', roughness: .42, metalness: .52 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const gridPoints = [];
    for (let x = -21; x <= 21; x += 2) gridPoints.push(x, .012, -23, x, .012, 23);
    for (let z = -23; z <= 23; z += 2) gridPoints.push(-21, .012, z, 21, .012, z);
    const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
    scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#514067', transparent: true, opacity: .26 })));
    const baseBoxes = [], edgeBoxes = [], blueEdges = [], insetBoxes = [];
    for (const b of BLOCKS) {
      const levels = b.stacked ? [{ y: b.h * .32, h: b.h * .64 }, { y: b.h * .82, h: b.h * .36 }] : [{ y: b.h / 2, h: b.h }];
      for (const level of levels) {
        baseBoxes.push([b.x, level.y, b.z, b.w, level.h - .04, b.d]);
        const edges = b.color === 'blue' ? blueEdges : edgeBoxes;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) edges.push([b.x + sx * b.w / 2, level.y, b.z + sz * b.d / 2, .035, level.h, .035]);
        for (const sy of [-1, 1]) {
          const y = level.y + sy * (level.h / 2 - .035);
          for (const sz of [-1, 1]) edges.push([b.x, y, b.z + sz * b.d / 2, b.w, .045, .04]);
          for (const sx of [-1, 1]) edges.push([b.x + sx * b.w / 2, y, b.z, .04, .045, b.d]);
        }
        // Recessed front panels and slim horizontal vents add scale without textures.
        for (const sz of [-1, 1]) {
          insetBoxes.push([b.x, level.y, b.z + sz * (b.d / 2 + .006), b.w * .78, level.h * .64, .012]);
          for (let i = 0; i < 3; i++) edges.push([b.x - b.w * .28 + i * .13, level.y - level.h * .22, b.z + sz * (b.d / 2 + .018), .055, .17, .016]);
        }
      }
      this.addGlow(b.x, b.z, b.w + 3, b.d + 3, b.color === 'blue' ? '#2684ff' : '#ff168b', .16);
    }
    instances(scene, baseBoxes, new THREE.MeshStandardMaterial({ color: '#341229', emissive: '#9b1447', emissiveIntensity: .16, roughness: .38, metalness: .6 }));
    instances(scene, insetBoxes, new THREE.MeshStandardMaterial({ color: '#1d101f', roughness: .65, metalness: .4 }));
    instances(scene, edgeBoxes, this.neonMats.pink);
    instances(scene, blueEdges, this.neonMats.blue);
    const wallBoxes = [[-21.3, 3.5, 0, .6, 7, 46], [21.3, 3.5, 0, .6, 7, 46], [0, 3.5, -23.3, 42, 7, .6], [0, 3.5, 23.3, 42, 7, .6], [0, 7.1, 0, 42, .2, 46]];
    instances(scene, wallBoxes, new THREE.MeshStandardMaterial({ color: '#101423', roughness: .75, metalness: .3 }));
    const ribs = [], ceiling = [], trims = [];
    for (let z = -21; z <= 21; z += 6) {
      ribs.push([-20.8, 3.4, z, .28, 6.8, .35], [20.8, 3.4, z, .28, 6.8, .35], [0, 6.7, z, 42, .3, .35]);
      ceiling.push([-9, 6.49, z, 5, .04, .07], [9, 6.49, z, 5, .04, .07]);
      trims.push([-20.6, 1, z, .05, .035, 4.5], [20.6, 1, z, .05, .035, 4.5]);
    }
    instances(scene, ribs, new THREE.MeshStandardMaterial({ color: '#2b2e42', roughness: .55, metalness: .6 }));
    instances(scene, ceiling, basic('#b3a0f4')); instances(scene, trims, this.neonMats.blue);
    const lane = [[0, .025, 0, .055, .015, 8], [-18.7, .025, 0, .055, .015, 40], [18.7, .025, 0, .055, .015, 40], [0, .025, -21.5, 34, .015, .05], [0, .025, 21.5, 34, .015, .05]];
    instances(scene, lane, basic('#554b82'));
    for (const p of MONSTER_SPAWNS) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .76, 24), basic('#bf6627'));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, .026, p.z); scene.add(ring);
    }
    this.addSign('NEON DISTRICT', '01 / LASER ARENA', 0, 4.5, -22.94, 0, '#ff3897');
    this.addSign('SEKTOR 01', 'STAY IN THE LIGHT', 0, 4.5, 22.94, Math.PI, '#47c8ff');
    this.addSign('01', 'NORTH / BLUE', -20.95, 3.4, -4, Math.PI / 2, '#47c8ff', 3.4);
    this.addSign('01', 'SOUTH / PINK', 20.95, 3.4, 4, -Math.PI / 2, '#ff3897', 3.4);
  }

  addGlow(x, z, w, d, color, opacity) {
    if (!this.glowTexture) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d'); const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.35, '#ffffff88'); gradient.addColorStop(1, '#ffffff00');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); this.glowTexture = new THREE.CanvasTexture(canvas);
    }
    const material = new THREE.MeshBasicMaterial({ color, map: this.glowTexture, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .018, z); this.scene.add(mesh);
  }

  addSign(title, subtitle, x, y, z, rotation, color, width = 7) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#10101b'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = '900 italic 98px Arial'; ctx.fillText(title, 512, 130);
    ctx.font = '24px Arial'; ctx.fillStyle = '#b1a4ca'; ctx.fillText(subtitle, 512, 200);
    ctx.fillStyle = color; ctx.fillRect(0, 0, 1024, 5);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture }));
    sign.position.set(x, y, z); sign.rotation.y = rotation; this.scene.add(sign);
  }

  buildWeapon() {
    this.weapon = new THREE.Group();
    const shell = new THREE.Mesh(mergedBoxes([[.22, -.22, -.48, .13, .14, .39], [.22, -.31, -.36, .1, .18, .13], [.22, -.17, -.43, .1, .035, .22], [.22, -.22, -.7, .1, .105, .06]]), gunMat);
    const hand = new THREE.Mesh(mergedBoxes([[.22, -.36, -.32, .105, .13, .14], [.24, -.47, -.21, .13, .24, .17]]), armorMat);
    this.gunNeon = new THREE.Mesh(mergedBoxes([[.151, -.22, -.48, .008, .035, .25], [.22, -.22, -.736, .068, .068, .01], [.22, -.145, -.4, .05, .018, .04]]), this.neonMats.pink);
    this.weapon.add(shell, hand, this.gunNeon); this.camera.add(this.weapon);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(.065, 6, 4), basic('#fff1fa')); this.muzzle.position.set(.22, -.22, -.78); this.muzzle.visible = false; this.weapon.add(this.muzzle);
  }

  buildTraces() {
    const geo = new THREE.CylinderGeometry(.013, .013, 1, 4, 1);
    for (let i = 0; i < 48; i++) {
      const material = new THREE.MeshBasicMaterial({ color: '#ff3897', transparent: true, opacity: .95, depthWrite: false });
      const mesh = new THREE.Mesh(geo, material); mesh.visible = false; this.scene.add(mesh);
      const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(.09, 0), material); spark.visible = false; this.scene.add(spark);
      this.traces.push({ mesh, spark, life: 0 });
    }
    this.traceIndex = 0;
  }

  shot(event, game) {
    const trace = this.traces[this.traceIndex++ % this.traces.length];
    const start = new THREE.Vector3(event.origin.x, event.origin.y, event.origin.z);
    const end = new THREE.Vector3(event.end.x, event.end.y, event.end.z);
    if (event.shooter.isPlayer && game.player.alive) {
      this.camera.updateMatrixWorld(); start.set(.22, -.22, -.76).applyMatrix4(this.camera.matrixWorld);
    } else {
      start.x += Math.cos(event.shooter.yaw) * .35; start.y -= .25; start.z -= Math.sin(event.shooter.yaw) * .35;
    }
    const delta = end.clone().sub(start); const distance = delta.length();
    trace.mesh.position.copy(start).add(end).multiplyScalar(.5);
    trace.mesh.quaternion.setFromUnitVectors(UP, delta.normalize()); trace.mesh.scale.set(1, distance, 1);
    trace.mesh.material.color.set(event.color); trace.mesh.material.opacity = .95; trace.mesh.visible = true;
    trace.spark.position.copy(end); trace.spark.scale.setScalar(event.hit ? 2 : 1); trace.spark.visible = true; trace.life = .14;
  }

  createCharacter(entity) {
    const monster = entity.kind === 'monster', geometry = monster ? monsterGeometry : humanGeometry;
    const group = new THREE.Group();
    const armor = new THREE.Mesh(geometry.armor, armorMat); group.add(armor);
    const neon = new THREE.Mesh(geometry.neon, this.neonMats[entity.color]); group.add(neon);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(monster ? .65 : .44, .19, .29), jointMat); pelvis.position.y = monster ? .65 : .78; group.add(pelvis);
    const legs = [-1, 1].map(side => { const leg = new THREE.Mesh(geometry.leg, armorMat); leg.position.set(side * (monster ? .25 : .16), monster ? .61 : .74, 0); group.add(leg); return leg; });
    const healthBars = [];
    const maxHp = monster ? 2 : 3;
    for (let i = 0; i < maxHp; i++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(.1, .035), this.neonMats[entity.color]);
      bar.position.set((i - (maxHp - 1) / 2) * .14, 2.16, 0); group.add(bar); healthBars.push(bar);
    }
    this.scene.add(group); const model = { group, armor, neon, legs, healthBars }; this.models.set(entity.id, model); return model;
  }

  clearRound() {
    for (const model of this.models.values()) {
      this.scene.remove(model.group);
      model.group.traverse(o => { if (o.isMesh && ![humanGeometry.armor, humanGeometry.neon, humanGeometry.leg, monsterGeometry.armor, monsterGeometry.neon, monsterGeometry.leg].includes(o.geometry)) o.geometry.dispose(); });
    }
    this.models.clear(); this.spectatorId = null;
    for (const t of this.traces) { t.life = 0; t.mesh.visible = t.spark.visible = false; }
  }

  nextSpectator(game) {
    const alive = game.entities.filter(e => e.alive && e.kind === 'human');
    const teammates = alive.filter(e => e.team === game.player.team);
    const choices = game.mode === 'team' && teammates.length ? teammates : alive;
    const index = choices.findIndex(e => e.id === this.spectatorId);
    this.spectatorId = choices[(index + 1) % choices.length]?.id ?? null;
    return choices[(index + 1) % choices.length];
  }

  render(dt, game, menuTime = 0) {
    for (const trace of this.traces) if (trace.life > 0) {
      trace.life -= dt; trace.mesh.material.opacity = Math.max(0, trace.life / .14);
      trace.mesh.visible = trace.spark.visible = trace.life > 0;
      trace.spark.scale.multiplyScalar(1 + dt * 4);
    }
    if (!game) {
      const t = menuTime * .045;
      this.camera.position.set(13 + Math.sin(t) * 2.5, 5.0 + Math.sin(t * .7) * .35, 19 + Math.cos(t) * 2);
      this.camera.lookAt(-2, 1.1, -5); this.weapon.visible = false;
    } else {
      if (!game.player.alive && !game.entities.find(e => e.id === this.spectatorId)?.alive) this.nextSpectator(game);
      const focus = game.player.alive ? game.player : game.entities[this.spectatorId];
      if (focus) {
        this.camera.position.set(focus.x, EYE_HEIGHT + (game.player.alive ? Math.sin(focus.walk * 2) * .018 : .05), focus.z);
        this.camera.rotation.set(focus.pitch ?? 0, focus.yaw, 0, 'YXZ');
      }
      this.weapon.visible = game.player.alive;
      this.gunNeon.material = this.neonMats[game.player.color];
      const recoil = Math.max(0, 1 - (game.time - game.player.fireAt) / .18);
      this.weapon.position.set(Math.sin(game.player.walk) * .006, -recoil * .012, recoil * .065);
      this.weapon.rotation.x = recoil * .06; this.muzzle.visible = game.time - game.player.fireAt < .06;
      for (const entity of game.entities) {
        const model = this.models.get(entity.id) ?? this.createCharacter(entity);
        model.group.visible = entity.alive && entity !== focus;
        if (!model.group.visible) continue;
        model.group.position.set(entity.x, 0, entity.z); model.group.rotation.y = entity.yaw;
        model.legs[0].rotation.x = Math.sin(entity.walk) * .36; model.legs[1].rotation.x = -Math.sin(entity.walk) * .36;
        const flash = game.time - entity.hitAt < .13;
        model.armor.material = flash ? this.neonMats.white : armorMat;
        model.healthBars.forEach((bar, i) => { bar.visible = i < entity.hp; bar.quaternion.copy(model.group.quaternion).invert().multiply(this.camera.quaternion); });
      }
    }
    this.renderer.render(this.scene, this.camera);
    // Reduce fill rate once if sustained frames are slow. Simulation remains time based.
    if (dt > .035 && dt < .2) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - .2);
    if (this.slowFrames > 110 && !this.qualityReduced) { this.renderer.setPixelRatio(1); this.resize(); this.qualityReduced = true; }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight, false);
  }
}
