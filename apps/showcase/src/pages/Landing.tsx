import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function Landing() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border bg-background/80 p-8 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.15),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.2),_transparent_55%)]" />
        <div className="relative space-y-6">
          <Badge variant="outline">Topology-first kernel</Badge>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight text-foreground">
            Build deterministic embeddings, decompositions, and routing pipelines for graph drawing.
          </h2>
          <p className="max-w-2xl text-base text-muted-foreground">
            TopoLoom is not a renderer. It is the topology and embedding engine that makes layout
            algorithms reliable: rotation systems, SPQR, dual routing, min-cost flow, and coordinate
            pipelines with deterministic outputs.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/getting-started">Get started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/demo/planarity">Open the demos</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: 'Topology layer',
            text: 'Planarity, embeddings, BC/SPQR decompositions, and explicit duals.',
          },
          {
            title: 'Geometry layer',
            text: 'Coordinate pipelines for straight-line, orthogonal, and planarization flows.',
          },
          {
            title: 'Determinism',
            text: 'Stable iteration order, serialized outputs, and reproducible embeddings.',
          },
        ].map((item) => (
          <Card key={item.title} className="border-muted/70 bg-background/90">
            <CardContent className="space-y-2 p-5">
              <div className="text-sm font-semibold text-foreground">{item.title}</div>
              <p className="text-sm text-muted-foreground">{item.text}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-dashed bg-muted/30 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Explore the topology pipeline</h3>
            <p className="text-sm text-muted-foreground">
              Each demo surfaces the raw topology objects plus JSON inspection.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/demo/embedding">Jump to embeddings</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
