import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export function useDialogFocus<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const firstControl = dialog?.querySelector<HTMLElement>(
      "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])",
    );
    firstControl?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<T>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;
    const controls = Array.from(
      ref.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
      ),
    );
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return [ref, onKeyDown] as const;
}
