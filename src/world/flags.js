// Waving pennant flags (castle towers, gazebo, arch). One merged mesh; vertices waved on the CPU each frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from './builder.js';

const FW = 1.9, FH = 1.15;

/** defs: [{ x, y, z, color, scale? }] with (x,y,z) the top of the pole. */
export function buildFlags(world, defs) {
  const geoms = [], us = [];
  for (const d of defs) {
    const s = d.scale || 1;
    const g = new THREE.PlaneGeometry(FW * s, FH * s, 6, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) us.push(p.getX(i) / (FW * s) + 0.5); // 0 at the pole, 1 at the fly end
    g.translate(FW * s / 2, -FH * s / 2 - 0.05, 0);
    g.translate(d.x, d.y, d.z);
    paint(g, d.color);
    geoms.push(g);
  }
  if (!geoms.length) return null;
  const geo = mergeGeometries(geoms, false);
  const pos = geo.attributes.position, base = new Float32Array(pos.array), u = Float32Array.from(us);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
  mesh.name = 'flags'; mesh.castShadow = true;
  // a fixed bounding sphere (rest positions plus the furthest any vertex sways) instead of frustumCulled = false
  geo.computeBoundingSphere(); geo.boundingSphere.radius += 0.5;
  const poles = defs.map((d) => new THREE.Vector3(d.x, d.y, d.z));
  world.animated.push((dt, t) => {
    const p = world.game?.player?.position;
    if (p && !poles.some((c) => c.distanceToSquared(p) < 80 * 80)) return;   // nobody near enough to see a flag wave: skip the upload
    const a = pos.array;
    for (let i = 0, v = 0; i < a.length; i += 3, v++) {
      const k = u[v], ph = base[i + 2] * 0.3 + base[i] * 0.2; // per-flag phase from its location
      a[i + 2] = base[i + 2] + Math.sin(k * 5.5 - t * 6 + ph) * 0.28 * k;
      a[i + 1] = base[i + 1] + Math.sin(k * 4 - t * 4.5 + ph) * 0.09 * k;
    }
    pos.needsUpdate = true;
  });
  return mesh;
}
