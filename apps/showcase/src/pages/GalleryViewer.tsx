import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AttributionModal } from '@/components/gallery/AttributionModal';
import { ReportCard } from '@/components/gallery/ReportCard';
import { JsonInspector } from '@/components/demo/JsonInspector';
import { CompareLayout } from '@/components/CompareLayout';
import { CinemaControlsSheet, type CinemaControlState } from '@/components/CinemaControlsSheet';
import { HUD, type HudStatus } from '@/components/HUD';
import { PipelineStrip, type PipelineStepId } from '@/components/PipelineStrip';
import { TopRightActions } from '@/components/TopRightActions';
import { WebGLViewport, type WebGLViewportHandle } from '@/components/viewports/WebGLViewport';
import { SvgViewport } from '@/components/viewports/SvgViewport';
import type {
  CameraTransform,
  RendererFrameState,
  RendererSceneInput,
  RendererSegmentInput,
} from '@/gl/GraphRenderer';
import type { ViewportGraph } from '@/components/viewports/types';

import { getDatasetById, getDefaultSample, datasets, type DatasetMode } from '@/data/datasets';
import { formatBuildDate, shortSha, useBuildInfo } from '@/lib/buildInfo';
import { loadDatasetSample, type DatasetJson } from '@/lib/datasetLoader';
import { clampSampleCaps, deterministicSample } from '@/lib/sampler';
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

import { Button } from '@/ui/Button';
import { Sheet, SheetContent } from '@/ui/Sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs';

const MODE_ORDER: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

const STAGE_LABEL: Record<WorkerStage, string> = {
  sample: 'Sampling',
  'build-graph': 'Build graph',
  planarity: 'Planarity',
  embedding: 'Embedding',
  mesh: 'Mesh',
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
  report: 'report-timings',
};

const stageToPipelineStep: Partial<Record<WorkerStage, PipelineStepId>> = {
  sample: 'graph',
  'build-graph': 'graph',
  planarity: 'planarity',
  embedding: 'embedding',
  mesh: 'mesh',
  layout: 'layout',
  report: 'report',
  serialize: 'report',
};

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

type CompareModePanel = {
  id: string;
  title: string;
  scene: RendererSceneInput;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  graph: ViewportGraph;
  planar: boolean;
  crossings: number;
  bends: number;
  layoutMs: number;
};

type ViewerStatus = {
  text: string;
  tone: HudStatus['tone'];
  crossings: number;
};

type WitnessPartial = Extract<WorkerPartial, { kind: 'witness' }>;
type SamplePartial = Extract<WorkerPartial, { kind: 'sampleVisited' }>;
type FacesPartial = Extract<WorkerPartial, { kind: 'faces' }>;
type PositionPartial = Extract<WorkerPartial, { kind: 'positions' }>;
type MetricPartial = Extract<WorkerPartial, { kind: 'metric' }>;

type RunPhase = 'IDLE_FINAL' | 'SCRAMBLE_INTRO' | 'SOLVING_STREAM' | 'FINAL_MORPH';

function edgeKey(edge: [number, number]) {
  return edge[0] < edge[1] ? `${edge[0]},${edge[1]}` : `${edge[1]},${edge[0]}`;
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

function buildDegrees(nodeCount: number, edges: Array<[number, number]>) {
  const degrees = new Array(nodeCount).fill(0);
  for (const [u, v] of edges) {
    if (u >= 0 && u < nodeCount) degrees[u] += 1;
    if (v >= 0 && v < nodeCount) degrees[v] += 1;
  }
  return degrees;
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function deterministicScramblePositions(args: {
  totalNodes: number;
  datasetId: string;
  sampleId: string;
  seed: number;
}) {
  const { totalNodes, datasetId, sampleId, seed } = args;
  const points: Array<{ x: number; y: number }> = [];
  const maxRadius = 260 + Math.sqrt(Math.max(1, totalNodes)) * 18;

  for (let id = 0; id < totalNodes; id += 1) {
    const key = `${datasetId}:${sampleId}:${seed}:${id}`;
    const h = hash32(key) / 4294967296;
    const h2 = hash32(`${key}:j`) / 4294967296;
    const angle = Math.PI * 2 * fract(h);
    const radius = Math.pow(fract(h * 1.7), 0.35) * maxRadius;
    const jitterAngle = Math.PI * 2 * fract(h2 * 1.13);
    const jitterMag = 7 + fract(h2 * 3.7) * 11;

    points.push({
      x: Math.cos(angle) * radius + Math.cos(jitterAngle) * jitterMag,
      y: Math.sin(angle) * radius + Math.sin(jitterAngle) * jitterMag,
    });
  }

  return points;
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
          width: flags & 1 ? 3.2 : flags & 4 ? 2.7 : 2.05,
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
      width: flags & 1 ? 3.2 : flags & 4 ? 2.7 : 2.05,
    };
  });
}

