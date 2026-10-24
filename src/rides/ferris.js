// Sunshine Wheel — tall ferris wheel: two A-frames, instanced spokes, twin rims, a smiling
// emissive sun at the hub and twelve upright gondolas. Built in local space with the axle
// along local Z (wheel face in local X–Y); LAYOUT's rotationY turns it to face the park.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';

const TAU = Math.PI * 2;
const GREEN = 0x1e6b3c, YELLOW = 0xf6d44a, PINK = 0xf48fb1, GOLD = 0xd9a63a, CREAM = 0xfff3dc, WHITE = 0xfafafa, STEEL = 0x2a5a3a;
const R = 10.5, HUB_Y = 14.6, N = 12, HALF_W = 0.7;
const OMEGA = TAU / 40;                // one revolution per 40 s
const GONDOLA_FLOOR = -3.47;           // gondola floor height relative to its rim mount

// ---------- tiny procedural-geometry kit ----------
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
function piece(geo, color, pos = [0, 0, 0], rot = null, scl = null, pre = null) {
  if (scl) geo.scale(scl[0], scl[1], scl[2]);
  if (pre) geo.translate(pre[0], pre[1], pre[2]);
  if (rot) geo.applyMatrix4(_m.makeRotationFromEuler(_e.set(rot[0], rot[1], rot[2])));
  geo.translate(pos[0], pos[1], pos[2]);
  _c.set(color);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function fuse(pieces, matOpts = {}) {
  const g = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, ...matOpts }));
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s = 16) => new THREE.ConeGeometry(r, h, s);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const tor = (r, t, arc = TAU, ts = 8, rs = 32) => new THREE.TorusGeometry(r, t, ts, rs, arc);

