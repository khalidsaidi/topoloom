import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { spqrDecompose, flipSkeleton, materializeEmbedding, permuteParallel, validateSPQRTree } from '../src/decomp';

const countType = (tree: ReturnType<typeof spqrDecompose>, type: string) =>
  tree.nodes.filter((n) => n.type === type).length;

describe('spqr', () => {
  it('produces a single Q node for a single edge', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(countType(tree, 'Q')).toBe(1);
    expect(tree.nodes.length).toBe(1);
    expect(tree.edges.length).toBe(0);
  });

  it('produces P node for parallel edges', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    builder.addEdge(a, b, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(countType(tree, 'P')).toBe(1);
    expect(countType(tree, 'Q')).toBe(2);
    expect(tree.edges.length).toBe(2);
  });

  it('produces S node for cycles', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    const v3 = builder.addVertex('3');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v3, false);
    builder.addEdge(v3, v0, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(countType(tree, 'S')).toBe(1);
  });

  it('produces R node for rigid graphs', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    const v3 = builder.addVertex('3');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v0, false);
    builder.addEdge(v0, v3, false);
    builder.addEdge(v1, v3, false);
    builder.addEdge(v2, v3, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(countType(tree, 'R')).toBe(1);
  });

  it('validates SPQR tree invariants', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    const v3 = builder.addVertex('3');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v3, false);
    builder.addEdge(v3, v0, false);
    builder.addEdge(v0, v2, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    const validation = validateSPQRTree(tree);
    expect(validation.ok).toBe(true);
  });

  it('permutes parallel skeleton edges', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    builder.addEdge(a, b, false);
    builder.addEdge(a, b, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    const pNode = tree.nodes.find((n) => n.type === 'P');
    expect(pNode).toBeDefined();
    if (!pNode) return;
    const edges = pNode.skeleton.edges().map((edge) => edge.id);
    const reversed = edges.slice().reverse();
    const permuted = permuteParallel(pNode, reversed);
    const first = reversed[0] ?? 0;
    const v0 = pNode.skeleton.edge(first).u;
    const order = permuted.order[v0].map((entry) => entry.edge);
    expect(order).toEqual(reversed);
  });

  it('flips R skeleton order', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    const v3 = builder.addVertex('3');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v0, false);
    builder.addEdge(v0, v3, false);
    builder.addEdge(v1, v3, false);
    builder.addEdge(v2, v3, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    const rNode = tree.nodes.find((n) => n.type === 'R');
    expect(rNode).toBeDefined();
    if (!rNode) return;
    const base = materializeEmbedding(rNode);
    const flipped = flipSkeleton(rNode);
    base.order.forEach((list, idx) => {
      const expected = [...list].reverse();
      expect(flipped.order[idx]).toEqual(expected);
    });
  });

  it('keeps SPQR tree as a tree', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    const d = builder.addVertex('d');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, d, false);
    builder.addEdge(d, a, false);
    builder.addEdge(a, c, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(tree.edges.length).toBe(tree.nodes.length - 1);
  });
});
