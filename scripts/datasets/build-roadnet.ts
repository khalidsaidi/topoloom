const {
  downloadCached,
  gunzipFileToText,
  parseSnapEdgeList,
  normalizeGraph,
  deterministicBfsSample,
  computeStats,
  makeDatasetJson,
  writeDatasetJson,
} = require('./utils.ts');

const SOURCE_URL = 'https://snap.stanford.edu/data/roadNet-CA.html';
const DATA_URL = 'https://snap.stanford.edu/data/roadNet-CA.txt.gz';
const LICENSE_NAME = 'SNAP dataset terms (source citation requested)';
const LICENSE_URL = 'https://snap.stanford.edu/data/roadNet-CA.html';
const ATTRIBUTION = 'SNAP: Stanford Large Network Dataset Collection (J. Leskovec and A. Krevl).';

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
  }

  return {
    datasetId: 'roadnet-ca',
    sourceUrl: SOURCE_URL,
    licenseName: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    output,
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
