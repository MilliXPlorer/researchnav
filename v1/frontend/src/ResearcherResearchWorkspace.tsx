import { formatPhilippineDateTime } from "./dateTime";
import {
  ArrowLeft,
  Eye,
  Folder,
  Pencil,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getInternalResearch,
  getResearchPeople,
  listEligibleSupportUsers,
  listResearchFolders,
  listResearchFiles,
  listResearchRevisions,
  listResearchSupportAssignments,
  listTitleValidations,
  deleteResearchFile,
  renameResearchFile,
  researchFileDownloadUrl,
  researchFilePreviewUrl,
  reportResearchProgress,
  requestResearchSupport,
  resubmitResearchRevision,
  uploadResearchFile,
  type DocumentFileResource,
  type ResearchDocumentSummaryResource,
  type ResearchPeopleResource,
  type ResearchRevisionResource,
  type SupportAssignmentResource,
  type TitleValidationResource,
} from "./api";
import { Button } from "./components";
import { ConfirmDialog, Modal } from "./Modal";
import ResearchActivity from "./ResearchActivity";
import { ResearcherNewSubmission } from "./RoleSidebarPages";
import SimilarityResults from "./SimilarityResults";
import ManuscriptFilePicker from "./ManuscriptFilePicker";

type WorkspaceContext = {
  research: ResearchDocumentSummaryResource;
  files: DocumentFileResource[];
  revisions: ResearchRevisionResource[];
  validations: TitleValidationResource[];
  people: ResearchPeopleResource;
  folders: string[];
  supportAssignments: SupportAssignmentResource[];
};

type ResearcherSection =
  "files" | "revisions" | "validations" | "people" | "folders" | "support";

type SupportRole = SupportAssignmentResource["assignment_role"];

const supportRoles: Array<{ role: SupportRole; label: string }> = [
  { role: "research_editor", label: "Editor" },
  { role: "statistician", label: "Statistician" },
  { role: "librarian", label: "Librarian" },
];

