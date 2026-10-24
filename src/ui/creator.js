// "Dressing Room": full-screen avatar creator with a live Three.js preview. Resolves with the final config.
import * as THREE from 'three';
import { buildAvatar, DEFAULT_AVATAR, HAIR_STYLES, OUTFITS, ACCESSORIES, SKIN_TONES, HAIR_COLORS, PALETTE } from '../core/avatar.js';
import { applySettings, sanitizeName as sanitizeSettingName } from '../core/settings.js';

const BASE_ACCESSORIES = ['none', 'tiara', 'bunnyEars'];
const HAIR_LABELS = { short: 'Short', long: 'Long', ponytail: 'Ponytail', bun: 'Bun', curly: 'Curly', bob: 'Bob', none: 'None' };
const OUTFIT_LABELS = { casual: ['👕', 'Casual'], dress: ['👗', 'Dress'], gown: ['👸', 'Gown'], armor: ['🛡️', 'Armor'], hoodie: ['🧥', 'Hoodie'] };
const ACC_LABELS = {
  none: ['🚫', 'None'], crown: ['👑', 'Crown'], tiara: ['💎', 'Tiara'], wings: ['🦋', 'Wings'], cape: ['🧣', 'Cape'],
  wizardHat: ['🧙', 'Wizard Hat'], bunnyEars: ['🐰', 'Bunny Ears'], sunglasses: ['🕶️', 'Shades'], halo: ['😇', 'Halo'], catEars: ['🐱', 'Cat Ears'],
};
// "Princess N style" presets: built from the player's chosen princess colours (core/settings.js), never hardcoded names.
export function princessPreset(i, princesses) {
  const color = princesses?.[i]?.color || PALETTE[i];
  return i === 0
    ? { hairStyle: 'long', hairColor: '#5a3825', outfit: 'gown', topColor: color, bottomColor: color, shoeColor: '#f9d71c', accessory: 'tiara', accessoryColor: '#f9d71c', skin: SKIN_TONES[1] }
    : { hairStyle: 'ponytail', hairColor: '#5a3825', outfit: 'dress', topColor: color, bottomColor: lighten(color), shoeColor: '#ffffff', accessory: 'bunnyEars', accessoryColor: '#ff6fb5', skin: SKIN_TONES[1] };
}
const hexRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lighten = (hex) => '#' + hexRGB(hex).map((c) => Math.round(c + (255 - c) * 0.35).toString(16).padStart(2, '0')).join('');
const isDark = (hex) => { const [r, g, b] = hexRGB(hex); return (r * 299 + g * 587 + b * 114) / 1000 < 150; };

export function getUnlockedAccessories(game) {
  const set = new Set(BASE_ACCESSORIES);
  try {
    const raw = localStorage.getItem('pk:save');
    if (raw) for (const a of JSON.parse(raw)?.unlockedAccessories || []) set.add(a);
  } catch {}
  for (const a of game?.quests?.unlockedAccessories || []) set.add(a);
  return set;
}

