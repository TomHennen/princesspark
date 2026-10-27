// Splash Cove — the water park wing east of x = 122. Gate arch + changing huts on the swimsuit line,
// wave-pool deck, kiddie splash pad with jets, Sno-Cone Shack, loungers, umbrellas, lifeguard chairs,
// towel stands, beach balls, inflatable flamingos. Static pieces merge into one mesh; the jets are instanced.
import * as THREE from 'three';
import { MeshBuilder, C, makeTextSign } from './builder.js';
import { WING, WAVE_POOL } from './layout.js';

const BLUE = 0x3aa8e0, BLUE2 = 0x7fd0f2, ICE = 0xd9f4ff, SAND = 0xf3e3b5, ORANGE = 0xff9b3d, LIME = 0x7bd94a;

export function buildWaterPark(ctx) {
  const { world, rng } = ctx;
  const B = new MeshBuilder();
  const wp = { ...ctx, B };
  const sign = (text, x, y, z, ry, opts) => { const m = makeTextSign(text, opts); m.position.set(x, y, z); m.rotation.y = ry; world.group.add(m); return m; };
  wp.sign = sign;

  gateAndFence(wp);
  wavePool(wp);
  splashPad(wp);
  snackShack(wp);
  lifeguards(wp);
  seating(wp);
  toys(wp);

  // one merged mesh per park grid cell (the wing straddles two), so the far end is culled instead of drawn and shadow-cast every frame
  for (const mesh of B.buildGrid(world.mat.vc)) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'waterpark'; world.group.add(mesh); }

  // palms + lamp posts for the wing (consumed by props.js palms()/lamps())
  for (const p of [[124, -67], [131, -68.5], [140, -67], [147, -66.5], [125, 21], [128, 41], [124, 61], [131, 79], [142, 81], [140, 55], [146, 23],
    [192, 82.5], [198.5, 76], [186, 83], [196, -66], [197.5, -50], [197.5, -10], [197.5, 30], [197.5, 60], [126, 2], [126, 15]]) ctx.forcedPalms.push(p);
  for (const [x, z] of [[128, 0.8], [145, 0.8], [176, 0.8], [191, 0.8], [128, 15.2], [191, 15.2]]) ctx.lampSpots.push({ x, y: 0, z });
}

// ---------------- swimsuit line: striped fence, gate arch with the SPLASH COVE sign, two changing huts ----------------
function gateAndFence({ world, B, sign }) {
  const X = WING.minX, gz = WING.gateZ, gh = WING.gateHalf;
  const wall = (z0, z1) => {
    const mz = (z0 + z1) / 2, len = z1 - z0;
    B.box(C.pink2, 1.0, 2.2, len, X, 0, mz); B.box(C.white, 1.1, 0.45, len, X, 0.9, mz); B.box(BLUE, 1.3, 0.3, len, X, 2.2, mz);
    for (let z = z0 + 4; z < z1 - 1; z += 9) { B.box(C.white, 1.4, 2.8, 1.4, X, 0, z); B.sphere(BLUE, 0.4, X, 3.0, z); }
    world.addCollider(X, 1.6, mz, 1.4, 3.4, len);
  };
  // changing rooms flank the gate; the fence runs from them to the wing hedges
  const cab = [gz - gh - 3.9, gz + gh + 3.9];
  wall(WING.minZ - 1, cab[0] - 2.6); wall(cab[1] + 2.6, WING.maxZ + 1);
  for (const [i, zc] of cab.entries()) changingRoom({ world, B, sign }, X, zc, i);
  // gate arch: striped pillars, a blue beam, wave crests and a flamingo on each pillar top
  for (const z of [gz - gh - 0.9, gz + gh + 0.9]) {
    for (let k = 0; k < 7; k++) B.box(k % 2 ? C.white : BLUE, 1.6, 1.0, 1.6, X, k, z);
    B.box(C.yellow, 1.9, 0.3, 1.9, X, 7.0, z);
    flamingo(B, X, 7.3, z, z < gz ? 0.6 : Math.PI - 0.6);
    world.addCollider(X, 3.5, z, 1.7, 7, 1.7);
  }
  B.box(BLUE, 1.3, 1.5, gh * 2 + 1.8, X, 6.2, gz);
  world.addBlocker(X + 1.2, 7.2, gz, 4.6, 5.0, gh * 2 + 2.2);   // the camera pulls in instead of clipping through the beam/sign
  B.box(C.yellow, 1.5, 0.22, gh * 2 + 2.2, X, 6.1, gz); B.box(C.yellow, 1.5, 0.22, gh * 2 + 2.2, X, 7.65, gz);
  for (let k = 0; k < 6; k++) { const z = gz - gh + 1 + k * 2; B.sphere(k % 2 ? BLUE2 : ICE, 0.9, X, 7.85, z, 10, 6, 1, 0.65, 1); }
  B.sphere(C.white, 0.3, X, 8.9, gz - 2.2); B.sphere(C.white, 0.22, X, 9.2, gz + 1.6); B.sphere(ICE, 0.2, X, 9.5, gz - 0.3);
  sign('SPLASH COVE', X, 6.95, gz, Math.PI / 2, { w: 10, h: 1.6, doubleSided: true, gap: 0.68, bg: '#3aa8e0', fg: '#ffffff', stroke: '#1b5e20', border: '#ffd600' });
  world.flagDefs.push({ x: X, y: 10.6, z: gz - gh - 0.9, color: BLUE, scale: 0.8 }, { x: X, y: 10.6, z: gz + gh + 0.9, color: C.hotpink, scale: 0.8 });
  B.cyl(C.dark, 0.06, 0.06, 1.6, X, 9.0, gz - gh - 0.9, 5); B.cyl(C.dark, 0.06, 0.06, 1.6, X, 9.0, gz + gh + 0.9, 5);
  // "swimsuits only" notice hangs under the beam; a matching post sign on the approach
  sign('SWIMSUITS ONLY PAST THIS POINT', X, 5.1, gz, Math.PI / 2, { w: 5.2, h: 0.6, doubleSided: true, gap: 0.03, bg: '#ffffff', fg: '#ff6fb5', stroke: '#1b5e20', border: '#3aa8e0' });
  B.cyl(C.dark, 0.03, 0.03, 0.7, X, 5.4, gz - 2.3, 4); B.cyl(C.dark, 0.03, 0.03, 0.7, X, 5.4, gz + 2.3, 4);
  B.cyl(C.white, 0.06, 0.08, 2.6, X - 4.5, 0, gz + 6.3, 6);
  sign('SWIMSUITS ONLY', X - 4.56, 2.3, gz + 6.3, -Math.PI / 2, { w: 2.2, h: 0.7, bg: '#ffffff', fg: '#3aa8e0', stroke: '#1b5e20', border: '#ff6fb5' });
}