const maxFileBytes = 25 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "docx"]);
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
  return formatPhilippineDateTime(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileError(file: File | null) {
  if (!file) return "Choose a file to upload.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) return "Choose a PDF or DOCX file.";
  if (file.size > maxFileBytes) return "The file must not exceed 25 MB.";
  return null;
}

function readArraySection<T>(
  result: PromiseSettledResult<T[]>,
  section: ResearcherSection,
  sectionErrors: ResearcherSection[],
) {
  if (result.status === "fulfilled" && Array.isArray(result.value)) {
    return result.value;
  }
  sectionErrors.push(section);
  return [];
}

function ResearchWorkflow({
  status,
}: {
  status: ResearchDocumentSummaryResource["submission_status"];
}) {
  const steps: Array<{
    key: ResearchDocumentSummaryResource["submission_status"];
    label: string;
  }> = [
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "under_review", label: "Under review" },
    { key: "revision_required", label: "Revision required" },
    { key: "approved", label: "Approved" },
    { key: "archived", label: "Archived" },
  ];
  const current = steps.findIndex((step) => step.key === status);
  const completed = new Set<
    ResearchDocumentSummaryResource["submission_status"]
  >(
    status === "archived"
      ? ["draft", "submitted", "under_review", "approved", "archived"]
      : status === "approved"
        ? ["draft", "submitted", "under_review", "approved"]
        : steps.slice(0, current + 1).map((step) => step.key),
  );

  return (
    <section
      className="panel-card researcher-workflow"
      aria-labelledby="workflow-title"
    >
      <p className="eyebrow">Submission timeline</p>
      <h2 id="workflow-title">Research progress</h2>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={completed.has(step.key) ? "complete" : ""}
            aria-current={index === current ? "step" : undefined}
          >
            <span aria-hidden="true">{index + 1}</span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      {status === "revision_required" && (
        <p>
          Adviser review is required before this record can continue toward
          approval. Upload the requested revision and resubmit it for human
          review.
        </p>
      )}
    </section>
  );
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
  const [source, setSource] = useState<"live" | "mock">("live");
  const [mockSections, setMockSections] = useState<ResearcherSection[]>([]);
  const [sectionErrors, setSectionErrors] = useState<ResearcherSection[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [mutation, setMutation] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadType, setUploadType] =
    useState<DocumentFileResource["document_type"]>("title_proposal");
  const [uploadFolder, setUploadFolder] = useState("");
  const [supportRole, setSupportRole] = useState<SupportRole | null>(null);
  const [supportCandidates, setSupportCandidates] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [supportCandidateId, setSupportCandidateId] = useState("");
  const [supportCandidatesLoading, setSupportCandidatesLoading] =
    useState(false);
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
      const research = await getInternalResearch(researchDocumentId);
      if (!research || !Array.isArray(research.authors)) {
        throw new Error("RESEARCHER_RECORD_INVALID");
      }

      const [
        filesResult,
        revisionsResult,
        validationsResult,
        peopleResult,
        foldersResult,
        supportResult,
      ] = await Promise.allSettled([
        listResearchFiles(researchDocumentId),
        listResearchRevisions(researchDocumentId),
        listTitleValidations(researchDocumentId),
        getResearchPeople(researchDocumentId),
        listResearchFolders(researchDocumentId),
        listResearchSupportAssignments(researchDocumentId),
      ]);
      if (!mounted.current || generation.current !== request) return;

      const nextMockSections: ResearcherSection[] = [];
      const nextSectionErrors: ResearcherSection[] = [];
      const files = readArraySection(filesResult, "files", nextSectionErrors);
      const revisions = readArraySection(
        revisionsResult,
        "revisions",
        nextSectionErrors,
      );
      const validations = readArraySection(
        validationsResult,
        "validations",
        nextSectionErrors,
      );
      let people = emptyPeople;
      if (peopleResult.status === "fulfilled" && peopleResult.value) {
        people = {
          section: peopleResult.value.section ?? null,
          reviewers: Array.isArray(peopleResult.value.reviewers)
            ? peopleResult.value.reviewers
            : [],
        };
      } else {
        nextSectionErrors.push("people");
      }

      const folders = readArraySection(
        foldersResult,
        "folders",
        nextSectionErrors,
      );
      const supportAssignments = readArraySection(
        supportResult,
        "support",
        nextSectionErrors,
      );

      setContext({
        research,
        files,
        revisions,
        validations,
        people,
        folders,
        supportAssignments,
      });
      setSource("live");
      setMockSections(nextMockSections);
      setSectionErrors(nextSectionErrors);
      setUploadType(
        research.submission_status === "revision_required"
          ? "revised_manuscript"
          : "title_proposal",
      );
      setUploadFolder((current) =>
        folders.includes(current) ? current : (folders[0] ?? ""),
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
    source === "live" &&
    (research?.submission_status === "draft" ||
      research?.submission_status === "revision_required");
  const canReportProgress =
    research?.research_stage === "ongoing" &&
    research.submission_status !== "archived";
  const revisions = [...(context?.revisions ?? [])].sort(
    (first, second) => second.revision_number - first.revision_number,
  );
  const completedValidations = (context?.validations ?? []).filter(
    (validation) => validation.validation_status !== "pending",
  );
  const latestRevision = revisions.find((revision) =>
    ["requested", "in_progress"].includes(revision.revision_status),
  );
  const filesAreLive =
    source === "live" &&
    !mockSections.includes("files") &&
    !sectionErrors.includes("files");
  const hasCurrentRevisedManuscript = Boolean(
    filesAreLive &&
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

  function currentSupportAssignment(role: SupportRole) {
    return (context?.supportAssignments ?? []).find(
      (assignment) =>
        assignment.assignment_role === role &&
        ["requested", "pending", "accepted", "confirmed", "active"].includes(
          assignment.status,
        ),
    );
  }

  function supportRoleLabel(role: SupportRole) {
    return (
      supportRoles.find((item) => item.role === role)?.label ?? humanize(role)
    );
  }

  async function openSupportPicker(role: SupportRole) {
    if (mutation) return;
    setSupportRole(role);
    setSupportCandidateId("");
    setSupportCandidates([]);
    setSupportCandidatesLoading(true);
    setMessage("");
    try {
      const candidates = await listEligibleSupportUsers(role);
      if (!mounted.current) return;
      const current = currentSupportAssignment(role);
      setSupportCandidates(
        candidates.filter((candidate) => candidate.id !== current?.user_id),
      );
    } catch {
      if (mounted.current)
        setMessage("Available research support accounts could not be loaded.");
    } finally {
      if (mounted.current) setSupportCandidatesLoading(false);
    }
  }

  async function runMutation(label: string, action: () => Promise<unknown>) {
    if (mutation || source === "mock") return;
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
      uploadResearchFile(
        research.id,
        upload!,
        uploadType,
        uploadFolder || null,
      ),
    ).then(() => setUpload(null));
  }

  function submitSupportRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!research || !supportRole || !supportCandidateId) return;
    const current = currentSupportAssignment(supportRole);
    const role = supportRole;
    void runMutation(`support-${role}`, () =>
      requestResearchSupport(
        research.id,
        supportCandidateId,
        role,
        Boolean(current),
      ),
    ).then(() => {
      setSupportRole(null);
      setSupportCandidateId("");
      setSupportCandidates([]);
    });
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
          <Button
            variant="quiet"
            onClick={() => navigate("/app/researcher/submissions")}
          >
            Back to my research
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
        <Button
          variant="secondary"
          onClick={() => navigate("/app/researcher/submissions")}
        >
          <ArrowLeft /> Back to my research
        </Button>
      </header>

      {message && (
        <p className="researcher-operation-message" role="status">
          {message}
        </p>
      )}

      {source === "mock" && (
        <section className="researcher-demo-notice" role="status">
          <div>
            <strong>Demo data - read only</strong>
            <span>
              This sample record is shown because the live research details
              could not be loaded. Editing, uploads, actions, previews, and
              downloads are disabled.
            </span>
          </div>
          <Button variant="secondary" onClick={reload}>
            Retry live data
          </Button>
        </section>
      )}

      {source === "live" && mockSections.length > 0 && (
        <section className="researcher-demo-notice" role="status">
          <div>
            <strong>Some sections use demo data</strong>
            <span>
              Live {mockSections.map(humanize).join(", ")} could not be loaded.
              Those sections are read only; your live research details are
              preserved.
            </span>
          </div>
          <Button variant="secondary" onClick={reload}>
            Retry live data
          </Button>
        </section>
      )}

      {sectionErrors.length > 0 && (
        <section className="panel-card dashboard-error" role="alert">
          <p>
            Some research sections are unavailable:{" "}
            {sectionErrors.map(humanize).join(", ")}.
          </p>
          <Button variant="secondary" onClick={reload}>
            Retry
          </Button>
        </section>
      )}

      <aside
        className="researcher-folder-guide"
        aria-label="Folder action guide"
      >
        <div>
          <strong>Submitting research</strong>
          <span>
            Edit details and files, then submit the draft. Submission sends the
            manuscript to reviewers and locks normal editing during review.
          </span>
        </div>
        <div>
          <strong>Reporting progress</strong>
          <span>
            Use Progress to share accomplishments, blockers, and next steps. A
            progress update does not submit or approve the manuscript.
          </span>
        </div>
      </aside>

      <nav
        className="researcher-section-nav"
        aria-label="Research record sections"
      >
        <a href="#submission-status">Status</a>
        <a href="#research-support">Research team</a>
        <a href="#revision-history">Revisions</a>
        <a href="#research-files">Files</a>
        <a href="#research-progress">Progress updates</a>
        <a href="#research-feedback">Feedback</a>
      </nav>

      <div className="researcher-overview-grid">
        <ResearchWorkflow status={research.submission_status} />

        <section
          id="submission-status"
          className="panel-card researcher-record-summary"
          aria-labelledby="researcher-summary-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Submission details</p>
              <h2 id="researcher-summary-title">Record status</h2>
              <p className="researcher-reference">
                {research.submission_reference ?? "Pending reference"}
              </p>
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
              <dd>
                <span className="researcher-status-badge">
                  {humanize(research.submission_status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Stage</dt>
              <dd>{humanize(research.research_stage)}</dd>
            </div>
            <div>
              <dt>Institute</dt>
              <dd>{research.institute ?? "Not specified"}</dd>
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
              <dt>Program</dt>
              <dd>{research.degree_program ?? "Not specified"}</dd>
            </div>
          </dl>
          {research.abstract && (
            <div className="researcher-abstract">
              <strong>Abstract</strong>
              <p>{research.abstract}</p>
            </div>
          )}
          <div className="researcher-authors">
            <strong>Researchers</strong>
            <p>
              {research.authors
                .map((author) => author.author_name)
                .join(", ") || "Not specified"}
            </p>
          </div>
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
      </div>

      <section
        id="research-support"
        className="panel-card researcher-support"
        aria-labelledby="research-support-title"
      >
        <div className="researcher-support-heading">
          <div>
            <p className="eyebrow">Research support</p>
            <h2 id="research-support-title">
              Editor, Statistician, and Librarian
            </h2>
            <p>
              Your group chooses these support actors. A new or replacement
              assignment becomes active after the selected person accepts the
              request.
            </p>
          </div>
        </div>
        <div className="researcher-support-grid">
          {supportRoles.map(({ role: supportActorRole, label: actorLabel }) => {
            const assignment = currentSupportAssignment(supportActorRole);
            const canManage =
              source === "live" && !sectionErrors.includes("support");
            return (
              <article
                className="researcher-support-card"
                key={supportActorRole}
              >
                <span className="researcher-support-icon" aria-hidden="true">
                  {assignment ? <UserRoundCheck /> : <UserRoundPlus />}
                </span>
                <div>
                  <span>{actorLabel}</span>
                  <strong>{assignment?.name ?? "Not assigned"}</strong>
                  <small>
                    {assignment
                      ? humanize(assignment.status)
                      : "Choose an active account when needed."}
                  </small>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`${assignment ? "Change" : "Add"} ${actorLabel}`}
                    disabled={Boolean(mutation)}
                    onClick={() => void openSupportPicker(supportActorRole)}
                  >
                    {assignment ? "Change" : "Add"}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
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
          {latestRevision &&
            source === "live" &&
            !mockSections.includes("revisions") && (
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

      <div className="researcher-history-grid">
        <section
          id="revision-history"
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
                  {revision.required_action && (
                    <p>Required action: {revision.required_action}</p>
                  )}
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
          <h2 id="validation-history-title">Title review decisions</h2>
          {completedValidations.length === 0 ? (
            <p>No title review decisions have been recorded.</p>
          ) : (
            <ol>
              {completedValidations.map((validation) => (
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

        {source === "live" ? (
          <SimilarityResults
            researchDocumentId={research.id}
            eyebrow="Title review"
          />
        ) : (
          <section className="panel-card">
            <p className="eyebrow">Title review</p>
            <h2>Live similarity results unavailable</h2>
            <p>
              Similarity results are never fabricated. Use the existing
              Similarity Check when the live service is available.
            </p>
          </section>
        )}
      </div>

      <section
        id="research-files"
        className="panel-card researcher-files"
        aria-labelledby="researcher-files-title"
      >
        <p className="eyebrow">Document files</p>
        <h2 id="researcher-files-title">All file versions</h2>
        {context.files.length === 0 ? (
          <p>No files have been uploaded.</p>
        ) : (
          <div className="admin-table-wrap researcher-files-table">
            <table>
              <caption className="sr-only">
                All uploaded document file versions
              </caption>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Folder</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Current</th>
                  <th>Uploaded by</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {context.files.map((file) => {
                  const fileEditable =
                    editable &&
                    filesAreLive &&
                    file.document_type !== "final_manuscript";
                  return (
                    <tr key={file.id}>
                      <td data-label="Filename">{file.original_filename}</td>
                      <td data-label="Folder">
                        {file.relative_path ?? "Unfiled"}
                      </td>
                      <td data-label="Type">{humanize(file.document_type)}</td>
                      <td data-label="Version">v{file.version_number}</td>
                      <td data-label="Current">
                        {file.is_current ? "Current" : "Previous"}
                      </td>
                      <td data-label="Uploaded by">
                        {file.uploader_name ?? "Researcher"}
                      </td>
                      <td data-label="Size">{formatBytes(file.file_size)}</td>
                      <td data-label="Uploaded">
                        {formatDate(file.uploaded_at)}
                      </td>
                      <td data-label="Actions">
                        <span className="row-actions">
                          {filesAreLive && (
                            <a
                              className="text-action"
                              href={researchFileDownloadUrl(
                                research.id,
                                file.id,
                              )}
                            >
                              Download
                            </a>
                          )}
                          {filesAreLive && file.id === previewFileId && (
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
                          {(source === "mock" ||
                            mockSections.includes("files")) && (
                            <span>Demo file</span>
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
        {editable && filesAreLive && (
          <div className="researcher-file-upload">
            <ManuscriptFilePicker
              label="New file or replacement"
              help="PDF or DOCX, maximum 25 MB"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              file={upload}
              onChange={(event) => setUpload(event.target.files?.[0] ?? null)}
              disabled={Boolean(mutation)}
            />
            <label>
              Document folder
              <select
                aria-label="Document folder"
                value={uploadFolder}
                onChange={(event) => setUploadFolder(event.target.value)}
                disabled={Boolean(mutation)}
              >
                <option value="">Unfiled</option>
                {(context.folders ?? []).map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
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
        id="research-progress"
        className="panel-card researcher-progress"
        aria-labelledby="progress-title"
      >
        <div className="researcher-progress-heading">
          <div>
            <p className="eyebrow">
              Progress update, not manuscript submission
            </p>
            <h2 id="progress-title">Report your current progress</h2>
            <p>
              Keep your Research Instructor and assigned reviewers informed
              about your group&apos;s current work and any support you need.
            </p>
          </div>
          <span>{humanize(research.research_stage)}</span>
        </div>
        {!canReportProgress ? (
          <div className="researcher-progress-unavailable">
            <strong>Progress reporting is not available yet</strong>
            <p>
              This becomes available when the research reaches the Ongoing
              stage. You can continue working with the files and actions above.
            </p>
          </div>
        ) : (
          <form
            className="researcher-progress-form"
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
            <fieldset className="researcher-progress-statuses">
              <legend>How is the research progressing?</legend>
              {(
                [
                  ["on_track", "On track", "Work is moving according to plan."],
                  [
                    "at_risk",
                    "Needs attention",
                    "A concern may affect the timeline.",
                  ],
                  [
                    "delayed",
                    "Delayed",
                    "Work is behind the expected schedule.",
                  ],
                  [
                    "completed",
                    "Completed",
                    "The current research work is finished.",
                  ],
                ] as const
              ).map(([value, statusLabel, description]) => (
                <label
                  key={value}
                  className={progressStatus === value ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="progress-status"
                    value={value}
                    checked={progressStatus === value}
                    onChange={() => setProgressStatus(value)}
                    disabled={Boolean(mutation)}
                  />
                  <span>
                    <strong>{statusLabel}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="researcher-progress-details">
              What has your group accomplished?
              <textarea
                value={progressRemarks}
                onChange={(event) => setProgressRemarks(event.target.value)}
                maxLength={10000}
                rows={5}
                placeholder="Summarize completed work, current tasks, blockers, and the next step."
                disabled={Boolean(mutation)}
              />
              <small>
                Include blockers or assistance needed so your instructor can
                respond clearly.
              </small>
            </label>
            <div className="researcher-progress-actions">
              <span>
                {progressRemarks.trim().length.toLocaleString()} / 10,000
                characters
              </span>
              <Button disabled={Boolean(mutation) || !progressRemarks.trim()}>
                {mutation === "progress" ? "Saving…" : "Submit progress update"}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section
        id="research-feedback"
        className="panel-card researcher-activity-panel"
        aria-label="Research feedback and activity"
      >
        <ResearchActivity
          researchDocumentId={research.id}
          title={research.title}
          refreshKey={attempt}
          researcherActions
          forceMock={source === "mock"}
        />
      </section>
      {supportRole && (
        <Modal
          label={`${currentSupportAssignment(supportRole) ? "Change" : "Add"} ${supportRoleLabel(supportRole)}`}
          onClose={() => {
            setSupportRole(null);
            setSupportCandidateId("");
            setSupportCandidates([]);
          }}
          busy={supportCandidatesLoading || Boolean(mutation)}
        >
          <form className="admin-inline-form" onSubmit={submitSupportRequest}>
            <h2>
              {currentSupportAssignment(supportRole) ? "Change" : "Add"}{" "}
              {supportRoleLabel(supportRole)}
            </h2>
            <div className="support-assignment-summary">
              <Folder aria-hidden="true" />
              <span>
                <strong>{research.title}</strong>
                <small>
                  {currentSupportAssignment(supportRole)
                    ? `Current ${supportRoleLabel(supportRole)}: ${currentSupportAssignment(supportRole)?.name ?? "Assigned account"}`
                    : `Choose the ${supportRoleLabel(supportRole)} for this study.`}
                </small>
              </span>
            </div>
            <label>
              Select {supportRoleLabel(supportRole)}
              <select
                aria-label={`Select ${supportRoleLabel(supportRole)}`}
                value={supportCandidateId}
                onChange={(event) => setSupportCandidateId(event.target.value)}
                disabled={supportCandidatesLoading || Boolean(mutation)}
              >
                <option value="">
                  {supportCandidatesLoading
                    ? "Loading available accounts…"
                    : "Choose an account"}
                </option>
                {supportCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} — {candidate.email}
                  </option>
                ))}
              </select>
            </label>
            {!supportCandidatesLoading && supportCandidates.length === 0 && (
              <p className="admin-empty">
                No other active accounts are available for this role.
              </p>
            )}
            <div className="modal-actions">
              <Button
                type="submit"
                disabled={
                  !supportCandidateId ||
                  supportCandidatesLoading ||
                  Boolean(mutation)
                }
              >
                {mutation === `support-${supportRole}`
                  ? "Sending…"
                  : currentSupportAssignment(supportRole)
                    ? "Send change request"
                    : "Send assignment request"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

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
