export type SampleStats = {
  nodes: number;
  edges: number;
  components: number;
  maxDegree: number;
};

export type SamplerResult = {
  nodes: string[];
  edges: Array<[number, number]>;
  selectedOriginalNodeIndices: number[];
  stats: SampleStats;
};

const sortEdgeLex = (a: [number, number], b: [number, number]) => {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
};

const normalizeEdge = (u: number, v: number): [number, number] => (u < v ? [u, v] : [v, u]);

export function clampSampleCaps(maxNodes: number, maxEdges: number) {
  return {
    maxNodes: Math.max(1, Math.min(350, Math.floor(maxNodes))),
    maxEdges: Math.max(1, Math.min(1200, Math.floor(maxEdges))),
  };
}

function buildAdjacency(nodeCount: number, edges: Array<[number, number]>) {
  const adjacency = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const [u, v] of edges) {
    if (u < 0 || v < 0 || u >= nodeCount || v >= nodeCount || u === v) continue;
    adjacency[u].push(v);
    adjacency[v].push(u);
  }
  for (const list of adjacency) {
    list.sort((a, b) => a - b);
  }
  return adjacency;
}

function computeStats(nodeCount: number, edges: Array<[number, number]>, adjacency: number[][]): SampleStats {
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
      for (const next of adjacency[current] ?? []) {
        if (visited[next]) continue;
        visited[next] = true;
        queue.push(next);
      }
    }
  }

  const maxDegree = adjacency.reduce((m, list) => Math.max(m, list.length), 0);
  return {
    nodes: nodeCount,
    edges: edges.length,
    components,
    maxDegree,
  };
}

export function deterministicSample(
  nodes: string[],
  edges: Array<[number, number]>,
  seed: number,
  maxNodes: number,
  maxEdges: number,
): SamplerResult {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      selectedOriginalNodeIndices: [],
      stats: { nodes: 0, edges: 0, components: 0, maxDegree: 0 },
    };
  }

  const caps = clampSampleCaps(maxNodes, maxEdges);
  const adjacency = buildAdjacency(nodes.length, edges);
  const start = ((Math.trunc(seed) % nodes.length) + nodes.length) % nodes.length;

  const visited = new Set<number>([start]);
  const queue = [start];

  while (queue.length > 0 && visited.size < caps.maxNodes) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of adjacency[current] ?? []) {
      if (visited.size >= caps.maxNodes) break;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  const selectedOriginalNodeIndices = [...visited].sort((a, b) => a - b);
  const selectedSet = new Set(selectedOriginalNodeIndices);
  const indexMap = new Map<number, number>();
  selectedOriginalNodeIndices.forEach((id, idx) => {
    indexMap.set(id, idx);
  });

  const sampledNodes = selectedOriginalNodeIndices.map((id) => nodes[id] ?? String(id));
  const dedupe = new Set<string>();
  let sampledEdges: Array<[number, number]> = [];

  for (const [u, v] of edges) {
    if (!selectedSet.has(u) || !selectedSet.has(v)) continue;
    const su = indexMap.get(u);
    const sv = indexMap.get(v);
    if (su === undefined || sv === undefined || su === sv) continue;
    const [a, b] = normalizeEdge(su, sv);
    const key = `${a},${b}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    sampledEdges.push([a, b]);
  }

  sampledEdges.sort(sortEdgeLex);
  if (sampledEdges.length > caps.maxEdges) {
    sampledEdges = sampledEdges.slice(0, caps.maxEdges);
  }

  const sampledAdj = buildAdjacency(sampledNodes.length, sampledEdges);
  return {
    nodes: sampledNodes,
    edges: sampledEdges,
    selectedOriginalNodeIndices,
    stats: computeStats(sampledNodes.length, sampledEdges, sampledAdj),
  };
}
