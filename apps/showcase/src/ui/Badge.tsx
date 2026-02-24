import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', {
  variants: {
    variant: {
      neutral: 'border-slate-400/40 bg-slate-700/60 text-slate-100',
      success: 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100',
      danger: 'border-red-300/45 bg-red-500/20 text-red-100',
      accent: 'border-cyan-300/45 bg-cyan-500/20 text-cyan-100',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
});

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
