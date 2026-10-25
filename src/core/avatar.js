// Blocky Roblox-style avatar builder. Used by the player, NPCs, remote peers and the avatar creator preview.
import * as THREE from 'three';

export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bun', 'curly', 'bob', 'none'];
export const OUTFITS = ['casual', 'dress', 'gown', 'armor', 'hoodie', 'swimsuit'];
export const ACCESSORIES = ['none', 'crown', 'tiara', 'wings', 'cape', 'wizardHat', 'bunnyEars', 'sunglasses', 'halo', 'catEars'];
// Hand-held items bought (free) at the park shops. 'none' = empty hands.
export const HELD_ITEMS = ['none', 'needoh', 'balloon', 'wand', 'plushie', 'iceCream', 'cottonCandy', 'pretzel', 'lemonade'];
export const SKIN_TONES = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
export const HAIR_COLORS = ['#2b1a0e', '#5a3825', '#8b5a2b', '#d8a35a', '#f2d16b', '#111111', '#c0392b', '#ff6fb5', '#5bb0ff', '#9b59b6', '#2ecc71', '#ffffff'];
export const PALETTE = ['#0b5d3b', '#2ecc71', '#f9d71c', '#ffd166', '#ff6fb5', '#e74c3c', '#ff8c42', '#5bb0ff', '#3b5bdb', '#9b59b6', '#ffffff', '#222222', '#8d6e63', '#00c2c7'];

export const DEFAULT_AVATAR = {
  name: 'Explorer',
  skin: SKIN_TONES[1],
  hairStyle: 'long',
  hairColor: HAIR_COLORS[1],
  outfit: 'casual',
  topColor: '#5bb0ff',
  bottomColor: '#3b5bdb',
  shoeColor: '#222222',
  accessory: 'none',
  accessoryColor: '#f9d71c',
  held: 'none',
};

// ---- rig constants (group origin at the feet) ----
const LEG_H = 0.8, TORSO_H = 0.85, ARM_H = 0.8;
const HIP_Y = LEG_H;                       // leg pivots (standing)
const SEAT_TORSO_Y = 0.45, DRIVE_TORSO_Y = 0.55; // torso bottom while seated / on a bike
const SKIRT_TOP = 0.12;                    // skirt cone top (torso space)
const HAND_Y = -0.76;                      // hand anchor on the arm pivot
// Butterfly wings hinge at the spine behind the torso (back surface z=-0.25) and only ever sweep BACKWARDS:
// yaw angle range (radians from the frontal plane) keeps them clear of torso, swinging arms and long hair.
const WING_HINGE = { x: 0, y: 0.5, z: -0.36, tilt: -0.2 };
const WING_MIN = 0.85, WING_MAX = 1.3, WING_MID = 1.03;

// blend two hex colors (0..1 toward b)
function mix(a, b, t) { const ca = new THREE.Color(a), cb = new THREE.Color(b); return '#' + ca.lerp(cb, t).getHexString(); }

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...extra });
const box = (w, h, d, color, extra) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
const sphere = (r, color, extra, ws = 12, hs = 10) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(color, extra)); m.castShadow = true; return m; };
const cyl = (rt, rb, h, color, extra, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, extra)); m.castShadow = true; return m; };

// Butterfly wing: a big upper lobe and a smaller lower lobe drawn as a Shape, with spots and a thin dark outline ring.
// Origin at the hinge (spine); the shape extends outward along +X (mirrored for side -1). Lies in the XY plane.
function buildButterflyWing(color, side) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0.04, 0.1);
  shape.bezierCurveTo(0.35, 0.75, 1.05, 0.95, 1.1, 0.45);   // upper lobe outer edge
  shape.bezierCurveTo(1.12, 0.15, 0.75, 0.0, 0.5, 0.02);
  shape.bezierCurveTo(0.95, -0.2, 0.95, -0.75, 0.55, -0.72); // lower lobe
  shape.bezierCurveTo(0.3, -0.7, 0.1, -0.45, 0.04, -0.2);
  shape.closePath();
  const wingMat = mat(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: color, emissiveIntensity: 0.15 });
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), wingMat);
  g.add(wing);
  // outline: a ring (scaled outer copy with the wing itself as a hole) so the back of the wing stays visible
  const pts = shape.getPoints(12);
  const outer = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x * 1.06, p.y * 1.06)));
  outer.holes.push(new THREE.Path(pts));
  const outline = new THREE.Mesh(new THREE.ShapeGeometry(outer, 12), mat('#222222', { side: THREE.DoubleSide }));
  g.add(outline);
  const spotMat = mat(mix(color, '#ffffff', 0.7), { side: THREE.DoubleSide });
  const dark = mat(mix(color, '#000000', 0.45), { side: THREE.DoubleSide });
  for (const [x, y, r, m] of [[0.62, 0.42, 0.13, spotMat], [0.85, 0.3, 0.07, dark], [0.55, -0.4, 0.09, spotMat], [0.3, 0.3, 0.06, dark]]) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(r, 12), m); spot.position.set(x, y, 0.008); g.add(spot);
    const back = spot.clone(); back.position.z = -0.008; g.add(back);
  }
  if (side < 0) g.scale.x = -1;
  return g;
}

