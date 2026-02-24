const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATASET_OUT_DIR = path.join(REPO_ROOT, 'apps', 'showcase', 'public', 'datasets');
const CACHE_DIR = path.join(REPO_ROOT, '.cache', 'datasets');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf8');
}

function fetchText(url) {
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  });
}

function fetchBuffer(url) {
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  });
}

function downloadCached(url, cacheName) {
  ensureDir(CACHE_DIR);
  const outPath = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  return fetchBuffer(url).then((buf) => {
    fs.writeFileSync(outPath, buf);
    return outPath;
  });
}

function gunzipFileToText(filePath) {
  const compressed = fs.readFileSync(filePath);
  return zlib.gunzipSync(compressed).toString('utf8');
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? String(result.stderr) : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}`);
  }
  return result.stdout;
}

function untarFileToString(archivePath, fileInsideArchive) {
  return runCommand('tar', ['-xOf', archivePath, fileInsideArchive]);
}

function sortedNumeric(values) {
  return [...values].sort((a, b) => a - b);
}

function toEdgeKey(u, v) {
  const a = Math.min(u, v);
  const b = Math.max(u, v);
  return `${a},${b}`;
}

function dedupeUndirectedEdges(edgePairs, options = {}) {
  const { removeSelfLoops = true } = options;
  const seen = new Set();
  const edges = [];

  for (const pair of edgePairs) {
    if (!pair || pair.length < 2) continue;
    const rawU = Number(pair[0]);
    const rawV = Number(pair[1]);
    if (!Number.isFinite(rawU) || !Number.isFinite(rawV)) continue;
    if (!Number.isInteger(rawU) || !Number.isInteger(rawV)) continue;
    if (removeSelfLoops && rawU === rawV) continue;
    const u = Math.min(rawU, rawV);
    const v = Math.max(rawU, rawV);
    const key = `${u},${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([u, v]);
  }

  edges.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });

  return edges;
}

function normalizeGraph(edgePairs, options = {}) {
  const { nodeIds = null } = options;
  const deduped = dedupeUndirectedEdges(edgePairs, { removeSelfLoops: true });
  const idSet = new Set();

  if (Array.isArray(nodeIds)) {
    for (const id of nodeIds) {
      const numeric = Number(id);
      if (Number.isInteger(numeric)) idSet.add(numeric);
    }
  }

  for (const [u, v] of deduped) {
    idSet.add(u);
    idSet.add(v);
  }

  const originalIds = sortedNumeric(idSet);
  const indexOf = new Map();
  originalIds.forEach((id, idx) => {
    indexOf.set(id, idx);
  });

  const nodes = originalIds.map((id) => String(id));
  const edges = deduped
    .map(([u, v]) => {
      const nu = indexOf.get(u);
      const nv = indexOf.get(v);
      if (nu === undefined || nv === undefined) return null;
      return [Math.min(nu, nv), Math.max(nu, nv)];
    })
    .filter(Boolean);

  edges.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });

  return {
    nodes,
    edges,
    originalIds,
    originalToNormalized: indexOf,
  };
}

function buildAdjacency(nodeCount, edges) {
  const adj = Array.from({ length: nodeCount }, () => []);
  for (const [u, v] of edges) {
    if (u < 0 || v < 0 || u >= nodeCount || v >= nodeCount) continue;
    adj[u].push(v);
    adj[v].push(u);
  }
  for (const list of adj) {
    list.sort((a, b) => a - b);
  }
  return adj;
}

