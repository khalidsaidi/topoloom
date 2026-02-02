import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function BCTreeDemo() {
  return (
    <DemoScaffold
      title="BC-Tree"
      subtitle="Visualize biconnected blocks and articulation vertices as a bipartite tree."
      expectations={demoExpectations.bcTree}
      status={<Badge variant="secondary">Blocks pending</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Compute BC-tree</Button>
            <Button size="sm" variant="outline">
              Highlight block
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Blocks</Badge>
          <Badge variant="outline">Articulation vertices</Badge>
        </div>
      }
    />
  );
}
