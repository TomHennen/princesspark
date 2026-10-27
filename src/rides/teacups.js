// Tipsy Teacups — a big rotating platter with three counter-rotating sub-platters, each carrying
// three spinning pastel teacups, a giant steaming teapot in the middle and a striped awning above.
// On boarding, the rider picks a speed (Gentle / Wild / TURBO / "Do NOT press this"); the last one spins the
// whole ride up until the rider's cup lets go and flings them onto the grass (player.launch).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';
import { makeTextBoard, addInstanceColliders, addPlotFence } from './shared/track.js';

const TAU = Math.PI * 2;
const GREEN = 0x1e6b3c, YELLOW = 0xf6d44a, GOLD = 0xd9a63a, CREAM = 0xfff3dc, PINK = 0xf48fb1, WHITE = 0xfafafa;
const PLATTER_R = 8.9, PLATTER_TOP = 0.7, SUB_R = 3.3, SUB_D = 5.0, SUB_TOP = PLATTER_TOP + 0.3, CUP_D = 1.95;
const W_PLATTER = TAU / 16, W_SUB = -TAU / 9;          // platter one way, sub-platters the other
const CUP_FLOOR = 0.2;                                 // rider feet height inside a cup

// Speed modes. `speed` scales the platter/sub-platter/cup angular velocities; `ramp` is seconds to get there.
export const TEACUP_MODES = {
  gentle: { label: '🍵 Gentle', sub: 'slow & cozy', speed: 1.0, cupSpeed: 1.0, ramp: 1.5, duration: 30, hud: null },
  wild:   { label: '🌀 Wild', sub: 'fast!', speed: 2.1, cupSpeed: 2.6, ramp: 2.0, duration: 26, hud: '🌀 Wild spin! Hold on!' },
  turbo:  { label: '⚡ TURBO', sub: 'very, VERY fast', speed: 3.4, cupSpeed: 5.5, ramp: 3.0, duration: 22, hud: '⚡ TURBO!! Hands up if you dare' },
  launch: { label: '🚫 Do NOT press this', sub: 'seriously, don\'t', speed: 6.5, cupSpeed: 11, ramp: 4.0, duration: 999, hud: '🚫 Uh oh. Why did you press it?' },
};
// the nine cups, in deck order (sub-platter k holds cups 3k..3k+2): colours + the names the seat menu shows
export const CUPS = [
  { id: 'pink', label: '🩷 Pink cup', sub: 'strawberry', colors: [0xffc6d9, 0xc7325e] },
  { id: 'lemon', label: '💛 Lemon cup', sub: 'lemon sherbet', colors: [0xfff3b0, 0xf28c1c] },
  { id: 'sky', label: '💙 Sky-blue cup', sub: 'blueberry', colors: [0xcde9ff, 0x2b6fb3] },
  { id: 'mint', label: '💚 Mint cup', sub: 'mint tea', colors: [0xd8f5c6, 0x2f8f4e] },
  { id: 'lavender', label: '💜 Lavender cup', sub: 'lavender', colors: [0xe5d4ff, 0x7a4bbf] },
  { id: 'peach', label: '🧡 Peach cup', sub: 'peach', colors: [0xffe0c2, 0xd1662b] },
  { id: 'rose', label: '🌸 Rose cup', sub: 'rose & green', colors: [0xffd1e8, 0x1e6b3c] },
  { id: 'sunny', label: '🌞 Sunny cup', sub: 'yellow & green', colors: [0xf6d44a, 0x1e6b3c] },
  { id: 'cream', label: '🤍 Cream cup', sub: 'vanilla', colors: [0xffffff, 0xf48fb1] },
];
const LAUNCH_AT = 4.0;                                 // seconds of absurd spin-up before the cup "lets go"
const LAUNCH_UP = 14, LAUNCH_RADIUS = 19;              // up m/s (~1.08 s of flight) and the landing distance from the teapot (clears the plot fence corners)
const FLIGHT_FACTOR = 0.87;                            // horizontal distance per m/s over that flight (player.js damps 0.4/s)

