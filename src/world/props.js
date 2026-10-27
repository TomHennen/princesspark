// Park dressing: fence, entrance arch, gazebo, fountain, bridge, lookout, stands, flamingos, benches,
// palms, lamp posts, bunting, bushes and flowers. Static pieces merge into one mesh; repeats are instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, C, makeTextSign, paint, bucketInstances, PARK_CELL } from './builder.js';
import { PATHS, PLAZA_R, LAGOON, CASTLE, MOAT, BRIDGE, GAZEBO, FOUNTAIN, SOUTH_WALL, WING, southWallZ, terrainY, isClear, onPath, inPlot, inWater, inWing, inReserved } from './layout.js';
import { buildWaterPark } from './waterpark.js';

export function buildProps(world) {
  const B = new MeshBuilder();
  const ctx = { world, B, rng: world.rng, flowerSpots: [], lampSpots: [], spans: [], palmSpots: [], bushSpots: [] };
  ctx.forcedPalms = [];   // hand-placed palm spots (the water park adds its own)
  perimeter(ctx); entrance(ctx); gazebo(ctx); fountain(ctx); bridge(ctx); lookout(ctx); stands(ctx); lagoonLife(ctx); furniture(ctx); beach(ctx);
  layoutLamps(ctx); buntingPoles(ctx);
  // one merged mesh per park quadrant, so the far side of the park is culled instead of drawn (and shadow-cast) every frame
  for (const decor of B.buildGrid(world.mat.vc, PARK_CELL)) { decor.castShadow = true; decor.receiveShadow = true; decor.name = 'decor'; world.group.add(decor); }
  buildWaterPark(ctx);   // Splash Cove wing: its own merged mesh + animated bits; pushes palm/lamp spots
  palms(ctx); lamps(ctx); bunting(ctx); greenery(ctx);
}

function sign(ctx, text, x, y, z, ry, opts) {
  const m = makeTextSign(text, opts); m.position.set(x, y, z); m.rotation.y = ry; ctx.world.group.add(m); return m;
}

// ---------------- boundary ----------------
function perimeter({ world, B }) {
  const H = 2.6;
  // tall hedge with topiary posts every ~18 m; (x,z) is the centre, ry 0 = runs along z
  const hedge = (x, z, ry, L) => {
    B.box(C.hedge, 2.2, H, L, x, 0, z, ry);
    B.box(0x3c9440, 2.4, 0.5, L, x, H - 0.3, z, ry);
    const n = Math.max(1, Math.round(L / 18));
    for (let i = 0; i <= n; i++) {
      const f = -L / 2 + (L / n) * i, px = x + (ry ? f : 0), pz = z + (ry ? 0 : f);
      B.box(0x3c9440, 3, H + 0.8, 3, px, 0, pz); B.sphere(C.leaf, 1.3, px, H + 1.4, pz);
    }
    world.addCollider(x, H / 2, z, ry ? L : 2.4, H + 2, ry ? 2.4 : L);
  };
  hedge(-133, 0, 0, 270); hedge(0, -133, Math.PI / 2, 270);
  // east side: the old hedge stays north and south of the Splash Cove wing; the wing gets its own three hedges
  const nz = WING.minZ - 1, sz = WING.maxZ + 1;
  hedge(133, (-135 + nz) / 2, 0, nz + 135); hedge(133, (sz + 111) / 2, 0, 111 - sz);
  hedge((WING.minX - 1 + WING.fenceX) / 2, nz, Math.PI / 2, WING.fenceX - WING.minX + 3);
  hedge((WING.minX - 1 + WING.fenceX) / 2, sz, Math.PI / 2, WING.fenceX - WING.minX + 3);
  hedge(WING.fenceX, (nz + sz) / 2, 0, sz - nz + 2);
  // south boundary wall: a bay (see SOUTH_WALL) with the gate gap at |x| < gateHalf
  const W = SOUTH_WALL;
  const pillar = (px, pz) => { B.box(C.pink2, 1.6, 3.4, 1.6, px, 0, pz); B.cone(C.green, 1.3, 1.1, px, 3.4, pz, 4, Math.PI / 4); };
  for (const s of [-1, 1]) {
    const pts = [[W.gateHalf, W.nearZ], [W.bendStart, W.nearZ], [W.bendEnd, W.farZ], [135, W.farZ]].map(([x, z]) => [s * x, z]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      B.box(C.pink2, 1.0, 2.6, len + 0.8, mx, 0, mz, ry);
      B.box(C.white, 1.1, 0.5, len + 0.8, mx, 1.0, mz, ry);   // white band so the shaded north face still reads as a painted wall
      B.box(C.yellow, 1.4, 0.3, len + 0.8, mx, 2.6, mz, ry);
      world.addCollider(mx, 1.5, mz, Math.max(Math.abs(dx), 3), 4, Math.max(Math.abs(dz), 3));
      if (i > 0) pillar(x1, z1);
      if (i === pts.length - 1) for (let px = Math.abs(x1) + 15; px < 128; px += 17) pillar(s * px, z1);
    }
    B.box(C.pink, 3, 2.6, 4, s * 6.5, 0, W.nearZ - 1.5);  // gate pier
    world.addCollider(s * 6.5, 1.3, W.nearZ - 1.5, 3, 2.6, 4);
  }
}

