import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GraphEditor } from '@/components/demo/GraphEditor';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { RecomputeBanner } from '@/components/demo/RecomputeBanner';
import { SvgViewport } from '@/components/demo/SvgViewport';
import { demoExpectations } from '@/data/demo-expectations';
import { graphSignature, presets, resolvePreset, toTopoGraph, type PresetKey } from '@/components/demo/graph-model';
import type { GraphNode, GraphState } from '@/components/demo/graph-model';
import { edgePathsFromState } from '@/components/demo/graph-utils';
import { readDemoQuery } from '@/lib/demoQuery';
import { spqrDecompose, flipSkeleton, permuteParallel, materializeEmbedding, type SPQRTree } from '@khalidsaidi/topoloom/decomp';
import { biconnectedComponents } from '@khalidsaidi/topoloom/dfs';
import { GraphBuilder, type Graph, type EdgeId } from '@khalidsaidi/topoloom/graph';

type Mode = 'BUILDING' | 'INSPECTING';
type LayoutMode = 'horizontal' | 'vertical' | 'stacked';

const STORAGE_KEY = 'topoloom:spqr-panel-ratio';
const DEFAULT_BUILD_RATIO = 0.35;
const DEFAULT_INSPECT_RATIO = 0.22;
const MIN_LEFT = 250;
const MIN_RIGHT = 400;
const MIN_TOP = 220;
const MIN_BOTTOM = 320;
const DIVIDER_SIZE = 8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getLayoutMode = (width: number): LayoutMode => {
  if (width < 768) return 'stacked';
  if (width < 1024) return 'vertical';
  return 'horizontal';
};

const buildTreeLayout = (tree: SPQRTree) => {
  if (!tree.nodes.length) return { nodes: [] as GraphNode[], edges: [] as { edge: number; points: { x: number; y: number }[] }[] };
  const adjacency = new Map<number, number[]>();
  tree.nodes.forEach((node) => adjacency.set(node.id, []));
  tree.edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  });

  const root = tree.nodes[0]?.id ?? 0;
  const visited = new Set<number>();
  const levels = new Map<number, number>();
  const order: number[] = [];
  const queue: number[] = [root];
  visited.add(root);
  levels.set(root, 0);

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) continue;
    order.push(cur);
    const neighbors = adjacency.get(cur) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        levels.set(next, (levels.get(cur) ?? 0) + 1);
        queue.push(next);
      }
    }
  }

  const grouped = new Map<number, number[]>();
  for (const nodeId of order) {
    const level = levels.get(nodeId) ?? 0;
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level)?.push(nodeId);
  }

  const nodes: GraphNode[] = [];
  const levelKeys = Array.from(grouped.keys()).sort((a, b) => a - b);
  const verticalGap = 60;
  const horizontalGap = 70;

  levelKeys.forEach((level) => {
    const ids = grouped.get(level) ?? [];
    ids.sort((a, b) => a - b);
    const width = (ids.length - 1) * horizontalGap;
    ids.forEach((id, idx) => {
      const node = tree.nodes.find((n) => n.id === id);
      const label = node ? `${node.type}${node.id}` : `N${id}`;
      nodes.push({
        id,
        label,
        x: idx * horizontalGap - width / 2,
        y: level * verticalGap - (levelKeys.length - 1) * verticalGap * 0.5,
      });
    });
  });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = tree.edges.map((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) {
      return { edge: edge.id, points: [] as { x: number; y: number }[] };
    }
    return {
      edge: edge.id,
      points: [
        { x: from.x, y: from.y },
        { x: to.x, y: to.y },
      ],
    };
  });

  return { nodes, edges };
};

