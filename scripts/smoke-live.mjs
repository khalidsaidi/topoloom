const base = process.argv[2];
const expectedSha = process.argv[3];

if (!base) {
  console.error('Usage: node scripts/smoke-live.mjs <baseUrl> [expectedSha]');
  process.exit(1);
}

async function mustFetch(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return { res, text };
}

(async () => {
  const baseUrl = base.replace(/\/+$/, '');
  const home = await mustFetch(baseUrl + '/');
  if (!home.text || home.text.length < 200) {
    throw new Error('Home HTML unexpectedly small/empty');
  }

  const biUrl = baseUrl + '/build-info.json';
  const bi = await mustFetch(biUrl);
  let parsed;
  try {
    parsed = JSON.parse(bi.text);
  } catch {
    throw new Error('build-info.json not valid JSON');
  }

  if (parsed.product !== 'TopoLoom') throw new Error('build-info.json missing product=TopoLoom');

  if (expectedSha && parsed.gitSha && parsed.gitSha !== expectedSha) {
    throw new Error(`build-info.gitSha mismatch: expected=${expectedSha} got=${parsed.gitSha}`);
  }

  console.log('LIVE SMOKE OK');
  console.log({
    base: baseUrl,
    biUrl,
    gitSha: parsed.gitSha,
    libraryVersion: parsed.libraryVersion,
    builtAt: parsed.builtAt,
  });
})();
