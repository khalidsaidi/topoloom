import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, HelpCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Tooltip } from '@/ui/Tooltip';
import { cn } from '@/lib/utils';

export type HudMetrics = {
  nodes: number;
  edges: number;
  crossings?: number;
  bends?: number;
};

export type HudStatus = {
  text: string;
  tone: 'success' | 'danger' | 'accent' | 'neutral';
};

export type HudProps = {
  visible: boolean;
  datasetName: string;
  sampleLabel: string;
  modeLabel: string;
  stageLabel?: string;
  computeLabel: 'Preview (animated)' | 'Solving (live)' | 'Final (TopoLoom deterministic)';
  status: HudStatus;
  metrics?: HudMetrics | null;
  timings?: Record<string, number>;
  buildLabel: string;
  className?: string;
  onResetView?: () => void;
};

export function HUD({
  visible,
  datasetName,
  sampleLabel,
  modeLabel,
  stageLabel,
  computeLabel,
  status,
  metrics,
  timings,
  buildLabel,
  className,
  onResetView,
}: HudProps) {
  const [showTimings, setShowTimings] = useState(false);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn('glass-panel pointer-events-auto absolute left-3 top-3 z-20 w-[min(92vw,370px)] p-3 text-xs', className)}
        >
          <div className="flex items-center justify-between gap-2">
            <Badge variant={computeLabel.startsWith('Final') ? 'success' : 'accent'}>{computeLabel}</Badge>
            <div className="flex items-center gap-1">
              <Tooltip content="Topology-first pipeline: Graph → Planarity → Embedding → Mesh → Layout">
                <IconButton aria-label="Pipeline explanation" variant="ghost" size="sm">
                  <HelpCircle />
                </IconButton>
              </Tooltip>
              <Tooltip content="Reset camera to fit graph">
                <IconButton aria-label="Reset view" variant="ghost" size="sm" onClick={onResetView}>
                  <RotateCcw />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          <div className="mt-2 space-y-1">
            <div className="font-semibold text-slate-100">{datasetName}</div>
            <div className="text-slate-300">{sampleLabel}</div>
            <div className="text-slate-300">mode: {modeLabel}</div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <Badge variant={status.tone}>{status.text}</Badge>
            {stageLabel ? <div className="text-[11px] text-slate-300">stage: {stageLabel}</div> : null}
          </div>

          {metrics ? (
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-200">
              <div>nodes: {metrics.nodes}</div>
              <div>edges: {metrics.edges}</div>
              <div>crossings: {metrics.crossings ?? 0}</div>
              <div>bends: {metrics.bends ?? 0}</div>
            </div>
          ) : null}

          {timings ? (
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-between px-2 text-[11px]"
                onClick={() => setShowTimings((prev) => !prev)}
              >
                <span>Timings</span>
                <ChevronDown className={cn('size-4 transition-transform', showTimings ? 'rotate-180' : '')} />
              </Button>
              {showTimings ? (
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-300">
                  {Object.entries(timings).map(([stage, ms]) => (
                    <span key={stage}>
                      {stage}:{Math.round(ms)}ms
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2 text-[10px] text-slate-400">{buildLabel}</div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