// ---------------- entrance arch + ticket booths ----------------
function entrance(ctx) {
  const { world, B } = ctx;
  for (const s of [-1, 1]) {
    const x = s * 6;
    B.box(C.pink2, 2, 8.5, 2, x, 0, 100); B.box(C.yellow, 2.3, 0.4, 2.3, x, 2.5, 100); B.box(C.yellow, 2.3, 0.4, 2.3, x, 6.3, 100);
    B.box(C.yellow, 2.6, 0.4, 2.6, x, 8.5, 100); B.cone(C.green, 1.4, 1.7, x, 8.9, 100, 4, Math.PI / 4); B.sphere(C.yellow, 0.25, x, 10.7, 100);
    world.addCollider(x, 4.5, 100, 2.2, 9, 2.2);
    // ticket booth
    const bx = s * 13, ry = -s * Math.PI / 2;
    B.begin(bx, 0, 100, ry);
    B.box(C.pink, 2.6, 2.7, 2.6, 0, 0, 0); B.box(C.glass, 1.6, 1.0, 0.2, 0, 1.3, 1.3); B.box(C.wood, 1.9, 0.14, 0.5, 0, 1.1, 1.45);
    B.box(C.yellow, 2.8, 0.25, 2.8, 0, 2.7, 0); B.cone(C.yellow, 2.3, 1.2, 0, 2.95, 0, 4, Math.PI / 4); B.sphere(C.green, 0.22, 0, 4.2, 0);
    B.end();
    world.addCollider(bx, 1.5, 100, 2.8, 3, 2.8);
    sign(ctx, 'TICKETS', bx + Math.sin(ry) * 1.42, 2.25, 100 + Math.cos(ry) * 1.42, ry, { w: 2.2, h: 0.6, bg: '#ffffff', fg: '#ff6fb5', stroke: '#1b5e20' });
    // tall striped pole on the booth roof; the pennant string from the arch attaches up here (clear of the camera)
    B.cyl(C.white, 0.07, 0.09, 4.2, bx, 3.9, 100, 6); B.cyl(C.green, 0.1, 0.1, 0.3, bx, 5.2, 100, 6); B.cyl(C.green, 0.1, 0.1, 0.3, bx, 6.6, 100, 6); B.sphere(C.yellow, 0.18, bx, 8.15, 100);
    ctx.spans.push([[x, 8.3, 100], [bx, 8.0, 100]]);
  }
  B.box(C.pink2, 16, 2.8, 1.5, 0, 8.6, 100);
  B.box(C.yellow, 16.4, 0.3, 1.9, 0, 8.5, 100); B.box(C.yellow, 16.4, 0.3, 1.9, 0, 11.3, 100);
  B.cyl(C.yellow, 1.2, 1.0, 0.9, 0, 11.6, 100, 10);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; B.cone(C.yellow, 0.25, 0.7, Math.cos(a) * 0.9, 12.5, 100 + Math.sin(a) * 0.9, 6); }
  B.sphere(C.hotpink, 0.35, 0, 12.7, 100);
  world.flagDefs.push({ x: -6, y: 11.2, z: 100, color: C.green, scale: 0.8 }, { x: 6, y: 11.2, z: 100, color: C.yellow, scale: 0.8 });
  B.cyl(C.dark, 0.06, 0.06, 1.5, -6, 10.6, 100, 5); B.cyl(C.dark, 0.06, 0.06, 1.5, 6, 10.6, 100, 5);
  // the arch reads the player's park name (game.settings) and redraws when it changes
  const parkName = () => String(world.game?.settings?.parkName || 'Princess Park').toUpperCase();
  const arch = sign(ctx, parkName(), 0, 10, 100, 0, { w: 14, h: 2.2, doubleSided: true, gap: 0.78 });
  world.game?.events?.on('settings:change', () => arch.userData.setText(parkName()));
}

// ---------------- Princess Plaza gazebo (floor stays at y = 0) ----------------
function gazebo(ctx) {
  const { world, B } = ctx, G = GAZEBO;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = G.x + Math.cos(a) * 5.6, z = G.z + Math.sin(a) * 5.6;
    B.cyl(C.yellow, 0.42, 0.46, 0.3, x, 0, z, 10); B.cyl(C.white, 0.28, 0.3, 4.0, x, 0.3, z, 10); B.cyl(C.yellow, 0.42, 0.34, 0.3, x, 4.0, z, 10);
    world.addCollider(x, 2.2, z, 0.8, 4.4, 0.8);   // every column is solid (the NPCs at (±3, 12) have > 2.5 m clear)
  }
  world.addBlocker(G.x, 6.3, G.z, 15.2, 4.3, 15.2);   // solid roof: pull the camera in rather than clip through it
  B.cyl(C.yellow, 7.4, 7.4, 0.35, G.x, 4.15, G.z, 8);          // fascia
  B.cone(C.green, 7.6, 3.6, G.x, 4.45, G.z, 8);
  B.cyl(C.yellow, 0.5, 0.6, 0.5, G.x, 8.0, G.z, 8); B.sphere(C.yellow, 0.5, G.x, 8.7, G.z);
  B.cyl(C.dark, 0.06, 0.06, 1.8, G.x, 9.0, G.z, 5);
  world.flagDefs.push({ x: G.x, y: 10.8, z: G.z, color: C.hotpink, scale: 0.8 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.sphere(C.hotpink, 0.3, G.x + Math.cos(a) * 7.4, 4.0, G.z + Math.sin(a) * 7.4); }
  sign(ctx, 'PRINCESS PLAZA', G.x, 4.3, G.z + 7.6, 0, { w: 5.2, h: 0.9, bg: '#fff1f6', fg: '#ff6fb5', stroke: '#1b5e20', border: '#ffd600' });
}

// ---------------- fountain with parabolic droplets ----------------
function fountain(ctx) {
  const { world, B } = ctx, F = FOUNTAIN;
  B.cyl(C.stone, F.r, F.r + 0.2, 0.9, F.x, 0, F.z, 28); B.cyl(0xf6d36b, F.r + 0.25, F.r + 0.25, 0.18, F.x, 0.9, F.z, 28);
  B.cyl(0x7fd6f5, F.r - 0.3, F.r - 0.3, 0.3, F.x, 0.3, F.z, 28);
  B.cyl(C.stone, 0.9, 1.2, 1.9, F.x, 0.3, F.z, 12); B.cyl(C.stone, 1.9, 1.6, 0.45, F.x, 2.2, F.z, 16); B.cyl(0xf6d36b, 2.0, 2.0, 0.14, F.x, 2.6, F.z, 16);
  B.cyl(C.stone, 0.35, 0.5, 1.3, F.x, 2.7, F.z, 10);
  B.cyl(C.yellow, 0.8, 0.7, 0.6, F.x, 4.0, F.z, 10);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; B.cone(C.yellow, 0.2, 0.5, F.x + Math.cos(a) * 0.65, 4.6, F.z + Math.sin(a) * 0.65, 6); }
  B.sphere(C.hotpink, 0.28, F.x, 4.8, F.z);
  world.addCollider(F.x, 0.5, F.z, 2 * F.r + 0.2, 1.1, 2 * F.r + 0.2);
  // droplets
  const N = 48, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshStandardMaterial({ color: 0xcdf3ff, roughness: 0.3 }), N);
  const centre = new THREE.Vector3(F.x, 3, F.z);
  drops.boundingSphere = new THREE.Sphere(centre, 6);   // the arcs never leave the basin: a fixed sphere culls them properly
  world.group.add(drops);
  const m = new THREE.Matrix4(), T = 1.3, g = 9.8, vy = 4.0, vh = 2.1, y0 = 4.5;
  world.animated.push((dt, t) => {
    if (world.game?.player?.position.distanceTo(centre) > 80) return;   // too far to see the drops move: skip the upload
    for (let i = 0; i < N; i++) {
      const a = ((i % 12) / 12) * Math.PI * 2 + Math.floor(i / 12) * 0.13, tt = (t * 0.8 + (Math.floor(i / 12) / 4) * T) % T;
      m.makeTranslation(F.x + Math.cos(a) * vh * tt, y0 + vy * tt - 0.5 * g * tt * tt, F.z + Math.sin(a) * vh * tt);
      drops.setMatrixAt(i, m);
    }
    drops.instanceMatrix.needsUpdate = true;
  });
}

