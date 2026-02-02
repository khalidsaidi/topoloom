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
import { spqrDecompose, flipSkeleton, permuteParallel, type SPQRTree } from 'topoloom/decomp';

export function SPQRDemo() {
  const [state, setState] = useState<GraphState>(presets.squareDiagonal);
  const [tree, setTree] = useState<SPQRTree | null>(null);
  const [embedding, setEmbedding] = useState<unknown>(null);

  const run = () => {
    const graph = toTopoGraph(state);
    const spqr = spqrDecompose(graph);
    setTree(spqr);
    setEmbedding(spqr.nodes[0] ? spqr.nodes[0].skeleton : null);
  };

  const flip = () => {
    if (!tree?.nodes?.length) return;
    const target = tree.nodes.find((node) => node.type === 'R') ?? tree.nodes[0];
    if (!target) return;
    setEmbedding(flipSkeleton(target));
  };

  const permute = () => {
    if (!tree?.nodes?.length) return;
    const target = tree.nodes.find((node) => node.type === 'P') ?? tree.nodes[0];
    if (!target) return;
    const edges = target.edgeKind
      .map((kind, idx) => (kind ? idx : -1))
      .filter((idx) => idx >= 0)
      .reverse();
    if (edges.length === 0) return;
    setEmbedding(permuteParallel(target, edges));
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);

  return (
    <DemoScaffold
      title="SPQR"
      subtitle="Decompose biconnected graphs into S/P/R/Q nodes and inspect skeletons."
      expectations={demoExpectations.spqr}
      status={<Badge variant="secondary">{tree ? 'Tree ready' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={run}>Build SPQR tree</Button>
            <Button size="sm" variant="outline" onClick={flip}>Flip skeleton</Button>
            <Button size="sm" variant="outline" onClick={permute}>Permute edges</Button>
          </div>
        </div>
      }
      outputOverlay={
        <SvgViewport
          nodes={state.nodes}
          edges={edges}
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
      inspector={<JsonInspector data={{ tree, embedding }} />}
    />
  );
}
