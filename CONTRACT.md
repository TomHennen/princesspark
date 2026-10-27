# Princess Park — module contract

A Roblox-style 3D browser game (Three.js r170, Vite, plain ES modules, **no backend**, no external assets — every model is built from Three.js primitives in code, every sound is synthesized with WebAudio). Target players: kids. Setting: a fantasy princess amusement park in Florida (palms, lagoon, flamingos, castle, sunshine, afternoon thunderstorm vibes optional). **Original princesses only — no Disney characters/names/songs. No real person's name or age anywhere in the code: the two princess hosts and the park name come from `game.settings` (core/settings.js), chosen by the player in the Kingdom setup screen.** Kid-friendly: no chat, no money, no accounts.

Coordinate system: Y up. 1 unit ≈ 1 meter. Avatar is ~2 units tall, origin at feet. Park is roughly 260 deep (z) by 340 wide (x −135..205, Splash Cove water park in the east wing); `world.bounds` is the authority.

## The shared `game` object (src/main.js)
```
game.scene, game.camera, game.renderer, game.canvas
game.events      EventBus  .on(name, fn) / .emit(name, payload)
game.input       Input     .move {x,y}  .jump  .boost  .justPressed('interact'|'exit'|'jump')  (see core/input.js)
game.player      Player    .position (Vector3, feet) .state 'walk'|'riding' .ride .frozen .avatar .config .nearest .teleport(x,y,z,facing) .distanceWalked .cameraMode 'follow'|'free' .setCameraMode(m) .setOutfitOverride('swimsuit'|null) .launch(vel, spin) .fling
game.world       World     .group .colliders (Box3[]) .bounds (Box3) .spawnPoint {x,y,z,facing} .getGroundHeight(x,z,yHint) .landmarks {name: Vector3} .gemSpots (Vector3[]) .update(dt,t)
game.rides       Ride[]    see src/rides/Ride.js
game.npcs        NPC[]     { id, group, update(dt,t) }
game.quests      Quests    .state  .unlockedAccessories  .gemsFound  (see quests contract)
game.ui          UI        .toast(text) .dialogue(lines, opts) -> Promise  .prompt(...)  .showHUD()  .update(dt,t)
game.audio       GameAudio .play(name) .music(name|null)  .update(dt,t)
game.interactables  [{ position: Vector3, radius, label, sub?, kind: 'ride'|'npc'|'gem'|'misc', id, onInteract(), enabled?: () => bool }]
game.time        seconds since start
game.params      URLSearchParams (?skipCreator=1  ?tp=<rideId|npcId>)
```

## Events (emit exactly these names)
- `game:start` { config }
- `settings:change` settings — park name / princess names, colors, catchphrases changed at runtime; refresh any text or color derived from them
- `ride:board` { ride, name }  — ride = ride.id
- `ride:complete` { ride, name, time } — passive ride cycle finished OR drive ride completed its goal
- `ride:exit` { ride, name, time } — player bailed early (X)
- `gem:found` { id, position }
- `player:outfit` { outfit, override } — outfit override changed (e.g. swimsuit zone)
- `player:landed` {} — a launched (flung) player hit the ground
- `net:peers` { count } — LAN multiplayer peer count changed
- `npc:talk` { npc }
- `quest:progress` { id, progress, total }
- `quest:complete` { id, title, reward }
- `unlock` { accessory }
- `drive:lap` { ride, lapTime }  (motorcycle/lightcycle)
- `drive:crash` { ride }