export function SPQRDemo() {
  const { search } = useLocation();
  const query = readDemoQuery(search);
  const presetKey = resolvePreset(query.preset, 'squareDiagonal' satisfies PresetKey);
  const initialState = presets[presetKey];
  const initialSig = graphSignature(initialState);
  const buildBiconnectedSubgraph = useCallback((graph: Graph, edges: EdgeId[]) => {
    const vertices = new Set<number>();
    edges.forEach((edgeId) => {
      const edge = graph.edge(edgeId);
      vertices.add(edge.u);
      vertices.add(edge.v);
    });
    const builder = new GraphBuilder();
    const idMap = new Map<number, number>();
    Array.from(vertices.values()).sort((a, b) => a - b).forEach((v) => {
      idMap.set(v, builder.addVertex(graph.label(v)));
    });
    edges.forEach((edgeId) => {
      const edge = graph.edge(edgeId);
      const u = idMap.get(edge.u);
      const v = idMap.get(edge.v);
      if (u !== undefined && v !== undefined) {
        builder.addEdge(u, v, false);
      }
    });
    return builder.build();
  }, []);

  const computeSpqr = useCallback((graphState: GraphState) => {
    const graph = toTopoGraph(graphState, { forceUndirected: true });
    const bcc = biconnectedComponents(graph);
    let spqrGraph = graph;
    let note: string | null = null;
    if (bcc.blocks.length > 1 || bcc.articulationPoints.length > 0) {
      let bestBlock = bcc.blocks[0] ?? [];
      for (const block of bcc.blocks) {
        if (block.length > bestBlock.length) bestBlock = block;
      }
      spqrGraph = buildBiconnectedSubgraph(graph, bestBlock);
      note = `Input not biconnected: using largest block (${bestBlock.length} edge(s)).`;
    }
    return { tree: spqrDecompose(spqrGraph), note };
  }, [buildBiconnectedSubgraph]);

  const initialComputed = (() => {
    if (!query.autorun) return { tree: null, note: null };
    try {
      return computeSpqr(initialState);
    } catch {
      return { tree: null, note: null };
    }
  })();
  const initialTree = initialComputed.tree;
  const initialMode: Mode = initialTree ? 'INSPECTING' : 'BUILDING';
  const [activePreset, setActivePreset] = useState<PresetKey>(presetKey);
  const [state, setState] = useState<GraphState>(() => initialState);
  const [tree, setTree] = useState<SPQRTree | null>(() => initialTree);
  const [computedSig, setComputedSig] = useState<string | null>(() =>
    initialTree ? initialSig : null,
  );
  const [mode, setMode] = useState<Mode>(() => initialMode);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(
    () => initialTree?.nodes[0]?.id ?? null,
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [rotationOverride, setRotationOverride] = useState<Map<number, unknown>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(() => initialComputed.note);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() =>
    typeof window === 'undefined' ? 'horizontal' : getLayoutMode(window.innerWidth),
  );
  const [panelRatio, setPanelRatio] = useState(() => {
    if (typeof window === 'undefined') {
      return initialMode === 'INSPECTING' ? DEFAULT_INSPECT_RATIO : DEFAULT_BUILD_RATIO;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const value = stored ? Number.parseFloat(stored) : NaN;
    return Number.isFinite(value)
      ? clamp(value, 0.15, 0.85)
      : initialMode === 'INSPECTING'
        ? DEFAULT_INSPECT_RATIO
        : DEFAULT_BUILD_RATIO;
  });
  const [userResized, setUserResized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  });
  const [mobileView, setMobileView] = useState<'controls' | 'visual'>('controls');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const currentSig = useMemo(() => graphSignature(state), [state]);
  const isStale = computedSig !== null && computedSig !== currentSig;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const nextLayout = getLayoutMode(window.innerWidth);
      setLayoutMode(nextLayout);
      if (nextLayout === 'stacked') {
        setMobileView(mode === 'INSPECTING' ? 'visual' : 'controls');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, String(panelRatio));
  }, [panelRatio]);

  const updateRatio = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (layoutMode === 'horizontal') {
      const min = MIN_LEFT / rect.width;
      const max = 1 - MIN_RIGHT / rect.width;
      const next = min >= max ? 0.5 : clamp((clientX - rect.left) / rect.width, min, max);
      setPanelRatio(next);
    } else if (layoutMode === 'vertical') {
      const min = MIN_TOP / rect.height;
      const max = 1 - MIN_BOTTOM / rect.height;
      const next = min >= max ? 0.5 : clamp((clientY - rect.top) / rect.height, min, max);
      setPanelRatio(next);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      updateRatio(event.clientX, event.clientY);
      setUserResized(true);
    };
    const handleUp = () => {
      setDragging(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, layoutMode, updateRatio]);

  const run = useCallback(() => {
    try {
      const { tree: spqr, note } = computeSpqr(state);
      setTree(spqr);
      setSelectedNodeId(spqr.nodes[0]?.id ?? null);
      setSourceNote(note);
      setMode('INSPECTING');
      setComputedSig(currentSig);
      if (layoutMode === 'stacked') setMobileView('visual');
      setError(null);
      if (!userResized) setPanelRatio(DEFAULT_INSPECT_RATIO);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to build SPQR tree.';
      setError(message);
      toast.error(message);
    }
  }, [computeSpqr, layoutMode, state, userResized]);

  const applyPreset = useCallback((key: PresetKey) => {
    const preset = presets[key];
    setState({
      ...preset,
      directed: state.directed,
      edges: preset.edges.map((edge) => ({ ...edge, directed: state.directed })),
    });
    setActivePreset(key);
    setTree(null);
    setSelectedNodeId(null);
    setSourceNote(null);
    setRotationOverride(new Map());
    setExpandedNodes(new Set());
    setComputedSig(null);
    setMode('BUILDING');
    if (layoutMode === 'stacked') setMobileView('controls');
    setError(null);
    if (!userResized) setPanelRatio(DEFAULT_BUILD_RATIO);
  }, [layoutMode, state.directed, userResized]);

  const resetGraph = (key: PresetKey = 'squareDiagonal') => {
    applyPreset(key);
  };


  const selectedNode = useMemo(
    () => tree?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, tree],
  );

  const handleFlip = () => {
    if (!selectedNode) return;
    if (selectedNode.type !== 'R') {
      toast.error('Flip is only available for R nodes.');
      return;
    }
    const rotation = flipSkeleton(selectedNode);
    setRotationOverride((prev) => new Map(prev).set(selectedNode.id, rotation));
  };

  const handlePermute = () => {
    if (!selectedNode) return;
    if (selectedNode.type !== 'P') {
      toast.error('Permute is only available for P nodes.');
      return;
    }
    const edges = selectedNode.edgeKind
      .map((kind, idx) => (kind ? idx : -1))
      .filter((idx) => idx >= 0)
      .reverse();
    if (edges.length === 0) return;
    const rotation = permuteParallel(selectedNode, edges);
    setRotationOverride((prev) => new Map(prev).set(selectedNode.id, rotation));
  };

  const edges = useMemo(() => edgePathsFromState(state), [state]);
  const treeLayout = useMemo(() => (tree ? buildTreeLayout(tree) : { nodes: [], edges: [] }), [tree]);
  const highlightedNodes = useMemo(
    () => (selectedNodeId !== null ? new Set([selectedNodeId]) : new Set<number>()),
    [selectedNodeId],
  );
  const inspectorData = useMemo(() => {
    if (!tree) return { status: 'pending' };
    const node = selectedNode;
    const rotation = node ? rotationOverride.get(node.id) ?? materializeEmbedding(node) : null;
    return {
      tree,
      selectedNode: node,
      rotation,
      note: sourceNote,
    };
  }, [tree, selectedNode, rotationOverride, sourceNote]);
  const ready = Boolean(tree && tree.nodes.length);

  const gridStyle = useMemo(() => {
    if (layoutMode === 'horizontal') {
      return {
        gridTemplateColumns: `${panelRatio * 100}% ${DIVIDER_SIZE}px ${100 - panelRatio * 100}%`,
      } as CSSProperties;
    }
    if (layoutMode === 'vertical') {
      return {
        gridTemplateRows: `${panelRatio * 100}% ${DIVIDER_SIZE}px ${100 - panelRatio * 100}%`,
      } as CSSProperties;
    }
    return {};
  }, [layoutMode, panelRatio]);

  const dividerClass =
    layoutMode === 'vertical'
      ? 'h-2 w-full cursor-row-resize bg-border/50 transition-colors hover:bg-border'
      : 'h-full w-2 cursor-col-resize bg-border/50 transition-colors hover:bg-border';

  const renderControls = () => {
    if (mode === 'BUILDING') {
      return (
        <div className="space-y-4">
          <GraphEditor state={state} onChange={setState} />
          <Button size="sm" className="w-full" onClick={run}>
            Build SPQR tree
          </Button>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid gap-2">
          <div className="text-[11px] uppercase text-muted-foreground">Preset</div>
          <select
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            id="spqr-preset"
            name="spqrPreset"
            value={activePreset}
            onChange={(event) => resetGraph(event.target.value as PresetKey)}
          >
            <option value="triangle">Triangle</option>
            <option value="squareDiagonal">Square + diagonal</option>
            <option value="k4">K4</option>
            <option value="k5">K5</option>
            <option value="k33">K3,3</option>
            <option value="cube">Cube</option>
            <option value="grid">Grid 3x3</option>
            <option value="randomPlanar">Random planar</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Button size="sm" variant="outline" onClick={() => resetGraph()}>
            New graph
          </Button>
          <Button size="sm" className="w-full" onClick={run}>
            Build SPQR tree
          </Button>
        </div>
        <div className="grid gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleFlip}
            disabled={!selectedNode || selectedNode.type !== 'R'}
          >
            Flip skeleton
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePermute}
            disabled={!selectedNode || selectedNode.type !== 'P'}
          >
            Permute edges
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard
                .writeText(JSON.stringify(inspectorData, null, 2))
                .then(() => toast.success('SPQR JSON copied to clipboard'))
                .catch(() => toast.error('Unable to copy JSON'));
            }}
          >
            Export JSON
          </Button>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          {sourceNote ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
              {sourceNote}
            </div>
          ) : null}
          <div className="text-[11px] uppercase text-muted-foreground">Data inspector</div>
          <div className="mt-2 space-y-2">
            {tree ? (
              tree.nodes.map((node) => {
                const expanded = expandedNodes.has(node.id);
                return (
                  <div key={node.id} className="rounded-md border bg-background/80 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="text-xs text-foreground"
                        onClick={() => {
                          setExpandedNodes((prev) => {
                            const next = new Set(prev);
                            if (expanded) next.delete(node.id);
                            else next.add(node.id);
                            return next;
                          });
                        }}
                      >
                        {expanded ? '▾' : '▸'} Node {node.id} ({node.type})
                      </button>
                      <Button
                        size="sm"
                        variant={selectedNodeId === node.id ? 'default' : 'ghost'}
                        onClick={() => setSelectedNodeId(node.id)}
                      >
                        Select
                      </Button>
                    </div>
                    {expanded ? (
                      <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                        <div>Vertices: {node.vertexMap.join(', ')}</div>
                        <div>Edges: {node.skeleton.edges().length}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">
                Build a graph to inspect its SPQR tree.
              </div>
            )}
          </div>
          <div className="mt-3">
            <JsonInspector data={inspectorData} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-foreground">SPQR</h2>
          <Badge variant="secondary">
            {tree ? 'Tree ready' : 'Pending'}
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Decompose biconnected graphs into S/P/R/Q nodes and inspect skeletons.
        </p>
      </header>

      <div data-testid="demo-capture" className="space-y-6">
        {layoutMode === 'stacked' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={mobileView === 'controls' ? 'default' : 'outline'}
                onClick={() => setMobileView('controls')}
              >
                Controls
              </Button>
              <Button
                size="sm"
                variant={mobileView === 'visual' ? 'default' : 'outline'}
                onClick={() => setMobileView('visual')}
              >
                Visualization
              </Button>
            </div>
            {mobileView === 'controls' ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Controls</CardTitle>
                </CardHeader>
                <CardContent>{renderControls()}</CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Visualization</CardTitle>
                </CardHeader>
                <CardContent>
                  <RecomputeBanner visible={isStale} onRecompute={run} />
                  {mode === 'BUILDING' ? (
                    <div className="space-y-3">
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
                      {!state.nodes.length && (
                        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          Build a graph on the left, then visualize here.
                        </div>
                      )}
                    </div>
                  ) : (
                    <SvgViewport nodes={treeLayout.nodes} edges={treeLayout.edges} highlightedNodes={highlightedNodes} />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div
            ref={containerRef}
            className={`grid h-[70vh] min-h-[560px] ${layoutMode === 'vertical' ? 'grid-rows-[auto_auto_auto]' : 'grid-cols-[auto_auto_auto]'}`}
            style={gridStyle}
          >
            <section className="min-h-[0px] min-w-[250px]">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">
                    {mode === 'BUILDING' ? 'Input controls' : 'Inspector'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(100%-3rem)] overflow-y-auto">
                  {renderControls()}
                </CardContent>
              </Card>
            </section>

            <div
              className={dividerClass}
              onPointerDown={(event) => {
                setDragging(true);
                updateRatio(event.clientX, event.clientY);
              }}
              role="separator"
              aria-orientation={layoutMode === 'vertical' ? 'horizontal' : 'vertical'}
              aria-valuenow={Math.round(panelRatio * 100)}
            />

            <section className="min-h-[0px] min-w-[400px]">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Visualization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <RecomputeBanner visible={isStale} onRecompute={run} />
                  {mode === 'BUILDING' ? (
                    <div className="space-y-3">
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
                      {!state.nodes.length && (
                        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          Build a graph on the left, then visualize here.
                        </div>
                      )}
                    </div>
                  ) : (
                    <SvgViewport nodes={treeLayout.nodes} edges={treeLayout.edges} highlightedNodes={highlightedNodes} />
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </div>

      {!query.embed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What you should expect</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              {demoExpectations.spqr.map((item) => (
                <li key={item} className="rounded-lg border border-dashed px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <div data-testid="demo-ready" data-ready={ready ? '1' : '0'} />
    </div>
  );
}
