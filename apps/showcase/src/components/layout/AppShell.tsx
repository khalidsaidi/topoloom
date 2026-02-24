import type { ReactNode } from 'react';

import { useLocation } from 'react-router-dom';

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NavList } from '@/components/layout/NavList';
import { BuildFooter } from '@/components/layout/BuildFooter';
import { Toaster } from '@/components/ui/sonner';
import { readDemoQuery } from '@/lib/demoQuery';

export type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { search, pathname } = useLocation();
  const { embed } = readDemoQuery(search);
  const isCinemaRoute = pathname === '/' || pathname.startsWith('/gallery/');
  const useImmersiveShell = !embed && isCinemaRoute;

  return (
    <div
      className={
        useImmersiveShell
          ? 'h-full overflow-hidden bg-black text-white'
          : 'h-full overflow-hidden bg-[radial-gradient(circle_at_top,_#f8fafc_0%,_#eef2ff_45%,_#e2e8f0_100%)]'
      }
    >
      {useImmersiveShell ? (
        <div className="relative flex h-full w-full flex-col overflow-hidden">
          <div className="flex-1">{children}</div>
          <div className="pointer-events-none fixed bottom-3 left-3 z-40">
            <BuildFooter immersive />
          </div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <div className={`mx-auto flex min-h-full w-full flex-col pb-12 pt-6 ${embed ? 'max-w-6xl px-4' : 'max-w-7xl px-4'}`}>
            {!embed && (
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
            )}

            <div
              className={
                `grid flex-1 gap-8 ${embed ? 'grid-cols-1' : 'lg:grid-cols-[260px_minmax(0,_1fr)]'}`
              }
            >
              {!embed && (
                <aside className="hidden rounded-2xl border bg-background/80 p-5 shadow-sm lg:block">
                  <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
                    <NavList />
                  </ScrollArea>
                </aside>
              )}

              <main className={embed ? 'space-y-4' : 'space-y-8'}>{children}</main>
            </div>
            <BuildFooter />
          </div>
        </div>
      )}

      <Toaster />
    </div>
  );
}
