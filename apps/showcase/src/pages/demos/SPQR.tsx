import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function SPQRDemo() {
  return (
    <DemoScaffold
      title="SPQR"
      subtitle="Decompose biconnected graphs into S/P/R/Q nodes and inspect skeletons."
      expectations={demoExpectations.spqr}
      status={<Badge variant="secondary">SPQR tree</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Build SPQR tree</Button>
            <Button size="sm" variant="outline">
              Flip skeleton
            </Button>
            <Button size="sm" variant="outline">
              Permute parallel edges
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Skeleton graph</Badge>
          <Badge variant="outline">Virtual edges</Badge>
        </div>
      }
    />
  );
}
