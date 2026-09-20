import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";

export type DefenseType = "proposal" | "final";

export default function DefenseMonitoringMenu({
  active,
  defenseType,
  onSelect,
}: {
  active: boolean;
  defenseType: DefenseType;
  onSelect: (defenseType: DefenseType) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="project-monitoring-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={active ? "is-active" : ""}
        aria-current={active ? "page" : undefined}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <ClipboardCheck aria-hidden="true" />
        <span>Defense Monitoring Forms</span>
        <ChevronDown className="sidebar-nav-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="project-monitoring-dropdown-menu" id={menuId}>
          {(["proposal", "final"] as const).map((type) => (
            <button
              type="button"
              key={type}
              className={active && defenseType === type ? "is-active" : ""}
              onClick={() => {
                onSelect(type);
                setOpen(false);
              }}
            >
              {type === "proposal" ? "Proposal Defense" : "Final Defense"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
