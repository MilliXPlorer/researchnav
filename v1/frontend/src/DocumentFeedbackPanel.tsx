import {
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  MessageSquareText,
  PenLine,
  RotateCcw,
  Send,
  Tag,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createFeedback,
  listFeedback,
  recordResearcherFeedbackAction,
  updateFeedbackStatus,
  type DocumentFileResource,
  type FeedbackResource,
} from "./api";
import { Button } from "./components";
import { formatPhilippineDateTime } from "./dateTime";

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DocumentFeedbackPanel({
  researchDocumentId,
  file,
  canPostFeedback = false,
  researcherActions = false,
  showClose = true,
  onClose,
}: {
  researchDocumentId: string | number;
  file: DocumentFileResource;
  canPostFeedback?: boolean;
  researcherActions?: boolean;
  showClose?: boolean;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState<FeedbackResource[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackType, setFeedbackType] =
    useState<FeedbackResource["feedback_type"]>("comment");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listFeedback(researchDocumentId)
      .then((items) => {
        if (!cancelled) {
          setFeedback(
            items.filter((item) => item.document_file_id === file.id),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Feedback for this document could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [researchDocumentId, file.id]);

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedbackText.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createFeedback(researchDocumentId, {
        comment: feedbackText.trim(),
        feedback_type: feedbackType,
        document_file_id: file.id,
      });
      setFeedbackText("");
      const items = await listFeedback(researchDocumentId);
      setFeedback(items.filter((item) => item.document_file_id === file.id));
    } catch {
      setError("Feedback could not be posted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceFeedback(updated: FeedbackResource) {
    setFeedback((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function changeStatus(item: FeedbackResource) {
    setBusy(true);
    setError("");
    try {
      await replaceFeedback(
        await updateFeedbackStatus(
          researchDocumentId,
          item.id,
          item.feedback_status === "resolved" ? "open" : "resolved",
        ),
      );
    } catch {
      setError("The feedback status could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function recordResearcherAction(
    item: FeedbackResource,
    action: "acknowledge" | "address",
  ) {
    const remarks =
      action === "address"
        ? window.prompt("What did you address?")?.trim()
        : undefined;
    if (action === "address" && !remarks) return;
    setBusy(true);
    setError("");
    try {
      await replaceFeedback(
        await recordResearcherFeedbackAction(researchDocumentId, item.id, {
          action,
          ...(remarks ? { remarks } : {}),
        }),
      );
    } catch {
      setError("Your feedback response could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="document-feedback-panel"
      aria-labelledby={`document-feedback-title-${file.id}`}
    >
      <header className="document-feedback-header">
        <span
          className="document-feedback-file-icon"
          aria-hidden="true"
        >
          <FileText />
        </span>
        <div className="document-feedback-heading">
          <p className="eyebrow">Document feedback</p>
          <h4 id={`document-feedback-title-${file.id}`}>
            {file.original_filename}
          </h4>
          <p className="document-feedback-subtitle">
            <span>{file.relative_path ?? "Unfiled"}</span>
            <span aria-hidden="true">·</span>
            <span>Version {file.version_number}</span>
            <span
              className={
                file.is_current
                  ? "file-version is-current"
                  : "file-version"
              }
            >
              {file.is_current ? "Current" : "Previous"}
            </span>
          </p>
        </div>
        {showClose && (
          <button
            type="button"
            className="icon-button document-feedback-close"
            aria-label="Close document feedback"
            title="Close feedback"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </header>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      <div className="document-feedback-body">
        {loading ? (
          <p className="project-empty-copy">Loading document feedback…</p>
        ) : feedback.length === 0 ? (
          <div className="document-feedback-empty">
            <span
              className="document-feedback-empty-icon"
              aria-hidden="true"
            >
              <MessageSquareText />
            </span>
            <strong>No feedback for this document yet.</strong>
            <span>
              {canPostFeedback
                ? "Write the first review note below."
                : "Review notes for this file will appear here."}
            </span>
          </div>
        ) : (
          <div className="document-feedback-list">
            {feedback.map((item) => {
              const resolved = item.feedback_status === "resolved";
              const addressed = item.researcher_addressed_at != null;
              const acknowledged =
                item.researcher_acknowledged_at != null;
              return (
                <article
                  className="document-feedback-item"
                  key={item.id}
                >
                  <span
                    className="project-person-avatar"
                    aria-hidden="true"
                  >
                    {(item.reviewer_name ?? "R").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="document-feedback-item-main">
                    <div className="document-feedback-item-head">
                      <span className="document-feedback-reviewer">
                        <strong>
                          {item.reviewer_name ?? "Assigned reviewer"}
                        </strong>
                        <small>
                          {item.reviewer_role
                            ? label(item.reviewer_role)
                            : "Research actor"}
                        </small>
                      </span>
                      <time>
                        {formatPhilippineDateTime(item.created_at)}
                      </time>
                    </div>
                    <p className="document-feedback-comment">
                      {item.comment}
                    </p>
                    <div className="document-feedback-meta">
                      <span className="document-feedback-pill">
                        <Tag aria-hidden="true" />
                        {label(item.feedback_type)}
                      </span>
                      <span
                        className={
                          resolved
                            ? "document-feedback-pill is-resolved"
                            : "document-feedback-pill is-open"
                        }
                      >
                        {resolved ? (
                          <CheckCircle2 aria-hidden="true" />
                        ) : (
                          <CircleDot aria-hidden="true" />
                        )}
                        Feedback status: {label(item.feedback_status)}
                      </span>
                      <span className="document-feedback-pill">
                        {addressed || acknowledged ? (
                          <UserCheck aria-hidden="true" />
                        ) : (
                          <Clock aria-hidden="true" />
                        )}
                        Researcher response:{" "}
                        {addressed
                          ? "Addressed"
                          : acknowledged
                            ? "Acknowledged"
                            : "Awaiting response"}
                      </span>
                    </div>
                    {item.researcher_action_remarks && (
                      <p className="project-comment-response">
                        Researcher response:{" "}
                        {item.researcher_action_remarks}
                      </p>
                    )}
                    {(canPostFeedback || researcherActions) && (
                      <div className="document-feedback-item-actions">
                        {canPostFeedback && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void changeStatus(item)}
                          >
                            {resolved ? (
                              <RotateCcw aria-hidden="true" />
                            ) : (
                              <CheckCircle2 aria-hidden="true" />
                            )}
                            {resolved
                              ? "Reopen feedback"
                              : "Resolve feedback"}
                          </Button>
                        )}
                        {researcherActions && (
                          <>
                            <Button
                              variant="secondary"
                              disabled={
                                busy ||
                                item.researcher_acknowledged_at != null
                              }
                              onClick={() =>
                                void recordResearcherAction(
                                  item,
                                  "acknowledge",
                                )
                              }
                            >
                              <Check aria-hidden="true" />
                              {item.researcher_acknowledged_at
                                ? "Acknowledged"
                                : "Acknowledge"}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={
                                busy ||
                                item.researcher_addressed_at != null
                              }
                              onClick={() =>
                                void recordResearcherAction(item, "address")
                              }
                            >
                              <CheckCircle2 aria-hidden="true" />
                              {item.researcher_addressed_at
                                ? "Addressed"
                                : "Mark addressed"}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {canPostFeedback && (
        <form
          className="document-feedback-composer"
          onSubmit={submitFeedback}
        >
          <div className="document-feedback-composer-head">
            <span aria-hidden="true">
              <PenLine />
            </span>
            <div>
              <h5>Write a review note</h5>
              <p>Keep it specific so the researcher can act on it.</p>
            </div>
          </div>
          <label className="document-feedback-field">
            Feedback type
            <select
              value={feedbackType}
              onChange={(event) =>
                setFeedbackType(
                  event.target.value as FeedbackResource["feedback_type"],
                )
              }
            >
              <option value="comment">Comment</option>
              <option value="suggestion">Suggestion</option>
              <option value="revision_request">Revision request</option>
              <option value="approval_remark">Approval remark</option>
            </select>
          </label>
          <label className="document-feedback-field">
            Feedback
            <textarea
              required
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder="Write a clear review note for this document…"
              rows={4}
            />
          </label>
          <div className="document-feedback-composer-footer">
            <small>Notes are shared with the research team.</small>
            <Button disabled={busy || !feedbackText.trim()}>
              <Send aria-hidden="true" />{" "}
              {busy ? "Posting…" : "Post feedback"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
