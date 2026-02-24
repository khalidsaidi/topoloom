import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@khalidsaidi/topoloom/graph',
  () => ({
    GraphBuilder: class {
      private labels: string[] = [];

      private edgesList: Array<{ id: number; u: number; v: number; directed: boolean }> = [];

      addVertex(label: string) {
        this.labels.push(label);
        return this.labels.length - 1;
      }

      addEdge(u: number, v: number, directed = false) {
        const id = this.edgesList.length;
        this.edgesList.push({ id, u, v, directed });
        return id;
      }

      build() {
        const edges = [...this.edgesList];
        return {
          edgesList: edges,
          edge: (id: number) => edges[id] ?? { id, u: 0, v: 0, directed: false },
        };
      }
    },
  }),
  { virtual: true },
);

vi.mock(
  '@khalidsaidi/topoloom/planarity',
  () => ({
    testPlanarity: () => ({
      planar: false,
      witness: {
        type: 'K5',
        edges: [0],
      },
    }),
  }),
  { virtual: true },
);

vi.mock(
  '@khalidsaidi/topoloom/embedding',
  () => ({
    buildHalfEdgeMesh: () => ({
      faces: [],
    }),
  }),
  { virtual: true },
);

vi.mock(
  '@khalidsaidi/topoloom/layout',
  () => ({
    planarStraightLine: () => ({
      positions: new Map<number, { x: number; y: number }>([
        [0, { x: 0, y: 0 }],
        [1, { x: 10, y: 0 }],
      ]),
      edges: [{ edge: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
      stats: { bends: 0, crossings: 0 },
    }),
    orthogonalLayout: () => ({
      positions: new Map<number, { x: number; y: number }>([
        [0, { x: 0, y: 0 }],
        [1, { x: 10, y: 0 }],
      ]),
      edges: [{ edge: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
      stats: { bends: 1, crossings: 0 },
    }),
    planarizationLayout: () => ({
      layout: {
        positions: new Map<number, { x: number; y: number }>([
          [0, { x: 0, y: 0 }],
          [1, { x: 10, y: 0 }],
          [2, { x: 5, y: 8 }],
        ]),
        edges: [{ edge: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
        stats: { bends: 0, crossings: 1 },
      },
    }),
  }),
  { virtual: true },
);

vi.mock(
  '@khalidsaidi/topoloom/dfs',
  () => ({
    biconnectedComponents: () => ({
      blocks: [[0]],
      articulationPoints: new Set<number>([0]),
      bridges: new Set<number>([0]),
    }),
  }),
  { virtual: true },
);

vi.mock(
  '@khalidsaidi/topoloom/decomp',
  () => ({
    spqrDecomposeSafe: () => ({
      tree: {
        nodes: [{ type: 'S' }, { type: 'P' }, { type: 'R' }, { type: 'Q' }],
      },
    }),
  }),
  { virtual: true },
);

describe('topoloomWorker computeWorkerResult', () => {
  it('returns structured-cloneable result with required fields', async () => {
    const { computeWorkerResult } = await import('@/workers/topoloomWorker');

    const result = await computeWorkerResult('test-request', {
      datasetId: 'worker-test',
      sampleId: 'k5',
      nodes: ['0', '1', '2', '3', '4'],
      edges: [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
      settings: {
        mode: 'planarization-straight',
        maxNodes: 5,
        maxEdges: 20,
        seed: 1,
        showWitness: true,
      },
    });

    expect(result.sampledGraph.nodes.length).toBeGreaterThan(0);
    expect(result.sampledStats.nodes).toBeGreaterThan(0);
    expect(result.layout.positions.length).toBeGreaterThan(0);
    expect(result.planarity.embeddingAvailable).toBe(false);
    expect(result.planarity.witness?.kind).toBe('K5');
    expect(() => structuredClone(result)).not.toThrow();
  });
});