## Rides (src/rides/*.js) — extend `Ride` from `./Ride.js`
- `constructor(game)` calls `super(game, { id, name, kind, position, rotationY })`. Positions are decided in `src/rides/index.js` (layout table) — don't hardcode elsewhere.
- `build()`: populate `this.group` (local space), set `this.station` in **world** space (use `this.group.localToWorld(v)` after `this.group.updateMatrixWorld(true)`), set `this.tagline`, add colliders with `this.addBoxCollider(localCenter, size)` so players can't walk through walls/supports (keep colliders few and coarse — the base and the queue fence, not every post).
- `update(dt, t)`: animate. Must be cheap. Prefer moving a handful of Groups over per-vertex work.
- `this.seat`: an Object3D parented somewhere in the ride; the player avatar copies its world transform every frame. Seat +Z is the forward direction the rider faces. The avatar origin is at the feet, so put the seat where feet go.
- `this.cameraOffset` / `this.cameraLookOffset`: seat-local. Defaults `(0,3.2,-7)` / `(0,1.2,6)`. The rider can orbit/zoom around this default; the camera is pulled in when ride meshes block the view — set `mesh.userData.noOcclude = true` on thin things (rails, poles, fences) so only solid walls/roofs count. The seat's ancestors (the vehicle) never occlude.
- Passive rides: set `this.duration` (seconds); `isComplete()` default fires at duration. Keep cycles 25–45 s. The ride should run its full animation cycle even with nobody aboard (empty cars moving look alive).
- Drive rides: `kind: 'drive'`, `seatAnim = 'drive'`, implement `handleInput(input, dt)` (use `input.move.x` steer, `input.move.y` throttle, `input.boost`). Override `isComplete()` to end when goal is met (e.g. 3 laps) and emit `drive:lap`. The player can always exit with X. Clamp the vehicle to the ride's own track/arena — do NOT use world colliders for vehicles.
- All geometry is procedural; use `MeshStandardMaterial`, `castShadow`/`receiveShadow` on big pieces only. Emissive materials for neon / Tron glow. No textures loaded from files (CanvasTexture generated in code is fine).
- Add lights sparingly (max 1–2 PointLights per ride, or none; the world has sun + hemi).

## World (src/world/world.js)
`class World { constructor(game); build(); update(dt,t); group; colliders; bounds; spawnPoint; getGroundHeight(x,z,yHint); landmarks; gemSpots }`
Owns: sky/fog/lighting, ground, paths, lagoon water, castle, palms, fences, benches, lamp posts, flamingos, signage, hidden gem spawn positions (14: 12 in the main park, 2 in Splash Cove). Ride plots must stay clear — see layout table in src/rides/index.js. The world should not import ride modules.

## NPCs (src/npcs/npcs.js)
`createNPCs(game) -> NPC[]` with `{ id, group, update(dt,t) }`. Two princess hosts from `game.settings.princesses`: p1 (gown in p1.color, tiara, warm & clever archetype) and p2 (dress in p2.color, bubbly hype archetype, sprinkles p2.catchphrase into her lines when set). Names, colors and catchphrases are never hardcoded. Built with `buildAvatar` from core/avatar.js. Register interactables with `kind: 'npc'`. Dialogue via `game.ui.dialogue([...lines], { speaker, color })`. Dialogue content is driven by quest state (`game.quests`).

## Quests (src/quests/quests.js)
`class Quests { constructor(game); start(); update(dt,t); state; gemsFound; unlockedAccessories; isComplete(id); progress(id) }`. Persists to localStorage key `pk:save`. Places gem pickups at `world.gemSpots` as interactables (kind 'gem') or auto-pickup on proximity. Listens to events, emits quest events, grants accessory unlocks (which the avatar creator reads from localStorage `pk:save` → `unlockedAccessories`).

## UI (src/ui/*)
`class UI { constructor(game); showHUD(); update(dt,t); toast(text, ms?); dialogue(lines, {speaker,color}) -> Promise<void>; setObjective(text); }` plus `showAvatarCreator(game, config) -> Promise<config>` in `ui/creator.js`, touch controls in `ui/touch.js` (feeds `game.input.setVirtualAxis/pressVirtual/releaseVirtual`). All DOM lives under `#ui-root`; styles in `ui/style.css`. Sets `game.player.frozen = true` while a dialogue or menu is open. Shows the interaction prompt from `game.player.nearest` (`label` + `sub`), ride HUD when `game.player.state === 'riding'` (ride name, timer, "X / tap to exit", for drive rides: speed + lap).

