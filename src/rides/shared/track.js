// Generic track helpers shared by the track rides (coaster, log flume).
// A Track samples a closed Curve3 at uniform arc length and precomputes a smooth
// orientation frame (forward = tangent, up = computed) per sample so vehicles can be
// placed with trackAt(s) in O(1). Also: rail / pillar builders and a canvas text sign.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

/** Quaternion whose +Z is `tan` and +Y is `up` (both unit, orthogonal). */
export function frameQuat(tan, up, out) {
  _x.crossVectors(up, tan).normalize();
  _m.makeBasis(_x, up, tan);
  return out.setFromRotationMatrix(_m);
}

export class Track {
  /**
   * @param {THREE.Curve} curve closed curve
   * @param {object} o
   *   samples   number of arc-length samples (default 600)
   *   up(i, pos, tan, out) -> bool   optional override of the geometric up vector (e.g. inside a vertical loop)
   *   bank(i, pos, tan, curv, up) -> roll radians   optional banking roll about the tangent
   *   smooth    half-window (samples) for roll/up smoothing (default 4)
   */
  constructor(curve, o = {}) {
    this.curve = curve;
    const N = this.N = o.samples || 600;
    this.length = curve.getLength();
    this.ds = this.length / N;
    this.pos = []; this.tan = []; this.up = []; this.quat = []; this.curv = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      this.pos.push(curve.getPointAt(u));
      this.tan.push(curve.getTangentAt(u).normalize());
    }
    for (let i = 0; i < N; i++) {
      const tp = this.tan[(i + 1) % N], tm = this.tan[(i - 1 + N) % N];
      this.curv.push(tp.clone().sub(tm).divideScalar(2 * this.ds)); // dT/ds (curvature vector)
    }
    for (let i = 0; i < N; i++) {
      const t = this.tan[i], up = new THREE.Vector3();
      if (!(o.up && o.up(i, this.pos[i], t, up))) {
        up.copy(Y).addScaledVector(t, -Y.dot(t));
        if (up.lengthSq() < 1e-4) up.copy(this.up[i - 1] || Y);
      }
      up.addScaledVector(t, -up.dot(t)).normalize();
      this.up.push(up);
    }
    const sm = o.smooth ?? 4;
    if (o.bank) {
      let roll = [];
      for (let i = 0; i < N; i++) roll.push(o.bank(i, this.pos[i], this.tan[i], this.curv[i], this.up[i]));
      for (let pass = 0; pass < 2; pass++) roll = boxSmooth(roll, sm * 2);
      for (let i = 0; i < N; i++) this.up[i].applyAxisAngle(this.tan[i], roll[i]).normalize();
    }
    // vector-average the up vectors so frame changes are gentle, then re-orthogonalize
    const sm2 = [];
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3();
      for (let k = -sm; k <= sm; k++) v.add(this.up[(i + k + N) % N]);
      v.addScaledVector(this.tan[i], -v.dot(this.tan[i]));
      sm2.push(v.lengthSq() > 1e-6 ? v.normalize() : this.up[i].clone());
    }
    this.up = sm2;
    for (let i = 0; i < N; i++) this.quat.push(frameQuat(this.tan[i], this.up[i], new THREE.Quaternion()));
  }
  wrap(s) { s %= this.length; return s < 0 ? s + this.length : s; }
  /** Interpolated position / orientation at arc length s (wrapped). */
  trackAt(s, outPos, outQuat) {
    const f = this.wrap(s) / this.ds, i0 = Math.floor(f) % this.N, i1 = (i0 + 1) % this.N, fr = f - Math.floor(f);
    outPos.lerpVectors(this.pos[i0], this.pos[i1], fr);
    if (outQuat) outQuat.slerpQuaternions(this.quat[i0], this.quat[i1], fr);
    return outPos;
  }
  heightAt(s) {
    const f = this.wrap(s) / this.ds, i0 = Math.floor(f) % this.N, i1 = (i0 + 1) % this.N, fr = f - Math.floor(f);
    return this.pos[i0].y + (this.pos[i1].y - this.pos[i0].y) * fr;
  }
  upAt(s, out) { const i = Math.floor(this.wrap(s) / this.ds) % this.N; return out.copy(this.up[i]); }
  /** Arc length of the sample nearest to a point. */
  nearestS(point) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.N; i++) { const d = this.pos[i].distanceToSquared(point); if (d < bd) { bd = d; best = i; } }
    return best * this.ds;
  }
  /** Time for one lap given a speed profile: speedFn(s, v, dt) -> new v. */
  simulateLap(speedFn, dt = 1 / 60) {
    let s = 0, v = speedFn(0, 0, dt), t = 0;
    while (s < this.length && t < 600) { v = speedFn(s, v, dt); s += v * dt; t += dt; }
    return t;
  }
}

