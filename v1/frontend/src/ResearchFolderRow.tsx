import type { ReactNode } from "react";
import { ExternalLink, Folder } from "lucide-react";

export default function ResearchFolderRow({
  title,
  metadata,
  detail,
  openLabel,
  selected = false,
  onOpen,
  actions,
}: {
  title: string;
  metadata: ReactNode;
  detail?: ReactNode;
  openLabel?: string;
  selected?: boolean;
  onOpen: () => void;
  actions?: ReactNode;
}) {
  return (
    <article className={`research-folder-row${selected ? " is-selected" : ""}`}>
      <button
        type="button"
        className="research-folder-row-main"
        onClick={onOpen}
        aria-label={openLabel ?? `Open research folder ${title}`}
      >
        <span className="research-title-folder-icon" aria-hidden="true">
          <Folder />
        </span>
        <span className="research-title-folder-copy">
          <strong>{title}</strong>
          <small>{metadata}</small>
          {detail && <small>{detail}</small>}
        </span>
        {!actions && (
          <span className="research-title-folder-arrow" aria-hidden="true">
            <ExternalLink />
          </span>
        )}
      </button>
      {actions && <div className="research-folder-row-actions">{actions}</div>}
    </article>
  );
}
