import * as SliderPrimitive from '@radix-ui/react-slider';

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  ariaLabel,
  disabled,
}: {
  value: number;
  onValueChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      onValueChange={(next) => onValueChange(next[0] ?? value)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      className="relative flex h-5 w-full touch-none select-none items-center"
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-slate-700">
        <SliderPrimitive.Range className="absolute h-full bg-emerald-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border border-slate-300 bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
}