function deterministicBfsSample({ nodes, edges, seed, maxNodes, maxEdges }) {
  const nodeCount = nodes.length;
  if (nodeCount === 0) {
    return {
      nodes: [],
      edges: [],
      selectedOriginalNodeIndices: [],
      originalToSampled: new Map(),
    };
  }

  const nodeCap = Math.max(1, Math.min(maxNodes, nodeCount));
  const adjacency = buildAdjacency(nodeCount, edges);
  const start = ((seed % nodeCount) + nodeCount) % nodeCount;
  const visited = new Set([start]);
  const queue = [start];

  while (queue.length > 0 && visited.size < nodeCap) {
    const current = queue.shift();
    if (current === undefined) break;
    const neighbors = adjacency[current] ?? [];
    for (const next of neighbors) {
      if (visited.size >= nodeCap) break;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  const selectedOriginalNodeIndices = sortedNumeric(visited);
  const selectedSet = new Set(selectedOriginalNodeIndices);
  const originalToSampled = new Map();
  selectedOriginalNodeIndices.forEach((originalId, idx) => {
    originalToSampled.set(originalId, idx);
  });

  const sampledNodes = selectedOriginalNodeIndices.map((originalId) => nodes[originalId]);
  let sampledEdges = [];

  for (const [u, v] of edges) {
    if (!selectedSet.has(u) || !selectedSet.has(v)) continue;
    const su = originalToSampled.get(u);
    const sv = originalToSampled.get(v);
    if (su === undefined || sv === undefined || su === sv) continue;
    sampledEdges.push([Math.min(su, sv), Math.max(su, sv)]);
  }

  sampledEdges = dedupeUndirectedEdges(sampledEdges, { removeSelfLoops: true });
  if (sampledEdges.length > maxEdges) {
    sampledEdges = sampledEdges.slice(0, Math.max(0, maxEdges));
  }

  return {
    nodes: sampledNodes,
    edges: sampledEdges,
    selectedOriginalNodeIndices,
    originalToSampled,
  };
}

function computeStats(nodes, edges) {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  if (nodeCount === 0) {
    return {
      nodes: 0,
      edges: 0,
      density: 0,
      maxDegree: 0,
      components: 0,
    };
  }

  const adjacency = buildAdjacency(nodeCount, edges);
  const degrees = adjacency.map((list) => list.length);
  const maxDegree = degrees.reduce((m, d) => Math.max(m, d), 0);

  const visited = new Array(nodeCount).fill(false);
  let components = 0;

  for (let i = 0; i < nodeCount; i += 1) {
    if (visited[i]) continue;
    components += 1;
    const queue = [i];
    visited[i] = true;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      for (const next of adjacency[current]) {
        if (visited[next]) continue;
        visited[next] = true;
        queue.push(next);
      }
    }
  }

  const density = nodeCount <= 1 ? 0 : (2 * edgeCount) / (nodeCount * (nodeCount - 1));

  return {
    nodes: nodeCount,
    edges: edgeCount,
    density,
    maxDegree,
    components,
  };
}

function parseSnapEdgeList(text) {
  const edges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const u = Number(parts[0]);
    const v = Number(parts[1]);
    if (!Number.isInteger(u) || !Number.isInteger(v)) continue;
    edges.push([u, v]);
  }
  return edges;
}

function parseMatrixMarket(text) {
  const lines = text.split(/\r?\n/);
  let idx = 0;
  while (idx < lines.length && lines[idx].trim().startsWith('%')) {
    idx += 1;
  }
  if (idx >= lines.length) throw new Error('MatrixMarket file missing header line');
  const dims = lines[idx].trim().split(/\s+/).map(Number);
  if (dims.length < 3) {
    throw new Error('MatrixMarket dimensions line malformed');
  }
  const nRows = dims[0];
  const nCols = dims[1];
  idx += 1;
  const edges = [];

  for (; idx < lines.length; idx += 1) {
    const line = lines[idx].trim();
    if (!line || line.startsWith('%')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const r = Number(parts[0]) - 1;
    const c = Number(parts[1]) - 1;
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    if (r < 0 || c < 0) continue;
    edges.push([r, c]);
  }

  return {
    nodeCount: Math.max(nRows, nCols),
    edges,
  };
}

function parseBu4pGraph(text) {
  const lines = text.split(/\r?\n/);
  let currentNode = null;
  const edgeToNodes = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (currentNode === null && /^\d+$/.test(line)) {
      currentNode = Number(line);
      continue;
    }

    const edgeMatch = line.match(/^<EDGE>\s+(\d+)\s+--/);
    if (edgeMatch && currentNode !== null) {
      const edgeId = Number(edgeMatch[1]);
      const bucket = edgeToNodes.get(edgeId) ?? [];
      bucket.push(currentNode);
      edgeToNodes.set(edgeId, bucket);
      continue;
    }

    if (line === '</NODE>') {
      currentNode = null;
    }
  }

  const edges = [];
  const nodeIds = new Set();
  for (const arr of edgeToNodes.values()) {
    const unique = [...new Set(arr)].sort((a, b) => a - b);
    if (unique.length !== 2) continue;
    const u = unique[0];
    const v = unique[1];
    nodeIds.add(u);
    nodeIds.add(v);
    edges.push([u, v]);
  }

  return {
    nodeIds: sortedNumeric(nodeIds),
    edges,
  };
}

function parseWolframSparseArrayGraph(wlText) {
  const sparseRe = /SparseArray\[Automatic, \{(\d+),\s*(\d+)\}, 0, \{1, \{\{([\s\S]*?)\}, \{([\s\S]*?)\}\}, Pattern\}\]/m;
  const match = wlText.match(sparseRe);
  if (!match) {
    throw new Error('Could not locate SparseArray payload in Wolfram graph text');
  }

  const nRows = Number(match[1]);
  const nCols = Number(match[2]);
  if (!Number.isInteger(nRows) || !Number.isInteger(nCols) || nRows !== nCols) {
    throw new Error('SparseArray dimensions are invalid for adjacency matrix parsing');
  }

  const rowPointers = match[3]
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x));
  const colIndices = [...match[4].matchAll(/\{\s*(\d+)\s*\}/g)].map((m) => Number(m[1]));

  if (rowPointers.length !== nRows + 1) {
    throw new Error(`SparseArray row pointers length mismatch: got ${rowPointers.length}, expected ${nRows + 1}`);
  }

  if ((rowPointers[rowPointers.length - 1] ?? -1) !== colIndices.length) {
    throw new Error('SparseArray row pointers terminal offset does not match column indices length');
  }

  const edges = [];
  for (let row = 0; row < nRows; row += 1) {
    const start = rowPointers[row] ?? 0;
    const end = rowPointers[row + 1] ?? start;
    for (let i = start; i < end; i += 1) {
      const colOneBased = colIndices[i];
      if (!Number.isInteger(colOneBased)) continue;
      const col = colOneBased - 1;
      if (col < 0 || col >= nRows) continue;
      edges.push([row, col]);
    }
  }

  return {
    nodeCount: nRows,
    edges,
  };
}

