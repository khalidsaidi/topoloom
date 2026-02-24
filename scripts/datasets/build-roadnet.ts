const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  REPO_ROOT,
  downloadCached,
  gunzipFileToText,
  parseSnapEdgeList,
  normalizeGraph,
  deterministicBfsSample,
  computeStats,
  makeDatasetJson,
  writeDatasetJson,
  runCommand,
} = require('./utils.ts');

const SOURCE_URL = 'https://snap.stanford.edu/data/roadNet-CA.html';
const DATA_URL = 'https://snap.stanford.edu/data/roadNet-CA.txt.gz';
const LICENSE_NAME = 'SNAP dataset terms (source citation requested)';
const LICENSE_URL = 'https://snap.stanford.edu/data/roadNet-CA.html';
const ATTRIBUTION = 'SNAP: Stanford Large Network Dataset Collection (J. Leskovec and A. Krevl).';

async function ensureTopoloomDist() {
  const distEntry = path.join(REPO_ROOT, 'packages', 'topoloom', 'dist', 'layout', 'index.js');
  if (fs.existsSync(distEntry)) return;
  runCommand('pnpm', ['-C', path.join(REPO_ROOT, 'packages', 'topoloom'), 'build'], {
    stdio: 'inherit',
  });
}

function serializeLayout(layout, edgeList, mode) {
  const positions = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [id, point] of layout.positions.entries()) {
    const p = { x: Number(point.x), y: Number(point.y) };
    positions.push([id, p]);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  positions.sort((a, b) => a[0] - b[0]);

  const edgeRoutes = [];
  for (const edgeRoute of layout.edges) {
    const endpoints = edgeList[edgeRoute.edge] ?? [0, 0];
    const points = edgeRoute.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    edgeRoutes.push({
      edge: [endpoints[0], endpoints[1]],
      points,
    });
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  return {
    meta: {
      id: 'roadnet-ca-bfs-340-s23-layout',
      mode,
      sourceUrl: SOURCE_URL,
      note: 'Precomputed TopoLoom layout for instant large-sample loading.',
      precomputed: true,
    },
    layout: {
      mode,
      crossings: Math.max(0, Number(layout.stats.crossings ?? 0)),
      bends: Math.max(0, Number(layout.stats.bends ?? 0)),
      positions,
      edgeRoutes,
      bbox: { minX, minY, maxX, maxY },
    },
  };
}

async function buildLargePrecomputed(sampled) {
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

  let mode = 'orthogonal';
  let layoutResult;
  if (planarity.planar) {
    const mesh = embeddingMod.buildHalfEdgeMesh(graph, planarity.embedding);
    layoutResult = layoutMod.orthogonalLayout(mesh);
  } else {
    mode = 'planarization-orthogonal';
    const planarized = layoutMod.planarizationLayout(graph, { mode: 'orthogonal' });
    layoutResult = planarized.layout;
  }

  const payload = serializeLayout(layoutResult, sampled.edges, mode);
  const outPath = writeDatasetJson('roadnet-ca-bfs-340-s23-layout.json', payload);
  return {
    file: 'roadnet-ca-bfs-340-s23-layout.json',
    outPath,
    mode,
    crossings: payload.layout.crossings,
    bends: payload.layout.bends,
  };
}

async function buildRoadNet() {
  const archivePath = await downloadCached(DATA_URL, 'roadNet-CA.txt.gz');
  const text = gunzipFileToText(archivePath);
  const edgesRaw = parseSnapEdgeList(text);
  const normalized = normalizeGraph(edgesRaw);

  const samples = [
    { id: 'bfs-250-s11', file: 'roadnet-ca-bfs-250-s11.json', maxNodes: 250, maxEdges: 800, seed: 11 },
    { id: 'bfs-340-s23', file: 'roadnet-ca-bfs-340-s23.json', maxNodes: 340, maxEdges: 1200, seed: 23 },
  ];

  const output = [];

  let precomputed = null;

  for (const sample of samples) {
    const sampled = deterministicBfsSample({
      nodes: normalized.nodes,
      edges: normalized.edges,
      seed: sample.seed,
      maxNodes: sample.maxNodes,
      maxEdges: sample.maxEdges,
    });

    const payload = makeDatasetJson({
      id: `roadnet-ca-${sample.id}`,
      name: `roadNet-CA (${sample.id})`,
      sourceUrl: SOURCE_URL,
      licenseName: LICENSE_NAME,
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      note: `Deterministic BFS induced sample from roadNet-CA; seed=${sample.seed}, caps=${sample.maxNodes}/${sample.maxEdges}.`,
      nodes: sampled.nodes,
      edges: sampled.edges,
    });

    const outPath = writeDatasetJson(sample.file, payload);
    output.push({ ...sample, outPath, stats: computeStats(sampled.nodes, sampled.edges) });

    if (sample.id === 'bfs-340-s23') {
      precomputed = await buildLargePrecomputed(sampled);
    }
  }

  return {
    datasetId: 'roadnet-ca',
    sourceUrl: SOURCE_URL,
    licenseName: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    output,
    precomputed,
    originalStats: computeStats(normalized.nodes, normalized.edges),
  };
}

module.exports = {
  buildRoadNet,
};

if (require.main === module) {
  buildRoadNet()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
