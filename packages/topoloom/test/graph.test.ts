import { describe, expect, it } from 'vitest';

import { GraphBuilder, fromAdjList, fromEdgeList, Graph } from '../src/graph';

describe('graph', () => {
  it('builds a graph with stable adjacency order', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');

    builder.addEdge(a, b, false);
    builder.addEdge(a, c, true);
    builder.addEdge(a, b, false);

    const g = builder.build();
    const adj = g.adjacency(a).map((entry) => [entry.edge, entry.to, entry.dir]);
    expect(adj).toEqual([
      [0, b, 'undirected'],
      [1, c, 'out'],
      [2, b, 'undirected'],
    ]);
  });

  it('supports multi-edges and self-loops', () => {
    const builder = new GraphBuilder();
    const v = builder.addVertex('v');
    const w = builder.addVertex('w');
    builder.addEdge(v, v, false);
    builder.addEdge(v, w, false);
    builder.addEdge(v, w, false);

    const g = builder.build();
    expect(g.edgeCount()).toBe(3);
    expect(g.adjacency(v).length).toBe(4);
    const loop = g.edge(0);
    expect(loop.u).toBe(v);
    expect(loop.v).toBe(v);
  });

  it('round-trips JSON', () => {
    const g = fromEdgeList([
      ['a', 'b'],
      ['b', 'c', true],
      ['a', 'c'],
    ]);
    const json = g.toJSON();
    const g2 = Graph.fromJSON(json);
    expect(g2.toEdgeList()).toEqual(g.toEdgeList());
    expect(g2.vertices()).toHaveLength(g.vertexCount());
  });

  it('adapters map adjacency lists', () => {
    const g = fromAdjList({ a: ['b', 'c'], b: ['c'] });
    expect(g.edgeCount()).toBe(3);
    const list = g.toEdgeList();
    expect(list[0]?.[2]).toBe(false);
  });
});
