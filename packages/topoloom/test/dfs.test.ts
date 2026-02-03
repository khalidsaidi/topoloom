import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { GraphBuilder } from '../src/graph';
import { biconnectedComponents, buildBCTree, sccTarjan } from '../src/dfs';

const condensationHasCycle = (componentOf: number[], edges: Array<[number, number]>): boolean => {
  const compCount = Math.max(...componentOf) + 1;
  const adj: number[][] = Array.from({ length: compCount }, () => []);
  for (const [u, v] of edges) {
    const cu = componentOf[u];
    const cv = componentOf[v];
    if (cu !== cv) adj[cu]?.push(cv);
  }

  const state = Array(compCount).fill(0);
  const dfs = (v: number): boolean => {
    state[v] = 1;
    for (const w of adj[v] ?? []) {
      if (state[w] === 1) return true;
      if (state[w] === 0 && dfs(w)) return true;
    }
    state[v] = 2;
    return false;
  };

  for (let i = 0; i < compCount; i += 1) {
    if (state[i] === 0 && dfs(i)) return true;
  }
  return false;
};

describe('dfs toolkit', () => {
  it('computes SCCs with DAG condensation', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    const d = builder.addVertex('d');
    builder.addEdge(a, b, true);
    builder.addEdge(b, c, true);
    builder.addEdge(c, a, true);
    builder.addEdge(c, d, true);
    const g = builder.build();

    const scc = sccTarjan(g);
    expect(scc.components.length).toBe(2);
    const edges: Array<[number, number]> = g.toEdgeList().map(([u, v]) => [u, v]);
    expect(condensationHasCycle(scc.componentOf, edges)).toBe(false);
  });

  it('computes biconnected components and BC-tree', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    const v3 = builder.addVertex('3');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v0, false);
    builder.addEdge(v1, v3, false);
    const g = builder.build();

    const bcc = biconnectedComponents(g);
    expect(bcc.articulationPoints).toContain(v1);
    expect(bcc.edgeToBlock.every((id) => id >= 0)).toBe(true);

    const tree = buildBCTree(g, bcc);
    const blockNodes = tree.nodes.filter((n) => n.type === 'block');
    const cutNodes = tree.nodes.filter((n) => n.type === 'cut');
    expect(blockNodes.length).toBe(2);
    expect(cutNodes.length).toBe(1);
  });

  it('treats self-loops as their own blocks', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const loop = builder.addEdge(v0, v0, false);
    builder.addEdge(v0, v1, false);
    const g = builder.build();

    const bcc = biconnectedComponents(g);
    expect(bcc.edgeToBlock[loop]).toBeGreaterThanOrEqual(0);
    const loopBlock = bcc.blocks.find((block) => block.length === 1 && block[0] === loop);
    expect(loopBlock).toBeDefined();
  });

  it('can reject directed edges or self-loops via options', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    builder.addEdge(v0, v1, true);
    const g = builder.build();
    expect(() => biconnectedComponents(g, { treatDirectedAsUndirected: false })).toThrow(/undirected/i);

    const loopBuilder = new GraphBuilder();
    const a = loopBuilder.addVertex('a');
    loopBuilder.addEdge(a, a, false);
    const loopGraph = loopBuilder.build();
    expect(() => biconnectedComponents(loopGraph, { allowSelfLoops: 'reject' })).toThrow(/self-loops/i);
  });

  it('partitions edges into blocks for random graphs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 })), {
          minLength: 1,
          maxLength: 12,
        }),
        (n, m, rawEdges) => {
          const builder = new GraphBuilder();
          for (let i = 0; i < n; i += 1) builder.addVertex(i);
          const edges = rawEdges
            .slice(0, m)
            .map(([u, v]) => [u % n, v % n] as const)
            .filter(([u, v]) => u !== v);
          for (const [u, v] of edges) builder.addEdge(u, v, false);
          const g = builder.build();
          const bcc = biconnectedComponents(g);
          expect(bcc.edgeToBlock.length).toBe(g.edgeCount());
          expect(bcc.edgeToBlock.every((id) => id >= 0)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('condensation is acyclic for random directed graphs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 14 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 })), {
          minLength: 1,
          maxLength: 14,
        }),
        (n, m, rawEdges) => {
          const builder = new GraphBuilder();
          for (let i = 0; i < n; i += 1) builder.addVertex(i);
          const edges = rawEdges.slice(0, m).map(([u, v]) => [u % n, v % n] as const);
          for (const [u, v] of edges) builder.addEdge(u, v, true);
          const g = builder.build();
          const scc = sccTarjan(g);
          expect(condensationHasCycle(scc.componentOf, edges as Array<[number, number]>)).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });
});
