import type { DatasetDef, DatasetMode } from '@/data/datasets';
import { Button } from '@/components/ui/button';

export type ViewerControlState = {
  sample: string;
  mode: DatasetMode;
  maxNodes: number;
  maxEdges: number;
  seed: number;
  showWitness: boolean;
  showLabels: boolean;
  showArticulations: boolean;
  showBridges: boolean;
  compare: boolean;
  compareModes: DatasetMode[];
  syncCompareView: boolean;
  renderer: 'canvas' | 'svg';
};

export type ControlsPanelProps = {
  dataset: DatasetDef;
  state: ViewerControlState;
  onStateChange: (patch: Partial<ViewerControlState>) => void;
  onRun: () => void;
  onCopyShare: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onAttribution: () => void;
  progress?: { stage: string; detail?: string } | null;
  running: boolean;
  error?: { message: string; details?: string } | null;
  clampedWarning?: string | null;
};

const MODES: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

export function ControlsPanel({
  dataset,
  state,
  onStateChange,
  onRun,
  onCopyShare,
  onExportPng,
  onExportSvg,
  onAttribution,
  progress,
  running,
  error,
  clampedWarning,
}: ControlsPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border bg-background/80 p-4 text-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Controls</div>

      {clampedWarning ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {clampedWarning}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="sample-select">
          Sample
        </label>
        <select
          id="sample-select"
          className="w-full rounded-md border bg-background px-2 py-1.5"
          value={state.sample}
          onChange={(event) => onStateChange({ sample: event.target.value })}
        >
          {dataset.sampleFiles.map((sample) => (
            <option key={sample.id} value={sample.id}>
              {sample.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="mode-select">
          Mode
        </label>
        <select
          id="mode-select"
          className="w-full rounded-md border bg-background px-2 py-1.5"
          value={state.mode}
          onChange={(event) => onStateChange({ mode: event.target.value as DatasetMode })}
        >
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="max-nodes-range">
          maxNodes: {state.maxNodes}
        </label>
        <input
          id="max-nodes-range"
          type="range"
          min={1}
          max={dataset.limits.maxNodesHard}
          value={state.maxNodes}
          onChange={(event) => onStateChange({ maxNodes: Number(event.target.value) })}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="max-edges-range">
          maxEdges: {state.maxEdges}
        </label>
        <input
          id="max-edges-range"
          type="range"
          min={1}
          max={dataset.limits.maxEdgesHard}
          value={state.maxEdges}
          onChange={(event) => onStateChange({ maxEdges: Number(event.target.value) })}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="seed-input">
          Seed
        </label>
        <input
          id="seed-input"
          type="number"
          className="w-full rounded-md border bg-background px-2 py-1.5"
          value={state.seed}
          onChange={(event) => onStateChange({ seed: Number(event.target.value) })}
        />
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.showWitness}
            onChange={(event) => onStateChange({ showWitness: event.target.checked })}
          />
          showWitness
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.showLabels}
            onChange={(event) => onStateChange({ showLabels: event.target.checked })}
          />
          showLabels
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.showArticulations}
            onChange={(event) => onStateChange({ showArticulations: event.target.checked })}
          />
          showArticulations
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.showBridges}
            onChange={(event) => onStateChange({ showBridges: event.target.checked })}
          />
          showBridges
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.compare}
            onChange={(event) => onStateChange({ compare: event.target.checked })}
          />
          compare
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.syncCompareView}
            onChange={(event) => onStateChange({ syncCompareView: event.target.checked })}
          />
          syncCompareView
        </label>
      </div>

      {state.compare ? (
        <div className="space-y-2 rounded-md border p-2">
          <div className="text-xs font-medium text-muted-foreground">Compare modes</div>
          <div className="grid gap-1 text-xs text-muted-foreground">
            {MODES.map((mode) => {
              const checked = state.compareModes.includes(mode);
              return (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) {
                        onStateChange({ compareModes: [...new Set([...state.compareModes, mode])].slice(0, 3) });
                      } else {
                        onStateChange({ compareModes: state.compareModes.filter((m) => m !== mode) });
                      }
                    }}
                  />
                  {mode}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="renderer-select">
          Renderer
        </label>
        <select
          id="renderer-select"
          className="w-full rounded-md border bg-background px-2 py-1.5"
          value={state.renderer}
          onChange={(event) => onStateChange({ renderer: event.target.value as 'canvas' | 'svg' })}
        >
          <option value="canvas">Canvas (default)</option>
          <option value="svg">SVG</option>
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" onClick={onRun} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </Button>
        <Button type="button" variant="outline" onClick={onCopyShare}>
          Copy share link
        </Button>
        <Button type="button" variant="outline" onClick={onExportPng}>
          Export PNG
        </Button>
        <Button type="button" variant="outline" onClick={onExportSvg}>
          Export SVG
        </Button>
        <Button type="button" variant="outline" onClick={onAttribution} className="sm:col-span-2">
          Attribution / License
        </Button>
      </div>

      {running ? (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-900">
          {progress ? `${progress.stage}${progress.detail ? `: ${progress.detail}` : ''}` : 'Computing…'}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-2 py-2 text-xs text-red-900">
          <div className="font-medium">{error.message}</div>
          {error.details ? (
            <details className="mt-1">
              <summary className="cursor-pointer">Technical details</summary>
              <pre className="mt-1 overflow-auto whitespace-pre-wrap">{error.details}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