function textTexture(text, { bg = '#1e6b3c', fg = '#f6d44a', border = '#d9a63a', w = 1024, h = 256, size = 150 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 18; ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = fg; ctx.font = `bold ${size}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.fillText(text, w / 2, h / 2 + 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function textBoard(text, w, h, opts) {
  const tex = textTexture(text, opts);
  const edge = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, metalness: 0.3 });
  const mats = [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })];
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mats);
}
function sunFaceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#ffb067';
  for (const x of [70, 186]) { ctx.beginPath(); ctx.arc(x, 152, 18, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#5a3312'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  for (const x of [88, 168]) { ctx.beginPath(); ctx.arc(x, 112, 18, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(128, 132, 46, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** One gondola: hanger arms, conical roof, posts, open tub, bench. Origin = rim mount point. */
function gondola(color, trim) {
  const P = [];
  const armL = Math.hypot(0.9, 0.95), armA = Math.atan2(0.9, 0.95);
  for (const s of [-1, 1]) P.push(piece(box(0.09, armL, 0.09), GOLD, [s * 0.45, -0.475, 0], [0, 0, s * armA]));
  P.push(piece(cone(1.3, 0.6, 16), color, [0, -1.0, 0]));                          // roof
  P.push(piece(cyl(1.3, 1.3, 0.08, 16), trim, [0, -1.28, 0]));                      // roof lip
  for (let i = 0; i < 4; i++) { const a = (i + 0.5) * (TAU / 4); P.push(piece(cyl(0.05, 0.05, 1.3, 6), CREAM, [Math.sin(a) * 1.05, -1.95, Math.cos(a) * 1.05])); }
  P.push(piece(cyl(1.15, 0.95, 1.0, 16, true), color, [0, -3.05, 0]));             // tub wall (open)
  P.push(piece(cyl(0.96, 0.96, 0.08, 16), 0x8a6a4a, [0, -3.51, 0]));                // floor
  P.push(piece(tor(1.15, 0.06, TAU, 6, 24), trim, [0, -2.55, 0], [Math.PI / 2, 0, 0]));
  P.push(piece(box(1.5, 0.5, 0.6), CREAM, [0, -3.27, 0.45]));                       // bench (top = floor + 0.45)
  P.push(piece(box(1.5, 0.5, 0.1), CREAM, [0, -2.8, 0.78]));                        // backrest
  const g = new THREE.Group();
  const m = fuse(P, { side: THREE.DoubleSide }); m.castShadow = true; g.add(m);
  return g;
}

export class FerrisWheel extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Sunshine Wheel', kind: 'passive' });
    this.duration = 40;
    this.cameraOffset.set(0, 1.9, -5.0);     // low enough to look in under the gondola roof
    this.cameraLookOffset.set(0, 1.3, 10);
    this.tagline = 'Rise up slow and see the whole kingdom';
    this.angle = 0;
  }

  build() {
    const G = this.group;

    // ---- structure: A-frames, braces, ties, platform, steps, fence (one merged mesh) ----
    // S = solid pieces (occlude the camera), T = thin struts / rails (never do)
    const S = [], T = [];
    const legLen = Math.hypot(4.6, HUB_Y), legTilt = Math.atan2(4.6, HUB_Y);
    for (const z of [-1.9, 1.9]) {
      for (const s of [-1, 1]) {
        T.push(piece(box(0.55, legLen, 0.55), STEEL, [s * 2.3, HUB_Y / 2, z], [0, 0, s * legTilt]));
        S.push(piece(box(1.7, 0.6, 1.7), CREAM, [s * 4.6, 0.3, z]));
      }
      T.push(piece(box(6.2, 0.3, 0.3), STEEL, [0, 4.8, z]));
      T.push(piece(box(3.3, 0.3, 0.3), STEEL, [0, 9.6, z]));
    }
    for (const s of [-1, 1]) T.push(piece(box(0.3, 0.3, 3.8), STEEL, [s * 4.3, 0.95, 0]));   // ground ties
    // loading platform on the park side (local −Z)
    S.push(piece(box(6.4, 0.6, 3.0), 0xe6d9bd, [0, 0.3, -2.9]));
    S.push(piece(box(6.4, 0.08, 3.0), YELLOW, [0, 0.62, -2.9]));
    S.push(piece(box(3.2, 0.4, 0.8), 0xe6d9bd, [0, 0.2, -4.8]));
    S.push(piece(box(3.2, 0.2, 0.8), 0xe6d9bd, [0, 0.1, -5.6]));
    // fence rails (white) with posts
    const rail = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), yaw = Math.atan2(x2 - x1, z2 - z1);
      for (const y of [0.95, 1.35]) T.push(piece(box(0.06, 0.06, len), WHITE, [(x1 + x2) / 2, y, (z1 + z2) / 2], [0, yaw, 0]));
    };
    rail(-3.2, -1.4, -3.2, -4.4); rail(3.2, -1.4, 3.2, -4.4); rail(-3.2, -4.4, -1.6, -4.4); rail(3.2, -4.4, 1.6, -4.4);
    for (const [x, z] of [[-3.2, -1.4], [-3.2, -2.9], [-3.2, -4.4], [-1.6, -4.4], [1.6, -4.4], [3.2, -4.4], [3.2, -2.9], [3.2, -1.4]]) {
      T.push(piece(cyl(0.06, 0.06, 0.9, 6), WHITE, [x, 1.05, z]));
      T.push(piece(sph(0.08, 6, 4), GOLD, [x, 1.52, z]));
    }
    const structure = fuse(S); structure.receiveShadow = true; G.add(structure);
    const struts = fuse(T); struts.castShadow = true; struts.userData.noOcclude = true; G.add(struts);

    // axle (gold) through the hub
    const axle = new THREE.Mesh(cyl(0.3, 0.3, 4.6, 12), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8 }));
    axle.rotation.x = Math.PI / 2; axle.position.y = HUB_Y; axle.userData.noOcclude = true; G.add(axle);

    // ---- wheel (rotates about local Z) ----
    const wheel = new THREE.Group(); wheel.position.y = HUB_Y; G.add(wheel); this.wheel = wheel;
    const frame = fuse([
      piece(tor(R, 0.16, TAU, 8, 72), WHITE, [0, 0, -HALF_W]),
      piece(tor(R, 0.16, TAU, 8, 72), WHITE, [0, 0, HALF_W]),
      piece(tor(R - 1.2, 0.07, TAU, 6, 72), GOLD, [0, 0, -HALF_W]),
      piece(tor(R - 1.2, 0.07, TAU, 6, 72), GOLD, [0, 0, HALF_W]),
      piece(cyl(1.6, 1.6, 2.2, 24), GREEN, [0, 0, 0], [Math.PI / 2, 0, 0]),
    ], { roughness: 0.5, metalness: 0.2 });
    frame.userData.noOcclude = true; wheel.add(frame);   // rims are thin
    const spokeMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.5, metalness: 0.2 });
    const spokes = new THREE.InstancedMesh(box(0.1, R - 1.5, 0.1), spokeMat, N * 2);
    const ties = new THREE.InstancedMesh(box(0.14, 0.14, HALF_W * 2 + 0.3), spokeMat, N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      _q.setFromEuler(_e.set(0, 0, a - Math.PI / 2));
      for (const [k, z] of [[0, -HALF_W], [1, HALF_W]]) {
        spokes.setMatrixAt(i * 2 + k, _m.compose(_v.set(Math.cos(a) * (R + 1.5) / 2, Math.sin(a) * (R + 1.5) / 2, z), _q, _one));
      }
      ties.setMatrixAt(i, _m.compose(_v.set(Math.cos(a) * R, Math.sin(a) * R, 0), _q.identity(), _one));
    }
    spokes.userData.noOcclude = true; ties.userData.noOcclude = true; wheel.add(spokes, ties);

    // gondolas hang from the rim and are counter-rotated to stay upright
    const colors = [[YELLOW, GREEN], [GREEN, YELLOW], [PINK, CREAM]];
    this.gondolas = [];
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i / N) * TAU;
      const pivot = new THREE.Group(); pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      pivot.add(gondola(...colors[i % 3]));
      wheel.add(pivot);
      this.gondolas.push({ pivot, a });
    }
    // default seat in gondola 0 (re-parented on boarding); rider faces local −Z (over the park)
    this.seat.position.set(0, GONDOLA_FLOOR, 0); this.seat.rotation.y = Math.PI;
    this.gondolas[0].pivot.add(this.seat);

    // ---- sun at the hub (static, smiling toward the park and away) ----
    const sun = new THREE.Group(); sun.position.y = HUB_Y; G.add(sun);
    const sunMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.55, roughness: 0.6 });
    const drum = new THREE.Mesh(cyl(2.3, 2.3, 2.9, 32), sunMat); drum.rotation.x = Math.PI / 2; sun.add(drum);
    const faceTex = sunFaceTexture();
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, emissive: 0xffa500, emissiveMap: faceTex, emissiveIntensity: 0.5, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), faceMat);
      face.position.z = s * 1.46; if (s < 0) face.rotation.y = Math.PI;
      sun.add(face);
    }
    this.rayMat = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8c1a, emissiveIntensity: 0.8, roughness: 0.6 });
    const rays = new THREE.InstancedMesh(cone(0.42, 1.5, 4), this.rayMat, 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      rays.setMatrixAt(i, _m.compose(_v.set(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0), _q.setFromEuler(_e.set(0, 0, a - Math.PI / 2)), _one));
    }
    sun.add(rays); this.rays = rays;

    // ---- station dressing: sign and a tiny ticket hut, flanking the steps ----
    const sign = fuse([
      piece(cyl(0.1, 0.1, 3.2, 8), GOLD, [-5.3, 1.6, -6.0]), piece(cyl(0.1, 0.1, 3.2, 8), GOLD, [-3.1, 1.6, -6.0]),
      piece(sph(0.22, 8, 6), GOLD, [-4.2, 3.95, -6.0]),
    ], { roughness: 0.3, metalness: 0.8 });
    sign.userData.noOcclude = true; G.add(sign);
    const board = textBoard('Sunshine Wheel', 3.4, 0.85, { bg: '#f6d44a', fg: '#1e6b3c', border: '#1e6b3c', size: 130 });
    board.position.set(-4.2, 3.0, -6.0); board.rotation.y = Math.PI; G.add(board);
    const hut = fuse([
      piece(box(1.7, 2.2, 1.7), CREAM, [4.6, 1.1, -5.6]),
      piece(box(1.1, 0.7, 0.1), 0x1a2a3a, [4.6, 1.45, -6.46]),
      piece(box(1.4, 0.1, 0.4), 0x8a6a4a, [4.6, 1.05, -6.6]),
      piece(cone(1.45, 0.9, 4), GREEN, [4.6, 2.65, -5.6], [0, Math.PI / 4, 0]),
      piece(sph(0.16, 8, 6), GOLD, [4.6, 3.15, -5.6]),
    ]);
    G.add(hut);

    // ---- station + colliders ----
    G.updateMatrixWorld(true);
    this.station.copy(G.localToWorld(new THREE.Vector3(0, 0, -7.4)));
    this.stationRadius = 4;
    for (const s of [-1, 1]) this.addBoxCollider(new THREE.Vector3(s * 4.6, 1, 0), new THREE.Vector3(1.8, 2, 5.6));   // A-frame bases
    this.addBoxCollider(new THREE.Vector3(0, 0.5, -2.9), new THREE.Vector3(6.6, 1, 3.2));                                // platform deck
    this.addBoxCollider(new THREE.Vector3(4.6, 1.2, -5.6), new THREE.Vector3(2, 2.4, 2));                                 // hut
    this.addBoxCollider(new THREE.Vector3(-4.2, 1.6, -6.0), new THREE.Vector3(2.6, 3.2, 0.5));                            // sign
  }

  onBoard(player) {
    if (player?.cam) player.cam.yaw = Math.PI;             // orbit camera starts behind the rider, looking over the park
    // use the gondola nearest the bottom and end the ride when it comes back down after one revolution
    let best = null, bestD = Infinity, bestDelta = 0;
    for (const g of this.gondolas) {
      let d = -Math.PI / 2 - (g.a + this.angle);
      d = Math.atan2(Math.sin(d), Math.cos(d));          // remaining angle to the bottom, (-π, π]
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = g; bestDelta = d; }
    }
    best.pivot.add(this.seat);
    this._occluders = undefined;   // the seat moved to another gondola: the player's occluder cache must rebuild so this gondola's roof is treated as the vehicle
    this.duration = (bestDelta + TAU) / OMEGA;
  }

  update(dt, t) {
    this.angle += OMEGA * dt;
    this.wheel.rotation.z = this.angle;
    for (let i = 0; i < N; i++) this.gondolas[i].pivot.rotation.z = -this.angle + Math.sin(t * 1.1 + i) * 0.02;
    this.rays.rotation.z = t * 0.15;
    this.rayMat.emissiveIntensity = 0.7 + Math.sin(t * 2) * 0.2;
  }
}
