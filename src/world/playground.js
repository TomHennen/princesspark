// Playground east of the ring road (PLAYGROUND in layout.js: x 26..48, z 76..98). Two swings, a tall slide with
// step-up stairs, a spinner, a seesaw and a climbing frame with platforms to jump across. Moving parts are small
// groups animated in world.animated; seats attach the avatar to the moving part via player.sitAt({ attachTo }).
import * as THREE from 'three';
import { MeshBuilder, C, makeTextSign } from './builder.js';
import { PLAYGROUND } from './layout.js';

const MAT = 0xf4b6c8, RED = 0xe53935, BLUE = 0x3d8bff, LIME = 0x7bd94a, ORANGE = 0xff9b3d, STEEL = 0xd0d6dc;

export function buildPlayground(world) {
  const game = world.game, B = new MeshBuilder(), P = PLAYGROUND;
  const x0 = P.x - P.w / 2, x1 = P.x + P.w / 2, z0 = P.z - P.d / 2, z1 = P.z + P.d / 2;
  const occupied = new Set();
  game?.events?.on('seat:sit', (e) => { if (e?.id) occupied.add(e.id); });
  game?.events?.on('seat:stand', (e) => { if (e?.id) occupied.delete(e.id); });
  // seat ids are unique per seat (swing0/swing1, seesawW/E); `play` events use the five item ids the quests count:
  // 'swing' | 'slide' | 'spinner' | 'seesaw' | 'climb'
  const sitInteract = (seat, label, sub, playId) => {
    world.seats.push(seat);
    game?.interactables?.push({
      position: seat.position, radius: 2.2, label, sub, kind: 'misc', id: seat.id,
      enabled: () => game.player?.state === 'walk',
      onInteract: () => { game.events?.emit('play', { id: playId }); game.audio?.play?.('click'); game.player?.sitAt?.(seat); },
    });
  };
  const sign = (text, x, y, z, ry, opts) => { const m = makeTextSign(text, opts); m.position.set(x, y, z); m.rotation.y = ry; world.group.add(m); return m; };

  // --- ground mat, fence with a gate on the west (the spur path ends at x 28), sign, benches ---
  B.box(MAT, P.w - 1, 0.05, P.d - 1, P.x, 0, P.z);
  B.box(C.yellow, P.w - 1.2, 0.012, 0.4, P.x, 0.05, z0 + 1.5); B.box(C.yellow, P.w - 1.2, 0.012, 0.4, P.x, 0.05, z1 - 1.5);
  const rail = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    B.box(C.green, 0.08, 0.08, len, mx, 0.5, mz, ry); B.box(C.green, 0.08, 0.08, len, mx, 0.85, mz, ry);
    const n = Math.max(1, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) { const f = -len / 2 + (len / n) * i; B.box(C.green, 0.12, 0.95, 0.12, mx + Math.sin(ry) * f, 0, mz + Math.cos(ry) * f); B.sphere(C.yellow, 0.1, mx + Math.sin(ry) * f, 1.0, mz + Math.cos(ry) * f, 5, 4); }
    world.addCollider(mx, 0.5, mz, Math.max(Math.abs(dx), 0.3), 1.0, Math.max(Math.abs(dz), 0.3));
  };
  rail(x0 + 0.5, z0 + 0.5, x1 - 0.5, z0 + 0.5); rail(x0 + 0.5, z1 - 0.5, x1 - 0.5, z1 - 0.5); rail(x1 - 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5);
  rail(x0 + 0.5, z0 + 0.5, x0 + 0.5, 85.5); rail(x0 + 0.5, 90.5, x0 + 0.5, z1 - 0.5);
  for (const z of [85.5, 90.5]) { B.box(C.pink2, 0.5, 2.6, 0.5, x0 + 0.5, 0, z); B.sphere(C.yellow, 0.25, x0 + 0.5, 2.8, z, 6, 4); world.addCollider(x0 + 0.5, 1.3, z, 0.55, 2.6, 0.55); }
  B.box(C.pink2, 0.3, 0.3, 5.5, x0 + 0.5, 2.5, 88);
  sign('PLAYGROUND', x0 + 0.5, 3.35, 88, -Math.PI / 2, { w: 4.4, h: 0.8, doubleSided: true, gap: 0.2, bg: '#ff6fb5', fg: '#ffffff', stroke: '#1b5e20', border: '#ffd600' });
  const bench = (x, z, ry, id) => {
    B.begin(x, 0, z, ry);
    B.box(C.green, 1.8, 0.12, 0.5, 0, 0.48, 0); B.box(C.green, 1.8, 0.48, 0.1, 0, 0.6, -0.26, 0, -0.12);
    B.box(C.gold, 0.12, 0.85, 0.56, -0.85, 0, 0); B.box(C.gold, 0.12, 0.85, 0.56, 0.85, 0, 0);
    B.end();
    world.addSeat({ id, position: new THREE.Vector3(x + Math.sin(ry) * 0.2, 0, z + Math.cos(ry) * 0.2), facing: ry, seatHeight: 0.6 });
  };
  bench(x0 + 1.6, 82.5, Math.PI / 2, 'pgBench0'); bench(x0 + 1.6, 93.5, Math.PI / 2, 'pgBench1');
  B.cyl(C.yellow, 0.4, 0.36, 0.85, x0 + 1.6, 0, 96.2, 10); B.cyl(C.green, 0.45, 0.45, 0.14, x0 + 1.6, 0.85, 96.2, 10);

  // --- swings: A-frame along x at z 79, two seats on chains, pivoting about the top bar ---
  const SZ = 79, SY = 3.3;
  for (const s of [-1, 1]) { const x = P.x + s * 3.4; B.beam(RED, x, 0, SZ - 1.2, x, SY, SZ, 0.09, 7); B.beam(RED, x, 0, SZ + 1.2, x, SY, SZ, 0.09, 7); B.box(RED, 0.5, 0.1, 3.0, x, 0, SZ); world.addCollider(x, 1.6, SZ, 0.5, 3.3, 2.8); }
  B.beam(BLUE, P.x - 3.6, SY, SZ, P.x + 3.6, SY, SZ, 0.08, 7);
  const swings = [];
  [P.x - 1.4, P.x + 1.4].forEach((x, i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, SY, SZ);
    const M = new MeshBuilder();
    for (const s of [-1, 1]) M.beam(STEEL, s * 0.3, 0, 0, s * 0.3, -2.4, 0, 0.025, 5);
    M.box(i ? C.yellow : C.hotpink, 0.8, 0.08, 0.4, 0, -2.5, 0);
    pivot.add(M.build(world.mat.vc));
    const seat = new THREE.Object3D(); seat.position.set(0, -2.42, 0); pivot.add(seat);
    world.group.add(pivot);
    const id = `swing${i}`;
    swings.push({ id, pivot, amp: 0, phase: i * 1.3 });
    sitInteract({ id, position: new THREE.Vector3(x, SY - 2.42, SZ), facing: 0, attachTo: seat, seatHeight: 0 }, 'Swing', 'sit on the swing', 'swing');
  });

  // --- slide: platform at 3.0 with a canopy, six 0.5 steps up from the south, chute down to the north ---
  const SX = 44, SZc = 87, TOP = 3.0;
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { B.cyl(BLUE, 0.09, 0.11, TOP, SX + dx, 0, SZc + dz, 7); world.addCollider(SX + dx, TOP / 2, SZc + dz, 0.3, TOP, 0.3); }
  B.box(C.yellow, 2.0, 0.14, 2.0, SX, TOP - 0.14, SZc);
  world.addPlatform(SX - 1.0, SX + 1.0, SZc - 1.0, SZc + 1.0, TOP);
  world.addBlocker(SX, TOP - 0.1, SZc, 2.0, 0.2, 2.0);
  // rails: west + east full, north split around the chute mouth; the south side is the stair entrance
  for (const s of [-1, 1]) { B.box(BLUE, 0.08, 0.08, 2.0, SX + s * 0.95, TOP + 0.9, SZc); for (const dz of [-0.9, 0, 0.9]) B.cyl(BLUE, 0.04, 0.04, 0.95, SX + s * 0.95, TOP, SZc + dz, 5); world.addCollider(SX + s * 0.98, TOP + 0.5, SZc, 0.16, 1.0, 2.0); }
  for (const s of [-1, 1]) { B.box(BLUE, 0.4, 0.08, 0.08, SX + s * 0.8, TOP + 0.9, SZc - 0.95); world.addCollider(SX + s * 0.8, TOP + 0.5, SZc - 0.98, 0.4, 1.0, 0.16); }
  B.box(C.yellow, 1.2, 0.07, 0.07, SX, TOP + 0.62, SZc - 0.95); world.addCollider(SX, TOP + 0.4, SZc - 0.98, 1.2, 0.8, 0.14);   // hop-over bar at the chute mouth: use 'Slide!' to go down
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) B.cyl(C.yellow, 0.05, 0.05, 2.0, SX + dx, TOP, SZc + dz, 5);
  B.cone(RED, 1.9, 1.3, SX, TOP + 2.0, SZc, 4, Math.PI / 4); B.sphere(C.yellow, 0.18, SX, TOP + 3.45, SZc, 6, 4);
  world.addBlocker(SX, TOP + 2.6, SZc, 2.8, 1.4, 2.8);
  for (let k = 1; k <= 6; k++) {
    const top = TOP - 0.5 * k, za = SZc + 1.0 + (k - 1) * 0.95;
    B.box(k % 2 ? LIME : C.yellow, 1.3, top, 0.95, SX, 0, za + 0.475);
    world.addPlatform(SX - 0.65, SX + 0.65, za, za + 0.95, top);
  }
  for (const s of [-1, 1]) {
    const x = SX + s * 0.78;
    B.beam(BLUE, x, TOP + 0.9, SZc + 1.0, x, 1.3, SZc + 6.7, 0.05, 6);
    for (let k = 1; k <= 5; k += 2) B.cyl(BLUE, 0.04, 0.04, 0.9, x, TOP - 0.5 * k, SZc + 1.0 + (k - 0.5) * 0.95, 5);
    world.addCollider(x, 1.8, SZc + 3.85, 0.16, 3.6, 5.7);   // stair side rails only — the bottom step stays open
  }
  const chutePts = [[SX, TOP + 0.02, SZc - 0.9], [SX, TOP - 0.25, SZc - 2.3], [SX, 1.75, SZc - 4.6], [SX, 0.7, SZc - 6.7], [SX, 0.12, SZc - 8.4]];
  const chute = new THREE.CatmullRomCurve3(chutePts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.3);
  ribbon(B, chute, C.yellow, ORANGE, 1.1);
  B.cyl(0xf1dfb0, 1.5, 1.7, 0.04, SX, 0, SZc - 9.0, 14);
  B.cyl(BLUE, 0.06, 0.06, 1.6, SX - 0.5, 0, SZc - 4.6, 5); B.cyl(BLUE, 0.06, 0.06, 1.6, SX + 0.5, 0, SZc - 4.6, 5);
  world.addCollider(SX, 0.6, SZc - 7.0, 1.4, 1.2, 3.0);
  world.slides = world.slides || {}; world.slides.playgroundSlide = chute;
  game?.interactables?.push({
    position: new THREE.Vector3(SX, TOP, SZc), radius: 1.8, label: 'Slide!', sub: 'whee', kind: 'misc', id: 'slide',
    enabled: () => game.player?.state === 'walk' && game.player.position.y > TOP - 0.6,
    onInteract: () => { game.events?.emit('play', { id: 'slide' }); game.player?.slideAlong?.(chute, { id: 'slide', duration: 2.0 }); },
  });

  // --- spinner (merry-go-round): a disc on a post that spins while someone sits on it ---
  const MX = 31, MZ = 83;
  B.cyl(C.dark, 0.9, 1.0, 0.25, MX, 0, MZ, 14); B.cyl(STEEL, 0.1, 0.1, 1.6, MX, 0, MZ, 7);
  world.addCollider(MX, 0.8, MZ, 0.3, 1.6, 0.3);
  const spin = new THREE.Group(); spin.position.set(MX, 0.3, MZ);
  { const M = new MeshBuilder();
    M.cyl(RED, 1.7, 1.7, 0.16, 0, 0, 0, 20); M.cyl(C.white, 1.72, 1.72, 0.03, 0, 0.16, 0, 20);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; M.add(new THREE.CylinderGeometry(1.7, 1.7, 0.035, 20, 1, false, a, Math.PI / 4), [C.yellow, BLUE, LIME, C.hotpink][i], 0, 0.2, 0); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4, ex = Math.cos(a) * 1.45, ez = Math.sin(a) * 1.45; M.beam(STEEL, ex, 0.2, ez, ex * 0.6, 1.1, ez * 0.6, 0.035, 5); M.beam(STEEL, ex * 0.6, 1.1, ez * 0.6, 0, 1.3, 0, 0.035, 5); }
    M.sphere(C.yellow, 0.14, 0, 1.35, 0, 6, 4);
    spin.add(M.build(world.mat.vc)); }
  world.group.add(spin);
  world.addPlatform(MX - 1.5, MX + 1.5, MZ - 1.5, MZ + 1.5, 0.5);
  const spinSeat = new THREE.Object3D(); spinSeat.position.set(1.05, 0.2, 0); spinSeat.rotation.y = Math.PI / 2; spin.add(spinSeat);
  sitInteract({ id: 'spinner', position: new THREE.Vector3(MX + 1.05, 0.5, MZ), facing: Math.PI / 2, attachTo: spinSeat, seatHeight: 0 }, 'Spin', 'merry-go-round', 'spinner');
  let spinW = 0;

  // --- seesaw: plank on a stand, tilts toward whichever end is occupied ---
  const WX = 33.5, WZ = 93;
  for (const s of [-1, 1]) B.beam(BLUE, WX + s * 0.4, 0, WZ, WX, 0.6, WZ, 0.07, 6); B.box(BLUE, 1.2, 0.1, 0.8, WX, 0, WZ); B.beam(BLUE, WX, 0.6, WZ - 0.35, WX, 0.6, WZ + 0.35, 0.06, 6);
  world.addCollider(WX, 0.35, WZ, 0.9, 0.7, 0.9);
  const plank = new THREE.Group(); plank.position.set(WX, 0.62, WZ);
  { const M = new MeshBuilder();
    M.box(C.yellow, 4.4, 0.1, 0.36, 0, 0, 0); M.box(RED, 0.8, 0.06, 0.4, -1.75, 0.1, 0); M.box(RED, 0.8, 0.06, 0.4, 1.75, 0.1, 0);
    for (const s of [-1, 1]) { M.beam(STEEL, s * 1.2, 0.1, 0, s * 1.2, 0.5, 0, 0.03, 5); M.beam(STEEL, s * 1.2, 0.5, -0.2, s * 1.2, 0.5, 0.2, 0.03, 5); }
    plank.add(M.build(world.mat.vc)); }
  world.group.add(plank);
  const seesawSeats = [];
  for (const s of [-1, 1]) {
    const seat = new THREE.Object3D(); seat.position.set(s * 1.75, 0.13, 0); seat.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; plank.add(seat);
    const id = s < 0 ? 'seesawW' : 'seesawE';
    seesawSeats.push({ id, s });
    sitInteract({ id, position: new THREE.Vector3(WX + s * 1.75, 0.75, WZ), facing: s < 0 ? Math.PI / 2 : -Math.PI / 2, attachTo: seat, seatHeight: 0 }, 'Seesaw', 'up and down', 'seesaw');
  }
  plank.rotation.z = -0.26;

  // --- climbing frame: step-up blocks to platforms you jump across, monkey bars overhead ---
  const CZ = 95.5, cols = [LIME, C.yellow, ORANGE, BLUE, C.hotpink, RED, LIME];
  // contiguous 0.5 / 1.0 steps up to the first 1.5 block, then 1.6 m gaps to jump, 2.0 blocks under the monkey bars, steps down
  const blocks = [[29.6, 0.5, 1.1], [30.7, 1.0, 1.1], [32.15, 1.5, 1.8], [35.55, 1.5, 1.8], [38.95, 2.0, 1.8], [42.35, 2.0, 1.8], [44.0, 1.0, 1.1], [45.1, 0.5, 1.1]];
  const tops = [];
  blocks.forEach(([x, top, w], i) => {
    B.box(cols[i % cols.length], w, top, 1.8, x, 0, CZ); B.box(C.white, w + 0.04, 0.06, 1.84, x, top - 0.06, CZ);
    world.addPlatform(x - w / 2, x + w / 2, CZ - 0.9, CZ + 0.9, top);
    // the collider stops short of the top so a player one step lower (≤ 0.55 rise) can still walk up onto it
    if (top - 0.55 > 0.2) world.addCollider(x, (top - 0.55) / 2, CZ, w, top - 0.55, 1.8);
    if (top >= 2.0) tops.push({ minX: x - w / 2, maxX: x + w / 2, top });
  });
  for (const x of [37.9, 43.4]) for (const s of [-1, 1]) { B.cyl(STEEL, 0.06, 0.06, 4.4, x, 0, CZ + s * 0.8, 6); world.addCollider(x, 2.2, CZ + s * 0.8, 0.2, 4.4, 0.2); }
  for (const s of [-1, 1]) B.box(STEEL, 5.6, 0.08, 0.08, 40.65, 4.4, CZ + s * 0.8);
  for (let i = 0; i < 8; i++) B.box(C.yellow, 0.06, 0.06, 1.6, 38.5 + i * 0.6, 4.4, CZ);
  sign('CLIMB!', 29.6, 1.4, CZ - 1.0, 0, { w: 1.2, h: 0.4, bg: '#7bd94a', fg: '#1b5e20', stroke: '#ffffff', border: '#ffffff' });
  game?.interactables?.push({
    position: new THREE.Vector3(29.6, 0, CZ - 1.3), radius: 1.6, label: 'Climb', sub: 'jump across the tops', kind: 'misc', id: 'climb',
    enabled: () => game.player?.state === 'walk', onInteract: () => { game.events?.emit('play', { id: 'climb' }); game.ui?.toast?.('Step up, then jump across the blocks!'); },
  });
  let onTop = false;

  const mesh = B.build(world.mat.vc);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'playground';
  world.group.add(mesh);
  world.landmarks.playground = new THREE.Vector3(x0 + 1.5, 0, 88);

  // --- animation: swings pump while ridden, spinner spins up, seesaw tilts, climbing-frame top detection ---
  world.animated.push((dt, t) => {
    for (const sw of swings) {
      const want = occupied.has(sw.id) ? 0.75 : 0;
      sw.amp += (want - sw.amp) * Math.min(1, dt * (want ? 0.9 : 0.5));
      sw.pivot.rotation.x = (sw.amp + 0.04) * Math.sin(t * 2.0 + sw.phase);
    }
    spinW += ((occupied.has('spinner') ? 2.4 : 0) - spinW) * Math.min(1, dt * (occupied.has('spinner') ? 0.8 : 0.4));
    spin.rotation.y += spinW * dt;
    let tilt = -0.26;
    for (const ss of seesawSeats) if (occupied.has(ss.id)) tilt = ss.s * (0.2 + 0.1 * Math.cos(t * 2.4));
    plank.rotation.z += (tilt - plank.rotation.z) * Math.min(1, dt * 3);
    const pl = game?.player?.position;
    if (pl) {
      let now = false;
      if (Math.abs(pl.z - CZ) < 1.0) for (const b of tops) if (pl.x >= b.minX && pl.x <= b.maxX && Math.abs(pl.y - b.top) < 0.3) now = true;
      if (now && !onTop) game.events?.emit('play', { id: 'climb' });
      onTop = now;
    }
  });
}

/** A chute along a curve: pink/yellow tube under a wide trough with raised lips (merged into B). */
export function ribbon(B, curve, color, lip, width = 1.2) {
  const P = curve.getPoints(22);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / len), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    B.add(new THREE.BoxGeometry(width, 0.12, len + 0.12), color, mx, my - 0.1, mz, pitch, yaw, 0);
    for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.12, 0.3, len + 0.12), lip, mx + s * (width / 2 - 0.02) * Math.cos(yaw), my + 0.04, mz - s * (width / 2 - 0.02) * Math.sin(yaw), pitch, yaw, 0);
  }
}
