import { useEffect, useRef, useState } from "react";

const DEFAULT_DELAY = 300;

export function useLiveFilters<T extends Record<string, string>>(
  initial: T,
  onApply: (filters: T) => void,
  delay = DEFAULT_DELAY,
) {
  const [filters, setFilters] = useState<T>(initial);
  const applyRef = useRef(onApply);
  const mounted = useRef(false);

  useEffect(() => {
    applyRef.current = onApply;
  });

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const handle = window.setTimeout(() => applyRef.current(filters), delay);
    return () => window.clearTimeout(handle);
  }, [filters, delay]);

  function change(name: keyof T, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  return { filters, change };
}