function boxSmooth(arr, k) {
  const N = arr.length, out = new Array(N);
  for (let i = 0; i < N; i++) { let a = 0; for (let j = -k; j <= k; j++) a += arr[(i + j + N) % N]; out[i] = a / (2 * k + 1); }
  return out;
}

/** Two round rails + a square spine beam + instanced cross ties. Returns a Group (3 draw calls). */
export function buildRails(track, o = {}) {
  const gauge = o.gauge ?? 1.2, railR = o.railR ?? 0.09, tieEvery = o.tieEvery ?? 1.2, radial = o.radial ?? 6;
  const g = new THREE.Group();
  const N = track.N, side = new THREE.Vector3();
  const left = [], right = [], spine = [];
  for (let i = 0; i < N; i++) {
    side.crossVectors(track.up[i], track.tan[i]).normalize();
    left.push(track.pos[i].clone().addScaledVector(side, gauge / 2));
    right.push(track.pos[i].clone().addScaledVector(side, -gauge / 2));
    spine.push(track.pos[i].clone().addScaledVector(track.up[i], -(o.spineDrop ?? 0.5)));
  }
  const tube = (pts, r, rad) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5), N, r, rad, true);
  const rails = new THREE.Mesh(mergeGeometries([tube(left, railR, radial), tube(right, railR, radial)]), o.railMat);
  g.add(rails);   // no shadow: the thin rails add thousands of shadow-pass triangles for a line the spine already draws
  if (o.spineMat) { const sp = new THREE.Mesh(tube(spine, o.spineR ?? 0.22, 4), o.spineMat); sp.castShadow = true; g.add(sp); }
  const count = Math.floor(track.length / tieEvery);
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(gauge + 0.5, 0.12, 0.28), o.tieMat, count);
  for (let k = 0; k < count; k++) {
    track.trackAt(k * tieEvery, _p, _q);
    track.upAt(k * tieEvery, _x);
    _p.addScaledVector(_x, -0.12);
    ties.setMatrixAt(k, _m.compose(_p, _q, _s));
  }
  ties.instanceMatrix.needsUpdate = true;
  g.add(ties);
  return g;
}

/**
 * Vertical support pillars from the ground up to the track every `every` metres.
 * Skips samples whose up vector isn't mostly vertical (loop sides/top) and places where
 * another lower track pass would be pierced. Returns an InstancedMesh.
 */
export function buildPillars(track, o = {}) {
  const every = o.every ?? 6, minH = o.minH ?? 1.2, drop = o.drop ?? 0.7, w = o.width ?? 0.45, lateral = o.lateral ?? 0;
  const mats = [], side = new THREE.Vector3(), pp = new THREE.Vector3();
  const n = Math.floor(track.length / every);
  for (let k = 0; k < n; k++) {
    const i = Math.floor((k * every) / track.ds) % track.N;
    const up = track.up[i];
    if (up.y < 0.7) continue;
    const p = pp.copy(track.pos[i]).addScaledVector(side.crossVectors(up, track.tan[i]).normalize(), lateral);
    const top = p.y - drop;
    if (top < minH) continue;
    let blocked = false;
    for (let j = 0; j < track.N && !blocked; j += 2) {
      const q = track.pos[j];
      if (q.y < p.y - 1.5 && Math.abs(q.x - p.x) < (o.clear ?? 1.6) && Math.abs(q.z - p.z) < (o.clear ?? 1.6)) blocked = true;
    }
    if (blocked) continue;
    mats.push(new THREE.Matrix4().compose(_p.set(p.x, top / 2, p.z), _q.identity(), _s.set(w, top, w)));
  }
  _s.set(1, 1, 1);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), o.mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = !!o.castShadow;
  return im;
}

