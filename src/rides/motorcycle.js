// Thunder Bikes — a super-fast motorcycle speedway (drive ride).
// Closed CatmullRom loop rendered as a banked road ribbon with curbs, a grandstand of bouncing
// blocky fans, start/finish gantry, jump ramps, palms and tyre stacks. The player's bike is held
// on the track by a soft wall (no crashes); 3 laps completes the ride. Two AI riders circulate.
import * as THREE from 'three';
import { Ride } from './Ride.js';
import { coloredMesh, mergeParts, canvasTexture, approach, wrapAngle } from './shared/vehicle.js';
import { fitText, signMaterial, addInstanceColliders } from './shared/track.js';

const N = 600;                 // centreline samples
const HW = 4.2;                // half road width
const LAPS = 3;
const TOP_SPEED = 38, REVERSE_SPEED = 6, ACCEL = 15, BRAKE = 28, DRAG = 0.15;
const BOOST_MULT = 1.4, BOOST_TIME = 1.5, BOOST_CD = 4;
const GRAVITY = -20;
const GREEN = 0x1b5e20, YELLOW = 0xffd600;
// control points (x, z) — start/finish is the first point, travelling +x along the south straight
const CTRL = [[0, 18], [16, 18], [24, 8], [14, -2], [22, -14], [8, -21], [-10, -20], [-23, -10], [-14, 1], [-24, 10], [-16, 18]];

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const fmtTime = (t) => (t == null || !isFinite(t)) ? '--:--.-' : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** Chunky sport bike. Forward is +Z. Returns { group, wheels, flame, glowMat } */
function buildMoto(bodyColor, accent) {
  const group = new THREE.Group();
  const dark = 0x15161a, metal = 0x6f7580;
  const body = coloredMesh([
    { geo: new THREE.BoxGeometry(0.62, 0.42, 0.95), pos: [0, 0.98, 0.2], color: bodyColor },               // tank
    { geo: new THREE.BoxGeometry(0.64, 0.07, 0.8), pos: [0, 1.2, 0.2], color: accent },                    // tank stripe
    { geo: new THREE.BoxGeometry(0.5, 0.18, 0.75), pos: [0, 0.98, -0.6], color: dark },                    // saddle
    { geo: new THREE.BoxGeometry(0.46, 0.22, 0.55), pos: [0, 1.12, -1.15], rot: [0.25, 0, 0], color: bodyColor }, // tail
    { geo: new THREE.BoxGeometry(0.3, 0.07, 0.06), pos: [0, 1.2, -1.42], color: 0xff2020 },                // tail light
    { geo: new THREE.BoxGeometry(0.72, 0.52, 0.7), pos: [0, 0.92, 0.95], rot: [0.15, 0, 0], color: bodyColor }, // fairing
    { geo: new THREE.BoxGeometry(0.56, 0.3, 0.05), pos: [0, 1.32, 0.95], rot: [-0.5, 0, 0], color: 0xbfe9ff }, // screen
    { geo: new THREE.BoxGeometry(0.55, 0.42, 0.65), pos: [0, 0.55, 0.0], color: dark },                    // engine
    { geo: new THREE.BoxGeometry(0.4, 0.85, 0.12), pos: [0, 0.65, 1.0], rot: [-0.3, 0, 0], color: metal }, // forks
    { geo: new THREE.BoxGeometry(0.5, 0.1, 0.95), pos: [0, 0.4, -0.55], color: metal },                    // swingarm
    { geo: new THREE.CylinderGeometry(0.08, 0.1, 1.0, 8), pos: [0.3, 0.52, -0.75], rot: [Math.PI / 2, 0, 0], color: metal }, // exhaust
    { geo: new THREE.BoxGeometry(0.82, 0.06, 0.06), pos: [0, 1.28, 0.72], color: dark },                   // handlebar
    { geo: new THREE.BoxGeometry(0.8, 0.06, 0.25), pos: [0, 0.48, -0.1], color: accent },                   // foot pegs
  ], { metalness: 0.5, roughness: 0.35 });
  body.castShadow = true;
  group.add(body);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff6d0, emissiveIntensity: 2.5, toneMapped: false });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), glowMat);
  lamp.position.set(0, 1.0, 1.33); group.add(lamp);
  const wheels = [];
  const tyreGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.44, 0.44, 0.3, 20), rot: [0, 0, Math.PI / 2], color: 0x101010 },
    { geo: new THREE.CylinderGeometry(0.28, 0.28, 0.32, 6), rot: [0, 0, Math.PI / 2], color: accent },
  ]);
  const tyreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });
  for (const z of [1.02, -0.98]) { const w = new THREE.Mesh(tyreGeo, tyreMat); w.position.set(0, 0.44, z); group.add(w); wheels.push(w); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff9a1f, toneMapped: false, transparent: true, opacity: 0.9 }));
  flame.position.set(0.3, 0.52, -1.6); flame.visible = false; group.add(flame);
  group.traverse((o) => { if (o.isMesh) o.userData.noOcclude = true; });   // bikes are vehicles, not walls
  return { group, wheels, flame, glowMat };
}

