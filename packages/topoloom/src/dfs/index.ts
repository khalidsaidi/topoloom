import { Graph, EdgeId, VertexId } from '../graph';

export type SCCResult = {
  components: VertexId[][];
  componentOf: number[];
};

export function sccTarjan(graph: Graph): SCCResult {
  const n = graph.vertexCount();
  const index: number[] = Array(n).fill(-1);
  const lowlink: number[] = Array(n).fill(0);
  const onStack: boolean[] = Array(n).fill(false);
  const stack: VertexId[] = [];
  let currentIndex = 0;
  const components: VertexId[][] = [];
  const componentOf: number[] = Array(n).fill(-1);

  const strongConnect = (v: VertexId) => {
    index[v] = currentIndex;
    lowlink[v] = currentIndex;
    currentIndex += 1;
    stack.push(v);
    onStack[v] = true;

    for (const adj of graph.adjacency(v)) {
      if (adj.dir === 'in') continue;
      const w = adj.to;
      if (index[w] === -1) {
        strongConnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], index[w]);
      }
    }

    if (lowlink[v] === index[v]) {
      const component: VertexId[] = [];
      while (true) {
        const w = stack.pop();
        if (w === undefined) break;
        onStack[w] = false;
        componentOf[w] = components.length;
        component.push(w);
        if (w === v) break;
      }
      components.push(component);
    }
  };

  for (let v = 0; v < n; v += 1) {
    if (index[v] === -1) strongConnect(v);
  }

  return { components, componentOf };
}

export type BiconnectedResult = {
  blocks: EdgeId[][];
  articulationPoints: VertexId[];
  bridges: EdgeId[];
  edgeToBlock: number[];
};

export function biconnectedComponents(graph: Graph): BiconnectedResult {
  const n = graph.vertexCount();
  const disc: number[] = Array(n).fill(-1);
  const low: number[] = Array(n).fill(0);
  const parent: number[] = Array(n).fill(-1);
  const visitedEdge: boolean[] = Array(graph.edgeCount()).fill(false);
  const edgeStack: EdgeId[] = [];
  const blocks: EdgeId[][] = [];
  const bridges: EdgeId[] = [];
  const articulationSet = new Set<VertexId>();

  let time = 0;

  const popBlockUntil = (stopEdge: EdgeId) => {
    const block: EdgeId[] = [];
    while (edgeStack.length > 0) {
      const e = edgeStack.pop();
      if (e === undefined) break;
      block.push(e);
      if (e === stopEdge) break;
    }
    if (block.length > 0) blocks.push(block);
  };

  const dfs = (u: VertexId) => {
    disc[u] = time;
    low[u] = time;
    time += 1;
    let childCount = 0;

    for (const adj of graph.adjacency(u)) {
      const e = adj.edge;
      if (visitedEdge[e]) continue;
      visitedEdge[e] = true;
      const v = adj.to;

      if (disc[v] === -1) {
        parent[v] = u;
        childCount += 1;
        edgeStack.push(e);
        dfs(v);
        low[u] = Math.min(low[u], low[v]);

        if (low[v] >= disc[u]) {
          if (parent[u] !== -1 || childCount > 1) {
            articulationSet.add(u);
          }
          popBlockUntil(e);
        }

        if (low[v] > disc[u]) {
          bridges.push(e);
        }
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u], disc[v]);
        if (disc[v] < disc[u]) {
          edgeStack.push(e);
        }
      }
    }
  };

  for (let i = 0; i < n; i += 1) {
    if (disc[i] === -1) {
      dfs(i as VertexId);
      if (edgeStack.length > 0) {
        blocks.push(edgeStack.splice(0));
      }
    }
  }

  const edgeToBlock = Array(graph.edgeCount()).fill(-1);
  blocks.forEach((block, idx) => {
    for (const e of block) edgeToBlock[e] = idx;
  });

  return {
    blocks,
    articulationPoints: [...articulationSet.values()],
    bridges,
    edgeToBlock,
  };
}

export type BCTreeNode =
  | { id: number; type: 'block'; edges: EdgeId[] }
  | { id: number; type: 'cut'; vertex: VertexId };

export type BCTree = {
  nodes: BCTreeNode[];
  adj: number[][];
  blockNodes: number[];
  cutNodes: number[];
  edgeToBlock: number[];
};

export function buildBCTree(graph: Graph, bcc?: BiconnectedResult): BCTree {
  const result = bcc ?? biconnectedComponents(graph);
  const nodes: BCTreeNode[] = [];
  const adj: number[][] = [];
  const blockNodes: number[] = [];
  const cutNodes: number[] = [];

  const blockIdToNode: number[] = [];
  result.blocks.forEach((block) => {
    const id = nodes.length;
    nodes.push({ id, type: 'block', edges: [...block] });
    adj.push([]);
    blockNodes.push(id);
    blockIdToNode.push(id);
  });

  const cutIdToNode = new Map<VertexId, number>();
  for (const cut of result.articulationPoints) {
    const id = nodes.length;
    nodes.push({ id, type: 'cut', vertex: cut });
    adj.push([]);
    cutNodes.push(id);
    cutIdToNode.set(cut, id);
  }

  // Build connections: block <-> cut if cut vertex is incident to a block edge
  result.blocks.forEach((block, blockId) => {
    const blockNode = blockIdToNode[blockId];
    const incidentCuts = new Set<number>();
    for (const edgeId of block) {
      const edge = graph.edge(edgeId);
      const possibleCuts = [edge.u, edge.v];
      for (const vertex of possibleCuts) {
        const cutNode = cutIdToNode.get(vertex);
        if (cutNode !== undefined) incidentCuts.add(cutNode);
      }
    }
    for (const cutNode of incidentCuts) {
      adj[blockNode].push(cutNode);
      adj[cutNode].push(blockNode);
    }
  });

  return {
    nodes,
    adj,
    blockNodes,
    cutNodes,
    edgeToBlock: result.edgeToBlock,
  };
}
