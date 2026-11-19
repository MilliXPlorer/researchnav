import { useEffect, useState } from "react";

const DEFAULT_DELAY = 350;

export function useDebouncedValue<T>(value: T, delay = DEFAULT_DELAY): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
