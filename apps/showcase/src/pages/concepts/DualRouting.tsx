import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DualRoutingConcept() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">Kernel Concepts</Badge>
        <h2 className="text-2xl font-semibold">Dual routing explained</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Dual routing treats faces as vertices. Each primal edge becomes a dual edge connecting the
          adjacent faces. Shortest paths in the dual correspond to minimal-crossing insertion routes
          in the primal.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why dual?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Edge insertion becomes a pathfinding problem.</p>
          <p>• Weighted dual edges let you bias crossings.</p>
          <p>• Deterministic tie-breaking makes layouts reproducible.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">References</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Planar dual graphs and face-adjacency shortest paths.</p>
          <p>• Fixed-embedding edge insertion via dual shortest paths.</p>
        </CardContent>
      </Card>
    </div>
  );
}
