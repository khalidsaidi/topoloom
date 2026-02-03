import { useId } from 'react';

export type AutoComputeToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
};

export function AutoComputeToggle({ value, onChange, label }: AutoComputeToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      <span>{label ?? 'Auto recompute on change'}</span>
      <input
        id={id}
        name="autoRecompute"
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-foreground"
      />
    </label>
  );
}
