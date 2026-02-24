import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { CameraTransform, RendererSceneInput } from '@/gl/GraphRenderer';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Slider } from '@/ui/Slider';
import { PipelineStrip } from '@/components/PipelineStrip';
import { WebGLViewport } from '@/components/viewports/WebGLViewport';

import { datasets } from '@/data/datasets';

type HeroGraphJson = {
  nodes: string[];
  edges: Array<[number, number]>;
};

type HeroLayoutJson = {
  meta?: {
    planar?: boolean;
    crossings?: number;
  };
  positions: Array<[number, { x: number; y: number }]>;
  edgeRoutes: Array<{ edge: [number, number]; points: Array<{ x: number; y: number }> }>;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type HeroState =
  | { status: 'loading' }
  | {
      status: 'ready';
      naiveScene: RendererSceneInput;
      topoloomScene: RendererSceneInput;
      bbox: { minX: number; minY: number; maxX: number; maxY: number };
      overlay: string;
    }
  | { status: 'error'; message: string };

function isHeroGraphJson(raw: unknown): raw is HeroGraphJson {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Record<string, unknown>;
  return Array.isArray(value.nodes) && Array.isArray(value.edges);
}

function isHeroLayoutJson(raw: unknown): raw is HeroLayoutJson {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Record<string, unknown>;
  return Array.isArray(value.positions) && Array.isArray(value.edgeRoutes) && typeof value.bbox === 'object';
}

function buildDegreeMap(nodeCount: number, edges: Array<[number, number]>) {
  const degree = new Array(nodeCount).fill(0);
  for (const [u, v] of edges) {
    if (u >= 0 && u < nodeCount) degree[u] += 1;
    if (v >= 0 && v < nodeCount) degree[v] += 1;
  }
  return degree;
}

function buildNaivePreview(hero: HeroGraphJson, bbox: HeroLayoutJson['bbox']) {
  const width = Math.max(1, bbox.maxX - bbox.minX);
  const height = Math.max(1, bbox.maxY - bbox.minY);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const radius = Math.max(80, Math.min(width, height) * 0.42);

  return hero.nodes.map((_, id) => {
    const angle = (id / Math.max(1, hero.nodes.length)) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

function toRouteSegments(
  edgeRoutes: HeroLayoutJson['edgeRoutes'],
  edgeFlags?: Map<string, number>,
): RendererSceneInput['routeSegments'] {
  const segments: NonNullable<RendererSceneInput['routeSegments']> = [];
  for (const route of edgeRoutes) {
    const key = route.edge[0] < route.edge[1] ? `${route.edge[0]},${route.edge[1]}` : `${route.edge[1]},${route.edge[0]}`;
    const flag = edgeFlags?.get(key) ?? 0;
    for (let i = 1; i < route.points.length; i += 1) {
      const a = route.points[i - 1];
      const b = route.points[i];
      segments.push({ a, b, flags: flag, width: 1.5 });
    }
  }
  return segments;
}

export function Landing() {
  const [hero, setHero] = useState<HeroState>({ status: 'loading' });
  const [split, setSplit] = useState(58);
  const [camera, setCamera] = useState<CameraTransform | undefined>(undefined);

  useEffect(() => {
    let active = true;

    Promise.all([fetch('/datasets/hero.json'), fetch('/datasets/hero-layout.json')])
      .then(async ([heroRes, layoutRes]) => {
        if (!heroRes.ok || !layoutRes.ok) {
          throw new Error('Failed to load hero assets');
        }
        const heroRaw = (await heroRes.json()) as unknown;
        const layoutRaw = (await layoutRes.json()) as unknown;
        if (!isHeroGraphJson(heroRaw) || !isHeroLayoutJson(layoutRaw)) {
          throw new Error('Hero payload is malformed');
        }

        const graph = heroRaw;
        const layout = layoutRaw;
        const degree = buildDegreeMap(graph.nodes.length, graph.edges);
        const targetMap = new Map(layout.positions);
        const naive = buildNaivePreview(graph, layout.bbox);

        const naiveScene: RendererSceneInput = {
          seed: 1,
          preview: true,
          nodes: graph.nodes.map((label, id) => ({
            id,
            label,
            degree: degree[id] ?? 0,
            preview: naive[id] ?? { x: 0, y: 0 },
          })),
          edges: graph.edges.map(([u, v]) => ({ u, v })),
        };

        const topoloomScene: RendererSceneInput = {
          seed: 1,
          preview: false,
          nodes: graph.nodes.map((label, id) => ({
            id,
            label,
            degree: degree[id] ?? 0,
            preview: targetMap.get(id) ?? { x: 0, y: 0 },
          })),
          edges: graph.edges.map(([u, v]) => ({ u, v })),
          routeSegments: toRouteSegments(layout.edgeRoutes),
        };

        const planar = layout.meta?.planar ?? true;
        const crossings = Math.max(0, Number(layout.meta?.crossings ?? 0));

        if (!active) return;
        setHero({
          status: 'ready',
          naiveScene,
          topoloomScene,
          bbox: layout.bbox,
          overlay: planar ? 'crossings: 0 (planar)' : `crossings: ${crossings} (planarized)`,
        });
      })
      .catch((error) => {
        if (!active) return;
        setHero({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const proofBullets = useMemo(
    () => [
      'Planarity + witnesses: know why a drawing fails.',
      'Half-edge mesh + faces: explicit embeddings you can inspect.',
      'BC-tree + SPQR: decompose complexity before layout.',
      'Dual routing + planarization: topology-aware edge insertion.',
      'Deterministic outputs: stable ordering, serializable artifacts.',
    ],
    [],
  );

  const largePrecomputedHint = useMemo(() => {
    const precomputed = datasets
      .flatMap((d) => d.sampleFiles)
      .find((sample) => 'precomputedFile' in sample && Boolean((sample as { precomputedFile?: string }).precomputedFile));
    return precomputed?.label;
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.35),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.32),transparent_42%),#020617] text-white">
      <section className="relative h-screen">
        {hero.status === 'ready' ? (
          <div className="absolute inset-0">
            <WebGLViewport
              className="h-full w-full rounded-none border-0"
              scene={hero.naiveScene}
              bbox={hero.bbox}
              camera={camera}
              onCameraChange={setCamera}
            />
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            >
              <WebGLViewport
                className="h-full w-full rounded-none border-0"
                scene={hero.topoloomScene}
                bbox={hero.bbox}
                camera={camera}
                onCameraChange={setCamera}
              />
            </div>

            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-white/80"
              style={{ left: `${split}%` }}
            />

            <div className="absolute left-4 top-4 z-10 rounded-md border border-white/20 bg-black/55 px-2 py-1 text-xs text-white/85">
              Naive
            </div>
            <div
              className="absolute top-4 z-10 rounded-md border border-white/20 bg-black/55 px-2 py-1 text-xs text-white/85"
              style={{ left: `calc(${split}% + 12px)` }}
            >
              TopoLoom
            </div>
            <div className="absolute right-4 top-4 z-10 rounded-md border border-emerald-300/40 bg-black/55 px-2 py-1 text-xs text-emerald-200">
              {hero.overlay}
            </div>

            <div className="absolute bottom-8 left-1/2 z-10 w-[min(90vw,460px)] -translate-x-1/2 rounded-full border border-white/25 bg-black/55 px-4 py-2 backdrop-blur">
              <Slider
                ariaLabel="A/B reveal slider"
                min={5}
                max={95}
                value={split}
                onValueChange={setSplit}
              />
            </div>
          </div>
        ) : null}

        {hero.status === 'loading' ? (
          <div className="absolute inset-0 animate-pulse bg-slate-900" />
        ) : null}

        {hero.status === 'error' ? (
          <div className="absolute inset-x-4 top-24 z-20 rounded-xl border border-red-400/40 bg-red-500/15 p-4 text-sm text-red-100">
            Hero failed to load: {hero.message}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/60" />

        <div className="relative z-20 mx-auto flex h-full w-full max-w-7xl flex-col justify-between px-4 py-6 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="neutral" className="border-white/40 bg-black/45 text-white">
              Topology-first graph drawing kernel
            </Badge>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" className="pointer-events-auto border-white/40 bg-black/45 text-white hover:bg-black/70">
                <Link to="/api">API</Link>
              </Button>
            </div>
          </div>

          <div className="max-w-3xl space-y-4 pb-8">
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">From hairball to blueprint.</h1>
            <p className="max-w-2xl text-sm text-white/85 md:text-base">
              TopoLoom computes planarity, embeddings, BC/SPQR decompositions, dual routing, and flow constraints
              and emits deterministic coordinate pipelines you can render anywhere.
            </p>
            <ul className="grid gap-1.5 text-xs text-white/80 md:grid-cols-2">
              {proofBullets.map((bullet) => (
                <li key={bullet} className="rounded-md border border-white/15 bg-black/35 px-2 py-1.5">
                  {bullet}
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/70 md:text-sm">
              TopoLoom doesn’t paint pixels. It gives you topology objects that make layouts reliable and then hands
              you coordinates to render with SVG, Canvas, or WebGL.
            </p>
            <div className="pointer-events-auto flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/gallery">Try Real Data Gallery</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="border-white/40 bg-black/45 text-white hover:bg-black/70">
                <Link to="/demo/planarity">Explore demos</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-3 left-4 z-20">
          <PipelineStrip activeSteps={['graph', 'planarity', 'embedding', 'mesh', 'layout', 'report']} />
        </div>

        {largePrecomputedHint ? (
          <div className="absolute bottom-3 right-4 z-20 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-[11px] text-white/75">
            Gallery includes instant large precomputed sample: {largePrecomputedHint}
          </div>
        ) : null}
      </section>
    </div>
  );
}
