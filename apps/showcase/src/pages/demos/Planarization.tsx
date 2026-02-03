import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { StatsPanel } from '@/components/demo/StatsPanel';
import { demoExpectations } from '@/data/demo-expectations';
import { presets, resolvePreset, toTopoGraph, type PresetKey } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { planarizationLayout, type PlanarizationResult } from '@khalidsaidi/topoloom/layout';

export function PlanarizationDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'k5' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialResult = query.autorun ? planarizationLayout(toTopoGraph(initialState)) : null;
  const [state, setState] = useState<GraphState>(() => initialState);
  const [result, setResult] = useState<PlanarizationResult | null>(() => initialResult);

  const run = useCallback(() => {
    const graph = toTopoGraph(state);
    const layout = planarizationLayout(graph);
    setResult(layout);
  }, [state]);
  const handleStateChange = (next: GraphState) => {
    setState(next);
    setResult(null);
  };

  const previewEdges = useMemo(() => edgePathsFromState(state), [state]);
  const baseEdges = useMemo(() => result?.layout?.edges ?? [], [result]);
  const remainingEdges = useMemo(() => {
    if (!result) return [];
    const remainingIds = new Set(result.remainingEdges);
    return edgePathsFromState(state).filter((edge) => remainingIds.has(edge.edge));
  }, [result, state]);

  const nodes = useMemo(() => {
    if (!result) return state.nodes;
    return state.nodes.map((node) => {
      const pos = result.layout.positions.get(node.id);
      return pos ? { ...node, x: pos.x, y: pos.y } : node;
    });
  }, [result, state.nodes]);

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
          <GraphEditor state={state} onChange={handleStateChange} />
          <Button size="sm" onClick={run}>Run planarization</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <SvgViewport
            nodes={nodes}
            edges={result ? [...baseEdges, ...remainingEdges] : previewEdges}
            highlightedEdges={new Set(result?.remainingEdges ?? [])}
          />
          <StatsPanel crossings={result?.remainingEdges?.length ?? 0} />
        </div>
      }
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