// ---------------- stone bridge over the lagoon ----------------
function bridge(ctx) {
  const { world, B } = ctx, Bb = BRIDGE, len = Bb.maxZ - Bb.minZ, mz = (Bb.minZ + Bb.maxZ) / 2, w = Bb.maxX - Bb.minX;
  B.box(0xeec3d2, w, 0.6, len, 0, -0.3, mz);
  B.box(0xf6d36b, w + 0.2, 0.08, len, 0, Bb.top, mz);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.2);
    B.box(0xf6d36b, 0.16, 0.14, len, x, Bb.top + 1.0, mz);
    for (let z = Bb.minZ + 1; z <= Bb.maxZ - 1; z += 3) B.box(0xeec3d2, 0.34, 1.1, 0.34, x, Bb.top, z);
    for (const z of [-40, -48, -56]) ctx.lampSpots.push({ x: x * 0.86, y: Bb.top, z, bridge: true });
    world.addCollider(x, Bb.top + 0.6, mz, 0.4, 1.2, len);   // balustrade: no tumbling into the lagoon off the bridge
  }
  world.addPlatform(Bb.minX, Bb.maxX, Bb.minZ, Bb.maxZ, Bb.top);
}

// ---------------- Flamingo Lookout (lifeguard-style tower; climbable via steps) ----------------
function lookout(ctx) {
  const { world, B } = ctx, X = 33, Z = -48, H = 2.5;
  for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
    B.cyl(C.wood, 0.17, 0.2, H - 0.3, X + dx, 0, Z + dz, 7);
    B.cyl(C.white, 0.09, 0.09, 2.3, X + dx, H, Z + dz, 6);
    world.addCollider(X + dx, (H - 0.3) / 2, Z + dz, 0.45, H - 0.3, 0.45);
  }
  B.box(C.wood2, 4.6, 0.3, 4.6, X, H - 0.3, Z);
  B.box(C.yellow, 4.6, 0.12, 0.12, X, H + 0.95, Z - 2.25); B.box(C.yellow, 0.12, 0.12, 4.6, X - 2.25, H + 0.95, Z); B.box(C.yellow, 0.12, 0.12, 4.6, X + 2.25, H + 0.95, Z);
  B.box(C.yellow, 1.0, 0.12, 0.12, X - 1.8, H + 0.95, Z + 2.25); B.box(C.yellow, 1.0, 0.12, 0.12, X + 1.8, H + 0.95, Z + 2.25);
  B.cone(C.green, 3.7, 1.5, X, H + 2.3, Z, 4, Math.PI / 4); B.sphere(C.yellow, 0.22, X, H + 3.9, Z);
  world.addPlatform(X - 2.3, X + 2.3, Z - 2.3, Z + 2.3, H);
  // railing colliders (deck level only — they start at the deck top so ground walkers pass beneath)
  world.addCollider(X, H + 0.6, Z - 2.25, 4.6, 1.2, 0.3); world.addCollider(X - 2.25, H + 0.6, Z, 0.3, 1.2, 4.6); world.addCollider(X + 2.25, H + 0.6, Z, 0.3, 1.2, 4.6);
  world.addCollider(X - 1.8, H + 0.6, Z + 2.25, 1.0, 1.2, 0.3); world.addCollider(X + 1.8, H + 0.6, Z + 2.25, 1.0, 1.2, 0.3);
  for (let k = 1; k <= 4; k++) {
    const top = H - 0.5 * k, z0 = Z + 2.3 + (k - 1) * 1.2;
    B.box(C.wood2, 2.6, top, 1.2, X, 0, z0 + 0.6);
    world.addPlatform(X - 1.3, X + 1.3, z0, z0 + 1.2, top);
  }
  // step handrails (visible + colliders) so nobody slips off the side of the stairs
  for (const s of [-1, 1]) {
    const x = X + s * 1.4;
    B.beam(C.yellow, x, H + 0.9, Z + 2.3, x, 1.4, Z + 7.1, 0.06); for (const z of [Z + 2.6, Z + 4.7, Z + 6.8]) B.cyl(C.white, 0.05, 0.05, 0.9, x, H - 0.5 * Math.min(4, Math.max(1, Math.round((z - Z - 2.3) / 1.2 + 0.5))), z, 5);
    world.addCollider(x, 1.6, Z + 4.7, 0.3, 2.6, 4.8);
  }
  sign(ctx, 'FLAMINGO LOOKOUT', X, H + 1.75, Z + 2.4, 0, { w: 3.4, h: 0.6, bg: '#ffffff', fg: '#ff6fb5', stroke: '#1b5e20' });
  flamingoSlide(ctx, X, Z, H);
}

