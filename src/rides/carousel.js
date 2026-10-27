// Royal Carousel — two-tier striped canopy, mirrored column, twinkling bulbs and twelve
// bobbing animals (blocky horses, unicorns, a dragon, a flamingo, a sea turtle).
// Draw-call budget: every static cluster is merged into one vertex-coloured mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ride } from './Ride.js';
import { makeTextBoard, addPlotFence } from './shared/track.js';

const TAU = Math.PI * 2;
const GREEN = 0x1e6b3c, YELLOW = 0xf6d44a, GOLD = 0xd9a63a, CREAM = 0xfff3dc, WOOD = 0xb5834a;
const PINK = 0xf48fb1, TEAL = 0x3bb8b0, RED = 0xc43a3f, DARK = 0x2b2420;
const SPIN = TAU / 12;            // one revolution per 12 s
const BOB = 0.3;                  // animal bob amplitude
// remote riders take the animals nearest the rider's, alternating sides (offsets from the rider's index)
const PEER_OFFSETS = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
// animal roster (index = position round the deck): kind + name, used by the seat menu
const ANIMALS = [
  ['🐴', 'Snowflake'], ['🦄', 'Starlight'], ['🐴', 'Chestnut'], ['🐉', 'Ember'],
  ['🐴', 'Midnight'], ['🦩', 'Flora'], ['🐴', 'Honey'], ['🦄', 'Moonbeam'],
  ['🐴', 'Pebble'], ['🐢', 'Shelly'], ['🐴', 'Buttercup'], ['🦄', 'Sparkle'],
];
const R_ANIMAL = 5.4, DECK_TOP = 0.5, ANIMAL_BASE_Y = 2.0;

// ---------- tiny procedural-geometry kit ----------
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
/** Transform a primitive (scale → pre-offset → rotate → translate) and bake a flat colour into it. */
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
/** Merge coloured pieces into a single mesh (one draw call). */
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