// ---------- tiny procedural-geometry kit ----------
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _qi = new THREE.Quaternion();
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
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, ...matOpts }));
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s = 16) => new THREE.ConeGeometry(r, h, s);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const tor = (r, t, arc = TAU, ts = 8, rs = 32) => new THREE.TorusGeometry(r, t, ts, rs, arc);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const stripeTexture = (colors, n) => canvasTex(1024, 16, (ctx) => {
  for (let i = 0; i < n; i++) { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(Math.floor((i * 1024) / n), 0, Math.ceil(1024 / n) + 1, 16); }
});
/** Valance with a scalloped bottom edge (alpha-tested). */
const valanceTexture = (color, n) => canvasTex(1024, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h * 0.55);
  const sw = w / n;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(sw * (i + 0.5), h * 0.55, sw * 0.5, 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = '#d9a63a'; ctx.fillRect(0, 0, w, 10);
});
/** Pie-slice pattern for the platter top. */
const platterTexture = () => canvasTex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#bfe8d2'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) {
    if (i % 2) continue;
    ctx.fillStyle = '#fff3dc'; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.arc(w / 2, h / 2, w, (i / 12) * TAU, ((i + 1) / 12) * TAU); ctx.fill();
  }
  ctx.strokeStyle = '#f48fb1'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(w / 2, h / 2, 90, 0, TAU); ctx.stroke();
});
/** A big teacup on its saucer. Origin = saucer bottom; the rider's feet go at CUP_FLOOR. */
function teacup(body, accent) {
  const P = [];
  P.push(piece(cyl(1.55, 1.3, 0.12, 24), accent, [0, 0.06, 0]));                       // saucer
  P.push(piece(tor(1.0, 0.05, TAU, 6, 24), body, [0, 0.13, 0], [Math.PI / 2, 0, 0]));   // saucer ring
  P.push(piece(cyl(1.1, 0.8, 1.15, 24, true), body, [0, 0.695, 0]));                    // cup wall (open)
  P.push(piece(cyl(0.8, 0.8, 0.08, 24), body, [0, 0.16, 0]));                            // floor (top at 0.2)
  P.push(piece(cyl(0.95, 0.9, 0.45, 24), CREAM, [0, CUP_FLOOR + 0.225, 0]));            // cushion bench (top = floor + 0.45)
  P.push(piece(tor(1.1, 0.07, TAU, 8, 32), accent, [0, 1.27, 0], [Math.PI / 2, 0, 0]));  // rim
  P.push(piece(tor(0.38, 0.09, TAU, 8, 20), body, [1.28, 0.75, 0]));                     // handle
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; P.push(piece(sph(0.14, 8, 6), accent, [Math.sin(a) * 1.0, 0.72, Math.cos(a) * 1.0])); }
  const g = new THREE.Group();
  const m = fuse(P, { side: THREE.DoubleSide }); m.castShadow = true; g.add(m);
  return g;
}