// A giant flamingo "drinking" beside the deck: you sit on its back and slide down its long neck to the puddle.
function flamingoSlide(ctx, X, Z, H) {
  const { world, B } = ctx, game = world.game;
  const pts = [[X + 2.2, H + 0.05, Z], [X + 4.3, H + 0.4, Z], [X + 6.6, H - 0.15, Z - 0.5], [X + 8.6, 1.5, Z + 0.2], [X + 10.6, 0.65, Z + 1.7], [X + 12.4, 0.12, Z + 3.5]];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.3);
  // body straddling the deck rail, two long legs, tail feathers
  B.sphere(C.flamingo, 1.3, X + 3.6, H - 0.35, Z, 12, 8, 1.3, 0.8, 1.0);
  B.sphere(C.flamingo2, 0.8, X + 2.6, H - 0.1, Z, 8, 6, 1.1, 0.6, 1.1);
  for (const s of [-1, 1]) { B.cyl(C.flamingo2, 0.07, 0.07, H - 0.9, X + 3.9, 0, Z + s * 0.45, 6); B.box(C.flamingo2, 0.5, 0.08, 0.6, X + 4.05, 0, Z + s * 0.45); }
  // neck = the chute: a pink tube under a wide pink trough with raised lips
  const P = curve.getPoints(26);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / len), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    B.beam(C.flamingo, a.x, a.y - 0.42, a.z, b.x, b.y - 0.42, b.z, 0.36, 8);
    B.add(new THREE.BoxGeometry(1.2, 0.12, len + 0.12), C.flamingo2, mx, my - 0.1, mz, pitch, yaw, 0);
    for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.14, 0.34, len + 0.12), C.flamingo, mx + s * 0.55 * Math.cos(yaw), my + 0.06, mz - s * 0.55 * Math.sin(yaw), pitch, yaw, 0);
  }
  // head at the bottom, beak dipping into a little puddle
  const e = pts[pts.length - 1];
  B.sphere(C.flamingo, 0.5, e[0] + 0.9, 0.55, e[2] + 0.9, 10, 8);
  B.add(new THREE.ConeGeometry(0.2, 0.9, 8), C.black, e[0] + 1.45, 0.3, e[2] + 1.45, 0, 0, -2.0);
  B.sphere(C.black, 0.08, e[0] + 1.1, 0.75, e[2] + 0.55, 5, 4); B.sphere(C.black, 0.08, e[0] + 0.55, 0.75, e[2] + 1.1, 5, 4);
  B.cyl(0x7fd6f5, 1.3, 1.3, 0.05, e[0] + 1.9, 0.02, e[2] + 1.9, 14);
  B.cyl(0xf1dfb0, 1.6, 1.8, 0.04, e[0], 0, e[2], 14);   // sand landing pad at the chute exit
  world.addCollider(X + 3.7, 1.2, Z, 2.8, 2.4, 2.2);      // body + legs (deck walkers are above it)
  world.addCollider(X + 7.6, 1.2, Z - 0.1, 2.2, 1.6, 1.6);
  world.addCollider(e[0] + 1.0, 0.5, e[2] + 1.0, 1.6, 1.1, 1.6);
  const top = new THREE.Vector3(X + 1.6, H, Z);
  world.landmarks.lookoutSlide = top.clone();
  world.slides = world.slides || {}; world.slides.lookoutSlide = curve;
  game?.interactables?.push({
    position: top, radius: 2.4, label: 'Slide down!', sub: 'flamingo slide', kind: 'misc', id: 'lookoutSlide',
    enabled: () => game.player?.state === 'walk' && game.player.position.y > H - 0.6,
    onInteract: () => { game.events?.emit('play', { id: 'lookoutSlide' }); game.player?.slideAlong?.(curve, { id: 'lookoutSlide', duration: 2.6 }); },
  });
  sign(ctx, 'FLAMINGO SLIDE', X + 3.6, H + 1.1, Z - 1.2, 0, { w: 2.0, h: 0.4, bg: '#ff7bac', fg: '#ffffff', stroke: '#8e0040', border: '#ffffff' });
}

// ---------------- souvenir stand, snack cart, crates ----------------
function stands(ctx) {
  const { world, B } = ctx;
  // souvenir stand at (-40, 62), facing north toward the lightcycle path
  B.begin(-40, 0, 62, Math.PI);
  B.box(C.wall, 5, 3.0, 2.4, 0, 0, -0.5); B.box(C.pink2, 5, 1.1, 1.0, 0, 0, 1.3); B.box(C.white, 5.2, 0.12, 1.2, 0, 1.1, 1.3);
  for (let i = 0; i < 6; i++) B.box(i % 2 ? C.white : C.yellow, 0.86, 0.16, 4.6, -2.15 + i * 0.86, 3.1, 0.3, 0, 0.1);
  B.cyl(C.yellow, 0.08, 0.08, 3.1, -2.3, 0, 1.9, 6); B.cyl(C.yellow, 0.08, 0.08, 3.1, 2.3, 0, 1.9, 6);
  B.cyl(C.yellow, 0.28, 0.24, 0.28, -1.5, 1.16, 1.3, 8); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.cone(C.yellow, 0.08, 0.22, -1.5 + Math.cos(a) * 0.22, 1.44, 1.3 + Math.sin(a) * 0.22, 4); }
  B.sphere(C.hotpink, 0.32, 0.1, 1.48, 1.3); B.sphere(C.green2, 0.3, 1.0, 1.46, 1.3); B.sphere(C.yellow, 0.26, 1.8, 1.42, 1.3);
  B.box(0x5bb0ff, 0.5, 0.5, 0.5, -0.7, 1.16, 1.3, 0.4);
  B.end();
  world.addCollider(-40, 1.6, 62, 5.4, 3.3, 3.8);
  sign(ctx, 'SOUVENIRS', -40, 3.75, 59.5, Math.PI, { w: 4.4, h: 1.0, bg: '#ffffff', fg: '#ff6fb5', stroke: '#1b5e20' });
  sign(ctx, 'OPEN', -42.2, 1.75, 60.12, Math.PI, { w: 1.0, h: 0.4, bg: '#1b5e20', fg: '#ffd600', stroke: '#1b5e20', border: '#ffd600' });
  world.landmarks.souvenirStand = new THREE.Vector3(-40, 0, 59.1);   // shopper stands here, facing the counter (north)
  // crates behind the stand (jump puzzle up to a gem)
  const crate = (x, z, h) => { B.box(C.wood2, 1.6, h, 1.6, x, 0, z); for (let y = 0.5; y < h; y += 1) B.box(C.green, 1.62, 0.18, 1.62, x, y - 0.09, z); world.addCollider(x, h / 2, z, 1.6, h, 1.6); world.addPlatform(x - 0.8, x + 0.8, z - 0.8, z + 0.8, h); };
  crate(-38.3, 65.3, 1.0); crate(-41.7, 65.3, 2.0);
  // snack cart at (40, 62), facing north toward the motorcycle path
  B.begin(40, 0, 62, Math.PI);
  B.box(C.yellow, 3.0, 1.3, 1.6, 0, 0.45, 0); B.box(C.green, 3.1, 0.15, 1.7, 0, 1.75, 0); B.box(C.white, 2.6, 0.3, 1.3, 0, 1.9, 0);
  for (const [wx, wz] of [[-1, 0.95], [1, 0.95], [-1, -0.95], [1, -0.95]]) B.add(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10), C.dark, wx, 0.42, wz, Math.PI / 2, 0, 0);
  B.beam(C.dark, 1.5, 1.1, 0.6, 2.3, 1.5, 0.6, 0.05); B.beam(C.dark, 1.5, 1.1, -0.6, 2.3, 1.5, -0.6, 0.05); B.beam(C.dark, 2.3, 1.5, 0.6, 2.3, 1.5, -0.6, 0.05);
  B.cyl(C.white, 0.06, 0.06, 3.3, 0, 1.75, 0, 6); B.cone(C.pink2, 2.3, 0.9, 0, 4.4, 0, 8); B.cone(C.yellow, 2.42, 0.4, 0, 4.36, 0, 8); B.sphere(C.green, 0.2, 0, 5.35, 0);
  B.add(new THREE.ConeGeometry(0.36, 0.9, 8), C.wood2, -0.9, 2.65, 0, Math.PI, 0, 0); B.sphere(C.hotpink, 0.4, -0.9, 3.3, 0); B.sphere(C.yellow, 0.34, -0.9, 3.85, 0); B.sphere(0xe53935, 0.12, -0.9, 4.25, 0);
  B.cyl(C.white, 0.32, 0.26, 0.5, 0.9, 2.2, 0, 8); for (let i = 0; i < 3; i++) B.beam(0xc98a3b, 0.9 + (i - 1) * 0.1, 2.5, (i - 1) * 0.1, 0.9 + (i - 1) * 0.3, 3.4, (i - 1) * 0.25, 0.06);
  B.end();
  world.addCollider(40, 1, 62, 3.4, 2, 2.2);
  // snack counter dressing: a striped awning off the cart's parasol and a menu board, so it reads as a shop
  B.box(C.white, 3.4, 0.08, 1.4, 40, 2.35, 60.5); for (let i = 0; i < 4; i++) B.box(i % 2 ? C.hotpink : C.white, 0.85, 0.3, 0.1, 38.7 + i * 0.85, 2.05, 59.8);
  B.cyl(C.white, 0.05, 0.05, 2.35, 38.4, 0, 59.85, 6); B.cyl(C.white, 0.05, 0.05, 2.35, 41.6, 0, 59.85, 6);
  B.box(C.dark, 1.1, 1.4, 0.08, 43.2, 0.4, 60.8, 0.3); B.cyl(C.dark, 0.04, 0.04, 0.5, 43.2, 0, 60.85, 5);
  world.addCollider(43.2, 0.9, 60.8, 1.2, 1.8, 0.4);
  sign(ctx, 'SNACKS', 40, 2.72, 60.44, Math.PI, { w: 2.6, h: 0.62, bg: '#ffffff', fg: '#ff6fb5', stroke: '#1b5e20', border: '#ffd600' });
  sign(ctx, 'CHURROS - ICE CREAM - SNO-CONES', 43.2, 1.1, 60.74, Math.PI - 0.3, { w: 1.0, h: 1.2, bg: '#263238', fg: '#ffd600', stroke: '#1b5e20', border: '#ffffff' });
  world.landmarks.snackStand = new THREE.Vector3(40, 0, 58.6);       // shopper stands here, facing the cart (north)
}

