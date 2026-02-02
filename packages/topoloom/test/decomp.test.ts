import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { spqrDecompose } from '../src/decomp';

describe('spqr', () => {
  it('classifies Q nodes for single edge', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(tree.nodes[0]?.type).toBe('Q');
  });

  it('classifies P nodes for parallel edges', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    builder.addEdge(a, b, false);
    const g = builder.build();
    const tree = spqrDecompose(g);
    expect(tree.nodes[0]?.type).toBe('P');
  });

  it('classifies S nodes for cycles', () => {
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
    expect(tree.nodes[0]?.type).toBe('S');
  });

  it('classifies R nodes for rigid graphs', () => {
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
    expect(tree.nodes[0]?.type).toBe('R');
  });
});
