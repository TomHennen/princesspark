// Runs inside the page via --eval (node tools/screenshot.mjs --url "?skipCreator=1&keys=5" --eval "$(cat tools/playtest-days.js)").
// Deterministic round-2 check: finish day 1 by faking events, sleep into day 2, buy + eat a snack and squish a
// Needoh through the real shop menus, get whistled at by a lifeguard, change the weather, then sleep on to day 3/4.
// Round 3: royal keys (?keys=N, +1 per completed day, the castle door at 5), drop + pick up a Needoh, bop an NPC,
// wetScreen() / openChangingRoom().
(async () => {
  const g = window.__game, q = g.quests, dt = 1 / 60, log = {}, errors = [];
  const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ').slice(0, 200)); origErr(...a); };
  g.renderer.setAnimationLoop(null);
  const step = (n) => { for (let i = 0; i < n; i++) { g.time += dt; g.player.update(dt); for (const r of g.rides) r._tick(dt, g.time); for (const n of g.npcs) n.update?.(dt, g.time); g.world.update?.(dt, g.time); g.quests.update?.(dt, g.time); g.ui.update(dt, g.time); g.input.endFrame(); } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const events = {}; for (const n of ['quest:complete', 'day:change', 'snack:eat', 'shop:equip', 'item:use', 'lifeguard:warn', 'weather:change', 'gem:found', 'unlock', 'item:drop', 'item:pickup', 'bop', 'keys:change', 'castle:open']) g.events.on(n, (p) => (events[n] = events[n] || []).push(p?.id || p?.item || p?.day || p?.npc || p?.weather || p?.accessory || p?.keys || 1));
  // ?keys=5 must have set the count before day 1 is faked; reset to 0 so "finish day 1 → 1 key" is checked for real
  log.keysParam = { param: g.params.get('keys'), royalKeys: q.royalKeys, saved: JSON.parse(localStorage.getItem('pk:save') || '{}').royalKeys, hud: g.ui.keysEl?.textContent };
  q.setKeys(0);
  const ground = (x, z) => g.world.getGroundHeight(x, z, 1);
  const pickChoice = async (index) => { await wait(250); const btns = [...document.querySelectorAll('.hk-choose .hk-choice')]; const b = btns[index]; if (!b) throw new Error('no choice ' + index + ' of ' + btns.length); b.click(); await wait(500); return btns.map((x) => x.textContent.trim()); };
  // ---- day 1: fake every quest ----
  const rides = ['coaster', 'logflume', 'carousel', 'ferris', 'teacups', 'lightcycle', 'motorcycle', 'waterslide', 'lazyriver', 'coaster', 'coaster'];
  for (const r of rides) g.events.emit('ride:complete', { ride: r, name: r, time: 30 });
  g.events.emit('npc:talk', { npc: 'p1' }); g.events.emit('npc:talk', { npc: 'p2' });
  for (const gem of q.gems) { if (gem.found) continue; g.player.teleport(gem.position.x, gem.position.y, gem.position.z); step(5); }
  log.day1 = { day: q.day, gems: q.gemsFound, completed: q.state.completed.slice(), royal: q.state.royal, objective: q.objectiveText(), royalKeys: q.royalKeys, hud: g.ui.keysEl?.textContent, royalReward: q.questById('royal').reward.text };
  // ---- sleep → day 2 ----
  const slept = await q.trySleep();
  log.sleep1 = { slept, day: q.day, objective: q.objectiveText(), quests: q.dayQuests().map((x) => `${x.id}:${x.total}`), sunsetGems: q.dayGems.length, saved: JSON.parse(localStorage.getItem('pk:save')).day };
  // sleeping again must be refused (and list what's left)
  const refused = q.trySleep();
  await wait(300);
  log.refused = { result: refused, dialogueOpen: g.ui.dialogueOpen, text: document.querySelector('.hk-dialogue .hk-text')?.textContent?.slice(0, 60) };
  // close the dialogue (advance through its lines)
  for (let i = 0; i < 24 && g.ui.dialogueOpen; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' })); await wait(120); }
  await wait(200);
  // ---- shops: snack ----
  const items = g.items;
  const snack = g.interactables.find((i) => i.id === 'snackStand'), shop = g.interactables.find((i) => i.id === 'souvenirStand');
  log.shops = { snack: snack && [snack.position.x, snack.position.z], shop: shop && [shop.position.x, shop.position.z] };
  g.player.teleport(snack.position.x, ground(snack.position.x, snack.position.z), snack.position.z + 1); step(2);
  const p1 = snack.onInteract();
  log.snackMenu = await pickChoice(2);   // Pretzel
  await p1; await wait(100);
  log.held = items.held;
  g.player.frozen = false; g.player.nearest = null;
  const used = items.use();
  await wait(900);
  log.snack = { used, heldAfter: items.held, snacks: q.dayStats.snacks, eaten: events['snack:eat'] };
  // ---- shops: needoh ----
  const p2 = shop.onInteract();
  log.shopMenu = await pickChoice(0);    // Needoh
  await p2; await wait(100);
  g.player.frozen = false; g.player.nearest = null;
  for (let i = 0; i < 10; i++) items.use();
  // the E key path: press interact with no nearest interactable
  g.input.pressedThisFrame.add('KeyE'); q.update(dt, g.time); g.input.endFrame();
  log.needoh = { held: items.held, squishes: q.dayStats.squishes, progress: q.progress('d2-squish'), equips: events['shop:equip'] };
  // ---- lifeguard: run inside the pool zone ----
  const zone = g.world.poolZones?.[0]; const cx = zone ? (zone.min.x + zone.max.x) / 2 : 150, cz = zone ? (zone.min.z + zone.max.z) / 2 : -30;
  g.player.teleport(cx, ground(cx, cz), cz); step(3);
  g.input.setVirtualAxis(0, 1); g.input.pressVirtual('boost');
  step(90);
  const speedPos = g.player.position.clone();
  for (let k = 0; k < 8; k++) { g.input.setVirtualAxis(0, k % 2 ? 1 : -1); step(60); }   // jog back and forth past the 6 s cooldown → a second warning
  g.input.setVirtualAxis(0, 0); g.input.releaseVirtual('boost');
  const guards = g.npcs.filter((n) => n.id.startsWith('lifeguard-') && n.group.children.length).map((n) => [n.id, +n.group.position.x.toFixed(0), +n.group.position.z.toFixed(0)]);
  log.lifeguard = { warns: q.dayStats.warns, events: (events['lifeguard:warn'] || []).length, guards, playerAt: [+speedPos.x.toFixed(1), +speedPos.z.toFixed(1)], poolZones: g.world.poolZones?.length ?? 'fallback' };
  // ---- weather ----
  g.ui.setWeather('night'); g.ui.setWeather('storm'); g.ui.setWeather('sunny');
  log.weather = { setting: g.settings.weather, world: g.world.weather, changes: q.dayStats.weatherChanges, btn: g.ui.weatherBtn.textContent, worldHasSetWeather: typeof g.world.setWeather };
  // ---- finish day 2 with fake events and sleep on ----
  for (let i = 0; i < 3; i++) g.events.emit('snack:eat', { item: 'pretzel' });
  for (const id of ['swing', 'slide', 'spinner', 'seesaw']) g.events.emit('play', { id });
  for (const id of ['bench-1', 'bench-2', 'bench-3']) g.events.emit('seat:sit', { id });
  g.events.emit('slide:end', { id: 'lookoutSlide' });
  g.events.emit('ride:complete', { ride: 'waterslide', name: 'w' }); g.events.emit('ride:complete', { ride: 'lazyriver', name: 'l' });
  for (const gem of q.dayGems) { if (gem.found) continue; g.player.teleport(gem.position.x, gem.position.y, gem.position.z); step(5); }
  log.day2done = { remaining: q.remainingToday().map((x) => x.id), completed: q.state.completed.filter((x) => x.startsWith('d2')) };
  const slept2 = await q.trySleep();
  log.day3 = { slept: slept2, day: q.day, quests: q.dayQuests().map((x) => `${q.title(x)} (${x.total})`), objective: q.objectiveText() };
  // day 3 checks: teacups throw + night coaster + balloon talks + warns + play-again
  g.events.emit('ride:exit', { ride: 'teacups' }); g.events.emit('player:landed', {});
  g.ui.setWeather('night'); g.events.emit('ride:complete', { ride: 'coaster' });
  items.setHeld('balloon'); g.events.emit('npc:talk', { npc: 'p1' }); g.events.emit('npc:talk', { npc: 'p2' });
  for (let i = 0; i < 3; i++) g.events.emit('lifeguard:warn', {});
  for (const id of ['swing', 'slide', 'spinner', 'seesaw', 'climb']) g.events.emit('play', { id });
  g.events.emit('drive:lap', { ride: 'motorcycle', lapTime: 5 });
  log.day3done = { remaining: q.remainingToday().map((x) => x.id), lapTarget: q.dayStats.lapTarget };
  const slept3 = await q.trySleep();
  log.day4 = { slept: slept3, day: q.day, quests: q.dayQuests().map((x) => `${q.title(x)} (${x.total})`) };
  // source modules are only importable on the dev server; against a `vite preview` build these checks are skipped
  const mod = async (path) => { try { return await import(path); } catch { return null; } };
  const qm = await mod('/src/quests/quests.js');
  log.day5preview = qm ? qm.questsForDay(5).map((x) => x.id) : 'n/a (preview build)';
  // ---- dialogue sanity: day-2+ briefing + held item line for p1 ----
  const dlg = (await mod('/src/npcs/dialogue.js')) || { getDialogue: () => ({ lines: [], choices: null }), getAmbientDialogue: () => ({ lines: [], choices: [] }) };
  const tree = dlg.getDialogue('p1', q, 'Tester', g.settings);
  log.dialogue = tree.lines.slice(0, 4);
  items.setHeld('none'); g.ui.setWeather('night');
  log.dialogue2 = dlg.getDialogue('p2', q, 'Tester', g.settings).lines.slice(0, 4);
  const lg = dlg.getAmbientDialogue('lifeguard-1', q, 'Tester', g.settings);
  log.lifeguardTalk = { lines: lg.lines.length, choices: lg.choices.map((c) => c.label) };
  // ---- round 3: drop + pick up a Needoh ----
  g.player.frozen = false; g.player.nearest = null;
  g.player.teleport(0, ground(0, 40), 40, 0); step(3);
  items.setHeld('needoh');
  const dropped = items.drop();
  step(10);
  const midAir = dropped && [+dropped.group.position.y.toFixed(2), dropped.settled];
  step(200);
  const pickupI = g.interactables.find((i) => i.id === dropped?.id);
  log.drop = { heldAfter: items.held, kind: dropped?.kind, midAir, settled: dropped?.settled, bounces: dropped?.bounces, restPos: dropped && [dropped.group.position.x, dropped.group.position.y, dropped.group.position.z].map((n) => +n.toFixed(2)), onGround: items.dropped.length, pickupLabel: pickupI?.label, events: events['item:drop'] };
  if (pickupI) { g.player.teleport(pickupI.position.x, ground(pickupI.position.x, pickupI.position.z), pickupI.position.z + 0.8); step(2); pickupI.onInteract(); step(2); }
  log.pickup = { held: items.held, onGround: items.dropped.length, interactableGone: !g.interactables.includes(pickupI), events: events['item:pickup'] };
  // the Q key path + balloon float + snack splat + the 8-item cap
  items.setHeld('balloon'); g.input.pressedThisFrame.add('KeyQ'); q.update(dt, g.time); g.input.endFrame(); step(30);
  const balloon = items.dropped.find((d) => d.kind === 'float');
  log.dropQ = { heldAfterQ: items.held, balloonKind: balloon?.kind, balloonY: balloon && +balloon.group.position.y.toFixed(2) };
  step(300);
  items.setHeld('pretzel'); items.drop(); step(120);
  log.splat = { snackLeft: items.dropped.filter((d) => d.kind === 'splat').length, balloonGone: !items.dropped.includes(balloon) };
  for (let i = 0; i < 10; i++) { items.setHeld('plushie'); items.drop(); step(240); }
  log.cap = { onGround: items.dropped.filter((d) => d.kind === 'bounce').length, pickups: g.interactables.filter((i) => String(i.id).startsWith('drop-')).length };
  for (const d of items.dropped.slice()) items.remove(d);
  // ---- round 3: bop an NPC (p1 at the gazebo; stand 1.5 m south of her facing north = -z = facing π) ----
  const p1npc = g.npcs.find((n) => n.id === 'p1');
  g.player.teleport(p1npc.group.position.x, ground(p1npc.group.position.x, p1npc.group.position.z + 1.5), p1npc.group.position.z + 1.5, Math.PI); step(2);
  g.player.frozen = false; g.player.nearest = null;
  items.setHeld('balloon');
  const target = items.bopTarget();
  const bopHit = items.use();
  step(12);
  const wob = { rz: +p1npc.group.rotation.z.toFixed(3), sx: +p1npc.group.scale.x.toFixed(3), bopStart: p1npc.bopStart };
  step(60);
  log.bop = { target: target && { kind: target.kind, id: target.id }, used: bopHit, events: events['bop'], wobbleMidway: wob, wobbleAfter: { rz: +p1npc.group.rotation.z.toFixed(3), sx: +p1npc.group.scale.x.toFixed(3), bopStart: p1npc.bopStart }, toast: [...document.querySelectorAll('.hk-toast')].map((t) => t.textContent).find((t) => t.startsWith(p1npc.name)) };
  // facing away → no target (only the swing)
  g.player.teleport(g.player.position.x, g.player.position.y, g.player.position.z, 0); step(2);
  log.bopMiss = { target: items.bopTarget() };
  items.setHeld('none');
  // ---- round 3: royal keys → castle door ----
  const door = g.interactables.find((i) => i.id === 'castleDoor');
  log.door = { at: door && [door.position.x, +door.position.y.toFixed(2), door.position.z], landmark: !!g.world.landmarks?.castleDoor, sub: door?.sub, worldCastle: typeof g.world.castle?.setDoorOpen };
  g.player.teleport(door.position.x, door.position.y, door.position.z + 1); step(2); g.player.frozen = false; g.player.nearest = null;
  q.setKeys(2);
  const locked = door.onInteract(); await wait(400);
  log.doorLocked = { dialogueOpen: g.ui.dialogueOpen, text: document.querySelector('.hk-dialogue .hk-text')?.textContent?.slice(0, 80), castleOpen: q.castleOpen };
  for (let i = 0; i < 12 && g.ui.dialogueOpen; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' })); await wait(120); }
  await locked; await wait(150);
  q.setKeys(5);
  const dayBefore = q.dayQuests().map((x) => x.id);
  const opening = door.onInteract();
  await wait(600);
  log.doorOpening = { titleCard: document.querySelector('.hk-title-card h1')?.textContent, castleOpen: q.castleOpen, worldDoorOpen: g.world.castle?.doorOpen ?? 'no world.castle yet' };
  await opening; await wait(200);
  g.events.emit('seat:sit', { id: 'throneL' }); step(2);
  log.castle = { castleOpen: q.castleOpen, saved: JSON.parse(localStorage.getItem('pk:save')).castleOpen, savedKeys: JSON.parse(localStorage.getItem('pk:save')).royalKeys, crown: q.isUnlocked('crown'), events: events['castle:open'], hud: g.ui.keysEl?.textContent, throneQuest: q.dayQuests().filter((x) => /throne/.test(x.id)).map((x) => `${x.id}:${q.progressOf(x)}/${x.total}:${q.isComplete(x.id)}`), dayBefore, doorSub: door.sub, p1keysLine: dlg.getDialogue('p1', q, 'Tester', g.settings).choices?.map((c) => c.label) };
  // ---- round 3: wetScreen + openChangingRoom + Playground Pal ----
  const wet = g.ui.wetScreen();
  log.wet = { el: !!wet, drops: wet?.children.length, show: wet?.classList.contains('show') };
  g.player.teleport(0, ground(0, 40), 40); step(2); g.player.frozen = false;
  const cr = g.ui.openChangingRoom();
  await wait(1200);
  log.changing = { creatorOpen: !!document.querySelector('.hk-creator'), outfitNow: g.player.config.outfit, override: g.player.outfitOverride };
  document.querySelector('.hk-creator .hk-play')?.click();
  const crRes = await cr; await wait(100);
  log.changing2 = { result: crRes?.outfit, outfitAfter: g.player.config.outfit, savedOutfit: g.player._savedOutfit, storedOutfit: JSON.parse(localStorage.getItem('pk:avatar')).outfit, menuOpen: g.ui.menuOpen, frozen: g.player.frozen };
  const pal = g.npcs.find((n) => n.id === 'pal');
  const palHome = pal && [+pal.group.position.x.toFixed(1), +pal.group.position.z.toFixed(1)];
  g.events.emit('spinner:push:start', { position: { x: 33.5, y: 0, z: 85.5 }, duration: 3 }); step(90);
  const palMid = pal && { mode: pal.mode, at: [+pal.group.position.x.toFixed(1), +pal.group.position.z.toFixed(1)], armX: +pal.avatar.parts.armR.rotation.x.toFixed(2) };
  g.events.emit('spinner:push:end', {}); step(120);
  log.pal = { home: palHome, mid: palMid, after: pal && { mode: pal.mode, at: [+pal.group.position.x.toFixed(1), +pal.group.position.z.toFixed(1)] }, talk: dlg.getAmbientDialogue('pal', q, 'Tester', g.settings).lines.length };
  log.errors = errors.slice(0, 8);
  return JSON.stringify(log);
})()
