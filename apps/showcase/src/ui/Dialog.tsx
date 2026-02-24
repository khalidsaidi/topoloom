import * as React from 'react';

import {
  Dialog as BaseDialog,
  DialogContent as BaseDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function Dialog(props: React.ComponentProps<typeof BaseDialog>) {
  return <BaseDialog {...props} />;
}

export function DialogOpen(props: React.ComponentProps<typeof DialogTrigger>) {
  return <DialogTrigger {...props} />;
}

export function DialogContent({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialogContent>) {
  return (
    <BaseDialogContent
      className={cn('border-slate-400/30 bg-slate-950 text-slate-100', className)}
      {...props}
    />
  );
}

export { DialogDescription, DialogFooter, DialogHeader, DialogTitle };
