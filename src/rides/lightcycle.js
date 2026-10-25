// Grid Riders — a Tron-style light cycle arena (drive ride).
// Player rides a yellow light cycle around a neon grid, leaving a light ribbon; two AI cycles
// (cyan, magenta) race their own 90°-turning paths. Hitting a wall or any trail "derezzes" the
// bike (particle burst + respawn at the pad). Goal: collect 10 glowing bits.
import * as THREE from 'three';
import { Ride } from './Ride.js';
import { makeSign } from './shared/track.js';
import { coloredMesh, mergeParts, canvasTexture, ParticleBurst, wrapAngle, approach, segDist2 } from './shared/vehicle.js';

const HALF = 25;           // arena interior half-size (inner wall faces at ±HALF)
const WALL_H = 2.4;
const TRAIL_MAX = 250;     // points per trail
const TRAIL_STEP = 0.6;    // distance between trail points
const TRAIL_H = 1.15;
const BITS_TARGET = 10, BITS_LIVE = 5;
const BASE_SPEED = 11, THROTTLE_SPEED = 17, BOOST_SPEED = 23;
const BOOST_TIME = 1.2, BOOST_CD = 4.5;
const YELLOW = 0xffe033, CYAN = 0x19e6ff, MAGENTA = 0xff3df0;
const HIT_R = 0.42;
const PEER_COLORS = [0xff8c1a, 0x7bff3a, 0xffffff, 0xb44cff, 0xff4d6d, 0x19e6ff];
let peerColorIdx = 0;

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

/** A light ribbon: preallocated vertical quad strip, rewritten each frame (tiny buffer). */
class Trail {
  constructor(color, parent) {
    this.pts = [];                                   // {x,z}, oldest first
    this.head = { x: 0, z: 0 };                      // live end attached to the bike
    this.pos = new Float32Array(TRAIL_MAX * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint16Array((TRAIL_MAX - 1) * 6);
    for (let i = 0; i < TRAIL_MAX - 1; i++) { const b = i * 2; idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6); }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOcclude = true;   // zero-thickness ribbon: never pulls the camera in
    parent.add(this.mesh);
  }
  reset(x, z) { this.pts.length = 0; this.pts.push({ x, z }); this.head.x = x; this.head.z = z; this.upload(); }
  follow(x, z) {
    const last = this.pts[this.pts.length - 1];
    if (!last) this.pts.push({ x, z });
    else if (Math.hypot(x - last.x, z - last.z) >= TRAIL_STEP) { this.pts.push({ x, z }); if (this.pts.length > TRAIL_MAX - 1) this.pts.shift(); }
    this.head.x = x; this.head.z = z;
    this.upload();
  }
  upload() {
    const p = this.pos, n = this.pts.length; let k = 0;
    for (let i = 0; i < n; i++) { const q = this.pts[i]; p[k++] = q.x; p[k++] = 0.03; p[k++] = q.z; p[k++] = q.x; p[k++] = TRAIL_H; p[k++] = q.z; }
    p[k++] = this.head.x; p[k++] = 0.03; p[k++] = this.head.z; p[k++] = this.head.x; p[k++] = TRAIL_H; p[k++] = this.head.z;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.setDrawRange(0, n * 6);
  }
  /** True if (x,z) is within r of any segment, ignoring the newest `skipTail` segments. */
  hits(x, z, r, skipTail = 0) {
    const pts = this.pts, n = pts.length, r2 = r * r;
    // segments: pts[i]→pts[i+1] (i < n-1) and pts[n-1]→head (index n-1)
    const lastSeg = n - 1 - skipTail;
    for (let i = 0; i <= lastSeg; i++) {
      const a = pts[i], b = i === n - 1 ? this.head : pts[i + 1];
      if (segDist2(x, z, a.x, a.z, b.x, b.z) < r2) return true;
    }
    return false;
  }
}

