// Dragon's Breath Coaster — closed-loop steel coaster: chain lift, big first drop through a
// dragon-head arch, vertical loop, airtime hills, banked helix, brake run back to the station.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';
import { Track, buildRails, buildPillars, makeSign, addTrackColliders, addInstanceColliders, addPlotFence } from './shared/track.js';
import { makeLightCuller } from '../world/builder.js';

const G = 9.81, EFF = 0.72, VMIN = 4.0, CHAIN = 4.2, CRAWL = 2.6, CAR_GAP = 3.8;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });
const box = (w, h, d, x, y, z, rot) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.applyMatrix4(_m.makeRotationFromEuler(rot));
  g.translate(x, y, z);
  return g;
};

export class Coaster extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: "Dragon's Breath Coaster", kind: 'passive' });
    this.cameraOffset.set(0, 3.0, -5.5);
    this.cameraLookOffset.set(0, 1.0, 7);
    this.stationRadius = 4;
    this.tagline = 'Chain lift, 23 m drop, a loop and a dragon.';
    this.menuColor = '#8e1e1e';
    this.seatCar = 2;      // index into this.cars (0 = front)
  }

  build() {
    const pts = [];
    const P = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
    // --- station (heading +x along the south edge) ---
    P(-2, 1.2, 22); P(6, 1.2, 22); P(14, 1.2, 22);
    P(22, 1.5, 21); P(28, 2.5, 16); P(31, 4, 9);
    // --- lift hill up the east edge ---
    P(32, 5.5, 5); P(32, 14, -7.5); P(32, 23, -20);
    P(31.5, 23.8, -24.5); P(27, 23.2, -27);
    // --- first drop heading -x along the north edge ---
    P(20, 19, -27.3); P(12, 10.5, -27.2); P(4, 3.8, -27); P(-3, 2.5, -27);
    // --- vertical loop (shifts 4 m in z so entry/exit don't collide) ---
    const LC = new THREE.Vector3(-12, 8.5, -25), LR = 6;
    for (let k = 0; k <= 8; k++) { const a = k * Math.PI / 4; P(LC.x - LR * Math.sin(a), LC.y - LR * Math.cos(a), -27 + 4 * k / 8); }
    // --- airtime hill down the west edge ---
    P(-20, 2.5, -23); P(-27, 3, -21); P(-31, 5.5, -17); P(-32.5, 7.2, -13); P(-33, 7.9, -9.5); P(-33, 7.7, -6); P(-33, 7.2, -3); P(-33, 7.8, 2);
    // --- descending banked helix (one full turn, 9 m -> 2.5 m) ---
    const HC = new THREE.Vector3(-25, 0, 8), HR = 8;
    for (let k = 0; k <= 8; k++) { const b = k * Math.PI / 4; P(HC.x - HR * Math.cos(b), 9 - 6.5 * k / 8, HC.z + HR * Math.sin(b)); }
    // --- brake run back to the station ---
    P(-33, 2.5, 14); P(-29, 2.2, 19.5); P(-20, 1.8, 22); P(-10, 1.4, 22.3);

    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const hTop = Math.max(...pts.map((p) => p.y)) + 0.1;
    this.hTop = hTop;
    const speedAtH = (h) => Math.sqrt(Math.max(VMIN * VMIN, 2 * G * (hTop - h) * EFF));
    const loopUp = new THREE.Vector3();
    // sample indices of the crest / brake start, so banking uses the real speed profile (chain speed on the lift)
    const NS = 900; let crestIdx = 0, brakeIdx = 0, bd = Infinity; const brakePt = new THREE.Vector3(-33, 2.5, 14);
    for (let i = 0; i < NS; i++) { const p = curve.getPointAt(i / NS); if (p.y > curve.getPointAt(crestIdx / NS).y) crestIdx = i; const d = p.distanceToSquared(brakePt); if (d < bd) { bd = d; brakeIdx = i; } }
    const speedAtIdx = (i, h) => i < crestIdx ? CHAIN : i > brakeIdx ? THREE.MathUtils.lerp(speedAtH(h), CRAWL, (i - brakeIdx) / (NS - brakeIdx)) : speedAtH(h);
    const track = this.track = new Track(curve, {
      samples: NS,
      // inside the loop the up vector points at the loop centre (train rides inside the circle)
      up: (i, pos, tan, out) => {
        const d = pos.distanceTo(LC);
        if (d > LR + 2.5) return false;
        loopUp.subVectors(LC, pos).setZ(0).normalize(); // toward the loop axis
        const w = THREE.MathUtils.smoothstep(LR + 2.5 - d, 0, 2.5);
        out.set(0, 1, 0).lerp(loopUp, w);
        return true;
      },
      // bank into turns by the lateral g-force at the local speed
      bank: (i, pos, tan, curv, up) => {
        if (pos.distanceTo(LC) < LR + 2.5) return 0;
        const v = speedAtIdx(i, pos.y);
        _v.crossVectors(tan, up);
        const lat = curv.dot(_v) * v * v;
        return THREE.MathUtils.clamp(Math.atan2(lat, G), -1.05, 1.05);
      },
      smooth: 4,
    });

    // key arc lengths
    this.sStationEnd = track.nearestS(pts[2]);
    this.sCrest = track.nearestS(new THREE.Vector3(31.5, 23.8, -24.5));
    this.sBrake = track.nearestS(brakePt);
    this.sBoard = track.nearestS(new THREE.Vector3(9, 1.2, 22));
    this.speedFn = (s, v, dt) => {
      let target;
      if (s < this.sCrest) target = s < this.sStationEnd ? CRAWL : CHAIN;
      else {
        target = speedAtH(track.heightAt(s));
        if (s > this.sBrake) target = THREE.MathUtils.lerp(target, CRAWL, THREE.MathUtils.smoothstep((s - this.sBrake) / (track.length - this.sBrake), 0, 0.85));
      }
      return v + THREE.MathUtils.clamp(target - v, -22 * dt, 22 * dt);
    };
    this.duration = Math.round(track.simulateLap(this.speedFn));

    // --- materials ---
    const M = {
      rail: mat(0xd6452b, { metalness: 0.45, roughness: 0.45 }),
      spine: mat(0x4a4a52, { metalness: 0.3, roughness: 0.6 }),
      tie: mat(0x2c2c30),
      pillar: mat(0xbfc3c9, { metalness: 0.2 }),
      stone: mat(0x6b6670, { roughness: 0.95 }),
      roof: mat(0x8e1e1e),
      wood: mat(0x6b4423, { roughness: 0.95 }),
      gold: mat(0xe0b534, { metalness: 0.6, roughness: 0.35 }),
      green: mat(0x0b5d3b),
      darkGreen: mat(0x08432b),
      black: mat(0x1a1a1a),
      white: mat(0xf4f1ea),
      eye: new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff7a00, emissiveIntensity: 2.2 }),
      fire: new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff3c00, emissiveIntensity: 1.6 }),
    };

    // --- track, ties, pillars ---
    const rails = buildRails(track, { gauge: 1.2, railR: 0.09, tieEvery: 1.25, railMat: M.rail, spineMat: M.spine, tieMat: M.tie });
    const pillars = buildPillars(track, { every: 5.5, minH: 1.4, drop: 0.75, width: 0.42, mat: M.pillar });
    // thin rails / ties / pillars must not yank the ride camera in; only solid things occlude
    rails.traverse((o) => { o.userData.noOcclude = true; }); pillars.userData.noOcclude = true;
    this.group.add(rails, pillars);
    addInstanceColliders(this, pillars, { minW: 0.6 });   // support legs are solid
    // walkers can't cross the track where it runs at ground level (station + brake run)
    addTrackColliders(this, track, { maxH: 2.2, width: 1.8, step: 7 });
    // lift chain (dark beam between the rails along the lift)
    {
      const a = new THREE.Vector3(32, 5.5, 5), b = new THREE.Vector3(32, 23, -20);
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, len), M.black);
      chain.position.copy(mid); chain.position.y += 0.08; chain.lookAt(b.x, b.y + 0.08, b.z);
      chain.userData.noOcclude = true;
      this.group.add(chain);
    }

    this.buildStation(M);
    this.buildDragonHead(M);
    this.buildTrain(M);

    // default seat: the LAST car (the camera behind the rider sees the other cars run ahead); see chooseSeat()
    this.seat.position.set(0, 0.55, -0.3);
    this.chooseSeat('back');

    this.s = this.sBoard; this.v = CRAWL; this.lapDist = 0; this.whooshed = false;
    this.placeTrain();

    this.group.updateMatrixWorld(true);
    this.station.copy(this.group.localToWorld(new THREE.Vector3(6, 0, 25.5)));
    // plot fence (70 x 60 footprint, inset 1); the gap spans the whole queue so its own rails do the guiding there
    addPlotFence(this, { w: 70, d: 60, inset: 1, side: 'S', gap: [-3.5, 15.5], colors: { rail: 0x8e1e1e } });
  }

  // ---------- seats ----------
  seatOptions() {
    return [
      { id: 'front', label: '🐲 Front car', sub: 'nose first, nothing in the way' },
      { id: 'middle', label: '🎢 Middle car', sub: 'the smooth seat' },
      { id: 'back', label: '🔥 Back car', sub: 'whipped over the drop' },
    ];
  }
  chooseSeat(id) {
    const k = { front: 0, middle: 1, back: 2 }[id] ?? 2;
    this.seatCar = k;
    this.cars[k].add(this.seat);
    this._peerSeats?.forEach((s, i) => s && this.placePeer(s, i));
  }
  /** Remote riders fill the other cars first (front-most first), then double up beside someone. */
  placePeer(s, i) {
    const n = this.cars.length, others = this.cars.map((_, k) => k).filter((k) => k !== this.seatCar);
    const k = i < others.length ? others[i] : i % n;
    s.position.set(i < others.length ? 0 : (i % 2 ? -0.5 : 0.5), 0.55, -0.3);
    this.cars[k].add(s);
  }
  peerSeat(i) {
    this._peerSeats ||= [];
    if (!this._peerSeats[i]) { const s = new THREE.Object3D(); this.placePeer(s, i); this._peerSeats[i] = s; }
    return this._peerSeats[i];
  }

  buildStation(M) {
    const g = new THREE.Group();
    const platform = new THREE.Mesh(new THREE.BoxGeometry(20, 0.15, 4.2), M.stone);
    platform.position.set(6, 0.075, 25.6); platform.receiveShadow = true; g.add(platform);
    // stone back wall north of the track, with a dragon-red roof
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 5.8, 0.5), M.stone);
    wall.position.set(6, 2.9, 19.6); wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
    const cols = mergeGeometries([box(0.5, 6, 0.5, -3.5, 3, 27.5), box(0.5, 6, 0.5, 15.5, 3, 27.5)]);
    g.add(new THREE.Mesh(cols, M.stone));
    const roof = new THREE.Mesh(mergeGeometries([box(21, 0.4, 10, 6, 6.2, 24.2), box(21.6, 0.3, 10.6, 6, 6.55, 24.2), box(14, 1.2, 5, 6, 7.0, 24.2)]), M.roof);
    roof.castShadow = true; g.add(roof);
    // gold trim + battlements
    const trim = [];
    for (let i = 0; i < 7; i++) trim.push(box(1.2, 0.8, 0.6, -3 + i * 3, 6.5, 19.6));
    const trimMesh = new THREE.Mesh(mergeGeometries(trim), M.gold); trimMesh.userData.noOcclude = true; g.add(trimMesh);
    // sign on the roof front facing the park
    const sign = makeSign(["DRAGON'S BREATH", 'COASTER'], { w: 10, h: 2.4, bg: '#1a0d0d', fg: '#ffb020', border: '#ffb020' });
    sign.position.set(6, 8.4, 29.0); g.add(sign);
    const sign2 = makeSign(["DRAGON'S BREATH"], { w: 8, h: 1.4, bg: '#1a0d0d', fg: '#ffb020', border: '#ffb020' });
    sign2.position.set(6, 4.6, 20.05); g.add(sign2);
    // queue fence: posts + rails (instanced), entrance gap at x 5..11
    const posts = [], rails = [];
    const run = (x0, x1, z) => { for (let x = x0; x <= x1 + 0.01; x += 2) posts.push([x, z]); rails.push([(x0 + x1) / 2, z, x1 - x0]); };
    run(-3, 5, 27.8); run(11, 15, 27.8); run(-3, 5, 29.6);
    posts.push([-3, 28.7], [5, 28.7]);
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), M.wood, posts.length);
    posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, _m.compose(_p.set(x, 0.55, z), _q.identity(), _v.set(1, 1, 1))));
    postMesh.instanceMatrix.needsUpdate = true; postMesh.userData.noOcclude = true; g.add(postMesh);
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 0.07), M.gold, rails.length * 2 + 2);
    let ri = 0;
    rails.forEach(([x, z, len]) => { for (const y of [0.55, 0.95]) railMesh.setMatrixAt(ri++, _m.compose(_p.set(x, y, z), _q.identity(), _v.set(len, 1, 1))); });
    for (const y of [0.55, 0.95]) railMesh.setMatrixAt(ri++, _m.compose(_p.set(-3, y, 28.7), _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), _v.set(1.8, 1, 1)));
    railMesh.instanceMatrix.needsUpdate = true; railMesh.userData.noOcclude = true; g.add(railMesh);
    this.group.add(g);
    this.addBoxCollider(new THREE.Vector3(6, 2.9, 19.6), new THREE.Vector3(20, 5.8, 0.6));
    this.addBoxCollider(new THREE.Vector3(1, 0.6, 27.8), new THREE.Vector3(8, 1.2, 0.3));
    this.addBoxCollider(new THREE.Vector3(13, 0.6, 27.8), new THREE.Vector3(4, 1.2, 0.3));
    this.addBoxCollider(new THREE.Vector3(1, 0.6, 29.6), new THREE.Vector3(8, 1.2, 0.3));
    this.addBoxCollider(new THREE.Vector3(-3, 0.6, 28.7), new THREE.Vector3(0.3, 1.2, 2.1));   // queue end rail
    this.addBoxCollider(new THREE.Vector3(-3.5, 3, 27.5), new THREE.Vector3(0.6, 6, 0.6));   // roof columns
    this.addBoxCollider(new THREE.Vector3(15.5, 3, 27.5), new THREE.Vector3(0.6, 6, 0.6));
  }

  buildDragonHead(M) {
    // The head is pitched to match the first drop so the open mouth is a tunnel parallel to the
    // rails. Head space: origin on the rail at the back of the mouth, +x up the hill toward the
    // snout, +y away from the rails. The jaw sits ~1.1 m under the rail and the skull 4 m above it
    // (a rider's head is 2.45 m above the rail), sized from the real rail profile through the head.
    const tr = this.track;
    const onDrop = (p) => p.z < -24 && p.x > 4 && p.x < 28;
    const railAt = (x) => { let best = null; for (const p of tr.pos) if (onDrop(p) && (!best || Math.abs(p.x - x) < Math.abs(best.x - x))) best = p; return best; };
    const a = railAt(11), b = railAt(20), o = railAt(14);
    const head = new THREE.Group();
    head.position.copy(o); head.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    head.updateMatrix();
    const inv = head.matrix.clone().invert();
    let hi = -Infinity, lo = Infinity;
    for (const p of tr.pos) {
      if (!onDrop(p)) continue;
      const q = _v.copy(p).applyMatrix4(inv);
      if (q.x > -5 && q.x < 11) { hi = Math.max(hi, q.y); lo = Math.min(lo, q.y); }
    }
    const jawTop = lo - 1.1, skullBot = hi + 4.0, cx = 2;
    const parts = [];   // head-space boxes of every solid piece (used by the clearance self-test)
    const B = (w, h, d, x, y, z, rot) => { const g = box(w, h, d, x, y, z, rot); g.computeBoundingBox(); parts.push(g.boundingBox.clone()); return g; };
    const green = [], white = [], eyes = [], fire = [];
    // lower jaw + chin, collar down toward the neck
    green.push(B(7.5, 1.6, 5.2, cx + 0.5, jawTop - 0.8, 0));
    green.push(B(2.0, 1.0, 3.0, cx + 4.6, jawTop - 1.0, 0));
    green.push(B(3.4, 3.0, 4.6, cx - 0.4, jawTop - 2.6, 0));
    // cheeks connecting jaw to skull at the back of the mouth (train passes between them)
    for (const s of [-1, 1]) green.push(B(2.6, skullBot - jawTop, 0.7, cx - 2.6, (jawTop + skullBot) / 2, s * 2.6));
    // skull + snout
    green.push(B(8.0, 4.2, 5.8, cx + 0.5, skullBot + 2.1, 0));
    green.push(B(3.0, 2.6, 4.2, cx + 5.5, skullBot + 1.3, 0));
    for (const s of [-1, 1]) {
      green.push(B(2.2, 1.0, 1.6, cx + 3.6, skullBot + 4.6, s * 1.9));   // brow ridges
      green.push(B(0.9, 3.2, 0.9, cx - 2.2, skullBot + 5.6, s * 2.0, new THREE.Euler(0, 0, -0.5))); // horns
      green.push(B(0.6, 1.6, 0.6, cx - 0.5, skullBot + 4.9, s * 0.9, new THREE.Euler(0, 0, -0.4))); // crest spikes
    }
    for (const s of [-1, 1]) fire.push(B(0.5, 0.5, 0.6, cx + 7.05, skullBot + 1.6, s * 1.1));   // nostril vents
    // teeth: the upper row hangs from the skull, the lower row stands outside the rails; z=0 stays clear for the camera
    for (const z of [-2.0, -1.0, 1.0, 2.0]) white.push(B(0.5, 1.1, 0.5, cx + 3.9, skullBot - 0.45, z));
    for (const z of [-2.2, -1.4, 1.4, 2.2]) white.push(B(0.5, 0.7, 0.5, cx + 3.9, jawTop + 0.35, z));
    for (const s of [-1, 1]) white.push(B(0.5, 0.7, 0.5, cx + 1.5, jawTop + 0.35, s * 2.3));
    for (const s of [-1, 1]) eyes.push(B(1.0, 0.9, 0.9, cx + 4.1, skullBot + 3.6, s * 1.9));
    fire.push(B(4.5, 0.3, 2.6, cx + 1.8, jawTop + 0.15, 0));   // fire tongue
    const greenMesh = new THREE.Mesh(mergeGeometries(green), M.green); greenMesh.castShadow = true; head.add(greenMesh);
    head.add(new THREE.Mesh(mergeGeometries(white), M.white));
    head.add(new THREE.Mesh(mergeGeometries(eyes), M.eye));
    head.add(new THREE.Mesh(mergeGeometries(fire), M.fire));
    const light = new THREE.PointLight(0xff6a00, 40, 22, 2);
    light.position.set(cx + 2, (jawTop + skullBot) / 2, 0);
    head.add(light);
    this.cullLight = makeLightCuller(this.game, [light]);   // the dragon's fire glow only lights the plot while the player is near
    head.userData.parts = parts;
    this.dragonHead = head;
    this.group.add(head);
    // neck: a vertical column under the rear of the jaw, topped just inside the collar, clear of the rails
    head.updateMatrixWorld(true);
    const rear = new THREE.Vector3(cx - 2.1, jawTop - 4.1, 0).applyMatrix4(head.matrix); // collar's rear-bottom corner
    const nx = rear.x + 1.2, nw = 3.6;
    let top = Infinity;
    for (const p of tr.pos) if (onDrop(p) && Math.abs(p.x - nx) < nw / 2 + 0.6) top = Math.min(top, p.y - 1.1);
    top = Math.min(top, rear.y + 1.0);
    const neck = new THREE.Mesh(box(nw, top, 4.2, nx, top / 2, o.z), M.green); neck.castShadow = true;
    this.group.add(neck);
    this.addBoxCollider(new THREE.Vector3(nx, top / 2, o.z), new THREE.Vector3(nw, top, 4.2));
  }

  buildTrain(M) {
    this.cars = [];
    for (let k = 0; k < 3; k++) {
      const car = new THREE.Group();
      const green = [
        box(1.9, 0.15, 3.3, 0, 0.5, 0),                 // floor
        box(0.15, 0.8, 3.3, 0.9, 0.95, 0), box(0.15, 0.8, 3.3, -0.9, 0.95, 0),
        box(1.9, 0.95, 0.15, 0, 1.0, 1.6),              // front panel
        box(1.9, 0.7, 0.15, 0, 0.9, -1.6),              // back panel
        box(0.25, 0.5, 0.4, 0, 1.45, -1.55),            // dorsal spike
        box(0.3, 0.4, 0.5, 0.95, 1.5, 0.4), box(0.3, 0.4, 0.5, -0.95, 1.5, 0.4), // side fins
      ];
      const dark = [box(1.5, 0.25, 3.0, 0, 0.3, 0), ...[[0.6, 1.1], [-0.6, 1.1], [0.6, -1.1], [-0.6, -1.1]].map(([x, z]) => box(0.26, 0.42, 0.42, x, 0.05, z))];
      const gold = [box(1.5, 0.35, 0.7, 0, 0.8, -0.55), box(1.5, 0.9, 0.15, 0, 1.3, -0.95), box(1.4, 0.12, 0.12, 0, 1.35, 0.3), box(1.9, 0.08, 3.3, 0, 1.38, 0)];
      if (k === 0) {
        green.push(box(1.4, 0.7, 0.9, 0, 1.25, 2.0), box(0.2, 0.7, 0.2, 0.6, 1.95, 1.3, new THREE.Euler(0.4, 0, 0)), box(0.2, 0.7, 0.2, -0.6, 1.95, 1.3, new THREE.Euler(0.4, 0, 0)));
        const eyes = new THREE.Mesh(mergeGeometries([box(0.3, 0.3, 0.2, 0.42, 1.65, 2.0), box(0.3, 0.3, 0.2, -0.42, 1.65, 2.0)]), M.eye);
        car.add(eyes);
        const tongue = new THREE.Mesh(box(0.5, 0.1, 0.7, 0, 0.95, 2.6), M.fire); car.add(tongue);
      }
      const body = new THREE.Mesh(mergeGeometries(green), M.green); body.castShadow = true; car.add(body);
      car.add(new THREE.Mesh(mergeGeometries(dark), M.black));
      car.add(new THREE.Mesh(mergeGeometries(gold), M.gold));
      this.group.add(car);
      this.cars.push(car);
    }
    // the whole train is the rider's vehicle: the cars ahead must not pull the orbit camera in
    for (const car of this.cars) car.traverse((o) => { if (o.isMesh) o.userData.noOcclude = true; });
  }

  placeTrain() {
    for (let k = 0; k < this.cars.length; k++) {
      const car = this.cars[k];
      this.track.trackAt(this.s - k * CAR_GAP, car.position, car.quaternion);
    }
  }

  onStage() {
    // fresh lap: snap the train into the station (it waits there while the rider picks a car)
    this.s = this.sBoard; this.v = CRAWL; this.lapDist = 0; this.whooshed = false;
    this.placeTrain();
  }

  isComplete() { return this.riding && this.lapDist >= this.track.length - 0.2; }

  update(dt) {
    this.cullLight?.();
    this.v = this.speedFn(this.track.wrap(this.s), this.v, dt);
    const ds = this.v * dt;
    const before = this.track.wrap(this.s);
    this.s = this.track.wrap(this.s + ds);
    if (this.riding) {
      this.lapDist += ds;
      if (!this.whooshed && before < this.sCrest && this.s >= this.sCrest) { this.whooshed = true; this.game.audio?.play('whoosh'); }
    }
    this.placeTrain();
  }
}
