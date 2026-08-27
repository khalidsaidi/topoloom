#!/usr/bin/env node
/**
 * TopoLoom showcase benchmark runner.
 *
 * Runs real measurements against the repo's bundled datasets (BU4P benchmark
 * graphs, road-network / power-grid / OSM BFS samples, SuiteSparse circuit
 * samples) and writes the results to src/data/benchmarks.json, which the
 * /benchmarks route and docs/BENCHMARKS.md are generated from.
 *
 * Usage: node scripts/run-benchmarks.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

import { fromEdgeList } from '@khalidsaidi/topoloom/graph';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { planarizationLayout } from '@khalidsaidi/topoloom/layout';

const here = dirname(fileURLToPath(import.meta.url));
const datasetsDir = join(here, '..', 'public', 'datasets');
const outFile = join(here, '..', 'src', 'data', 'benchmarks.json');

const SKIP = new Set(['datasets-build-summary.json']);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const timeIt = (fn, { warmup = 2, reps = 7 } = {}) => {
  for (let i = 0; i < warmup; i += 1) fn();
  const samples = [];
  for (let i = 0; i < reps; i += 1) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return Number(median(samples).toFixed(2));
};

const files = readdirSync(datasetsDir)
  .filter((f) => f.endsWith('.json') && !SKIP.has(f) && !f.includes('-layout') && f !== 'hero-layout.json')
  .sort();

const rows = [];

for (const file of files) {
  const raw = JSON.parse(readFileSync(join(datasetsDir, file), 'utf8'));
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) continue;
  const graph = fromEdgeList(raw.edges.map(([u, v]) => [raw.nodes[u], raw.nodes[v]]));
  const n = graph.vertexCount();
  const m = graph.edges().length;

  const wasmMs = timeIt(() => testPlanarity(graph, { backend: 'wasm' }));
  const tsMs = timeIt(() => testPlanarity(graph, { backend: 'ts' }));
  const result = testPlanarity(graph);
  const planar = result.planar;

  // Planarization layout: the heavy path (maximal planar subgraph via
  // per-edge planarity re-test, then dual-routing insertion + layout).
  // A single timed run after one warmup; it is deterministic and slow
  // enough that run-to-run variance is small relative to magnitude.
  let planarizationMs = null;
  let removedEdges = null;
  let crossings = null;
  try {
    const warm = planarizationLayout(graph);
    removedEdges = warm.remainingEdges.length;
    crossings = warm.routes.reduce((acc, r) => acc + r.crossed.length, 0);
    const t0 = performance.now();
    planarizationLayout(graph);
    planarizationMs = Number((performance.now() - t0).toFixed(0));
  } catch (err) {
    planarizationMs = null;
    console.error(`planarizationLayout failed for ${file}: ${err.message}`);
  }

  const row = {
    id: raw.meta?.id ?? file.replace(/\.json$/, ''),
    name: raw.meta?.name ?? file,
    file,
    n,
    m,
    planar,
    planarityWasmMs: wasmMs,
    planarityTsMs: tsMs,
    planarizationMs,
    removedEdges,
    crossings,
  };
  rows.push(row);
  console.log(
    `${row.id}: n=${n} m=${m} planar=${planar} wasm=${wasmMs}ms ts=${tsMs}ms planarization=${planarizationMs}ms (removed ${removedEdges}, crossings ${crossings})`,
  );
}

rows.sort((a, b) => a.m - b.m);

const payload = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    note: 'Measured under WSL2 on a developer laptop; absolute numbers vary by machine — treat relative shape, not absolutes, as the signal.',
  },
  method: {
    planarity: 'median of 7 runs after 2 warmups, per backend (wasm = Edge-Addition Planarity Suite (Boyer) compiled to WASM, ts = pure-TypeScript left-right test)',
    planarization: 'single timed run after 1 warmup (deterministic)',
  },
  rows,
};

writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nWrote ${outFile}`);
