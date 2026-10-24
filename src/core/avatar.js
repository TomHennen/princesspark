// Blocky Roblox-style avatar builder. Used by the player, NPCs, and the avatar creator preview.
import * as THREE from 'three';

export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bun', 'curly', 'bob', 'none'];
export const OUTFITS = ['casual', 'dress', 'gown', 'armor', 'hoodie', 'swimsuit'];
export const ACCESSORIES = ['none', 'crown', 'tiara', 'wings', 'cape', 'wizardHat', 'bunnyEars', 'sunglasses', 'halo', 'catEars'];
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
};

// blend two hex colors (0..1 toward b)
function mix(a, b, t) { const ca = new THREE.Color(a), cb = new THREE.Color(b); return '#' + ca.lerp(cb, t).getHexString(); }

// Butterfly wing: a big upper lobe and a smaller lower lobe drawn as a Shape, with spots. Origin at the body side; the shape extends outward along +X (mirrored for side -1).
function buildButterflyWing(color, side) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.1);
  shape.bezierCurveTo(0.35, 0.75, 1.05, 0.95, 1.1, 0.45);   // upper lobe outer edge
  shape.bezierCurveTo(1.12, 0.15, 0.75, 0.0, 0.5, 0.02);
  shape.bezierCurveTo(0.95, -0.2, 0.95, -0.75, 0.55, -0.72); // lower lobe
  shape.bezierCurveTo(0.3, -0.7, 0.1, -0.45, 0, -0.2);
  shape.closePath();
  const wingMat = mat(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: color, emissiveIntensity: 0.15 });
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), wingMat);
  g.add(wing);
  const outline = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), mat('#222222', { side: THREE.DoubleSide }));
  outline.scale.set(1.06, 1.06, 1); outline.position.z = -0.012; outline.position.x = -0.02; g.add(outline);
  const spotMat = mat(mix(color, '#ffffff', 0.7), { side: THREE.DoubleSide });
  const dark = mat(mix(color, '#000000', 0.45), { side: THREE.DoubleSide });
  for (const [x, y, r, m] of [[0.62, 0.42, 0.13, spotMat], [0.85, 0.3, 0.07, dark], [0.55, -0.4, 0.09, spotMat], [0.3, 0.3, 0.06, dark]]) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(r, 12), m); spot.position.set(x, y, 0.012); g.add(spot);
    const back = spot.clone(); back.position.z = -0.024; g.add(back);
  }
  if (side < 0) g.scale.x = -1;
  return g;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...extra });
const box = (w, h, d, color, extra) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

