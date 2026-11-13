import './style.css';
import { ArenaRenderer } from './renderer.js';
import { Game } from './game.js';
import { Controls } from './controls.js';
import { Audio } from './audio.js';
import { COLORS } from './world.js';

const $ = selector => document.querySelector(selector);
const show = (selector, visible) => $(selector).classList.toggle('hidden', !visible);
const audio = new Audio();
let renderer, controls, game = null, state = 'menu', mode = 'team', team = 'pink';
let lastTime = performance.now(), menuTime = 0, hudTime = 0, messageUntil = 0, hitUntil = 0, hurtUntil = 0;
let resultAt = Infinity;
const feed = [];

try { renderer = new ArenaRenderer($('#arena')); }
catch (error) { console.error(error); show('#error', true); $('#start').disabled = true; }

function announce(text, duration = 2.5) {
  $('#announcement').textContent = text; messageUntil = performance.now() + duration * 1000;
  $('#announcement').classList.add('active');
}
function addFeed(text, color) {
  feed.unshift({ text, color, expires: performance.now() + 5500 }); feed.length = Math.min(4, feed.length);
  renderFeed();
}
function renderFeed() {
  $('#kill-feed').replaceChildren(...feed.map(item => {
    const div = document.createElement('div'); div.textContent = item.text; div.style.borderColor = item.color; return div;
  }));
}

function onEvent(event) {
  if (event.type === 'shot') {
    renderer.shot(event, game);
    const distance = Math.hypot(event.shooter.x - game.player.x, event.shooter.z - game.player.z);
    audio.shot(distance, event.shooter.isPlayer);
  }
  if (event.type === 'hit') {
    if (event.shooter.isPlayer) { hitUntil = performance.now() + 160; audio.hit(); }
    if (event.target.isPlayer) { hurtUntil = performance.now() + 180; audio.hurt(); }
  }
  if (event.type === 'eliminated') {
    addFeed(`${event.shooter.name}  ›  ${event.target.name}`, COLORS[event.shooter.color]);
    if (event.target.isPlayer) {
      controls.setEnabled(false); document.exitPointerLock?.();
      document.body.classList.add('spectating'); show('#spectator', true); show('#crosshair', false);
      announce('AUSGESCHIEDEN · DIE RUNDE LÄUFT WEITER', 3.5); renderer.nextSpectator(game);
    }
  }
  if (event.type === 'monster') announce('WÄCHTER BETRITT DIE ARENA', 2.3);
  if (event.type === 'end') {
    state = 'result'; controls.setEnabled(false); document.exitPointerLock?.();
    resultAt = performance.now() + 800; updateResult();
  }
}

