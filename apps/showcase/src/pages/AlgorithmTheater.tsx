import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { Group, Easing, Tween } from '@tweenjs/tween.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib';

import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card, CardDescription, CardTitle } from '@/ui/Card';

import { GraphBuilder } from '@khalidsaidi/topoloom/graph';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';
import { biconnectedComponents, buildBCTree, sccTarjan } from '@khalidsaidi/topoloom/dfs';
import { spqrDecomposeSafe } from '@khalidsaidi/topoloom/decomp';
import { routeEdgeOnGraph } from '@khalidsaidi/topoloom/dual';
import { minCostFlow } from '@khalidsaidi/topoloom/flow';
import { orthogonalLayout, planarStraightLine, planarizationLayout } from '@khalidsaidi/topoloom/layout';
import { stNumbering, bipolarOrientation } from '@khalidsaidi/topoloom/order';

CameraControls.install({ THREE });

type StageId = 'hairball' | 'planarity' | 'embedding' | 'bcspqr' | 'dual' | 'flow' | 'layout';

type StaticStageId = Exclude<StageId, 'hairball'>;

type StageDef = {
  id: StageId;
  title: string;
  subtitle: string;
};

type AlgorithmId =
  | 'scc'
  | 'biconnected'
  | 'bctree'
  | 'planarity'
  | 'embedding'
  | 'dual'
  | 'storder'
  | 'flow'
  | 'spqr'
  | 'layout-straight'
  | 'layout-orthogonal'
  | 'layout-planarization';

type AlgorithmDef = {
  id: AlgorithmId;
  title: string;
  subtitle: string;
  curatedGraph: string;
  explanation: string;
  stages: StageId[];
  stageNotes: Partial<Record<StageId, string>>;
};

type FlowModel = {
  nodeCount: number;
  demands: number[];
  arcs: Array<{ from: number; to: number; upper: number; cost: number }>;
  edgeRefs?: Array<[number, number]>;
};

type GraphSpec = {
  nodeCount: number;
  labels: string[];
  edges: Array<[number, number]>;
  directed?: boolean;
  meta?: {
    dualTerminals?: { source: number; target: number };
    flowModel?: FlowModel;
    stTerminals?: { s: number; t: number };
  };
};

type StageHighlight = {
  nodeIndices: number[];
  edgeIndices: number[];
  nodeColor: number;
  edgeColor: number;
};

type TheaterSnapshot = {
  graph: GraphSpec;
  stageTargets: Record<StaticStageId, Float32Array>;
  motion: {
    componentOf: number[];
    blockOf: number[];
    stOrderNorm: number[];
    flowLoad: number[];
    witnessMask: number[];
  };
  highlights: Record<StageId, StageHighlight>;
  summary: {
    planar: boolean;
    witnessEdges: number;
    faces: number;
    blocks: number;
    bcTreeNodes: number;
    bcTreeEdges: number;
    articulations: number;
    bridges: number;
    sccCount: number;
    largestScc: number;
    stOrderVertices: number;
    bipolarDirectedEdges: number;
    spqr: { S: number; P: number; R: number; Q: number };
    dualCrossed: number;
    flowCost: number;
    flowFeasible: boolean;
    layoutMode: string;
    crossings: number;
    bends: number;
    layoutNote?: string;
  };
};

type TheaterEngine = {
  setStage: (stageId: StageId) => void;
  dispose: () => void;
};

const STAGES: StageDef[] = [
  { id: 'hairball', title: 'Hairball Dynamics', subtitle: 'Rapier physics scramble with spring constraints' },
  { id: 'planarity', title: 'Planarity + Witness', subtitle: 'Kuratowski witness edges pulse if nonplanar' },
  { id: 'embedding', title: 'Embedding + Faces', subtitle: 'Half-edge mesh and face topology become visible' },
  { id: 'bcspqr', title: 'BC-tree + SPQR', subtitle: 'Articulations, bridges, and S/P/R/Q decomposition cues' },
  { id: 'dual', title: 'Dual Routing', subtitle: 'Route edge insertion through dual shortest paths' },
  { id: 'flow', title: 'Min-cost Flow', subtitle: 'Residual optimization drives weighted path emphasis' },
  { id: 'layout', title: 'Deterministic Layout', subtitle: 'Topology pipeline settles into stable coordinates' },
];

const STAGE_BY_ID = new Map<StageId, StageDef>(STAGES.map((stage) => [stage.id, stage]));

const ALGORITHMS: AlgorithmDef[] = [
  {
    id: 'scc',
    title: 'Tarjan SCC',
    subtitle: 'Find strongly connected regions in directed graphs.',
    curatedGraph: 'Handcrafted directed 4-basin SCC graph with one-way condensation links.',
    explanation:
      'Runs Tarjan low-link SCC. Each strongly connected basin can be traversed bidirectionally; one-way bridges define condensation flow.',
    stages: ['embedding', 'bcspqr'],
    stageNotes: {
      embedding: 'Directed basins begin separating by circulation structure.',
      bcspqr: 'SCC basins are clustered and separated by one-way cut arcs.',
    },
  },
  {
    id: 'biconnected',
    title: 'Biconnected + Low-link',
    subtitle: 'Expose articulation points and bridges.',
    curatedGraph: 'Handcrafted multi-block graph with long bridge chains.',
    explanation:
      'Runs DFS low-link to identify biconnected edge blocks, articulation cut vertices, and bridge edges.',
    stages: ['planarity', 'bcspqr'],
    stageNotes: {
      planarity: 'Structural scan prepares low-link decomposition anchors.',
      bcspqr: 'Articulations and bridges pulse to show failure points.',
    },
  },
  {
    id: 'bctree',
    title: 'BC-tree Construction',
    subtitle: 'Lift block-cut structure into a decomposition tree.',
    curatedGraph: 'Handcrafted 5-block cut-vertex graph for BC-tree readability.',
    explanation:
      'Builds a BC-tree where block nodes and articulation nodes define the decomposition scaffold.',
    stages: ['embedding', 'bcspqr'],
    stageNotes: {
      embedding: 'Base embedding establishes cluster neighborhoods.',
      bcspqr: 'Block lift depth encodes BC-tree neighborhoods.',
    },
  },
  {
    id: 'planarity',
    title: 'Planarity + Witness',
    subtitle: 'Detect nonplanarity and expose the concrete obstruction.',
    curatedGraph: 'Handcrafted K3,3 obstruction with anchored attachments.',
    explanation:
      'Runs a left-right planarity test and extracts a Kuratowski witness, then pulses those edges so you see exactly why the drawing fails.',
    stages: ['planarity'],
    stageNotes: {
      hairball: 'Input graph is scrambled to make crossings obvious.',
      planarity: 'Kuratowski witness edges pulse red while non-witness structure stays cool.',
    },
  },
  {
    id: 'embedding',
    title: 'Embedding + Faces',
    subtitle: 'Build an explicit half-edge mesh and expose face structure.',
    curatedGraph: 'Handcrafted planar district with nested rings and pockets.',
    explanation:
      'Computes a planar embedding, then builds a half-edge mesh. The scene transitions to face-aware geometry where cycle structure becomes inspectable.',
    stages: ['planarity', 'embedding'],
    stageNotes: {
      planarity: 'Planarity gate unlocks embedding construction.',
      embedding: 'Face-capable embedding comes online with stable cyclic order.',
    },
  },
  {
    id: 'dual',
    title: 'Dual Routing',
    subtitle: 'Route insertions through the dual with topological guarantees.',
    curatedGraph: 'Handcrafted corridor grid with choke points for dual traversal.',
    explanation:
      'Builds the dual graph and computes a shortest face-space route, then highlights primal edges crossed by the insertion path.',
    stages: ['planarity', 'embedding', 'dual'],
    stageNotes: {
      dual: 'Crossed primal edges light up in cyan as the dual route resolves.',
    },
  },
  {
    id: 'storder',
    title: 'st-numbering + Bipolar',
    subtitle: 'Derive acyclic bipolar orientation from st-order.',
    curatedGraph: 'Handcrafted biconnected planar graph with fixed s/t terminals.',
    explanation:
      'Computes st-numbering then orients edges from lower to higher labels (bipolar orientation) over a planar embedding.',
    stages: ['planarity', 'embedding', 'layout'],
    stageNotes: {
      layout: 'Vertices settle by st-order rank while orientation constraints remain acyclic.',
    },
  },
  {
    id: 'flow',
    title: 'Min-cost Flow',
    subtitle: 'Solve constrained transport with cost-optimal residual updates.',
    curatedGraph: 'Handcrafted supply-demand transport network with relay branches.',
    explanation:
      'Runs min-cost flow with reduced costs and residual updates, then thickens/brightens edges carrying higher optimized flow.',
    stages: ['planarity', 'flow'],
    stageNotes: {
      flow: 'Flow-carrying edges get elevated and intensified by solved throughput.',
    },
  },
  {
    id: 'spqr',
    title: 'SPQR Decomposition',
    subtitle: 'Split triconnected structure into S/P/R/Q components.',
    curatedGraph: 'Handcrafted biconnected theta-style graph with mixed S/P/R/Q signatures.',
    explanation:
      'Runs safe block-based SPQR decomposition and exposes S/P/R/Q composition used by downstream topology-aware layout.',
    stages: ['planarity', 'embedding', 'bcspqr'],
    stageNotes: {
      embedding: 'Rotation structure stabilizes separation-pair context.',
      bcspqr: 'S/P/R/Q proportions drive vertical lift and highlighting.',
    },
  },
  {
    id: 'layout-straight',
    title: 'Planar Straight-line Layout',
    subtitle: 'Tutte-style barycentric straight-line embedding.',
    curatedGraph: 'Handcrafted planar district with nested courts and corridors.',
    explanation:
      'Builds a planar embedding and solves barycentric coordinates with fixed boundary for straight-line deterministic output.',
    stages: ['planarity', 'embedding', 'layout'],
    stageNotes: {
      layout: 'Straight-line solve settles to deterministic coordinates.',
    },
  },
  {
    id: 'layout-orthogonal',
    title: 'Orthogonal Layout',
    subtitle: 'Port assignment + bend accounting + compaction.',
    curatedGraph: 'Handcrafted 7x5 corridor network tuned for bend-heavy orthogonal routing.',
    explanation:
      'Runs orthogonal layout over a planar mesh, counting bends and preserving deterministic routing structure.',
    stages: ['planarity', 'embedding', 'layout'],
    stageNotes: {
      layout: 'Orthogonal routing compacts to axis-aligned structure.',
    },
  },
  {
    id: 'layout-planarization',
    title: 'Planarization Layout',
    subtitle: 'Incremental planarity filtering + routed reinsertion.',
    curatedGraph: 'Handcrafted double-K3,3 nonplanar graph requiring staged reinsertion.',
    explanation:
      'Runs planarization, reinserts filtered edges through routed paths, and reports deterministic crossings and bends.',
    stages: ['planarity', 'layout'],
    stageNotes: {
      layout: 'Planarized reinsertion resolves nonplanar conflicts into stable routed output.',
    },
  },
];

