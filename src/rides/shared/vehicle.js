// Shared helpers for the drive rides (light cycle + motorcycle): merged vertex-coloured
// meshes to keep draw calls low, a pooled particle burst, canvas textures, small math.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();

/**
 * Merge several primitive geometries into one, baking a per-part colour into a vertex
 * colour attribute. parts: [{ geo, pos?: [x,y,z], rot?: [x,y,z], scale?: [x,y,z], color }]
 * Every input geometry must carry the same attributes (position/normal/uv) — all the
 * built-in primitives do.
 */
export function mergeParts(parts) {
  const geos = parts.map(({ geo, pos, rot, scale, color }) => {
    const g = geo.clone();
    if (scale) g.scale(...scale);
    if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
    if (pos) g.translate(...pos);
    _c.set(color ?? 0xffffff);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

/** One Mesh from many coloured parts (single draw call). matOpts go to MeshStandardMaterial. */
export function coloredMesh(parts, matOpts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, ...matOpts });
  return new THREE.Mesh(mergeParts(parts), mat);
}

/** Procedural CanvasTexture; draw(ctx, w, h) paints it. */
export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  Object.assign(tex, opts);
  return tex;
}

/** Pooled burst of small unlit cubes (one InstancedMesh). Call update(dt) every frame. */
export class ParticleBurst {
  constructor(count = 48, size = 0.28) {
    this.count = count;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(count * 3); this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count); this.spin = new Float32Array(count);
    this.gravity = -9;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    this.update(0);
  }
  /** Spawn n particles at (x,y,z) with the given colour. */
  burst(x, y, z, color, n = this.count, speed = 7) {
    let spawned = 0;
    for (let i = 0; i < this.count && spawned < n; i++) {
      if (this.life[i] > 0) continue;
      spawned++;
      this.life[i] = 0.7 + Math.random() * 0.5;
      this.pos.set([x, y + Math.random() * 0.8, z], i * 3);
      const a = Math.random() * Math.PI * 2, r = speed * (0.4 + Math.random() * 0.6);
      this.vel.set([Math.cos(a) * r, 2 + Math.random() * speed * 0.8, Math.sin(a) * r], i * 3);
      this.spin[i] = (Math.random() - 0.5) * 12;
      this.mesh.setColorAt(i, _c.set(color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const { pos, vel, life } = this;
    let any = false;
    for (let i = 0; i < this.count; i++) if (life[i] > 0) { any = true; break; }
    if (!any && !this.mesh.visible) return;   // idle pool: nothing to move, nothing to upload
    for (let i = 0; i < this.count; i++) {
      if (life[i] > 0) {
        any = true;
        life[i] -= dt;
        vel[i * 3 + 1] += this.gravity * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const s = Math.max(0, Math.min(1, life[i] * 1.6));
        this._e.set(life[i] * this.spin[i], life[i] * this.spin[i] * 0.7, 0);
        this._m.compose(this._p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), this._q.setFromEuler(this._e), this._s.set(s, s, s));
      } else {
        this._m.makeScale(0, 0, 0);
      }
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = any;
  }
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Frame-rate independent exponential approach. */
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
/** Squared distance from point (px,pz) to segment (ax,az)-(bx,bz). */
export function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 1e-8 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}
