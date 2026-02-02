import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { buildHalfEdgeMesh, rotationFromAdjacency, validateMesh } from '../src/embedding';

describe('embedding', () => {
  it('builds half-edge mesh for triangle', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();

    const rotation = rotationFromAdjacency(g);
    const mesh = buildHalfEdgeMesh(g, rotation);
    const validation = validateMesh(mesh);
    expect(validation.ok).toBe(true);
    expect(mesh.faces.length).toBe(2);
    expect(g.vertexCount() - g.edgeCount() + mesh.faces.length).toBe(2);
  });

  it('builds faces for square with diagonal', () => {
    const builder = new GraphBuilder();
    const v0 = builder.addVertex('0');
    const v1 = builder.addVertex('1');
    const v2 = builder.addVertex('2');
    const v3 = builder.addVertex('3');
    builder.addEdge(v0, v1, false);
    builder.addEdge(v1, v2, false);
    builder.addEdge(v2, v3, false);
    builder.addEdge(v3, v0, false);
    builder.addEdge(v0, v2, false);
    const g = builder.build();

    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const validation = validateMesh(mesh);
    expect(validation.ok).toBe(true);
    expect(mesh.faces.length).toBe(3);
  });
});