/**
 * Coarse walk-through colliders along the ground-level parts of a track (rail height < maxH):
 * each low run is chopped into chunks of ~`step` metres and boxed from the ground to rail + lift.
 * Returns the number of boxes added.
 */
export function addTrackColliders(ride, track, o = {}) {
  const maxH = o.maxH ?? 2.2, half = (o.width ?? 1.8) / 2, step = o.step ?? 7, lift = o.lift ?? 0.6;
  let run = [], added = 0;
  const flush = () => {
    if (run.length >= 2) {
      const b = new THREE.Box3().setFromPoints(run);
      b.min.x -= half; b.max.x += half; b.min.z -= half; b.max.z += half; b.min.y = 0; b.max.y += lift;
      ride.addBoxCollider(b.getCenter(new THREE.Vector3()), b.getSize(new THREE.Vector3()));
      added++;
    }
    run = [];
  };
  // start on a high sample so a low run isn't split at the loop seam
  let start = 0;
  for (let i = 0; i < track.N; i++) if (track.pos[i].y >= maxH) { start = i; break; }
  for (let k = 0; k <= track.N; k++) {
    const p = track.pos[(start + k) % track.N];
    if (p.y < maxH) { run.push(p); if (run.length * track.ds >= step) flush(); } else flush();
  }
  flush();
  return added;
}

/**
 * Fit `lines` of text into a cw x ch canvas: shrink the font until the widest line fits
 * `maxW`, and if a single line would have to shrink below 60% split it into two lines at the
 * middle-most space. Returns { lines, size }. `font(size)` builds the CSS font string.
 */
export function fitText(ctx, text, cw, ch, maxW, font, o = {}) {
  let lines = Array.isArray(text) ? text.slice() : [String(text)];
  const sizeFor = (ls) => {
    let size = Math.floor((o.sizeFactor ?? 1) * ch / (ls.length + 0.6));
    ctx.font = font(size);
    const w = Math.max(...ls.map((l) => ctx.measureText(l).width));
    if (w > maxW) size = Math.floor(size * maxW / w);
    return size;
  };
  let size = sizeFor(lines);
  if (lines.length === 1 && lines[0].includes(' ')) {
    const full = Math.floor((o.sizeFactor ?? 1) * ch / 1.6);
    if (size < full * 0.6) {
      // split at the space nearest the middle of the string
      const str = lines[0], mid = str.length / 2;
      let best = -1, bd = Infinity;
      for (let i = 0; i < str.length; i++) if (str[i] === ' ' && Math.abs(i - mid) < bd) { bd = Math.abs(i - mid); best = i; }
      const two = [str.slice(0, best), str.slice(best + 1)];
      const s2 = sizeFor(two);
      if (s2 > size) { lines = two; size = s2; }
    }
  }
  ctx.font = font(size);
  return { lines, size };
}

/** Material for a text face: never coplanar-fights the board it sits on. */
export function signMaterial(tex, o = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.emissive ?? 0.35, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

/** Canvas-texture text sign (plane + backing board). Group is w x h, facing +Z. */
export function makeSign(text, o = {}) {
  const w = o.w ?? 8, h = o.h ?? 1.8, bg = o.bg ?? '#1b1b1b', fg = o.fg ?? '#ffcc33', border = o.border ?? '#ffcc33';
  const cw = 1024, ch = Math.round(cw * h / w);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, cw, ch);
  x.strokeStyle = border; x.lineWidth = 14; x.strokeRect(14, 14, cw - 28, ch - 28);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const { lines } = fitText(x, text, cw, ch, cw * 0.88, (sz) => `bold ${sz}px Impact, 'Arial Black', sans-serif`);
  lines.forEach((l, i) => x.fillText(l, cw / 2, ch * (i + 1) / (lines.length + 1)));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const g = new THREE.Group(); g.name = 'sign';
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(tex));
  face.position.z = 0.115;   // board front is at z 0.06: keep a clear gap so the face never z-fights
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.12), o.boardMat || new THREE.MeshStandardMaterial({ color: o.boardColor ?? 0x3a2a1a, roughness: 0.9 }));
  g.add(board, face);
  if (o.twoSided) { const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face.material); back.position.z = -0.115; back.rotation.y = Math.PI; g.add(back); }
  return g;
}

