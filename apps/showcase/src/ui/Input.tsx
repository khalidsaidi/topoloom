export function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string | number;
  onChange: (next: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      className="h-10 w-full rounded-md border border-slate-500/50 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus-visible:border-cyan-300"
    />
  );
}
