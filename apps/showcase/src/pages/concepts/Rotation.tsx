import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RotationConcept() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">Kernel Concepts</Badge>
        <h2 className="text-2xl font-semibold">Rotation system vs half-edge</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Rotation systems capture the cyclic order of incident edges at each vertex. Half-edge
          structures compile that order into explicit twin/next/prev links so faces can be walked and
          dual adjacency can be derived.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rotation system</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Per-vertex cyclic ordering of incident edges.</p>
          <p>• Embedding choice: different orders produce different faces.</p>
          <p>• Lightweight, serializable, and deterministic.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Half-edge mesh</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Each edge becomes two half-edges with twin pointers.</p>
          <p>• next/prev pointers define face boundary cycles.</p>
          <p>• Faces become first-class nodes in the dual graph.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">References</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• DCEL / half-edge data structures for planar embeddings.</p>
          <p>• Boyer &amp; Myrvold (2004): Simplified linear-time planarity test and embedding.</p>
        </CardContent>
      </Card>
    </div>
  );
}
