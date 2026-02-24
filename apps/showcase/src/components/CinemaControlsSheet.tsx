import { useEffect, useState } from 'react';

import type { DatasetDef, DatasetMode } from '@/data/datasets';
import type { BoundarySelection } from '@/lib/workerClient';
import { Accordion, AccordionItem } from '@/ui/Accordion';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Divider } from '@/ui/Divider';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { Sheet, SheetContent } from '@/ui/Sheet';
import { Slider } from '@/ui/Slider';

const MODES: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

const BOUNDARY_OPTIONS: Array<{ value: BoundarySelection; label: string }> = [
  { value: 'auto', label: 'Auto (heuristic)' },
  { value: 'largest', label: 'Largest face' },
  { value: 'medium', label: 'Medium face' },
  { value: 'small', label: 'Small face' },
];

export type CinemaControlState = {
  sample: string;
  mode: DatasetMode;
  boundarySelection: BoundarySelection;
  maxNodes: number;
  maxEdges: number;
  seed: number;
  showWitness: boolean;
  showLabels: boolean;
  showFaces: boolean;
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
  facesAvailable: boolean;
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
  facesAvailable,
}: CinemaControlsSheetProps) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );
  const [sections, setSections] = useState<string[]>(['data', 'layout']);

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
            ? 'max-h-[86vh] w-full overflow-y-auto p-0'
            : 'w-[min(96vw,430px)] overflow-y-auto p-0'
        }
      >
        <div className="glass-panel-strong space-y-4 rounded-none p-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">Cinema Controls</div>
            <div className="text-xs text-slate-400">
              {dataset.name} • {dataset.sampleFiles.find((sample) => sample.id === state.sample)?.label ?? state.sample}
            </div>
          </div>

          {clampedWarning ? (
            <div className="rounded-md border border-amber-300/45 bg-amber-500/20 p-2 text-xs text-amber-100">
              {clampedWarning}
            </div>
          ) : null}

          <Accordion value={sections} onValueChange={setSections}>
            <AccordionItem value="data" title="Data">
              <div className="space-y-1 text-xs text-slate-400">Sample</div>
              <Select
                ariaLabel="Select sample"
                value={state.sample}
                onValueChange={(sample) => onStateChange({ sample })}
                options={dataset.sampleFiles.map((sample) => ({ value: sample.id, label: sample.label }))}
              />

              <div className="space-y-1 text-xs text-slate-400">Seed</div>
              <Input
                ariaLabel="Seed"
                type="number"
                value={state.seed}
                onChange={(next) => onStateChange({ seed: Number(next) || 0 })}
              />

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Max nodes</span>
                  <span>{state.maxNodes}</span>
                </div>
                <Slider
                  ariaLabel="Maximum nodes"
                  value={state.maxNodes}
                  min={1}
                  max={dataset.limits.maxNodesHard}
                  onValueChange={(maxNodes) => onStateChange({ maxNodes })}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Max edges</span>
                  <span>{state.maxEdges}</span>
                </div>
                <Slider
                  ariaLabel="Maximum edges"
                  value={state.maxEdges}
                  min={1}
                  max={dataset.limits.maxEdgesHard}
                  onValueChange={(maxEdges) => onStateChange({ maxEdges })}
                />
              </div>
            </AccordionItem>

            <AccordionItem value="layout" title="Layout">
              <div className="space-y-1 text-xs text-slate-400">Mode</div>
              <Select
                ariaLabel="Select layout mode"
                value={state.mode}
                onValueChange={(mode) => onStateChange({ mode: mode as DatasetMode })}
                options={MODES.map((mode) => ({ value: mode, label: mode }))}
              />

              <div className="space-y-1 text-xs text-slate-400">Renderer</div>
              <Select
                ariaLabel="Select renderer"
                value={state.renderer}
                onValueChange={(renderer) => onStateChange({ renderer: renderer as 'webgl' | 'svg' })}
                options={[
                  { value: 'webgl', label: 'WebGL2 (primary)' },
                  { value: 'svg', label: 'SVG (inspect/export)' },
                ]}
              />

              <div className="space-y-1 text-xs text-slate-400">Boundary selection</div>
              <Select
                ariaLabel="Select outer-face boundary strategy"
                value={state.boundarySelection}
                onValueChange={(boundarySelection) => onStateChange({ boundarySelection: boundarySelection as BoundarySelection })}
                options={BOUNDARY_OPTIONS}
              />

              <Button block variant="primary" onClick={onRun} disabled={running}>
                {running ? 'Running topology pipeline…' : 'Run'}
              </Button>
            </AccordionItem>

            <AccordionItem value="overlays" title="Overlays">
              <Checkbox
                label="Show witness"
                checked={state.showWitness}
                onCheckedChange={(showWitness) => onStateChange({ showWitness })}
              />
              <Checkbox
                label="Show labels"
                checked={state.showLabels}
                onCheckedChange={(showLabels) => onStateChange({ showLabels })}
              />
              <Checkbox
                label="Show faces"
                description={facesAvailable ? 'Face boundaries overlay' : 'Available after planar embedding only'}
                checked={state.showFaces}
                disabled={!facesAvailable}
                onCheckedChange={(showFaces) => onStateChange({ showFaces })}
              />
              <Checkbox
                label="Show articulations"
                checked={state.showArticulations}
                onCheckedChange={(showArticulations) => onStateChange({ showArticulations })}
              />
              <Checkbox
                label="Show bridges"
                checked={state.showBridges}
                onCheckedChange={(showBridges) => onStateChange({ showBridges })}
              />
              <Checkbox
                label="Compare mode"
                checked={state.compare}
                onCheckedChange={(compare) => onStateChange({ compare })}
              />
              <Checkbox
                label="Sync compare camera"
                checked={state.syncCompareView}
                onCheckedChange={(syncCompareView) => onStateChange({ syncCompareView })}
              />
            </AccordionItem>

            <AccordionItem value="share" title="Share & Export">
              <Button block variant="secondary" onClick={onCopyShare}>
                Copy share link
              </Button>
              <Button block variant="secondary" onClick={onExportPng}>
                Export PNG
              </Button>
              <Button block variant="secondary" onClick={onExportSvg}>
                Export SVG
              </Button>
              <Button block variant="ghost" onClick={onAttribution}>
                Attribution / License
              </Button>
            </AccordionItem>
          </Accordion>

          <Divider />

          {running ? (
            <div className="rounded-md border border-cyan-300/35 bg-cyan-500/15 px-2 py-1 text-xs text-cyan-100">
              {progress ? `${progress.stage}${progress.detail ? `: ${progress.detail}` : ''}` : 'Computing…'}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-300/40 bg-red-500/20 px-2 py-2 text-xs text-red-100">
              <div className="font-medium">{error.message}</div>
              {error.details ? <details className="mt-1 whitespace-pre-wrap text-[11px] text-red-100/90"><summary>Technical details</summary>{error.details}</details> : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
