import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PipelineDiagram } from '@/components/gallery/PipelineDiagram';
import { CanvasViewport } from '@/components/viewports/CanvasViewport';
import type { PanZoomTransform } from '@/components/viewports/panZoomController';
import type { ViewportGraph } from '@/components/viewports/types';
import { readDemoQuery } from '@/lib/demoQuery';

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

type HeroDataState =
  | { status: 'loading' }
  | { status: 'ready'; naive: ViewportGraph; topoloom: ViewportGraph; overlay: string }
  | { status: 'error'; message: string };

function buildTopoloomGraph(hero: HeroGraphJson, layout: HeroLayoutJson): ViewportGraph {
  const degree = new Array(hero.nodes.length).fill(0);
  for (const [u, v] of hero.edges) {
    if (u >= 0 && u < degree.length) degree[u] += 1;
    if (v >= 0 && v < degree.length) degree[v] += 1;
  }

  const posMap = new Map(layout.positions);
  const nodes = hero.nodes.map((label, id) => {
    const p = posMap.get(id) ?? { x: 0, y: 0 };
    return {
      id,
      label,
      x: p.x,
      y: p.y,
      degree: degree[id] ?? 0,
    };
  });

  const edges = layout.edgeRoutes?.length
    ? layout.edgeRoutes.map((route) => ({ edge: route.edge, points: route.points }))
    : hero.edges.map((edge) => ({
        edge,
        points: [
          posMap.get(edge[0]) ?? { x: 0, y: 0 },
          posMap.get(edge[1]) ?? { x: 0, y: 0 },
        ],
      }));

  return {
    nodes,
    edges,
    bbox: layout.bbox,
  };
}

function buildNaiveGraph(hero: HeroGraphJson, referenceBBox: ViewportGraph['bbox']): ViewportGraph {
  const degree = new Array(hero.nodes.length).fill(0);
  for (const [u, v] of hero.edges) {
    if (u >= 0 && u < degree.length) degree[u] += 1;
    if (v >= 0 && v < degree.length) degree[v] += 1;
  }

  const width = Math.max(1, referenceBBox.maxX - referenceBBox.minX);
  const height = Math.max(1, referenceBBox.maxY - referenceBBox.minY);
  const cx = (referenceBBox.minX + referenceBBox.maxX) / 2;
  const cy = (referenceBBox.minY + referenceBBox.maxY) / 2;
  const radius = Math.max(80, Math.min(width, height) * 0.45);

  const nodes = hero.nodes.map((label, id) => {
    const angle = (id / Math.max(1, hero.nodes.length)) * Math.PI * 2;
    return {
      id,
      label,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      degree: degree[id] ?? 0,
    };
  });

  const points = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const edges = hero.edges.map((edge) => ({
    edge,
    points: [points.get(edge[0]) ?? { x: 0, y: 0 }, points.get(edge[1]) ?? { x: 0, y: 0 }],
  }));

  return {
    nodes,
    edges,
    bbox: {
      minX: cx - radius,
      maxX: cx + radius,
      minY: cy - radius,
      maxY: cy + radius,
    },
  };
}

function isHeroGraphJson(raw: unknown): raw is HeroGraphJson {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  return Array.isArray(record.nodes) && Array.isArray(record.edges);
}

function isHeroLayoutJson(raw: unknown): raw is HeroLayoutJson {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  return (
    Array.isArray(record.positions) &&
    Array.isArray(record.edgeRoutes) &&
    !!record.bbox &&
    typeof record.bbox === 'object'
  );
}

