import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string;
  onValueChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className="inline-flex h-10 w-full items-center justify-between rounded-md border border-slate-500/50 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none ring-0 transition-colors hover:border-slate-300/60 focus-visible:border-cyan-300"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-slate-300" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 overflow-hidden rounded-md border border-slate-500/45 bg-slate-900 text-slate-100 shadow-lg">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex h-8 cursor-default items-center rounded-sm px-8 text-sm outline-none data-[disabled]:opacity-45',
                  'data-[highlighted]:bg-slate-700/90 data-[highlighted]:text-slate-50',
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
