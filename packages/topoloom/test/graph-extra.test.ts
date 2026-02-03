import { describe, expect, it } from 'vitest';

import { GraphBuilder, fromAdjList, toAdjList, toEdgeList } from '../src/graph';

describe('graph adapters and guards', () => {
  it('rejects invalid vertex ids when adding edges', () => {
    const builder = new GraphBuilder();
    builder.addVertex('a');
    expect(() => builder.addEdge(0, 1, false)).toThrow(/Invalid vertex id/);
  });

  it('handles adjacency list inputs (array and object)', () => {
    const arrayGraph = fromAdjList([[1], []], false);
    expect(arrayGraph.edgeCount()).toBe(1);
    expect(toEdgeList(arrayGraph)[0]).toEqual([0, 1, false]);

    const objectGraph = fromAdjList({ A: ['B'] }, false);
    expect(objectGraph.edgeCount()).toBe(1);
    const adj = toAdjList(objectGraph);
    expect(adj.length).toBe(2);
    expect(adj[0]?.[0]?.to).toBe(1);
  });
});
