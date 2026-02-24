const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  REPO_ROOT,
  deterministicBfsSample,
  makeDatasetJson,
  writeDatasetJson,
  runCommand,
} = require('./utils.ts');

const HERO_SOURCE_DATASET = path.join(
  REPO_ROOT,
  'apps',
  'showcase',
  'public',
  'datasets',
  'benchmark-bu4p-g00100-01.json',
);

const HERO_SOURCE_URL = 'https://graphdrawing.unipg.it/data.html';
const HERO_LICENSE_NAME = 'Graph Drawing benchmark terms (publicly available datasets as stated on source hub)';
const HERO_LICENSE_URL = 'https://graphdrawing.unipg.it/data.html';
const HERO_ATTRIBUTION = 'Derived from BU4P benchmark graph from GraphDrawing data hub.';

async function ensureTopoloomDist() {
  const distEntry = path.join(REPO_ROOT, 'packages', 'topoloom', 'dist', 'layout', 'index.js');
  if (fs.existsSync(distEntry)) return;
  runCommand('pnpm', ['-C', path.join(REPO_ROOT, 'packages', 'topoloom'), 'build'], {
    stdio: 'inherit',
  });
}

function fallbackHeroGraph() {
  const nodes = Array.from({ length: 16 }, (_, i) => String(i));
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [0, 4], [1, 5], [2, 6], [3, 7],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [4, 8], [5, 9], [6, 10], [7, 11],
    [8, 9], [9, 10], [10, 11], [11, 8],
    [8, 12], [9, 13], [10, 14], [11, 15],
    [12, 13], [13, 14], [14, 15], [15, 12],
  ];
  return { nodes, edges };
}

function loadHeroSourceGraph() {
  if (!fs.existsSync(HERO_SOURCE_DATASET)) {
    return fallbackHeroGraph();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(HERO_SOURCE_DATASET, 'utf8'));
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return fallbackHeroGraph();
    }
    return {
      nodes: parsed.nodes.map((x) => String(x)),
      edges: parsed.edges
        .map((e) => (Array.isArray(e) && e.length >= 2 ? [Number(e[0]), Number(e[1])] : null))
        .filter((e) => e && Number.isInteger(e[0]) && Number.isInteger(e[1]))
        .map((e) => [Math.min(e[0], e[1]), Math.max(e[0], e[1])]),
    };
  } catch {
    return fallbackHeroGraph();
  }
}

function toSerializableLayout(layout, edgeList) {
  const positions = [];
  for (const [id, point] of layout.positions.entries()) {
    positions.push([id, { x: Number(point.x), y: Number(point.y) }]);
  }
  positions.sort((a, b) => a[0] - b[0]);

  const edgeRoutes = [];
  for (const edgePath of layout.edges) {
    const edgeEndpoints = edgeList[edgePath.edge] ?? [0, 0];
    edgeRoutes.push({
      edge: [edgeEndpoints[0], edgeEndpoints[1]],
      points: edgePath.points.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
      bends: Math.max(0, edgePath.points.length - 2),
    });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [, p] of positions) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  for (const route of edgeRoutes) {
    for (const p of route.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  return {
    positions,
    edgeRoutes,
    bbox: { minX, minY, maxX, maxY },
  };
}

async function buildHero() {
  const full = loadHeroSourceGraph();
  const sampled = deterministicBfsSample({
    nodes: full.nodes,
    edges: full.edges,
    seed: 5,
    maxNodes: 90,
    maxEdges: 260,
  });

  const heroDataset = makeDatasetJson({
    id: 'hero-graph',
    name: 'Hero Graph Sample',
    sourceUrl: HERO_SOURCE_URL,
    licenseName: HERO_LICENSE_NAME,
    licenseUrl: HERO_LICENSE_URL,
    attribution: HERO_ATTRIBUTION,
    note: 'Precomputed landing sample graph used for instant split-view rendering.',
    nodes: sampled.nodes,
    edges: sampled.edges,
  });
  writeDatasetJson('hero.json', heroDataset);

  await ensureTopoloomDist();

  const graphMod = await import(pathToFileURL(path.join(REPO_ROOT, 'packages', 'topoloom', 'dist', 'graph', 'index.js')).href);
  const planarityMod = await import(pathToFileURL(path.join(REPO_ROOT, 'packages', 'topoloom', 'dist', 'planarity', 'index.js')).href);
  const embeddingMod = await import(pathToFileURL(path.join(REPO_ROOT, 'packages', 'topoloom', 'dist', 'embedding', 'index.js')).href);
  const layoutMod = await import(pathToFileURL(path.join(REPO_ROOT, 'packages', 'topoloom', 'dist', 'layout', 'index.js')).href);

  const builder = new graphMod.GraphBuilder();
  for (const label of sampled.nodes) {
    builder.addVertex(label);
  }
  for (const [u, v] of sampled.edges) {
    builder.addEdge(u, v, false);
  }
  const graph = builder.build();

  const planarity = planarityMod.testPlanarity(graph, {
    treatDirectedAsUndirected: true,
    allowSelfLoops: 'ignore',
  });

  let layoutResult;
  let mode;
  let crossings = 0;

  if (planarity.planar) {
    const mesh = embeddingMod.buildHalfEdgeMesh(graph, planarity.embedding);
    try {
      layoutResult = layoutMod.orthogonalLayout(mesh);
      mode = 'orthogonal';
    } catch {
      layoutResult = layoutMod.planarStraightLine(mesh);
      mode = 'planar-straight';
    }
    crossings = 0;
  } else {
    const planarized = layoutMod.planarizationLayout(graph, { mode: 'orthogonal' });
    layoutResult = planarized.layout;
    mode = 'planarization-orthogonal';
    crossings = Number(planarized.layout.stats.crossings ?? 0);
  }

  const serialLayout = toSerializableLayout(layoutResult, sampled.edges);

  const heroLayoutPayload = {
    meta: {
      id: 'hero-layout',
      mode,
      sourceUrl: HERO_SOURCE_URL,
      generatedBy: '@khalidsaidi/topoloom',
      planar: Boolean(planarity.planar),
      crossings,
    },
    ...serialLayout,
  };

  writeDatasetJson('hero-layout.json', heroLayoutPayload);

  return {
    datasetId: 'hero',
    mode,
    crossings,
    nodes: sampled.nodes.length,
    edges: sampled.edges.length,
    layoutEdges: serialLayout.edgeRoutes.length,
  };
}

module.exports = {
  buildHero,
};

if (require.main === module) {
  buildHero()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