// ---------------- changing room: a walk-in hut (hollow, door gap on the west face) with a curtain, bench, hooks,
// mirror and rug. The first hut is the "Changing Room" interactable (ui.openChangingRoom) + world.landmarks.changingRoom.
function changingRoom({ world, B, sign }, X, zc, i) {
  const game = world.game, accent = i ? C.hotpink : BLUE, S = 5, H = 3.0, T = 0.25, DZ = 0.8, DW = 1.4, DH = 2.2;
  const w = (lx, lz) => new THREE.Vector3(X + lx, 0, zc + lz);   // hut-local -> world (no yaw)
  const col = (lx, cy, lz, sx, sy, sz) => world.addCollider(X + lx, cy, zc + lz, sx, sy, sz);
  B.begin(X, 0, zc, 0);
  // floor + shell: three full walls, the west wall split around the door gap (z DZ ± DW/2) with a header above it
  B.box(C.cream, S, 0.08, S, 0, 0, 0); B.box(SAND, S - 2 * T, 0.02, S - 2 * T, 0, 0.08, 0);
  B.box(C.cream, S, H, T, 0, 0, -S / 2 + T / 2); B.box(C.cream, S, H, T, 0, 0, S / 2 - T / 2); B.box(C.cream, T, H, S, S / 2 - T / 2, 0, 0);
  const zA = -S / 2, zB = DZ - DW / 2, zC = DZ + DW / 2, zD = S / 2;
  B.box(C.cream, T, H, zB - zA, -S / 2 + T / 2, 0, (zA + zB) / 2); B.box(C.cream, T, H, zD - zC, -S / 2 + T / 2, 0, (zC + zD) / 2);
  B.box(C.cream, T, H - DH, DW, -S / 2 + T / 2, DH, DZ);
  // striped roof boards, slab, fascia, finial (unchanged look from outside)
  for (let k = 0; k < 6; k++) B.box(k % 2 ? C.white : accent, 5.6, 0.14, 0.95, 0, 3.0 + Math.abs(k - 2.5) * -0.12 + 0.3, -2.4 + k * 0.95, 0, 0);
  B.box(C.white, 5.7, 0.12, 5.8, 0, 3.02, 0);
  for (const k of [-1, 1]) B.box(C.white, 0.14, 0.14, 5.8, k * 2.8, 3.0, 0);
  B.cone(C.yellow, 0.4, 0.5, 0, 3.6, 0, 6); B.sphere(C.hotpink, 0.18, 0, 4.25, 0);
  // door frame + curtain: rod over the gap, a pleated curtain bunched against the +z jamb, a short valance
  B.box(C.white, 0.14, DH + 0.1, 0.12, -S / 2, 0, zB - 0.06); B.box(C.white, 0.14, DH + 0.1, 0.12, -S / 2, 0, zC + 0.06);
  B.add(new THREE.CylinderGeometry(0.03, 0.03, DW + 0.3, 6), C.white, -S / 2 - 0.12, DH + 0.02, DZ, Math.PI / 2, 0, 0);
  for (let k = 0; k < 5; k++) B.box(k % 2 ? C.white : accent, 0.12, DH - 0.1, 0.09, -S / 2 - 0.1 + (k % 2) * 0.06, 0.02, zC - 0.05 - k * 0.075);
  B.box(accent, 0.1, 0.22, DW + 0.2, -S / 2 - 0.1, DH - 0.2, DZ);
  for (let k = 0; k < 6; k++) B.sphere(C.white, 0.05, -S / 2 - 0.16, DH - 0.2, DZ - DW / 2 + 0.1 + k * (DW / 5.4), 4, 3);
  // porthole on the park side (east face)
  B.add(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), C.white, S / 2 + 0.02, 1.7, 0, 0, 0, Math.PI / 2); B.add(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 12), BLUE2, S / 2 + 0.02, 1.7, 0, 0, 0, Math.PI / 2);
  // inside: bench along the east wall, towel on it, hooks + hanging swimsuit/towel on the north wall, mirror on the
  // south wall, a round rug, a basket of flip-flops
  const bx = S / 2 - T - 0.35;
  B.box(C.wood2, 0.6, 0.08, S - 2 * T - 0.4, bx, 0.45, 0); for (const z of [-1.8, 1.8]) B.box(C.wood2, 0.5, 0.45, 0.1, bx, 0.1, z);
  B.box(C.white, 0.5, 0.06, 0.9, bx, 0.53, -1.2); B.box(accent, 0.5, 0.06, 0.9, bx, 0.59, -1.2);
  const hz = -S / 2 + T;
  for (let k = 0; k < 4; k++) { const x = -1.2 + k * 0.8; B.box(C.white, 0.7, 0.1, 0.06, x, 1.75, hz + 0.03); B.sphere(C.yellow, 0.06, x, 1.68, hz + 0.1, 5, 4); }
  B.box(i ? BLUE : C.hotpink, 0.4, 0.55, 0.06, -1.2, 1.1, hz + 0.1); B.box(i ? BLUE : C.hotpink, 0.26, 0.3, 0.06, -1.2, 1.4, hz + 0.1);   // swimsuit on a hook
  B.box(LIME, 0.3, 0.9, 0.06, 0.4, 0.8, hz + 0.1); B.box(C.white, 0.3, 0.1, 0.07, 0.4, 1.3, hz + 0.1);                              // towel
  B.box(ORANGE, 0.34, 0.5, 0.06, 1.2, 1.2, hz + 0.1);                                                                                  // beach bag
  const mz = S / 2 - T;
  B.box(C.yellow, 1.3, 1.9, 0.08, -0.6, 0.5, mz - 0.04); B.box(C.glass, 1.1, 1.7, 0.1, -0.6, 0.6, mz - 0.05); B.box(ICE, 0.12, 1.3, 0.11, -0.95, 0.8, mz - 0.05);
  B.cyl(accent, 1.0, 1.0, 0.03, -0.4, 0.1, -0.2, 18); B.cyl(C.white, 0.7, 0.7, 0.035, -0.4, 0.1, -0.2, 18); B.cyl(accent, 0.35, 0.35, 0.04, -0.4, 0.1, -0.2, 18);
  B.cyl(C.wood2, 0.3, 0.26, 0.3, 1.0, 0.1, 1.6, 10); B.box(C.hotpink, 0.25, 0.05, 0.12, 0.92, 0.4, 1.55); B.box(LIME, 0.25, 0.05, 0.12, 1.08, 0.4, 1.66);
  B.end();
  // colliders: the four walls (door gap left open), the bench; the roof is a camera blocker so the view stays inside
  col(0, H / 2, -S / 2 + T / 2, S + 0.2, H, 0.3); col(0, H / 2, S / 2 - T / 2, S + 0.2, H, 0.3); col(S / 2 - T / 2, H / 2, 0, 0.3, H, S + 0.2);
  col(-S / 2 + T / 2, H / 2, (zA + zB) / 2, 0.3, H, zB - zA); col(-S / 2 + T / 2, H / 2, (zC + zD) / 2, 0.3, H, zD - zC);
  col(bx, 0.3, 0, 0.7, 0.6, S - 2 * T - 0.3);
  world.addBlocker(X, H + 0.25, zc, S + 0.8, 0.5, S + 0.8);
  world.addPlatform(X - S / 2, X + S / 2, zc - S / 2, zc + S / 2, 0.1);
  world.addSeat({ id: `changingBench${i}`, position: w(bx - 0.35, 0.35), facing: -Math.PI / 2, seatHeight: 0.5 });
  sign('CHANGING ROOM', X - S / 2 - 0.06, 2.62, zc - 0.9, -Math.PI / 2, { w: 2.4, h: 0.5, bg: '#ffffff', fg: i ? '#ff6fb5' : '#3aa8e0', stroke: '#1b5e20', border: i ? '#ff6fb5' : '#3aa8e0' });
  // the spot at the curtain, outside; the first hut is the Changing Room interactable + landmark
  const at = w(-S / 2 - 1.1, DZ);
  if (i === 0) world.landmarks.changingRoom = at;
  game?.interactables?.push({
    position: at, radius: 2.2, label: 'Changing Room', sub: 'swimsuits & outfits', kind: 'misc', id: i ? 'changingRoom2' : 'changingRoom',
    enabled: () => game.player?.state === 'walk',
    onInteract: () => {
      if (game.ui?.openChangingRoom) game.ui.openChangingRoom();
      else if (game.ui?.openDressingRoom) game.ui.openDressingRoom();
      else game.ui?.toast?.('The changing room is being stocked!');
    },
  });
}

