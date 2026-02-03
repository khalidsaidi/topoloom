import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { RecomputeBanner } from '@/components/demo/RecomputeBanner';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { StatsPanel } from '@/components/demo/StatsPanel';
import { demoExpectations } from '@/data/demo-expectations';
import { graphSignature, presets, resolvePreset, toTopoGraph, type PresetKey } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { testPlanarity, type PlanarityResult } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';

export function PlanarityDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'k33' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialSig = graphSignature(initialState);

  const computePlanarity = (graphState: GraphState) => {
    const graph = toTopoGraph(graphState, { forceUndirected: true });
    const res = testPlanarity(graph);
    if (res.planar) {
      const mesh = buildHalfEdgeMesh(graph, res.embedding);
      return { result: { ...res, faces: mesh.faces.length }, witness: new Set<number>() };
    }
    return { result: res, witness: new Set(res.witness.edges) };
  };

  const initial = query.autorun ? computePlanarity(initialState) : null;
  const [state, setState] = useState<GraphState>(() => initialState);
  const [result, setResult] = useState<(PlanarityResult & { faces?: number }) | null>(
    () => initial?.result ?? null,
  );
  const [witnessEdges, setWitnessEdges] = useState<Set<number>>(
    () => initial?.witness ?? new Set(),
  );
  const [computedSig, setComputedSig] = useState<string | null>(() =>
    initial ? initialSig : null,
  );

  const currentSig = useMemo(() => graphSignature(state), [state]);
  const isStale = computedSig !== null && computedSig !== currentSig;

  const runPlanarity = useCallback(() => {
    const next = computePlanarity(state);
    setResult(next.result);
    setWitnessEdges(next.witness);
    setComputedSig(currentSig);
  }, [currentSig, state]);

  const handleStateChange = (next: GraphState) => {
    setState(next);
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);
  const nodes = useMemo(() => state.nodes, [state.nodes]);

  return (
    <DemoScaffold
      title="Planarity"
      subtitle="Test planarity, return a rotation system, or surface a Kuratowski witness for debugging."
      expectations={demoExpectations.planarity}
      embed={query.embed}
      ready={Boolean(result)}
      status={
        <Badge variant="secondary">
          {result ? (result.planar ? 'Planar' : 'Not planar') : 'Pending'}
        </Badge>
      }
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={handleStateChange} />
          <Button size="sm" onClick={runPlanarity}>Run planarity test</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={runPlanarity} />
          <SvgViewport
            nodes={nodes}
            edges={edges}
            highlightedEdges={witnessEdges}
            onNodeMove={(id, dx, dy) => {
              setState((prev) => ({
                ...prev,
                nodes: prev.nodes.map((node) =>
                  node.id === id ? { ...node, x: node.x + dx, y: node.y + dy } : node,
                ),
              }));
            }}
          />
          <StatsPanel
            bends={0}
            area={Math.round(result && result.planar ? result.faces ?? 0 : 0)}
            crossings={witnessEdges.size}
          />
        </div>
      }
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
