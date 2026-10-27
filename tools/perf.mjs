// Headless performance survey. Usage:
//   npm run build && node tools/perf.mjs [--url "?skipCreator=1&quality=high"] [--frames 300] [--shots shots/perf] [--json out.json] [--base http://localhost:5173/]
// Serves dist/ with `vite preview` on a random port (so other people's dev-server edits don't affect it) unless --base is
// given. Swiftshader timings are NOT iPad timings — but the relative numbers (draw calls, shadow casters, which
// subsystem burns CPU, which buffers are re-uploaded every frame) are what we need to find hot spots.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] ?? '']] : a), []));
const url = args.url ?? '?skipCreator=1';
const frames = Number(args.frames || 300);
const EXE = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome`;

let server = null, base = args.base;
if (!base) {
  const port = 5200 + Math.floor(Math.random() * 600);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore', detached: true });
  base = `http://localhost:${port}/`;
  await new Promise((r) => setTimeout(r, 2000));
}
if (args.shots) mkdirSync(args.shots, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: Number(args.vw || 1280), height: Number(args.vh || 720) }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

// ---------------------------------------------------------------- in-page survey
// Runs inside the page. Steps the sim by hand (the RAF loop is stopped) so every subsystem can be timed in isolation.
function install() {
  const g = window.__game, dt = 1 / 60;
  g.renderer.setAnimationLoop(null);
  const renderer = g.renderer, scene = g.scene, camera = g.camera;
  const now = () => performance.now();
  // renderer.info is reset AFTER the shadow pass (r170), so info.render only shows the main pass; capture the shadow pass separately
  const shadowPass = { calls: 0, triangles: 0 };
  const origShadowRender = renderer.shadowMap.render;
  renderer.shadowMap.render = function (...a) { const c = renderer.info.render.calls, t = renderer.info.render.triangles; origShadowRender.apply(this, a); shadowPass.calls = renderer.info.render.calls - c; shadowPass.triangles = renderer.info.render.triangles - t; };

  // --- instrumentation: count GPU re-uploads (texture / attribute needsUpdate) and forced matrix updates per frame
  const protoOf = (obj, prop) => { let p = Object.getPrototypeOf(obj); while (p && !Object.getOwnPropertyDescriptor(p, prop)) p = Object.getPrototypeOf(p); return p; };
  const counts = { texture: new Map(), attribute: new Map(), matrixWorldForce: 0, matrixWorldCalls: 0 };
  let phase = 'update';
  const hooks = [];
  const firstTex = (() => { let t = null; scene.traverse((o) => { if (t) return; const m = o.material; const ms = Array.isArray(m) ? m : m ? [m] : []; for (const mm of ms) for (const k of ['map', 'emissiveMap', 'alphaMap']) if (mm?.[k]) { t = mm[k]; return; } }); return t; })();
  const hook = (proto, prop, fn) => {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (d.set) { Object.defineProperty(proto, prop, { ...d, set(v) { fn(this, v); d.set.call(this, v); } }); hooks.push(() => Object.defineProperty(proto, prop, d)); }
    else if (typeof d.value === 'function') { Object.defineProperty(proto, prop, { ...d, value(...a) { fn(this, a); return d.value.apply(this, a); } }); hooks.push(() => Object.defineProperty(proto, prop, d)); }
  };
  const label = (o) => { const parts = []; let p = o; while (p && parts.length < 4) { if (p.name) parts.unshift(p.name); p = p.parent; } return parts.join('/') || o.type; };
  if (firstTex) hook(protoOf(firstTex, 'needsUpdate'), 'needsUpdate', (t, v) => { if (!v) return; const k = `${t.constructor.name} ${t.name || t.uuid.slice(0, 8)} ${t.image?.width || '?'}x${t.image?.height || '?'}`; counts.texture.set(k, (counts.texture.get(k) || 0) + 1); });
  // attribute → owning mesh, so a per-frame upload can be blamed on a module
  const attrOwner = new Map();
  scene.traverse((o) => {
    const ge = o.geometry; if (!ge) return;
    for (const [k, a] of Object.entries(ge.attributes)) attrOwner.set(a, `${label(o)}.${k}`);
    if (ge.index) attrOwner.set(ge.index, `${label(o)}.index`);
    if (o.instanceMatrix) attrOwner.set(o.instanceMatrix, `${label(o)}.instanceMatrix`);
    if (o.instanceColor) attrOwner.set(o.instanceColor, `${label(o)}.instanceColor`);
  });
  const firstAttr = (() => { let a = null; scene.traverse((o) => { if (!a && o.geometry?.attributes?.position) a = o.geometry.attributes.position; }); return a; })();
  if (firstAttr) hook(protoOf(firstAttr, 'needsUpdate'), 'needsUpdate', (a, v) => { if (!v || phase !== 'update') return; const k = `${attrOwner.get(a) || a.constructor.name} len=${a.array?.length}`; counts.attribute.set(k, (counts.attribute.get(k) || 0) + 1); });
  hook(protoOf(scene, 'updateMatrixWorld'), 'updateMatrixWorld', (o, a) => { if (phase !== 'update') return; counts.matrixWorldCalls++; if (a[0]) counts.matrixWorldForce++; });

  // --- per-subsystem CPU timing
  const timers = {}; const add = (k, ms) => { timers[k] = (timers[k] || 0) + ms; };
  const timed = (k, fn) => { const t0 = now(); fn(); add(k, now() - t0); };
  const _d = g.player.position.clone();
  let stepped = 0;
  const step = (n, render = true) => {
    for (let i = 0; i < n; i++) {
      phase = 'update';
      g.time += dt; const t = g.time, player = g.player;
      timed('interact-scan', () => {
        let best = null, bestD = Infinity;
        if (player.state === 'walk') for (const it of g.interactables) { if (it.enabled && !it.enabled()) continue; const d = _d.copy(it.position).sub(player.position).length(); if (d < it.radius && d < bestD) { best = it; bestD = d; } }
        player.nearest = best;
      });
      timed('player', () => player.update(dt));
      for (const r of g.rides) timed('ride:' + r.id, () => r._tick(dt, t));
      timed('npcs', () => { for (const n of g.npcs) n.update?.(dt, t); });
      timed('world', () => g.world.update?.(dt, t));
      timed('quests', () => g.quests.update?.(dt, t));
      timed('ui', () => g.ui.update(dt, t));
      timed('audio', () => g.audio.update?.(dt, t));
      timed('net', () => g.net?.update(dt, t));
      g.input.endFrame();
      phase = 'render';
      if (render) timed('render', () => renderer.render(scene, camera));
      stepped++;
    }
  };

  // --- static scene survey
  const tris = (o) => { const ge = o.geometry; if (!ge) return 0; const n = ge.index ? ge.index.count / 3 : (ge.attributes.position?.count || 0) / 3; return Math.round(n * (o.isInstancedMesh ? o.count : 1)); };
  const stat = { objects: 0, meshes: 0, instanced: 0, points: 0, lines: 0, lights: [], casters: [], receivers: 0, noCull: [], materials: new Set(), geometries: new Set(), transparent: 0 };
  scene.traverse((o) => {
    stat.objects++;
    if (o.isLight) stat.lights.push({ type: o.type, name: o.name || label(o), intensity: +o.intensity.toFixed(2), castShadow: !!o.castShadow, shadowMap: o.castShadow ? `${o.shadow.mapSize.x}` : '' });
    if (o.isMesh || o.isPoints || o.isLine) {
      if (o.isInstancedMesh) stat.instanced++; else if (o.isPoints) stat.points++; else if (o.isLine) stat.lines++; else stat.meshes++;
      if (o.geometry) stat.geometries.add(o.geometry.uuid);
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) { stat.materials.add(m.uuid); if (m.transparent) stat.transparent++; }
      if (o.castShadow) stat.casters.push({ name: label(o), type: o.type, tris: tris(o), instances: o.isInstancedMesh ? o.count : 1, mat: ms[0]?.type?.replace('Mesh', '').replace('Material', '') });
      if (o.receiveShadow) stat.receivers++;
      if (o.frustumCulled === false) stat.noCull.push({ name: label(o), type: o.type, tris: tris(o) });
    }
  });
  stat.casters.sort((a, b) => b.tris - a.tris);
  const casterTris = stat.casters.reduce((s, c) => s + c.tris, 0);

  // --- viewpoints (node drives these one at a time so it can screenshot between them)
  const L = g.world.landmarks, sp = g.world.spawnPoint;
  const gh = (x, z) => g.world.getGroundHeight(x, z, 2);
  const views = {
    spawn: { pos: [sp.x, sp.z], facing: sp.facing ?? Math.PI },          // looking into the park (the expensive direction)
    entrance: { pos: [sp.x, sp.z], facing: 0 },                           // looking back out at the gate / house
    castle: { pos: [L.castleDoor?.x ?? 0, (L.castleDoor?.z ?? -62) + 8], facing: Math.PI },
    splashCove: { pos: [128, 8], facing: Math.PI / 2 },
    playground: { pos: [L.playground?.x ?? -40, (L.playground?.z ?? 88) + 10], facing: Math.PI },
  };
  const snap = (name) => {
    const r = renderer.info.render, m = renderer.info.memory;
    return { view: name, calls: r.calls, triangles: r.triangles, shadowCalls: shadowPass.calls, shadowTris: shadowPass.triangles, lines: r.lines, points: r.points, geometries: m.geometries, textures: m.textures, programs: renderer.info.programs?.length };
  };
  const reset = () => { for (const k in timers) delete timers[k]; counts.texture.clear(); counts.attribute.clear(); counts.matrixWorldForce = 0; counts.matrixWorldCalls = 0; stepped = 0; };
  const uploads = () => ({ texture: [...counts.texture], attribute: [...counts.attribute], matrixWorldForce: counts.matrixWorldForce, matrixWorldCalls: counts.matrixWorldCalls, frames: stepped });
  const profile = () => Object.fromEntries(Object.entries(timers).map(([k, v]) => [k, +(v / stepped).toFixed(3)]));
  window.__perf = {
    views: Object.keys(views),
    stat: { ...stat, materials: stat.materials.size, geometries: stat.geometries.size, casterCount: stat.casters.length, casterTris, casters: stat.casters.slice(0, 15), noCull: stat.noCull },
    view(name) {
      const v = views[name];
      g.player.teleport(v.pos[0], gh(v.pos[0], v.pos[1]), v.pos[1], v.facing);
      step(90, false); renderer.render(scene, camera); return snap(name);
    },
    // inside a ride: board it (a seat menu, if any, is cancelled → first option) and let it leave the station
    ride(id) {
      const ride = g.rides.find((r) => r.id === id) || g.rides[0];
      const s = ride.station; g.player.teleport(s.x, gh(s.x, s.z), s.z); step(5, false);
      g.player.boardRide(ride); g.ui.closeChoose?.();
      step(420, false); renderer.render(scene, camera); return snap('ride:' + ride.id);
    },
    // CPU profile: N rendered frames from wherever the player is now
    profile(frames) { reset(); step(frames); return { profile: profile(), uploads: uploads() }; },
    exitRide() { if (g.player.state === 'riding') g.player.exitRide(false); },
    finish() { hooks.forEach((h) => h()); renderer.shadowMap.render = origShadowRender; return g.perf?.stats?.() || null; },
  };
}

