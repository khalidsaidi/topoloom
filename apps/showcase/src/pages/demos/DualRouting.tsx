import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { demoExpectations } from '@/data/demo-expectations';
import { presets, toTopoGraph } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';
import { routeEdgeFixedEmbedding } from '@khalidsaidi/topoloom/dual';

export function DualRoutingDemo() {
  const [state, setState] = useState<GraphState>(presets.squareDiagonal);
  const [u, setU] = useState<number>(0);
  const [v, setV] = useState<number>(1);
  const [result, setResult] = useState<ReturnType<typeof routeEdgeFixedEmbedding> | { error: string } | null>(
    null,
  );
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());

  const run = () => {
    const graph = toTopoGraph(state);
    const planarity = testPlanarity(graph);
    if (!planarity.planar) {
      setResult({ error: 'Graph is nonplanar' });
      return;
    }
    const mesh = buildHalfEdgeMesh(graph, planarity.embedding);
    const route = routeEdgeFixedEmbedding(mesh, u, v);
    setResult(route);
    setHighlighted(new Set(route?.crossedPrimalEdges ?? []));
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);

  return (
    <DemoScaffold
      title="Dual routing"
      subtitle="Route an insertion path between two vertices through the dual graph."
      expectations={demoExpectations.dualRouting}
      status={<Badge variant="secondary">{result ? 'Routed' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
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
