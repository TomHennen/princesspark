// Merged-geometry builder: many flat-colored primitives -> one vertex-colored Mesh (one draw call).
// Also: seeded RNG and CanvasTexture text signs. Shared by every world sub-builder.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

export class MeshBuilder {
  constructor() { this.geoms = []; this.frame = null; }
  /** Subsequent adds are expressed in a local frame (translate + yaw). Call end() to leave it. */
  begin(x, y, z, ry = 0) { this.frame = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, ry), _s.set(1, 1, 1)); return this; }
  end() { this.frame = null; return this; }
  /** Add a geometry with a flat color. (x,y,z) is where the geometry's origin goes; Euler order YXZ (roll, pitch, yaw). */
  add(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    if (this.frame) _m.premultiply(this.frame);
    geom.applyMatrix4(_m);
    paint(geom, color);
    this.geoms.push(geom);
    return geom;
  }
  /** Box placed by its bottom-centre. */
  box(color, w, h, d, x, yBottom, z, ry = 0, rx = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, yBottom + h / 2, z, rx, ry, 0); }
  cyl(color, rTop, rBottom, h, x, yBottom, z, segs = 12) { return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segs), color, x, yBottom + h / 2, z); }
  cone(color, r, h, x, yBottom, z, segs = 12, ry = 0) { return this.add(new THREE.ConeGeometry(r, h, segs), color, x, yBottom + h / 2, z, 0, ry, 0); }
  sphere(color, r, x, y, z, ws = 8, hs = 6, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  /** Flat ring lying on the ground (annulus), top at y. */
  ring(color, rInner, rOuter, x, y, z, segs = 48) { return this.add(new THREE.RingGeometry(rInner, rOuter, segs), color, x, y, z, -Math.PI / 2, 0, 0); }
  /** Cylinder between two points, in the current frame (chains, struts, necks). */
  beam(color, ax, ay, az, bx, by, bz, r = 0.08, segs = 6) {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az); const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, segs);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize()));
    g.translate(ax, ay, az);
    if (this.frame) g.applyMatrix4(this.frame);
    paint(g, color);
    this.geoms.push(g);
    return g;
  }
  count() { return this.geoms.length; }
  /** Merge everything added so far into one Mesh and reset. */
  build(material) {
    if (!this.geoms.length) return null;
    const merged = mergeGeometries(this.geoms, false);
    for (const g of this.geoms) g.dispose();
    this.geoms = [];
    merged.computeBoundingSphere();
    return new THREE.Mesh(merged, material);
  }
}

/** Give every vertex of a geometry the same color (writes a 'color' attribute). */
export function paint(geom, color) {
  _c.set(color);
  const n = geom.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

/** Deterministic RNG (mulberry32) so the park looks the same every visit. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return rnd;
}

/** A sign board: text drawn to a canvas, shown on a plane of size w x h (world units).
 *  Long text shrinks to fit (down to a minimum), then wraps onto two lines. Double-sided signs use two planes
 *  ≥ 0.03 apart with polygon offset so they never z-fight; still keep a sign ≥ 0.05 clear of any wall behind it. */
export function makeTextSign(text, { w = 8, h = 2, bg = '#f48fb1', fg = '#ffd600', stroke = '#1b5e20', border = '#1b5e20', doubleSided = false, gap = 0.03, minScale = 0.42 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = Math.max(64, Math.round(1024 * h / w));
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, r = Math.min(H * 0.25, 48);
  const font = (size) => { ctx.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", Impact, Arial, sans-serif`; };
  const fits = (txt, size) => { font(size); return ctx.measureText(txt).width <= W * 0.88; };
  // largest font size (≥ min) at which every line fits the plate width; null if even the minimum is too small
  const fitSize = (lines, max, min) => { let size = max; while (size > min && !lines.every((l) => fits(l, size))) size *= 0.94; return lines.every((l) => fits(l, size)) ? size : null; };
  // split into two lines at the space nearest the middle (by character count)
  const wrap = (txt) => {
    const words = txt.split(/\s+/).filter(Boolean); if (words.length < 2) return null;
    let best = null, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '); const d = Math.abs(a.length - b.length); if (d < bestDiff) { bestDiff = d; best = [a, b]; } }
    return best;
  };
  const draw = (txt) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = border; roundRect(ctx, 0, 0, W, H, r); ctx.fill();
    ctx.fillStyle = bg; roundRect(ctx, 12, 12, W - 24, H - 24, r * 0.8); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke;
    const full = H * 0.62;
    let lines = [txt], size = fitSize(lines, full, full * minScale);
    if (size === null) {
      const two = wrap(txt);
      if (two) { lines = two; size = fitSize(lines, H * 0.4, 14) ?? 14; } else size = fitSize(lines, full, 14) ?? 14;
    }
    const lh = size * 1.08, y0 = H / 2 + size * 0.04 - (lines.length - 1) * lh / 2;
    ctx.lineWidth = size * 0.14;
    lines.forEach((l, i) => { ctx.strokeText(l, W / 2, y0 + i * lh); ctx.fillStyle = fg; ctx.fillText(l, W / 2, y0 + i * lh); });
  };
  draw(text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // polygonOffset pulls the sign toward the camera in depth so a plate hung on a wall never z-fights with it
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const geo = new THREE.PlaneGeometry(w, h);
  let out;
  if (!doubleSided) out = new THREE.Mesh(geo, mat);
  else {
    // two planes back to back so the text reads correctly from both sides
    const g = Math.max(0.03, gap);
    out = new THREE.Group();
    const a = new THREE.Mesh(geo, mat); a.position.z = g;
    const b = new THREE.Mesh(geo, mat); b.position.z = -g; b.rotation.y = Math.PI;
    out.add(a, b);
  }
  out.userData.setText = (txt) => { draw(String(txt)); tex.needsUpdate = true; };
  out.userData.sign = { w, h };
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// Park palette — deep green + sunny yellow, on princess pink / sandstone.
export const C = {
  green: 0x1b5e20, green2: 0x2e7d32, leaf: 0x3cab45, leaf2: 0x2f9a3e, hedge: 0x2f7d32,
  yellow: 0xffd600, gold: 0xf9c80e, cream: 0xfff3c4,
  pink: 0xf7c6d9, pink2: 0xf48fb1, hotpink: 0xff6fb5, wall: 0xfbe4ec, stone: 0xe9b8cc, paver: 0xf2c9a8, paver2: 0xf5b8cf,
  white: 0xfafafa, wood: 0x8d5a2b, wood2: 0xa9713d, dark: 0x263238, glass: 0x4f7fc0, black: 0x1a1a1a,
  trunk: 0x9b6b43, coconut: 0x5d3a1a, water: 0x45c6f5, flamingo: 0xff7bac, flamingo2: 0xe8528d, gator: 0x3f9142,
  skyTop: 0x2f86d9, horizon: 0xd8eefb,
};
