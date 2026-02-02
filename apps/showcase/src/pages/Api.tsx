import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Api() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">API</Badge>
        <h2 className="text-2xl font-semibold">Reference</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Typedoc output and module docs will be embedded here. For now, explore the demos to inspect
          live JSON outputs.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <div>graph • dfs • planarity • embedding</div>
          <div>decomp • order • dual • flow • layout</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Docs roadmap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Rotation system vs half-edge overview</p>
          <p>• BC-tree + SPQR intuition walkthroughs</p>
          <p>• Dual routing and edge insertion cookbook</p>
          <p>• Flow reductions for orthogonal layouts</p>
        </CardContent>
      </Card>
    </div>
  );
}
