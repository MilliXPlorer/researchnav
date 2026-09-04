import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  archiveInternalResearch,
  createFeedback,
  getInternalResearch,
  listFeedback,
  listMonitoringLogs,
  listResearchAuthors,
  listResearchFiles,
  renameResearchFile,
  deleteResearchFile,
  listResearchRevisions,
  listReviewAssignments,
  listPersistedSimilarityResults,
  listTitleValidations,
  replaceResearchAuthors,
  replaceReviewAssignments,
  researchFileDownloadUrl,
  resubmitResearchRevision,
  submitInternalResearch,
  transitionInternalResearch,
  updateFeedbackStatus,
  updateInternalResearch,
  updateTitleValidation,
  uploadResearchFile,
  type DocumentFileResource,
  type FeedbackResource,
  type InternalResearchResource,
  type MonitoringLogResource,
  type ResearchAuthorInput,
  type ResearchAuthorResource,
  type ResearchMetadataInput,
  type ResearchRevisionResource,
  type ReviewAssignmentInput,
  type ReviewAssignmentResource,
  type SimilarityResultResource,
  type TitleValidationResource,
} from "./api";
import { PublicationYearInput } from "./dateControls";
import { Button } from "./components";

type FormState = {
  title: string;
  abstract: string;
  keywords: string;
  publicationYear: string;
  researchStage: ResearchMetadataInput["research_stage"];
};
type ValidationChoice = Exclude<
  TitleValidationResource["validation_status"],
  "pending"
>;
type FeedbackType = FeedbackResource["feedback_type"];
type FileType = DocumentFileResource["document_type"];
type ResearchContext = {
  research: InternalResearchResource;
  revisions: ResearchRevisionResource[];
  validations: TitleValidationResource[];
  similarityResults: SimilarityResultResource[];
  authors: ResearchAuthorResource[];
  reviewers: ReviewAssignmentResource[];
  files: DocumentFileResource[];
  feedback: FeedbackResource[];
  monitoring: MonitoringLogResource[];
};

const editableUploadTypes: FileType[] = [
  "title_proposal",
  "draft",
  "chapter",
  "revised_manuscript",
  "final_manuscript",
  "attachment",
];
const approvedUploadTypes: FileType[] = ["final_manuscript", "attachment"];

function uploadTypesFor(status: InternalResearchResource["submission_status"]) {
  if (["draft", "revision_required"].includes(status)) {
    return editableUploadTypes;
  }
  return status === "approved" ? approvedUploadTypes : [];
}