// ---------------------------------------------------------------- run
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const table = (rows, cols) => {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  console.log(cols.map((c, i) => pad(c, w[i])).join('  '));
  for (const r of rows) console.log(cols.map((c, i) => (typeof r[c] === 'number' ? rpad(r[c], w[i]) : pad(r[c] ?? '', w[i]))).join('  '));
};
try {
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(800);
  await page.evaluate(install);
  const shot = async (name) => { if (args.shots) await page.screenshot({ path: `${args.shots}/${name}.png` }); };
  const r = { stat: await page.evaluate(() => window.__perf.stat), results: [] };
  for (const v of await page.evaluate(() => window.__perf.views)) { r.results.push(await page.evaluate((v) => window.__perf.view(v), v)); await shot(v); }
  r.results.push(await page.evaluate((id) => window.__perf.ride(id), args.ride || 'coaster')); await shot('ride');
  const ride = await page.evaluate((n) => window.__perf.profile(n), frames); r.profileRide = ride.profile; r.uploadsRide = ride.uploads;
  await page.evaluate(() => { window.__perf.exitRide(); window.__perf.view('spawn'); });
  const walk = await page.evaluate((n) => window.__perf.profile(n), frames); r.profileWalk = walk.profile; r.uploadsWalk = walk.uploads;
  r.perf = await page.evaluate(() => window.__perf.finish());

  console.log(`\n== ${base}${url}  (frames: ${frames}, viewport ${args.vw || 1280}x${args.vh || 720}, swiftshader)`);
  if (r.perf) console.log('perf tier:', JSON.stringify(r.perf));
  const s = r.stat;
  console.log(`\nscene: ${s.objects} objects, ${s.meshes} meshes + ${s.instanced} instanced + ${s.points} points + ${s.lines} lines, ${s.materials} materials (${s.transparent} transparent), ${s.geometries} geometries`);
  console.log(`shadows: ${s.casterCount} casters (${s.casterTris.toLocaleString()} tris total), ${s.receivers} receivers; frustumCulled=false: ${s.noCull.length}`);
  console.log('\n-- lights'); table(s.lights, ['type', 'name', 'intensity', 'castShadow', 'shadowMap']);
  console.log('\n-- per viewpoint (renderer.info: main pass; shadowCalls/shadowTris: the sun shadow pass on top of that)');
  table(r.results, ['view', 'calls', 'triangles', 'shadowCalls', 'shadowTris', 'lines', 'points', 'geometries', 'textures', 'programs']);
  console.log('\n-- top 15 shadow casters by triangles'); table(s.casters, ['name', 'type', 'tris', 'instances', 'mat']);
  console.log('\n-- frustumCulled = false'); table(s.noCull, ['name', 'type', 'tris']);
  const prof = (p) => Object.entries(p).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ subsystem: k, 'ms/frame': v }));
  console.log(`\n-- CPU ms per frame, walking at spawn (${frames} frames)`); table(prof(r.profileWalk).slice(0, 14), ['subsystem', 'ms/frame']);
  console.log(`\n-- CPU ms per frame, riding (${frames} frames)`); table(prof(r.profileRide).slice(0, 14), ['subsystem', 'ms/frame']);
  const up = (u) => {
    console.log(`   forced updateMatrixWorld(true) calls per frame: ${(u.matrixWorldForce / u.frames).toFixed(1)}  (all explicit updateMatrixWorld calls during update: ${(u.matrixWorldCalls / u.frames).toFixed(1)})`);
    const tex = u.texture.map(([k, n]) => ({ what: k, 'updates/frame': +(n / u.frames).toFixed(2) })).sort((a, b) => b['updates/frame'] - a['updates/frame']);
    const att = u.attribute.map(([k, n]) => ({ what: k, 'updates/frame': +(n / u.frames).toFixed(2) })).sort((a, b) => b['updates/frame'] - a['updates/frame']);
    if (tex.length) { console.log('   texture re-uploads:'); table(tex.slice(0, 10), ['what', 'updates/frame']); } else console.log('   texture re-uploads: none');
    if (att.length) { console.log('   buffer attribute re-uploads (needsUpdate during update phase):'); table(att.slice(0, 12), ['what', 'updates/frame']); } else console.log('   buffer attribute re-uploads: none');
  };
  console.log('\n-- GPU re-uploads while walking'); up(r.uploadsWalk);
  console.log('\n-- GPU re-uploads while riding'); up(r.uploadsRide);
  if (args.json) { writeFileSync(args.json, JSON.stringify(r, null, 1)); console.log('\nwrote', args.json); }
} finally {
  if (errors.length) { console.log('\n--- console errors ---'); console.log([...new Set(errors)].slice(0, 20).join('\n')); }
  await browser.close();
  if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } }
}
