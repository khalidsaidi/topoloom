import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GraphControls } from '@/components/demo/GraphControls';

export type DemoScaffoldProps = {
  title: string;
  subtitle: string;
  expectations: readonly string[];
  status?: ReactNode;
  inputControls?: ReactNode;
  outputOverlay?: ReactNode;
  inspector?: ReactNode;
  embed?: boolean;
  ready?: boolean;
};

export function DemoScaffold({
  title,
  subtitle,
  expectations,
  status,
  inputControls,
  outputOverlay,
  inspector,
  embed,
  ready,
}: DemoScaffoldProps) {
  const outputCard = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Output visualization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outputOverlay ? (
          <div>{outputOverlay}</div>
        ) : (
          <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-dashed bg-gradient-to-br from-muted/40 via-background to-muted/60 sm:h-[520px] md:h-[620px] lg:h-[72vh] xl:h-[76vh]">
            <svg viewBox="0 0 400 260" className="h-full w-full">
              <g stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5">
                <line x1="80" y1="60" x2="200" y2="40" />
                <line x1="200" y1="40" x2="320" y2="80" />
                <line x1="320" y1="80" x2="280" y2="190" />
                <line x1="280" y1="190" x2="120" y2="210" />
                <line x1="120" y1="210" x2="80" y2="60" />
              </g>
              <g fill="currentColor">
                {[
                  { x: 80, y: 60 },
                  { x: 200, y: 40 },
                  { x: 320, y: 80 },
                  { x: 280, y: 190 },
                  { x: 120, y: 210 },
                ].map((node, index) => (
                  <circle key={index} cx={node.x} cy={node.y} r="8" opacity="0.6" />
                ))}
              </g>
            </svg>
            <div className="absolute inset-x-4 bottom-4 rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground shadow-sm">
              SVG viewport with pan/zoom + draggable nodes will render here.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const readyMarker = (
    <div data-testid="demo-ready" data-ready={ready ? '1' : '0'} />
  );

  if (embed) {
    return (
      <div className="space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            {status ? <div>{status}</div> : <Badge variant="outline">Preview</Badge>}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        </header>
        <div data-testid="demo-capture" className="space-y-4">
          {outputCard}
        </div>
        {readyMarker}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          {status ? <div>{status}</div> : <Badge variant="outline">Preview</Badge>}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,_2.2fr)_minmax(260px,_360px)] lg:items-start">
        <div data-testid="demo-capture" className="space-y-4 lg:min-h-[70vh]">
          {outputCard}
        </div>

        <aside className="space-y-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inputControls ?? <GraphControls />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data inspector</CardTitle>
            </CardHeader>
            <CardContent>
              {inspector ?? (
                <ScrollArea className="h-[280px] rounded-lg border bg-muted/30 p-3">
                  <pre className="text-xs text-muted-foreground">
{`{
  "status": "pending",
  "rotationSystem": [],
  "faces": [],
  "notes": "Run a demo to populate JSON outputs."
}`}
                  </pre>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you should expect</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            {expectations.map((item) => (
              <li key={item} className="rounded-lg border border-dashed px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {readyMarker}
    </div>
  );
}