function updateResult() {
  const outcome = game.outcome;
  const win = !outcome.draw && (game.mode === 'team' ? outcome.winner === game.team : outcome.winner === game.player.id);
  const winnerName = game.mode === 'team' ? `TEAM ${outcome.winner === 'pink' ? 'PINK' : 'BLAU'}` : outcome.name;
  $('#result-title').textContent = outcome.draw ? 'KEIN LICHT MEHR.' : `${winnerName} GEWINNT.`;
  $('#result-title').style.color = outcome.draw ? '#f7f5ff' : game.mode === 'team' ? COLORS[outcome.winner] : COLORS[game.entities[outcome.winner]?.color];
  $('#result-eyebrow').textContent = outcome.draw ? 'UNENTSCHIEDEN' : win ? 'MISSION ERFÜLLT' : 'EINSATZ BEENDET';
  $('#result-copy').textContent = outcome.draw ? 'Alle menschlichen Figuren sind ausgeschieden.' : win ? game.player.alive ? 'Du hast das letzte Licht bewahrt. Bereit für die nächste Runde?' : 'Du bist ausgeschieden. Dein Team hat den Einsatz trotzdem gewonnen.' : 'Die Arena hat einen Gewinner. Dein nächster Einsatz wartet.';
  $('#stat-hits').textContent = game.stats.hits;
  $('#stat-kills').textContent = game.stats.kills;
  $('#stat-time').textContent = `${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
  audio.end(win);
}

function updateHud() {
  if (!game) return;
  const humans = game.entities.filter(e => e.alive && e.kind === 'human');
  $('#pink-alive').textContent = humans.filter(e => e.team === 'pink').length;
  $('#blue-alive').textContent = humans.filter(e => e.team === 'blue').length;
  $('#humans-alive').textContent = humans.length;
  const hp = game.player.hp;
  $('#health').innerHTML = [0, 1, 2].map(i => `<span class="${i >= hp ? 'lost' : ''}">♥</span>`).join(' ');
  $('#health').setAttribute('aria-label', `${hp} von 3 Leben`);
  $('#health-label').textContent = hp > 0 ? `${hp} / 3 LEBEN` : 'AUSGESCHIEDEN';
  $('#crosshair').classList.toggle('firing', game.time - game.player.fireAt < .12);
  if (!game.player.alive) {
    const focus = game.entities[renderer.spectatorId];
    $('#spectator-label').textContent = `AUSGESCHIEDEN · ${focus?.name ?? 'ARENA'} ZUSCHAUEN`;
  }
}

function startRound() {
  renderer.clearRound(); audio.unlock();
  game = new Game({ mode, team, onEvent }); state = 'playing'; resultAt = Infinity;
  feed.length = 0; renderFeed();
  controls.setEnabled(true); document.body.classList.add('playing'); document.body.classList.remove('spectating');
  for (const selector of ['#menu', '#result-screen', '#pause-screen', '#help-screen', '#spectator']) show(selector, false);
  show('#hud', true); show('#crosshair', true);
  document.querySelectorAll('.score-pink, .score-blue, .score-divider').forEach(el => el.classList.toggle('hidden', mode === 'ffa'));
  show('#ffa-score', mode === 'ffa');
  $('#round-label').textContent = mode === 'team' ? 'TEAM ELIMINATION · 4 VS 4' : 'FREE FOR ALL · 7 SPIELER';
  $('#player-team').textContent = mode === 'team' ? `TEAM ${team === 'pink' ? 'PINK' : 'BLAU'}` : 'JEDER GEGEN JEDEN';
  $('#player-team').style.color = COLORS[game.player.color];
  updateHud(); announce(mode === 'team' ? `TEAM ${team === 'pink' ? 'PINK' : 'BLAU'} · SUCH DECKUNG` : 'JEDER GEGEN JEDEN · NUR EINER BLEIBT', 3);
  lastTime = performance.now();
  if (!controls.coarse) controls.engage();
  else if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused'; controls.setEnabled(false); show('#pause-screen', true); document.exitPointerLock?.();
}
function resume() {
  if (state !== 'paused') return;
  state = 'playing'; controls.setEnabled(game.player.alive); show('#pause-screen', false); controls.engage(); audio.unlock(); lastTime = performance.now();
}
function backMenu() {
  state = 'menu'; game = null; resultAt = Infinity;
  controls.setEnabled(false); document.exitPointerLock?.(); renderer.clearRound();
  document.body.classList.remove('playing', 'spectating');
  for (const selector of ['#hud', '#result-screen', '#pause-screen']) show(selector, false);
  show('#menu', true);
}

controls = new Controls($('#arena'), { onPause: pause, onEngage: () => audio.unlock() });
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
  $('#team-options').style.opacity = mode === 'ffa' ? '.35' : '1';
  $('#team-options').disabled = mode === 'ffa';
}));
document.querySelectorAll('[data-team]').forEach(button => button.addEventListener('click', () => {
  team = button.dataset.team;
  document.querySelectorAll('[data-team]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
}));
$('#start').addEventListener('click', startRound); $('#restart').addEventListener('click', startRound);
$('#pause').addEventListener('click', pause); $('#resume').addEventListener('click', resume);
$('#quit').addEventListener('click', backMenu); $('#back-menu').addEventListener('click', backMenu);
$('#help-open').addEventListener('click', () => show('#help-screen', true));
$('#help-close').addEventListener('click', () => show('#help-screen', false));
$('#sound').addEventListener('click', () => {
  audio.enabled = !audio.enabled; if (audio.enabled) audio.unlock();
  $('#sound').textContent = audio.enabled ? '♪' : '♪̸'; $('#sound').setAttribute('aria-label', audio.enabled ? 'Ton ausschalten' : 'Ton einschalten');
});
$('#spectate-next').addEventListener('click', () => { renderer.nextSpectator(game); updateHud(); });
$('#rotate-dismiss').addEventListener('click', () => document.body.classList.add('portrait-dismissed'));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('keydown', event => {
  if (state === 'playing' && !game.player.alive && (event.code === 'Escape' || event.code === 'KeyP')) pause();
});
$('#arena').addEventListener('webglcontextlost', event => {
  event.preventDefault(); pause(); $('#error-message').textContent = 'Die Grafikverbindung wurde unterbrochen. Lade die Seite neu, um eine neue Runde zu starten.'; show('#error', true);
});

function frame(now) {
  requestAnimationFrame(frame);
  if (!renderer) return;
  const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
  if (document.hidden) return;
  if (state === 'playing') {
    // Pause actual simulation while the portrait instruction obscures the controls.
    const rotateVisible = controls.coarse && innerHeight > innerWidth && !document.body.classList.contains('portrait-dismissed');
    if (!rotateVisible) {
      const input = controls.consume();
      if (game.player.alive) {
        game.player.yaw -= input.yaw; game.player.pitch = Math.max(-1.15, Math.min(1.15, game.player.pitch - input.pitch));
        game.movePlayer(input.x, input.z, dt);
      }
      game.update(dt);
      if (input.fire && !game.outcome) game.shoot(game.player, game.direction(game.player.yaw, game.player.pitch), controls.coarse);
    }
  }
  if (state === 'menu') menuTime += dt;
  renderer.render(state === 'paused' ? 0 : dt, game, menuTime);
  if (game && now - hudTime > 100) { updateHud(); hudTime = now; }
  $('#announcement').classList.toggle('active', now < messageUntil);
  $('#hit-marker').classList.toggle('active', now < hitUntil);
  $('#damage-flash').classList.toggle('active', now < hurtUntil);
  if (feed.some(item => item.expires < now)) { for (let i = feed.length - 1; i >= 0; i--) if (feed[i].expires < now) feed.splice(i, 1); renderFeed(); }
  if (state === 'result' && now >= resultAt) { show('#result-screen', true); resultAt = Infinity; }
}
requestAnimationFrame(frame);
