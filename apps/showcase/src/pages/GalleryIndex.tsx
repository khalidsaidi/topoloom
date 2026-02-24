import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttributionModal } from '@/components/gallery/AttributionModal';
import { DatasetCard } from '@/components/gallery/DatasetCard';
import { PipelineDiagram } from '@/components/gallery/PipelineDiagram';
import { datasets } from '@/data/datasets';

export function GalleryIndex() {
  const [attributionOpen, setAttributionOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-2xl border bg-background/80 p-6">
        <Badge variant="outline">Real Data</Badge>
        <h2 className="text-3xl font-semibold text-foreground">Real-World Graph Gallery</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Pick a graph that’s hard to draw. TopoLoom will test planarity, show a witness if it
          fails, and generate a topology-first drawing pipeline.
        </p>
        <PipelineDiagram activeSteps={['graph', 'planarity', 'embedding', 'mesh', 'layout']} />
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        {datasets.map((dataset) => (
          <DatasetCard key={dataset.id} dataset={dataset} />
        ))}
      </section>

      <section className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            Dataset licenses and attributions are shown in every viewer session, including ODbL
            requirements for OpenStreetMap-derived samples.
          </div>
          <Button variant="outline" onClick={() => setAttributionOpen(true)}>
            Attribution footer
          </Button>
        </div>
      </section>

      <AttributionModal open={attributionOpen} onOpenChange={setAttributionOpen} datasets={datasets} />
    </div>
  );
}
