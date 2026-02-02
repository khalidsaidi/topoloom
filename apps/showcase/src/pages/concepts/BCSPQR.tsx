import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function BCSPQRConcept() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">Kernel Concepts</Badge>
        <h2 className="text-2xl font-semibold">BC-tree + SPQR intuition</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          BC-trees split articulation vertices from biconnected blocks. SPQR trees refine each block
          into series, parallel, rigid, and edge (Q) structures so embeddings can be controlled.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">BC-tree</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Block nodes represent biconnected components.</p>
          <p>• Cut nodes represent articulation vertices.</p>
          <p>• Useful for decomposing large graphs into independent pieces.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SPQR tree</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• S: series chains, P: parallel bundles, R: rigid cores, Q: single edges.</p>
          <p>• Skeletons describe how components glue together with virtual edges.</p>
          <p>• Embedding choices come from flipping or permuting skeletons.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">References</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Hopcroft &amp; Tarjan (1973): Dividing a graph into triconnected components.</p>
          <p>• Gutwenger &amp; Mutzel (2001): Linear time SPQR-tree computation.</p>
        </CardContent>
      </Card>
    </div>
  );
}
