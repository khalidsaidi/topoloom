import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-2 text-sm', disabled ? 'opacity-45' : '')}>
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(Boolean(next))}
        disabled={disabled}
        className="mt-0.5 inline-flex size-4 items-center justify-center rounded border border-slate-400 bg-slate-900 text-emerald-300 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-3.5" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div>
        <div className="text-slate-100">{label}</div>
        {description ? <div className="text-xs text-slate-400">{description}</div> : null}
      </div>
    </div>
  );
}
