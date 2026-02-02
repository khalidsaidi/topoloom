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
import { orthogonalLayout, type LayoutResult } from 'topoloom/layout';
import { buildHalfEdgeMesh, rotationFromAdjacency } from 'topoloom/embedding';

export function OrthogonalDemo() {
  const [state, setState] = useState<GraphState>(presets.squareDiagonal);
  const [layout, setLayout] = useState<LayoutResult | null>(null);

  const run = () => {
    const graph = toTopoGraph(state);
    const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
    const result = orthogonalLayout(mesh);
    setLayout(result);
  };

  const nodes = useMemo(() => {
    if (!layout) return state.nodes;
    return state.nodes.map((node) => {
      const p = layout.positions.get(node.id);
      return p ? { ...node, x: p.x, y: p.y } : node;
    });
  }, [layout, state.nodes]);

  return (
    <DemoScaffold
      title="Orthogonal layout"
      subtitle="Run Tamassia-style orthogonalization and compaction to build grid drawings."
      expectations={demoExpectations.orthogonal}
      status={<Badge variant="secondary">{layout ? 'Drawn' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
          <Button size="sm" onClick={run}>Compute orthogonal rep</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <SvgViewport nodes={nodes} edges={layout?.edges ?? []} />
          <StatsPanel bends={layout?.stats.bends} area={layout?.stats.area} crossings={layout?.stats.crossings} />
        </div>
      }
      inspector={<JsonInspector data={layout ?? { status: 'pending' }} />}
    />
  );
}
