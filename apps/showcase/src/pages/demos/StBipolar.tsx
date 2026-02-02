import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function StBipolarDemo() {
  return (
    <DemoScaffold
      title="st-numbering + bipolar orientation"
      subtitle="Pick terminals s,t and generate the ordering and acyclic orientation."
      expectations={demoExpectations.stBipolar}
      status={<Badge variant="secondary">s,t pending</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Choose s,t</Button>
            <Button size="sm" variant="outline">
              Compute st-numbering
            </Button>
            <Button size="sm" variant="outline">
              Orient edges
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Vertex order</Badge>
          <Badge variant="outline">Edge directions</Badge>
        </div>
      }
    />
  );
}
