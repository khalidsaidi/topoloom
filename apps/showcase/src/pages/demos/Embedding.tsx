import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoScaffold } from '@/components/demo/DemoScaffold';
import { GraphControls } from '@/components/demo/GraphControls';
import { demoExpectations } from '@/data/demo-expectations';

export function EmbeddingDemo() {
  return (
    <DemoScaffold
      title="Embedding"
      subtitle="Compile rotation systems into half-edge structures and enumerate faces."
      expectations={demoExpectations.embedding}
      status={<Badge variant="secondary">Half-edge view</Badge>}
      inputControls={
        <div className="space-y-4">
          <GraphControls />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Build half-edge</Button>
            <Button size="sm" variant="outline">
              Enumerate faces
            </Button>
          </div>
        </div>
      }
      outputOverlay={
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Face list</Badge>
          <Badge variant="outline">Half-edge detail</Badge>
        </div>
      }
    />
  );
}