// ---------------- flamingos + a friendly gator ----------------
function lagoonLife(ctx) {
  const { B, rng } = ctx;
  const flamingo = (x, z, ry) => {
    const g = terrainY(x, z);
    B.begin(x, g, z, ry);
    B.cyl(C.flamingo2, 0.045, 0.045, 1.05, 0.12, 0, -0.08, 5); B.cyl(C.flamingo2, 0.045, 0.045, 1.05, -0.12, 0, 0.08, 5);
    B.sphere(C.flamingo, 0.5, 0, 1.3, 0, 8, 6, 1.25, 0.85, 0.85);
    B.sphere(C.flamingo2, 0.36, -0.05, 1.42, 0, 6, 4, 1.1, 0.55, 0.95);
    B.beam(C.flamingo, 0.5, 1.5, 0, 0.95, 2.45, 0, 0.1); B.sphere(C.flamingo, 0.21, 0.98, 2.5, 0);
    B.add(new THREE.ConeGeometry(0.09, 0.42, 6), C.black, 1.22, 2.4, 0, 0, 0, -Math.PI / 2 - 0.55);
    B.sphere(C.black, 0.045, 1.05, 2.58, 0.17, 5, 4); B.sphere(C.black, 0.045, 1.05, 2.58, -0.17, 5, 4);
    B.end();
  };
  for (const a of [20, 55, 125, 160, 205, 245, 330]) {
    const r = a === 125 || a === 55 ? 0.93 : 0.9, rad = (a * Math.PI) / 180;
    flamingo(LAGOON.x + Math.cos(rad) * LAGOON.rx * r, LAGOON.z + Math.sin(rad) * LAGOON.rz * r, rng.range(0, Math.PI * 2));
  }
  // gator floating in the lagoon
  B.begin(-13, -0.5, -52, 0.5);
  B.box(C.gator, 3.0, 0.55, 1.1, 0, 0, 0); B.box(C.gator, 1.4, 0.4, 0.8, 2.1, 0.05, 0); B.box(0x5aa65e, 0.7, 0.25, 0.6, 2.9, 0.05, 0);
  B.sphere(C.yellow, 0.14, 1.85, 0.5, 0.3); B.sphere(C.yellow, 0.14, 1.85, 0.5, -0.3); B.sphere(C.black, 0.06, 1.95, 0.55, 0.3); B.sphere(C.black, 0.06, 1.95, 0.55, -0.3);
  B.box(C.gator, 1.4, 0.4, 0.7, -2.1, 0.07, 0.2, 0.3); B.box(C.gator, 1.1, 0.3, 0.45, -3.1, 0.12, 0.7, 0.7);
  for (let i = 0; i < 5; i++) B.cone(C.green2, 0.13, 0.3, -1.0 + i * 0.5, 0.55, 0, 4);
  B.end();
}

