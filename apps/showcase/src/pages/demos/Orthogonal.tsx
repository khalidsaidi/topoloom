import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function OrthogonalDemo() {
  return (
    <DemoScaffold
      title="Orthogonal layout"
      subtitle="Run Tamassia-style orthogonalization and compaction to build grid drawings."
      expectations={demoExpectations.orthogonal}
      status={<Badge variant="secondary">Orthogonal pipeline</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Compute orthogonal rep</Button>
            <Button size="sm" variant="outline">
              Compact grid
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Bend count</Badge>
          <Badge variant="outline">Area stats</Badge>
        </div>
      }
    />
  );
}