const EDGE_BASE = 0xb8d7ff;
const NODE_BASE = 0xaee3ff;

const STAGE_DURATION_MS: Record<StageId, number> = {
  hairball: 1800,
  planarity: 2200,
  embedding: 2200,
  bcspqr: 2300,
  dual: 2200,
  flow: 2200,
  layout: 2600,
};

const sleep = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded01(seed: number, tag: string) {
  return (hash32(`${seed}:${tag}`) & 0xfffffff) / 0xfffffff;
}

function edgeKey(u: number, v: number) {
  return u < v ? `${u}:${v}` : `${v}:${u}`;
}

function normalizePositions(source: Float32Array, radius = 48): Float32Array {
  const out = source.slice();
  if (out.length === 0) return out;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < out.length; i += 3) {
    const x = out[i] ?? 0;
    const y = out[i + 1] ?? 0;
    const z = out[i + 2] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const spanZ = Math.max(1e-6, maxZ - minZ);
  const scale = radius / Math.max(spanX, spanY, spanZ);

  for (let i = 0; i < out.length; i += 3) {
    out[i] = ((out[i] ?? 0) - cx) * scale;
    out[i + 1] = ((out[i + 1] ?? 0) - cy) * scale;
    out[i + 2] = ((out[i + 2] ?? 0) - cz) * scale;
  }

  return out;
}

function theaterRadius(nodeCount: number) {
  if (nodeCount <= 12) return 88;
  if (nodeCount <= 24) return 82;
  if (nodeCount <= 40) return 76;
  return 68;
}

function graphToArray(nodeCount: number, map: Map<number, { x: number; y: number }>, zFn?: (id: number) => number) {
  const out = new Float32Array(nodeCount * 3);
  for (let id = 0; id < nodeCount; id += 1) {
    const p = map.get(id) ?? { x: 0, y: 0 };
    out[id * 3] = p.x;
    out[id * 3 + 1] = p.y;
    out[id * 3 + 2] = zFn ? zFn(id) : 0;
  }
  return normalizePositions(out, theaterRadius(nodeCount));
}

function graphFromEdges(nodeCount: number, rawEdges: Array<[number, number]>, labelPrefix = 'v'): GraphSpec {
  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];

  const add = (u: number, v: number) => {
    if (u < 0 || v < 0 || u >= nodeCount || v >= nodeCount || u === v) return;
    const key = edgeKey(u, v);
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push(u < v ? [u, v] : [v, u]);
  };

  for (const [u, v] of rawEdges) add(u, v);
  edges.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  return {
    nodeCount,
    labels: Array.from({ length: nodeCount }, (_, i) => `${labelPrefix}${i}`),
    edges,
  };
}