// ---------------- wave pool: coping, ladders, the wave house at the deep end ----------------
function wavePool({ world, B, sign }) {
  const W = WAVE_POOL;
  // white coping + a blue tile stripe just outside the water
  const hx = W.hx + 0.6, hz = W.hz + 0.6;
  B.box(C.white, hx * 2, 0.1, 0.5, W.x, 0, W.z - hz); B.box(C.white, hx * 2, 0.1, 0.5, W.x, 0, W.z + hz);
  B.box(C.white, 0.5, 0.1, hz * 2, W.x - hx, 0, W.z); B.box(C.white, 0.5, 0.1, hz * 2, W.x + hx, 0, W.z);
  for (const [x, z] of [[W.x + hx, W.z - 6], [W.x + hx, W.z + 8]]) {
    B.beam(0xd0d6dc, x - 0.3, -0.5, z - 0.3, x + 0.8, 1.0, z - 0.3, 0.05); B.beam(0xd0d6dc, x - 0.3, -0.5, z + 0.3, x + 0.8, 1.0, z + 0.3, 0.05);
    for (let k = 0; k < 4; k++) B.box(0xd0d6dc, 0.08, 0.08, 0.7, x - 0.3 + k * 0.3, -0.4 + k * 0.4, z);
    world.addCollider(x + 0.25, 0.4, z, 1.2, 1.4, 0.8);
  }
  // pool decks where running gets a lifeguard's whistle (NPC module reads these)
  world.poolZones.push(new THREE.Box3(new THREE.Vector3(W.x - hx - 3.6, -1.5, W.z - hz - 3.6), new THREE.Vector3(W.x + hx + 3.6, 4, W.z + hz + 3.6)));
  // depth markers
  for (const z of [W.z + hz + 0.6, W.z - hz - 0.6]) B.box(C.yellow, 1.4, 0.06, 0.5, W.x - hx + 1.6, 0.04, z);
  // wave house: striped machine room at the deep (north) end
  const hz2 = W.z - hz - 2.1;
  B.box(BLUE, 22, 3.4, 3, W.x, 0, hz2);
  for (let k = 0; k < 11; k++) if (k % 2) B.box(C.white, 2, 3.4, 0.08, W.x - 11 + k * 2 + 1, 0, hz2 + 1.5);
  B.box(C.yellow, 22.6, 0.3, 3.6, W.x, 3.4, hz2); B.box(C.white, 22.6, 0.2, 3.6, W.x, 3.7, hz2);
  for (const x of [W.x - 7, W.x, W.x + 7]) { B.add(new THREE.CylinderGeometry(0.75, 0.75, 0.14, 14), C.white, x, 1.9, hz2 + 1.5, Math.PI / 2, 0, 0); B.add(new THREE.CylinderGeometry(0.58, 0.58, 0.22, 14), 0x1d6fa8, x, 1.9, hz2 + 1.5, Math.PI / 2, 0, 0); }
  B.box(C.dark, 2.2, 0.6, 1.2, W.x - 9, 3.9, hz2); B.box(C.dark, 2.2, 0.6, 1.2, W.x + 9, 3.9, hz2);
  B.cyl(C.white, 0.5, 0.6, 1.4, W.x - 9, 4.5, hz2, 8); B.cyl(C.white, 0.5, 0.6, 1.4, W.x + 9, 4.5, hz2, 8);
  world.addCollider(W.x, 1.7, hz2, 22.2, 3.6, 3.2);
  sign('WAVE POOL', W.x, 2.95, hz2 + 1.57, 0, { w: 6, h: 1.0, bg: '#ffffff', fg: '#3aa8e0', stroke: '#1b5e20', border: '#ffd600' });
  sign('SURF\'S UP!', W.x, 1.0, hz2 + 1.57, 0, { w: 3.2, h: 0.6, bg: '#ffd600', fg: '#1b5e20', stroke: '#ffffff', border: '#3aa8e0' });
  // sunbathing lawn edge: low white picket between the deck and the slide plot east of the pool
  const px = W.x + W.hx + 3.6;
  B.box(C.white, 0.12, 0.08, W.hz * 2 + 6, px, 0.7, W.z);
  for (let z = W.z - W.hz - 3; z <= W.z + W.hz + 3; z += 1.6) B.box(C.white, 0.14, 0.95, 0.14, px, 0, z);
  world.addCollider(px, 0.6, W.z, 0.3, 1.2, W.hz * 2 + 6);
}

