import type { SdgResource } from "./api";
import { sustainableDevelopmentGoals } from "./sdgs";

export function SdgBadges({
  sdgs,
  limit,
}: {
  sdgs: SdgResource[];
  limit?: number;
}) {
  const visible = limit ? sdgs.slice(0, limit) : sdgs;
  return (
    <div className="sdg-badges" aria-label="Sustainable Development Goals">
      {visible.map((sdg) => (
        <span
          className="sdg-badge"
          key={sdg.id}
          title={`${sdg.code}: ${sdg.title}`}
          aria-label={`${sdg.code}: ${sdg.title}`}
          style={{ "--sdg-color": sdg.color_hex } as React.CSSProperties}
        >
          <b>{sdg.id}</b>
          {sdg.short_title}
        </span>
      ))}
      {limit && sdgs.length > limit && (
        <span className="sdg-badge sdg-badge-more">+{sdgs.length - limit}</span>
      )}
    </div>
  );
}

export function SdgSelector({
  selectedIds,
  onChange,
  disabled = false,
  legend = "Sustainable Development Goals",
}: {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  legend?: string;
}) {
  const selected = new Set(selectedIds);
  return (
    <fieldset className="sdg-selector" disabled={disabled}>
      <legend>{legend}</legend>
      <p>Select every UN goal directly supported by this research.</p>
      <div className="sdg-selector-grid">
        {sustainableDevelopmentGoals.map((sdg) => (
          <label
            key={sdg.id}
            style={{ "--sdg-color": sdg.color_hex } as React.CSSProperties}
          >
            <input
              type="checkbox"
              checked={selected.has(sdg.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selectedIds, sdg.id].sort((a, b) => a - b)
                    : selectedIds.filter((id) => id !== sdg.id),
                )
              }
            />
            <b>{sdg.id}</b>
            <span>
              <strong>{sdg.short_title}</strong>
              <small>{sdg.title}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
