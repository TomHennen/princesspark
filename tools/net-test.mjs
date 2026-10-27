// Play-together smoke test: a static build served by `vite preview`, two headless browser pages joining the same
// room code over Trystero (Nostr signaling, then WebRTC). Also checks the lobby UI and the graceful no-internet path.
// (Preview rather than dev so file edits elsewhere can't reload the pages mid-test.)
//   node tools/net-test.mjs
// Writes shots/net-two-players.png, shots/net-lobby.png, shots/net-lobby-phone.png, shots/net-offline.png.
import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 5321, BASE = `http://localhost:${PORT}/`;
const EXE = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome`;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
const CODE = randomCode();
mkdirSync('shots', { recursive: true });

const outDir = mkdtempSync(path.join(tmpdir(), 'pk-net-'));
execSync(`npx vite build --outDir "${outDir}" --logLevel error`, { stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await sleep(250); } }

const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
// Second browser (launched later) with all non-local DNS failing: simulates "no internet / relays blocked".
let offline = null;
const failures = [], pages = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const isWsNoise = (e) => /WebSocket connection to .* failed|ERR_NAME_NOT_RESOLVED|net::ERR_/.test(e);

// Each page gets its own browser context (own localStorage) and its own avatar look + name.
async function openPage(br, name, topColor, url = '?skipCreator=1', viewport = { width: 960, height: 540 }) {
  const ctx = await br.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ name, topColor }) => {
    localStorage.setItem('pk:avatar', JSON.stringify({ name, topColor, hairColor: '#c0392b', accessory: name === 'Bee' ? 'crown' : 'none' }));
    localStorage.setItem('pk:settings', JSON.stringify({ setupDone: true }));
    window.__toasts = [];
    const mo = new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.classList?.contains('hk-toast')) window.__toasts.push(n.textContent); });
    addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
  }, { name, topColor });
  const page = await ctx.newPage();
  page.errors = []; page.label = name; pages.push(page);
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`[pageerror] ${e.message}`));
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 90000, polling: 100 });
  return page;
}
const netInfo = (page) => page.evaluate(() => { const g = window.__game, n = g.net, p = [...n.peerMap.values()][0]; return { status: n.status, error: n.error, connected: n.connected, relays: n.relays(), room: n.roomCode, size: n.peerMap.size, peerPos: p && p.group.position.toArray().map((v) => +v.toFixed(2)), peerName: p?.name, me: g.player.position.toArray().map((v) => +v.toFixed(2)), toasts: window.__toasts, btn: document.querySelector('.pk-net-btn')?.textContent }; });

try {
  console.log(`room code for this run: ${CODE}`);
  const A = await openPage(browser, 'Ava', '#ff6fb5', `?skipCreator=1&room=${CODE}`);
  const B = await openPage(browser, 'Bee', '#2ecc71', `?skipCreator=1&room=${CODE}`);
  // Wait for signaling + WebRTC: Nostr relays usually take 1-10 s.
  const t0 = Date.now();
  await A.waitForFunction(() => window.__game?.net?.peerMap.size >= 1, null, { timeout: 60000, polling: 250 }).catch(() => {});
  await B.waitForFunction(() => window.__game?.net?.peerMap.size >= 1, null, { timeout: 15000, polling: 250 }).catch(() => {});
  console.log(`peer discovery took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const a0 = await netInfo(A), b0 = await netInfo(B);
  console.log('A:', JSON.stringify(a0)); console.log('B:', JSON.stringify(b0));
  check(a0.status === 'joined' && a0.connected, `A joined room ${CODE} with a relay connected`);
  check(a0.room === CODE && b0.room === CODE, 'both pages are in the room from ?room=');
  check(a0.size === 1 && b0.size === 1, 'each page sees exactly one peer');
  check(a0.peerName === 'Bee' && b0.peerName === 'Ava', 'peer names arrived');
  check(a0.toasts.some((t) => /Bee joined/.test(t)), 'A was told Bee joined');
  check(/joined|Bee joined/.test(a0.toasts.join()) && a0.btn?.includes(`${CODE} · 2`), `pill shows "${CODE} · 2": ${a0.btn}`);

  // Teleport and let the interpolation settle; compare A's remote avatar against B's real position.
  await A.evaluate(() => { const g = window.__game; g.player.teleport(-6, 0, 90, 0); g.player.setCameraMode('free'); g.player.cam.yaw = -Math.PI / 2 + 0.55; g.player.cam.pitch = 0.25; g.player.cam.dist = 8; });
  await B.evaluate(() => { const g = window.__game; g.player.teleport(-3, 0, 90, Math.PI / 2); });
  // Software rendering with two pages is slow (well under 10 fps here), so wait until the interpolation has settled.
  const settled = (page, x, z) => page.waitForFunction(([x, z]) => { const p = [...window.__game.net.peerMap.values()][0]?.group.position; return p && Math.hypot(p.x - x, p.z - z) < 0.5; }, [x, z], { timeout: 30000, polling: 250 }).catch(() => {});
  const bReal = await B.evaluate(() => window.__game.player.position.toArray());
  const aReal = await A.evaluate(() => window.__game.player.position.toArray());
  await settled(A, bReal[0], bReal[2]); await settled(B, aReal[0], aReal[2]);
  const a1 = await netInfo(A), b1 = await netInfo(B);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]);
  check(a1.peerPos && dist(a1.peerPos, b1.me) < 1, `A's avatar for B is within 1 m of B's real spot: ${JSON.stringify(a1.peerPos)} vs ${JSON.stringify(b1.me)}`);
  check(b1.peerPos && dist(b1.peerPos, a1.me) < 1, `B's avatar for A is within 1 m of A's real spot: ${JSON.stringify(b1.peerPos)} vs ${JSON.stringify(a1.me)}`);
  check(dist(b1.me, [-3, 0, 90]) < 3, `B stands near (-3,0,90): ${JSON.stringify(b1.me)}`);

  // B walks: A should see the avatar move.
  await B.keyboard.down('KeyW'); await sleep(2500); await B.keyboard.up('KeyW');
  await A.waitForFunction((prev) => { const p = [...window.__game.net.peerMap.values()][0]?.group.position; return p && Math.hypot(p.x - prev[0], p.z - prev[2]) > 0.5; }, a1.peerPos, { timeout: 20000, polling: 250 }).catch(() => {});
  const a2 = await netInfo(A);
  check(dist(a2.peerPos, a1.peerPos) > 0.5, `A saw B walk: ${JSON.stringify(a1.peerPos)} -> ${JSON.stringify(a2.peerPos)}`);

  // Outfit change propagates (swimsuit override path).
  await B.evaluate(() => window.__game.player.setOutfitOverride('swimsuit'));
  await A.waitForFunction(() => [...window.__game.net.peerMap.values()][0]?.avatar.config.outfit === 'swimsuit', null, { timeout: 20000, polling: 250 }).catch(() => {});
  const outfit = await A.evaluate(() => [...window.__game.net.peerMap.values()][0].avatar.config.outfit);
  check(outfit === 'swimsuit', `A sees B's outfit change: ${outfit}`);

  await A.screenshot({ path: 'shots/net-two-players.png' });
  console.log('saved shots/net-two-players.png');

  // ---- Riding together. Rides animate on each client's own clock, so a remote rider must sit in OUR copy of the ride.
  const peerOf = (page) => page.evaluate(() => { const p = [...window.__game.net.peerMap.values()][0]; if (!p) return null; const r = p.rideObj; return { st: p.st, ride: p.ride, slot: p.slot, seated: p.seated, pos: p.group.position.toArray().map((v) => +v.toFixed(2)), vehicle: !!p.vehicle, vehicleInGroup: !!p.vehicle && p.group.children.includes(p.vehicle), children: p.group.children.length, anim: p.avatar.lastAnim ?? null, held: p.avatar.config.held }; });
  const seatWorld = (page, rideId, i) => page.evaluate(([rideId, i]) => { const r = window.__game.rides.find((r) => r.id === rideId); const s = r.peerSeat?.(i); if (!s) return null; s.updateWorldMatrix(true, false); const v = new s.position.constructor(); v.setFromMatrixPosition(s.matrixWorld); return v.toArray().map((n) => +n.toFixed(2)); }, [rideId, i]);
  const board = (page, rideId) => page.evaluate((rideId) => { const g = window.__game, r = g.rides.find((r) => r.id === rideId); if (g.player.state === 'riding') g.player.exitRide(false); g.player.teleport(r.station.x, r.station.y, r.station.z, 0); g.player.boardRide(r); return g.player.state; }, rideId);
  const unboard = (page) => page.evaluate(() => { const g = window.__game; if (g.player.state === 'riding') g.player.exitRide(false); return g.player.state; });
  const peerRideIs = (page, rideId) => page.waitForFunction((rideId) => [...window.__game.net.peerMap.values()][0]?.ride === rideId, rideId, { timeout: 20000, polling: 250 }).catch(() => {});
  const hasOwn = (page, rideId, fn) => page.evaluate(([rideId, fn]) => { const r = window.__game.rides.find((r) => r.id === rideId); return Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(r), fn); }, [rideId, fn]);
  const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

  // Coaster: A boards; on B the remote avatar must sit on B's coaster.peerSeat(0), not at A's transmitted spot.
  await board(A, 'coaster');
  await peerRideIs(B, 'coaster'); await sleep(1200);
  let bp = await peerOf(B), seat0 = await seatWorld(B, 'coaster', 0);
  check(bp?.st === 'riding' && bp.ride === 'coaster' && bp.slot === 0, `B knows A is riding the coaster in slot 0: ${JSON.stringify(bp)}`);
  check(bp && seat0 && dist3(bp.pos, seat0) < 0.5, `B's avatar for A is on B's coaster.peerSeat(0): ${JSON.stringify(bp?.pos)} vs seat ${JSON.stringify(seat0)}`);
  // B boards too: both are in B's train, so A's avatar must be right next to B.
  await board(B, 'coaster'); await sleep(1500);
  bp = await peerOf(B);
  const bMe = await B.evaluate(() => window.__game.player.position.toArray().map((v) => +v.toFixed(2)));
  check(bp && dist3(bp.pos, bMe) < 6, `while both ride, A's avatar is near B in B's train (${dist3(bp?.pos || [0, 0, 0], bMe).toFixed(2)} m): ${JSON.stringify(bp?.pos)} vs me ${JSON.stringify(bMe)}`);
  await B.screenshot({ path: 'shots/net-coaster-together.png' });
  console.log('saved shots/net-coaster-together.png');
  // Both off: the seat slot is released and the remote avatar snaps back to the transmitted spot.
  await unboard(A); await unboard(B);
  await B.waitForFunction(() => [...window.__game.net.peerMap.values()][0]?.ride === null, null, { timeout: 20000, polling: 250 }).catch(() => {});
  await sleep(500);
  bp = await peerOf(B);
  const riders = await B.evaluate(() => window.__game.net.riders());
  check(bp?.st === 'walk' && bp.ride === null && bp.slot === -1 && !riders.coaster, `after exiting, B sees A walking and the coaster seat slot is free: ${JSON.stringify(bp)} riders=${JSON.stringify(riders)}`);
  const aExit = await A.evaluate(() => window.__game.player.position.toArray().map((v) => +v.toFixed(2)));
  check(bp && dist3(bp.pos, aExit) < 2, `remote avatar snapped to A's exit spot: ${JSON.stringify(bp?.pos)} vs ${JSON.stringify(aExit)}`);

  // Lazy river: A boards; B's river should show an extra tube with the remote avatar sitting on it.
  const tubesBefore = await B.evaluate(() => { let n = 0; window.__game.rides.find((r) => r.id === 'lazyriver').group.traverse((o) => { if (o.isMesh) n++; }); return n; });
  await board(A, 'lazyriver');
  await peerRideIs(B, 'lazyriver'); await sleep(1200);
  bp = await peerOf(B); seat0 = await seatWorld(B, 'lazyriver', 0);
  const river = await B.evaluate(() => { const r = window.__game.rides.find((r) => r.id === 'lazyriver'); const s = r.peerSeat?.(0); let inGroup = false, meshNear = false, n = 0; r.group.traverse((o) => { if (o === s) inGroup = true; if (o.isMesh) n++; }); if (s) { const v = new s.position.constructor(); s.updateWorldMatrix(true, false); v.setFromMatrixPosition(s.matrixWorld); const w = new s.position.constructor(); r.group.traverse((o) => { if (o.isMesh && o.visible) { w.setFromMatrixPosition(o.matrixWorld); if (w.distanceTo(v) < 1.5) meshNear = true; } }); } return { inGroup, meshNear, meshes: n }; });
  check(bp?.ride === 'lazyriver' && seat0 && dist3(bp.pos, seat0) < 0.5 && river.inGroup, `B's avatar for A sits on B's lazyriver.peerSeat(0) inside ride.group: ${JSON.stringify(bp?.pos)} vs ${JSON.stringify(seat0)}`);
  check(river.meshNear, `a tube mesh is under the remote rider on B's river (meshes ${tubesBefore} -> ${river.meshes})`);
  if (await hasOwn(B, 'lazyriver', 'peerSeat')) check(river.meshes > tubesBefore, `lazy river added an extra tube for the peer (meshes ${tubesBefore} -> ${river.meshes})`);
  else console.log('WARN lazy river still uses the base peerSeat (no extra tube yet) — rides agent pending');
  await B.evaluate(() => { const g = window.__game, r = g.rides.find((r) => r.id === 'lazyriver'); g.player.teleport(r.station.x, r.station.y, r.station.z, 0); g.player.setCameraMode?.('free'); });
  await sleep(600);
  await B.screenshot({ path: 'shots/net-river-peer.png' });
  console.log('saved shots/net-river-peer.png');
  await unboard(A);
  await B.waitForFunction(() => [...window.__game.net.peerMap.values()][0]?.ride === null, null, { timeout: 20000, polling: 250 }).catch(() => {});

  // Light cycle (drive ride): the remote avatar gets its own bike mesh under its group and uses the transmitted transform.
  await board(A, 'lightcycle');
  await peerRideIs(B, 'lightcycle'); await sleep(1200);
  bp = await peerOf(B);
  const aPos = await A.evaluate(() => window.__game.player.position.toArray().map((v) => +v.toFixed(2)));
  check(bp?.ride === 'lightcycle' && bp.slot === -1 && !bp.seated, `B knows A is on the light cycle (drive ride, no seat slot): ${JSON.stringify(bp)}`);
  check(bp && dist3(bp.pos, aPos) < 2, `drive ride uses the transmitted transform: ${JSON.stringify(bp?.pos)} vs A ${JSON.stringify(aPos)}`);
  if (await hasOwn(B, 'lightcycle', 'makePeerVehicle')) check(bp?.vehicle && bp.vehicleInGroup, `B's remote group carries a peer vehicle mesh: ${JSON.stringify(bp)}`);
  else console.log('WARN lightcycle has no makePeerVehicle yet (base returns null) — rides agent pending');
  await unboard(A);
  await B.waitForFunction(() => [...window.__game.net.peerMap.values()][0]?.ride === null, null, { timeout: 20000, polling: 250 }).catch(() => {});
  bp = await peerOf(B);
  check(bp && !bp.vehicle && bp.children === 2, `vehicle removed when A gets off (group children ${bp?.children})`);

  // Hand-held item travels with the look (join payload re-sent when the config changes).
  await A.evaluate(() => { const g = window.__game; if (g.player.setHeld) g.player.setHeld('balloon'); else g.player.config.held = 'balloon'; });
  await B.waitForFunction(() => [...window.__game.net.peerMap.values()][0]?.avatar.config.held === 'balloon', null, { timeout: 20000, polling: 250 }).catch(() => {});
  bp = await peerOf(B);
  check(bp?.held === 'balloon', `B sees A's held item: ${bp?.held}`);
  // Sitting: the transmitted transform is used with the sit anim.
  const sat = await A.evaluate(() => { const g = window.__game; if (!g.player.sitAt) return null; g.player.sitAt({ id: 'test-bench', position: g.player.position.clone(), facing: 0 }); return g.player.state; });
  if (sat === 'sit') {
    await B.waitForFunction(() => [...window.__game.net.peerMap.values()][0]?.st === 'sit', null, { timeout: 20000, polling: 250 }).catch(() => {});
    bp = await peerOf(B);
    check(bp?.st === 'sit', `B sees A sitting: ${JSON.stringify(bp)}`);
    await A.evaluate(() => window.__game.player.standUp?.());
  } else console.log('WARN player.sitAt not available yet — sit sync not exercised');

  // ---- net.peers() + bop. peers() lists the rendered remote players with a live position (what the items module hit-tests).
  await A.evaluate(() => { const g = window.__game; g.player.teleport(-6, 0, 90, Math.PI / 2); });
  await B.evaluate(() => { const g = window.__game; g.player.teleport(-4, 0, 90, -Math.PI / 2); });
  await settled(A, -4, 90);
  const peersA = await A.evaluate(() => window.__game.net.peers().map((p) => ({ id: p.id, name: p.name, pos: p.position.toArray().map((v) => +v.toFixed(2)), isV3: typeof p.position.distanceTo === 'function', group: !!p.group?.isObject3D })));
  check(peersA.length === 1 && peersA[0].name === 'Bee' && peersA[0].isV3 && peersA[0].group && /^[A-Za-z0-9_-]{4,64}$/.test(peersA[0].id), `A.net.peers() lists Bee with a Vector3 position and group: ${JSON.stringify(peersA)}`);
  check(peersA[0] && dist(peersA[0].pos, [-4, 0, 90]) < 1, `peers()[0].position is where B stands: ${JSON.stringify(peersA[0]?.pos)}`);
  // A bops B through the items-module event; B must toast, record it and stagger.
  const bopSent = await A.evaluate(() => { const g = window.__game, p = g.net.peers()[0]; g.events.emit('bop', { targetKind: 'peer', id: p.id, item: 'balloon' }); return g.net.bop(p.id, 'needoh'); });
  check(bopSent === true, 'net.bop(peerId, item) returns true while connected');
  await B.waitForFunction(() => !!window.__game.net.lastBop, null, { timeout: 20000, polling: 100 }).catch(() => {});
  const bopB = await B.evaluate(() => { const n = window.__game.net; return { last: n.lastBop && { name: n.lastBop.name, item: n.lastBop.item }, toasts: window.__toasts.filter((t) => /bopped/.test(t)) }; });
  check(bopB.last?.name === 'Ava' && ['balloon', 'needoh'].includes(bopB.last.item), `B received the bop from Ava (lastBop = whichever of the two arrived last): ${JSON.stringify(bopB.last)}`);
  check(bopB.toasts.some((t) => t.includes('Ava bopped you! 🎈')), `B was toasted "Ava bopped you! 🎈": ${JSON.stringify(bopB.toasts)}`);
  check(bopB.toasts.some((t) => t.includes('🟣')), `second bop (needoh) toasted with its emoji: ${JSON.stringify(bopB.toasts)}`);
  // The stagger / swing one-shots resolve on B's own avatar and on the remote copy of A, without errors.
  const fxDone = await B.evaluate(() => Promise.race([
    Promise.all([window.__game.player.avatar.bopped(), window.__game.player.avatar.bop(), [...window.__game.net.peerMap.values()][0].avatar.bopped()]).then(() => 'ok'),
    new Promise((r) => setTimeout(() => r('timeout'), 4000)),
  ]));
  check(fxDone === 'ok', `avatar.bopped() / bop() resolve on the local player and a remote avatar: ${fxDone}`);
  const bErr = B.errors.filter((e) => !isWsNoise(e));
  check(bErr.length === 0, `B had no console errors after the bop (${bErr.length})`);
  if (bErr.length) console.log([...new Set(bErr)].slice(0, 8).join('\n'));
  // Bops on NPCs are local only: nothing is relayed.
  const atBefore = await B.evaluate(() => window.__game.net.lastBop?.at ?? 0);
  await A.evaluate(() => window.__game.events.emit('bop', { targetKind: 'npc', id: 'p1', item: 'balloon' }));
  await sleep(1500);
  const atAfter = await B.evaluate(() => window.__game.net.lastBop?.at ?? 0);
  check(atAfter === atBefore, 'a bop on an NPC is not relayed to peers');

  // Lobby card (desktop, while in a room) and the phone layout (no room yet).
  await A.click('.pk-net-btn'); await sleep(300);
  const frozen = await A.evaluate(() => window.__game.player.frozen);
  check(frozen === true, 'player is frozen while the card is open');
  const cardText = await A.evaluate(() => document.querySelector('.pk-net-card')?.textContent || '');
  check(cardText.includes(`Room ${CODE} · 2 playing`) && cardText.includes('Leave'), 'card shows "Room CODE · 2 playing" and Leave');
  await A.screenshot({ path: 'shots/net-lobby.png' });
  await A.keyboard.press('Escape'); await sleep(200);
  check((await A.evaluate(() => window.__game.player.frozen)) === false, 'Escape closes the card and unfreezes');

  const P = await openPage(browser, 'Pip', '#9b59b6', '?skipCreator=1', { width: 390, height: 844 });
  await P.click('.pk-net-btn'); await sleep(300);
  await P.locator('.pk-net-code').pressSequentially('ab1c!d');
  check((await P.inputValue('.pk-net-code')) === 'ABCD', 'code input uppercases and strips non-letters');
  await P.click('.pk-net-row .pk-new'); await sleep(100);
  const generated = await P.inputValue('.pk-net-code');
  check(/^[B-DF-HJ-NP-TV-XZ]{4}$/.test(generated), `New code gives 4 consonants: ${generated}`);
  await P.screenshot({ path: 'shots/net-lobby-phone.png' });
  await P.context().close();

  // Leaving: close B, A should drop the peer and say so.
  await B.context().close();
  await A.waitForFunction(() => window.__game?.net?.peerMap.size === 0, null, { timeout: 20000, polling: 250 }).catch(() => {});
  const a3 = await netInfo(A);
  check(a3.size === 0, 'A dropped B after B closed');
  check(a3.toasts.some((t) => /Bee left/.test(t)), 'A was told Bee left');
  // Leave button clears the saved room.
  await A.evaluate(() => window.__game.net.leave());
  const saved = await A.evaluate(() => localStorage.getItem('pk:room'));
  check(saved === null && a3.room === CODE, 'leave() clears pk:room (it was set while joined)');
  const aErr = A.errors.filter((e) => !isWsNoise(e));
  check(aErr.length === 0, `A had no console errors (${aErr.length})`);
  if (aErr.length) console.log([...new Set(aErr)].slice(0, 8).join('\n'));
  await A.context().close();

  // No internet: joining must fail quietly inside the card, never with toasts, and the game keeps running.
  offline = await chromium.launch({ executablePath: EXE, args: [...ARGS, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
  const D = await openPage(offline, 'Dot', '#5bb0ff');
  const d0 = await netInfo(D);
  check(d0.status === 'idle' && d0.toasts.length === 0, 'offline page starts single player with no network toasts');
  await D.click('.pk-net-btn'); await sleep(200);
  await D.fill('.pk-net-code', 'KPRT'); await D.click('.pk-net-row .pk-join');
  await D.waitForFunction(() => window.__game?.net?.status === 'error', null, { timeout: 25000, polling: 500 }).catch(() => {});
  const d1 = await netInfo(D);
  const cardD = await D.evaluate(() => document.querySelector('.pk-net-card')?.textContent || '');
  check(d1.status === 'error' && cardD.includes("Can't reach the room service here"), `offline join shows the in-card message (status ${d1.status})`);
  check(!d1.toasts.some((t) => /joined|left/i.test(t)), `offline page shows no join/leave toasts: ${JSON.stringify(d1.toasts)}`);
  await D.screenshot({ path: 'shots/net-offline.png' });
  const dErr = D.errors.filter((e) => !isWsNoise(e));
  check(dErr.length === 0, `offline page has no console errors besides the blocked sockets (${dErr.length})`);
  if (dErr.length) console.log([...new Set(dErr)].slice(0, 8).join('\n'));
  check((await D.evaluate(() => window.__game.started && window.__game.renderer.info.render.calls > 0)), 'offline page keeps rendering');
  await D.context().close();
} catch (e) {
  failures.push(String(e)); console.error(e);
  for (const p of pages) if (p.errors.length) console.log(`${p.label} errors:\n` + [...new Set(p.errors)].slice(0, 8).join('\n'));
} finally {
  await browser.close(); await offline?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
  await sleep(300);
  rmSync(outDir, { recursive: true, force: true });
  const viteErrors = serverLog.split('\n').filter((l) => /error/i.test(l));
  if (viteErrors.length) { console.log('--- vite log errors ---'); console.log(viteErrors.join('\n')); }
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
  process.exit(failures.length ? 1 : 0);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomCode() { const L = 'BCDFGHJKLMNPQRSTVWXZ'; let s = ''; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)]; return s; }