// ---------------- kiddie splash pad: mushroom fountain + ring of jets (instanced droplets) ----------------
function splashPad({ world, B }) {
  const X = 138, Z = -8, R = 3.6;
  world.poolZones.push(new THREE.Box3(new THREE.Vector3(X - 6.5, -1, Z - 6.5), new THREE.Vector3(X + 6.5, 4, Z + 6.5)));
  world.poolZones.push(new THREE.Box3(new THREE.Vector3(130, -1, 16), new THREE.Vector3(192, 4, 77)));   // lazy river banks (ride plot minus the promenade)
  world.addCollider(X, 1.0, Z, 0.5, 2.0, 0.5);   // mushroom stem
  B.cyl(0x1d6fa8, 0.14, 0.18, 2.0, X, 0, Z, 8);
  B.cyl(C.hotpink, 1.3, 1.2, 0.18, X, 2.0, Z, 16); B.cone(C.hotpink, 1.1, 0.5, X, 2.18, Z, 16); B.sphere(C.yellow, 0.14, X, 2.75, Z);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.sphere(C.white, 0.08, X + Math.cos(a) * 1.25, 2.08, Z + Math.sin(a) * 1.25, 5, 4); }
  // water curtain under the mushroom cap
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.22, 1.95, 16, 1, true), world.mat.water);
  curtain.position.set(X, 1.0, Z); curtain.userData.noOcclude = true; world.group.add(curtain);
  const nozzles = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const x = X + Math.cos(a) * R, z = Z + Math.sin(a) * R; nozzles.push([x, z, a]); B.cyl(k % 2 ? C.yellow : LIME, 0.22, 0.26, 0.18, x, 0.09, z, 8); }
  // dancing dolphin / frog squirters on the pad rim
  for (const [k, [x, z]] of [[0, [X - 4.6, Z + 3.4]], [1, [X + 4.6, Z + 3.4]]]) {
    B.begin(x, 0.1, z, k ? -0.8 : 0.8);
    B.sphere(LIME, 0.45, 0, 0.45, 0, 8, 6, 1.1, 0.8, 1.1); B.sphere(LIME, 0.3, 0, 0.9, 0.2); B.sphere(C.white, 0.09, 0.12, 1.05, 0.42, 5, 4); B.sphere(C.white, 0.09, -0.12, 1.05, 0.42, 5, 4);
    B.sphere(C.black, 0.045, 0.12, 1.06, 0.5, 4, 3); B.sphere(C.black, 0.045, -0.12, 1.06, 0.5, 4, 3);
    B.end();
  }
  const N = nozzles.length * 6, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshStandardMaterial({ color: 0xcdf3ff, roughness: 0.3 }), N);
  const centre = new THREE.Vector3(X, 1.2, Z);
  drops.boundingSphere = new THREE.Sphere(centre, R + 3);   // the jets stay over the pad: a fixed sphere culls them properly
  drops.name = 'splashJets'; world.group.add(drops);
  const m = new THREE.Matrix4(), g = 9.8, vy = 4.4, T = (2 * vy) / g, out = 0.5;
  world.animated.push((dt, t) => {
    if (world.game?.player?.position.distanceTo(centre) > 80) return;   // too far to see the jets move: skip the upload
    for (let j = 0; j < nozzles.length; j++) {
      const [nx, nz, a] = nozzles[j], on = 0.5 + 0.5 * Math.sin(t * 0.9 + j * 0.8) > 0.25; // jets pulse in a slow chase
      for (let k = 0; k < 6; k++) {
        const i = j * 6 + k, tt = (t * 1.0 + (k / 6) * T + j * 0.11) % T;
        if (!on) { m.makeScale(0, 0, 0); drops.setMatrixAt(i, m); continue; }
        m.makeTranslation(nx + Math.cos(a) * out * tt, 0.2 + vy * tt - 0.5 * g * tt * tt, nz + Math.sin(a) * out * tt);
        drops.setMatrixAt(i, m);
      }
    }
    drops.instanceMatrix.needsUpdate = true;
  });
}

