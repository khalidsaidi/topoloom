const base = process.argv[2];
const expectedSha = process.argv[3];

if (!base) {
  console.error('Usage: node scripts/smoke-live.mjs <baseUrl> [expectedSha]');
  process.exit(1);
}

function norm(url) {
  return url.replace(/\/+$/, '');
}

async function fetchWithFallback(url, opts) {
  const head = await fetch(url, { ...opts, method: 'HEAD', redirect: 'follow' }).catch(() => null);
  if (head && head.ok) return head;

  const get = await fetch(url, { ...opts, method: 'GET', redirect: 'follow' });
  return get;
}

async function mustFetch(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return { res, text };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mustInclude(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error(`${label}: missing "${needle}"`);
}

function mustHeaderContains(res, header, needle, label) {
  const v = res.headers.get(header);
  if (!v) throw new Error(`${label}: missing header ${header}`);
  if (!v.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`${label}: ${header} missing "${needle}". got="${v}"`);
  }
}

(async () => {
  const b = norm(base);

  const home = await mustFetch(b + '/');
  if (!home.text || home.text.length < 200) throw new Error('Home HTML unexpectedly small/empty');
  mustInclude(home.text, 'topoloom-smoke', 'Home HTML');
  mustHeaderContains(home.res, 'cache-control', 'no-cache', 'Home headers');

  const healthUrl = b + '/healthz.json';
  let parsed;
  let healthRes;
  const attempts = expectedSha ? 12 : 1;
  for (let i = 0; i < attempts; i += 1) {
    const health = await mustFetch(healthUrl);
    healthRes = health.res;
    try {
      parsed = JSON.parse(health.text);
    } catch {
      throw new Error('healthz.json not valid JSON');
    }
    if (parsed.product !== 'TopoLoom') throw new Error('healthz.json missing product=TopoLoom');
    if (!expectedSha || parsed.gitSha === expectedSha) break;
    if (i < attempts - 1) await sleep(5000);
  }

  if (!parsed) throw new Error('healthz.json missing payload');
  if (healthRes) mustHeaderContains(healthRes, 'cache-control', 'max-age=60', 'healthz headers');

  if (expectedSha && parsed.gitSha && parsed.gitSha !== expectedSha) {
    throw new Error(`healthz.gitSha mismatch: expected=${expectedSha} got=${parsed.gitSha}`);
  }

  const biUrl = b + '/build-info.json';
  const bi = await mustFetch(biUrl);
  let buildInfo;
  try { buildInfo = JSON.parse(bi.text); } catch { throw new Error('build-info.json not valid JSON'); }
  if (buildInfo.product !== 'TopoLoom') throw new Error('build-info.json missing product=TopoLoom');
  mustHeaderContains(bi.res, 'cache-control', 'max-age=60', 'build-info headers');
  if (buildInfo.gitSha !== parsed.gitSha) {
    throw new Error(`build-info.gitSha mismatch: healthz=${parsed.gitSha} build-info=${buildInfo.gitSha}`);
  }

  const m = home.text.match(/"\/assets\/[^\"]+\.(js|css)"/);
  if (!m) throw new Error('Could not find an /assets/*.js|css reference in home HTML');
  const assetPath = m[0].slice(1, -1);
  const assetUrl = b + assetPath;
  const assetRes = await fetchWithFallback(assetUrl, {});
  if (!assetRes.ok) throw new Error(`${assetUrl} -> ${assetRes.status}`);
  mustHeaderContains(assetRes, 'cache-control', 'immutable', 'asset headers');
  mustHeaderContains(assetRes, 'cache-control', 'max-age=31536000', 'asset headers');

  const api = await mustFetch(b + '/api/');
  if (!api.text || api.text.length < 200) throw new Error('/api/ HTML unexpectedly small/empty');

  console.log('LIVE SMOKE OK');
  console.log({
    base: b,
    healthUrl,
    biUrl,
    assetUrl,
    gitSha: parsed.gitSha,
    libraryVersion: parsed.libraryVersion,
    builtAt: parsed.builtAt,
  });
})();
