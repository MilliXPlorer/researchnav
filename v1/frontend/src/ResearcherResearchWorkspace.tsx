import { ArrowLeft, Eye, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getInternalResearch,
  getResearchPeople,
  listResearchFiles,
  listResearchRevisions,
  listTitleValidations,
  deleteResearchFile,
  renameResearchFile,
  researchFileDownloadUrl,
  researchFilePreviewUrl,
  reportResearchProgress,
  requestTitleValidation,
  resubmitResearchRevision,
  uploadResearchFile,
  type DocumentFileResource,
  type ResearchDocumentSummaryResource,
  type ResearchPeopleResource,
  type ResearchRevisionResource,
  type TitleValidationResource,
} from "./api";
import { Button } from "./components";
import { ConfirmDialog, Modal } from "./Modal";
import ResearchActivity from "./ResearchActivity";
import { ResearcherNewSubmission } from "./RoleSidebarPages";
import SimilarityResults from "./SimilarityResults";

type WorkspaceContext = {
  research: ResearchDocumentSummaryResource;
  files: DocumentFileResource[];
  revisions: ResearchRevisionResource[];
  validations: TitleValidationResource[];
  people: ResearchPeopleResource;
};

const maxFileBytes = 25 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "doc", "docx"]);
const editableFileTypes: DocumentFileResource["document_type"][] = [
  "title_proposal",
  "draft",
  "chapter",
  "revised_manuscript",
  "attachment",
];
const emptyPeople: ResearchPeopleResource = { section: null, reviewers: [] };

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileError(file: File | null) {
  if (!file) return "Choose a file to upload.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension))
    return "Choose a PDF, DOC, or DOCX file.";
  if (file.size > maxFileBytes) return "The file must not exceed 25 MB.";
  return null;
}

