import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface SelectMenuOption {
  value: string;
  label: string;
}

export default function SelectMenu({
  value,
  options,
  label,
  onChange,
  className = "",
}: {
  value: string;
  options: SelectMenuOption[];
  label: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function show() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  return (
    <div
      ref={rootRef}
      className={`select-menu${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className="select-menu-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) show();
            else {
              setActiveIndex((index) =>
                event.key === "ArrowDown"
                  ? Math.min(index + 1, options.length - 1)
                  : Math.max(index - 1, 0),
              );
            }
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) choose(activeIndex);
            else show();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === "Home" && open) {
            event.preventDefault();
            setActiveIndex(0);
          } else if (event.key === "End" && open) {
            event.preventDefault();
            setActiveIndex(options.length - 1);
          }
        }}
      >
        <span>{selected?.label ?? "Select"}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listId}
          className="select-menu-options"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${activeIndex}`}
        >
          {options.map((option, index) => (
            <button
              id={`${listId}-${index}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={activeIndex === index ? "is-active" : ""}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
