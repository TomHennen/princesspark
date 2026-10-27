// Fairy-tale castle: curtain walls, corner towers, gatehouse, keep with central spire, drawbridge over the moat.
// The keep is hollow: behind a grand hinged double door (world.castle.setDoorOpen) lies the throne room — stone
// floor, red carpet to a dais with two thrones (world.seats throneL / throneR, cushions in the princess colours),
// pillars, chandeliers, banners, glowing stained glass and a minstrel gallery over the door reached by stairs.
// Static stone merges into one vertex-colored mesh; the door leaves, the glowing glass and the princess-tinted
// cloth are their own small meshes so they can swing / glow / recolour.
import * as THREE from 'three';
import { MeshBuilder, C, makeLightCuller } from './builder.js';
import { CASTLE, DRAWBRIDGE } from './layout.js';

const RED = 0xb3202e, RED2 = 0x8e1a26, GOLD = 0xf9c80e, GOLD2 = 0xd9a506, STONE2 = 0xd8a9bf, FLOOR = 0xe9d5dd, FLOOR2 = 0xd4b4c2, IRON = 0x3a3f44, FLAME = 0xfff1a8;
const GLASS = [0xff6fb5, 0xffd600, 0x4fb0ff, 0x7bd94a, 0xb455ff, 0xff9b3d];
const DOOR_OPEN_ANGLE = 1.5, DOOR_SWING = 1.2;   // radians each leaf swings inward; seconds for the swing

