import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import benchmarks from '@/data/benchmarks.json';

type BenchmarkRow = {
  id: string;
  name: string;
  file: string;
  n: number;
  m: number;
  planar: boolean;
  planarityWasmMs: number;
  planarityTsMs: number;
  planarizationMs: number | null;
  removedEdges: number | null;
  crossings: number | null;
};

const rows = benchmarks.rows as BenchmarkRow[];

const fmtMs = (ms: number | null) => (ms === null ? '—' : ms < 10 ? `${ms} ms` : `${Math.round(ms)} ms`);

export function Benchmarks() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="outline">Scale honesty</Badge>
        <h2 className="text-2xl font-semibold">Benchmarks</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Real measurements on the datasets bundled with this showcase: BU4P planarity benchmark
          graphs, BFS samples of California road networks, the US power grid, downtown San
          Francisco OSM, and SuiteSparse circuit matrices. No synthetic best cases — including the
          failures.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Practical guidance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Planarity testing is effectively free at
            this scale.</span>{' '}
            The WASM backend (Edge-Addition Planarity Suite) stays under ~1&nbsp;ms on every graph
            below. The pure-TypeScript fallback matches it on most planar inputs but has
            pathological cases — up to ~200&nbsp;ms — on some planar structures and whenever it has
            to extract a K5/K3,3 witness, so prefer <code>backend: &apos;wasm&apos;</code> (or the
            default <code>auto</code>) when the input might be non-planar.
          </p>
          <p>
            <span className="font-medium text-foreground">planarizationLayout is interactive-fine
            below roughly 500 edges (&lt;~350&nbsp;ms here); measure before shipping anything
            larger.</span>{' '}
            The maximal-planar-subgraph phase re-runs a planarity test per edge, so cost grows
            quadratic-ish with graph size, and each crossing found adds dual-routing and re-embedding
            work on top.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Dataset</th>
                  <th className="py-2 pr-4 text-right font-medium">n</th>
                  <th className="py-2 pr-4 text-right font-medium">m</th>
                  <th className="py-2 pr-4 font-medium">Planar</th>
                  <th className="py-2 pr-4 text-right font-medium">testPlanarity (WASM)</th>
                  <th className="py-2 pr-4 text-right font-medium">testPlanarity (TS)</th>
                  <th className="py-2 pr-4 text-right font-medium">planarizationLayout</th>
                  <th className="py-2 text-right font-medium">Edges rerouted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.n}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.m}</td>
                    <td className="py-2 pr-4">{row.planar ? 'yes' : 'no'}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtMs(row.planarityWasmMs)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtMs(row.planarityTsMs)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtMs(row.planarizationMs)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.removedEdges === null ? '—' : row.removedEdges}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Planarity times are the median of 7 runs after 2 warmups; planarization is a single
            timed run after 1 warmup (deterministic). &ldquo;Edges rerouted&rdquo; is the number of
            edges the maximal-planar-subgraph phase removed and then re-inserted via dual routing.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Known limits (honestly)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">hamm-add20 (n=186, m=800) currently
            fails planarization</span>{' '}
            with &ldquo;Planarization graph should remain planar during insertion&rdquo; — the dense
            circuit sample trips a bug in the edge re-insertion loop. Planarity testing on the same
            graph works fine (0.48&nbsp;ms WASM). Tracked as a known limitation rather than hidden.
          </p>
          <p>
            The TypeScript planarity fallback showed a 196&nbsp;ms outlier on bu4p-g00300-01 even
            though the graph is planar — the left-right implementation has structure-dependent slow
            paths the WASM backend does not.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment &amp; reproduction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {benchmarks.environment.cpu}, Node {benchmarks.environment.node},{' '}
            {benchmarks.environment.platform}. {benchmarks.environment.note}
          </p>
          <pre className="rounded-lg bg-muted/40 p-4 text-xs">
{`cd apps/showcase
node scripts/run-benchmarks.mjs   # rewrites src/data/benchmarks.json`}
          </pre>
          <p>
            Datasets ship in <code>apps/showcase/public/datasets/</code> with source and license
            metadata embedded in each file. See also <code>docs/BENCHMARKS.md</code> in the
            repository.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
