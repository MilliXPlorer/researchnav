import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./components";
import { useDialogFocus } from "./useDialogFocus";

export function Modal({
  label,
  onClose,
  busy = false,
  dirty = false,
  size = "regular",
  children,
}: {
  label: string;
  onClose: () => void;
  busy?: boolean;
  dirty?: boolean;
  size?: "regular" | "large";
  children: ReactNode;
}) {
  const [askDiscard, setAskDiscard] = useState(false);
  const [dialogRef, handleDialogKeyDown] =
    useDialogFocus<HTMLElement>(requestClose);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function requestClose() {
    if (busy) return;
    if (dirty && !askDiscard) {
      setAskDiscard(true);
      return;
    }
    onClose();
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) requestClose();
      }}
    >
      <section
        className={`modal-panel modal-panel-${size}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button dialog-close"
          onClick={requestClose}
          aria-label={`Close ${label}`}
          disabled={busy}
        >
          <X />
        </button>
        {children}
        {askDiscard && (
          <div className="modal-discard" role="alertdialog">
            <p>You have unsaved changes. Discard them and close?</p>
            <span className="row-actions">
              <Button variant="secondary" onClick={() => setAskDiscard(false)}>
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
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal label={title} onClose={onCancel} busy={busy}>
      <div className="confirm-card">
        <p className="eyebrow">Please confirm</p>
        <h2>{title}</h2>
        <p>{message}</p>
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
