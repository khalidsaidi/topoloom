import { GraphBuilder } from '../graph';
import type { Graph, EdgeId, VertexId } from '../graph';
import { rotationFromAdjacency } from '../embedding';
import type { RotationSystem } from '../embedding';
import { biconnectedComponents } from '../dfs';

export type SPQRNodeType = 'S' | 'P' | 'R' | 'Q';

export type SkeletonEdgeKind =
  | { kind: 'real'; original: EdgeId; treeEdge?: number }
  | { kind: 'virtual'; virtualId: number; treeEdge?: number };

export type SPQRNode = {
  id: number;
  type: SPQRNodeType;
  skeleton: Graph;
  edgeKind: SkeletonEdgeKind[];
  vertexMap: VertexId[];
};

export type SPQRTreeEdge = {
  id: number;
  from: number;
  to: number;
  kind: 'virtual' | 'real';
  pair: [VertexId, VertexId];
  virtualId?: number;
  originalEdge?: EdgeId;
};

export type SPQRTree = {
  nodes: SPQRNode[];
  edges: SPQRTreeEdge[];
};

export type SPQRSafeOptions = {
  treatDirectedAsUndirected?: boolean;
  allowSelfLoops?: 'reject' | 'ignore';
  block?: 'largest' | 'first';
};

export type SPQRSafeResult = {
  tree: SPQRTree;
  blockEdges?: EdgeId[];
  note?: string;
  ignoredSelfLoops?: EdgeId[];
  treatedDirectedAsUndirected?: boolean;
};

export type SPQRForest = {
  blocks: Array<{ edges: EdgeId[]; tree: SPQRTree }>;
  articulationPoints: VertexId[];
  ignoredSelfLoops?: EdgeId[];
  treatedDirectedAsUndirected?: boolean;
};

type ComponentEdge = {
  u: VertexId;
  v: VertexId;
  kind: 'real' | 'virtual';
  original?: EdgeId;
  virtualId?: number;
};

type Component = {
  id: number;
  vertices: VertexId[];
  edges: ComponentEdge[];
};

const pairKey = (u: VertexId, v: VertexId) => (u < v ? `${u}:${v}` : `${v}:${u}`);

const buildAdjacency = (component: Component) => {
  const adj = new Map<VertexId, Array<{ to: VertexId; edge: ComponentEdge }>>();
  for (const v of component.vertices) adj.set(v, []);
  for (const edge of component.edges) {
    adj.get(edge.u)?.push({ to: edge.v, edge });
    adj.get(edge.v)?.push({ to: edge.u, edge });
  }
  return adj;
};

const componentDegrees = (component: Component) => {
  const deg = new Map<VertexId, number>();
  for (const v of component.vertices) deg.set(v, 0);
  for (const edge of component.edges) {
    deg.set(edge.u, (deg.get(edge.u) ?? 0) + 1);
    deg.set(edge.v, (deg.get(edge.v) ?? 0) + 1);
  }
  return deg;
};

const isParallel = (component: Component) => {
  return component.vertices.length === 2 && component.edges.length >= 2;
};

const isCycle = (component: Component) => {
  if (component.vertices.length < 3) return false;
  if (component.edges.length !== component.vertices.length) return false;
  const deg = componentDegrees(component);
  for (const v of component.vertices) {
    if ((deg.get(v) ?? 0) !== 2) return false;
  }
  return true;
};

