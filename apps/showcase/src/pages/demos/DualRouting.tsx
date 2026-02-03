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
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';
import { routeEdgeFixedEmbedding } from '@khalidsaidi/topoloom/dual';
import { GraphBuilder, type Graph, type EdgeId } from '@khalidsaidi/topoloom/graph';

export function DualRoutingDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'grid' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialU = initialState.nodes[0]?.id ?? 0;
  const initialV = initialState.nodes[initialState.nodes.length - 1]?.id ?? initialU;
  const initialSig = graphSignature(initialState);

  const buildPlanarSubgraph = useCallback((graph: Graph) => {
    const kept: Array<{ u: number; v: number; id: EdgeId }> = [];
    const dropped: EdgeId[] = [];
    for (const edge of graph.edges()) {
      const builder = new GraphBuilder();
      for (const v of graph.vertices()) builder.addVertex(graph.label(v));
      for (const keptEdge of kept) builder.addEdge(keptEdge.u, keptEdge.v, false);
      builder.addEdge(edge.u, edge.v, false);
      const test = testPlanarity(builder.build());
      if (test.planar) {
        kept.push({ u: edge.u, v: edge.v, id: edge.id });
      } else {
        dropped.push(edge.id);
      }
    }
    const baseBuilder = new GraphBuilder();
    for (const v of graph.vertices()) baseBuilder.addVertex(graph.label(v));
    for (const keptEdge of kept) baseBuilder.addEdge(keptEdge.u, keptEdge.v, false);
    return { base: baseBuilder.build(), dropped };
  }, []);

  const computeRoute = useCallback((graphState: GraphState, from: number, to: number) => {
    const graph = toTopoGraph(graphState, { forceUndirected: true });
    let planarity = testPlanarity(graph);
    let routingGraph = graph;
    let repairNote: string | null = null;
    if (!planarity.planar) {
      const { base, dropped } = buildPlanarSubgraph(graph);
      planarity = testPlanarity(base);
      if (!planarity.planar) {
        return { error: 'Unable to derive a planar embedding for routing.' };
      }
      routingGraph = base;
      repairNote = `Nonplanar input: routing on maximal planar subgraph (dropped ${dropped.length} edge(s)).`;
    }
    const mesh = buildHalfEdgeMesh(routingGraph, planarity.embedding);
    const route = routeEdgeFixedEmbedding(mesh, from, to);
    if (!route) {
      return { error: 'No dual route found for the selected vertices.' };
    }
    return repairNote ? { ...route, note: repairNote } : route;
  }, [buildPlanarSubgraph]);
  const initialResult = query.autorun ? computeRoute(initialState, initialU, initialV) : null;
  const [state, setState] = useState<GraphState>(() => initialState);
  const [u, setU] = useState<number>(initialU);
  const [v, setV] = useState<number>(initialV);
  const [result, setResult] = useState<
    (ReturnType<typeof routeEdgeFixedEmbedding> & { note?: string }) | { error: string } | null
  >(() => initialResult);
  const [highlighted, setHighlighted] = useState<Set<number>>(
    () => new Set((initialResult && 'crossedPrimalEdges' in initialResult ? initialResult.crossedPrimalEdges : []) ?? []),
  );
  const [computedSig, setComputedSig] = useState<string | null>(() => (initialResult ? initialSig : null));

  const currentSig = useMemo(() => `${graphSignature(state)}|${u}:${v}`, [state, u, v]);
  const isStale = computedSig !== null && computedSig !== currentSig;

  const run = useCallback(() => {
    const route = computeRoute(state, u, v);
    setResult(route);
    setHighlighted(
      new Set('crossedPrimalEdges' in route ? route.crossedPrimalEdges ?? [] : []),
    );
    setComputedSig(currentSig);
  }, [computeRoute, currentSig, state, u, v]);

  const handleStateChange = (next: GraphState) => {
    const ids = next.nodes.map((node) => node.id);
    const nextU = ids.includes(u) ? u : ids[0] ?? 0;
    const nextV = ids.includes(v) ? v : ids[ids.length - 1] ?? nextU;
    setState(next);
    setU(nextU);
    setV(nextV);
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
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={run} />
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
          {result && 'note' in result && result.note ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {result.note}
            </div>
          ) : null}
        </div>
      }
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
