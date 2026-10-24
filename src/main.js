// Princess Park — entry point. Wires every system together and runs the loop.
import * as THREE from 'three';
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { Player } from './core/player.js';
import { loadAvatarConfig, saveAvatarConfig, DEFAULT_AVATAR } from './core/avatar.js';
import { World } from './world/world.js';
import { createRides } from './rides/index.js';
import { createNPCs } from './npcs/npcs.js';
import { Quests } from './quests/quests.js';
import { GameAudio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { showAvatarCreator } from './ui/creator.js';
import { loadSettings } from './core/settings.js';
import { createNet } from './net/net.js';

const params = new URLSearchParams(location.search);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 8, 14);

const game = {
  renderer, scene, camera, canvas,
  events: new EventBus(),
  input: new Input(),
  clock: new THREE.Clock(),
  time: 0,
  interactables: [],   // { position: Vector3, radius, label, onInteract(), enabled?: () => bool }
  rides: [],
  npcs: [],
  player: null, world: null, quests: null, audio: null, ui: null,
  params,
  started: false,
  settings: loadSettings(),   // park name + princess hosts (see core/settings.js)
};
window.__game = game; // for tests / debugging

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

async function boot() {
  game.audio = new GameAudio(game);
  game.ui = new UI(game);
  game.world = new World(game);
  game.world.build();
  scene.add(game.world.group);

  game.rides = createRides(game);
  for (const ride of game.rides) {
    ride.build();
    ride.group.updateMatrixWorld(true);
    scene.add(ride.group);
    game.world.colliders.push(...ride.colliders);
    game.interactables.push({
      position: ride.station, radius: ride.stationRadius,
      label: `Ride ${ride.name}`, sub: ride.tagline, kind: 'ride', id: ride.id,
      onInteract: () => game.player.boardRide(ride),
      enabled: () => game.player.state === 'walk',
    });
  }

  game.quests = new Quests(game);
  game.npcs = createNPCs(game);
  for (const npc of game.npcs) scene.add(npc.group);
  game.quests.start();

  // --- avatar creator / title screen ---
  const saved = loadAvatarConfig();
  let config;
  if (params.get('skipCreator') === '1') config = saved || { ...DEFAULT_AVATAR };
  else config = await showAvatarCreator(game, saved || { ...DEFAULT_AVATAR });
  saveAvatarConfig(config);
  startGame(config);
}

function startGame(config) {
  game.player = new Player(game, config);
  scene.add(game.player.group);
  const spawn = game.world.spawnPoint;
  game.player.teleport(spawn.x, spawn.y, spawn.z, spawn.facing ?? 0);
  if (params.get('tp')) {
    const r = game.rides.find((r) => r.id === params.get('tp')) || null;
    const n = game.npcs.find((n) => n.id === params.get('tp')) || null;
    const p = r ? r.station : n ? n.group.position : null;
    if (p) game.player.teleport(p.x + 2, p.y + 1, p.z + 2);
  }
  game.net = createNet(game);   // null when no relay is reachable (e.g. the hosted build)
  game.started = true;
  game.ui.showHUD();
  game.events.emit('game:start', { config });
  renderer.setAnimationLoop(loop);
}

const _d = new THREE.Vector3();
function loop() {
  const dt = Math.min(game.clock.getDelta(), 0.05);
  game.time += dt;
  const t = game.time;
  const player = game.player;

  // nearest interactable
  let best = null, bestD = Infinity;
  if (player.state === 'walk') {
    for (const it of game.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const d = _d.copy(it.position).sub(player.position).length();
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
  }
  player.nearest = best;
  if (best && !player.frozen && game.input.justPressed('interact')) best.onInteract();

  player.update(dt);
  for (const ride of game.rides) ride._tick(dt, t);
  for (const npc of game.npcs) npc.update?.(dt, t);
  game.world.update?.(dt, t);
  game.quests.update?.(dt, t);
  game.ui.update(dt, t);
  game.audio.update?.(dt, t);
  game.net?.update(dt, t);
  game.input.endFrame();
  renderer.render(scene, camera);
}

boot().catch((e) => { console.error(e); document.body.innerHTML = `<pre style="color:#fff;padding:20px">Failed to start: ${e.stack || e}</pre>`; });
