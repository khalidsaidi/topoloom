import { describe, expect, it } from 'vitest';

import { computeWorkerResult } from '@/workers/topoloomWorker';

describe('topoloomWorker computeWorkerResult', () => {
  it('returns structured-cloneable result with required fields', async () => {
    const nodes = ['0', '1', '2', '3', '4'];
    const edges: Array<[number, number]> = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ];

    const result = await computeWorkerResult('test-request', {
      datasetId: 'worker-test',
      sampleId: 'k5',
      nodes,
      edges,
      settings: {
        mode: 'planarization-straight',
        maxNodes: 5,
        maxEdges: 20,
        seed: 1,
        showWitness: true,
      },
    });

    expect(result.sampledGraph.nodes.length).toBeGreaterThan(0);
    expect(result.sampledStats.nodes).toBeGreaterThan(0);
    expect(result.layout.positions.length).toBeGreaterThan(0);
    expect(result.planarity.embeddingAvailable).toBeTypeOf('boolean');
    expect(() => structuredClone(result)).not.toThrow();
  });
});