/** Blocky light cycle. Forward is +Z. Returns { group, glowMat, wheels } */
function buildCycle(glow) {
  const group = new THREE.Group();
  const model = new THREE.Group(); model.scale.setScalar(1.3); group.add(model);
  const dark = 0x0e1017, mid = 0x1a1e2a;
  const body = coloredMesh([
    { geo: new THREE.BoxGeometry(0.5, 0.46, 2.3), pos: [0, 0.72, 0], color: dark },          // spine
    { geo: new THREE.BoxGeometry(0.34, 0.3, 0.9), pos: [0, 0.98, 0.95], color: mid },         // nose cowl
    { geo: new THREE.BoxGeometry(0.3, 0.55, 0.7), pos: [0, 1.1, -1.0], color: mid },          // tail fin
    { geo: new THREE.BoxGeometry(0.95, 0.07, 0.09), pos: [0, 1.05, 0.75], color: 0x2a3040 },  // bars
    { geo: new THREE.BoxGeometry(0.7, 0.08, 0.35), pos: [0, 0.5, 0.3], color: 0x2a3040 },     // pegs
  ], { metalness: 0.7, roughness: 0.3 });
  body.castShadow = true;
  model.add(body);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: glow, emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false });
  const strips = new THREE.Mesh(mergeParts([
    { geo: new THREE.BoxGeometry(0.56, 0.07, 2.2), pos: [0, 0.72, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.5, 0.74), pos: [0, 1.12, -1.0] },
    { geo: new THREE.BoxGeometry(0.3, 0.06, 0.2), pos: [0, 1.14, 1.3] },        // headlamp
  ]), glowMat);
  model.add(strips);
  const wheels = [];
  const tyreGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.26, 24).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.5, 0.075, 8, 24).rotateY(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.5, metalness: 0.5 });
  for (const z of [1.2, -1.2]) {
    const w = new THREE.Group(); w.position.set(0, 0.62, z);
    w.add(new THREE.Mesh(tyreGeo, tyreMat));
    w.add(new THREE.Mesh(rimGeo, glowMat));
    model.add(w); wheels.push(w);
  }
  group.traverse((o) => { if (o.isMesh) o.userData.noOcclude = true; });   // bikes are vehicles, not walls
  return { group, glowMat, wheels };
}

