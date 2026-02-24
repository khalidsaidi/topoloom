import { cn } from '@/lib/utils';

const steps = [
  { id: 'graph', label: 'Graph' },
  { id: 'planarity', label: 'Planarity' },
  { id: 'embedding', label: 'Embedding' },
  { id: 'mesh', label: 'Half-edge mesh' },
  { id: 'layout', label: 'Layout' },
] as const;

export type PipelineStepId = (typeof steps)[number]['id'];

export type PipelineDiagramProps = {
  activeSteps?: PipelineStepId[];
  modeLabel?: string;
  onStepClick?: (step: PipelineStepId) => void;
  className?: string;
};

export function PipelineDiagram({ activeSteps = [], modeLabel, onStepClick, className }: PipelineDiagramProps) {
  const active = new Set(activeSteps);

  return (
    <div className={cn('rounded-xl border bg-background/70 p-3', className)}>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        Pipeline
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepClick?.(step.id)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition hover:bg-muted',
                active.has(step.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'text-muted-foreground',
              )}
            >
              {step.label}
            </button>
            {index < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
          </div>
        ))}
      </div>
      {modeLabel ? <div className="mt-2 text-xs text-muted-foreground">Mode path: {modeLabel}</div> : null}
    </div>
  );
}
