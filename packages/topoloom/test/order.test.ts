import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { stNumbering, bipolarOrientation } from '../src/order';
import { buildHalfEdgeMesh, rotationFromAdjacency } from '../src/embedding';

describe('order', () => {
  it('computes st-numbering with st property', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();

    const numbering = stNumbering(g, a, c);
    expect(numbering.order[0]).toBe(a);
    expect(numbering.order[numbering.order.length - 1]).toBe(c);
    const bNum = numbering.numberOf[b];
    expect(bNum).toBeGreaterThan(numbering.numberOf[a] ?? 0);
    expect(bNum).toBeLessThan(numbering.numberOf[c] ?? Number.MAX_SAFE_INTEGER);
  });

  it('computes bipolar orientation', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();

    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const oriented = bipolarOrientation(mesh, a, c);

    const indeg = new Map<number, number>();
    const outdeg = new Map<number, number>();
    for (const v of g.vertices()) {
      indeg.set(v, 0);
      outdeg.set(v, 0);
    }
    for (const edge of oriented.edgeDirections) {
      outdeg.set(edge.from, (outdeg.get(edge.from) ?? 0) + 1);
      indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
    }

    expect(indeg.get(a)).toBe(0);
    expect(outdeg.get(c)).toBe(0);
  });
});