const hasSeparationPair = (component: Component) => {
  const vertices = component.vertices;
  if (vertices.length <= 3) return null;
  const adj = buildAdjacency(component);
  const virtualPairs = new Set<string>();
  const realMultiplicity = new Map<string, number>();
  for (const edge of component.edges) {
    if (edge.kind === 'virtual') {
      virtualPairs.add(pairKey(edge.u, edge.v));
    } else {
      const key = pairKey(edge.u, edge.v);
      realMultiplicity.set(key, (realMultiplicity.get(key) ?? 0) + 1);
    }
  }

  const remainingBase = vertices.length;
  for (let i = 0; i < remainingBase; i += 1) {
    const u = vertices[i]!;
    for (let j = i + 1; j < remainingBase; j += 1) {
      const v = vertices[j]!;
      if (virtualPairs.has(pairKey(u, v))) continue;
      if ((realMultiplicity.get(pairKey(u, v)) ?? 0) >= 2) {
        return { u, v };
      }
      const remaining = vertices.filter((x) => x !== u && x !== v);
      if (remaining.length <= 1) continue;
      const visited = new Set<VertexId>();
      const stack: VertexId[] = [remaining[0]!];
      visited.add(remaining[0]!);
      while (stack.length > 0) {
        const cur = stack.pop();
        if (cur === undefined) continue;
        const edges = adj.get(cur) ?? [];
        for (const { to } of edges) {
          if (to === u || to === v) continue;
          if (!visited.has(to)) {
            visited.add(to);
            stack.push(to);
          }
        }
      }
      if (visited.size !== remaining.length) {
        return { u, v };
      }
    }
  }
  return null;
};

const splitComponent = (component: Component, u: VertexId, v: VertexId) => {
  const adj = buildAdjacency(component);
  const remaining = component.vertices.filter((x) => x !== u && x !== v);
  const visited = new Set<VertexId>();
  const components: Component[] = [];

  const uvEdges = component.edges.filter(
    (edge) => (edge.u === u && edge.v === v) || (edge.u === v && edge.v === u),
  );

  for (const start of remaining) {
    if (visited.has(start)) continue;
    const stack = [start];
    const block = new Set<VertexId>();
    visited.add(start);
    block.add(start);
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) continue;
      const edges = adj.get(cur) ?? [];
      for (const { to } of edges) {
        if (to === u || to === v) continue;
        if (!visited.has(to)) {
          visited.add(to);
          block.add(to);
          stack.push(to);
        }
      }
    }

    const vertices = [u, v, ...block.values()].sort((a, b) => a - b);
    const vertexSet = new Set(vertices);
    const edges = component.edges.filter((edge) => {
      if ((edge.u === u && edge.v === v) || (edge.u === v && edge.v === u)) return false;
      return vertexSet.has(edge.u) && vertexSet.has(edge.v);
    });
    if (edges.length > 0) {
      components.push({ id: -1, vertices, edges });
    }
  }

  for (const edge of uvEdges) {
    components.push({
      id: -1,
      vertices: [u, v].sort((a, b) => a - b),
      edges: [edge],
    });
  }

  return components;
};

const assignComponentIds = (components: Component[]) => {
  components.forEach((component, idx) => {
    component.id = idx;
  });
};

const sanitizeForSpqr = (graph: Graph, options: SPQRSafeOptions = {}) => {
  const treatDirected = options.treatDirectedAsUndirected ?? false;
  const allowSelfLoops = options.allowSelfLoops ?? 'reject';
  const ignoredSelfLoops: EdgeId[] = [];
  const needsClone = treatDirected || allowSelfLoops === 'ignore';

  if (!needsClone) {
    for (const edge of graph.edges()) {
      if (edge.directed) throw new Error('SPQR decomposition requires an undirected graph.');
      if (edge.u === edge.v) throw new Error('SPQR decomposition does not support self-loops.');
    }
    return {
      graph,
      edgeMap: graph.edges().map((edge) => edge.id),
      ignoredSelfLoops,
      treatedDirectedAsUndirected: false,
    };
  }

  const builder = new GraphBuilder();
  for (const v of graph.vertices()) builder.addVertex(graph.label(v));
  const edgeMap: EdgeId[] = [];
  for (const edge of graph.edges()) {
    if (edge.u === edge.v) {
      if (allowSelfLoops === 'ignore') {
        ignoredSelfLoops.push(edge.id);
        continue;
      }
      throw new Error('SPQR decomposition does not support self-loops.');
    }
    if (edge.directed && !treatDirected) {
      throw new Error('SPQR decomposition requires an undirected graph.');
    }
    const newId = builder.addEdge(edge.u, edge.v, false);
    edgeMap[newId] = edge.id;
  }
  return {
    graph: builder.build(),
    edgeMap,
    ignoredSelfLoops,
    treatedDirectedAsUndirected: treatDirected,
  };
};

