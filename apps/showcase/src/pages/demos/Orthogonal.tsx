import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { StatsPanel } from '@/components/demo/StatsPanel';
import { demoExpectations } from '@/data/demo-expectations';
import { presets, toTopoGraph } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { orthogonalLayout, type LayoutResult, type EdgePath } from 'topoloom/layout';
import { buildHalfEdgeMesh, rotationFromAdjacency } from 'topoloom/embedding';
import { edgePathsFromState } from '@/components/demo/graph-utils';

export function OrthogonalDemo() {
  const [state, setState] = useState<GraphState>(presets.squareDiagonal);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const run = () => {
    const start = performance.now();
    setError(null);
    if (state.directed) {
      const message = 'Orthogonal layout currently supports undirected planar graphs only.';
      setLayout(null);
      setRuntimeMs(undefined);
      setError(message);
      toast.error(message);
      return;
    }
    try {
      const graph = toTopoGraph(state);
      const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
      const result = orthogonalLayout(mesh);
      setLayout(result);
      setRuntimeMs(Math.round(performance.now() - start));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Orthogonal layout failed.';
      setLayout(null);
      setRuntimeMs(Math.round(performance.now() - start));
      setError(message);
      toast.error(message);
    }
  };

  const nodes = useMemo(() => {
    if (!layout) return state.nodes;
    return state.nodes.map((node) => {
      const p = layout.positions.get(node.id);
      return p ? { ...node, x: p.x, y: p.y } : node;
    });
  }, [layout, state.nodes]);

  const previewEdges = useMemo<EdgePath[]>(() => edgePathsFromState(state), [state]);
  const edges = layout?.edges ?? previewEdges;
  const highlightedNodes = useMemo(
    () => (selectedNodeId === null ? undefined : new Set([selectedNodeId])),
    [selectedNodeId],
  );

  return (
    <DemoScaffold
      title="Orthogonal layout"
      subtitle="Run Tamassia-style orthogonalization and compaction to build grid drawings."
      expectations={demoExpectations.orthogonal}
      status={(
        <Badge variant={error ? 'destructive' : 'secondary'}>
          {error ? 'Error' : layout ? 'Drawn' : 'Pending'}
        </Badge>
      )}
      inputControls={
        <div className="space-y-4">
          <GraphEditor
            state={state}
            onChange={setState}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
          <Button size="sm" onClick={run}>Compute orthogonal rep</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
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
        </div>
      }
      inspector={<JsonInspector data={layout ?? { status: error ? 'error' : 'pending', message: error }} />}
    />
  );
}