function buildSceneAndGraph(args: {
  sampledNodes: string[];
  sampledEdges: Array<[number, number]>;
  layout: WorkerResult['layout'];
  scramblePositions: Array<{ x: number; y: number }>;
  nodeFlags: Map<number, number>;
  edgeFlags: Map<string, number>;
  visibleNodeIds?: Set<number>;
  reducedMotion: boolean;
  animateToTarget: boolean;
  previewAnimation?: boolean;
  edgeAlpha?: number;
}) {
  const {
    sampledNodes,
    sampledEdges,
    layout,
    scramblePositions,
    nodeFlags,
    edgeFlags,
    visibleNodeIds,
    reducedMotion,
    animateToTarget,
    previewAnimation,
    edgeAlpha,
  } = args;

  const positionsMap = new Map<number, { x: number; y: number }>(layout.positions);
  const degree = buildDegrees(sampledNodes.length, sampledEdges);

  const scene: RendererSceneInput = {
    preview: Boolean(previewAnimation) && !reducedMotion,
    morphDurationMs: reducedMotion ? 560 : 1100,
    edgeAlpha: edgeAlpha ?? 1,
    nodes: sampledNodes.map((label, id) => {
      const target = positionsMap.get(id) ?? scramblePositions[id] ?? { x: 0, y: 0 };
      return {
        id,
        label,
        degree: degree[id] ?? 0,
        preview: scramblePositions[id] ?? target,
        target: animateToTarget ? target : undefined,
        flags: nodeFlags.get(id) ?? 0,
        visible: visibleNodeIds ? visibleNodeIds.has(id) : true,
      };
    }),
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
      const point = positionsMap.get(id) ?? scramblePositions[id] ?? { x: 0, y: 0 };
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

function deriveStatus(result: WorkerResult | null, requestedMode: DatasetMode, partialWitness: WitnessPartial | null): ViewerStatus {
  if (!result) {
    if (partialWitness) {
      return {
        text: 'Nonplanar • witness shown',
        tone: 'danger',
        crossings: 0,
      };
    }
    return {
      text: 'Preview • waiting for result',
      tone: 'accent',
      crossings: 0,
    };
  }

  const resolvedMode = result.layout.mode as DatasetMode;
  const renderMode = layoutModeForDisplay(requestedMode, result.planarity.isPlanar) || resolvedMode;

  if (renderMode.startsWith('planarization')) {
    const crossings = Math.max(0, Number(result.layout.crossings ?? 0));
    return {
      text: `Planarized • crossings ${crossings}`,
      tone: 'accent',
      crossings,
    };
  }

  if (result.planarity.isPlanar) {
    return {
      text: 'Planar • crossings 0',
      tone: 'success',
      crossings: 0,
    };
  }

  return {
    text: 'Nonplanar • witness shown',
    tone: 'danger',
    crossings: 0,
  };
}

function getDefaults(datasetId: string, search: string): [ViewerDefaults, CinemaControlState] | null {
  const dataset = getDatasetById(datasetId);
  if (!dataset) return null;
  const defaultSample = getDefaultSample(dataset);
  if (!defaultSample) return null;

  const defaults: ViewerDefaults = {
    sample: defaultSample.id,
    mode: defaultSample.recommended.mode,
    boundarySelection: 'auto',
    maxNodes: defaultSample.recommended.maxNodes,
    maxEdges: defaultSample.recommended.maxEdges,
    seed: defaultSample.recommended.seed,
  };

  const parsed = parseViewerUrlState(search, defaults, dataset.limits);
  const controls: CinemaControlState = {
    sample: parsed.sample,
    mode: parsed.mode,
    boundarySelection: parsed.boundarySelection,
    maxNodes: parsed.maxNodes,
    maxEdges: parsed.maxEdges,
    seed: parsed.seed,
    showWitness: parsed.witness,
    showLabels: parsed.labels,
    showFaces: true,
    showArticulations: parsed.articulations,
    showBridges: parsed.bridges,
    compare: parsed.compare,
    compareModes: parsed.compareModes,
    syncCompareView: parsed.syncCompareView,
    renderer: 'webgl',
  };

  return [defaults, controls];
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
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#020617');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const toScreen = (x: number, y: number) => ({
    x: x * transform.scale + transform.translateX,
    y: y * transform.scale + transform.translateY,
  });

  for (const edge of graph.edges) {
    const key = edgeKey(edge.edge);
    const isWitness = options.highlightWitnessEdges?.has(key) ?? false;
    const isBridge = options.highlightBridges?.has(key) ?? false;
    ctx.strokeStyle = isWitness ? 'rgba(248, 113, 113, 0.95)' : isBridge ? 'rgba(251, 191, 36, 0.92)' : 'rgba(148, 163, 184, 0.78)';
    ctx.lineWidth = isWitness ? 2.8 : isBridge ? 2.4 : 1.9;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
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
    const radius = node.degree <= 2 ? 3.5 : node.degree <= 4 ? 4.7 : node.degree <= 8 ? 5.7 : 6.8;
    const isArticulation = options.highlightArticulations?.has(node.id) ?? false;

    ctx.fillStyle = isArticulation ? 'rgba(34, 211, 238, 0.35)' : 'rgba(56, 189, 248, 0.20)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isArticulation ? '#22d3ee' : '#f8fafc';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (options.showLabels) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px var(--font-mono), monospace';
      ctx.fillText(node.label, p.x + radius + 3, p.y - radius - 2);
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
      const stroke = isWitness ? '#f87171' : isBridge ? '#fbbf24' : 'rgba(148,163,184,0.78)';
      const points = edge.points.map((point) => `${point.x},${point.y}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${(1.8 / camera.scale).toFixed(4)}" stroke-linejoin="round" stroke-linecap="round" />`;
    })
    .join('');

  const nodes = graph.nodes
    .map((node) => {
      const isArticulation = highlightArticulations?.has(node.id) ?? false;
      const radius = (node.degree <= 2 ? 3.5 : node.degree <= 4 ? 4.7 : node.degree <= 8 ? 5.7 : 6.8) / camera.scale;
      const fill = isArticulation ? '#22d3ee' : '#f8fafc';
      const glow = isArticulation ? 'rgba(34,211,238,0.35)' : 'rgba(56,189,248,0.22)';
      const label = showLabels
        ? `<text x="${node.x + radius + 2.2}" y="${node.y - radius - 1.4}" fill="#cbd5e1" font-size="${(10 / camera.scale).toFixed(4)}">${node.label.replace(/</g, '&lt;')}</text>`
        : '';
      return `<g><circle cx="${node.x}" cy="${node.y}" r="${radius + 2.0 / camera.scale}" fill="${glow}" /><circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="${fill}" />${label}</g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020617" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <g transform="translate(${camera.translateX} ${camera.translateY}) scale(${camera.scale})">
    ${edges}
    ${nodes}
  </g>
  <rect x="10" y="${height - 30}" width="${Math.min(width - 20, 560)}" height="20" fill="#020617" opacity="0.9" />
  <text x="14" y="${height - 16}" fill="#cbd5e1" font-size="11" font-family="monospace">${legend.replace(/</g, '&lt;')}</text>
</svg>`;
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
      boundarySelection: 'auto',
      maxNodes: 250,
      maxEdges: 800,
      seed: 1,
      showWitness: true,
      showLabels: false,
      showFaces: true,
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
    const timer = window.setTimeout(() => {
      setControls((prev) => ({ ...seeded[1], renderer: prev.renderer }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [seeded]);

  const [sampleState, setSampleState] = useState<LoadState>({ status: 'idle' });
  const [precomputedLayout, setPrecomputedLayout] = useState<WorkerResult['layout'] | null>(null);

  const [result, setResult] = useState<WorkerResult | null>(null);
  const [compareResults, setCompareResults] = useState<Record<string, WorkerResult>>({});
  const [runPhase, setRunPhase] = useState<RunPhase>('IDLE_FINAL');
  const [progress, setProgress] = useState<{ stage: WorkerStage; detail?: string } | null>(null);
  const [computeError, setComputeError] = useState<{ message: string; details?: string } | null>(null);
  const [modeFallbackNote, setModeFallbackNote] = useState<string | null>(null);

  const [displayStage, setDisplayStage] = useState<{ stage: WorkerStage; detail?: string } | null>(null);

  const [partialSampleVisited, setPartialSampleVisited] = useState<number[]>([]);
  const [partialWitness, setPartialWitness] = useState<WitnessPartial | null>(null);
  const [partialFaces, setPartialFaces] = useState<FacesPartial | null>(null);
  const [partialPositions, setPartialPositions] = useState<PositionPartial | null>(null);
  const [partialMetric, setPartialMetric] = useState<MetricPartial | null>(null);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const [cinema, setCinema] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [tab, setTab] = useState<'report' | 'raw'>('report');

  const [mainCamera, setMainCamera] = useState<CameraTransform | undefined>(undefined);
  const [fitSignal, setFitSignal] = useState(0);
  const [frameState, setFrameState] = useState<RendererFrameState>({
    morph: 0,
    preview: true,
    finalDeterministic: false,
  });

  const [reducedMotion, setReducedMotion] = useState(false);

  const stageTimerRef = useRef<number | null>(null);
  const stageShownAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const autoRunRef = useRef(false);
  const mainViewportRef = useRef<WebGLViewportHandle | null>(null);
  const runPhaseRef = useRef<RunPhase>('IDLE_FINAL');

  useEffect(() => {
    runPhaseRef.current = runPhase;
  }, [runPhase]);

  const transitionRunPhase = useCallback((next: RunPhase) => {
    runPhaseRef.current = next;
    setRunPhase(next);
  }, []);

  const sampleDef = useMemo(() => {
    if (!dataset) return null;
    return dataset.sampleFiles.find((sample) => sample.id === controls.sample) ?? dataset.sampleFiles[0] ?? null;
  }, [controls.sample, dataset]);

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
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!sampleDef) return;
    let active = true;
    const resetTimer = window.setTimeout(() => {
      if (!active) return;
      setSampleState({ status: 'loading' });
      setResult(null);
      setCompareResults({});
      setPrecomputedLayout(null);
      setPartialSampleVisited([]);
      setPartialWitness(null);
      setPartialFaces(null);
      setPartialPositions(null);
      setPartialMetric(null);
      setModeFallbackNote(null);
      transitionRunPhase('IDLE_FINAL');
    }, 0);

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
      window.clearTimeout(resetTimer);
    };
  }, [sampleDef, transitionRunPhase]);

  useEffect(() => {
    if (!sampleDef?.precomputedFile) return;

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
      mode: clampedControls.mode,
      boundarySelection: clampedControls.boundarySelection,
      maxNodes: clampedControls.maxNodes,
      maxEdges: clampedControls.maxEdges,
      seed: clampedControls.seed,
      witness: clampedControls.showWitness,
      labels: clampedControls.showLabels,
      articulations: clampedControls.showArticulations,
      bridges: clampedControls.showBridges,
      compare: clampedControls.compare,
      compareModes: clampedControls.compareModes,
      syncCompareView: clampedControls.syncCompareView,
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
  }, [clampedControls, dataset, location.pathname, location.search, navigate, sampleDef]);

  const revealUi = useCallback(() => {
    if (!cinema) return;
    setUiVisible(true);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      if (!controlsOpen && !reportOpen) setUiVisible(false);
    }, 2200);
  }, [cinema, controlsOpen, reportOpen]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCinema(false);
        setUiVisible(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      if (stageTimerRef.current) window.clearTimeout(stageTimerRef.current);
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
  }, [clampedControls.maxEdges, clampedControls.maxNodes, clampedControls.seed, sampleState]);

  const originalToSampled = useMemo(() => {
    if (!localSample) return new Map<number, number>();
    const map = new Map<number, number>();
    localSample.selectedOriginalNodeIndices.forEach((originalId, sampledId) => {
      map.set(originalId, sampledId);
    });
    return map;
  }, [localSample]);

  const scramblePositions = useMemo(() => {
    if (!localSample || !sampleDef || !dataset) return [];
    return deterministicScramblePositions({
      totalNodes: localSample.nodes.length,
      datasetId: dataset.id,
      sampleId: sampleDef.id,
      seed: clampedControls.seed,
    });
  }, [clampedControls.seed, dataset, localSample, sampleDef]);

  const runningVisibleSet = useMemo(() => {
    const revealBySampling = runPhase === 'SCRAMBLE_INTRO' || runPhase === 'SOLVING_STREAM';
    if (!revealBySampling || partialSampleVisited.length === 0) return undefined;
    const sampledIds = new Set<number>();
    for (const originalId of partialSampleVisited) {
      const sampledId = originalToSampled.get(originalId);
      if (sampledId !== undefined) sampledIds.add(sampledId);
    }
    return sampledIds;
  }, [originalToSampled, partialSampleVisited, runPhase]);

  const currentSampledEdges = useMemo(() => {
    if (result) return result.sampledGraph.edges;
    if (localSample) return localSample.edges;
    return [] as Array<[number, number]>;
  }, [localSample, result]);

  const neighborIds = useMemo(() => {
    if (selectedNodeId === null) return new Set<number>();
    const set = new Set<number>();
    for (const [u, v] of currentSampledEdges) {
      if (u === selectedNodeId) set.add(v);
      if (v === selectedNodeId) set.add(u);
    }
    return set;
  }, [currentSampledEdges, selectedNodeId]);

  const facesAvailable = Boolean(result?.report.faces || partialFaces);
  const hasGeographic = Boolean(sampleState.status === 'ready' && sampleState.data.extras?.geographic);

  useEffect(() => {
    if (hasGeographic || controls.boundarySelection !== 'geo-shaped') return;
    const timer = window.setTimeout(() => {
      setControls((prev) => (prev.boundarySelection === 'geo-shaped' ? { ...prev, boundarySelection: 'auto' } : prev));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [controls.boundarySelection, hasGeographic]);

  const edgeFlags = useMemo(() => {
    const map = new Map<string, number>();

    if (clampedControls.showWitness) {
      const edges = result?.highlights.witnessEdges ?? partialWitness?.edges ?? [];
      for (const edge of edges) {
        map.set(edgeKey(edge), (map.get(edgeKey(edge)) ?? 0) | 1);
      }
    }

    if (clampedControls.showBridges && result?.highlights.bridges) {
      for (const edge of result.highlights.bridges) {
        map.set(edgeKey(edge), (map.get(edgeKey(edge)) ?? 0) | 4);
      }
    }

    if (clampedControls.showFaces && facesAvailable) {
      for (const edge of currentSampledEdges) {
        map.set(edgeKey(edge), (map.get(edgeKey(edge)) ?? 0) | 8);
      }
    }

    return map;
  }, [clampedControls.showBridges, clampedControls.showFaces, clampedControls.showWitness, currentSampledEdges, facesAvailable, partialWitness, result]);

  const nodeFlags = useMemo(() => {
    const map = new Map<number, number>();

    if (clampedControls.showArticulations && result?.highlights.articulationPoints) {
      for (const id of result.highlights.articulationPoints) {
        map.set(id, (map.get(id) ?? 0) | 2);
      }
    }

    if (selectedNodeId !== null) {
      map.set(selectedNodeId, (map.get(selectedNodeId) ?? 0) | 16);
      for (const id of neighborIds) {
        map.set(id, (map.get(id) ?? 0) | 32);
      }
    }

    return map;
  }, [clampedControls.showArticulations, neighborIds, result, selectedNodeId]);

  const previewLayout = useMemo(() => {
    if (!localSample || scramblePositions.length === 0) return null;
    return buildPreviewLayout(scramblePositions);
  }, [localSample, scramblePositions]);

  const solvingLayout = useMemo(() => {
    if (!partialPositions || !localSample) return null;
    const positions = partialPositions.positions
      .map(([id, x, y]) => [id, { x, y }] as [number, { x: number; y: number }])
      .sort((a, b) => a[0] - b[0]);

    if (positions.length === 0) return null;
    const bbox = computeBBox(positions.map(([, p]) => p));

    return {
      mode: 'partial-layout',
      crossings: 0,
      bends: 0,
      positions,
      edgeRoutes: [] as Array<{ edge: [number, number]; points: Array<{ x: number; y: number }> }>,
      bbox,
    } satisfies WorkerResult['layout'];
  }, [localSample, partialPositions]);

  const drawingClarity = useMemo(() => {
    const crossings = partialMetric?.crossings;
    if (!Number.isFinite(crossings)) return 1;
    const value = crossings ?? 0;
    const normalized = Math.min(1, Math.max(0, value / 220));
    return 0.72 + normalized * 0.28;
  }, [partialMetric?.crossings]);

  const previewBundle = useMemo(() => {
    if (!previewLayout || !localSample) return null;
    return buildSceneAndGraph({
      sampledNodes: localSample.nodes,
      sampledEdges: localSample.edges,
      layout: previewLayout,
      scramblePositions,
      nodeFlags,
      edgeFlags,
      visibleNodeIds: runningVisibleSet,
      reducedMotion,
      animateToTarget: false,
      previewAnimation: false,
      edgeAlpha: 1,
    });
  }, [edgeFlags, localSample, nodeFlags, previewLayout, reducedMotion, runningVisibleSet, scramblePositions]);

  const solvingBundle = useMemo(() => {
    if (!solvingLayout || !localSample) return null;
    return buildSceneAndGraph({
      sampledNodes: localSample.nodes,
      sampledEdges: localSample.edges,
      layout: solvingLayout,
      scramblePositions,
      nodeFlags,
      edgeFlags,
      visibleNodeIds: runningVisibleSet,
      reducedMotion,
      animateToTarget: false,
      previewAnimation: false,
      edgeAlpha: drawingClarity,
    });
  }, [drawingClarity, edgeFlags, localSample, nodeFlags, reducedMotion, runningVisibleSet, scramblePositions, solvingLayout]);

  const solveStartPositions = useMemo(() => {
    if (!solvingLayout) return scramblePositions;
    return solvingLayout.positions.map(([, point]) => ({ x: point.x, y: point.y }));
  }, [scramblePositions, solvingLayout]);

  const precomputedBundle = useMemo(() => {
    if (!precomputedLayout || !localSample) return null;
    return buildSceneAndGraph({
      sampledNodes: localSample.nodes,
      sampledEdges: localSample.edges,
      layout: precomputedLayout,
      scramblePositions: precomputedLayout.positions.map(([, p]) => ({ x: p.x, y: p.y })),
      nodeFlags,
      edgeFlags,
      reducedMotion,
      animateToTarget: false,
      previewAnimation: false,
      edgeAlpha: 0.95,
    });
  }, [edgeFlags, localSample, nodeFlags, precomputedLayout, reducedMotion]);

  const resultBundle = useMemo(() => {
    if (!result) return null;
    return buildSceneAndGraph({
      sampledNodes: result.sampledGraph.nodes,
      sampledEdges: result.sampledGraph.edges,
      layout: result.layout,
      scramblePositions: solveStartPositions,
      nodeFlags,
      edgeFlags,
      reducedMotion,
      animateToTarget: true,
      previewAnimation: false,
      edgeAlpha: runPhase === 'FINAL_MORPH' ? 0.98 : 0.92,
    });
  }, [edgeFlags, nodeFlags, reducedMotion, result, runPhase, solveStartPositions]);

  const activeBundle = resultBundle
    ?? (runPhase === 'SCRAMBLE_INTRO' || runPhase === 'SOLVING_STREAM' ? solvingBundle ?? previewBundle : precomputedBundle ?? previewBundle);

  const comparePanels = useMemo(() => {
    if (!clampedControls.compare || sampleState.status !== 'ready' || !result) return [] as CompareModePanel[];

    const baseline: DatasetMode[] = result.planarity.isPlanar
      ? ['planar-straight', 'orthogonal', clampedControls.mode]
      : ['planarization-straight', 'planarization-orthogonal', clampedControls.mode];

    const desired = [...new Set([...baseline, ...clampedControls.compareModes, clampedControls.mode])]
      .filter((mode): mode is DatasetMode => MODE_ORDER.includes(mode as DatasetMode))
      .slice(0, 3);

    const panels = desired
      .map((mode) => {
        const modeResult = compareResults[mode];
        if (!modeResult) return null;
        const bundle = buildSceneAndGraph({
          sampledNodes: modeResult.sampledGraph.nodes,
          sampledEdges: modeResult.sampledGraph.edges,
          layout: modeResult.layout,
          scramblePositions,
          nodeFlags,
          edgeFlags,
          reducedMotion,
          animateToTarget: true,
          previewAnimation: false,
          edgeAlpha: 0.95,
        });

        return {
          id: mode,
          title: mode,
          scene: bundle.scene,
          bbox: bundle.bbox,
          graph: bundle.graph,
          planar: modeResult.planarity.isPlanar,
          crossings: Math.max(0, Number(modeResult.layout.crossings ?? 0)),
          bends: Math.max(0, Number(modeResult.layout.bends ?? 0)),
          layoutMs: Math.round(modeResult.timingsMs.layout ?? 0),
        };
      })
      .filter((panel): panel is NonNullable<typeof panel> => Boolean(panel));

    return panels as CompareModePanel[];
  }, [clampedControls.compare, clampedControls.compareModes, clampedControls.mode, compareResults, edgeFlags, nodeFlags, reducedMotion, result, sampleState.status, scramblePositions]);

  const updateDisplayStage = useCallback((next: { stage: WorkerStage; detail?: string }) => {
    if (!displayStage) {
      stageShownAtRef.current = Date.now();
      setDisplayStage(next);
      return;
    }

    if (displayStage.stage === next.stage) {
      setDisplayStage(next);
      return;
    }

    const elapsed = Date.now() - stageShownAtRef.current;
    const wait = Math.max(0, 180 - elapsed);

    if (stageTimerRef.current) window.clearTimeout(stageTimerRef.current);
    stageTimerRef.current = window.setTimeout(() => {
      stageShownAtRef.current = Date.now();
      setDisplayStage(next);
    }, wait);
  }, [displayStage]);

  const runCompute = useCallback(async () => {
    if (!dataset || !sampleDef || sampleState.status !== 'ready') return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    transitionRunPhase('SCRAMBLE_INTRO');
    setResult(null);
    setCompareResults({});
    setComputeError(null);
    setModeFallbackNote(null);
    setProgress({ stage: 'sample', detail: 'deterministic BFS sampling' });
    updateDisplayStage({ stage: 'sample', detail: 'deterministic BFS sampling' });

    setPartialSampleVisited([]);
    setPartialWitness(null);
    setPartialFaces(null);
    setPartialPositions(null);
    setPartialMetric(null);
    setSelectedNodeId(null);
    setMainCamera(undefined);
    setFitSignal((prev) => prev + 1);
    setReportOpen(false);
    revealUi();

    const startedAt = performance.now();

    const client = getTopoloomWorkerClient();

    const computeForMode = async (mode: DatasetMode, streamPartials: boolean) => {
      const payload: WorkerComputePayload = {
        datasetId: dataset.id,
        sampleId: sampleDef.id,
        nodes: sampleState.data.nodes,
        edges: sampleState.data.edges,
        geographic: sampleState.data.extras?.geographic,
        settings: {
          mode,
          boundarySelection: clampedControls.boundarySelection,
          maxNodes: clampedControls.maxNodes,
          maxEdges: clampedControls.maxEdges,
          seed: clampedControls.seed,
          showWitness: clampedControls.showWitness,
          liveSolve: streamPartials,
        },
      };

      return client.compute(payload, {
        signal: abort.signal,
        onProgress: (next) => {
          if (next.stage === 'report' && runPhaseRef.current !== 'FINAL_MORPH' && runPhaseRef.current !== 'IDLE_FINAL') {
            return;
          }
          setProgress(next);
          if (next.stage !== 'build-graph' && next.stage !== 'serialize' && next.stage !== 'report') {
            updateDisplayStage(next);
          }
        },
        onPartial: streamPartials
          ? (partial) => {
              if (partial.kind === 'sampleVisited') {
                const samplePartial = partial as SamplePartial;
                setPartialSampleVisited(samplePartial.visited);
                return;
              }
              if (partial.kind === 'witness') {
                setPartialWitness(partial as WitnessPartial);
                return;
              }
              if (partial.kind === 'faces') {
                setPartialFaces(partial as FacesPartial);
                return;
              }
              if (partial.kind === 'metric') {
                setPartialMetric(partial as MetricPartial);
                return;
              }
              if (partial.kind === 'positions') {
                const positionPartial = partial as PositionPartial;
                setPartialPositions((previous) => {
                  if (!previous) {
                    setFitSignal((prev) => prev + 1);
                    transitionRunPhase('SOLVING_STREAM');
                  }
                  return positionPartial;
                });
              }
            }
          : undefined,
      });
    };

    try {
      const primary = await computeForMode(clampedControls.mode, true);

      const minimumPreviewMs = reducedMotion ? 180 : 320;
      const elapsed = performance.now() - startedAt;
      if (elapsed < minimumPreviewMs) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, minimumPreviewMs - elapsed);
        });
      }

      setResult(primary);
      transitionRunPhase('FINAL_MORPH');
      setFitSignal((prev) => prev + 1);
      setPartialMetric({
        kind: 'metric',
        crossings: primary.planarity.isPlanar && primary.layout.mode === 'planar-straight'
          ? 0
          : Math.max(0, Number(primary.layout.crossings ?? 0)),
        residual: 0,
      });

      const actualPrimaryMode = (primary.layout.mode as DatasetMode) ?? clampedControls.mode;
      if (actualPrimaryMode !== clampedControls.mode) {
        setModeFallbackNote(`Selected ${clampedControls.mode} not possible -> using ${actualPrimaryMode}`);
      } else {
        setModeFallbackNote(null);
      }

      const compareMap: Record<string, WorkerResult> = {
        [actualPrimaryMode]: primary,
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
          const modeResult = await computeForMode(mode, false);
          compareMap[mode] = modeResult;
        }
      }

      setCompareResults(compareMap);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = error instanceof Error ? error.stack : undefined;
      setComputeError({ message: 'Compute failed', details: `${message}\n${details ?? ''}`.trim() });
      transitionRunPhase('IDLE_FINAL');
      setDisplayStage(null);
    }
  }, [clampedControls, dataset, reducedMotion, revealUi, sampleDef, sampleState, transitionRunPhase, updateDisplayStage]);

  useEffect(() => {
    if (sampleState.status !== 'ready') return;
    if (autoRunRef.current) return;
    autoRunRef.current = true;
    const timer = window.setTimeout(() => {
      void runCompute();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runCompute, sampleState.status]);

  useEffect(() => {
    autoRunRef.current = false;
  }, [datasetId, sampleDef?.id]);

  useEffect(() => {
    if (runPhase !== 'FINAL_MORPH') return;
    const finish = () => {
      transitionRunPhase('IDLE_FINAL');
      setProgress({ stage: 'report', detail: 'report ready' });
      updateDisplayStage({ stage: 'report', detail: 'report ready' });
      window.setTimeout(() => setDisplayStage(null), 520);
    };
    if (clampedControls.renderer === 'svg') {
      const timer = window.setTimeout(() => {
        finish();
      }, 920);
      return () => window.clearTimeout(timer);
    }
    if (!frameState.finalDeterministic && !reducedMotion) return;
    const timer = window.setTimeout(() => {
      finish();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clampedControls.renderer, frameState.finalDeterministic, reducedMotion, runPhase, transitionRunPhase, updateDisplayStage]);

  const selectedGraph = activeBundle?.graph ?? null;

  const actualMode = (result?.layout.mode as DatasetMode | undefined) ?? clampedControls.mode;

  const viewerStatus = useMemo(() => deriveStatus(result, clampedControls.mode, partialWitness), [clampedControls.mode, partialWitness, result]);

  const showWitnessSet = useMemo(() => {
    if (!clampedControls.showWitness) return undefined;
    const edges = result?.highlights.witnessEdges ?? partialWitness?.edges ?? [];
    return new Set(edges.map((edge) => edgeKey(edge)));
  }, [clampedControls.showWitness, partialWitness, result]);

  const showBridgesSet = useMemo(() => {
    if (!clampedControls.showBridges || !result?.highlights.bridges) return undefined;
    return new Set(result.highlights.bridges.map((edge) => edgeKey(edge)));
  }, [clampedControls.showBridges, result]);

  const showArticulationsSet = useMemo(() => {
    if (!clampedControls.showArticulations || !result?.highlights.articulationPoints) return undefined;
    return new Set(result.highlights.articulationPoints);
  }, [clampedControls.showArticulations, result]);

  const metrics = useMemo(() => {
    if (result) {
      return {
        nodes: result.sampledStats.nodes,
        edges: result.sampledStats.edges,
        crossings: runPhase === 'SOLVING_STREAM' || runPhase === 'FINAL_MORPH'
          ? (partialMetric?.crossings ?? viewerStatus.crossings)
          : viewerStatus.crossings,
        bends: Math.max(0, Number(result.layout.bends ?? 0)),
      };
    }
    if (localSample) {
      return {
        nodes: localSample.stats.nodes,
        edges: localSample.stats.edges,
        crossings: 0,
        bends: 0,
      };
    }
    return null;
  }, [localSample, partialMetric?.crossings, result, runPhase, viewerStatus.crossings]);

  const runBusy = runPhase !== 'IDLE_FINAL';

  const computeLabel = useMemo(() => {
    if (runPhase === 'SCRAMBLE_INTRO') return 'Scrambled (starting…)';
    if (runPhase === 'SOLVING_STREAM') return 'Solving (live)';
    if (runPhase === 'FINAL_MORPH') return 'Finalizing…';
    if (result || precomputedLayout) return 'Final (TopoLoom deterministic)';
    return 'Preview (animated)';
  }, [precomputedLayout, result, runPhase]);

  const stageText = useMemo(() => {
    if (!displayStage) return null;
    if (displayStage.stage === 'sample') {
      return `Sampling growth: ${partialSampleVisited.length.toLocaleString()} nodes revealed`;
    }
    if (displayStage.stage === 'planarity') {
      if (partialWitness) {
        return `Witness ${partialWitness.witnessKind} (${partialWitness.edges.length} edges)`;
      }
      return 'Testing planarity';
    }
    if (displayStage.stage === 'embedding') {
      return 'Resolving cyclic order around vertices';
    }
    if (displayStage.stage === 'mesh') {
      return partialFaces ? `Faces found: ${partialFaces.faceSizes.length}` : 'Building half-edge mesh';
    }
    if (displayStage.stage === 'layout') {
      const iter = partialPositions?.iter;
      const crossings = partialMetric?.crossings;
      if (iter && iter > 0 && Number.isFinite(crossings)) {
        return `Untangling (iter ${iter}) • drawing crossings ${crossings}`;
      }
      return iter && iter > 0 ? `Untangling live (iter ${iter})` : 'Untangling: scramble → deterministic layout';
    }
    if (displayStage.stage === 'report') {
      return 'Report ready';
    }
    return displayStage.detail ?? 'Serializing';
  }, [displayStage, partialFaces, partialMetric?.crossings, partialPositions?.iter, partialSampleVisited.length, partialWitness]);

  const pipelineActiveSteps = useMemo(() => {
    if (result?.planarity.isPlanar) return ['graph', 'planarity', 'embedding', 'mesh', 'layout', 'report'] as PipelineStepId[];
    if (result) return ['graph', 'planarity', 'layout', 'report'] as PipelineStepId[];
    if (partialPositions) {
      return partialFaces
        ? (['graph', 'planarity', 'embedding', 'mesh', 'layout'] as PipelineStepId[])
        : (['graph', 'planarity', 'layout'] as PipelineStepId[]);
    }
    if (partialFaces) return ['graph', 'planarity', 'embedding', 'mesh'] as PipelineStepId[];
    if (partialWitness) return ['graph', 'planarity'] as PipelineStepId[];
    if (partialSampleVisited.length > 0) return ['graph'] as PipelineStepId[];
    return ['graph'] as PipelineStepId[];
  }, [partialFaces, partialPositions, partialSampleVisited.length, partialWitness, result]);

  const pipelineCurrentStep = useMemo(() => {
    if (runPhase === 'SCRAMBLE_INTRO') return 'graph' as PipelineStepId;
    if (runPhase === 'SOLVING_STREAM') return 'layout' as PipelineStepId;
    if (runPhase === 'FINAL_MORPH') return 'layout' as PipelineStepId;
    if (runPhase === 'IDLE_FINAL' && result) return 'report' as PipelineStepId;
    if (!displayStage) return null;
    return stageToPipelineStep[displayStage.stage] ?? null;
  }, [displayStage, result, runPhase]);

  const pipelineCompletedSteps = useMemo(() => {
    const order: PipelineStepId[] = ['graph', 'planarity', 'embedding', 'mesh', 'layout', 'report'];
    const current = pipelineCurrentStep;
    if (!current) return [] as PipelineStepId[];
    const index = order.indexOf(current);
    if (index <= 0) return [] as PipelineStepId[];
    return order.slice(0, index);
  }, [pipelineCurrentStep]);

  const onPipelineStepClick = (step: PipelineStepId) => {
    const id = stepToReportSection[step];
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setReportOpen(true);
    setTab('report');
  };

  const copyShareLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied');
    } catch {
      window.prompt('Copy share link', url);
    }
  }, []);

  const exportPng = useCallback(() => {
    if (!dataset || !sampleDef || !selectedGraph) return;

    const legend = `${dataset.name} • ${sampleDef.label} • ${clampedControls.mode} • seed ${clampedControls.seed} • ${viewerStatus.text} • TopoLoom v${buildInfo.libraryVersion ?? 'unknown'}`;
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
          ctx.putImageData(new ImageData(rgba, capture.width, capture.height), 0, 0);
          ctx.fillStyle = 'rgba(2,6,23,0.92)';
          ctx.fillRect(14, capture.height - 50, Math.min(capture.width - 28, 980), 32);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '22px monospace';
          ctx.fillText(legend, 22, capture.height - 28);
          canvas.toBlob((blob) => {
            if (!blob) return;
            downloadBlob(fileName, blob);
          }, 'image/png');
          return;
        }
      }
    }

    const width = 1440;
    const height = 920;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const transform = mainCamera ?? {
      scale: 1,
      translateX: width / 2,
      translateY: height / 2,
    };

    drawGraphToCanvas(ctx, width, height, selectedGraph, transform, {
      showLabels: clampedControls.showLabels,
      highlightWitnessEdges: showWitnessSet,
      highlightBridges: showBridgesSet,
      highlightArticulations: showArticulationsSet,
    });

    ctx.fillStyle = 'rgba(2,6,23,0.92)';
    ctx.fillRect(12, height - 32, Math.min(width - 24, 980), 20);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px monospace';
    ctx.fillText(legend, 18, height - 17);

    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(fileName, blob);
    }, 'image/png');
  }, [buildInfo.libraryVersion, clampedControls.compare, clampedControls.mode, clampedControls.renderer, clampedControls.seed, clampedControls.showLabels, dataset, mainCamera, sampleDef, selectedGraph, showArticulationsSet, showBridgesSet, showWitnessSet, viewerStatus.text]);

  const exportSvg = useCallback(() => {
    if (!dataset || !sampleDef || !selectedGraph) return;

    const width = 1400;
    const height = 900;
    const camera = mainCamera ?? {
      scale: 1,
      translateX: width / 2,
      translateY: height / 2,
    };

    const legend = `${dataset.name} • ${sampleDef.label} • ${clampedControls.mode} • seed ${clampedControls.seed} • ${viewerStatus.text} • TopoLoom v${buildInfo.libraryVersion ?? 'unknown'}`;
    const svg = makeSvgString({
      graph: selectedGraph,
      width,
      height,
      camera,
      showLabels: clampedControls.showLabels,
      highlightWitnessEdges: showWitnessSet,
      highlightBridges: showBridgesSet,
      highlightArticulations: showArticulationsSet,
      legend,
    });

    const fileName = `topoloom_${dataset.id}_${sampleDef.id}_${clampedControls.mode}_seed${clampedControls.seed}.svg`;
    downloadBlob(fileName, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  }, [buildInfo.libraryVersion, clampedControls.mode, clampedControls.seed, clampedControls.showLabels, dataset, mainCamera, sampleDef, selectedGraph, showArticulationsSet, showBridgesSet, showWitnessSet, viewerStatus.text]);

  const buildLabel = `TopoLoom v${buildInfo.libraryVersion ?? 'unknown'} • ${shortSha(buildInfo.gitSha)} • ${formatBuildDate(buildInfo.builtAt)}`;

  const chromeVisible = !cinema || uiVisible || controlsOpen || reportOpen;

  if (!dataset) {
    return (
      <div className="m-4 rounded-xl border border-red-300/30 bg-red-500/20 p-4 text-sm text-red-100">
        Unknown dataset. Return to <Link className="underline" to="/gallery">Gallery</Link>.
      </div>
    );
  }

  return (
    <div className="theme-cinema relative h-full overflow-hidden" onMouseMove={revealUi} onTouchStart={revealUi}>
      <div className="fixed inset-0 z-0">
        {sampleState.status === 'loading' ? <div className="h-full w-full animate-pulse bg-slate-900" /> : null}

        {sampleState.status === 'error' ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="rounded-xl border border-red-300/30 bg-red-500/20 p-4 text-sm text-red-100">
              Dataset load failed: {sampleState.message}
            </div>
          </div>
        ) : null}

        {sampleState.status === 'ready' && activeBundle && !clampedControls.compare ? (
          clampedControls.renderer === 'webgl' ? (
            <WebGLViewport
              ref={mainViewportRef}
              className="h-full w-full rounded-none border-0"
              scene={activeBundle.scene}
              bbox={activeBundle.bbox}
              camera={mainCamera}
              onCameraChange={setMainCamera}
              onNodePick={(nodeId) => setSelectedNodeId(nodeId)}
              onFrameState={setFrameState}
              onInteraction={revealUi}
              autoFitOnSceneChange={false}
              fitSignal={fitSignal}
            />
          ) : (
            <SvgViewport
              className="h-full w-full rounded-none border-0 bg-black"
              graph={activeBundle.graph}
              showLabels={clampedControls.showLabels}
              highlightWitnessEdges={showWitnessSet}
              highlightBridges={showBridgesSet}
              highlightArticulations={showArticulationsSet}
            />
          )
        ) : null}

        {sampleState.status === 'ready' && clampedControls.compare ? (
          <div className="absolute inset-0">
            <CompareLayout
              panels={comparePanels}
              renderer={clampedControls.renderer}
              syncCamera={clampedControls.syncCompareView}
              showLabels={clampedControls.showLabels}
              onInteraction={revealUi}
            />
          </div>
        ) : null}
      </div>

      <HUD
        visible={chromeVisible}
        datasetName={dataset.name}
        sampleLabel={sampleDef?.label ?? ''}
        modeLabel={actualMode}
        stageLabel={displayStage ? STAGE_LABEL[displayStage.stage] : undefined}
        computeLabel={computeLabel}
        status={{ text: viewerStatus.text, tone: viewerStatus.tone }}
        modeNote={modeFallbackNote ?? undefined}
        metrics={metrics}
        timings={result?.timingsMs}
        buildLabel={sampleDef?.precomputedFile && !result ? `${buildLabel} • precomputed asset` : buildLabel}
        onResetView={() => mainViewportRef.current?.resetView()}
      />

      <TopRightActions
        visible={chromeVisible}
        onControls={() => setControlsOpen(true)}
        onReport={() => {
          setReportOpen(true);
          setTab('report');
        }}
      />

      <AnimatePresence>
        {chromeVisible ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-auto fixed left-1/2 top-3 z-30 -translate-x-1/2"
          >
            <PipelineStrip
              activeSteps={pipelineActiveSteps}
              completedSteps={pipelineCompletedSteps}
              currentStep={pipelineCurrentStep}
              onStepClick={onPipelineStepClick}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {displayStage && runBusy ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.02, opacity: 0 }}
              className="glass-panel px-6 py-5 text-center"
            >
              <div className="text-[12px] uppercase tracking-[0.24em] text-cyan-200/90">{STAGE_LABEL[displayStage.stage]}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-50">LAYOUT</div>
              <div className="mt-1 text-sm text-slate-100">{stageText}</div>
              {partialMetric ? (
                <div className="mt-1 text-xs text-slate-200">
                  Drawing crossings: {partialMetric.crossings}
                  {typeof partialMetric.residual === 'number'
                    ? ` • residual ${partialMetric.residual.toFixed(3)}`
                    : ''}
                </div>
              ) : null}
              {progress?.stage === displayStage.stage && result?.timingsMs?.[displayStage.stage] ? (
                <div className="mt-1 text-xs text-slate-300">{Math.round(result.timingsMs[displayStage.stage] ?? 0)} ms</div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {computeError ? (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-red-300/35 bg-red-500/20 px-3 py-2 text-xs text-red-100">
          {computeError.message}
        </div>
      ) : null}

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
        running={runBusy}
        error={computeError}
        clampedWarning={clampedWarning}
        facesAvailable={facesAvailable}
        hasGeographic={hasGeographic}
      />

      <Sheet open={reportOpen} onOpenChange={setReportOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[50vh] h-[46vh] w-full overflow-y-auto rounded-t-2xl border-t border-slate-400/30 p-0"
        >
          <div className="glass-panel-strong min-h-full rounded-none p-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as 'report' | 'raw')}>
              <TabsList>
                <TabsTrigger value="report">Report</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="report" className="mt-3 max-h-[36vh] overflow-auto pr-1">
                <ReportCard result={result} />
              </TabsContent>
              <TabsContent value="raw" className="mt-3 max-h-[36vh] overflow-auto pr-1">
                <JsonInspector data={result ?? { status: 'no-result' }} />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <AttributionModal open={attributionOpen} onOpenChange={setAttributionOpen} datasets={datasets} />

      {!cinema ? (
        <div className="pointer-events-auto fixed bottom-3 left-3 z-30">
          <Button size="sm" variant="ghost" onClick={() => setCinema(true)}>
            Re-enter cinema
          </Button>
        </div>
      ) : null}
    </div>
  );
}
