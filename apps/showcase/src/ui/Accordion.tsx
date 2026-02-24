import type { ReactNode } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Accordion({
  value,
  onValueChange,
  children,
}: {
  value: string[];
  onValueChange: (next: string[]) => void;
  children: ReactNode;
}) {
  return (
    <AccordionPrimitive.Root
      type="multiple"
      value={value}
      onValueChange={onValueChange}
      className="space-y-2"
    >
      {children}
    </AccordionPrimitive.Root>
  );
}

export function AccordionItem({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AccordionPrimitive.Item value={value} className="rounded-md border border-slate-500/35 bg-slate-900/40">
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-100">
          <span>{title}</span>
          <ChevronDown className="size-4 text-slate-300 transition-transform group-data-[state=open]:rotate-180" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className={cn('overflow-hidden text-sm text-slate-200 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down')}>
        <div className="space-y-3 px-3 pb-3">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}
