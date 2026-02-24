const fs = require('node:fs');
const path = require('node:path');

const {
  CACHE_DIR,
  ensureDir,
  parseOsmIntersectionGraph,
  deterministicBfsSample,
  computeStats,
  pickGeographicForSample,
  makeDatasetJson,
  writeDatasetJson,
} = require('./utils.ts');

const SOURCE_URL = 'https://www.openstreetmap.org';
const LICENSE_NAME = 'Open Database License (ODbL) 1.0';
const LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/';
const ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0';
const NOTE = 'Produced from OpenStreetMap data';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["highway"](37.7740,-122.4210,37.7910,-122.3950);
);
(._;>;);
out body;
`.trim();

const OSM_CACHE_PATH = path.join(CACHE_DIR, 'osm-downtown-sf-overpass.json');

async function fetchOverpassJson() {
  ensureDir(path.dirname(OSM_CACHE_PATH));

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
      body: OVERPASS_QUERY,
    });

    if (!response.ok) {
      throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    fs.writeFileSync(OSM_CACHE_PATH, text, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (fs.existsSync(OSM_CACHE_PATH)) {
      const cached = fs.readFileSync(OSM_CACHE_PATH, 'utf8');
      return JSON.parse(cached);
    }
    throw error;
  }
}

async function buildOsm() {
  const osmJson = await fetchOverpassJson();
  const parsed = parseOsmIntersectionGraph(osmJson);

  const samples = [
    { id: 'downtown-sf-bfs-220-s3', file: 'osm-downtown-sf-bfs-220-s3.json', seed: 3, maxNodes: 220, maxEdges: 800 },
    { id: 'downtown-sf-bfs-320-s17', file: 'osm-downtown-sf-bfs-320-s17.json', seed: 17, maxNodes: 320, maxEdges: 1100 },
  ];

  const output = [];

  for (const sample of samples) {
    const sampled = deterministicBfsSample({
      nodes: parsed.nodes,
      edges: parsed.edges,
      seed: sample.seed,
      maxNodes: sample.maxNodes,
      maxEdges: sample.maxEdges,
    });

    const sampledGeo = pickGeographicForSample(
      parsed.extras?.geographic,
      sampled.selectedOriginalNodeIndices,
    );

    const payload = makeDatasetJson({
      id: sample.id,
      name: `OSM Downtown SF (${sample.id})`,
      sourceUrl: SOURCE_URL,
      licenseName: LICENSE_NAME,
      licenseUrl: LICENSE_URL,
      attribution: `${ATTRIBUTION}. ${NOTE}.`,
      note: `${NOTE}; deterministic BFS sample seed=${sample.seed}, caps=${sample.maxNodes}/${sample.maxEdges}.`,
      nodes: sampled.nodes,
      edges: sampled.edges,
      extras: sampledGeo ? { geographic: sampledGeo } : undefined,
    });

    const outPath = writeDatasetJson(sample.file, payload);
    output.push({
      ...sample,
      outPath,
      stats: computeStats(sampled.nodes, sampled.edges),
    });
  }

  return {
    datasetId: 'osm-downtown-sf',
    sourceUrl: SOURCE_URL,
    licenseName: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    attribution: ATTRIBUTION,
    output,
    originalStats: computeStats(parsed.nodes, parsed.edges),
  };
}

module.exports = {
  buildOsm,
};

if (require.main === module) {
  buildOsm()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
