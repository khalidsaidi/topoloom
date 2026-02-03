import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { RecomputeBanner } from '@/components/demo/RecomputeBanner';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { demoExpectations } from '@/data/demo-expectations';
import { graphSignature, presets, resolvePreset, toTopoGraph, type PresetKey } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { buildHalfEdgeMesh, rotationFromAdjacency, type HalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';

export function EmbeddingDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'k4' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialSig = graphSignature(initialState);
  const initialMesh = (() => {
    if (!query.autorun) return null;
    const graph = toTopoGraph(initialState, { forceUndirected: true });
    const rotation = rotationFromAdjacency(graph);
    return buildHalfEdgeMesh(graph, rotation);
  })();
  const [state, setState] = useState<GraphState>(() => initialState);
  const [mesh, setMesh] = useState<HalfEdgeMesh | null>(() => initialMesh);
  const [selectedFace, setSelectedFace] = useState<number | null>(() => (initialMesh ? 0 : null));
  const [selectedHalfEdge, setSelectedHalfEdge] = useState<number | null>(() => (initialMesh ? 0 : null));
  const [computedSig, setComputedSig] = useState<string | null>(() => (initialMesh ? initialSig : null));

  const currentSig = useMemo(() => graphSignature(state), [state]);
  const isStale = computedSig !== null && computedSig !== currentSig;

  const buildMesh = useCallback(() => {
    const graph = toTopoGraph(state, { forceUndirected: true });
    const rotation = rotationFromAdjacency(graph);
    const built = buildHalfEdgeMesh(graph, rotation);
    setMesh(built);
    setSelectedFace(0);
    setSelectedHalfEdge(0);
    setComputedSig(currentSig);
  }, [currentSig, state]);
  const handleStateChange = (next: GraphState) => {
    setState(next);
  };

  const highlightedEdges = useMemo(() => {
    if (!mesh || selectedFace === null) return new Set<number>();
    const edges = mesh.faces[selectedFace]?.map((h: number) => mesh.edge[h]) ?? [];
    return new Set(edges);
  }, [mesh, selectedFace]);

  return (
    <DemoScaffold
      title="Embedding"
      subtitle="Compile rotation systems into half-edge structures and enumerate faces."
      expectations={demoExpectations.embedding}
      embed={query.embed}
      ready={Boolean(mesh)}
      status={<Badge variant="secondary">{mesh ? 'Mesh ready' : 'No mesh'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={handleStateChange} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={buildMesh}>Build half-edge</Button>
          </div>
          {mesh ? (
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>Faces: {mesh.faces.length}</div>
              <div className="flex flex-wrap gap-2">
                {mesh.faces.map((_: unknown, idx: number) => (
                  <Button
                    key={idx}
                    size="sm"
                    variant={selectedFace === idx ? 'default' : 'outline'}
                    onClick={() => setSelectedFace(idx)}
                  >
                    Face {idx}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {mesh.origin.map((_: number, idx: number) => (
                  <Button
                    key={idx}
                    size="sm"
                    variant={selectedHalfEdge === idx ? 'secondary' : 'outline'}
                    onClick={() => setSelectedHalfEdge(idx)}
                  >
                    h{idx}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={buildMesh} />
          <SvgViewport
            nodes={state.nodes}
            edges={edgePathsFromState(state)}
            highlightedEdges={highlightedEdges}
            onNodeMove={(id, dx, dy) => {
              setState((prev) => ({
                ...prev,
                nodes: prev.nodes.map((node) =>
                  node.id === id ? { ...node, x: node.x + dx, y: node.y + dy } : node,
                ),
              }));
            }}
          />
        </div>
      }
      inspector={
        <JsonInspector
          data={
            mesh
              ? {
                  halfEdges: mesh.halfEdgeCount,
                  faces: mesh.faces.map((cycle: number[]) => cycle.map((h) => mesh.origin[h])),
                  selectedHalfEdge: selectedHalfEdge !== null ? {
                    id: selectedHalfEdge,
                    origin: mesh.origin[selectedHalfEdge],
                    twin: mesh.twin[selectedHalfEdge],
                    next: mesh.next[selectedHalfEdge],
                    face: mesh.face[selectedHalfEdge],
                  } : null,
                }
              : { status: 'pending' }
          }
        />
      }
    />
  );
}
