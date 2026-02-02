import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function PlanarityDemo() {
  return (
    <DemoScaffold
      title="Planarity"
      subtitle="Test planarity, return a rotation system, or surface a Kuratowski witness for debugging."
      expectations={demoExpectations.planarity}
      status={<Badge variant="secondary">Status: pending</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Run planarity test</Button>
            <Button size="sm" variant="outline">
              Highlight witness
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Rotation system</Badge>
          <Badge variant="outline">Outer face hint</Badge>
        </div>
      }
    />
  );
}
