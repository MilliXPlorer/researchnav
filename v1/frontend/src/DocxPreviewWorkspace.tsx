import { Download, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getDocxPreview,
  researchFileDownloadUrl,
  type DocumentFileResource,
  type DocxPreviewResource,
} from "./api";
import { Button } from "./components";

export default function DocxPreviewWorkspace({
  researchDocumentId,
  file,
  onClose,
}: {
  researchDocumentId: string | number;
  file: DocumentFileResource;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<DocxPreviewResource | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getDocxPreview(researchDocumentId, file.id)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "A secure text preview could not be generated for this DOCX file.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [researchDocumentId, file.id, attempt]);

  return (
    <section className="docx-preview-workspace" aria-busy={!preview && !error}>
      <header className="pdf-annotation-header">
        <div>
          <p className="eyebrow">DOCX preview</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close document preview"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      {error ? (
        <div className="dashboard-error panel-card" role="alert">
          <p>{error}</p>
          <div className="row-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </Button>
            <a
              className="button button-quiet"
              href={researchFileDownloadUrl(researchDocumentId, file.id)}
            >
              <Download /> Download original DOCX
            </a>
          </div>
        </div>
      ) : preview ? (
        <article
          className="docx-preview-document"
          aria-label="Read-only DOCX content"
        >
          {preview.truncated && (
            <p className="pdf-annotation-notice" role="status">
              This long document was shortened for secure preview. The original
              file remains available to download.
            </p>
          )}
          {preview.paragraphs.map((paragraph) => (
            <p key={paragraph.index}>{paragraph.text}</p>
          ))}
        </article>
      ) : (
        <div className="project-empty-folder">
          <FileText aria-hidden="true" />
          <strong>Loading secure DOCX preview…</strong>
        </div>
      )}
    </section>
  );
}
