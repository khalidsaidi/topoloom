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
import { biconnectedComponents, buildBCTree, type BiconnectedResult, type BCTree } from '@khalidsaidi/topoloom/dfs';

export function BCTreeDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'squareDiagonal' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialSig = graphSignature(initialState);
  const initial = (() => {
    if (!query.autorun) return null;
    const graph = toTopoGraph(initialState, { forceUndirected: true });
    const bccRes = biconnectedComponents(graph);
    const treeRes = buildBCTree(graph, bccRes);
    return { bcc: bccRes, tree: treeRes };
  })();
  const [state, setState] = useState<GraphState>(() => initialState);
  const [bcc, setBcc] = useState<BiconnectedResult | null>(() => initial?.bcc ?? null);
  const [tree, setTree] = useState<BCTree | null>(() => initial?.tree ?? null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(() => (initial ? 0 : null));
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(undefined);
  const [computedSig, setComputedSig] = useState<string | null>(() => (initial ? initialSig : null));
  const autoState = useAutoCompute('topoloom:auto:bc-tree', query.autorun, {
    size: state.nodes.length + state.edges.length,
    maxSize: 150,
  });

  const currentSig = useMemo(() => graphSignature(state), [state]);
  const isStale = computedSig !== null && computedSig !== currentSig;
  const shouldAutoRun = autoState.value && !autoState.disabled && (computedSig === null || isStale);

  const run = useCallback(() => {
    const start = performance.now();
    const graph = toTopoGraph(state, { forceUndirected: true });
    const bccRes = biconnectedComponents(graph);
    const treeRes = buildBCTree(graph, bccRes);
    setBcc(bccRes);
    setTree(treeRes);
    setSelectedBlock(0);
    setRuntimeMs(Math.round(performance.now() - start));
    setComputedSig(currentSig);
  }, [currentSig, state]);

  useEffect(() => {
    if (!shouldAutoRun) return;
    const handle = window.setTimeout(() => run(), 150);
    return () => window.clearTimeout(handle);
  }, [run, shouldAutoRun]);
  const handleStateChange = (next: GraphState) => {
    setState(next);
  };

  const highlightedEdges = useMemo(() => {
    if (!bcc || selectedBlock === null) return new Set<number>();
    return new Set(bcc.blocks[selectedBlock] ?? []);
  }, [bcc, selectedBlock]);

  return (
    <DemoScaffold
      title="BC-Tree"
      subtitle="Visualize biconnected blocks and articulation vertices as a bipartite tree."
      expectations={demoExpectations.bcTree}
      embed={query.embed}
      ready={Boolean(bcc)}
      status={<Badge variant="secondary">{bcc ? 'Computed' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor
            state={state}
            onChange={handleStateChange}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            allowDirected
            directedHint="Directions are ignored for biconnected decomposition."
          />
          <AutoComputeToggle
            value={autoState.value}
            onChange={autoState.setValue}
            disabled={autoState.disabled}
            hint={autoState.disabled ? 'Auto recompute paused for large graphs.' : undefined}
          />
          <Button size="sm" onClick={run}>Compute BC-tree</Button>
          {bcc ? (
            <div className="flex flex-wrap gap-2">
              {bcc.blocks.map((_: unknown, idx: number) => (
                <Button
                  key={idx}
                  size="sm"
                  variant={selectedBlock === idx ? 'default' : 'outline'}
                  onClick={() => setSelectedBlock(idx)}
                >
                  Block {idx}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={run} />
          <StatsPanel items={[{ label: 'Runtime (ms)', value: runtimeMs }]} />
          <SvgViewport
            nodes={state.nodes}
            edges={edgePathsFromState(state)}
            highlightedEdges={highlightedEdges}
            highlightedNodes={selectedNodeId !== null ? new Set([selectedNodeId]) : undefined}
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
        </div>
      }
      inspector={<JsonInspector data={tree ?? { status: 'pending' }} />}
    />
  );
}
