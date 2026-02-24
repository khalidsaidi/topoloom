import { useMemo, useState } from 'react';

import type { CameraTransform, RendererSceneInput } from '@/gl/GraphRenderer';
import { Badge } from '@/components/ui/badge';
import { WebGLViewport } from '@/components/viewports/WebGLViewport';
import { SvgViewport } from '@/components/viewports/SvgViewport';
import type { ViewportGraph } from '@/components/viewports/types';

export type ComparePanel = {
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

export type CompareLayoutProps = {
  panels: ComparePanel[];
  syncCamera: boolean;
  renderer: 'webgl' | 'svg';
  showLabels: boolean;
  onInteraction?: () => void;
};

export function CompareLayout({
  panels,
  syncCamera,
  renderer,
  showLabels,
  onInteraction,
}: CompareLayoutProps) {
  const [sharedCamera, setSharedCamera] = useState<CameraTransform | undefined>(undefined);
  const [panelCamera, setPanelCamera] = useState<Record<string, CameraTransform | undefined>>({});

  const colsClass = useMemo(() => {
    if (panels.length >= 3) return 'lg:grid-cols-3';
    if (panels.length === 2) return 'lg:grid-cols-2';
    return 'grid-cols-1';
  }, [panels.length]);

  return (
    <div className={`grid gap-2 ${colsClass}`}>
      {panels.map((panel) => {
        const camera = syncCamera ? sharedCamera : panelCamera[panel.id];
        return (
          <section
            key={panel.id}
            className="rounded-xl border border-white/20 bg-black/40 p-2"
            onMouseMove={onInteraction}
            onTouchStart={onInteraction}
          >
            <header className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="text-sm font-semibold text-white">{panel.title}</div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                <Badge variant={panel.planar ? 'secondary' : 'destructive'}>
                  {panel.planar ? 'Planar' : 'Nonplanar'}
                </Badge>
                <span>crossings {panel.crossings}</span>
                <span>bends {panel.bends}</span>
                <span>layout {panel.layoutMs}ms</span>
              </div>
            </header>

            {renderer === 'webgl' ? (
              <WebGLViewport
                className="h-[min(44vh,420px)] rounded-lg"
                scene={panel.scene}
                bbox={panel.bbox}
                camera={camera}
                onCameraChange={(next) => {
                  if (syncCamera) setSharedCamera(next);
                  else setPanelCamera((prev) => ({ ...prev, [panel.id]: next }));
                }}
                onInteraction={onInteraction}
                rendererLabel={panel.title}
                autoFitOnSceneChange={!camera}
              />
            ) : (
              <SvgViewport
                className="h-[min(44vh,420px)] rounded-lg border border-white/10 bg-black/80"
                graph={panel.graph}
                showLabels={showLabels}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