export function Landing() {
  const { search } = useLocation();
  const { embed } = readDemoQuery(search);

  const [heroData, setHeroData] = useState<HeroDataState>({ status: 'loading' });
  const [syncViews, setSyncViews] = useState(true);
  const [sharedTransform, setSharedTransform] = useState<PanZoomTransform | undefined>(undefined);
  const [naiveTransform, setNaiveTransform] = useState<PanZoomTransform | undefined>(undefined);
  const [topoloomTransform, setTopoloomTransform] = useState<PanZoomTransform | undefined>(undefined);

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/datasets/hero.json'), fetch('/datasets/hero-layout.json')])
      .then(async ([heroRes, layoutRes]) => {
        if (!heroRes.ok || !layoutRes.ok) {
          throw new Error('Failed to load hero graph assets');
        }
        const heroRaw = (await heroRes.json()) as unknown;
        const layoutRaw = (await layoutRes.json()) as unknown;
        if (!isHeroGraphJson(heroRaw) || !isHeroLayoutJson(layoutRaw)) {
          throw new Error('Hero graph payload is malformed');
        }

        const hero = heroRaw;
        const layout = layoutRaw;
        const topoloom = buildTopoloomGraph(hero, layout);
        const naive = buildNaiveGraph(hero, topoloom.bbox);
        const planar = layout.meta?.planar ?? true;
        const crossings = Math.max(0, Number(layout.meta?.crossings ?? 0));
        const overlay = planar
          ? 'crossings: 0 (planar)'
          : `crossings: ${crossings} (planarized)`;

        if (!active) return;
        setHeroData({ status: 'ready', naive, topoloom, overlay });
      })
      .catch((error) => {
        if (!active) return;
        setHeroData({
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

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border bg-background/80 p-6 shadow-sm lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.14),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_55%)]" />
        <div className="relative space-y-5">
          <Badge variant="outline">Topology-first graph drawing kernel</Badge>
          <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-foreground md:text-5xl">
            From hairball to blueprint.
          </h2>
          <p className="max-w-4xl text-base text-muted-foreground">
            TopoLoom computes planarity, embeddings, BC/SPQR decompositions, dual routing, and
            flow constraints, then emits deterministic coordinate pipelines you can render
            anywhere.
          </p>

          <ul className="grid gap-2 text-sm text-foreground/90 md:grid-cols-2">
            {proofBullets.map((bullet) => (
              <li key={bullet} className="rounded-md border bg-background/70 px-3 py-2">
                {bullet}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/gallery">Try Real Data Gallery</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/demo/planarity">Explore demos</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/api">API</Link>
            </Button>
          </div>

          <p className="max-w-4xl text-sm text-muted-foreground">
            TopoLoom doesn’t paint pixels. It gives you topology objects that make layouts reliable
            and then hands you coordinates to render with SVG, Canvas, or WebGL.
          </p>

          <div className="flex items-center justify-between rounded-lg border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <span>Synchronized pan/zoom</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={syncViews}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSyncViews(checked);
                  if (checked) {
                    setSharedTransform(topoloomTransform ?? naiveTransform ?? sharedTransform);
                  } else {
                    setNaiveTransform(sharedTransform ?? naiveTransform);
                    setTopoloomTransform(sharedTransform ?? topoloomTransform);
                  }
                }}
              />
              <span>{syncViews ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        </div>

        <div className="relative mt-6 space-y-3" data-testid="demo-capture">
          {heroData.status === 'loading' ? (
            <div className="h-[420px] animate-pulse rounded-2xl border bg-muted/40" />
          ) : null}

          {heroData.status === 'error' ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              Hero sample failed to load: {heroData.message}
            </div>
          ) : null}

          {heroData.status === 'ready' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Naive</div>
                <CanvasViewport
                  graph={heroData.naive}
                  showLabels={false}
                  transform={syncViews ? sharedTransform : naiveTransform}
                  onTransformChange={(next) => {
                    if (syncViews) setSharedTransform(next);
                    else setNaiveTransform(next);
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">TopoLoom</div>
                <div className="relative">
                  <CanvasViewport
                    graph={heroData.topoloom}
                    showLabels={false}
                    transform={syncViews ? sharedTransform : topoloomTransform}
                    onTransformChange={(next) => {
                      if (syncViews) setSharedTransform(next);
                      else setTopoloomTransform(next);
                    }}
                  />
                  <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-2 py-1 text-xs text-emerald-700">
                    {heroData.overlay}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div data-testid="demo-ready" data-ready={heroData.status === 'ready' ? '1' : '0'} />
        </div>
      </section>

      <PipelineDiagram
        activeSteps={['graph', 'planarity', 'embedding', 'mesh', 'layout']}
        className="bg-background/80"
      />

      {!embed ? (
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-muted/70 bg-background/90">
            <CardContent className="space-y-2 p-5">
              <div className="text-sm font-semibold text-foreground">Kernel, not renderer</div>
              <p className="text-sm text-muted-foreground">
                Deterministic topology objects first, rendering stack second.
              </p>
            </CardContent>
          </Card>
          <Card className="border-muted/70 bg-background/90">
            <CardContent className="space-y-2 p-5">
              <div className="text-sm font-semibold text-foreground">Inspectable topology</div>
              <p className="text-sm text-muted-foreground">
                Faces, blocks, articulation points, and SPQR summaries are first-class outputs.
              </p>
            </CardContent>
          </Card>
          <Card className="border-muted/70 bg-background/90">
            <CardContent className="space-y-2 p-5">
              <div className="text-sm font-semibold text-foreground">Real data confidence</div>
              <p className="text-sm text-muted-foreground">
                Curated public datasets with explicit attribution and deterministic reproductions.
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
