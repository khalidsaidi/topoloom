import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getDatasetById, datasets, getDefaultSample, type DatasetMode } from '@/data/datasets';
import { loadDatasetSample, type DatasetJson } from '@/lib/datasetLoader';
import {
  getTopoloomWorkerClient,
  type WorkerComputePayload,
  type WorkerResult,
  type WorkerStage,
} from '@/lib/workerClient';
import {
  parseViewerUrlState,
  serializeViewerUrlState,
  type ViewerUrlState,
  type ViewerDefaults,
} from '@/lib/urlState';
import { formatBuildDate, shortSha, useBuildInfo } from '@/lib/buildInfo';
import { clampSampleCaps } from '@/lib/sampler';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttributionModal } from '@/components/gallery/AttributionModal';
import { CompareView } from '@/components/gallery/CompareView';
import { ControlsPanel, type ViewerControlState } from '@/components/gallery/ControlsPanel';
import { PipelineDiagram, type PipelineStepId } from '@/components/gallery/PipelineDiagram';
import { ReportCard } from '@/components/gallery/ReportCard';
import { CanvasViewport } from '@/components/viewports/CanvasViewport';
import { SvgViewport } from '@/components/viewports/SvgViewport';
import { fitTransformToBBox, type PanZoomTransform } from '@/components/viewports/panZoomController';
import type { ViewportGraph } from '@/components/viewports/types';
import { JsonInspector } from '@/components/demo/JsonInspector';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: DatasetJson }
  | { status: 'error'; message: string };

const MODE_ORDER: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

const stepToReportSection: Record<PipelineStepId, string> = {
  graph: 'report-sample',
  planarity: 'report-planarity',
  embedding: 'report-faces',
  mesh: 'report-faces',
  layout: 'report-timings',
};

function edgeKey(edge: [number, number]) {
  return edge[0] < edge[1] ? `${edge[0]},${edge[1]}` : `${edge[1]},${edge[0]}`;
}

