import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Api() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">API</Badge>
        <h2 className="text-2xl font-semibold">Reference</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Typedoc output is embedded below. For live JSON structures, explore the demos.
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
          <CardTitle className="text-base">Typedoc</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[520px] overflow-hidden rounded-lg border">
            <iframe title="TopoLoom API" src="/api/index.html" className="h-full w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
