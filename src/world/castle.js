// Fairy-tale castle: curtain walls, corner towers, gatehouse, keep with central spire, drawbridge over the moat.
// Everything merges into one vertex-colored mesh; flags are registered on world.flagDefs for the waving-flag mesh.
import { MeshBuilder, C } from './builder.js';
import { CASTLE, DRAWBRIDGE } from './layout.js';

export function buildCastle(world) {
  const B = new MeshBuilder();
  const cx = CASTLE.x, cz = CASTLE.z, HW = CASTLE.halfW, HD = CASTLE.halfD;
  const zF = cz + HD, zB = cz - HD;        // front (south) and back wall centre lines
  const WALL_H = 7, T = 2;

  const wall = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    B.box(C.stone, T + 0.6, 0.6, len + 0.6, mx, 0, mz, ry);
    B.box(C.wall, T, WALL_H, len, mx, 0, mz, ry);
    B.box(C.yellow, T + 0.3, 0.35, len, mx, 5.2, mz, ry);
    const n = Math.max(1, Math.floor(len / 2.4));
    for (let i = 0; i < n; i++) { const f = ((i + 0.5) / n - 0.5) * len; B.box(C.stone, T, 1.0, 1.2, mx + Math.sin(ry) * f, WALL_H, mz + Math.cos(ry) * f, ry); }
    world.addCollider(mx, WALL_H / 2, mz, Math.max(Math.abs(dx), T), WALL_H + 1, Math.max(Math.abs(dz), T));
  };
  // walls — the front has a gap for the gate between the gatehouse towers
  wall(cx - HW, zF, cx - 9, zF); wall(cx + 9, zF, cx + HW, zF);
  wall(cx - HW, zB, cx + HW, zB);
  wall(cx - HW, zF, cx - HW, zB); wall(cx + HW, zF, cx + HW, zB);

  const windowAt = (x, y, z, ry) => { B.box(C.stone, 1.1, 1.7, 0.3, x, y, z, ry); B.box(C.glass, 0.8, 1.3, 0.34, x, y + 0.2, z, ry); };
  const tower = (x, z, r, h, roof, flag, collide = true) => {
    B.cyl(C.stone, r + 0.4, r + 0.6, 0.6, x, 0, z, 14);
    B.cyl(C.wall, r, r * 1.04, h, x, 0, z, 14);
    B.cyl(C.yellow, r + 0.12, r + 0.12, 0.4, x, h * 0.55, z, 14);
    B.cyl(C.stone, r + 0.5, r + 0.25, 0.7, x, h - 0.4, z, 14);
    B.cone(roof, r + 0.75, h * 0.45 + 1.5, x, h + 0.3, z, 14);
    B.sphere(C.yellow, 0.3, x, h + 0.3 + h * 0.45 + 1.5, z);
    windowAt(x, h * 0.72, z + r * 0.97, 0); windowAt(x, h * 0.35, z + r * 0.97, 0);
    if (flag) { const top = h + 0.3 + h * 0.45 + 1.5; B.cyl(C.dark, 0.06, 0.06, 2.4, x, top, z, 5); world.flagDefs.push({ x, y: top + 2.4, z, color: flag }); }
    if (collide) world.addCollider(x, h / 2, z, r * 1.8, h, r * 1.8);
  };
  // corner towers
  tower(cx - HW, zF, 3.6, 11, C.green, C.yellow); tower(cx + HW, zF, 3.6, 11, C.green, C.green);
  tower(cx - HW, zB, 3.6, 11, C.green, C.green); tower(cx + HW, zB, 3.6, 11, C.green, C.yellow);
  // gatehouse
  tower(cx - 7, zF, 3, 13, C.yellow, C.green); tower(cx + 7, zF, 3, 13, C.yellow, C.yellow);
  B.box(C.wall, 8.4, 5, 2.4, cx, 6, zF);                 // lintel over the gate
  B.box(C.yellow, 8.6, 0.3, 2.7, cx, 6.0, zF);
  for (let i = -1; i <= 1; i++) B.box(C.stone, 1.2, 1.0, 2.4, cx + i * 2.6, 11, zF);
  B.box(C.wood, 0.5, 6, 0.6, cx - 3.95, 0, zF); B.box(C.wood, 0.5, 6, 0.6, cx + 3.95, 0, zF); // gate posts
  B.box(C.wood, 8.4, 0.5, 0.6, cx, 5.6, zF);
  // banners either side of the gate
  for (const s of [-1, 1]) { B.box(C.green, 1.6, 3.2, 0.14, cx + s * 11.5, 2.4, zF + 1.1); B.box(C.yellow, 0.5, 3.2, 0.16, cx + s * 11.5, 2.4, zF + 1.1); B.cyl(C.dark, 0.07, 0.07, 2.2, cx + s * 11.5, 5.5, zF + 1.1, 5); }

  // keep
  const kz = cz - 3, KW = 18, KD = 16, KH = 14;
  B.box(C.stone, KW + 0.8, 0.6, KD + 0.8, cx, 0, kz);
  B.box(C.wall, KW, KH, KD, cx, 0, kz);
  B.box(C.yellow, KW + 0.3, 0.4, KD + 0.3, cx, 9.4, kz);
  for (let i = 0; i < 7; i++) { const f = (i - 3) * 2.5; B.box(C.stone, 1.2, 1, 1.2, cx + f, KH, kz + KD / 2, 0); B.box(C.stone, 1.2, 1, 1.2, cx + f, KH, kz - KD / 2, 0); }
  for (let i = 0; i < 6; i++) { const f = (i - 2.5) * 2.5; B.box(C.stone, 1.2, 1, 1.2, cx + KW / 2, KH, kz + f, 0); B.box(C.stone, 1.2, 1, 1.2, cx - KW / 2, KH, kz + f, 0); }
  const kf = kz + KD / 2; // keep front face
  B.box(C.stone, 4.6, 5.6, 0.4, cx, 0, kf + 0.1); B.box(C.wood, 3.4, 4.9, 0.5, cx, 0, kf + 0.2); B.box(C.yellow, 0.16, 4.9, 0.55, cx, 0, kf + 0.22);
  B.box(C.stone, 7, 0.14, 1.4, cx, 0, kf + 0.8); B.box(C.stone, 5.4, 0.28, 0.8, cx, 0, kf + 0.5);
  windowAt(cx - 5.5, 6.5, kf + 0.1, 0); windowAt(cx + 5.5, 6.5, kf + 0.1, 0); windowAt(cx - 5.5, 11, kf + 0.1, 0); windowAt(cx + 5.5, 11, kf + 0.1, 0); windowAt(cx, 11, kf + 0.1, 0);
  for (const s of [-1, 1]) { windowAt(cx + s * (KW / 2 + 0.1), 7, kz + 4, Math.PI / 2); windowAt(cx + s * (KW / 2 + 0.1), 7, kz - 4, Math.PI / 2); }
  world.addCollider(cx, KH / 2, kz, KW, KH, KD);
  // central spire + four turrets
  tower(cx, kz, 4.4, 24, C.green, C.yellow, false);
  tower(cx - 8.4, kz + 7, 1.7, 17.5, C.yellow, null, false); tower(cx + 8.4, kz + 7, 1.7, 17.5, C.yellow, null, false);
  tower(cx - 8.4, kz - 7, 1.7, 17.5, C.green, null, false); tower(cx + 8.4, kz - 7, 1.7, 17.5, C.green, null, false);

  // drawbridge across the moat (walkable platform)
  const D = DRAWBRIDGE, dmz = (D.minZ + D.maxZ) / 2, dl = D.maxZ - D.minZ;
  B.box(C.wood, D.maxX - D.minX, D.top, dl, cx, 0, dmz);
  for (let i = -2; i <= 2; i++) B.box(0x6f4320, 0.1, D.top + 0.01, dl, cx + i * 1.5, 0, dmz);
  for (const s of [-1, 1]) {
    B.box(C.wood2, 0.5, 0.6, dl, cx + s * (D.maxX - 0.3), 0, dmz);
    B.beam(C.dark, cx + s * 3.6, 0.6, D.maxZ - 0.3, cx + s * 4.3, 9.5, zF + 0.8, 0.09);
  }
  world.addPlatform(D.minX, D.maxX, D.minZ, D.maxZ, D.top);
  // low side walls: the only way into the moat is not off the drawbridge
  for (const s of [-1, 1]) world.addCollider(cx + s * (D.maxX - 0.3), 0.6, dmz, 0.5, 1.2, dl);

  const mesh = B.build(world.mat.vc);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'castle';
  return mesh;
}
