// Park layout shared by the world sub-builders. PLOTS mirrors LAYOUT in src/rides/index.js
// (kept in sync by hand — the world must not import ride modules). All units are world metres.
export const PLOTS = [
  { id: 'coaster',    x: -78, z: -30, w: 70, d: 60 },
  { id: 'logflume',   x: 78,  z: -30, w: 60, d: 60 },
  { id: 'carousel',   x: -30, z: 30,  w: 26, d: 26 },
  { id: 'ferris',     x: 30,  z: 30,  w: 30, d: 30 },   // rotated 90°, so reserve the full 30x30
  { id: 'teacups',    x: 0,   z: 70,  w: 26, d: 26 },
  { id: 'lightcycle', x: -80, z: 70,  w: 60, d: 60 },
  { id: 'motorcycle', x: 80,  z: 70,  w: 60, d: 60 },
  // water park wing (east of x = 122)
  { id: 'waterslide', x: 160, z: -30, w: 60, d: 60 },
  { id: 'lazyriver',  x: 160, z: 45,  w: 64, d: 64 },
];

// Ride stations (world space, measured from the built rides — keep in sync with src/rides/*.js build()).
// Service paths below end just at these spots; the queue gaps they aim for are noted per ride.
export const STATIONS = {
  coaster:    [-72, -4.5],   // queue gap x -73..-67, approached from z > 0
  logflume:   [80, -5],      // queue gap x 81..85, approached from z > 0
  carousel:   [-18.7, 30],
  ferris:     [22.6, 30],
  teacups:    [0, 58],
  lightcycle: [-80, 99.5],   // south of the arena gate (gap x -83.4..-76.6 at z 95)
  motorcycle: [103, 95.5],   // east of the grandstand, south of the arena gate (x 101..105 at z 93.5)
  waterslide: [166, 1],      // south edge of the slide plot, on the Splash Cove promenade
  lazyriver:  [150, 15],     // north edge of the river plot, on the promenade
};

