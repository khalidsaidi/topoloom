import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
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
    description: 'Test planarity and surface witness edges when needed.',
  },
  {
    id: 'embedding',
    label: 'Embedding',
    description: 'Resolve deterministic cyclic order around each vertex.',
  },
  {
    id: 'mesh',
    label: 'Mesh',
    description: 'Build half-edge faces and topology artifacts.',
  },
  {
    id: 'layout',
    label: 'Layout',
    description: 'Emit deterministic coordinates and routes.',
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
    <div
      className={cn(
        'glass-panel inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[11px] text-slate-100',
        className,
      )}
    >
      {stepMeta.map((step, index) => (
        <div key={step.id} className="flex items-center gap-1">
          <Tooltip content={step.description}>
            <Button
              type="button"
              size="sm"
              variant={active.has(step.id) ? 'primary' : 'ghost'}
              className="h-7 rounded-full px-2 text-[11px]"
              onClick={() => onStepClick?.(step.id)}
            >
              {step.label}
            </Button>
          </Tooltip>
          {index < stepMeta.length - 1 ? <span className="text-slate-400">→</span> : null}
        </div>
      ))}
    </div>
  );
}
