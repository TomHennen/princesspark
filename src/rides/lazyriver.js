// Lazy Lagoon River — a closed-loop river channel with a slow current. Riders drift in inner tubes past a
// jellyfish-lamp tunnel, under a waterfall curtain, through spray arches and round a tiki island.
// Four tubes circulate (rider + three empties); boarding starts a fresh lap at the station.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';
import { Track, makeSign, makeStripeTexture } from './shared/track.js';
import { MeshBuilder } from '../world/builder.js';

const LAP = 40, TUBES = 4, SEG = 1.6, SPRAY_N = 28, TORCHES = 8;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const SAND = 0xf3e3b5, STONE = 0xe9e4d8, ROCK = 0x8f8a80, ROCK2 = 0x6f6a62, WOOD = 0x8d5a2b, STRAW = 0xd9b45a, STRAW2 = 0xc49a3c, LEAF = 0x3cab45, LEAF2 = 0x2f9a3e, TRUNK = 0x9b6b43;
const WHITE = 0xfafafa, PINK = 0xff6fb5, YELLOW = 0xffd600, BLUE = 0x3aa8e0, TEAL = 0x1b5e6b, TEAL2 = 0x24788a, DARK = 0x263238;

export class LazyRiver extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Lazy Lagoon River', kind: 'passive' });
    this.cameraOffset.set(0, 3, -6);
    this.cameraLookOffset.set(0, 0.6, 6);
    this.stationRadius = 4;
    this.tagline = 'Drift the loop in a tube. Mind the waterfall!';
  }

  build() {
    // ---- loop (local space, water line y = 0), clockwise from the station at the north-west corner ----
    const pts = [];
    const P = (x, z) => pts.push(new THREE.Vector3(x, 0, z));
    P(-6, -26); P(2, -27); P(14, -27); P(22, -23); P(27, -15); P(28.5, -5); P(27, 5); P(27.5, 13); P(24.5, 21); P(17, 26.5); P(7, 27.5);
    P(-2, 25); P(-6.5, 17); P(-8, 8); P(-4, 1.5); P(2, -3); P(0, -9); P(-5.5, -14.5); P(-8.5, -20.5);
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const track = this.track = new Track(curve, { samples: 480, smooth: 4 });
    this.speed = track.length / LAP;
    this.duration = LAP;
    this.sBoard = track.nearestS(pts[0]);
    this.sTunnel = [track.nearestS(new THREE.Vector3(2, 0, -27)), track.nearestS(new THREE.Vector3(14, 0, -27))];
    this.sFall = track.nearestS(new THREE.Vector3(28.5, 0, -5));
    this.sSpray = [track.nearestS(new THREE.Vector3(17, 0, 26.5)), track.nearestS(new THREE.Vector3(-6.5, 0, 17))];

    const M = this.M = {
      vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      tube: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
      lamp: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 }),
      flame: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 1.6, roughness: 0.5 }),
      spray: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfefff, emissiveIntensity: 0.4 }),
    };
    this.waterTex = makeStripeTexture({ bg: '#2b9ad6', fg: '#a9e4ff', ripple: true, count: 7 });
    M.water = new THREE.MeshStandardMaterial({ map: this.waterTex, color: 0xffffff, emissive: 0x0f4f8a, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.85 });
    this.fallTex = makeStripeTexture({ bg: '#6fc8f2', fg: '#eafaff', count: 9 });
    this.fallTex.repeat.set(2, 1);
    M.fall = new THREE.MeshStandardMaterial({ map: this.fallTex, color: 0xffffff, emissive: 0x3a90c8, emissiveIntensity: 0.25, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 0.3 });

    this.buildChannel(M);
    this.buildScenery(M);
    this.buildTubes(M);
    this.buildEffects(M);

    this.group.updateMatrixWorld(true);
    this.station.copy(this.group.localToWorld(new THREE.Vector3(-10, 0, -30)));
  }

  buildChannel(M) {
    const tr = this.track, n = Math.floor(tr.length / SEG);
    // U-channel unit, 1 m along +Z: tiled floor 0.9 below the water line, low stone banks 0.3 above it
    const paint = (g, c) => { const col = new THREE.Color(c), k = g.attributes.position.count, a = new Float32Array(k * 3); for (let i = 0; i < k; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const unit = mergeGeometries([
      paint(new THREE.BoxGeometry(4.2, 0.3, 1).translate(0, -1.05, 0), 0x9fd8ec),
      paint(new THREE.BoxGeometry(0.5, 1.5, 1).translate(2.1, -0.45, 0), STONE), paint(new THREE.BoxGeometry(0.5, 1.5, 1).translate(-2.1, -0.45, 0), STONE),
      paint(new THREE.BoxGeometry(0.9, 0.16, 1).translate(2.6, 0.22, 0), SAND), paint(new THREE.BoxGeometry(0.9, 0.16, 1).translate(-2.6, 0.22, 0), SAND),
    ], false);
    const channel = new THREE.InstancedMesh(unit, M.vc, n);
    channel.castShadow = true; channel.receiveShadow = true;
    const water = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.7, 1).rotateX(-Math.PI / 2), M.water, n);
    water.userData.noOcclude = true;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * SEG;
      tr.trackAt(s, _p, _q);
      channel.setMatrixAt(k, _m.compose(_p, _q, _v.set(1, 1, SEG * 1.2)));
      water.setMatrixAt(k, _m.compose(_v.copy(_p).setY(0.02), _q, _one.set(1, 1, SEG * 1.12)));
    }
    _one.set(1, 1, 1);
    channel.instanceMatrix.needsUpdate = true; water.instanceMatrix.needsUpdate = true;
    this.group.add(channel, water);
  }

  buildScenery(M) {
    const B = new MeshBuilder(), tr = this.track;
    const yawAt = (s) => { const i = Math.floor(tr.wrap(s) / tr.ds) % tr.N, t = tr.tan[i]; return Math.atan2(t.x, t.z); };
    // --- station deck (north-west corner), tube rack, queue rails ---
    B.box(WOOD, 7, 0.16, 5, -10, 0, -31.5); B.box(SAND, 7.4, 0.06, 5.4, -10, -0.04, -31.5);
    for (const sx of [-1, 1]) { B.box(WHITE, 0.12, 0.9, 5, -10 + sx * 3.4, 0, -31.5); B.box(WHITE, 0.12, 0.12, 5, -10 + sx * 3.4, 0.9, -31.5); }
    for (let k = 0; k < 4; k++) B.add(new THREE.TorusGeometry(0.8, 0.3, 8, 16), [PINK, YELLOW, BLUE, WHITE][k], -12.2, 0.35 + k * 0.62, -32.5, Math.PI / 2);
    B.cyl(WOOD, 0.12, 0.14, 4.6, -7, 0, -34, 7); B.cyl(WOOD, 0.12, 0.14, 4.6, -13, 0, -34, 7);
    B.box(WOOD, 7, 0.2, 0.3, -10, 4.4, -34);
    // --- jellyfish tunnel over the north straight ---
    const t0 = this.sTunnel[0], t1 = this.sTunnel[1], tm = (t0 + t1) / 2, tl = t1 - t0 + 1.5;
    tr.trackAt(tm, _p);
    B.begin(_p.x, -0.3, _p.z, yawAt(tm));
    // half-cylinder arch (top half, axis along the channel)
    B.add(new THREE.CylinderGeometry(3.3, 3.3, tl, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), TEAL, 0, 0, 0);
    B.add(new THREE.CylinderGeometry(3.45, 3.45, 0.6, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), TEAL2, 0, 0, tl / 2 - 0.3);
    B.add(new THREE.CylinderGeometry(3.45, 3.45, 0.6, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), TEAL2, 0, 0, -tl / 2 + 0.3);
    for (const s of [-1, 1]) { B.box(ROCK, 1.0, 2.0, tl, s * 3.6, -0.6, 0); B.sphere(ROCK2, 1.0, s * 3.8, 1.2, tl / 2 - 0.5, 7, 5); B.sphere(ROCK, 0.9, s * 3.9, 1.1, -tl / 2 + 0.5, 7, 5); }
    B.end();
    // --- waterfall rocks + lintel on the east side ---
    tr.trackAt(this.sFall, _p);
    const fallYaw = yawAt(this.sFall);
    B.begin(_p.x, 0, _p.z, fallYaw);
    for (const s of [-1, 1]) {
      B.sphere(ROCK, 1.6, s * 3.6, 0.9, 0, 8, 6, 1, 0.8, 1.2); B.sphere(ROCK2, 1.3, s * 3.4, 2.4, 0.6, 7, 5); B.sphere(ROCK, 1.1, s * 3.2, 3.6, -0.4, 7, 5);
      B.box(ROCK2, 1.2, 1.2, 1.2, s * 3.0, 4.2, 0, 0.4, 0.3);
    }
    B.box(ROCK, 8.4, 1.1, 1.6, 0, 4.6, 0); B.box(ROCK2, 7.6, 0.6, 2.2, 0, 5.4, 0.1, 0.1, 0.1);
    B.box(0x6fc8f2, 6.2, 0.3, 1.0, 0, 5.9, 0);   // pool on top the curtain pours from
    B.end();
    this.fallPos = _p.clone(); this.fallYaw = fallYaw;
    // --- spray arches ---
    this.sprayArches = [];
    for (const s of this.sSpray) {
      tr.trackAt(s, _p); const yaw = yawAt(s);
      B.begin(_p.x, 0.2, _p.z, yaw);
      B.add(new THREE.TorusGeometry(2.6, 0.13, 6, 18, Math.PI), WHITE, 0, 0, 0);   // upright arc across the channel
      B.cyl(BLUE, 0.3, 0.36, 0.3, -2.6, -0.2, 0, 8); B.cyl(BLUE, 0.3, 0.36, 0.3, 2.6, -0.2, 0, 8);
      B.end();
      this.sprayArches.push({ pos: _p.clone(), yaw });
    }
    // --- tiki island: hut, palms, bushes, rocks ---
    B.begin(10, 0, 3, 0.5);
    B.cyl(SAND, 7, 7.5, 0.3, 0, 0, 0, 16);
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) B.cyl(WOOD, 0.16, 0.18, 3.2, x, 0.3, z, 7);
    B.box(WOOD, 4.8, 1.1, 0.5, 0, 0.3, 2.3); B.box(STRAW2, 5.0, 0.12, 0.7, 0, 1.4, 2.3);
    for (const [k, c] of [[0, PINK], [1, YELLOW], [2, BLUE]]) { B.cyl(WHITE, 0.14, 0.12, 0.3, -1.2 + k * 1.2, 1.52, 2.3, 8); B.sphere(c, 0.16, -1.2 + k * 1.2, 1.9, 2.3, 6, 4); }
    B.cone(STRAW, 4.6, 2.2, 0, 3.3, 0, 10); B.cone(STRAW2, 4.9, 0.5, 0, 3.2, 0, 10); B.cone(STRAW, 3.0, 1.4, 0, 5.2, 0, 10); B.sphere(STRAW2, 0.3, 0, 6.6, 0);
    B.end();
    const palm = (x, z, h, ry) => {
      B.begin(x, 0, z, ry);
      for (let i = 0; i < 3; i++) B.add(new THREE.CylinderGeometry(0.22 - i * 0.03, 0.3 - i * 0.03, h / 3 + 0.1, 7), TRUNK, i * 0.3 + 0.15, i * h / 3 + h / 6, 0, 0, 0, -0.15);
      for (let i = 0; i < 8; i++) { const g = new THREE.BoxGeometry(0.5, 0.07, 3.0); g.translate(0, 0, 1.4); B.add(g, i % 2 ? LEAF : LEAF2, 0.95, h + 0.1, 0, 0.4, (i / 8) * Math.PI * 2, 0); }
      B.sphere(0x5d3a1a, 0.2, 1.1, h - 0.2, 0.2); B.sphere(0x5d3a1a, 0.2, 0.8, h - 0.25, -0.2);
      B.end();
    };
    palm(5, 8, 6.5, 1.2); palm(15, -1, 7.5, 2.6); palm(13, 9, 6.0, 4.2); palm(8, -4, 5.5, 0.3);
    for (const [x, z, r] of [[-1, 9, 0.9], [16, 12, 1.1], [19, 2, 0.8], [6, 13, 0.7]]) B.add(new THREE.SphereGeometry(r, 6, 4), 0x2f8f3a, x, r * 0.7, z, 0, 0, 0, 1, 0.75, 1);
    // --- tiki torches along the outer bank ---
    this.torchPos = [];
    for (let k = 0; k < TORCHES; k++) {
      const s = tr.wrap(this.sBoard + 8 + (k / TORCHES) * tr.length), i = Math.floor(s / tr.ds) % tr.N;
      const t = tr.tan[i], px = tr.pos[i].x + t.z * 3.4, pz = tr.pos[i].z - t.x * 3.4;   // outer bank (left of travel; the loop runs clockwise)
      if (s > this.sTunnel[0] - 2 && s < this.sTunnel[1] + 2) continue;
      B.cyl(WOOD, 0.08, 0.11, 2.4, px, 0, pz, 6); B.cyl(STRAW2, 0.22, 0.16, 0.5, px, 2.4, pz, 7);
      this.torchPos.push(new THREE.Vector3(px, 3.05, pz));
    }
    // --- outer bank rocks + greenery ---
    for (let k = 0; k < 26; k++) {
      const s = tr.wrap((k / 26) * tr.length + 3), i = Math.floor(s / tr.ds) % tr.N;
      if (s > this.sTunnel[0] - 3 && s < this.sTunnel[1] + 3) continue;
      if (Math.abs(s - this.sFall) < 4 || Math.abs(s - this.sBoard) < 5 || Math.abs(s - tr.length) < 3) continue;
      const t = tr.tan[i], px = tr.pos[i].x + t.z * 3.3, pz = tr.pos[i].z - t.x * 3.3;
      if (k % 3 === 0) B.add(new THREE.SphereGeometry(0.7, 6, 4), 0x2f8f3a, px, 0.5, pz, 0, k, 0, 1.2, 0.8, 1.2);
      else B.sphere(k % 2 ? ROCK : ROCK2, 0.55, px, 0.3, pz, 6, 4, 1.3, 0.7, 1);
    }
    const stat = B.build(M.vc);
    stat.castShadow = true; stat.receiveShadow = true; this.group.add(stat);

    // jellyfish lamps hanging in the tunnel (emissive, one merged mesh) + one soft point light
    const lampGeo = [], paintG = (g, c) => { const col = new THREE.Color(c), k = g.attributes.position.count, a = new Float32Array(k * 3); for (let i = 0; i < k; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const lampCols = [0xff7bd5, 0x7be8ff, 0xc98bff, 0x7fffd4, 0xffa3e0];
    for (let k = 0; k < 5; k++) {
      const s = t0 + 1.5 + (k / 4) * (t1 - t0 - 3);
      tr.trackAt(s, _p);
      const x = _p.x + (k % 2 ? 1.2 : -1.2), y = 2.3 - (k % 3) * 0.2, z = _p.z;
      lampGeo.push(paintG(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z), lampCols[k]));
      for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2; lampGeo.push(paintG(new THREE.CylinderGeometry(0.03, 0.02, 0.9, 4).translate(x + Math.cos(a) * 0.22, y - 0.45, z + Math.sin(a) * 0.22), lampCols[k])); }
    }
    this.lamps = new THREE.Mesh(mergeGeometries(lampGeo, false), M.lamp); this.group.add(this.lamps);
    tr.trackAt(tm, _p);
    const light = new THREE.PointLight(0xff8ad8, 12, 14, 1.6); light.position.set(_p.x, 1.8, _p.z); this.group.add(light);

    // signs
    const sign = makeSign(['LAZY LAGOON', 'RIVER'], { w: 6.5, h: 2.0, bg: '#1b5e6b', fg: '#ffe082', border: '#ffe082', boardColor: 0x8d5a2b });
    sign.position.set(-10, 5.6, -34); sign.rotation.y = Math.PI; this.group.add(sign);   // faces the promenade (north)
    const sign2 = makeSign(['TUBES THIS WAY'], { w: 3.2, h: 0.7, bg: '#ffffff', fg: '#3aa8e0', border: '#ff6fb5', boardColor: 0xffd600 });
    sign2.position.set(-14.2, 1.5, -33.2); sign2.rotation.y = Math.PI; this.group.add(sign2);

    // colliders: outer wall of the loop (coarse), open at the station corner; the tiki island is unreachable anyway
    this.addBoxCollider(new THREE.Vector3(9.5, 0.6, -29.6), new THREE.Vector3(33, 1.4, 1.0));
    this.addBoxCollider(new THREE.Vector3(30.4, 0.6, 0), new THREE.Vector3(1.0, 1.4, 50));
    this.addBoxCollider(new THREE.Vector3(26, 0.6, 24), new THREE.Vector3(10, 1.4, 1.0));
    this.addBoxCollider(new THREE.Vector3(9, 0.6, 30.2), new THREE.Vector3(26, 1.4, 1.0));
    this.addBoxCollider(new THREE.Vector3(-10.5, 0.6, 20), new THREE.Vector3(1.0, 1.4, 20));
    this.addBoxCollider(new THREE.Vector3(-10.5, 0.6, -16), new THREE.Vector3(1.0, 1.4, 24));
    this.addBoxCollider(new THREE.Vector3(-13.4, 0.5, -31.5), new THREE.Vector3(0.3, 1, 5));
    this.addBoxCollider(new THREE.Vector3(-6.6, 0.5, -31.5), new THREE.Vector3(0.3, 1, 5));
    this.addBoxCollider(new THREE.Vector3(-10, 0.5, -34), new THREE.Vector3(7, 1, 0.5));
  }

  buildTubes(M) {
    this.tubes = [];
    const paint = (g, c) => { const col = new THREE.Color(c), k = g.attributes.position.count, a = new Float32Array(k * 3); for (let i = 0; i < k; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const cols = [[PINK, WHITE], [YELLOW, BLUE], [BLUE, WHITE], [0x7bd94a, YELLOW]];
    for (let k = 0; k < TUBES; k++) {
      const [a, b] = cols[k];
      const geo = mergeGeometries([
        paint(new THREE.TorusGeometry(0.85, 0.32, 8, 18).rotateX(Math.PI / 2).translate(0, 0.3, 0), a),
        paint(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18).translate(0, 0.12, 0), b),
        paint(new THREE.BoxGeometry(0.5, 0.08, 0.3).translate(0.8, 0.64, 0.45), b), paint(new THREE.BoxGeometry(0.5, 0.08, 0.3).translate(-0.8, 0.64, 0.45), b),
      ], false);
      const g = new THREE.Group(), mesh = new THREE.Mesh(geo, M.tube); mesh.castShadow = true; g.add(mesh);
      this.group.add(g);
      this.tubes.push({ group: g, s: this.sBoard + (k * this.track.length) / TUBES, phase: k * 1.7 });
    }
    this.rider = this.tubes[0];
    this.rider.group.add(this.seat);
    this.seat.position.set(0, 0.3, 0);
    this.lapDist = 0;
    this.placeTubes(0);
  }

  buildEffects(M) {
    // waterfall curtain: two scrolling translucent planes across the channel, hung from the rock lintel
    const curtain = new THREE.Group();
    for (const dz of [-0.35, 0.35]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 4.3), M.fall); m.position.set(0, 3.1, dz); m.userData.noOcclude = true; curtain.add(m); }
    curtain.position.copy(this.fallPos); curtain.rotation.y = this.fallYaw; this.group.add(curtain);
    // spray droplets (instanced) over the two arches + torch flames (instanced emissive)
    this.spray = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 5, 4), M.spray, SPRAY_N);
    this.spray.frustumCulled = false; this.spray.userData.noOcclude = true; this.group.add(this.spray);
    this.flames = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 5), M.flame, this.torchPos.length);
    this.flames.userData.noOcclude = true; this.group.add(this.flames);
  }

  placeTubes(t) {
    for (const tb of this.tubes) {
      this.track.trackAt(tb.s, tb.group.position, tb.group.quaternion);
      tb.group.position.y += 0.06 * Math.sin(t * 1.7 + tb.phase);
      tb.group.rotateZ(0.05 * Math.sin(t * 1.3 + tb.phase)); tb.group.rotateX(0.04 * Math.sin(t * 2.1 + tb.phase * 0.7));
    }
  }

  onBoard() {
    const L = this.track.length;
    this.tubes.forEach((tb, k) => { tb.s = this.track.wrap(this.sBoard + (k * L) / TUBES); });
    this.lapDist = 0; this.splashed = false;
    this.placeTubes(this.game.time);
  }

  isComplete() { return this.riding && this.lapDist >= this.track.length - 0.2; }

  update(dt, t) {
    const tr = this.track, ds = this.speed * dt;
    for (const tb of this.tubes) {
      const before = tb.s;
      tb.s = tr.wrap(tb.s + ds);
      if (tb === this.rider && this.riding) {
        this.lapDist += ds;
        if (!this.splashed && before < this.sFall && tb.s >= this.sFall) { this.splashed = true; this.game.audio?.play('whoosh'); }
      }
    }
    this.placeTubes(t);
    this.waterTex.offset.y -= dt * 0.35;
    this.fallTex.offset.y -= dt * 1.6;
    // spray: droplets rain from each arch, cycling every 0.8 s
    const half = SPRAY_N / 2;
    for (let i = 0; i < SPRAY_N; i++) {
      const arch = this.sprayArches[i < half ? 0 : 1], j = i % half, a = ((j + 0.5) / half) * Math.PI;
      const tt = (t * 1.25 + j * 0.37) % 1, lx = Math.cos(a) * 2.6, ly = 0.2 + Math.sin(a) * 2.6 - 4.9 * tt * tt * 0.5;
      _p.set(lx, Math.max(0.05, ly), 0).applyAxisAngle(_up, arch.yaw).add(arch.pos);
      const sc = ly > 0.05 ? 1 : 0;
      this.spray.setMatrixAt(i, _m.compose(_p, _q.identity(), _v.set(sc, sc, sc)));
    }
    this.spray.instanceMatrix.needsUpdate = true;
    // torch flicker
    this.torchPos.forEach((p, i) => { const f = 0.85 + 0.25 * Math.sin(t * 9 + i * 2.1) + 0.1 * Math.sin(t * 23 + i); this.flames.setMatrixAt(i, _m.compose(p, _q.identity(), _v.set(f, f * 1.5, f))); });
    this.flames.instanceMatrix.needsUpdate = true;
    this.lamps.material.emissiveIntensity = 0.75 + 0.25 * Math.sin(t * 2.2);
  }
}
const _up = new THREE.Vector3(0, 1, 0);
