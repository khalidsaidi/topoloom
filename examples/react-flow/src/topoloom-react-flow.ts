/**
 * INLINED COPY of the adapter that ships as `@khalidsaidi/topoloom/react-flow`
 * starting with v0.3.0. This example pins topoloom 0.2.7 from npm (the latest
 * published version), where the subpath does not exist yet — once 0.3.0 is on
 * npm, delete this file and import { toReactFlow } from
 * '@khalidsaidi/topoloom/react-flow' instead.
 */
/**
 * React Flow adapter — a pure data transform from topoloom layout results to
 * the node/edge shape expected by `@xyflow/react` (React Flow 11+/12).
 *
 * This module intentionally has ZERO runtime dependencies on `react` or
 * `@xyflow/react`; it only produces plain objects that are structurally
 * assignable to React Flow's `Node` and `Edge` types.
 *
 * Bend points: React Flow's built-in edges do not accept explicit waypoints,
 * so the adapter (a) defaults edges with bends to `type: 'smoothstep'`, which
 * visually approximates orthogonal routing with zero extra code, and (b)
 * preserves the exact orthogonal polyline on `edge.data.points` /
 * `edge.data.bendPoints` so a custom edge component can render the true route.
 */
import type { Graph, VertexId, EdgeId } from '@khalidsaidi/topoloom/graph';
import type { LayoutResult, PlanarizationResult, Point } from '@khalidsaidi/topoloom/layout';

/** Structurally compatible with `Node` from `@xyflow/react`. */
export type ReactFlowNode = {
  id: string;
  position: { x: number; y: number };
  data: { label: string; vertexId: VertexId } & Record<string, unknown>;
  type?: string;
  [key: string]: unknown;
};

/** Structurally compatible with `Edge` from `@xyflow/react`. */
export type ReactFlowEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  data: {
    /** topoloom edge id in the input graph. */
    edgeId: EdgeId;
    /** Full routed polyline (scaled), endpoints included. */
    points: Point[];
    /** Interior waypoints only — the orthogonal bends (scaled). */
    bendPoints: Point[];
  } & Record<string, unknown>;
  [key: string]: unknown;
};

export type ToReactFlowOptions = {
  /**
   * Multiplier applied to all layout coordinates. topoloom's compacted
   * orthogonal grids use a 20px pitch, which is tight next to React Flow's
   * default ~150px-wide nodes — scale up (or pass small custom nodes).
   * Default: 1.
   */
  scale?: number;
  /**
   * topoloom positions are vertex *center* points, while React Flow positions
   * are the node's *top-left* corner. Pass your node dimensions to have the
   * adapter subtract half of each so nodes are centered on the layout point.
   * Defaults: 0 (no offset).
   */
  nodeWidth?: number;
  nodeHeight?: number;
  /**
   * Force one React Flow edge `type` for every edge. When omitted, edges with
   * bends default to `'smoothstep'` and straight edges to `'straight'`.
   * Pass your custom edge type name to render `data.bendPoints` exactly.
   */
  edgeType?: string;
  /** Extra properties merged into every node (core fields win). */
  nodeDefaults?: Record<string, unknown>;
  /** Extra properties merged into every edge (core fields win). */
  edgeDefaults?: Record<string, unknown>;
};

export type ReactFlowGraph = {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
};

const labelOf = (graph: Graph, v: VertexId): string | number | null => graph.label(v);

const buildNodeIds = (graph: Graph): Map<VertexId, string> => {
  const vertices = graph.vertices();
  const labels = vertices.map((v) => labelOf(graph, v));
  const asStrings = labels.map((l) => (l === null ? null : String(l)));
  const nonNull = asStrings.filter((l): l is string => l !== null);
  const allLabeled = nonNull.length === vertices.length;
  const allUnique = new Set(nonNull).size === nonNull.length;
  const useLabels = allLabeled && allUnique;

  const ids = new Map<VertexId, string>();
  vertices.forEach((v, i) => {
    ids.set(v, useLabels ? asStrings[i]! : String(v));
  });
  return ids;
};

/**
 * Convert a topoloom layout into React Flow `nodes`/`edges` arrays.
 *
 * Accepts either a bare {@link LayoutResult} (from `planarStraightLine` /
 * `orthogonalLayout`) or a {@link PlanarizationResult} (from
 * `planarizationLayout`) — for the latter, dummy crossing vertices are never
 * emitted as nodes; they only appear as bend points on the crossing edges.
 *
 * Node ids reuse the graph's vertex labels when every vertex has a unique
 * label; otherwise numeric vertex ids are used. The original label (or the
 * stringified vertex id as a fallback) is always on `node.data.label`.
 */
export function toReactFlow(
  result: LayoutResult | PlanarizationResult,
  graph: Graph,
  opts: ToReactFlowOptions = {},
): ReactFlowGraph {
  const layout: LayoutResult = 'layout' in result ? result.layout : result;
  const scale = opts.scale ?? 1;
  const halfW = (opts.nodeWidth ?? 0) / 2;
  const halfH = (opts.nodeHeight ?? 0) / 2;

  const nodeIds = buildNodeIds(graph);

  const nodes: ReactFlowNode[] = graph.vertices().map((v) => {
    const p = layout.positions.get(v) ?? { x: 0, y: 0 };
    const label = labelOf(graph, v);
    return {
      ...opts.nodeDefaults,
      id: nodeIds.get(v)!,
      position: { x: p.x * scale - halfW, y: p.y * scale - halfH },
      data: { label: label === null ? String(v) : String(label), vertexId: v },
    };
  });

  const edgeCount = graph.edgeCount();
  const edges: ReactFlowEdge[] = [];
  for (const path of layout.edges) {
    if (path.edge < 0 || path.edge >= edgeCount) continue; // e.g. augmented/dummy edges
    const record = graph.edge(path.edge);
    const points = path.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const bendPoints = points.slice(1, Math.max(1, points.length - 1));
    edges.push({
      ...opts.edgeDefaults,
      id: `e${path.edge}`,
      source: nodeIds.get(record.u)!,
      target: nodeIds.get(record.v)!,
      type: opts.edgeType ?? (bendPoints.length > 0 ? 'smoothstep' : 'straight'),
      data: { edgeId: path.edge, points, bendPoints },
    });
  }

  return { nodes, edges };
}