export class Teacups extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Tipsy Teacups', kind: 'passive' });
    this.duration = 30;
    this.cameraOffset.set(0, 3.0, -6);
    this.cameraLookOffset.set(0, 1.2, 6);
    this.tagline = 'Spin, giggle, repeat — tea party style';
    this.mode = null;            // 'gentle' | 'wild' | 'turbo' | 'launch' | null (chooser still open / not riding)
    this.speed = 1; this.cupSpeed = 1; this.targetSpeed = 1; this.targetCupSpeed = 1; this.rampRate = 1;
    this.modeTime = 0; this.launched = false; this._boardToken = 0; this._launchExit = null;
    this.platterAngle = 0; this.subAngle = 0; this.swing = 0;
    this.hudText = null;
    this.menuColor = '#f48fb1';
    this.riderIdx = 0;
  }

  build() {
    const G = this.group;

    // ---- static base ring ----
    const base = fuse([
      piece(cyl(9.7, 10.0, 0.3, 48), 0xe6d9bd, [0, 0.15, 0]),
      piece(cyl(9.3, 9.7, 0.15, 48), 0xd7c6a3, [0, 0.37, 0]),
    ]);
    base.receiveShadow = true; G.add(base);

    // ---- platter ----
    const platter = new THREE.Group(); G.add(platter); this.platter = platter;
    const platterMesh = new THREE.Mesh(cyl(PLATTER_R, PLATTER_R + 0.2, 0.4, 48), [
      new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: platterTexture(), roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.7 }),
    ]);
    platterMesh.position.y = PLATTER_TOP - 0.2; platterMesh.receiveShadow = true; platterMesh.castShadow = true; platter.add(platterMesh);

    // ---- teapot centrepiece ----
    const TP = 0xf7a8c4, TD = 0xf6d44a;
    const teapotParts = [
      piece(cyl(1.1, 1.3, 0.3, 24), TD, [0, PLATTER_TOP + 0.15, 0]),
      piece(sph(1.7, 28, 18), TP, [0, PLATTER_TOP + 0.3 + 1.36, 0], null, [1, 0.8, 1]),
      piece(cyl(1.0, 1.15, 0.28, 24), TD, [0, PLATTER_TOP + 3.1, 0]),
      piece(sph(0.26, 10, 8), TD, [0, PLATTER_TOP + 3.4, 0]),
      piece(cyl(0.16, 0.3, 1.7, 12), TP, [1.95, PLATTER_TOP + 2.3, 0], [0, 0, -0.9]),
      piece(cyl(0.2, 0.17, 0.2, 12), TD, [2.63, PLATTER_TOP + 2.83, 0], [0, 0, -0.9]),
      piece(tor(0.75, 0.14, Math.PI, 8, 20), TP, [-1.95, PLATTER_TOP + 1.7, 0], [0, 0, Math.PI / 2]),
    ];
    for (let i = 0; i < 12; i++) {       // polka dots on the body
      const lat = (i % 3 - 1) * 0.5, lon = (i / 12) * TAU + (i % 3) * 0.26;
      const r = 1.7;
      teapotParts.push(piece(sph(0.2, 8, 6), TD, [Math.cos(lat) * Math.sin(lon) * r, PLATTER_TOP + 1.66 + Math.sin(lat) * r * 0.8, Math.cos(lat) * Math.cos(lon) * r]));
    }
    const teapot = fuse(teapotParts, { roughness: 0.45 }); teapot.castShadow = true; platter.add(teapot); this.teapot = teapot;
    // steam puffs: one instanced mesh, recycled
    this.steam = new THREE.InstancedMesh(sph(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.45, transparent: true, opacity: 0.4, depthWrite: false, roughness: 1 }), 6);
    this.steam.position.set(2.75, PLATTER_TOP + 3.1, 0); platter.add(this.steam);

    // ---- sub-platters and cups ----
    const subColors = [0xbfe8d2, 0xfff0a8, 0xd9c8ff];
    const cupColors = CUPS.map((c) => c.colors);
    this.subs = []; this.cups = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const sub = new THREE.Group(); sub.position.set(Math.sin(a) * SUB_D, PLATTER_TOP, Math.cos(a) * SUB_D); platter.add(sub);
      const disc = fuse([
        piece(cyl(SUB_R, SUB_R + 0.1, 0.3, 32), subColors[k], [0, 0.15, 0]),
        piece(tor(SUB_R + 0.05, 0.05, TAU, 6, 32), GOLD, [0, 0.3, 0], [Math.PI / 2, 0, 0]),
      ]);
      sub.add(disc); this.subs.push(sub);
      for (let j = 0; j < 3; j++) {
        const b = (j / 3) * TAU + Math.PI / 3, idx = k * 3 + j;
        const cup = teacup(...cupColors[idx]);
        cup.position.set(Math.sin(b) * CUP_D, 0.3, Math.cos(b) * CUP_D);
        sub.add(cup);
        const rider = idx === 0;
        this.cups.push({ group: cup, angle: idx * 1.3, base: rider ? 0.9 : 1.4 + (idx % 4) * 0.25, wob: rider ? 0.5 : 0.7, phase: idx * 0.9, freq: 0.5 + (idx % 3) * 0.12 });
      }
    }
    // The rider sits on a pivot that shares their cup's position but spins on its own gentle schedule,
    // so the camera (which follows the seat's facing) swings instead of whipping round with the cup.
    this.seatPivot = new THREE.Group();
    this.seat.position.set(0, 0.3 + CUP_FLOOR, 0); this.seatPivot.add(this.seat);
    this.chooseSeat(CUPS[0].id);

    // ---- sparks: yellow chips that fly off the rider's cup in Turbo / launch mode (hidden otherwise) ----
    this.sparks = new THREE.InstancedMesh(box(0.14, 0.14, 0.14), new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffd34a, emissiveIntensity: 1.6, roughness: 0.5 }), 14);
    this.sparks.visible = false; this.sparks.frustumCulled = false; this.sparks.userData.noOcclude = true;
    this.seatPivot.add(this.sparks);
    this.sparkState = Array.from({ length: 14 }, (_, i) => ({ life: (i / 14), a: i * 2.4, vy: 2 + (i % 4) * 0.6 }));

    // ---- awning: poles, striped cone, scalloped valance, finial ----
    const poles = new THREE.InstancedMesh(cyl(0.12, 0.12, 6.8, 10), new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.6 }), 8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; poles.setMatrixAt(i, _m.makeTranslation(Math.sin(a) * 11.0, 3.4, Math.cos(a) * 11.0)); }
    poles.userData.noOcclude = true; G.add(poles);
    addInstanceColliders(this, poles, { minW: 0.5, height: 3 });
    const awningTex = stripeTexture(['#f48fb1', '#fff3dc'], 32);
    const awning = new THREE.Mesh(cone(11.8, 3.2, 16), new THREE.MeshStandardMaterial({ map: awningTex, emissiveMap: awningTex, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.85, side: THREE.DoubleSide }));
    awning.position.y = 8.4; G.add(awning);
    const valance = new THREE.Mesh(cyl(11.8, 11.8, 1.0, 48, true), new THREE.MeshStandardMaterial({ map: valanceTexture('#f48fb1', 48), transparent: true, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }));
    valance.position.y = 6.3; G.add(valance);
    const trim = fuse([
      piece(tor(11.82, 0.09, TAU, 6, 64), GOLD, [0, 6.8, 0], [Math.PI / 2, 0, 0]),
      piece(sph(0.35, 12, 8), GOLD, [0, 10.15, 0]),
      piece(cyl(0.05, 0.05, 1.3, 6), GOLD, [0, 10.8, 0]),
    ], { roughness: 0.3, metalness: 0.8 });
    G.add(trim);
    this.flag = new THREE.Mesh(piece(box(0.9, 0.45, 0.03), YELLOW, [0, 11.0, 0], null, null, [0.45, 0, 0]), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    G.add(this.flag);

    // ---- tea-party sign at the station (park side, local −Z) ----
    const signPosts = fuse([
      piece(cyl(0.1, 0.1, 3.0, 8), GOLD, [-5.2, 1.5, -11.6]), piece(cyl(0.1, 0.1, 3.0, 8), GOLD, [-2.8, 1.5, -11.6]),
      piece(sph(0.2, 8, 6), GOLD, [-4.0, 3.7, -11.6]),
      piece(box(0.8, 0.5, 0.5), CREAM, [-4.0, 0.25, -11.6]),
    ], { roughness: 0.3, metalness: 0.8 });
    G.add(signPosts);
    // little teacup doodles in the corners; the text is measured to fit between them
    const doodle = (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9;
      for (const x of [90, w - 90]) {
        ctx.beginPath(); ctx.moveTo(x - 34, h / 2 - 20); ctx.lineTo(x + 34, h / 2 - 20); ctx.lineTo(x + 22, h / 2 + 30); ctx.lineTo(x - 22, h / 2 + 30); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 42, h / 2 + 2, 16, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        ctx.fillRect(x - 40, h / 2 + 30, 80, 9);
      }
    };
    const board = makeTextBoard(this.name, 3.6, 0.9, { bg: '#f48fb1', fg: '#ffffff', border: '#d9a63a', padX: 175, decorate: doodle });
    board.position.set(-4.0, 2.75, -11.6); board.rotation.y = Math.PI; G.add(board);

    // ---- station + colliders ----
    G.updateMatrixWorld(true);
    this.station.copy(G.localToWorld(new THREE.Vector3(0, 0, -12.0)));
    this.stationRadius = 4;
    this.addBoxCollider(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(20, 1.6, 8.4));
    this.addBoxCollider(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(8.4, 1.6, 20));
    this.addBoxCollider(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(15.4, 1.6, 15.4));
    this.addBoxCollider(new THREE.Vector3(-4.0, 1.5, -11.6), new THREE.Vector3(2.8, 3, 0.5));
    // plot fence (26 x 26, inset 0.8); the gap is at the sign / station on −Z
    addPlotFence(this, { w: 26, d: 26, inset: 0.8, side: 'N', gap: [-2.5, 2.5], colors: { rail: 0xf48fb1 } });
  }

  // ---------- seats ----------
  seatOptions() { return CUPS.map((c) => ({ id: c.id, label: c.label, sub: c.sub })); }
  /** Move the rider's pivot to the chosen cup (same sub-platter slot); remote riders avoid that cup. */
  chooseSeat(id) {
    let idx = CUPS.findIndex((c) => c.id === id); if (idx < 0) idx = 0;
    this.riderIdx = idx;
    const cup = this.cups[idx].group;
    cup.parent.add(this.seatPivot);
    this.seatPivot.position.copy(cup.position);
    this._peerSeats?.forEach((s, i) => s && this.placePeer(s, i));
  }
  placePeer(s, i) {
    if (i < 3) {
      const a = [TAU / 3, -TAU / 3, 0][i];
      s.position.set(Math.sin(a) * 0.72, 0.3 + CUP_FLOOR, Math.cos(a) * 0.72); s.rotation.y = a + Math.PI;
      this.seatPivot.add(s);
    } else {
      const others = this.cups.filter((_, k) => k !== this.riderIdx);
      s.position.set(0, 0.3 + CUP_FLOOR, 0); s.rotation.y = 0;
      others[(i - 3) % others.length].group.add(s);
    }
  }
  /** Remote riders 0–2 sit round the rim of the rider's cup facing the middle; 3+ take the other cups (which spin). */
  peerSeat(i) {
    this._peerSeats ||= [];
    if (!this._peerSeats[i]) { const s = new THREE.Object3D(); this.placePeer(s, i); this._peerSeats[i] = s; }
    return this._peerSeats[i];
  }

  // ---------- boarding + speed modes ----------
  onBoard(player) {
    if (player?.cam) player.cam.yaw = Math.PI;   // orbit camera starts behind the rider
    this.mode = null; this.launched = false; this.modeTime = 0; this._launchExit = null;
    this.setSpeeds(1, 1, 1.5);
    this.duration = 30; this.hudText = '🍵 Pick your spin…';
    const token = ++this._boardToken;
    const ui = this.game.ui;
    if (!ui?.choose) { this.setMode('gentle'); return; }
    // Asynchronous: the ride keeps turning underneath while the chooser is up; X / Escape cancels -> Gentle.
    const options = Object.entries(TEACUP_MODES).map(([value, m]) => ({ label: m.label, sub: m.sub, value }));
    ui.choose({ title: 'Pick your spin!', speaker: this.name, color: '#f48fb1', options, cancel: 'Just surprise me' })
      .then((v) => { if (token !== this._boardToken || !this.riding || this.mode) return; this.setMode(v && TEACUP_MODES[v] ? v : 'gentle'); })
      .catch(() => { if (token === this._boardToken && this.riding && !this.mode) this.setMode('gentle'); });
  }
  onUnboard() {
    this._boardToken++;
    this.game.ui?.closeChoose?.();
    // back to the regular tea-party pace for the onlookers (eases down rather than snapping)
    // (_launchExit is left alone here: player.exitRide() reads exitPosition AFTER unboard(); doLaunch clears it.)
    this.mode = null; this.hudText = null; this.duration = 30;
    this.setSpeeds(1, 1, 2.5);
  }
  setSpeeds(speed, cupSpeed, ramp) { this.targetSpeed = speed; this.targetCupSpeed = cupSpeed; this.rampRate = Math.max(0.2, ramp); }
  /** Pick a speed mode ('gentle' | 'wild' | 'turbo' | 'launch'). Also usable from the console / tests. */
  setMode(mode) {
    const m = TEACUP_MODES[mode]; if (!m) return;
    this.game.ui?.closeChoose?.();
    this.mode = mode; this.modeTime = 0; this.launched = false;
    this.setSpeeds(m.speed, m.cupSpeed, m.ramp);
    this.duration = m.duration; this.hudText = m.hud;
    if (mode === 'turbo' || mode === 'launch') this.game.audio?.play('boost');
    if (mode === 'wild') this.game.audio?.play('whoosh');
  }
  /** Gentle / Wild / Turbo end after their duration; the launch mode never auto-completes — the cup lets go first. */
  isComplete() {
    if (!this.mode || this.mode === 'launch') return false;
    return this.rideTime >= this.duration;
  }
  /** While launching, the player exits from the cup itself (so the arc starts there), not the station. */
  get exitPosition() { return this._launchExit || this.station; }

  /** The funny one: the rider's cup lets go and flings them out of the ride onto the grass. */
  doLaunch() {
    const g = this.game, player = g.player;
    if (!player || player.ride !== this || this.launched) return;
    this.launched = true;
    const rideTime = this.rideTime;
    const seatPos = new THREE.Vector3(); this.seat.getWorldPosition(seatPos);
    const centre = new THREE.Vector3(); this.group.getWorldPosition(centre);
    // fly straight away from the teapot; nudge off the station side so they clear the sign
    const dir = new THREE.Vector3(seatPos.x - centre.x, 0, seatPos.z - centre.z);
    if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
    dir.normalize();
    const stationDir = new THREE.Vector3().subVectors(this.station, centre).setY(0).normalize();
    if (dir.dot(stationDir) > 0.85) dir.applyAxisAngle(_up, 0.7).normalize();
    this._launchExit = seatPos;
    // the cup may be anywhere between ~3 and ~7 u from the centre: pick the speed that lands at LAUNCH_RADIUS
    const r = Math.hypot(seatPos.x - centre.x, seatPos.z - centre.z);
    const speed = THREE.MathUtils.clamp((LAUNCH_RADIUS - r) / FLIGHT_FACTOR, 10, 16);
    const vel = new THREE.Vector3(dir.x * speed, LAUNCH_UP, dir.z * speed);
    // side-on camera so the whole arc is visible (and the camera isn't parked under the awning)
    if (player.cam) { player.cam.yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2; player.cam.pitch = 0.3; }
    player.launch(vel, 10);          // exits the ride (ride:exit) and plays 'whoosh'
    this._launchExit = null;
    g.audio?.play('whoosh');
    const p2 = g.settings?.princesses?.[1];
    const c = (p2?.catchphrase || '').trim();
    g.ui?.toast?.(`${p2?.name || 'Princess'}: ${c ? `${c}… ` : 'Oh no… '}I TOLD you not to press it!`, 4000);
    // It still counts as a ride once they land (launch() emitted ride:exit, not ride:complete).
    const name = this.name, id = this.id;
    const off = g.events.on('player:landed', () => {
      off();
      g.events.emit('ride:complete', { ride: id, name, time: rideTime });
      g.ui?.toast?.('Ride complete… technically! 🍵', 3000);
    });
  }

  update(dt, t) {
    // ease toward the mode's speeds (ramp = seconds for the full change)
    const k = Math.min(1, dt / this.rampRate * 2.2);
    this.speed += (this.targetSpeed - this.speed) * k;
    this.cupSpeed += (this.targetCupSpeed - this.cupSpeed) * k;
    if (this.mode) this.modeTime += dt;
    const frantic = Math.max(0, (this.speed - 1) / 5.5);          // 0 at gentle .. ~1 at launch speed

    this.platterAngle += W_PLATTER * this.speed * dt;
    this.subAngle += W_SUB * this.speed * dt;
    this.platter.rotation.y = this.platterAngle;
    for (const s of this.subs) s.rotation.y = this.subAngle;
    for (const c of this.cups) {
      // wobbly spin: speed breathes with a slow sine so cups surge and ease; faster modes spin every cup
      c.angle += c.base * this.cupSpeed * (1 + c.wob * Math.sin(t * c.freq + c.phase)) * dt;
      c.group.rotation.y = c.angle;
    }
    // rider facing: cancel the platter/sub-platter yaw, then add a swinging turn that speeds up with the mode
    this.swing += (0.45 + 1.6 * frantic) * dt;
    const pivot = this.seatPivot;
    pivot.rotation.y = -(this.platterAngle + this.subAngle) + this.swing + Math.sin(t * 0.7) * 0.9 * (1 - frantic * 0.5);
    // camera shake: tiny random offsets on the seat pivot in Turbo / launch mode (the camera follows the seat)
    const riderCup = this.cups[this.riderIdx].group;
    const shake = this.mode === 'turbo' ? 0.045 : this.mode === 'launch' ? 0.03 + Math.min(0.12, this.modeTime * 0.03) : 0;
    pivot.position.set(riderCup.position.x + (Math.random() - 0.5) * shake, riderCup.position.y + (Math.random() - 0.5) * shake * 0.6, riderCup.position.z + (Math.random() - 0.5) * shake);
    // teapot rattles harder and harder in launch mode
    if (this.teapot) {
      const r = this.mode === 'launch' ? Math.min(1, this.modeTime / LAUNCH_AT) : 0;
      this.teapot.position.set((Math.random() - 0.5) * 0.25 * r, Math.abs(Math.sin(t * 40)) * 0.15 * r, (Math.random() - 0.5) * 0.25 * r);
      this.teapot.rotation.set(Math.sin(t * 37) * 0.12 * r, 0, Math.cos(t * 41) * 0.12 * r);
    }
    // launch: after LAUNCH_AT seconds of absurd spin the rider's cup lets go
    if (this.mode === 'launch' && this.riding && !this.launched && this.modeTime >= LAUNCH_AT) this.doLaunch();

    // steam puffs rise, drift and swell then fade out — bigger and faster when the ride is going hard
    // (skipped, upload and all, while the player is too far away to see them)
    const player = this.game.player;
    if (!player || player.position.distanceTo(_v.setFromMatrixPosition(this.group.matrixWorld)) < 80) {
      const steamRate = 0.3 + frantic * 0.9, steamScale = 1 + frantic * 1.2;
      for (let i = 0; i < 6; i++) {
        const life = ((t * steamRate + i / 6) % 1);
        const s = (0.4 + life * 1.0) * (1 - life * life) * steamScale;
        _v.set(Math.sin(t * 1.7 + i) * 0.2 + life * 0.5, 0.1 + life * 1.9, Math.cos(t * 1.3 + i * 2) * 0.2);
        this.steam.setMatrixAt(i, _m.compose(_v, _qi, _s.set(s, s, s)));
      }
      this.steam.instanceMatrix.needsUpdate = true;
    }
    // sparks off the rider's cup rim in Turbo / launch
    const sparking = (this.mode === 'turbo' || this.mode === 'launch') && this.riding;
    if (sparking || this.sparks.visible) {
      this.sparks.visible = sparking;
      for (let i = 0; i < this.sparkState.length; i++) {
        const sp = this.sparkState[i];
        sp.life += dt * 1.6;
        if (sp.life > 1) { sp.life = 0; sp.a = Math.random() * TAU; sp.vy = 1.5 + Math.random() * 2.5; }
        const r = 1.1 + sp.life * 2.6, y = 1.3 + sp.vy * sp.life - 6 * sp.life * sp.life;
        _v.set(Math.sin(sp.a) * r, y, Math.cos(sp.a) * r);
        const sc = sparking ? 1 - sp.life * 0.8 : 0.0001;
        this.sparks.setMatrixAt(i, _m.compose(_v, _qi, _s.set(sc, sc, sc)));
      }
      this.sparks.instanceMatrix.needsUpdate = true;
    }
    this.flag.rotation.y = Math.sin(t * 3.3) * 0.5;
  }
}
const _up = new THREE.Vector3(0, 1, 0);