// ---- hand-held items: built in the right hand's frame (+y up when the arm hangs, +z = in front of the palm) ----
const HELD_BUILDERS = {
  needoh() {
    const ball = sphere(0.17, '#7dff5a', { transparent: true, opacity: 0.85, roughness: 0.15, emissive: '#2bff3a', emissiveIntensity: 0.25 }, 16, 12);
    ball.position.set(0, 0.04, 0.24);
    const g = new THREE.Group(); g.add(ball); g.userData.squishable = ball;
    return g;
  },
  balloon() {
    const g = new THREE.Group();
    const top = new THREE.Vector3(0.28, 1.65, 0.22);
    const string = cyl(0.008, 0.008, top.length(), '#ffffff', {}, 4);
    string.position.copy(top).multiplyScalar(0.5);
    string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().normalize());
    string.castShadow = false;
    g.add(string);
    const balloon = sphere(0.26, '#ff3b7a', { roughness: 0.2, metalness: 0.1, emissive: '#ff3b7a', emissiveIntensity: 0.12 }, 16, 12);
    balloon.scale.set(1, 1.15, 1); balloon.position.copy(top).add(new THREE.Vector3(0, 0.26, 0));
    g.add(balloon);
    const knot = cyl(0.02, 0.05, 0.07, '#d81b60'); knot.position.copy(top); g.add(knot);
    const shine = sphere(0.06, '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }, 8, 6); shine.position.copy(balloon.position).add(new THREE.Vector3(-0.1, 0.12, 0.17)); g.add(shine);
    g.userData.sway = true;
    return g;
  },
  wand() {
    const g = new THREE.Group();
    const stick = cyl(0.02, 0.025, 0.5, '#f4e6ff', { roughness: 0.4 }, 6);
    stick.rotation.x = Math.PI / 2; stick.position.set(0, 0.02, 0.3); g.add(stick);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), mat('#f9d71c', { emissive: '#ffe766', emissiveIntensity: 0.9, roughness: 0.3 }));
    star.position.set(0, 0.02, 0.58); star.scale.set(1, 1.3, 0.6); g.add(star);
    g.userData.spin = star;
    return g;
  },
  plushie() {
    const g = new THREE.Group();
    const pink = '#ff8bc4';
    const body = sphere(0.13, pink, { roughness: 1 }); body.scale.set(1.25, 0.95, 1); body.position.set(0, 0.02, 0.26); g.add(body);
    const neck = cyl(0.035, 0.04, 0.3, pink, { roughness: 1 }, 8); neck.position.set(-0.1, 0.17, 0.26); neck.rotation.z = 0.35; g.add(neck);
    const head = sphere(0.07, pink, { roughness: 1 }, 10, 8); head.position.set(-0.17, 0.31, 0.26); g.add(head);
    const beak = cyl(0.0, 0.035, 0.1, '#222222', {}, 6); beak.position.set(-0.25, 0.29, 0.26); beak.rotation.z = Math.PI / 2 + 0.3; g.add(beak);
    for (const s of [-1, 1]) { const eye = sphere(0.014, '#111111', {}, 6, 4); eye.position.set(-0.2, 0.33, 0.26 + s * 0.055); g.add(eye); }
    for (const s of [-1, 1]) { const leg = cyl(0.012, 0.012, 0.22, '#ffb3d9', {}, 5); leg.position.set(0.03 + s * 0.03, -0.14, 0.26 + s * 0.04); g.add(leg); }
    const wing = sphere(0.07, '#ff6fb5', { roughness: 1 }, 8, 6); wing.scale.set(1.3, 0.7, 0.7); wing.position.set(0.02, 0.06, 0.37); g.add(wing);
    return g;
  },
  iceCream() {
    const g = new THREE.Group();
    const cone = cyl(0.09, 0.0, 0.3, '#d9a066', { roughness: 1 }, 10); cone.position.set(0, 0.0, 0.24); g.add(cone);
    const s1 = sphere(0.11, '#ff8fb8'); s1.position.set(0, 0.2, 0.24); g.add(s1);
    const s2 = sphere(0.095, '#fff6e0'); s2.position.set(0.02, 0.36, 0.25); g.add(s2);
    const cherry = sphere(0.03, '#e02040', { emissive: '#e02040', emissiveIntensity: 0.3 }, 8, 6); cherry.position.set(0.02, 0.47, 0.25); g.add(cherry);
    g.userData.edible = true;
    return g;
  },
  cottonCandy() {
    const g = new THREE.Group();
    const stick = cyl(0.015, 0.015, 0.45, '#ffffff', {}, 5); stick.position.set(0, 0.1, 0.22); g.add(stick);
    const fluff = '#ffb6e6';
    for (const [x, y, z, r] of [[0, 0.42, 0.22, 0.2], [0.13, 0.33, 0.25, 0.13], [-0.12, 0.36, 0.2, 0.12], [0.03, 0.56, 0.26, 0.12], [-0.05, 0.47, 0.34, 0.11], [0.06, 0.45, 0.1, 0.11]]) {
      const b = sphere(r, fluff, { roughness: 1 }, 10, 8); b.position.set(x, y, z); g.add(b);
    }
    g.userData.edible = true;
    return g;
  },
  pretzel() {
    const g = new THREE.Group();
    const brown = '#a0522d';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 20), mat(brown, { roughness: 0.9 })); ring.position.set(0, 0.08, 0.24); g.add(ring);
    for (const s of [-1, 1]) { const bar = cyl(0.035, 0.035, 0.24, brown, { roughness: 0.9 }, 6); bar.position.set(0, 0.08, 0.24); bar.rotation.z = s * 0.7; g.add(bar); }
    for (const [x, y] of [[0.08, 0.17], [-0.1, 0.12], [0.11, -0.01], [-0.05, 0.19]]) { const salt = sphere(0.012, '#ffffff', {}, 5, 4); salt.position.set(x, y + 0.08, 0.285); g.add(salt); }
    g.userData.edible = true;
    return g;
  },
  lemonade() {
    const g = new THREE.Group();
    const cup = cyl(0.085, 0.065, 0.26, '#fff176', { transparent: true, opacity: 0.85, roughness: 0.3 }, 12); cup.position.set(0, 0.02, 0.22); g.add(cup);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 16), mat('#ffffff')); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.15, 0.22); g.add(rim);
    const straw = cyl(0.012, 0.012, 0.32, '#ff6fb5', {}, 5); straw.position.set(0.05, 0.25, 0.2); straw.rotation.z = -0.25; g.add(straw);
    const lemon = cyl(0.045, 0.045, 0.015, '#ffe733', {}, 10); lemon.position.set(-0.08, 0.17, 0.22); lemon.rotation.z = 0.4; g.add(lemon);
    g.userData.edible = true;
    return g;
  },
};

