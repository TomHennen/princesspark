// Dialogue content for the princesses (and ambient NPCs), branched on quest state and on player choices.
// The princesses are ARCHETYPES: p1 = warm, clever big-sister type with real tips; p2 = bubbly hype type.
// Names, colors, catchphrases and the park name come only from settings (game.settings) at call time —
// nothing is cached at module load, so a settings:change is reflected in the very next conversation.
//
// API: getDialogue(npcId, quests, playerName, settings?)        -> string[] | DialogueNode
//      getAmbientDialogue(npcId, quests, playerName, settings?) -> string[] | DialogueNode
//
// DialogueNode = { lines: string[], choices?: [{ label, sub?, next }] }   (2–4 choices, every line <= 110 chars)
//   `next` is a DialogueNode, a plain string[] (shorthand for { lines }), a function returning either (built
//   lazily so trees can loop back to a hub), or null/undefined to end the conversation after this node.
//   Walk it with walkDialogue() below, or by hand with game.ui.dialogue(lines, { choices }).
import { ACCESSORY_NAMES, RIDE_IDS, GEM_TOTAL } from '../quests/quests.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';

const GEM_WORD = { 12: 'Twelve', 14: 'Fourteen' }[GEM_TOTAL] || String(GEM_TOTAL);
const ITEM_WORDS = { needoh: 'a Needoh', balloon: 'a balloon', wand: 'a glow wand', plushie: 'a flamingo plushie', iceCream: 'an ice cream', cottonCandy: 'cotton candy', pretzel: 'a pretzel', lemonade: 'a lemonade' };

const RIDE_NAMES = {
  coaster: "Dragon's Breath Coaster", logflume: 'Gator Gulch Log Flume', carousel: 'Royal Carousel', ferris: 'Sunshine Wheel',
  teacups: 'Tipsy Teacups', lightcycle: 'Grid Riders', motorcycle: 'Thunder Bikes',
  waterslide: 'Flamingo Falls', lazyriver: 'Lazy Lagoon River',
};
const RIDE_COUNT_WORD = 'nine';
const rideName = (id) => RIDE_NAMES[id] || id;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const accName = (a) => ACCESSORY_NAMES[a] || a;

