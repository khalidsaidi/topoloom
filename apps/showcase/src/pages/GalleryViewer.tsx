import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttributionModal } from '@/components/gallery/AttributionModal';
import { ReportCard } from '@/components/gallery/ReportCard';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { CompareLayout } from '@/components/CompareLayout';
import { CinemaControlsSheet, type CinemaControlState } from '@/components/CinemaControlsSheet';
import { HUD } from '@/components/HUD';
import { PipelineStrip, type PipelineStepId } from '@/components/PipelineStrip';
import { SvgViewport } from '@/components/viewports/SvgViewport';
import { WebGLViewport, type WebGLViewportHandle } from '@/components/viewports/WebGLViewport';
import type { ViewportGraph } from '@/components/viewports/types';
import type { CameraTransform, RendererFrameState, RendererSceneInput, RendererSegmentInput } from '@/gl/GraphRenderer';

import { datasets, getDatasetById, getDefaultSample, type DatasetMode } from '@/data/datasets';
import { formatBuildDate, shortSha, useBuildInfo } from '@/lib/buildInfo';
import { loadDatasetSample, type DatasetJson } from '@/lib/datasetLoader';
import { clampSampleCaps, deterministicSample, type SamplerResult } from '@/lib/sampler';
import {
  getTopoloomWorkerClient,
  type WorkerComputePayload,
  type WorkerPartial,
  type WorkerResult,
  type WorkerStage,
} from '@/lib/workerClient';
import {
  parseViewerUrlState,
  serializeViewerUrlState,
  type ViewerDefaults,
  type ViewerUrlState,
} from '@/lib/urlState';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: DatasetJson }
  | { status: 'error'; message: string };

type PrecomputedLayoutPayload = {
  meta?: {
    mode?: string;
    precomputed?: boolean;
  };
  layout: WorkerResult['layout'];
};

type WitnessPartial = Extract<WorkerPartial, { kind: 'witness' }>['witness'];
type FacesPartial = Extract<WorkerPartial, { kind: 'faces' }>['faces'];

const MODE_ORDER: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

const stageLabel: Record<WorkerStage, string> = {
  sample: 'Sampling',
  'build-graph': 'Build graph',
  planarity: 'Planarity',
  embedding: 'Embedding',
  layout: 'Layout',
  report: 'Report',
  serialize: 'Serialize',
};

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

function buildDegrees(nodeCount: number, edges: Array<[number, number]>) {
  const degrees = new Array(nodeCount).fill(0);
  for (const [u, v] of edges) {
    if (u >= 0 && u < nodeCount) degrees[u] += 1;
    if (v >= 0 && v < nodeCount) degrees[v] += 1;
  }
  return degrees;
}

function computeBBox(points: Array<{ x: number; y: number }>) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  return { minX, minY, maxX, maxY };
}

