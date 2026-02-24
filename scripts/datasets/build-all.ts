const path = require('node:path');
const fs = require('node:fs');

const { DATASET_OUT_DIR, ensureDir } = require('./utils.ts');
const { buildPowerGrid } = require('./build-powergrid.ts');
const { buildRoadNet } = require('./build-roadnet.ts');
const { buildBenchmarks } = require('./build-benchmarks.ts');
const { buildSuitesparse } = require('./build-suitesparse.ts');
const { buildOsm } = require('./build-osm.ts');
const { buildHero } = require('./build-hero.ts');

async function buildAllDatasets() {
  ensureDir(DATASET_OUT_DIR);

  const results = [];
  results.push(await buildPowerGrid());
  results.push(await buildRoadNet());
  results.push(await buildBenchmarks());
  results.push(await buildSuitesparse());
  results.push(await buildOsm());
  results.push(await buildHero());

  const summary = {
    generatedAt: new Date().toISOString(),
    datasets: results,
  };

  const summaryPath = path.join(DATASET_OUT_DIR, 'datasets-build-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  return { summaryPath, results };
}

module.exports = {
  buildAllDatasets,
};

if (require.main === module) {
  buildAllDatasets()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
