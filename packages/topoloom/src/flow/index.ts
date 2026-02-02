export type FlowArc = {
  from: number;
  to: number;
  lower?: number;
  upper: number;
  cost: number;
};

export type FlowNetwork = {
  nodeCount: number;
  arcs: FlowArc[];
  demands?: number[]; // supply positive, demand negative
};

export type FlowResult = {
  feasible: boolean;
  flowByArc: number[];
  totalCost: number;
  potentials: number[];
};

type ResidualEdge = {
  to: number;
  rev: number;
  cap: number;
  cost: number;
};

type ResidualGraph = ResidualEdge[][];

function addResidualEdge(graph: ResidualGraph, from: number, to: number, cap: number, cost: number) {
  const forward: ResidualEdge = { to, rev: graph[to]!.length, cap, cost };
  const backward: ResidualEdge = { to: from, rev: graph[from]!.length, cap: 0, cost: -cost };
  graph[from]!.push(forward);
  graph[to]!.push(backward);
}

function bellmanFord(graph: ResidualGraph, source: number): number[] {
  const n = graph.length;
  const dist = Array(n).fill(Infinity);
  dist[source] = 0;
  for (let i = 0; i < n - 1; i += 1) {
    let updated = false;
    for (let u = 0; u < n; u += 1) {
      if (dist[u] === Infinity) continue;
      for (const edge of graph[u] ?? []) {
        if (edge.cap <= 0) continue;
        if (dist[edge.to] > dist[u] + edge.cost) {
          dist[edge.to] = dist[u] + edge.cost;
          updated = true;
        }
      }
    }
    if (!updated) break;
  }
  return dist.map((d) => (d === Infinity ? 0 : d));
}

function dijkstra(graph: ResidualGraph, source: number, potentials: number[]) {
  const n = graph.length;
  const dist = Array(n).fill(Infinity);
  const prevNode = Array(n).fill(-1);
  const prevEdge = Array(n).fill(-1);
  const visited = Array(n).fill(false);
  dist[source] = 0;

  for (let i = 0; i < n; i += 1) {
    let u = -1;
    let best = Infinity;
    for (let v = 0; v < n; v += 1) {
      if (!visited[v] && dist[v] < best) {
        best = dist[v];
        u = v;
      }
    }
    if (u === -1) break;
    visited[u] = true;

    for (let ei = 0; ei < (graph[u] ?? []).length; ei += 1) {
      const edge = graph[u]![ei]!;
      if (edge.cap <= 0) continue;
      const cost = edge.cost + (potentials[u] ?? 0) - (potentials[edge.to] ?? 0);
      const nd = dist[u] + cost;
      if (nd < dist[edge.to]) {
        dist[edge.to] = nd;
        prevNode[edge.to] = u;
        prevEdge[edge.to] = ei;
      }
    }
  }

  return { dist, prevNode, prevEdge };
}

export function minCostFlow(network: FlowNetwork): FlowResult {
  const n = network.nodeCount;
  const demands = network.demands ? [...network.demands] : Array(n).fill(0);
  const lower = network.arcs.map((arc) => arc.lower ?? 0);
  const capacity = network.arcs.map((arc, idx) => arc.upper - (lower[idx] ?? 0));

  for (let i = 0; i < network.arcs.length; i += 1) {
    const arc = network.arcs[i]!;
    if ((capacity[i] ?? 0) < 0) throw new Error(`Arc ${i} has upper < lower`);
    demands[arc.from] -= lower[i] ?? 0;
    demands[arc.to] += lower[i] ?? 0;
  }

  const superSource = n;
  const superSink = n + 1;
  const graph: ResidualGraph = Array.from({ length: n + 2 }, () => []);

  const arcEdgeIndex: Array<{ node: number; edge: number }> = [];
  for (let i = 0; i < network.arcs.length; i += 1) {
    const arc = network.arcs[i]!;
    const from = arc.from;
    const to = arc.to;
    const edgeIndex = graph[from]!.length;
    addResidualEdge(graph, from, to, capacity[i] ?? 0, arc.cost);
    arcEdgeIndex[i] = { node: from, edge: edgeIndex };
  }

  let requiredFlow = 0;
  for (let i = 0; i < n; i += 1) {
    if (demands[i] > 0) {
      addResidualEdge(graph, superSource, i, demands[i], 0);
      requiredFlow += demands[i];
    } else if (demands[i] < 0) {
      addResidualEdge(graph, i, superSink, -demands[i], 0);
    }
  }

  const potentials = bellmanFord(graph, superSource);
  let flow = 0;
  let cost = 0;

  while (flow < requiredFlow) {
    const { dist, prevNode, prevEdge } = dijkstra(graph, superSource, potentials);
    if (!Number.isFinite(dist[superSink])) break;

    for (let v = 0; v < graph.length; v += 1) {
      if (Number.isFinite(dist[v])) potentials[v] += dist[v];
    }

    let aug = Infinity;
    for (let v = superSink; v !== superSource; v = prevNode[v]) {
      const u = prevNode[v];
      if (u === -1) break;
      const edge = graph[u]![prevEdge[v]!]!;
      aug = Math.min(aug, edge.cap);
    }

    if (!Number.isFinite(aug)) break;

    for (let v = superSink; v !== superSource; v = prevNode[v]) {
      const u = prevNode[v];
      if (u === -1) break;
      const edge = graph[u]![prevEdge[v]!]!;
      edge.cap -= aug;
      graph[v]![edge.rev]!.cap += aug;
      cost += aug * edge.cost;
    }

    flow += aug;
  }

  if (flow < requiredFlow) {
    return { feasible: false, flowByArc: [], totalCost: Infinity, potentials };
  }

  const flowByArc = network.arcs.map((_arc, idx) => {
    const entry = arcEdgeIndex[idx]!;
    const residualEdge = graph[entry.node]![entry.edge]!;
    const sent = (capacity[idx] ?? 0) - residualEdge.cap;
    return sent + (lower[idx] ?? 0);
  });

  return { feasible: true, flowByArc, totalCost: cost, potentials };
}
