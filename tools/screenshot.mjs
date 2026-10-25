// Headless screenshot harness. Usage:
//   node tools/screenshot.mjs [--url "?skipCreator=1&tp=coaster"] [--out shots/name.png] [--wait 2500] [--eval "js"] [--keys "KeyW:1500,Space:100"] [--vw 390 --vh 844] [--touch]
// Builds nothing; expects `npx vite --port 5173` running OR starts its own preview of dist/. Prints console errors.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] ?? '']] : a), []));
const url = args.url ?? '?skipCreator=1';
const out = args.out || 'shots/shot.png';
const wait = Number(args.wait || 2500);
mkdirSync(path.dirname(out), { recursive: true });

const EXE = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome`;
let server = null, base = args.base || 'http://localhost:5173/';
if (!args.base) {
  const port = 5200 + Math.floor(Math.random() * 600);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore', detached: true });
  base = `http://localhost:${port}/`;
  await new Promise((r) => setTimeout(r, 2500));
}
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
// --vw/--vh set the viewport (default 1280x720); --touch emulates a touch device (hasTouch + isMobile, coarse pointer).
const touch = 'touch' in args;
const page = await browser.newPage({ viewport: { width: Number(args.vw || 1280), height: Number(args.vh || 720) }, hasTouch: touch, isMobile: touch && !('desktop' in args), deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
try {
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 20000, polling: 100 }).catch(() => errors.push('[harness] game did not start within 20s'));
  if (args.keys) {
    for (const spec of args.keys.split(',')) {
      const [code, ms] = spec.split(':');
      await page.keyboard.down(code); await page.waitForTimeout(Number(ms || 500)); await page.keyboard.up(code);
    }
  }
  if (args.eval) { const r = await page.evaluate(args.eval); console.log('eval:', JSON.stringify(r)); }
  await page.waitForTimeout(wait);
  const stats = await page.evaluate(() => { const g = window.__game; return g ? { started: g.started, drawCalls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, player: g.player && [g.player.position.x, g.player.position.y, g.player.position.z].map((n) => +n.toFixed(1)), state: g.player?.state } : null; });
  console.log('stats:', JSON.stringify(stats));
  await page.screenshot({ path: out });
  console.log('saved', out);
} finally {
  if (errors.length) { console.log('--- console errors/warnings ---'); console.log([...new Set(errors)].slice(0, 30).join('\n')); }
  await browser.close();
  if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } }
}