const buildSubgraphFromEdges = (graph: Graph, edges: EdgeId[]) => {
  const vertices = new Set<VertexId>();
  for (const edgeId of edges) {
    const edge = graph.edge(edgeId);
    vertices.add(edge.u);
    vertices.add(edge.v);
  }
  const vertexMap = Array.from(vertices.values()).sort((a, b) => a - b);
  const index = new Map<VertexId, VertexId>();
  const builder = new GraphBuilder();
  vertexMap.forEach((v, idx) => {
    index.set(v, idx as VertexId);
    builder.addVertex(graph.label(v));
  });
  const edgeMap: EdgeId[] = [];
  const sortedEdges = edges.slice().sort((a, b) => a - b);
  for (const edgeId of sortedEdges) {
    const edge = graph.edge(edgeId);
    const u = index.get(edge.u);
    const v = index.get(edge.v);
    if (u === undefined || v === undefined) continue;
    const newId = builder.addEdge(u, v, false);
    edgeMap[newId] = edgeId;
  }
  return { graph: builder.build(), vertexMap, edgeMap };
};

const mapSpqrTree = (
  tree: SPQRTree,
  edgeMap: EdgeId[],
  vertexMap?: VertexId[],
): SPQRTree => {
  const mapVertex = (v: VertexId) => (vertexMap ? (vertexMap[v] ?? v) : v);
  const nodes = tree.nodes.map((node) => {
    const mappedEdgeKind = node.edgeKind.map((kind) => {
      if (!kind) return kind;
      if (kind.kind === 'real') {
        return {
          ...kind,
          original: edgeMap[kind.original ?? -1] ?? kind.original,
        };
      }
      return { ...kind };
    });
    return {
      ...node,
      edgeKind: mappedEdgeKind,
      vertexMap: node.vertexMap.map(mapVertex),
    };
  });
  const edges = tree.edges.map((edge) => ({
    ...edge,
    pair: [mapVertex(edge.pair[0]), mapVertex(edge.pair[1])] as [VertexId, VertexId],
    ...(edge.originalEdge !== undefined
      ? { originalEdge: edgeMap[edge.originalEdge] ?? edge.originalEdge }
      : {}),
  }));
  return { nodes, edges };
};