// ---------------- benches, trash cans, flower beds ----------------
function furniture(ctx) {
  const { B, rng, world } = ctx;
  let benchN = 0;
  const bench = (x, z, ry) => {
    B.begin(x, 0, z, ry);
    B.box(C.green, 1.8, 0.12, 0.5, 0, 0.48, 0); B.box(C.green, 1.8, 0.48, 0.1, 0, 0.6, -0.26, 0, -0.12);
    B.box(C.gold, 0.12, 0.85, 0.56, -0.85, 0, 0); B.box(C.gold, 0.12, 0.85, 0.56, 0.85, 0, 0);
    B.end();
    // seat: the sitter's feet go on the ground just in front of the slats, looking along the bench's local +z
    world.addSeat({ id: `bench${benchN++}`, position: new THREE.Vector3(x + Math.sin(ry) * 0.2, 0, z + Math.cos(ry) * 0.2), facing: ry, seatHeight: 0.6 });
  };
  const trash = (x, z) => { B.cyl(C.yellow, 0.4, 0.36, 0.85, x, 0, z, 10); B.cyl(C.green, 0.45, 0.45, 0.14, x, 0.85, z, 10); B.box(C.dark, 0.34, 0.1, 0.34, x, 0.97, z); };
  const bed = (x, z, w, d, ry = 0) => {
    B.begin(x, 0, z, ry);
    B.box(C.stone, w + 0.3, 0.32, d + 0.3, 0, 0, 0); B.box(0x5b3a1e, w, 0.42, d, 0, 0, 0);
    B.end();
    const n = Math.round(w * d * 1.6), c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i < n; i++) {
      const lx = rng.range(-w / 2 + 0.2, w / 2 - 0.2), lz = rng.range(-d / 2 + 0.2, d / 2 - 0.2);
      ctx.flowerSpots.push({ x: x + lx * c + lz * s, y: 0.42, z: z - lx * s + lz * c });
    }
  };
  const benches = [];
  for (const a of [100, 140, 180, 220, 260, 300]) { const r = (a * Math.PI) / 180, x = Math.cos(r) * 8.8, z = FOUNTAIN.z + Math.sin(r) * 8.8; benches.push([x, z, Math.atan2(-Math.cos(r), -Math.sin(r))]); }
  benches.push([-14.6, 36, Math.PI / 2], [14.6, 36, -Math.PI / 2], [-14.6, 47, Math.PI / 2], [14.6, 47, -Math.PI / 2]);
  benches.push([-33, 65.3, Math.PI], [33, 65.3, Math.PI], [-28, -15.3, Math.PI], [28, -15.3, Math.PI]);
  benches.push([-9, -31.5, Math.PI], [9, -31.5, Math.PI], [-36, 97.5, Math.PI], [-14, -80, Math.PI], [14, -80, Math.PI]);   // (36, 97.5) is now the playground
  benches.push([37.5, -36, -Math.PI / 2], [-24, 80, Math.PI / 2], [24, 80, -Math.PI / 2]);
  benches.forEach(([x, z, ry], i) => { bench(x, z, ry); if (i % 2 === 0) trash(x + Math.cos(ry) * 1.5, z - Math.sin(ry) * 1.5); });
  // plaza ring beds (skip where paths leave the plaza)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x = Math.cos(a) * 22.8, z = Math.sin(a) * 22.8;
    if (onPath(x, z, 2.4) || inPlot(x, z, 1)) continue;
    bed(x, z, 3.4, 1.4, -(a + Math.PI / 2));
  }
  bed(-7.5, 6.5, 2.4, 1.2); bed(7.5, 6.5, 2.4, 1.2);
  bed(-9.5, 102, 2.6, 1.2); bed(9.5, 102, 2.6, 1.2);
  bed(-16, -90, 3, 1.6); bed(16, -90, 3, 1.6); bed(-16, -99, 3, 1.6); bed(16, -99, 3, 1.6);
  bed(-13, -29, 2.4, 1.2); bed(13, -29, 2.4, 1.2);
  bed(-25, 91.5, 3, 1.5); bed(25, 91.5, 3, 1.5); bed(-25, 48.5, 3, 1.5); bed(25, 48.5, 3, 1.5);
  bed(-5, 97, 1.2, 1.2); bed(5, 97, 1.2, 1.2);
  // a wishing well in the courtyard
  B.cyl(C.stone, 1.1, 1.2, 1.0, 15, 0, -84, 12); B.cyl(0x6fb6ff, 0.9, 0.9, 0.1, 15, 0.9, -84, 12);
  B.cyl(C.wood, 0.1, 0.1, 2.2, 14.2, 1.0, -84, 6); B.cyl(C.wood, 0.1, 0.1, 2.2, 15.8, 1.0, -84, 6);
  B.cone(C.green, 1.6, 1.0, 15, 3.1, -84, 4, Math.PI / 4); B.box(C.wood, 1.8, 0.1, 1.8, 15, 3.0, -84);
  ctx.world.addCollider(15, 0.6, -84, 2.5, 1.2, 2.5);
}

function beach({ B, world }) {
  let n = 0;
  const umbrella = (x, z) => { B.cyl(C.white, 0.05, 0.05, 2.5, x, 0, z, 6); B.cone(C.hotpink, 1.7, 0.75, x, 2.2, z, 8); B.cone(C.yellow, 1.8, 0.32, x, 2.16, z, 8); B.sphere(C.yellow, 0.1, x, 3.0, z); world.addCollider(x, 1.2, z, 0.3, 2.4, 0.3); };
  const lounger = (x, z) => {
    B.box(C.yellow, 0.75, 0.12, 1.8, x, 0.3, z); B.box(C.yellow, 0.75, 0.7, 0.1, x, 0.3, z - 0.85, 0, -0.55); for (const [dx, dz] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) B.box(C.white, 0.08, 0.3, 0.08, x + dx, 0, z + dz);
    world.addSeat({ id: `beachLounger${n++}`, position: new THREE.Vector3(x, 0, z + 0.3), facing: 0, seatHeight: 0.42, anim: 'sit' }, { label: 'Lie down', sub: 'sun lounger' });
  };
  umbrella(-18, -34); lounger(-16.6, -34.2); lounger(-19.4, -34.2);
  umbrella(18, -34); lounger(19.4, -34.2);
}

// ---------------- palms (instanced) ----------------
function palms(ctx) {
  const { world, rng } = ctx;
  const P = new MeshBuilder();
  // trunk ~9.3 tall with a gentle lean; the crown sits at 9.3 so even the lowest frond tips stay above ~7.5 (camera-friendly)
  for (let i = 0; i < 3; i++) P.add(new THREE.CylinderGeometry(0.3 - i * 0.03, 0.42 - i * 0.04, 3.25, 7), C.trunk, i * 0.38 + 0.19, i * 3.05 + 1.6, 0, 0, 0, -0.12);
  for (let i = 0; i < 4; i++) P.add(new THREE.CylinderGeometry(0.44 - i * 0.03, 0.4 - i * 0.03, 0.18, 7), C.coconut, i * 0.38 * 0.95 + 0.1, i * 2.3 + 1.1, 0, 0, 0, -0.12);
  const crown = [1.2, 9.3, 0];
  for (let i = 0; i < 9; i++) { const g = new THREE.BoxGeometry(0.6, 0.08, 3.4); g.translate(0, 0, 1.6); P.add(g, i % 2 ? C.leaf : C.leaf2, crown[0], crown[1] + 0.2, crown[2], 0.35, (i / 9) * Math.PI * 2, 0); }
  for (let i = 0; i < 7; i++) { const g = new THREE.BoxGeometry(0.5, 0.08, 2.6); g.translate(0, 0, 1.2); P.add(g, C.leaf2, crown[0], crown[1] - 0.1, crown[2], 0.5, (i / 7) * Math.PI * 2 + 0.3, 0); }
  P.sphere(C.coconut, 0.24, crown[0] + 0.2, crown[1] - 0.25, crown[2] + 0.15); P.sphere(C.coconut, 0.24, crown[0] - 0.25, crown[1] - 0.3, crown[2] - 0.1); P.sphere(C.coconut, 0.22, crown[0], crown[1] - 0.35, crown[2] + 0.3);
  const geo = mergeGeometries(P.geoms, false);

  const spots = [];
  const put = (x, z, force = false) => { if (!force && !isClear(x, z, 2.5)) return false; for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < 5) return false; spots.push({ x, z }); return true; };
  // hand-placed: gem shade, entrance, lagoon shore, courtyard, plaza ring
  put(-28, -46, true); put(-15.5, 95.5, true); put(-8.5, 95, true); put(8.5, 95, true); put(-8.5, 99.5, true); put(8.5, 99.5, true);
  put(-18, -84.5, true); put(18, -84.5, true); put(-10, -102, true); put(10, -102, true);
  for (const a of [25, 60, 120, 155, 200, 235, 300, 335]) { const r = (a * Math.PI) / 180; put(LAGOON.x + Math.cos(r) * LAGOON.rx * 1.3, LAGOON.z + Math.sin(r) * LAGOON.rz * 1.35, true); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; put(Math.cos(a) * 25.5, Math.sin(a) * 25.5); }
  for (const [x, z] of ctx.forcedPalms) put(x, z, true);
  // along paths, then random lawn fill
  for (let tries = 0; tries < 700 && spots.length < 60; tries++) {
    const p = rng.pick(PATHS), t = rng(), side = rng() < 0.5 ? -1 : 1, off = p.w / 2 + rng.range(3.5, 7);
    if (p.a[0] >= 85) continue;   // the water park places its own palms
    const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz) || 1;
    put(p.a[0] + dx * t - (dz / len) * off * side, p.a[1] + dz * t + (dx / len) * off * side);
  }
  for (let tries = 0; tries < 1500 && spots.length < 90; tries++) put(rng.range(-128, 128), rng.range(-128, 100));
  ctx.palmSpots = spots;

  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), mats = [];
  let colliders = 0;
  spots.forEach((sp) => {
    const sc = rng.range(0.95, 1.3);
    q.setFromAxisAngle(_up, rng.range(0, Math.PI * 2)); s.set(sc, sc, sc); p.set(sp.x, terrainY(sp.x, sp.z) - 0.1, sp.z);
    mats.push(new THREE.Matrix4().compose(p, q, s));
    if (onPath(sp.x, sp.z, 5) || inReserved(sp.x, sp.z, 6) || sp.x > 118) { world.addCollider(sp.x, 3, sp.z, 0.9, 7, 0.9); colliders++; }
  });
  // one InstancedMesh per park quadrant so palms behind the player are culled instead of drawn park-wide
  for (const mesh of bucketInstances(geo, world.mat.vc, mats, PARK_CELL)) { mesh.castShadow = true; mesh.name = 'palms'; world.group.add(mesh); }
}

