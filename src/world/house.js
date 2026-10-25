// The players' cottage just outside the south gate: cream/pink walls, green gable roof, an open doorway facing
// east (the sunlit side), a bed (sleep → quests.trySleep) and a wardrobe (→ ui.openDressingRoom), windows, a
// garden path from the park gate and a picket fence. One merged mesh; the interior is enclosed by wall colliders
// with a gap at the door and the floor is a platform. Built in a local frame (front = local -z) and yawed to face +x.
import * as THREE from 'three';
import { MeshBuilder, C, makeTextSign } from './builder.js';
import { HOUSE } from './layout.js';

/** Indexed triangular prism (gable end): base w on y=0, apex at y=h, extruded d along z, centred on z. */
function prism(w, h, d) {
  const g = new THREE.BufferGeometry(), hw = w / 2, hd = d / 2;
  const pos = [-hw, 0, hd, hw, 0, hd, 0, h, hd, -hw, 0, -hd, hw, 0, -hd, 0, h, -hd];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1], 2));
  g.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
  g.computeVertexNormals();
  return g;
}

const ROSE = 0xf9b7cf, CREAM = 0xfff3dc, ROOF = 0x2e7d32, ROOF2 = 0x256b29, TRIM = 0xffffff, FLOOR = 0xd9a06b;

