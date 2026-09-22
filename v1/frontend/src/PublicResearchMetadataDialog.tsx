import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { getPublicResearch, repositoryDownloadUrl } from "./api";
import { Button } from "./components";
import type { ResearchRecord } from "./types";
import { useDialogFocus } from "./useDialogFocus";
import { SdgBadges } from "./SdgMetadata";

export default function PublicResearchMetadataDialog({
  researchDocumentId,
  onClose,
}: {
  researchDocumentId: string | number;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<ResearchRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [dialogRef, handleDialogKeyDown] = useDialogFocus<HTMLElement>(onClose);

  useEffect(() => {
    let active = true;
    getPublicResearch(researchDocumentId)
      .then((nextRecord) => {
        if (active) setRecord(nextRecord);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [researchDocumentId]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="metadata-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="similarity-metadata-title"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="metadata-close"
          onClick={onClose}
          aria-label="Close metadata"
        >
          ×
        </button>
        {failed ? (
          <div role="alert">
            <h2 id="similarity-metadata-title">Metadata unavailable</h2>
            <p>This research record could not be loaded.</p>
          </div>
        ) : !record ? (
          <div role="status">
            <h2 id="similarity-metadata-title">Loading metadata…</h2>
          </div>
        ) : (
          <>
            <h2 id="similarity-metadata-title">{record.title}</h2>
            <p className="metadata-authors">{record.authors}</p>
            <dl className="metadata-grid">
              <div>
                <dt>Year</dt>
                <dd>{record.year}</dd>
              </div>
              <div>
                <dt>Institute</dt>
                <dd>{record.institute}</dd>
              </div>
              <div>
                <dt>Researchers</dt>
                <dd>{(record.authorNames ?? [record.authors]).join(", ")}</dd>
              </div>
            </dl>
            <div className="metadata-abstract">
              <h3>Abstract</h3>
              <p>{record.abstract}</p>
            </div>
            {(record.sdgs?.length ?? 0) > 0 && (
              <SdgBadges sdgs={record.sdgs ?? []} />
            )}
            <div className="keyword-list">
              {record.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
            <div className="metadata-actions">
              <Button variant="secondary" onClick={onClose}>
                Return to results
              </Button>
              {record.hasDownloadableManuscript ? (
                <a
                  className="button button-primary"
                  href={repositoryDownloadUrl(record.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download /> View files
                </a>
              ) : (
                <span className="download-gate is-unavailable">
                  <FileText /> Final manuscript unavailable
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