// ---------------- Sno-Cone Shack (faces north onto the promenade) ----------------
function snackShack({ world, B, sign }) {
  const X = 134, Z = 31;
  B.begin(X, 0, Z, Math.PI);
  B.box(ICE, 5, 3.0, 2.6, 0, 0, -0.5); B.box(BLUE, 5, 1.1, 1.0, 0, 0, 1.3); B.box(C.white, 5.2, 0.12, 1.2, 0, 1.1, 1.3);
  for (let i = 0; i < 6; i++) B.box(i % 2 ? C.white : BLUE, 0.86, 0.16, 4.8, -2.15 + i * 0.86, 3.1, 0.3, 0, 0.1);
  B.cyl(C.white, 0.08, 0.08, 3.1, -2.3, 0, 1.9, 6); B.cyl(C.white, 0.08, 0.08, 3.1, 2.3, 0, 1.9, 6);
  // giant sno-cone on the roof
  B.add(new THREE.ConeGeometry(0.75, 1.9, 10), C.paver, 0, 4.2, -0.4, Math.PI, 0, 0);
  B.sphere(C.hotpink, 0.8, 0, 5.35, -0.4); B.sphere(BLUE2, 0.62, -0.25, 6.25, -0.3); B.sphere(C.yellow, 0.5, 0.3, 6.85, -0.45); B.sphere(0xe53935, 0.14, 0.3, 7.35, -0.45);
  // counter clutter: syrup bottles + a cup stack
  for (const [k, c] of [[0, 0xe53935], [1, BLUE], [2, LIME], [3, C.yellow]]) { B.cyl(c, 0.1, 0.1, 0.4, -1.6 + k * 0.4, 1.16, 1.3, 6); B.cyl(C.white, 0.04, 0.04, 0.16, -1.6 + k * 0.4, 1.56, 1.3, 5); }
  B.cyl(C.white, 0.26, 0.2, 0.5, 1.4, 1.16, 1.2, 8); B.sphere(C.hotpink, 0.27, 1.4, 1.78, 1.2);
  B.end();
  world.addCollider(X, 1.6, Z, 5.4, 3.3, 3.8);
  sign('SNO-CONE SHACK', X, 3.75, Z - 2.5, Math.PI, { w: 4.6, h: 1.0, bg: '#ffffff', fg: '#3aa8e0', stroke: '#1b5e20', border: '#ff6fb5' });
  // picnic umbrellas with tables beside the shack
  for (const [x, z] of [[128.5, 36], [139.5, 36]]) {
    B.cyl(C.white, 0.5, 0.5, 0.08, x, 0.75, z, 12); B.cyl(0x90a4ae, 0.05, 0.05, 2.6, x, 0, z, 6);
    B.cone(BLUE, 1.6, 0.7, x, 2.3, z, 8); B.cone(C.white, 1.7, 0.3, x, 2.26, z, 8);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; B.cyl(C.white, 0.22, 0.2, 0.42, x + Math.cos(a) * 0.95, 0, z + Math.sin(a) * 0.95, 8); }
    world.addCollider(x, 0.6, z, 1.2, 1.2, 1.2);
  }
}

