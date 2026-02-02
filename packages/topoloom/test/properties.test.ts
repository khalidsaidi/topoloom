import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { GraphBuilder } from '../src/graph';
import { rotationFromAdjacency, buildHalfEdgeMesh, validateMesh } from '../src/embedding';
import { buildDual } from '../src/dual';
import { minCostFlow } from '../src/flow';

const buildRandomGraph = (n: number, edges: Array<[number, number]>): GraphBuilder => {
  const builder = new GraphBuilder();
  for (let i = 0; i < n; i += 1) builder.addVertex(i);
  for (const [u, v] of edges) builder.addEdge(u, v, false);
  return builder;
};

describe('property checks', () => {
  it('embedding invariants hold under rotation system', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 7 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })), {
          minLength: 3,
          maxLength: 12,
        }),
        (n, rawEdges) => {
          const edges = rawEdges.map(([u, v]) => [u % n, v % n] as const).filter(([u, v]) => u !== v);
          const g = buildRandomGraph(n, edges).build();
          const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
          const validation = validateMesh(mesh);
          expect(validation.ok).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('dual mappings stay consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 })), {
          minLength: 3,
          maxLength: 10,
        }),
        (n, rawEdges) => {
          const edges = rawEdges.map(([u, v]) => [u % n, v % n] as const).filter(([u, v]) => u !== v);
          const g = buildRandomGraph(n, edges).build();
          const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
          const dual = buildDual(mesh);
          for (let e = 0; e < g.edgeCount(); e += 1) {
            const faces = dual.edgeFaces[e];
            const h0 = e * 2;
            const h1 = e * 2 + 1;
            expect([faces.left, faces.right]).toContain(mesh.face[h0]);
            expect([faces.left, faces.right]).toContain(mesh.face[h1]);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('min-cost flow respects bounds and conservation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), (n) => {
        const arcs = [] as Array<{ from: number; to: number; lower?: number; upper: number; cost: number }>;
        const demands = Array(n).fill(0);
        demands[0] = 5;
        demands[n - 1] = -5;
        for (let i = 0; i < n - 1; i += 1) {
          arcs.push({ from: i, to: i + 1, lower: 0, upper: 10, cost: 1 });
        }
        const result = minCostFlow({ nodeCount: n, arcs, demands });
        const flow = result.flowByArc;
        for (let i = 0; i < arcs.length; i += 1) {
          expect(flow[i]).toBeGreaterThanOrEqual(arcs[i].lower ?? 0);
          expect(flow[i]).toBeLessThanOrEqual(arcs[i].upper);
        }
        const balance = Array(n).fill(0);
        for (let i = 0; i < arcs.length; i += 1) {
          const arc = arcs[i];
          balance[arc.from] -= flow[i];
          balance[arc.to] += flow[i];
        }
        for (let i = 0; i < n; i += 1) {
          expect(balance[i]).toBe(demands[i]);
        }
      }),
      { numRuns: 20 },
    );
  });
});
