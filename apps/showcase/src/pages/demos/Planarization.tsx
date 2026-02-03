import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { AutoComputeToggle } from '@/components/demo/AutoComputeToggle';
import { RecomputeBanner } from '@/components/demo/RecomputeBanner';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { StatsPanel } from '@/components/demo/StatsPanel';
import { demoExpectations } from '@/data/demo-expectations';
import { graphSignature, presets, resolvePreset, toTopoGraph, type PresetKey } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { useAutoCompute } from '@/lib/useAutoCompute';
import { planarizationLayout, type PlanarizationResult } from '@khalidsaidi/topoloom/layout';

export function PlanarizationDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'k5' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialSig = graphSignature(initialState);
  const initialResult = query.autorun ? planarizationLayout(toTopoGraph(initialState, { forceUndirected: true })) : null;
  const [state, setState] = useState<GraphState>(() => initialState);
  const [result, setResult] = useState<PlanarizationResult | null>(() => initialResult);
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(undefined);
  const [computedSig, setComputedSig] = useState<string | null>(() => (initialResult ? initialSig : null));
  const autoState = useAutoCompute('topoloom:auto:planarization', query.autorun, {
    size: state.nodes.length + state.edges.length,
    maxSize: 120,
  });

  const currentSig = useMemo(() => graphSignature(state), [state]);
  const isStale = computedSig !== null && computedSig !== currentSig;
  const shouldAutoRun = autoState.value && !autoState.disabled && (computedSig === null || isStale);
  const showComputed = Boolean(result) && !isStale;

  const run = useCallback(() => {
    const start = performance.now();
    const graph = toTopoGraph(state, { forceUndirected: true });
    const layout = planarizationLayout(graph);
    setResult(layout);
    setRuntimeMs(Math.round(performance.now() - start));
    setComputedSig(currentSig);
  }, [currentSig, state]);

  useEffect(() => {
    if (!shouldAutoRun) return;
    const handle = window.setTimeout(() => run(), 200);
    return () => window.clearTimeout(handle);
  }, [run, shouldAutoRun]);
  const handleStateChange = (next: GraphState) => {
    setState(next);
  };

  const previewEdges = useMemo(() => edgePathsFromState(state), [state]);
  const baseEdges = useMemo(() => result?.layout?.edges ?? [], [result]);
  const remainingEdges = useMemo(() => {
    if (!result) return [];
    const remainingIds = new Set(result.remainingEdges);
    return edgePathsFromState(state).filter((edge) => remainingIds.has(edge.edge));
  }, [result, state]);

  const nodes = useMemo(() => {
    if (!showComputed || !result) return state.nodes;
    return state.nodes.map((node) => {
      const pos = result.layout.positions.get(node.id);
      return pos ? { ...node, x: pos.x, y: pos.y } : node;
    });
  }, [result, showComputed, state.nodes]);

  return (
    <DemoScaffold
      title="Planarization pipeline"
      subtitle="Insert edges through the dual, add dummy crossings, and run planar layout."
      expectations={demoExpectations.planarization}
      embed={query.embed}
      ready={Boolean(result)}
      status={<Badge variant="secondary">{result ? 'Done' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor
            state={state}
            onChange={handleStateChange}
            allowDirected={false}
            directedHint="This demo uses undirected planar inputs."
          />
          <AutoComputeToggle
            value={autoState.value}
            onChange={autoState.setValue}
            disabled={autoState.disabled}
            hint={autoState.disabled ? 'Auto recompute paused for large graphs.' : undefined}
          />
          <Button size="sm" onClick={run}>Run planarization</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={run} />
          <SvgViewport
            nodes={nodes}
            edges={showComputed && result ? [...baseEdges, ...remainingEdges] : previewEdges}
            highlightedEdges={showComputed ? new Set(result?.remainingEdges ?? []) : undefined}
          />
          <StatsPanel crossings={result?.remainingEdges?.length ?? 0} runtimeMs={runtimeMs} />
        </div>
      }
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