function buildPreviewPositions(sample: DatasetJson, local: SamplerResult, seed: number) {
  const geographic = sample.extras?.geographic;
  if (geographic) {
    const projected = local.selectedOriginalNodeIndices.map((originalIndex) => ({
      x: Number(geographic.x[originalIndex] ?? 0),
      y: Number(geographic.y[originalIndex] ?? 0),
    }));
    const bbox = computeBBox(projected);
    const width = Math.max(1, bbox.maxX - bbox.minX);
    const height = Math.max(1, bbox.maxY - bbox.minY);
    const scale = 520 / Math.max(width, height);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;

    return projected.map((point) => ({
      x: (point.x - cx) * scale,
      y: -(point.y - cy) * scale,
    }));
  }

  const golden = 2.399963229728653;
  const seedOffset = ((Math.trunc(seed) % 997) + 997) % 997;
  return local.nodes.map((_, id) => {
    const angle = (id + seedOffset * 0.3) * golden;
    const radius = 34 + Math.sqrt(id + 1) * 16;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

function buildRouteSegments(
  sampledEdges: Array<[number, number]>,
  layout: WorkerResult['layout'],
  positionsMap: Map<number, { x: number; y: number }>,
  edgeFlags: Map<string, number>,
): RendererSegmentInput[] {
  if (layout.edgeRoutes && layout.edgeRoutes.length > 0) {
    return layout.edgeRoutes.flatMap((route) => {
      const key = edgeKey(route.edge);
      const flags = edgeFlags.get(key) ?? 0;
      const segments: RendererSegmentInput[] = [];
      for (let i = 1; i < route.points.length; i += 1) {
        segments.push({
          a: route.points[i - 1],
          b: route.points[i],
          flags,
          width: flags & 1 ? 2.8 : flags & 4 ? 2.3 : 1.6,
        });
      }
      return segments;
    });
  }

  return sampledEdges.map((edge) => {
    const key = edgeKey(edge);
    const flags = edgeFlags.get(key) ?? 0;
    return {
      a: positionsMap.get(edge[0]) ?? { x: 0, y: 0 },
      b: positionsMap.get(edge[1]) ?? { x: 0, y: 0 },
      flags,
      width: flags & 1 ? 2.8 : flags & 4 ? 2.3 : 1.6,
    };
  });
}

function buildSceneAndGraph(args: {
  sampledNodes: string[];
  sampledEdges: Array<[number, number]>;
  layout: WorkerResult['layout'];
  previewPositions: Array<{ x: number; y: number }>;
  nodeFlags: Map<number, number>;
  edgeFlags: Map<string, number>;
  visibleNodeIds?: Set<number>;
}) {
  const { sampledNodes, sampledEdges, layout, previewPositions, nodeFlags, edgeFlags, visibleNodeIds } = args;

  const positionsMap = new Map<number, { x: number; y: number }>(layout.positions);
  const degree = buildDegrees(sampledNodes.length, sampledEdges);

  const scene: RendererSceneInput = {
    preview: true,
    nodes: sampledNodes.map((label, id) => ({
      id,
      label,
      degree: degree[id] ?? 0,
      preview: previewPositions[id] ?? { x: 0, y: 0 },
      target: positionsMap.get(id) ?? previewPositions[id] ?? { x: 0, y: 0 },
      flags: nodeFlags.get(id) ?? 0,
      visible: visibleNodeIds ? visibleNodeIds.has(id) : true,
    })),
    edges: sampledEdges.map((edge) => ({
      u: edge[0],
      v: edge[1],
      flags: edgeFlags.get(edgeKey(edge)) ?? 0,
    })),
    routeSegments: buildRouteSegments(sampledEdges, layout, positionsMap, edgeFlags),
  };

  const graphEdges = layout.edgeRoutes && layout.edgeRoutes.length > 0
    ? layout.edgeRoutes.map((route) => ({ edge: route.edge, points: route.points }))
    : sampledEdges.map((edge) => ({
        edge,
        points: [positionsMap.get(edge[0]) ?? { x: 0, y: 0 }, positionsMap.get(edge[1]) ?? { x: 0, y: 0 }],
      }));

  const graph: ViewportGraph = {
    nodes: sampledNodes.map((label, id) => {
      const point = positionsMap.get(id) ?? previewPositions[id] ?? { x: 0, y: 0 };
      return {
        id,
        label,
        x: point.x,
        y: point.y,
        degree: degree[id] ?? 0,
      };
    }),
    edges: graphEdges,
    bbox: layout.bbox,
  };

  return {
    scene,
    graph,
    bbox: layout.bbox,
  };
}

function buildPreviewLayout(previewPositions: Array<{ x: number; y: number }>) {
  return {
    mode: 'preview',
    crossings: 0,
    bends: 0,
    positions: previewPositions.map((point, id) => [id, point] as [number, { x: number; y: number }]),
    edgeRoutes: [] as Array<{ edge: [number, number]; points: Array<{ x: number; y: number }> }>,
    bbox: computeBBox(previewPositions),
  } satisfies WorkerResult['layout'];
}

function readPrecomputedLayout(raw: unknown): WorkerResult['layout'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as PrecomputedLayoutPayload;
  if (!value.layout || typeof value.layout !== 'object') return null;
  const layout = value.layout;
  if (!Array.isArray(layout.positions) || !layout.bbox) return null;
  return layout;
}

function layoutModeForDisplay(mode: DatasetMode, planar: boolean) {
  if (planar) {
    if (mode === 'planarization-straight') return 'planar-straight';
    if (mode === 'planarization-orthogonal') return 'orthogonal';
    return mode;
  }
  if (mode === 'planar-straight') return 'planarization-straight';
  if (mode === 'orthogonal') return 'planarization-orthogonal';
  return mode;
}

function getDefaults(datasetId: string, search: string): [ViewerDefaults, CinemaControlState] | null {
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
  const controls: CinemaControlState = {
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
    renderer: 'webgl',
  };

  return [defaults, controls];
}

function drawGraphToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  graph: ViewportGraph,
  transform: CameraTransform,
  options: {
    showLabels: boolean;
    highlightWitnessEdges?: Set<string>;
    highlightBridges?: Set<string>;
    highlightArticulations?: Set<number>;
  },
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, width, height);

  const toScreen = (x: number, y: number) => ({
    x: x * transform.scale + transform.translateX,
    y: y * transform.scale + transform.translateY,
  });

  for (const edge of graph.edges) {
    const key = edgeKey(edge.edge);
    const isWitness = options.highlightWitnessEdges?.has(key) ?? false;
    const isBridge = options.highlightBridges?.has(key) ?? false;
    ctx.strokeStyle = isWitness ? '#ef4444' : isBridge ? '#f59e0b' : 'rgba(148,163,184,0.68)';
    ctx.lineWidth = isWitness ? 2.6 : isBridge ? 2.2 : 1.5;
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
    const radius = node.degree <= 2 ? 3.4 : node.degree <= 4 ? 4.5 : node.degree <= 8 ? 5.3 : 6.2;
    ctx.fillStyle = isArticulation ? '#22d3ee' : '#e2e8f0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (options.showLabels) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px var(--font-mono), monospace';
      ctx.fillText(node.label, p.x + radius + 2, p.y - radius - 2);
    }
  }
}

