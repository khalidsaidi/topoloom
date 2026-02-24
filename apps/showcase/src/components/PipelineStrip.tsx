import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type PipelineStepId = 'graph' | 'planarity' | 'embedding' | 'mesh' | 'layout';

const stepMeta: Array<{ id: PipelineStepId; label: string; description: string }> = [
  {
    id: 'graph',
    label: 'Graph',
    description: 'Build a deterministic graph snapshot with stable ordering.',
  },
  {
    id: 'planarity',
    label: 'Planarity',
    description: 'Test planar feasibility and surface witnesses when it fails.',
  },
  {
    id: 'embedding',
    label: 'Embedding',
    description: 'Compute cyclic edge orderings around each vertex.',
  },
  {
    id: 'mesh',
    label: 'Mesh',
    description: 'Build half-edge faces and dual-friendly topology artifacts.',
  },
  {
    id: 'layout',
    label: 'Layout',
    description: 'Emit deterministic coordinates and routes for rendering.',
  },
];

export type PipelineStripProps = {
  activeSteps?: PipelineStepId[];
  onStepClick?: (step: PipelineStepId) => void;
  className?: string;
};

export function PipelineStrip({ activeSteps = [], onStepClick, className }: PipelineStripProps) {
  const active = new Set(activeSteps);

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-full border border-white/20 bg-black/45 px-2 py-1 text-[11px] text-white/90 backdrop-blur',
          className,
        )}
      >
        {stepMeta.map((step, index) => (
          <div key={step.id} className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-2 py-0.5 transition-colors',
                    active.has(step.id)
                      ? 'bg-emerald-400/20 text-emerald-200'
                      : 'text-white/80 hover:bg-white/10 hover:text-white',
                  )}
                  onClick={() => onStepClick?.(step.id)}
                >
                  {step.label}
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8} className="max-w-64 text-xs">
                {step.description}
              </TooltipContent>
            </Tooltip>
            {index < stepMeta.length - 1 ? <span className="text-white/35">→</span> : null}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