export function buildCastle(world) {
  const B = new MeshBuilder(), game = world.game;
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
  // y0: the tower's base height (roof turrets / the spire start on top of the keep so the throne room stays clear)
  const tower = (x, z, r, h, roof, flag, collide = true, y0 = 0) => {
    B.cyl(C.stone, r + 0.4, r + 0.6, 0.6, x, y0, z, 14);
    B.cyl(C.wall, r, r * 1.04, h, x, y0, z, 14);
    B.cyl(C.yellow, r + 0.12, r + 0.12, 0.4, x, y0 + h * 0.55, z, 14);
    B.cyl(C.stone, r + 0.5, r + 0.25, 0.7, x, y0 + h - 0.4, z, 14);
    B.cone(roof, r + 0.75, h * 0.45 + 1.5, x, y0 + h + 0.3, z, 14);
    B.sphere(C.yellow, 0.3, x, y0 + h + 0.3 + h * 0.45 + 1.5, z);
    windowAt(x, y0 + h * 0.72, z + r * 0.97, 0); windowAt(x, y0 + h * 0.35, z + r * 0.97, 0);
    if (flag) { const top = y0 + h + 0.3 + h * 0.45 + 1.5; B.cyl(C.dark, 0.06, 0.06, 2.4, x, top, z, 5); world.flagDefs.push({ x, y: top + 2.4, z, color: flag }); }
    if (collide) world.addCollider(x, y0 + h / 2, z, r * 1.8, h, r * 1.8);
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

  // ---------------- keep: hollow shell around the throne room, solid upper storey, spire + turrets on the roof ----------------
  const kz = cz - 3, KW = 18, KD = 16, KH = 14, KT = 1.0, CH = 9.0, FL = 0.6, FT = FL + 0.04;   // CH = room height, FT = floor top
  const kf = kz + KD / 2, kb = kz - KD / 2, xw = cx - KW / 2, xe = cx + KW / 2;                 // faces (outer)
  const DW = 3.4, DH = 4.9;                                                                     // door gap
  B.box(C.stone, KW + 0.8, FL, KD + 0.8, cx, 0, kz);                                            // plinth = the floor slab
  const segW = (KW - DW) / 2, segL = cx - DW / 2 - segW / 2, segR = cx + DW / 2 + segW / 2;
  B.box(C.wall, segW, CH, KT, segL, FL, kf - KT / 2); B.box(C.wall, segW, CH, KT, segR, FL, kf - KT / 2);
  B.box(C.wall, DW + 0.2, CH - DH, KT, cx, FL + DH, kf - KT / 2);                                 // header over the door
  B.box(C.wall, KW, CH, KT, cx, FL, kb + KT / 2);
  B.box(C.wall, KT, CH, KD, xw + KT / 2, FL, kz); B.box(C.wall, KT, CH, KD, xe - KT / 2, FL, kz);
  B.box(C.wall, KW, KH - FL - CH, KD, cx, FL + CH, kz);                                          // ceiling + solid upper storey
  B.box(C.yellow, KW + 0.3, 0.4, KD + 0.3, cx, 9.4, kz);
  for (let i = 0; i < 7; i++) { const f = (i - 3) * 2.5; B.box(C.stone, 1.2, 1, 1.2, cx + f, KH, kz + KD / 2, 0); B.box(C.stone, 1.2, 1, 1.2, cx + f, KH, kz - KD / 2, 0); }
  for (let i = 0; i < 6; i++) { const f = (i - 2.5) * 2.5; B.box(C.stone, 1.2, 1, 1.2, cx + KW / 2, KH, kz + f, 0); B.box(C.stone, 1.2, 1, 1.2, cx - KW / 2, KH, kz + f, 0); }
  // wall colliders (the doorway stays open; the door itself is a separate collider toggled with the door)
  world.addCollider(segL, FL + CH / 2, kf - KT / 2, segW, CH, KT); world.addCollider(segR, FL + CH / 2, kf - KT / 2, segW, CH, KT);
  world.addCollider(cx, FL + DH + (CH - DH) / 2, kf - KT / 2, DW + 0.4, CH - DH, KT);
  world.addCollider(cx, FL + CH / 2, kb + KT / 2, KW, CH, KT);
  world.addCollider(xw + KT / 2, FL + CH / 2, kz, KT, CH, KD); world.addCollider(xe - KT / 2, FL + CH / 2, kz, KT, CH, KD);
  world.addBlocker(cx, FL + CH + (KH - FL - CH) / 2, kz, KW + 0.4, KH - FL - CH, KD + 0.4);
  world.addPlatform(xw, xe, kb, kf, FT);
  // door surround: stone jambs + lintel with gold trim, three steps up, the royal key crest on a red shield
  for (const s of [-1, 1]) { B.box(C.stone, 0.7, DH + 0.9, 0.5, cx + s * (DW / 2 + 0.35), FL, kf + 0.05); B.box(GOLD, 0.16, DH + 0.1, 0.56, cx + s * (DW / 2 + 0.08), FL, kf + 0.05); }
  B.box(C.stone, DW + 1.4, 0.9, 0.5, cx, FL + DH, kf + 0.05); B.box(GOLD, DW + 1.6, 0.22, 0.56, cx, FL + DH + 0.9, kf + 0.05); B.box(GOLD, DW + 0.2, 0.14, 0.56, cx, FL + DH - 0.02, kf + 0.05);
  B.box(C.stone, 7, 0.14, 1.4, cx, 0, kf + 0.8); B.box(C.stone, 5.4, 0.28, 0.8, cx, 0, kf + 0.5); B.box(C.stone, 4.6, 0.44, 0.5, cx, 0, kf + 0.3);
  world.addPlatform(cx - 3.5, cx + 3.5, kf + 0.1, kf + 1.5, 0.14); world.addPlatform(cx - 2.7, cx + 2.7, kf + 0.1, kf + 0.9, 0.28); world.addPlatform(cx - 2.3, cx + 2.3, kf + 0.05, kf + 0.55, 0.44);
  { const ky = FL + DH + 1.95, kzz = kf + 0.36;   // the key: shield, bow (ring), shaft, two teeth
    B.box(RED, 2.2, 1.9, 0.12, cx, ky - 0.95, kf + 0.26); B.box(GOLD, 2.4, 0.12, 0.14, cx, ky + 0.95, kf + 0.26); B.box(GOLD, 0.12, 1.9, 0.14, cx - 1.15, ky - 0.95, kf + 0.26); B.box(GOLD, 0.12, 1.9, 0.14, cx + 1.15, ky - 0.95, kf + 0.26);
    B.add(new THREE.TorusGeometry(0.3, 0.09, 8, 16), GOLD, cx - 0.65, ky, kzz, 0, 0, 0);
    B.add(new THREE.BoxGeometry(1.3, 0.16, 0.16), GOLD, cx + 0.3, ky, kzz, 0, 0, 0);
    B.box(GOLD, 0.16, 0.34, 0.16, cx + 0.86, ky - 0.42, kzz); B.box(GOLD, 0.16, 0.24, 0.16, cx + 0.56, ky - 0.32, kzz); }
  windowAt(cx - 5.5, 6.5, kf + 0.1, 0); windowAt(cx + 5.5, 6.5, kf + 0.1, 0); windowAt(cx - 5.5, 11, kf + 0.1, 0); windowAt(cx + 5.5, 11, kf + 0.1, 0); windowAt(cx, 11, kf + 0.1, 0);
  for (const s of [-1, 1]) { windowAt(cx + s * (KW / 2 + 0.1), 7, kz + 4, Math.PI / 2); windowAt(cx + s * (KW / 2 + 0.1), 7, kz - 4, Math.PI / 2); }
  // central spire on the roof + four corner turrets (pushed out so their shafts sit in the wall thickness, not the room)
  tower(cx, kz, 4.4, 15, C.green, C.yellow, false, KH);
  tower(cx - KW / 2 - 0.6, kz + 7, 1.7, 17.5, C.yellow, null, false); tower(cx + KW / 2 + 0.6, kz + 7, 1.7, 17.5, C.yellow, null, false);
  tower(cx - KW / 2 - 0.6, kz - 7, 1.7, 17.5, C.green, null, false); tower(cx + KW / 2 + 0.6, kz - 7, 1.7, 17.5, C.green, null, false);

  // ---------------- throne room (inside the keep) ----------------
  const G = new MeshBuilder();                                   // unlit "glow" pieces: stained glass, candle flames
  const tint = [new MeshBuilder(), new MeshBuilder()];           // princess-coloured cloth: banners + throne cushions
  const ix = KW / 2 - KT, iz = KD / 2 - KT;                      // interior half sizes (8 x 7)
  B.box(FLOOR, 2 * ix, 0.04, 2 * iz, cx, FL, kz);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 7; j++) if ((i + j) % 2) B.box(FLOOR2, 1.96, 0.012, 1.96, cx - ix + 1 + i * 2, FT, kz - iz + 1 + j * 2);
  // dais at the back (two 0.45 rises), carpet from the door up onto it, gold edging
  const dz1 = kb + KT + 4, dz0 = dz1 - 1.0;                      // dais front edges: lower step kb+KT+3..+4, top kb+KT..+3
  B.box(STONE2, 10, 0.45, 1.0, cx, FT, (dz0 + dz1) / 2); B.box(STONE2, 10, 0.9, 3.0, cx, FT, (kb + KT + dz0) / 2);
  world.addPlatform(cx - 5, cx + 5, dz0, dz1, FT + 0.45); world.addPlatform(cx - 5, cx + 5, kb + KT, dz0, FT + 0.9);
  for (const s of [-1, 1]) world.addCollider(cx + s * 5.1, FT + 0.45, (kb + KT + dz1) / 2, 0.2, 0.9, 4.0);
  const cz0 = kf - KT, cz1 = dz1;
  B.box(RED, 3.0, 0.05, cz0 - cz1, cx, FT, (cz0 + cz1) / 2); for (const s of [-1, 1]) B.box(GOLD, 0.14, 0.06, cz0 - cz1, cx + s * 1.5, FT, (cz0 + cz1) / 2);
  B.box(RED, 3.0, 0.05, 1.0, cx, FT + 0.45, (dz0 + dz1) / 2); B.box(RED, 3.0, 0.05, 2.0, cx, FT + 0.9, dz0 - 1.0);
  B.box(RED, 3.0, 0.47, 0.06, cx, FT, dz1 + 0.03); B.box(RED, 3.0, 0.47, 0.06, cx, FT + 0.45, dz0 + 0.03);   // carpet down the risers
  // thrones: gold frame (merged), princess-coloured cushion + back panel (tinted meshes); seated avatar faces the door (+z)
  const DAIS = FT + 0.9, thrones = [];
  [[-1, 'throneL'], [1, 'throneR']].forEach(([s, id], i) => {
    const tx = cx + s * 1.8, tz = kb + KT + 1.5;
    B.begin(tx, DAIS, tz, 0);
    B.box(GOLD2, 1.3, 0.4, 1.2, 0, 0, 0); B.box(GOLD, 1.4, 0.08, 1.3, 0, 0.4, 0);
    B.box(GOLD2, 1.3, 2.9, 0.22, 0, 0, -0.6); B.box(GOLD, 1.42, 0.12, 0.3, 0, 2.9, -0.6);
    for (const a of [-1, 1]) { B.box(GOLD, 0.16, 0.42, 1.1, a * 0.62, 0.48, -0.05); B.sphere(GOLD, 0.11, a * 0.62, 0.95, 0.5, 6, 4); B.sphere(GOLD, 0.16, a * 0.62, 3.1, -0.6, 6, 4); }
    B.cyl(GOLD, 0.26, 0.3, 0.28, 0, 3.0, -0.6, 8); for (let k = 0; k < 5; k++) B.cone(GOLD, 0.07, 0.22, -0.2 + k * 0.1, 3.28, -0.6, 4);
    B.sphere(RED, 0.08, 0, 3.52, -0.6, 6, 4);
    B.end();
    tint[i].box(0, 1.1, 0.14, 1.0, tx, DAIS + 0.4, tz);                   // cushion (seat top DAIS + 0.54)
    tint[i].box(0, 1.0, 2.1, 0.1, tx, DAIS + 0.6, tz - 0.44);              // back panel
    thrones.push({ id, x: tx, z: tz });
    world.addSeat({ id, position: new THREE.Vector3(tx, DAIS, tz + 0.2), facing: 0, seatHeight: 0.54 }, { label: 'Throne', sub: 'take a seat, Your Highness', radius: 2.2 });
    world.addCollider(tx, DAIS + 0.5, tz - 0.3, 1.3, 1.0, 0.8);            // the back/base: no walking through the throne from behind
  });
  // pillars with gold rings (three a side)
  for (const s of [-1, 1]) for (const pz of [kz + 5, kz + 1.5, kz - 2]) {
    const px = cx + s * 4.8;
    B.cyl(STONE2, 0.45, 0.5, CH - 0.4, px, FT, pz, 10); B.cyl(C.stone, 0.62, 0.68, 0.3, px, FT, pz, 10); B.cyl(C.stone, 0.72, 0.6, 0.5, px, FL + CH - 0.5, pz, 10);
    B.cyl(GOLD, 0.5, 0.5, 0.12, px, FT + 1.2, pz, 10); B.cyl(GOLD, 0.52, 0.52, 0.12, px, FL + CH - 0.62, pz, 10);
    world.addCollider(px, FL + CH / 2, pz, 1.0, CH, 1.0);
  }
  // chandeliers: chain, gold rings, candles with glowing flames
  for (const chz of [kz + 3.5, kz - 1.5]) {
    const cy = FL + 6.6;
    B.cyl(IRON, 0.04, 0.04, FL + CH - cy, cx, cy, chz, 5);
    B.add(new THREE.TorusGeometry(1.1, 0.08, 6, 20), GOLD, cx, cy, chz, Math.PI / 2, 0, 0); B.add(new THREE.TorusGeometry(0.5, 0.06, 6, 14), GOLD, cx, cy + 0.3, chz, Math.PI / 2, 0, 0);
    B.cyl(GOLD, 0.16, 0.22, 0.5, cx, cy - 0.3, chz, 8);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, px = cx + Math.cos(a) * 1.1, pz = chz + Math.sin(a) * 1.1; B.cyl(C.white, 0.05, 0.05, 0.32, px, cy + 0.05, pz, 5); G.sphere(FLAME, 0.085, px, cy + 0.45, pz, 6, 4, 1, 1.5, 1); B.beam(GOLD, px, cy, pz, cx + Math.cos(a) * 0.5, cy + 0.3, chz + Math.sin(a) * 0.5, 0.025, 4); }
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; G.sphere(FLAME, 0.07, cx + Math.cos(a) * 0.5, cy + 0.68, chz + Math.sin(a) * 0.5, 6, 4, 1, 1.5, 1); B.cyl(C.white, 0.04, 0.04, 0.26, cx + Math.cos(a) * 0.5, cy + 0.34, chz + Math.sin(a) * 0.5, 5); }
  }
  // stained glass: a rose window behind the thrones, two arched windows on each side wall — unlit, so they glow
  const lead = (x, y, z, ry, w, h) => B.box(IRON, w, h, 0.05, x, y, z, ry);
  const pane = (x, y, z, ry, w, h, col, off) => G.box(col, w, h, 0.04, x + Math.sin(ry) * off, y, z + Math.cos(ry) * off, ry);
  { const rx = cx, ry0 = FL + 6.4, rz = kb + KT + 0.04;   // rose window: 8 wedges + a gold hub, on the back wall facing +z
    B.add(new THREE.CylinderGeometry(1.75, 1.75, 0.1, 24), IRON, rx, ry0, rz, Math.PI / 2, 0, 0);
    for (let k = 0; k < 8; k++) G.add(new THREE.CylinderGeometry(1.6, 1.6, 0.04, 24, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4 - 0.06), GLASS[k % GLASS.length], rx, ry0, rz + 0.08, Math.PI / 2, 0, 0);
    B.add(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 12), GOLD, rx, ry0, rz + 0.08, Math.PI / 2, 0, 0); }
  for (const s of [-1, 1]) for (const [n, wz] of [kz + 2.25, kz - 1.25].entries()) {
    const x = cx + s * (ix - 0.02), ry = s * Math.PI / 2, y0 = FL + 4.6;   // faces into the room
    lead(x, y0, wz, ry, 1.7, 3.0); B.add(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 14, 1, false, Math.PI / 2, Math.PI), IRON, x, y0 + 3.0, wz, Math.PI / 2, ry, 0);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) pane(x, y0 + 0.3 + r * 0.58, wz + (c - 1) * 0.53 * (s > 0 ? -1 : 1), ry, 0.47, 0.52, GLASS[(r * 3 + c + n * 2 + (s > 0 ? 1 : 0)) % GLASS.length], -0.06);
    G.add(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 14, 1, false, Math.PI / 2, Math.PI), GLASS[(n + 2) % GLASS.length], x - s * 0.06, y0 + 3.0, wz, Math.PI / 2, ry, 0);
  }
  // banners: a gold rod and a stepped-point cloth in the princess colours (back wall by the rose window, side walls by the dais)
  const banner = (i, x, y, z, ry) => {
    B.add(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), GOLD, x, y, z, 0, ry, Math.PI / 2);
    const M = tint[i];
    M.begin(x, y, z, ry);
    M.box(0, 1.5, 2.3, 0.07, 0, -2.3, 0); M.box(0, 1.05, 0.45, 0.07, 0, -2.75, 0); M.box(0, 0.55, 0.4, 0.07, 0, -3.15, 0);
    M.end();
    B.begin(x, y, z, ry); B.box(GOLD, 1.6, 0.1, 0.09, 0, -0.3, 0); B.box(GOLD, 0.12, 2.0, 0.09, -0.7, -2.3, 0); B.box(GOLD, 0.12, 2.0, 0.09, 0.7, -2.3, 0); B.sphere(GOLD, 0.1, 0, -3.25, 0, 6, 4); B.end();
  };
  banner(0, cx - 4.6, FL + 8.6, kb + KT + 0.12, 0); banner(1, cx + 4.6, FL + 8.6, kb + KT + 0.12, 0);
  banner(0, xw + KT + 0.12, FL + 8.6, kz - 5.2, Math.PI / 2); banner(1, xe - KT - 0.12, FL + 8.6, kz - 5.2, -Math.PI / 2);
  // minstrel gallery over the door + stairs up along the west wall (9 x 0.5 rises), railings with a gap at the stair top
  const GY = FT + 4.5, gz0 = kf - KT - 1.6, gz1 = kf - KT;
  B.box(STONE2, 2 * ix, 0.3, 1.6, cx, GY - 0.3, (gz0 + gz1) / 2); B.box(GOLD, 2 * ix, 0.06, 0.1, cx, GY - 0.06, gz0 + 0.05);
  world.addPlatform(-ix + cx, ix + cx, gz0, gz1, GY);
  const stX0 = xw + KT, stW = 1.8, stZ0 = kz - 2.3, stD = 0.95, N = 9;
  for (let k = 1; k <= N; k++) {
    const top = FT + 0.5 * k, za = stZ0 + (k - 1) * stD;
    B.box(k % 2 ? STONE2 : C.stone, stW, top - FL, stD, stX0 + stW / 2, FL, za + stD / 2);
    world.addPlatform(stX0, stX0 + stW, za, za + stD, top);
    B.box(GOLD2, 0.12, 0.9 + 0.5, 0.95, stX0 + stW + 0.06, top - 0.5, za + stD / 2);   // parapet on the room side
    world.addCollider(stX0 + stW + 0.06, top + 0.2, za + stD / 2, 0.14, 1.4, stD);
  }
  const railFrom = stX0 + stW + 0.12;
  B.box(GOLD2, ix + cx - railFrom, 0.08, 0.1, (railFrom + ix + cx) / 2, GY + 0.9, gz0 + 0.05);
  for (let x = railFrom + 0.3; x < ix + cx; x += 1.0) B.cyl(GOLD2, 0.04, 0.04, 0.9, x, GY, gz0 + 0.05, 5);
  world.addCollider((railFrom + ix + cx) / 2, GY + 0.5, gz0 + 0.05, ix + cx - railFrom, 1.0, 0.14);

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
  const glow = G.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  glow.name = 'castleGlow'; glow.userData.noOcclude = true; world.group.add(glow);
  const tintMats = tint.map((M, i) => new THREE.MeshStandardMaterial({ color: princessColor(game, i), roughness: 0.8 }));
  tint.forEach((M, i) => { const m = M.build(tintMats[i]); if (m) { m.name = `castleCloth${i}`; m.castShadow = true; world.group.add(m); } });
  const light = new THREE.PointLight(0xffd9a0, 45, 24, 2); light.position.set(cx, FL + 6.2, kz + 1); world.group.add(light);
  world.animated.push(makeLightCuller(game, [light]));   // only lit while the player is near the keep
  game?.events?.on('settings:change', () => tintMats.forEach((m, i) => m.color.set(princessColor(game, i))));

  // ---------------- the door: two leaves hinged at the jambs, swinging inward ----------------
  const doorGroup = new THREE.Group(); doorGroup.name = 'castleDoor'; world.group.add(doorGroup);
  const leaves = [-1, 1].map((s) => {
    const hinge = new THREE.Group(); hinge.position.set(cx + s * DW / 2, FL, kf - 0.3);
    const M = new MeshBuilder(), w = DW / 2 - 0.02, mx = -s * w / 2;   // the leaf extends from the hinge toward the centre
    M.box(C.wood, w, DH - 0.06, 0.2, mx, 0.02, 0);
    for (let k = 1; k < 4; k++) M.box(0x6b3f1c, 0.03, DH - 0.1, 0.22, -s * (k * w / 4), 0.02, 0);
    for (const y of [0.5, 2.35, 4.2]) { M.box(GOLD, w - 0.1, 0.16, 0.26, mx, y, 0); for (let k = 0; k < 3; k++) M.sphere(GOLD2, 0.05, -s * (0.25 + k * 0.5), y + 0.08, 0.14, 5, 4); }
    M.box(GOLD, 0.12, DH - 0.06, 0.24, -s * (w - 0.06), 0.02, 0);                       // gold edge at the seam
    if (s > 0) { M.box(GOLD, 0.7, 0.9, 0.08, -0.85, 2.0, 0.12); M.add(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), IRON, -0.85, 2.58, 0.17, Math.PI / 2, 0, 0); M.box(IRON, 0.1, 0.3, 0.1, -0.85, 2.2, 0.17); }   // keyhole plate
    else { M.box(GOLD, 0.7, 0.5, 0.08, 0.85, 2.1, 0.12); for (let k = 0; k < 3; k++) M.cone(GOLD, 0.1, 0.3, 0.65 + k * 0.2, 2.58, 0.14, 4); M.sphere(RED, 0.06, 0.85, 2.3, 0.17, 5, 4); }   // crown crest
    M.sphere(GOLD, 0.1, -s * (w - 0.35), 2.45, 0.2, 6, 4);                                 // handle
    const m = M.build(world.mat.vc); m.castShadow = true; m.receiveShadow = true; hinge.add(m);
    doorGroup.add(hinge);
    return { hinge, s };
  });
  const doorBox = new THREE.Box3(new THREE.Vector3(cx - DW / 2 - 0.2, 0, kf - KT), new THREE.Vector3(cx + DW / 2 + 0.2, FL + DH + 0.5, kf + 0.3));
  const setLeaves = (p) => { for (const l of leaves) l.hinge.rotation.y = l.s * p * DOOR_OPEN_ANGLE; };
  const castle = {
    doorOpen: false, doorBox, progress: 0, anim: null, thrones,
    /** Open / close the keep door. Animated over DOOR_SWING s unless animate = false; emits castle:door { open } when done. */
    setDoorOpen(open, animate = true) {
      open = !!open;
      if (open === castle.doorOpen && !castle.anim) return;
      castle.doorOpen = open;
      const idx = world.colliders.indexOf(doorBox);
      if (open && idx >= 0) world.colliders.splice(idx, 1);
      if (!open && idx < 0) world.colliders.push(doorBox);
      if (!animate) { castle.anim = null; castle.progress = open ? 1 : 0; setLeaves(castle.progress); game?.events?.emit('castle:door', { open }); return; }
      castle.anim = { from: castle.progress, to: open ? 1 : 0, t: 0 };
      game?.audio?.play?.('door');
    },
  };
  world.castle = castle;
  world.colliders.push(doorBox);
  castle.setDoorOpen(!!game?.quests?.castleOpen, false);
  world.animated.push((dt) => {
    const a = castle.anim; if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / DOOR_SWING), e = k * k * (3 - 2 * k);
    castle.progress = a.from + (a.to - a.from) * e;
    setLeaves(castle.progress);
    if (k >= 1) { castle.anim = null; game?.events?.emit('castle:door', { open: castle.doorOpen }); }
  });
  world.landmarks.castleDoor = new THREE.Vector3(cx, 0, kf + 2.6);
  world.landmarks.throneRoom = new THREE.Vector3(cx, FT, kz + 2);
  return mesh;
}

/** The princess colour (hex string → number) for throne i, with the park palette as a fallback. */
function princessColor(game, i) {
  const c = game?.settings?.princesses?.[i]?.color;
  try { return new THREE.Color(c || (i ? C.yellow : C.green)); } catch { return new THREE.Color(i ? C.yellow : C.green); }
}