/**
 * Two-sided serif text board: a thin gold-edged box whose front and back faces carry the text
 * (box UVs read correctly from either side). Text is measured and shrunk / wrapped to fit.
 * o: { bg, fg, border, edge, padX (canvas px kept clear each side), decorate(ctx, w, h), emissive }
 */
export function makeTextBoard(text, w, h, o = {}) {
  const cw = 1024, ch = Math.max(128, Math.round(cw * h / w));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = o.bg ?? '#1e6b3c'; ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = o.border ?? '#d9a63a'; ctx.lineWidth = 18; ctx.strokeRect(14, 14, cw - 28, ch - 28);
  o.decorate?.(ctx, cw, ch);
  ctx.fillStyle = o.fg ?? '#f6d44a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  const pad = o.padX ?? 60;
  const { lines } = fitText(ctx, text, cw, ch, cw - 2 * pad, (sz) => `bold ${sz}px Georgia, "Times New Roman", serif`, { sizeFactor: 0.95 });
  lines.forEach((l, i) => ctx.fillText(l, cw / 2, ch * (i + 1) / (lines.length + 1) + 4));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const edge = new THREE.MeshStandardMaterial({ color: o.edge ?? 0xd9a63a, roughness: 0.5, metalness: 0.3 });
  const face = signMaterial(tex, { emissive: o.emissive ?? 0.2 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [edge, edge, edge, edge, face, face]);
  m.name = 'sign';
  return m;
}

/** One world-space box collider per instance of an InstancedMesh (pillars, posts, tyre stacks). */
export function addInstanceColliders(ride, im, o = {}) {
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const geo = im.geometry; geo.computeBoundingBox();
  const bb = geo.boundingBox, size = new THREE.Vector3(), center = new THREE.Vector3();
  const n = o.count ?? im.count;
  for (let i = 0; i < n; i++) {
    im.getMatrixAt(i, _m); _m.decompose(pos, q, sc);
    bb.getSize(size).multiply(sc); bb.getCenter(center).multiply(sc).add(pos);
    if (o.minW) { size.x = Math.max(size.x, o.minW); size.z = Math.max(size.z, o.minW); }
    if (o.height) { center.y = o.height / 2; size.y = o.height; }
    ride.addBoxCollider(center.clone(), size.clone());
  }
}

/** Scrolling stripes/ripples CanvasTexture for water & conveyor belts. */
export function makeStripeTexture(o = {}) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = o.bg ?? '#2a7fd4'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = o.fg ?? '#8fd3ff';
  const n = o.count ?? 6;
  for (let i = 0; i < n; i++) {
    const y = (i / n) * 128 + ((i % 2) ? 6 : 0);
    if (o.ripple) { for (let k = 0; k < 4; k++) x.fillRect(((k * 37 + i * 19) % 128), y, 22 + (k * 7) % 12, 4); }
    else x.fillRect(0, y, 128, 128 / n * 0.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Decorative fence around a ride plot with one gap at the queue, plus coarse colliders (one box per fence
 * run, not per post). Everything is in ride-local space.
 *   rect: { x0, x1, z0, z1 }   explicit rectangle — or w / d (plot footprint, centred) with `inset` (default 1)
 *   side: 'S' (+z) | 'N' (−z) | 'E' (+x) | 'W' (−x)   which side holds the gap (default: the side nearest ride.station)
 *   gap:  width (centred on the station's coordinate along that side) or [a, b] explicit range (default 8)
 *   runs: extra straight runs [[x0, z0, x1, z1], ...] (e.g. rails that join a queue to the fence)
 *   colors: { post, cap, rail }   height (default 1.1)
 * Returns the fence Group (2 draw calls: instanced posts with finials, instanced rails).
 */
export function addPlotFence(ride, o = {}) {
  const inset = o.inset ?? 1, h = o.height ?? 1.1, every = o.every ?? 2.4;
  const r = o.rect || { x0: -o.w / 2 + inset, x1: o.w / 2 - inset, z0: -o.d / 2 + inset, z1: o.d / 2 - inset };
  // station in local space → side nearest to it
  ride.group.updateMatrixWorld(true);
  const st = ride.group.worldToLocal(ride.station.clone());
  let side = o.side;
  if (!side) {
    const d = { S: Math.abs(st.z - r.z1), N: Math.abs(st.z - r.z0), E: Math.abs(st.x - r.x1), W: Math.abs(st.x - r.x0) };
    side = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  }
  const along = side === 'S' || side === 'N' ? st.x : st.z;
  const gap = Array.isArray(o.gap) ? o.gap : [along - (o.gap ?? 8) / 2, along + (o.gap ?? 8) / 2];
  // fence runs as [x0, z0, x1, z1]; the gap side is split in two
  const runs = [];
  const sideRun = (name, a, b) => {
    if (name !== side) { runs.push(a.concat(b)); return; }
    const horiz = name === 'S' || name === 'N';
    const lo = horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
    const fixed = horiz ? a[1] : a[0];
    const seg = (p, q) => (horiz ? [p, fixed, q, fixed] : [fixed, p, fixed, q]);
    if (gap[0] > lo + 0.3) runs.push(seg(lo, Math.min(gap[0], hi)));
    if (gap[1] < hi - 0.3) runs.push(seg(Math.max(gap[1], lo), hi));
  };
  sideRun('N', [r.x0, r.z0], [r.x1, r.z0]);
  sideRun('S', [r.x0, r.z1], [r.x1, r.z1]);
  sideRun('W', [r.x0, r.z0], [r.x0, r.z1]);
  sideRun('E', [r.x1, r.z0], [r.x1, r.z1]);
  for (const run of o.runs || []) runs.push(run);

  // geometry: post (box) + gold finial (sphere) baked into one vertex-coloured unit; rails as a unit box scaled per run
  const colors = { post: 0xfafafa, cap: 0xd9a63a, rail: 0x1e6b3c, ...(o.colors || {}) };
  const paint = (g, c) => { const col = new THREE.Color(c), n = g.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g; };
  const postGeo = mergeGeometries([paint(new THREE.BoxGeometry(0.16, h, 0.16).translate(0, h / 2, 0), colors.post), paint(new THREE.SphereGeometry(0.11, 8, 6).translate(0, h + 0.08, 0), colors.cap)]);
  const railGeo = paint(new THREE.BoxGeometry(1, 0.07, 0.07), colors.rail);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  const postM = [], railM = [];
  const y = o.y ?? 0;
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.4) continue;
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    _q.setFromAxisAngle(_yAxis, yaw);
    const n = Math.max(1, Math.round(len / every));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      postM.push(new THREE.Matrix4().compose(_p.set(x0 + (x1 - x0) * f, y, z0 + (z1 - z0) * f), _q, _s.set(1, 1, 1)));
    }
    _q.setFromAxisAngle(_yAxis, yaw + Math.PI / 2);   // the unit rail runs along +x; turn it onto the run
    for (const ry of [h * 0.42, h * 0.82]) railM.push(new THREE.Matrix4().compose(_p.set((x0 + x1) / 2, y + ry, (z0 + z1) / 2), _q, _s.set(len, 1, 1)));
    // one coarse collider per run (0.3 thick, 1.2 tall)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.max(0.3, Math.abs(x1 - x0) + 0.3), sz = Math.max(0.3, Math.abs(z1 - z0) + 0.3);
    ride.addBoxCollider(new THREE.Vector3(cx, y + 0.6, cz), new THREE.Vector3(sx, 1.2, sz));
  }
  _s.set(1, 1, 1);
  const g = new THREE.Group(); g.name = 'plotFence';
  const posts = new THREE.InstancedMesh(postGeo, mat, postM.length);
  postM.forEach((m, i) => posts.setMatrixAt(i, m));
  const rails = new THREE.InstancedMesh(railGeo, mat, railM.length);
  railM.forEach((m, i) => rails.setMatrixAt(i, m));
  posts.instanceMatrix.needsUpdate = true; rails.instanceMatrix.needsUpdate = true;
  posts.userData.noOcclude = true; rails.userData.noOcclude = true;   // thin: never pull the ride camera in
  // no shadows: a 0.16 m post's shadow is invisible, a hundred posts per ride in the shadow pass are not
  g.add(posts, rails);
  ride.group.add(g);
  g.userData.rect = r; g.userData.gap = { side, range: gap };
  return g;
}
const _yAxis = new THREE.Vector3(0, 1, 0);