export function spqrDecompose(graph: Graph): SPQRTree {
  for (const edge of graph.edges()) {
    if (edge.directed) throw new Error('SPQR decomposition requires an undirected graph.');
    if (edge.u === edge.v) throw new Error('SPQR decomposition does not support self-loops.');
  }

  const bcc = biconnectedComponents(graph);
  if (bcc.blocks.length !== 1 || bcc.articulationPoints.length > 0) {
    throw new Error('SPQR decomposition requires a biconnected graph.');
  }

  const initial: Component = {
    id: 0,
    vertices: graph.vertices().slice().sort((a, b) => a - b),
    edges: graph.edges().map((edge) => ({
      u: edge.u,
      v: edge.v,
      kind: 'real',
      original: edge.id,
    })),
  };

  const worklist: Component[] = [initial];
  const finalComponents: Component[] = [];
  let virtualId = 0;

  while (worklist.length > 0) {
    const component = worklist.shift();
    if (!component) continue;

    if (component.edges.length === 1 && component.edges[0]?.kind === 'real') {
      finalComponents.push(component);
      continue;
    }
    if (isParallel(component) || isCycle(component)) {
      finalComponents.push(component);
      continue;
    }

    const sep = hasSeparationPair(component);
    if (!sep) {
      finalComponents.push(component);
      continue;
    }

    const subcomponents = splitComponent(component, sep.u, sep.v);
    if (subcomponents.length >= 3) {
      const pComponent: Component = {
        id: -1,
        vertices: [sep.u, sep.v].sort((a, b) => a - b),
        edges: [],
      };
      for (const sub of subcomponents) {
        const vId = virtualId++;
        pComponent.edges.push({ u: sep.u, v: sep.v, kind: 'virtual', virtualId: vId });
        sub.edges.push({ u: sep.u, v: sep.v, kind: 'virtual', virtualId: vId });
      }
      finalComponents.push(pComponent);
      worklist.push(...subcomponents);
    } else if (subcomponents.length === 2) {
      const vId = virtualId++;
      subcomponents[0]?.edges.push({ u: sep.u, v: sep.v, kind: 'virtual', virtualId: vId });
      subcomponents[1]?.edges.push({ u: sep.u, v: sep.v, kind: 'virtual', virtualId: vId });
      worklist.push(...subcomponents);
    } else {
      finalComponents.push(component);
    }
  }

  assignComponentIds(finalComponents);

  const nodes: SPQRNode[] = [];
  for (const component of finalComponents) {
    const type: SPQRNodeType =
      component.edges.length === 1 && component.edges[0]?.kind === 'real'
        ? 'Q'
        : isParallel(component)
          ? 'P'
          : isCycle(component)
            ? 'S'
            : 'R';

    const vertexMap = component.vertices.slice().sort((a, b) => a - b);
    const vertexIndex = new Map<VertexId, VertexId>();
    vertexMap.forEach((v, idx) => vertexIndex.set(v, idx as VertexId));

    const builder = new GraphBuilder();
    for (let i = 0; i < vertexMap.length; i += 1) builder.addVertex(vertexMap[i]);

    const sortedEdges = component.edges.slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'real' ? -1 : 1;
      const ida = a.kind === 'real' ? a.original ?? -1 : a.virtualId ?? -1;
      const idb = b.kind === 'real' ? b.original ?? -1 : b.virtualId ?? -1;
      if (ida !== idb) return ida - idb;
      if (a.u !== b.u) return a.u - b.u;
      return a.v - b.v;
    });

    const edgeKind: SkeletonEdgeKind[] = [];
    for (const edge of sortedEdges) {
      const u = vertexIndex.get(edge.u);
      const v = vertexIndex.get(edge.v);
      if (u === undefined || v === undefined) continue;
      const edgeId = builder.addEdge(u, v, false);
      edgeKind[edgeId] =
        edge.kind === 'real'
          ? { kind: 'real', original: edge.original ?? -1 }
          : { kind: 'virtual', virtualId: edge.virtualId ?? -1 };
    }

    const nodeId = nodes.length;
    nodes.push({ id: nodeId, type, skeleton: builder.build(), edgeKind, vertexMap });
  }

  const edges: SPQRTreeEdge[] = [];
  const virtualUses = new Map<number, Array<{ nodeId: number; edgeId: EdgeId }>>();

  nodes.forEach((node) => {
    node.edgeKind.forEach((kind, edgeId) => {
      if (!kind) return;
      if (kind.kind === 'virtual') {
        const list = virtualUses.get(kind.virtualId) ?? [];
        list.push({ nodeId: node.id, edgeId: edgeId as EdgeId });
        virtualUses.set(kind.virtualId, list);
      }
    });
  });

  virtualUses.forEach((uses, virtualId) => {
    if (uses.length !== 2) return;
    const [a, b] = uses;
    if (!a || !b) return;
    const pair: [VertexId, VertexId] = [
      nodes[a.nodeId]?.vertexMap[nodes[a.nodeId]?.skeleton.edge(a.edgeId).u ?? 0] ?? 0,
      nodes[a.nodeId]?.vertexMap[nodes[a.nodeId]?.skeleton.edge(a.edgeId).v ?? 0] ?? 0,
    ];
    const edgeId = edges.length;
    edges.push({ id: edgeId, from: a.nodeId, to: b.nodeId, kind: 'virtual', pair, virtualId });
    const kindA = nodes[a.nodeId]?.edgeKind[a.edgeId];
    const kindB = nodes[b.nodeId]?.edgeKind[b.edgeId];
    if (kindA) kindA.treeEdge = edgeId;
    if (kindB) kindB.treeEdge = edgeId;
  });

  const realEdgeSeen = new Set<EdgeId>();
  nodes.forEach((node) => {
    if (node.type === 'Q') return;
    node.edgeKind.forEach((kind) => {
      if (!kind || kind.kind !== 'real') return;
      const original = kind.original;
      if (original === undefined || original < 0) return;
      if (realEdgeSeen.has(original)) return;
      realEdgeSeen.add(original);
      const record = graph.edge(original);
      const builder = new GraphBuilder();
      const uLocal = builder.addVertex(record.u);
      const vLocal = builder.addVertex(record.v);
      const qEdge = builder.addEdge(uLocal, vLocal, false);
      const qNodeId = nodes.length;
      nodes.push({
        id: qNodeId,
        type: 'Q',
        skeleton: builder.build(),
        edgeKind: [{ kind: 'real', original }],
        vertexMap: [record.u, record.v],
      });
      const edgeIdTree = edges.length;
      edges.push({
        id: edgeIdTree,
        from: node.id,
        to: qNodeId,
        kind: 'real',
        pair: [record.u, record.v],
        originalEdge: original,
      });
      kind.treeEdge = edgeIdTree;
      const qKind = nodes[qNodeId]?.edgeKind[qEdge];
      if (qKind) qKind.treeEdge = edgeIdTree;
    });
  });

  return { nodes, edges };
}

