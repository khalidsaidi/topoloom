import type { ViewportBBox } from '@/components/viewports/panZoomController';

export type ViewportNode = {
  id: number;
  label: string;
  x: number;
  y: number;
  degree: number;
};

export type ViewportEdge = {
  edge: [number, number];
  points: Array<{ x: number; y: number }>;
};

export type ViewportGraph = {
  nodes: ViewportNode[];
  edges: ViewportEdge[];
  bbox: ViewportBBox;
};
