import { describe, expect, it } from 'vitest';

import { buildSkeletonFromEdges, validateSPQRTree, type SPQRNode, type SPQRTree } from '../src/decomp';

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
