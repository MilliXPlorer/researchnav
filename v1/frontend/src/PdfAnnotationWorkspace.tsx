import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Highlighter,
  MessageSquareText,
  Minus,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createPdfAnnotation,
  listPdfAnnotations,
  researchFilePreviewUrl,
  type DocumentFileResource,
  type PdfAnnotationAnchor,
  type PdfAnnotationResource,
} from "./api";
import { Button } from "./components";
import { formatPhilippineDateTime } from "./dateTime";
import "pdfjs-dist/web/pdf_viewer.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;

export default function PdfAnnotationWorkspace({
  researchDocumentId,
  file,
  canAnnotate,
  onClose,
}: {
  researchDocumentId: string | number;
  file: DocumentFileResource;
  canAnnotate: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotationResource[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1.15);
  const [anchor, setAnchor] = useState<PdfAnnotationAnchor | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageHasText, setPageHasText] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    void listPdfAnnotations(researchDocumentId, file.id)
      .then((items) => {
        if (!cancelled) setAnnotations(items);
      })
      .catch(() => {
        if (!cancelled)
          setNotice("Saved annotations could not be loaded.");
      });
    void Promise.all([
      import("pdfjs-dist"),
      fetch(researchFilePreviewUrl(researchDocumentId, file.id), {
        credentials: "include",
      }),
    ])
      .then(async ([pdfjs, response]) => {
        if (!response.ok) throw new Error("PDF_RETRIEVE_FAILED");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const data = new Uint8Array(await response.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data });
        const loaded = await loadingTask.promise;
        if (cancelled) {
          await loaded.destroy();
          return;
        }
        setDocument(loaded);
        setPageCount(loaded.numPages);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        console.error("[pdf-preview] failed to load document", loadError);
        setError(
          loadError instanceof Error &&
            loadError.message === "PDF_RETRIEVE_FAILED"
            ? "The PDF file could not be retrieved."
            : "The PDF file could not be read.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [researchDocumentId, file.id]);

  useEffect(() => {
    if (!document || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null =
      null;
    let textLayer: { cancel: () => void } | null = null;
    const canvas = canvasRef.current;
    const textContainer = textLayerRef.current;
    textContainer.replaceChildren();
    setAnchor(null);
    setNotice("");

    void document
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom });
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textContainer.style.width = `${viewport.width}px`;
        textContainer.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("CANVAS_UNAVAILABLE");
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        const [pdfjs, textContent] = await Promise.all([
          import("pdfjs-dist"),
          page.getTextContent(),
          renderTask.promise,
        ]);
        if (cancelled) return;
        setPageHasText(
          textContent.items.some(
            (item) => "str" in item && item.str.trim().length > 0,
          ),
        );
        const layer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        textLayer = layer;
        await layer.render();
      })
      .catch((renderError: unknown) => {
        if (
          !cancelled &&
          (!(renderError instanceof Error) ||
            renderError.name !== "RenderingCancelledException")
        ) {
          setError("This PDF page could not be rendered.");
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [document, pageNumber, zoom]);

  function captureSelection() {
    if (
      !canAnnotate ||
      !pageHasText ||
      !pageRef.current ||
      !textLayerRef.current
    )
      return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0)
      return;
    const range = selection.getRangeAt(0);
    if (
      !textLayerRef.current.contains(range.commonAncestorContainer) &&
      range.commonAncestorContainer !== textLayerRef.current
    )
      return;
    const pageRect = pageRef.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x: Math.max(0, (rect.left - pageRect.left) / pageRect.width),
        y: Math.max(0, (rect.top - pageRect.top) / pageRect.height),
        width: Math.min(1, rect.width / pageRect.width),
        height: Math.min(1, rect.height / pageRect.height),
      }));
    const exact = selection.toString().trim();
    if (!exact || rects.length === 0) return;
    setAnchor({
      schema_version: 1,
      page_number: pageNumber,
      exact,
      rects,
    });
    setNotice("Selection captured. Add a comment to save this highlight.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!anchor || !comment.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createPdfAnnotation(researchDocumentId, file.id, {
        kind: "comment",
        body: comment.trim(),
        anchor,
      });
      setAnnotations(await listPdfAnnotations(researchDocumentId, file.id));
      setComment("");
      setAnchor(null);
      window.getSelection()?.removeAllRanges();
      setNotice("Annotation saved.");
    } catch {
      setError("The annotation could not be saved. Your selection was kept.");
    } finally {
      setBusy(false);
    }
  }

  const pageAnnotations = annotations.filter(
    (item) => item.anchor.page_number === pageNumber,
  );

  return (
    <section className="pdf-annotation-workspace" aria-busy={loading}>
      <header className="pdf-annotation-header">
        <div>
          <p className="eyebrow">PDF annotations</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close PDF annotations"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      {error && (
        <div className="pdf-annotation-error" role="alert">
          <p>{error}</p>
          <a
            className="button button-secondary"
            href={researchFilePreviewUrl(researchDocumentId, file.id)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink aria-hidden="true" /> Open original
          </a>
        </div>
      )}
      {notice && (
        <p className="pdf-annotation-notice" aria-live="polite">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="project-empty-copy">Loading secure PDF preview…</p>
      ) : document ? (
        <div className="pdf-annotation-layout">
          <div className="pdf-viewer-region" aria-label="PDF viewer">
            <div className="pdf-viewer-toolbar">
              <button
                type="button"
                className="icon-button"
                aria-label="Previous page"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((value) => value - 1)}
              >
                <ChevronLeft />
              </button>
              <span>
                Page {pageNumber} of {pageCount}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Next page"
                disabled={pageNumber >= pageCount}
                onClick={() => setPageNumber((value) => value + 1)}
              >
                <ChevronRight />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Zoom out"
                disabled={zoom <= 0.75}
                onClick={() => setZoom((value) => Math.max(0.75, value - 0.2))}
              >
                <Minus />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Zoom in"
                disabled={zoom >= 2}
                onClick={() => setZoom((value) => Math.min(2, value + 0.2))}
              >
                <Plus />
              </button>
            </div>
            {!pageHasText && (
              <p className="pdf-no-text" role="status">
                No selectable text was found. Scanned or image-only PDFs cannot
                be annotated.
              </p>
            )}
            <div className="pdf-page-scroll">
              <div
                className="pdf-page"
                ref={pageRef}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
              >
                <canvas ref={canvasRef} />
                <div className="textLayer pdf-text-layer" ref={textLayerRef} />
                <div className="pdf-highlight-layer" aria-hidden="true">
                  {pageAnnotations.flatMap((annotation) =>
                    annotation.anchor.rects.map((rect, index) => (
                      <span
                        key={`${annotation.id}-${index}`}
                        style={{
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.width * 100}%`,
                          height: `${rect.height * 100}%`,
                        }}
                      />
                    )),
                  )}
                </div>
              </div>
            </div>
          </div>
          <aside
            className="pdf-annotation-panel"
            aria-label={
              canAnnotate
                ? "My annotations"
                : "Consolidated reviewer annotations"
            }
          >
            <div className="project-section-heading">
              <div>
                <p className="eyebrow">Review notes</p>
                <h4>
                  {canAnnotate
                    ? "My annotations"
                    : "Consolidated reviewer annotations"}
                </h4>
              </div>
              <span>{annotations.length}</span>
            </div>
            {canAnnotate && anchor && (
              <form className="pdf-annotation-form" onSubmit={submit}>
                <div className="pdf-selected-quote">
                  <Highlighter aria-hidden="true" />
                  <span>
                    Page {anchor.page_number}: “{anchor.exact}”
                  </span>
                </div>
                <label>
                  Comment
                  <textarea
                    required
                    maxLength={10000}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Explain the change or question for the researcher."
                  />
                </label>
                <div className="pdf-annotation-form-actions">
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => setAnchor(null)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={busy || !comment.trim()}>
                    <Send /> {busy ? "Saving…" : "Save annotation"}
                  </Button>
                </div>
              </form>
            )}
            {canAnnotate && !anchor && pageHasText && (
              <p className="pdf-selection-help">
                Select a line or paragraph in the PDF to add an annotation.
              </p>
            )}
            {annotations.length === 0 ? (
              <div className="project-empty-folder">
                <MessageSquareText aria-hidden="true" />
                <strong>No annotations for this file version.</strong>
              </div>
            ) : (
              <div className="pdf-annotation-list">
                {annotations.map((annotation) => (
                  <button
                    type="button"
                    key={annotation.id}
                    onClick={() => setPageNumber(annotation.anchor.page_number)}
                  >
                    <span>
                      Page {annotation.anchor.page_number} ·{" "}
                      {annotation.author_role}
                    </span>
                    <strong>{annotation.author_name}</strong>
                    <q>{annotation.anchor.exact}</q>
                    {annotation.body && <p>{annotation.body}</p>}
                    <time>
                      {formatPhilippineDateTime(annotation.created_at)}
                    </time>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
