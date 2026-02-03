import { useEffect, useState } from 'react';

export type AutoComputeOptions = {
  maxSize?: number;
  size?: number;
};

export type AutoComputeState = {
  value: boolean;
  setValue: (next: boolean) => void;
  disabled: boolean;
};

export function useAutoCompute(
  storageKey: string,
  defaultValue: boolean,
  options: AutoComputeOptions = {},
): AutoComputeState {
  const [rawValue, setRawValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return defaultValue;
    return stored === '1';
  });

  const disabled =
    typeof options.maxSize === 'number' &&
    typeof options.size === 'number' &&
    options.size > options.maxSize;

  const value = disabled ? false : rawValue;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, value ? '1' : '0');
  }, [storageKey, value]);

  return { value, setValue: setRawValue, disabled };
}
