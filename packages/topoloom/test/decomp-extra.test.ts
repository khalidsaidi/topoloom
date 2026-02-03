import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { buildSkeletonFromEdges, spqrDecomposeAll, spqrDecomposeSafe, validateSPQRTree, type SPQRNode, type SPQRTree } from '../src/decomp';

const makeNode = (type: SPQRNode['type'], skeleton: ReturnType<typeof buildSkeletonFromEdges>): SPQRNode => {
  const edgeKind = Array.from({ length: skeleton.edgeCount() }, (_v, idx) => ({
    kind: 'real' as const,
    original: idx,
  }));
  const vertexMap = Array.from({ length: skeleton.vertexCount() }, (_v, idx) => idx);
  return {
    id: 0,
    type,
    skeleton,
    edgeKind,
    vertexMap,
  };
};

describe('spqr validation helpers', () => {
  it('flags invalid P node skeletons', () => {
    const skeleton = buildSkeletonFromEdges(3, [
      [0, 1],
      [1, 2],
    ]);
    const tree: SPQRTree = { nodes: [makeNode('P', skeleton)], edges: [] };
    const result = validateSPQRTree(tree);
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes('P node'))).toBe(true);
  });

  it('flags invalid S node skeletons', () => {
    const skeleton = buildSkeletonFromEdges(3, [
      [0, 1],
      [1, 2],
    ]);
    const tree: SPQRTree = { nodes: [makeNode('S', skeleton)], edges: [] };
    const result = validateSPQRTree(tree);
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes('S node'))).toBe(true);
  });

  it('flags R node separation pairs', () => {
    const skeleton = buildSkeletonFromEdges(4, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
    const tree: SPQRTree = { nodes: [makeNode('R', skeleton)], edges: [] };
    const result = validateSPQRTree(tree);
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes('separation pair'))).toBe(true);
  });
});

describe('spqr decomposition helpers', () => {
  it('decomposes each biconnected block in a forest', () => {
    const builder = new GraphBuilder();
    for (let i = 0; i < 5; i += 1) builder.addVertex(i);
    builder.addEdge(0, 1, false);
    builder.addEdge(1, 2, false);
    builder.addEdge(2, 0, false);
    builder.addEdge(0, 3, false);
    builder.addEdge(3, 4, false);
    builder.addEdge(4, 0, false);
    const g = builder.build();
    const forest = spqrDecomposeAll(g);
    expect(forest.blocks.length).toBe(2);
    forest.blocks.forEach((block) => {
      expect(block.tree.nodes.length).toBeGreaterThan(0);
    });
    expect(forest.articulationPoints).toContain(0);
  });

  it('selects the largest block for safe decomposition', () => {
    const builder = new GraphBuilder();
    for (let i = 0; i < 6; i += 1) builder.addVertex(i);
    builder.addEdge(0, 1, false);
    builder.addEdge(1, 2, false);
    builder.addEdge(2, 0, false);
    builder.addEdge(0, 3, false);
    builder.addEdge(3, 4, false);
    builder.addEdge(4, 0, false);
    builder.addEdge(0, 5, false);
    const g = builder.build();
    const result = spqrDecomposeSafe(g, { block: 'largest' });
    expect(result.tree.nodes.length).toBeGreaterThan(0);
    expect(result.note).toMatch(/largest block/i);
  });
});