// Paths: centre-line segments a->b, width w. `lamps` = lamp posts along both sides, `bunting` = pennant strings across.
export const PATHS = [
  { id: 'entrance',  a: [0, 103],   b: [0, 88],    w: 10, lamps: true, bunting: true },
  { id: 'ringS',     a: [-20, 88],  b: [20, 88],   w: 6,  lamps: true, bunting: true },
  { id: 'ringN',     a: [-20, 52],  b: [20, 52],   w: 6,  lamps: true, bunting: true },
  { id: 'ringW',     a: [-20, 88],  b: [-20, 52],  w: 6,  lamps: true },
  { id: 'ringE',     a: [20, 88],   b: [20, 52],   w: 6,  lamps: true },
  { id: 'teaS',      a: [0, 88],    b: [0, 83.5],  w: 5 },
  { id: 'teaN',      a: [0, 52],    b: [0, 56.5],  w: 5 },
  { id: 'aveW',      a: [-10, 52],  b: [-10, 17],  w: 6,  lamps: true },
  { id: 'aveE',      a: [10, 52],   b: [10, 17],   w: 6,  lamps: true },
  { id: 'aveC',      a: [0, 52],     b: [0, 20],    w: 6,  lamps: true, bunting: true },   // straight on to the gazebo
  { id: 'carousel',  a: [-10, 30],  b: [-17, 30],  w: 5 },
  { id: 'ferris',    a: [10, 30],   b: [20.5, 30], w: 5 },
  { id: 'lightcycle',a: [-20, 70],  b: [-50, 70],  w: 6,  lamps: true, bunting: true },
  { id: 'motorcycle',a: [20, 70],   b: [50, 70],   w: 6,  lamps: true, bunting: true },
  { id: 'coaster',   a: [-14, -10], b: [-43, -10], w: 6,  lamps: true, bunting: true },
  { id: 'logflume',  a: [14, -10],  b: [48, -10],  w: 6,  lamps: true, bunting: true },
  { id: 'lookout',   a: [33, -10],  b: [33, -40],  w: 4 },
  { id: 'north',     a: [0, -18],   b: [0, -35],   w: 8,  lamps: true, bunting: true },
  { id: 'castleGap', a: [0, -61],   b: [0, -65],   w: 8 },
  { id: 'courtyard', a: [0, -76],   b: [0, -86],   w: 6 },
  // --- service paths to the ride stations (skirt the plots, then a short stub into the queue gap) ---
  { id: 'coasterS',  a: [-40.5, -10], b: [-40.5, 2.5], w: 5 },
  { id: 'coasterW',  a: [-40.5, 2.5], b: [-70, 2.5],   w: 5, lamps: true },
  { id: 'coasterIn', a: [-70, 2.5],   b: [-70, -2],    w: 5 },
  { id: 'flumeS',    a: [45.5, -10],  b: [45.5, 2.5],  w: 5 },
  { id: 'flumeE',    a: [45.5, 2.5],  b: [83, 2.5],    w: 5, lamps: true },
  { id: 'flumeIn',   a: [83, 2.5],    b: [83, -1.5],   w: 5 },
  { id: 'gridS',     a: [-20, 88],    b: [-20, 102.5], w: 6 },
  { id: 'gridW',     a: [-20, 102.5], b: [-82, 102.5], w: 5, lamps: true },
  { id: 'gridIn',    a: [-80, 102.5], b: [-80, 97.5],  w: 5 },
  { id: 'bikeS',     a: [20, 88],     b: [20, 102.5],  w: 6 },
  { id: 'bikeE',     a: [20, 102.5],  b: [103, 102.5], w: 5, lamps: true },
  { id: 'bikeIn',    a: [103, 102.5], b: [103, 96.5],  w: 5 },
  // --- Splash Cove water park: from the flume service path east to the gate at (122, 8), then the promenade ---
  { id: 'splashW',    a: [85.5, 2.5],  b: [108, 2.5],   w: 6, lamps: true, bunting: true },
  { id: 'splashBend', a: [108, 2.5],   b: [114.6, 8],   w: 6 },
  { id: 'splashGate', a: [114.6, 8],   b: [123, 8],     w: 8 },
  { id: 'splashProm', a: [122, 8],     b: [196, 8],     w: 12 },   // blue pool-deck promenade (drawn as tile in terrain.js)
  { id: 'slideIn',    a: [166, 8],     b: [166, 0.5],   w: 5 },
  { id: 'riverIn',    a: [150, 8],     b: [150, 15.5],  w: 5 },
  { id: 'snackIn',    a: [134, 8],     b: [134, 27],    w: 5 },
  { id: 'poolIn',     a: [138, 8],     b: [138, -14],   w: 5 },
];

export const PLAZA_R = 20;
export const LAGOON = { x: 0, z: -48, rx: 22, rz: 12 };
export const CASTLE = { x: 0, z: -91, halfW: 22, halfD: 15 };           // wall centre lines
export const MOAT = { inner: [24.5, 18.5], outer: [30.5, 24.5], r: 4 };  // rounded-rect half sizes around CASTLE
export const BRIDGE = { minX: -3.5, maxX: 3.5, minZ: -63, maxZ: -33, top: 0.3 };
export const DRAWBRIDGE = { minX: -4, maxX: 4, minZ: -76, maxZ: -64, top: 0.35 };
export const GAZEBO = { x: 0, z: 12, r: 6.5 };
export const FOUNTAIN = { x: 0, z: -4, r: 4.3 };
export const WATER_DEPTH = 0.6;
// Splash Cove wing (mirrors WATER_PARK in src/rides/index.js): x 122..200, z -70..85; swimsuit line at x = 122.
export const WING = { minX: 122, maxX: 200, minZ: -70, maxZ: 85, gateZ: 8, gateHalf: 6, fenceX: 204 };
export const WAVE_POOL = { x: 136, z: -39, hx: 10, hz: 17, r: 4 };   // rounded-rect wave pool, floor at -WATER_DEPTH
// South boundary wall: a shallow bay — z=104 beside the gate, angling out to z=110 so the Grid Riders and
// Thunder Bikes stations (z ≈ 96–100) keep clear space and the camera has room behind the player.
export const SOUTH_WALL = { gateHalf: 5, nearZ: 104, farZ: 110, bendStart: 10, bendEnd: 16 };
export function southWallZ(x) {
  const a = Math.abs(x), W = SOUTH_WALL;
  if (a <= W.bendStart) return W.nearZ;
  if (a >= W.bendEnd) return W.farZ;
  return W.nearZ + ((a - W.bendStart) / (W.bendEnd - W.bendStart)) * (W.farZ - W.nearZ);
}

