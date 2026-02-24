import type { DatasetDef } from '@/data/datasets';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type AttributionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasets: DatasetDef[];
};

export function AttributionModal({ open, onOpenChange, datasets }: AttributionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dataset Attribution & License</DialogTitle>
          <DialogDescription>
            Curated sample files are committed in this repository for deterministic browser-only execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {datasets.map((dataset) => (
            <div key={dataset.id} className="rounded-lg border p-3">
              <div className="font-semibold text-foreground">{dataset.name}</div>
              <div className="mt-1 text-muted-foreground">
                Source:{' '}
                <a
                  className="underline"
                  href={dataset.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {dataset.sourceUrl}
                </a>
              </div>
              <div className="text-muted-foreground">
                License/terms:{' '}
                <a
                  className="underline"
                  href={dataset.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {dataset.licenseName}
                </a>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <div className="font-semibold">OpenStreetMap attribution</div>
            <div>© OpenStreetMap contributors, ODbL 1.0</div>
            <div>Produced from OpenStreetMap data</div>
            <a
              className="underline"
              href="https://opendatacommons.org/licenses/odbl/"
              target="_blank"
              rel="noreferrer"
            >
              https://opendatacommons.org/licenses/odbl/
            </a>
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