export function spqrDecomposeAll(graph: Graph, options: SPQRSafeOptions = {}): SPQRForest {
  const sanitized = sanitizeForSpqr(graph, options);
  const bcc = biconnectedComponents(sanitized.graph);
  const blocks = bcc.blocks.map((block) => {
    if (!block.length) {
      return { edges: [] as EdgeId[], tree: { nodes: [], edges: [] } };
    }
    const sub = buildSubgraphFromEdges(sanitized.graph, block);
    const tree = spqrDecompose(sub.graph);
    const edgeMapToOriginal = sub.edgeMap.map((edgeId) => sanitized.edgeMap[edgeId] ?? edgeId);
    const mappedTree = mapSpqrTree(tree, edgeMapToOriginal, sub.vertexMap);
    const mappedEdges = block.map((edgeId) => sanitized.edgeMap[edgeId] ?? edgeId);
    return { edges: mappedEdges, tree: mappedTree };
  });

  const forest: SPQRForest = {
    blocks,
    articulationPoints: bcc.articulationPoints.slice(),
  };
  if (sanitized.ignoredSelfLoops.length) forest.ignoredSelfLoops = sanitized.ignoredSelfLoops;
  if (sanitized.treatedDirectedAsUndirected) {
    forest.treatedDirectedAsUndirected = true;
  }
  return forest;
}

