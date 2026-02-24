import { describe, expect, it } from 'vitest';

import { deterministicSample } from '@/lib/sampler';

function makeGraph(size: number) {
  const nodes = Array.from({ length: size }, (_, i) => String(i));
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < size - 1; i += 1) {
    edges.push([i, i + 1]);
  }
  for (let i = 0; i < size - 2; i += 2) {
    edges.push([i, i + 2]);
  }
  return { nodes, edges };
}

describe('deterministicSample', () => {
  it('returns identical output for identical input/seed/caps', () => {
    const graph = makeGraph(40);
    const a = deterministicSample(graph.nodes, graph.edges, 7, 20, 60);
    const b = deterministicSample(graph.nodes, graph.edges, 7, 20, 60);
    expect(a).toEqual(b);
  });

  it('returns different node sets for different seeds in typical cases', () => {
    const graph = makeGraph(50);
    const a = deterministicSample(graph.nodes, graph.edges, 1, 18, 60);
    const b = deterministicSample(graph.nodes, graph.edges, 13, 18, 60);
    expect(a.selectedOriginalNodeIndices).not.toEqual(b.selectedOriginalNodeIndices);
  });
});