// ---------------- lifeguard chairs ----------------
function lifeguards({ world, B, sign }) {
  const chair = (x, z, ry, label) => {
    B.begin(x, 0, z, ry);
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) B.beam(C.white, lx, 0, lz, lx * 0.8, 3.0, lz * 0.8, 0.07);
    B.beam(C.white, -0.7, 1.4, -0.7, 0.7, 1.4, -0.7, 0.05); B.beam(C.white, -0.7, 1.4, 0.7, 0.7, 1.4, 0.7, 0.05);
    B.box(C.white, 1.5, 0.14, 1.5, 0, 3.0, 0); B.box(C.white, 1.5, 0.9, 0.1, 0, 3.14, -0.7); B.box(C.white, 0.1, 0.5, 1.4, -0.7, 3.14, 0); B.box(C.white, 0.1, 0.5, 1.4, 0.7, 3.14, 0);
    B.box(0xe53935, 1.3, 0.5, 0.08, 0, 3.3, -0.64); B.box(C.white, 1.3, 0.08, 0.08, 0, 3.52, -0.65);
    // ladder down the front, parasol on top, rescue float on the side
    B.beam(C.white, -0.35, 0, 0.9, -0.35, 3.0, 0.65, 0.04); B.beam(C.white, 0.35, 0, 0.9, 0.35, 3.0, 0.65, 0.04);
    for (let k = 1; k <= 5; k++) B.box(C.white, 0.7, 0.05, 0.05, 0, k * 0.5, 0.9 - (k * 0.5 / 3.0) * 0.25);
    B.cyl(C.white, 0.04, 0.04, 2.4, 0.5, 3.1, -0.4, 5); B.cone(0xe53935, 1.3, 0.55, 0.5, 5.2, -0.4, 10); B.cone(C.white, 1.36, 0.22, 0.5, 5.17, -0.4, 10);
    B.add(new THREE.TorusGeometry(0.38, 0.11, 6, 12), 0xe53935, -0.85, 2.4, 0, 0, Math.PI / 2, 0);
    B.end();
    world.addCollider(x, 1.6, z, 1.6, 3.2, 1.6);
    // the lifeguard's perch: on the chair deck, looking the way the chair faces (local +z)
    world.lifeguardSpots.push({ position: new THREE.Vector3(x, 3.14, z), facing: ry, chair: true });
    if (label) sign('LIFEGUARD', x - Math.sin(ry) * 0.72, 3.3, z - Math.cos(ry) * 0.72, ry + Math.PI, { w: 1.3, h: 0.36, bg: '#e53935', fg: '#ffffff', stroke: '#8e0000', border: '#ffffff' });
  };
  chair(WAVE_POOL.x + WAVE_POOL.hx + 2.3, WAVE_POOL.z - 2, -Math.PI / 2, true);   // faces west over the wave pool
  chair(146.5, 44, Math.PI / 2, false);                                            // watches the lazy river from the lawn
  world.lifeguardSpots.push({ position: new THREE.Vector3(144.6, 0, -8), facing: -Math.PI / 2, chair: false });   // standing at the splash pad rim
}

