import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  applyWheelZoom,
  clampScale,
  createIdentityTransform,
  fitTransformToBBox,
  panTransform,
  worldToScreen,
  zoomAtPoint,
  type PanZoomTransform,
} from '@/components/viewports/panZoomController';
import type { ViewportGraph } from '@/components/viewports/types';

export type CanvasViewportProps = {
  graph: ViewportGraph;
  className?: string;
  showLabels?: boolean;
  highlightWitnessEdges?: Set<string>;
  highlightBridges?: Set<string>;
  highlightArticulations?: Set<number>;
  transform?: PanZoomTransform;
  onTransformChange?: (next: PanZoomTransform) => void;
  onViewportSize?: (size: { width: number; height: number }) => void;
};

function edgeKey(edge: [number, number]) {
  return edge[0] < edge[1] ? `${edge[0]},${edge[1]}` : `${edge[1]},${edge[0]}`;
}

function nodeRadiusFromDegree(degree: number) {
  if (degree <= 2) return 3.5;
  if (degree <= 4) return 4.5;
  if (degree <= 8) return 5.5;
  return 6.5;
}

export function CanvasViewport({
  graph,
  className,
  showLabels = false,
  highlightWitnessEdges,
  highlightBridges,
  highlightArticulations,
  transform,
  onTransformChange,
  onViewportSize,
}: CanvasViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });
  const [internalTransform, setInternalTransform] = useState<PanZoomTransform>(createIdentityTransform);

  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const pinchStart = useRef<{
    distance: number;
    center: { x: number; y: number };
    transform: PanZoomTransform;
  } | null>(null);

  const currentTransform = transform ?? internalTransform;

  const setTransform = (next: PanZoomTransform) => {
    const sanitized = {
      scale: clampScale(next.scale),
      translateX: next.translateX,
      translateY: next.translateY,
    };

    if (transform === undefined) {
      setInternalTransform(sanitized);
    }
    onTransformChange?.(sanitized);
  };

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
      setSize(next);
      onViewportSize?.(next);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [onViewportSize]);

  useEffect(() => {
    const fit = fitTransformToBBox(graph.bbox, size.width, size.height, 24);
    setTransform(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.bbox.minX, graph.bbox.minY, graph.bbox.maxX, graph.bbox.maxY, size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const edge of graph.edges) {
      const key = edgeKey(edge.edge);
      const isWitness = highlightWitnessEdges?.has(key) ?? false;
      const isBridge = highlightBridges?.has(key) ?? false;
      ctx.strokeStyle = isWitness ? '#dc2626' : isBridge ? '#d97706' : 'rgba(15,23,42,0.55)';
      ctx.lineWidth = isWitness ? 2.5 : isBridge ? 2.2 : 1.6;
      ctx.beginPath();
      edge.points.forEach((point, index) => {
        const p = worldToScreen(point, currentTransform);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    for (const node of graph.nodes) {
      const p = worldToScreen({ x: node.x, y: node.y }, currentTransform);
      const r = nodeRadiusFromDegree(node.degree);
      const isArticulation = highlightArticulations?.has(node.id) ?? false;
      ctx.fillStyle = isArticulation ? '#0284c7' : '#0f172a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (showLabels) {
        ctx.fillStyle = '#334155';
        ctx.font = '11px var(--font-mono), monospace';
        ctx.fillText(node.label, p.x + r + 3, p.y - r - 2);
      }
    }
  }, [
    currentTransform,
    graph,
    highlightArticulations,
    highlightBridges,
    highlightWitnessEdges,
    showLabels,
    size.height,
    size.width,
  ]);

  const toLocalPoint = (clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const local = toLocalPoint(event.clientX, event.clientY);
    activePointers.current.set(event.pointerId, local);
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);

    if (activePointers.current.size === 1) {
      panStart.current = local;
      pinchStart.current = null;
      return;
    }

    if (activePointers.current.size === 2) {
      const [a, b] = [...activePointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinchStart.current = {
        distance,
        center,
        transform: currentTransform,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointers.current.has(event.pointerId)) return;
    const local = toLocalPoint(event.clientX, event.clientY);
    activePointers.current.set(event.pointerId, local);

    if (activePointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...activePointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const base = pinchStart.current;
      const ratio = distance / base.distance;
      const zoomed = zoomAtPoint(base.transform, base.center, ratio);
      setTransform({
        ...zoomed,
        translateX: zoomed.translateX + (center.x - base.center.x),
        translateY: zoomed.translateY + (center.y - base.center.y),
      });
      return;
    }

    if (activePointers.current.size === 1 && panStart.current) {
      const dx = local.x - panStart.current.x;
      const dy = local.y - panStart.current.y;
      setTransform(panTransform(currentTransform, { dx, dy }));
      panStart.current = local;
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
    if (activePointers.current.size === 0) panStart.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const local = toLocalPoint(event.clientX, event.clientY);
    setTransform(applyWheelZoom(currentTransform, local, event.deltaY));
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const local = toLocalPoint(event.clientX, event.clientY);
    setTransform(zoomAtPoint(currentTransform, local, 1.2));
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('relative h-[420px] w-full overflow-hidden rounded-xl border bg-background/80', className)}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        aria-label="Graph canvas viewport"
      />
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground">
        Canvas renderer
      </div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="absolute right-3 top-3"
        onClick={() => {
          setTransform(fitTransformToBBox(graph.bbox, size.width, size.height, 24));
        }}
      >
        Reset view
      </Button>
    </div>
  );
}
