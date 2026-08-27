import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { GraphNode } from '@/components/demo/graph-model';
import type { Point, EdgePath } from '@khalidsaidi/topoloom/layout';

export type SvgViewportProps = {
  nodes: GraphNode[];
  edges: EdgePath[];
  highlightedEdges?: Set<number>;
  highlightedNodes?: Set<number>;
  onNodeMove?: (id: number, x: number, y: number) => void;
  onNodeClick?: (id: number) => void;
  className?: string;
  /**
   * Change this value to re-fit the viewport to the current content (e.g.
   * pass the signature of a freshly computed layout). Reset view always
   * re-fits regardless.
   */
  fitKey?: unknown;
};

type ViewBox = { x: number; y: number; w: number; h: number };

const DEFAULT_BOX: ViewBox = { x: -200, y: -140, w: 400, h: 280 };

const contentBox = (nodes: GraphNode[], edges: EdgePath[]): ViewBox => {
  const xs: number[] = [];
  const ys: number[] = [];
  nodes.forEach((node) => {
    xs.push(node.x);
    ys.push(node.y);
  });
  edges.forEach((edge) => {
    edge.points.forEach((p) => {
      xs.push(p.x);
      ys.push(p.y);
    });
  });
  if (xs.length === 0) return DEFAULT_BOX;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = Math.max(40, (maxX - minX) * 0.08, (maxY - minY) * 0.08);
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(1, maxX - minX) + pad * 2,
    h: Math.max(1, maxY - minY) + pad * 2,
  };
};

export function SvgViewport({
  nodes,
  edges,
  highlightedEdges,
  highlightedNodes,
  onNodeMove,
  onNodeClick,
  className,
  fitKey,
}: SvgViewportProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [flashNodes, setFlashNodes] = useState<Set<number>>(new Set());
  const [flashEdges, setFlashEdges] = useState<Set<number>>(new Set());
  const panStart = useRef<Point | null>(null);
  const nodeStart = useRef<Point | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const prevCounts = useRef({ nodes: nodes.length, edges: edges.length });
  const [baseBox, setBaseBox] = useState<ViewBox>(() => contentBox(nodes, edges));
  const [lastFitKey, setLastFitKey] = useState<unknown>(fitKey);

  const fitToContent = () => {
    setBaseBox(contentBox(nodes, edges));
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // Re-fit whenever the caller signals fresh content (e.g. a computed layout).
  // State adjustment during render, per the React "adjusting state when props
  // change" pattern — avoids an extra effect-driven render pass.
  if (lastFitKey !== fitKey) {
    setLastFitKey(fitKey);
    fitToContent();
  }

  const view = useMemo<ViewBox>(() => {
    const w = baseBox.w / scale;
    const h = baseBox.h / scale;
    const cx = baseBox.x + baseBox.w / 2 + offset.x;
    const cy = baseBox.y + baseBox.h / 2 + offset.y;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [baseBox, offset, scale]);
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  // World units moved per client pixel (keeps pan/drag speed correct for any zoom).
  const worldPerPixel = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1 / scale;
    return (baseBox.w / scale) / rect.width;
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const handleWheel = (event: WheelEvent) => {
      if (!event.cancelable) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      setScale((prev) => Math.min(3, Math.max(0.5, prev * delta)));
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const prev = prevCounts.current;
    if (nodes.length > prev.nodes) {
      const added = nodes.slice(prev.nodes).map((node) => node.id);
      if (added.length > 0) {
        const next = new Set<number>(added);
        setFlashNodes(next);
        window.setTimeout(() => setFlashNodes(new Set()), 1500);
      }
    }
    if (edges.length > prev.edges) {
      const added = edges.slice(prev.edges).map((edge) => edge.edge);
      if (added.length > 0) {
        const next = new Set<number>(added);
        setFlashEdges(next);
        window.setTimeout(() => setFlashEdges(new Set()), 1500);
      }
    }
    prevCounts.current = { nodes: nodes.length, edges: edges.length };
  }, [nodes, edges]);

  const onBackgroundDown = (event: React.PointerEvent<SVGSVGElement>) => {
    setPanning(true);
    panStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const unit = worldPerPixel();
    if (panning && panStart.current) {
      const dx = (event.clientX - panStart.current.x) * unit;
      const dy = (event.clientY - panStart.current.y) * unit;
      setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
      panStart.current = { x: event.clientX, y: event.clientY };
    }
    if (dragging !== null && nodeStart.current && onNodeMove) {
      const dx = (event.clientX - nodeStart.current.x) * unit;
      const dy = (event.clientY - nodeStart.current.y) * unit;
      onNodeMove(dragging, dx, dy);
      nodeStart.current = { x: event.clientX, y: event.clientY };
    }
  };

  const onPointerUp = () => {
    setPanning(false);
    setDragging(null);
    panStart.current = null;
    nodeStart.current = null;
  };

  const startDrag = (event: React.PointerEvent, nodeId: number) => {
    event.stopPropagation();
    if (onNodeClick) onNodeClick(nodeId);
    if (!onNodeMove) return;
    setDragging(nodeId);
    nodeStart.current = { x: event.clientX, y: event.clientY };
  };

  return (
    <div
      data-testid="viewport"
      className={cn(
        'relative h-[360px] w-full overflow-hidden rounded-xl border bg-background/70 sm:h-[460px] md:h-[560px] lg:h-[70vh] xl:h-[74vh]',
        className,
      )}
    >
      <button
        type="button"
        className="absolute right-3 top-3 z-10 rounded-md border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm transition hover:text-foreground"
        onClick={fitToContent}
      >
        Reset view
      </button>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="h-full w-full"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#grid)" />
        {edges.map((edge) => {
          const highlight = highlightedEdges?.has(edge.edge) ?? false;
          const flash = flashEdges.has(edge.edge);
          const stroke = flash ? '#22c55e' : highlight ? '#ef4444' : 'rgba(15,23,42,0.8)';
          return (
            <polyline
              key={edge.edge}
              points={edge.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={flash ? 3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {nodes.map((node) => {
          const highlighted = highlightedNodes?.has(node.id);
          const flash = flashNodes.has(node.id);
          const fill = flash ? '#22c55e' : highlighted ? '#0ea5e9' : '#0f172a';
          return (
            <g key={node.id} onPointerDown={(event) => startDrag(event, node.id)}>
              <circle cx={node.x} cy={node.y} r={flash ? 10 : 8} fill={fill} />
              <text x={node.x + 10} y={node.y - 10} fontSize={10} fill={fill}>
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