function clampCoordinate(value, limit = 1e7) {
  if (!Number.isFinite(value)) return 0;
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
}

function parseOsmIntersectionGraph(osmJson) {
  const nodeMap = new Map();
  const ways = [];

  for (const el of osmJson.elements ?? []) {
    if (el.type === 'node') {
      if (typeof el.id !== 'number') continue;
      nodeMap.set(el.id, {
        id: el.id,
        lon: Number(el.lon),
        lat: Number(el.lat),
      });
    } else if (el.type === 'way') {
      const highway = el.tags?.highway;
      if (!highway) continue;
      const nodeIds = Array.isArray(el.nodes) ? el.nodes.map(Number).filter(Number.isFinite) : [];
      if (nodeIds.length < 2) continue;
      ways.push({
        id: Number(el.id),
        nodeIds,
      });
    }
  }

  ways.sort((a, b) => a.id - b.id);

  const incidenceCount = new Map();
  for (const way of ways) {
    for (const nodeId of way.nodeIds) {
      incidenceCount.set(nodeId, (incidenceCount.get(nodeId) ?? 0) + 1);
    }
  }

  const isIntersection = (nodeId, index, arr) => {
    if (index === 0 || index === arr.length - 1) return true;
    return (incidenceCount.get(nodeId) ?? 0) > 1;
  };

  const edgePairsRaw = [];
  const importantNodes = new Set();

  for (const way of ways) {
    let previousImportant = null;
    const ids = way.nodeIds;
    for (let i = 0; i < ids.length; i += 1) {
      const nodeId = ids[i];
      if (!isIntersection(nodeId, i, ids)) continue;
      importantNodes.add(nodeId);
      if (previousImportant !== null && previousImportant !== nodeId) {
        edgePairsRaw.push([previousImportant, nodeId]);
      }
      previousImportant = nodeId;
    }
  }

  const normalized = normalizeGraph(edgePairsRaw, {
    nodeIds: [...importantNodes],
  });

  const geographicX = [];
  const geographicY = [];
  for (const originalId of normalized.originalIds) {
    const node = nodeMap.get(originalId);
    const x = clampCoordinate(node?.lon ?? 0);
    const y = clampCoordinate(node?.lat ?? 0);
    geographicX.push(x);
    geographicY.push(y);
  }

  return {
    nodes: normalized.nodes,
    edges: normalized.edges,
    extras: {
      geographic: {
        x: geographicX,
        y: geographicY,
      },
    },
  };
}

function pickGeographicForSample(fullGeographic, selectedOriginalNodeIndices) {
  if (!fullGeographic || !Array.isArray(fullGeographic.x) || !Array.isArray(fullGeographic.y)) {
    return undefined;
  }
  const x = [];
  const y = [];
  for (const originalIdx of selectedOriginalNodeIndices) {
    x.push(clampCoordinate(Number(fullGeographic.x[originalIdx])));
    y.push(clampCoordinate(Number(fullGeographic.y[originalIdx])));
  }
  return { x, y };
}

function makeDatasetJson({
  id,
  name,
  sourceUrl,
  licenseName,
  licenseUrl,
  attribution,
  note,
  nodes,
  edges,
  extras,
}) {
  return {
    meta: {
      id,
      name,
      sourceUrl,
      licenseName,
      licenseUrl,
      attribution,
      note,
    },
    nodes,
    edges,
    ...(extras ? { extras } : {}),
  };
}

function writeDatasetJson(fileName, payload) {
  ensureDir(DATASET_OUT_DIR);
  const outPath = path.join(DATASET_OUT_DIR, fileName);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return outPath;
}

module.exports = {
  REPO_ROOT,
  DATASET_OUT_DIR,
  CACHE_DIR,
  ensureDir,
  readText,
  writeText,
  fetchText,
  fetchBuffer,
  downloadCached,
  gunzipFileToText,
  runCommand,
  untarFileToString,
  toEdgeKey,
  dedupeUndirectedEdges,
  normalizeGraph,
  buildAdjacency,
  deterministicBfsSample,
  computeStats,
  parseSnapEdgeList,
  parseMatrixMarket,
  parseBu4pGraph,
  parseWolframSparseArrayGraph,
  parseOsmIntersectionGraph,
  pickGeographicForSample,
  makeDatasetJson,
  writeDatasetJson,
};
