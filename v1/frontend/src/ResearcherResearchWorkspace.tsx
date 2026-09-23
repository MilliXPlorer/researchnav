import { formatPhilippineDateTime } from "./dateTime";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  MessageSquareText,
  Pencil,
  Trash2,
  UploadCloud,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
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
  deleteResearchFile,
  renameResearchFile,
  researchFileDownloadUrl,
  researchFilePreviewUrl,
  requestResearchSupport,
  resubmitResearchRevision,
  uploadResearchFile,
  type DocumentFileResource,
  type ResearchDocumentSummaryResource,
  type ResearchPeopleResource,
  type ResearchRevisionResource,
  type SupportAssignmentResource,
} from "./api";
import { Button } from "./components";
import { ConfirmDialog, Modal } from "./Modal";
import { ResearcherNewSubmission } from "./RoleSidebarPages";
import ManuscriptFilePicker from "./ManuscriptFilePicker";
import { withStandardResearchFolders } from "./researchFolders";
import DefenseMonitoringMenu, {
  type DefenseType,
} from "./DefenseMonitoringMenu";
import SharedMonitoring from "./SharedMonitoring";
import PdfAnnotationWorkspace from "./PdfAnnotationWorkspace";
import DocumentFeedbackPanel from "./DocumentFeedbackPanel";
import DocxPreviewWorkspace from "./DocxPreviewWorkspace";
import type {
  ResearchWorkspaceDestination,
  ResearchWorkspaceTab,
} from "./researchWorkspaceRoute";
import { SdgBadges } from "./SdgMetadata";

type WorkspaceContext = {
  research: ResearchDocumentSummaryResource;
  files: DocumentFileResource[];
  revisions: ResearchRevisionResource[];
  people: ResearchPeopleResource;
  folders: string[];
  supportAssignments: SupportAssignmentResource[];
};

type ResearcherSection =
  "files" | "revisions" | "people" | "folders" | "support";

type SupportRole = SupportAssignmentResource["assignment_role"];
type ResearcherWorkspaceTab = ResearchWorkspaceTab;

const supportRoles: Array<{ role: SupportRole; label: string }> = [
  { role: "research_editor", label: "Editor" },
  { role: "statistician", label: "Statistician" },
  { role: "librarian", label: "Librarian" },
];