// ---------------- lamp spots along paths; bunting hangs from separate tall poles midway between lamps ----------------
function layoutLamps(ctx) {
  const spots = ctx.lampSpots, poles = (ctx.poleSpots = []);
  const ok = (x, z) => !(onPath(x, z, 0.3) || inPlot(x, z, 0.3) || inReserved(x, z, 0.5) || inWater(x, z, 1) || z > southWallZ(x) - 2.6 || Math.hypot(x, z - 100) < 9 || inWing(x, z, 0.5));
  for (const p of PATHS) {
    if (!p.lamps && !p.bunting) continue;
    const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, off = p.w / 2 + 1.3;
    const count = Math.max(1, Math.round(len / 14));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count, cx = p.a[0] + dx * t, cz = p.a[1] + dz * t;
      if (p.lamps) for (const side of [-1, 1]) {
        const x = cx + nx * off * side, z = cz + nz * off * side;
        if (ok(x, z)) spots.push({ x, y: 0, z });
      }
      if (p.bunting && (i < count - 1 || count === 1)) {
        // pole pair half a step further along (between lamp pairs), both sides must be clear
        const tp = count === 1 ? 0.5 : (i + 1) / count, px = p.a[0] + dx * tp, pz = p.a[1] + dz * tp, pair = [];
        for (const side of [-1, 1]) { const x = px + nx * off * side, z = pz + nz * off * side; if (ok(x, z)) pair.push([x, 8.5, z]); }
        if (pair.length === 2) { poles.push(pair[0], pair[1]); ctx.spans.push(pair); }
      }
    }
  }
  // a few around the plaza edge and the castle courtyard
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 16; const x = Math.cos(a) * 18.5, z = Math.sin(a) * 18.5; if (!onPath(x, z, -2) || Math.hypot(x, z - GAZEBO.z) < 8.5 || Math.hypot(x, z - FOUNTAIN.z) < 8) continue; spots.push({ x, y: 0, z }); }
  for (const [x, z] of [[-5, -78.5], [5, -78.5], [-5, -87], [5, -87]]) spots.push({ x, y: 0, z });
}

// candy-striped pennant poles (merged into the decor mesh); tops at 8.5 so the strings clear the camera
function buntingPoles({ B, poleSpots, world }) {
  for (const [x, top, z] of poleSpots) {
    world.addCollider(x, top / 2, z, 0.4, top, 0.4);
    B.cyl(C.green, 0.3, 0.36, 0.25, x, 0, z, 8); B.cyl(C.yellow, 0.09, 0.11, top - 0.25, x, 0.25, z, 7);
    for (let y = 1.2; y < top - 0.6; y += 1.5) B.cyl(C.green, 0.115, 0.115, 0.5, x, y, z, 7);
    B.sphere(C.hotpink, 0.22, x, top + 0.1, z);
  }
}

// ---------------- lamp posts (instanced) ----------------
function lamps(ctx) {
  const { world, rng } = ctx, spots = ctx.lampSpots;
  const L = new MeshBuilder();
  L.cyl(C.green, 0.34, 0.4, 0.3, 0, 0, 0, 8); L.cyl(C.green, 0.08, 0.12, 4.5, 0, 0.3, 0, 7);
  L.box(C.green, 0.62, 0.08, 0.62, 0, 4.7, 0); L.cone(C.green, 0.56, 0.42, 0, 5.28, 0, 4, Math.PI / 4); L.sphere(C.yellow, 0.1, 0, 5.76, 0, 6, 4);
  for (const s of [-1, 1]) { L.box(C.green, 0.08, 0.08, 0.5, s * 0.25, 4.78, 0); L.box(C.green, 0.5, 0.08, 0.08, 0, 4.78, s * 0.25); }
  const geo = mergeGeometries(L.geoms, false);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe082, emissive: 0xffc947, emissiveIntensity: 1.3, roughness: 0.4 });
  const glassGeo = new THREE.BoxGeometry(0.42, 0.5, 0.42);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), postMats = [], glassMats = [];
  spots.forEach((sp) => {
    q.setFromAxisAngle(_up, rng.range(0, Math.PI * 2)); p.set(sp.x, sp.y, sp.z);
    postMats.push(new THREE.Matrix4().compose(p, q, s));
    glassMats.push(new THREE.Matrix4().makeTranslation(sp.x, sp.y + 5.03, sp.z));
    world.addCollider(sp.x, sp.y + 2.4, sp.z, 0.5, 4.8, 0.5);
  });
  world.lampGlowMat = glowMat;   // the weather system brightens the lamp heads at night (one material shared by every bucket)
  // one InstancedMesh per park quadrant (the same partition for posts and heads) so only the quadrants in view are drawn and shadow-cast
  for (const posts of bucketInstances(geo, world.mat.vc, postMats, PARK_CELL)) { posts.castShadow = true; posts.name = 'lamps'; world.group.add(posts); }
  for (const glass of bucketInstances(glassGeo, glowMat, glassMats, PARK_CELL)) { glass.name = 'lampGlass'; world.group.add(glass); }
}

