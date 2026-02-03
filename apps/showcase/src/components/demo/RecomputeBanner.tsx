import { Button } from '@/components/ui/button';

export type RecomputeBannerProps = {
  visible: boolean;
  onRecompute?: () => void;
  message?: string;
};

export function RecomputeBanner({ visible, onRecompute, message }: RecomputeBannerProps) {
  if (!visible) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span>{message ?? 'Graph changed — recompute to refresh output.'}</span>
      {onRecompute ? (
        <Button size="sm" variant="outline" onClick={onRecompute}>
          Recompute
        </Button>
      ) : null}
    </div>
  );
}