export class LightCycle extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Grid Riders', kind: 'drive' });
    this.seatAnim = 'drive';
    this.cameraOffset.set(0, 2.8, -6.5);
    this.cameraLookOffset.set(0, 1.0, 6);
    this.stationRadius = 4;
    this.score = 0;
    this.hudText = '';
    this.pad = { x: 0, z: HALF - 6, yaw: Math.PI };   // player start pad, facing -Z (into the arena)
    this.bike = { x: 0, z: 0, yaw: Math.PI, speed: 0, lean: 0, boostT: 0, boostCd: 0, respawnT: 0, flash: 0 };
    this.ais = [];
    this.bits = [];
  }

  build() {
    const g = this.group;
    // --- floor: dark apron + glowing grid ---
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.9 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = 0.01; apron.receiveShadow = true; g.add(apron);
    const gridTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#04060c'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1ad6ff'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = '#0d6b80'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    });
    gridTex.repeat.set(HALF * 2 / 5, HALF * 2 / 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x9fdcff, map: gridTex, emissive: 0xffffff, emissiveMap: gridTex, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; g.add(floor);

    // --- walls (instanced) + neon top rails ---
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x141826, roughness: 0.6, metalness: 0.4 });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, HALF * 2 + 2), wallMat, 4);
    const cyanGlow = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
    const magGlow = new THREE.MeshBasicMaterial({ color: MAGENTA, toneMapped: false });
    const railGeo = new THREE.BoxGeometry(1.1, 0.22, HALF * 2 + 2);
    const railC = new THREE.InstancedMesh(railGeo, cyanGlow, 2), railM = new THREE.InstancedMesh(railGeo, magGlow, 2);
    const wallPos = [[HALF + 0.5, 0, 0], [-HALF - 0.5, 0, 0], [0, Math.PI / 2, -HALF - 0.5], [0, Math.PI / 2, HALF + 0.5]];
    wallPos.forEach(([x, ry, z], i) => {
      _m.compose(_v.set(x, WALL_H / 2, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1));
      walls.setMatrixAt(i, _m);
      _m.compose(_v.set(x, WALL_H + 0.1, z), _q, _s);
      (i < 2 ? railM : railC).setMatrixAt(i % 2, _m);
    });
    walls.castShadow = true; walls.receiveShadow = true;
    railC.userData.noOcclude = railM.userData.noOcclude = true;
    g.add(walls, railC, railM);
    // neon pillars rising above the walls + a mid-height light stripe, instance-coloured (2 draw calls)
    const PER_SIDE = 9, pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 3.8, 0.3), new THREE.MeshBasicMaterial({ toneMapped: false }), PER_SIDE * 4);
    const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.12, HALF * 2 + 2), new THREE.MeshBasicMaterial({ toneMapped: false }), 4);
    const cC = new THREE.Color(CYAN), cM = new THREE.Color(MAGENTA);
    wallPos.forEach(([x, ry, z], side) => {
      _m.compose(_v.set(x, 1.3, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1));
      stripes.setMatrixAt(side, _m); stripes.setColorAt(side, side < 2 ? cC : cM);
      for (let k = 0; k < PER_SIDE; k++) {
        const along = -HALF + 2 + k * (HALF * 2 - 4) / (PER_SIDE - 1), i = side * PER_SIDE + k;
        const px = side < 2 ? Math.sign(x) * (HALF - 0.2) : along, pz = side < 2 ? along : Math.sign(z) * (HALF - 0.2);
        _m.compose(_v.set(px, 1.9, pz), _q.identity(), _s.set(1, 1, 1));
        pillars.setMatrixAt(i, _m); pillars.setColorAt(i, k % 2 ? cM : cC);
      }
    });
    pillars.userData.noOcclude = stripes.userData.noOcclude = true;
    g.add(pillars, stripes);
    // gate: cut in the +Z wall visually via two glowing posts and a dark "door" (the wall stays as the vehicle boundary)
    const postGeo = new THREE.BoxGeometry(0.5, 4.2, 0.5);
    for (const x of [-3.2, 3.2]) { const p = new THREE.Mesh(postGeo, cyanGlow); p.position.set(x, 2.1, HALF + 0.5); p.userData.noOcclude = true; g.add(p); }
    const gateTop = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.6), magGlow); gateTop.position.set(0, 4.2, HALF + 0.5); gateTop.userData.noOcclude = true; g.add(gateTop);
    const sign = makeSign(this.name.toUpperCase(), { w: 7, h: 1.4, bg: '#04060c', fg: '#19e6ff', border: '#ff3df0', boardColor: 0x141826 });
    sign.position.set(0, 5.45, HALF + 0.5); sign.traverse((o) => { o.userData.noOcclude = true; }); g.add(sign);

    // --- corner towers + roof ---
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 14, 2.6), wallMat, 4);
    const towerGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 13.5, 0.35), cyanGlow, 8);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz], i) => {
      const x = sx * (HALF + 2.2), z = sz * (HALF + 2.2);
      _m.compose(_v.set(x, 7, z), _q.identity(), _s.set(1, 1, 1)); towers.setMatrixAt(i, _m);
      _m.compose(_v.set(x - sx * 1.35, 6.9, z), _q, _s); towerGlow.setMatrixAt(i * 2, _m);
      _m.compose(_v.set(x, 6.9, z - sz * 1.35), _q, _s); towerGlow.setMatrixAt(i * 2 + 1, _m);
    });
    towers.castShadow = true; towerGlow.userData.noOcclude = true;
    g.add(towers, towerGlow);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 7, 0.5, HALF * 2 + 7),
      new THREE.MeshStandardMaterial({ color: 0x0a0d1a, transparent: true, opacity: 0.62, roughness: 0.8, side: THREE.DoubleSide }));
    roof.position.y = 14.2; roof.castShadow = true; g.add(roof);
    const roofRail = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 7.2, 0.18, HALF * 2 + 7.2), magGlow);
    roofRail.position.y = 14.55; roofRail.userData.noOcclude = true; g.add(roofRail);

    // --- start pads (unlit rings, instance-coloured) ---
    const pads = new THREE.InstancedMesh(new THREE.RingGeometry(1.4, 2.0, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), 3);
    const aiStarts = [{ x: -15, z: -6, dir: 0, color: CYAN }, { x: 15, z: 6, dir: 2, color: MAGENTA }];
    [[this.pad.x, this.pad.z, YELLOW], ...aiStarts.map((a) => [a.x, a.z, a.color])].forEach(([x, z, c], i) => {
      _m.compose(_v.set(x, 0.04, z), _q.identity(), _s.set(1, 1, 1)); pads.setMatrixAt(i, _m); pads.setColorAt(i, new THREE.Color(c));
    });
    pads.userData.noOcclude = true; g.add(pads);

    // --- lights for the neon mood ---
    const l1 = new THREE.PointLight(CYAN, 90, 45, 2); l1.position.set(-10, 6, -8); g.add(l1);
    const l2 = new THREE.PointLight(MAGENTA, 90, 45, 2); l2.position.set(10, 6, 10); g.add(l2);

    // --- player cycle ---
    const pc = buildCycle(YELLOW);
    this.cycle = pc; this.cycleGroup = pc.group; g.add(pc.group);
    // seat pivot carries half the lean so the camera (which follows the seat quaternion) stays steady
    this.seatPivot = new THREE.Group(); g.add(this.seatPivot);
    this.seat.position.set(0, 0.64, -0.25);
    this.seatPivot.add(this.seat);
    this.trail = new Trail(YELLOW, g);

    // --- AI cycles ---
    for (const a of aiStarts) {
      const c = buildCycle(a.color);
      g.add(c.group);
      this.ais.push({ ...c, start: a, x: a.x, z: a.z, dir: a.dir, speed: 12 + Math.random() * 2, turnT: 2 + Math.random() * 3, deadT: 0, trail: new Trail(a.color, g), color: a.color });
      this.respawnAI(this.ais[this.ais.length - 1]);
    }

    // --- bits ---
    this.bitMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0x332a00, emissive: YELLOW, emissiveIntensity: 2.5, toneMapped: false }), BITS_LIVE);
    for (let i = 0; i < BITS_LIVE; i++) this.bits.push(this.randomBitSpot());
    this.bitMesh.userData.noOcclude = true; g.add(this.bitMesh);

    this.particles = new ParticleBurst(56, 0.3);
    this.particles.mesh.userData.noOcclude = true; g.add(this.particles.mesh);

    this.parkPlayer();
    this.updateBits(0);

    // --- station / colliders ---
    g.updateMatrixWorld(true);
    this.station.copy(g.localToWorld(new THREE.Vector3(0, 0, HALF + 4.5)));
    this.tagline = 'Ride the grid, dodge the light walls, grab 10 bits!';
    this.addBoxCollider(new THREE.Vector3(HALF + 0.5, 1.5, 0), new THREE.Vector3(1, 3, HALF * 2 + 2));
    this.addBoxCollider(new THREE.Vector3(-HALF - 0.5, 1.5, 0), new THREE.Vector3(1, 3, HALF * 2 + 2));
    this.addBoxCollider(new THREE.Vector3(0, 1.5, -HALF - 0.5), new THREE.Vector3(HALF * 2 + 2, 3, 1));
    const gw = (HALF + 1 - 3.4);
    this.addBoxCollider(new THREE.Vector3(3.4 + gw / 2, 1.5, HALF + 0.5), new THREE.Vector3(gw, 3, 1));
    this.addBoxCollider(new THREE.Vector3(-3.4 - gw / 2, 1.5, HALF + 0.5), new THREE.Vector3(gw, 3, 1));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.addBoxCollider(new THREE.Vector3(sx * (HALF + 2.2), 7, sz * (HALF + 2.2)), new THREE.Vector3(2.6, 14, 2.6));
  }

  // ---------- helpers ----------
  randomBitSpot() {
    for (let tries = 0; tries < 20; tries++) {
      const x = (Math.random() * 2 - 1) * (HALF - 4), z = (Math.random() * 2 - 1) * (HALF - 4);
      if (Math.hypot(x - this.pad.x, z - this.pad.z) < 5) continue;
      if (this.bits.some((b) => Math.hypot(b.x - x, b.z - z) < 6)) continue;
      return { x, z, phase: Math.random() * 6.28, pop: 0 };
    }
    return { x: 0, z: 0, phase: 0, pop: 0 };
  }
  parkPlayer() {
    const b = this.bike;
    b.x = this.pad.x; b.z = this.pad.z; b.yaw = this.pad.yaw; b.speed = 0; b.lean = 0; b.boostT = 0; b.boostCd = 0; b.respawnT = 0;
    this.trail.reset(b.x, b.z);
    this.placeCycle(this.cycleGroup, b.x, b.z, b.yaw, 0);
  }
  placeCycle(group, x, z, yaw, lean) {
    group.position.set(x, 0, z);
    group.rotation.set(0, yaw, lean, 'YXZ');
    if (group === this.cycleGroup) { this.seatPivot.position.set(x, 0, z); this.seatPivot.rotation.set(0, yaw, lean * 0.5, 'YXZ'); }
  }
  wallHit(x, z) { return Math.abs(x) > HALF - 0.35 || Math.abs(z) > HALF - 0.35; }
  trailHit(x, z, own, skipOwn) {
    if (own.hits(x, z, HIT_R, skipOwn)) return true;
    if (own !== this.trail && this.riding && this.trail.hits(x, z, HIT_R, 0)) return true;
    for (const a of this.ais) if (a.trail !== own && a.deadT <= 0 && a.trail.hits(x, z, HIT_R, 0)) return true;
    return false;
  }
  derez(x, z, color) {
    this.particles.burst(x, 0.6, z, color, 40, 8);
    if (this.riding) this.game.audio?.play('crash');   // AI derezzes stay silent unless the player is here
  }

  // ---------- player ----------
  onBoard() {
    this.score = 0;
    this.parkPlayer();
    this.bike.speed = BASE_SPEED * 0.5;
    this.hudText = `BITS 0/${BITS_TARGET} · SPEED 0`;
  }
  onUnboard() { this.parkPlayer(); }
  /** A light cycle for a remote rider (fresh neon colour each call); origin = rider's feet, +Z forward. */
  makePeerVehicle() {
    const wrap = new THREE.Group();
    const c = buildCycle(PEER_COLORS[peerColorIdx++ % PEER_COLORS.length]);
    c.group.position.set(0, -0.64, 0.25);   // undo the seat offset so the bike sits under the avatar
    wrap.add(c.group);
    wrap.userData.wheels = c.wheels; wrap.userData.glowMat = c.glowMat;
    wrap.userData.dispose = () => { c.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); };
    return wrap;
  }
  isComplete() { return this.riding && this.score >= BITS_TARGET; }

  handleInput(input, dt) {
    const b = this.bike;
    if (b.respawnT > 0) {
      b.respawnT -= dt;
      b.flash = b.respawnT;
      this.hudText = `DEREZZED! · BITS ${this.score}/${BITS_TARGET}`;
      if (b.respawnT <= 0) { b.speed = BASE_SPEED * 0.5; this.trail.reset(b.x, b.z); }
      return;
    }
    // boost
    b.boostCd = Math.max(0, b.boostCd - dt);
    if (input.boost && b.boostCd === 0 && b.boostT <= 0) { b.boostT = BOOST_TIME; b.boostCd = BOOST_CD; this.game.audio?.play('boost'); }
    b.boostT -= dt;
    const target = b.boostT > 0 ? BOOST_SPEED : BASE_SPEED + Math.max(0, input.move.y) * (THROTTLE_SPEED - BASE_SPEED);
    b.speed = approach(b.speed, target, b.boostT > 0 ? 6 : 2.5, dt);
    // steering: positive rotation.y is a LEFT turn for a +Z-forward object, so right (+x) decreases yaw
    const steer = THREE.MathUtils.clamp(input.move.x, -1, 1);
    const rate = THREE.MathUtils.lerp(2.6, 1.7, THREE.MathUtils.clamp((b.speed - BASE_SPEED) / (BOOST_SPEED - BASE_SPEED), 0, 1));
    b.yaw = wrapAngle(b.yaw - steer * rate * dt);
    b.lean = approach(b.lean, steer * 0.38, 8, dt);
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    b.x += fx * b.speed * dt; b.z += fz * b.speed * dt;
    // trail follows the rear wheel
    this.trail.follow(b.x - fx * 1.5, b.z - fz * 1.5);
    // collisions at the nose
    const nx = b.x + fx * 1.6, nz = b.z + fz * 1.6;
    if (this.wallHit(nx, nz) || this.trailHit(nx, nz, this.trail, 4)) {
      this.derez(b.x, b.z, YELLOW);
      this.game.events.emit('drive:crash', { ride: this.id });
      b.x = this.pad.x; b.z = this.pad.z; b.yaw = this.pad.yaw; b.speed = 0; b.lean = 0; b.boostT = 0;
      b.respawnT = 1.0; b.flash = 1;
      this.trail.reset(b.x, b.z);
    }
    // bits
    for (let i = 0; i < this.bits.length; i++) {
      const bit = this.bits[i];
      if (Math.hypot(bit.x - b.x, bit.z - b.z) < 1.7) {
        this.score++;
        this.particles.burst(bit.x, 1.2, bit.z, YELLOW, 12, 4);
        this.game.audio?.play('gem');
        this.bits[i] = this.randomBitSpot();
      }
    }
    const boostTxt = b.boostT > 0 ? ' · BOOST!' : b.boostCd > 0 ? '' : ' · SHIFT = boost';
    this.hudText = `BITS ${this.score}/${BITS_TARGET} · SPEED ${Math.round(b.speed * 3)}${boostTxt}`;
  }

  // ---------- AI ----------
  respawnAI(a) {
    a.x = a.start.x; a.z = a.start.z; a.dir = a.start.dir; a.deadT = 0; a.turnT = 1.5 + Math.random() * 2.5;
    a.trail.reset(a.x, a.z);
    this.placeCycle(a.group, a.x, a.z, a.dir * Math.PI / 2, 0);
    a.group.visible = true;
  }
  aiFree(a, dir, dist) {
    const yaw = dir * Math.PI / 2, px = a.x + Math.sin(yaw) * dist, pz = a.z + Math.cos(yaw) * dist;
    return !this.wallHit(px, pz) && !this.trailHit(px, pz, a.trail, 3);
  }
  updateAI(a, dt) {
    if (a.deadT > 0) {
      a.deadT -= dt;
      if (a.deadT <= 0) this.respawnAI(a);
      return;
    }
    a.turnT -= dt;
    const ahead = 5 + a.speed * 0.25;
    let wantTurn = !this.aiFree(a, a.dir, ahead) || a.turnT <= 0;
    if (wantTurn) {
      const first = Math.random() < 0.5 ? 1 : 3, second = first === 1 ? 3 : 1;
      const l = (a.dir + first) % 4, r = (a.dir + second) % 4;
      if (this.aiFree(a, l, 7)) a.dir = l;
      else if (this.aiFree(a, r, 7)) a.dir = r;
      else if (a.turnT <= 0) { /* keep straight, nothing free */ }
      a.turnT = 1.2 + Math.random() * 3.5;
    }
    const yaw = a.dir * Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw);
    a.x += fx * a.speed * dt; a.z += fz * a.speed * dt;
    a.trail.follow(a.x - fx * 1.5, a.z - fz * 1.5);
    const nx = a.x + fx * 1.6, nz = a.z + fz * 1.6;
    if (this.wallHit(nx, nz) || this.trailHit(nx, nz, a.trail, 4)) {
      this.derez(a.x, a.z, a.color);
      a.deadT = 1.2; a.group.visible = false;
      a.trail.reset(a.start.x, a.start.z);
      return;
    }
    this.placeCycle(a.group, a.x, a.z, yaw, 0);
    for (const w of a.wheels) w.rotation.x += a.speed / 0.8 * dt;
  }

  updateBits(t) {
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      _e.set(0, t * 1.5 + b.phase, 0.5);
      _m.compose(_v.set(b.x, 1.3 + Math.sin(t * 2 + b.phase) * 0.3, b.z), _q.setFromEuler(_e), _s.set(1, 1, 1));
      this.bitMesh.setMatrixAt(i, _m);
    }
    this.bitMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, t) {
    const b = this.bike;
    if (this.riding) {
      this.placeCycle(this.cycleGroup, b.x, b.z, b.yaw, b.lean);
      for (const w of this.cycle.wheels) w.rotation.x += b.speed / 0.8 * dt;
      // derez flash / boost glow
      const flash = b.respawnT > 0 ? (Math.sin(t * 40) > 0 ? 6 : 0.4) : b.boostT > 0 ? 4 : 2.2;
      this.cycle.glowMat.emissiveIntensity = flash;
    } else {
      this.cycle.glowMat.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.5;
    }
    for (const a of this.ais) this.updateAI(a, dt);
    this.updateBits(t);
    this.particles.update(dt);
  }
}
