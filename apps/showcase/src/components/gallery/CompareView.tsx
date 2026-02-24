import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { CanvasViewport } from '@/components/viewports/CanvasViewport';
import { SvgViewport } from '@/components/viewports/SvgViewport';
import type { PanZoomTransform } from '@/components/viewports/panZoomController';
import type { ViewportGraph } from '@/components/viewports/types';
import type { WorkerResult } from '@/lib/workerClient';

export type ComparePanel = {
  id: string;
  title: string;
  graph: ViewportGraph;
  result: WorkerResult;
};

export type CompareViewProps = {
  panels: ComparePanel[];
  renderer: 'canvas' | 'svg';
  showLabels: boolean;
  highlightWitnessEdges?: Set<string>;
  highlightBridges?: Set<string>;
  highlightArticulations?: Set<number>;
  syncCompareView: boolean;
};

export function CompareView({
  panels,
  renderer,
  showLabels,
  highlightWitnessEdges,
  highlightBridges,
  highlightArticulations,
  syncCompareView,
}: CompareViewProps) {
  const [sharedTransform, setSharedTransform] = useState<PanZoomTransform | undefined>(undefined);
  const [panelTransforms, setPanelTransforms] = useState<Record<string, PanZoomTransform | undefined>>({});

  const Viewport = useMemo(() => (renderer === 'svg' ? SvgViewport : CanvasViewport), [renderer]);
  const colsClass = panels.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <div className={`grid gap-3 ${colsClass}`}>
      {panels.map((panel) => {
        const transform = syncCompareView ? sharedTransform : panelTransforms[panel.id];
        return (
          <div key={panel.id} className="space-y-2 rounded-xl border bg-background/80 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="font-medium text-foreground">{panel.title}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={panel.result.planarity.isPlanar ? 'secondary' : 'destructive'}>
                  {panel.result.planarity.isPlanar ? 'Planar' : 'Nonplanar'}
                </Badge>
                <span>crossings {panel.result.layout.crossings ?? 0}</span>
                <span>bends {panel.result.layout.bends ?? 0}</span>
                <span>layout {Math.round(panel.result.timingsMs.layout ?? 0)}ms</span>
              </div>
            </div>

            <Viewport
              className="h-[320px]"
              graph={panel.graph}
              showLabels={showLabels}
              highlightWitnessEdges={highlightWitnessEdges}
              highlightBridges={highlightBridges}
              highlightArticulations={highlightArticulations}
              transform={transform}
              onTransformChange={(next) => {
                if (syncCompareView) {
                  setSharedTransform(next);
                } else {
                  setPanelTransforms((prev) => ({ ...prev, [panel.id]: next }));
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