export function spqrDecomposeSafe(graph: Graph, options: SPQRSafeOptions = {}): SPQRSafeResult {
  const sanitized = sanitizeForSpqr(graph, options);
  const bcc = biconnectedComponents(sanitized.graph);
  if (bcc.blocks.length === 0) {
    throw new Error('SPQR decomposition requires at least one edge.');
  }
  let block = bcc.blocks[0] ?? [];
  if (options.block === 'largest') {
    for (const candidate of bcc.blocks) {
      if (candidate.length > block.length) block = candidate;
    }
  }
  const sub = buildSubgraphFromEdges(sanitized.graph, block);
  const tree = spqrDecompose(sub.graph);
  const edgeMapToOriginal = sub.edgeMap.map((edgeId) => sanitized.edgeMap[edgeId] ?? edgeId);
  const mappedTree = mapSpqrTree(tree, edgeMapToOriginal, sub.vertexMap);
  const note =
    bcc.blocks.length > 1 || bcc.articulationPoints.length > 0
      ? `Input not biconnected: using ${options.block === 'first' ? 'first' : 'largest'} block (${block.length} edge(s)).`
      : undefined;
  const result: SPQRSafeResult = {
    tree: mappedTree,
    blockEdges: block.map((edgeId) => sanitized.edgeMap[edgeId] ?? edgeId),
  };
  if (note) result.note = note;
  if (sanitized.ignoredSelfLoops.length) result.ignoredSelfLoops = sanitized.ignoredSelfLoops;
  if (sanitized.treatedDirectedAsUndirected) {
    result.treatedDirectedAsUndirected = true;
  }
  return result;
}

export type SPQRValidation = { ok: boolean; errors: string[] };

export function findSeparationPair(graph: Graph): [VertexId, VertexId] | null {
  const vertices = graph.vertices();
  if (vertices.length <= 3) return null;

  const adjacency: Array<VertexId[]> = Array.from({ length: graph.vertexCount() }, () => []);
  const multiplicity = new Map<string, number>();

  for (const edge of graph.edges()) {
    if (edge.directed) {
      throw new Error('SPQR separation pair check requires an undirected graph.');
    }
    if (edge.u === edge.v) {
      throw new Error('SPQR separation pair check does not support self-loops.');
    }
    adjacency[edge.u]?.push(edge.v);
    adjacency[edge.v]?.push(edge.u);
    const key = pairKey(edge.u, edge.v);
    multiplicity.set(key, (multiplicity.get(key) ?? 0) + 1);
  }

  const n = vertices.length;
  for (let i = 0; i < n; i += 1) {
    const u = vertices[i]!;
    for (let j = i + 1; j < n; j += 1) {
      const v = vertices[j]!;
      const key = pairKey(u, v);
      if ((multiplicity.get(key) ?? 0) >= 2) {
        return [u, v];
      }

      const remaining = vertices.filter((x) => x !== u && x !== v);
      if (remaining.length <= 1) continue;
      const visited = new Set<VertexId>();
      const stack: VertexId[] = [remaining[0]!];
      visited.add(remaining[0]!);
      while (stack.length > 0) {
        const cur = stack.pop();
        if (cur === undefined) continue;
        for (const to of adjacency[cur] ?? []) {
          if (to === u || to === v) continue;
          if (!visited.has(to)) {
            visited.add(to);
            stack.push(to);
          }
        }
      }
      if (visited.size !== remaining.length) {
        return [u, v];
      }
    }
  }

  return null;
}

