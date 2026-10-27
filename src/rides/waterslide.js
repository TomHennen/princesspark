// Flamingo Falls — a 16 m pink tower with a two-turn helix flume spiralling down around it, a swoop
// across the lawn and a straight drop into a splash pool. Riders sit in inflatable rings; the curve starts
// at the tower top (boarding snaps the ring there), three rings cycle so the slide is always busy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';
import { Track, makeSign, makeStripeTexture, addPlotFence } from './shared/track.js';
import { MeshBuilder } from '../world/builder.js';

const G = 9.81, CRAWL = 2.0, HELIX = 5.6, SWOOP = 6.5, RINGS = 3, SPLASH_N = 22, SEG = 1.2;
const TX = 14, TZ = -8, TOP = 15.8, R_HELIX = 7.5;   // tower centre / deck height / helix radius (local)
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const PINK = 0xff7bac, PINK2 = 0xe8528d, WHITE = 0xfafafa, YELLOW = 0xffd600, BLUE = 0x3aa8e0, STONE = 0xe9e4d8, DARK = 0x263238;
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class WaterSlide extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Flamingo Falls', kind: 'passive' });
    this.cameraOffset.set(0, 2.8, -5);
    this.cameraLookOffset.set(0, 0.6, 6);
    this.stationRadius = 4;
    this.tagline = 'Spiral down the pink tower and splash!';
  }

  build() {
    // ---- the flume curve: spiral off the tower deck, two helix turns, swoop south, straight drop, run-out ----
    const pts = [];
    const P = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
    P(TX + 2.6, TOP, TZ - 1.5); P(TX + 3.0, TOP, TZ);
    const TURNS = 4 * Math.PI;
    for (let th = Math.PI / 4; th <= TURNS + 1e-6; th += Math.PI / 4) {
      const r = 3 + (R_HELIX - 3) * Math.min(1, th / Math.PI), y = TOP - 9.6 * (th / TURNS);
      P(TX + Math.cos(th) * r, y, TZ + Math.sin(th) * r);
    }
    P(21.5, 5.9, -3); P(20.5, 5.6, 3); P(17, 5.3, 8); P(12, 5.1, 11.5); P(8.6, 5.0, 14); P(7.0, 4.8, 15.8);
    P(6.3, 3.6, 17.6); P(6, 1.6, 19.8); P(6, 0.7, 21.8); P(6, 0.55, 24); P(6, 0.55, 27); P(6, 0.55, 29.6);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const N = 420;
    const track = this.track = new Track(curve, {
      samples: N, smooth: 3,
      // bank into the turns (helix): roll so the ring leans toward the centre of curvature
      bank: (i, pos, tan, curv, up) => { if (i < 4 || i > N - 5) return 0; const side = _v.crossVectors(up, tan).normalize(); return -Math.atan((HELIX * HELIX * curv.dot(side)) / G) * 0.8; },
    });
    this.L = track.length - 0.05;
    this.sHelix = track.nearestS(pts[2]);
    this.sSwoop = track.nearestS(new THREE.Vector3(21.5, 5.9, -3));
    this.sDrop = track.nearestS(new THREE.Vector3(7.0, 4.8, 15.8));
    this.sSplash = track.nearestS(new THREE.Vector3(6, 0.7, 21.8));
    this.sPool = track.nearestS(new THREE.Vector3(6, 0.55, 19.5));
    this.speedFn = (s, v, dt) => {
      let target, acc = 5;
      if (s < this.sHelix) target = CRAWL;
      else if (s < this.sSwoop) target = HELIX;
      else if (s < this.sDrop) target = SWOOP;
      else if (s < this.sSplash) { target = Math.sqrt(SWOOP * SWOOP + 2 * G * Math.max(0, 4.8 - track.heightAt(s)) * 0.8); acc = 30; }
      else { target = 1.6; acc = 4; }
      return v + THREE.MathUtils.clamp(target - v, -acc * dt, acc * dt);
    };
    // one run from the top to the pool + a short float in the pool
    let s = 0, v = 0, t = 0;
    while (s < this.L && t < 120) { v = this.speedFn(s, v, 1 / 60); s += v / 60; t += 1 / 60; }
    this.settle = 1.5;
    this.duration = Math.round(t + this.settle);

    const M = this.M = {
      vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      flume: new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.55, side: THREE.DoubleSide }),
      ring: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
      splash: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff4ff, emissiveIntensity: 0.4 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide }),
    };
    this.waterTex = makeStripeTexture({ bg: '#2b9ad6', fg: '#bfefff', ripple: true, count: 6 });
    M.water = new THREE.MeshStandardMaterial({ map: this.waterTex, color: 0xffffff, emissive: 0x0f4f8a, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.8 });
    M.pool = new THREE.MeshStandardMaterial({ color: 0x45c6f5, transparent: true, opacity: 0.8, roughness: 0.2 });

    this.buildFlume(M);
    this.buildTowerAndPool(M);
    this.buildRings(M);
    this.buildSplash(M);

    this.group.updateMatrixWorld(true);
    this.station.copy(this.group.localToWorld(new THREE.Vector3(6, 0, 31)));
    // plot fence hugging the tower, helix and pool (the wave pool west of here is the world's); the gap spans the
    // pool's queue rails on the promenade side so only the exit steps between them lead in
    addPlotFence(this, { rect: { x0: -3, x1: 25, z0: -19, z1: 29.6 }, side: 'S', gap: [-0.6, 12.6], colors: { post: 0xffffff, cap: 0xff7bac, rail: 0x3aa8e0 } });
  }

  buildFlume(M) {
    const tr = this.track, n = Math.floor(this.sPool / SEG);
    // half-pipe unit: open-top half cylinder, 1 m long along +Z (axis), radius 1.1
    const unit = new THREE.CylinderGeometry(1.1, 1.1, 1, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    const channel = new THREE.InstancedMesh(unit, M.flume, n);
    channel.castShadow = true; channel.userData.noOcclude = true;
    const water = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1).rotateX(-Math.PI / 2).translate(0, -0.82, 0), M.water, n);
    water.userData.noOcclude = true;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * SEG;
      tr.trackAt(s, _p, _q);
      channel.setMatrixAt(k, _m.compose(_p, _q, _v.set(1, 1, SEG * 1.18)));
      water.setMatrixAt(k, _m.compose(_p, _q, _v.set(1, 1, SEG * 1.12)));
    }
    channel.instanceMatrix.needsUpdate = true; water.instanceMatrix.needsUpdate = true;
    this.group.add(channel, water);
    // white rim rails along both lips of the pipe (instanced boxes)
    const rims = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 1), new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.6 }), n * 2);
    rims.userData.noOcclude = true;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * SEG;
      tr.trackAt(s, _p, _q);
      for (const side of [-1, 1]) rims.setMatrixAt(k * 2 + (side + 1) / 2, _m.compose(_v.set(side * 1.1, 0.02, 0).applyQuaternion(_q).add(_p), _q, new THREE.Vector3(1, 1, SEG * 1.18)));
    }
    rims.instanceMatrix.needsUpdate = true;
    this.group.add(rims);
  }

  buildTowerAndPool(M) {
    const B = new MeshBuilder(), tr = this.track;
    // tower column: pink/white bands, a wide base, a round deck with railing, conical roof, flamingos on top
    B.cyl(STONE, 3.2, 3.6, 0.8, TX, 0, TZ, 20);
    for (let k = 0; k < 10; k++) B.cyl(k % 2 ? WHITE : PINK, 2.3, 2.3, 1.5, TX, 0.8 + k * 1.5, TZ, 18);
    B.cyl(YELLOW, 2.45, 2.45, 0.3, TX, TOP - 0.5, TZ, 18);
    B.cyl(STONE, 3.8, 3.4, 0.4, TX, TOP - 0.4, TZ, 20);                       // deck
    B.cyl(BLUE, 3.4, 3.4, 0.06, TX, TOP, TZ, 20);                              // wet deck top
    B.cyl(WHITE, 1.1, 1.1, 0.25, TX + 2.6, TOP, TZ - 1.5, 12);                // launch tub where the flume starts
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; B.cyl(WHITE, 0.14, 0.14, 7.5, TX + Math.cos(a) * 3.0, TOP, TZ + Math.sin(a) * 3.0, 6); }
    B.cone(PINK2, 4.6, 3.2, TX, TOP + 7.4, TZ, 12); B.cyl(YELLOW, 4.7, 4.7, 0.3, TX, TOP + 7.3, TZ, 12);
    B.cyl(DARK, 0.06, 0.06, 2.0, TX, TOP + 10.6, TZ, 5); B.sphere(YELLOW, 0.3, TX, TOP + 10.6, TZ);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.9; flamingo(B, TX + Math.cos(a) * 2.4, TOP, TZ + Math.sin(a) * 2.4, -a + Math.PI / 2); }
    // decorative spiral stairs hugging the column
    for (let k = 0; k < 58; k++) { const a = k * 0.21, y = 0.8 + k * 0.255; B.box(WHITE, 0.55, 0.1, 1.1, TX + Math.cos(a) * 2.85, y, TZ + Math.sin(a) * 2.85, -a + Math.PI / 2); }
    B.beam(YELLOW, TX + Math.cos(0) * 3.5, 1.9, TZ + Math.sin(0) * 3.5, TX + Math.cos(57 * 0.21) * 3.5, 0.8 + 57 * 0.255 + 1.1, TZ + Math.sin(57 * 0.21) * 3.5, 0.06, 4);
    // radial arms from the column to the helix every 45° and posts under the swoop
    for (let th = Math.PI / 2; th <= 4 * Math.PI + 1e-6; th += Math.PI / 4) {
      const r = 3 + (R_HELIX - 3) * Math.min(1, th / Math.PI), y = TOP - 9.6 * (th / (4 * Math.PI)) - 1.2;
      B.beam(WHITE, TX + Math.cos(th) * 2.3, y - 0.6, TZ + Math.sin(th) * 2.3, TX + Math.cos(th) * (r + 0.2), y, TZ + Math.sin(th) * (r + 0.2), 0.11, 6);
    }
    for (const s of [this.sSwoop + 2, this.sSwoop + 8, this.sSwoop + 14, this.sSwoop + 20, this.sDrop - 2]) {
      tr.trackAt(s, _p); B.cyl(WHITE, 0.16, 0.22, _p.y - 1.1, _p.x, 0, _p.z, 7); B.box(WHITE, 2.6, 0.18, 0.4, _p.x, _p.y - 1.3, _p.z);
    }
    // splash pool: tiled floor, water, stone coping, a splash-zone sign and the exit steps
    B.box(0xbfe9f5, 13.4, 0.2, 11.4, 6, -0.1, 23);
    B.box(STONE, 13.4, 0.35, 0.7, 6, 0, 17.65); B.box(STONE, 13.4, 0.35, 0.7, 6, 0, 28.35);
    B.box(STONE, 0.7, 0.35, 11.4, -0.35, 0, 23); B.box(STONE, 0.7, 0.35, 11.4, 12.35, 0, 23);
    B.box(BLUE, 4.2, 0.08, 1.4, 6, 0, 29.4); B.box(BLUE, 3.2, 0.08, 1.0, 6, 0, 30.4);
    // queue rails either side of the exit steps + a boarding mat
    for (const sx of [-1, 1]) { B.box(WHITE, 0.12, 0.9, 3.2, 6 + sx * 2.6, 0, 30.2); B.box(WHITE, 0.12, 0.12, 3.2, 6 + sx * 2.6, 0.9, 30.2); }
    const stat = B.build(M.vc);
    stat.castShadow = true; stat.receiveShadow = true; this.group.add(stat);
    const water = new THREE.Mesh(new THREE.BoxGeometry(12, 0.12, 10), M.pool);
    water.position.set(6, 0.1, 23); water.receiveShadow = true; this.group.add(water);
    // signs: big one on the tower facing the promenade, a small one at the exit steps
    const sign = makeSign(['FLAMINGO FALLS'], { w: 7.5, h: 1.5, bg: '#ff7bac', fg: '#ffffff', border: '#ffd600', boardColor: 0xe8528d });
    sign.position.set(TX, 11.5, TZ + 2.45); this.group.add(sign);
    const sign2 = makeSign(['SPLASH ZONE'], { w: 3.2, h: 0.8, bg: '#ffffff', fg: '#3aa8e0', border: '#ff7bac', boardColor: 0xffd600 });
    sign2.position.set(12.7, 1.6, 23); sign2.rotation.y = -Math.PI / 2; this.group.add(sign2);
    const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.6 }));
    signPost.position.set(12.7, 0.65, 23); signPost.userData.noOcclude = true; this.group.add(signPost);
    // colliders: tower (incl. the spiral stair), swoop posts, pool coping (exit side left open at the steps), queue rails
    this.addBoxCollider(new THREE.Vector3(TX, 8, TZ), new THREE.Vector3(7.2, 16, 7.2));
    for (const s of [this.sSwoop + 2, this.sSwoop + 8, this.sSwoop + 14, this.sSwoop + 20, this.sDrop - 2]) { tr.trackAt(s, _p); this.addBoxCollider(new THREE.Vector3(_p.x, _p.y / 2, _p.z), new THREE.Vector3(0.6, _p.y, 0.6)); }
    this.addBoxCollider(new THREE.Vector3(12.7, 1, 23), new THREE.Vector3(0.4, 2, 3.4));
    this.addBoxCollider(new THREE.Vector3(6, 0.5, 17.65), new THREE.Vector3(13.4, 1, 0.7));
    this.addBoxCollider(new THREE.Vector3(-0.35, 0.5, 23), new THREE.Vector3(0.7, 1, 11.4));
    this.addBoxCollider(new THREE.Vector3(12.35, 0.5, 23), new THREE.Vector3(0.7, 1, 11.4));
    this.addBoxCollider(new THREE.Vector3(1.5, 0.5, 28.35), new THREE.Vector3(4.4, 1, 0.7));
    this.addBoxCollider(new THREE.Vector3(10.5, 0.5, 28.35), new THREE.Vector3(4.4, 1, 0.7));
  }

  makeRing(a, b) {
    const paint = (g, c) => { const col = new THREE.Color(c), n = g.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g; };
    const geo = mergeGeometries([
      paint(new THREE.TorusGeometry(0.8, 0.3, 8, 18).rotateX(Math.PI / 2).translate(0, 0.3, 0), a),
      paint(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18).translate(0, 0.12, 0), b),
      paint(new THREE.BoxGeometry(0.5, 0.08, 0.3).translate(0.75, 0.62, 0.5), b), paint(new THREE.BoxGeometry(0.5, 0.08, 0.3).translate(-0.75, 0.62, 0.5), b),
    ], false);
    const ring = new THREE.Group();
    const mesh = new THREE.Mesh(geo, this.M.ring); mesh.castShadow = true; mesh.userData.noOcclude = true; ring.add(mesh);
    this.group.add(ring);
    return ring;
  }

  buildRings(M) {
    this.rings = [];
    const cols = [[YELLOW, PINK], [BLUE, WHITE], [PINK, YELLOW]];
    for (let k = 0; k < RINGS; k++) {
      const ring = this.makeRing(...cols[k]);
      this.rings.push({ group: ring, s: (k * this.L) / RINGS, v: HELIX, wait: 0 });
    }
    this.rider = this.rings[0];
    this.rider.group.add(this.seat);
    this.seat.position.set(0, 0.3, 0);
    this.placeRings();
  }

  buildSplash(M) {
    this.splash = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 6, 5), M.splash, SPLASH_N);
    this.splash.count = 0; this.splashT = 99;
    const r = rng(11);
    this.splashDirs = [];
    for (let i = 0; i < SPLASH_N; i++) { const a = r() * Math.PI * 2, sp = 1.5 + r() * 3.5; this.splashDirs.push(new THREE.Vector3(Math.cos(a) * sp, 4 + r() * 4, Math.sin(a) * sp * 0.6 + 2.5)); }
    this.splashOrigin = new THREE.Vector3(6, 0.5, 22.5);
    this.group.add(this.splash);
  }

  /**
   * Remote rider i gets an extra ring that sets off (i+1)*1.5 s after the local one and follows the same
   * flume; while it waits it sits on the tower deck beside the launch tub, then it cycles like the empties.
   */
  peerSeat(i) {
    this._peerSeats ||= [];
    if (!this._peerSeats[i]) {
      const cols = [[WHITE, BLUE], [YELLOW, BLUE], [PINK, WHITE], [BLUE, YELLOW]];
      const ring = this.makeRing(...cols[i % cols.length]);
      const r = { group: ring, s: 0, v: 0, wait: (i + 1) * 1.5, peer: true, delay: (i + 1) * 1.5, deck: new THREE.Vector3(TX + 2.6 - 1.5 * (i + 1), TOP + 0.02, TZ - 0.2) };
      this.rings.push(r);
      const seat = new THREE.Object3D(); seat.position.set(0, 0.3, 0); ring.add(seat);
      this._peerSeats[i] = seat;
      this.placeRings();
    }
    return this._peerSeats[i];
  }

  placeRings() {
    for (const r of this.rings) {
      if (r.peer && r.wait > 0) { r.group.position.copy(r.deck); r.group.quaternion.identity(); r.group.rotation.y = Math.PI / 2; continue; }
      const s = Math.min(this.L, r.s);
      this.track.trackAt(s, r.group.position, r.group.quaternion);
      if (s >= this.sPool) r.group.position.y += Math.sin(this.game.time * 2.2 + r.s) * 0.05; // bob in the pool
    }
  }

  onBoard() {
    // fresh run: the rider's ring snaps to the tower top; the others are spread out ahead of it
    this.rings.forEach((r, k) => {
      if (r.peer) { r.s = 0; r.v = 0; r.wait = r.delay; return; }   // peer rings set off shortly after the rider
      r.s = k === 0 ? 0 : (k * this.L) / RINGS; r.v = k === 0 ? 0 : HELIX; r.wait = 0;
    });
    this.done = 0; this.whooshed = false;
    this.placeRings();
  }

  isComplete() { return this.riding && this.done >= this.settle; }

  update(dt, t) {
    const tr = this.track;
    for (const r of this.rings) {
      if (r.wait > 0) { r.wait -= dt; if (r.wait <= 0) { r.s = 0; r.v = 0; } continue; }
      const before = r.s;
      r.v = this.speedFn(before, r.v, dt);
      r.s = Math.min(this.L, r.s + r.v * dt);
      if (before < this.sSplash && r.s >= this.sSplash) { this.splashT = 0; this.splash.count = SPLASH_N; if (r === this.rider && this.riding) this.game.audio?.play('whoosh'); }
      if (r === this.rider && this.riding) { if (!this.whooshed && before < this.sDrop && r.s >= this.sDrop) { this.whooshed = true; this.game.audio?.play('whoosh'); } if (r.s >= this.L) this.done += dt; }
      else if (r.s >= this.L) r.wait = r.peer ? 3 + r.delay : 3; // empty ring floats a moment, then "walks back up" to the top
    }
    this.placeRings();
    this.waterTex.offset.y -= dt * 0.9;
    if (this.splashT < 1) {
      this.splashT += dt;
      const k = this.splashT, o = this.splashOrigin;
      for (let i = 0; i < SPLASH_N; i++) {
        const d = this.splashDirs[i];
        _p.set(o.x + d.x * k, o.y + d.y * k - 4.9 * k * k, o.z + d.z * k);
        const sc = Math.max(0.01, (1 - k) * (0.7 + 0.6 * Math.sin(k * Math.PI)));
        this.splash.setMatrixAt(i, _m.compose(_p, _q.identity(), _v.set(sc, sc, sc)));
      }
      this.splash.instanceMatrix.needsUpdate = true;
      if (this.splashT >= 1) this.splash.count = 0;
    }
    void t; void _one;
  }
}

/** Flamingo statue (merged into a MeshBuilder), feet at (x,y,z), facing ry. */
function flamingo(B, x, y, z, ry) {
  B.begin(x, y, z, ry);
  B.cyl(PINK2, 0.045, 0.045, 1.05, 0.12, 0, -0.08, 5); B.cyl(PINK2, 0.045, 0.045, 1.05, -0.12, 0, 0.08, 5);
  B.sphere(PINK, 0.5, 0, 1.3, 0, 8, 6, 1.25, 0.85, 0.85);
  B.sphere(PINK2, 0.36, -0.05, 1.42, 0, 6, 4, 1.1, 0.55, 0.95);
  B.beam(PINK, 0.5, 1.5, 0, 0.95, 2.45, 0, 0.1); B.sphere(PINK, 0.21, 0.98, 2.5, 0);
  B.add(new THREE.ConeGeometry(0.09, 0.42, 6), 0x1a1a1a, 1.22, 2.4, 0, 0, 0, -Math.PI / 2 - 0.55);
  B.sphere(0x1a1a1a, 0.045, 1.05, 2.58, 0.17, 5, 4); B.sphere(0x1a1a1a, 0.045, 1.05, 2.58, -0.17, 5, 4);
  B.end();
}
