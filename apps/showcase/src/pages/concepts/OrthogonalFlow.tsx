import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function OrthogonalFlowConcept() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">Kernel Concepts</Badge>
        <h2 className="text-2xl font-semibold">Flow reductions for orthogonal drawing</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Orthogonal layouts translate angle and bend constraints into a flow network. Min-cost flow
          minimizes bends, while compaction solves separate x/y constraint graphs.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Min-cost flow core</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Degree and face constraints map to flow conservation.</p>
          <p>• Costs encode bends at edges and vertices.</p>
          <p>• Potentials keep shortest-path iterations efficient.</p>
        </CardContent>
      </Card>
    </div>
  );
}