export class Motorcycle extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Thunder Bikes', kind: 'drive' });
    this.seatAnim = 'drive';
    this.cameraOffset.set(0, 2.6, -7);
    this.cameraLookOffset.set(0, 0.8, 8);
    this.stationRadius = 4;
    this.laps = 0; this.bestLap = null; this.lapStart = 0; this.hudText = '';
    this.bike = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0, vy: 0, air: false, idx: 0, lat: 0, lean: 0, pitch: 0, boostT: 0, boostCd: 0, half: false };
    this.ais = [];
    this.ramps = [];
  }

  // ---------- track maths ----------
  buildSamples() {
    const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    this.curve = curve;
    this.length = curve.getLength();
    this.ds = this.length / N;
    this.cx = new Float32Array(N); this.cz = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    const h = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = curve.getPointAt(i / N), t = curve.getTangentAt(i / N);
      const l = Math.hypot(t.x, t.z);
      this.cx[i] = p.x; this.cz[i] = p.z; this.tx[i] = t.x / l; this.tz[i] = t.z / l;
      h[i] = Math.atan2(t.z, t.x);
    }
    // signed curvature (positive = right turn) smoothed, then slope of the banked surface
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) k[i] = wrapAngle(h[(i + 1) % N] - h[(i - 1 + N) % N]) / (2 * this.ds);
    this.slope = new Float32Array(N);   // dy/dlat: outer edge raised
    this.kappa = new Float32Array(N);
    const W = 14;
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = -W; j <= W; j++) sum += k[(i + j + N) % N];
      const kk = sum / (2 * W + 1);
      this.kappa[i] = kk;
      this.slope[i] = -Math.tan(THREE.MathUtils.clamp(kk * 2.2, -0.22, 0.22));
    }
    // ramps: {i0, len (samples), h}
    const rampLen = Math.round(7 / this.ds);
    this.ramps = [
      { i0: Math.round(N * 0.56), len: rampLen, h: 1.3 },   // north straight
      { i0: Math.round(N * 0.07), len: rampLen, h: 1.1 },   // just after start/finish
    ];
  }
  rampH(i, lat) {
    if (Math.abs(lat) > 2.3) return 0;
    for (const r of this.ramps) { const d = i - r.i0; if (d >= 0 && d < r.len) return r.h * d / r.len; }
    return 0;
  }
  /** surface height at sample i, lateral offset lat (ignoring ramps unless withRamp) */
  surfaceY(i, lat, withRamp) { return 0.08 + HW * Math.abs(this.slope[i]) + lat * this.slope[i] + (withRamp ? this.rampH(i, lat) : 0); }
  /** nearest sample to (x,z), searching near `from` */
  nearest(x, z, from, win = 40) {
    let best = from, bd = Infinity;
    for (let j = -win; j <= win; j++) {
      const i = (from + j + N) % N, dx = x - this.cx[i], dz = z - this.cz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  build() {
    this.buildSamples();
    const g = this.group;
    const { cx, cz, tx, tz, slope } = this;

    // --- road ribbon: 4 verts per ring (outer skirt L, road L, road R, outer skirt R), rings 0..N (ring N repeats ring 0) ---
    const rings = N + 1, pos = new Float32Array(rings * 4 * 3), uv = new Float32Array(rings * 4 * 2);
    for (let r = 0; r < rings; r++) {
      const i = r % N, rx = -tz[i], rz = tx[i];
      const yc = 0.08 + HW * Math.abs(slope[i]);
      const lats = [-HW - 0.7, -HW, HW, HW + 0.7], us = [-0.01, 0, 0.75, 0.76];
      for (let k = 0; k < 4; k++) {
        const lat = lats[k], y = k === 0 || k === 3 ? 0 : yc + lat * slope[i];
        pos.set([cx[i] + rx * lat, y, cz[i] + rz * lat], (r * 4 + k) * 3);
        uv.set([us[k], r * this.ds / 8], (r * 4 + k) * 2);
      }
    }
    const idx = new Uint32Array(N * 3 * 6);
    let n = 0;
    for (let r = 0; r < N; r++) for (let k = 0; k < 3; k++) {
      const a = r * 4 + k, b = a + 1, c = a + 4, d = a + 5;
      idx.set([a, c, b, b, c, d], n); n += 6;
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    roadGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    roadGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    roadGeo.computeVertexNormals();
    const roadTex = canvasTexture(256, 512, (ctx, w, h) => {
      // u 0..0.75 = road surface, u 0.75..1 = concrete skirt under the banked edges
      const R = w * 0.75;
      ctx.fillStyle = '#2a2b31'; ctx.fillRect(0, 0, R, h);
      for (let i = 0; i < 700; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#333540' : '#222328'; ctx.fillRect(Math.random() * R, Math.random() * h, 3, 3); }
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k % 2 ? '#f2f2f2' : '#d8232e';
        ctx.fillRect(0, k * h / 4, R * 0.06, h / 4); ctx.fillRect(R * 0.94, k * h / 4, R * 0.06, h / 4);
      }
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(R * 0.075, 0, R * 0.02, h); ctx.fillRect(R * 0.905, 0, R * 0.02, h);
      ctx.fillRect(R * 0.49, h * 0.1, R * 0.02, h * 0.35);
      ctx.fillStyle = '#5a5f6a'; ctx.fillRect(R, 0, w - R, h);
      ctx.fillStyle = '#4c515b'; for (let y = 0; y < h; y += 32) ctx.fillRect(R, y, w - R, 3);
    });
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
    road.receiveShadow = true; g.add(road);

    // --- start/finish: checker strip on the road + gantry with banner ---
    const checker = canvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111';
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) if ((x + y) % 2) ctx.fillRect(x * w / 16, y * h / 4, w / 16, h / 4);
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 1.0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8 }));
    strip.position.set(cx[0], 0.12, cz[0]); strip.rotation.y = Math.atan2(tx[0], tz[0]) + Math.PI / 2; strip.userData.noOcclude = true; g.add(strip);
    const gantry = coloredMesh([
      { geo: new THREE.BoxGeometry(0.5, 6, 0.5), pos: [0, 3, -HW - 1.2], color: 0xe8e8e8 },
      { geo: new THREE.BoxGeometry(0.5, 6, 0.5), pos: [0, 3, HW + 1.2], color: 0xe8e8e8 },
      { geo: new THREE.BoxGeometry(0.5, 0.5, HW * 2 + 2.9), pos: [0, 6, 0], color: 0xe8e8e8 },
      { geo: new THREE.BoxGeometry(0.6, 0.6, 0.6), pos: [0, 6.6, -HW - 1.2], color: YELLOW },
      { geo: new THREE.BoxGeometry(0.6, 0.6, 0.6), pos: [0, 6.6, HW + 1.2], color: YELLOW },
    ]);
    gantry.position.set(cx[0], 0, cz[0]); gantry.rotation.y = Math.atan2(tx[0], tz[0]); gantry.castShadow = true; gantry.userData.noOcclude = true; g.add(gantry);
    const bannerTex = canvasTexture(1024, 192, (ctx, w, h) => {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (let x = 0; x < 32; x++) for (let y = 0; y < 6; y++) if ((x + y) % 2 && (y < 1 || y > 4)) ctx.fillRect(x * w / 32, y * h / 6, w / 32, h / 6);
      ctx.fillStyle = '#1b5e20'; ctx.fillRect(0, h / 6, w, h * 4 / 6);
      ctx.fillStyle = '#ffd600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const { lines } = fitText(ctx, this.name.toUpperCase(), w, h * 4 / 6, w * 0.86, (sz) => `bold ${sz}px sans-serif`);
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + 6 + (i - (lines.length - 1) / 2) * h * 0.3));
    });
    // two single-sided faces back to back (a gap, not one DoubleSide plane) so the text reads right from both sides
    for (const side of [-1, 1]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 1.6, 1.6), signMaterial(bannerTex, { emissive: 0.15 }));
      banner.position.set(side * 0.03, 4.9, 0); banner.rotation.y = -side * Math.PI / 2; banner.userData.noOcclude = true; banner.name = 'sign'; gantry.add(banner);
    }

    // --- jump ramps (one InstancedMesh, wedge extruded from a triangle) ---
    const rampShape = new THREE.Shape(); rampShape.moveTo(0, 0); rampShape.lineTo(7, 0); rampShape.lineTo(7, 1.3); rampShape.lineTo(0, 0);
    const wedge = new THREE.ExtrudeGeometry(rampShape, { depth: 4.6, bevelEnabled: false });
    wedge.translate(0, 0, -2.3); wedge.rotateY(-Math.PI / 2);
    const rampMesh = new THREE.InstancedMesh(wedge, [new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xffc107, roughness: 0.6, emissive: 0x3a2a00 })], this.ramps.length);
    this.ramps.forEach((r, i) => {
      const k = r.i0, yaw = Math.atan2(tx[k], tz[k]);
      _m.compose(_v.set(cx[k], 0.08, cz[k]), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, r.h / 1.3, 1));
      rampMesh.setMatrixAt(i, _m);
    });
    rampMesh.castShadow = true; g.add(rampMesh);

    // --- grandstand (south of the start straight), facing the track ---
    const stand = coloredMesh([
      { geo: new THREE.BoxGeometry(34, 0.9, 1.7), pos: [0, 0.45, 25.2], color: 0x7e8794 },
      { geo: new THREE.BoxGeometry(34, 1.8, 1.7), pos: [0, 0.9, 26.9], color: 0x6c7482 },
      { geo: new THREE.BoxGeometry(34, 2.7, 1.7), pos: [0, 1.35, 28.6], color: 0x7e8794 },
      { geo: new THREE.BoxGeometry(34, 0.6, 0.3), pos: [0, 3.0, 29.5], color: 0xe6e6e6 },
      { geo: new THREE.BoxGeometry(36, 0.3, 6.2), pos: [0, 6.6, 27.0], color: 0xd32f2f },
      { geo: new THREE.BoxGeometry(0.35, 6.6, 0.35), pos: [-17.5, 3.3, 29.6], color: 0xe6e6e6 },
      { geo: new THREE.BoxGeometry(0.35, 6.6, 0.35), pos: [17.5, 3.3, 29.6], color: 0xe6e6e6 },
      { geo: new THREE.BoxGeometry(0.35, 6.6, 0.35), pos: [-17.5, 3.3, 24.4], color: 0xe6e6e6 },
      { geo: new THREE.BoxGeometry(0.35, 6.6, 0.35), pos: [17.5, 3.3, 24.4], color: 0xe6e6e6 },
    ]);
    stand.castShadow = true; stand.receiveShadow = true; g.add(stand);
    const CROWD = 150;
    this.crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1.0, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.8 }), CROWD);
    this.crowdBase = [];
    const c = new THREE.Color();
    for (let i = 0; i < CROWD; i++) {
      const tier = i % 3, x = (Math.random() * 2 - 1) * 16.4, z = 25.2 + tier * 1.7 + (Math.random() - 0.5) * 0.6, y = 0.9 * (tier + 1) + 0.5;
      this.crowdBase.push({ x, y, z, phase: Math.random() * 6.28, rate: 2 + Math.random() * 3 });
      this.crowd.setColorAt(i, c.setHSL(Math.random(), 0.85, 0.55));
    }
    this.crowd.castShadow = true; this.crowd.userData.noOcclude = true; g.add(this.crowd);

    // --- perimeter fence (rails + posts, one mesh) — gap at x 21..25 on the south side for the gate ---
    const fenceParts = [];
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.45, 1.0]) fenceParts.push({ geo: new THREE.BoxGeometry(0.1, 0.1, len), pos: [(x0 + x1) / 2, y, (z0 + z1) / 2], rot: [0, yaw, 0], color: 0xf5f5f5 });
      const posts = Math.max(1, Math.round(len / 4));
      for (let i = 0; i <= posts; i++) { const f = i / posts; fenceParts.push({ geo: new THREE.BoxGeometry(0.16, 1.15, 0.16), pos: [x0 + (x1 - x0) * f, 0.57, z0 + (z1 - z0) * f], color: 0xf5f5f5 }); }
    };
    rail(-27, 23.5, -27, -27); rail(27, 23.5, 27, -27); rail(-27, -27, 27, -27); rail(-27, 23.5, 21, 23.5); rail(25, 23.5, 27, 23.5);
    const fence = coloredMesh(fenceParts, { roughness: 0.7 }); fence.userData.noOcclude = true; g.add(fence);

    // --- palms (trunks + fronds) around the outside ---
    const palmSpots = [[-29, -29], [-29, -12], [-29, 6], [-29, 20], [29, -29], [29, -12], [29, 6], [29, 20], [-12, -29.5], [10, -29.5], [-1, -29.5], [20, -29.5]];
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.4, 7.5, 6).translate(0, 3.75, 0), new THREE.MeshStandardMaterial({ color: 0x8d6e4a, roughness: 0.9 }), palmSpots.length);
    const fronds = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.6, 7, 1, true), new THREE.MeshStandardMaterial({ color: 0x2e8b3a, roughness: 0.8, side: THREE.DoubleSide }), palmSpots.length);
    palmSpots.forEach(([x, z], i) => {
      const tilt = (Math.random() - 0.5) * 0.25, h = 7.5 + Math.random() * 1.5;
      _m.compose(_v.set(x, 0, z), _q.setFromEuler(_e.set(tilt, Math.random() * 6.28, tilt)), _s.set(1, h / 7.5, 1)); trunks.setMatrixAt(i, _m);
      _m.compose(_v.set(x + Math.sin(tilt) * h * 0.5, h - 0.3, z + Math.sin(tilt) * h * 0.5), _q.setFromEuler(_e.set(0, Math.random() * 6.28, 0)), _s.set(1, 1, 1)); fronds.setMatrixAt(i, _m);
    });
    trunks.castShadow = true; trunks.userData.noOcclude = fronds.userData.noOcclude = true; g.add(trunks, fronds);

    // --- tyre stacks on the outside of the bends ---
    const tyreSpots = [];
    for (let i = 0; i < N && tyreSpots.length < 70; i += 4) {
      if (Math.abs(this.kappa[i]) < 0.07) continue;
      const lat = -Math.sign(this.kappa[i]) * (HW + 1.6), rx = -tz[i], rz = tx[i];
      const x = cx[i] + rx * lat, z = cz[i] + rz * lat;
      if (Math.abs(x) > 26.5 || z > 23 || z < -26.5) continue;
      tyreSpots.push([x, z]);
    }
    const tyres = new THREE.InstancedMesh(mergeParts([
      { geo: new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), pos: [0, 0.45, 0], color: 0x151515 },
      { geo: new THREE.CylinderGeometry(0.52, 0.52, 0.12, 10), pos: [0, 0.45, 0], color: 0xf0f0f0 },
    ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), Math.max(1, tyreSpots.length));
    tyreSpots.forEach(([x, z], i) => { _m.compose(_v.set(x, 0, z), _q.identity(), _s.set(1, 1, 1)); tyres.setMatrixAt(i, _m); });
    if (!tyreSpots.length) tyres.visible = false;
    tyres.userData.noOcclude = true; g.add(tyres);

    // --- bikes ---
    const pm = buildMoto(GREEN, YELLOW);
    this.moto = pm; g.add(pm.group);
    // the seat rides on a pivot with half the bike's roll/pitch: the avatar leans, but the camera
    // (which follows the seat quaternion) doesn't swing as far
    this.seatPivot = new THREE.Group(); g.add(this.seatPivot);
    this.seat.position.set(0, 0.52, -0.4);
    this.seatPivot.add(this.seat);
    const aiDefs = [{ color: 0xd32f2f, accent: 0xffffff, lat: 3.0, speed: 26, u: 0.35 }, { color: 0x1e63ff, accent: 0xffd600, lat: -3.0, speed: 23, u: 0.75 }];
    for (const d of aiDefs) {
      const m = buildMoto(d.color, d.accent);
      g.add(m.group);
      this.ais.push({ ...m, lat: d.lat, speed: d.speed, u: d.u * N });
    }
    this.parkPlayer();

    // --- station / colliders ---
    g.updateMatrixWorld(true);
    this.station.copy(g.localToWorld(new THREE.Vector3(23, 0, 25.5)));
    this.crowdCentre = g.localToWorld(new THREE.Vector3(0, 2, 26.9));   // grandstand middle (world), for the bounce cut-off
    this.tagline = 'Full throttle! 3 laps, hit the ramps, SHIFT to boost';
    // perimeter fence (1.2 m tall boxes: stops walkers, stays under the ride camera's sight line)
    this.addBoxCollider(new THREE.Vector3(-27, 0.6, -1.75), new THREE.Vector3(0.6, 1.2, 50.5));
    this.addBoxCollider(new THREE.Vector3(27, 0.6, -1.75), new THREE.Vector3(0.6, 1.2, 50.5));
    this.addBoxCollider(new THREE.Vector3(0, 0.6, -27), new THREE.Vector3(54.6, 1.2, 0.6));
    this.addBoxCollider(new THREE.Vector3(-3, 0.6, 23.5), new THREE.Vector3(48, 1.2, 0.6));
    this.addBoxCollider(new THREE.Vector3(26, 0.6, 23.5), new THREE.Vector3(2, 1.2, 0.6));
    this.addBoxCollider(new THREE.Vector3(0, 2, 27), new THREE.Vector3(34, 4, 5.2));
    // gantry posts, palms, tyre stacks and the ramps are solid too
    const gy = Math.atan2(tx[0], tz[0]);
    for (const zl of [-HW - 1.2, HW + 1.2]) this.addBoxCollider(new THREE.Vector3(cx[0] + Math.sin(gy) * zl, 3, cz[0] + Math.cos(gy) * zl), new THREE.Vector3(0.7, 6, 0.7));
    addInstanceColliders(this, trunks, { minW: 0.8, height: 3 });
    addInstanceColliders(this, tyres, { minW: 1.1, height: 1.0, count: tyreSpots.length });
    for (const r of this.ramps) { const k = (r.i0 + Math.floor(r.len / 2)) % N; this.addBoxCollider(new THREE.Vector3(cx[k], r.h / 2, cz[k]), new THREE.Vector3(6, r.h, 6)); }
  }

  /** A green-and-yellow bike for a remote rider; origin = rider's feet, +Z forward. */
  makePeerVehicle() {
    const wrap = new THREE.Group();
    const m = buildMoto(GREEN, YELLOW);
    m.group.position.set(0, -0.52, 0.4);   // undo the seat offset so the bike sits under the avatar
    wrap.add(m.group);
    wrap.userData.wheels = m.wheels; wrap.userData.flame = m.flame;
    wrap.userData.dispose = () => { m.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); };
    return wrap;
  }

  // ---------- placement helpers ----------
  /** Interpolated surface height for an arbitrary point near sample i. */
  groundAt(x, z, i, lat) {
    const along = (x - this.cx[i]) * this.tx[i] + (z - this.cz[i]) * this.tz[i];
    const j = along >= 0 ? (i + 1) % N : (i - 1 + N) % N;
    const f = Math.min(1, Math.abs(along) / this.ds);
    return THREE.MathUtils.lerp(this.surfaceY(i, lat, true), this.surfaceY(j, lat, true), f);
  }
  parkPlayer() {
    const b = this.bike;
    b.idx = 0; b.x = this.cx[0]; b.z = this.cz[0]; b.yaw = Math.atan2(this.tx[0], this.tz[0]);
    b.speed = 0; b.vx = 0; b.vz = 0; b.vy = 0; b.air = false; b.lat = 0; b.lean = 0; b.pitch = 0; b.boostT = 0; b.boostCd = 0; b.half = false;
    b.y = this.surfaceY(0, 0, true);
    this.placeBike(this.moto.group, b.x, b.y, b.z, b.yaw, 0, -Math.atan(this.slope[0]));
    this.moto.flame.visible = false;
  }
  placeBike(group, x, y, z, yaw, pitch, roll) {
    group.position.set(x, y, z);
    group.rotation.set(pitch, yaw, roll, 'YXZ');
    if (group === this.moto.group) { this.seatPivot.position.set(x, y, z); this.seatPivot.rotation.set(pitch * 0.5, yaw, roll * 0.5, 'YXZ'); }
  }

  // ---------- player ----------
  onBoard() {
    this.laps = 0; this.bestLap = null; this.lapStart = 0;
    this.parkPlayer();
    this.hudText = `LAP 1/${LAPS} · 0 MPH · BEST ${fmtTime(null)}`;
  }
  onUnboard() {
    this.parkPlayer();
    const cam = this.game.camera; cam.fov = 60; cam.updateProjectionMatrix();
  }
  isComplete() { return this.riding && this.laps >= LAPS; }

  handleInput(input, dt) {
    const b = this.bike;
    // throttle / brake
    const th = THREE.MathUtils.clamp(input.move.y, -1, 1);
    b.boostCd = Math.max(0, b.boostCd - dt);
    if (input.boost && b.boostCd === 0 && b.boostT <= 0) { b.boostT = BOOST_TIME; b.boostCd = BOOST_CD; this.game.audio?.play('boost'); }
    b.boostT -= dt;
    const boosting = b.boostT > 0;
    const top = TOP_SPEED * (boosting ? BOOST_MULT : 1);
    if (th > 0) b.speed += (ACCEL * (boosting ? 1.6 : 1)) * th * dt * (1 - Math.max(0, b.speed / top) * 0.6);
    else if (th < 0) b.speed += (b.speed > 0.5 ? -BRAKE : -ACCEL * 0.5) * -th * dt;
    b.speed -= b.speed * DRAG * dt * (boosting ? 0.3 : 1);
    b.speed = THREE.MathUtils.clamp(b.speed, -REVERSE_SPEED, top);
    // steering, speed-sensitive (positive rotation.y is a LEFT turn, so right (+x) decreases yaw)
    const steer = THREE.MathUtils.clamp(input.move.x, -1, 1);
    const sf = THREE.MathUtils.clamp(Math.abs(b.speed) / TOP_SPEED, 0, 1);
    const rate = THREE.MathUtils.lerp(2.8, 1.25, sf) * Math.min(1, Math.abs(b.speed) / 3) * (b.speed < 0 ? -1 : 1) * (b.air ? 0.35 : 1);
    b.yaw = wrapAngle(b.yaw - steer * rate * dt);
    // drift: velocity chases the facing direction
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const grip = b.air ? 1.5 : 7;
    b.vx = approach(b.vx, fx * b.speed, grip, dt); b.vz = approach(b.vz, fz * b.speed, grip, dt);
    b.x += b.vx * dt; b.z += b.vz * dt;
    // constrain to the ribbon (soft wall)
    const prevIdx = b.idx;
    b.idx = this.nearest(b.x, b.z, b.idx, 40);
    const i = b.idx, rx = -this.tz[i], rz = this.tx[i];
    let lat = (b.x - this.cx[i]) * rx + (b.z - this.cz[i]) * rz;
    const limit = HW - 0.55;
    if (Math.abs(lat) > limit) {
      const dir = Math.sign(lat); lat = dir * limit;
      const along = (b.x - this.cx[i]) * this.tx[i] + (b.z - this.cz[i]) * this.tz[i];
      b.x = this.cx[i] + this.tx[i] * along + rx * lat; b.z = this.cz[i] + this.tz[i] * along + rz * lat;
      b.speed -= b.speed * 1.2 * dt;
      // bumper-rail feel: nudge the heading back along the track so the bike slides on rather than sticking
      const tyaw = Math.atan2(this.tx[i], this.tz[i]) + (b.speed < 0 ? Math.PI : 0);
      b.yaw = wrapAngle(b.yaw + wrapAngle(tyaw - b.yaw) * Math.min(1, 6 * dt));
      // remove outward velocity
      const vout = b.vx * rx + b.vz * rz; if (vout * dir > 0) { b.vx -= rx * vout; b.vz -= rz * vout; }
    }
    b.lat = lat;
    // vertical: follow the surface, fly off ramp ends
    const gy = this.groundAt(b.x, b.z, i, lat);
    if (b.air) {
      b.vy += GRAVITY * dt; b.y += b.vy * dt;
      if (b.y <= gy) { b.y = gy; b.air = false; b.vy = 0; }
    } else {
      const prevY = b.y;
      if (gy < prevY - 0.25 && b.vy > 0.5) { b.air = true; b.y = prevY + b.vy * dt; }
      else { b.y = gy; b.vy = dt > 0 ? (gy - prevY) / dt : 0; }
    }
    // laps
    if (i > N * 0.45 && i < N * 0.55) b.half = true;
    if (prevIdx > N * 0.8 && i < N * 0.2) {
      if (b.half) {
        const lapTime = this.rideTime - this.lapStart;
        this.laps++; this.lapStart = this.rideTime;
        if (this.bestLap == null || lapTime < this.bestLap) this.bestLap = lapTime;
        this.game.events.emit('drive:lap', { ride: this.id, lapTime });
        this.game.audio?.play('lap');
      }
      b.half = false;
    } else if (prevIdx < N * 0.2 && i > N * 0.8) b.half = false;
    // pose
    b.lean = approach(b.lean, steer * 0.42 * (0.4 + sf * 0.6), 7, dt);
    b.pitch = approach(b.pitch, b.air ? -b.vy * 0.045 : 0, 6, dt);
    // camera FOV kick with speed
    const cam = this.game.camera, fov = 60 + sf * 15 * (boosting ? 1.3 : 1);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = approach(cam.fov, fov, 6, dt); cam.updateProjectionMatrix(); }
    const mph = Math.round(Math.abs(b.speed) * 2.237);
    const lapShown = Math.min(this.laps + 1, LAPS);
    const boostTxt = boosting ? ' · BOOST!' : b.boostCd > 0 ? '' : ' · SHIFT = boost';
    this.hudText = `LAP ${lapShown}/${LAPS} · ${mph} MPH · BEST ${fmtTime(this.bestLap)}${boostTxt}`;
  }

  // ---------- ambience ----------
  updateAI(a, dt, t) {
    a.u = (a.u + a.speed / this.ds * dt) % N;
    const i = Math.floor(a.u), j = (i + 1) % N, f = a.u - i;
    const rx = -this.tz[i], rz = this.tx[i];
    const x = THREE.MathUtils.lerp(this.cx[i], this.cx[j], f) + rx * a.lat, z = THREE.MathUtils.lerp(this.cz[i], this.cz[j], f) + rz * a.lat;
    const y = THREE.MathUtils.lerp(this.surfaceY(i, a.lat, false), this.surfaceY(j, a.lat, false), f);
    const yaw = Math.atan2(this.tx[i], this.tz[i]);
    const roll = -Math.atan(this.slope[i]) + this.kappa[i] * 2.5;
    this.placeBike(a.group, x, y, z, yaw, 0, roll);
    for (const w of a.wheels) w.rotation.x += a.speed / 0.44 * dt;
  }

  update(dt, t) {
    const b = this.bike, m = this.moto;
    if (this.riding) {
      this.placeBike(m.group, b.x, b.y, b.z, b.yaw, b.pitch, b.lean - Math.atan(this.slope[b.idx]));
      for (const w of m.wheels) w.rotation.x += b.speed / 0.44 * dt;
      m.flame.visible = b.boostT > 0;
      if (m.flame.visible) { const s = 0.7 + Math.random() * 0.6; m.flame.scale.set(s, s, 0.8 + Math.random() * 0.8); }
      m.glowMat.emissiveIntensity = 2.5 + (b.boostT > 0 ? 1.5 : 0);
    }
    for (const a of this.ais) this.updateAI(a, dt, t);
    // bouncing crowd (150 matrices re-uploaded a frame: only while the player is near enough to see them hop)
    const player = this.game.player;
    if (player && player.position.distanceTo(this.crowdCentre) > 80) return;
    const cb = this.crowdBase;
    for (let i = 0; i < cb.length; i++) {
      const p = cb[i], hop = Math.max(0, Math.sin(t * p.rate + p.phase)) * 0.45;
      _m.compose(_v.set(p.x, p.y + hop, p.z), _q.identity(), _s.set(1, 1 + hop * 0.3, 1));
      this.crowd.setMatrixAt(i, _m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }
}
