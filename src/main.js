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
import { loadSettings, QUALITIES } from './core/settings.js';
import { createNet } from './net/net.js';

const params = new URLSearchParams(location.search);
const settings = loadSettings();   // park name + princess hosts + weather + quality (see core/settings.js)

// ---------------------------------------------------------------- graphics quality / adaptive resolution
// Tiers cap the device pixel ratio and pick the sun shadow map (sky.js). 'auto' = medium on touch/mobile devices
// (iPad 2020 target), high on desktop. On top of the tier, the adaptive scaler lowers the render resolution while
// frames stay slow and raises it again (never above the tier cap) once they are fast. Antialias (MSAA) is a
// renderer-creation option, so the tier is resolved before the renderer exists.
const TIERS = {
  low:    { ratio: 1.0, shadow: 0,    soft: false, antialias: true },
  medium: { ratio: 1.5, shadow: 1024, soft: false, antialias: true },
  high:   { ratio: 2.0, shadow: 2048, soft: true,  antialias: true },
};
const isMobileDevice = () => {
  try {
    if (navigator.maxTouchPoints > 0) return true;                       // iPadOS Safari reports a Mac UA but has touch points
    if (/iPad|iPhone|iPod|Android|Mobile|Tablet/i.test(navigator.userAgent)) return true;
    return window.matchMedia?.('(pointer: coarse)').matches || false;
  } catch { return false; }
};
const perf = {
  requested: QUALITIES.includes(params.get('quality')) ? params.get('quality') : settings.quality,
  tier: 'high', cap: 2, ratio: 2, min: 0.6, step: 0.15,
  ema: 16.7, slow: 0, fast: 0, grace: 3, upWait: 5, frames: 0,
  resolve(name) { return name === 'auto' || !TIERS[name] ? (isMobileDevice() ? 'medium' : 'high') : name; },
  /** Apply a tier now (name may be 'auto'). Called at boot and on settings:change. */
  setTier(name) {
    this.requested = QUALITIES.includes(name) ? name : 'auto';
    this.tier = this.resolve(this.requested);
    const t = TIERS[this.tier];
    this.cap = Math.min(window.devicePixelRatio || 1, t.ratio);
    this.setRatio(this.cap);
    this.slow = this.fast = 0; this.grace = Math.max(this.grace, 1); this.upWait = 5;
    game.world?.sky?.setShadowQuality?.(t.shadow, t.soft);
    return this.tier;
  },
  setRatio(r) {
    this.ratio = Math.round(r * 100) / 100;
    renderer.setPixelRatio(this.ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  /** Frame-time EMA based scaler. `raw` = unclamped seconds since the previous frame. */
  update(raw) {
    const ms = raw * 1000;
    this.frames++;
    if (ms > 1000) return;                                 // a real stall (tab switch, shader compile): never count it
    this.ema += (Math.min(ms, 250) - this.ema) * 0.1;
    if (this.grace > 0) { this.grace -= raw; this.slow = this.fast = 0; return; }
    if (this.ema > 24) {
      this.fast = 0; this.slow += raw;
      if (this.slow >= 2 && this.ratio > this.min) {
        this.setRatio(Math.max(this.min, this.ratio - this.step));
        this.slow = 0; this.ema = 20;                       // give the new size a moment before judging it again
        this.upWait = Math.min(30, this.upWait * 2);        // be slower to climb back each time we had to drop
      }
    } else if (this.ema < 18) {                           // keeping vsync (16.7 ms at 60 Hz): fast
      this.slow = 0; this.fast += raw;
      if (this.fast >= this.upWait && this.ratio < this.cap) { this.setRatio(Math.min(this.cap, this.ratio + this.step)); this.fast = 0; this.ema = 20; }
    } else { this.slow = Math.max(0, this.slow - raw); this.fast = 0; }
  },
  stats() { return { fps: Math.round(1000 / this.ema), ms: Math.round(this.ema * 10) / 10, ratio: this.ratio, cap: this.cap, tier: this.tier, requested: this.requested, frames: this.frames }; },
};
perf.tier = perf.resolve(perf.requested);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: TIERS[perf.tier].antialias, powerPreference: 'high-performance' });
perf.cap = Math.min(window.devicePixelRatio || 1, TIERS[perf.tier].ratio);
renderer.setPixelRatio(perf.cap); perf.ratio = perf.cap;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = TIERS[perf.tier].shadow > 0;
renderer.shadowMap.type = TIERS[perf.tier].soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
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
  settings,                   // park name + princess hosts + weather + quality (see core/settings.js)
  perf,                       // graphics tier + adaptive resolution: perf.stats(), perf.setTier(name)
  overlay: false,             // true while an opaque full-screen UI (dressing room) hides the 3D view: skip rendering
};
window.__game = game; // for tests / debugging
document.addEventListener('visibilitychange', () => { perf.grace = 3; perf.ema = 16.7; perf.slow = perf.fast = 0; });
game.events.on('settings:change', (s) => { if (s?.quality && s.quality !== perf.requested) perf.setTier(s.quality); });

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
  game.world.sky?.setShadowQuality?.(TIERS[perf.tier].shadow, TIERS[perf.tier].soft);

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
  const raw = game.clock.getDelta();
  perf.update(raw);
  const dt = Math.min(raw, 0.05);
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
  if (!game.overlay) renderer.render(scene, camera);   // the dressing room covers the canvas: its own preview gets the GPU
}

boot().catch((e) => { console.error(e); document.body.innerHTML = `<pre style="color:#fff;padding:20px">Failed to start: ${e.stack || e}</pre>`; });
