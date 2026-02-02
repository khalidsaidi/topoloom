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
import { stNumbering, bipolarOrientation, type BipolarOrientation, type StNumbering } from 'topoloom/order';
import { buildHalfEdgeMesh, rotationFromAdjacency } from 'topoloom/embedding';

export function StBipolarDemo() {
  const [state, setState] = useState<GraphState>(presets.squareDiagonal);
  const [s, setS] = useState<number>(0);
  const [t, setT] = useState<number>(1);
  const [result, setResult] = useState<{ numbering: StNumbering; bipolar: BipolarOrientation } | null>(null);

  const run = () => {
    const graph = toTopoGraph(state);
    const numbering = stNumbering(graph, s, t);
    const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
    const bipolar = bipolarOrientation(mesh, s, t);
    setResult({ numbering, bipolar });
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);

  return (
    <DemoScaffold
      title="st-numbering + bipolar orientation"
      subtitle="Pick terminals s,t and generate the ordering and acyclic orientation."
      expectations={demoExpectations.stBipolar}
      status={<Badge variant="secondary">{result ? 'Computed' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
          <div className="flex gap-2">
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              id="st-source"
              name="stSource"
              value={s}
              onChange={(event) => setS(Number(event.target.value))}
            >
              {state.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.id}</option>
              ))}
            </select>
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              id="st-target"
              name="stTarget"
              value={t}
              onChange={(event) => setT(Number(event.target.value))}
            >
              {state.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.id}</option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={run}>Compute st + bipolar</Button>
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
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
