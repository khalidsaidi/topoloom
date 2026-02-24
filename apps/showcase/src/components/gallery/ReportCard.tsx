import type { WorkerResult } from '@/lib/workerClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function histogram(values: number[]) {
  const map = new Map<number, number>();
  for (const v of values) {
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export type ReportCardProps = {
  result: WorkerResult | null;
};

export function ReportCard({ result }: ReportCardProps) {
  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Topology Report Card</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Run computation to populate the report.</CardContent>
      </Card>
    );
  }

  const faceHistogram = result.report.faces ? histogram(result.report.faces.sizes) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topology Report Card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section id="report-sample" className="space-y-1">
          <div className="font-medium">Sample stats</div>
          <div className="text-muted-foreground">
            Nodes: {result.sampledStats.nodes} • Edges: {result.sampledStats.edges} • Components:{' '}
            {result.sampledStats.components} • Max degree: {result.sampledStats.maxDegree}
          </div>
        </section>

        <section id="report-planarity" className="space-y-1">
          <div className="font-medium">Planarity</div>
          <div className="text-muted-foreground">
            {result.planarity.isPlanar ? 'Planar' : 'Nonplanar'} • Embedding available:{' '}
            {result.planarity.embeddingAvailable ? 'yes' : 'no'}
            {result.planarity.witness
              ? ` • witness: ${result.planarity.witness.kind} (${result.planarity.witness.edgePairs.length} edges)`
              : ''}
          </div>
        </section>

        <section id="report-faces" className="space-y-1">
          <div className="font-medium">Faces</div>
          {result.report.faces ? (
            <div className="space-y-1 text-muted-foreground">
              <div>Face count: {result.report.faces.count}</div>
              <div>
                Size histogram:{' '}
                {faceHistogram.map(([size, count]) => `${size}:${count}`).join(', ') || 'none'}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No face mesh available for this run.</div>
          )}
        </section>

        <section id="report-biconnected" className="space-y-1">
          <div className="font-medium">Biconnected summary</div>
          <div className="text-muted-foreground">
            Blocks: {result.report.biconnected.blocks} • Articulation points:{' '}
            {result.report.biconnected.articulationPoints} • Bridges: {result.report.biconnected.bridges}
          </div>
        </section>

        <section id="report-spqr" className="space-y-1">
          <div className="font-medium">SPQR summary</div>
          {result.report.spqr ? (
            <div className="text-muted-foreground">
              Nodes: {result.report.spqr.nodes} • S:{result.report.spqr.counts.S} • P:
              {result.report.spqr.counts.P} • R:{result.report.spqr.counts.R} • Q:
              {result.report.spqr.counts.Q}
            </div>
          ) : (
            <div className="text-muted-foreground">SPQR summary unavailable for this sample.</div>
          )}
        </section>

        <section id="report-timings" className="space-y-1">
          <div className="font-medium">Timings</div>
          <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
            {Object.entries(result.timingsMs).map(([stage, ms]) => (
              <div key={stage}>
                {stage}: {Math.round(ms)} ms
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
