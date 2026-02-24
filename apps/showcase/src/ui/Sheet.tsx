import * as React from 'react';

import { Sheet as BaseSheet, SheetContent as BaseSheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function Sheet(props: React.ComponentProps<typeof BaseSheet>) {
  return <BaseSheet {...props} />;
}

export function SheetOpen(props: React.ComponentProps<typeof SheetTrigger>) {
  return <SheetTrigger {...props} />;
}

export function SheetContent({
  className,
  ...props
}: React.ComponentProps<typeof BaseSheetContent>) {
  return (
    <BaseSheetContent
      className={cn('border-slate-400/25 bg-slate-950/95 text-slate-100 backdrop-blur-xl', className)}
      {...props}
    />
  );
}
