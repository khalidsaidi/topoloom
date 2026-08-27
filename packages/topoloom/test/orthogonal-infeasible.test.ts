import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fromEdgeList } from '../src/graph';
import type { Graph } from '../src/graph';
import {
  OrthogonalInfeasibleError,
  orthogonalLayout,
  planarizationLayout,
} from '../src/layout';
import { testPlanarity } from '../src/planarity';
import { buildHalfEdgeMesh } from '../src/embedding';
import { toReactFlow } from '../src/react-flow';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetsDir = path.join(__dirname, '../../../apps/showcase/public/datasets');

const loadDataset = (id: string): Graph => {
  const raw = JSON.parse(fs.readFileSync(path.join(datasetsDir, `${id}.json`), 'utf8')) as {
    edges: Array<[string, string]>;
  };
  return fromEdgeList(raw.edges.map((e) => [e[0], e[1]]));
};

// Every graph the showcase ships. Before the corner-based angle fix in
// computeBends, all graphs containing a bridge (bu4p-g00100-01, hero, the OSM
// and roadnet BFS samples) made the bend min-cost flow infeasible and threw.
const ORTHOGONAL_DATASETS = [
  'benchmark-bu4p-g00100-01',
  'benchmark-bu4p-g00200-01',
  'benchmark-bu4p-g00300-01',
  'hero',
  'osm-downtown-sf-bfs-220-s3',
  'osm-downtown-sf-bfs-320-s17',
  'powergrid-bfs-250-s1',
  'powergrid-bfs-320-s7',
  'roadnet-ca-bfs-250-s11',
  'roadnet-ca-bfs-340-s23',
  'suitesparse-hamm-add32-sample',
];

describe('orthogonal mode across showcase datasets', () => {
  for (const id of ORTHOGONAL_DATASETS) {
    it(`${id} lays out in true orthogonal mode`, () => {
      const g = loadDataset(id);
      const result = planarizationLayout(g, { mode: 'orthogonal' });
      expect(result.layout.stats.mode).toBe('orthogonal');
      expect(result.layout.positions.size).toBeGreaterThan(0);
      expect(result.layout.edges.length).toBe(g.edgeCount());
      expect(Number.isFinite(result.layout.stats.bends)).toBe(true);
    });
  }

  // Known pre-existing limitation, independent of the orthogonal flow fix: the
  // planarization edge-insertion loop produces a temporarily nonplanar
  // intermediate for this dense circuit sample, in BOTH straight and
  // orthogonal modes. This test flips to green when that defect is fixed.
  it.fails('suitesparse-hamm-add20-sample still trips the planarization insertion loop', () => {
    const g = loadDataset('suitesparse-hamm-add20-sample');
    planarizationLayout(g, { mode: 'orthogonal' });
  });
});

describe('bridges in the embedding (root cause of the old infeasibility)', () => {
  it('handles a pendant edge (bridge) on a cycle', () => {
    // square + pendant vertex: max degree 3, planar, contains a bridge.
    const g = fromEdgeList([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['a', 'e'],
    ]);
    const result = planarizationLayout(g, { mode: 'orthogonal' });
    expect(result.layout.stats.mode).toBe('orthogonal');
  });

  it('handles a pure tree (every edge a bridge)', () => {
    const g = fromEdgeList([
      ['r', 'a'],
      ['r', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'e'],
    ]);
    const planarity = testPlanarity(g);
    expect(planarity.planar).toBe(true);
    if (!planarity.planar) return;
    const mesh = buildHalfEdgeMesh(g, planarity.embedding);
    const layout = orthogonalLayout(mesh);
    expect(layout.stats.mode).toBe('orthogonal');
    expect(layout.positions.size).toBeGreaterThan(0);
  });

  it('handles two cycles joined by a bridge', () => {
    const g = fromEdgeList([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['c', 'x'],
      ['x', 'y'],
      ['y', 'z'],
      ['z', 'x'],
    ]);
    const result = planarizationLayout(g, { mode: 'orthogonal' });
    expect(result.layout.stats.mode).toBe('orthogonal');
  });
});