const _lerp = THREE.MathUtils.lerp;

// Builds a rig. Root group origin is at the feet. Total height ~2.0 units (2.5 with hats).
// Returns { group, parts, setAnim(state, t, speed), setConfig(partial), config, height, squish(), eat() }
export function buildAvatar(config = {}) {
  const cfg = { ...DEFAULT_AVATAR, ...config };
  const group = new THREE.Group();
  group.name = `avatar:${cfg.name}`;
  const parts = {};
  let anim = { state: 'idle', t: 0 };
  // one-shot effects driven by wall-clock time inside setAnim (no per-frame allocations)
  const fx = { squishStart: -1, eatStart: -1, eatResolve: null };
  const skirted = () => cfg.outfit === 'dress' || cfg.outfit === 'gown';

  function build() {
    while (group.children.length) group.remove(group.children[0]);
    for (const k of Object.keys(parts)) delete parts[k];
    const skin = cfg.skin;
    // Legs (pivot at hip)
    for (const side of ['L', 'R']) {
      const pivot = new THREE.Group();
      pivot.position.set(side === 'L' ? -0.22 : 0.22, HIP_Y, 0);
      // tights under skirts so nothing shows when the camera looks up the skirt; bare legs for swimsuits
      const legColor = cfg.outfit === 'swimsuit' ? skin : skirted() ? mix(cfg.bottomColor, '#ffffff', 0.35) : cfg.bottomColor;
      const leg = box(0.36, LEG_H, 0.36, legColor);
      leg.position.y = -LEG_H / 2;
      pivot.add(leg);
      const shoe = box(0.38, 0.16, 0.42, cfg.shoeColor);
      shoe.position.set(0, -LEG_H + 0.08, 0.03);
      pivot.add(shoe);
      group.add(pivot);
      parts['leg' + side] = pivot;
    }
    // Torso
    const torso = new THREE.Group();
    torso.position.y = HIP_Y;
    const body = box(0.9, TORSO_H, 0.5, cfg.topColor);
    body.position.y = TORSO_H / 2;
    torso.add(body);
    if (skirted()) {
      // Standing skirt: closed cone from the hips. dress: to just below the knee; gown: to the floor.
      const gown = cfg.outfit === 'gown';
      const skirtH = gown ? 0.9 : 0.55;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.52, gown ? 0.95 : 0.78, skirtH, 14, 1, false), mat(cfg.bottomColor, { side: THREE.DoubleSide }));
      skirt.position.y = -skirtH / 2 + SKIRT_TOP;
      skirt.castShadow = true;
      torso.add(skirt);
      parts.skirtStand = skirt;
      // Seated skirt (shown instead of the cone while sitting / driving): a lap panel over the thighs plus a drape
      // hanging from the knees, so the legs never poke through the gown.
      const seat = new THREE.Group();
      const lap = box(1.0, 0.1, 0.74, cfg.bottomColor); lap.position.set(0, 0.41, 0.6); seat.add(lap);
      // half-cone wrapping the knees, flaring down to the hem (gown: to the floor; dress: to the shins)
      const drapeH = gown ? 0.82 : 0.4;
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.5, gown ? 0.78 : 0.6, drapeH, 10, 1, true, -Math.PI / 2, Math.PI), mat(cfg.bottomColor, { side: THREE.DoubleSide }));
      drape.position.set(0, 0.41 - drapeH / 2, 0.52); drape.castShadow = true; seat.add(drape);
      for (const s of [-1, 1]) { const side = box(0.06, 0.34, 0.5, cfg.bottomColor); side.position.set(s * 0.48, 0.25, 0.3); seat.add(side); }
      seat.visible = false;
      torso.add(seat);
      parts.skirtSit = seat;
      const belt = box(0.94, 0.12, 0.54, cfg.accessoryColor);
      belt.position.y = 0.06;
      torso.add(belt);
    }
    if (cfg.outfit === 'armor') {
      for (const s of [-1, 1]) {
        const pad = box(0.36, 0.22, 0.5, '#b8c0cc', { metalness: 0.6, roughness: 0.35 });
        pad.position.set(s * 0.61, TORSO_H - 0.04, 0);
        torso.add(pad);
      }
      const plate = box(0.6, 0.5, 0.08, '#d6dde6', { metalness: 0.7, roughness: 0.3 });
      plate.position.set(0, TORSO_H / 2, 0.28);
      torso.add(plate);
    }
    if (cfg.outfit === 'swimsuit') {
      // one-piece: body already uses topColor; add a frilly skirt hem and a little bow
      const frill = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.18, 12, 1, false), mat(cfg.bottomColor, { side: THREE.DoubleSide }));
      frill.position.y = 0.04; torso.add(frill);
      const bow = box(0.22, 0.12, 0.08, cfg.bottomColor); bow.position.set(0, TORSO_H - 0.12, 0.28); torso.add(bow);
      const strapL = box(0.12, 0.3, 0.1, cfg.topColor); strapL.position.set(-0.25, TORSO_H + 0.05, 0); torso.add(strapL);
      const strapR = box(0.12, 0.3, 0.1, cfg.topColor); strapR.position.set(0.25, TORSO_H + 0.05, 0); torso.add(strapR);
    }
    if (cfg.outfit === 'hoodie') {
      // hood sits on the shoulders below the head, clear of long hair
      const hood = box(0.7, 0.22, 0.42, cfg.topColor);
      hood.position.set(0, TORSO_H - 0.09, -0.1);
      torso.add(hood);
      const pocket = box(0.5, 0.22, 0.06, cfg.bottomColor);
      pocket.position.set(0, 0.25, 0.27);
      torso.add(pocket);
    }
    group.add(torso);
    parts.torso = torso;
    // Arms (pivot at shoulder)
    for (const side of ['L', 'R']) {
      const pivot = new THREE.Group();
      pivot.position.set(side === 'L' ? -0.63 : 0.63, TORSO_H - 0.05, 0);
      const sleeve = box(0.34, 0.35, 0.34, cfg.outfit === 'swimsuit' ? skin : cfg.topColor);
      sleeve.position.y = -0.17;
      pivot.add(sleeve);
      const arm = box(0.32, ARM_H - 0.35, 0.32, skin);
      arm.position.y = -0.35 - (ARM_H - 0.35) / 2;
      pivot.add(arm);
      torso.add(pivot);
      parts['arm' + side] = pivot;
    }
    // Right hand anchor: held items live here so they follow arm swings
    const hand = new THREE.Group();
    hand.position.set(0, HAND_Y, 0);
    parts.armR.add(hand);
    parts.hand = hand;
    // Head
    const head = new THREE.Group();
    head.position.y = TORSO_H + 0.05;
    const skull = box(0.8, 0.8, 0.8, skin);
    skull.position.y = 0.4;
    head.add(skull);
    // Face
    const eyeMat = mat('#111111');
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), eyeMat);
      eye.position.set(s * 0.18, 0.48, 0.41);
      head.add(eye);
      const shine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), mat('#ffffff'));
      shine.position.set(s * 0.18 + 0.02, 0.52, 0.44);
      head.add(shine);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), mat('#8b2a2a'));
    smile.rotation.z = Math.PI; smile.position.set(0, 0.3, 0.41);
    head.add(smile);
    for (const s of [-1, 1]) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), mat('#ff9aa2'));
      blush.position.set(s * 0.3, 0.33, 0.405);
      head.add(blush);
    }
    buildHair(head, cfg);
    buildAccessory(head, torso, cfg);
    torso.add(head);
    parts.head = head;
    parts.height = LEG_H + TORSO_H + 0.85;
    buildHeld();
  }

  function buildHair(head, cfg) {
    const c = cfg.hairColor;
    const s = cfg.hairStyle;
    if (s === 'none') return;
    const hat = cfg.accessory === 'wizardHat';
    const top = box(0.86, 0.22, 0.86, c);
    top.position.y = 0.76;
    head.add(top);
    const back = box(0.86, 0.5, 0.2, c);
    back.position.set(0, 0.52, -0.36);
    head.add(back);
    const fringe = box(0.86, 0.14, 0.12, c);
    fringe.position.set(0, 0.72, 0.4);
    head.add(fringe);
    if (s === 'long' || s === 'bob' || s === 'curly') {
      const len = s === 'bob' ? 0.5 : 0.95;
      // side strands are slim and end at the shoulder line so swinging / raised arms don't cut through them
      const sideLen = Math.min(len, 0.85);
      for (const side of [-1, 1]) {
        const strand = box(0.12, sideLen, 0.66, c);
        strand.position.set(side * 0.45, 0.8 - sideLen / 2, -0.1);
        head.add(strand);
      }
      const backLong = box(0.86, len, 0.18, c);
      backLong.position.set(0, 0.8 - len / 2, -0.44);
      head.add(backLong);
    }
    if (s === 'curly') {
      for (let i = 0; i < 10; i++) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(c));
        const a = (i / 10) * Math.PI * 2;
        curl.position.set(Math.cos(a) * 0.46, 0.8 + Math.sin(i) * 0.06, Math.sin(a) * 0.46);
        head.add(curl);
      }
    }
    if (s === 'ponytail') {
      const tail = box(0.22, 0.8, 0.22, c);
      tail.position.set(0, 0.35, -0.55);
      tail.rotation.x = 0.25;
      head.add(tail);
      const tie = box(0.26, 0.1, 0.26, cfg.accessoryColor);
      tie.position.set(0, 0.68, -0.5);
      head.add(tie);
    }
    if (s === 'bun' && !hat) { // a wizard hat covers the bun
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(c));
      bun.position.set(0, 0.95, -0.15);
      head.add(bun);
    }
  }

  function buildAccessory(head, torso, cfg) {
    const a = cfg.accessory;
    const gold = mat(cfg.accessoryColor, { metalness: 0.7, roughness: 0.3 });
    // hats sit on top of the hair: lifted over the tall curls, lower on a bare head
    const lift = cfg.hairStyle === 'curly' ? 0.1 : cfg.hairStyle === 'none' ? -0.06 : 0;
    if (a === 'crown') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 8, 1, true), gold);
      base.position.y = 0.98 + lift; head.add(base);
      for (let i = 0; i < 8; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), gold);
        const ang = (i / 8) * Math.PI * 2;
        spike.position.set(Math.cos(ang) * 0.4, 1.15 + lift, Math.sin(ang) * 0.4);
        head.add(spike);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mat('#e74c3c', { emissive: '#e74c3c', emissiveIntensity: 0.4 }));
      gem.position.set(0, 1.01 + lift, 0.42); head.add(gem);
    }
    if (a === 'tiara') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20, Math.PI), gold);
      band.position.set(0, 0.9 + lift, 0); band.rotation.x = Math.PI / 2;
      head.add(band);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), mat('#5bb0ff', { emissive: '#5bb0ff', emissiveIntensity: 0.5 }));
      gem.position.set(0, 1.0 + lift, 0.36); head.add(gem);
    }
    if (a === 'wings') {
      // small harness block between the shoulder blades so the hinge doesn't float
      const strap = box(0.16, 0.34, 0.16, mix(cfg.accessoryColor, '#000000', 0.35));
      strap.position.set(0, WING_HINGE.y, -0.3);
      torso.add(strap);
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(WING_HINGE.x, WING_HINGE.y, WING_HINGE.z);
        hinge.rotation.set(WING_HINGE.tilt, s * WING_MID, 0); // Euler XYZ: yaw (flap) first, then the backward tilt
        hinge.add(buildButterflyWing(cfg.accessoryColor, s));
        torso.add(hinge);
        parts['wing' + (s < 0 ? 'L' : 'R')] = hinge;
      }
    }
    if (a === 'cape') {
      // hinged at the shoulders; swings backwards only. Over a skirt it is a capelet ending above the skirt
      // (a full-length cape would hang inside the cone), otherwise it reaches mid-thigh.
      const len = skirted() ? 0.7 : 1.15;
      const pivot = new THREE.Group();
      pivot.position.set(0, TORSO_H - 0.03, -0.28);
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.88, len), mat(cfg.accessoryColor, { side: THREE.DoubleSide }));
      cape.position.y = -len / 2; cape.castShadow = true;
      pivot.add(cape);
      const collar = box(0.9, 0.1, 0.1, mix(cfg.accessoryColor, '#000000', 0.3));
      collar.position.set(0, -0.02, 0.02); pivot.add(collar);
      torso.add(pivot);
      parts.cape = pivot;
    }
    if (a === 'wizardHat') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 12), mat(cfg.accessoryColor));
      brim.position.y = 0.9 + lift; head.add(brim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 12), mat(cfg.accessoryColor));
      cone.position.y = 1.35 + lift; head.add(cone);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), mat('#f9d71c', { emissive: '#f9d71c', emissiveIntensity: 0.6 }));
      star.position.set(0.15, 1.22 + lift, 0.3); head.add(star);
    }
    if (a === 'bunnyEars' || a === 'catEars') {
      for (const s of [-1, 1]) {
        const ear = a === 'bunnyEars'
          ? new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), mat(cfg.accessoryColor))
          : new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), mat(cfg.accessoryColor));
        ear.position.set(s * 0.22, (a === 'bunnyEars' ? 1.2 : 0.98) + lift, 0);
        ear.rotation.z = s * -0.15;
        head.add(ear);
      }
    }
    if (a === 'sunglasses') {
      const frame = box(0.72, 0.17, 0.06, '#111111', { roughness: 0.3 });
      frame.position.set(0, 0.48, 0.44); head.add(frame);
    }
    if (a === 'halo') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 24), mat('#f9d71c', { emissive: '#f9d71c', emissiveIntensity: 0.9 }));
      halo.rotation.x = Math.PI / 2; halo.position.y = 1.15 + lift;
      head.add(halo);
      parts.halo = halo;
    }
  }

  // (Re)builds only the hand-held item.
  function buildHeld() {
    const hand = parts.hand;
    if (!hand) return;
    while (hand.children.length) {
      const c = hand.children[0]; hand.remove(c);
      c.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    }
    parts.held = null;
    const builder = HELD_BUILDERS[cfg.held];
    if (!builder) { cfg.held = 'none'; return; }
    const item = builder();
    item.userData.base = cfg.held === 'balloon' ? 1 : 1.25;
    item.scale.setScalar(item.userData.base);
    hand.add(item);
    parts.held = item;
  }

  // state: 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'wave' | 'drive'
  function setAnim(state, t, speed = 1) {
    anim.state = state; anim.t = t;
    const { legL, legR, armL, armR, torso, head } = parts;
    const swing = Math.sin(t * 8 * speed);
    for (const p of [legL, legR, armL, armR]) p.rotation.set(0, 0, 0);
    legL.position.y = legR.position.y = HIP_Y;
    torso.position.y = HIP_Y; torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    // arms hang slightly outward so hands never sink into the hips, skirt rim or swimsuit frill
    const splay = skirted() ? 0.12 : 0.08;
    armL.rotation.z = splay; armR.rotation.z = -splay;
    const seated = state === 'sit' || state === 'drive';
    // skirts: legs swing less so knees stay inside the cone; seated skirt replaces the cone while sitting
    const legAmp = cfg.outfit === 'gown' ? (state === 'run' ? 0.6 : 0.45) : cfg.outfit === 'dress' ? (state === 'run' ? 0.65 : 0.5) : (state === 'run' ? 1.1 : 0.7);
    if (state === 'idle') {
      torso.position.y = HIP_Y + Math.sin(t * 2) * 0.02;
      head.rotation.y = Math.sin(t * 0.7) * 0.15;
    } else if (state === 'walk' || state === 'run') {
      const amp = state === 'run' ? 1.1 : 0.7;
      legL.rotation.x = swing * legAmp; legR.rotation.x = -swing * legAmp;
      armL.rotation.x = -swing * amp; armR.rotation.x = swing * amp;
      torso.position.y = HIP_Y + Math.abs(Math.cos(t * 8 * speed)) * 0.06;
      if (state === 'run') torso.rotation.x = 0.15;
    } else if (state === 'jump') {
      legL.rotation.x = -0.5; legR.rotation.x = 0.4;
      // arms up in a V (outward), clear of head, hair and hats
      armL.rotation.z = -2.6; armR.rotation.z = 2.6;
    } else if (state === 'sit') {
      // thighs rest on the seat (torso bottom), legs straight forward
      torso.position.y = SEAT_TORSO_Y;
      legL.position.y = legR.position.y = SEAT_TORSO_Y + 0.18;
      legL.rotation.x = -Math.PI / 2; legR.rotation.x = -Math.PI / 2;
      armL.rotation.x = -0.9; armR.rotation.x = -0.9;
    } else if (state === 'drive') {
      torso.position.y = DRIVE_TORSO_Y; torso.rotation.x = 0.35;
      legL.position.y = legR.position.y = DRIVE_TORSO_Y + 0.18;
      legL.rotation.x = -1.2; legR.rotation.x = -1.2;
      armL.rotation.x = -1.4; armR.rotation.x = -1.4;
      armL.rotation.z = 0.12; armR.rotation.z = -0.12; // hands in toward the handlebars, sleeves clear of the chest
    } else if (state === 'wave') {
      // right arm raised beside the head (outward), hand wagging
      armR.rotation.z = 2.75 + Math.sin(t * 10) * 0.25;
      torso.position.y = HIP_Y + Math.sin(t * 2) * 0.02;
    }
    if (parts.skirtStand) {
      parts.skirtStand.visible = !seated; parts.skirtSit.visible = seated;
      parts.skirtStand.rotation.x = -torso.rotation.x; // the cone stays vertical while the body leans into a run
    }
    if (parts.cape) {
      // positive x-rotation swings the hem backwards (points below the pivot move to -z). Seated: drape straight down behind.
      const back = state === 'walk' || state === 'run' ? 0.38 : state === 'jump' ? 0.5 : seated ? 0.05 : 0.12;
      parts.cape.rotation.x = back + Math.sin(t * 3) * 0.04 + 0.04;
    }
    if (parts.wingL) {
      // flap = yaw about the tilted spine hinge, always within [WING_MIN, WING_MAX] (sweeping backwards)
      const f = state === 'walk' || state === 'run' || state === 'jump' ? 0.18 : 0.14;
      const base = state === 'jump' ? WING_MIN + 0.18 : WING_MID;
      const a = THREE.MathUtils.clamp(base + Math.sin(t * 7) * f, WING_MIN, WING_MAX);
      parts.wingL.rotation.y = -a; parts.wingR.rotation.y = a;
    }
    if (parts.halo) parts.halo.position.y = 1.15 + Math.sin(t * 3) * 0.04;
    const held = parts.held;
    if (held) {
      const ud = held.userData;
      held.scale.setScalar(ud.base);
      if (ud.sway) { held.rotation.z = Math.sin(t * 1.3) * 0.1 - 0.05; held.rotation.x = Math.sin(t * 0.9) * 0.08; }
      if (ud.spin) ud.spin.rotation.y = t * 3;
      const sq = ud.squishable;
      if (sq) {
        let s = 0;
        if (fx.squishStart >= 0) {
          const p = (performance.now() - fx.squishStart) / 400;
          if (p >= 1) fx.squishStart = -1; else s = Math.sin(p * Math.PI);
        }
        sq.scale.set(1 + s * 0.4, 1 - s * 0.45, 1 + s * 0.4);
      }
    }
    if (fx.eatStart >= 0) {
      const p = (performance.now() - fx.eatStart) / 600;
      if (p >= 1) finishEat();
      else {
        // hand to the mouth (arm up and inward), head tilts down, the item shrinks away mid-bite
        const k = p < 0.25 ? p / 0.25 : p > 0.75 ? (1 - p) / 0.25 : 1;
        armR.rotation.x = _lerp(armR.rotation.x, -2.1, k);
        armR.rotation.z = _lerp(armR.rotation.z, -0.35, k);
        head.rotation.x = 0.22 * k;
        if (held) held.scale.setScalar(held.userData.base * (p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.4)));
      }
    }
  }

  function finishEat() {
    fx.eatStart = -1;
    const r = fx.eatResolve; fx.eatResolve = null;
    if (parts.held) parts.held.scale.setScalar(parts.held.userData.base);
    r?.();
  }

  // Needoh squish: quick squash-and-stretch (~0.4 s). Resolves when done.
  function squish() {
    fx.squishStart = performance.now();
    return new Promise((resolve) => setTimeout(resolve, 420));
  }
  // Bite: brings the right hand to the mouth for ~0.6 s while the item shrinks away. The caller then clears `held`.
  function eat() {
    if (fx.eatResolve) finishEat();
    fx.eatStart = performance.now();
    return new Promise((resolve) => {
      fx.eatResolve = resolve;
      setTimeout(() => { if (fx.eatResolve === resolve) finishEat(); }, 700); // safety if setAnim stops being called
    });
  }

  function setConfig(next) {
    const keys = Object.keys(next || {});
    const onlyHeld = keys.length > 0 && keys.every((k) => k === 'held');
    Object.assign(cfg, next);
    if (!HELD_ITEMS.includes(cfg.held)) cfg.held = 'none';
    if (onlyHeld) buildHeld(); else build();
    setAnim(anim.state, anim.t);
  }

  if (!HELD_ITEMS.includes(cfg.held)) cfg.held = 'none';
  build();
  setAnim('idle', 0);
  return { group, parts, setAnim, setConfig, squish, eat, config: cfg, get height() { return parts.height; } };
}

export function loadAvatarConfig() {
  try { const raw = localStorage.getItem('pk:avatar'); if (raw) return { ...DEFAULT_AVATAR, ...JSON.parse(raw) }; } catch {}
  return null;
}
export function saveAvatarConfig(cfg) {
  try { localStorage.setItem('pk:avatar', JSON.stringify(cfg)); } catch {}
}

// Debug hook for the headless screenshot harness (tools/screenshot.mjs --eval): lets a page script build avatars without imports.
if (typeof window !== 'undefined') { window.__buildAvatar = buildAvatar; window.__THREE = THREE; }