export function buildHouse(world) {
  const B = new MeshBuilder(), game = world.game;
  const X = 16, Z = 123, W = 8, D = 7, H = 3.2, T = 0.3, RY = -Math.PI / 2;   // local -z (the door) faces world +x
  // local → world: wx = X - lz, wz = Z + lx (yaw -90°)
  const wp = (lx, y, lz) => new THREE.Vector3(X - lz, y, Z + lx);
  const col = (lx, cy, lz, w, h, d) => world.addCollider(X - lz, cy, Z + lx, d, h, w);
  const plat = (lx0, lx1, lz0, lz1, top) => world.addPlatform(X - lz1, X - lz0, Z + lx0, Z + lx1, top);
  const blocker = (lx, cy, lz, w, h, d) => world.addBlocker(X - lz, cy, Z + lx, d, h, w);
  const sign = (text, lx, y, lz, lry, opts) => { const m = makeTextSign(text, opts); m.position.copy(wp(lx, y, lz)); m.rotation.y = lry + RY; world.group.add(m); return m; };
  const zN = -D / 2, zS = D / 2, xW = -W / 2, xE = W / 2, doorW = 1.5, doorH = 2.3;

  B.begin(X, 0, Z, RY);
  // --- shell: slab + plank floor, walls (door gap in the front wall), gables, roof ---
  B.box(C.stone, W + 0.8, 0.12, D + 0.8, 0, 0, 0);
  B.box(FLOOR, W - 0.2, 0.15, D - 0.2, 0, 0.02, 0);
  for (let i = 0; i < 6; i++) B.box(i % 2 ? 0xcf9460 : 0xe0aa74, 1.2, 0.01, D - 0.4, xW + 0.7 + i * 1.25, 0.17, 0);
  const segW = (W - doorW) / 2, segL = (xW + (-doorW / 2)) / 2, segR = ((doorW / 2) + xE) / 2;
  B.box(CREAM, segW, H, T, segL, 0, zN); B.box(CREAM, segW, H, T, segR, 0, zN); B.box(CREAM, doorW + 0.2, H - doorH, T, 0, doorH, zN);
  B.box(CREAM, W, H, T, 0, 0, zS); B.box(CREAM, T, H, D, xW, 0, 0); B.box(CREAM, T, H, D, xE, 0, 0);
  // rose wainscot band + white rail all round
  B.box(ROSE, W + 0.1, 0.9, T + 0.1, 0, 0, zS); B.box(ROSE, T + 0.1, 0.9, D + 0.1, xW, 0, 0); B.box(ROSE, T + 0.1, 0.9, D + 0.1, xE, 0, 0);
  B.box(ROSE, segW + 0.05, 0.9, T + 0.1, segL, 0, zN); B.box(ROSE, segW + 0.05, 0.9, T + 0.1, segR, 0, zN);
  B.box(TRIM, W + 0.2, 0.16, T + 0.14, 0, 0.9, zS); B.box(TRIM, T + 0.14, 0.16, D + 0.2, xW, 0.9, 0); B.box(TRIM, T + 0.14, 0.16, D + 0.2, xE, 0.9, 0);
  B.box(TRIM, segW + 0.1, 0.16, T + 0.14, segL, 0.9, zN); B.box(TRIM, segW + 0.1, 0.16, T + 0.14, segR, 0.9, zN);
  // door frame (open doorway — nothing blocks it), step, mat and a heart over the door
  B.box(C.hotpink, 0.18, doorH + 0.1, T + 0.16, -doorW / 2 - 0.05, 0, zN); B.box(C.hotpink, 0.18, doorH + 0.1, T + 0.16, doorW / 2 + 0.05, 0, zN);
  B.box(C.hotpink, doorW + 0.4, 0.18, T + 0.16, 0, doorH, zN);
  B.box(C.stone, doorW + 0.6, 0.15, 0.9, 0, 0, zN - 0.55); B.box(0xc45c6b, 1.0, 0.03, 0.6, 0, 0.15, zN - 0.5);
  B.sphere(C.hotpink, 0.16, -0.12, doorH + 0.5, zN - 0.1, 6, 5); B.sphere(C.hotpink, 0.16, 0.12, doorH + 0.5, zN - 0.1, 6, 5); B.add(new THREE.ConeGeometry(0.2, 0.3, 4), C.hotpink, 0, doorH + 0.33, zN - 0.1, Math.PI, Math.PI / 4, 0);
  // gables (triangular prisms) + the two roof slabs; ridge runs along local x
  const rise = 2.3, over = 0.5;
  for (const z of [zN, zS]) B.add(prism(W + 0.2, rise, T), ROSE, 0, H, z);
  const slope = Math.atan2(rise, D / 2 + over), slab = Math.hypot(rise, D / 2 + over) + 0.3;
  for (const s of [-1, 1]) {
    // rx = +slope on the +z slab: local +z (away from the ridge) must run downhill
    B.add(new THREE.BoxGeometry(W + 1.2, 0.22, slab), ROOF, 0, H + rise / 2 + 0.12, s * (D / 4 + over / 2), s * slope, 0, 0);
    for (let i = 0; i < 3; i++) { const f = (i - 1) * 1.1; B.add(new THREE.BoxGeometry(W + 1.3, 0.06, 0.14), ROOF2, 0, H + rise / 2 + 0.26 - f * Math.sin(slope), s * (D / 4 + over / 2 + f * Math.cos(slope)), s * slope, 0, 0); }
  }
  B.box(C.yellow, W + 1.4, 0.2, 0.3, 0, H + rise + 0.1, 0);
  B.box(C.stone, 0.8, 1.5, 0.8, 2.6, H + rise - 0.9, 1.2); B.box(C.dark, 0.9, 0.15, 0.9, 2.6, H + rise + 0.6, 1.2);   // chimney
  // windows (frame + glass + flower box): both side walls and the back wall, plus one beside the door
  const windowAt = (x, z, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
    const bx = (color, w, h, d, lx, ly, lz) => { const [px, py, pz] = at(lx, ly, lz); B.box(color, w, h, d, px, py, pz, ry); };
    bx(TRIM, 1.5, 1.3, 0.14, 0, 1.2, 0); bx(C.glass, 1.2, 1.0, 0.16, 0, 1.35, 0); bx(TRIM, 0.08, 1.0, 0.18, 0, 1.35, 0); bx(TRIM, 1.2, 0.08, 0.18, 0, 1.82, 0);
    bx(C.wood2, 1.5, 0.3, 0.4, 0, 0.95, 0.24);
    for (let k = 0; k < 4; k++) { const [px, py, pz] = at(-0.5 + k * 0.33, 1.32, 0.25); B.sphere(k % 2 ? C.hotpink : C.yellow, 0.14, px, py, pz, 6, 4); B.sphere(C.leaf, 0.12, px, py - 0.1, pz + 0.05, 5, 4); }
  };
  windowAt(xW - 0.08, -0.8, -Math.PI / 2); windowAt(xE + 0.08, 1.5, Math.PI / 2); windowAt(-2.0, zS + 0.08, 0); windowAt(2.3, zN - 0.08, Math.PI);

  // --- furniture (local coords) ---
  const bx = xE - 1.1, bz = zS - 1.4;                       // bed in the back-right corner, headboard on the side wall
  B.box(C.wood2, 1.6, 0.4, 2.2, bx, 0.15, bz); B.box(C.white, 1.5, 0.25, 2.1, bx, 0.55, bz);
  B.box(0xf48fb1, 1.52, 0.18, 1.3, bx, 0.8, bz + 0.35); B.box(C.white, 1.0, 0.2, 0.5, bx, 0.8, bz - 0.7);
  B.box(C.wood2, 1.7, 1.1, 0.12, bx, 0.15, bz - 1.1); for (const s of [-1, 1]) B.sphere(C.yellow, 0.1, bx + s * 0.8, 1.3, bz - 1.1, 6, 4);
  col(bx, 0.6, bz, 1.7, 1.2, 2.3);
  const wx = xE - 0.5, wz = -1.6;                           // wardrobe against the right wall, nearer the door
  B.box(0xffe1ec, 0.8, 2.2, 1.5, wx, 0.15, wz); B.box(C.hotpink, 0.06, 1.9, 0.6, wx - 0.42, 0.3, wz - 0.37); B.box(C.hotpink, 0.06, 1.9, 0.6, wx - 0.42, 0.3, wz + 0.37);
  B.sphere(C.yellow, 0.06, wx - 0.46, 1.25, wz - 0.12, 5, 4); B.sphere(C.yellow, 0.06, wx - 0.46, 1.25, wz + 0.12, 5, 4); B.box(C.hotpink, 0.9, 0.12, 1.6, wx, 2.35, wz);
  col(wx, 1.2, wz, 0.9, 2.4, 1.6);
  B.cyl(0xff9fc2, 1.3, 1.3, 0.03, -0.6, 0.15, 0.2, 20); B.cyl(C.white, 0.9, 0.9, 0.035, -0.6, 0.15, 0.2, 20);   // rug
  B.cyl(C.wood2, 0.5, 0.5, 0.06, xW + 1.0, 0.75, zN + 1.2, 12); B.cyl(C.wood2, 0.07, 0.09, 0.6, xW + 1.0, 0.15, zN + 1.2, 6);   // table + lamp
  B.cyl(C.yellow, 0.18, 0.1, 0.25, xW + 1.0, 0.95, zN + 1.2, 8); B.cyl(C.dark, 0.02, 0.02, 0.15, xW + 1.0, 0.8, zN + 1.2, 4);
  col(xW + 1.0, 0.5, zN + 1.2, 0.9, 1.0, 0.9);
  B.box(C.wood2, 0.3, 1.8, 1.0, xW + 0.35, 0.15, 1.6); for (let i = 0; i < 3; i++) B.box([C.hotpink, C.yellow, 0x5bb0ff][i], 0.26, 0.04, 0.9, xW + 0.35, 0.5 + i * 0.5, 1.6);   // shelves
  for (let i = 0; i < 6; i++) B.box([0xe53935, 0x5bb0ff, C.yellow, C.green2, C.hotpink, C.white][i], 0.05, 0.28, 0.12, xW + 0.36, 0.54 + Math.floor(i / 3) * 0.5, 1.3 + (i % 3) * 0.22);   // books
  col(xW + 0.35, 1.0, 1.6, 0.4, 2.0, 1.1);
  B.end();

  // --- walkable floor + enclosing colliders (gap at the door) + camera blockers for the roof/ceiling ---
  plat(xW, xE, zN, zS, 0.17);
  plat(-1.1, 1.1, zN - 1.0, zN, 0.15);
  col(segL, H / 2, zN, segW + 0.1, H, 0.5); col(segR, H / 2, zN, segW + 0.1, H, 0.5);
  col(0, H / 2, zS, W + 0.2, H, 0.5); col(xW, H / 2, 0, 0.5, H, D + 0.2); col(xE, H / 2, 0, 0.5, H, D + 0.2);
  blocker(0, H + rise / 2, 0, W + 1.4, rise + 0.3, D + 1.2);
  blocker(0, H - 0.1, 0, W - 0.4, 0.2, D - 0.4);

  // --- garden (world coords): picket fence with a gate on the east, paver path from the park gate, mailbox, flowers ---
  const G = HOUSE, gxW = G.x - G.w / 2 + 1.5, gxE = X + D / 2 + 4.5, gzN = G.z - G.d / 2 + 2, gzS = G.z + G.d / 2 - 1;
  const picket = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    B.box(TRIM, 0.1, 0.08, len, mx, 0.45, mz, ry); B.box(TRIM, 0.1, 0.08, len, mx, 0.8, mz, ry);
    const n = Math.max(1, Math.round(len / 0.6));
    for (let i = 0; i <= n; i++) { const f = -len / 2 + (len / n) * i; B.box(TRIM, 0.1, 1.0, 0.12, mx + Math.sin(ry) * f, 0, mz + Math.cos(ry) * f, ry); }
    world.addCollider(mx, 0.5, mz, Math.max(Math.abs(dx), 0.4), 1.0, Math.max(Math.abs(dz), 0.4));
  };
  picket(gxW, gzN, gxE, gzN); picket(gxW, gzS, gxE, gzS); picket(gxW, gzN, gxW, gzS);
  picket(gxE, gzN, gxE, Z - 1.4); picket(gxE, Z + 1.4, gxE, gzS);
  for (const [x, z] of [[gxW, gzN], [gxE, gzN], [gxW, gzS], [gxE, gzS], [gxE, Z - 1.4], [gxE, Z + 1.4]]) { B.box(C.pink2, 0.3, 1.2, 0.3, x, 0, z); B.sphere(C.yellow, 0.16, x, 1.3, z, 6, 4); }
  const paver = (x0, z0, x1, z1, w) => { const dx = x1 - x0, dz = z1 - z0; B.box(0xf0bf9a, w, 0.05, Math.hypot(dx, dz) + w * 0.9, (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(dx, dz)); };
  const px = gxE + 2.5;
  paver(0, 104, 0, 112.5, 4); paver(0, 112.5, px, 112.5, 3.5); paver(px, 112.5, px, Z, 3.5); paver(px, Z, X + D / 2 + 0.8, Z, 2.4);
  B.cyl(C.wood2, 0.06, 0.07, 1.1, gxE + 0.7, 0, Z - 2.2, 6); B.box(0x5bb0ff, 0.5, 0.35, 0.3, gxE + 0.7, 1.1, Z - 2.2); B.box(C.yellow, 0.06, 0.2, 0.05, gxE + 0.95, 1.45, Z - 2.2);
  for (let i = 0; i < 14; i++) { const x = gxW + 1.2 + (i * 1.37) % (gxE - gxW - 2.4), z = i < 7 ? gzS - 0.8 : gzN + 0.8; B.sphere(C.leaf, 0.35, x, 0.25, z, 6, 4); B.sphere([C.hotpink, C.yellow, 0xb455ff][i % 3], 0.1, x, 0.55, z, 5, 4); }
  for (const [x, z] of [[gxW + 1.6, Z - 1], [gxW + 1.6, Z + 4]]) { B.cyl(C.trunk, 0.12, 0.16, 1.4, x, 0, z, 6); B.sphere(C.leaf2, 0.9, x, 1.9, z, 7, 5); B.sphere(C.leaf, 0.6, x + 0.3, 2.4, z - 0.2, 6, 4); for (let k = 0; k < 5; k++) B.sphere(0xff3d6e, 0.09, x + Math.cos(k * 1.3) * 0.7, 1.8 + Math.sin(k * 2.1) * 0.5, z + Math.sin(k * 1.3) * 0.7, 4, 3); world.addCollider(x, 1, z, 0.4, 2, 0.4); }

  const mesh = B.build(world.mat.vc);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'house';
  world.group.add(mesh);
  sign('HOME SWEET HOME', 0, H + 0.6, zN - 0.22, Math.PI, { w: 2.6, h: 0.5, bg: '#fff3dc', fg: '#ff6fb5', stroke: '#1b5e20', border: '#2e7d32' });
  const gs = makeTextSign('OUR COTTAGE', { w: 1.4, h: 0.4, bg: '#ffffff', fg: '#2e7d32', stroke: '#ffffff', border: '#ff6fb5' });
  gs.position.set(gxE + 0.1, 1.5, Z - 1.4); gs.rotation.y = Math.PI / 2; world.group.add(gs);

  world.landmarks.house = wp(0, 0.17, 0);
  world.landmarks.houseDoor = wp(0, 0, zN - 1.3);
  world.landmarks.bed = wp(bx - 1.2, 0.17, bz);
  game?.interactables?.push(
    { position: wp(bx - 1.1, 0.17, bz), radius: 2, label: 'Sleep', sub: 'end the day', kind: 'misc', id: 'bed',
      onInteract: () => { if (!game.quests?.trySleep) game.ui?.toast?.('Zzz... (sleeping comes soon)'); else game.quests.trySleep(); }, enabled: () => game.player?.state === 'walk' },
    { position: wp(wx - 1.0, 0.17, wz), radius: 2, label: 'Closet', sub: 'change outfit', kind: 'misc', id: 'closet',
      onInteract: () => { if (!game.ui?.openDressingRoom) game.ui?.toast?.('The closet is being stocked!'); else game.ui.openDressingRoom(); }, enabled: () => game.player?.state === 'walk' },
  );
}
