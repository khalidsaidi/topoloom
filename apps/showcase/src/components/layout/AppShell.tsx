import type { ReactNode } from 'react';

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NavList } from '@/components/layout/NavList';
import { Toaster } from '@/components/ui/sonner';

export type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc_0%,_#eef2ff_45%,_#e2e8f0_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-6">
        <header className="flex items-center justify-between gap-4 pb-6">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              TopoLoom
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Topology-first graph kernel</h1>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden">
                Open navigation
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-6">
              <ScrollArea className="h-full pr-4">
                <NavList />
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </header>

        <div className="grid flex-1 gap-8 lg:grid-cols-[260px_minmax(0,_1fr)]">
          <aside className="hidden rounded-2xl border bg-background/80 p-5 shadow-sm lg:block">
            <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
              <NavList />
            </ScrollArea>
          </aside>

          <main className="space-y-8">{children}</main>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
