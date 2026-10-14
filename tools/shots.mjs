// Screenshot sweep of fixed, staged views for art reviews: `npm run shots -- <label> [map]`.
// Each view freezes the same moment (player + bot positions, beams), so before/after sets compare like for like.
// Output: critique/shots/<label>/<view>.png (1280×720, headless Chromium).
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const label = process.argv[2] || 'latest';
const map = process.argv[3] || 'forest';
const VIEWS = {
  forest: {
    hollow: { p: [0, 430], b: [40, 60], fire: true },
    treehouse: { p: [-240, 160], b: [-560, 40] },
    shrine: { p: [320, 80], b: [620, -40], botFire: true },
    ridge: { p: [60, -620], b: [-40, -250], botAir: 70 },
    close: { p: [-60, 120], b: [140, -110], fire: true, botFire: true },
    edge: { p: [-520, 260], b: [-860, 470] },
    cannon: { p: [180, 760], b: [-60, 600] },
  },
  whiteroom: {
    center: { p: [0, 300], b: [0, -560], fire: true },
    ramp: { p: [420, 0], b: [0, -300], botAir: 40 },
  },
};

const out = `critique/shots/${label}`;
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5299, strictPort: true }, logLevel: 'silent' });
await server.listen();
// Installed Chrome (the bundled Chromium won't spawn on this machine); SwiftShader stands in for a weak GPU.
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
try {
  await page.goto(`http://localhost:5299/?map=${map}`);
  await page.waitForFunction(() => window.arcwarm, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/menu.png` });
  await page.goto(`http://localhost:5299/?debug=start&len=0&map=${map}`);
  await page.waitForFunction(() => window.arcwarm && window.arcwarm.sim, null, { timeout: 120000 });
  for (const [name, view] of Object.entries(VIEWS[map])) {
    await page.evaluate((v) => window.arcwarm.stage(v), view);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}.png` });
    const st = process.env.SHOTS_DEBUG
      ? await page.evaluate(() => {
          const g = window.arcwarm;
          return JSON.stringify({ state: g.state, sim: g.sim.state, hits: g.sim.player.stats.hits, flash: +g.botModel.flash.toFixed(2), op: g.botModel.shieldMat.opacity, cross: g.hud.lastCross, hitT: +g.hud.hitT.toFixed(2) });
        })
      : '';
    console.log(`shot ${out}/${name}.png ${st}`);
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.log('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
