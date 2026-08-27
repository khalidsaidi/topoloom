import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import type { Graph } from '../src/graph';
import { buildHalfEdgeMesh, rotationFromAdjacency } from '../src/embedding';
import { orthogonalLayout, planarStraightLine, planarizationLayout } from '../src/layout';
import { toReactFlow } from '../src/react-flow';

const labeledTriangle = (): Graph => {
  const builder = new GraphBuilder();
  const a = builder.addVertex('Auth');
  const b = builder.addVertex('Billing');
  const c = builder.addVertex('Cache');
  builder.addEdge(a, b, false);
  builder.addEdge(b, c, false);
  builder.addEdge(c, a, false);
  return builder.build();
};

const completeGraph = (n: number): Graph => {
  const builder = new GraphBuilder();
  for (let i = 0; i < n; i += 1) builder.addVertex(`v${i}`);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) builder.addEdge(i, j, false);
  }
  return builder.build();
};

describe('react-flow adapter', () => {
  it('maps vertices to nodes with label ids and label data', () => {
    const g = labeledTriangle();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const layout = planarStraightLine(mesh);
    const { nodes, edges } = toReactFlow(layout, g);

    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id).sort()).toEqual(['Auth', 'Billing', 'Cache']);
    for (const node of nodes) {
      expect(node.data.label).toBe(node.id);
      const p = layout.positions.get(node.data.vertexId)!;
      expect(node.position).toEqual({ x: p.x, y: p.y });
    }
    expect(edges).toHaveLength(3);
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      expect(edge.source).not.toBe(edge.target);
    }
  });

  it('falls back to numeric vertex ids when labels are missing or duplicated', () => {
    const builder = new GraphBuilder();
    builder.addVertex('dup');
    builder.addVertex('dup');
    builder.addVertex(null);
    builder.addEdge(0, 1, false);
    builder.addEdge(1, 2, false);
    const g = builder.build();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const { nodes } = toReactFlow(planarStraightLine(mesh), g);

    expect(nodes.map((n) => n.id)).toEqual(['0', '1', '2']);
    expect(nodes.map((n) => n.data.label)).toEqual(['dup', 'dup', '2']);
  });

  it('applies scale and centers nodes via nodeWidth/nodeHeight', () => {
    const g = labeledTriangle();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const layout = orthogonalLayout(mesh);
    const { nodes, edges } = toReactFlow(layout, g, {
      scale: 4,
      nodeWidth: 60,
      nodeHeight: 30,
    });

    for (const node of nodes) {
      const p = layout.positions.get(node.data.vertexId)!;
      expect(node.position.x).toBeCloseTo(p.x * 4 - 30);
      expect(node.position.y).toBeCloseTo(p.y * 4 - 15);
    }
    for (const edge of edges) {
      const source = layout.edges.find((e) => e.edge === edge.data.edgeId)!;
      expect(edge.data.points).toEqual(source.points.map((p) => ({ x: p.x * 4, y: p.y * 4 })));
    }
  });

  it('exposes orthogonal bends as bendPoints and picks smoothstep for bent edges', () => {
    const g = labeledTriangle();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const layout = orthogonalLayout(mesh);
    const { edges } = toReactFlow(layout, g);

    for (const edge of edges) {
      const source = layout.edges.find((e) => e.edge === edge.data.edgeId)!;
      expect(edge.data.bendPoints).toEqual(source.points.slice(1, source.points.length - 1));
      if (edge.data.bendPoints.length > 0) {
        expect(edge.type).toBe('smoothstep');
      } else {
        expect(edge.type).toBe('straight');
      }
    }
    expect(edges.some((e) => e.data.bendPoints.length > 0)).toBe(true);
  });

  it('accepts a PlanarizationResult and never emits dummy crossing vertices as nodes', () => {
    const g = completeGraph(5); // K5 — non-planar, forces at least one crossing dummy
    const result = planarizationLayout(g, { mode: 'orthogonal' });
    expect(result.layout.stats.crossings).toBeGreaterThan(0);

    const { nodes, edges } = toReactFlow(result, g);
    expect(nodes).toHaveLength(5);
    expect(edges).toHaveLength(g.edgeCount());
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      const record = g.edge(edge.data.edgeId);
      expect(edge.source).toBe(String(g.label(record.u)));
      expect(edge.target).toBe(String(g.label(record.v)));
    }
  });

  it('honors edgeType override and node/edge defaults without clobbering core fields', () => {
    const g = labeledTriangle();
    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const { nodes, edges } = toReactFlow(orthogonalLayout(mesh), g, {
      edgeType: 'orthogonal',
      nodeDefaults: { type: 'compact', draggable: false, id: 'IGNORED' },
      edgeDefaults: { animated: true, source: 'IGNORED' },
    });

    for (const node of nodes) {
      expect(node.type).toBe('compact');
      expect(node.draggable).toBe(false);
      expect(node.id).not.toBe('IGNORED');
    }
    for (const edge of edges) {
      expect(edge.type).toBe('orthogonal');
      expect(edge.animated).toBe(true);
      expect(edge.source).not.toBe('IGNORED');
    }
  });
});
