// Ground (vertex-colored grid with lagoon/moat depressions), pavers/paths, and the animated water surface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, C } from './builder.js';
import { PATHS, PLAZA_R, LAGOON, CASTLE, MOAT, FOUNTAIN, GAZEBO, WAVE_POOL, terrainY } from './layout.js';

function fract(v) { return v - Math.floor(v); }

export function buildGround(world) {
  // 280 deep, 350 wide: the extra 70 m to the east is the Splash Cove wing (x up to ~207)
  const sizeX = 350, sizeZ = 280;
  const g = new THREE.PlaneGeometry(sizeX, sizeZ, sizeX / 2, sizeZ / 2);
  g.rotateX(-Math.PI / 2); g.translate(sizeX / 2 - 142.5, 0, 0);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const grassA = new THREE.Color(0x4fae3a), grassB = new THREE.Color(0x74cc50), sand = new THREE.Color(0xe9d49c), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainY(x, z);
    pos.setY(i, y);
    const h = 0.5 + 0.3 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.25 * (fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) - 0.5);
    c.lerpColors(grassA, grassB, Math.min(1, Math.max(0, h)));
    if (y < -0.02) c.lerp(sand, Math.min(1, -y / 0.35));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, world.mat.grass);
  mesh.receiveShadow = true; mesh.name = 'ground';
  return mesh;
}

/** Paths and plaza as thin paver slabs. Heights differ by a hair per slab to avoid z-fighting at overlaps. */
export function buildPaths(world) {
  const B = new MeshBuilder();
  PATHS.forEach((p, i) => {
    const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz) + p.w * 0.9;
    const h = 0.04 + i * 0.0015;
    const wing = p.a[0] >= 122;   // Splash Cove: blue pool tile instead of pavers
    B.box(wing ? (i % 2 ? 0x8fd3ea : 0x7cc6e2) : i % 2 ? C.paver : 0xf0bf9a, p.w, h, len, (p.a[0] + p.b[0]) / 2, 0, (p.a[1] + p.b[1]) / 2, Math.atan2(dx, dz));
  });
  // Splash Cove pool deck around the wave pool (pale blue tile) and the kiddie splash pad
  const W = WAVE_POOL;
  B.box(0xbfe9f5, W.hx * 2 + 7, 0.038, W.hz * 2 + 7, W.x, 0, W.z);
  B.cyl(0xa8e0f2, 6, 6, 0.09, 138, 0, -8, 24);
  B.ring(0xff6fb5, 5.6, 6.1, 138, 0.1, -8, 24);
  B.ring(C.yellow, 2.8, 3.3, 138, 0.1, -8, 24);
  // central plaza: pink disc with a dark-green edging ring and a golden ring around the fountain
  B.cyl(C.paver2, PLAZA_R, PLAZA_R, 0.075, 0, 0, 0, 56);
  B.ring(C.green, PLAZA_R - 0.5, PLAZA_R + 0.3, 0, 0.09, 0, 56);
  B.ring(0xf6d36b, FOUNTAIN.r + 0.3, FOUNTAIN.r + 2.8, FOUNTAIN.x, 0.09, FOUNTAIN.z, 40);
  // gazebo stage: white-pink octagon with a dark green rim (stays at ground level by design)
  B.ring(C.green, GAZEBO.r - 0.1, GAZEBO.r + 0.4, GAZEBO.x, 0.09, GAZEBO.z, 8);
  B.cyl(0xfff1f6, GAZEBO.r - 0.1, GAZEBO.r - 0.1, 0.092, GAZEBO.x, 0, GAZEBO.z, 8);
  // castle courtyard pavers
  B.box(0xf3d2dc, 40, 0.045, 26, CASTLE.x, 0, CASTLE.z);
  // entrance apron
  B.box(0xf0bf9a, 30, 0.043, 6, 0, 0, 100.5);
  const mesh = B.build(world.mat.vc);
  mesh.receiveShadow = true; mesh.name = 'paths';
  return mesh;
}

function ovalGrid(rx, rz, rings, segs) {
  const pos = [0, 0, 0], uv = [0.5, 0.5], idx = [];
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    for (let s = 0; s < segs; s++) { const a = (s / segs) * Math.PI * 2; pos.push(Math.cos(a) * rx * f, 0, Math.sin(a) * rz * f); uv.push(0.5 + Math.cos(a) * f * 0.5, 0.5 + Math.sin(a) * f * 0.5); }
  }
  const id = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * segs + (s % segs));
  for (let s = 0; s < segs; s++) idx.push(0, id(1, s + 1), id(1, s));
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = id(r, s), b = id(r, s + 1), c = id(r + 1, s), d = id(r + 1, s + 1);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function roundedRectPts(hx, hz, r, n = 6) {
  const pts = [];
  const corner = (cx, cz, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r)); } };
  corner(hx - r, hz - r, 0); corner(-hx + r, hz - r, Math.PI / 2); corner(-hx + r, -hz + r, Math.PI); corner(hx - r, -hz + r, Math.PI * 1.5);
  return pts;
}

/** One mesh: lagoon oval + moat ring + fountain pool. Vertices ripple in update(). */
export function buildWater(world) {
  const lagoon = ovalGrid(LAGOON.rx, LAGOON.rz, 7, 40);
  lagoon.translate(LAGOON.x, -0.2, LAGOON.z);
  const shape = new THREE.Shape(roundedRectPts(MOAT.outer[0], MOAT.outer[1], MOAT.r));
  shape.holes.push(new THREE.Path(roundedRectPts(MOAT.inner[0], MOAT.inner[1], MOAT.r)));
  const moat = new THREE.ShapeGeometry(shape, 4);
  moat.rotateX(-Math.PI / 2); moat.translate(CASTLE.x, -0.2, CASTLE.z);
  const pool = new THREE.CircleGeometry(FOUNTAIN.r - 0.35, 28);
  pool.rotateX(-Math.PI / 2); pool.translate(FOUNTAIN.x, 0.72, FOUNTAIN.z);
  // wave pool: low-res grid whose vertices roll with a travelling sine (the sandy slope hides its edges)
  const W = WAVE_POOL;
  const waveGrid = new THREE.PlaneGeometry(W.hx * 2 - 0.4, W.hz * 2 - 0.4, 10, 17);
  waveGrid.rotateX(-Math.PI / 2); waveGrid.translate(W.x, -0.1, W.z);
  const geo = mergeGeometries([lagoon, moat, pool, waveGrid], false);
  const mesh = new THREE.Mesh(geo, world.mat.water);
  mesh.name = 'water'; mesh.receiveShadow = true;
  const pos = geo.attributes.position, base = new Float32Array(pos.array);
  world.animated.push((dt, t) => {
    const a = pos.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = base[i], z = base[i + 2];
      if (x > 120) { // wave pool: slow rollers travelling toward the shallow (south) end
        a[i + 1] = base[i + 1] + 0.16 * Math.sin(z * 0.5 - t * 1.9) + 0.05 * Math.sin(x * 0.7 + t * 2.4);
        continue;
      }
      a[i + 1] = base[i + 1] + 0.05 * Math.sin(x * 0.55 + t * 1.6) + 0.04 * Math.sin(z * 0.8 - t * 1.25) + 0.02 * Math.sin((x + z) * 1.1 + t * 2.3);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return mesh;
}
