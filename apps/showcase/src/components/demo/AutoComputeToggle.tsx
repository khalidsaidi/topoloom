import { useId } from 'react';

export type AutoComputeToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  hint?: string;
};

export function AutoComputeToggle({ value, onChange, label, disabled, hint }: AutoComputeToggleProps) {
  const id = useId();
  return (
    <div
      className={`rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground ${
        disabled ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs">
          {label ?? 'Auto recompute on change'}
        </label>
        <input
          id={id}
          name="autoRecompute"
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-foreground"
        />
      </div>
      {hint ? <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