function buildViewportGraph(sample: DatasetJson | null, result: WorkerResult): ViewportGraph {
  const sampledNodes = result.sampledGraph.nodes;
  const sampledEdges = result.sampledGraph.edges;
  const originalNodeIndices = result.sampledGraph.originalNodeIndices ?? [];

  const degrees = new Array(sampledNodes.length).fill(0);
  for (const [u, v] of sampledEdges) {
    if (u >= 0 && u < degrees.length) degrees[u] += 1;
    if (v >= 0 && v < degrees.length) degrees[v] += 1;
  }

  const posMap = new Map<number, { x: number; y: number }>(result.layout.positions);
  const nodes = sampledNodes.map((label, id) => {
    const originalId = originalNodeIndices[id] ?? id;
    const fallbackGeo = sample?.extras?.geographic
      ? {
          x: sample.extras.geographic.x[originalId] ?? 0,
          y: sample.extras.geographic.y[originalId] ?? 0,
        }
      : null;

    const point =
      posMap.get(id) ??
      fallbackGeo ?? {
        x: Math.cos((id / Math.max(1, sampledNodes.length)) * Math.PI * 2) * 100,
        y: Math.sin((id / Math.max(1, sampledNodes.length)) * Math.PI * 2) * 100,
      };

    return {
      id,
      label,
      x: point.x,
      y: point.y,
      degree: degrees[id] ?? 0,
    };
  });

  const edgeRoutes = result.layout.edgeRoutes;
  const edges = edgeRoutes && edgeRoutes.length > 0
    ? edgeRoutes.map((route) => ({ edge: route.edge, points: route.points }))
    : sampledEdges.map((edge) => {
        const a = posMap.get(edge[0]) ?? { x: 0, y: 0 };
        const b = posMap.get(edge[1]) ?? { x: 0, y: 0 };
        return {
          edge,
          points: [a, b],
        };
      });

  return {
    nodes,
    edges,
    bbox: result.layout.bbox,
  };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function drawGraphToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  graph: ViewportGraph,
  transform: PanZoomTransform,
  options: {
    showLabels: boolean;
    highlightWitnessEdges?: Set<string>;
    highlightBridges?: Set<string>;
    highlightArticulations?: Set<number>;
  },
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const toScreen = (x: number, y: number) => ({
    x: x * transform.scale + transform.translateX,
    y: y * transform.scale + transform.translateY,
  });

  for (const edge of graph.edges) {
    const key = edgeKey(edge.edge);
    const isWitness = options.highlightWitnessEdges?.has(key) ?? false;
    const isBridge = options.highlightBridges?.has(key) ?? false;
    ctx.strokeStyle = isWitness ? '#dc2626' : isBridge ? '#d97706' : 'rgba(15,23,42,0.55)';
    ctx.lineWidth = isWitness ? 2.5 : isBridge ? 2.2 : 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    edge.points.forEach((point, index) => {
      const p = toScreen(point.x, point.y);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  for (const node of graph.nodes) {
    const p = toScreen(node.x, node.y);
    const isArticulation = options.highlightArticulations?.has(node.id) ?? false;
    const r = node.degree <= 2 ? 3.5 : node.degree <= 4 ? 4.5 : node.degree <= 8 ? 5.5 : 6.5;
    ctx.fillStyle = isArticulation ? '#0284c7' : '#0f172a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (options.showLabels) {
      ctx.fillStyle = '#334155';
      ctx.font = '11px var(--font-mono), monospace';
      ctx.fillText(node.label, p.x + r + 3, p.y - r - 2);
    }
  }
}

function makeSvgString(
  width: number,
  height: number,
  graph: ViewportGraph,
  transform: PanZoomTransform,
  options: {
    showLabels: boolean;
    highlightWitnessEdges?: Set<string>;
    highlightBridges?: Set<string>;
    highlightArticulations?: Set<number>;
    legend: string;
  },
) {
  const edges = graph.edges
    .map((edge) => {
      const key = edgeKey(edge.edge);
      const isWitness = options.highlightWitnessEdges?.has(key) ?? false;
      const isBridge = options.highlightBridges?.has(key) ?? false;
      const stroke = isWitness ? '#dc2626' : isBridge ? '#d97706' : 'rgba(15,23,42,0.55)';
      const points = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${(1.6 / transform.scale).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');

  const nodes = graph.nodes
    .map((node) => {
      const isArticulation = options.highlightArticulations?.has(node.id) ?? false;
      const fill = isArticulation ? '#0284c7' : '#0f172a';
      const r = (node.degree <= 2 ? 3.5 : node.degree <= 4 ? 4.5 : node.degree <= 8 ? 5.5 : 6.5) / transform.scale;
      const label = options.showLabels
        ? `<text x="${node.x + (r + 2.5)}" y="${node.y - (r + 1.5)}" fill="#334155" font-size="${(10 / transform.scale).toFixed(4)}">${node.label.replace(/</g, '&lt;')}</text>`
        : '';
      return `<g><circle cx="${node.x}" cy="${node.y}" r="${r}" fill="${fill}" />${label}</g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  <g transform="translate(${transform.translateX} ${transform.translateY}) scale(${transform.scale})">
    ${edges}
    ${nodes}
  </g>
  <rect x="8" y="${height - 26}" width="${Math.min(width - 16, 420)}" height="18" fill="#ffffff" opacity="0.9"/>
  <text x="12" y="${height - 13}" fill="#334155" font-size="11" font-family="monospace">${options.legend.replace(/</g, '&lt;')}</text>
</svg>`;
}

function getDefaults(datasetId: string, search: string): [ViewerDefaults, ViewerControlState] | null {
  const dataset = getDatasetById(datasetId);
  if (!dataset) return null;
  const defaultSample = getDefaultSample(dataset);
  if (!defaultSample) return null;

  const defaults: ViewerDefaults = {
    sample: defaultSample.id,
    mode: defaultSample.recommended.mode,
    maxNodes: defaultSample.recommended.maxNodes,
    maxEdges: defaultSample.recommended.maxEdges,
    seed: defaultSample.recommended.seed,
  };

  const parsed = parseViewerUrlState(search, defaults, dataset.limits);
  const controls: ViewerControlState = {
    sample: parsed.sample,
    mode: parsed.mode,
    maxNodes: parsed.maxNodes,
    maxEdges: parsed.maxEdges,
    seed: parsed.seed,
    showWitness: parsed.witness,
    showLabels: parsed.labels,
    showArticulations: parsed.articulations,
    showBridges: parsed.bridges,
    compare: parsed.compare,
    compareModes: parsed.compareModes,
    syncCompareView: parsed.syncCompareView,
    renderer: 'canvas',
  };

  return [defaults, controls];
}

export function GalleryViewer() {
  const { datasetId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const buildInfo = useBuildInfo();

  const dataset = getDatasetById(datasetId);
  const seeded = useMemo(() => getDefaults(datasetId, location.search), [datasetId, location.search]);

  const [controls, setControls] = useState<ViewerControlState>(() =>
    seeded?.[1] ?? {
      sample: '',
      mode: 'planar-straight',
      maxNodes: 250,
      maxEdges: 800,
      seed: 1,
      showWitness: true,
      showLabels: false,
      showArticulations: false,
      showBridges: false,
      compare: false,
      compareModes: ['planar-straight', 'orthogonal'],
      syncCompareView: true,
      renderer: 'canvas',
    },
  );

  useEffect(() => {
    if (!seeded) return;
    setControls((prev) => ({ ...prev, ...seeded[1], renderer: prev.renderer }));
  }, [seeded]);

  const [sampleState, setSampleState] = useState<LoadState>({ status: 'idle' });
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [compareResults, setCompareResults] = useState<Record<string, WorkerResult>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ stage: WorkerStage; detail?: string } | null>(null);
  const [computeError, setComputeError] = useState<{ message: string; details?: string } | null>(null);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [controlsSheetOpen, setControlsSheetOpen] = useState(false);

  const [mainTransform, setMainTransform] = useState<PanZoomTransform | undefined>(undefined);
  const [mainViewportSize, setMainViewportSize] = useState({ width: 640, height: 420 });

  const abortRef = useRef<AbortController | null>(null);

  const sampleDef = useMemo(() => {
    if (!dataset) return null;
    return dataset.sampleFiles.find((sample) => sample.id === controls.sample) ?? dataset.sampleFiles[0] ?? null;
  }, [dataset, controls.sample]);

  const clampedControls = useMemo(() => {
    if (!dataset) return controls;
    const caps = clampSampleCaps(controls.maxNodes, controls.maxEdges);
    return {
      ...controls,
      maxNodes: Math.min(caps.maxNodes, dataset.limits.maxNodesHard),
      maxEdges: Math.min(caps.maxEdges, dataset.limits.maxEdgesHard),
    };
  }, [controls, dataset]);

  const clampedWarning = useMemo(() => {
    if (controls.maxNodes !== clampedControls.maxNodes || controls.maxEdges !== clampedControls.maxEdges) {
      return `Caps enforced: nodes <= ${dataset?.limits.maxNodesHard ?? 350}, edges <= ${dataset?.limits.maxEdgesHard ?? 1200}. Try a smaller sample variant for heavier graphs.`;
    }
    return null;
  }, [clampedControls.maxEdges, clampedControls.maxNodes, controls.maxEdges, controls.maxNodes, dataset]);

  useEffect(() => {
    if (controls.maxNodes !== clampedControls.maxNodes || controls.maxEdges !== clampedControls.maxEdges) {
      setControls((prev) => ({ ...prev, maxNodes: clampedControls.maxNodes, maxEdges: clampedControls.maxEdges }));
    }
  }, [clampedControls.maxEdges, clampedControls.maxNodes, controls.maxEdges, controls.maxNodes]);

  useEffect(() => {
    if (!sampleDef) return;
    let active = true;
    setSampleState({ status: 'loading' });

    loadDatasetSample(sampleDef.file)
      .then((data) => {
        if (!active) return;
        setSampleState({ status: 'ready', data });
      })
      .catch((error) => {
        if (!active) return;
        setSampleState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      active = false;
    };
  }, [sampleDef]);

  useEffect(() => {
    if (!dataset || !sampleDef) return;
    const state: ViewerUrlState = {
      sample: sampleDef.id,
      mode: controls.mode,
      maxNodes: controls.maxNodes,
      maxEdges: controls.maxEdges,
      seed: controls.seed,
      witness: controls.showWitness,
      labels: controls.showLabels,
      articulations: controls.showArticulations,
      bridges: controls.showBridges,
      compare: controls.compare,
      compareModes: controls.compareModes,
      syncCompareView: controls.syncCompareView,
    };

    const search = serializeViewerUrlState(state);
    const timer = window.setTimeout(() => {
      if (`?${search}` !== location.search) {
        navigate({ pathname: location.pathname, search: `?${search}` }, { replace: true });
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    controls,
    dataset,
    location.pathname,
    location.search,
    navigate,
    sampleDef,
  ]);

  const runCompute = useCallback(async () => {
    if (!dataset || sampleState.status !== 'ready' || !sampleDef) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setRunning(true);
    setProgress(null);
    setComputeError(null);

    const client = getTopoloomWorkerClient();

    const computeForMode = async (mode: DatasetMode) => {
      const payload: WorkerComputePayload = {
        datasetId: dataset.id,
        sampleId: sampleDef.id,
        nodes: sampleState.data.nodes,
        edges: sampleState.data.edges,
        settings: {
          mode,
          maxNodes: clampedControls.maxNodes,
          maxEdges: clampedControls.maxEdges,
          seed: clampedControls.seed,
          showWitness: clampedControls.showWitness,
        },
      };

      return client.compute(payload, {
        signal: abort.signal,
        onProgress: (next) => {
          setProgress(next);
        },
      });
    };

    try {
      const primary = await computeForMode(clampedControls.mode);
      setResult(primary);

      const compareMap: Record<string, WorkerResult> = {
        [clampedControls.mode]: primary,
      };

      if (clampedControls.compare) {
        const fallbackModes: DatasetMode[] = primary.planarity.isPlanar
          ? ['planar-straight', 'orthogonal', clampedControls.mode]
          : ['planarization-straight', 'planarization-orthogonal', clampedControls.mode];

        const desired = [...new Set([...fallbackModes, ...clampedControls.compareModes, clampedControls.mode])]
          .filter((mode): mode is DatasetMode => MODE_ORDER.includes(mode as DatasetMode))
          .slice(0, 3);

        for (const mode of desired) {
          if (compareMap[mode]) continue;
          const modeResult = await computeForMode(mode);
          compareMap[mode] = modeResult;
        }
      }

      setCompareResults(compareMap);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = error instanceof Error ? error.stack : undefined;
      setComputeError({ message: 'Compute failed', details: `${message}\n${details ?? ''}`.trim() });
    } finally {
      setRunning(false);
    }
  }, [clampedControls, dataset, sampleDef, sampleState]);

  useEffect(() => {
    if (sampleState.status === 'ready') {
      void runCompute();
    }
  }, [sampleState, runCompute]);

  const selectedResult = result;

  const selectedGraph = useMemo(() => {
    if (!selectedResult || sampleState.status !== 'ready') return null;
    return buildViewportGraph(sampleState.data, selectedResult);
  }, [sampleState, selectedResult]);

  const witnessSet = useMemo(() => {
    if (!selectedResult || !controls.showWitness) return undefined;
    return new Set((selectedResult.highlights.witnessEdges ?? []).map((edge) => edgeKey(edge)));
  }, [controls.showWitness, selectedResult]);

  const bridgesSet = useMemo(() => {
    if (!selectedResult || !controls.showBridges) return undefined;
    return new Set((selectedResult.highlights.bridges ?? []).map((edge) => edgeKey(edge)));
  }, [controls.showBridges, selectedResult]);

  const articulationSet = useMemo(() => {
    if (!selectedResult || !controls.showArticulations) return undefined;
    return new Set(selectedResult.highlights.articulationPoints ?? []);
  }, [controls.showArticulations, selectedResult]);

  const comparePanels = useMemo(() => {
    if (!controls.compare || sampleState.status !== 'ready' || !selectedResult) return [];

    const preferredModes: DatasetMode[] = selectedResult.planarity.isPlanar
      ? ['planar-straight', 'orthogonal', controls.mode]
      : ['planarization-straight', 'planarization-orthogonal', controls.mode];

    return preferredModes
      .map((mode) => {
        const modeResult = compareResults[mode];
        if (!modeResult) return null;
        return {
          id: mode,
          title: mode,
          result: modeResult,
          graph: buildViewportGraph(sampleState.data, modeResult),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [compareResults, controls.compare, controls.mode, sampleState, selectedResult]);

  const exportPng = useCallback(() => {
    if (!dataset || !sampleDef || !selectedGraph || !selectedResult) return;

    const width = Math.max(640, Math.floor(mainViewportSize.width));
    const height = Math.max(420, Math.floor(mainViewportSize.height));
    const scale2x = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale2x;
    canvas.height = height * scale2x;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale2x, 0, 0, scale2x, 0, 0);

    const transform =
      mainTransform ?? fitTransformToBBox(selectedGraph.bbox, width, height, 24);

    drawGraphToCanvas(ctx, width, height, selectedGraph, transform, {
      showLabels: controls.showLabels,
      highlightWitnessEdges: witnessSet,
      highlightBridges: bridgesSet,
      highlightArticulations: articulationSet,
    });

    const legend = `${dataset.name} • ${selectedResult.layout.mode} • seed ${controls.seed} • TopoLoom v${buildInfo.libraryVersion ?? 'unknown'}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(8, height - 26, Math.min(width - 16, 430), 18);
    ctx.fillStyle = '#334155';
    ctx.font = '11px monospace';
    ctx.fillText(legend, 12, height - 13);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const fileName = `topoloom_${dataset.id}_${sampleDef.id}_${selectedResult.layout.mode}_seed${controls.seed}.png`;
      downloadBlob(fileName, blob);
    }, 'image/png');
  }, [
    articulationSet,
    bridgesSet,
    buildInfo.libraryVersion,
    controls.seed,
    controls.showLabels,
    dataset,
    mainTransform,
    mainViewportSize.height,
    mainViewportSize.width,
    sampleDef,
    selectedGraph,
    selectedResult,
    witnessSet,
  ]);

  const exportSvg = useCallback(() => {
    if (!dataset || !sampleDef || !selectedGraph || !selectedResult) return;

    const width = Math.max(640, Math.floor(mainViewportSize.width));
    const height = Math.max(420, Math.floor(mainViewportSize.height));
    const transform =
      mainTransform ?? fitTransformToBBox(selectedGraph.bbox, width, height, 24);

    const legend = `${dataset.name} • ${selectedResult.layout.mode} • seed ${controls.seed} • TopoLoom v${buildInfo.libraryVersion ?? 'unknown'}`;

    const svg = makeSvgString(width, height, selectedGraph, transform, {
      showLabels: controls.showLabels,
      highlightWitnessEdges: witnessSet,
      highlightBridges: bridgesSet,
      highlightArticulations: articulationSet,
      legend,
    });

    const fileName = `topoloom_${dataset.id}_${sampleDef.id}_${selectedResult.layout.mode}_seed${controls.seed}.svg`;
    downloadBlob(fileName, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  }, [
    articulationSet,
    bridgesSet,
    buildInfo.libraryVersion,
    controls.seed,
    controls.showLabels,
    dataset,
    mainTransform,
    mainViewportSize.height,
    mainViewportSize.width,
    sampleDef,
    selectedGraph,
    selectedResult,
    witnessSet,
  ]);

  const copyShareLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied');
    } catch {
      window.prompt('Copy share link', url);
    }
  }, []);

  const onPipelineStepClick = (step: PipelineStepId) => {
    const id = stepToReportSection[step];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!dataset) {
    return (
      <div className="rounded-xl border bg-background/80 p-6 text-sm text-muted-foreground">
        Unknown dataset. Return to <Link className="underline" to="/gallery">Gallery</Link>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl border bg-background/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              <Link className="underline" to="/gallery">
                Gallery
              </Link>{' '}
              / {dataset.name}
            </div>
            <h2 className="text-2xl font-semibold">{dataset.name}</h2>
          </div>

          <div
            className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground"
            title={`${buildInfo.gitSha ?? 'unknown'} (${buildInfo.gitRef ?? 'unknown'})`}
          >
            TopoLoom v{buildInfo.libraryVersion ?? 'unknown'} • {shortSha(buildInfo.gitSha)} •{' '}
            {formatBuildDate(buildInfo.builtAt)}
          </div>
        </div>
      </header>

      <PipelineDiagram
        activeSteps={
          selectedResult?.planarity.isPlanar
            ? ['graph', 'planarity', 'embedding', 'mesh', 'layout']
            : ['graph', 'planarity', 'layout']
        }
        modeLabel={selectedResult?.layout.mode}
        onStepClick={onPipelineStepClick}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3">
          <div className="rounded-xl border bg-background/80 p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                {selectedResult ? (
                  <Badge variant={selectedResult.planarity.isPlanar ? 'secondary' : 'destructive'}>
                    {selectedResult.planarity.isPlanar ? 'Planar' : 'Nonplanar'}
                  </Badge>
                ) : null}
                {selectedResult ? (
                  <span className="text-xs text-muted-foreground">
                    crossings: {selectedResult.layout.crossings ?? 0}
                  </span>
                ) : null}
              </div>

              <Sheet open={controlsSheetOpen} onOpenChange={setControlsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="xl:hidden">
                    Controls
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[94vw] max-w-[420px] overflow-y-auto p-4">
                  <ControlsPanel
                    dataset={dataset}
                    state={controls}
                    onStateChange={(patch) => setControls((prev) => ({ ...prev, ...patch }))}
                    onRun={() => {
                      setControlsSheetOpen(false);
                      void runCompute();
                    }}
                    onCopyShare={copyShareLink}
                    onExportPng={exportPng}
                    onExportSvg={exportSvg}
                    onAttribution={() => setAttributionOpen(true)}
                    progress={progress}
                    running={running}
                    error={computeError}
                    clampedWarning={clampedWarning}
                  />
                </SheetContent>
              </Sheet>
            </div>

            {sampleState.status === 'loading' ? (
              <div className="h-[420px] animate-pulse rounded-lg bg-muted/40" />
            ) : null}

            {sampleState.status === 'error' ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                Dataset load failed: {sampleState.message}
              </div>
            ) : null}

            {selectedGraph && !controls.compare ? (
              controls.renderer === 'canvas' ? (
                <CanvasViewport
                  graph={selectedGraph}
                  showLabels={controls.showLabels}
                  highlightWitnessEdges={witnessSet}
                  highlightBridges={bridgesSet}
                  highlightArticulations={articulationSet}
                  transform={mainTransform}
                  onTransformChange={setMainTransform}
                  onViewportSize={setMainViewportSize}
                />
              ) : (
                <SvgViewport
                  graph={selectedGraph}
                  showLabels={controls.showLabels}
                  highlightWitnessEdges={witnessSet}
                  highlightBridges={bridgesSet}
                  highlightArticulations={articulationSet}
                  transform={mainTransform}
                  onTransformChange={setMainTransform}
                  onViewportSize={setMainViewportSize}
                />
              )
            ) : null}

            {selectedGraph && controls.compare ? (
              <CompareView
                panels={comparePanels}
                renderer={controls.renderer}
                showLabels={controls.showLabels}
                highlightWitnessEdges={witnessSet}
                highlightBridges={bridgesSet}
                highlightArticulations={articulationSet}
                syncCompareView={controls.syncCompareView}
              />
            ) : null}
          </div>

          <Tabs defaultValue="report" className="rounded-xl border bg-background/80 p-3">
            <TabsList>
              <TabsTrigger value="report">Report</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="report" className="pt-3">
              <ReportCard result={selectedResult} />
            </TabsContent>
            <TabsContent value="raw" className="pt-3">
              <JsonInspector data={selectedResult ?? { status: 'no-result' }} />
            </TabsContent>
          </Tabs>
        </section>

        <aside className="hidden xl:block">
          <ControlsPanel
            dataset={dataset}
            state={controls}
            onStateChange={(patch) => setControls((prev) => ({ ...prev, ...patch }))}
            onRun={() => {
              void runCompute();
            }}
            onCopyShare={copyShareLink}
            onExportPng={exportPng}
            onExportSvg={exportSvg}
            onAttribution={() => setAttributionOpen(true)}
            progress={progress}
            running={running}
            error={computeError}
            clampedWarning={clampedWarning}
          />
        </aside>
      </div>

      <AttributionModal open={attributionOpen} onOpenChange={setAttributionOpen} datasets={datasets} />
    </div>
  );
}