const maxFileBytes = 25 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "docx"]);
const uploadPurposes: Array<{
  value: NonNullable<DocumentFileResource["upload_purpose"]>;
  label: string;
}> = [
  { value: "initial_submission", label: "Initial Submission" },
  { value: "final_revision", label: "Final Revision" },
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

function fileError(file: File | null) {
  if (!file) return "Choose a file to upload.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) return "Choose a PDF or DOCX file.";
  if (file.size > maxFileBytes) return "The file must not exceed 25 MB.";
  return null;
}

function inferredDocumentType(
  status: ResearchDocumentSummaryResource["submission_status"],
  folder: string,
): DocumentFileResource["document_type"] {
  if (status === "revision_required") return "revised_manuscript";
  if (!folder || folder === "Unfiled") return "attachment";
  return "chapter";
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

export default function ResearcherResearchWorkspace({
  researchDocumentId,
  navigate,
  destination,
}: {
  researchDocumentId: string | number;
  navigate: (path: string) => void;
  destination?: ResearchWorkspaceDestination;
}) {
  const destinationTab = destination?.tab;
  const destinationFolder = destination?.folder;
  const destinationFileId = destination?.fileId;
  const destinationPanel = destination?.panel;
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"live" | "mock">("live");
  const [mockSections, setMockSections] = useState<ResearcherSection[]>([]);
  const [sectionErrors, setSectionErrors] = useState<ResearcherSection[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<ResearcherWorkspaceTab>(
    destinationTab ?? "overview",
  );
  const [defenseType, setDefenseType] = useState<DefenseType>("proposal");
  const [mutation, setMutation] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadPurpose, setUploadPurpose] =
    useState<NonNullable<DocumentFileResource["upload_purpose"]>>(
      "initial_submission",
    );
  const [activeDocumentFolder, setActiveDocumentFolder] = useState("");
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
  const [feedbackFile, setFeedbackFile] = useState<DocumentFileResource | null>(
    null,
  );
  const [commentFile, setCommentFile] = useState<DocumentFileResource | null>(
    null,
  );
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
        peopleResult,
        foldersResult,
        supportResult,
      ] = await Promise.allSettled([
        listResearchFiles(researchDocumentId),
        listResearchRevisions(researchDocumentId),
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

      const folders = withStandardResearchFolders(
        readArraySection(foldersResult, "folders", nextSectionErrors),
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
        people,
        folders,
        supportAssignments,
      });
      setSource("live");
      setMockSections(nextMockSections);
      setSectionErrors(nextSectionErrors);
      setTab(destinationTab ?? "overview");
      setUploadPurpose(
        research.submission_status === "revision_required"
          ? "final_revision"
          : "initial_submission",
      );
      const targetFile = files.find((file) => file.id === destinationFileId);
      const availableFolders = [
        ...folders,
        ...(files.some((file) => !file.relative_path) ? ["Unfiled"] : []),
      ];
      const targetFolder = targetFile
        ? (targetFile.relative_path ?? "Unfiled")
        : destinationFolder && availableFolders.includes(destinationFolder)
          ? destinationFolder
          : (availableFolders[0] ?? "");
      setActiveDocumentFolder(targetFolder);
      setFeedbackFile(
        targetFile && destinationPanel === "annotations" ? targetFile : null,
      );
      setCommentFile(
        targetFile && destinationPanel === "feedback" ? targetFile : null,
      );
    } catch {
      if (!mounted.current || generation.current !== request) return;
      setContext(null);
      setError("Your research record could not be loaded. Please try again.");
    } finally {
      if (mounted.current && generation.current === request) setLoading(false);
    }
  }, [
    researchDocumentId,
    destinationTab,
    destinationFolder,
    destinationFileId,
    destinationPanel,
  ]);

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
  const canManageFiles =
    source === "live" &&
    (editable ||
      ["submitted", "under_review", "approved"].includes(
        research?.submission_status ?? "",
      ));
  const revisions = [...(context?.revisions ?? [])].sort(
    (first, second) => second.revision_number - first.revision_number,
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
  const documentFolders = [
    ...(context?.folders ?? []),
    ...((context?.files ?? []).some((file) => !file.relative_path)
      ? ["Unfiled"]
      : []),
  ].filter((folder, index, values) => values.indexOf(folder) === index);

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
    if (!research || !canManageFiles) return;
    const validation = fileError(upload);
    if (validation) {
      setMessage(validation);
      return;
    }
    void runMutation("upload", () =>
      uploadResearchFile(
        research.id,
        upload!,
        inferredDocumentType(research.submission_status, activeDocumentFolder),
        activeDocumentFolder && activeDocumentFolder !== "Unfiled"
          ? activeDocumentFolder
          : null,
        uploadPurpose,
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
      <div className="section-page-toolbar">
        <Button
          variant="quiet"
          onClick={() => navigate("/app/researcher/submissions")}
        >
          <ArrowLeft /> Back to my research
        </Button>
      </div>

      <div
        className="title-member-panel project-page-panel"
        data-testid="study-workspace"
      >
        <div className="title-member-panel-heading">
          <div>
            <p className="eyebrow">Research project</p>
            <h3>{research.title}</h3>
          </div>
          {editable && (
            <Button
              variant="secondary"
              className="icon-button"
              aria-label="Edit research details"
              title="Edit research details"
              onClick={() => setEditing(true)}
              disabled={Boolean(mutation)}
            >
              <Pencil />
            </Button>
          )}
        </div>

        <div className="project-workspace-context">
          {[
            context.people.section?.name ?? "Research record",
            research.submission_reference ?? "Pending reference",
            context.people.section?.academic_year ??
              research.publication_year?.toString() ??
              "Year not set",
            humanize(research.research_stage),
            humanize(research.submission_status),
          ].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>

        <nav
          className="project-workspace-tabs"
          aria-label="Research study workspace"
        >
          {(
            [
              ["overview", "Overview", FileText],
              ["team", "Research Team", UsersRound],
              ["documents", "Documents", Folder],
            ] as const
          ).map(([item, itemLabel, Icon]) => (
            <button
              type="button"
              key={item}
              className={tab === item ? "is-active" : ""}
              aria-current={tab === item ? "page" : undefined}
              onClick={() => setTab(item)}
            >
              <Icon aria-hidden="true" />
              <span>{itemLabel}</span>
            </button>
          ))}
          <DefenseMonitoringMenu
            key={tab}
            active={tab === "monitoring"}
            defenseType={defenseType}
            onSelect={(type) => {
              setDefenseType(type);
              setTab("monitoring");
            }}
          />
        </nav>

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
                Live {mockSections.map(humanize).join(", ")} could not be
                loaded. Those sections are read only; your live research details
                are preserved.
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

        <div
          className="project-workspace-section project-overview-grid"
          hidden={tab !== "overview"}
        >
          <section className="project-overview-card project-overview-card-wide">
            <div className="project-card-heading">
              <div>
                <p className="eyebrow">Study summary</p>
                <h4>Research workspace</h4>
              </div>
              <span className="badge badge-active">My record</span>
            </div>
            <dl className="project-overview-stats">
              <div>
                <dt>Researchers</dt>
                <dd>{research.authors.length}</dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>{context.files.length}</dd>
              </div>
              <div>
                <dt>Revisions</dt>
                <dd>{revisions.length}</dd>
              </div>
              <div>
                <dt>Document folders</dt>
                <dd>{documentFolders.length}</dd>
              </div>
            </dl>
            {research.abstract && <p>{research.abstract}</p>}
            {(research.sdgs?.length ?? 0) > 0 && (
              <SdgBadges sdgs={research.sdgs ?? []} />
            )}
          </section>
          <section className="project-overview-card">
            <div className="project-card-heading">
              <div>
                <p className="eyebrow">Researchers</p>
                <h4>Study members</h4>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => setTab("team")}
              >
                View team
              </button>
            </div>
            <ul className="project-compact-list">
              {research.authors.map((author) => (
                <li key={author.id}>
                  <span className="project-person-avatar" aria-hidden="true">
                    {author.author_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{author.author_name}</strong>
                    <small>Student researcher</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="project-overview-card">
            <div className="project-card-heading">
              <div>
                <p className="eyebrow">Recent files</p>
                <h4>Latest documents</h4>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => setTab("documents")}
              >
                View all
              </button>
            </div>
            {context.files.length === 0 ? (
              <p className="project-empty-copy">
                No manuscript files uploaded yet.
              </p>
            ) : (
              <ul className="project-compact-list project-file-preview-list">
                {[...context.files]
                  .sort(
                    (first, second) =>
                      new Date(second.uploaded_at ?? 0).getTime() -
                      new Date(first.uploaded_at ?? 0).getTime(),
                  )
                  .slice(0, 4)
                  .map((file) => (
                    <li key={file.id}>
                      <FileText aria-hidden="true" />
                      <span>
                        <strong>{file.original_filename}</strong>
                        <small>
                          {file.relative_path ?? "Unfiled"} · v
                          {file.version_number}
                        </small>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>

        <section
          id="research-support"
          className="project-workspace-section researcher-support"
          aria-labelledby="research-support-title"
          hidden={tab !== "team"}
        >
          <div className="project-section-heading researcher-support-heading">
            <div>
              <p className="eyebrow">Research Team</p>
              <h2 id="research-support-title">People assigned to this study</h2>
              <p>
                View your instructor and reviewers, then request the support
                specialists your group needs. New assignments become active
                after the selected person accepts the request.
              </p>
            </div>
          </div>
          <section className="project-team-block">
            <div className="project-team-block-heading">
              <div>
                <p className="eyebrow">Assigned contacts</p>
                <h5>Instructor and reviewers</h5>
              </div>
            </div>
            <div className="project-actor-grid">
              {[
                {
                  role: "Research Instructor",
                  name: context.people.section?.instructor_name,
                },
                ...context.people.reviewers.map((reviewer) => ({
                  role: humanize(reviewer.review_role),
                  name: reviewer.name,
                })),
              ].map((actor, index) => (
                <div
                  className="project-actor-row"
                  key={`${actor.role}-${index}`}
                >
                  <span>
                    <strong>{actor.role}</strong>
                    <small>Assigned to this research</small>
                  </span>
                  <span
                    className={
                      actor.name ? "actor-name" : "actor-name is-empty"
                    }
                  >
                    {actor.name || "Unassigned"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <div className="researcher-support-grid">
            {supportRoles.map(
              ({ role: supportActorRole, label: actorLabel }) => {
                const assignment = currentSupportAssignment(supportActorRole);
                const canManage =
                  source === "live" && !sectionErrors.includes("support");
                return (
                  <article
                    className="researcher-support-card"
                    key={supportActorRole}
                  >
                    <span
                      className="researcher-support-icon"
                      aria-hidden="true"
                    >
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
              },
            )}
          </div>
        </section>

        {research.submission_status === "revision_required" && (
          <section
            className="panel-card researcher-revision-banner"
            role="status"
            hidden={tab !== "overview"}
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
                  Upload a current revised manuscript after this revision
                  request before resubmitting.
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

        <section
          id="research-files"
          className="researcher-files"
          aria-labelledby="researcher-files-title"
          hidden={tab !== "documents"}
        >
          <h2 id="researcher-files-title" className="sr-only">
            Document folders
          </h2>
          <div className="project-workspace-section project-documents-layout">
            <aside
              className="project-folder-sidebar"
              aria-label="Document folders"
            >
              <div className="project-folder-sidebar-heading">
                <div>
                  <p className="eyebrow">Paper files</p>
                  <h4>Folders</h4>
                </div>
              </div>
              <div className="project-folder-nav">
                {documentFolders.map((folder) => (
                  <button
                    type="button"
                    key={folder}
                    className={
                      activeDocumentFolder === folder ? "is-active" : ""
                    }
                    onClick={() => {
                      setActiveDocumentFolder(folder);
                      setFeedbackFile(null);
                    }}
                  >
                    <Folder aria-hidden="true" />
                    <span>{folder}</span>
                    <small>
                      {
                        context.files.filter((file) =>
                          folder === "Unfiled"
                            ? !file.relative_path
                            : file.relative_path === folder,
                        ).length
                      }
                    </small>
                  </button>
                ))}
              </div>
            </aside>
            <div className="project-folder-content">
              <div className="project-section-heading project-folder-heading">
                <div>
                  <p className="eyebrow">Document folder</p>
                  <h4>{activeDocumentFolder || "Select a folder"}</h4>
                  <p>
                    Previous revisions stay visible so the review history is
                    never lost.
                  </p>
                </div>
              </div>
              {!activeDocumentFolder ? (
                <p className="project-empty-copy">Choose a document folder.</p>
              ) : context.files.filter((file) =>
                  activeDocumentFolder === "Unfiled"
                    ? !file.relative_path
                    : file.relative_path === activeDocumentFolder,
                ).length === 0 ? (
                <div className="project-empty-folder">
                  <Folder aria-hidden="true" />
                  <strong>No documents in this folder yet.</strong>
                  <span>
                    Files uploaded by the researchers will appear here with
                    their revision history.
                  </span>
                </div>
              ) : (
                <div className="project-document-list">
                  {context.files
                    .filter((file) =>
                      activeDocumentFolder === "Unfiled"
                        ? !file.relative_path
                        : file.relative_path === activeDocumentFolder,
                    )
                    .sort(
                      (first, second) =>
                        second.version_number - first.version_number,
                    )
                    .map((file) => {
                      const fileEditable =
                        canManageFiles &&
                        filesAreLive &&
                        file.document_type !== "final_manuscript";
                      return (
                        <article
                          className={
                            file.id === destinationFileId
                              ? "project-document-row is-targeted"
                              : "project-document-row"
                          }
                          key={file.id}
                        >
                          <div
                            className="project-document-icon"
                            aria-hidden="true"
                          >
                            <FileText />
                          </div>
                          <div className="project-document-copy">
                            <div>
                              <strong>{file.original_filename}</strong>
                              <span
                                className={
                                  file.is_current
                                    ? "file-version is-current"
                                    : "file-version"
                                }
                              >
                                {file.is_current ? "Current" : "Previous"} · v
                                {file.version_number}
                              </span>
                            </div>
                            <small>
                              {humanize(
                                file.upload_purpose ?? "initial_submission",
                              )}{" "}
                              · {file.uploader_name ?? "Researcher"} ·{" "}
                              {formatDate(file.uploaded_at)}
                            </small>
                          </div>
                          <div className="project-document-actions">
                            {filesAreLive &&
                              (file.mime_type === "application/pdf" ? (
                                <a
                                  className="icon-link-button"
                                  href={researchFilePreviewUrl(
                                    research.id,
                                    file.id,
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label="Open document"
                                  title="Open PDF in a new tab"
                                >
                                  <ExternalLink aria-hidden="true" />
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label="Open document"
                                  title="Open document"
                                  onClick={() => setFeedbackFile(file)}
                                >
                                  <Eye aria-hidden="true" />
                                </button>
                              ))}
                            {filesAreLive && (
                              <button
                                type="button"
                                className="icon-button"
                                aria-label="File feedback"
                                title="File feedback"
                                onClick={() => setCommentFile(file)}
                              >
                                <MessageSquareText aria-hidden="true" />
                              </button>
                            )}
                            {filesAreLive && (
                              <a
                                className="icon-link-button"
                                href={researchFileDownloadUrl(
                                  research.id,
                                  file.id,
                                )}
                                aria-label="Download"
                                title="Download file"
                              >
                                <Download />
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
                          </div>
                        </article>
                      );
                    })}
                </div>
              )}
              {feedbackFile && (
                <Modal
                  label={`Preview of ${feedbackFile.original_filename}`}
                  onClose={() => setFeedbackFile(null)}
                  size="large"
                  className="modal-panel-document"
                  showClose={false}
                >
                  {feedbackFile.mime_type === "application/pdf" ? (
                    <PdfAnnotationWorkspace
                      key={feedbackFile.id}
                      researchDocumentId={research.id}
                      file={feedbackFile}
                      canAnnotate={false}
                      onClose={() => setFeedbackFile(null)}
                    />
                  ) : (
                    <DocxPreviewWorkspace
                      key={feedbackFile.id}
                      researchDocumentId={research.id}
                      file={feedbackFile}
                      onClose={() => setFeedbackFile(null)}
                    />
                  )}
                </Modal>
              )}
              {commentFile && (
                <Modal
                  label={`File feedback for ${commentFile.original_filename}`}
                  onClose={() => setCommentFile(null)}
                  size="large"
                  className="modal-panel-feedback"
                  showClose={false}
                >
                  <DocumentFeedbackPanel
                    key={`feedback-${commentFile.id}`}
                    researchDocumentId={research.id}
                    file={commentFile}
                    canReply
                    researcherActions
                    canUploadFile={canManageFiles && filesAreLive}
                    onClose={() => setCommentFile(null)}
                  />
                </Modal>
              )}
              {canManageFiles && filesAreLive && (
                <section
                  className="researcher-file-upload"
                  aria-labelledby="researcher-file-upload-title"
                >
                  <div className="researcher-file-upload-heading">
                    <span aria-hidden="true">
                      <UploadCloud />
                    </span>
                    <div>
                      <p className="eyebrow">Add to this folder</p>
                      <h4 id="researcher-file-upload-title">
                        Upload a document
                      </h4>
                      <p>
                        Add a new file or replace the current version. Earlier
                        versions remain in the document history. This upload
                        will be saved directly to {activeDocumentFolder}.
                      </p>
                    </div>
                  </div>
                  <div className="researcher-file-upload-fields">
                    <ManuscriptFilePicker
                      label="Manuscript file"
                      help="PDF or DOCX, maximum 25 MB"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      file={upload}
                      onChange={(event) =>
                        setUpload(event.target.files?.[0] ?? null)
                      }
                      disabled={Boolean(mutation)}
                    />
                    <label className="researcher-upload-field">
                      <span>Upload purpose</span>
                      <select
                        aria-label="Upload purpose"
                        value={uploadPurpose}
                        onChange={(event) =>
                          setUploadPurpose(
                            event.target.value as NonNullable<
                              DocumentFileResource["upload_purpose"]
                            >,
                          )
                        }
                        disabled={Boolean(mutation)}
                      >
                        {uploadPurposes.map((purpose) => (
                          <option key={purpose.value} value={purpose.value}>
                            {purpose.label}
                          </option>
                        ))}
                      </select>
                      <small>Explain why this version is being uploaded.</small>
                    </label>
                  </div>
                  <div className="researcher-file-upload-actions">
                    <p>
                      Destination: {activeDocumentFolder}. Uploading creates a
                      new version without removing previous files.
                    </p>
                    <Button
                      onClick={submitUpload}
                      disabled={!upload || Boolean(mutation)}
                    >
                      <UploadCloud />
                      {mutation === "upload" ? "Uploading…" : "Upload document"}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </section>

        {tab === "monitoring" && (
          <div className="project-workspace-section">
            <SharedMonitoring
              key={`${research.id}:${defenseType}`}
              role="researcher"
              researchDocumentId={research.id}
              embedded
              readOnly
              defenseType={defenseType}
            />
          </div>
        )}
      </div>
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