// ---------------- loungers, umbrellas, towel stands ----------------
function seating({ world, B }) {
  const W = WAVE_POOL;
  let n = 0;
  const lounger = (x, z, ry, color) => {
    B.begin(x, 0, z, ry);
    B.box(color, 0.75, 0.12, 1.8, 0, 0.3, 0); B.box(color, 0.75, 0.7, 0.1, 0, 0.3, -0.85, 0, -0.55);
    B.box(C.white, 0.8, 0.05, 1.9, 0, 0.26, 0);
    for (const [dx, dz] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) B.box(C.white, 0.08, 0.3, 0.08, dx, 0, dz);
    B.end();
    world.addSeat({ id: `lounger${n++}`, position: new THREE.Vector3(x + Math.sin(ry) * 0.3, 0, z + Math.cos(ry) * 0.3), facing: ry, seatHeight: 0.42, anim: 'sit' }, { label: 'Lie down', sub: 'sun lounger' });
  };
  const umbrella = (x, z, top, rim) => {
    B.cyl(C.white, 0.05, 0.05, 2.6, x, 0, z, 6); B.cone(top, 1.7, 0.75, x, 2.3, z, 8); B.cone(rim, 1.8, 0.3, x, 2.26, z, 8); B.sphere(C.yellow, 0.1, x, 3.1, z);
    world.addCollider(x, 1.2, z, 0.3, 2.4, 0.3);
  };
  const cols = [C.hotpink, BLUE, C.yellow, LIME, ORANGE];
  // south (shallow) end: a row facing the water, umbrellas between pairs
  const zs = W.z + W.hz + 2.4;
  for (let k = 0; k < 6; k++) { const x = W.x - 7.5 + k * 3; lounger(x, zs, Math.PI, cols[k % 5]); }
  umbrella(W.x - 6, zs + 0.4, C.hotpink, C.white); umbrella(W.x, zs + 0.4, BLUE, C.white); umbrella(W.x + 6, zs + 0.4, C.yellow, C.white);
  // west side, facing east
  const xw = W.x - W.hx - 2.4;
  for (let k = 0; k < 5; k++) lounger(xw, W.z - 10 + k * 5, -Math.PI / 2, cols[(k + 2) % 5]);
  umbrella(xw - 0.4, W.z - 7.5, C.hotpink, C.yellow); umbrella(xw - 0.4, W.z + 2.5, BLUE, C.yellow);
  // towel stands at the deck corners
  for (const [x, z] of [[W.x - W.hx - 2.6, W.z + W.hz + 2.6], [W.x + W.hx + 2.4, W.z + W.hz + 2.6]]) {
    B.box(C.white, 1.8, 0.1, 0.6, x, 0, z); B.cyl(C.white, 0.05, 0.05, 1.7, x - 0.8, 0.1, z, 6); B.cyl(C.white, 0.05, 0.05, 1.7, x + 0.8, 0.1, z, 6); B.box(C.white, 1.8, 0.06, 0.06, x, 1.74, z);
    for (let k = 0; k < 4; k++) B.box(cols[(k + 1) % 5], 0.32, 0.9, 0.08, x - 0.6 + k * 0.4, 0.84, z - 0.05 + (k % 2) * 0.1);
    B.box(C.white, 0.6, 0.3, 0.5, x, 0.1, z + 0.02); B.box(cols[0], 0.5, 0.12, 0.42, x, 0.4, z + 0.02); B.box(cols[1], 0.5, 0.12, 0.42, x, 0.52, z + 0.02);
    world.addCollider(x, 0.9, z, 2.0, 1.8, 0.8);
  }
  // a few loungers on the lawn by the river-side lifeguard
  for (let k = 0; k < 3; k++) lounger(143 + k * 2.2, 51, Math.PI, cols[(k + 3) % 5]);
  umbrella(144.1, 51.4, LIME, C.white);
}