## Audio (src/audio/audio.js)
`class GameAudio { constructor(game); play(name); music(trackName|null); update(dt,t) }` — WebAudio synthesis only. Unlock the AudioContext on first user gesture. Names used elsewhere: 'jump','board','gem','talk','quest','unlock','whoosh','click','crash','lap','boost'. Listen to game events to trigger sounds itself where sensible. Keep volume gentle; provide a mute toggle via `game.audio.muted`.

## Style rules
- ES modules, no TypeScript, no frameworks. Import three as `import * as THREE from 'three'`.
- Each module exports exactly what the contract says. Don't reach into another module's internals beyond the contract.
- `npm run build` must pass with zero errors. Test by running `npm run build`.
- Comments: brief, explain non-obvious intent.

## Round-2 additions (QA tab 2)
Player states: `player.state` is `'walk' | 'riding' | 'sit' | 'slide'`.
- `player.sitAt({ id, position: Vector3, facing, attachTo?: Object3D, anim?: 'sit' })` — sit down (benches, swings, loungers). Standing up: X / jump / move input, or `player.standUp()`. Emits `seat:sit` { id } and `seat:stand` { id }. `attachTo`: the avatar follows that Object3D's world transform while seated (swing seat, spinner).
- `player.slideAlong(curve: THREE.Curve<Vector3>, { id, duration, anim?: 'sit' })` → state `'slide'`, feet follow the world-space curve, camera trails behind; emits `slide:end` { id } when done. Used by the flamingo slide and the playground slide.
- `player.speedBoost(seconds)` — "sugar rush": run speed without holding boost for N seconds.
- Step-up: the player can walk up onto any collider or platform whose top is at most **0.6** above their feet (stairs = a run of boxes/platforms with ≤0.6 rises). World builders rely on this rule for every staircase.
- `player.setHeld(item)` — equip a hand-held item (`HELD_ITEMS` in core/avatar.js); stored in the avatar config as `config.held`, so it persists and syncs over the network. `avatar.squish()` plays the Needoh squish; `avatar.eat()` plays a bite (the item shrinks away; caller clears `held` afterwards).

World additions (src/world):
- `world.seats`: `[{ id, position: Vector3, facing, attachTo? }]` and the world registers a `kind: 'misc'` interactable (`label: 'Sit'`) for each; `onInteract` calls `player.sitAt(...)`.
- `world.landmarks.snackStand`, `world.landmarks.souvenirStand` — WORLD position where the shopper stands (in front of the counter) — quests registers the shop interactables there. `world.landmarks.house`, `world.landmarks.playground`, `world.landmarks.lookoutSlide`.
- `world.poolZones`: `THREE.Box3[]` (world space) — pool decks where running is dangerous (lifeguard shouts). `world.lifeguardSpots`: `[{ position: Vector3, facing }]` where lifeguards stand/sit.
- `world.setWeather(name)` / `world.weather` — `'sunny' | 'cloudy' | 'rain' | 'storm' | 'sunset' | 'night'`; emits `weather:change` { weather }. Persisted in `settings.weather` by the UI that offers the picker (`applySettings(game, { weather })`); `world` reads `game.settings.weather` at build and applies it.
- The house (just outside the south entrance) has a bed: its interactable calls `game.quests.trySleep()` (quests decides whether the day can end) and a closet that calls `game.ui.openDressingRoom()`.
- Playground items emit `play` { id } when used (swing, slide, spinner, seesaw, climb).

Rides (multiplayer):
- `ride.peerSeat(i)` → `Object3D | null` — a seat for remote rider `i` (0-based) inside THIS client's copy of the ride (same train / an extra tube / the next horse), so remote riders appear in the vehicle as it moves locally. Rides create extra visible vehicles when needed (an extra tube on the lazy river). `null` for drive rides.
- `ride.makePeerVehicle()` → `Object3D | null` — drive rides only: a fresh bike mesh the net module parents under the remote avatar's group (the remote transmits its own transform).

