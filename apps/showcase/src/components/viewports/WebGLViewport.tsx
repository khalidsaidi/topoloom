import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { CameraTransform, RendererFrameState, RendererSceneInput } from '@/gl/GraphRenderer';
import { GraphRenderer } from '@/gl/GraphRenderer';
import { cn } from '@/lib/utils';

export type WebGLViewportHandle = {
  captureImageData: (scale?: number) => { width: number; height: number; pixels: Uint8ClampedArray } | null;
  getCamera: () => CameraTransform;
  setCamera: (camera: CameraTransform) => void;
  resetView: () => void;
};

export type ViewportBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type WebGLViewportProps = {
  scene: RendererSceneInput | null;
  bbox: ViewportBBox;
  className?: string;
  camera?: CameraTransform;
  onCameraChange?: (camera: CameraTransform) => void;
  onNodePick?: (nodeId: number | null) => void;
  onFrameState?: (state: RendererFrameState) => void;
  onInteraction?: () => void;
  autoFitOnSceneChange?: boolean;
  fitSignal?: number;
};

type PointerPoint = { x: number; y: number };

const MIN_SCALE = 0.04;
const MAX_SCALE = 30;

function clampScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

function fitCameraToBbox(
  bbox: ViewportBBox,
  width: number,
  height: number,
  paddingRatio = 0.1,
): CameraTransform {
  const graphWidth = Math.max(1, bbox.maxX - bbox.minX);
  const graphHeight = Math.max(1, bbox.maxY - bbox.minY);
  const paddingX = Math.max(12, width * paddingRatio);
  const paddingY = Math.max(12, height * paddingRatio);
  const availW = Math.max(1, width - paddingX * 2);
  const availH = Math.max(1, height - paddingY * 2);
  const scale = clampScale(Math.min(availW / graphWidth, availH / graphHeight));
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  return {
    scale,
    translateX: width / 2 - cx * scale,
    translateY: height / 2 - cy * scale,
  };
}

export const WebGLViewport = forwardRef<WebGLViewportHandle, WebGLViewportProps>(function WebGLViewport(
  {
    scene,
    bbox,
    className,
    camera,
    onCameraChange,
    onNodePick,
    onFrameState,
    onInteraction,
    autoFitOnSceneChange = true,
    fitSignal,
  },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  const [size, setSize] = useState({ width: 640, height: 420 });
  const [internalCamera, setInternalCamera] = useState<CameraTransform>(() =>
    fitCameraToBbox(bbox, 640, 420),
  );

  const activePointers = useRef(new Map<number, PointerPoint>());
  const panStart = useRef<PointerPoint | null>(null);
  const pinchStart = useRef<{ distance: number; center: PointerPoint; camera: CameraTransform } | null>(null);
  const clickStart = useRef<PointerPoint | null>(null);

  const resolvedCamera = camera ?? internalCamera;

  const setCamera = (next: CameraTransform) => {
    const sanitized = {
      scale: clampScale(next.scale),
      translateX: next.translateX,
      translateY: next.translateY,
    };
    setInternalCamera(sanitized);
    onCameraChange?.(sanitized);
    rendererRef.current?.setCameraTransform(sanitized);
  };

  const localPoint = (clientX: number, clientY: number): PointerPoint => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const zoomAtPoint = (cam: CameraTransform, anchor: PointerPoint, factor: number): CameraTransform => {
    const nextScale = clampScale(cam.scale * factor);
    const worldX = (anchor.x - cam.translateX) / cam.scale;
    const worldY = (anchor.y - cam.translateY) / cam.scale;
    return {
      scale: nextScale,
      translateX: anchor.x - worldX * nextScale,
      translateY: anchor.y - worldY * nextScale,
    };
  };

  const fitCurrent = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect?.width ?? size.width));
    const height = Math.max(1, Math.floor(rect?.height ?? size.height));
    setCamera(fitCameraToBbox(bbox, width, height));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new GraphRenderer(canvas, {
      onFrameState,
    });
    rendererRef.current = renderer;
    renderer.setCameraTransform(resolvedCamera);
    renderer.resize(size.width, size.height, window.devicePixelRatio || 1);

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
      setSize(next);
      rendererRef.current?.resize(next.width, next.height, window.devicePixelRatio || 1);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    rendererRef.current?.setCameraTransform(resolvedCamera);
  }, [resolvedCamera]);

  useEffect(() => {
    if (!scene) return;
    rendererRef.current?.setScene(scene);
    if (autoFitOnSceneChange) {
      fitCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, autoFitOnSceneChange]);

  useEffect(() => {
    rendererRef.current?.resize(size.width, size.height, window.devicePixelRatio || 1);
  }, [size.height, size.width]);

  useEffect(() => {
    if (fitSignal === undefined) return;
    fitCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  useImperativeHandle(ref, () => ({
    captureImageData: (scale = 2) => rendererRef.current?.captureImageData(scale) ?? null,
    getCamera: () => ({ ...resolvedCamera }),
    setCamera: (next) => setCamera(next),
    resetView: () => fitCurrent(),
  }));

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    onInteraction?.();
    const p = localPoint(event.clientX, event.clientY);
    activePointers.current.set(event.pointerId, p);
    clickStart.current = p;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);

    if (activePointers.current.size === 1) {
      panStart.current = p;
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
        camera: { ...resolvedCamera },
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointers.current.has(event.pointerId)) return;
    onInteraction?.();
    const p = localPoint(event.clientX, event.clientY);
    activePointers.current.set(event.pointerId, p);

    if (activePointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...activePointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const base = pinchStart.current;
      const ratio = distance / base.distance;
      const zoomed = zoomAtPoint(base.camera, base.center, ratio);
      setCamera({
        ...zoomed,
        translateX: zoomed.translateX + (center.x - base.center.x),
        translateY: zoomed.translateY + (center.y - base.center.y),
      });
      return;
    }

    if (activePointers.current.size === 1 && panStart.current) {
      const dx = p.x - panStart.current.x;
      const dy = p.y - panStart.current.y;
      setCamera({
        ...resolvedCamera,
        translateX: resolvedCamera.translateX + dx,
        translateY: resolvedCamera.translateY + dy,
      });
      panStart.current = p;
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    onInteraction?.();
    const end = localPoint(event.clientX, event.clientY);
    const start = clickStart.current;
    const moved = start ? Math.hypot(end.x - start.x, end.y - start.y) : 10;
    if (moved < 4 && activePointers.current.size <= 1) {
      const picked = rendererRef.current?.pickNode(end.x, end.y) ?? null;
      onNodePick?.(picked);
    }

    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
    if (activePointers.current.size === 0) panStart.current = null;
    clickStart.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    onInteraction?.();
    const point = localPoint(event.clientX, event.clientY);
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    setCamera(zoomAtPoint(resolvedCamera, point, factor));
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    onInteraction?.();
    const point = localPoint(event.clientX, event.clientY);
    setCamera(zoomAtPoint(resolvedCamera, point, 1.25));
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('relative h-full w-full overflow-hidden bg-black/95', className)}
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
        aria-label="WebGL graph viewport"
      />
    </div>
  );
});