const sanitizeName = (s) => String(s || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s{2,}/g, ' ').slice(0, 16);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function showAvatarCreator(game, config, { inGame = false } = {}) {
  const cfg = { ...DEFAULT_AVATAR, ...config };
  // kingdom settings edited alongside the avatar; committed with applySettings() on Play / Done
  const kingdom = JSON.parse(JSON.stringify(game?.settings || { parkName: '', princesses: [] }));
  const firstRun = !inGame && !game?.settings?.setupDone;
  const unlocked = getUnlockedAccessories(game);
  if (!unlocked.has(cfg.accessory)) cfg.accessory = 'none';
  const click = () => game?.audio?.play('click');
  const root = document.getElementById('ui-root');

  const wrap = el('div', 'hk-creator');
  wrap.innerHTML = `
    <div class="hk-preview">
      <canvas></canvas>
      <h1 class="hk-preview-title">Dressing Room<small>✨ make it yours ✨</small></h1>
      <div class="hk-preview-name"></div>
      <div class="hk-preview-hint">drag to spin</div>
    </div>
    <div class="hk-panel"><div class="hk-panel-card">
      <div class="hk-tabs"></div>
      <div class="hk-pages"></div>
      <div class="hk-presets">
        <button class="hk-btn" data-preset="0">👑 Princess 1 style</button>
        <button class="hk-btn" data-preset="1">🐰 Princess 2 style</button>
        <button class="hk-btn" data-random>🎲 Random</button>
      </div>
      <div class="hk-footer">
        ${inGame ? '<button class="hk-btn hk-cancel">Cancel</button>' : ''}
        <button class="hk-btn green big hk-play"><span class="hk-ico">${inGame ? '✅' : '🎢'}</span>${inGame ? 'Done' : 'Play!'}</button>
      </div>
    </div></div>`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));

  const nameTag = wrap.querySelector('.hk-preview-name');
  const tabsEl = wrap.querySelector('.hk-tabs'), pagesEl = wrap.querySelector('.hk-pages');

  // ---------- 3D preview ----------
  const canvas = wrap.querySelector('canvas');
  const preview = createPreview(canvas, cfg);

  // ---------- controls ----------
  const refreshers = [];
  const apply = (partial) => {
    Object.assign(cfg, partial);
    preview.avatar.setConfig(partial);
    refreshers.forEach((f) => f());
    nameTag.textContent = cfg.name || 'Explorer';
  };

  const section = (title) => { const s = el('div', 'hk-sec'); s.appendChild(el('h3', null, title)); return s; };
  const swatches = (key, colors) => {
    const row = el('div', 'hk-swatches');
    for (const c of colors) {
      const b = el('button', 'hk-swatch'); b.style.background = c; b.title = c; b.dataset.color = c;
      b.addEventListener('click', () => { click(); apply({ [key]: c }); });
      row.appendChild(b);
    }
    refreshers.push(() => { for (const b of row.children) b.classList.toggle('sel', b.dataset.color.toLowerCase() === String(cfg[key]).toLowerCase()); });
    return row;
  };
  const chips = (key, values, label) => {
    const row = el('div', 'hk-chips');
    for (const v of values) {
      const [ico, txt] = label(v);
      const b = el('button', 'hk-chip', `${ico ? `<span class="hk-ico">${ico}</span>` : ''}${txt}`); b.dataset.v = v;
      b.addEventListener('click', () => { click(); apply({ [key]: v }); });
      row.appendChild(b);
    }
    refreshers.push(() => { for (const b of row.children) b.classList.toggle('sel', b.dataset.v === cfg[key]); });
    return row;
  };

  // Name
  const pName = el('div', 'hk-page');
  const sName = section('Your name');
  const nameRow = el('div', 'hk-name-row');
  const input = el('input', 'hk-name-input'); input.type = 'text'; input.maxLength = 16; input.value = cfg.name; input.placeholder = 'Explorer'; input.autocomplete = 'off'; input.spellcheck = false;
  input.addEventListener('input', () => { const v = sanitizeName(input.value); if (v !== input.value) input.value = v; apply({ name: v }); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); });
  nameRow.appendChild(input);
  sName.appendChild(nameRow);
  sName.appendChild(el('p', 'hk-tip', 'Letters, numbers and spaces · up to 16 characters'));
  pName.appendChild(sName);
  const sSkin = section('Skin'); sSkin.appendChild(swatches('skin', SKIN_TONES)); pName.appendChild(sSkin);

  // Hair (same page)
  const sHs = section('Hair style'); sHs.appendChild(chips('hairStyle', HAIR_STYLES, (v) => ['', HAIR_LABELS[v] || v])); pName.appendChild(sHs);
  const sHc = section('Hair color'); sHc.appendChild(swatches('hairColor', HAIR_COLORS)); pName.appendChild(sHc);

  // Outfit
  const pOutfit = el('div', 'hk-page');
  const sO = section('Outfit'); sO.appendChild(chips('outfit', OUTFITS, (v) => OUTFIT_LABELS[v] || ['', v])); pOutfit.appendChild(sO);
  const sTop = section('Top color'); sTop.appendChild(swatches('topColor', PALETTE)); pOutfit.appendChild(sTop);
  const sBot = section('Bottom / skirt color'); sBot.appendChild(swatches('bottomColor', PALETTE)); pOutfit.appendChild(sBot);
  const sShoe = section('Shoe color'); sShoe.appendChild(swatches('shoeColor', PALETTE)); pOutfit.appendChild(sShoe);

  // Accessories
  const pAcc = el('div', 'hk-page');
  const sA = section('Accessory');
  const grid = el('div', 'hk-cards');
  for (const a of ACCESSORIES) {
    const [ico, txt] = ACC_LABELS[a] || ['✨', a];
    const locked = !unlocked.has(a);
    const b = el('button', 'hk-card' + (locked ? ' locked' : ''), `<span class="hk-ico">${ico}</span><span>${txt}</span>${locked ? '<span class="hk-lock">🔒</span><span class="hk-locktip">Complete quests to unlock</span>' : ''}`);
    b.dataset.v = a;
    if (locked) { b.disabled = true; b.title = 'Complete quests to unlock'; }
    else b.addEventListener('click', () => { click(); apply({ accessory: a }); });
    grid.appendChild(b);
  }
  refreshers.push(() => { for (const b of grid.children) b.classList.toggle('sel', b.dataset.v === cfg.accessory); });
  sA.appendChild(grid); pAcc.appendChild(sA);
  const sAc = section('Accessory color'); sAc.appendChild(swatches('accessoryColor', PALETTE)); pAcc.appendChild(sAc);

  // Kingdom: park name + the two princess hosts (name, favourite colour, catchphrase)
  const pKingdom = el('div', 'hk-page');
  if (firstRun) pKingdom.appendChild(el('div', 'hk-setup-hero', `<h2>Set up your kingdom! 🏰</h2><p>Name your park and your two princess hosts. You can change these any time from the Avatar button.</p>`));
  const sPark = section('Park name');
  const parkInput = el('input', 'hk-name-input'); parkInput.type = 'text'; parkInput.maxLength = 24; parkInput.value = kingdom.parkName; parkInput.placeholder = 'Sunshine Kingdom'; parkInput.autocomplete = 'off'; parkInput.spellcheck = false;
  parkInput.addEventListener('input', () => { const v = sanitizeSettingName(parkInput.value, 24); if (v !== parkInput.value.trim()) parkInput.value = v; kingdom.parkName = v; });
  parkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') parkInput.blur(); e.stopPropagation(); });
  sPark.appendChild(parkInput);
  sPark.appendChild(el('p', 'hk-tip', 'Shown on the entrance arch and the welcome screen · up to 24 characters'));
  pKingdom.appendChild(sPark);
  const kcards = el('div', 'hk-kcards');
  const presetBtns = wrap.querySelectorAll('[data-preset]');
  const refreshPresetBtns = () => presetBtns.forEach((b, i) => {
    const c = kingdom.princesses[i]?.color || PALETTE[i];
    b.style.background = c; b.style.color = isDark(c) ? '#fff' : '#1b2430';
  });
  kingdom.princesses.forEach((p, i) => {
    const card = el('div', 'hk-kcard');
    card.innerHTML = `<h3><span class="hk-kdot"></span>Princess ${i + 1}</h3>`;
    const dot = card.querySelector('.hk-kdot');
    const nm = el('input', 'hk-name-input small'); nm.type = 'text'; nm.maxLength = 16; nm.value = p.name; nm.placeholder = 'Name'; nm.autocomplete = 'off'; nm.spellcheck = false; nm.setAttribute('aria-label', `Princess ${i + 1} name`);
    nm.addEventListener('input', () => { const v = sanitizeSettingName(nm.value); if (v !== nm.value.trim()) nm.value = v; p.name = v; });
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); e.stopPropagation(); });
    card.appendChild(el('label', 'hk-klabel', 'Name')); card.appendChild(nm);
    card.appendChild(el('label', 'hk-klabel', 'Favourite colour'));
    const crow = el('div', 'hk-swatches hk-color-row');
    const picker = el('input', 'hk-color-pick'); picker.type = 'color'; picker.value = p.color; picker.title = 'Any colour';
    const setColor = (c) => {
      p.color = c; picker.value = c; dot.style.background = c;
      for (const b of crow.querySelectorAll('.hk-swatch')) b.classList.toggle('sel', b.dataset.color.toLowerCase() === c.toLowerCase());
      refreshPresetBtns();
    };
    for (const c of PALETTE) {
      const b = el('button', 'hk-swatch'); b.style.background = c; b.title = c; b.dataset.color = c;
      b.addEventListener('click', () => { click(); setColor(c); });
      crow.appendChild(b);
    }
    picker.addEventListener('input', () => setColor(picker.value));
    crow.appendChild(picker);
    card.appendChild(crow);
    const cp = el('input', 'hk-name-input small'); cp.type = 'text'; cp.maxLength = 20; cp.value = p.catchphrase || ''; cp.placeholder = 'e.g. yay!'; cp.autocomplete = 'off'; cp.setAttribute('aria-label', `Princess ${i + 1} catchphrase`);
    cp.addEventListener('input', () => { p.catchphrase = cp.value.slice(0, 20); });
    cp.addEventListener('keydown', (e) => { if (e.key === 'Enter') cp.blur(); e.stopPropagation(); });
    card.appendChild(el('label', 'hk-klabel', 'Catchphrase <small>(optional)</small>')); card.appendChild(cp);
    kcards.appendChild(card);
    setColor(p.color);
  });
  const sP = section('Your princesses'); sP.appendChild(kcards); pKingdom.appendChild(sP);
  pKingdom.appendChild(el('p', 'hk-tip', 'Saved only in this browser — nothing is sent anywhere.'));

  const pages = [['🙂', 'Me', pName], ['👗', 'Outfit', pOutfit], ['👑', 'Extras', pAcc], ['🏰', 'Kingdom', pKingdom]];
  const KINGDOM = pages.length - 1;
  const tabBtns = [];
  pages.forEach(([ico, label, page], i) => {
    const tb = el('button', 'hk-tab', `<span>${ico}</span><span>${label}</span>`);
    tb.addEventListener('click', () => { click(); showPage(i); });
    tabsEl.appendChild(tb); tabBtns.push(tb);
    page.hidden = i !== 0; pagesEl.appendChild(page);
  });
  const title = wrap.querySelector('.hk-preview-title'), playBtn = wrap.querySelector('.hk-play');
  let activePage = 0;
  const showPage = (i) => {
    activePage = i;
    pages.forEach(([, , p], j) => { p.hidden = j !== i; tabBtns[j].classList.toggle('active', j === i); });
    pagesEl.scrollTop = 0;
    const onKingdom = i === KINGDOM;
    title.innerHTML = onKingdom
      ? (firstRun ? 'Set up your kingdom!<small>🏰 name your park &amp; princesses 🏰</small>' : 'Your Kingdom<small>🏰 park &amp; princesses 🏰</small>')
      : 'Dressing Room<small>✨ make it yours ✨</small>';
    // first run: the big button walks you from the kingdom page to your avatar, then becomes Play
    const next = firstRun && onKingdom;
    playBtn.innerHTML = next ? '<span class="hk-ico">🧚</span>Next: your avatar →' : `<span class="hk-ico">${inGame ? '✅' : '🎢'}</span>${inGame ? 'Done' : 'Play!'}`;
    playBtn.classList.toggle('next', next);
  };
  showPage(firstRun ? KINGDOM : 0);
  apply({});

  // presets / random
  refreshPresetBtns();
  presetBtns.forEach((b) => b.addEventListener('click', () => {
    click();
    const p = princessPreset(Number(b.dataset.preset), kingdom.princesses);
    if (!unlocked.has(p.accessory)) p.accessory = 'none';
    apply(p);
  }));
  wrap.querySelector('[data-random]').addEventListener('click', () => {
    click();
    apply({
      skin: pick(SKIN_TONES), hairStyle: pick(HAIR_STYLES.filter((h) => h !== 'none')), hairColor: pick(HAIR_COLORS), outfit: pick(OUTFITS),
      topColor: pick(PALETTE), bottomColor: pick(PALETTE), shoeColor: pick(PALETTE),
      accessory: pick([...unlocked]), accessoryColor: pick(PALETTE),
    });
  });

  return new Promise((resolve) => {
    let closed = false;
    const close = (result) => {
      if (closed) return; closed = true;
      wrap.classList.add('hide'); wrap.classList.remove('show');
      preview.dispose();
      setTimeout(() => wrap.remove(), 380);
      resolve(result);
    };
    playBtn.addEventListener('click', () => {
      if (firstRun && activePage === KINGDOM) { click(); showPage(0); return; }
      game?.audio?.play('unlock');
      if (!cfg.name.trim()) cfg.name = 'Explorer';
      cfg.name = cfg.name.trim();
      // commit the kingdom first so everything (signage, NPCs, quests, HUD) refreshes before the game continues
      if (game?.settings) applySettings(game, { parkName: kingdom.parkName, princesses: kingdom.princesses, setupDone: true });
      close({ ...cfg });
    });
    wrap.querySelector('.hk-cancel')?.addEventListener('click', () => { click(); close(inGame ? null : { ...config }); });
  });
}

