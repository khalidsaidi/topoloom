export type StatsPanelProps = {
  bends?: number;
  area?: number;
  crossings?: number;
  runtimeMs?: number;
};

export function StatsPanel({ bends, area, crossings, runtimeMs }: StatsPanelProps) {
  return (
    <div className="grid gap-2 rounded-lg border bg-background/80 p-3 text-xs">
      <div className="font-semibold text-foreground">Stats</div>
      <div className="text-muted-foreground">Bends: {bends ?? '—'}</div>
      <div className="text-muted-foreground">Area: {area ?? '—'}</div>
      <div className="text-muted-foreground">Crossings: {crossings ?? '—'}</div>
      <div className="text-muted-foreground">Runtime: {runtimeMs ?? '—'} ms</div>
    </div>
  );
}
