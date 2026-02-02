import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function GettingStarted() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">Quickstart</Badge>
        <h2 className="text-2xl font-semibold">Getting started</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Use the kernel as a topology engine first, then feed outputs into geometry pipelines.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-lg bg-muted/40 p-4 text-xs">
{`pnpm add topoloom
# or npm i topoloom`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minimal planarity check</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-lg bg-muted/40 p-4 text-xs">
{`import { graph, planarity } from 'topoloom';

const g = graph.fromEdgeList([
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'a'],
]);

const result = planarity.test(g);
console.log(result.isPlanar, result.rotationSystem);`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Convert rotation systems into half-edge structures.</p>
          <p>2. Build BC/SPQR decompositions to choose embeddings.</p>
          <p>3. Use the dual for routing and edge insertion.</p>
          <p>4. Feed topology into straight-line or orthogonal layout pipelines.</p>
        </CardContent>
      </Card>
    </div>
  );
}