function makeSvgString(args: {
  graph: ViewportGraph;
  width: number;
  height: number;
  camera: CameraTransform;
  showLabels: boolean;
  highlightWitnessEdges?: Set<string>;
  highlightBridges?: Set<string>;
  highlightArticulations?: Set<number>;
  legend: string;
}) {
  const { graph, width, height, camera, showLabels, highlightWitnessEdges, highlightBridges, highlightArticulations, legend } = args;

  const edges = graph.edges
    .map((edge) => {
      const key = edgeKey(edge.edge);
      const isWitness = highlightWitnessEdges?.has(key) ?? false;
      const isBridge = highlightBridges?.has(key) ?? false;
      const stroke = isWitness ? '#ef4444' : isBridge ? '#f59e0b' : 'rgba(148,163,184,0.68)';
      const points = edge.points.map((point) => `${point.x},${point.y}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${(1.6 / camera.scale).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');

  const nodes = graph.nodes
    .map((node) => {
      const isArticulation = highlightArticulations?.has(node.id) ?? false;
      const fill = isArticulation ? '#22d3ee' : '#e2e8f0';
      const radius = (node.degree <= 2 ? 3.4 : node.degree <= 4 ? 4.5 : node.degree <= 8 ? 5.3 : 6.2) / camera.scale;
      const label = showLabels
        ? `<text x="${node.x + radius + 2.3}" y="${node.y - radius - 1.4}" fill="#cbd5e1" font-size="${(10 / camera.scale).toFixed(4)}">${node.label.replace(/</g, '&lt;')}</text>`
        : '';
      return `<g><circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="${fill}" />${label}</g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#030712" />
  <g transform="translate(${camera.translateX} ${camera.translateY}) scale(${camera.scale})">
    ${edges}
    ${nodes}
  </g>
  <rect x="8" y="${height - 26}" width="${Math.min(width - 16, 520)}" height="18" fill="#020617" opacity="0.92" />
  <text x="12" y="${height - 13}" fill="#cbd5e1" font-size="11" font-family="monospace">${legend.replace(/</g, '&lt;')}</text>
</svg>`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function GalleryViewer() {
  const { datasetId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const buildInfo = useBuildInfo();

  const dataset = getDatasetById(datasetId);
  const seeded = useMemo(() => getDefaults(datasetId, location.search), [datasetId, location.search]);

  const [controls, setControls] = useState<CinemaControlState>(() =>
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
      renderer: 'webgl',
    },
  );

  useEffect(() => {
    if (!seeded) return;
    setControls((prev) => ({ ...seeded[1], renderer: prev.renderer }));
  }, [seeded]);

  const [sampleState, setSampleState] = useState<LoadState>({ status: 'idle' });
  const [precomputedLayout, setPrecomputedLayout] = useState<WorkerResult['layout'] | null>(null);

  const [result, setResult] = useState<WorkerResult | null>(null);
  const [compareResults, setCompareResults] = useState<Record<string, WorkerResult>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ stage: WorkerStage; detail?: string } | null>(null);
  const [computeError, setComputeError] = useState<{ message: string; details?: string } | null>(null);

  const [partialSampleVisited, setPartialSampleVisited] = useState<number[]>([]);
  const [partialWitness, setPartialWitness] = useState<WitnessPartial | null>(null);
  const [partialFaces, setPartialFaces] = useState<FacesPartial | null>(null);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [cinema, setCinema] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [tab, setTab] = useState<'report' | 'raw'>('report');

  const [mainCamera, setMainCamera] = useState<CameraTransform | undefined>(undefined);
  const [frameState, setFrameState] = useState<RendererFrameState>({
    morph: 0,
    preview: true,
    finalDeterministic: false,
  });

  const mainViewportRef = useRef<WebGLViewportHandle | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRunRef = useRef(false);

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

  useEffect(() => {
    if (controls.maxNodes !== clampedControls.maxNodes || controls.maxEdges !== clampedControls.maxEdges) {
      setControls((prev) => ({ ...prev, maxNodes: clampedControls.maxNodes, maxEdges: clampedControls.maxEdges }));
    }
  }, [clampedControls.maxEdges, clampedControls.maxNodes, controls.maxEdges, controls.maxNodes]);

  const clampedWarning = useMemo(() => {
    if (controls.maxNodes !== clampedControls.maxNodes || controls.maxEdges !== clampedControls.maxEdges) {
      return `Caps enforced: nodes <= ${dataset?.limits.maxNodesHard ?? 350}, edges <= ${dataset?.limits.maxEdgesHard ?? 1200}. Try a smaller sample variant for heavier graphs.`;
    }
    return null;
  }, [clampedControls.maxEdges, clampedControls.maxNodes, controls.maxEdges, controls.maxNodes, dataset]);

  useEffect(() => {
    if (!sampleDef) return;
    let active = true;

    setSampleState({ status: 'loading' });
    setResult(null);
    setCompareResults({});
    setPrecomputedLayout(null);

    loadDatasetSample(sampleDef.file)
      .then((loaded) => {
        if (!active) return;
        setSampleState({ status: 'ready', data: loaded });
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
    if (!sampleDef?.precomputedFile) {
      setPrecomputedLayout(null);
      return;
    }
    let active = true;

    fetch(sampleDef.precomputedFile)
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as unknown;
        return readPrecomputedLayout(payload);
      })
      .then((layout) => {
        if (!active) return;
        setPrecomputedLayout(layout);
      })
      .catch(() => {
        if (!active) return;
        setPrecomputedLayout(null);
      });

    return () => {
      active = false;
    };
  }, [sampleDef?.precomputedFile]);

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
    }, 160);

    return () => {
      window.clearTimeout(timer);
    };
  }, [controls, dataset, location.pathname, location.search, navigate, sampleDef]);

  const revealUi = useCallback(() => {
    if (!cinema) return;
    setUiVisible(true);
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      if (!controlsOpen) {
        setUiVisible(false);
      }
    }, 2200);
  }, [cinema, controlsOpen]);

  useEffect(() => {
    const onMove = () => revealUi();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchstart', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchstart', onMove);
    };
  }, [revealUi]);

  useEffect(() => {
    if (!controlsOpen) return;
    setUiVisible(true);
  }, [controlsOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCinema(false);
        setUiVisible(true);
      }
      if ((event.key === 'c' || event.key === 'C') && !event.metaKey && !event.ctrlKey) {
        setCinema((prev) => !prev);
        setUiVisible(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const localSample = useMemo(() => {
    if (sampleState.status !== 'ready') return null;
    return deterministicSample(
      sampleState.data.nodes,
      sampleState.data.edges,
      clampedControls.seed,
      clampedControls.maxNodes,
      clampedControls.maxEdges,
    );
  }, [sampleState, clampedControls.seed, clampedControls.maxEdges, clampedControls.maxNodes]);

  const originalToSampled = useMemo(() => {
    if (!localSample) return new Map<number, number>();
    const map = new Map<number, number>();
    localSample.selectedOriginalNodeIndices.forEach((originalId, sampledId) => {
      map.set(originalId, sampledId);
    });
    return map;
  }, [localSample]);

  const previewPositions = useMemo(() => {
    if (!localSample || sampleState.status !== 'ready') return [];
    return buildPreviewPositions(sampleState.data, localSample, clampedControls.seed);
  }, [localSample, sampleState, clampedControls.seed]);

  const runningVisibleSet = useMemo(() => {
    if (!running || partialSampleVisited.length === 0) return undefined;
    const sampledIds = new Set<number>();
    for (const originalId of partialSampleVisited) {
      const sampledId = originalToSampled.get(originalId);
      if (sampledId !== undefined) sampledIds.add(sampledId);
    }
    return sampledIds;
  }, [originalToSampled, partialSampleVisited, running]);

  const currentSampledEdges = useMemo(() => {
    if (result) return result.sampledGraph.edges;
    if (localSample) return localSample.edges;
    return [] as Array<[number, number]>;
  }, [localSample, result]);

  const neighborIds = useMemo(() => {
    if (selectedNodeId === null) return new Set<number>();
    const neighbors = new Set<number>();
    for (const [u, v] of currentSampledEdges) {
      if (u === selectedNodeId) neighbors.add(v);
      if (v === selectedNodeId) neighbors.add(u);
    }
    return neighbors;
  }, [currentSampledEdges, selectedNodeId]);

  const edgeFlags = useMemo(() => {
    const map = new Map<string, number>();

    if (clampedControls.showWitness) {
      const witnessEdges = result?.highlights.witnessEdges ?? partialWitness?.edgePairs ?? [];
      for (const edge of witnessEdges) {
        map.set(edgeKey(edge), (map.get(edgeKey(edge)) ?? 0) | 1);
      }
    }

    if (clampedControls.showBridges && result?.highlights.bridges) {
      for (const edge of result.highlights.bridges) {
        map.set(edgeKey(edge), (map.get(edgeKey(edge)) ?? 0) | 4);
      }
    }

    if (running && partialFaces) {
      for (const edge of currentSampledEdges) {
        const key = edgeKey(edge);
        map.set(key, (map.get(key) ?? 0) | 8);
      }
    }

    return map;
  }, [
    clampedControls.showBridges,
    clampedControls.showWitness,
    currentSampledEdges,
    partialFaces,
    partialWitness?.edgePairs,
    result?.highlights.bridges,
    result?.highlights.witnessEdges,
    running,
  ]);

  const nodeFlags = useMemo(() => {
    const map = new Map<number, number>();

    if (clampedControls.showArticulations && result?.highlights.articulationPoints) {
      for (const nodeId of result.highlights.articulationPoints) {
        map.set(nodeId, (map.get(nodeId) ?? 0) | 2);
      }
    }

    if (selectedNodeId !== null) {
      map.set(selectedNodeId, (map.get(selectedNodeId) ?? 0) | 16);
      for (const neighbor of neighborIds) {
        map.set(neighbor, (map.get(neighbor) ?? 0) | 32);
      }
    }

    return map;
  }, [clampedControls.showArticulations, neighborIds, result?.highlights.articulationPoints, selectedNodeId]);

  const previewLayout = useMemo(() => {
    if (!localSample || previewPositions.length === 0) return null;
    return buildPreviewLayout(previewPositions);
  }, [localSample, previewPositions]);

  const precomputedSceneBundle = useMemo(() => {
    if (!localSample || !precomputedLayout || !previewLayout) return null;
    if (precomputedLayout.positions.length !== localSample.nodes.length) return null;
    return buildSceneAndGraph({
      sampledNodes: localSample.nodes,
      sampledEdges: localSample.edges,
      layout: precomputedLayout,
      previewPositions,
      nodeFlags,
      edgeFlags,
      visibleNodeIds: runningVisibleSet,
    });
  }, [edgeFlags, localSample, nodeFlags, precomputedLayout, previewLayout, previewPositions, runningVisibleSet]);

  const resultSceneBundle = useMemo(() => {
    if (!result || !previewLayout) return null;
    return buildSceneAndGraph({
      sampledNodes: result.sampledGraph.nodes,
      sampledEdges: result.sampledGraph.edges,
      layout: result.layout,
      previewPositions,
      nodeFlags,
      edgeFlags,
      visibleNodeIds: undefined,
    });
  }, [edgeFlags, nodeFlags, previewLayout, previewPositions, result]);

  const previewSceneBundle = useMemo(() => {
    if (!localSample || !previewLayout) return null;
    return buildSceneAndGraph({
      sampledNodes: localSample.nodes,
      sampledEdges: localSample.edges,
      layout: previewLayout,
      previewPositions,
      nodeFlags,
      edgeFlags,
      visibleNodeIds: runningVisibleSet,
    });
  }, [edgeFlags, localSample, nodeFlags, previewLayout, previewPositions, runningVisibleSet]);

  const activeBundle = resultSceneBundle ?? precomputedSceneBundle ?? previewSceneBundle;

  const comparePanels = useMemo(() => {
    if (!clampedControls.compare || sampleState.status !== 'ready') return [];
    const primary = result;
    if (!primary) return [];

    const baseModes: DatasetMode[] = primary.planarity.isPlanar
      ? ['planar-straight', 'orthogonal', clampedControls.mode]
      : ['planarization-straight', 'planarization-orthogonal', clampedControls.mode];

    const desired = [...new Set([...baseModes, ...clampedControls.compareModes, clampedControls.mode])]
      .filter((mode): mode is DatasetMode => MODE_ORDER.includes(mode as DatasetMode))
      .slice(0, 3);

    return desired
      .map((mode) => {
        const modeResult = compareResults[mode];
        if (!modeResult) return null;
        const bundle = buildSceneAndGraph({
          sampledNodes: modeResult.sampledGraph.nodes,
          sampledEdges: modeResult.sampledGraph.edges,
          layout: modeResult.layout,
          previewPositions,
          nodeFlags,
          edgeFlags,
        });

        return {
          id: mode,
          title: mode,
          scene: bundle.scene,
          bbox: bundle.bbox,
          graph: bundle.graph,
          planar: modeResult.planarity.isPlanar,
          crossings: modeResult.layout.crossings ?? 0,
          bends: modeResult.layout.bends ?? 0,
          layoutMs: Math.round(modeResult.timingsMs.layout ?? 0),
        };
      })
      .filter((panel): panel is NonNullable<typeof panel> => Boolean(panel));
  }, [clampedControls.compare, clampedControls.compareModes, clampedControls.mode, compareResults, edgeFlags, nodeFlags, previewPositions, result, sampleState.status]);

  const runCompute = useCallback(async () => {
    if (!dataset || !sampleDef || sampleState.status !== 'ready') return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setRunning(true);
    setProgress({ stage: 'sample', detail: 'deterministic BFS sampling' });
    setComputeError(null);
    setResult(null);
    setCompareResults({});
    setPartialSampleVisited([]);
    setPartialWitness(null);
    setPartialFaces(null);
    setSelectedNodeId(null);
    revealUi();

    const client = getTopoloomWorkerClient();

    const computeForMode = async (mode: DatasetMode, streamPartials = false) => {
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
        onPartial: streamPartials
          ? (partial) => {
              if (partial.kind === 'sampling') {
                setPartialSampleVisited(partial.visitedNodeIds);
                return;
              }
              if (partial.kind === 'witness') {
                setPartialWitness(partial.witness);
                return;
              }
              if (partial.kind === 'faces') {
                setPartialFaces(partial.faces);
              }
            }
          : undefined,
      });
    };

    try {
      const primary = await computeForMode(clampedControls.mode, true);
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
          setProgress({ stage: 'layout', detail: `compare mode: ${mode}` });
          const modeResult = await computeForMode(mode, false);
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
      setProgress((prev) => (prev?.stage === 'serialize' ? prev : null));
    }
  }, [clampedControls, dataset, revealUi, sampleDef, sampleState]);

  useEffect(() => {
    if (sampleState.status !== 'ready') return;
    if (autoRunRef.current) return;
    autoRunRef.current = true;
    void runCompute();
  }, [runCompute, sampleState.status]);

  useEffect(() => {
    autoRunRef.current = false;
  }, [datasetId, sampleDef?.id]);

  const copyShareLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied');
    } catch {
      window.prompt('Copy share link', url);
    }
  }, []);

  const pipelineActiveSteps = useMemo(() => {
    if (result?.planarity.isPlanar) return ['graph', 'planarity', 'embedding', 'mesh', 'layout'] as PipelineStepId[];
    if (result) return ['graph', 'planarity', 'layout'] as PipelineStepId[];
    if (partialFaces) return ['graph', 'planarity', 'embedding', 'mesh'] as PipelineStepId[];
    if (partialWitness) return ['graph', 'planarity'] as PipelineStepId[];
    return ['graph'] as PipelineStepId[];
  }, [partialFaces, partialWitness, result]);

  const onPipelineStepClick = (step: PipelineStepId) => {
    const id = stepToReportSection[step];
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const showWitnessSet = useMemo(() => {
    if (!clampedControls.showWitness) return undefined;
    const edges = result?.highlights.witnessEdges ?? partialWitness?.edgePairs ?? [];
    return new Set(edges.map((edge) => edgeKey(edge)));
  }, [clampedControls.showWitness, partialWitness?.edgePairs, result?.highlights.witnessEdges]);

  const showBridgeSet = useMemo(() => {
    if (!clampedControls.showBridges || !result?.highlights.bridges) return undefined;
    return new Set(result.highlights.bridges.map((edge) => edgeKey(edge)));
  }, [clampedControls.showBridges, result?.highlights.bridges]);

  const showArticulationSet = useMemo(() => {
    if (!clampedControls.showArticulations || !result?.highlights.articulationPoints) return undefined;
    return new Set(result.highlights.articulationPoints);
  }, [clampedControls.showArticulations, result?.highlights.articulationPoints]);

  const selectedGraph = activeBundle?.graph ?? null;

  const pickedNodeInfo = useMemo(() => {
    if (selectedNodeId === null || !selectedGraph) return null;
    const node = selectedGraph.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    return {
      id: node.id,
      label: node.label,
      degree: node.degree,
      neighbors: neighborIds.size,
    };
  }, [neighborIds.size, selectedGraph, selectedNodeId]);

  const exportPng = useCallback(() => {
    if (!dataset || !sampleDef || !selectedGraph) return;

    const legend = `${dataset.name} • ${clampedControls.mode} • seed ${clampedControls.seed} • TopoLoom v${buildInfo.libraryVersion ?? 'unknown'}`;
    const fileName = `topoloom_${dataset.id}_${sampleDef.id}_${clampedControls.mode}_seed${clampedControls.seed}.png`;

    if (!clampedControls.compare && clampedControls.renderer === 'webgl' && mainViewportRef.current) {
      const capture = mainViewportRef.current.captureImageData(2);
      if (capture) {
        const canvas = document.createElement('canvas');
        canvas.width = capture.width;
        canvas.height = capture.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rgba = new Uint8ClampedArray(capture.pixels.length);
          rgba.set(capture.pixels);
          const imageData = new ImageData(rgba, capture.width, capture.height);
          ctx.putImageData(imageData, 0, 0);
          ctx.fillStyle = 'rgba(2,6,23,0.92)';
          ctx.fillRect(16, capture.height - 48, Math.min(capture.width - 32, 720), 28);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '22px monospace';
          ctx.fillText(legend, 24, capture.height - 28);
          canvas.toBlob((blob) => {
            if (!blob) return;
            downloadBlob(fileName, blob);
          }, 'image/png');
          return;
        }
      }
    }

    const width = 1440;
    const height = 960;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const camera = mainCamera ?? {
      scale: 1,
      translateX: width / 2,
      translateY: height / 2,
    };

    drawGraphToCanvas(ctx, width, height, selectedGraph, camera, {
      showLabels: clampedControls.showLabels,
      highlightWitnessEdges: showWitnessSet,
      highlightBridges: showBridgeSet,
      highlightArticulations: showArticulationSet,
    });

    ctx.fillStyle = 'rgba(2,6,23,0.92)';
    ctx.fillRect(12, height - 30, Math.min(width - 24, 700), 20);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px monospace';
    ctx.fillText(legend, 16, height - 15);

    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(fileName, blob);
    }, 'image/png');
  }, [buildInfo.libraryVersion, clampedControls.compare, clampedControls.mode, clampedControls.renderer, clampedControls.seed, clampedControls.showLabels, dataset, mainCamera, sampleDef, selectedGraph, showArticulationSet, showBridgeSet, showWitnessSet]);

  const exportSvg = useCallback(() => {
    if (!dataset || !sampleDef || !selectedGraph) return;

    const width = 1400;
    const height = 900;
    const camera = mainCamera ?? {
      scale: 1,
      translateX: width / 2,
      translateY: height / 2,
    };

    const legend = `${dataset.name} • ${clampedControls.mode} • seed ${clampedControls.seed} • TopoLoom v${buildInfo.libraryVersion ?? 'unknown'}`;
    const svg = makeSvgString({
      graph: selectedGraph,
      width,
      height,
      camera,
      showLabels: clampedControls.showLabels,
      highlightWitnessEdges: showWitnessSet,
      highlightBridges: showBridgeSet,
      highlightArticulations: showArticulationSet,
      legend,
    });

    const fileName = `topoloom_${dataset.id}_${sampleDef.id}_${clampedControls.mode}_seed${clampedControls.seed}.svg`;
    downloadBlob(fileName, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  }, [buildInfo.libraryVersion, clampedControls.mode, clampedControls.seed, clampedControls.showLabels, dataset, mainCamera, sampleDef, selectedGraph, showArticulationSet, showBridgeSet, showWitnessSet]);

  const stageEffectText = useMemo(() => {
    if (!progress) return null;
    if (progress.stage === 'sample') {
      return `Sampling growth: ${partialSampleVisited.length.toLocaleString()} nodes visited`;
    }
    if (progress.stage === 'planarity') {
      return partialWitness
        ? `Witness ${partialWitness.kind} (${partialWitness.edgePairs.length} edges)`
        : 'Testing planarity';
    }
    if (progress.stage === 'embedding') {
      return partialFaces ? `Faces detected: ${partialFaces.count}` : 'Building half-edge mesh';
    }
    if (progress.stage === 'layout') {
      return 'Morphing preview toward deterministic layout';
    }
    if (progress.stage === 'report') {
      return 'Computing BC/SPQR report';
    }
    return progress.detail ?? 'Serializing results';
  }, [partialFaces, partialSampleVisited.length, partialWitness, progress]);

  const computeLabel = useMemo(() => {
    if (result && frameState.finalDeterministic) return 'Final (TopoLoom deterministic)' as const;
    if (!result && precomputedLayout) return 'Final (TopoLoom deterministic)' as const;
    return 'Preview (animated)' as const;
  }, [frameState.finalDeterministic, precomputedLayout, result]);

  const hudMetrics = useMemo(() => {
    if (result) {
      return {
        nodes: result.sampledStats.nodes,
        edges: result.sampledStats.edges,
        planar: result.planarity.isPlanar,
        crossings: result.layout.crossings ?? 0,
        bends: result.layout.bends ?? 0,
      };
    }
    if (localSample) {
      return {
        nodes: localSample.stats.nodes,
        edges: localSample.stats.edges,
        planar: undefined,
        crossings: 0,
        bends: 0,
      };
    }
    return null;
  }, [localSample, result]);

  const buildLabel = `TopoLoom v${buildInfo.libraryVersion ?? 'unknown'} • ${shortSha(buildInfo.gitSha)} • ${formatBuildDate(buildInfo.builtAt)}`;
  const commitUrl = buildInfo.gitSha && buildInfo.gitSha !== 'unknown'
    ? `https://github.com/khalidsaidi/topoloom/commit/${buildInfo.gitSha}`
    : null;

  if (!dataset) {
    return (
      <div className="m-4 rounded-xl border border-white/20 bg-black/60 p-6 text-sm text-white/80">
        Unknown dataset. Return to <Link className="underline" to="/gallery">Gallery</Link>.
      </div>
    );
  }

  const headerVisible = !cinema || uiVisible;

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-black text-white" onMouseMove={revealUi} onTouchStart={revealUi}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_85%_0%,rgba(16,185,129,0.2),transparent_42%),#020617]" />

      <AnimatePresence>
        {headerVisible ? (
          <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="rounded-xl border border-white/20 bg-black/55 px-3 py-2 text-xs text-white/80 backdrop-blur">
              <Link className="underline underline-offset-4" to="/gallery">
                Gallery
              </Link>{' '}
              / {dataset.name}
            </div>

            <div className="flex items-center gap-2">
              {commitUrl ? (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/20 bg-black/55 px-3 py-2 text-xs text-white/80 backdrop-blur"
                  title={`${buildInfo.gitSha ?? 'unknown'} (${buildInfo.gitRef ?? 'unknown'})`}
                >
                  {buildLabel}
                </a>
              ) : (
                <div className="rounded-xl border border-white/20 bg-black/55 px-3 py-2 text-xs text-white/80 backdrop-blur">
                  {buildLabel}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="border-white/30 bg-black/55 text-white hover:bg-black/75"
                onClick={() => setCinema((prev) => !prev)}
                aria-label="Toggle cinema mode"
              >
                {cinema ? 'Exit cinema' : 'Cinema'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="border-white/30 bg-black/55 text-white hover:bg-black/75"
                onClick={() => setControlsOpen(true)}
                aria-label="Open controls"
              >
                Controls
              </Button>
            </div>
          </motion.header>
        ) : null}
      </AnimatePresence>

      <HUD
        visible={headerVisible}
        datasetName={dataset.name}
        sampleLabel={sampleDef?.label ?? ''}
        modeLabel={layoutModeForDisplay(clampedControls.mode, result?.planarity.isPlanar ?? false)}
        stageLabel={progress ? stageLabel[progress.stage] : undefined}
        computeLabel={computeLabel}
        metrics={hudMetrics}
        timings={result?.timingsMs}
        buildLabel={sampleDef?.precomputedFile && !result ? `${buildLabel} • computed by TopoLoom (precomputed asset)` : buildLabel}
      />

      <div className={cinema ? 'relative h-[calc(100vh-3.5rem)] pt-16' : 'relative mx-auto max-w-7xl space-y-4 px-3 pb-8 pt-20'}>
        <div className={cinema ? 'absolute inset-0 pt-16' : ''}>
          <div className={cinema ? 'h-full px-3 pb-3' : 'space-y-3'}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <PipelineStrip activeSteps={pipelineActiveSteps} onStepClick={onPipelineStepClick} />
              {result ? (
                <Badge variant={result.planarity.isPlanar ? 'secondary' : 'destructive'}>
                  {result.planarity.isPlanar ? 'Planar' : 'Nonplanar'}
                  {typeof result.layout.crossings === 'number' ? ` • crossings ${result.layout.crossings}` : ''}
                </Badge>
              ) : null}
            </div>

            {sampleState.status === 'loading' ? (
              <div className="h-[72vh] animate-pulse rounded-2xl border border-white/20 bg-white/5" />
            ) : null}

            {sampleState.status === 'error' ? (
              <div className="rounded-xl border border-red-400/40 bg-red-500/15 p-4 text-sm text-red-100">
                Dataset load failed: {sampleState.message}
              </div>
            ) : null}

            {sampleState.status === 'ready' && activeBundle && !clampedControls.compare ? (
              clampedControls.renderer === 'webgl' ? (
                <WebGLViewport
                  ref={mainViewportRef}
                  className={cinema ? 'h-[calc(100%-1.75rem)] min-h-[62vh] rounded-2xl border-white/20' : 'h-[72vh] rounded-2xl border-white/20'}
                  scene={activeBundle.scene}
                  bbox={activeBundle.bbox}
                  camera={mainCamera}
                  onCameraChange={setMainCamera}
                  onNodePick={(nodeId) => setSelectedNodeId(nodeId)}
                  onFrameState={setFrameState}
                  onInteraction={revealUi}
                  rendererLabel={computeLabel}
                  autoFitOnSceneChange={!mainCamera}
                />
              ) : (
                <SvgViewport
                  className={cinema ? 'h-[calc(100%-1.75rem)] min-h-[62vh] rounded-2xl border-white/20 bg-black/80' : 'h-[72vh] rounded-2xl border-white/20 bg-black/80'}
                  graph={activeBundle.graph}
                  showLabels={clampedControls.showLabels}
                  highlightWitnessEdges={showWitnessSet}
                  highlightBridges={showBridgeSet}
                  highlightArticulations={showArticulationSet}
                />
              )
            ) : null}

            {sampleState.status === 'ready' && clampedControls.compare ? (
              <CompareLayout
                panels={comparePanels}
                renderer={clampedControls.renderer}
                syncCamera={clampedControls.syncCompareView}
                showLabels={clampedControls.showLabels}
                onInteraction={revealUi}
              />
            ) : null}
          </div>
        </div>

        {pickedNodeInfo && headerVisible ? (
          <div className="pointer-events-none absolute bottom-6 right-6 z-20 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-xs text-white/80 backdrop-blur">
            node {pickedNodeInfo.id} ({pickedNodeInfo.label}) • degree {pickedNodeInfo.degree} • neighbors {pickedNodeInfo.neighbors}
          </div>
        ) : null}

        <AnimatePresence>
          {running && progress ? (
            <motion.div
              key={progress.stage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-25 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.02, opacity: 0 }}
                className="rounded-2xl border border-white/20 bg-black/60 px-5 py-4 text-center backdrop-blur"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">{stageLabel[progress.stage]}</div>
                <div className="mt-1 text-sm text-white/90">{stageEffectText}</div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!cinema || tab === 'report' ? (
          <div className={cinema ? 'absolute bottom-3 left-3 right-3 z-10' : ''}>
            <Tabs value={tab} onValueChange={(value) => setTab(value as 'report' | 'raw')} className="rounded-2xl border border-white/20 bg-black/60 p-3 backdrop-blur">
              <TabsList className="bg-white/10">
                <TabsTrigger value="report">Report</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="report" className="mt-3 max-h-[26vh] overflow-auto">
                <ReportCard result={result} />
              </TabsContent>
              <TabsContent value="raw" className="mt-3 max-h-[26vh] overflow-auto">
                <JsonInspector data={result ?? { status: 'no-result' }} />
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </div>

      <CinemaControlsSheet
        open={controlsOpen}
        onOpenChange={(open) => {
          setControlsOpen(open);
          if (!open) revealUi();
        }}
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

      <AttributionModal open={attributionOpen} onOpenChange={setAttributionOpen} datasets={datasets} />
    </div>
  );
}