export function validateSPQRTree(tree: SPQRTree): SPQRValidation {
  const errors: string[] = [];
  const nodeCount = tree.nodes.length;
  if (nodeCount === 0) return { ok: true, errors };

  if (tree.edges.length !== nodeCount - 1) {
    errors.push('SPQR tree edge count must equal nodes - 1.');
  }

  const treeAdj: number[][] = Array.from({ length: nodeCount }, () => []);
  for (const edge of tree.edges) {
    if (edge.from < 0 || edge.from >= nodeCount || edge.to < 0 || edge.to >= nodeCount) {
      errors.push(`SPQR tree edge ${edge.id} has invalid endpoints.`);
      continue;
    }
    treeAdj[edge.from]?.push(edge.to);
    treeAdj[edge.to]?.push(edge.from);
  }

  const seen = new Set<number>();
  const stack = [0];
  seen.add(0);
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined) continue;
    for (const next of treeAdj[cur] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  if (seen.size !== nodeCount) {
    errors.push('SPQR tree is not connected.');
  }

  const virtualCounts = new Map<number, number>();
  tree.nodes.forEach((node) => {
    node.edgeKind.forEach((kind) => {
      if (kind?.kind === 'virtual') {
        virtualCounts.set(kind.virtualId, (virtualCounts.get(kind.virtualId) ?? 0) + 1);
      }
    });
  });
  for (const [virtualId, count] of virtualCounts.entries()) {
    if (count !== 2) {
      errors.push(`Virtual edge ${virtualId} appears ${count} times (expected 2).`);
    }
  }

  tree.nodes.forEach((node) => {
    const skeleton = node.skeleton;
    const edgeCount = skeleton.edgeCount();
    for (let e = 0; e < edgeCount; e += 1) {
      if (!node.edgeKind[e]) {
        errors.push(`Node ${node.id} missing edgeKind for skeleton edge ${e}.`);
      }
    }

    if (node.type === 'Q') {
      if (edgeCount !== 1) errors.push(`Q node ${node.id} must have exactly one edge.`);
      if (node.edgeKind[0]?.kind !== 'real') {
        errors.push(`Q node ${node.id} must contain a real edge.`);
      }
    }

    if (node.type === 'P') {
      if (skeleton.vertexCount() !== 2 || edgeCount < 2) {
        errors.push(`P node ${node.id} must have two vertices and >=2 edges.`);
      } else {
        const first = skeleton.edge(0);
        for (const edge of skeleton.edges()) {
          const samePair =
            (edge.u === first.u && edge.v === first.v) || (edge.u === first.v && edge.v === first.u);
          if (!samePair) {
            errors.push(`P node ${node.id} contains non-parallel edges.`);
            break;
          }
        }
      }
    }

    if (node.type === 'S') {
      const vCount = skeleton.vertexCount();
      if (edgeCount !== vCount || vCount < 3) {
        errors.push(`S node ${node.id} must be a cycle.`);
      } else {
        for (let v = 0; v < vCount; v += 1) {
          if (skeleton.adjacency(v).length !== 2) {
            errors.push(`S node ${node.id} has vertex ${v} with degree != 2.`);
            break;
          }
        }
      }
    }

    if (node.type === 'R') {
      const sep = findSeparationPair(skeleton);
      if (sep) {
        errors.push(`R node ${node.id} has separation pair (${sep[0]}, ${sep[1]}).`);
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

export function flipSkeleton(node: SPQRNode): RotationSystem {
  const rotation = rotationFromAdjacency(node.skeleton);
  const order = rotation.order.map((list) => [...list].reverse());
  return { order };
}

export function permuteParallel(node: SPQRNode, order: EdgeId[]): RotationSystem {
  const rotation = rotationFromAdjacency(node.skeleton);
  if (node.type !== 'P') return rotation;
  if (order.length === 0) return rotation;
  const first = order[0]!;
  const v0 = node.skeleton.edge(first).u;
  const v1 = node.skeleton.edge(first).v;
  const lookup = new Map<EdgeId, { edge: EdgeId; to: VertexId }>();
  for (const edge of order) {
    const record = node.skeleton.edge(edge);
    const to = record.u === v0 ? record.v : record.u;
    lookup.set(edge, { edge, to });
  }
  const newOrder = rotation.order.map((list, idx) => {
    if (idx !== v0 && idx !== v1) return list;
    const reordered: { edge: EdgeId; to: VertexId }[] = [];
    for (const edge of order) {
      const ref = lookup.get(edge);
      if (ref) reordered.push(ref);
    }
    return reordered;
  });
  return { order: newOrder };
}

export function materializeEmbedding(node: SPQRNode): RotationSystem {
  return rotationFromAdjacency(node.skeleton);
}

export function buildSkeletonFromEdges(vertices: number, edges: Array<[VertexId, VertexId]>): Graph {
  const builder = new GraphBuilder();
  for (let i = 0; i < vertices; i += 1) builder.addVertex(i);
  for (const [u, v] of edges) builder.addEdge(u, v, false);
  return builder.build();
}
