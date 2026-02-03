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
import { biconnectedComponents, buildBCTree, type BiconnectedResult, type BCTree } from '@khalidsaidi/topoloom/dfs';

export function BCTreeDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'squareDiagonal' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initial = (() => {
    if (!query.autorun) return null;
    const graph = toTopoGraph(initialState);
    const bccRes = biconnectedComponents(graph);
    const treeRes = buildBCTree(graph, bccRes);
    return { bcc: bccRes, tree: treeRes };
  })();
  const [state, setState] = useState<GraphState>(() => initialState);
  const [bcc, setBcc] = useState<BiconnectedResult | null>(() => initial?.bcc ?? null);
  const [tree, setTree] = useState<BCTree | null>(() => initial?.tree ?? null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(() => (initial ? 0 : null));

  const run = useCallback(() => {
    const graph = toTopoGraph(state);
    const bccRes = biconnectedComponents(graph);
    const treeRes = buildBCTree(graph, bccRes);
    setBcc(bccRes);
    setTree(treeRes);
    setSelectedBlock(0);
  }, [state]);
  const handleStateChange = (next: GraphState) => {
    setState(next);
    setBcc(null);
    setTree(null);
    setSelectedBlock(null);
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
          <GraphEditor state={state} onChange={handleStateChange} />
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
