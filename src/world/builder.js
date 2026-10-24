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

/** A sign board: text drawn to a canvas, shown on a plane of size w x h (world units). */
export function makeTextSign(text, { w = 8, h = 2, bg = '#f48fb1', fg = '#ffd600', stroke = '#1b5e20', border = '#1b5e20', doubleSided = false, gap = 0.02 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = Math.max(64, Math.round(1024 * h / w));
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, r = Math.min(H * 0.25, 48);
  const draw = (txt) => {
    ctx.fillStyle = border; roundRect(ctx, 0, 0, W, H, r); ctx.fill();
    ctx.fillStyle = bg; roundRect(ctx, 12, 12, W - 24, H - 24, r * 0.8); ctx.fill();
    // auto-fit: shrink the font until the text fits the plate width
    let size = H * 0.62;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const setFont = () => { ctx.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", Impact, Arial, sans-serif`; };
    setFont();
    while (ctx.measureText(txt).width > W * 0.88 && size > 20) { size *= 0.94; setFont(); }
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = stroke;
    ctx.strokeText(txt, W / 2, H / 2 + size * 0.04);
    ctx.fillStyle = fg; ctx.fillText(txt, W / 2, H / 2 + size * 0.04);
  };
  draw(text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  const geo = new THREE.PlaneGeometry(w, h);
  let out;
  if (!doubleSided) out = new THREE.Mesh(geo, mat);
  else {
    // two planes back to back so the text reads correctly from both sides
    out = new THREE.Group();
    const a = new THREE.Mesh(geo, mat); a.position.z = gap;
    const b = new THREE.Mesh(geo, mat); b.position.z = -gap; b.rotation.y = Math.PI;
    out.add(a, b);
  }
  out.userData.setText = (txt) => { draw(String(txt)); tex.needsUpdate = true; };
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
