import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function DualRoutingDemo() {
  return (
    <DemoScaffold
      title="Dual routing"
      subtitle="Route an insertion path between two vertices through the dual graph."
      expectations={demoExpectations.dualRouting}
      status={<Badge variant="secondary">Dual ready</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Pick u,v</Button>
            <Button size="sm" variant="outline">
              Compute dual path
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Crossed edges</Badge>
          <Badge variant="outline">Face sequence</Badge>
        </div>
      }
    />
  );
}