// Small self-contained Three.js scene showing the avatar, auto-rotating, drag to spin.
function createPreview(canvas, cfg) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.7, 7.5); camera.lookAt(0, 1.15, 0);

  scene.add(new THREE.HemisphereLight(0xfff3e0, 0xd9a6ff, 1.1));
  const spot = new THREE.SpotLight(0xffffff, 60, 30, 0.6, 0.5, 1.6);
  spot.position.set(2.5, 6, 4); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005;
  scene.add(spot); scene.add(spot.target);
  const fill = new THREE.DirectionalLight(0xffe6f5, 0.6); fill.position.set(-3, 2, -2); scene.add(fill);

  // soft contact shadow disc + pastel pedestal
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
  disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; scene.add(disc);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.18, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  pedestal.position.y = -0.09; pedestal.receiveShadow = true; scene.add(pedestal);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.05, 10, 50), new THREE.MeshStandardMaterial({ color: 0xf9d71c, metalness: 0.6, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.0; scene.add(rim);

  const avatar = buildAvatar(cfg);
  const pivot = new THREE.Group(); pivot.add(avatar.group); scene.add(pivot);

  // drag to rotate (pointer events), with inertia; otherwise slow auto-rotate
  let dragging = false, lastX = 0, vel = 0, yaw = 0, activeId = null;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; activeId = e.pointerId; lastX = e.clientX; vel = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging || e.pointerId !== activeId) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw += dx * 0.012; vel = dx * 0.012; });
  const up = (e) => { if (e.pointerId === activeId) { dragging = false; activeId = null; } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  const resize = () => {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // keep the whole avatar (~2.6 tall with hats, ~1.9 wide with wings) in frame on any aspect
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.z = THREE.MathUtils.clamp(Math.max(2.1 / halfTan, 1.7 / (halfTan * camera.aspect)), 6.5, 13);
    camera.lookAt(0, camera.aspect > 1.05 ? 1.3 : 1.15, 0); // wide+short (phone top strip): sit the avatar lower, away from the title
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  resize();

  let raf = 0, t0 = performance.now(), last = t0, alive = true;
  const loop = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    // gentle sway when idle so the face stays visible; drag spins freely, then eases back
    if (!dragging) { yaw += vel * 30 * dt; vel *= Math.pow(0.02, dt); const target = Math.sin(t * 0.6) * 0.5; yaw += (target - yaw) * Math.min(1, dt * 1.2); }
    pivot.rotation.y = yaw;
    avatar.setAnim('idle', t);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    avatar,
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
      renderer.dispose();
    },
  };
}