// Builds a rig. Root group origin is at the feet. Total height ~2.0 units.
// Returns { group, parts, setAnim(state, t, speed), setConfig(cfg), config }
export function buildAvatar(config = {}) {
  const cfg = { ...DEFAULT_AVATAR, ...config };
  const group = new THREE.Group();
  group.name = `avatar:${cfg.name}`;
  const parts = {};
  let anim = { state: 'idle', t: 0 };

  function build() {
    while (group.children.length) group.remove(group.children[0]);
    const skin = cfg.skin;
    // Legs (pivot at hip)
    const legH = 0.8;
    for (const side of ['L', 'R']) {
      const pivot = new THREE.Group();
      pivot.position.set(side === 'L' ? -0.22 : 0.22, legH, 0);
      const skirted = cfg.outfit === 'dress' || cfg.outfit === 'gown';
      // tights under skirts so nothing shows when the camera looks up the skirt; bare legs for swimsuits
      const legColor = cfg.outfit === 'swimsuit' ? skin : skirted ? mix(cfg.bottomColor, '#ffffff', 0.35) : cfg.bottomColor;
      const leg = box(0.36, legH, 0.36, legColor);
      leg.position.y = -legH / 2;
      pivot.add(leg);
      const shoe = box(0.38, 0.16, 0.42, cfg.shoeColor);
      shoe.position.set(0, -legH + 0.08, 0.03);
      pivot.add(shoe);
      group.add(pivot);
      parts['leg' + side] = pivot;
    }
    // Torso
    const torsoH = 0.85;
    const torso = new THREE.Group();
    torso.position.y = legH;
    const body = box(0.9, torsoH, 0.5, cfg.topColor);
    body.position.y = torsoH / 2;
    torso.add(body);
    if (cfg.outfit === 'dress' || cfg.outfit === 'gown') {
      // dress: to just below the knee; gown: to the floor. Closed cone (no open bottom) so nothing shows from below.
      const skirtH = cfg.outfit === 'gown' ? 0.9 : 0.62;
      // hip-hugging at the top (radius 0.52 wraps the torso) flaring to the hem
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.52, cfg.outfit === 'gown' ? 0.95 : 0.72, skirtH, 12, 1, false), mat(cfg.bottomColor, { side: THREE.DoubleSide }));
      skirt.position.y = -skirtH / 2 + 0.12;
      skirt.castShadow = true;
      torso.add(skirt);
      const belt = box(0.94, 0.12, 0.54, cfg.accessoryColor);
      belt.position.y = 0.06;
      torso.add(belt);
    }
    if (cfg.outfit === 'armor') {
      for (const s of [-1, 1]) {
        const pad = box(0.34, 0.22, 0.5, '#b8c0cc', { metalness: 0.6, roughness: 0.35 });
        pad.position.set(s * 0.6, torsoH - 0.08, 0);
        torso.add(pad);
      }
      const plate = box(0.6, 0.5, 0.08, '#d6dde6', { metalness: 0.7, roughness: 0.3 });
      plate.position.set(0, torsoH / 2, 0.28);
      torso.add(plate);
    }
    if (cfg.outfit === 'swimsuit') {
      // one-piece: body already uses topColor; add a frilly skirt hem and a little bow
      const frill = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.18, 12, 1, false), mat(cfg.bottomColor, { side: THREE.DoubleSide }));
      frill.position.y = 0.04; torso.add(frill);
      const bow = box(0.22, 0.12, 0.08, cfg.bottomColor); bow.position.set(0, torsoH - 0.12, 0.28); torso.add(bow);
      const strapL = box(0.12, 0.3, 0.1, cfg.topColor); strapL.position.set(-0.25, torsoH + 0.05, 0); torso.add(strapL);
      const strapR = box(0.12, 0.3, 0.1, cfg.topColor); strapR.position.set(0.25, torsoH + 0.05, 0); torso.add(strapR);
    }
    if (cfg.outfit === 'hoodie') {
      const hood = box(0.7, 0.25, 0.45, cfg.topColor);
      hood.position.set(0, torsoH - 0.02, -0.15);
      torso.add(hood);
      const pocket = box(0.5, 0.22, 0.06, cfg.bottomColor);
      pocket.position.set(0, 0.25, 0.27);
      torso.add(pocket);
    }
    group.add(torso);
    parts.torso = torso;
    // Arms (pivot at shoulder)
    const armH = 0.8;
    for (const side of ['L', 'R']) {
      const pivot = new THREE.Group();
      pivot.position.set(side === 'L' ? -0.63 : 0.63, torsoH - 0.05, 0);
      const sleeve = box(0.34, 0.35, 0.34, cfg.outfit === 'swimsuit' ? skin : cfg.topColor);
      sleeve.position.y = -0.17;
      pivot.add(sleeve);
      const arm = box(0.32, armH - 0.35, 0.32, skin);
      arm.position.y = -0.35 - (armH - 0.35) / 2;
      pivot.add(arm);
      torso.add(pivot);
      parts['arm' + side] = pivot;
    }
    // Head
    const head = new THREE.Group();
    head.position.y = torsoH + 0.05;
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
    parts.height = legH + torsoH + 0.85;
  }

  function buildHair(head, cfg) {
    const c = cfg.hairColor;
    const s = cfg.hairStyle;
    if (s === 'none') return;
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
      for (const side of [-1, 1]) {
        const strand = box(0.18, len, 0.7, c);
        strand.position.set(side * 0.46, 0.8 - len / 2, -0.08);
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
    if (s === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(c));
      bun.position.set(0, 0.95, -0.15);
      head.add(bun);
    }
  }

  function buildAccessory(head, torso, cfg) {
    const a = cfg.accessory;
    const gold = mat(cfg.accessoryColor, { metalness: 0.7, roughness: 0.3 });
    if (a === 'crown') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 8, 1, true), gold);
      base.position.y = 0.95; head.add(base);
      for (let i = 0; i < 8; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), gold);
        const ang = (i / 8) * Math.PI * 2;
        spike.position.set(Math.cos(ang) * 0.4, 1.12, Math.sin(ang) * 0.4);
        head.add(spike);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mat('#e74c3c', { emissive: '#e74c3c', emissiveIntensity: 0.4 }));
      gem.position.set(0, 0.98, 0.42); head.add(gem);
    }
    if (a === 'tiara') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20, Math.PI), gold);
      band.position.set(0, 0.86, 0); band.rotation.x = Math.PI / 2; band.rotation.z = 0;
      head.add(band);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), mat('#5bb0ff', { emissive: '#5bb0ff', emissiveIntensity: 0.5 }));
      gem.position.set(0, 0.98, 0.36); head.add(gem);
    }
    if (a === 'wings') {
      for (const s of [-1, 1]) {
        const wing = buildButterflyWing(cfg.accessoryColor, s);
        wing.position.set(s * 0.12, 0.55, -0.32);
        wing.rotation.y = s * 0.45;
        torso.add(wing);
        parts['wing' + (s < 0 ? 'L' : 'R')] = wing;
      }
    }
    if (a === 'cape') {
      // hangs from the shoulders to mid-thigh
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.1), mat(cfg.accessoryColor, { side: THREE.DoubleSide }));
      cape.position.set(0, 0.32, -0.3);
      torso.add(cape);
      parts.cape = cape;
    }
    if (a === 'wizardHat') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 12), mat(cfg.accessoryColor));
      brim.position.y = 0.88; head.add(brim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 12), mat(cfg.accessoryColor));
      cone.position.y = 1.33; head.add(cone);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), mat('#f9d71c', { emissive: '#f9d71c', emissiveIntensity: 0.6 }));
      star.position.set(0.15, 1.2, 0.3); head.add(star);
    }
    if (a === 'bunnyEars' || a === 'catEars') {
      for (const s of [-1, 1]) {
        const ear = a === 'bunnyEars'
          ? new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), mat(cfg.accessoryColor))
          : new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), mat(cfg.accessoryColor));
        ear.position.set(s * 0.22, a === 'bunnyEars' ? 1.2 : 0.98, 0);
        ear.rotation.z = s * -0.15;
        head.add(ear);
      }
    }
    if (a === 'sunglasses') {
      const frame = box(0.7, 0.16, 0.06, '#111111', { roughness: 0.3 });
      frame.position.set(0, 0.48, 0.43); head.add(frame);
    }
    if (a === 'halo') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 24), mat('#f9d71c', { emissive: '#f9d71c', emissiveIntensity: 0.9 }));
      halo.rotation.x = Math.PI / 2; halo.position.y = 1.15;
      head.add(halo);
      parts.halo = halo;
    }
  }

  // state: 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'wave' | 'drive'
  function setAnim(state, t, speed = 1) {
    anim.state = state; anim.t = t;
    const { legL, legR, armL, armR, torso, head } = parts;
    const swing = Math.sin(t * 8 * speed);
    const reset = () => { for (const p of [legL, legR, armL, armR]) p.rotation.set(0, 0, 0); torso.position.y = 0.8; torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); };
    reset();
    if (state === 'idle') {
      torso.position.y = 0.8 + Math.sin(t * 2) * 0.02;
      armL.rotation.z = 0.08; armR.rotation.z = -0.08;
      head.rotation.y = Math.sin(t * 0.7) * 0.15;
    } else if (state === 'walk' || state === 'run') {
      const amp = state === 'run' ? 1.1 : 0.7;
      legL.rotation.x = swing * amp; legR.rotation.x = -swing * amp;
      armL.rotation.x = -swing * amp; armR.rotation.x = swing * amp;
      torso.position.y = 0.8 + Math.abs(Math.cos(t * 8 * speed)) * 0.06;
      if (state === 'run') torso.rotation.x = 0.15;
    } else if (state === 'jump') {
      legL.rotation.x = -0.5; legR.rotation.x = 0.4;
      armL.rotation.z = 2.6; armR.rotation.z = -2.6;
    } else if (state === 'sit') {
      legL.rotation.x = -Math.PI / 2; legR.rotation.x = -Math.PI / 2;
      armL.rotation.x = -0.9; armR.rotation.x = -0.9;
      torso.position.y = 0.45;
    } else if (state === 'drive') {
      legL.rotation.x = -1.2; legR.rotation.x = -1.2;
      armL.rotation.x = -1.4; armR.rotation.x = -1.4;
      armL.rotation.z = 0.3; armR.rotation.z = -0.3;
      torso.position.y = 0.55; torso.rotation.x = 0.35;
    } else if (state === 'wave') {
      armR.rotation.z = -2.8 + Math.sin(t * 10) * 0.3;
      armL.rotation.z = 0.08;
      torso.position.y = 0.8 + Math.sin(t * 2) * 0.02;
    }
    if (parts.cape) parts.cape.rotation.x = 0.15 + (state === 'walk' || state === 'run' ? 0.35 : 0) + Math.sin(t * 3) * 0.05;
    if (parts.wingL) { const f = (anim.state === 'walk' || anim.state === 'run') ? 0.45 : 0.25; parts.wingL.rotation.y = 0.45 + Math.sin(t * 7) * f; parts.wingR.rotation.y = -0.45 - Math.sin(t * 7) * f; }
    if (parts.halo) parts.halo.position.y = 1.15 + Math.sin(t * 3) * 0.04;
  }

  function setConfig(next) { Object.assign(cfg, next); build(); setAnim(anim.state, anim.t); }

  build();
  setAnim('idle', 0);
  return { group, parts, setAnim, setConfig, config: cfg, get height() { return parts.height; } };
}

export function loadAvatarConfig() {
  try { const raw = localStorage.getItem('pk:avatar'); if (raw) return { ...DEFAULT_AVATAR, ...JSON.parse(raw) }; } catch {}
  return null;
}
export function saveAvatarConfig(cfg) {
  try { localStorage.setItem('pk:avatar', JSON.stringify(cfg)); } catch {}
}
