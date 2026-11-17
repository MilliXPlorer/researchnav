import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUp, X } from "lucide-react";
import { Button } from "./components";
import { useDialogFocus } from "./useDialogFocus";

export function Modal({
  label,
  onClose,
  busy = false,
  dirty = false,
  size = "regular",
  showClose = true,
  className = "",
  children,
}: {
  label: string;
  onClose: () => void;
  busy?: boolean;
  dirty?: boolean;
  size?: "regular" | "large";
  showClose?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [askDiscard, setAskDiscard] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const [dialogRef, handleDialogKeyDown] =
    useDialogFocus<HTMLElement>(requestClose);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const panel = dialogRef.current;
    if (!panel) return;
    const onScroll = () => setShowScrollTop(panel.scrollTop > 240);
    panel.addEventListener("scroll", onScroll, { passive: true });
    return () => panel.removeEventListener("scroll", onScroll);
  }, [dialogRef]);

  useEffect(() => {
    if (askDiscard)
      discardDialogRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [askDiscard]);

  function requestClose() {
    // Once this prompt is visible, only its explicit actions may dismiss the
    // editor. A second Escape, backdrop press, or close-button press must not
    // turn a confirmation request into an accidental discard.
    if (askDiscard) return;
    if (busy) return;
    if (dirty && !askDiscard) {
      discardTriggerRef.current = document.activeElement as HTMLElement | null;
      setAskDiscard(true);
      return;
    }
    onClose();
  }

  function keepEditing() {
    setAskDiscard(false);
    requestAnimationFrame(() => discardTriggerRef.current?.focus());
  }

  function handleDiscardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled)",
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
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) requestClose();
      }}
    >
      <section
        className={`modal-panel modal-panel-${size}${className ? ` ${className}` : ""}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={askDiscard ? undefined : handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {showClose && (
          <button
            className="icon-button dialog-close"
            onClick={requestClose}
            aria-label={`Close ${label}`}
            disabled={busy}
          >
            <X />
          </button>
        )}
        {children}
        {showScrollTop && (
          <button
            type="button"
            className="modal-scroll-top"
            aria-label="Back to top"
            title="Back to top"
            onClick={() =>
              dialogRef.current?.scrollTo({ top: 0, behavior: "smooth" })
            }
          >
            <ArrowUp aria-hidden="true" />
          </button>
        )}
        {askDiscard && (
          <div
            className="modal-discard"
            role="alertdialog"
            aria-modal="true"
            aria-label="Unsaved changes"
            ref={discardDialogRef}
            onKeyDown={handleDiscardKeyDown}
          >
            <p>You have unsaved changes. Discard them and close?</p>
            <span className="row-actions">
              <Button variant="secondary" onClick={keepEditing}>
                Keep editing
              </Button>
              <Button variant="rust" onClick={onClose}>
                Discard changes
              </Button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy = false,
  className = "",
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  className?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal label={title} onClose={onCancel} busy={busy} className={className}>
      <div className="confirm-card">
        <p className="eyebrow">Please confirm</p>
        <h2>{title}</h2>
        <p>{message}</p>
        {children}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="rust" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
