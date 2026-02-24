import type { DatasetDef, DatasetMode } from '@/data/datasets';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const MODES: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

export type CinemaControlState = {
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
  renderer: 'webgl' | 'svg';
};

export type CinemaControlsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: DatasetDef;
  state: CinemaControlState;
  onStateChange: (patch: Partial<CinemaControlState>) => void;
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

export function CinemaControlsSheet({
  open,
  onOpenChange,
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
}: CinemaControlsSheetProps) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[84vh] w-full overflow-y-auto border-white/20 bg-slate-950/96 p-4 text-white'
            : 'w-[min(96vw,420px)] overflow-y-auto border-white/20 bg-slate-950/96 p-4 text-white'
        }
      >
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/60">Cinema controls</div>

          {clampedWarning ? (
            <div className="rounded-md border border-amber-400/40 bg-amber-500/15 p-2 text-xs text-amber-100">
              {clampedWarning}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block text-xs text-white/70" htmlFor="cinema-sample-select">
              Sample
            </label>
            <select
              id="cinema-sample-select"
              className="w-full rounded-md border border-white/20 bg-slate-900 px-2 py-1.5 text-sm"
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
            <label className="block text-xs text-white/70" htmlFor="cinema-mode-select">
              Mode
            </label>
            <select
              id="cinema-mode-select"
              className="w-full rounded-md border border-white/20 bg-slate-900 px-2 py-1.5 text-sm"
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
            <label className="block text-xs text-white/70" htmlFor="cinema-max-nodes">
              maxNodes: {state.maxNodes}
            </label>
            <input
              id="cinema-max-nodes"
              type="range"
              min={1}
              max={dataset.limits.maxNodesHard}
              value={state.maxNodes}
              onChange={(event) => onStateChange({ maxNodes: Number(event.target.value) })}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-white/70" htmlFor="cinema-max-edges">
              maxEdges: {state.maxEdges}
            </label>
            <input
              id="cinema-max-edges"
              type="range"
              min={1}
              max={dataset.limits.maxEdgesHard}
              value={state.maxEdges}
              onChange={(event) => onStateChange({ maxEdges: Number(event.target.value) })}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-white/70" htmlFor="cinema-seed-input">
              Seed
            </label>
            <input
              id="cinema-seed-input"
              type="number"
              className="w-full rounded-md border border-white/20 bg-slate-900 px-2 py-1.5 text-sm"
              value={state.seed}
              onChange={(event) => onStateChange({ seed: Number(event.target.value) })}
            />
          </div>

          <div className="grid gap-2 text-xs text-white/75 sm:grid-cols-2">
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
            <div className="space-y-2 rounded-md border border-white/20 p-2">
              <div className="text-xs text-white/70">compareModes</div>
              <div className="grid gap-1 text-xs text-white/70">
                {MODES.map((mode) => {
                  const checked = state.compareModes.includes(mode);
                  return (
                    <label key={mode} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            onStateChange({
                              compareModes: [...new Set([...state.compareModes, mode])].slice(0, 3),
                            });
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
            <label className="block text-xs text-white/70" htmlFor="cinema-renderer-select">
              Renderer
            </label>
            <select
              id="cinema-renderer-select"
              className="w-full rounded-md border border-white/20 bg-slate-900 px-2 py-1.5 text-sm"
              value={state.renderer}
              onChange={(event) => onStateChange({ renderer: event.target.value as 'webgl' | 'svg' })}
            >
              <option value="webgl">WebGL2 (GPU)</option>
              <option value="svg">SVG inspect/export</option>
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
            <div className="rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1 text-xs text-sky-100">
              {progress ? `${progress.stage}${progress.detail ? `: ${progress.detail}` : ''}` : 'Computing…'}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-400/40 bg-red-500/15 px-2 py-2 text-xs text-red-100">
              <div className="font-medium">{error.message}</div>
              {error.details ? (
                <details className="mt-1">
                  <summary className="cursor-pointer">Technical details</summary>
                  <pre className="mt-1 overflow-auto whitespace-pre-wrap text-[11px]">{error.details}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
