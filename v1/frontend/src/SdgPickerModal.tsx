import { useState } from "react";
import { Button } from "./components";
import { Modal } from "./Modal";
import { sustainableDevelopmentGoals } from "./sdgs";

export default function SdgPickerModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (ids: number[]) => void;
}) {
  const [pendingIds, setPendingIds] = useState<number[]>([]);

  return (
    <Modal
      label="Filter by Sustainable Development Goals"
      onClose={onClose}
      className="modal-panel-sdg-picker"
    >
      <div className="sdg-picker">
        <p className="eyebrow">Catalog filter</p>
        <h2>Filter by SDG</h2>
        <p>
          Select one or more Sustainable Development Goals to filter the
          catalog.
        </p>
        <div className="sdg-selector-grid">
          {sustainableDevelopmentGoals.map((sdg) => {
            const selected = pendingIds.includes(sdg.id);
            return (
              <button
                type="button"
                key={sdg.id}
                className={`sdg-option${selected ? " sdg-option-selected" : ""}`}
                style={{ "--sdg-color": sdg.color_hex } as React.CSSProperties}
                aria-pressed={selected}
                onClick={() =>
                  setPendingIds(
                    selected
                      ? pendingIds.filter((id) => id !== sdg.id)
                      : [...pendingIds, sdg.id].sort((a, b) => a - b),
                  )
                }
              >
                <b>{sdg.id}</b>
                <span>
                  <strong>{sdg.short_title}</strong>
                  <small>{sdg.title}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => onApply([])}>
            Clear
          </Button>
          <Button
            variant="rust"
            onClick={() => onApply(pendingIds)}
            disabled={pendingIds.length === 0}
          >
            Apply{pendingIds.length > 0 ? ` (${pendingIds.length})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
