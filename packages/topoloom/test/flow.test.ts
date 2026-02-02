import { describe, expect, it } from 'vitest';

import { minCostFlow } from '../src/flow';

describe('flow', () => {
  it('solves simple min-cost flow', () => {
    const result = minCostFlow({
      nodeCount: 2,
      demands: [5, -5],
      arcs: [{ from: 0, to: 1, upper: 10, cost: 2 }],
    });
    expect(result.feasible).toBe(true);
    expect(result.flowByArc[0]).toBe(5);
    expect(result.totalCost).toBe(10);
  });

  it('handles lower bounds', () => {
    const result = minCostFlow({
      nodeCount: 2,
      demands: [3, -3],
      arcs: [{ from: 0, to: 1, lower: 1, upper: 5, cost: 1 }],
    });
    expect(result.feasible).toBe(true);
    expect(result.flowByArc[0]).toBe(3);
  });
});
