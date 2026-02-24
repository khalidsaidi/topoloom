const {
  fetchText,
  parseWolframSparseArrayGraph,
  normalizeGraph,
  deterministicBfsSample,
  computeStats,
  makeDatasetJson,
  writeDatasetJson,
} = require('./utils.ts');

const SOURCE_URL = 'https://datarepository.wolframcloud.com/resources/Power-Grid-Network';
const LICENSE_NAME = 'Wolfram Data Repository Terms (Wolfram Cloud Terms of Use)';
const LICENSE_URL = 'https://www.wolfram.com/legal/terms/wolfram-cloud.html';
const ATTRIBUTION = 'D. J. Watts and S. H. Strogatz, Nature 393, 440-442 (1998); via Wolfram Data Repository.';

function parseWolframDownloadUrl(html) {
  const matches = [...html.matchAll(/href="(https:\/\/www\.wolframcloud\.com\/obj\/[^"]+)"/g)];
  if (matches.length > 0) {
    return matches[matches.length - 1][1];
  }

  const fallback = html.match(/href="(https:\/\/www\.wolframcloud\.com\/download\/[^"]+)"/);
  if (fallback?.[1]) return fallback[1];

  throw new Error('Could not locate a Power Grid data download URL on the source page.');
}

async function buildPowerGrid() {
  const html = await fetchText(SOURCE_URL);
  const wlUrl = parseWolframDownloadUrl(html);
  const wlText = await fetchText(wlUrl);

  const parsed = parseWolframSparseArrayGraph(wlText);
  const normalized = normalizeGraph(parsed.edges, {
    nodeIds: Array.from({ length: parsed.nodeCount }, (_, i) => i),
  });

  const samples = [
    { id: 'bfs-250-s1', file: 'powergrid-bfs-250-s1.json', maxNodes: 250, maxEdges: 800, seed: 1 },
    { id: 'bfs-320-s7', file: 'powergrid-bfs-320-s7.json', maxNodes: 320, maxEdges: 1200, seed: 7 },
  ];

  const output = [];

  for (const sample of samples) {
    const sampled = deterministicBfsSample({
      nodes: normalized.nodes,
      edges: normalized.edges,
      seed: sample.seed,
      maxNodes: sample.maxNodes,
      maxEdges: sample.maxEdges,
    });
    const stats = computeStats(sampled.nodes, sampled.edges);
    const payload = makeDatasetJson({
      id: `powergrid-${sample.id}`,
      name: `Power Grid (${sample.id})`,
      sourceUrl: SOURCE_URL,
      licenseName: LICENSE_NAME,
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      note: `Deterministic BFS induced sample from Wolfram Power Grid source; seed=${sample.seed}, caps=${sample.maxNodes}/${sample.maxEdges}.`,
      nodes: sampled.nodes,
      edges: sampled.edges,
    });

    const outPath = writeDatasetJson(sample.file, payload);
    output.push({
      ...sample,
      outPath,
      stats,
      originalStats: computeStats(normalized.nodes, normalized.edges),
    });
  }

  return {
    datasetId: 'power-grid',
    sourceUrl: SOURCE_URL,
    licenseName: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    output,
    originalStats: computeStats(normalized.nodes, normalized.edges),
  };
}

module.exports = {
  buildPowerGrid,
};

if (require.main === module) {
  buildPowerGrid()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
