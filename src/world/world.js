// Princess Park — the park itself: sky, lighting, terrain, castle, lagoon, paths and all the dressing.
// Exposes colliders / platforms / ground heights / landmarks / gem spots per CONTRACT.md.
import * as THREE from 'three';
import { makeRng, C } from './builder.js';
import { terrainY } from './layout.js';
import { buildSky } from './sky.js';
import { buildGround, buildPaths, buildWater } from './terrain.js';
import { buildCastle } from './castle.js';
import { buildProps } from './props.js';
import { buildFlags } from './flags.js';
import { buildHouse } from './house.js';
import { buildPlayground } from './playground.js';
import { WATER_PARK } from '../rides/index.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export class World {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group(); this.group.name = 'world';
    this.colliders = [];
    this.cameraBlockers = [];  // Box3[] — big solid occluders that aren't colliders (the player camera pulls in for these)
    this.platforms = [];      // { minX, maxX, minZ, maxZ, top } — walkable tops (bridges, steps, crates)
    this.bounds = new THREE.Box3(v(-135, -10, -135), v(205, 120, 135));   // east wing (Splash Cove) runs out to x ≈ 204
    this.spawnPoint = { x: 0, y: 0, z: 96, facing: Math.PI };
    this.landmarks = {
      castle: v(0, 0, -78), plaza: v(0, 0, 0), entrance: v(0, 0, 98),
      lagoon: v(0, -0.2, -48), gazebo: v(0, 0, 12), fountain: v(0, 0, -4),
    };
    this.gemSpots = [
      v(0, 0, -122),        // behind the castle, past the moat
      v(33, 2.5, -48),      // top of the Flamingo Lookout (climb the steps)
      v(-27, 0, -46),       // lagoon west shore, under a palm
      v(-41.7, 2.0, 65.3),  // on the crate stack behind the souvenir stand (jump up)
      v(-41, 0, -4),        // coaster plot edge
      v(46, 0, -16),        // log flume plot edge
      v(-24, 0, 46),        // carousel plot edge
      v(24, 0, 46),         // ferris wheel plot edge
      v(-15, 0, 94),        // near the entrance / teacups, under a palm
      v(-47, 0, 78),        // lightcycle plot edge
      v(47, 0, 66),         // motorcycle plot edge
      v(-16, 0, -82),       // castle courtyard corner
      // Splash Cove (water park wing)
      v(127, 0, -65),       // behind the wave pool, by the north-west palms
      v(197, 0, 81),        // far south-east corner of the wing, under the palms
    ];
    this.seats = [];          // [{ id, position, facing, attachTo? }] — benches, loungers, swings (see CONTRACT round 2)
    this.poolZones = [];      // Box3[] world space — pool decks where lifeguards shout at runners
    this.lifeguardSpots = []; // [{ position, facing }] — lifeguard chair perches
    this.weather = 'sunny';   // set by setWeather(); the sky module owns the actual lights/fog/particles
    this.sky = null;
    this.swimsuit = false;    // true while the player is inside the water park in a swimsuit
    this.flagDefs = [];
    this.animated = [];
    this.rng = makeRng(20241023);
    this.mat = {
      vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
      grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
      water: new THREE.MeshStandardMaterial({ color: C.water, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.05 }),
    };
  }

  build() {
    this.sky = buildSky(this);
    this.group.add(buildGround(this));
    this.group.add(buildPaths(this));
    this.group.add(buildWater(this));
    this.group.add(buildCastle(this));
    buildProps(this);
    buildHouse(this);
    buildPlayground(this);
    const flags = buildFlags(this, this.flagDefs);
    if (flags) this.group.add(flags);
    this.setWeather(this.game?.settings?.weather || 'sunny', true);
  }

  /** 'sunny' | 'cloudy' | 'rain' | 'storm' | 'sunset' | 'night' — sky, fog, lights, rain, lightning, lamp glow. */
  setWeather(name, silent = false) {
    if (!this.sky) return;
    const w = this.sky.setWeather(name);
    this.weather = w;
    if (!silent) this.game?.events?.emit('weather:change', { weather: w });
    return w;
  }

  /** Register a seat (bench, lounger, swing...) + its 'Sit' interactable. position = where the sitter's feet go. */
  addSeat(seat, { label = 'Sit', sub, radius = 2 } = {}) {
    this.seats.push(seat);
    this.game?.interactables?.push({
      position: seat.position, radius, label, sub, kind: 'misc', id: seat.id,
      onInteract: () => this.game.player?.sitAt?.(seat),
      enabled: () => this.game.player?.state === 'walk',
    });
    return seat;
  }

  /** Debug: wireframe boxes for every collider (red), platform (green) and camera blocker (blue). Call from the console. */
  debugColliders(on = true) {
    if (this._debug) { this.group.remove(this._debug); this._debug = null; }
    if (!on) return;
    const g = new THREE.Group(); g.name = 'debugColliders';
    const add = (box, color) => { const h = new THREE.Box3Helper(box, color); h.material.depthTest = false; h.renderOrder = 999; g.add(h); };
    for (const b of this.colliders) add(b, 0xff2244);
    for (const b of this.cameraBlockers) add(b, 0x3388ff);
    for (const p of this.platforms) add(new THREE.Box3(v(p.minX, p.top - 0.08, p.minZ), v(p.maxX, p.top + 0.02, p.maxZ)), 0x22ee66);
    this._debug = g; this.group.add(g);
    return g;
  }

  addCollider(cx, cy, cz, w, h, d) {
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(v(cx, cy, cz), v(w, h, d)));
  }
  addBlocker(cx, cy, cz, w, h, d) {
    this.cameraBlockers.push(new THREE.Box3().setFromCenterAndSize(v(cx, cy, cz), v(w, h, d)));
  }
  addPlatform(minX, maxX, minZ, maxZ, top) { this.platforms.push({ minX, maxX, minZ, maxZ, top }); }

  /** Walkable height at (x,z). Terrain dips to -0.6 in water; platforms count only when yHint is near/above them. */
  getGroundHeight(x, z, yHint = 0) {
    let h = terrainY(x, z);
    for (const p of this.platforms) {
      if (p.top > h && x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && yHint > p.top - 1.0) h = p.top;
    }
    return h;
  }

  update(dt, t) {
    for (const fn of this.animated) fn(dt, t);
    this.updateSwimZone();
  }

  /** Swimsuit zone: walking into Splash Cove swaps the avatar's outfit (saved config untouched); leaving swaps it back. */
  updateSwimZone() {
    const player = this.game.player;
    if (!player || player.state !== 'walk' || !player.setOutfitOverride) return;
    const p = player.position, W = WATER_PARK;
    const inside = p.x > W.minX && p.x < W.maxX && p.z > W.minZ && p.z < W.maxZ;
    if (inside === this.swimsuit) return;
    this.swimsuit = inside;
    player.setOutfitOverride(inside ? 'swimsuit' : null);
    this.game.ui?.toast?.(inside ? 'Changed into your swimsuit! 👙' : 'Back in your outfit');
    this.game.audio?.play?.('click');
  }
}
