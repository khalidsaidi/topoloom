import { useMemo, useState } from 'react';

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
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { testPlanarity, type PlanarityResult } from 'topoloom/planarity';
import { buildHalfEdgeMesh } from 'topoloom/embedding';

export function PlanarityDemo() {
  const [state, setState] = useState<GraphState>(presets.triangle);
  const [result, setResult] = useState<(PlanarityResult & { faces?: number }) | null>(null);
  const [witnessEdges, setWitnessEdges] = useState<Set<number>>(new Set());

  const runPlanarity = () => {
    const graph = toTopoGraph(state);
    const res = testPlanarity(graph);
    if (res.planar) {
      const mesh = buildHalfEdgeMesh(graph, res.embedding);
      setResult({ ...res, faces: mesh.faces.length });
      setWitnessEdges(new Set());
    } else {
      setResult(res);
      setWitnessEdges(new Set(res.witness.edges));
    }
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);
  const nodes = useMemo(() => state.nodes, [state.nodes]);

  return (
    <DemoScaffold
      title="Planarity"
      subtitle="Test planarity, return a rotation system, or surface a Kuratowski witness for debugging."
      expectations={demoExpectations.planarity}
      status={
        <Badge variant="secondary">
          {result ? (result.planar ? 'Planar' : 'Not planar') : 'Pending'}
        </Badge>
      }
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
          <Button size="sm" onClick={runPlanarity}>Run planarity test</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
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