export default function ResearcherResearchWorkspace({
  researchDocumentId,
  navigate,
}: {
  researchDocumentId: string | number;
  navigate: (path: string) => void;
}) {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [mutation, setMutation] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadType, setUploadType] =
    useState<DocumentFileResource["document_type"]>("title_proposal");
  const [renaming, setRenaming] = useState<DocumentFileResource | null>(null);
  const [filename, setFilename] = useState("");
  const [deleting, setDeleting] = useState<DocumentFileResource | null>(null);
  const [progressStatus, setProgressStatus] = useState<
    "on_track" | "at_risk" | "delayed" | "completed"
  >("on_track");
  const [progressRemarks, setProgressRemarks] = useState("");
  const mounted = useRef(true);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    const request = generation.current + 1;
    generation.current = request;
    setLoading(true);
    setError("");
    try {
      const [research, files, revisions, validations, people] =
        await Promise.all([
          getInternalResearch(researchDocumentId),
          listResearchFiles(researchDocumentId),
          listResearchRevisions(researchDocumentId),
          listTitleValidations(researchDocumentId),
          getResearchPeople(researchDocumentId).catch(() => emptyPeople),
        ]);
      if (!mounted.current || generation.current !== request) return;
      setContext({
        research,
        files,
        revisions,
        validations,
        people: {
          section: people?.section ?? null,
          reviewers: people?.reviewers ?? [],
        },
      });
      setUploadType(
        research.submission_status === "revision_required"
          ? "revised_manuscript"
          : "title_proposal",
      );
    } catch {
      if (!mounted.current || generation.current !== request) return;
      setContext(null);
      setError("Your research record could not be loaded. Please try again.");
    } finally {
      if (mounted.current && generation.current === request) setLoading(false);
    }
  }, [researchDocumentId]);

  useEffect(() => {
    // Start after the effect commits so loading state does not synchronously
    // cascade from the effect body. `load` guards stale/unmounted responses.
    void Promise.resolve().then(load);
  }, [load, attempt]);

  const reload = () => setAttempt((current) => current + 1);
  const research = context?.research;
  const editable =
    research?.submission_status === "draft" ||
    research?.submission_status === "revision_required";
  const revisions = [...(context?.revisions ?? [])].sort(
    (first, second) => second.revision_number - first.revision_number,
  );
  const latestRevision = revisions.find((revision) =>
    ["requested", "in_progress"].includes(revision.revision_status),
  );
  const hasCurrentRevisedManuscript = Boolean(
    latestRevision &&
    (context?.files ?? []).some(
      (file) =>
        file.document_type === "revised_manuscript" &&
        file.is_current &&
        file.uploaded_at !== null &&
        new Date(file.uploaded_at).getTime() >
          new Date(
            latestRevision.requested_at ?? Number.POSITIVE_INFINITY,
          ).getTime(),
    ),
  );
  const previewFileId = [...(context?.files ?? [])]
    .filter((file) => file.is_current && file.mime_type === "application/pdf")
    .sort(
      (first, second) =>
        new Date(second.uploaded_at ?? 0).getTime() -
          new Date(first.uploaded_at ?? 0).getTime() ||
        second.version_number - first.version_number,
    )[0]?.id;

  async function runMutation(label: string, action: () => Promise<unknown>) {
    if (mutation) return;
    setMutation(label);
    setMessage("");
    try {
      await action();
      if (!mounted.current) return;
      setMessage("Your changes were saved.");
      reload();
    } catch {
      if (mounted.current)
        setMessage("That change could not be saved. Try again.");
    } finally {
      if (mounted.current) setMutation(null);
    }
  }

  function submitUpload() {
    if (!research || !editable) return;
    const validation = fileError(upload);
    if (validation) {
      setMessage(validation);
      return;
    }
    void runMutation("upload", () =>
      uploadResearchFile(research.id, upload!, uploadType),
    ).then(() => setUpload(null));
  }

  if (loading) {
    return (
      <div className="workspace-content researcher-research-workspace">
        <section className="panel-card dashboard-loading" aria-busy="true">
          Loading your research record…
        </section>
      </div>
    );
  }

  if (!research || error) {
    return (
      <div className="workspace-content researcher-research-workspace">
        <section className="panel-card dashboard-error" role="alert">
          <p>{error || "Your research record is unavailable."}</p>
          <Button variant="secondary" onClick={reload}>
            Retry
          </Button>
          <Button variant="quiet" onClick={() => navigate("/app")}>
            Back to dashboard
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-content researcher-research-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">My research / Record</p>
          <h1>{research.title}</h1>
          <p>
            Manage your submission, revision history, files, and review
            activity.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/app")}>
          <ArrowLeft /> Back to dashboard
        </Button>
      </header>

      {message && (
        <p className="researcher-operation-message" role="status">
          {message}
        </p>
      )}

      <section
        className="panel-card researcher-record-summary"
        aria-labelledby="researcher-summary-title"
      >
        <div className="section-heading">
          <div>
            <dt>Submission reference</dt>
            <dd>{research.submission_reference ?? "Pending reference"}</dd>
          </div>
          <div>
            <p className="eyebrow">Submission details</p>
            <h2 id="researcher-summary-title">Record status</h2>
          </div>
          {editable && (
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
              disabled={Boolean(mutation)}
            >
              Edit metadata and authors
            </Button>
          )}
        </div>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{humanize(research.submission_status)}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{humanize(research.research_stage)}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{research.category?.name ?? "Uncategorized"}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(research.submitted_at)}</dd>
          </div>
          <div>
            <dt>Year</dt>
            <dd>{research.publication_year ?? "—"}</dd>
          </div>
          <div>
            <dt>Authors</dt>
            <dd>
              {research.authors
                .map((author) => author.author_name)
                .join(", ") || "—"}
            </dd>
          </div>
        </dl>
        {research.abstract && (
          <p className="researcher-abstract">{research.abstract}</p>
        )}
        {(context.people.section || context.people.reviewers.length > 0) && (
          <div
            className="researcher-people"
            aria-label="Assigned research contacts"
          >
            <strong>Assigned contacts</strong>
            {context.people.section && (
              <p>
                Section: {context.people.section.name}
                {context.people.section.academic_year
                  ? ` · ${context.people.section.academic_year}`
                  : ""}
                {context.people.section.instructor_name
                  ? ` · Instructor: ${context.people.section.instructor_name}`
                  : ""}
              </p>
            )}
            {context.people.reviewers.length > 0 && (
              <p>
                Reviewers:{" "}
                {context.people.reviewers
                  .map(
                    (reviewer) =>
                      `${humanize(reviewer.review_role)}: ${reviewer.name ?? "Assigned reviewer"}`,
                  )
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </section>

      {research.submission_status === "revision_required" && (
        <section
          className="panel-card researcher-revision-banner"
          role="status"
        >
          <div>
            <p className="eyebrow">Action required</p>
            <h2>Revision requested</h2>
            <p>
              {latestRevision?.revision_remarks ??
                "Review the revision remarks, update your record, and upload a revised manuscript."}
            </p>
            {!hasCurrentRevisedManuscript && (
              <p>
                Upload a current revised manuscript after this revision request
                before resubmitting.
              </p>
            )}
          </div>
          {latestRevision && (
            <Button
              disabled={Boolean(mutation) || !hasCurrentRevisedManuscript}
              onClick={() =>
                void runMutation("resubmit", () =>
                  resubmitResearchRevision(research.id, latestRevision.id),
                )
              }
            >
              {mutation === "resubmit"
                ? "Resubmitting…"
                : `Resubmit revision ${latestRevision.revision_number}`}
            </Button>
          )}
        </section>
      )}

      <section
        className="panel-card researcher-history"
        aria-labelledby="revision-history-title"
      >
        <p className="eyebrow">Review workflow</p>
        <h2 id="revision-history-title">Revision history</h2>
        {revisions.length === 0 ? (
          <p>No revisions have been requested.</p>
        ) : (
          <ol>
            {revisions.map((revision) => (
              <li key={revision.id}>
                <strong>
                  Revision {revision.revision_number} ·{" "}
                  {humanize(revision.revision_status)}
                </strong>
                <p>
                  {revision.revision_remarks ?? "No remarks were recorded."}
                </p>
                <time>
                  Requested {formatDate(revision.requested_at)} · Submitted{" "}
                  {formatDate(revision.submitted_at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className="panel-card researcher-history"
        aria-labelledby="validation-history-title"
      >
        <p className="eyebrow">Title review</p>
        <h2 id="validation-history-title">Title-validation history</h2>
        <Button
          variant="secondary"
          disabled={
            Boolean(mutation) ||
            context.validations.some(
              (item) => item.validation_status === "pending",
            )
          }
          onClick={() =>
            void runMutation("title-validation", () =>
              requestTitleValidation(research.id),
            )
          }
        >
          {mutation === "title-validation"
            ? "Requesting…"
            : "Request title validation"}
        </Button>
        {context.validations.length === 0 ? (
          <p>No title validations have been recorded.</p>
        ) : (
          <ol>
            {context.validations.map((validation) => (
              <li key={validation.id}>
                <strong>{humanize(validation.validation_status)}</strong>
                <p>
                  {validation.adviser_remarks ?? "No remarks were recorded."}
                </p>
                {validation.validator_name && (
                  <p>Reviewer: {validation.validator_name}</p>
                )}
                {validation.similarity_result && (
                  <p>
                    Linked similarity evidence:{" "}
                    {validation.similarity_result.matched_title} · analyzed{" "}
                    {formatDate(validation.similarity_result.analyzed_at)}
                  </p>
                )}
                <time>
                  Created {formatDate(validation.created_at)} · Updated{" "}
                  {formatDate(validation.updated_at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className="panel-card researcher-files"
        aria-labelledby="researcher-files-title"
      >
        <p className="eyebrow">Document files</p>
        <h2 id="researcher-files-title">All file versions</h2>
        {context.files.length === 0 ? (
          <p>No files have been uploaded.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">
                All uploaded document file versions
              </caption>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Current</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {context.files.map((file) => {
                  const fileEditable =
                    editable && file.document_type !== "final_manuscript";
                  return (
                    <tr key={file.id}>
                      <td>{file.original_filename}</td>
                      <td>{humanize(file.document_type)}</td>
                      <td>v{file.version_number}</td>
                      <td>{file.is_current ? "Current" : "Previous"}</td>
                      <td>{formatBytes(file.file_size)}</td>
                      <td>{formatDate(file.uploaded_at)}</td>
                      <td>
                        <span className="row-actions">
                          <a
                            className="text-action"
                            href={researchFileDownloadUrl(research.id, file.id)}
                          >
                            Download
                          </a>
                          {file.id === previewFileId && (
                            <a
                              className="text-action"
                              href={researchFilePreviewUrl(
                                research.id,
                                file.id,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Eye size={15} /> Preview PDF
                            </a>
                          )}
                          {fileEditable && (
                            <>
                              <button
                                className="icon-button"
                                aria-label={`Rename ${file.original_filename}`}
                                onClick={() => {
                                  setRenaming(file);
                                  setFilename(file.original_filename);
                                }}
                                disabled={Boolean(mutation)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="icon-button danger"
                                aria-label={`Delete ${file.original_filename}`}
                                onClick={() => setDeleting(file)}
                                disabled={Boolean(mutation)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <div className="researcher-file-upload">
            <label>
              New file or replacement
              <input
                aria-label="New file or replacement"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setUpload(event.target.files?.[0] ?? null)}
                disabled={Boolean(mutation)}
              />
            </label>
            <label>
              Document type
              <select
                value={uploadType}
                onChange={(event) =>
                  setUploadType(
                    event.target.value as DocumentFileResource["document_type"],
                  )
                }
                disabled={Boolean(mutation)}
              >
                {editableFileTypes.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={submitUpload}
              disabled={!upload || Boolean(mutation)}
            >
              {mutation === "upload" ? "Uploading…" : "Upload file"}
            </Button>
          </div>
        )}
      </section>

      <section
        className="panel-card researcher-progress"
        aria-labelledby="progress-title"
      >
        <p className="eyebrow">Progress monitoring</p>
        <h2 id="progress-title">Report your research progress</h2>
        <form
          className="admin-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!progressRemarks.trim()) {
              setMessage(
                "Describe your progress before submitting the report.",
              );
              return;
            }
            void runMutation("progress", () =>
              reportResearchProgress(research.id, {
                progress_status: progressStatus,
                remarks: progressRemarks.trim(),
              }),
            ).then(() => setProgressRemarks(""));
          }}
        >
          <label>
            Progress status
            <select
              value={progressStatus}
              onChange={(event) =>
                setProgressStatus(event.target.value as typeof progressStatus)
              }
              disabled={Boolean(mutation)}
            >
              <option value="on_track">On track</option>
              <option value="at_risk">At risk</option>
              <option value="delayed">Delayed</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="submission-abstract-field">
            Progress details
            <textarea
              value={progressRemarks}
              onChange={(event) => setProgressRemarks(event.target.value)}
              maxLength={10000}
              rows={3}
              disabled={Boolean(mutation)}
            />
          </label>
          <Button disabled={Boolean(mutation) || !progressRemarks.trim()}>
            {mutation === "progress" ? "Saving…" : "Save progress report"}
          </Button>
        </form>
      </section>

      <ResearchActivity
        researchDocumentId={research.id}
        title={research.title}
        refreshKey={attempt}
        researcherActions
      />
      <SimilarityResults
        researchDocumentId={research.id}
        onOpenCatalog={(title) =>
          navigate(`/catalog?q=${encodeURIComponent(title)}`)
        }
      />

      {editing && (
        <Modal
          label={`Edit ${research.title}`}
          onClose={() => setEditing(false)}
          dirty={editDirty}
          size="large"
        >
          <ResearcherNewSubmission
            role="researcher"
            draft={research}
            embedded
            onDirtyChange={setEditDirty}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        </Modal>
      )}
      {renaming && (
        <Modal
          label={`Rename ${renaming.original_filename}`}
          onClose={() => setRenaming(null)}
        >
          <form
            className="admin-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runMutation("rename", () =>
                renameResearchFile(research.id, renaming.id, filename),
              ).then(() => setRenaming(null));
            }}
          >
            <label>
              New filename
              <input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
              />
            </label>
            <Button disabled={!filename.trim() || Boolean(mutation)}>
              {mutation === "rename" ? "Saving…" : "Save filename"}
            </Button>
          </form>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete file version"
          message={`Delete ${deleting.original_filename}? If this is the current version, the previous version becomes current.`}
          confirmLabel="Delete file"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const file = deleting;
            setDeleting(null);
            void runMutation("delete", () =>
              deleteResearchFile(research.id, file.id),
            );
          }}
        />
      )}
    </div>
  );
}