function formFor(research: InternalResearchResource): FormState {
  return {
    title: research.title,
    abstract: research.abstract ?? "",
    keywords: research.keywords ?? "",
    publicationYear: research.publication_year?.toString() ?? "",
    researchStage: research.research_stage,
  };
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function authorsForSave(
  authors: ResearchAuthorResource[],
): ResearchAuthorInput[] {
  return authors.map(({ user_id, author_name, is_corresponding_author }) => ({
    user_id,
    author_name,
    is_corresponding_author,
  }));
}

function reviewersForSave(
  reviewers: ReviewAssignmentResource[],
): ReviewAssignmentInput[] {
  return reviewers
    .filter((reviewer) => reviewer.is_active)
    .map(({ reviewer_id, review_role }) => ({ reviewer_id, review_role }));
}

export default function AdminResearchWorkspace({
  researchDocumentId,
  navigate,
}: {
  researchDocumentId: string | number;
  navigate: (path: string) => void;
}) {
  const [research, setResearch] = useState<InternalResearchResource | null>(
    null,
  );
  const [revisions, setRevisions] = useState<ResearchRevisionResource[]>([]);
  const [validations, setValidations] = useState<TitleValidationResource[]>([]);
  const [similarityResults, setSimilarityResults] = useState<
    SimilarityResultResource[]
  >([]);
  const [authors, setAuthors] = useState<ResearchAuthorResource[]>([]);
  const [reviewers, setReviewers] = useState<ReviewAssignmentResource[]>([]);
  const [files, setFiles] = useState<DocumentFileResource[]>([]);
  const [feedback, setFeedback] = useState<FeedbackResource[]>([]);
  const [monitoring, setMonitoring] = useState<MonitoringLogResource[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mutation, setMutation] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [archiveVisibility, setArchiveVisibility] =
    useState<InternalResearchResource["visibility"]>("private");
  const [validationChoices, setValidationChoices] = useState<
    Record<number, ValidationChoice | "">
  >({});
  const [validationRemarks, setValidationRemarks] = useState<
    Record<number, string>
  >({});
  const [validationSimilarityResultIds, setValidationSimilarityResultIds] =
    useState<Record<number, string>>({});
  const [newAuthor, setNewAuthor] = useState("");
  const [newAuthorUserId, setNewAuthorUserId] = useState("");
  const [newReviewerId, setNewReviewerId] = useState("");
  const [newReviewerRole, setNewReviewerRole] =
    useState<ReviewAssignmentResource["review_role"]>("adviser");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("comment");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<FileType>("final_manuscript");
  const [editingFile, setEditingFile] = useState<number | null>(null);
  const [filenameDraft, setFilenameDraft] = useState("");
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const mutationTokenRef = useRef(0);

  const isCurrent = useCallback(
    (generation: number) =>
      mountedRef.current && requestGenerationRef.current === generation,
    [],
  );

  useEffect(() => {
    // StrictMode replays cleanup/setup; the second setup is a live mount.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, []);

  const loadContext = useCallback(
    async (id: string | number): Promise<ResearchContext> => {
      const [
        nextResearch,
        nextRevisions,
        nextValidations,
        nextSimilarityResults,
        nextAuthors,
        nextReviewers,
        nextFiles,
        nextFeedback,
        nextMonitoring,
      ] = await Promise.all([
        getInternalResearch(id),
        listResearchRevisions(id),
        listTitleValidations(id),
        listPersistedSimilarityResults(id),
        listResearchAuthors(id),
        listReviewAssignments(id),
        listResearchFiles(id),
        listFeedback(id),
        listMonitoringLogs(id),
      ]);
      return {
        research: nextResearch,
        revisions: nextRevisions,
        validations: nextValidations,
        similarityResults: nextSimilarityResults,
        authors: nextAuthors,
        reviewers: nextReviewers,
        files: nextFiles,
        feedback: nextFeedback,
        monitoring: nextMonitoring,
      };
    },
    [],
  );

  const clearContext = useCallback(
    (generation: number) => {
      if (!isCurrent(generation)) return;
      setResearch(null);
      setRevisions([]);
      setValidations([]);
      setSimilarityResults([]);
      setAuthors([]);
      setReviewers([]);
      setFiles([]);
      setFeedback([]);
      setMonitoring([]);
      setForm(null);
      setArchiveVisibility("private");
      setValidationChoices({});
      setValidationRemarks({});
      setValidationSimilarityResultIds({});
      setUploadFile(null);
    },
    [isCurrent],
  );

  /** Returns its generation only when this request supplied the visible context. */
  const loadRecord = useCallback(
    async (
      id: string | number,
      afterMutation = false,
    ): Promise<number | null> => {
      if (!mountedRef.current) return null;
      const generation = requestGenerationRef.current + 1;
      requestGenerationRef.current = generation;
      if (isCurrent(generation)) {
        setLoading(true);
        setLoadFailed(false);
        setMessage(null);
      }
      try {
        const context = await loadContext(id);
        if (!isCurrent(generation)) return null;
        setResearch(context.research);
        setRevisions(context.revisions);
        setValidations(context.validations);
        setSimilarityResults(context.similarityResults);
        setAuthors(context.authors);
        setReviewers(context.reviewers);
        setFiles(context.files);
        setFeedback(context.feedback);
        setMonitoring(context.monitoring);
        setForm(formFor(context.research));
        setArchiveVisibility(context.research.visibility);
        setValidationChoices({});
        setValidationRemarks({});
        setValidationSimilarityResultIds(
          Object.fromEntries(
            context.validations
              .filter(
                (validation) => validation.validation_status === "pending",
              )
              .map((validation) => [
                validation.id,
                validation.similarity_result_id?.toString() ?? "",
              ]),
          ),
        );
        setFeedbackComment("");
        setUploadFile(null);
        const allowedUploadTypes = uploadTypesFor(
          context.research.submission_status,
        );
        setUploadType((currentType) =>
          allowedUploadTypes.includes(currentType)
            ? currentType
            : (allowedUploadTypes[0] ?? "final_manuscript"),
        );
        return generation;
      } catch {
        if (isCurrent(generation)) {
          clearContext(generation);
          setLoadFailed(true);
          setMessage({
            type: "error",
            text: afterMutation
              ? "The change was saved, but the authoritative record could not be reloaded. Retry before taking another action."
              : "The internal research record could not be loaded.",
          });
        }
        return null;
      } finally {
        if (isCurrent(generation)) setLoading(false);
      }
    },
    [clearContext, isCurrent, loadContext],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadRecord(researchDocumentId));
  }, [loadRecord, researchDocumentId]);

  // Keep mutation refreshes fully authoritative: this record-scoped context is
  // currently nine small resources, and targeted modes could leave related
  // workflow state stale after a server-side transition.
  const runMutation = async (
    operation: string,
    success: string,
    action: () => Promise<unknown>,
  ) => {
    if (mutation || !research) return;
    const startingGeneration = requestGenerationRef.current;
    const token = mutationTokenRef.current + 1;
    mutationTokenRef.current = token;
    if (!isCurrent(startingGeneration)) return;
    setMutation(operation);
    setMessage(null);
    try {
      await action();
      if (!isCurrent(startingGeneration)) return;
      const refreshedGeneration = await loadRecord(researchDocumentId, true);
      if (
        refreshedGeneration !== null &&
        isCurrent(refreshedGeneration) &&
        mutationTokenRef.current === token
      ) {
        setMessage({ type: "success", text: success });
      }
    } catch {
      if (!isCurrent(startingGeneration)) return;
      // Local author/reviewer edits are drafts. Restore every visible resource
      // before reporting a failed request so none is presented as server data.
      const refreshedGeneration = await loadRecord(researchDocumentId);
      if (
        refreshedGeneration !== null &&
        isCurrent(refreshedGeneration) &&
        mutationTokenRef.current === token
      ) {
        setMessage({
          type: "error",
          text: "The requested change could not be completed. The authoritative record was restored.",
        });
      }
    } finally {
      if (mountedRef.current && mutationTokenRef.current === token) {
        setMutation(null);
      }
    }
  };

  if (loading) {
    return (
      <section
        className="workspace-content admin-research-workspace"
        aria-busy="true"
        aria-label="Loading internal research record"
      >
        <section className="panel-card dashboard-loading">
          <p>Loading internal research record…</p>
        </section>
      </section>
    );
  }

  if (loadFailed || !research || !form) {
    return (
      <div className="workspace-content admin-research-workspace">
        {message && (
          <p className="admin-operation-message is-error" role="alert">
            {message.text}
          </p>
        )}
        <section className="panel-card dashboard-error" role="alert">
          <p>The internal research record could not be loaded.</p>
          <Button
            variant="secondary"
            onClick={() => void loadRecord(researchDocumentId)}
          >
            Retry
          </Button>
        </section>
      </div>
    );
  }

  const editable = ["draft", "revision_required"].includes(
    research.submission_status,
  );
  const allowedUploadTypes = uploadTypesFor(research.submission_status);
  const canUpload = allowedUploadTypes.length > 0;
  const canArchive =
    research.submission_status === "approved" &&
    research.archive_status !== "archived";
  const latestRevision = [...revisions].sort(
    (a, b) => b.revision_number - a.revision_number,
  )[0];
  const canResubmit =
    research.submission_status === "revision_required" &&
    latestRevision !== undefined &&
    ["requested", "in_progress"].includes(latestRevision.revision_status);
  const hasWorkflowAction =
    research.submission_status === "draft" ||
    research.submission_status === "submitted" ||
    research.submission_status === "under_review" ||
    canArchive ||
    canResubmit;
  const pendingValidations = validations.filter(
    (item) => item.validation_status === "pending",
  );
  const completedValidations = validations.filter(
    (item) => item.validation_status !== "pending",
  );
  const sourceSimilarityResults = similarityResults.filter(
    (result) => result.source_research_id === research.id,
  );
  const orderedAuthors = [...authors].sort(
    (first, second) => first.author_order - second.author_order,
  );
  const isMutating = mutation !== null;
  const saveMetadata = () => {
    const year = form.publicationYear.trim();
    const publication_year = year ? Number(year) : null;
    if (!form.title.trim() || (year && !Number.isInteger(publication_year))) {
      setMessage({
        type: "error",
        text: "Enter a title and a whole-number publication year.",
      });
      return;
    }
    void runMutation("metadata", "Metadata saved and refreshed.", () =>
      updateInternalResearch(research.id, {
        title: form.title.trim(),
        abstract: form.abstract || null,
        keywords: form.keywords || null,
        publication_year,
        research_stage: form.researchStage,
      }),
    );
  };
  const addAuthor = () => {
    if (!newAuthor.trim()) return;
    setAuthors([
      ...authors,
      {
        id: -Date.now(),
        user_id: newAuthorUserId.trim() || null,
        author_name: newAuthor.trim(),
        author_order: authors.length + 1,
        is_corresponding_author: false,
      },
    ]);
    setNewAuthor("");
    setNewAuthorUserId("");
  };
  const addReviewer = () => {
    if (!newReviewerId.trim()) return;
    setReviewers([
      ...reviewers,
      {
        id: -Date.now(),
        reviewer_id: newReviewerId.trim(),
        review_role: newReviewerRole,
        is_active: true,
        assigned_by: "",
      },
    ]);
    setNewReviewerId("");
  };
  const saveFeedback = () => {
    if (!feedbackComment.trim()) {
      setMessage({
        type: "error",
        text: "Enter a feedback comment and select a valid feedback type.",
      });
      return;
    }
    void runMutation("feedback", "Feedback saved and refreshed.", async () => {
      await createFeedback(research.id, {
        comment: feedbackComment.trim(),
        feedback_type: feedbackType,
      });
    });
  };

  return (
    <div className="workspace-content admin-research-workspace">
      <header className="workspace-header admin-research-header">
        <div>
          <p className="eyebrow">System administration / Internal research</p>
          <h1>{research.title}</h1>
          <p>
            Authorized internal record operations. Changes refresh from the
            server.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/app")}>
          <ArrowLeft aria-hidden="true" /> Back to overview
        </Button>
      </header>
      {message && (
        <p
          className={`admin-operation-message is-${message.type}`}
          role={message.type === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}

      <section
        className="panel-card admin-record-summary"
        aria-labelledby="record-summary-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Record details</p>
            <h2 id="record-summary-title">Operational status</h2>
          </div>
        </div>
        <dl>
          {[
            ["Owner ID", research.submitted_by],
            ["Status", humanize(research.submission_status)],
            ["Research stage", humanize(research.research_stage)],
            ["Archive status", humanize(research.archive_status)],
            ["Visibility", humanize(research.visibility)],
            ["Publication year", research.publication_year ?? "Not specified"],
          ].map(([term, detail]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      {editable && (
        <section
          className="panel-card admin-metadata-form"
          aria-labelledby="metadata-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Editable metadata</p>
              <h2 id="metadata-title">Research metadata</h2>
            </div>
          </div>
          <div className="admin-form-grid">
            <label className="admin-form-wide">
              Title
              <input
                required
                value={form.title}
                disabled={isMutating}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label>
              Publication year
              <PublicationYearInput
                value={form.publicationYear}
                disabled={isMutating}
                onChange={(event) =>
                  setForm({ ...form, publicationYear: event.target.value })
                }
              />
            </label>
            <label>
              Research stage
              <select
                value={form.researchStage}
                disabled={isMutating}
                onChange={(event) =>
                  setForm({
                    ...form,
                    researchStage: event.target
                      .value as FormState["researchStage"],
                  })
                }
              >
                <option value="title_proposal">Title proposal</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label className="admin-form-wide">
              Keywords
              <input
                value={form.keywords}
                disabled={isMutating}
                onChange={(event) =>
                  setForm({ ...form, keywords: event.target.value })
                }
              />
            </label>
            <label className="admin-form-wide">
              Abstract
              <textarea
                rows={5}
                value={form.abstract}
                disabled={isMutating}
                onChange={(event) =>
                  setForm({ ...form, abstract: event.target.value })
                }
              />
            </label>
          </div>
          <Button
            disabled={isMutating || !form.title.trim()}
            onClick={saveMetadata}
          >
            {mutation === "metadata" ? "Saving…" : "Save metadata"}
          </Button>
        </section>
      )}

      <section
        className="panel-card admin-record-actions"
        aria-labelledby="record-actions-title"
      >
        <p className="eyebrow">State-aware actions</p>
        <h2 id="record-actions-title">Workflow actions</h2>
        <div className="admin-action-row">
          {research.submission_status === "draft" && (
            <Button
              disabled={isMutating}
              onClick={() =>
                void runMutation(
                  "submit",
                  "Research submitted and refreshed.",
                  () => submitInternalResearch(research.id),
                )
              }
            >
              {mutation === "submit" ? "Submitting…" : "Submit research"}
            </Button>
          )}
          {research.submission_status === "submitted" && (
            <Button
              disabled={isMutating}
              onClick={() =>
                void runMutation(
                  "review",
                  "Research moved to under review and refreshed.",
                  () => transitionInternalResearch(research.id, "under_review"),
                )
              }
            >
              Move to under review
            </Button>
          )}
          {research.submission_status === "under_review" && (
            <Button
              disabled={isMutating}
              onClick={() =>
                void runMutation(
                  "approve",
                  "Research approved and refreshed.",
                  () => transitionInternalResearch(research.id, "approved"),
                )
              }
            >
              Approve research
            </Button>
          )}
          {canArchive && (
            <div className="admin-inline-control">
              <label>
                Archive visibility
                <select
                  value={archiveVisibility}
                  disabled={isMutating}
                  onChange={(event) =>
                    setArchiveVisibility(
                      event.target
                        .value as InternalResearchResource["visibility"],
                    )
                  }
                >
                  <option value="private">Private</option>
                  <option value="registered_only">Registered only</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <Button
                disabled={isMutating}
                onClick={() =>
                  void runMutation(
                    "archive",
                    "Research archived and refreshed.",
                    () =>
                      archiveInternalResearch(research.id, archiveVisibility),
                  )
                }
              >
                {mutation === "archive" ? "Archiving…" : "Archive research"}
              </Button>
            </div>
          )}
          {canResubmit && (
            <Button
              disabled={isMutating}
              onClick={() =>
                void runMutation(
                  "resubmit",
                  "Revision resubmitted and refreshed.",
                  () =>
                    resubmitResearchRevision(research.id, latestRevision.id),
                )
              }
            >
              {mutation === "resubmit"
                ? "Resubmitting…"
                : `Resubmit revision ${latestRevision.revision_number}`}
            </Button>
          )}
          {!hasWorkflowAction && (
            <p className="admin-no-actions">
              No workflow action is available for this record state.
            </p>
          )}
        </div>
      </section>

      <section
        className="panel-card admin-context-panel"
        aria-labelledby="authors-title"
      >
        <p className="eyebrow">Research context</p>
        <h2 id="authors-title">Authors</h2>
        <ol className="admin-context-list">
          {orderedAuthors.map((author, index) => (
            <li key={author.id}>
              <span>
                {index + 1}. {author.author_name}
                {author.is_corresponding_author ? " (corresponding)" : ""}
              </span>
              {editable && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={author.is_corresponding_author}
                      disabled={isMutating}
                      onChange={(event) =>
                        setAuthors(
                          authors.map((item) =>
                            item.id === author.id
                              ? {
                                  ...item,
                                  is_corresponding_author: event.target.checked,
                                }
                              : item,
                          ),
                        )
                      }
                    />{" "}
                    Corresponding author
                  </label>
                  <Button
                    variant="quiet"
                    disabled={isMutating}
                    onClick={() =>
                      setAuthors(
                        authors.filter((item) => item.id !== author.id),
                      )
                    }
                  >
                    Remove
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
        {editable && (
          <>
            <div className="admin-inline-form">
              <label>
                Author name
                <input
                  value={newAuthor}
                  disabled={isMutating}
                  onChange={(event) => setNewAuthor(event.target.value)}
                />
              </label>
              <label>
                User ID (optional)
                <input
                  value={newAuthorUserId}
                  disabled={isMutating}
                  onChange={(event) => setNewAuthorUserId(event.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                disabled={isMutating || !newAuthor.trim()}
                onClick={addAuthor}
              >
                Add author
              </Button>
            </div>
            <Button
              disabled={isMutating || authors.length === 0}
              onClick={() =>
                void runMutation(
                  "authors",
                  "Authors saved and refreshed.",
                  () =>
                    replaceResearchAuthors(
                      research.id,
                      authorsForSave(authors),
                    ),
                )
              }
            >
              {mutation === "authors" ? "Saving…" : "Save authors"}
            </Button>
          </>
        )}
      </section>

      <section
        className="panel-card admin-context-panel"
        aria-labelledby="reviewers-title"
      >
        <p className="eyebrow">Research context</p>
        <h2 id="reviewers-title">Review assignments</h2>
        <ul className="admin-context-list">
          {reviewers.map((reviewer) => (
            <li key={reviewer.id}>
              <span>
                {reviewer.reviewer_id} — {humanize(reviewer.review_role)}
                {reviewer.is_active ? "" : " (inactive)"}
              </span>
              {reviewer.is_active && (
                <Button
                  variant="quiet"
                  disabled={isMutating}
                  onClick={() =>
                    setReviewers(
                      reviewers.map((item) =>
                        item.id === reviewer.id
                          ? { ...item, is_active: false }
                          : item,
                      ),
                    )
                  }
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="admin-inline-form">
          <label>
            Reviewer UUID
            <input
              value={newReviewerId}
              disabled={isMutating}
              onChange={(event) => setNewReviewerId(event.target.value)}
            />
          </label>
          <label>
            Role
            <select
              value={newReviewerRole}
              disabled={isMutating}
              onChange={(event) =>
                setNewReviewerRole(
                  event.target.value as ReviewAssignmentResource["review_role"],
                )
              }
            >
              <option value="adviser">Adviser</option>
              <option value="instructor">Instructor</option>
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={isMutating || !newReviewerId.trim()}
            onClick={addReviewer}
          >
            Add reviewer
          </Button>
        </div>
        <Button
          disabled={isMutating}
          onClick={() =>
            void runMutation(
              "reviewers",
              "Review assignments saved and refreshed.",
              () =>
                replaceReviewAssignments(
                  research.id,
                  reviewersForSave(reviewers),
                ),
            )
          }
        >
          {mutation === "reviewers" ? "Saving…" : "Save active reviewers"}
        </Button>
      </section>

      <section
        className="panel-card admin-context-panel"
        aria-labelledby="files-title"
      >
        <p className="eyebrow">Research context</p>
        <h2 id="files-title">Files</h2>
        <ul className="admin-context-list">
          {files.length ? (
            files.map((file) => (
              <li key={file.id}>
                <span>
                  {file.original_filename} — {humanize(file.document_type)} v
                  {file.version_number}
                  {file.is_current ? " (current)" : ""}
                </span>
                <span className="admin-file-actions">
                  <button
                    className="icon-button"
                    aria-label={`Rename ${file.original_filename}`}
                    title="Rename file"
                    disabled={isMutating}
                    onClick={() => {
                      setEditingFile(file.id);
                      setFilenameDraft(file.original_filename);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${file.original_filename}`}
                    title="Delete file"
                    disabled={isMutating}
                    onClick={() => {
                      if (window.confirm(`Delete ${file.original_filename}?`))
                        void runMutation(
                          "file-delete",
                          "File deleted and refreshed.",
                          () => deleteResearchFile(research.id, file.id),
                        );
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
                {editingFile === file.id && (
                  <form
                    className="admin-file-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runMutation(
                        "file-rename",
                        "File renamed and refreshed.",
                        () =>
                          renameResearchFile(
                            research.id,
                            file.id,
                            filenameDraft,
                          ),
                      ).then(() => setEditingFile(null));
                    }}
                  >
                    <input
                      aria-label="New filename"
                      value={filenameDraft}
                      onChange={(event) => setFilenameDraft(event.target.value)}
                    />
                    <Button disabled={isMutating || !filenameDraft.trim()}>
                      {mutation === "file-rename" ? "Saving…" : "Save"}
                    </Button>
                  </form>
                )}
                <a
                  className="text-action"
                  href={researchFileDownloadUrl(research.id, file.id)}
                >
                  Download {file.original_filename}
                </a>
              </li>
            ))
          ) : (
            <li>No files are available.</li>
          )}
        </ul>
        {canUpload && (
          <div className="admin-inline-form">
            <label>
              File
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={isMutating}
                onChange={(event) =>
                  setUploadFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label>
              Document type
              <select
                value={uploadType}
                disabled={isMutating}
                onChange={(event) =>
                  setUploadType(event.target.value as FileType)
                }
              >
                {allowedUploadTypes.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={isMutating || !uploadFile}
              onClick={() =>
                uploadFile &&
                void runMutation("upload", "File uploaded and refreshed.", () =>
                  uploadResearchFile(research.id, uploadFile, uploadType),
                )
              }
            >
              {mutation === "upload" ? "Uploading…" : "Upload file"}
            </Button>
          </div>
        )}
      </section>

      <section
        className="panel-card admin-context-panel"
        aria-labelledby="feedback-title"
      >
        <p className="eyebrow">Research context</p>
        <h2 id="feedback-title">Feedback</h2>
        <ul className="admin-context-list">
          {feedback.length ? (
            feedback.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{humanize(item.feedback_type)}</strong>:{" "}
                  {item.comment} — {humanize(item.feedback_status)}
                </span>
                {item.feedback_status !== "resolved" && (
                  <span className="admin-button-group">
                    {item.feedback_status === "open" && (
                      <Button
                        variant="quiet"
                        disabled={isMutating}
                        onClick={() =>
                          void runMutation(
                            `feedback-${item.id}-acknowledged`,
                            "Feedback acknowledged and refreshed.",
                            () =>
                              updateFeedbackStatus(
                                research.id,
                                item.id,
                                "acknowledged",
                              ),
                          )
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      variant="quiet"
                      disabled={isMutating}
                      onClick={() =>
                        void runMutation(
                          `feedback-${item.id}-resolved`,
                          "Feedback resolved and refreshed.",
                          () =>
                            updateFeedbackStatus(
                              research.id,
                              item.id,
                              "resolved",
                            ),
                        )
                      }
                    >
                      Resolve
                    </Button>
                  </span>
                )}
              </li>
            ))
          ) : (
            <li>No feedback is available.</li>
          )}
        </ul>
        <div className="admin-inline-form">
          <label>
            Comment
            <textarea
              rows={2}
              value={feedbackComment}
              disabled={isMutating}
              onChange={(event) => setFeedbackComment(event.target.value)}
            />
          </label>
          <label>
            Feedback type
            <select
              value={feedbackType}
              disabled={isMutating}
              onChange={(event) =>
                setFeedbackType(event.target.value as FeedbackType)
              }
            >
              <option value="comment">Comment</option>
              <option value="suggestion">Suggestion</option>
              <option value="revision_request">Revision request</option>
              <option value="approval_remark">Approval remark</option>
              <option value="general_feedback">General feedback</option>
            </select>
          </label>
          <Button
            disabled={isMutating || !feedbackComment.trim()}
            onClick={saveFeedback}
          >
            {mutation === "feedback" ? "Saving…" : "Add feedback"}
          </Button>
        </div>
      </section>

      <section
        className="panel-card admin-context-panel"
        aria-labelledby="monitoring-title"
      >
        <p className="eyebrow">Research context</p>
        <h2 id="monitoring-title">Monitoring</h2>
        <ul className="admin-context-list">
          {monitoring.length ? (
            monitoring.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{humanize(item.activity_type)}</strong>
                  {item.remarks ? ` — ${item.remarks}` : ""}
                  {item.activity_date
                    ? ` (${new Date(item.activity_date).toLocaleString()})`
                    : ""}
                </span>
              </li>
            ))
          ) : (
            <li>No monitoring entries are available.</li>
          )}
        </ul>
      </section>

      {revisions.length > 0 && (
        <section
          className="panel-card admin-revisions"
          aria-labelledby="revisions-title"
        >
          <p className="eyebrow">Revision history</p>
          <h2 id="revisions-title">Recorded revisions</h2>
          <ul>
            {revisions.map((revision) => (
              <li key={revision.id}>
                <strong>Revision {revision.revision_number}</strong>
                <span>{humanize(revision.revision_status)}</span>
                {revision.revision_remarks && (
                  <p>{revision.revision_remarks}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {validations.length > 0 && (
        <section
          className="panel-card admin-validations"
          aria-labelledby="validation-title"
        >
          <p className="eyebrow">Human title validation</p>
          <h2 id="validation-title">Title validation history</h2>
          <ul>
            {pendingValidations.map((validation) => {
              const choice = validationChoices[validation.id] ?? "";
              const similarityResultId =
                validationSimilarityResultIds[validation.id] ?? "";
              return (
                <li key={validation.id}>
                  <span>Validation #{validation.id}</span>
                  <label>
                    Decision
                    <select
                      aria-label={`Decision for validation ${validation.id}`}
                      value={choice}
                      disabled={isMutating}
                      onChange={(event) =>
                        setValidationChoices({
                          ...validationChoices,
                          [validation.id]: event.target
                            .value as ValidationChoice,
                        })
                      }
                    >
                      <option value="">Select decision</option>
                      <option value="approved">Approved</option>
                      <option value="revision_required">
                        Revision required
                      </option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label>
                    Linked similarity result (optional)
                    <select
                      aria-label={`Similarity result for validation ${validation.id}`}
                      value={similarityResultId}
                      disabled={isMutating}
                      onChange={(event) =>
                        setValidationSimilarityResultIds({
                          ...validationSimilarityResultIds,
                          [validation.id]: event.target.value,
                        })
                      }
                    >
                      <option value="">No linked result</option>
                      {sourceSimilarityResults.map((result) => (
                        <option key={result.id} value={result.id}>
                          #{result.id} — {result.matched_title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Remarks (optional)
                    <input
                      aria-label={`Remarks for validation ${validation.id}`}
                      value={validationRemarks[validation.id] ?? ""}
                      disabled={isMutating}
                      onChange={(event) =>
                        setValidationRemarks({
                          ...validationRemarks,
                          [validation.id]: event.target.value,
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={isMutating || !choice}
                    onClick={() =>
                      void runMutation(
                        `validation-${validation.id}`,
                        "Title validation recorded and refreshed.",
                        () =>
                          updateTitleValidation(research.id, validation.id, {
                            validation_status: choice as ValidationChoice,
                            ...(validationRemarks[validation.id]?.trim()
                              ? {
                                  adviser_remarks:
                                    validationRemarks[validation.id].trim(),
                                }
                              : {}),
                            ...(similarityResultId
                              ? {
                                  similarity_result_id:
                                    Number(similarityResultId),
                                }
                              : {}),
                          }),
                      )
                    }
                  >
                    {mutation === `validation-${validation.id}`
                      ? "Saving…"
                      : "Save decision"}
                  </Button>
                </li>
              );
            })}
            {completedValidations.map((validation) => {
              const linkedResult = sourceSimilarityResults.find(
                (result) => result.id === validation.similarity_result_id,
              );
              return (
                <li key={validation.id} className="admin-validation-complete">
                  <span>Validation #{validation.id}</span>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{humanize(validation.validation_status)}</dd>
                    </div>
                    <div>
                      <dt>Remarks</dt>
                      <dd>{validation.adviser_remarks ?? "None"}</dd>
                    </div>
                    <div>
                      <dt>Linked result</dt>
                      <dd>
                        {linkedResult
                          ? `#${linkedResult.id} — ${linkedResult.matched_title}`
                          : validation.similarity_result_id
                            ? `#${validation.similarity_result_id}`
                            : "None"}
                      </dd>
                    </div>
                    <div>
                      <dt>Validated by</dt>
                      <dd>{validation.validated_by ?? "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Validated at</dt>
                      <dd>
                        {validation.validated_at
                          ? new Date(validation.validated_at).toLocaleString()
                          : "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