Quests / days:
- `quests.day` (1-based) in the save; `quests.trySleep()` → if every quest of the current day is complete: fade, `day++`, new quest list, toast; otherwise a hint of what is left. Emits `day:change` { day }.
- New events consumed by quests: `snack:eat` { item }, `shop:equip` { item }, `play` { id }, `seat:sit`, `slide:end`, `weather:change`, `lifeguard:warn`.
- Shops: the snack stand and souvenir stand are `kind: 'misc'` interactables registered by quests (`label: 'Snack Stand'` / `'Souvenir Shop'`) opening `ui.choose` menus; everything is free (no money in the game).
- Ride camera note: every ancestor of `ride.seat` up to the ride group counts as "the vehicle" and never occludes the camera. If the seat would sit on a big rotating assembly (carousel rotor, Ferris hub), parent the seat to a small level carrier driven in `update()` instead, so the canopy/column still occlude properly.

## Round-3 additions (QA tab 3)
File ownership this round — rides: `src/rides/*`; world: `src/world/*` except `sky.js`; quests/npcs/ui/audio/input/touch: `src/quests/*`, `src/npcs/*`, `src/ui/ui.js`, `src/ui/touch.js`, `src/ui/style.css`, `src/audio/audio.js`, `src/core/input.js`; avatar/net: `src/core/avatar.js`, `src/net/*`, `tools/net-test.mjs`; perf: `src/main.js`, `src/core/settings.js`, `src/world/sky.js`, `src/ui/creator.js`, `tools/perf.mjs`. `src/core/player.js` is frozen this round (ask the lead).

Rides:
- **Seat choice.** `ride.seatOptions()` → `[{ id, label, sub? }] | null` (null = no choice). When non-null, the base `Ride.board()` opens `game.ui.chooseMenu({ title: 'Pick your seat', options })` and then calls `ride.chooseSeat(id)`, which re-parents `this.seat` (and re-homes peer seats so they never share the local seat). The vehicle must stay in the station until the pick is made (a cancelled menu = first option). The last pick per ride is remembered in localStorage `pk:seats`. Coaster: Front / Middle / Back car. Log flume: Front / Middle / Back row. Carousel: pick an animal (by name). Ferris: Window / Across bench. Teacups: pick a cup colour (then the speed menu as before). Drive rides, water slide, lazy river: null.
- **Big splash.** Log flume emits `ride:splash { ride, position: Vector3 (world) }` the moment the rider's log hits the pool: a much larger burst (sheets/curtains of water + many droplets + ripple ring), ~0.5 s camera shake via `this.cameraOffset` jitter. Audio plays `'splash'` on the event; the UI shows water drops running down the screen (`ui.wetScreen()`), ~1.5 s.
- Ferris gondolas may never intersect the rims at any wheel angle (widen the twin rims / hang the gondola between them with clearance).
- **No walking into rides.** Every ride plot gets a fence (`addPlotFence` in `shared/track.js`) with a gap only at the queue/station, plus coarse colliders for the big bodies reachable from inside the gap (platter edge, carousel deck, ferris base, trough, pool). A player standing at `ride.station` must still be able to board; nothing may trap the player on exit (`exitRide` drop-off must land outside the fence or inside with a path out). Gem spots and `world.landmarks` must stay reachable (not inside any collider).

