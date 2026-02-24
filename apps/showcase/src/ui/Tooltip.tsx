import type { ReactNode } from 'react';

import {
  Tooltip as RadixTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export { TooltipProvider, TooltipTrigger };

export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <RadixTooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="border-slate-400/35 bg-slate-900 text-slate-100">{content}</TooltipContent>
      </RadixTooltip>
    </TooltipProvider>
  );
}
