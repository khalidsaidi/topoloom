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
import { stNumbering, bipolarOrientation, type BipolarOrientation, type StNumbering } from '@khalidsaidi/topoloom/order';
import { buildHalfEdgeMesh, rotationFromAdjacency } from '@khalidsaidi/topoloom/embedding';

export function StBipolarDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'k4' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialS = initialState.nodes[0]?.id ?? 0;
  const initialT = initialState.nodes[initialState.nodes.length - 1]?.id ?? initialS;
  const initialSig = graphSignature(initialState);
  const initialResult = (() => {
    if (!query.autorun) return null;
    const graph = toTopoGraph(initialState, { forceUndirected: true });
    const numbering = stNumbering(graph, initialS, initialT);
    const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
    const bipolar = bipolarOrientation(mesh, initialS, initialT);
    return { numbering, bipolar };
  })();
  const [state, setState] = useState<GraphState>(() => initialState);
  const [s, setS] = useState<number>(initialS);
  const [t, setT] = useState<number>(initialT);
  const [result, setResult] = useState<{ numbering: StNumbering; bipolar: BipolarOrientation } | null>(
    () => initialResult,
  );
  const [computedSig, setComputedSig] = useState<string | null>(() => (initialResult ? initialSig : null));

  const currentSig = useMemo(() => `${graphSignature(state)}|${s}:${t}`, [state, s, t]);
  const isStale = computedSig !== null && computedSig !== currentSig;

  const run = useCallback(() => {
    const graph = toTopoGraph(state, { forceUndirected: true });
    const numbering = stNumbering(graph, s, t);
    const mesh = buildHalfEdgeMesh(graph, rotationFromAdjacency(graph));
    const bipolar = bipolarOrientation(mesh, s, t);
    setResult({ numbering, bipolar });
    setComputedSig(currentSig);
  }, [currentSig, s, state, t]);
  const handleStateChange = (next: GraphState) => {
    const ids = next.nodes.map((node) => node.id);
    const nextS = ids.includes(s) ? s : ids[0] ?? 0;
    const nextT = ids.includes(t) ? t : ids[ids.length - 1] ?? nextS;
    setState(next);
    setS(nextS);
    setT(nextT);
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);

  return (
    <DemoScaffold
      title="st-numbering + bipolar orientation"
      subtitle="Pick terminals s,t and generate the ordering and acyclic orientation."
      expectations={demoExpectations.stBipolar}
      embed={query.embed}
      ready={Boolean(result)}
      status={<Badge variant="secondary">{result ? 'Computed' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphEditor state={state} onChange={handleStateChange} />
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
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={run} />
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
        </div>
      }
      inspector={<JsonInspector data={result ?? { status: 'pending' }} />}
    />
  );
}