describe('onInfeasible option', () => {
  // A disconnected input still yields an unbalanced flow (Euler's formula
  // shifts by 4 per extra component), so it is a genuine infeasible case.
  const disconnected = () =>
    fromEdgeList([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['x', 'y'],
      ['y', 'z'],
      ['z', 'x'],
    ]);

  it('throws an actionable OrthogonalInfeasibleError by default', () => {
    expect(() => planarizationLayout(disconnected(), { mode: 'orthogonal' })).toThrowError(
      OrthogonalInfeasibleError,
    );
    try {
      planarizationLayout(disconnected(), { mode: 'orthogonal' });
      expect.unreachable('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("mode:'straight'");
      expect(message).toContain("onInfeasible:'fallback'");
    }
  });

  it("downgrades honestly with onInfeasible: 'fallback'", () => {
    const result = planarizationLayout(disconnected(), {
      mode: 'orthogonal',
      onInfeasible: 'fallback',
    });
    expect(result.layout.stats.mode).toBe('straight-fallback');
    expect(result.layout.positions.size).toBe(6);
    expect(result.layout.edges.length).toBe(6);
  });

  it('never reports straight-fallback when orthogonal succeeded', () => {
    const g = fromEdgeList([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    const result = planarizationLayout(g, { mode: 'orthogonal', onInfeasible: 'fallback' });
    expect(result.layout.stats.mode).toBe('orthogonal');
  });

  it('straight mode records stats.mode', () => {
    const g = fromEdgeList([['a', 'b'], ['b', 'c']]);
    const result = planarizationLayout(g);
    expect(result.layout.stats.mode).toBe('straight');
  });
});

describe('collinear overlap reduction', () => {
  const totalCollinearOverlap = (edges: Array<{ edge: number; points: Array<{ x: number; y: number }> }>) => {
    const segs: Array<[number, { x: number; y: number }, { x: number; y: number }]> = [];
    for (const e of edges) {
      for (let i = 0; i < e.points.length - 1; i += 1) segs.push([e.edge, e.points[i]!, e.points[i + 1]!]);
    }
    let total = 0;
    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const [ei, a1, a2] = segs[i]!;
        const [ej, b1, b2] = segs[j]!;
        if (ei === ej) continue;
        if (a1.x === a2.x && b1.x === b2.x && a1.x === b1.x) {
          const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
          const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
          if (hi > lo) total += hi - lo;
        } else if (a1.y === a2.y && b1.y === b2.y && a1.y === b1.y) {
          const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
          const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
          if (hi > lo) total += hi - lo;
        }
      }
    }
    return total;
  };

  it('greedy corner choice keeps collinear overlap low on the quickstart graph', () => {
    const g = fromEdgeList([
      ['app', 'db'],
      ['app', 'cache'],
      ['db', 'cache'],
      ['app', 'queue'],
      ['queue', 'db'],
    ]);
    const result = planarizationLayout(g, { mode: 'orthogonal' });
    // Was 260 with the unconditional vertical-first corner choice.
    expect(totalCollinearOverlap(result.layout.edges)).toBeLessThanOrEqual(100);
    expect(result.layout.stats.bends).toBe(5);
  });
});

describe('misuse guards on public entry points', () => {
  const rawEdgeList = [
    ['a', 'b'],
    ['b', 'c'],
  ] as unknown as Graph;

  it('planarizationLayout rejects a raw edge list', () => {
    expect(() => planarizationLayout(rawEdgeList)).toThrowError(
      /planarizationLayout expected a Graph — build one with fromEdgeList/,
    );
  });

  it('testPlanarity rejects a raw edge list', () => {
    expect(() => testPlanarity(rawEdgeList)).toThrowError(
      /testPlanarity expected a Graph — build one with fromEdgeList/,
    );
  });

  it('buildHalfEdgeMesh rejects a non-graph', () => {
    expect(() => buildHalfEdgeMesh({} as unknown as Graph, { order: [] })).toThrowError(
      /buildHalfEdgeMesh expected a Graph — build one with fromEdgeList/,
    );
  });

  it('toReactFlow rejects a non-graph', () => {
    const g = fromEdgeList([['a', 'b']]);
    const layout = planarizationLayout(g);
    expect(() => toReactFlow(layout, null as unknown as Graph)).toThrowError(
      /toReactFlow expected a Graph — build one with fromEdgeList/,
    );
  });
});
