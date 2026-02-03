import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const outDir = process.env.OUT_DIR || 'docs/screenshots/npm';
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  { name: 'hero', url: `${base}/?embed=1` },
  { name: 'planarity', url: `${base}/demos/planarity?embed=1&autorun=1&preset=k33` },
  { name: 'dual', url: `${base}/demos/dual-routing?embed=1&autorun=1&preset=grid` },
  { name: 'orthogonal', url: `${base}/demos/orthogonal?embed=1&autorun=1&preset=cube` },
  { name: 'planarization', url: `${base}/demos/planarization?embed=1&autorun=1&preset=k5` },
];

async function waitReady(page) {
  await page.waitForSelector('[data-testid="demo-capture"]', { timeout: 60000 });
  const readySel = '[data-testid="demo-ready"][data-ready="1"], [data-testid="demo-ready"][content="1"]';
  const viewportSel = '[data-testid="viewport"] svg';

  await Promise.race([
    page.waitForSelector(readySel, { timeout: 60000 }).catch(() => {}),
    page.waitForSelector(viewportSel, { timeout: 60000 }).catch(() => {}),
  ]);

  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const s of shots) {
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 60000 });
    await waitReady(page);

    const frame = await page.$('[data-testid="demo-capture"]');
    const file = path.join(outDir, `${s.name}.png`);
    if (frame) {
      await frame.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: true });
    }
    console.log('saved:', file);
  }

  await browser.close();
})();
