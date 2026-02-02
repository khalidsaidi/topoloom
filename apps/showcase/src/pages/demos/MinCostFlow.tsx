import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { demoExpectations } from '@/data/demo-expectations';

export function MinCostFlowDemo() {
  return (
    <DemoScaffold
      title="Min-cost flow"
      subtitle="Solve network flow instances and inspect costs, potentials, and reduced costs."
      expectations={demoExpectations.minCostFlow}
      status={<Badge variant="secondary">Network ready</Badge>}
      inputControls={
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
            Network editor will live here (nodes, arcs, capacities, costs).
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Load preset</Button>
            <Button size="sm" variant="outline">
              Solve flow
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Flow values</Badge>
          <Badge variant="outline">Potentials</Badge>
        </div>
      }
    />
  );
}
