import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { buildHalfEdgeMesh, rotationFromAdjacency } from '../src/embedding';
import { orthogonalLayout, planarStraightLine, planarizationLayout, segmentsIntersect } from '../src/layout';

const sharedEndpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;

describe('layout', () => {
  it('produces planar straight-line layout for triangle', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const layout = planarStraightLine(mesh);

    for (let i = 0; i < layout.edges.length; i += 1) {
      for (let j = i + 1; j < layout.edges.length; j += 1) {
        const e1 = layout.edges[i]!;
        const e2 = layout.edges[j]!;
        const [a1, a2] = e1.points;
        const [b1, b2] = e2.points;
        if (!a1 || !a2 || !b1 || !b2) continue;
        if (sharedEndpoint(a1, b1) || sharedEndpoint(a1, b2) || sharedEndpoint(a2, b1) || sharedEndpoint(a2, b2)) {
          continue;
        }
        expect(segmentsIntersect(a1, a2, b1, b2)).toBe(false);
      }
    }
  });

  it('produces orthogonal polylines', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v0, false);
    const g = builder.build();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const layout = orthogonalLayout(mesh);

    for (const edge of layout.edges) {
      for (let i = 0; i < edge.points.length - 1; i += 1) {
        const p1 = edge.points[i];
        const p2 = edge.points[i + 1];
        if (!p1 || !p2) continue;
        expect(p1.x === p2.x || p1.y === p2.y).toBe(true);
      }
    }
  });

  it('planarization keeps a planar base for nonplanar graphs', () => {
    const builder = new GraphBuilder();
    const nodes = Array.from({ length: 6 }, (_, i) => builder.addVertex(i));
    for (let i = 0; i < 3; i += 1) {
      for (let j = 3; j < 6; j += 1) builder.addEdge(nodes[i]!, nodes[j]!, false);
    }
    const g = builder.build();
    const result = planarizationLayout(g);
    expect(result.remainingEdges.length).toBeGreaterThan(0);
    expect(result.baseGraph.edgeCount()).toBeLessThan(g.edgeCount());
  });
});
