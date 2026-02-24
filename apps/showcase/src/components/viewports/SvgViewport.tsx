import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  applyWheelZoom,
  clampScale,
  createIdentityTransform,
  fitTransformToBBox,
  panTransform,
  zoomAtPoint,
  type PanZoomTransform,
} from '@/components/viewports/panZoomController';
import type { ViewportGraph } from '@/components/viewports/types';

export type SvgViewportProps = {
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

export function SvgViewport({
  graph,
  className,
  showLabels = false,
  highlightWitnessEdges,
  highlightBridges,
  highlightArticulations,
  transform,
  onTransformChange,
  onViewportSize,
}: SvgViewportProps) {
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
    setTransform(fitTransformToBBox(graph.bbox, size.width, size.height, 24));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.bbox.minX, graph.bbox.minY, graph.bbox.maxX, graph.bbox.maxY, size.width, size.height]);

  const toLocalPoint = (clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const local = toLocalPoint(event.clientX, event.clientY);
    activePointers.current.set(event.pointerId, local);
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);

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

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
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

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
    if (activePointers.current.size === 0) panStart.current = null;
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const local = toLocalPoint(event.clientX, event.clientY);
    setTransform(applyWheelZoom(currentTransform, local, event.deltaY));
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const local = toLocalPoint(event.clientX, event.clientY);
    setTransform(zoomAtPoint(currentTransform, local, 1.2));
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('relative h-[420px] w-full overflow-hidden rounded-xl border bg-background/80', className)}
    >
      <svg
        width="100%"
        height="100%"
        className="touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        aria-label="Graph SVG viewport"
      >
        <rect x={0} y={0} width={size.width} height={size.height} fill="rgba(255,255,255,0.96)" />
        <g
          transform={`translate(${currentTransform.translateX}, ${currentTransform.translateY}) scale(${currentTransform.scale})`}
        >
          {graph.edges.map((edge) => {
            const key = edgeKey(edge.edge);
            const isWitness = highlightWitnessEdges?.has(key) ?? false;
            const isBridge = highlightBridges?.has(key) ?? false;
            const stroke = isWitness ? '#dc2626' : isBridge ? '#d97706' : 'rgba(15,23,42,0.55)';
            const width = isWitness ? 2.5 : isBridge ? 2.2 : 1.6;
            return (
              <polyline
                key={`${edge.edge[0]}-${edge.edge[1]}-${edge.points.length}`}
                points={edge.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={width / currentTransform.scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {graph.nodes.map((node) => {
            const isArticulation = highlightArticulations?.has(node.id) ?? false;
            const r = nodeRadiusFromDegree(node.degree) / currentTransform.scale;
            return (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r={r} fill={isArticulation ? '#0284c7' : '#0f172a'} />
                {showLabels ? (
                  <text
                    x={node.x + (r + 2.5)}
                    y={node.y - (r + 1.5)}
                    fontSize={10 / currentTransform.scale}
                    fill="#334155"
                  >
                    {node.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground">
        SVG renderer
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
