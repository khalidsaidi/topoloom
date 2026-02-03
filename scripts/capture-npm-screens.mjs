import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = (process.env.BASE_URL || 'https://topoloom.web.app').replace(/\/+$/, '');
const outDir = process.env.OUT_DIR || 'docs/screenshots';

const sets = [
  { name: 'hero', routes: ['/'] },
  { name: 'planarity', routes: (process.env.PLANARITY || '').split(',').filter(Boolean) },
  { name: 'dual', routes: (process.env.DUAL || '').split(',').filter(Boolean) },
  { name: 'orthogonal', routes: (process.env.ORTHO || '').split(',').filter(Boolean) },
  { name: 'planarization', routes: (process.env.PLANARIZATION || '').split(',').filter(Boolean) },
  { name: 'embedding', routes: (process.env.EMBEDDING || '').split(',').filter(Boolean) },
];

fs.mkdirSync(outDir, { recursive: true });

async function tryRoute(page, routes) {
  for (const r of routes) {
    const url = base + r;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      if (!res) continue;
      const status = res.status();
      if (status < 200 || status >= 400) continue;

      const html = await page.content();
      if (!html.includes('topoloom-smoke')) continue;

      return url;
    } catch {
      // keep trying
    }
  }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const s of sets) {
    const routes = s.routes.length ? s.routes : ['/'];
    const url = await tryRoute(page, routes);
    if (!url) {
      console.warn(`WARN: could not capture '${s.name}' (no matching route worked).`);
      continue;
    }
    await page.waitForTimeout(800);
    const file = path.join(outDir, `${s.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`Captured ${s.name}: ${file} <- ${url}`);
  }

  await browser.close();
})();