function stripeTexture(colors, n = 24) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 16;
  const ctx = c.getContext('2d');
  for (let i = 0; i < n; i++) { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(Math.floor((i * 1024) / n), 0, Math.ceil(1024 / n) + 1, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// ---------- animals (each returns a Group with ONE merged mesh; userData.saddleY = where the rider's bottom goes) ----------
function leg(P, color, hoofColor, x, z, ang, len = 0.72) {
  P.push(piece(box(0.18, len, 0.2), color, [x, -0.28, z], [ang, 0, 0], null, [0, -len / 2, 0]));
  P.push(piece(box(0.2, 0.14, 0.22), hoofColor, [x, -0.28, z], [ang, 0, 0], null, [0, -len + 0.04, 0.02]));
}
function saddle(P, seatC, blanketC) {
  P.push(piece(box(0.76, 0.06, 0.8), blanketC, [0, 0.33, -0.35]));
  P.push(piece(box(0.66, 0.14, 0.6), seatC, [0, 0.39, -0.35]));
  P.push(piece(box(0.16, 0.14, 0.12), seatC, [0, 0.5, -0.08]));          // pommel
  P.push(piece(box(0.5, 0.16, 0.1), seatC, [0, 0.51, -0.63]));           // cantle
}
function horse({ body, mane, seat, blanket, horn = false, maneColors = null }) {
  const P = [];
  P.push(piece(box(0.62, 0.62, 1.35), body));
  P.push(piece(box(0.5, 0.48, 0.3), body, [0, -0.08, 0.75]));                        // chest
  P.push(piece(box(0.34, 0.8, 0.4), body, [0, 0.5, 0.62], [0.55, 0, 0]));            // neck
  P.push(piece(box(0.3, 0.3, 0.62), body, [0, 1.0, 0.98], [0.25, 0, 0]));            // head
  P.push(piece(box(0.26, 0.24, 0.24), CREAM, [0, 0.9, 1.27]));                        // muzzle
  for (const s of [-1, 1]) {
    P.push(piece(cone(0.07, 0.2, 6), body, [s * 0.1, 1.26, 0.82]));                  // ears
    P.push(piece(box(0.05, 0.08, 0.08), DARK, [s * 0.16, 1.08, 1.1]));                // eyes
  }
  const mc = maneColors || [mane, mane, mane];
  P.push(piece(box(0.16, 0.3, 0.24), mc[0], [0, 0.78, 0.36]));
  P.push(piece(box(0.16, 0.3, 0.24), mc[1], [0, 0.98, 0.53]));
  P.push(piece(box(0.16, 0.3, 0.24), mc[2], [0, 1.17, 0.7]));
  P.push(piece(box(0.2, 0.14, 0.24), mc[0], [0, 1.2, 0.95]));                        // forelock
  P.push(piece(box(0.16, 0.65, 0.18), mane, [0, -0.05, -0.82], [0.45, 0, 0]));       // tail
  leg(P, body, DARK, -0.2, 0.45, -0.9); leg(P, body, DARK, 0.2, 0.45, -0.4);
  leg(P, body, DARK, -0.2, -0.45, 0.5); leg(P, body, DARK, 0.2, -0.45, 0.85);
  saddle(P, seat, blanket);
  if (horn) P.push(piece(cone(0.08, 0.5, 8), GOLD, [0, 1.42, 0.98], [0.3, 0, 0]));
  const g = new THREE.Group(); g.add(fuse(P)); g.userData.saddleY = 0.46; g.userData.lift = 0;
  return g;
}
function dragon() {
  const P = [], body = 0x2f9e4f, belly = 0xf0e68c, wing = 0x1d6b36;
  P.push(piece(box(0.7, 0.62, 1.5), body));
  P.push(piece(box(0.5, 0.26, 1.3), belly, [0, -0.25, 0.05]));
  P.push(piece(box(0.4, 0.55, 0.42), body, [0, 0.4, 0.72], [0.5, 0, 0]));            // neck
  P.push(piece(box(0.46, 0.4, 0.7), body, [0, 0.78, 1.1], [0.15, 0, 0]));            // head
  P.push(piece(box(0.4, 0.14, 0.5), belly, [0, 0.56, 1.2]));                           // jaw
  for (const s of [-1, 1]) {
    P.push(piece(box(0.1, 0.1, 0.06), YELLOW, [s * 0.2, 0.9, 1.44]));
    P.push(piece(cone(0.08, 0.35, 6), CREAM, [s * 0.15, 1.1, 0.85], [-0.4, 0, 0]));
    P.push(piece(box(1.3, 0.06, 0.75), wing, [s * 0.95, 0.6, -0.1], [0, 0, s * 0.55]));
    P.push(piece(box(0.08, 0.5, 0.75), wing, [s * 1.5, 0.95, -0.1], [0, 0, s * 0.55]));
  }
  for (const z of [0.45, 0.15, -0.95, -1.2]) P.push(piece(cone(0.1, 0.28, 5), YELLOW, [0, z > -0.5 ? 0.42 : 0.12, z]));
  P.push(piece(cone(0.2, 1.1, 6), body, [0, -0.05, -1.25], [-Math.PI / 2, 0, 0]));     // tail
  for (const s of [-1, 1]) { leg(P, body, 0x1d6b36, s * 0.26, 0.5, s * 0.15, 0.55); leg(P, body, 0x1d6b36, s * 0.26, -0.5, -s * 0.15, 0.55); }
  saddle(P, RED, GOLD);
  const g = new THREE.Group(); g.add(fuse(P)); g.userData.saddleY = 0.46; g.userData.lift = 0;
  return g;
}
function flamingo() {
  const P = [], body = 0xff7fa8, dark = 0xe8588a;
  P.push(piece(sph(0.45, 14, 10), body, [0, 0, 0], null, [0.9, 0.8, 1.3]));
  for (const s of [-1, 1]) P.push(piece(box(0.5, 0.1, 0.8), dark, [s * 0.38, 0.12, -0.1], [0, 0, s * 0.35]));
  P.push(piece(cyl(0.09, 0.12, 0.75, 8), body, [0, 0.45, 0.55], [0.5, 0, 0]));       // lower neck
  P.push(piece(cyl(0.08, 0.09, 0.6, 8), body, [0, 0.98, 0.76], [-0.15, 0, 0]));      // upper neck
  P.push(piece(sph(0.17, 10, 8), body, [0, 1.3, 0.8]));                                // head
  P.push(piece(cyl(0.06, 0.08, 0.18, 8), 0xffd1dc, [0, 1.22, 0.96], [2.3, 0, 0]));
  P.push(piece(cone(0.07, 0.3, 8), DARK, [0, 1.1, 1.08], [2.3, 0, 0]));                // beak tip
  for (const s of [-1, 1]) P.push(piece(box(0.05, 0.07, 0.05), DARK, [s * 0.12, 1.34, 0.93]));
  for (const s of [-1, 1]) {
    P.push(piece(cyl(0.04, 0.04, 0.75, 6), 0xffb0c4, [s * 0.13, -0.68, 0.05]));
    P.push(piece(box(0.22, 0.06, 0.3), 0xffb0c4, [s * 0.13, -1.08, 0.12]));
  }
  for (let i = 0; i < 3; i++) P.push(piece(box(0.12, 0.08, 0.5), dark, [(i - 1) * 0.14, 0.15, -0.7], [-0.4, 0, (i - 1) * 0.3]));
  P.push(piece(box(0.62, 0.06, 0.7), GREEN, [0, 0.28, -0.3]));
  P.push(piece(box(0.54, 0.14, 0.52), YELLOW, [0, 0.33, -0.3]));
  P.push(piece(box(0.44, 0.16, 0.1), YELLOW, [0, 0.45, -0.55]));
  const g = new THREE.Group(); g.add(fuse(P)); g.userData.saddleY = 0.4; g.userData.lift = 0.08;
  return g;
}
function turtle() {
  const P = [], shell = 0x2d7a4a, plate = 0x5fb86e, skin = 0x8bbf6a;
  P.push(piece(sph(0.9, 16, 10), shell, [0, 0, 0], null, [1, 0.45, 1.1]));
  P.push(piece(cyl(0.85, 0.75, 0.16, 20), CREAM, [0, -0.32, 0], null, [1, 1, 1.1]));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; P.push(piece(cyl(0.2, 0.24, 0.1, 6), plate, [Math.sin(a) * 0.55, 0.3, Math.cos(a) * 0.6], [0.0, a, 0])); }
  P.push(piece(sph(0.24, 10, 8), skin, [0, 0.02, 1.08], null, [1, 0.8, 1.2]));
  for (const s of [-1, 1]) P.push(piece(box(0.06, 0.07, 0.06), DARK, [s * 0.14, 0.1, 1.3]));
  for (const s of [-1, 1]) {
    P.push(piece(box(0.6, 0.08, 0.32), skin, [s * 0.95, -0.15, 0.45], [0, s * 0.6, 0]));
    P.push(piece(box(0.42, 0.08, 0.26), skin, [s * 0.8, -0.15, -0.55], [0, -s * 0.5, 0]));
  }
  P.push(piece(cone(0.1, 0.4, 6), skin, [0, -0.1, -1.1], [-Math.PI / 2, 0, 0]));
  P.push(piece(box(0.7, 0.06, 0.6), YELLOW, [0, 0.34, -0.1]));
  P.push(piece(box(0.6, 0.14, 0.5), GREEN, [0, 0.4, -0.1]));
  P.push(piece(box(0.5, 0.16, 0.1), GREEN, [0, 0.52, -0.35]));
  const g = new THREE.Group(); g.add(fuse(P)); g.userData.saddleY = 0.47; g.userData.lift = 0.2;
  return g;
}
function chariot() {
  const P = [];
  P.push(piece(box(1.5, 0.5, 1.7), GREEN, [0, 0.42, 0]));
  P.push(piece(box(1.5, 0.85, 0.12), GREEN, [0, 1.05, -0.8]));
  P.push(piece(box(1.5, 0.55, 0.12), GREEN, [0, 0.9, 0.8]));
  for (const s of [-1, 1]) {
    P.push(piece(box(0.12, 0.45, 1.7), GREEN, [s * 0.7, 0.85, 0]));
    P.push(piece(tor(0.22, 0.05, TAU, 6, 16), GOLD, [s * 0.76, 1.3, 0.8], [0, Math.PI / 2, 0]));
    P.push(piece(cyl(0.5, 0.5, 0.1, 16), GOLD, [s * 0.86, 0.5, 0], [0, 0, Math.PI / 2]));
  }
  P.push(piece(box(1.3, 0.14, 0.6), CREAM, [0, 0.74, -0.4]));
  P.push(piece(box(1.5, 0.06, 1.75), GOLD, [0, 0.69, 0]));
  const g = new THREE.Group(); g.add(fuse(P, { roughness: 0.5, metalness: 0.25 }));
  return g;
}

export class Carousel extends Ride {
  constructor(game, opts) {
    super(game, { ...opts, name: 'Royal Carousel', kind: 'passive' });
    this.duration = 30;
    // low and close enough to stay under the canopy (its underside is ~y 6.5 at the camera's radius)
    this.cameraOffset.set(0, 1.7, -4.6);
    this.cameraLookOffset.set(0, 1.3, 6);
    this.tagline = 'Hop on a unicorn and go round the royal way';
    this.menuColor = '#1e6b3c';
    this.riderIdx = 1;
    this.spinT = 0;        // accumulated spin time (pauses while a rider picks an animal)
  }

  build() {
    const G = this.group;
    const stripes = stripeTexture(['#1e6b3c', '#f6d44a'], 24);
    const stripesFine = stripeTexture(['#1e6b3c', '#f6d44a'], 48);

    // ---- static base: wide step ring ----
    const base = fuse([
      piece(cyl(8.3, 8.6, 0.3, 48), 0xe6d9bd, [0, 0.15, 0]),
      piece(cyl(7.9, 8.3, 0.2, 48), 0xd7c6a3, [0, 0.4, 0]),
    ]);
    base.receiveShadow = true; G.add(base);

    // ---- rotor: everything that spins ----
    const rotor = new THREE.Group(); rotor.position.y = 0; G.add(rotor); this.rotor = rotor;
    const paint = fuse([
      piece(cyl(7.6, 7.6, 0.5, 48), WOOD, [0, DECK_TOP - 0.25, 0]),                 // deck (top at 0.5)
      piece(cyl(1.3, 1.5, 5.0, 24), CREAM, [0, DECK_TOP + 2.5, 0]),                 // column
      piece(cyl(1.9, 2.1, 0.45, 24), GREEN, [0, DECK_TOP + 0.22, 0]),               // column base
      piece(cyl(1.75, 1.35, 0.45, 24), GREEN, [0, 5.3, 0]),                         // capital
      piece(cyl(3.25, 3.25, 0.95, 24), CREAM, [0, 8.95, 0]),                        // cupola drum
      piece(cyl(1.9, 1.9, 0.5, 24), GREEN, [0, 5.75, 0]),                           // ceiling boss
    ]);
    paint.castShadow = true; paint.receiveShadow = true; rotor.add(paint);
    const skirt = new THREE.Mesh(cyl(7.66, 7.66, 0.48, 48, true), new THREE.MeshStandardMaterial({ map: stripesFine, roughness: 0.7 }));
    skirt.position.y = DECK_TOP - 0.25; skirt.userData.noOcclude = true; rotor.add(skirt);

    // gold trims, bands, mirror frames and the finial
    const goldPieces = [
      piece(tor(7.62, 0.07), GOLD, [0, DECK_TOP, 0], [Math.PI / 2, 0, 0]),
      piece(tor(1.52, 0.08, TAU, 8, 24), GOLD, [0, DECK_TOP + 0.5, 0], [Math.PI / 2, 0, 0]),
      piece(tor(1.42, 0.08, TAU, 8, 24), GOLD, [0, 5.08, 0], [Math.PI / 2, 0, 0]),
      piece(tor(7.95, 0.09, TAU, 8, 48), GOLD, [0, 6.3, 0], [Math.PI / 2, 0, 0]),
      piece(tor(7.95, 0.07, TAU, 8, 48), GOLD, [0, 5.5, 0], [Math.PI / 2, 0, 0]),
      piece(tor(3.3, 0.07, TAU, 8, 24), GOLD, [0, 8.5, 0], [Math.PI / 2, 0, 0]),
      piece(tor(3.3, 0.07, TAU, 8, 24), GOLD, [0, 9.42, 0], [Math.PI / 2, 0, 0]),
      piece(sph(0.36, 12, 8), GOLD, [0, 11.95, 0]),
      piece(cyl(0.05, 0.05, 1.2, 6), GOLD, [0, 12.6, 0]),
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      goldPieces.push(piece(box(0.72, 2.05, 0.05), GOLD, [Math.sin(a) * 1.4, DECK_TOP + 2.75, Math.cos(a) * 1.4], [0, a, 0]));
    }
    const gold = fuse(goldPieces, { roughness: 0.3, metalness: 0.8 }); gold.userData.noOcclude = true; rotor.add(gold);

    // mirrors on the column (shiny)
    // no env map in the scene, so full metalness would render black: fake glass with a cool tint + soft emissive sheen
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, metalness: 0.35, roughness: 0.08, emissive: 0x9fc4e8, emissiveIntensity: 0.35 });
    const mirrors = new THREE.InstancedMesh(box(0.56, 1.85, 0.06), mirrorMat, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      mirrors.setMatrixAt(i, _m.compose(new THREE.Vector3(Math.sin(a) * 1.44, DECK_TOP + 2.75, Math.cos(a) * 1.44), new THREE.Quaternion().setFromEuler(_e.set(0, a, 0)), new THREE.Vector3(1, 1, 1)));
    }
    mirrors.userData.noOcclude = true; rotor.add(mirrors);

    // canopy: striped valance, lower cone, upper cone (two tiers)
    const canopyMat = new THREE.MeshStandardMaterial({ map: stripes, emissiveMap: stripes, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.8, side: THREE.DoubleSide }); // emissiveMap lifts the shaded underside riders look up at
    const valance = new THREE.Mesh(cyl(7.9, 7.9, 0.8, 48, true), canopyMat); valance.position.y = 5.9; valance.userData.noOcclude = true; rotor.add(valance);
    const lower = new THREE.Mesh(cyl(3.2, 8.2, 2.2, 48, true), canopyMat); lower.position.y = 7.4; lower.castShadow = true; rotor.add(lower);
    const upper = new THREE.Mesh(cone(3.6, 2.4, 24), canopyMat); upper.position.y = 10.62; rotor.add(upper);

    // scalloped bunting: alternating diamonds hanging under the valance
    const scallops = new THREE.InstancedMesh(box(0.5, 0.5, 0.1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 48);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      scallops.setMatrixAt(i, _m.compose(new THREE.Vector3(Math.sin(a) * 7.9, 5.25, Math.cos(a) * 7.9), new THREE.Quaternion().setFromEuler(_e.set(0, a, Math.PI / 4)), new THREE.Vector3(1, 1, 1)));
      scallops.setColorAt(i, _c.set(i % 2 ? YELLOW : GREEN));
    }
    scallops.userData.noOcclude = true; rotor.add(scallops);

    // bulbs: two instanced groups twinkle out of phase
    const bulbGeo = sph(0.13, 8, 6);
    const mkBulbMat = () => new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd27a, emissiveIntensity: 1.5, roughness: 0.4 });
    this.bulbMats = [mkBulbMat(), mkBulbMat()];
    const bulbs = [new THREE.InstancedMesh(bulbGeo, this.bulbMats[0], 32), new THREE.InstancedMesh(bulbGeo, this.bulbMats[1], 32)];
    const counts = [0, 0];
    const placeBulb = (i, x, y, z) => { const k = i % 2; bulbs[k].setMatrixAt(counts[k]++, _m.makeTranslation(x, y, z)); };
    for (let i = 0; i < 48; i++) { const a = (i / 48 + 1 / 96) * TAU; placeBulb(i, Math.sin(a) * 8.0, 6.05, Math.cos(a) * 8.0); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; placeBulb(i, Math.sin(a) * 3.32, 8.95, Math.cos(a) * 3.32); }
    for (const b of bulbs) { b.userData.noOcclude = true; rotor.add(b); }

    // pennant on the finial
    this.flag = new THREE.Mesh(piece(box(0.9, 0.45, 0.03), YELLOW, [0, 12.75, 0], null, null, [0.45, 0, 0]), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.flag.userData.noOcclude = true; rotor.add(this.flag);

    // poles
    const poles = new THREE.InstancedMesh(cyl(0.06, 0.06, 5.0, 8), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8 }), 12);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; poles.setMatrixAt(i, _m.makeTranslation(Math.sin(a) * R_ANIMAL, DECK_TOP + 2.5, Math.cos(a) * R_ANIMAL)); }
    poles.userData.noOcclude = true; rotor.add(poles);   // thin poles must not pull the camera in

    // animals
    const H = (body, mane, seat, blanket) => horse({ body, mane, seat, blanket });
    const U = () => horse({ body: 0xfdfdfd, mane: PINK, seat: GOLD, blanket: 0xc9a0ff, horn: true, maneColors: [PINK, YELLOW, TEAL] });
    const makers = [
      () => H(0xf2f2f2, 0x6b4a2a, GREEN, YELLOW), U, () => H(0x8d5a2b, DARK, RED, CREAM), dragon,
      () => H(0x2f2f36, 0xdddddd, YELLOW, GREEN), flamingo, () => H(0xd6a76a, 0x5a3a1a, PINK, CREAM), U,
      () => H(0xc4c4cc, 0x3a3a3a, GREEN, GOLD), turtle, () => H(0xe9c9a1, 0xffffff, RED, YELLOW), U,
    ];
    this.animals = [];
    makers.forEach((mk, i) => {
      const a = (i / 12) * TAU;
      const g = mk();
      g.position.set(Math.sin(a) * R_ANIMAL, ANIMAL_BASE_Y, Math.cos(a) * R_ANIMAL);
      g.rotation.y = a + Math.PI / 2;                       // +Z = direction of travel
      g.children[0].castShadow = true;
      g.children[0].userData.noOcclude = true;   // small animals: the orbit camera passes them rather than snapping in
      rotor.add(g);
      this.animals.push({ group: g, baseY: ANIMAL_BASE_Y + g.userData.lift, phase: (i % 2) * Math.PI + i * 0.35, amp: BOB });
    });
    // chariots on the inner ring
    for (const k of [0, 1]) {
      const a = k * Math.PI + Math.PI / 12;
      const c = chariot(); c.position.set(Math.sin(a) * 3.3, DECK_TOP, Math.cos(a) * 3.3); c.rotation.y = a + Math.PI / 2; c.children[0].userData.noOcclude = true; rotor.add(c);
    }
    // rider seat on the first unicorn (index 1); feet-origin sits 0.45 under the saddle top, hips slightly aft of the pole.
    // The seat hangs from a level carrier that is driven round with the rotor in update() (so the camera never bobs
    // or tilts). The carrier lives directly under the ride group, NOT the rotor: the player's camera treats the seat's
    // ancestors as "the vehicle" and never lets them occlude, so parenting to the rotor would let the camera pass
    // through the canopy and the centre column. The unicorn's own bob eases to zero while someone rides it.
    this.carrier = new THREE.Group(); G.add(this.carrier);
    this.carrier.add(this.seat);
    this.chooseSeat('Starlight');

    // ---- station (on the +X side, toward the park's central promenade) ----
    const st = new THREE.Group(); st.rotation.y = Math.PI / 2; G.add(st);
    const booth = fuse([
      piece(box(1.9, 2.3, 1.9), CREAM, [-5.2, 1.15, 10.4]),
      piece(box(1.3, 0.8, 0.1), 0x1a2a3a, [-5.2, 1.5, 11.36]),
      piece(box(1.6, 0.1, 0.5), WOOD, [-5.2, 1.08, 11.6]),
      piece(box(2.1, 0.3, 2.1), GREEN, [-5.2, 2.4, 10.4]),
      piece(cone(1.55, 0.95, 4), GREEN, [-5.2, 3.0, 10.4], [0, Math.PI / 4, 0]),
      piece(sph(0.18, 8, 6), GOLD, [-5.2, 3.55, 10.4]),
      piece(box(0.3, 2.3, 0.3), GOLD, [-6.05, 1.15, 11.25]), piece(box(0.3, 2.3, 0.3), GOLD, [-4.35, 1.15, 11.25]),
    ]);
    booth.castShadow = true; st.add(booth);
    const tickets = makeTextBoard('TICKETS', 1.6, 0.42, { bg: '#f6d44a', fg: '#1e6b3c', border: '#1e6b3c', edge: GOLD, padX: 40 });
    tickets.position.set(-5.2, 2.12, 11.44); st.add(tickets);   // plaque proud of the booth face (never coplanar)
    const arch = fuse([
      piece(cyl(0.14, 0.14, 3.4, 10), GOLD, [-2.5, 1.7, 9.6]), piece(cyl(0.14, 0.14, 3.4, 10), GOLD, [2.5, 1.7, 9.6]),
      piece(tor(2.5, 0.12, Math.PI, 8, 32), GOLD, [0, 3.4, 9.6]),
      piece(sph(0.22, 8, 6), GOLD, [-2.5, 0.0, 9.6], null, [1, 0.5, 1]), piece(sph(0.22, 8, 6), GOLD, [2.5, 0.0, 9.6], null, [1, 0.5, 1]),
      piece(sph(0.25, 10, 8), GOLD, [0, 5.95, 9.6]),
    ], { roughness: 0.3, metalness: 0.8 });
    arch.userData.noOcclude = true; st.add(arch);
    const board = makeTextBoard(this.name, 4.1, 1.0, { bg: '#1e6b3c', fg: '#f6d44a', border: '#d9a63a' });
    board.position.set(0, 4.55, 9.6); st.add(board);

    // ---- station position, colliders ----
    G.updateMatrixWorld(true);
    const stationLocal = new THREE.Vector3(0, 0, 11.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this.station.copy(G.localToWorld(stationLocal.clone()));
    this.stationRadius = 4;
    // platform ≈ circle r 8.6 → three overlapping boxes
    this.addBoxCollider(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(17.2, 1.6, 7.4));
    this.addBoxCollider(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(7.4, 1.6, 17.2));
    this.addBoxCollider(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(13.2, 1.6, 13.2));
    const rot = (x, z) => new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const bc = rot(-5.2, 10.6); this.addBoxCollider(new THREE.Vector3(bc.x, 1.2, bc.z), new THREE.Vector3(2.4, 2.4, 2.4));
    for (const s of [-1, 1]) { const p = rot(s * 2.5, 9.6); this.addBoxCollider(new THREE.Vector3(p.x, 1.7, p.z), new THREE.Vector3(0.5, 3.4, 0.5)); }
    // plot fence (26 x 26, inset 0.8 so it clears the ticket booth); the gap is the golden arch on the +x side
    addPlotFence(this, { w: 26, d: 26, inset: 0.8, side: 'E', gap: [-3.5, 3.5], colors: { rail: 0x1e6b3c } });
  }

  onBoard(player) { if (player?.cam) player.cam.yaw = Math.PI; }   // start looking forward over the animal's head

  // ---------- seats ----------
  seatOptions() { return ANIMALS.map(([icon, name]) => ({ id: name, label: `${icon} ${name}`, sub: icon === '🦄' ? 'unicorn' : icon === '🐉' ? 'dragon' : icon === '🦩' ? 'flamingo' : icon === '🐢' ? 'sea turtle' : 'horse' })); }
  /** Move the rider's carrier to the named animal; remote riders shuffle to the animals nearest it. */
  chooseSeat(id) {
    let idx = ANIMALS.findIndex(([, n]) => n === id); if (idx < 0) idx = 1;
    this.riderIdx = idx;
    this.riderAnimal = this.animals[idx];
    this.carrierAngle = (idx / 12) * TAU;
    this.seat.position.set(0, this.riderAnimal.group.userData.saddleY - 0.45, -0.5);
    this.placeCarrier(this.spinT * SPIN);
    this._peerSeats?.forEach((s, i) => s && this.placePeer(s, i));
  }
  placePeer(s, i) {
    const a = this.animals[(this.riderIdx + PEER_OFFSETS[i % PEER_OFFSETS.length] + 12) % 12];
    s.position.set(0, a.group.userData.saddleY - 0.45, -0.5);
    a.group.add(s);
  }
  /** Remote rider i sits on the next animal over (nearest to the rider's first); each bobs with its own animal. */
  peerSeat(i) {
    this._peerSeats ||= [];
    if (!this._peerSeats[i]) { const s = new THREE.Object3D(); this.placePeer(s, i); this._peerSeats[i] = s; }
    return this._peerSeats[i];
  }

  placeCarrier(rotorAngle) {
    const a = this.carrierAngle + rotorAngle;
    this.carrier.position.set(Math.sin(a) * R_ANIMAL, ANIMAL_BASE_Y, Math.cos(a) * R_ANIMAL);
    this.carrier.rotation.y = a + Math.PI / 2;
  }

  update(dt, t) {
    this.spinT += dt;                       // dt is 0 while the rider picks an animal: the deck waits
    const st = this.spinT;
    this.rotor.rotation.y = st * SPIN;
    this.placeCarrier(st * SPIN);
    const ra = this.riderAnimal;
    ra.amp += ((this.riding ? 0 : BOB) - ra.amp) * Math.min(1, dt * 3);
    for (const a of this.animals) a.group.position.y = a.baseY + Math.sin(st * 2.4 + a.phase) * a.amp;
    this.bulbMats[0].emissiveIntensity = 1.4 + Math.sin(t * 5.0) * 0.9;
    this.bulbMats[1].emissiveIntensity = 1.4 + Math.sin(t * 5.0 + Math.PI) * 0.9;
    this.flag.rotation.y = Math.sin(t * 3.1) * 0.5;
  }
}
