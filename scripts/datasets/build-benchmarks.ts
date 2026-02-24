const {
  downloadCached,
  untarFileToString,
  parseBu4pGraph,
  normalizeGraph,
  computeStats,
  makeDatasetJson,
  writeDatasetJson,
} = require('./utils.ts');

const SOURCE_URL = 'https://graphdrawing.unipg.it/data.html';
const DATA_URL = 'https://graphdrawing.unipg.it/data/GDT-testsuite-BU4P.tgz';
const LICENSE_NAME = 'Graph Drawing benchmark terms (publicly available datasets as stated on source hub)';
const LICENSE_URL = 'https://graphdrawing.unipg.it/data.html';
const ATTRIBUTION = 'Graph Drawing benchmark hub (BU4P test suite from GDToolkit/Rome graphs).';

async function buildBenchmarks() {
  const archivePath = await downloadCached(DATA_URL, 'GDT-testsuite-BU4P.tgz');

  const selected = [
    { id: 'g00100-01', label: 'BU4P g.00100.01', archiveFile: 'RND_BU4P/g.00100.01', outFile: 'benchmark-bu4p-g00100-01.json' },
    { id: 'g00200-01', label: 'BU4P g.00200.01', archiveFile: 'RND_BU4P/g.00200.01', outFile: 'benchmark-bu4p-g00200-01.json' },
    { id: 'g00300-01', label: 'BU4P g.00300.01', archiveFile: 'RND_BU4P/g.00300.01', outFile: 'benchmark-bu4p-g00300-01.json' },
  ];

  const output = [];

  for (const sample of selected) {
    const text = untarFileToString(archivePath, sample.archiveFile);
    const parsed = parseBu4pGraph(text);
    const normalized = normalizeGraph(parsed.edges, { nodeIds: parsed.nodeIds });

    const payload = makeDatasetJson({
      id: `bu4p-${sample.id}`,
      name: sample.label,
      sourceUrl: SOURCE_URL,
      licenseName: LICENSE_NAME,
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      note: `Direct BU4P benchmark graph extracted from ${sample.archiveFile}.`,
      nodes: normalized.nodes,
      edges: normalized.edges,
    });

    const outPath = writeDatasetJson(sample.outFile, payload);
    output.push({
      id: sample.id,
      label: sample.label,
      file: sample.outFile,
      outPath,
      stats: computeStats(normalized.nodes, normalized.edges),
    });
  }

  return {
    datasetId: 'bu4p',
    sourceUrl: SOURCE_URL,
    licenseName: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    output,
  };
}

module.exports = {
  buildBenchmarks,
};

if (require.main === module) {
  buildBenchmarks()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
