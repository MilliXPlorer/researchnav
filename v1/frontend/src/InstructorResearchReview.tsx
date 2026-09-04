import { useCallback, useEffect, useState } from "react";
import { Download, MessageSquareText, RotateCcw, Scale } from "lucide-react";
import {
  ApiError,
  createFeedback,
  getInternalResearch,
  listPersistedSimilarityResults,
  listResearchFiles,
  listTitleValidations,
  recommendResearchTitle,
  requestResearchRevision,
  researchFileDownloadUrl,
  type DocumentFileResource,
  type FeedbackResource,
  type InstructorAssignedSubmissionItem,
  type InternalResearchResource,
  type SimilarityResultResource,
  type TitleValidationResource,
} from "./api";
import { Button } from "./components";
import ResearchActivity from "./ResearchActivity";
import { classificationLabel, formatSimilarityPercentage } from "./similarity";

type ReviewContext = {
  research: InternalResearchResource;
  files: DocumentFileResource[];
  similarity: SimilarityResultResource[];
  validations: TitleValidationResource[];
};

type Recommendation = "approved" | "revision_required" | "rejected";

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "This review assignment is no longer active.";
    return `The request could not be completed (${error.code}).`;
  }
  return "The request could not be completed.";
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InstructorResearchReview({
  submission,
  onUpdated,
  onBusyChange,
  readOnly = false,
}: {
  submission: InstructorAssignedSubmissionItem;
  onUpdated: () => void;
  onBusyChange?: (busy: boolean) => void;
  readOnly?: boolean;
}) {
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<
    "feedback" | "revision" | "recommendation" | null
  >(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackType, setFeedbackType] =
    useState<FeedbackResource["feedback_type"]>("comment");
  const [feedbackFileId, setFeedbackFileId] = useState("");
  const [revisionRemarks, setRevisionRemarks] = useState("");
  const [revisionFileId, setRevisionFileId] = useState("");
  const [recommendation, setRecommendation] =
    useState<Recommendation>("approved");
  const [recommendationRemarks, setRecommendationRemarks] = useState("");
  const [recommendationSimilarityId, setRecommendationSimilarityId] =
    useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [research, files, similarity, validations] = await Promise.all([
        getInternalResearch(submission.research_document_id),
        listResearchFiles(submission.research_document_id),
        listPersistedSimilarityResults(submission.research_document_id),
        listTitleValidations(submission.research_document_id),
      ]);
      setContext({ research, files, similarity, validations });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [submission.research_document_id]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const refresh = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(refresh);
  }, [load]);

  async function addFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy("feedback");
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      await createFeedback(submission.research_document_id, {
        comment: comment.trim(),
        feedback_type: feedbackType,
        document_file_id: feedbackFileId ? Number(feedbackFileId) : null,
      });
      setComment("");
      setFeedbackFileId("");
      setNotice("Comment added to the review history.");
      setActivityVersion((version) => version + 1);
      onUpdated();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  async function requestRevision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revisionRemarks.trim()) return;
    setBusy("revision");
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      await requestResearchRevision(submission.research_document_id, {
        revision_remarks: revisionRemarks.trim(),
        document_file_id: revisionFileId ? Number(revisionFileId) : null,
      });
      setRevisionRemarks("");
      setRevisionFileId("");
      setNotice("Revision requested and the researcher was notified.");
      setActivityVersion((version) => version + 1);
      await load();
      onUpdated();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  async function saveRecommendation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recommendation !== "approved" && !recommendationRemarks.trim()) return;
    setBusy("recommendation");
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      await recommendResearchTitle(submission.research_document_id, {
        validation_status: recommendation,
        adviser_remarks: recommendationRemarks.trim() || undefined,
        similarity_result_id: recommendationSimilarityId
          ? Number(recommendationSimilarityId)
          : null,
      });
      setRecommendationRemarks("");
      setRecommendationSimilarityId("");
      setNotice("Title recommendation recorded.");
      setActivityVersion((version) => version + 1);
      await load();
      onUpdated();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  if (loading && !context)
    return (
      <p className="admin-empty" aria-busy="true">
        Loading assigned research…
      </p>
    );
  if (!context) {
    return (
      <div className="dashboard-error" role="alert">
        <p>{error}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const { research, files, similarity, validations } = context;
  const beforeDefense = research.research_stage === "title_proposal";
  const canRecommend = [
    "submitted",
    "under_review",
    "revision_required",
  ].includes(research.submission_status);

  return (
    <div className="instructor-review">
      <header className="instructor-review-header">
        <div>
          <p className="eyebrow">
            {beforeDefense
              ? "Before proposal defense"
              : "After proposal defense"}
          </p>
          <h2>{research.title}</h2>
          <p>
            {submission.submitter ?? "Researcher"} ·{" "}
            {humanize(research.submission_status)}
          </p>
        </div>
        <span
          className={`status-chip status-${research.submission_status.replaceAll("_", "-")}`}
        >
          {humanize(research.submission_status)}
        </span>
      </header>

      {(error || notice) && (
        <p role="status" className={error ? "admin-error" : "admin-success"}>
          {error || notice}
        </p>
      )}

      <section className="review-summary-grid" aria-label="Research metadata">
        <div>
          <span>Stage</span>
          <strong>{humanize(research.research_stage)}</strong>
        </div>
        <div>
          <span>Publication year</span>
          <strong>{research.publication_year ?? "Not set"}</strong>
        </div>
        <div className="review-summary-wide">
          <span>Keywords</span>
          <strong>{research.keywords ?? "No keywords provided"}</strong>
        </div>
        <div className="review-summary-wide">
          <span>Abstract</span>
          <p>{research.abstract ?? "No abstract provided."}</p>
        </div>
      </section>

      <section className="review-section">
        <div className="review-section-heading">
          <div>
            <p className="eyebrow">Documents</p>
            <h3>Submitted files</h3>
          </div>
        </div>
        {files.length === 0 ? (
          <p className="admin-empty">No documents are available.</p>
        ) : (
          <ul className="review-file-list">
            {files.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.original_filename}</strong>
                  <span>
                    {humanize(file.document_type)} · Version{" "}
                    {file.version_number} · {fileSize(file.file_size)}
                    {file.is_current ? " · Current" : ""}
                  </span>
                </div>
                <a
                  className="button button-secondary"
                  href={researchFileDownloadUrl(research.id, file.id)}
                >
                  <Download size={15} /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="review-section">
        <div className="review-section-heading">
          <div>
            <p className="eyebrow">Evidence</p>
            <h3>Similarity results</h3>
          </div>
        </div>
        {similarity.length === 0 ? (
          <p className="admin-empty">
            No similarity results are available yet.
          </p>
        ) : (
          <div className="review-similarity-grid">
            {similarity.map((result) => {
              const overall = formatSimilarityPercentage(
                result.overall_similarity_percentage,
              );
              const classification = classificationLabel(result.classification);
              return (
                <article key={result.id}>
                  <div>
                    <strong>{result.matched_title}</strong>
                    <span>
                      {overall ?? "Overall similarity unavailable"} ·
                      Classification: {classification ?? "Unavailable"}
                    </span>
                    {result.adviser_review_required && (
                      <span>Adviser review required</span>
                    )}
                    {result.title_match_alert && (
                      <span>Near-exact title match alert</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {readOnly ? (
        <p className="admin-empty">Read-only assigned record.</p>
      ) : (
        <div className="review-action-grid">
          <form className="review-action-card" onSubmit={addFeedback}>
            <MessageSquareText />
            <div>
              <h3>Add comment or remark</h3>
              <p>Record guidance for the researcher and review team.</p>
            </div>
            <label>
              Comment
              <textarea
                value={comment}
                maxLength={10000}
                required
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            <label>
              Remark type
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
                <option value="general_feedback">General feedback</option>
                <option value="approval_remark">Approval remark</option>
              </select>
            </label>
            <FileSelect
              files={files}
              value={feedbackFileId}
              onChange={setFeedbackFileId}
            />
            <Button disabled={busy !== null || !comment.trim()}>
              {busy === "feedback" ? "Adding…" : "Add remark"}
            </Button>
          </form>

          <form className="review-action-card" onSubmit={requestRevision}>
            <RotateCcw />
            <div>
              <h3>Request revision</h3>
              <p>
                Formally return an under-review submission with required
                changes.
              </p>
            </div>
            {research.submission_status === "under_review" ? (
              <>
                <label>
                  Required changes
                  <textarea
                    value={revisionRemarks}
                    maxLength={10000}
                    required
                    onChange={(event) => setRevisionRemarks(event.target.value)}
                  />
                </label>
                <FileSelect
                  files={files}
                  value={revisionFileId}
                  onChange={setRevisionFileId}
                />
                <Button
                  variant="rust"
                  disabled={busy !== null || !revisionRemarks.trim()}
                >
                  {busy === "revision" ? "Requesting…" : "Request revision"}
                </Button>
              </>
            ) : (
              <p className="admin-empty">
                Revision requests are available while the submission is under
                review.
              </p>
            )}
          </form>

          <form className="review-action-card" onSubmit={saveRecommendation}>
            <Scale />
            <div>
              <h3>Title recommendation</h3>
              <p>
                Recommend a title decision without directly changing final
                manuscript approval.
              </p>
            </div>
            <label>
              Recommendation
              <select
                value={recommendation}
                onChange={(event) =>
                  setRecommendation(event.target.value as Recommendation)
                }
              >
                <option value="approved">Recommend approval</option>
                <option value="revision_required">Recommend revision</option>
                <option value="rejected">Recommend rejection</option>
              </select>
            </label>
            <label>
              Remarks
              <textarea
                value={recommendationRemarks}
                maxLength={10000}
                required={recommendation !== "approved"}
                onChange={(event) =>
                  setRecommendationRemarks(event.target.value)
                }
              />
            </label>
            <label>
              Supporting similarity result
              <select
                value={recommendationSimilarityId}
                onChange={(event) =>
                  setRecommendationSimilarityId(event.target.value)
                }
              >
                <option value="">None selected</option>
                {similarity.map((result) => (
                  <option key={result.id} value={result.id}>
                    {result.matched_title}
                  </option>
                ))}
              </select>
            </label>
            {!canRecommend && (
              <p className="admin-empty">
                Recommendations require an active submitted or revision
                workflow.
              </p>
            )}
            <Button
              disabled={
                !canRecommend ||
                busy !== null ||
                (recommendation !== "approved" && !recommendationRemarks.trim())
              }
            >
              {busy === "recommendation"
                ? "Recording…"
                : "Record recommendation"}
            </Button>
          </form>
        </div>
      )}

      <section className="review-section">
        <div className="review-section-heading">
          <div>
            <p className="eyebrow">Decision history</p>
            <h3>Title recommendations</h3>
          </div>
        </div>
        {validations.length === 0 ? (
          <p className="admin-empty">
            No title recommendations have been recorded.
          </p>
        ) : (
          <ul className="activity-list">
            {validations.map((item) => (
              <li key={item.id}>
                <div className="activity-row-top">
                  <span className="activity-tag">
                    {humanize(item.validation_status)}
                  </span>
                  <time>
                    {item.validated_at
                      ? new Date(item.validated_at).toLocaleString()
                      : "Pending"}
                  </time>
                </div>
                <p className="activity-comment">
                  {item.adviser_remarks ?? "No remarks recorded."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResearchActivity
        researchDocumentId={research.id}
        title="Feedback, revisions, and monitoring history"
        refreshKey={activityVersion}
      />
    </div>
  );
}

function FileSelect({
  files,
  value,
  onChange,
}: {
  files: DocumentFileResource[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Related document
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Entire submission</option>
        {files.map((file) => (
          <option key={file.id} value={file.id}>
            {file.original_filename}
          </option>
        ))}
      </select>
    </label>
  );
}
