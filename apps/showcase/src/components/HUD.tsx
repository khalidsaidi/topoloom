import { motion, AnimatePresence } from 'framer-motion';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type HudMetrics = {
  nodes: number;
  edges: number;
  planar?: boolean;
  crossings?: number;
  bends?: number;
};

export type HudProps = {
  visible: boolean;
  datasetName: string;
  sampleLabel: string;
  modeLabel: string;
  stageLabel?: string;
  computeLabel: 'Preview (animated)' | 'Final (TopoLoom deterministic)';
  metrics?: HudMetrics | null;
  timings?: Record<string, number>;
  buildLabel: string;
  className?: string;
};

export function HUD({
  visible,
  datasetName,
  sampleLabel,
  modeLabel,
  stageLabel,
  computeLabel,
  metrics,
  timings,
  buildLabel,
  className,
}: HudProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={cn(
            'pointer-events-none absolute left-3 top-3 z-20 w-[min(92vw,360px)] rounded-2xl border border-white/20 bg-black/60 p-3 text-xs text-white/90 backdrop-blur-xl',
            className,
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="border-white/30 bg-white/10 text-white">
              {computeLabel}
            </Badge>
            {stageLabel ? <span className="text-[11px] text-white/70">{stageLabel}</span> : null}
          </div>

          <div className="mt-2 space-y-1">
            <div className="font-semibold text-white">{datasetName}</div>
            <div className="text-white/70">{sampleLabel}</div>
            <div className="text-white/70">mode: {modeLabel}</div>
          </div>

          {metrics ? (
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-white/80">
              <div>nodes: {metrics.nodes}</div>
              <div>edges: {metrics.edges}</div>
              <div>planar: {metrics.planar === undefined ? '—' : metrics.planar ? 'yes' : 'no'}</div>
              <div>crossings: {metrics.crossings ?? 0}</div>
              <div>bends: {metrics.bends ?? 0}</div>
            </div>
          ) : null}

          {timings ? (
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-white/65">
              {Object.entries(timings).map(([stage, ms]) => (
                <span key={stage}>
                  {stage}:{Math.round(ms)}ms
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2 text-[10px] text-white/55">{buildLabel}</div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
