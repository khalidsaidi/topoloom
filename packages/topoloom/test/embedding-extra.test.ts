import { describe, expect, it } from 'vitest';

import { fromEdgeList } from '../src/graph';
import { buildHalfEdgeMesh, rotationFromAdjacency, selectOuterFace, validateMesh } from '../src/embedding';

describe('embedding utilities', () => {
  it('selectOuterFace uses positions to pick the max-area face', () => {
    const graph = fromEdgeList([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
    const positions = new Map([
      [0, { x: 0, y: 0 }],
      [1, { x: 2, y: 0 }],
      [2, { x: 0, y: 2 }],
    ]);
    const areas = mesh.faces.map((cycle) => {
      let area = 0;
      for (let i = 0; i < cycle.length; i += 1) {
        const h = cycle[i]!;
        const v = mesh.origin[h] ?? 0;
        const nextH = cycle[(i + 1) % cycle.length]!;
        const w = mesh.origin[nextH] ?? 0;
        const p1 = positions.get(v)!;
        const p2 = positions.get(w)!;
        area += p1.x * p2.y - p2.x * p1.y;
      }
      return Math.abs(area);
    });
    const expected = areas.indexOf(Math.max(...areas));
    expect(selectOuterFace(mesh, positions)).toBe(expected);
  });

  it('validateMesh reports twin mismatch errors', () => {
    const graph = fromEdgeList([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
    const broken = {
      ...mesh,
      twin: [...mesh.twin],
    };
    broken.twin[0] = -1;
    const report = validateMesh(broken);
    expect(report.ok).toBe(false);
    expect(report.errors.some((err) => err.includes('Twin mismatch'))).toBe(true);
  });
});
