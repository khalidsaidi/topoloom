import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { GraphNode } from '@/components/demo/graph-model';
import type { Point, EdgePath } from 'topoloom/layout';

export type SvgViewportProps = {
  nodes: GraphNode[];
  edges: EdgePath[];
  highlightedEdges?: Set<number>;
  highlightedNodes?: Set<number>;
  onNodeMove?: (id: number, x: number, y: number) => void;
  className?: string;
};

export function SvgViewport({
  nodes,
  edges,
  highlightedEdges,
  highlightedNodes,
  onNodeMove,
  className,
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

  const viewBox = useMemo(() => {
    return `${-200 + offset.x} ${-140 + offset.y} ${400 / scale} ${280 / scale}`;
  }, [offset, scale]);

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
    if (panning && panStart.current) {
      const dx = (event.clientX - panStart.current.x) / scale;
      const dy = (event.clientY - panStart.current.y) / scale;
      setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
      panStart.current = { x: event.clientX, y: event.clientY };
    }
    if (dragging !== null && nodeStart.current && onNodeMove) {
      const dx = (event.clientX - nodeStart.current.x) / scale;
      const dy = (event.clientY - nodeStart.current.y) / scale;
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
    if (!onNodeMove) return;
    setDragging(nodeId);
    nodeStart.current = { x: event.clientX, y: event.clientY };
  };

  return (
    <div
      className={cn(
        'h-[360px] w-full overflow-hidden rounded-xl border bg-background/70 sm:h-[460px] md:h-[560px] lg:h-[70vh] xl:h-[74vh]',
        className,
      )}
    >
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
        <rect width="100%" height="100%" fill="url(#grid)" />
        {edges.map((edge) => {
          const highlight = highlightedEdges?.has(edge.edge) ?? false;
          const flash = flashEdges.has(edge.edge);
          const stroke = flash ? '#22c55e' : highlight ? '#ef4444' : 'rgba(15,23,42,0.6)';
          return (
            <polyline
              key={edge.edge}
              points={edge.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={flash ? 2.6 : 1.6}
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
