import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { AutoComputeToggle } from '@/components/demo/AutoComputeToggle';
import { RecomputeBanner } from '@/components/demo/RecomputeBanner';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { demoExpectations } from '@/data/demo-expectations';
import { createGraphState } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { useAutoCompute } from '@/lib/useAutoCompute';
import { minCostFlow, type FlowResult } from '@khalidsaidi/topoloom/flow';

type FlowPreset = {
  nodeCount: number;
  demands: number[];
  arcs: Array<{ from: number; to: number; lower?: number; upper: number; cost: number }>;
};

const presets: Record<string, FlowPreset> = {
  simple: {
    nodeCount: 3,
    demands: [5, 0, -5],
    arcs: [
      { from: 0, to: 1, upper: 5, cost: 1 },
      { from: 1, to: 2, upper: 5, cost: 1 },
      { from: 0, to: 2, upper: 5, cost: 2 },
    ],
  },
  lowerBounds: {
    nodeCount: 2,
    demands: [3, -3],
    arcs: [{ from: 0, to: 1, lower: 1, upper: 5, cost: 1 }],
  },
};

const toGraphState = (network: FlowPreset): GraphState => {
  const nodes = Array.from({ length: network.nodeCount }, (_, i) => ({ id: i, x: i * 60 - 60, y: 0 }));
  const edges = network.arcs.map((arc) => ({ source: arc.from, target: arc.to }));
  return createGraphState(nodes, edges, true);
};

export function MinCostFlowDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = query.preset && query.preset in presets ? query.preset : 'simple';
  const initialNetwork = presets[presetKey as keyof typeof presets] ?? presets.simple;
  const initialSig = JSON.stringify(initialNetwork);
  const initialResult = query.autorun ? minCostFlow(initialNetwork) : null;
  const [network, setNetwork] = useState<FlowPreset>(() => initialNetwork);
  const [result, setResult] = useState<FlowResult | null>(() => initialResult);
  const [computedSig, setComputedSig] = useState<string | null>(() => (initialResult ? initialSig : null));
  const autoState = useAutoCompute('topoloom:auto:min-cost-flow', query.autorun, {
    size: network.nodeCount + network.arcs.length,
    maxSize: 120,
  });

  const currentSig = useMemo(() => JSON.stringify(network), [network]);
  const isStale = computedSig !== null && computedSig !== currentSig;
  const shouldAutoRun = autoState.value && !autoState.disabled && (computedSig === null || isStale);

  const run = useCallback(() => {
    const res = minCostFlow(network);
    setResult(res);
    setComputedSig(currentSig);
  }, [currentSig, network]);

  useEffect(() => {
    if (!shouldAutoRun) return;
    const handle = window.setTimeout(() => run(), 150);
    return () => window.clearTimeout(handle);
  }, [run, shouldAutoRun]);

  const handlePreset = (next: FlowPreset) => {
    setNetwork(next);
  };

  const graphState = useMemo(() => toGraphState(network), [network]);

  return (
    <DemoScaffold
      title="Min-cost flow"
      subtitle="Solve network flow instances and inspect costs, potentials, and reduced costs."
      expectations={demoExpectations.minCostFlow}
      embed={query.embed}
      ready={Boolean(result)}
      status={<Badge variant="secondary">{result ? 'Solved' : 'Pending'}</Badge>}
      inputControls={
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => handlePreset(presets.simple)}>Load preset</Button>
            <Button size="sm" variant="outline" onClick={() => handlePreset(presets.lowerBounds)}>Lower bound preset</Button>
          </div>
          <AutoComputeToggle
            value={autoState.value}
            onChange={autoState.setValue}
            disabled={autoState.disabled}
            hint={autoState.disabled ? 'Auto recompute paused for large networks.' : undefined}
          />
          <Button size="sm" onClick={run}>Solve flow</Button>
        </div>
      }
      outputOverlay={
        <div className="space-y-3">
          <RecomputeBanner visible={isStale} onRecompute={run} />
          <SvgViewport
            nodes={graphState.nodes}
            edges={edgePathsFromState(graphState)}
          />
        </div>
      }
      inspector={<JsonInspector data={result ?? network} />}
    />
  );
}
