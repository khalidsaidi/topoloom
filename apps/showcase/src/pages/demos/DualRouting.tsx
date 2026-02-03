import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { demoExpectations } from '@/data/demo-expectations';
import { presets, resolvePreset, toTopoGraph, type PresetKey } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';
import { routeEdgeFixedEmbedding } from '@khalidsaidi/topoloom/dual';

export function DualRoutingDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'grid' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialU = initialState.nodes[0]?.id ?? 0;
  const initialV = initialState.nodes[initialState.nodes.length - 1]?.id ?? initialU;
  const computeRoute = (graphState: GraphState, from: number, to: number) => {
    const graph = toTopoGraph(graphState);
    const planarity = testPlanarity(graph);
    if (!planarity.planar) {
      return { error: 'Graph is nonplanar' };
    }
    const mesh = buildHalfEdgeMesh(graph, planarity.embedding);
    const route = routeEdgeFixedEmbedding(mesh, from, to);
    if (!route) {
      return { error: 'No dual route found for the selected vertices.' };
    }
    return route;
  };
  const initialResult = query.autorun ? computeRoute(initialState, initialU, initialV) : null;
  const [state, setState] = useState<GraphState>(() => initialState);
  const [u, setU] = useState<number>(initialU);
  const [v, setV] = useState<number>(initialV);
  const [result, setResult] = useState<
    ReturnType<typeof routeEdgeFixedEmbedding> | { error: string } | null
  >(() => initialResult);
  const [highlighted, setHighlighted] = useState<Set<number>>(
    () => new Set((initialResult && 'crossedPrimalEdges' in initialResult ? initialResult.crossedPrimalEdges : []) ?? []),
  );

  const run = useCallback(() => {
    const route = computeRoute(state, u, v);
    setResult(route);
    setHighlighted(
      new Set('crossedPrimalEdges' in route ? route.crossedPrimalEdges ?? [] : []),
    );
  }, [state, u, v]);

  const handleStateChange = (next: GraphState) => {
    const ids = next.nodes.map((node) => node.id);
    const nextU = ids.includes(u) ? u : ids[0] ?? 0;
    const nextV = ids.includes(v) ? v : ids[ids.length - 1] ?? nextU;
    setState(next);
    setU(nextU);
    setV(nextV);
    setResult(null);
    setHighlighted(new Set());
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);

  return (
    <DemoScaffold
      title="Dual routing"
      subtitle="Route an insertion path between two vertices through the dual graph."
      expectations={demoExpectations.dualRouting}
      embed={query.embed}
      ready={Boolean(result)}
      status={<Badge variant="secondary">{result ? 'Routed' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={handleStateChange} />
          <div className="flex gap-2">
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              id="dual-source"
              name="dualSource"
              value={u}
              onChange={(event) => setU(Number(event.target.value))}
            >
              {state.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.id}</option>
              ))}
            </select>
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              id="dual-target"
              name="dualTarget"
              value={v}
              onChange={(event) => setV(Number(event.target.value))}
            >
              {state.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.id}</option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={run}>Compute dual path</Button>
        </div>
      }
      outputOverlay={
        <SvgViewport
          nodes={state.nodes}
          edges={edges}
          highlightedEdges={highlighted}
          onNodeMove={(id, dx, dy) => {
            setState((prev) => ({
              ...prev,
              nodes: prev.nodes.map((node) =>
                node.id === id ? { ...node, x: node.x + dx, y: node.y + dy } : node,
              ),
            }));
          }}
        />
      }
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
