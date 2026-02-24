const {
  downloadCached,
  untarFileToString,
  parseMatrixMarket,
  normalizeGraph,
  deterministicBfsSample,
  computeStats,
  makeDatasetJson,
  writeDatasetJson,
} = require('./utils.ts');

const SOURCE_URL = 'https://sparse.tamu.edu/Hamm';
const TERMS_URL = 'https://sparse.tamu.edu/about';
const LICENSE_NAME = 'SuiteSparse Matrix Collection terms (matrices: CC-BY 4.0)';
const LICENSE_URL = 'https://sparse.tamu.edu/about';
const ATTRIBUTION = 'SuiteSparse Matrix Collection (Hamm group: add20, add32).';

const MATRIX_SPECS = [
  {
    id: 'add20',
    dataUrl: 'https://suitesparse-collection-website.herokuapp.com/MM/Hamm/add20.tar.gz',
    cacheName: 'hamm-add20.tar.gz',
    matrixPath: 'add20/add20.mtx',
    sample: { seed: 5, maxNodes: 250, maxEdges: 800 },
  },
  {
    id: 'add32',
    dataUrl: 'https://suitesparse-collection-website.herokuapp.com/MM/Hamm/add32.tar.gz',
    cacheName: 'hamm-add32.tar.gz',
    matrixPath: 'add32/add32.mtx',
    sample: { seed: 9, maxNodes: 300, maxEdges: 1000 },
  },
];

async function buildSuitesparse() {
  const output = [];

  for (const spec of MATRIX_SPECS) {
    const archivePath = await downloadCached(spec.dataUrl, spec.cacheName);
    const mtxText = untarFileToString(archivePath, spec.matrixPath);
    const parsed = parseMatrixMarket(mtxText);

    const nodeIds = Array.from({ length: parsed.nodeCount }, (_, i) => i);
    const normalized = normalizeGraph(parsed.edges, { nodeIds });

    const sampled = deterministicBfsSample({
      nodes: normalized.nodes,
      edges: normalized.edges,
      seed: spec.sample.seed,
      maxNodes: spec.sample.maxNodes,
      maxEdges: spec.sample.maxEdges,
    });

    const outFile = `suitesparse-hamm-${spec.id}-sample.json`;
    const payload = makeDatasetJson({
      id: `hamm-${spec.id}`,
      name: `Hamm ${spec.id}`,
      sourceUrl: SOURCE_URL,
      licenseName: LICENSE_NAME,
      licenseUrl: LICENSE_URL,
      attribution: `${ATTRIBUTION} Terms: ${TERMS_URL}`,
      note: `Undirected edge projection from Matrix Market ${spec.id}; deterministic BFS sample seed=${spec.sample.seed}, caps=${spec.sample.maxNodes}/${spec.sample.maxEdges}.`,
      nodes: sampled.nodes,
      edges: sampled.edges,
    });

    const outPath = writeDatasetJson(outFile, payload);
    output.push({
      id: spec.id,
      file: outFile,
      outPath,
      stats: computeStats(sampled.nodes, sampled.edges),
      originalStats: computeStats(normalized.nodes, normalized.edges),
    });
  }

  return {
    datasetId: 'hamm-circuits',
    sourceUrl: SOURCE_URL,
    termsUrl: TERMS_URL,
    licenseName: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    output,
  };
}

module.exports = {
  buildSuitesparse,
};

if (require.main === module) {
  buildSuitesparse()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
