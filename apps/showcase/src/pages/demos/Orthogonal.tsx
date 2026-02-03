import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

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
import { orthogonalLayout, planarizationLayout, type LayoutResult, type EdgePath } from '@khalidsaidi/topoloom/layout';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { useAutoCompute } from '@/lib/useAutoCompute';

export function OrthogonalDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'cube' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialSig = graphSignature(initialState);
  const computeLayout = (graphState: GraphState) => {
    try {
      const graph = toTopoGraph(graphState, { forceUndirected: true });
      const planarity = testPlanarity(graph, { allowSelfLoops: 'ignore' });
      if (planarity.planar) {
        const mesh = buildHalfEdgeMesh(graph, planarity.embedding);
        const result = orthogonalLayout(mesh);
        return {
          layout: result,
          error: null,
          note: planarity.ignoredSelfLoops?.length
            ? `Ignored ${planarity.ignoredSelfLoops.length} self-loop(s) for orthogonal layout.`
            : null,
        };
      }
      const planarized = planarizationLayout(graph, { mode: 'orthogonal' });
      return {
        layout: planarized.layout,
        error: null,
        note: `Nonplanar input: planarized ${planarized.remainingEdges.length} edge(s) before orthogonal routing.`,
      };
    } catch (err) {
      return {
        layout: null,
        error: err instanceof Error ? err.message : 'Orthogonal layout failed.',
        note: null,
      };
    }
  };
  const initialComputed = query.autorun ? computeLayout(initialState) : { layout: null, error: null };
  const [state, setState] = useState<GraphState>(() => initialState);
  const [layout, setLayout] = useState<LayoutResult | null>(() => initialComputed.layout);
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(() => initialComputed.error);
  const [note, setNote] = useState<string | null>(() => (initialComputed as { note?: string | null }).note ?? null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [computedSig, setComputedSig] = useState<string | null>(() => (initialComputed.layout || initialComputed.error ? initialSig : null));
  const autoState = useAutoCompute('topoloom:auto:orthogonal', query.autorun, {
    size: state.nodes.length + state.edges.length,
    maxSize: 120,
  });

  const currentSig = useMemo(() => graphSignature(state), [state]);
  const isStale = computedSig !== null && computedSig !== currentSig;
  const shouldAutoRun = autoState.value && !autoState.disabled && (computedSig === null || isStale);
  const showComputed = Boolean(layout) && !isStale;

  const run = useCallback(() => {
    const start = performance.now();
    const next = computeLayout(state);
    setLayout(next.layout);
    setRuntimeMs(Math.round(performance.now() - start));
    setError(next.error);
    setNote((next as { note?: string | null }).note ?? null);
    if (next.error) toast.error(next.error);
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

  const nodes = useMemo(() => {
    if (!showComputed || !layout) return state.nodes;
    return state.nodes.map((node) => {
      const p = layout.positions.get(node.id);
      return p ? { ...node, x: p.x, y: p.y } : node;
    });
  }, [layout, showComputed, state.nodes]);

  const previewEdges = useMemo<EdgePath[]>(() => edgePathsFromState(state), [state]);
  const edges = showComputed && layout ? layout.edges : previewEdges;
  const highlightedNodes = useMemo(
    () => (selectedNodeId === null ? undefined : new Set([selectedNodeId])),
    [selectedNodeId],
  );

  return (
    <DemoScaffold
      title="Orthogonal layout"
      subtitle="Run Tamassia-style orthogonalization and compaction to build grid drawings."
      expectations={demoExpectations.orthogonal}
      embed={query.embed}
      ready={Boolean(layout) || Boolean(error)}
      status={(
        <Badge variant={error ? 'destructive' : 'secondary'}>
          {error ? 'Error' : layout ? 'Drawn' : 'Pending'}
        </Badge>
      )}
      inputControls={
        <div className="space-y-4">
          <GraphEditor
            state={state}
            onChange={handleStateChange}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            allowDirected
            directedHint="Edge directions are ignored for orthogonal geometry; nonplanar inputs are planarized."
          />
          <AutoComputeToggle
            value={autoState.value}
            onChange={autoState.setValue}
            disabled={autoState.disabled}
            hint={autoState.disabled ? 'Auto recompute paused for large graphs.' : undefined}
          />
          <Button size="sm" onClick={run}>Compute orthogonal rep</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={run} />
          <StatsPanel
            bends={layout?.stats.bends}
            area={layout?.stats.area}
            crossings={layout?.stats.crossings}
            runtimeMs={runtimeMs}
          />
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <SvgViewport
            nodes={nodes}
            edges={edges}
            highlightedNodes={highlightedNodes}
            onNodeClick={(id) => setSelectedNodeId((prev) => (prev === id ? null : id))}
            onNodeMove={(id, dx, dy) => {
              setState((prev) => ({
                ...prev,
                nodes: prev.nodes.map((node) =>
                  node.id === id ? { ...node, x: node.x + dx, y: node.y + dy } : node,
                ),
              }));
            }}
          />
          {note ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {note}
            </div>
          ) : null}
        </div>
      }
      inspector={<JsonInspector data={layout ?? { status: error ? 'error' : 'pending', message: error }} />}
    />
  );
}
