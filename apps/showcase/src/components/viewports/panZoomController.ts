export type PanZoomTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type ViewportBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ScreenPoint = { x: number; y: number };

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

export function clampScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export function worldToScreen(point: ScreenPoint, transform: PanZoomTransform): ScreenPoint {
  return {
    x: point.x * transform.scale + transform.translateX,
    y: point.y * transform.scale + transform.translateY,
  };
}

export function screenToWorld(point: ScreenPoint, transform: PanZoomTransform): ScreenPoint {
  return {
    x: (point.x - transform.translateX) / transform.scale,
    y: (point.y - transform.translateY) / transform.scale,
  };
}

export function fitTransformToBBox(
  bbox: ViewportBBox,
  width: number,
  height: number,
  padding = 24,
): PanZoomTransform {
  const w = Math.max(1, bbox.maxX - bbox.minX);
  const h = Math.max(1, bbox.maxY - bbox.minY);
  const safeWidth = Math.max(1, width - padding * 2);
  const safeHeight = Math.max(1, height - padding * 2);
  const scale = clampScale(Math.min(safeWidth / w, safeHeight / h));

  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  return {
    scale,
    translateX: width / 2 - cx * scale,
    translateY: height / 2 - cy * scale,
  };
}

export function panTransform(
  transform: PanZoomTransform,
  delta: { dx: number; dy: number },
): PanZoomTransform {
  return {
    ...transform,
    translateX: transform.translateX + delta.dx,
    translateY: transform.translateY + delta.dy,
  };
}

export function zoomAtPoint(
  transform: PanZoomTransform,
  anchor: ScreenPoint,
  zoomFactor: number,
): PanZoomTransform {
  const nextScale = clampScale(transform.scale * zoomFactor);
  const world = screenToWorld(anchor, transform);
  return {
    scale: nextScale,
    translateX: anchor.x - world.x * nextScale,
    translateY: anchor.y - world.y * nextScale,
  };
}

export function applyWheelZoom(
  transform: PanZoomTransform,
  anchor: ScreenPoint,
  deltaY: number,
): PanZoomTransform {
  const factor = deltaY > 0 ? 0.9 : 1.1;
  return zoomAtPoint(transform, anchor, factor);
}

export function createIdentityTransform(): PanZoomTransform {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
  };
}