// ---------------- bunting: triangular pennants on sagging ropes ----------------
function bunting(ctx) {
  const { world } = ctx;
  const cols = [0xff6fb5, 0xffd600, 0x2ecc71, 0xffffff, 0x5bb0ff, 0x1b5e20].map((c) => new THREE.Color(c));
  const pos = [], col = [], rope = [];
  for (const [a, b] of ctx.spans) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const s = i / 12; pts.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - 3.2 * s * (1 - s), a[2] + (b[2] - a[2]) * s]); }
    for (let i = 0; i < 12; i++) rope.push(...pts[i], ...pts[i + 1]);
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, n = Math.max(3, Math.round(len / 1.1));
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n, px = a[0] + dx * s, pz = a[2] + dz * s, py = a[1] + (b[1] - a[1]) * s - 3.2 * s * (1 - s);
      const c = cols[(i + Math.abs(Math.round(a[0] + a[2]))) % cols.length];
      pos.push(px - ux * 0.3, py, pz - uz * 0.3, px + ux * 0.3, py, pz + uz * 0.3, px, py - 0.65, pz);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const flags = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); flags.name = 'bunting';
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
  const ropes = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x5d4037 }));
  world.group.add(flags, ropes);
}

// ---------------- bushes + hibiscus flowers (instanced) ----------------
function greenery(ctx) {
  const { world, rng } = ctx;
  const bushes = [];
  const putBush = (x, z) => {
    if (!isClear(x, z, 1.5)) return false;
    for (const b of bushes) if (Math.hypot(b.x - x, b.z - z) < 3) return false;
    for (const l of ctx.lampSpots) if (Math.hypot(l.x - x, l.z - z) < 2.2) return false;
    for (const [px, , pz] of ctx.poleSpots) if (Math.hypot(px - x, pz - z) < 2.2) return false;
    for (const p of ctx.palmSpots) if (Math.hypot(p.x - x, p.z - z) < 2.2) return false;
    bushes.push({ x, z, s: rng.range(0.9, 1.6) }); return true;
  };
  for (const p of PATHS) {
    const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
    for (let d = 3; d < len; d += 7) for (const side of [-1, 1]) if (rng() < 0.6) { const off = p.w / 2 + 2.4; putBush(p.a[0] + (dx / len) * d + nx * off * side, p.a[1] + (dz / len) * d + nz * off * side); }
  }
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; putBush(Math.cos(a) * 23.5, Math.sin(a) * 23.5); }
  for (let i = 0; i < 40; i++) { // around the moat
    const a = (i / 40) * Math.PI * 2, rx = MOAT.outer[0] + 3.5, rz = MOAT.outer[1] + 3.5;
    const x = CASTLE.x + Math.max(-rx, Math.min(rx, Math.cos(a) * rx * 1.4)), z = CASTLE.z + Math.max(-rz, Math.min(rz, Math.sin(a) * rz * 1.4));
    if (Math.abs(x) > 5 || z < CASTLE.z) if (!inWater(x, z, 1.5) && Math.abs(x) < 128 && z > -128) { if (!(Math.abs(x) < 6 && z > CASTLE.z)) bushes.push({ x, z, s: rng.range(1.0, 1.5) }); }
  }
  for (let tries = 0; tries < 800 && bushes.length < 150; tries++) putBush(rng.range(-128, 128), rng.range(-128, 100));

  const bushGeo = new THREE.DodecahedronGeometry(1, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x2f8f3a, roughness: 1, flatShading: true });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), bushMats = [];
  bushes.forEach((b) => {
    q.setFromAxisAngle(_up, rng.range(0, Math.PI * 2)); s.set(b.s, b.s * 0.75, b.s); p.set(b.x, b.s * 0.55, b.z);
    bushMats.push(new THREE.Matrix4().compose(p, q, s));
    const nf = rng() < 0.7 ? 2 : 0;
    for (let k = 0; k < nf; k++) { const a = rng.range(0, Math.PI * 2), r = rng.range(0.1, 0.5) * b.s; ctx.flowerSpots.push({ x: b.x + Math.cos(a) * r, y: b.s * 0.75 + 0.5 - 0.45, z: b.z + Math.sin(a) * r }); }
  });
  for (const bm of bucketInstances(bushGeo, bushMat, bushMats, PARK_CELL)) { bm.castShadow = true; bm.name = 'bushes'; world.group.add(bm); }

  // flowers: stems (green), heads (per-instance color), centres (yellow)
  const F = ctx.flowerSpots; if (!F.length) return;
  const stemB = new MeshBuilder();
  stemB.cyl(0x2f9a3e, 0.025, 0.035, 0.46, 0, 0, 0, 5); const leaf = new THREE.BoxGeometry(0.2, 0.03, 0.1); leaf.translate(0.1, 0, 0); stemB.add(leaf, 0x2f9a3e, 0, 0.2, 0, 0, 0.6, 0.3);
  const stemGeo = mergeGeometries(stemB.geoms, false);
  const petals = [];
  for (let i = 0; i < 5; i++) { const g = new THREE.BoxGeometry(0.3, 0.05, 0.17); g.translate(0.17, 0.48, 0); g.rotateY((i / 5) * Math.PI * 2); petals.push(g); }
  const headGeo = mergeGeometries(petals, false);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 }), F.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), F.length);
  const centres = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: 0.8 }), F.length);
  stems.name = 'flowerStems'; heads.name = 'flowerHeads'; centres.name = 'flowerCentres';
  const palette = [0xff3d6e, 0xff8fc2, 0xffd600, 0xff7a1a, 0xffffff, 0xb455ff, 0xff5fa2].map((c) => new THREE.Color(c));
  F.forEach((f, i) => {
    const sc = rng.range(0.9, 1.35);
    q.setFromAxisAngle(_up, rng.range(0, Math.PI * 2)); s.set(sc, sc, sc); p.set(f.x, f.y, f.z);
    m.compose(p, q, s);
    stems.setMatrixAt(i, m); heads.setMatrixAt(i, m);
    centres.setMatrixAt(i, m.makeTranslation(f.x, f.y + 0.5 * sc, f.z));
    heads.setColorAt(i, rng.pick(palette));
  });
  world.group.add(stems, heads, centres);
}

const _up = new THREE.Vector3(0, 1, 0);
