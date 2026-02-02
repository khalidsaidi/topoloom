import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function PlanarizationDemo() {
  return (
    <DemoScaffold
      title="Planarization pipeline"
      subtitle="Insert edges through the dual, add dummy crossings, and run planar layout." 
      expectations={demoExpectations.planarization}
      status={<Badge variant="secondary">Pipeline staged</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Maximal planar subgraph</Button>
            <Button size="sm" variant="outline">
              Insert edges
            </Button>
            <Button size="sm" variant="outline">
              Render final
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Crossings</Badge>
          <Badge variant="outline">Dummy vertices</Badge>
        </div>
      }
    />
  );
}
