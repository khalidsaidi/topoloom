import * as React from 'react';

import {
  Tabs as BaseTabs,
  TabsContent as BaseTabsContent,
  TabsList as BaseTabsList,
  TabsTrigger as BaseTabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export function Tabs(props: React.ComponentProps<typeof BaseTabs>) {
  return <BaseTabs {...props} />;
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof BaseTabsList>) {
  return <BaseTabsList className={cn('bg-slate-800/80', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof BaseTabsTrigger>) {
  return <BaseTabsTrigger className={cn('data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100', className)} {...props} />;
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof BaseTabsContent>) {
  return <BaseTabsContent className={cn('text-slate-100', className)} {...props} />;
}