World:
- **Changing room.** Splash Cove's changing huts are walk-in: a door/curtain, bench, mirror, hooks. `world.landmarks.changingRoom` = where the player stands at the curtain; an interactable `label: 'Changing Room'` calls `game.ui.openChangingRoom()` (ui: fade, curtain sound, dressing room opens with the swimsuit on, fade back; the swimsuit override stays while inside the park).
- **Spinner speed.** The playground spinner's interactable opens `ui.chooseMenu({ title: 'How fast?' })`: `gentle` / `fast` / `turbo` / `push` ("Get a push!"). `turbo` spins up hard and, after ~6 s, flings the rider (`player.launch`, like the teacups). `push`: the world emits `spinner:push:start { position: Vector3 (world, where the pusher stands), duration }`; a playground attendant NPC walks there and pushes (the world applies an increasing spin while pushing, then flings the rider); the world emits `spinner:push:end {}` when done. `world.playground.spinner = { mode, omega }` for tests.
- **Castle door + throne room.** The keep's front door is a separate hinged mesh: `world.castle = { doorOpen: bool, setDoorOpen(open, animate = true) }` (collider removed when open; emits `castle:door { open }`). Inside the keep: a throne room (carpet, two thrones registered in `world.seats` as `throneL` / `throneR`, chandeliers, banners, stained-glass glow, a balcony/stairs are optional). The keep's solid collider becomes hollow (walls + door). `world.landmarks.castleDoor` = outside the door, `world.landmarks.throneRoom` = inside. The world reads `game.quests?.castleOpen` at build to start with the door open.

Quests / items / NPCs / UI:
- **Royal keys.** `quests.royalKeys` (saved; +1 each time a day's "Complete every quest" finishes; derived for old saves as completed royal days). HUD shows `🔑 n/5` next to the gems. Quests registers the `Castle Door` interactable at `world.landmarks.castleDoor`: with < 5 keys a locked message (`"N more royal keys"`), with 5 keys `world.castle.setDoorOpen(true)`, fanfare (`'fanfare'`), title card, `quests.castleOpen = true` (saved), unlock the `crown` accessory, and a new day quest `Sit on a throne`. `?keys=5` sets the key count (debug).
- **Drop.** `input.justPressed('drop')` = `Q` / touch `Drop` button (touch.js, shown while holding something). `items.drop()` tosses the held item in front of the player as a world object: Needoh / plushie bounce and settle (pick-up interactable `Pick up <item>`, max 8 on the ground, lifetime 120 s), balloon floats up and away then vanishes, snacks splat and vanish. Uses `buildHeldItem(kind)` from `core/avatar.js`. Emits `item:drop { item }`, `item:pickup { item }`.
- **Bop.** Using the balloon or the Needoh = `avatar.bop()` (swing) and a hit test: nearest NPC or remote player within 2.2 m and roughly in front → `bop { targetKind: 'npc' | 'peer', id, item }`. NPCs react (`npc.bopped()`: wobble + a one-liner); the net module relays `'bop'` to that peer, whose client toasts `"<name> bopped you!"`, plays `'bop'` and runs `avatar.bopped()` on the local player. Nothing happens on a miss except the swing.
- Audio names added: `'splash'`, `'bop'`, `'drop'`, `'pickup'`, `'door'`, `'fanfare'`, `'curtain'`.
- `ui.wetScreen()`, `ui.openChangingRoom()`, `ui.setKeys(n, total)`.

Avatar / net:
- `export function buildHeldItem(kind) → Object3D` (same meshes as in the hand, origin at the item's centre, `userData.base` scale).
- `avatar.bop()` → Promise (~0.5 s arm swing; balloon/Needoh squash at impact). `avatar.bopped()` → Promise (~0.6 s stagger/wobble).
- `net.peers()` → `[{ id, name, position: Vector3, group }]` (rendered peers). `'bop'` action `{ to, item }`.
- `'state'` may carry `seat` (chosen seat id) — informational only.

Performance (iPad 2020 target):
- `settings.quality: 'auto' | 'low' | 'medium' | 'high'` (Kingdom tab in the dressing room, `?quality=` param). Auto: touch/mobile → medium (pixel ratio ≤ 1.5, 1024 PCF shadow map), desktop → high (≤ 2, 2048 PCFSoft). Low: pixel ratio 1, shadows off. Adaptive resolution: `game.perf` scales the render resolution down when frames average > 24 ms and back up when they are fast, never above the tier cap. `game.perf.stats()` → `{ fps, ratio, tier }`.
