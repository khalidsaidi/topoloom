#!/usr/bin/env node
/**
 * Post-build prerender for the showcase.
 *
 * The SPA serves dist/index.html for every route via the Firebase rewrite, so
 * crawlers and link fetchers see only the landing metadata. Firebase Hosting
 * serves exact-match static files BEFORE applying rewrites, so this script
 * writes route-specific dist/<route>/index.html variants with their own
 * <title>, meta description, canonical URL, og/twitter tags, and
 * crawler-visible static content. The React app takes over identically on
 * load (BrowserRouter reads location.pathname).
 *
 * Also emits dist/sitemap.xml. Runs as part of `pnpm build`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const ORIGIN = 'https://topoloom.web.app';

const benchmarks = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'benchmarks.json'), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtMs = (ms) => (ms === null || ms === undefined ? '—' : `${ms} ms`);

const benchmarkTable = () => {
  const rows = benchmarks.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.id)}</td><td>${r.n}</td><td>${r.m}</td><td>${r.planar ? 'yes' : 'no'}</td><td>${fmtMs(
          r.planarityWasmMs,
        )}</td><td>${fmtMs(r.planarityTsMs)}</td><td>${fmtMs(r.planarizationMs)}</td></tr>`,
    )
    .join('\n');
  return `<table style="border-collapse: collapse; font-size: 14px; width: 100%">
<thead><tr><th align="left">Dataset</th><th align="right">n</th><th align="right">m</th><th align="left">Planar</th><th align="right">testPlanarity WASM</th><th align="right">testPlanarity TS</th><th align="right">planarizationLayout</th></tr></thead>
<tbody>${rows}</tbody></table>`;
};

const routes = [
  {
    path: '/getting-started',
    title: 'Getting Started — TopoLoom Planar Graph Layout for JS/TS',
    description:
      'Install @khalidsaidi/topoloom and run your first planarity test in a few lines: planar embeddings with rotation systems, K5/K3,3 witnesses for non-planar graphs, then SPQR decomposition and orthogonal layout.',
    content: `
<h1 style="font-size: 32px; margin: 8px 0 16px">Getting started with TopoLoom</h1>
<p style="font-size: 16px; line-height: 1.6; color: #cbd5e1">TopoLoom is a planar graph layout and orthogonal drawing library for JavaScript and TypeScript. Install it, then use the kernel as a topology engine first and feed its outputs into geometry pipelines.</p>
<pre style="background: #1e293b; padding: 12px 16px; border-radius: 8px; font-size: 14px; overflow-x: auto">pnpm add @khalidsaidi/topoloom
# or npm i @khalidsaidi/topoloom</pre>
<p style="font-size: 16px; line-height: 1.6; color: #cbd5e1">Minimal planarity check:</p>
<pre style="background: #1e293b; padding: 12px 16px; border-radius: 8px; font-size: 14px; overflow-x: auto">import { graph, planarity } from '@khalidsaidi/topoloom';

const g = graph.fromEdgeList([
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'a'],
]);

const result = planarity.testPlanarity(g);
if (result.planar) {
  console.log('planar', result.embedding); // rotation system
} else {
  console.log('witness', result.witness); // K5 or K3,3 subdivision
}</pre>
<p style="font-size: 16px; line-height: 1.6; color: #cbd5e1">Next steps: convert rotation systems into half-edge structures, build BC/SPQR decompositions to choose embeddings, use the dual graph for routing and edge insertion, and feed topology into straight-line or orthogonal (topology-shape-metrics) layout.</p>
<p style="font-size: 15px; line-height: 2"><a href="/" style="color: #7dd3fc">Home</a> · <a href="/benchmarks" style="color: #7dd3fc">Benchmarks</a> · <a href="https://github.com/khalidsaidi/topoloom" style="color: #7dd3fc">GitHub</a> · <a href="https://www.npmjs.com/package/@khalidsaidi/topoloom" style="color: #7dd3fc">npm</a></p>`,
  },
  {
    path: '/benchmarks',
    title: 'Benchmarks — TopoLoom Planarity & Orthogonal Layout Performance',
    description:
      'Real measured timings for TopoLoom on BU4P graph-drawing benchmarks, road-network, power-grid, and circuit datasets: WASM vs TypeScript planarity backends and planarization layout scaling, including known limits.',
    content: `
<h1 style="font-size: 32px; margin: 8px 0 16px">TopoLoom benchmarks</h1>
<p style="font-size: 16px; line-height: 1.6; color: #cbd5e1">Real measurements on the datasets bundled with this showcase (BU4P benchmark graphs, California road networks, US power grid, downtown San Francisco OSM, SuiteSparse circuit matrices). Planarity times are medians of 7 runs; planarization is a single deterministic run. Measured on ${esc(
      benchmarks.environment.cpu,
    )} under WSL2 — treat relative shape, not absolutes, as the signal.</p>
${benchmarkTable()}
<p style="font-size: 16px; line-height: 1.6; color: #cbd5e1">Guidance: planarity testing is sub-millisecond at this scale with the WASM backend; planarizationLayout is interactive-fine below roughly 500 edges (&lt;~350 ms here) — measure before shipping anything larger, since the maximal-planar-subgraph phase re-runs a planarity test per edge (quadratic-ish growth).</p>
<p style="font-size: 15px; line-height: 2"><a href="/" style="color: #7dd3fc">Home</a> · <a href="/getting-started" style="color: #7dd3fc">Getting started</a> · <a href="https://github.com/khalidsaidi/topoloom" style="color: #7dd3fc">GitHub</a></p>`,
  },
];

const base = readFileSync(join(dist, 'index.html'), 'utf8');

const CONTENT_RE = /<!--prerender:content:start-->[\s\S]*<!--prerender:content:end-->/;

if (!CONTENT_RE.test(base)) {
  console.error('prerender: content markers missing from dist/index.html');
  process.exit(1);
}

const setTag = (html, re, replacement, label) => {
  if (!re.test(html)) {
    console.error(`prerender: could not find ${label}`);
    process.exit(1);
  }
  return html.replace(re, replacement);
};

for (const route of routes) {
  let html = base;
  const url = `${ORIGIN}${route.path}`;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`, 'title');
  html = setTag(
    html,
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${esc(route.description)}$2`,
    'meta description',
  );
  html = setTag(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`, 'canonical');
  html = setTag(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`, 'og:url');
  html = setTag(
    html,
    /(<meta property="og:title" content=")[^"]*(")/,
    `$1${esc(route.title)}$2`,
    'og:title',
  );
  html = setTag(
    html,
    /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
    `$1${esc(route.description)}$2`,
    'og:description',
  );
  html = setTag(
    html,
    /(<meta name="twitter:title" content=")[^"]*(")/,
    `$1${esc(route.title)}$2`,
    'twitter:title',
  );
  html = setTag(
    html,
    /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
    `$1${esc(route.description)}$2`,
    'twitter:description',
  );
  html = html.replace(
    CONTENT_RE,
    `<div style="max-width: 720px; margin: 0 auto; padding: 48px 24px; font-family: system-ui, sans-serif; color: #e2e8f0; background: #0f172a; border-radius: 12px">${route.content}\n</div>`,
  );
  const outDir = join(dist, route.path.replace(/^\//, ''));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`prerender: wrote ${route.path}/index.html`);
}

// Sitemap for the crawlable routes (SPA demo routes share the landing doc, so
// list only the pages with distinct static documents plus key demo URLs).
const sitemapPaths = ['/', '/getting-started', '/benchmarks'];
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths
  .map((p) => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n')}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);
console.log('prerender: wrote sitemap.xml');
