// Gator Gulch Log Flume — winding water trough through a cypress swamp, conveyor lift to a
// high channel, 9 m splash-down into a pool. Three logs circulate; Gus the gator chomps at the drop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';
import { Track, buildPillars, makeSign, makeStripeTexture, addTrackColliders } from './shared/track.js';

const G = 9.81, FLOAT = 4.2, CRAWL = 2.6, LIFT = 2.4, LOGS = 3, SPLASH_N = 20;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
const box = (w, h, d, x, y, z, rot) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.applyMatrix4(_m.makeRotationFromEuler(rot));
  g.translate(x, y, z);
  return g;
};
// small deterministic PRNG so the swamp looks the same every load
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class LogFlume extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Gator Gulch Log Flume', kind: 'passive' });
    this.cameraOffset.set(0, 2.8, -6.5);
    this.cameraLookOffset.set(0, 0.8, 7);
    this.stationRadius = 4;
    this.tagline = 'Float the swamp, meet Gus, get soaked.';
  }

  build() {
    const pts = [];
    const P = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
    // station (south edge, heading +x) → swampy meander up the east side
    P(-6, 0.6, 21); P(2, 0.6, 21); P(10, 0.6, 21);
    P(17, 0.6, 18); P(22, 0.6, 11); P(21, 0.6, 3); P(25, 0.6, -5); P(19, 0.6, -13); P(12, 0.6, -19);
    // conveyor lift heading -x along the north edge
    P(8, 0.6, -20.5); P(6.5, 0.7, -20.7); P(5.2, 1.0, -20.9); P(4, 1.6, -21.05); P(2.5, 2.6, -21.2); P(0.5, 4.1, -21.4); P(-2, 6.0, -21.6); P(-4.5, 7.9, -21.8); P(-6.5, 9.4, -22); P(-8, 9.95, -22); P(-10.5, 10, -22);
    // high channel curving south down the west side
    P(-16, 10, -20); P(-21, 10, -14); P(-22, 10, -6); P(-21, 10, -1);
    // the drop, splash-down and return to the station
    P(-20.7, 9.85, 0.5); P(-20.5, 9.3, 1.8); P(-20.35, 8.2, 3.2); P(-20.2, 5.5, 5.8); P(-20.1, 2.6, 8.4); P(-20.03, 1.0, 10.3); P(-20, 0.65, 12); P(-20, 0.6, 14);
    P(-18, 0.6, 18); P(-13, 0.6, 20.5);
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const track = this.track = new Track(curve, { samples: 500, smooth: 3 });

    this.sStationEnd = track.nearestS(pts[2]);
    this.sLiftStart = track.nearestS(new THREE.Vector3(5.2, 1.0, -20.9));
    this.sLiftTop = track.nearestS(new THREE.Vector3(-6.5, 9.4, -22));
    this.sDropTop = track.nearestS(new THREE.Vector3(-20.7, 9.85, 0.5));
    this.sSplash = track.nearestS(new THREE.Vector3(-20.03, 1.0, 10.3));
    this.sBoard = track.nearestS(new THREE.Vector3(3, 0.6, 21));
    this.speedFn = (s, v, dt) => {
      let target, acc = 6;
      if (s < this.sLiftStart) target = s < this.sStationEnd ? CRAWL : FLOAT;
      else if (s < this.sLiftTop) target = LIFT;
      else if (s < this.sDropTop) target = FLOAT;
      else if (s < this.sSplash) { target = Math.sqrt(FLOAT * FLOAT + 2 * G * (10 - track.heightAt(s)) * 0.85); acc = 30; }
      else target = FLOAT;
      return v + THREE.MathUtils.clamp(target - v, -acc * dt, acc * dt);
    };
    this.duration = Math.round(track.simulateLap(this.speedFn));

    const M = this.M = {
      wood: mat(0x7a5230), plank: mat(0x9c7247), darkWood: mat(0x4a3119), tin: mat(0x8a9099, { metalness: 0.5, roughness: 0.5 }),
      bark: mat(0x5a3d22), barkLight: mat(0xb08a5a), trunk: mat(0x6e5540), leaf: mat(0x1f5c2e), moss: mat(0x8fa36a),
      gator: mat(0x3f7d3a), gatorBelly: mat(0xd9d27a), white: mat(0xf7f7f2), black: mat(0x111111), pink: mat(0xd9667a),
      pond: new THREE.MeshStandardMaterial({ color: 0x3e6b3a, roughness: 0.4, metalness: 0.1 }),
      splash: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff4ff, emissiveIntensity: 0.4 }),
      reed: mat(0x6f8f3a), stone: mat(0x7d7f7a),
    };
    this.waterTex = makeStripeTexture({ bg: '#2b86d6', fg: '#9fdcff', ripple: true, count: 7 });
    M.water = new THREE.MeshStandardMaterial({ map: this.waterTex, color: 0xffffff, emissive: 0x0f3f7a, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.9 });
    this.beltTex = makeStripeTexture({ bg: '#2d2d2d', fg: '#e3b43a', count: 8 });
    this.beltTex.repeat.set(1, 8);
    M.belt = new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.9 });

    this.buildChannel(M);
    this.buildPoolsAndSplash(M);
    this.buildStation(M);
    this.buildSwamp(M);
    this.buildGator(M);
    this.buildLogs(M);

    this.group.updateMatrixWorld(true);
    this.station.copy(this.group.localToWorld(new THREE.Vector3(2, 0, 25)));
  }

  buildChannel(M) {
    const tr = this.track, seg = 1.6, n = Math.floor(tr.length / seg);
    // U-channel unit: 1 m long along +Z, floor top 0.4 below the water line, walls 0.4 above it
    const unit = mergeGeometries([box(2.6, 0.3, 1, 0, -0.55, 0), box(0.25, 1.1, 1, 1.3, -0.15, 0), box(0.25, 1.1, 1, -1.3, -0.15, 0)]);
    const channel = new THREE.InstancedMesh(unit, M.wood, n);
    channel.castShadow = true;
    const water = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1).rotateX(-Math.PI / 2), M.water, n);
    let wi = 0;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * seg;
      tr.trackAt(s, _p, _q);
      channel.setMatrixAt(k, _m.compose(_p, _q, _v.set(1, 1, seg * 1.15)));
      const i = Math.floor(s / tr.ds) % tr.N;
      if (tr.tan[i].y < 0.18) water.setMatrixAt(wi++, _m.compose(_v.copy(_p).setY(_p.y + 0.02), _q, _one.set(1, 1, seg * 1.1)));
    }
    _one.set(1, 1, 1);
    water.count = wi;
    channel.instanceMatrix.needsUpdate = true; water.instanceMatrix.needsUpdate = true;
    channel.userData.noOcclude = true; water.userData.noOcclude = true;   // thin trough shell: never yanks the camera
    this.group.add(channel, water);
    // walkers can't step into the trough where it runs at ground level
    addTrackColliders(this, tr, { maxH: 2.2, width: 2.9, step: 8 });
    // conveyor belt up the lift with scrolling stripes
    const a = new THREE.Vector3(5.5, 0.9, -20.9), b = new THREE.Vector3(-6.5, 9.1, -22);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, a.distanceTo(b) + 1.5), M.belt);
    belt.position.lerpVectors(a, b, 0.5); belt.lookAt(b); belt.userData.noOcclude = true; this.group.add(belt);
    // twin trestle posts under the elevated channel (thin: no camera occlusion)
    for (const lateral of [1.1, -1.1]) {
      const posts = buildPillars(tr, { every: 3, minH: 1.4, drop: 0.7, width: 0.3, lateral, clear: 2.2, mat: M.darkWood });
      posts.userData.noOcclude = true; this.group.add(posts);
    }
  }

  buildPoolsAndSplash(M) {
    const pool = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 12), M.water);
    pool.position.set(-20, 0.05, 12); pool.receiveShadow = true; this.group.add(pool);
    const rim = new THREE.Mesh(mergeGeometries([box(12.8, 0.3, 0.4, -20, 0.15, 5.8), box(12.8, 0.3, 0.4, -20, 0.15, 18.2), box(0.4, 0.3, 12.8, -26.2, 0.15, 12), box(0.4, 0.3, 12.8, -13.8, 0.15, 12)]), M.stone);
    rim.userData.noOcclude = true; this.group.add(rim);
    // pool edges keep walkers out of the splash pool
    this.addBoxCollider(new THREE.Vector3(-20, 0.3, 5.8), new THREE.Vector3(12.8, 0.6, 0.5));
    this.addBoxCollider(new THREE.Vector3(-20, 0.3, 18.2), new THREE.Vector3(12.8, 0.6, 0.5));
    this.addBoxCollider(new THREE.Vector3(-26.2, 0.3, 12), new THREE.Vector3(0.5, 0.6, 12.8));
    this.addBoxCollider(new THREE.Vector3(-13.8, 0.3, 12), new THREE.Vector3(0.5, 0.6, 12.8));
    const pond = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 11), M.pond);
    pond.position.set(-6, 0.05, 6); this.group.add(pond);
    // splash droplets
    this.splash = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 6, 5), M.splash, SPLASH_N);
    this.splash.count = 0; this.splash.userData.noOcclude = true;
    this.splashT = 99;
    const r = rng(7);
    this.splashDirs = [];
    for (let i = 0; i < SPLASH_N; i++) {
      const a = r() * Math.PI * 2, sp = 2 + r() * 3.5;
      this.splashDirs.push(new THREE.Vector3(Math.cos(a) * sp, 4.5 + r() * 4, Math.sin(a) * sp * 0.7 + 3));
    }
    this.splashOrigin = this.track.trackAt(this.sSplash + 1.5, new THREE.Vector3()).setY(0.6);
    this.group.add(this.splash);
  }

  buildStation(M) {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.15, 3.6), M.plank);
    deck.position.set(2, 0.075, 24.8); deck.receiveShadow = true; g.add(deck);
    // plank back wall north of the trough, posts, gabled tin roof
    const wall = new THREE.Mesh(mergeGeometries([box(20, 4, 0.3, 2, 2, 18.9), ...[-7, -3, 1, 5, 9, 11].map((x) => box(0.3, 4.4, 0.4, x, 2.2, 18.9))]), M.darkWood);
    wall.castShadow = true; g.add(wall);
    const posts = mergeGeometries([-7.5, 1.5, 11.5].flatMap((x) => [box(0.35, 5, 0.35, x, 2.5, 19.6), box(0.35, 5, 0.35, x, 2.5, 26.9)]));
    const postMesh = new THREE.Mesh(posts, M.wood); postMesh.userData.noOcclude = true; g.add(postMesh);
    const roof = new THREE.Mesh(mergeGeometries([
      box(21, 0.2, 5.4, 2, 6.2, 20.9, new THREE.Euler(0.42, 0, 0)),
      box(21, 0.2, 5.4, 2, 6.2, 25.6, new THREE.Euler(-0.42, 0, 0)),
      box(21.4, 0.3, 0.5, 2, 7.3, 23.25),
    ]), M.tin);
    roof.castShadow = true; g.add(roof);
    // gable boards + signs
    g.add(new THREE.Mesh(mergeGeometries([box(21, 1.8, 0.2, 2, 6.0, 28.45), box(21, 1.8, 0.2, 2, 6.0, 18.6)]), M.plank));
    const sign = makeSign(['GATOR GULCH', 'LOG FLUME'], { w: 9, h: 2.2, bg: '#2f4a1e', fg: '#f1e4a6', border: '#f1e4a6', boardColor: 0x4a3119 });
    sign.position.set(2, 5.9, 28.75); g.add(sign);
    const sign2 = makeSign(['GATOR GULCH'], { w: 7, h: 1.3, bg: '#2f4a1e', fg: '#f1e4a6', border: '#f1e4a6', boardColor: 0x4a3119 });
    sign2.position.set(2, 3.2, 19.15); g.add(sign2);
    // queue fence (gap at x 3..7 is the entrance)
    const posts2 = [], rails = [];
    const run = (x0, x1, z) => { for (let x = x0; x <= x1 + 0.01; x += 2) posts2.push([x, z]); rails.push([(x0 + x1) / 2, z, x1 - x0]); };
    run(-7, 3, 26.9); run(7, 11, 26.9); run(-7, 3, 28.7);
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), M.darkWood, posts2.length);
    posts2.forEach(([x, z], i) => pm.setMatrixAt(i, _m.compose(_p.set(x, 0.55, z), _q.identity(), _one)));
    pm.instanceMatrix.needsUpdate = true; pm.userData.noOcclude = true; g.add(pm);
    const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 0.08), M.plank, rails.length * 2 + 2);
    let ri = 0;
    rails.forEach(([x, z, len]) => { for (const y of [0.5, 0.95]) rm.setMatrixAt(ri++, _m.compose(_p.set(x, y, z), _q.identity(), _v.set(len, 1, 1))); });
    for (const y of [0.5, 0.95]) rm.setMatrixAt(ri++, _m.compose(_p.set(-7, y, 27.8), _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), _v.set(1.8, 1, 1)));
    rm.instanceMatrix.needsUpdate = true; rm.userData.noOcclude = true; g.add(rm);
    this.group.add(g);
    this.addBoxCollider(new THREE.Vector3(2, 2, 18.9), new THREE.Vector3(20, 4, 0.5));
    this.addBoxCollider(new THREE.Vector3(-2, 0.6, 26.9), new THREE.Vector3(10, 1.2, 0.3));
    this.addBoxCollider(new THREE.Vector3(9, 0.6, 26.9), new THREE.Vector3(4, 1.2, 0.3));
    this.addBoxCollider(new THREE.Vector3(-2, 0.6, 28.7), new THREE.Vector3(10, 1.2, 0.3));
  }

  buildSwamp(M) {
    const tr = this.track, r = rng(42);
    const clear = (x, z, d) => { for (let i = 0; i < tr.N; i += 2) { const p = tr.pos[i]; if (Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) return false; } return true; };
    // cypress trees: tapered trunk + knees (same instanced mesh), two cone tiers, hanging moss
    const spots = [[-27, -27], [-26, -20], [-28, -8], [-27, 6], [-28, 20], [-15, -27], [-2, -27], [-12, -9], [-8, -16], [0, -12], [8, -10], [14, -4], [16, 5], [10, 10], [4, 2], [27, 2], [28, 18], [27, -14], [-2, 14], [22, 24], [-24, 26], [15, -26], [-14, 2], [2, -4]];
    const trees = spots.filter(([x, z]) => clear(x, z, 3.6) && !(x > -27 && x < -13 && z > 5 && z < 19) && !(x > -14 && x < 2 && z > 0 && z < 12));
    const trunkM = [], leafM = [], mossM = [];
    for (const [x, z] of trees) {
      const h = 7 + r() * 5, s = 0.8 + r() * 0.4;
      trunkM.push(new THREE.Matrix4().compose(_p.set(x, h / 2, z), _q.identity(), _v.set(s, h, s)));
      for (let k = 0; k < 3; k++) { const a = r() * 6.28, d = 1.2 + r() * 1.2; trunkM.push(new THREE.Matrix4().compose(_p.set(x + Math.cos(a) * d, 0.5, z + Math.sin(a) * d), _q.identity(), _v.set(0.35, 1.0 + r(), 0.35))); }
      leafM.push(new THREE.Matrix4().compose(_p.set(x, h + 1.2, z), _q.identity(), _v.set(3.2 * s, 4.0, 3.2 * s)));
      leafM.push(new THREE.Matrix4().compose(_p.set(x, h + 3.6, z), _q.identity(), _v.set(2.2 * s, 3.4, 2.2 * s)));
      for (let k = 0; k < 4; k++) { const a = r() * 6.28, d = 1.4 + r() * 1.4, len = 1.5 + r() * 2.5; mossM.push(new THREE.Matrix4().compose(_p.set(x + Math.cos(a) * d, h + 0.6 - len / 2, z + Math.sin(a) * d), _q.identity(), _v.set(1, len, 1))); }
    }
    // swamp dressing (trunks, foliage, moss, reeds) never occludes the ride camera
    const inst = (geo, m, list, shadow) => { const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.instanceMatrix.needsUpdate = true; im.castShadow = !!shadow; im.userData.noOcclude = true; this.group.add(im); return im; };
    // cypress trunks are solid enough to walk into
    for (const [x, z] of trees) this.addBoxCollider(new THREE.Vector3(x, 1.0, z), new THREE.Vector3(1.4, 2, 1.4));
    inst(new THREE.CylinderGeometry(0.28, 0.75, 1, 7), M.trunk, trunkM, true);
    inst(new THREE.ConeGeometry(1, 1, 7), M.leaf, leafM, true);
    inst(new THREE.BoxGeometry(0.16, 1, 0.16), M.moss, mossM);
    // reeds around the pond and pool edges
    const reedM = [];
    const clusters = [[-3, 12.5], [1.5, 7], [-13, 4], [-10, 12], [-27, 4], [-13, 19.5], [23, 20], [26, -10], [14, -14], [-24, -24]];
    for (const [cx, cz] of clusters) for (let k = 0; k < 7; k++) {
      const x = cx + (r() - 0.5) * 2.4, z = cz + (r() - 0.5) * 2.4;
      if (!clear(x, z, 1.9)) continue;
      reedM.push(new THREE.Matrix4().compose(_p.set(x, 0.8, z), _q.setFromAxisAngle(_v.set(r() - 0.5, 0, r() - 0.5).normalize(), (r() - 0.5) * 0.3), new THREE.Vector3(1, 0.8 + r() * 0.8, 1)));
    }
    inst(new THREE.BoxGeometry(0.1, 2, 0.1), M.reed, reedM);
    const cattail = reedM.map((m) => { const o = m.clone(); const e = o.elements; e[13] += e[5] * 0.95; e[5] = 0.35; return o; });
    inst(new THREE.BoxGeometry(0.22, 1, 0.22), M.bark, cattail);
  }

  buildGator(M) {
    const g = new THREE.Group();
    g.position.set(-8, 0.1, 6); g.rotation.y = -Math.PI / 2; // faces -x toward the drop
    const body = [box(1.9, 0.9, 3.6, 0, 0.6, 0), box(1.3, 0.6, 1.7, 0, 0.5, -2.5), box(0.85, 0.45, 1.7, 0, 0.42, -4.0), box(0.5, 0.3, 1.8, 0, 0.35, -5.5)];
    for (const [x, z] of [[1.15, 1.2], [-1.15, 1.2], [1.15, -1.2], [-1.15, -1.2]]) body.push(box(0.55, 0.6, 0.6, x, 0.3, z));
    for (let i = 0; i < 7; i++) body.push(box(0.3, 0.3, 0.4, 0, 1.15 - Math.max(0, i - 3) * 0.08, 1.4 - i * 0.9));
    const bodyMesh = new THREE.Mesh(mergeGeometries(body), M.gator); bodyMesh.castShadow = true; g.add(bodyMesh);
    g.add(new THREE.Mesh(box(1.5, 0.35, 3.5, 0, 0.3, 0.1), M.gatorBelly));
    // upper jaw (pivot at the back of the head)
    const up = new THREE.Group(); up.position.set(0, 0.95, 1.8);
    up.add(new THREE.Mesh(mergeGeometries([box(1.5, 0.55, 2.4, 0, 0.25, 1.2), box(0.5, 0.45, 0.5, 0.5, 0.75, 0.3), box(0.5, 0.45, 0.5, -0.5, 0.75, 0.3)]), M.gator));
    const teethUp = []; for (let i = 0; i < 5; i++) for (const s of [-1, 1]) teethUp.push(box(0.16, 0.3, 0.16, s * 0.62, -0.12, 0.35 + i * 0.45));
    up.add(new THREE.Mesh(mergeGeometries([...teethUp, box(0.3, 0.3, 0.1, 0.5, 0.78, 0.56), box(0.3, 0.3, 0.1, -0.5, 0.78, 0.56)]), M.white));
    up.add(new THREE.Mesh(mergeGeometries([box(0.14, 0.14, 0.06, 0.5, 0.8, 0.62), box(0.14, 0.14, 0.06, -0.5, 0.8, 0.62), box(0.12, 0.1, 0.1, 0.3, 0.5, 2.38), box(0.12, 0.1, 0.1, -0.3, 0.5, 2.38)]), M.black));
    // lower jaw
    const lo = new THREE.Group(); lo.position.set(0, 0.75, 1.8);
    lo.add(new THREE.Mesh(box(1.4, 0.35, 2.4, 0, -0.17, 1.2), M.gator));
    lo.add(new THREE.Mesh(box(1.0, 0.1, 1.8, 0, 0.02, 1.0), M.pink));
    const teethLo = []; for (let i = 0; i < 4; i++) for (const s of [-1, 1]) teethLo.push(box(0.16, 0.3, 0.16, s * 0.56, 0.1, 0.6 + i * 0.45));
    lo.add(new THREE.Mesh(mergeGeometries(teethLo), M.white));
    g.add(up, lo);
    this.gator = { group: g, up, lo, chomp: 0 };
    this.group.add(g);
    this.addBoxCollider(new THREE.Vector3(-7, 0.5, 6), new THREE.Vector3(10, 1, 2));   // Gus, nose to tail (faces -x)
  }

  buildLogs(M) {
    this.logs = [];
    for (let k = 0; k < LOGS; k++) {
      const log = new THREE.Group();
      const bark = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.4, 10).rotateX(Math.PI / 2).translate(0, 0.4, 0), M.bark);
      bark.castShadow = true; log.add(bark);
      const caps = mergeGeometries([new THREE.CylinderGeometry(0.62, 0.62, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.4, 1.7), new THREE.CylinderGeometry(0.62, 0.62, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.4, -1.7)]);
      log.add(new THREE.Mesh(caps, M.barkLight));
      log.add(new THREE.Mesh(mergeGeometries([box(1.2, 0.6, 2.5, 0, 0.9, 0), box(0.4, 0.3, 0.2, 0.3, 1.05, 1.8), box(0.4, 0.3, 0.2, -0.3, 1.05, 1.8)]), M.darkWood));
      // gator-ish eyes on the bow
      log.add(new THREE.Mesh(mergeGeometries([box(0.18, 0.18, 0.08, 0.3, 1.08, 1.92), box(0.18, 0.18, 0.08, -0.3, 1.08, 1.92)]), M.white));
      this.group.add(log);
      const s = (k * this.track.length) / LOGS;
      this.logs.push({ group: log, s, v: FLOAT, prevS: s });
    }
    this.logs[0].group.add(this.seat);
    this.seat.position.set(0, 0.25, -0.3);
    // the other logs are vehicles too: never pull the camera in
    for (let k = 1; k < LOGS; k++) this.logs[k].group.traverse((o) => { if (o.isMesh) o.userData.noOcclude = true; });
    this.rider = this.logs[0];
    this.lapDist = 0; this.whooshed = false;
    this.placeLogs();
  }

  placeLogs() { for (const l of this.logs) this.track.trackAt(l.s, l.group.position, l.group.quaternion); }

  onBoard() {
    // fresh lap: snap the rider's log to the station, keep the other two evenly spaced ahead
    const L = this.track.length;
    this.logs.forEach((l, k) => { l.s = this.track.wrap(this.sBoard + (k * L) / LOGS); l.v = k === 0 ? CRAWL : FLOAT; l.prevS = l.s; });
    this.lapDist = 0; this.whooshed = false;
    this.placeLogs();
  }

  isComplete() { return this.riding && this.lapDist >= this.track.length - 0.2; }

  update(dt, t) {
    const tr = this.track;
    for (const l of this.logs) {
      const before = tr.wrap(l.s);
      l.v = this.speedFn(before, l.v, dt);
      const ds = l.v * dt;
      l.s = tr.wrap(l.s + ds);
      if (before < this.sSplash && l.s >= this.sSplash) { this.splashT = 0; this.splash.count = SPLASH_N; }
      if (before < this.sDropTop && l.s >= this.sDropTop) this.gator.chomp = 1.6;
      if (l === this.rider && this.riding) {
        this.lapDist += ds;
        if (!this.whooshed && before < this.sDropTop && l.s >= this.sDropTop) { this.whooshed = true; this.game.audio?.play('whoosh'); }
      }
    }
    this.placeLogs();
    // flowing water + conveyor
    this.waterTex.offset.y -= dt * 0.5;
    this.beltTex.offset.y += dt * 1.2;
    // splash burst (~1 s)
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
    // Gus: lazy idle jaw, big chomp when a log goes over the drop
    const gt = this.gator;
    let open = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.1));
    if (gt.chomp > 0) { gt.chomp -= dt; const c = THREE.MathUtils.clamp(gt.chomp / 1.6, 0, 1); open = Math.max(open, Math.sin(c * Math.PI) * 0.9); }
    gt.up.rotation.x = -open; gt.lo.rotation.x = open * 0.55;
    gt.group.position.y = 0.1 + Math.sin(t * 0.8) * 0.06;
  }
}
