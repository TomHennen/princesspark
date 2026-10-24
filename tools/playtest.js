// Runs inside the page via --eval. Steps the sim deterministically and rides every ride.
(() => {
  const g = window.__game, dt = 1 / 60, log = [];
  const err = []; const origErr = console.error; console.error = (...a) => { err.push(a.join(' ').slice(0, 200)); origErr(...a); };
  g.renderer.setAnimationLoop(null);
  const step = (n) => { for (let i = 0; i < n; i++) { g.time += dt; g.player.update(dt); for (const r of g.rides) r._tick(dt, g.time); for (const n of g.npcs) n.update?.(dt, g.time); g.world.update?.(dt, g.time); g.quests.update?.(dt, g.time); g.ui.update(dt, g.time); g.audio.update?.(dt, g.time); g.input.endFrame(); } };
  const events = []; for (const n of ['ride:board','ride:complete','ride:exit','drive:lap','drive:crash','gem:found','quest:complete','unlock']) g.events.on(n, (p) => events.push(n + ':' + (p.ride || p.id || p.accessory || '')));
  for (const r of g.rides) {
    const s = r.station; g.player.teleport(s.x, g.world.getGroundHeight(s.x, s.z, 1), s.z);
    step(10);
    g.player.boardRide(r);
    if (r.setMode) { r.setMode('wild'); g.ui.closeChoose?.(); }
    let frames = 0, maxY = -1e9, minY = 1e9, samples = [];
    const limit = (r.duration || 60) * 60 + 600;
    while (g.player.state === 'riding' && frames < 120 * 60) {
      if (r.kind === 'drive') { g.input.virtual.y = 1; g.input.virtual.x = (frames % 240) < 120 ? 0.35 : -0.2; if (r.id === 'lightcycle' && frames > 60 * 20) { r.score = 10; } if (r.id === 'motorcycle' && frames > 60 * 25) { r.laps = 3; } }
      step(1); frames++;
      const y = g.player.position.y; maxY = Math.max(maxY, y); minY = Math.min(minY, y);
      if (frames % 300 === 0) samples.push([g.player.position.x, y, g.player.position.z].map((n) => +n.toFixed(1)));
    }
    g.input.virtual.y = 0; g.input.virtual.x = 0;
    const exitPos = [g.player.position.x, g.player.position.y, g.player.position.z].map((n) => +n.toFixed(1));
    log.push({ ride: r.id, seconds: +(frames / 60).toFixed(1), stillRiding: g.player.state === 'riding', minY: +minY.toFixed(1), maxY: +maxY.toFixed(1), exitPos, samples: samples.slice(0, 6) });
    if (g.player.state === 'riding') g.player.exitRide(false);
  }
  // gems
  let gemsBefore = g.quests.gemsFound;
  for (const gem of g.quests.gems) { if (gem.found) continue; g.player.teleport(gem.position.x, gem.position.y, gem.position.z); step(20); }
  // npcs
  const talk = g.interactables.filter((i) => i.kind === 'npc').map((i) => i.id || i.label);
  return JSON.stringify({ log, events, gems: [gemsBefore, g.quests.gemsFound], npcs: talk, quests: g.quests.state.completed, errors: err.slice(0, 10) });
})()