// ---------------- beach balls + inflatable flamingos ----------------
function toys({ B, rng }) {
  const ball = (x, y, z, a, b) => {
    B.sphere(a, 0.45, x, y, z, 10, 8);
    B.add(new THREE.TorusGeometry(0.42, 0.09, 6, 14), b, x, y, z, Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(0, 3), 0);
    B.add(new THREE.TorusGeometry(0.42, 0.09, 6, 14), C.white, x, y, z, rng.range(-0.3, 0.3), rng.range(0, 3), 0);
  };
  ball(129, 0.45, -13, C.hotpink, C.yellow); ball(146, 0.45, 19, BLUE, C.hotpink); ball(194.5, 0.45, 4, C.yellow, BLUE); ball(125.5, 0.45, 73, LIME, C.hotpink);
  ball(WAVE_POOL.x + 5, -0.1, WAVE_POOL.z + 12, ORANGE, C.white);
  const flamingoFloat = (x, y, z, ry) => {
    B.begin(x, y, z, ry);
    B.add(new THREE.TorusGeometry(0.9, 0.3, 8, 16), C.flamingo, 0, 0, 0, Math.PI / 2);
    B.beam(C.flamingo, 0.7, 0.15, 0, 1.0, 1.45, 0, 0.16); B.sphere(C.flamingo, 0.28, 1.02, 1.55, 0);
    B.add(new THREE.ConeGeometry(0.12, 0.5, 6), C.black, 1.3, 1.45, 0, 0, 0, -Math.PI / 2 - 0.5);
    B.sphere(C.black, 0.05, 1.08, 1.65, 0.2, 4, 3); B.sphere(C.black, 0.05, 1.08, 1.65, -0.2, 4, 3);
    B.sphere(C.flamingo2, 0.3, -0.75, 0.3, 0, 6, 4, 1.4, 0.7, 0.9);
    B.end();
  };
  flamingoFloat(WAVE_POOL.x - 5, -0.12, WAVE_POOL.z - 6, 0.6); flamingoFloat(WAVE_POOL.x + 4, -0.12, WAVE_POOL.z - 11, 2.4); flamingoFloat(144, 0.18, 70, -1.2);
}

/** Decorative flamingo statue (merged), feet at (x,y,z). */
export function flamingo(B, x, y, z, ry) {
  B.begin(x, y, z, ry);
  B.cyl(C.flamingo2, 0.045, 0.045, 1.05, 0.12, 0, -0.08, 5); B.cyl(C.flamingo2, 0.045, 0.045, 1.05, -0.12, 0, 0.08, 5);
  B.sphere(C.flamingo, 0.5, 0, 1.3, 0, 8, 6, 1.25, 0.85, 0.85);
  B.sphere(C.flamingo2, 0.36, -0.05, 1.42, 0, 6, 4, 1.1, 0.55, 0.95);
  B.beam(C.flamingo, 0.5, 1.5, 0, 0.95, 2.45, 0, 0.1); B.sphere(C.flamingo, 0.21, 0.98, 2.5, 0);
  B.add(new THREE.ConeGeometry(0.09, 0.42, 6), C.black, 1.22, 2.4, 0, 0, 0, -Math.PI / 2 - 0.55);
  B.sphere(C.black, 0.045, 1.05, 2.58, 0.17, 5, 4); B.sphere(C.black, 0.045, 1.05, 2.58, -0.17, 5, 4);
  B.end();
}