function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
function rboxSDF(px, pz, hx, hz, r) {
  const qx = px - hx + r, qz = pz - hz + r;
  return Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - r;
}

/** Terrain height (0 on land, dipping to -WATER_DEPTH inside the lagoon and the castle moat). */
export function terrainY(x, z) {
  let y = 0;
  const ex = (x - LAGOON.x) / LAGOON.rx, ez = (z - LAGOON.z) / LAGOON.rz;
  const d = Math.sqrt(ex * ex + ez * ez);
  if (d < 1) y = -WATER_DEPTH * smooth(1, 0.86, d);
  const px = Math.abs(x - CASTLE.x), pz = Math.abs(z - CASTLE.z);
  if (px < MOAT.outer[0] + 1 && pz < MOAT.outer[1] + 1) {
    const so = rboxSDF(px, pz, MOAT.outer[0], MOAT.outer[1], MOAT.r);
    if (so < 0) {
      const si = rboxSDF(px, pz, MOAT.inner[0], MOAT.inner[1], MOAT.r);
      if (si > 0) y = Math.min(y, -WATER_DEPTH * smooth(0, 1.4, Math.min(-so, si)));
    }
  }
  // wave pool in the water park: sandy slope in, flat floor
  const wx = Math.abs(x - WAVE_POOL.x), wz = Math.abs(z - WAVE_POOL.z);
  if (wx < WAVE_POOL.hx + 1 && wz < WAVE_POOL.hz + 1) {
    const sd = rboxSDF(wx, wz, WAVE_POOL.hx, WAVE_POOL.hz, WAVE_POOL.r);
    if (sd < 0) y = Math.min(y, -WATER_DEPTH * smooth(0, 1.8, -sd));
  }
  return y;
}

/** True inside the Splash Cove wing (swimsuit zone). */
export function inWing(x, z, margin = 0) {
  return x > WING.minX - margin && x < WING.maxX + margin && z > WING.minZ - margin && z < WING.maxZ + margin;
}

export function inWater(x, z, margin = 0) {
  if (terrainY(x, z) < 0) return true;
  if (!margin) return false;
  return terrainY(x + margin, z) < 0 || terrainY(x - margin, z) < 0 || terrainY(x, z + margin) < 0 || terrainY(x, z - margin) < 0;
}

export function inPlot(x, z, margin = 0) {
  for (const p of PLOTS) if (Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin) return true;
  return false;
}

function distToSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function onPath(x, z, margin = 0) {
  if (Math.hypot(x, z) < PLAZA_R + margin) return true;
  for (const p of PATHS) if (distToSeg(x, z, p.a[0], p.a[1], p.b[0], p.b[1]) < p.w / 2 + margin) return true;
  if (Math.abs(x) < 4 + margin && z < -33 + margin && z > -76 - margin) return true; // bridges
  return false;
}

/** True if (x,z) is open lawn: not a ride plot, path, water, castle, gazebo/fountain or outside the fence. */
export function isClear(x, z, margin = 2) {
  if (x > 118) return false;   // the water park wing is dressed by hand (waterpark.js)
  if (Math.abs(x) > 130 - margin || z > southWallZ(x) - 3 - margin || z < -130 + margin) return false;
  if (inPlot(x, z, margin) || onPath(x, z, margin) || inWater(x, z, margin + 1)) return false;
  if (Math.abs(x - CASTLE.x) < CASTLE.halfW + 4 + margin && Math.abs(z - CASTLE.z) < CASTLE.halfD + 4 + margin) return false;
  if (Math.hypot(x - GAZEBO.x, z - GAZEBO.z) < GAZEBO.r + 2 + margin) return false;
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 2 + margin) return false;
  return true;
}
