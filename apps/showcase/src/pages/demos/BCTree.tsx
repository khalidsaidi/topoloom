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
import { biconnectedComponents, buildBCTree, type BiconnectedResult, type BCTree } from '@khalidsaidi/topoloom/dfs';

export function BCTreeDemo() {
  const [state, setState] = useState<GraphState>(presets.squareDiagonal);
  const [bcc, setBcc] = useState<BiconnectedResult | null>(null);
  const [tree, setTree] = useState<BCTree | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);

  const run = () => {
    const graph = toTopoGraph(state);
    const bccRes = biconnectedComponents(graph);
    const treeRes = buildBCTree(graph, bccRes);
    setBcc(bccRes);
    setTree(treeRes);
    setSelectedBlock(0);
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
      status={<Badge variant="secondary">{bcc ? 'Computed' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
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
        <SvgViewport
          nodes={state.nodes}
          edges={edgePathsFromState(state)}
          highlightedEdges={highlightedEdges}
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
      inspector={<JsonInspector data={tree ?? { status: 'pending' }} />}
    />
  );
}
