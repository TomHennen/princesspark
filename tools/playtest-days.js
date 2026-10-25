// Runs inside the page via --eval (node tools/screenshot.mjs --url "?skipCreator=1" --eval "$(cat tools/playtest-days.js)").
// Deterministic round-2 check: finish day 1 by faking events, sleep into day 2, buy + eat a snack and squish a
// Needoh through the real shop menus, get whistled at by a lifeguard, change the weather, then sleep on to day 3/4.
(async () => {
  const g = window.__game, q = g.quests, dt = 1 / 60, log = {}, errors = [];
  const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ').slice(0, 200)); origErr(...a); };
  g.renderer.setAnimationLoop(null);
  const step = (n) => { for (let i = 0; i < n; i++) { g.time += dt; g.player.update(dt); for (const r of g.rides) r._tick(dt, g.time); for (const n of g.npcs) n.update?.(dt, g.time); g.world.update?.(dt, g.time); g.quests.update?.(dt, g.time); g.ui.update(dt, g.time); g.input.endFrame(); } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const events = {}; for (const n of ['quest:complete', 'day:change', 'snack:eat', 'shop:equip', 'item:use', 'lifeguard:warn', 'weather:change', 'gem:found', 'unlock']) g.events.on(n, (p) => (events[n] = events[n] || []).push(p?.id || p?.item || p?.day || p?.npc || p?.weather || p?.accessory || 1));
  const ground = (x, z) => g.world.getGroundHeight(x, z, 1);
  const pickChoice = async (index) => { await wait(250); const btns = [...document.querySelectorAll('.hk-choose .hk-choice')]; const b = btns[index]; if (!b) throw new Error('no choice ' + index + ' of ' + btns.length); b.click(); await wait(500); return btns.map((x) => x.textContent.trim()); };
  // ---- day 1: fake every quest ----
  const rides = ['coaster', 'logflume', 'carousel', 'ferris', 'teacups', 'lightcycle', 'motorcycle', 'waterslide', 'lazyriver', 'coaster', 'coaster'];
  for (const r of rides) g.events.emit('ride:complete', { ride: r, name: r, time: 30 });
  g.events.emit('npc:talk', { npc: 'p1' }); g.events.emit('npc:talk', { npc: 'p2' });
  for (const gem of q.gems) { if (gem.found) continue; g.player.teleport(gem.position.x, gem.position.y, gem.position.z); step(5); }
  log.day1 = { day: q.day, gems: q.gemsFound, completed: q.state.completed.slice(), royal: q.state.royal, objective: q.objectiveText() };
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
  log.day5preview = (await import('/src/quests/quests.js')).questsForDay(5).map((x) => x.id);
  // ---- dialogue sanity: day-2+ briefing + held item line for p1 ----
  const dlg = await import('/src/npcs/dialogue.js');
  const tree = dlg.getDialogue('p1', q, 'Tester', g.settings);
  log.dialogue = tree.lines.slice(0, 4);
  items.setHeld('none'); g.ui.setWeather('night');
  log.dialogue2 = dlg.getDialogue('p2', q, 'Tester', g.settings).lines.slice(0, 4);
  const lg = dlg.getAmbientDialogue('lifeguard-1', q, 'Tester', g.settings);
  log.lifeguardTalk = { lines: lg.lines.length, choices: lg.choices.map((c) => c.label) };
  log.errors = errors.slice(0, 8);
  return JSON.stringify(log);
})()