/** Catchphrase helper: the princess's catchphrase if set, otherwise a fallback word so lines still read naturally. */
export function cp(p, fallback = 'yesss') {
  const c = (p && p.catchphrase || '').trim();
  return c || fallback;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CP = (p, fallback) => cap(cp(p, fallback));          // sentence-start form
const LOUD = (p, fallback) => cp(p, fallback).toUpperCase(); // shouted form
/** Optional trailing ", <catchphrase>" — empty when there is no catchphrase, so the sentence just ends. */
const tail = (p) => (p && p.catchphrase ? `, ${p.catchphrase}` : '');

/** Rough colour word for a hex colour, for flavour like "my sister in purple". */
export function colorWord(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 'colour';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return l > 0.8 ? 'white' : l < 0.2 ? 'black' : 'grey';
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return l > 0.75 ? 'pink' : 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** Resolve "who am I, who is my sister, what's the park called" from settings for a given princess id. */
function ctxFor(npcId, settings, playerName, quests = null) {
  const s = settings || DEFAULT_SETTINGS;
  const list = s.princesses || DEFAULT_SETTINGS.princesses;
  const p1 = list[0] || DEFAULT_SETTINGS.princesses[0];
  const p2 = list[1] || DEFAULT_SETTINGS.princesses[1];
  const me = npcId === 'p1' ? p1 : p2;
  const sis = npcId === 'p1' ? p2 : p1;
  const game = quests?.game;
  const held = game?.player?.config?.held || 'none';
  const weather = game?.world?.weather || s.weather || 'sunny';
  return { name: playerName || 'Explorer', me, sis, p1, p2, park: s.parkName || DEFAULT_SETTINGS.parkName, held, weather, day: quests?.day || 1 };
}
/** Up to one flavour line reacting to what the player holds, else to non-sunny weather (empty array otherwise). */
function flavour(P, c) {
  if (c.held !== 'none' && P.held[c.held]) return [P.held[c.held](c)];
  if (c.weather !== 'sunny' && P.weather[c.weather]) return [P.weather[c.weather](c)];
  return [];
}

// ---------- tree helpers ----------
/** Normalise whatever a `next` resolved to into a node (or null to end). */
export function toNode(x) {
  if (typeof x === 'function') x = x();
  if (!x) return null;
  if (Array.isArray(x)) return { lines: x };
  if (typeof x === 'string') return { lines: [x] };
  return x;
}
/**
 * Walk a dialogue tree with the UI. `show(lines, choices) -> Promise<pickedIndex | undefined>` is normally
 * (lines, choices) => game.ui.dialogue(lines, { speaker, color, choices }). Resolves when the conversation ends.
 */
export async function walkDialogue(tree, show) {
  let node = toNode(tree), guard = 0;
  while (node && guard++ < 40) {
    const choices = Array.isArray(node.choices) && node.choices.length ? node.choices.slice(0, 4) : null;
    const picked = await show(node.lines || [], choices ? choices.map((c, i) => ({ label: c.label, sub: c.sub, value: i })) : null);
    if (!choices) return;
    const ch = choices[Number.isInteger(picked) ? picked : 0] || choices[0];
    node = toNode(ch.next);
  }
}
const node = (lines, choices) => ({ lines, choices });

// ---------- p1: warm, clever, big-sister type, real tips ----------
const P1 = {
  intro: (c) => [
    `Oh, hello! Welcome to ${c.park}, ${c.name}. I'm Princess ${c.me.name}.`,
    `That's my little sister ${c.sis.name} in ${colorWord(c.sis.color)}. We run this park together — co-princesses, equal votes.`,
    `There's a castle up north, a lagoon with real flamingos, ${RIDE_COUNT_WORD} rides and a whole water park out east.`,
    `${GEM_WORD} Royal Gems are hidden around the park. I'll give you hints — a good hint beats a map.`,
    `Finish quests and you unlock accessories in the Dressing Room. Press C or the Avatar button to try them on.`,
  ],
  greet: (c) => [
    `Hi again, ${c.name}. How's the park treating you?`,
    `${c.name}! Good timing — I was just about to go check on the flamingos.`,
    `Welcome back. ${c.sis.name} bet me you'd be back within the hour. I owe her a churro.`,
    `Hello, ${c.name}. Need a tip? I have plenty.`,
  ],
  closer: (c) => [
    `Take your time — the rides run all day.`,
    `If you get lost, head for the castle. You can see it from everywhere.`,
    `${c.sis.name}'s over there if you want the loud version of this advice.`,
    `Come back and tell me when you find something. I love a good report.`,
  ],
  // choice labels
  labels: { rides: 'Tell me about the rides', gems: 'Where are the gems hiding?', next: 'What should I do next?', hi: 'Just saying hi!', silly: 'Tell me a royal secret', more: 'Ask something else', bye: 'Bye!' },
  hubLine: () => pick([`Of course. What would you like to know?`, `Ask away — I know this park by heart.`, `Happy to help. What's on your mind?`]),
  followLine: () => pick([`Anything else?`, `What else can I help with?`, `More questions? I love questions.`]),
  rides: (c) => node([
    `${cap(RIDE_COUNT_WORD)} rides, ${c.name}, and I've tested every one. What kind of fun are you after?`,
  ], null), // choices attached in buildTree
  ridesThrill: (c) => [
    `Dragon's Breath Coaster is up northwest — one big drop, then loops. Keep your eyes open on the drop.`,
    `Thunder Bikes (southeast): three laps on motorcycles. Grid Riders (southwest): light cycles, light walls.`,
    `Gator Gulch Log Flume in the northeast counts too. The front seat gets the splash.`,
  ],
  ridesSplash: (c) => [
    `Splash Cove is the east wing. Walk through the gate and you'll change into a swimsuit — park magic.`,
    `Flamingo Falls is a giant water slide. Lazy Lagoon River is a slow float on a tube — my favourite nap spot.`,
    `Both are gentle enough for anyone, and the flamingos wander over to watch.`,
  ],
  ridesGentle: (c) => [
    `The Royal Carousel is just west of the plaza. Painted horses, organ music, zero screaming.`,
    `The Sunshine Wheel to the east is slow and tall — the view of the castle is the best in the park.`,
    `Tipsy Teacups, south: gentle if you pick Gentle. Do NOT let ${c.sis.name} pick the speed for you.`,
  ],
  gems: (q, c) => [
    `You've found ${q.gemsFound} of ${GEM_TOTAL} Royal Gems. Here's how I'd search:`,
    `North: behind the castle, where the flamingos nap. East: the lagoon shore and behind the Sunshine Wheel.`,
    `West: the quiet side of the coaster and the Grid Riders arena. South: the fence corners near the gates.`,
    `Look for a glowing ring on the ground. That's a gem's little doorstep.`,
  ],
  hi: (c) => [
    pick([`Hi right back, ${c.name}. It's nice to be visited for no reason.`, `Hello, hello. ${c.sis.name} says hi too — she's just saying it louder.`]),
    pick([`The weather's doing its Florida thing: sunshine now, a dramatic cloud later.`, `I fed the flamingos this morning. They're very full and very smug.`]),
  ],
  silly: (c) => pick([
    [`A royal secret? All right. Lean in.`, `The castle throne is a park bench we painted gold. Nobody has noticed. Until now.`, `Also: ${c.sis.name} is scared of the Tipsy Teacups on Turbo. Don't tell her I told you.`],
    [`A secret… okay. The crown jewels are gummy candies. Very shiny gummy candies.`, `And the flamingos aren't park property. They just showed up one day and we gave them name tags.`, `The biggest secret? ${c.sis.name} writes my "clever" tips on my hand before you arrive.`],
  ]),
  hints: {
    'meet': (q, c) => [`Have you met ${c.sis.name} yet? She's right over there in ${colorWord(c.sis.color)}, probably mid-bounce.`, `Say hi to her and you'll have met us both. She'll be thrilled. She's always thrilled.`],
    'first-ride': () => [`Pick any ride to start. The Royal Carousel to the west is a calm one.`, `Walk up to the ride entrance and press E to hop on. X gets you off early.`],
    'gems': (q, c) => {
      const n = q.gemsFound;
      const all = [
        `One gem hides behind the castle where the flamingos nap.`,
        `Try the lagoon shore — something glittery washed up near the water.`,
        `Gems love palm trees. Look under the ones standing a little apart from the others.`,
        `Walk the park fence. Corners are where things get forgotten.`,
        `Peek around the back of the Sunshine Wheel. Big rides cast big shadows.`,
        `There's one near the Grid Riders arena. ${c.sis.name} found it and put it back for you.`,
        `The far side of the coaster is quiet. Quiet places hide gems.`,
        `Look for the glowing ring on the ground. That's the gem's little doorstep.`,
      ];
      return [`You've found ${n} of ${GEM_TOTAL} Royal Gems.`, all[n % all.length]];
    },
    'ride-all': (q) => {
      const left = RIDE_IDS.filter((r) => !q.state.ridesRidden.includes(r)).map(rideName);
      const list = left.length > 2 ? left.slice(0, 2).join(', ') + '…' : left.join(', ');
      return [`You haven't tried every ride yet. Still waiting on: ${list}.`, `Try them all once and I'll have something royal for you.`];
    },
    'speed-demon': (q, c) => [`Thunder Bikes: three laps to finish. Boost on the straights, ease off before the turns.`, `${c.sis.name} crashes every lap and still finishes. You'll be fine.`],
    'grid-master': (q, c) => [`Grid Riders is ${c.sis.name}'s arena. Collect 10 glowing bits — and don't clip your own light wall.`, `Short, careful turns. Speed comes after you stop crashing.`],
    'thrill-seeker': (q) => [`The coaster wants you three times. You've done ${q.progress('thrill-seeker').progress}.`, `Keep your eyes open on the first drop. That's the whole point of it.`],
    'royal': () => [`You're so close. One more quest and the Royal Keys are yours.`],
  },
  allDone: (c) => [`Everything on today's list is done, ${c.name}. Go home and sleep — your bed is in the little house by the entrance.`, `Tomorrow there'll be a brand new list. I've already written it. Don't peek.`],
  // Day 2+: the morning briefing mentions the day's first quests (titles come from quests, names from settings).
  dayGreet: (c, titles) => [
    pick([`Good morning, ${c.name}! Day ${c.day} at ${c.park}. I've got today's list right here.`, `Day ${c.day}, ${c.name}! ${c.sis.name} woke me up at dawn to write today's quests.`]),
    titles.length > 1 ? `First: ${titles[0]}. Then: ${titles[1]}.` : titles.length ? `Today: ${titles[0]}.` : `You've already finished today's list. Show-off.`,
    `Ask me "what should I do next" any time and I'll point you the right way.`,
  ],
  held: {
    balloon: (c) => `Is that a balloon? Hold on tight — the wind off the lagoon steals three a day.`,
    plushie: (c) => `A flamingo plushie! The real ones are jealous. Don't let them see it.`,
    needoh: (c) => `A Needoh. ${c.sis.name} squished hers until it begged for mercy. Be gentler.`,
    wand: (c) => `A glow wand! Wave it near the castle tonight; the walls sparkle back. Park magic.`,
    iceCream: (c) => `Ice cream before noon? I approve. Eat it before the Florida sun does.`,
    cottonCandy: (c) => `Cotton candy! The pink cloud. Eat it quick before it gets sticky in this heat.`,
    pretzel: (c) => `A warm pretzel. Smart. Salt for the heat, carbs for the coaster.`,
    lemonade: (c) => `Lemonade! Extra sour, I hope. ${c.sis.name} drinks hers through her teeth.`,
  },
  weather: {
    cloudy: () => `Nice and cloudy today. Easier on the eyes, and the flamingos nap more.`,
    rain: () => `Rain! Classic Florida. It'll pass in twenty minutes — the rides run anyway.`,
    storm: () => `A proper storm. Stay off the Sunshine Wheel for a bit and watch the lightning from the gazebo.`,
    sunset: () => `Sunset at the park. My favourite hour — the castle goes gold. Ride the wheel now.`,
    night: () => `Night time! The lights are on, the coaster glows, and nobody has to go to bed. Except you, eventually.`,
  },
  react: (id, q, c) => {
    const acc = (QUEST_REWARDS[id] || []).map(accName).join(' and ');
    const done = q.questById?.(id);
    const doneTitle = done ? q.title(done) : id.replace(/^d\d+-/, '').replace(/-/g, ' ');
    const base = {
      'meet': [`You met us both! Officially a friend of the court, ${c.name}.`, `I slipped a Halo into your Dressing Room. Press C or tap Avatar to put it on.`],
      'first-ride': [`First ride done! How was it? I always keep my eyes open on the drops.`, `Eight more rides to go if you want the full tour.`],
      'gems': [`All ${GEM_TOTAL} Royal Gems! I honestly thought that would take you a week.`, `Fairy Wings are waiting in the Dressing Room (press C). You earned the flutter.`],
      'ride-all': [`Every single ride. That's a complete tour of ${c.park}, ${c.name}.`, `A Royal Crown and a Wizard Hat are yours — Dressing Room, press C. Pick one or alternate.`],
      'speed-demon': [`Three laps on Thunder Bikes! ${c.sis.name} is going to be unbearable about this.`, `Cool Shades unlocked. Perfect for pretending you didn't just scream.`],
      'grid-master': [`Ten bits on the Grid. You've got a steadier hand than my sister.`, `Cat Ears are in your Dressing Room now. Press C to try them.`],
      'thrill-seeker': [`Three times on Dragon's Breath? You are braver than I am.`, `A Hero Cape is yours. It flutters when you run — very dramatic.`],
    }[id] || (done?.royalDay
      ? [`That's every quest for Day ${done.royalDay}! Go sleep in your bed at the house by the entrance.`, `Tomorrow's list is already written. Rest up.`]
      : [`You finished "${doneTitle}"! Well done.`, acc ? `${acc} unlocked — check the Dressing Room with C.` : `On to the next one — ask me if you need a tip.`]);
    return [`Oh! ${pick(['Wonderful news.', 'Look at you.', 'I heard the fanfare from here.'])}`, ...base];
  },
  finale: (c) => [
    `${c.name}… you did everything. Every ride, every gem, every quest.`,
    `By the power of two very agreeable princesses, we grant you the Royal Keys of ${c.park}.`,
    `That means you're family now. ${c.sis.name}'s already planning your coronation party. There will be churros.`,
    `Thank you for playing with us. Go show off your outfit — press C and go wild.`,
  ],
  royalTalk: (c) => [
    pick([`Keys holder ${c.name}! The park is yours. Mind the flamingos.`, `Everything's unlocked, ${c.name}. Now you just get to play.`]),
    pick([`My favorite spot is the top of the Sunshine Wheel at sunset. Try it.`, `${c.sis.name} still hasn't beaten your Thunder Bikes time. Don't tell her I said that.`]),
    `Come visit any time. The castle's always open to family.`,
  ],
  rideChoiceLabels: ['Thrill rides!', 'Splash Cove water park', 'Something gentle', 'Back'],
  finaleThanks: 'Thank you!!',
};

// ---------- p2: bubbly hype type; sprinkles her catchphrase into most lines when one is set ----------
const P2 = {
  intro: (c) => [
    `${LOUD(c.me, 'yesss')}. A new person! Hi!! I'm ${c.me.name}. Princess ${c.me.name}.`,
    `That's my big sister ${c.sis.name}, the smart one. This is ${c.park}${tail(c.me)}.`,
    `Our park. Castle, lagoon, flamingos, NINE rides, a WATER PARK. Light walls! Motorcycles${tail(c.me)}!`,
    `Okay listen. Grid Riders. Thunder Bikes. You HAVE to${tail(c.me)}.`,
    `Also the coaster. ${CP(c.me, 'Seriously')}. ${LOUD(c.me, 'seriously')}. You HAVE to ride the coaster.`,
    `Do quests, get stuff for your outfit. Press C for the Dressing Room. Go go go, ${c.name}!`,
  ],
  greet: (c) => [
    `${LOUD(c.me, 'yesss')}! ${c.name}! You're back!`,
    `Yooo ${c.name}. ${CP(c.me, 'Okay')}. Did you ride anything yet?`,
    `${c.name}!! ${CP(c.me, 'Okay so')} I just had a churro. Life is good.`,
    `${CP(c.me, 'Hi')}. ${c.name}. Okay. Okay okay okay. Hi.`,
  ],
  closer: (c) => [
    `Go have fun${tail(c.me)}. Then come tell me EVERYTHING.`,
    `${c.sis.name} has the smart hints. I have the hype. Together we are unstoppable${tail(c.me)}.`,
    `Okay I gotta go bother the Churro Chef. Later${tail(c.me) || ', bye'}!`,
    `If you crash on Thunder Bikes it still counts. Trust me${tail(c.me)}, I'd know.`,
  ],
  labels: { rides: 'Tell me about the rides', gems: 'Where are the gems hiding?', next: 'What should I do next?', hi: 'Just saying hi!', silly: "What's your catchphrase?", more: 'Ask something else', bye: 'Bye!' },
  hubLine: (c) => pick([`${CP(c.me, 'Okay')}. Hit me. What do you wanna know?`, `Questions!! I love questions${tail(c.me)}. Go.`, `Ask me ANYTHING. Except math.`]),
  followLine: (c) => pick([`What else${tail(c.me)}? What else what else?`, `More? Say more. I'm ready.`, `${CP(c.me, 'Okay')} anything else?`]),
  rides: (c) => node([`NINE rides${tail(c.me)}. Okay. Okay okay. What do you want: speed, splash, or chill?`], null),
  ridesThrill: (c) => [
    `Thunder Bikes${tail(c.me)}. Motorcycles. Three laps. Southeast corner. GO.`,
    `Grid Riders, southwest: light cycles, light walls, don't hit your own wall. I do. Constantly.`,
    `Dragon's Breath Coaster, northwest. The drop is UNREAL. Hands up${tail(c.me)}.`,
  ],
  ridesSplash: (c) => [
    `Splash Cove is the east wing${tail(c.me)}! You walk in and POOF, swimsuit. Magic. Or a rule. Whatever.`,
    `Flamingo Falls is a GIANT slide. Lazy Lagoon River is floaty and slow. ${c.sis.name} naps on it.`,
  ],
  ridesGentle: (c) => [
    `Royal Carousel, west. Pretty horses. Sunshine Wheel, east. Tall. You can see EVERYTHING.`,
    `Tipsy Teacups, south. Pick Gentle if you're sleepy. Pick TURBO if you're me${tail(c.me)}.`,
    `Gator Gulch Log Flume, northeast. Chill until the drop. Then not chill.`,
  ],
  gems: (q, c) => [
    `${q.gemsFound} gems${tail(c.me)}! Okay here's the cheat sheet. Don't tell ${c.sis.name}.`,
    `Behind the castle up north. The lagoon shore. Behind the Sunshine Wheel. Those are the easy ones.`,
    `Coaster's quiet side, the Grid Riders arena, and the fence corners down south by the gates.`,
    `Glowy ring on the ground = gem. Glowy ring = gem. I'm chanting it so you remember${tail(c.me)}.`,
  ],
  hi: (c) => [
    pick([`HI!! ${c.name}!! Just saying hi is my favourite kind of saying.`, `Hi hi hi${tail(c.me)}! No reason visits are the BEST visits.`]),
    pick([`I'm doing great. I had two churros. ${c.sis.name} says that's "a lot". It's not a lot.`, `The flamingos learned my catchphrase. Okay no they didn't. But they COULD.`]),
  ],
  silly: (c) => (c.me.catchphrase
    ? [
      `My catchphrase? ${LOUD(c.me)}. Obviously.`,
      `It works for everything. Happy? ${cp(c.me)}. Sad? ${cp(c.me)}. Churros? ${LOUD(c.me)}.`,
      `${c.sis.name} says I say it too much. ${CP(c.me)}. See? Can't stop. Won't stop.`,
    ]
    : [
      `My catchphrase? I… don't have one yet?! That is a CRISIS.`,
      `You can give me one! Avatar button, Kingdom tab, type it in. Make it LOUD.`,
      `Until then I'll just go: WOOOO. It's not the same. Hurry.`,
    ]),
  hints: {
    'meet': (q, c) => [`${CP(c.me, 'Hey')}, go say hi to ${c.sis.name}! She's right there looking all wise and stuff.`, `She gives real tips. Mine are mostly "go faster."`],
    'first-ride': (q, c) => [`${LOUD(c.me, 'okay')}. Ride ANYTHING. Thunder Bikes. Grid Riders. Coaster. Teacups if you're feeling spinny.`, `Walk up, press E. That's it. That's the whole tutorial${tail(c.me)}.`],
    'gems': (q, c) => [
      `You've got ${q.gemsFound} gems${tail(c.me)}. ${q.gemsFound >= 6 ? 'Cracked. Actually cracked.' : 'Keep going!!'}`,
      pick([`Look for the glowy ring on the ground${tail(c.me)}. Glowy ring = gem.`, `${c.sis.name} hid one behind the castle. I watched her do it. ${CP(c.me, 'Sneaky')}.`, `Check near the Grid Riders arena${tail(c.me)}. I may have left one there on purpose.`]),
    ],
    'ride-all': (q, c) => {
      const left = RIDE_IDS.filter((r) => !q.state.ridesRidden.includes(r));
      return [`${CP(c.me, 'Hey')} you still haven't done ${left.length} ride${left.length === 1 ? '' : 's'}!`, left.length ? `Start with ${rideName(left[0])}. ${CP(c.me, 'Go')}. Go.` : `Wait, you did them all? ${LOUD(c.me, 'whoa')}.`];
    },
    'speed-demon': (q, c) => [`THUNDER BIKES${tail(c.me)}. Three laps. Hold boost. Lean into turns. Scream a little.`, `Crashing is part of the vibe. Finish the laps${tail(c.me)}.`],
    'grid-master': (q, c) => [`Grid Riders is MY arena${tail(c.me)}. Grab 10 bits. Don't hit your own light wall. I do it constantly.`, `Little turns${tail(c.me)}. Little turns.`],
    'thrill-seeker': (q, c) => [`Coaster three times${tail(c.me)}. You're at ${q.progress('thrill-seeker').progress}. The first drop is UNREAL.`, `Hands up on the drop or it doesn't count. (It counts. But hands up.)`],
    'royal': (q, c) => [`${LOUD(c.me, 'yesss')}. One more quest and you get the Royal Keys!! I'm so hype right now.`],
  },
  allDone: (c) => [`You did EVERYTHING on today's list${tail(c.me)}. Go home, go to BED. Your house is by the entrance.`, `Tomorrow = new quests. I wrote half of them. The silly half.`],
  dayGreet: (c, titles) => [
    pick([`${LOUD(c.me, 'yesss')}! DAY ${c.day}! ${c.name}! New day, new list, let's GO.`, `Morning ${c.name}!! It's Day ${c.day}${tail(c.me) || '.'} ${c.sis.name} made a list. I made it louder.`]),
    titles.length > 1 ? `Okay okay: ${titles[0]}. And ${titles[1]}. GO.` : titles.length ? `Today: ${titles[0]}${tail(c.me)}!` : `Wait, you already did everything?? ${LOUD(c.me, 'whoa')}.`,
  ],
  held: {
    balloon: (c) => `BALLOON${tail(c.me)}!! Don't let go. Don't let go don't let go don't let go.`,
    plushie: (c) => `A flamingo plushie!! Hug it. HUG IT. Okay you're hugging it. ${CP(c.me, 'Yesss')}.`,
    needoh: (c) => `A Needoh${tail(c.me)}! Squish it. Squish it again. I could watch that all day. I have.`,
    wand: (c) => `GLOW WAND. Wave it! Sparkles${tail(c.me)}! ${c.sis.name} says it's "just a light". It is MAGIC.`,
    iceCream: (c) => `ICE CREAM. ${CP(c.me, 'Okay')} you have to eat that NOW, it's melting, go go go.`,
    cottonCandy: (c) => `Cotton candy${tail(c.me)}!! Pink cloud! Eat the cloud! EAT THE CLOUD.`,
    pretzel: (c) => `A pretzel. Respect. Pretzel then Thunder Bikes. That's the combo${tail(c.me)}.`,
    lemonade: (c) => `Lemonade${tail(c.me)}! Is it the extra sour one? Make the face. MAKE THE FACE.`,
  },
  weather: {
    cloudy: (c) => `Cloudy today. Chill vibes${tail(c.me)}. Perfect for the lazy river.`,
    rain: (c) => `RAIN! Puddles${tail(c.me)}! Jump in the puddles. I'm not allowed. You do it for me.`,
    storm: (c) => `STORM. ${LOUD(c.me, 'whoa')}. The lightning is SO cool from the gazebo. Stay off the wheel though.`,
    sunset: (c) => `Sunset${tail(c.me)}! Everything's orange! Go up the Sunshine Wheel RIGHT NOW. Trust me.`,
    night: (c) => `NIGHT MODE${tail(c.me)}! The coaster GLOWS. The castle GLOWS. I glow. Okay I don't. But I feel like I do.`,
  },
  react: (id, q, c) => {
    const done = q.questById?.(id);
    const doneTitle = done ? q.title(done) : id.replace(/^d\d+-/, '').replace(/-/g, ' ');
    const base = {
      'meet': [`You met both of us! ${CP(c.me, 'Yesss')}, that makes you a friend of the castle, ${c.name}.`, `${c.sis.name} gave you a Halo. Press C, Dressing Room, put it on, look angelic${tail(c.me)}.`],
      'first-ride': [`FIRST RIDE DONE. ${CP(c.me, 'So')} how was it. Was it the coaster. Tell me it was the coaster.`, `Okay now do all the rest. ${CP(c.me, 'Go')}.`],
      'gems': [`ALL THE GEMS?? ${CP(c.me, 'Whoa')}. ${LOUD(c.me, 'whoa')}. You're cracked. Certified.`, `Fairy Wings unlocked! Press C and go flutter around${tail(c.me)}.`],
      'ride-all': [`Every ride! ${CP(c.me, 'Okay')} you're basically a park expert now, ${c.name}.`, `Royal Crown AND a Wizard Hat. Dressing Room, press C. ${CP(c.me, 'Wizard')}. Wizard. Hat.`],
      'speed-demon': [`THREE LAPS ON THUNDER BIKES. ${LOUD(c.me, 'yesss')}. We are the same person now.`, `Cool Shades unlocked. Put them on. Press C. Immediately${tail(c.me)}.`],
      'grid-master': [`Ten bits on the Grid! ${CP(c.me, 'Okay')} that's MY arena and you crushed it.`, `Cat Ears${tail(c.me)}. Dressing Room. Press C. Meow.`],
      'thrill-seeker': [`Three coaster rides?! ${CP(c.me, 'Okay')} you're a legend. A LEGEND, ${c.name}.`, `Hero Cape unlocked! It flaps when you run. Press C${tail(c.me)}.`],
    }[id] || (done?.royalDay
      ? [`DAY ${done.royalDay} DONE${tail(c.me)}!! Go to bed! Your house! By the gate! Sleep! Tomorrow = MORE.`]
      : [`You did "${doneTitle}"${tail(c.me)}!`, `Next one! Ask me what's next. I know. I always know. Mostly.`]);
    return [pick([`${LOUD(c.me, 'yesss')}!!`, `${CP(c.me, 'Whoa')}. ${LOUD(c.me, 'whoa')}.`, `Yooooo ${c.name}!!`]), ...base];
  },
  finale: (c) => [
    `${LOUD(c.me, 'yesss')}. ${c.name}. ${LOUD(c.me, 'yesss')}. You did EVERYTHING.`,
    `Every ride, every gem, every quest. ${c.sis.name} says that's never happened before. ${LOUD(c.me, 'wow')}.`,
    `You get the Royal Keys of ${c.park}!! That's the biggest deal there is${tail(c.me)}.`,
    `I'm throwing you a party. Churros. Thunder Bikes. Flamingos invited. ${CP(c.me, 'Okay')} I'm so hype.`,
    `Press C and make your outfit as wild as possible. You earned it${tail(c.me)}.`,
  ],
  royalTalk: (c) => [
    pick([`Royal Keys ${c.name}! ${CP(c.me, 'Yesss')}! Park's yours!`, `${LOUD(c.me, 'yesss')}. The keys holder returns.`]),
    pick([`Race me on Thunder Bikes again${tail(c.me)}. I've been practicing.`, `I put on your wings in the Dressing Room. ${c.sis.name} said that's not how it works. ${CP(c.me, 'Whatever')}.`]),
    `Love you${tail(c.me)}. Go have fun.`,
  ],
  rideChoiceLabels: ['SPEED!!', 'Splash Cove!', 'Chill stuff', 'Back'],
  finaleThanks: 'THANK YOU!!',
};

const QUEST_REWARDS = {
  meet: ['halo'], gems: ['wings'], 'ride-all': ['crown', 'wizardHat'], 'speed-demon': ['sunglasses'], 'grid-master': ['catEars'], 'thrill-seeker': ['cape'],
};

const PRINCESSES = { p1: P1, p2: P2 };
const finaleSeen = new Set();

/** Build the choice tree for a princess. `opening` lines come first, then the main hub choices. */
function buildTree(P, quests, c, opening, { finale = false } = {}) {
  const L = P.labels;
  const bye = () => node([pick(P.closer(c))]);
  // After any topic: ask more, the silly one, or leave.
  const follow = () => node([P.followLine(c)], [
    { label: L.more, next: () => hub([P.hubLine(c)]) },
    { label: L.silly, next: () => node(P.silly(c), [{ label: L.more, next: () => hub([P.hubLine(c)]) }, { label: L.bye, next: bye }]) },
    { label: L.bye, next: bye },
  ]);
  const rides = () => {
    const [thrill, splash, gentle, back] = P.rideChoiceLabels;
    const r = P.rides(c);
    r.choices = [
      { label: thrill, sub: 'coaster · bikes · cycles', next: () => node(P.ridesThrill(c), follow().choices) },
      { label: splash, sub: 'east wing water park', next: () => node(P.ridesSplash(c), follow().choices) },
      { label: gentle, sub: 'carousel · wheel · teacups', next: () => node(P.ridesGentle(c), follow().choices) },
      { label: back, next: () => hub([P.hubLine(c)]) },
    ];
    return r;
  };
  const nextStep = () => {
    const q = quests.activeQuest?.();
    let hint;
    if (!q) hint = P.allDone(c);
    else if (P.hints[q.id]) hint = P.hints[q.id](quests, c);
    else if (q.royalDay) hint = P.hints.royal(quests, c);
    else {
      // day 2+ quests carry their own tip; each princess frames it her way
      const { progress, total } = quests.progress(q.id);
      const title = quests.title(q);
      hint = P === P1
        ? [`Today's job: ${title}. You're at ${progress} of ${total}.`, q.hint || 'You can do it.']
        : [`${CP(c.me, 'Okay')}: ${title}${tail(c.me)}! ${progress}/${total} so far.`, q.hint ? `${q.hint} GO.` : 'GO.'];
    }
    return node([...hint, pick(P.closer(c))].slice(0, 4), follow().choices);
  };
  const hub = (lines) => node(lines, [
    { label: L.rides, sub: 'all nine, plus Splash Cove', next: rides },
    { label: L.gems, sub: `${quests.gemsFound}/${quests.gems?.length || 14} found`, next: () => node(P.gems(quests, c), follow().choices) },
    { label: L.next, next: nextStep },
    { label: L.hi, next: () => node(P.hi(c), [{ label: L.silly, next: () => node(P.silly(c), follow().choices) }, { label: L.bye, next: bye }]) },
  ]);
  if (finale) return node(opening, [{ label: P.finaleThanks, next: () => node(P.royalTalk(c), hub([P.hubLine(c)]).choices) }, { label: L.bye, next: null }]);
  return hub(opening);
}

/**
 * Princess dialogue for npcId 'p1' | 'p2'. Returns a DialogueNode tree (see header). `settings` defaults to
 * quests.game.settings so callers that already hold the game don't need to pass it; nothing is read until this call.
 */
export function getDialogue(npcId, quests, playerName = 'Explorer', settings = quests?.game?.settings) {
  const P = PRINCESSES[npcId];
  if (!P) return [`Hello, ${playerName}!`];
  const c = ctxFor(npcId, settings, playerName, quests);
  const firstMeeting = !quests.state.talkedTo.includes(npcId);
  const recent = quests.takeRecentCompletions?.() || [];
  const extra = flavour(P, c);   // reacts to a held item or the weather

  // Royal finale: big speech once per princess, then relaxed royal small talk (plus the usual topics).
  if (quests.state.royal && c.day === 1) {
    if (!finaleSeen.has(npcId)) { finaleSeen.add(npcId); return buildTree(P, quests, c, P.finale(c), { finale: true }); }
    return buildTree(P, quests, c, [...P.royalTalk(c), ...extra]);
  }
  // React to the most recent quest completion (skip 'royal' — the finale handles it).
  const reactTo = recent.filter((id) => id !== 'royal').pop();
  if (reactTo) return buildTree(P, quests, c, [...P.react(reactTo, quests, c).slice(0, 5), ...extra]);
  if (firstMeeting) return buildTree(P, quests, c, [...P.intro(c), ...extra]);
  // Day 2+: the first chat of the day is a briefing on today's quests (once per princess per day).
  if (c.day > 1 && dayGreeted.get(npcId) !== c.day) {
    dayGreeted.set(npcId, c.day);
    const titles = (quests.remainingToday?.() || []).slice(0, 2).map((q) => quests.title(q));
    return buildTree(P, quests, c, [...P.dayGreet(c, titles), ...extra]);
  }
  return buildTree(P, quests, c, [pick(P.greet(c)), ...extra]);
}
const dayGreeted = new Map();   // npcId -> last day it gave the morning briefing (in-memory)

// ---------- ambient NPCs: a greeting, then "a hint or a joke" ----------
const AMBIENT = {
  guide: {
    open: (q, c) => [
      pick([`Welcome to ${c.park}! Princess Plaza is straight ahead — look for the gazebo.`, `Hi there, ${c.name}! Maps are for tourists; just follow the paths and the music.`]),
      pick([`Tip: hold Shift to run. Press E near anything interesting. X gets you off a ride early.`, `Tip: the princesses at the gazebo give quests. Finish them for new outfit pieces (press C).`]),
    ],
    hint: (q) => [q.gemsFound < GEM_TOTAL ? `The Royal Gems glow with a ring on the ground. Check behind big rides and along the fence.` : `You found every gem? Wow. The princesses must love you.`, `New this season: Splash Cove, the water park out east. Flamingo Falls and the Lazy Lagoon River.`],
    joke: () => pick([[`Why did the flamingo stand on one leg?`, `Because if it lifted the other one, it'd fall over. Classic.`], [`What do you call a princess who loves roller coasters?`, `A thrill-ness. …I'll be here all week.`]]),
  },
  chef: {
    open: (q, c) => [
      pick([`Fresh churros! Cinnamon sugar, extra crunchy. Princess ${c.p2.name} buys six a day.`, `Hey ${c.name}! Churro? They're free. Everything's free here. Best kingdom ever.`]),
    ],
    hint: () => [`Secret: the Tipsy Teacups have a speed chooser. Don't pick the one that says not to. Or do. Don't eat first.`, `Hint: I saw something sparkle behind my stand once. Wasn't a churro.`],
    joke: () => pick([[`What's a churro's favourite ride?`, `The Sugar Wheel. …Okay the Sunshine Wheel. But it should be sugar.`], [`Why don't churros ride the coaster?`, `They'd get twisted. More twisted. They're already pretty twisted.`]]),
  },
  lifeguard: {
    open: (q, c) => [
      pick([`No running on the lagoon deck! …Okay, a little running is fine. Hold Shift.`, `Hey ${c.name}. Water's warm, flamingos are napping, gators are fake. Mostly.`]),
    ],
    hint: () => [`The Gator Gulch Log Flume splashes hardest in the front seat. Just saying.`, `Splash Cove out east is my other patrol. Flamingo Falls is the big slide; Lazy Lagoon River is the float.`],
    joke: () => pick([[`Why did the gator skip the lazy river?`, `Too slow. He wanted the fast lane. There is no fast lane. He left a review.`], [`What's a lifeguard's favourite ride?`, `The log flume. I'm on duty AND on a ride. Nobody can prove otherwise.`]]),
    safety: () => [`Rule one: walk on the deck. Rule two: see rule one.`, `Rule three: if a flamingo is in the water, the flamingo has right of way.`],
  },
  // Splash Cove pool lifeguards (ids 'lifeguard-1', 'lifeguard-2'…): safety tips, kid-funny.
  poolguard: {
    open: (q, c) => [
      pick([`WALK, please! …Oh, you're walking. Great. Hi, ${c.name}. The deck is slippery, the whistle is loud.`, `Hey ${c.name}. Welcome to Splash Cove. No running, no diving, no feeding the pool noodles.`, `${c.name}! I've whistled at ${q.dayStats?.warns || 0} runner${(q.dayStats?.warns || 0) === 1 ? '' : 's'} today. Don't make it more.`]),
      pick([`Hold Shift to run anywhere else in the park. Here? Nope. Here we stroll.`, `Flamingo Falls is the big slide. Sit at the top, press E, scream politely.`]),
    ],
    hint: (q, c) => [pick([`Safety tip: wait thirty minutes after a pretzel before the lazy river. Twenty for lemonade.`, `Safety tip: the wave pool goes whoosh every so often. Hold your hat. Hold your plushie. Hold everything.`, `Safety tip: sunscreen! Reapply after every ride, every snack and every time ${c.p2.name} shouts.`]), `And if I blow the whistle at you — walk. That's it. That's the whole rule.`],
    joke: () => pick([[`Why don't lifeguards ride the coaster?`, `Too many loops, not enough water. I keep reaching for the whistle.`], [`What did the pool say to the runner?`, `"Slow down, I'm shallow." …The pool doesn't talk. But it would.`], [`I asked the flamingo to stop standing in the wave pool.`, `It said it was just getting its one foot wet. Technically allowed.`]]),
    safety: () => [`Pool rules: walk, don't run. Feet first on the slide. Hats off on the wave pool. Smile at the lifeguards.`, `Break one and I whistle. Break two and I whistle LOUDER. There is no three.`],
  },
};
export function getAmbientDialogue(npcId, quests, playerName = 'Explorer', settings = quests?.game?.settings) {
  const a = AMBIENT[npcId] || (String(npcId).startsWith('lifeguard') ? AMBIENT.poolguard : null);
  if (!a) return [`Hi, ${playerName}!`];
  const c = ctxFor('p1', settings, playerName || 'Explorer', quests);
  const choices = [
    { label: 'Got a hint?', next: () => a.hint(quests, c) },
    { label: 'Tell me a joke!', next: () => a.joke(quests, c) },
  ];
  if (a.safety) choices.push({ label: 'What are the rules?', next: () => a.safety(quests, c) });
  return node(a.open(quests, c), choices);
}