function graphFromDirectedEdges(nodeCount: number, rawEdges: Array<[number, number]>, labelPrefix = 'v'): GraphSpec {
  const seen = new Set<string>();
  const edges: Array<[number, number]> = [];
  for (const [u, v] of rawEdges) {
    if (u < 0 || v < 0 || u >= nodeCount || v >= nodeCount || u === v) continue;
    const key = `${u}->${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([u, v]);
  }
  edges.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  return {
    nodeCount,
    labels: Array.from({ length: nodeCount }, (_, i) => `${labelPrefix}${i}`),
    edges,
    directed: true,
  };
}

function makeSccGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 0], [1, 0],
    [2, 3], [3, 4], [4, 5], [5, 3], [4, 3],
    [5, 6], [6, 7], [7, 8], [8, 6], [7, 6],
    [8, 9], [9, 10], [10, 11], [11, 9], [10, 9],
    [1, 4], [4, 7], [7, 10], [0, 6], [3, 9],
  ];
  return graphFromDirectedEdges(12, edges, 's');
}

function makeBiconnectedLowLinkGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0], [0, 2],
    [3, 4], [4, 5], [5, 6], [6, 3], [4, 6],
    [6, 7], [7, 8], [8, 9], [9, 7],
    [5, 10], [10, 11], [11, 12], [12, 13], [13, 10], [11, 13],
    [13, 14], [14, 15], [15, 16], [16, 14],
    [9, 17], [17, 18], [18, 19], [19, 17],
  ];
  return graphFromEdges(20, edges, 'c');
}

function makeBCTreeGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3],
    [3, 4], [4, 5], [5, 6], [6, 3], [4, 6],
    [6, 7], [7, 8], [8, 9], [9, 6], [7, 9],
    [8, 10], [10, 11], [11, 12], [12, 8], [10, 12],
    [5, 13], [13, 14], [14, 15], [15, 13],
    [15, 16], [16, 17], [17, 18], [18, 16],
    [12, 19], [19, 20], [20, 21], [21, 19],
  ];
  return graphFromEdges(22, edges, 'k');
}

function makeStOrderGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [0, 2], [1, 3], [2, 4], [3, 5], [4, 0], [5, 1],
    [6, 0], [6, 2], [6, 3], [6, 5],
    [7, 1], [7, 2], [7, 4], [7, 5],
    [6, 7],
  ];
  const graph = graphFromEdges(8, edges, 't');
  graph.meta = { stTerminals: { s: 0, t: 3 } };
  return graph;
}

function makeLayoutShowcaseGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [0, 4], [1, 5], [2, 6], [3, 7],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 8], [8, 12], [9, 13], [10, 14], [11, 15],
    [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 16], [16, 20], [17, 21], [18, 22], [19, 23],
    [2, 8], [3, 9], [6, 12], [7, 13], [10, 16], [11, 17], [14, 20], [15, 21],
    [24, 1], [24, 25], [25, 26], [27, 5], [27, 28], [28, 29], [30, 10], [30, 31],
    [4, 14], [0, 10], [12, 18], [9, 22], [6, 19], [2, 21],
    [32, 16], [32, 33], [33, 34], [34, 35], [35, 23], [36, 18], [36, 37], [37, 38], [38, 39], [39, 20],
    [26, 31], [29, 34], [31, 37], [25, 30],
  ];
  return graphFromEdges(40, edges, 'l');
}

function makeSpqrGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 5],
    [0, 2], [2, 3], [3, 5],
    [0, 4], [4, 5],
    [1, 2], [3, 4],
    [2, 6], [6, 3], [6, 7], [7, 5],
    [4, 8], [8, 0], [8, 9], [9, 5],
    [1, 10], [10, 11], [11, 4], [10, 4],
  ];
  return graphFromEdges(12, edges, 'q');
}

function makePlanarityWitnessGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 3], [0, 4], [0, 5],
    [1, 3], [1, 4], [1, 5],
    [2, 3], [2, 4], [2, 5],
    [6, 0], [6, 3], [7, 1], [7, 4], [8, 2], [8, 5], [9, 6], [9, 7], [9, 8],
    [10, 4], [10, 11], [11, 5],
  ];
  return graphFromEdges(12, edges, 'p');
}

function makeLayoutStraightGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 8],
    [0, 8], [1, 8], [2, 9], [3, 10], [4, 11], [5, 12], [6, 13], [7, 13],
    [9, 14], [14, 15], [15, 16], [16, 10],
    [11, 17], [17, 18], [18, 19], [19, 12],
    [14, 20], [20, 21], [21, 15], [18, 22], [22, 23], [23, 19],
  ];
  return graphFromEdges(24, edges, 'ls');
}

function makeLayoutOrthogonalGraph(): GraphSpec {
  const width = 7;
  const height = 5;
  const edges: Array<[number, number]> = [];
  const id = (x: number, y: number) => y * width + x;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x + 1 < width) edges.push([id(x, y), id(x + 1, y)]);
      if (y + 1 < height) edges.push([id(x, y), id(x, y + 1)]);
    }
  }
  edges.push([id(1, 1), id(3, 3)], [id(3, 1), id(5, 3)], [id(0, 2), id(6, 2)]);
  return graphFromEdges(width * height, edges, 'lo');
}

function makeLayoutPlanarizationGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5],
    [6, 9], [6, 10], [6, 11], [7, 9], [7, 10], [7, 11], [8, 9], [8, 10], [8, 11],
    [3, 6], [4, 7], [5, 8], [0, 9], [1, 10], [2, 11],
    [12, 0], [12, 6], [13, 1], [13, 7], [14, 2], [14, 8], [15, 12], [15, 13], [15, 14],
  ];
  return graphFromEdges(16, edges, 'lp');
}

function makeEmbeddingGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 0],
    [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 12],
    [0, 12], [1, 12], [2, 13], [3, 13], [4, 14], [5, 14], [6, 15], [7, 15], [8, 16], [9, 16], [10, 17], [11, 17],
    [12, 18], [13, 18], [14, 18], [15, 18], [16, 18], [17, 18],
    [3, 19], [19, 20], [20, 21], [21, 5], [20, 14],
  ];
  return graphFromEdges(22, edges, 'e');
}

function makeDualGraph(): GraphSpec {
  const width = 6;
  const height = 5;
  const edges: Array<[number, number]> = [];
  const id = (x: number, y: number) => y * width + x;
  const blocked = new Set<string>([
    edgeKey(id(1, 1), id(2, 1)),
    edgeKey(id(3, 1), id(4, 1)),
    edgeKey(id(2, 2), id(2, 3)),
    edgeKey(id(3, 2), id(4, 2)),
    edgeKey(id(1, 3), id(2, 3)),
  ]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x + 1 < width) {
        const a = id(x, y);
        const b = id(x + 1, y);
        if (!blocked.has(edgeKey(a, b))) edges.push([a, b]);
      }
      if (y + 1 < height) {
        const a = id(x, y);
        const b = id(x, y + 1);
        if (!blocked.has(edgeKey(a, b))) edges.push([a, b]);
      }
    }
  }
  const graph = graphFromEdges(width * height, edges, 'd');
  graph.meta = { dualTerminals: { source: id(0, 0), target: id(5, 4) } };
  return graph;
}

function makeFlowGraph(): GraphSpec {
  const edges: Array<[number, number]> = [
    [0, 2], [0, 3], [1, 2], [1, 4], [2, 4], [2, 5], [3, 4], [3, 6], [4, 5], [4, 6], [2, 7], [7, 6], [3, 8], [8, 5],
  ];
  const graph = graphFromEdges(9, edges, 'f');
  graph.meta = {
    flowModel: {
      nodeCount: 9,
      demands: [8, 6, 0, 0, 0, -8, -5, -1, 0],
      arcs: [
        { from: 0, to: 2, upper: 8, cost: 1 },
        { from: 0, to: 3, upper: 6, cost: 2 },
        { from: 1, to: 2, upper: 5, cost: 2 },
        { from: 1, to: 4, upper: 7, cost: 1 },
        { from: 2, to: 4, upper: 4, cost: 1 },
        { from: 2, to: 5, upper: 6, cost: 2 },
        { from: 3, to: 4, upper: 5, cost: 1 },
        { from: 3, to: 6, upper: 5, cost: 2 },
        { from: 4, to: 5, upper: 6, cost: 1 },
        { from: 4, to: 6, upper: 7, cost: 1 },
        { from: 2, to: 7, upper: 3, cost: 1 },
        { from: 7, to: 6, upper: 3, cost: 1 },
        { from: 3, to: 8, upper: 3, cost: 2 },
        { from: 8, to: 5, upper: 3, cost: 1 },
      ],
      edgeRefs: [
        [0, 2], [0, 3], [1, 2], [1, 4], [2, 4], [2, 5], [3, 4], [3, 6], [4, 5], [4, 6], [2, 7], [7, 6], [3, 8], [8, 5],
      ],
    },
  };
  return graph;
}

const DEFAULT_FLOW_MODEL: FlowModel = {
  nodeCount: 7,
  demands: [9, 4, 0, 0, -6, -7, 0],
  arcs: [
    { from: 0, to: 2, upper: 8, cost: 1 },
    { from: 0, to: 3, upper: 7, cost: 3 },
    { from: 1, to: 2, upper: 6, cost: 2 },
    { from: 1, to: 3, upper: 4, cost: 1 },
    { from: 2, to: 4, upper: 10, cost: 1 },
    { from: 2, to: 5, upper: 5, cost: 2 },
    { from: 3, to: 4, upper: 6, cost: 2 },
    { from: 3, to: 5, upper: 6, cost: 1 },
    { from: 2, to: 6, upper: 4, cost: 2 },
    { from: 6, to: 5, upper: 4, cost: 1 },
  ],
};

function pickGraphForAlgorithm(algorithmId: AlgorithmId): GraphSpec {
  switch (algorithmId) {
    case 'scc':
      return makeSccGraph();
    case 'biconnected':
      return makeBiconnectedLowLinkGraph();
    case 'bctree':
      return makeBCTreeGraph();
    case 'spqr':
      return makeSpqrGraph();
    case 'planarity':
      return makePlanarityWitnessGraph();
    case 'embedding':
      return makeEmbeddingGraph();
    case 'dual':
      return makeDualGraph();
    case 'storder':
      return makeStOrderGraph();
    case 'flow':
      return makeFlowGraph();
    case 'layout-straight':
      return makeLayoutStraightGraph();
    case 'layout-orthogonal':
      return makeLayoutOrthogonalGraph();
    case 'layout-planarization':
      return makeLayoutPlanarizationGraph();
    default:
      return makeLayoutShowcaseGraph();
  }
}

function buildDeterministicGridMap(nodeCount: number, seed: number): Map<number, { x: number; y: number }> {
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, nodeCount) * 1.2)));
  const rows = Math.max(1, Math.ceil(nodeCount / cols));
  const spacingX = 20;
  const spacingY = 16;
  const offsetX = ((cols - 1) * spacingX) / 2;
  const offsetY = ((rows - 1) * spacingY) / 2;
  const out = new Map<number, { x: number; y: number }>();

  for (let id = 0; id < nodeCount; id += 1) {
    const col = id % cols;
    const row = Math.floor(id / cols);
    const jx = (seeded01(seed, `grid-x-${id}`) - 0.5) * 3.2;
    const jy = (seeded01(seed, `grid-y-${id}`) - 0.5) * 3.2;
    out.set(id, {
      x: col * spacingX - offsetX + jx,
      y: row * spacingY - offsetY + jy,
    });
  }

  return out;
}

function buildDeterministicForceMap(graph: GraphSpec, seed: number): Map<number, { x: number; y: number }> {
  const nodeCount = graph.nodeCount;
  const base = buildDeterministicGridMap(nodeCount, seed);
  const points = Array.from({ length: nodeCount }, (_, id) => {
    const p = base.get(id) ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y };
  });
  const adjacency = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const [u, v] of graph.edges) {
    if (u >= 0 && u < nodeCount && v >= 0 && v < nodeCount && u !== v) {
      adjacency[u]?.push(v);
      adjacency[v]?.push(u);
    }
  }
  for (const neighbors of adjacency) neighbors.sort((a, b) => a - b);

  const kRepel = 3400;
  const kSpring = 0.018;
  const rest = 36;
  const centerPull = 0.0045;

  for (let iter = 0; iter < 180; iter += 1) {
    const fx = new Array(nodeCount).fill(0);
    const fy = new Array(nodeCount).fill(0);

    for (let i = 0; i < nodeCount; i += 1) {
      const pi = points[i]!;
      for (let j = i + 1; j < nodeCount; j += 1) {
        const pj = points[j]!;
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const d2 = dx * dx + dy * dy + 1e-3;
        const d = Math.sqrt(d2);
        const f = Math.min(2.8, kRepel / (d2 * Math.max(1, d)));
        const rx = dx * f;
        const ry = dy * f;
        fx[i] -= rx;
        fy[i] -= ry;
        fx[j] += rx;
        fy[j] += ry;
      }
    }

    for (const [u, v] of graph.edges) {
      const a = points[u];
      const b = points[v];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1e-3, Math.hypot(dx, dy));
      const force = (dist - rest) * kSpring;
      const sx = (dx / dist) * force;
      const sy = (dy / dist) * force;
      fx[u] += sx;
      fy[u] += sy;
      fx[v] -= sx;
      fy[v] -= sy;
    }

    const cooling = 0.32 * (1 - iter / 180) + 0.045;
    for (let i = 0; i < nodeCount; i += 1) {
      const p = points[i]!;
      const pullX = -p.x * centerPull;
      const pullY = -p.y * centerPull;
      p.x += (fx[i]! + pullX) * cooling;
      p.y += (fy[i]! + pullY) * cooling;
    }
  }

  const out = new Map<number, { x: number; y: number }>();
  for (let id = 0; id < nodeCount; id += 1) {
    out.set(id, points[id] ?? { x: 0, y: 0 });
  }
  return out;
}

function makeFlowEdgeWeights(graphSpec: GraphSpec, flowModel: FlowModel, flowByArc: number[]): Map<number, number> {
  const map = new Map<number, number>();
  const edgeIndexByKey = new Map<string, number>();
  graphSpec.edges.forEach(([u, v], index) => {
    edgeIndexByKey.set(edgeKey(u, v), index);
  });

  for (let i = 0; i < flowByArc.length; i += 1) {
    const flow = flowByArc[i] ?? 0;
    if (flow <= 0) continue;
    const arc = flowModel.arcs[i];
    const ref = flowModel.edgeRefs?.[i];
    const resolvedPair = ref ?? (arc ? [arc.from, arc.to] as [number, number] : null);
    let edgeIndex = resolvedPair ? edgeIndexByKey.get(edgeKey(resolvedPair[0], resolvedPair[1])) : undefined;
    if (edgeIndex == null && arc) {
      edgeIndex = edgeIndexByKey.get(edgeKey(arc.from, arc.to));
    }
    if (edgeIndex == null) {
      edgeIndex = (i * 17 + 11) % Math.max(1, graphSpec.edges.length);
    }
    const current = map.get(edgeIndex) ?? 0;
    map.set(edgeIndex, Math.max(current, flow));
  }
  return map;
}

function buildSnapshot(seed: number, algorithmId: AlgorithmId): TheaterSnapshot {
  const graphSpec = pickGraphForAlgorithm(algorithmId);
  const builder = new GraphBuilder();
  for (const label of graphSpec.labels) {
    builder.addVertex(label);
  }
  for (const [u, v] of graphSpec.edges) {
    builder.addEdge(u, v, graphSpec.directed ?? false);
  }
  const graph = builder.build();
  const scc = sccTarjan(graph);
  const sccComponentsSorted = [...scc.components].sort((a, b) => b.length - a.length);
  const sccLeaders = sccComponentsSorted.map((component) => component[0]).filter((v): v is number => typeof v === 'number');

  const planarity = testPlanarity(graph, {
    treatDirectedAsUndirected: true,
    allowSelfLoops: 'ignore',
  });

  const bcc = biconnectedComponents(graph, {
    treatDirectedAsUndirected: true,
    allowSelfLoops: 'ignore',
  });
  const bcTree = buildBCTree(graph, bcc);

  const articulationSet = new Set<number>(bcc.articulationPoints);
  const bridgeSet = new Set<number>(bcc.bridges);

  let stOrderVertices = 0;
  let bipolarDirectedEdges = 0;
  let stNumberOf: number[] = Array(graphSpec.nodeCount).fill(0);
  const stTerminals = graphSpec.meta?.stTerminals;
  if (stTerminals && stTerminals.s >= 0 && stTerminals.t >= 0 && stTerminals.s < graphSpec.nodeCount && stTerminals.t < graphSpec.nodeCount && stTerminals.s !== stTerminals.t) {
    try {
      const st = stNumbering(graph, stTerminals.s, stTerminals.t, {
        treatDirectedAsUndirected: true,
        allowSelfLoops: 'ignore',
      });
      stOrderVertices = st.order.length;
      stNumberOf = st.numberOf.slice();
      if (planarity.planar) {
        try {
          const mesh = buildHalfEdgeMesh(graph, planarity.embedding);
          const bipolar = bipolarOrientation(mesh, stTerminals.s, stTerminals.t);
          bipolarDirectedEdges = bipolar.edgeDirections.length;
        } catch {
          bipolarDirectedEdges = 0;
        }
      }
    } catch {
      stOrderVertices = 0;
      bipolarDirectedEdges = 0;
      stNumberOf = Array(graphSpec.nodeCount).fill(0);
    }
  }

  const spqrCounts = { S: 0, P: 0, R: 0, Q: 0 };
  try {
    const spqrSafe = spqrDecomposeSafe(graph, {
      block: 'largest',
      allowSelfLoops: 'ignore',
      treatDirectedAsUndirected: true,
    });
    for (const node of spqrSafe.tree.nodes) {
      if (node.type in spqrCounts) {
        spqrCounts[node.type] += 1;
      }
    }
  } catch {
    // Keep zeroed SPQR counts when decomposition is not applicable.
  }

  const dualSource = graphSpec.meta?.dualTerminals?.source ?? 0;
  const dualTargetVertex = graphSpec.meta?.dualTerminals?.target
    ?? Math.min(graphSpec.nodeCount - 1, Math.max(1, Math.floor(graphSpec.nodeCount * 0.72)));
  let dualRoute: ReturnType<typeof routeEdgeOnGraph> | null = null;
  try {
    dualRoute = routeEdgeOnGraph(graph, dualSource, dualTargetVertex, {
      planarityFallback: true,
      planarityOptions: {
        treatDirectedAsUndirected: true,
        allowSelfLoops: 'ignore',
      },
    });
  } catch {
    dualRoute = null;
  }
  const dualCrossed = new Set<number>(dualRoute?.crossedPrimalEdges ?? []);

  const flowModel = graphSpec.meta?.flowModel ?? DEFAULT_FLOW_MODEL;
  const flowResult = minCostFlow({
    nodeCount: flowModel.nodeCount,
    demands: flowModel.demands,
    arcs: flowModel.arcs,
  });
  const flowEdgeWeight = makeFlowEdgeWeights(graphSpec, flowModel, flowResult.flowByArc);

  let embeddingMap = new Map<number, { x: number; y: number }>();
  let straightMap = new Map<number, { x: number; y: number }>();
  let straightCrossings = 0;
  let straightBends = 0;
  let orthogonalMap = new Map<number, { x: number; y: number }>();
  let orthogonalCrossings = 0;
  let orthogonalBends = 0;
  let planarizedStraightMap = new Map<number, { x: number; y: number }>();
  let planarizedStraightCrossings = 0;
  let planarizedStraightBends = 0;
  let planarizedOrthogonalMap = new Map<number, { x: number; y: number }>();
  let planarizedOrthogonalCrossings = 0;
  let planarizedOrthogonalBends = 0;
  let faceCount = 0;
  let finalLayoutMap = new Map<number, { x: number; y: number }>();
  let finalMode = 'deterministic-straight';
  let finalCrossings = 0;
  let finalBends = 0;

  if (planarity.planar) {
    try {
      const mesh = buildHalfEdgeMesh(graph, planarity.embedding);
      faceCount = mesh.faces.length;
      const embeddingLayout = planarStraightLine(mesh);
      embeddingMap = embeddingLayout.positions;
      straightMap = embeddingLayout.positions;
      straightCrossings = embeddingLayout.stats.crossings;
      straightBends = embeddingLayout.stats.bends;
      try {
        const ortho = orthogonalLayout(mesh);
        orthogonalMap = ortho.positions;
        orthogonalCrossings = ortho.stats.crossings;
        orthogonalBends = ortho.stats.bends;
      } catch {
        orthogonalMap = new Map();
      }
    } catch {
      const fallback = buildDeterministicForceMap(graphSpec, seed);
      embeddingMap = fallback;
      straightMap = fallback;
      straightCrossings = 0;
      straightBends = 0;
    }
  }

  const tryPlanarized = (mode: 'straight' | 'orthogonal') => {
    try {
      const planarized = planarizationLayout(graph, { mode });
      const basePlanarity = testPlanarity(planarized.baseGraph, {
        treatDirectedAsUndirected: true,
        allowSelfLoops: 'ignore',
      });
      if (basePlanarity.planar) {
        const baseMesh = buildHalfEdgeMesh(planarized.baseGraph, basePlanarity.embedding);
        faceCount = Math.max(faceCount, baseMesh.faces.length);
        if (embeddingMap.size === 0) embeddingMap = planarStraightLine(baseMesh).positions;
      }
      if (mode === 'orthogonal') {
        planarizedOrthogonalMap = planarized.layout.positions;
        planarizedOrthogonalCrossings = planarized.layout.stats.crossings;
        planarizedOrthogonalBends = planarized.layout.stats.bends;
      } else {
        planarizedStraightMap = planarized.layout.positions;
        planarizedStraightCrossings = planarized.layout.stats.crossings;
        planarizedStraightBends = planarized.layout.stats.bends;
      }
      return true;
    } catch {
      return false;
    }
  };

  if (!planarity.planar || algorithmId === 'layout-planarization' || algorithmId === 'layout-orthogonal') {
    void tryPlanarized('straight');
    if (algorithmId === 'layout-orthogonal') void tryPlanarized('orthogonal');
  }

  let stOrderMap = new Map<number, { x: number; y: number }>();
  if (embeddingMap.size > 0 && stOrderVertices > 0) {
    const maxNum = Math.max(1, ...stNumberOf);
    stOrderMap = new Map<number, { x: number; y: number }>();
    for (let id = 0; id < graphSpec.nodeCount; id += 1) {
      const p = embeddingMap.get(id) ?? { x: 0, y: 0 };
      const rank = (stNumberOf[id] ?? 0) / maxNum;
      stOrderMap.set(id, { x: p.x + (rank - 0.5) * 28, y: p.y + (0.5 - rank) * 8 });
    }
  }

  if (algorithmId === 'storder') {
    if (stOrderMap.size > 0) {
      finalLayoutMap = stOrderMap;
      finalMode = 'st-bipolar';
      finalCrossings = planarity.planar ? 0 : Math.max(1, planarity.witness.edges.length);
      finalBends = 0;
    }
  } else if (algorithmId === 'layout-straight') {
    if (straightMap.size > 0) {
      finalLayoutMap = straightMap;
      finalMode = 'planar-straight';
      finalCrossings = straightCrossings;
      finalBends = straightBends;
    }
  } else if (algorithmId === 'layout-orthogonal') {
    if (orthogonalMap.size > 0) {
      finalLayoutMap = orthogonalMap;
      finalMode = 'orthogonal';
      finalCrossings = orthogonalCrossings;
      finalBends = orthogonalBends;
    } else if (planarizedOrthogonalMap.size > 0) {
      finalLayoutMap = planarizedOrthogonalMap;
      finalMode = 'planarization-orthogonal';
      finalCrossings = planarizedOrthogonalCrossings;
      finalBends = planarizedOrthogonalBends;
    } else if (planarizedStraightMap.size > 0) {
      finalLayoutMap = planarizedStraightMap;
      finalMode = 'planarization-straight';
      finalCrossings = planarizedStraightCrossings;
      finalBends = planarizedStraightBends;
    }
  } else if (algorithmId === 'layout-planarization') {
    if (planarizedStraightMap.size > 0) {
      finalLayoutMap = planarizedStraightMap;
      finalMode = 'planarization-straight';
      finalCrossings = planarizedStraightCrossings;
      finalBends = planarizedStraightBends;
    }
  } else {
    if (orthogonalMap.size > 0) {
      finalLayoutMap = orthogonalMap;
      finalMode = 'orthogonal';
      finalCrossings = orthogonalCrossings;
      finalBends = orthogonalBends;
    } else if (straightMap.size > 0) {
      finalLayoutMap = straightMap;
      finalMode = 'planar-straight';
      finalCrossings = straightCrossings;
      finalBends = straightBends;
    } else if (planarizedStraightMap.size > 0) {
      finalLayoutMap = planarizedStraightMap;
      finalMode = 'planarization-straight';
      finalCrossings = planarizedStraightCrossings;
      finalBends = planarizedStraightBends;
    }
  }

  if (embeddingMap.size === 0) {
    embeddingMap = buildDeterministicGridMap(graphSpec.nodeCount, seed);
  }
  if (finalLayoutMap.size === 0) {
    const fallback = buildDeterministicForceMap(graphSpec, seed);
    finalLayoutMap = fallback;
    if (embeddingMap.size === 0) embeddingMap = fallback;
    finalMode = 'deterministic-straight';
    finalCrossings = Math.max(finalCrossings, planarity.planar ? 0 : Math.max(1, planarity.witness.edges.length));
    finalBends = 0;
  }

  const blockLift = new Array<number>(graphSpec.nodeCount).fill(0);
  const primaryBlockByVertex = new Array<number>(graphSpec.nodeCount).fill(-1);
  bcc.blocks.forEach((block, blockIdx) => {
    const lift = (blockIdx % 7) * 1.35;
    for (const edgeId of block) {
      const edge = graph.edge(edgeId);
      blockLift[edge.u] = Math.max(blockLift[edge.u] ?? 0, lift);
      blockLift[edge.v] = Math.max(blockLift[edge.v] ?? 0, lift);
      if ((primaryBlockByVertex[edge.u] ?? -1) === -1) primaryBlockByVertex[edge.u] = blockIdx;
      if ((primaryBlockByVertex[edge.v] ?? -1) === -1) primaryBlockByVertex[edge.v] = blockIdx;
    }
  });
  for (const articulation of bcc.articulationPoints) {
    blockLift[articulation] = (blockLift[articulation] ?? 0) + 4.5;
  }

  const planarityTarget = graphToArray(graphSpec.nodeCount, embeddingMap);
  const embeddingTarget = graphToArray(graphSpec.nodeCount, embeddingMap, (id) => (id % 2 === 0 ? 0.6 : -0.6));
  const bcspqrMap = new Map<number, { x: number; y: number }>();
  if (algorithmId === 'scc') {
    const sortedCompIds = sccComponentsSorted
      .map((component) => scc.componentOf[component[0] ?? 0] ?? 0)
      .filter((value, index, arr) => arr.indexOf(value) === index);
    const compRank = new Map<number, number>();
    sortedCompIds.forEach((componentId, idx) => compRank.set(componentId, idx));
    const compCount = Math.max(1, sortedCompIds.length);
    for (let id = 0; id < graphSpec.nodeCount; id += 1) {
      const p = embeddingMap.get(id) ?? { x: 0, y: 0 };
      const componentId = scc.componentOf[id] ?? 0;
      const rank = compRank.get(componentId) ?? 0;
      const xOffset = (rank - (compCount - 1) * 0.5) * 24;
      const yOffset = (rank % 2 === 0 ? -1 : 1) * 6;
      bcspqrMap.set(id, { x: p.x + xOffset, y: p.y + yOffset });
    }
  } else if (algorithmId === 'bctree') {
    const blockCount = Math.max(1, bcc.blocks.length);
    for (let id = 0; id < graphSpec.nodeCount; id += 1) {
      const p = embeddingMap.get(id) ?? { x: 0, y: 0 };
      const block = Math.max(0, primaryBlockByVertex[id] ?? 0);
      const xOffset = (block - (blockCount - 1) * 0.5) * 14;
      const yOffset = articulationSet.has(id) ? 0 : ((block % 2 === 0 ? -1 : 1) * 5);
      bcspqrMap.set(id, { x: p.x + xOffset, y: p.y + yOffset });
    }
  } else if (algorithmId === 'spqr') {
    const blockCount = Math.max(1, bcc.blocks.length);
    for (let id = 0; id < graphSpec.nodeCount; id += 1) {
      const p = embeddingMap.get(id) ?? { x: 0, y: 0 };
      const block = Math.max(0, primaryBlockByVertex[id] ?? 0);
      const xOffset = (block - (blockCount - 1) * 0.5) * 9;
      const yOffset = ((id % 3) - 1) * 3;
      bcspqrMap.set(id, { x: p.x + xOffset, y: p.y + yOffset });
    }
  } else if (algorithmId === 'biconnected') {
    for (let id = 0; id < graphSpec.nodeCount; id += 1) {
      const p = embeddingMap.get(id) ?? { x: 0, y: 0 };
      const yOffset = articulationSet.has(id) ? 10 : 0;
      bcspqrMap.set(id, { x: p.x, y: p.y + yOffset });
    }
  } else {
    for (let id = 0; id < graphSpec.nodeCount; id += 1) {
      bcspqrMap.set(id, embeddingMap.get(id) ?? { x: 0, y: 0 });
    }
  }
  const bcspqrTarget = graphToArray(
    graphSpec.nodeCount,
    bcspqrMap,
    (id) => (algorithmId === 'scc' ? ((scc.componentOf[id] ?? 0) % 8) * 1.25 : (blockLift[id] ?? 0)),
  );

  const dualTarget = bcspqrTarget.slice();
  for (const edgeId of dualCrossed) {
    const edge = graph.edge(edgeId);
    dualTarget[edge.u * 3 + 2] += 2.2;
    dualTarget[edge.v * 3 + 2] += 2.2;
  }

  const flowTarget = dualTarget.slice();
  for (const [edgeId, weight] of flowEdgeWeight.entries()) {
    const edge = graph.edge(edgeId);
    const delta = Math.min(4.5, 1.0 + weight * 0.8);
    flowTarget[edge.u * 3 + 1] += delta;
    flowTarget[edge.v * 3 + 1] += delta;
  }

  const finalTarget = graphToArray(graphSpec.nodeCount, finalLayoutMap, (id) => {
    const t = seeded01(seed, `final-z-${id}`);
    return (t - 0.5) * 2.0;
  });

  const witnessEdges = !planarity.planar ? planarity.witness.edges : [];

  const highlights: Record<StageId, StageHighlight> = {
    hairball: {
      nodeIndices: [],
      edgeIndices: [],
      nodeColor: 0xaee3ff,
      edgeColor: 0xb8d7ff,
    },
    planarity: {
      nodeIndices: [],
      edgeIndices: witnessEdges,
      nodeColor: 0xffb3b3,
      edgeColor: 0xff5d5d,
    },
    embedding: {
      nodeIndices: [],
      edgeIndices: [],
      nodeColor: 0x9cf7de,
      edgeColor: 0x3be2cf,
    },
    bcspqr: {
      nodeIndices: [...new Set<number>([...articulationSet, ...sccLeaders.slice(0, 8)])],
      edgeIndices: [...bridgeSet],
      nodeColor: 0xffd27d,
      edgeColor: 0xffb347,
    },
    dual: {
      nodeIndices: [],
      edgeIndices: [...dualCrossed],
      nodeColor: 0xa7f2ff,
      edgeColor: 0x2acdf3,
    },
    flow: {
      nodeIndices: [],
      edgeIndices: [...flowEdgeWeight.keys()],
      nodeColor: 0xffb9e8,
      edgeColor: 0xff72ca,
    },
    layout: {
      nodeIndices: [],
      edgeIndices: [],
      nodeColor: 0x89ffc9,
      edgeColor: 0x67f2b7,
    },
  };

  return {
    graph: graphSpec,
    stageTargets: {
      planarity: planarityTarget,
      embedding: embeddingTarget,
      bcspqr: bcspqrTarget,
      dual: normalizePositions(dualTarget, theaterRadius(graphSpec.nodeCount)),
      flow: normalizePositions(flowTarget, theaterRadius(graphSpec.nodeCount)),
      layout: finalTarget,
    },
    motion: {
      componentOf: Array.from({ length: graphSpec.nodeCount }, (_, id) => scc.componentOf[id] ?? 0),
      blockOf: primaryBlockByVertex.map((value) => Math.max(0, value)),
      stOrderNorm: (() => {
        const maxNum = Math.max(1, ...stNumberOf);
        return Array.from({ length: graphSpec.nodeCount }, (_, id) => (stNumberOf[id] ?? 0) / maxNum);
      })(),
      flowLoad: (() => {
        const byNode = new Array<number>(graphSpec.nodeCount).fill(0);
        for (const [edgeId, weight] of flowEdgeWeight.entries()) {
          const edge = graph.edge(edgeId);
          byNode[edge.u] += weight;
          byNode[edge.v] += weight;
        }
        const maxLoad = Math.max(1, ...byNode);
        return byNode.map((value) => value / maxLoad);
      })(),
      witnessMask: (() => {
        const mask = new Array<number>(graphSpec.nodeCount).fill(0);
        for (const edgeId of witnessEdges) {
          const edge = graph.edge(edgeId);
          mask[edge.u] = 1;
          mask[edge.v] = 1;
        }
        return mask;
      })(),
    },
    highlights,
    summary: {
      planar: planarity.planar,
      witnessEdges: witnessEdges.length,
      faces: faceCount,
      blocks: bcc.blocks.length,
      bcTreeNodes: bcTree.nodes.length,
      bcTreeEdges: Math.floor(bcTree.adj.reduce((sum, row) => sum + row.length, 0) / 2),
      articulations: bcc.articulationPoints.length,
      bridges: bcc.bridges.length,
      sccCount: scc.components.length,
      largestScc: sccComponentsSorted[0]?.length ?? 0,
      stOrderVertices,
      bipolarDirectedEdges,
      spqr: spqrCounts,
      dualCrossed: dualCrossed.size,
      flowCost: Number.isFinite(flowResult.totalCost) ? flowResult.totalCost : 0,
      flowFeasible: flowResult.feasible,
      layoutMode: finalMode,
      crossings: finalCrossings,
      bends: finalBends,
    },
  };
}

function buildEmergencySnapshot(seed: number, algorithmId: AlgorithmId, reason: unknown): TheaterSnapshot {
  const graph = pickGraphForAlgorithm(algorithmId);
  const fallback = buildDeterministicGridMap(graph.nodeCount, seed);
  const planarity = graphToArray(graph.nodeCount, fallback);
  const embedding = planarity.slice();
  const bcspqr = planarity.slice();
  const dual = planarity.slice();
  const flow = planarity.slice();
  const layout = planarity.slice();
  for (let i = 0; i < embedding.length; i += 3) {
    embedding[i + 2] = i % 2 === 0 ? 0.6 : -0.6;
    bcspqr[i + 2] = (i % 7) * 0.2;
    dual[i + 2] = (i % 11) * 0.15;
    flow[i + 2] = (i % 13) * 0.1;
    layout[i + 2] = 0;
  }

  const note = reason instanceof Error
    ? reason.message
    : 'Unknown failure while building theater snapshot.';

  return {
    graph,
    stageTargets: {
      planarity,
      embedding,
      bcspqr,
      dual,
      flow,
      layout,
    },
    motion: {
      componentOf: Array.from({ length: graph.nodeCount }, () => 0),
      blockOf: Array.from({ length: graph.nodeCount }, () => 0),
      stOrderNorm: Array.from({ length: graph.nodeCount }, () => 0),
      flowLoad: Array.from({ length: graph.nodeCount }, () => 0),
      witnessMask: Array.from({ length: graph.nodeCount }, () => 0),
    },
    highlights: {
      hairball: { nodeIndices: [], edgeIndices: [], nodeColor: 0xaee3ff, edgeColor: 0xb8d7ff },
      planarity: { nodeIndices: [], edgeIndices: [], nodeColor: 0xffb3b3, edgeColor: 0xff5d5d },
      embedding: { nodeIndices: [], edgeIndices: [], nodeColor: 0x9cf7de, edgeColor: 0x3be2cf },
      bcspqr: { nodeIndices: [], edgeIndices: [], nodeColor: 0xffd27d, edgeColor: 0xffb347 },
      dual: { nodeIndices: [], edgeIndices: [], nodeColor: 0xa7f2ff, edgeColor: 0x2acdf3 },
      flow: { nodeIndices: [], edgeIndices: [], nodeColor: 0xffb9e8, edgeColor: 0xff72ca },
      layout: { nodeIndices: [], edgeIndices: [], nodeColor: 0x89ffc9, edgeColor: 0x67f2b7 },
    },
    summary: {
      planar: false,
      witnessEdges: 0,
      faces: 0,
      blocks: 0,
      bcTreeNodes: 0,
      bcTreeEdges: 0,
      articulations: 0,
      bridges: 0,
      sccCount: 0,
      largestScc: 0,
      stOrderVertices: 0,
      bipolarDirectedEdges: 0,
      spqr: { S: 0, P: 0, R: 0, Q: 0 },
      dualCrossed: 0,
      flowCost: 0,
      flowFeasible: false,
      layoutMode: 'emergency-fallback-grid',
      crossings: 0,
      bends: 0,
      layoutNote: `Emergency fallback active: ${note}`,
    },
  };
}

async function simulateHairballFrames(seed: number, graph: GraphSpec): Promise<Float32Array[]> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const bodies: RAPIER.RigidBody[] = [];

  for (let i = 0; i < graph.nodeCount; i += 1) {
    const h1 = seeded01(seed, `hx-${i}`);
    const h2 = seeded01(seed, `hy-${i}`);
    const h3 = seeded01(seed, `hz-${i}`);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation((h1 - 0.5) * 80, (h2 - 0.5) * 60, (h3 - 0.5) * 28)
      .setLinearDamping(2.1)
      .setAngularDamping(3.8);
    const rb = world.createRigidBody(desc);
    world.createCollider(RAPIER.ColliderDesc.ball(0.8), rb);
    bodies.push(rb);
  }

  const frames: Float32Array[] = [];
  const dt = 1 / 60;

  for (let step = 0; step < 280; step += 1) {
    for (let i = 0; i < graph.nodeCount; i += 1) {
      const body = bodies[i];
      if (!body) continue;
      const p = body.translation();
      body.applyImpulse({ x: -p.x * 0.03, y: -p.y * 0.03, z: -p.z * 0.045 }, true);
    }

    for (const [u, v] of graph.edges) {
      const a = bodies[u];
      const b = bodies[v];
      if (!a || !b) continue;
      const pa = a.translation();
      const pb = b.translation();
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dz = pb.z - pa.z;
      const len = Math.max(0.001, Math.hypot(dx, dy, dz));
      const rest = 7.5;
      const k = 0.035;
      const force = (len - rest) * k;
      const fx = (dx / len) * force;
      const fy = (dy / len) * force;
      const fz = (dz / len) * force;
      a.applyImpulse({ x: fx, y: fy, z: fz }, true);
      b.applyImpulse({ x: -fx, y: -fy, z: -fz }, true);
    }

    for (let i = 0; i < graph.nodeCount; i += 1) {
      const a = bodies[i];
      if (!a) continue;
      const pa = a.translation();
      for (let j = i + 1; j < graph.nodeCount; j += 1) {
        const b = bodies[j];
        if (!b) continue;
        const pb = b.translation();
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dz = pb.z - pa.z;
        const distSq = dx * dx + dy * dy + dz * dz + 0.0001;
        const repel = Math.min(0.08, 10 / distSq) * 0.014;
        const inv = 1 / Math.sqrt(distSq);
        const fx = dx * inv * repel;
        const fy = dy * inv * repel;
        const fz = dz * inv * repel;
        a.applyImpulse({ x: -fx, y: -fy, z: -fz }, true);
        b.applyImpulse({ x: fx, y: fy, z: fz }, true);
      }
    }

    world.step();

    if (step % 2 === 0) {
      const frame = new Float32Array(graph.nodeCount * 3);
      for (let i = 0; i < graph.nodeCount; i += 1) {
        const p = bodies[i]?.translation();
        frame[i * 3] = p?.x ?? 0;
        frame[i * 3 + 1] = p?.y ?? 0;
        frame[i * 3 + 2] = p?.z ?? 0;
      }
      frames.push(normalizePositions(frame, theaterRadius(graph.nodeCount)));
    }

    world.timestep = dt;
  }

  return frames;
}

function createEngine(
  container: HTMLDivElement,
  snapshot: TheaterSnapshot,
  seed: number,
  algorithmId: AlgorithmId,
): TheaterEngine {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x020816, 32, 190);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  camera.position.set(0, 0, 96);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x01050f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const controls = new CameraControls(camera, renderer.domElement);
  controls.infinityDolly = true;
  controls.smoothTime = 0.25;
  controls.draggingSmoothTime = 0.13;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.95,
    0.72,
    0.18,
  );
  composer.addPass(bloom);

  const graphGroup = new THREE.Group();
  scene.add(graphGroup);

  const nodePositions = snapshot.stageTargets.planarity.slice();
  const renderPositions = nodePositions.slice();
  const nodeColors = new Float32Array(snapshot.graph.nodeCount * 3);
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(renderPositions, 3));
  nodeGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));

  const nodeMaterial = new THREE.PointsMaterial({
    size: 2.4,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
  graphGroup.add(nodes);

  const edgePositions = new Float32Array(snapshot.graph.edges.length * 6);
  const edgeColors = new Float32Array(snapshot.graph.edges.length * 6);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));

  const edgeMaterial = new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  graphGroup.add(edgeLines);

  const accentGeometry = new THREE.BufferGeometry();
  const accentMaterial = new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    color: 0xff5d5d,
    depthWrite: false,
  });
  const accentLines = new THREE.LineSegments(accentGeometry, accentMaterial);
  graphGroup.add(accentLines);

  const stars = new THREE.Points(
    (() => {
      const geometry = new THREE.BufferGeometry();
      const count = 900;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const r = 120 + seeded01(seed, `star-r-${i}`) * 110;
        const a = seeded01(seed, `star-a-${i}`) * Math.PI * 2;
        const e = (seeded01(seed, `star-e-${i}`) - 0.5) * Math.PI;
        positions[i * 3] = Math.cos(a) * Math.cos(e) * r;
        positions[i * 3 + 1] = Math.sin(e) * r * 0.6;
        positions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
        const c = 0.35 + seeded01(seed, `star-c-${i}`) * 0.65;
        colors[i * 3] = c * 0.45;
        colors[i * 3 + 1] = c * 0.7;
        colors[i * 3 + 2] = c;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    })(),
    new THREE.PointsMaterial({
      size: 0.55,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const tweenGroup = new Group();
  let activeStage: StageId = 'hairball';
  let source = nodePositions.slice();
  let target = nodePositions.slice();
  let activeTween: Tween<{ t: number }> | null = null;
  let stageStartedAt = performance.now();
  let stageDurationMs = STAGE_DURATION_MS.hairball;

  let hairballFrames: Float32Array[] = [];
  let hairballFrame = 0;
  let disposed = false;
  const dualNodeSet = new Set<number>();
  for (const edgeId of snapshot.highlights.dual.edgeIndices) {
    const edge = snapshot.graph.edges[edgeId];
    if (!edge) continue;
    dualNodeSet.add(edge[0]);
    dualNodeSet.add(edge[1]);
  }
  const PI2 = Math.PI * 2;

  const updateEdgesFromNodes = (positions: Float32Array, accentEdgeIndices: number[]) => {
    for (let edgeId = 0; edgeId < snapshot.graph.edges.length; edgeId += 1) {
      const edge = snapshot.graph.edges[edgeId];
      if (!edge) continue;
      const [u, v] = edge;
      const baseIndex = edgeId * 6;
      edgePositions[baseIndex] = positions[u * 3] ?? 0;
      edgePositions[baseIndex + 1] = positions[u * 3 + 1] ?? 0;
      edgePositions[baseIndex + 2] = positions[u * 3 + 2] ?? 0;
      edgePositions[baseIndex + 3] = positions[v * 3] ?? 0;
      edgePositions[baseIndex + 4] = positions[v * 3 + 1] ?? 0;
      edgePositions[baseIndex + 5] = positions[v * 3 + 2] ?? 0;
    }

    if (accentEdgeIndices.length === 0) {
      accentGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      return;
    }

    const accentPositions = new Float32Array(accentEdgeIndices.length * 6);
    accentEdgeIndices.forEach((edgeId, idx) => {
      const edge = snapshot.graph.edges[edgeId];
      if (!edge) return;
      const [u, v] = edge;
      const offset = idx * 6;
      accentPositions[offset] = positions[u * 3] ?? 0;
      accentPositions[offset + 1] = positions[u * 3 + 1] ?? 0;
      accentPositions[offset + 2] = positions[u * 3 + 2] ?? 0;
      accentPositions[offset + 3] = positions[v * 3] ?? 0;
      accentPositions[offset + 4] = positions[v * 3 + 1] ?? 0;
      accentPositions[offset + 5] = positions[v * 3 + 2] ?? 0;
    });

    accentGeometry.setAttribute('position', new THREE.BufferAttribute(accentPositions, 3));
    accentGeometry.computeBoundingSphere();
  };

  const setStageColors = (stageId: StageId) => {
    const highlight = snapshot.highlights[stageId];
    const nodeSet = new Set(highlight.nodeIndices);
    const edgeSet = new Set(highlight.edgeIndices);

    const baseNode = new THREE.Color(NODE_BASE);
    const accentNode = new THREE.Color(highlight.nodeColor);
    for (let i = 0; i < snapshot.graph.nodeCount; i += 1) {
      const color = nodeSet.has(i) ? accentNode : baseNode;
      nodeColors[i * 3] = color.r;
      nodeColors[i * 3 + 1] = color.g;
      nodeColors[i * 3 + 2] = color.b;
    }

    const baseEdge = new THREE.Color(EDGE_BASE);
    const accentEdge = new THREE.Color(highlight.edgeColor);
    for (let i = 0; i < snapshot.graph.edges.length; i += 1) {
      const color = edgeSet.has(i) ? accentEdge : baseEdge;
      edgeColors[i * 6] = color.r;
      edgeColors[i * 6 + 1] = color.g;
      edgeColors[i * 6 + 2] = color.b;
      edgeColors[i * 6 + 3] = color.r;
      edgeColors[i * 6 + 4] = color.g;
      edgeColors[i * 6 + 5] = color.b;
    }

    accentMaterial.color = accentEdge;
    (nodeGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (edgeGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    updateEdgesFromNodes(renderPositions, highlight.edgeIndices);
  };

  const stageProgressAt = (now: number) => {
    if (stageDurationMs <= 0) return 1;
    return Math.max(0, Math.min(1, (now - stageStartedAt) / stageDurationMs));
  };

  const applyStageDynamics = (now: number, progress: number) => {
    const stageBoost = Math.max(0, 1 - progress);
    const t = now * 0.001;
    for (let id = 0; id < snapshot.graph.nodeCount; id += 1) {
      const baseX = nodePositions[id * 3] ?? 0;
      const baseY = nodePositions[id * 3 + 1] ?? 0;
      const baseZ = nodePositions[id * 3 + 2] ?? 0;
      const seedA = seeded01(seed, `dyn-a-${id}`) * PI2;
      const seedB = seeded01(seed, `dyn-b-${id}`) * PI2;
      const comp = snapshot.motion.componentOf[id] ?? 0;
      const block = snapshot.motion.blockOf[id] ?? 0;
      const rank = snapshot.motion.stOrderNorm[id] ?? 0;
      const flowLoad = snapshot.motion.flowLoad[id] ?? 0;
      const witness = snapshot.motion.witnessMask[id] ?? 0;
      let dx = 0;
      let dy = 0;
      let dz = 0;

      switch (activeStage) {
        case 'planarity': {
          const wobble = (witness ? 2.1 : 0.55) * (0.4 + stageBoost * 0.6);
          dx += Math.sin(t * 5.4 + seedA) * wobble;
          dy += Math.cos(t * 4.8 + seedB) * wobble;
          dz += witness ? (Math.sin(t * 8 + seedA) * 1.4 + 1.1) : 0;
          break;
        }
        case 'embedding': {
          const swirl = 0.03 * stageBoost * (algorithmId === 'embedding' ? 1.7 : 1.0);
          dx += (-baseY * swirl) + Math.sin(t * 3 + seedA) * 0.45 * stageBoost;
          dy += (baseX * swirl) + Math.cos(t * 2.6 + seedB) * 0.45 * stageBoost;
          dz += Math.sin(t * 3.4 + seedB) * 0.95 * stageBoost;
          break;
        }
        case 'bcspqr': {
          dx += ((comp % 6) - 2.5) * 0.65 * stageBoost;
          dy += ((block % 7) - 3) * 0.52 * stageBoost;
          dz += ((comp % 2 === 0 ? 1 : -1) * 0.9 + Math.sin(t * 2.8 + seedA) * 0.45) * stageBoost;
          break;
        }
        case 'dual': {
          if (dualNodeSet.has(id)) {
            const pulse = 1.1 + Math.sin(t * 9 + seedA) * 0.8;
            dx += Math.sin(t * 4.2 + seedB) * 0.95 * stageBoost;
            dy += Math.cos(t * 3.9 + seedA) * 0.95 * stageBoost;
            dz += pulse * stageBoost * 1.6;
          }
          break;
        }
        case 'flow': {
          const pulse = 0.6 + 0.4 * Math.sin(t * 6.2 + seedA);
          const lift = (0.6 + pulse) * flowLoad * 2.6;
          dx += Math.sin(t * 2.7 + seedA) * flowLoad * 0.95 * stageBoost;
          dy += Math.cos(t * 2.9 + seedB) * flowLoad * 0.95 * stageBoost;
          dz += lift * (0.45 + stageBoost * 0.55);
          break;
        }
        case 'layout': {
          const settle = stageBoost * (algorithmId.startsWith('layout') ? 1.35 : 1.0);
          dx += Math.sin(t * 3.1 + seedA) * settle * (1.7 + rank * 1.1);
          dy += Math.cos(t * 3.3 + seedB) * settle * (1.3 + (1 - rank) * 0.9);
          dz += Math.sin(t * 4 + seedA) * settle * 0.8;
          break;
        }
        default:
          break;
      }

      renderPositions[id * 3] = baseX + dx;
      renderPositions[id * 3 + 1] = baseY + dy;
      renderPositions[id * 3 + 2] = baseZ + dz;
    }
  };

  const setStage = (stageId: StageId) => {
    activeStage = stageId;
    setStageColors(stageId);
    stageStartedAt = performance.now();
    stageDurationMs = STAGE_DURATION_MS[stageId] ?? 1600;

    if (activeTween) {
      activeTween.stop();
      activeTween = null;
    }

    if (stageId === 'hairball') {
      return;
    }

    source = nodePositions.slice();
    target = snapshot.stageTargets[stageId].slice();

    const tweenState = { t: 0 };
    activeTween = new Tween(tweenState, tweenGroup)
      .to({ t: 1 }, stageDurationMs)
      .easing(Easing.Cubic.InOut)
      .onUpdate(() => {
        const t = tweenState.t;
        const inv = 1 - t;
        for (let i = 0; i < nodePositions.length; i += 1) {
          nodePositions[i] = (source[i] ?? 0) * inv + (target[i] ?? 0) * t;
        }
      })
      .onComplete(() => {
        activeTween = null;
      })
      .start();
  };

  setStage('hairball');

  void simulateHairballFrames(seed, snapshot.graph).then((frames) => {
    if (disposed) return;
    if (frames.length === 0) return;
    hairballFrames = frames;
    if (activeStage === 'hairball') {
      nodePositions.set(frames[0]);
      renderPositions.set(frames[0]);
      updateEdgesFromNodes(renderPositions, snapshot.highlights.hairball.edgeIndices);
    }
  });

  let lastTs = performance.now();
  let rafId = 0;

  const animate = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.033, (now - lastTs) / 1000);
    lastTs = now;

    if (activeStage === 'hairball' && hairballFrames.length > 0) {
      hairballFrame = (hairballFrame + 1) % hairballFrames.length;
      nodePositions.set(hairballFrames[hairballFrame] ?? hairballFrames[0]!);
    }

    tweenGroup.update(now);

    const progress = stageProgressAt(now);
    applyStageDynamics(now, progress);

    if (activeStage === 'hairball') {
      graphGroup.rotation.y += dt * 0.22;
      graphGroup.rotation.x = Math.sin(now * 0.0009) * 0.14;
    } else {
      graphGroup.rotation.y *= 0.92;
      graphGroup.rotation.x *= 0.9;
    }

    updateEdgesFromNodes(renderPositions, snapshot.highlights[activeStage].edgeIndices);

    (nodeGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (edgeGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    const accentPos = accentGeometry.getAttribute('position');
    if (accentPos) {
      (accentPos as THREE.BufferAttribute).needsUpdate = true;
    }

    controls.update(dt);
    composer.render();
    rafId = window.requestAnimationFrame(animate);
  };

  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloom.setSize(width, height);
  });
  resizeObserver.observe(container);

  rafId = window.requestAnimationFrame(animate);

  return {
    setStage,
    dispose: () => {
      disposed = true;
      resizeObserver.disconnect();
      window.cancelAnimationFrame(rafId);
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      accentGeometry.dispose();
      accentMaterial.dispose();
      (stars.geometry as THREE.BufferGeometry).dispose();
      (stars.material as THREE.PointsMaterial).dispose();
      container.innerHTML = '';
    },
  };
}

export function AlgorithmTheater() {
  const [seed, setSeed] = useState(11);
  const [selectedAlgorithmId, setSelectedAlgorithmId] = useState<AlgorithmId>('planarity');
  const [activeStage, setActiveStage] = useState<StageId>('hairball');
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runStepLabel, setRunStepLabel] = useState('Idle');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(330);

  const algorithm = useMemo(
    () => ALGORITHMS.find((item) => item.id === selectedAlgorithmId) ?? ALGORITHMS[0]!,
    [selectedAlgorithmId],
  );
  const stageSequence = useMemo(
    () => (['hairball', ...algorithm.stages] as StageId[]),
    [algorithm.stages],
  );
  const stage = STAGE_BY_ID.get(activeStage) ?? STAGES[0]!;
  const stageNote = algorithm.stageNotes[activeStage] ?? stage.subtitle;

  const snapshot = useMemo(() => {
    try {
      return buildSnapshot(seed, selectedAlgorithmId);
    } catch (error) {
      console.error('Algorithm theater snapshot failed', error);
      return buildEmergencySnapshot(seed, selectedAlgorithmId, error);
    }
  }, [seed, selectedAlgorithmId]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TheaterEngine | null>(null);
  const runTokenRef = useRef(0);
  const leftResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const startLeftResize = useCallback((event: { clientX: number; preventDefault?: () => void }) => {
    if (leftPanelCollapsed) return;
    event.preventDefault?.();
    leftResizeRef.current = { startX: event.clientX, startWidth: leftPanelWidth };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent: PointerEvent) => {
      const current = leftResizeRef.current;
      if (!current) return;
      const next = Math.max(300, Math.min(620, current.startWidth + (moveEvent.clientX - current.startX)));
      setLeftPanelWidth(next);
    };
    const onUp = () => {
      leftResizeRef.current = null;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [leftPanelCollapsed, leftPanelWidth]);

  const artifactLines = useMemo(() => {
    switch (selectedAlgorithmId) {
      case 'scc':
        return [
          `SCC components: ${snapshot.summary.sccCount} (largest ${snapshot.summary.largestScc} vertices)`,
          `Directed graph: ${snapshot.graph.directed ? 'yes' : 'no'}`,
          `Current stage: ${stage.title}`,
        ];
      case 'biconnected':
        return [
          `Biconnected blocks: ${snapshot.summary.blocks}`,
          `Articulations: ${snapshot.summary.articulations}, bridges: ${snapshot.summary.bridges}`,
          `Current stage: ${stage.title}`,
        ];
      case 'bctree':
        return [
          `BC-tree nodes/edges: ${snapshot.summary.bcTreeNodes}/${snapshot.summary.bcTreeEdges}`,
          `Cut vertices: ${snapshot.summary.articulations}`,
          `Current stage: ${stage.title}`,
        ];
      case 'planarity':
        return [
          `Witness edges highlighted: ${snapshot.summary.witnessEdges}`,
          `Planarity verdict: ${snapshot.summary.planar ? 'planar' : 'nonplanar'}`,
          `Current stage: ${stage.title}`,
        ];
      case 'embedding':
        return [
          `Face count: ${snapshot.summary.faces}`,
          `Embedding-ready planar graph: ${snapshot.summary.planar ? 'yes' : 'no'}`,
          `Current stage: ${stage.title}`,
        ];
      case 'spqr':
        return [
          `SPQR mix: S${snapshot.summary.spqr.S} P${snapshot.summary.spqr.P} R${snapshot.summary.spqr.R} Q${snapshot.summary.spqr.Q}`,
          `BC blocks: ${snapshot.summary.blocks}, articulations: ${snapshot.summary.articulations}`,
          `Current stage: ${stage.title}`,
        ];
      case 'storder':
        return [
          `st-numbered vertices: ${snapshot.summary.stOrderVertices}`,
          `Bipolar directed edges: ${snapshot.summary.bipolarDirectedEdges}`,
          `Current stage: ${stage.title}`,
        ];
      case 'dual':
        return [
          `Dual-crossed primal edges: ${snapshot.summary.dualCrossed}`,
          `Stage route highlight: ${stage.id === 'dual' ? 'active' : 'queued/completed'}`,
          `Current stage: ${stage.title}`,
        ];
      case 'flow':
        return [
          `Flow feasibility: ${snapshot.summary.flowFeasible ? 'feasible' : 'infeasible'}`,
          `Optimized flow cost: ${snapshot.summary.flowCost}`,
          `Current stage: ${stage.title}`,
        ];
      case 'layout-straight':
      case 'layout-orthogonal':
      case 'layout-planarization':
      default:
        return [
          `Final mode: ${snapshot.summary.layoutMode}`,
          `Crossings: ${snapshot.summary.crossings}, bends: ${snapshot.summary.bends}`,
          `Current stage: ${stage.title}`,
        ];
    }
  }, [selectedAlgorithmId, snapshot, stage.id, stage.title]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const engine = createEngine(container, snapshot, seed, selectedAlgorithmId);
    engineRef.current = engine;
    return () => {
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      engine.dispose();
    };
  }, [seed, selectedAlgorithmId, snapshot]);

  useEffect(() => {
    engineRef.current?.setStage(activeStage);
  }, [activeStage]);

  const runAlgorithm = useCallback(async () => {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    setRunning(true);
    setRunProgress(0);
    setRunStepLabel('Preparing...');

    for (let tries = 0; tries < 40 && !engineRef.current; tries += 1) {
      await sleep(25);
      if (runTokenRef.current !== token) return;
    }
    if (!engineRef.current) {
      setRunning(false);
      setRunStepLabel('Renderer unavailable');
      return;
    }

    const steps = stageSequence;
    for (let i = 0; i < steps.length; i += 1) {
      if (runTokenRef.current !== token) return;
      const stepId = steps[i]!;
      const stepDef = STAGE_BY_ID.get(stepId);
      setActiveStage(stepId);
      setRunStepLabel(stepDef?.title ?? stepId);
      setRunProgress(steps.length <= 1 ? 1 : i / (steps.length - 1));
      await sleep(STAGE_DURATION_MS[stepId] ?? 1600);
    }

    if (runTokenRef.current !== token) return;
    setRunProgress(1);
    setRunning(false);
    setRunStepLabel('Finished');
  }, [stageSequence]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runAlgorithm();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      runTokenRef.current += 1;
    };
  }, [runAlgorithm, snapshot]);

  return (
    <div className="theme-cinema relative h-full w-full overflow-hidden">
      <div className="fixed inset-0 z-0" ref={containerRef} />

      <div className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(circle_at_18%_15%,rgba(20,245,186,0.10),transparent_32%),radial-gradient(circle_at_86%_10%,rgba(52,146,255,0.16),transparent_36%),radial-gradient(circle_at_50%_95%,rgba(255,103,180,0.09),transparent_40%)]" />

      <div className="pointer-events-none fixed left-4 top-4 z-20">
        {leftPanelCollapsed ? (
          <div className="pointer-events-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLeftPanelCollapsed(false)}
            >
              Show Info
            </Button>
          </div>
        ) : (
          <div className="pointer-events-auto relative" style={{ width: leftPanelWidth }}>
            <Card className="w-full max-h-[calc(100vh-180px)] overflow-auto pr-1 select-none">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="accent">Algorithm Theater</Badge>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">seed {seed}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLeftPanelCollapsed(true)}
                    aria-label="Collapse info panel"
                  >
                    Hide
                  </Button>
                </div>
              </div>
              <CardTitle className="mt-2 text-base">{algorithm.title}</CardTitle>
              <CardDescription className="mt-1">{algorithm.subtitle}</CardDescription>
              <div className="mt-2 text-xs text-slate-200">{algorithm.explanation}</div>
              <div className="mt-1 text-xs text-emerald-100">Curated graph: {algorithm.curatedGraph}</div>
              <div className="mt-2 rounded-md border border-slate-500/35 bg-slate-900/40 px-2 py-1 text-xs text-slate-100">
                {running ? `Running: ${runStepLabel}` : `Complete: ${STAGE_BY_ID.get(stageSequence.at(-1) ?? 'layout')?.title ?? 'Done'}`}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-300"
                  style={{ width: `${Math.round(runProgress * 100)}%` }}
                />
              </div>
              <div className="mt-3 rounded-md border border-cyan-300/30 bg-cyan-400/10 p-2 text-xs text-cyan-100">
                <div className="font-semibold">Live Artifact</div>
                <div className="mt-1 text-cyan-50">{stage.title}</div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-cyan-100">
                  {artifactLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-200">
                <div>Nodes: <span className="text-slate-50">{snapshot.graph.nodeCount}</span></div>
                <div>Edges: <span className="text-slate-50">{snapshot.graph.edges.length}</span></div>
                <div>Planar: <span className="text-slate-50">{snapshot.summary.planar ? 'yes' : 'no'}</span></div>
                <div>Witness edges: <span className="text-slate-50">{snapshot.summary.witnessEdges}</span></div>
                <div>Faces: <span className="text-slate-50">{snapshot.summary.faces}</span></div>
                <div>BC blocks: <span className="text-slate-50">{snapshot.summary.blocks}</span></div>
                <div>BC-tree: <span className="text-slate-50">{snapshot.summary.bcTreeNodes} nodes / {snapshot.summary.bcTreeEdges} edges</span></div>
                <div>Articulations: <span className="text-slate-50">{snapshot.summary.articulations}</span></div>
                <div>Bridges: <span className="text-slate-50">{snapshot.summary.bridges}</span></div>
                <div>SCC: <span className="text-slate-50">{snapshot.summary.sccCount} (max {snapshot.summary.largestScc})</span></div>
                <div>st-order: <span className="text-slate-50">{snapshot.summary.stOrderVertices} vertices</span></div>
                <div>Bipolar edges: <span className="text-slate-50">{snapshot.summary.bipolarDirectedEdges}</span></div>
                <div>Dual crossed: <span className="text-slate-50">{snapshot.summary.dualCrossed}</span></div>
                <div>Flow: <span className="text-slate-50">{snapshot.summary.flowFeasible ? `cost ${snapshot.summary.flowCost}` : 'infeasible'}</span></div>
                <div>Layout mode: <span className="text-slate-50">{snapshot.summary.layoutMode}</span></div>
                <div>Final: <span className="text-slate-50">xings {snapshot.summary.crossings}, bends {snapshot.summary.bends}</span></div>
                <div>SPQR: <span className="text-slate-50">S{snapshot.summary.spqr.S} P{snapshot.summary.spqr.P} R{snapshot.summary.spqr.R} Q{snapshot.summary.spqr.Q}</span></div>
              </div>
            </Card>
            <div
              className="absolute -right-2 top-12 bottom-12 w-2 cursor-ew-resize rounded-full border border-slate-400/35 bg-slate-700/45 hover:bg-slate-500/60"
              onPointerDown={startLeftResize}
              aria-label="Resize info panel"
              role="separator"
            />
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2">
        {stageSequence.map((stepId, idx) => {
          const stepDef = STAGE_BY_ID.get(stepId) ?? STAGES[0]!;
          const active = stepId === activeStage;
          const reached = idx / Math.max(1, stageSequence.length - 1) <= runProgress + 1e-6;
          return (
            <div
              key={`${algorithm.id}:${stepId}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? 'border-emerald-200/80 bg-emerald-500/40 text-emerald-50'
                  : reached
                    ? 'border-cyan-300/70 bg-cyan-500/30 text-cyan-50'
                    : 'border-slate-500/35 bg-slate-900/50 text-slate-300'
              }`}
            >
              {stepDef.title}
            </div>
          );
        })}
      </div>

      {running ? (
        <div className="pointer-events-none fixed right-4 top-16 z-30 w-[min(42vw,360px)] rounded-xl border border-white/20 bg-slate-900/55 px-4 py-3 text-left backdrop-blur">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Algorithm In Flight</div>
          <div className="mt-0.5 text-lg font-semibold text-white">{stage.title}</div>
          <div className="mt-0.5 text-xs text-slate-200">{stageNote}</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-300"
              style={{ width: `${Math.round(runProgress * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-300">{Math.round(runProgress * 100)}% complete</div>
        </div>
      ) : null}

      <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void runAlgorithm()} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSeed((s) => s + 1);
          }}
          disabled={running}
        >
          Reseed
        </Button>
      </div>

      <div className="fixed bottom-4 left-1/2 z-20 w-[min(96vw,1120px)] -translate-x-1/2">
        <Card className="pointer-events-auto">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-slate-400/30 bg-slate-900/60 px-2 py-1">Three.js</span>
            <span className="rounded-full border border-slate-400/30 bg-slate-900/60 px-2 py-1">three-stdlib bloom</span>
            <span className="rounded-full border border-slate-400/30 bg-slate-900/60 px-2 py-1">CameraControls</span>
            <span className="rounded-full border border-slate-400/30 bg-slate-900/60 px-2 py-1">Rapier 3D</span>
            <span className="rounded-full border border-slate-400/30 bg-slate-900/60 px-2 py-1">Tween.js</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {ALGORITHMS.map((item) => {
              const active = item.id === selectedAlgorithmId;
              return (
                <Button
                  key={item.id}
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setSelectedAlgorithmId(item.id);
                  }}
                  disabled={running && item.id === selectedAlgorithmId}
                  className={`h-auto min-h-14 w-full justify-start rounded-lg px-3 py-2 text-left text-xs ${
                    active
                      ? 'border-emerald-300/80 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35'
                      : 'border-slate-500/35 bg-slate-900/45 text-slate-200 hover:border-slate-300/55'
                  }`}
                >
                  <div className="font-semibold">{item.title}</div>
                  <div className="mt-1 text-[11px] text-slate-300/90">{item.id}</div>
                </Button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
