# Princess Park

A Roblox-style 3D browser game: a fantasy princess amusement park in Florida, hosted by two princesses you name yourself. No backend, no accounts, no chat. Everything runs in the browser and saves to the device.

## Play

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173). To play on an iPad or another computer on the same Wi-Fi, use the "Network" URL that Vite prints.

To make a shareable static build:

```bash
npm run build      # outputs dist/
npm run preview    # serves dist/ locally
```

The `dist/` folder can be dropped on any static host (Netlify, GitHub Pages, a USB stick opened through a tiny web server).

## Play together (any Wi-Fi, no server)

Two (or more) computers, tablets or phones can walk around the same park at once, from anywhere — same Wi-Fi or across the internet. There is no game server: the browsers talk to each other directly over WebRTC ([Trystero](https://github.com/dmotz/trystero), bundled into the game) and only use public Nostr relays to find each other. No accounts, no chat, and nothing is stored anywhere.

1. Host the `dist/` build somewhere static (GitHub Pages — this repo has a workflow for it — or any file host), or just run `npm run dev` and share the "Network" URL on your Wi-Fi.
2. Everyone opens the page and presses the **👥 Play together** button (top right).
3. One player presses **New code** (a 4-letter code like `KPRT`), tells the others, and everyone presses **Join room** with the same code. A link with `?room=KPRT` on the end does the same thing.
4. That's it: the others appear as blocky avatars with name tags — walking, jumping, riding the rides, changing outfits. The pill button shows the room code and how many are playing; the last code is remembered so the room reconnects next time (press **Leave** to stop).

Good to know:

- Only positions, animation state and the avatar look are shared. There is no chat and nothing is saved outside each player's own browser.
- Same Wi-Fi always works. Across the internet it works for almost everyone; a few very strict home routers block direct connections — if two players never see each other, a free TURN server can be added later via Trystero's `rtcConfig` / `turnConfig` option in `src/net/net.js`.
- If the room service can't be reached (no internet, or a page host that blocks outside WebSockets — the claude.ai preview link, for example), the card says so and the game simply stays single player.
- Quick self-test with two headless browsers against one dev server: `node tools/net-test.mjs` (needs internet for the signaling relays).

## Kingdom setup

The first time the game opens, the Dressing Room starts on the **Kingdom** tab, where the player picks:

- the **park name** (shown on the entrance arch, the welcome splash and the browser tab),
- a **name**, **favourite colour** and optional **catchphrase** for each of the two princess hosts.

Nothing is hardcoded: the princesses' gowns, dialogue and quest text all follow these choices, and the "Princess 1 / 2 style" presets in the Dressing Room use the chosen colours. Everything can be changed later from the Avatar button (or `C`), and takes effect immediately. These settings are saved only in the browser's localStorage (`pk:settings`) and are never sent anywhere.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD / arrows | left joystick |
| Jump | Space | Jump button |
| Run | Shift | Run button |
| Talk / ride | E | tap the prompt |
| Exit ride | X | Exit button |
| Look | drag the mouse | drag right side |
| Zoom | scroll wheel, or - / = | pinch |
| Camera mode | V (follow / free) | |
| Dialogue choices | 1-4, arrows, Enter | tap |
| Dressing room | C | Avatar button |
| Weather | K | ☀️ button |
| Sit / stand up | E near a bench, X to stand | ★ / Exit buttons |
| Use what you're holding | E (eat, squish, wave) | ✦ button |
| Mute | M | speaker button |

## Things to do

- **Rides** — coaster, log flume, carousel, Ferris wheel, teacups (pick a speed, including one that throws you out), Grid Riders light cycles, Thunder Bikes, and the Splash Cove water park (slide + lazy river, swimsuits on automatically).
- **Quests and days** — each day has a quest list; finish it and sleep in the bed in your cottage (just outside the south gate) to start the next day with new quests. Day 1 unlocks accessories; later days are sillier (get thrown out of the teacups, ride the coaster at night, make the lifeguard yell...).
- **Shops** — the Snack Stand and Souvenir Shop by the plaza give out free snacks and toys (a Needoh to squish, a balloon, a glow wand, a plushie). Eating a snack gives a sugar rush.
- **Playground, flamingo slide, benches** — swings, a slide, a spinner, a seesaw and a climbing frame next to the carousel; a flamingo-shaped slide down from the Flamingo Lookout; every bench and lounger can be sat on.
- **Weather** — sunny, cloudy, rain, storm (with lightning), sunset and night, from the ☀️ button or `K`.
- **Lifeguards** — run near a pool in Splash Cove and you'll hear about it.

## Project layout

- `src/main.js` boots everything and runs the game loop.
- `src/core/` avatar builder, player controller, input, event bus, kingdom settings.
- `src/world/` the park: sky and weather, castle, lagoon, paths, palms, Splash Cove, the playground (`playground.js`), the cottage (`house.js`), gem spots.
- `src/rides/` one file per ride, all extending `Ride.js`. `index.js` holds the park layout table.
- `src/npcs/` the two princess hosts and ambient characters plus dialogue.
- `src/quests/` quests per day, hidden gems, unlocks, shops and held items (`items.js`), save data.
- `src/ui/` HUD, dialogue, avatar creator, touch controls, styles.
- `src/audio/` synthesized sound effects and music.
- `tools/screenshot.mjs` headless Chromium harness used to verify the game visually; `tools/playtest.js` and `tools/playtest-days.js` are scripted playthroughs run through it.
- `src/net/` play-together networking: `net.js` (Trystero rooms + remote avatars), `lobby.js` (room-code card), `code.js`; `tools/net-test.mjs` tests it end to end.

See `CONTRACT.md` for the interfaces each module follows.
