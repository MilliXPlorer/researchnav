import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import {
  ApiError,
  checkTitleQuerySimilarity,
  createCoordinatorSchedule,
  createInstructorSection,
  createResearchDraft,
  getCoordinatorProgramReport,
  getInstitutionalReport,
  listAdviserAdvisees,
  listAdviserFeedbackHistory,
  listAdviserSimilarityAlerts,
  listCategories,
  listCategoryCounts,
  listCoordinatorSchedules,
  listDuplicateFlags,
  listAdviserLoad,
  listInstructorClassReports,
  listInstructorAssignedSubmissions,
  listInstructorSections,
  listInstructorSimilarityOverview,
  listInstructorStudents,
  listOfficeUsers,
  listPanelAssignments,
  listPanelHistory,
  listPanelSchedule,
  listPrivacyLogs,
  listProvisionedAccounts,
  listRepositoryCatalog,
  listResearchDocuments,
  listMetadataStandards,
  listRetentionLogs,
  listSectionDocuments,
  listAssignableSectionDocuments,
  listSectionDocumentMembers,
  listSectionMembers,
  listStatisticianQueue,
  listStatisticianSignoffs,
  provisionAccount,
  recordPrivacyLog,
  recordRetentionLog,
  removeSectionMember,
  addSectionDocumentMember,
  removeSectionDocumentMember,
  returnMethodologyForClarification,
  saveLibraryItem,
  saveMetadataReview,
  saveStatisticianChecklist,
  searchPublicResearchBySimilarity,
  signOffMethodology,
  submitPanelEvaluation,
  submitResearchDocument,
  updateResearchDraft,
  updateCoordinatorSchedule,
  updateInstructorSection,
  updateOfficeUserAccess,
  uploadResearchFile,
  addSectionMembers,
  assignSectionDocuments,
  type AccessStatus,
  type AdminRole,
  type CoordinatorProgramReport,
  type DefenseScheduleResource,
  type DocumentFileResource,
  type InstitutionalReport,
  type InstructorSectionDocumentItem,
  type InstructorAssignedSubmissionItem,
  type InstructorSectionResource,
  type InstructorStudentResource,
  type LaravelPaginatedResponse,
  type MetadataStandardsItem,
  type PanelAssignmentResource,
  type ResearchDocumentSummaryResource,
  type StatisticianQueueItem,
} from "./api";
import { Button } from "./components";
import {
  AcademicYearSelect,
  DatePickerInput,
  PublicationYearInput,
} from "./dateControls";
import { roleConfigs } from "./data";
import { ConfirmDialog, Modal } from "./Modal";
import ResearchActivity from "./ResearchActivity";
import InstructorResearchReview from "./InstructorResearchReview";
import SimilarityResults from "./SimilarityResults";
import {
  classificationLabel,
  formatSimilarityPercentage,
  formatSimilarityValue,
  formatSimilarityWeight,
} from "./similarity";
import type { ResearchRecord, Role } from "./types";
import { useLiveFilters } from "./useLiveFilters";

const roles: AdminRole[] = [
  "admin",
  "researcher",
  "adviser",
  "instructor",
  "panel",
  "statistician",
  "coordinator",
  "librarian",
  "research-office",
  "academics",
];
const accessStatuses: AccessStatus[] = ["active", "invited", "blocked"];
const researchStages = ["title_proposal", "ongoing", "completed"];
const scheduleStatuses = ["scheduled", "completed", "cancelled"] as const;

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

function useLoad<T>(load: () => Promise<T>, attempt: number): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: friendlyError(error, "This data is currently unavailable"),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return state;
}

function useAttempt(): [number, () => void] {
  const [attempt, setAttempt] = useState(0);
  return [attempt, () => setAttempt((current) => current + 1)];
}

export default function RoleSidebarPage({
  role,
  selectedNav,
  navigate,
}: {
  role: Role;
  selectedNav: string;
  navigate: (path: string) => void;
}) {
  switch (role) {
    case "adviser":
      switch (selectedNav) {
        case "My Advisees":
          return <AdviserAdvisees role={role} navigate={navigate} />;
        case "Similarity Alerts":
          return <AdviserSimilarityAlerts role={role} navigate={navigate} />;
        case "Feedback History":
          return <AdviserFeedbackHistory role={role} />;
        default:
          return null;
      }
    case "instructor":
      switch (selectedNav) {
        case "Title Proposals":
          return <InstructorAssignedSubmissions role={role} titleOnly />;
        case "My Sections":
          return <InstructorSections role={role} />;
        case "Assigned Submissions":
          return <InstructorAssignedSubmissions role={role} />;
        case "Similarity Overview":
          return <InstructorSimilarityOverview role={role} />;
        case "Class Reports":
          return <InstructorClassReports role={role} />;
        default:
          return null;
      }
    case "panel":
      switch (selectedNav) {
        case "Defense Schedule":
          return <PanelDefenseSchedule role={role} />;
        case "Evaluation Form":
          return <PanelEvaluationForm role={role} />;
        case "Panel History":
          return <PanelHistory role={role} />;
        default:
          return null;
      }
    case "statistician":
      switch (selectedNav) {
        case "Methodology Checklist":
          return <StatisticianMethodologyChecklist role={role} />;
        case "Sign-offs Issued":
          return <StatisticianSignoffs role={role} />;
        default:
          return null;
      }
    case "coordinator":
      switch (selectedNav) {
        case "Schedules":
          return <CoordinatorSchedules role={role} />;
        case "Duplicate Flags":
          return <CoordinatorDuplicateFlags role={role} />;
        case "Adviser Load":
          return <CoordinatorAdviserLoad role={role} />;
        case "Account Roles":
          return <CoordinatorAccountRoles role={role} />;
        case "Reports":
          return <CoordinatorReports role={role} />;
        default:
          return null;
      }
    case "librarian":
      switch (selectedNav) {
        case "Repository Catalog":
          return <LibrarianRepositoryCatalog role={role} navigate={navigate} />;
        case "Metadata Standards":
          return <LibrarianMetadataStandards role={role} />;
        case "Retention & Compliance":
          return <LibrarianRetentionLogs role={role} />;
        default:
          return null;
      }
    case "research-office":
      switch (selectedNav) {
        case "Institutional Overview":
          return <OfficeInstitutionalOverview role={role} />;
        case "User & Role Management":
          return <OfficeUsers role={role} />;
        case "Reports & Exports":
          return <OfficeReports role={role} />;
        case "Data Privacy Log":
          return <OfficePrivacyLogs role={role} />;
        default:
          return null;
      }
    case "academics":
      switch (selectedNav) {
        case "Search":
          return <AcademicsSearch role={role} />;
        case "Browse by Category":
          return <AcademicsCategories role={role} navigate={navigate} />;
        default:
          return null;
      }
    case "researcher":
      switch (selectedNav) {
        case "My Submissions":
          return <ResearcherSubmissions role={role} navigate={navigate} />;
        case "Similarity Check":
          return <ResearcherSimilarityCheck role={role} />;
        case "Related Studies":
          return <ResearcherRelatedStudies role={role} navigate={navigate} />;
        default:
          return null;
      }
    default:
      return null;
  }
}

function RolePageHeader({
  role,
  title,
  description,
  action,
}: {
  role: Role;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">
          {roleConfigs.find((config) => config.id === role)?.label}
        </p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <section
      className="panel-card dashboard-loading"
      role="region"
      aria-label={label}
      aria-busy="true"
    >
      <p>{label}…</p>
    </section>
  );
}

function InlineError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <section className="panel-card dashboard-error" role="alert">
      <p>{message}</p>
      <Button variant="secondary" onClick={retry}>
        Retry
      </Button>
    </section>
  );
}

function Pagination({
  meta,
  onPage,
}: {
  meta: LaravelPaginatedResponse<unknown>["meta"];
  onPage: (page: number) => void;
}) {
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <span>
        Page {meta.current_page} of {meta.last_page} · {meta.total} total
      </span>
      <Button
        variant="secondary"
        disabled={meta.current_page <= 1}
        onClick={() => onPage(meta.current_page - 1)}
      >
        Previous
      </Button>
      <Button
        variant="secondary"
        disabled={meta.current_page >= meta.last_page}
        onClick={() => onPage(meta.current_page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <section className="panel-card admin-stat">
      <strong>{value === null ? "—" : value.toLocaleString()}</strong>
      <span>{label}</span>
    </section>
  );
}

function friendlyError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401)
    return "Session expired. Sign out and sign in again.";
  if (error.status === 403)
    return "Access denied. This action is not authorized for your account.";
  if (error.status === 404) return `${fallback} (NOT_FOUND).`;
  if (error.status === 409)
    return `The server rejected this change (${error.code}). Refresh and try again.`;
  if (error.status === 429)
    return "Too many requests. Wait a moment before trying again.";
  return error.status >= 500 || error.status === 422
    ? `${fallback} (${error.code}).`
    : `${fallback} (${error.code}).`;
}

function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

/* ---------------------------------- Adviser ---------------------------------- */

function AdviserAdvisees({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listAdviserAdvisees(), attempt);
  const [activityFor, setActivityFor] = useState<{
    id: number | string;
    title: string;
  } | null>(null);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="My advisees"
        description="Research assigned to you, grouped by the researcher who submitted it."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading advisees" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No advisees are currently assigned to your account.
        </p>
      ) : (
        <div className="admin-data-grid">
          {state.data.map((group) => (
            <section
              className="panel-card admin-data-card"
              key={group.user_id ?? group.email ?? group.name}
            >
              <div className="admin-card-heading">
                <div>
                  <h2>{group.name ?? "Unassigned researcher"}</h2>
                  <p>
                    {group.email ?? "No email on record"} ·{" "}
                    {group.documents_count} document
                    {group.documents_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <caption className="sr-only">Advisee documents</caption>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.documents.map((document) => (
                      <tr key={document.research_document_id}>
                        <td>{document.title}</td>
                        <td>{label(document.research_stage)}</td>
                        <td>{label(document.submission_status)}</td>
                        <td>{displayDate(document.updated_at)}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(
                                `/research/${document.research_document_id}`,
                              )
                            }
                          >
                            Open review
                          </Button>{" "}
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setActivityFor({
                                id: document.research_document_id,
                                title: document.title ?? "Research record",
                              })
                            }
                          >
                            Feedback &amp; activity
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      {activityFor && (
        <Modal
          label={`Feedback and activity for ${activityFor.title}`}
          onClose={() => setActivityFor(null)}
          size="large"
        >
          <ResearchActivity
            researchDocumentId={activityFor.id}
            title={activityFor.title}
          />
        </Modal>
      )}
    </div>
  );
}

function AdviserSimilarityAlerts({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listAdviserSimilarityAlerts(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Similarity alerts"
        description="Flagged title-similarity matches for research assigned to you."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading similarity alerts" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No similarity alerts are currently flagged.
        </p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Similarity alerts</caption>
              <thead>
                <tr>
                  <th>Research title</th>
                  <th>Matched title</th>
                  <th>Score</th>
                  <th>Classification</th>
                  <th>Status</th>
                  <th>Analyzed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((alert) => (
                  <tr key={alert.id}>
                    <td>{alert.title ?? "—"}</td>
                    <td>{alert.matched_title}</td>
                    <td>
                      <ScoreCell value={alert.overall_similarity_score} />
                    </td>
                    <td>
                      {classificationLabel(alert.classification) ??
                        "Unavailable"}
                    </td>
                    <td>
                      {alert.submission_status
                        ? label(alert.submission_status)
                        : "—"}
                    </td>
                    <td>{displayDate(alert.analyzed_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/research/${alert.research_document_id}`)
                        }
                      >
                        Open review
                      </Button>{" "}
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(
                            `/catalog?q=${encodeURIComponent(alert.matched_title)}`,
                          )
                        }
                      >
                        View matched study
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AdviserFeedbackHistory({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listAdviserFeedbackHistory(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Feedback history"
        description="Feedback comments you have posted on assigned research."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading feedback history" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No feedback has been posted yet.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Feedback history</caption>
              <thead>
                <tr>
                  <th>Research title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Comment</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.title ?? "—"}</td>
                    <td>{label(entry.feedback_type)}</td>
                    <td>{label(entry.feedback_status)}</td>
                    <td>{entry.comment}</td>
                    <td>{displayDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------- Instructor ---------------------------------- */

function CreateSectionDialog({
  onCreated,
  onClose,
}: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setBusy(true);
    try {
      await createInstructorSection({
        name: name.trim(),
        academic_year: academicYear.trim() || null,
      });
      onCreated();
    } catch (error) {
      setNotice(friendlyError(error, "The class section could not be created"));
      setBusy(false);
    }
  }

  return (
    <Modal label="Create class section" onClose={onClose} busy={busy}>
      <div className="create-section-card">
        <p className="eyebrow">Instructor</p>
        <h2>Create a class section</h2>
        <p>
          Add a class section to organize the student researchers and research
          documents joined to it.
        </p>
        <form onSubmit={submit} className="admin-inline-form">
          <label>
            Section name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={150}
            />
          </label>
          <label>
            Academic year
            <AcademicYearSelect
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create section"}
            </Button>
          </div>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("could not") ? "admin-error" : "admin-success"
            }
          >
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}

function InstructorAssignedSubmissions({
  role,
  titleOnly = false,
}: {
  role: Role;
  titleOnly?: boolean;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listInstructorAssignedSubmissions(), attempt);
  const [selected, setSelected] =
    useState<InstructorAssignedSubmissionItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const filteredSubmissions =
    state.status === "ready"
      ? state.data.filter(
          (item) =>
            (!titleOnly || item.research_stage === "title_proposal") &&
            (!statusFilter || item.submission_status === statusFilter),
        )
      : [];

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title={titleOnly ? "Title proposals" : "Assigned submissions"}
        description={
          titleOnly
            ? "Review assigned research titles before proposal defense."
            : "Review assigned titles and documents, similarity evidence, recommendations, revisions, and progress history."
        }
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading assigned submissions" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No active instructor review assignments are available.
        </p>
      ) : (
        <div className="instructor-assignment-groups">
          <div className="admin-filters instructor-review-filters">
            <label>
              Submission status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                {Array.from(
                  new Set(state.data.map((item) => item.submission_status)),
                ).map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filteredSubmissions.length === 0 && (
            <p className="admin-empty">
              No assigned submissions match this status.
            </p>
          )}
          {(titleOnly
            ? (["before"] as const)
            : (["before", "after"] as const)
          ).map((phase) => {
            const submissions = filteredSubmissions.filter((item) =>
              phase === "before"
                ? item.research_stage === "title_proposal"
                : item.research_stage !== "title_proposal",
            );
            if (submissions.length === 0) return null;
            return (
              <section className="panel-card admin-data-card" key={phase}>
                <div className="admin-card-heading">
                  <div>
                    <p className="eyebrow">Research progress</p>
                    <h2>
                      {phase === "before"
                        ? "Before proposal defense"
                        : "After proposal defense"}
                    </h2>
                  </div>
                  <span className="activity-tag">{submissions.length}</span>
                </div>
                <div className="admin-table-wrap">
                  <table>
                    <caption className="sr-only">
                      {phase === "before" ? "Before" : "After"} defense
                      assignments
                    </caption>
                    <thead>
                      <tr>
                        <th>Research title</th>
                        <th>Researcher</th>
                        <th>Stage</th>
                        <th>Status</th>
                        <th>Updated</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((item) => (
                        <tr key={item.research_document_id}>
                          <td>{item.title}</td>
                          <td>{item.submitter ?? "—"}</td>
                          <td>{label(item.research_stage)}</td>
                          <td>{label(item.submission_status)}</td>
                          <td>{displayDate(item.updated_at)}</td>
                          <td>
                            <Button
                              variant="secondary"
                              onClick={() => setSelected(item)}
                            >
                              Open review
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {selected && (
        <Modal
          label={`Review assigned research: ${selected.title}`}
          onClose={() => setSelected(null)}
          size="large"
          busy={reviewBusy}
        >
          <InstructorResearchReview
            submission={selected}
            onUpdated={reload}
            onBusyChange={setReviewBusy}
          />
        </Modal>
      )}
    </div>
  );
}

function InstructorSections({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listInstructorSections(), attempt);
  const [pageNotice, setPageNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [openSection, setOpenSection] =
    useState<InstructorSectionResource | null>(null);
  const [detailsNotice, setDetailsNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{
    sectionId: number;
    member: InstructorStudentResource;
  } | null>(null);
  const [documentsFor, setDocumentsFor] = useState<
    Record<number, InstructorSectionDocumentItem[]>
  >({});
  const [documentsState, setDocumentsState] = useState<
    Record<number, "loading" | "ready" | "error">
  >({});
  const [studentsFor, setStudentsFor] = useState<
    Record<number, InstructorStudentResource[]>
  >({});
  const [studentsState, setStudentsState] = useState<
    Record<number, "loading" | "ready" | "error">
  >({});
  const [candidatesFor, setCandidatesFor] = useState<
    Record<number, InstructorStudentResource[]>
  >({});
  const [studentQueries, setStudentQueries] = useState<Record<number, string>>(
    {},
  );
  const [studentBusy, setStudentBusy] = useState<Record<number, boolean>>({});
  const [selectedDocument, setSelectedDocument] =
    useState<InstructorSectionDocumentItem | null>(null);
  const [documentMembers, setDocumentMembers] = useState<
    InstructorStudentResource[]
  >([]);
  const [documentMembersLoading, setDocumentMembersLoading] = useState(false);
  const [assignableFor, setAssignableFor] = useState<
    Record<number, InstructorSectionDocumentItem[]>
  >({});
  const [assignableState, setAssignableState] = useState<
    Record<number, "loading" | "ready" | "error">
  >({});
  const [assigningDocuments, setAssigningDocuments] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const studentSearchRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const timers = studentSearchRef.current;
    return () => {
      for (const timer of Object.values(timers)) window.clearTimeout(timer);
    };
  }, []);

  function openSectionDetails(section: InstructorSectionResource) {
    setOpenSection(section);
    setDetailsNotice("");
    setEditing(false);
    setSelectedDocument(null);
    setDocumentMembers([]);
    setSelectedDocumentIds([]);
    setEditName(section.name);
    setEditYear(section.academic_year ?? "");
    if (documentsState[section.id] !== "ready") {
      void loadDocuments(section.id);
    }
    if (assignableState[section.id] !== "ready") {
      void loadAssignableDocuments(section.id);
    }
    if (studentsState[section.id] !== "ready") {
      setStudentsState((current) => ({ ...current, [section.id]: "loading" }));
      void loadStudents(section.id, "");
    }
  }

  async function loadDocuments(sectionId: number) {
    setDocumentsState((current) => ({ ...current, [sectionId]: "loading" }));
    try {
      const documents = await listSectionDocuments(sectionId);
      setDocumentsFor((current) => ({ ...current, [sectionId]: documents }));
      setDocumentsState((current) => ({ ...current, [sectionId]: "ready" }));
    } catch {
      setDocumentsState((current) => ({ ...current, [sectionId]: "error" }));
    }
  }

  async function loadAssignableDocuments(sectionId: number) {
    setAssignableState((current) => ({ ...current, [sectionId]: "loading" }));
    try {
      const documents = await listAssignableSectionDocuments(sectionId);
      setAssignableFor((current) => ({ ...current, [sectionId]: documents }));
      setAssignableState((current) => ({ ...current, [sectionId]: "ready" }));
    } catch {
      setAssignableState((current) => ({ ...current, [sectionId]: "error" }));
    }
  }

  async function assignTitlesToSection() {
    if (!openSection || selectedDocumentIds.length === 0) return;
    setAssigningDocuments(true);
    setDetailsNotice("");
    try {
      await assignSectionDocuments(openSection.id, selectedDocumentIds);
      await loadDocuments(openSection.id);
      setSelectedDocumentIds([]);
      setDetailsNotice("Research titles added to this section.");
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The research titles could not be added"),
      );
    } finally {
      setAssigningDocuments(false);
    }
  }

  async function loadStudents(sectionId: number, search: string) {
    try {
      const [members, candidates] = await Promise.all([
        listSectionMembers(sectionId),
        listInstructorStudents(search),
      ]);
      setStudentsFor((current) => ({ ...current, [sectionId]: members }));
      setCandidatesFor((current) => ({ ...current, [sectionId]: candidates }));
      setStudentsState((current) => ({ ...current, [sectionId]: "ready" }));
    } catch {
      setStudentsState((current) => ({ ...current, [sectionId]: "error" }));
    }
  }

  function changeStudentQuery(sectionId: number, value: string) {
    setStudentQueries((current) => ({ ...current, [sectionId]: value }));
    const key = sectionId;
    if (studentSearchRef.current[key] !== undefined)
      window.clearTimeout(studentSearchRef.current[key]);
    studentSearchRef.current[key] = window.setTimeout(() => {
      void loadCandidates(key, value);
    }, 300);
  }

  async function loadCandidates(sectionId: number, search: string) {
    try {
      const candidates = await listInstructorStudents(search);
      setCandidatesFor((current) => ({ ...current, [sectionId]: candidates }));
    } catch {
      setCandidatesFor((current) => ({ ...current, [sectionId]: [] }));
    }
  }

  async function openDocumentMembers(
    sectionId: number,
    document: InstructorSectionDocumentItem,
  ) {
    setSelectedDocument(document);
    setDocumentMembersLoading(true);
    try {
      setDocumentMembers(
        await listSectionDocumentMembers(
          sectionId,
          document.research_document_id,
        ),
      );
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The research title members could not be loaded"),
      );
      setDocumentMembers([]);
    } finally {
      setDocumentMembersLoading(false);
    }
  }

  async function addStudentToDocument(userId: string) {
    if (!openSection || !selectedDocument) return;
    setStudentBusy((current) => ({ ...current, [openSection.id]: true }));
    try {
      setDocumentMembers(
        await addSectionDocumentMember(
          openSection.id,
          selectedDocument.research_document_id,
          userId,
        ),
      );
      setDetailsNotice("Student researcher added to this research title.");
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The student could not be assigned to this title"),
      );
    } finally {
      setStudentBusy((current) => ({ ...current, [openSection.id]: false }));
    }
  }

  async function removeStudentFromDocument(userId: string) {
    if (!openSection || !selectedDocument) return;
    setStudentBusy((current) => ({ ...current, [openSection.id]: true }));
    try {
      setDocumentMembers(
        await removeSectionDocumentMember(
          openSection.id,
          selectedDocument.research_document_id,
          userId,
        ),
      );
      setDetailsNotice("Student researcher removed from this research title.");
    } catch (error) {
      setDetailsNotice(
        friendlyError(
          error,
          "The student could not be removed from this title",
        ),
      );
    } finally {
      setStudentBusy((current) => ({ ...current, [openSection.id]: false }));
    }
  }

  async function toggleActive(section: InstructorSectionResource) {
    setDetailsNotice("");
    try {
      const updated = await updateInstructorSection(section.id, {
        is_active: !section.is_active,
      });
      setOpenSection(updated);
      setDetailsNotice(`Section "${updated.name}" updated.`);
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The section could not be updated"),
      );
    }
  }

  async function saveSection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openSection) return;
    setEditBusy(true);
    setDetailsNotice("");
    try {
      const updated = await updateInstructorSection(openSection.id, {
        name: editName.trim(),
        academic_year: editYear.trim() || null,
      });
      setEditing(false);
      setOpenSection(updated);
      setDetailsNotice(`Section "${updated.name}" updated.`);
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The section could not be updated"),
      );
    } finally {
      setEditBusy(false);
    }
  }

  async function addStudent(sectionId: number, userId: string) {
    setStudentBusy((current) => ({ ...current, [sectionId]: true }));
    setDetailsNotice("");
    try {
      const updated = await addSectionMembers(sectionId, [userId]);
      setOpenSection(updated);
      await loadStudents(sectionId, studentQueries[sectionId] ?? "");
      setDetailsNotice("Student researcher added to the section.");
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The student researcher could not be added"),
      );
    } finally {
      setStudentBusy((current) => ({ ...current, [sectionId]: false }));
    }
  }

  async function removeStudent(sectionId: number, userId: string) {
    setStudentBusy((current) => ({ ...current, [sectionId]: true }));
    setDetailsNotice("");
    try {
      const updated = await removeSectionMember(sectionId, userId);
      setOpenSection(updated);
      await loadStudents(sectionId, studentQueries[sectionId] ?? "");
      setDetailsNotice("Student researcher removed from the section.");
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The student researcher could not be removed"),
      );
    } finally {
      setStudentBusy((current) => ({ ...current, [sectionId]: false }));
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="My sections"
        description="Class sections you own and the research assigned to each."
        action={
          <span className="row-actions">
            <Button variant="secondary" onClick={reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Create section</Button>
          </span>
        }
      />
      {pageNotice && (
        <p
          role="status"
          className={
            pageNotice.includes("could not") ? "admin-error" : "admin-success"
          }
        >
          {pageNotice}
        </p>
      )}
      {state.status === "loading" ? (
        <Loading label="Loading sections" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No class sections have been created.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Class sections</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Academic year</th>
                  <th>Active</th>
                  <th>Documents</th>
                  <th>Students</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((section) => (
                  <tr
                    key={section.id}
                    className="clickable-row"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button"))
                        return;
                      openSectionDetails(section);
                    }}
                  >
                    <td>{section.name}</td>
                    <td>{section.academic_year ?? "—"}</td>
                    <td>
                      <span
                        className={
                          section.is_active
                            ? "badge badge-active"
                            : "badge badge-inactive"
                        }
                      >
                        {section.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{section.documents_count}</td>
                    <td>{section.members_count}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => openSectionDetails(section)}
                      >
                        View details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {createOpen && (
        <CreateSectionDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setPageNotice("Class section created.");
            reload();
          }}
        />
      )}
      {openSection && (
        <Modal
          label={`Section details: ${openSection.name}`}
          onClose={() => setOpenSection(null)}
          busy={editBusy || studentBusy[openSection.id] === true}
          dirty={editing}
          size="large"
        >
          <div className="section-details section-details-redesigned">
            <div className="section-details-header">
              <div>
                <p className="eyebrow">Instructor workspace / Class section</p>
                <h2>{openSection.name}</h2>
                <p className="section-details-intro">
                  Manage enrolled researchers and the studies connected to this
                  section.
                </p>
              </div>
              <span
                className={
                  openSection.is_active
                    ? "badge badge-active"
                    : "badge badge-inactive"
                }
              >
                {openSection.is_active ? "Active section" : "Inactive section"}
              </span>
            </div>
            <div className="section-details-meta">
              <span>{openSection.academic_year ?? "No academic year"}</span>
              <span>
                {openSection.documents_count} document
                {openSection.documents_count === 1 ? "" : "s"}
              </span>
              <span>
                {openSection.members_count} student
                {openSection.members_count === 1 ? "" : "s"}
              </span>
            </div>
            {detailsNotice && (
              <p
                role="status"
                className={
                  detailsNotice.includes("could not")
                    ? "admin-error"
                    : "admin-success"
                }
              >
                {detailsNotice}
              </p>
            )}
            <div className="section-details-actions">
              <Button
                variant="secondary"
                onClick={() => void toggleActive(openSection)}
              >
                {openSection.is_active
                  ? "Deactivate section"
                  : "Activate section"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Cancel editing" : "Edit section"}
              </Button>
            </div>
            {editing && (
              <form
                onSubmit={saveSection}
                className="admin-inline-form section-edit-form"
              >
                <label>
                  Section name
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                    maxLength={150}
                  />
                </label>
                <label>
                  Academic year
                  <AcademicYearSelect
                    value={editYear}
                    onChange={(event) => setEditYear(event.target.value)}
                  />
                </label>
                <div className="modal-actions">
                  <Button type="submit" disabled={editBusy}>
                    {editBusy ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
            <section className="section-detail-block">
              <div className="section-block-heading">
                <div>
                  <p className="eyebrow">Research records</p>
                  <h3>Documents</h3>
                </div>
                <span>{openSection.documents_count}</span>
              </div>
              {documentsState[openSection.id] === "loading" ? (
                <p className="section-documents-loading">Loading documents…</p>
              ) : documentsState[openSection.id] === "error" ? (
                <p className="section-documents-loading">
                  <span>Section documents could not be loaded.</span>{" "}
                  <Button
                    variant="secondary"
                    onClick={() => void loadDocuments(openSection.id)}
                  >
                    Retry
                  </Button>
                </p>
              ) : (documentsFor[openSection.id] ?? []).length === 0 ? (
                <div className="section-empty-folder-state">
                  <p className="admin-empty">No research-title folders yet.</p>
                  <p>
                    Select assigned research below to create folders for this
                    section.
                  </p>
                </div>
              ) : (
                <div className="research-title-folders">
                  {(documentsFor[openSection.id] ?? []).map((document) => (
                    <button
                      type="button"
                      className={`research-title-folder${selectedDocument?.research_document_id === document.research_document_id ? " is-selected" : ""}`}
                      key={document.research_document_id}
                      onClick={() =>
                        void openDocumentMembers(openSection.id, document)
                      }
                    >
                      <span className="research-title-folder-icon">▱</span>
                      <span className="research-title-folder-copy">
                        <strong>{document.title}</strong>
                        <small>
                          {label(document.research_stage)} ·{" "}
                          {label(document.submission_status)}
                        </small>
                        <small>
                          Updated {displayDate(document.updated_at)}
                        </small>
                      </span>
                      <span className="research-title-folder-arrow">Open</span>
                    </button>
                  ))}
                </div>
              )}
              {assignableState[openSection.id] === "ready" && (
                <div className="section-title-assigner">
                  <label>
                    Add assigned research titles
                    <select
                      multiple
                      value={selectedDocumentIds.map(String)}
                      onChange={(event) =>
                        setSelectedDocumentIds(
                          Array.from(event.target.selectedOptions).map(
                            (option) => Number(option.value),
                          ),
                        )
                      }
                      disabled={assigningDocuments}
                    >
                      {(assignableFor[openSection.id] ?? [])
                        .filter(
                          (item) =>
                            !(documentsFor[openSection.id] ?? []).some(
                              (document) =>
                                document.research_document_id ===
                                item.research_document_id,
                            ),
                        )
                        .map((item) => (
                          <option
                            key={item.research_document_id}
                            value={item.research_document_id}
                          >
                            {item.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      assigningDocuments || selectedDocumentIds.length === 0
                    }
                    onClick={() => void assignTitlesToSection()}
                  >
                    {assigningDocuments
                      ? "Adding folders…"
                      : "Add selected folders"}
                  </Button>
                </div>
              )}
              {selectedDocument && (
                <div className="title-member-panel">
                  <div className="title-member-panel-heading">
                    <div>
                      <p className="eyebrow">Selected research title</p>
                      <h3>{selectedDocument.title}</h3>
                    </div>
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => setSelectedDocument(null)}
                    >
                      Close folder
                    </Button>
                  </div>
                  {documentMembersLoading ? (
                    <p className="section-documents-loading">
                      Loading assigned students…
                    </p>
                  ) : documentMembers.length === 0 ? (
                    <p className="admin-empty">
                      No students are assigned to this research title.
                    </p>
                  ) : (
                    <ul className="title-member-list">
                      {documentMembers.map((member) => (
                        <li key={member.id}>
                          <span>
                            <strong>{studentName(member)}</strong>
                            <small>{member.email}</small>
                          </span>
                          <Button
                            type="button"
                            variant="quiet"
                            disabled={studentBusy[openSection.id]}
                            onClick={() =>
                              void removeStudentFromDocument(member.id)
                            }
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="title-member-picker">
                    <label>
                      Add student to this title
                      <input
                        value={studentQueries[openSection.id] ?? ""}
                        onChange={(event) =>
                          changeStudentQuery(openSection.id, event.target.value)
                        }
                        placeholder="Search name, email, or student ID"
                      />
                    </label>
                    <ul className="student-candidates">
                      {(candidatesFor[openSection.id] ?? [])
                        .filter(
                          (candidate) =>
                            !documentMembers.some(
                              (member) => member.id === candidate.id,
                            ),
                        )
                        .map((candidate) => (
                          <li key={candidate.id}>
                            <span>
                              <strong>{studentName(candidate)}</strong> (
                              {candidate.email})
                            </span>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={studentBusy[openSection.id]}
                              onClick={() =>
                                void addStudentToDocument(candidate.id)
                              }
                            >
                              Add to title
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
            <section className="section-detail-block">
              <div className="section-block-heading">
                <div>
                  <p className="eyebrow">Section roster</p>
                  <h3>Student researchers</h3>
                </div>
                <span>{openSection.members_count}</span>
              </div>
              {studentsState[openSection.id] === "loading" ? (
                <p className="section-documents-loading">Loading students…</p>
              ) : studentsState[openSection.id] === "error" ? (
                <p className="section-documents-loading">
                  <span>Section students could not be loaded.</span>{" "}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStudentsState((current) => ({
                        ...current,
                        [openSection.id]: "loading",
                      }));
                      void loadStudents(
                        openSection.id,
                        studentQueries[openSection.id] ?? "",
                      );
                    }}
                  >
                    Retry
                  </Button>
                </p>
              ) : (studentsFor[openSection.id] ?? []).length === 0 ? (
                <p className="admin-empty">
                  No student researchers are enrolled in this section.
                </p>
              ) : (
                <div className="admin-table-wrap">
                  <table>
                    <caption className="sr-only">
                      Student researchers in {openSection.name}
                    </caption>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Student ID</th>
                        <th>Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(studentsFor[openSection.id] ?? []).map((member) => (
                        <tr key={member.id}>
                          <td>{studentName(member)}</td>
                          <td>{member.email}</td>
                          <td>{member.student_employee_id ?? "—"}</td>
                          <td>{displayDate(member.added_at)}</td>
                          <td>
                            <Button
                              variant="secondary"
                              disabled={studentBusy[openSection.id]}
                              onClick={() =>
                                setConfirmRemove({
                                  sectionId: openSection.id,
                                  member,
                                })
                              }
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="student-add-form">
                <h3>Add a student researcher</h3>
                <label>
                  Search students
                  <input
                    value={studentQueries[openSection.id] ?? ""}
                    onChange={(event) =>
                      changeStudentQuery(openSection.id, event.target.value)
                    }
                    placeholder="Name, email, or student ID"
                  />
                </label>
                <ul className="student-candidates">
                  {(candidatesFor[openSection.id] ?? []).filter(
                    (candidate) =>
                      !(studentsFor[openSection.id] ?? []).some(
                        (member) => member.id === candidate.id,
                      ),
                  ).length === 0 ? (
                    <li className="admin-empty">
                      No student researchers match the search.
                    </li>
                  ) : (
                    (candidatesFor[openSection.id] ?? [])
                      .filter(
                        (candidate) =>
                          !(studentsFor[openSection.id] ?? []).some(
                            (member) => member.id === candidate.id,
                          ),
                      )
                      .map((candidate) => (
                        <li key={candidate.id}>
                          <span>
                            <strong>{studentName(candidate)}</strong> (
                            {candidate.email})
                          </span>
                          <Button
                            variant="secondary"
                            disabled={studentBusy[openSection.id]}
                            onClick={() =>
                              void addStudent(openSection.id, candidate.id)
                            }
                          >
                            Add
                          </Button>
                        </li>
                      ))
                  )}
                </ul>
              </div>
            </section>
          </div>
        </Modal>
      )}
      {confirmRemove && openSection && (
        <ConfirmDialog
          title="Remove student researcher"
          message={`Remove ${studentName(confirmRemove.member)} from "${openSection.name}"? They will no longer see this section's assigned research.`}
          confirmLabel="Remove student"
          busy={studentBusy[confirmRemove.sectionId]}
          onConfirm={() => {
            const target = confirmRemove;
            setConfirmRemove(null);
            void removeStudent(target.sectionId, target.member.id);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
function InstructorSimilarityOverview({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listInstructorSimilarityOverview(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Similarity overview"
        description="The strongest title-similarity match for each assigned research."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading similarity overview" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No similarity data is available for assigned research.
        </p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Similarity overview</caption>
              <thead>
                <tr>
                  <th>Research title</th>
                  <th>Status</th>
                  <th>Best match</th>
                  <th>Score</th>
                  <th>Flagged</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.research_document_id}>
                    <td>{item.title ?? "—"}</td>
                    <td>
                      {item.submission_status
                        ? label(item.submission_status)
                        : "—"}
                    </td>
                    <td>{item.matched_title}</td>
                    <td>
                      <ScoreCell value={item.best_similarity} />
                    </td>
                    <td>{yesNo(item.adviser_review_required)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function InstructorClassReports({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listInstructorClassReports(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Class reports"
        description="Submission status and similarity buckets per class section."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading class reports" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No class sections are available.</p>
      ) : (
        <div className="admin-data-grid">
          {state.data.map((report) => (
            <section className="panel-card admin-data-card" key={report.id}>
              <div className="admin-card-heading">
                <div>
                  <h2>{report.name}</h2>
                  <p>
                    {report.academic_year ?? "No academic year"} ·{" "}
                    {report.documents_count} document
                    {report.documents_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="report-lists">
                <div>
                  <h3>Submission statuses</h3>
                  {Object.keys(report.statuses).length === 0 ? (
                    <p className="admin-empty">No documents recorded.</p>
                  ) : (
                    <ul>
                      {Object.entries(report.statuses).map(
                        ([status, count]) => (
                          <li key={status}>
                            <span>{label(status)}</span>
                            <strong>{count}</strong>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>Similarity buckets</h3>
                  <ul>
                    <li>
                      <span>Low</span>
                      <strong>{report.similarity_buckets.low}</strong>
                    </li>
                    <li>
                      <span>Moderate</span>
                      <strong>{report.similarity_buckets.moderate}</strong>
                    </li>
                    <li>
                      <span>High</span>
                      <strong>{report.similarity_buckets.high}</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Panel ---------------------------------- */

function PanelDefenseSchedule({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listPanelSchedule(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Defense schedule"
        description="Scheduled defenses for manuscripts assigned to you."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading defense schedule" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No defenses are currently scheduled.</p>
      ) : (
        <ScheduleTable schedules={state.data} />
      )}
    </div>
  );
}

function PanelEvaluationForm({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listPanelAssignments(), attempt);
  const [selected, setSelected] = useState("");
  const [originality, setOriginality] = useState("3");
  const [methodology, setMethodology] = useState("3");
  const [clarity, setClarity] = useState("3");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const activeAssignments: PanelAssignmentResource[] =
    state.status === "ready" ? state.data : [];
  const selection =
    activeAssignments.find(
      (item) => String(item.research_document_id) === selected,
    ) ?? activeAssignments[0];

  async function submitEvaluation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    setNotice("");
    setSubmitting(true);
    try {
      await submitPanelEvaluation({
        research_document_id: selection.research_document_id,
        originality: Number(originality),
        methodology: Number(methodology),
        clarity: Number(clarity),
        comments: comments.trim() || null,
      });
      setNotice(`Evaluation submitted for "${selection.title}".`);
    } catch (error) {
      setNotice(friendlyError(error, "The evaluation could not be submitted"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Evaluation form"
        description="Submit a proposal-defense evaluation for one assigned manuscript."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading assigned manuscripts" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : activeAssignments.length === 0 ? (
        <p className="admin-empty">
          No manuscripts are assigned to you for evaluation.
        </p>
      ) : (
        <section className="panel-card admin-provision-card">
          <h2>Manuscript</h2>
          <form onSubmit={submitEvaluation} className="admin-inline-form">
            <label>
              Assigned manuscript
              <select
                value={selection ? String(selection.research_document_id) : ""}
                onChange={(event) => setSelected(event.target.value)}
              >
                {activeAssignments.map((item) => (
                  <option
                    key={item.research_document_id}
                    value={item.research_document_id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="score-grid">
              {(
                [
                  ["Originality (1-5)", originality, setOriginality],
                  ["Methodology (1-5)", methodology, setMethodology],
                  ["Clarity (1-5)", clarity, setClarity],
                ] as const
              ).map(([fieldLabel, value, setter]) => (
                <label key={fieldLabel}>
                  {fieldLabel}
                  <select
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label>
              Comments
              <textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                rows={4}
                maxLength={5000}
              />
            </label>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit evaluation"}
            </Button>
          </form>
          {notice && (
            <p
              role="status"
              className={
                notice.includes("could not") ? "admin-error" : "admin-success"
              }
            >
              {notice}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function PanelHistory({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listPanelHistory(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Panel history"
        description="Evaluations you have previously submitted."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading panel history" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No evaluations have been submitted yet.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Panel evaluation history</caption>
              <thead>
                <tr>
                  <th>Manuscript</th>
                  <th>Originality</th>
                  <th>Methodology</th>
                  <th>Clarity</th>
                  <th>Comments</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((evaluation) => (
                  <tr key={evaluation.id}>
                    <td>{evaluation.title ?? "—"}</td>
                    <td>{evaluation.originality}</td>
                    <td>{evaluation.methodology}</td>
                    <td>{evaluation.clarity}</td>
                    <td>{evaluation.comments ?? "—"}</td>
                    <td>{displayDate(evaluation.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ScheduleTable({
  schedules,
}: {
  schedules: DefenseScheduleResource[];
}) {
  return (
    <section className="panel-card admin-data-card">
      <div className="admin-table-wrap">
        <table>
          <caption className="sr-only">Defense schedules</caption>
          <thead>
            <tr>
              <th>Research title</th>
              <th>Scheduled</th>
              <th>Room</th>
              <th>Status</th>
              <th>Created by</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td>{schedule.title ?? "—"}</td>
                <td>{displayDate(schedule.scheduled_at)}</td>
                <td>{schedule.room ?? "—"}</td>
                <td>{label(schedule.status)}</td>
                <td>{schedule.created_by?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------------------------- Statistician ---------------------------------- */

function StatisticianMethodologyChecklist({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listStatisticianQueue(), attempt);
  const [selected, setSelected] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean | null>>({
    design_fit: null,
    sample_size: null,
    instrument_validity: null,
    analysis_plan: null,
  });
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const queue: StatisticianQueueItem[] =
    state.status === "ready" ? state.data : [];
  const selection =
    queue.find((item) => String(item.research_document_id) === selected) ??
    queue[0];
  const review = selection?.methodology_review ?? null;

  function selectItem(item: StatisticianQueueItem) {
    setSelected(String(item.research_document_id));
    setChecklist({
      design_fit: item.methodology_review?.design_fit ?? null,
      sample_size: item.methodology_review?.sample_size ?? null,
      instrument_validity: item.methodology_review?.instrument_validity ?? null,
      analysis_plan: item.methodology_review?.analysis_plan ?? null,
    });
    setRemarks(item.methodology_review?.remarks ?? "");
    setNotice("");
  }

  async function save(mode: "checklist" | "signoff" | "return") {
    if (!selection) return;
    setNotice("");
    if (mode === "return" && !remarks.trim()) {
      setNotice("Remarks are required when returning for clarification.");
      return;
    }
    setBusy(mode);
    try {
      if (mode === "checklist") {
        await saveStatisticianChecklist(selection.research_document_id, {
          design_fit: checklist.design_fit ?? null,
          sample_size: checklist.sample_size ?? null,
          instrument_validity: checklist.instrument_validity ?? null,
          analysis_plan: checklist.analysis_plan ?? null,
          remarks: remarks.trim() || null,
        });
      } else if (mode === "signoff") {
        await signOffMethodology(selection.research_document_id);
      } else {
        await returnMethodologyForClarification(
          selection.research_document_id,
          remarks.trim(),
        );
      }
      setNotice(
        mode === "checklist"
          ? "Checklist saved."
          : mode === "signoff"
            ? "Methodology signed off."
            : "Returned for clarification.",
      );
      reload();
    } catch (error) {
      setNotice(
        friendlyError(error, "The methodology review could not be saved"),
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Methodology checklist"
        description="Review and sign off the methodology of research assigned to you."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading methodology queue" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : queue.length === 0 ? (
        <p className="admin-empty">
          No research is currently assigned for methodology review.
        </p>
      ) : (
        <>
          <section className="panel-card admin-data-card">
            <div className="admin-card-heading">
              <div>
                <h2>Review queue</h2>
                <p>Select a document to load its checklist.</p>
              </div>
            </div>
            <div className="queue-list">
              {queue.map((item) => (
                <button
                  key={item.research_document_id}
                  className={
                    selection?.research_document_id ===
                    item.research_document_id
                      ? "queue-item active"
                      : "queue-item"
                  }
                  onClick={() => selectItem(item)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {label(item.research_stage)} ·{" "}
                    {label(item.submission_status)}
                  </span>
                  {item.methodology_review && (
                    <small>
                      {label(item.methodology_review.review_status)}
                    </small>
                  )}
                </button>
              ))}
            </div>
          </section>
          {selection && (
            <section className="panel-card admin-provision-card">
              <h2>Checklist for selected document</h2>
              <div className="checklist-banner">
                <span>
                  Current status:{" "}
                  <strong>
                    {review ? label(review.review_status) : "Not started"}
                  </strong>
                </span>
                {review?.signed_off_at && (
                  <span>Signed off {displayDate(review.signed_off_at)}</span>
                )}
              </div>
              <div className="checklist-fields">
                {(
                  [
                    ["design_fit", "Design fit"],
                    ["sample_size", "Sample size adequate"],
                    ["instrument_validity", "Instrument validity"],
                    ["analysis_plan", "Analysis plan"],
                  ] as const
                ).map(([field, fieldLabel]) => (
                  <label key={field} className="checklist-toggle">
                    <input
                      type="checkbox"
                      checked={checklist[field] === true}
                      onChange={(event) =>
                        setChecklist((current) => ({
                          ...current,
                          [field]: event.target.checked ? true : null,
                        }))
                      }
                    />
                    {fieldLabel}
                  </label>
                ))}
              </div>
              <label className="full-field">
                Remarks
                <textarea
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  rows={3}
                  maxLength={5000}
                />
              </label>
              <div className="action-row">
                <Button
                  onClick={() => void save("checklist")}
                  disabled={busy !== ""}
                >
                  {busy === "checklist" ? "Saving…" : "Save checklist"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void save("signoff")}
                  disabled={busy !== ""}
                >
                  {busy === "signoff" ? "Signing off…" : "Sign off"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void save("return")}
                  disabled={busy !== ""}
                >
                  {busy === "return"
                    ? "Returning…"
                    : "Return for clarification"}
                </Button>
              </div>
              {notice && (
                <p
                  role="status"
                  className={
                    notice.includes("could not") || notice.includes("required")
                      ? "admin-error"
                      : "admin-success"
                  }
                >
                  {notice}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatisticianSignoffs({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listStatisticianSignoffs(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Sign-offs issued"
        description="Methodology reviews you have signed off."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading sign-offs" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No sign-offs have been issued yet.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Issued sign-offs</caption>
              <thead>
                <tr>
                  <th>Research title</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Signed off</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title ?? "—"}</td>
                    <td>
                      {item.submission_status
                        ? label(item.submission_status)
                        : "—"}
                    </td>
                    <td>
                      {item.research_stage ? label(item.research_stage) : "—"}
                    </td>
                    <td>{displayDate(item.signed_off_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------- Coordinator ---------------------------------- */

function CoordinatorSchedules({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listCoordinatorSchedules(), attempt);
  const [documentId, setDocumentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function createSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setBusy("create");
    try {
      await createCoordinatorSchedule({
        research_document_id: Number(documentId),
        scheduled_at: new Date(scheduledAt).toISOString(),
        room: room.trim() || null,
        notes: notes.trim() || null,
      });
      setDocumentId("");
      setScheduledAt("");
      setRoom("");
      setNotes("");
      setNotice("Defense schedule created.");
      reload();
    } catch (error) {
      setNotice(
        friendlyError(error, "The defense schedule could not be created"),
      );
    } finally {
      setBusy("");
    }
  }

  async function updateStatus(
    schedule: DefenseScheduleResource,
    status: string,
  ) {
    setNotice("");
    setBusy(String(schedule.id));
    try {
      await updateCoordinatorSchedule(schedule.id, {
        status: status as (typeof scheduleStatuses)[number],
      });
      setNotice("Defense schedule updated.");
      reload();
    } catch (error) {
      setNotice(
        friendlyError(error, "The defense schedule could not be updated"),
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Defense schedules"
        description="Create and manage proposal-defense schedules."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      <section className="panel-card admin-provision-card">
        <h2>Schedule a defense</h2>
        <form onSubmit={createSchedule} className="admin-inline-form">
          <label>
            Research document ID
            <input
              type="number"
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              required
              min={1}
            />
          </label>
          <label>
            Scheduled at
            <DatePickerInput
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              required
            />
          </label>
          <label>
            Room
            <input
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              maxLength={150}
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={5000}
            />
          </label>
          <Button type="submit" disabled={busy === "create"}>
            {busy === "create" ? "Scheduling…" : "Create schedule"}
          </Button>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("could not") ? "admin-error" : "admin-success"
            }
          >
            {notice}
          </p>
        )}
      </section>
      {state.status === "loading" ? (
        <Loading label="Loading schedules" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No defense schedules exist yet.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Defense schedules</caption>
              <thead>
                <tr>
                  <th>Research title</th>
                  <th>Scheduled</th>
                  <th>Room</th>
                  <th>Notes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>{schedule.title ?? "—"}</td>
                    <td>{displayDate(schedule.scheduled_at)}</td>
                    <td>{schedule.room ?? "—"}</td>
                    <td>{schedule.notes ?? "—"}</td>
                    <td>
                      <select
                        aria-label={`Status for schedule ${schedule.id}`}
                        value={schedule.status}
                        onChange={(event) =>
                          void updateStatus(schedule, event.target.value)
                        }
                        disabled={busy === String(schedule.id)}
                      >
                        {scheduleStatuses.map((status) => (
                          <option key={status} value={status}>
                            {label(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CoordinatorDuplicateFlags({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listDuplicateFlags(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Duplicate flags"
        description="Research pairs flagged for possible title duplication."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading duplicate flags" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No duplicate flags are currently recorded.
        </p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Duplicate flags</caption>
              <thead>
                <tr>
                  <th>Source title</th>
                  <th>Matched title</th>
                  <th>Score</th>
                  <th>Classification</th>
                  <th>Analyzed</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((flag) => (
                  <tr key={flag.id}>
                    <td>{flag.source.title ?? "—"}</td>
                    <td>{flag.matched.title ?? "—"}</td>
                    <td>
                      <ScoreCell value={flag.overall_similarity_score} />
                    </td>
                    <td>
                      {classificationLabel(flag.classification) ??
                        "Unavailable"}
                    </td>
                    <td>{displayDate(flag.analyzed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CoordinatorAdviserLoad({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listAdviserLoad(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Adviser load"
        description="Active research assignments per adviser."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading adviser load" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No advisers have active assignments.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Adviser load</caption>
              <thead>
                <tr>
                  <th>Adviser</th>
                  <th>Email</th>
                  <th>Active assignments</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.user_id}>
                    <td>{item.name ?? "—"}</td>
                    <td>{item.email ?? "—"}</td>
                    <td>{item.active_assignments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CoordinatorAccountRoles({ role }: { role: Role }) {
  const [users, setUsers] = useState<Awaited<
    ReturnType<typeof listProvisionedAccounts>
  > | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, reload] = useAttempt();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listProvisionedAccounts("/api/coordinator/instructors")
      .then((result) => {
        if (cancelled) return;
        setUsers(result);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Instructor accounts are unavailable"),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setProvisioning(true);
    try {
      await provisionAccount("/api/coordinator/instructors", email.trim());
      setEmail("");
      setNotice("Instructor account provisioned.");
      reload();
    } catch (requestError) {
      setNotice(
        friendlyError(
          requestError,
          "The instructor account could not be provisioned",
        ),
      );
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Account roles"
        description="Provision and review Research Instructor accounts."
      />
      <section className="panel-card admin-provision-card">
        <h2>Provision instructor</h2>
        <form onSubmit={submit} className="admin-inline-form">
          <label>
            Instructor email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <Button type="submit" disabled={provisioning}>
            {provisioning ? "Provisioning…" : "Provision account"}
          </Button>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("provisioned") ? "admin-success" : "admin-error"
            }
          >
            {notice}
          </p>
        )}
      </section>
      <section className="panel-card admin-data-card">
        <div className="admin-card-heading">
          <div>
            <h2>Provisioned instructors</h2>
            <p>Only role and account-access information is listed.</p>
          </div>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        </div>
        {error ? (
          <InlineError message={error} retry={reload} />
        ) : loading || users === null ? (
          <Loading label="Loading instructor accounts" />
        ) : users.length === 0 ? (
          <p className="admin-empty">
            No instructor accounts have been provisioned.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">
                Provisioned instructor accounts
              </caption>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.email}>
                    <td>{user.email}</td>
                    <td>{label(user.role)}</td>
                    <td>{label(user.accessStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CoordinatorReports({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => getCoordinatorProgramReport(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Program reports"
        description="Live program counts, sections, and adviser workload."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading program report" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : (
        <>
          <ProgramCounts report={state.data} />
          <section className="panel-card admin-data-card">
            <div className="admin-card-heading">
              <div>
                <h2>Class sections</h2>
                <p>Document count per class section.</p>
              </div>
            </div>
            {state.data.by_section.length === 0 ? (
              <p className="admin-empty">No class sections exist.</p>
            ) : (
              <div className="admin-table-wrap">
                <table>
                  <caption className="sr-only">Class sections</caption>
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Documents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.by_section.map((section) => (
                      <tr key={section.id}>
                        <td>{section.name}</td>
                        <td>{section.documents_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel-card admin-data-card">
            <div className="admin-card-heading">
              <div>
                <h2>Adviser load</h2>
                <p>Active research assignments per adviser.</p>
              </div>
            </div>
            {state.data.adviser_load.length === 0 ? (
              <p className="admin-empty">
                No advisers have active assignments.
              </p>
            ) : (
              <div className="admin-table-wrap">
                <table>
                  <caption className="sr-only">Adviser load</caption>
                  <thead>
                    <tr>
                      <th>Adviser</th>
                      <th>Email</th>
                      <th>Active assignments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.adviser_load.map((item) => (
                      <tr key={item.user_id}>
                        <td>{item.name ?? "—"}</td>
                        <td>{item.email ?? "—"}</td>
                        <td>{item.active_assignments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ProgramCounts({ report }: { report: CoordinatorProgramReport }) {
  const counts = report.counts;
  return (
    <section className="admin-stat-grid" aria-label="Program counts">
      <Stat label="Active instructors" value={counts.active_instructors} />
      <Stat label="Active advisers" value={counts.active_advisers} />
      <Stat label="Active researchers" value={counts.active_researchers} />
      <Stat label="Drafts" value={counts.draft} />
      <Stat label="Submitted" value={counts.submitted} />
      <Stat label="Under review" value={counts.under_review} />
      <Stat label="Revision required" value={counts.revision_required} />
      <Stat label="Approved" value={counts.approved} />
      <Stat label="Archived" value={counts.archived} />
      <Stat label="Flagged similarity" value={counts.flagged_similarity} />
      <Stat label="Defenses scheduled" value={counts.defenses_scheduled} />
      <Stat label="Defenses completed" value={counts.defenses_completed} />
      <Stat
        label="Evaluations submitted"
        value={counts.evaluations_submitted}
      />
      <Stat
        label="Methodology signed off"
        value={counts.methodology_signed_off}
      />
    </section>
  );
}

/* ---------------------------------- Librarian ---------------------------------- */

function LibrarianRepositoryCatalog({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState({ search: "", category: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof listRepositoryCatalog>
  > | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, reload] = useAttempt();
  const categories = useLoad(() => listCategories(), 0);
  const { filters, change } = useLiveFilters(
    { search: "", category: "" },
    (next) => {
      setPage(1);
      setQuery(next);
      reload();
    },
  );

  useEffect(() => {
    let cancelled = false;
    void listRepositoryCatalog({
      ...query,
      category: query.category ? Number(query.category) : undefined,
      page,
      per_page: 25,
    })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Repository records are unavailable"),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page, query]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(filters);
    reload();
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Repository catalog"
        description="Approved and archived research records."
        action={
          <Button variant="secondary" onClick={() => navigate("/catalog")}>
            Open public catalog
          </Button>
        }
      />
      <section className="panel-card admin-data-card">
        <form className="admin-filters" onSubmit={applyFilters}>
          <label>
            Search
            <input
              value={filters.search}
              onChange={(event) => change("search", event.target.value)}
              placeholder="Title keyword"
            />
          </label>
          <label>
            Category
            <select
              value={filters.category}
              onChange={(event) => change("category", event.target.value)}
            >
              <option value="">All categories</option>
              {(categories.status === "ready" ? categories.data : []).map(
                (category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ),
              )}
            </select>
          </label>
        </form>
        {error ? (
          <InlineError message={error} retry={reload} />
        ) : loading || result === null ? (
          <Loading label="Loading repository catalog" />
        ) : result.data.length === 0 ? (
          <p className="admin-empty">
            {hasFilters(query)
              ? "No repository records match these filters."
              : "No repository records are available."}
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">Repository catalog</caption>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Archive</th>
                    <th>Visibility</th>
                    <th>Year</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.category?.name ?? "—"}</td>
                      <td>{label(row.submission_status)}</td>
                      <td>{label(row.archive_status)}</td>
                      <td>{label(row.visibility)}</td>
                      <td>{row.publication_year ?? "—"}</td>
                      <td>{displayDate(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={result.meta}
              onPage={(nextPage) => {
                setPage(nextPage);
                reload();
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

function LibrarianMetadataStandards({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listMetadataStandards(), attempt);
  const [selected, setSelected] = useState<MetadataStandardsItem | null>(null);
  const [form, setForm] = useState({
    title_complete: false,
    abstract_complete: false,
    authors_complete: false,
    keywords_complete: false,
    category_complete: false,
    notes: "",
    review_status: "complete",
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function openReview(item: MetadataStandardsItem) {
    setSelected(item);
    setForm({
      title_complete: item.metadata_review?.title_complete ?? false,
      abstract_complete: item.metadata_review?.abstract_complete ?? false,
      authors_complete: item.metadata_review?.authors_complete ?? false,
      keywords_complete: item.metadata_review?.keywords_complete ?? false,
      category_complete: item.metadata_review?.category_complete ?? false,
      notes: item.metadata_review?.notes ?? "",
      review_status: item.metadata_review?.review_status ?? "complete",
    });
    setNotice("");
  }

  async function saveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setNotice("");
    setSaving(true);
    try {
      await saveMetadataReview(selected.research_document_id, {
        ...form,
        review_status: form.review_status as
          "pending" | "complete" | "needs_correction",
        notes: form.notes.trim() || null,
      });
      setNotice("Metadata review saved.");
      reload();
    } catch (error) {
      setNotice(friendlyError(error, "The metadata review could not be saved"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Metadata standards"
        description="Validate repository metadata completeness for approved records."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading metadata standards" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No approved records are available.</p>
      ) : (
        <>
          <section className="panel-card admin-data-card">
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">Metadata standards</caption>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Year</th>
                    <th>Title</th>
                    <th>Abstract</th>
                    <th>Keywords</th>
                    <th>Authors</th>
                    <th>Category set</th>
                    <th>Review</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.map((item) => (
                    <tr key={item.research_document_id}>
                      <td>{item.title}</td>
                      <td>{item.category ?? "—"}</td>
                      <td>{item.publication_year ?? "—"}</td>
                      <td>{yesNo(item.metadata_completeness.title)}</td>
                      <td>{yesNo(item.metadata_completeness.abstract)}</td>
                      <td>{yesNo(item.metadata_completeness.keywords)}</td>
                      <td>{yesNo(item.metadata_completeness.authors)}</td>
                      <td>{yesNo(item.metadata_completeness.category)}</td>
                      <td>
                        {item.metadata_review
                          ? label(item.metadata_review.review_status)
                          : "—"}
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => openReview(item)}
                        >
                          {selected?.research_document_id ===
                          item.research_document_id
                            ? "Editing…"
                            : "Review"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {selected && (
            <section className="panel-card admin-provision-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Metadata review</h2>
                  <p>{selected.title}</p>
                </div>
              </div>
              <form
                onSubmit={saveReview}
                className="admin-inline-form review-form"
              >
                <div className="checklist-fields">
                  {(
                    [
                      ["title_complete", "Title complete"],
                      ["abstract_complete", "Abstract complete"],
                      ["authors_complete", "Authors complete"],
                      ["keywords_complete", "Keywords complete"],
                      ["category_complete", "Category complete"],
                    ] as const
                  ).map(([field, fieldLabel]) => (
                    <label key={field} className="checklist-toggle">
                      <input
                        type="checkbox"
                        checked={form[field]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [field]: event.target.checked,
                          }))
                        }
                      />
                      {fieldLabel}
                    </label>
                  ))}
                </div>
                <label>
                  Review status
                  <select
                    value={form.review_status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        review_status: event.target.value,
                      }))
                    }
                  >
                    {["pending", "complete", "needs_correction"].map(
                      (status) => (
                        <option key={status} value={status}>
                          {label(status)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    rows={3}
                    maxLength={5000}
                  />
                </label>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save metadata review"}
                </Button>
              </form>
              {notice && (
                <p
                  role="status"
                  className={
                    notice.includes("could not")
                      ? "admin-error"
                      : "admin-success"
                  }
                >
                  {notice}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function LibrarianRetentionLogs({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listRetentionLogs(), attempt);
  const [documentId, setDocumentId] = useState("");
  const [action, setAction] = useState("version_kept");
  const [remarks, setRemarks] = useState("");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");

  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setRecording(true);
    try {
      await recordRetentionLog({
        research_document_id: documentId ? Number(documentId) : null,
        action: action as
          | "version_kept"
          | "version_superseded"
          | "final_archived"
          | "unpublished"
          | "removed",
        remarks: remarks.trim() || null,
      });
      setDocumentId("");
      setRemarks("");
      setNotice("Retention action recorded.");
      reload();
    } catch (error) {
      setNotice(
        friendlyError(error, "The retention action could not be recorded"),
      );
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Retention & compliance"
        description="Record and review repository retention actions."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      <section className="panel-card admin-provision-card">
        <h2>Record a retention action</h2>
        <form onSubmit={record} className="admin-inline-form">
          <label>
            Research document ID
            <input
              type="number"
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              min={1}
            />
          </label>
          <label>
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              {[
                "version_kept",
                "version_superseded",
                "final_archived",
                "unpublished",
                "removed",
              ].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Remarks
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={2}
              maxLength={5000}
            />
          </label>
          <Button type="submit" disabled={recording}>
            {recording ? "Recording…" : "Record action"}
          </Button>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("could not") ? "admin-error" : "admin-success"
            }
          >
            {notice}
          </p>
        )}
      </section>
      {state.status === "loading" ? (
        <Loading label="Loading retention logs" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No retention actions have been recorded.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Retention logs</caption>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Document</th>
                  <th>Remarks</th>
                  <th>Recorded by</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((log) => (
                  <tr key={log.id}>
                    <td>{label(log.action)}</td>
                    <td>{log.title ?? "—"}</td>
                    <td>{log.remarks ?? "—"}</td>
                    <td>{log.performed_by ?? "—"}</td>
                    <td>{displayDate(log.activity_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------- Research office ---------------------------------- */

function OfficeInstitutionalOverview({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => getInstitutionalReport(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Institutional overview"
        description="Live institutional counts for users, archiving, and reviews."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading institutional overview" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : (
        <>
          <InstitutionCounts report={state.data} />
          <section className="panel-card admin-data-card">
            <div className="admin-card-heading">
              <div>
                <h2>Academic units</h2>
                <p>Research records per academic unit.</p>
              </div>
            </div>
            {state.data.by_academic_unit.length === 0 ? (
              <p className="admin-empty">No academic units are recorded.</p>
            ) : (
              <div className="admin-table-wrap">
                <table>
                  <caption className="sr-only">Academic units</caption>
                  <thead>
                    <tr>
                      <th>Academic unit</th>
                      <th>Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.by_academic_unit.map((unit) => (
                      <tr key={unit.academic_unit}>
                        <td>{unit.academic_unit}</td>
                        <td>{unit.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function InstitutionCounts({ report }: { report: InstitutionalReport }) {
  const counts = report.counts;
  return (
    <section className="admin-stat-grid" aria-label="Institutional counts">
      <Stat label="Total users" value={counts.total_users} />
      <Stat label="Active users" value={counts.active_users} />
      <Stat label="Pending archiving" value={counts.pending_archiving} />
      <Stat label="Archived" value={counts.archived} />
      <Stat label="Flagged similarity" value={counts.flagged_similarity} />
      <Stat label="Audit events" value={counts.audit_events} />
      <Stat
        label="Evaluations submitted"
        value={counts.evaluations_submitted}
      />
      <Stat
        label="Methodology signed off"
        value={counts.methodology_signed_off}
      />
    </section>
  );
}

function OfficeUsers({ role }: { role: Role }) {
  const [query, setQuery] = useState({
    search: "",
    role: "",
    access_status: "",
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LaravelPaginatedResponse<
    Awaited<ReturnType<typeof listOfficeUsers>>["data"][number]
  > | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AccessStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, reload] = useAttempt();
  const { filters, change } = useLiveFilters(
    { search: "", role: "", access_status: "" },
    (next) => {
      setPage(1);
      setQuery(next);
      reload();
    },
  );

  useEffect(() => {
    let cancelled = false;
    void listOfficeUsers({
      ...query,
      role: (query.role as AdminRole) || undefined,
      access_status: (query.access_status as AccessStatus) || undefined,
      page,
      per_page: 25,
    })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(friendlyError(requestError, "User records are unavailable"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page, query]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(filters);
    reload();
  }

  async function save(
    user: Awaited<ReturnType<typeof listOfficeUsers>>["data"][number],
  ) {
    const status = drafts[user.id] ?? user.access_status;
    setSaveMessage("");
    setSaving(user.id);
    try {
      await updateOfficeUserAccess(user.id, status);
      setDrafts((current) => {
        const remaining = { ...current };
        delete remaining[user.id];
        return remaining;
      });
      setSaveMessage(`Updated ${user.email}.`);
      reload();
    } catch (requestError) {
      setSaveMessage(
        friendlyError(
          requestError,
          "The user access change could not be saved",
        ),
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="User & role management"
        description="Review account access across the program. Roles are assigned by coordinators."
      />
      <section className="panel-card admin-data-card">
        <form className="admin-filters" onSubmit={applyFilters}>
          <label>
            Search
            <input
              value={filters.search}
              onChange={(event) => change("search", event.target.value)}
              placeholder="Name or email"
            />
          </label>
          <label>
            Role
            <select
              value={filters.role}
              onChange={(event) => change("role", event.target.value)}
            >
              <option value="">All roles</option>
              {roles.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {label(roleOption)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Access status
            <select
              value={filters.access_status}
              onChange={(event) => change("access_status", event.target.value)}
            >
              <option value="">All statuses</option>
              {accessStatuses.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
        </form>
        {saveMessage && (
          <p
            role="status"
            className={
              saveMessage.startsWith("Updated")
                ? "admin-success"
                : "admin-error"
            }
          >
            {saveMessage}
          </p>
        )}
        {error ? (
          <InlineError message={error} retry={reload} />
        ) : loading || result === null ? (
          <Loading label="Loading users" />
        ) : result.data.length === 0 ? (
          <p className="admin-empty">
            {hasFilters(query)
              ? "No users match these filters."
              : "No user accounts are available."}
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">User accounts</caption>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Created</th>
                    <th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((user) => (
                    <tr key={user.id}>
                      <td>{officeUserName(user) || "—"}</td>
                      <td>{user.email}</td>
                      <td>{label(user.role)}</td>
                      <td>
                        <select
                          aria-label={`Access status for ${user.email}`}
                          value={drafts[user.id] ?? user.access_status}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value as AccessStatus,
                            }))
                          }
                        >
                          {accessStatuses.map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{displayDate(user.created_at)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => void save(user)}
                          disabled={saving === user.id}
                        >
                          {saving === user.id ? "Saving…" : "Save"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={result.meta}
              onPage={(nextPage) => {
                setPage(nextPage);
                reload();
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

function OfficeReports({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => getInstitutionalReport(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Reports & exports"
        description="Institutional breakdowns by academic unit and submission status."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading reports" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : (
        <>
          <section className="panel-card admin-data-card">
            <div className="admin-card-heading">
              <div>
                <h2>By academic unit</h2>
                <p>Research records per academic unit.</p>
              </div>
            </div>
            {state.data.by_academic_unit.length === 0 ? (
              <p className="admin-empty">No academic units are recorded.</p>
            ) : (
              <div className="admin-table-wrap">
                <table>
                  <caption className="sr-only">By academic unit</caption>
                  <thead>
                    <tr>
                      <th>Academic unit</th>
                      <th>Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.by_academic_unit.map((unit) => (
                      <tr key={unit.academic_unit}>
                        <td>{unit.academic_unit}</td>
                        <td>{unit.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel-card admin-data-card">
            <div className="admin-card-heading">
              <div>
                <h2>By submission status</h2>
                <p>Research records per submission status.</p>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">By submission status</caption>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Records</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.by_status.map((row) => (
                    <tr key={row.status}>
                      <td>{label(row.status)}</td>
                      <td>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function OfficePrivacyLogs({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listPrivacyLogs(), attempt);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("consent_recorded");
  const [details, setDetails] = useState("");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");

  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setRecording(true);
    try {
      await recordPrivacyLog({
        user_id: userId.trim() || null,
        action: action as
          | "consent_recorded"
          | "consent_withdrawn"
          | "consent_log_requested"
          | "data_export",
        details: details.trim() || null,
      });
      setUserId("");
      setDetails("");
      setNotice("Privacy action recorded.");
      reload();
    } catch (error) {
      setNotice(
        friendlyError(error, "The privacy action could not be recorded"),
      );
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Data privacy log"
        description="Record and review data-privacy consent and export actions."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      <section className="panel-card admin-provision-card">
        <h2>Record a privacy action</h2>
        <form onSubmit={record} className="admin-inline-form">
          <label>
            User ID
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              maxLength={36}
            />
          </label>
          <label>
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              {[
                "consent_recorded",
                "consent_withdrawn",
                "consent_log_requested",
                "data_export",
              ].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Details
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={2}
              maxLength={5000}
            />
          </label>
          <Button type="submit" disabled={recording}>
            {recording ? "Recording…" : "Record action"}
          </Button>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("could not") ? "admin-error" : "admin-success"
            }
          >
            {notice}
          </p>
        )}
      </section>
      {state.status === "loading" ? (
        <Loading label="Loading privacy logs" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No privacy actions have been recorded.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Privacy logs</caption>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Performed by</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((log) => (
                  <tr key={log.id}>
                    <td>{log.user?.name ?? log.user?.email ?? "—"}</td>
                    <td>{label(log.action)}</td>
                    <td>{log.details ?? "—"}</td>
                    <td>{log.performed_by ?? "—"}</td>
                    <td>{displayDate(log.activity_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------- Academics ---------------------------------- */

function AcademicsSearch({ role }: { role: Role }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResearchRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError("");
    setNotice("");
    setSearching(true);
    try {
      const matches = await searchPublicResearchBySimilarity(q);
      setResults(matches);
    } catch (requestError) {
      setError(
        friendlyError(requestError, "The repository search is unavailable"),
      );
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  async function saveToLibrary(record: ResearchRecord) {
    setNotice("");
    try {
      await saveLibraryItem(record.id);
      setSaved((current) => ({ ...current, [String(record.id)]: true }));
      setNotice("Saved to your library.");
    } catch (requestError) {
      setNotice(
        friendlyError(
          requestError,
          "The record could not be saved to your library",
        ),
      );
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Search"
        description="Search the public repository and save records to your library."
      />
      <section className="panel-card admin-provision-card">
        <form onSubmit={runSearch} className="admin-inline-form">
          <label>
            Search query
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Research title or keyword"
              required
            />
          </label>
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search repository"}
          </Button>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("could not") ? "admin-error" : "admin-success"
            }
          >
            {notice}
          </p>
        )}
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {searching ? (
        <Loading label="Searching repository" />
      ) : results === null ? (
        <p className="admin-empty">
          Enter a query to search repository records by similarity.
        </p>
      ) : results.length === 0 ? (
        <p className="admin-empty">
          No matching repository records were found.
        </p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Repository search results</caption>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Authors</th>
                  <th>Year</th>
                  <th>Score</th>
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {results.map((record) => (
                  <tr key={record.id}>
                    <td>{record.title}</td>
                    <td>{record.authors}</td>
                    <td>{record.year || "—"}</td>
                    <td>
                      {record.querySimilarityScore === null ||
                      record.querySimilarityScore === undefined
                        ? "—"
                        : scorePercent(Number(record.querySimilarityScore))}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => void saveToLibrary(record)}
                        disabled={saved[record.id]}
                      >
                        {saved[record.id] ? "Saved" : "Save to library"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AcademicsCategories({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listCategoryCounts(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Browse by category"
        description="Public repository records grouped by research category."
        action={
          <Button variant="secondary" onClick={() => navigate("/catalog")}>
            Open catalog
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading categories" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No research categories are available.</p>
      ) : (
        <div className="admin-data-grid">
          {state.data.map((category) => (
            <section className="panel-card admin-stat" key={category.id}>
              <strong>{category.records_count.toLocaleString()}</strong>
              <span>{category.name}</span>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Researcher ---------------------------------- */

function ResearcherSubmissions({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    ResearchDocumentSummaryResource["submission_status"] | ""
  >("");
  const [result, setResult] =
    useState<LaravelPaginatedResponse<ResearchDocumentSummaryResource> | null>(
      null,
    );
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [editing, setEditing] =
    useState<ResearchDocumentSummaryResource | null>(null);
  const [activityFor, setActivityFor] =
    useState<ResearchDocumentSummaryResource | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, reload] = useAttempt();

  useEffect(() => {
    let cancelled = false;
    void listResearchDocuments({
      mine: true,
      submission_status: statusFilter || undefined,
      page,
      per_page: 25,
    })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Your submissions are unavailable"),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page, statusFilter]);

  async function submit(document: ResearchDocumentSummaryResource) {
    setNotice("");
    setSubmitting(String(document.id));
    try {
      await submitResearchDocument(document.id);
      setNotice(`"${document.title}" has been submitted.`);
      reload();
    } catch (requestError) {
      setNotice(
        friendlyError(requestError, "The submission could not be completed"),
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="My submissions"
        description="Your research records and their current workflow status."
        action={
          <div className="submission-page-actions">
            <Button variant="secondary" onClick={reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              onClick={() => {
                setCreateDirty(false);
                setCreating(true);
              }}
            >
              <Plus /> New submission
            </Button>
          </div>
        }
      />
      {notice && (
        <p
          role="status"
          className={
            notice.includes("could not") ? "admin-error" : "admin-success"
          }
        >
          {notice}
        </p>
      )}
      <div className="admin-filters">
        <label>
          Research status
          <select
            aria-label="Research status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value as
                  ResearchDocumentSummaryResource["submission_status"] | "",
              );
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "draft",
              "submitted",
              "under_review",
              "revision_required",
              "approved",
              "archived",
            ].map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <InlineError message={error} retry={reload} />
      ) : loading || result === null ? (
        <Loading label="Loading your submissions" />
      ) : result.data.length === 0 ? (
        <section className="panel-card submissions-empty-state">
          <p className="eyebrow">Research workspace</p>
          <h2>No submissions yet</h2>
          <p>Create your first research draft to begin the review workflow.</p>
          <Button
            onClick={() => {
              setCreateDirty(false);
              setCreating(true);
            }}
          >
            <Plus /> Create submission
          </Button>
        </section>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">My submissions</caption>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Archive</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((document) => (
                  <tr key={document.id}>
                    <td>{document.title}</td>
                    <td>{label(document.research_stage)}</td>
                    <td>{label(document.submission_status)}</td>
                    <td>{label(document.archive_status)}</td>
                    <td>{displayDate(document.submitted_at)}</td>
                    <td>
                      <span className="row-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setActivityFor(document)}
                        >
                          Feedback &amp; activity
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => navigate(`/research/${document.id}`)}
                        >
                          Open record
                        </Button>
                        {["draft", "revision_required"].includes(
                          document.submission_status,
                        ) && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditDirty(false);
                                setEditing(document);
                              }}
                              disabled={submitting === String(document.id)}
                            >
                              Edit
                            </Button>
                            {document.submission_status === "draft" && (
                              <Button
                                variant="secondary"
                                onClick={() => void submit(document)}
                                disabled={submitting === String(document.id)}
                              >
                                {submitting === String(document.id)
                                  ? "Submitting…"
                                  : "Submit"}
                              </Button>
                            )}
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            meta={result.meta}
            onPage={(nextPage) => {
              setPage(nextPage);
              reload();
            }}
          />
        </section>
      )}
      {activityFor && (
        <Modal
          label={`Feedback and activity for ${activityFor.title}`}
          onClose={() => setActivityFor(null)}
          size="large"
        >
          <ResearchActivity
            researchDocumentId={activityFor.id}
            title={activityFor.title}
          />
        </Modal>
      )}
      {creating && (
        <Modal
          label="Create a new submission"
          onClose={() => setCreating(false)}
          dirty={createDirty}
          size="large"
        >
          <ResearcherNewSubmission
            role={role}
            embedded
            onDirtyChange={setCreateDirty}
            onCancel={() => setCreating(false)}
            onSaved={(document, submitted) => {
              setNotice(
                submitted
                  ? `"${document.title}" has been submitted.`
                  : `Draft "${document.title}" has been created.`,
              );
              setCreating(false);
              if (page === 1) reload();
              else setPage(1);
            }}
          />
        </Modal>
      )}
      {editing && (
        <Modal
          label={`Edit ${editing.title}`}
          onClose={() => setEditing(null)}
          dirty={editDirty}
          size="large"
        >
          <ResearcherNewSubmission
            key={editing.id}
            role={role}
            draft={editing}
            embedded
            onDirtyChange={setEditDirty}
            onCancel={() => setEditing(null)}
            onSaved={(document, submitted) => {
              setNotice(
                submitted
                  ? `"${document.title}" has been submitted.`
                  : `Draft "${document.title}" has been updated.`,
              );
              setEditing(null);
              reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

type AuthorDraft = {
  author_name: string;
  user_id: string;
  is_corresponding_author: boolean;
};

const MAX_SUBMISSION_FILE_BYTES = 25 * 1024 * 1024;
const submissionFileExtensions = new Set(["pdf", "doc", "docx"]);
const submissionDocumentTypes: Array<{
  value: DocumentFileResource["document_type"];
  label: string;
}> = [
  { value: "title_proposal", label: "Title proposal" },
  { value: "draft", label: "Draft manuscript" },
  { value: "chapter", label: "Chapter" },
  { value: "attachment", label: "Attachment" },
];

export function ResearcherNewSubmission({
  role,
  draft,
  embedded = false,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  role: Role;
  draft?: ResearchDocumentSummaryResource;
  embedded?: boolean;
  onSaved?: (
    document: ResearchDocumentSummaryResource,
    submitted: boolean,
  ) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const isRevisionRequired = draft?.submission_status === "revision_required";
  const [categoryAttempt, retryCategories] = useAttempt();
  const categories = useLoad(() => listCategories(), categoryAttempt);
  const initialAuthors = draft?.authors.length
    ? draft.authors.map((author) => ({
        author_name: author.author_name,
        user_id: author.user_id ?? "",
        is_corresponding_author: author.is_corresponding_author,
      }))
    : [{ author_name: "", user_id: "", is_corresponding_author: false }];
  const [title, setTitle] = useState(draft?.title ?? "");
  const [abstract, setAbstract] = useState(draft?.abstract ?? "");
  const [keywords, setKeywords] = useState(draft?.keywords ?? "");
  const [publicationYear, setPublicationYear] = useState(
    draft?.publication_year ? String(draft.publication_year) : "",
  );
  const [researchStage, setResearchStage] = useState(
    draft?.research_stage ?? "title_proposal",
  );
  const [categoryId, setCategoryId] = useState(
    draft?.category_id ? String(draft.category_id) : "",
  );
  const [authors, setAuthors] = useState<AuthorDraft[]>(initialAuthors);
  const [documentType, setDocumentType] = useState<
    DocumentFileResource["document_type"]
  >(isRevisionRequired ? "revised_manuscript" : "title_proposal");
  const [manuscript, setManuscript] = useState<File | null>(null);
  const [createdDraft, setCreatedDraft] =
    useState<ResearchDocumentSummaryResource | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const initialSnapshot = JSON.stringify({
    title: draft?.title ?? "",
    abstract: draft?.abstract ?? "",
    keywords: draft?.keywords ?? "",
    publicationYear: draft?.publication_year
      ? String(draft.publication_year)
      : "",
    researchStage: draft?.research_stage ?? "title_proposal",
    categoryId: draft?.category_id ? String(draft.category_id) : "",
    authors: initialAuthors,
  });
  const currentSnapshot = JSON.stringify({
    title,
    abstract,
    keywords,
    publicationYear,
    researchStage,
    categoryId,
    authors,
  });
  const dirty = manuscript !== null || currentSnapshot !== initialSnapshot;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changeAuthor(index: number, patch: Partial<AuthorDraft>) {
    setAuthors((current) =>
      current.map((author, position) =>
        position === index ? { ...author, ...patch } : author,
      ),
    );
  }

  function addAuthor() {
    setAuthors((current) => [
      ...current,
      { author_name: "", user_id: "", is_corresponding_author: false },
    ]);
  }

  function removeAuthor(index: number) {
    setAuthors((current) =>
      current.filter((_, position) => position !== index),
    );
  }

  function resetForm() {
    setTitle("");
    setAbstract("");
    setKeywords("");
    setPublicationYear("");
    setResearchStage("title_proposal");
    setCategoryId("");
    setAuthors([
      { author_name: "", user_id: "", is_corresponding_author: false },
    ]);
    setDocumentType(
      isRevisionRequired ? "revised_manuscript" : "title_proposal",
    );
    setManuscript(null);
    setCreatedDraft(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function validateManuscript(file: File | null): string | null {
    if (file === null) return null;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!submissionFileExtensions.has(extension)) {
      return "The manuscript must be a PDF, DOC, or DOCX file.";
    }
    if (file.size > MAX_SUBMISSION_FILE_BYTES) {
      return "The manuscript must not exceed 25 MB.";
    }
    return null;
  }

  async function saveSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const submitAfterSave =
      !isRevisionRequired && submitter?.value === "submit";
    if (authors.some((author) => !author.author_name.trim())) {
      setError("Every author must have a name.");
      return;
    }
    if (submitAfterSave && !categoryId) {
      setError("Choose a category before submitting for review.");
      return;
    }
    const fileError = validateManuscript(manuscript);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSaving(true);
    let saved = draft ?? createdDraft;
    let metadataSaved = false;
    try {
      const input = {
        category_id: categoryId ? Number(categoryId) : null,
        title: title.trim(),
        abstract: abstract.trim() || null,
        keywords: keywords.trim() || null,
        publication_year: publicationYear ? Number(publicationYear) : null,
        research_stage: researchStage as
          "title_proposal" | "ongoing" | "completed",
        authors: authors.map((author) => ({
          author_name: author.author_name.trim(),
          user_id: author.user_id.trim() || null,
          is_corresponding_author: author.is_corresponding_author,
        })),
      };
      saved = saved
        ? await updateResearchDraft(saved.id, input)
        : await createResearchDraft(input);
      metadataSaved = true;
      setCreatedDraft(saved);

      if (manuscript) {
        await uploadResearchFile(saved.id, manuscript, documentType);
        setManuscript(null);
        if (fileInput.current) fileInput.current.value = "";
      }
      if (submitAfterSave) {
        saved = await submitResearchDocument(saved.id);
      }

      setNotice(
        submitAfterSave
          ? `"${saved.title}" has been submitted for review.`
          : draft
            ? `${isRevisionRequired ? "Revision" : "Draft"} "${saved.title}" updated.`
            : `Draft "${saved.title}" created.`,
      );
      onSaved?.(saved, submitAfterSave);
      if (!draft) resetForm();
    } catch (requestError) {
      if (metadataSaved && saved) {
        setNotice(
          `Draft "${saved.title}" was saved. You can retry the remaining action.`,
        );
      }
      setError(
        friendlyError(
          requestError,
          metadataSaved
            ? "The draft was saved, but the file upload or submission could not be completed"
            : "The draft could not be saved",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    resetForm();
    setConfirmCancel(false);
    onCancel?.();
  }

  return (
    <div
      className={
        embedded
          ? "submission-editor-embedded admin-sidebar-page"
          : "workspace-content admin-sidebar-page"
      }
    >
      {embedded ? (
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Researcher / Draft</p>
            <h2>{draft ? "Edit submission" : "New submission"}</h2>
            <p>
              {draft
                ? isRevisionRequired
                  ? "Update metadata, authors, and revised manuscript files before resubmitting the requested revision."
                  : "Update metadata, authors, and manuscript files before submission."
                : "Create a research draft, add its authors, and optionally attach a manuscript."}
            </p>
          </div>
        </header>
      ) : (
        <RolePageHeader
          role={role}
          title="New submission"
          description="Create a research draft, attach a manuscript, or submit it for review."
        />
      )}
      {categories.status === "error" ? (
        <InlineError message={categories.message} retry={retryCategories} />
      ) : categories.status === "loading" ? (
        <Loading label="Loading research categories" />
      ) : (
        <section className="panel-card admin-provision-card">
          <form
            onSubmit={saveSubmission}
            className="admin-inline-form submission-form"
            aria-label="Research submission"
          >
            <label className="submission-title-field">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={500}
              />
            </label>
            <label className="submission-abstract-field">
              Abstract
              <textarea
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                rows={5}
                maxLength={50000}
              />
            </label>
            <label className="submission-keywords-field">
              Keywords
              <input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                maxLength={5000}
                placeholder="Comma separated"
              />
            </label>
            <div className="score-grid submission-metadata-fields">
              <label>
                Publication year
                <PublicationYearInput
                  value={publicationYear}
                  onChange={(event) => setPublicationYear(event.target.value)}
                />
              </label>
              <label>
                Research stage
                <select
                  value={researchStage}
                  onChange={(event) =>
                    setResearchStage(
                      event.target
                        .value as ResearchDocumentSummaryResource["research_stage"],
                    )
                  }
                >
                  {researchStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {label(stage)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Uncategorized</option>
                  {categories.data.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="author-editor submission-authors">
              <legend>Authors</legend>
              {authors.map((author, index) => (
                <div className="author-row" key={index}>
                  <label>
                    Author name
                    <input
                      value={author.author_name}
                      onChange={(event) =>
                        changeAuthor(index, { author_name: event.target.value })
                      }
                      maxLength={255}
                    />
                  </label>
                  <label>
                    User ID (optional)
                    <input
                      value={author.user_id}
                      onChange={(event) =>
                        changeAuthor(index, { user_id: event.target.value })
                      }
                      maxLength={36}
                    />
                  </label>
                  <label className="checklist-toggle">
                    <input
                      type="checkbox"
                      checked={author.is_corresponding_author}
                      onChange={(event) =>
                        changeAuthor(index, {
                          is_corresponding_author: event.target.checked,
                        })
                      }
                    />
                    Corresponding
                  </label>
                  {authors.length > 1 && (
                    <Button
                      variant="secondary"
                      onClick={() => removeAuthor(index)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="secondary" onClick={addAuthor}>
                Add author
              </Button>
            </fieldset>
            <fieldset className="author-editor submission-file">
              <legend>Manuscript file (optional)</legend>
              <div className="score-grid">
                <label>
                  Document type
                  <select
                    value={documentType}
                    onChange={(event) =>
                      setDocumentType(
                        event.target
                          .value as DocumentFileResource["document_type"],
                      )
                    }
                  >
                    {(isRevisionRequired
                      ? [
                          {
                            value: "revised_manuscript",
                            label: "Revised manuscript",
                          },
                          ...submissionDocumentTypes,
                        ]
                      : submissionDocumentTypes
                    ).map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  PDF, DOC, or DOCX (maximum 25 MB)
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) =>
                      setManuscript(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
            </fieldset>
            <div className="modal-actions submission-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => (dirty ? setConfirmCancel(true) : onCancel?.())}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" value="draft" disabled={saving}>
                {saving
                  ? "Saving…"
                  : isRevisionRequired
                    ? "Save changes"
                    : draft
                      ? "Update draft"
                      : "Save draft"}
              </Button>
              {!isRevisionRequired && (
                <Button type="submit" value="submit" disabled={saving}>
                  {saving ? "Working…" : "Save and submit"}
                </Button>
              )}
            </div>
          </form>
          {notice && (
            <p role="status" className="admin-success">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
        </section>
      )}
      {confirmCancel && (
        <ConfirmDialog
          title="Discard submission changes"
          message="Your unsaved metadata, author, and file selections will be discarded."
          confirmLabel="Discard changes"
          onConfirm={cancelEditing}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

const MAX_SIMILARITY_QUERY_LENGTH = 200;

/**
 * Pre-submission duplicate check.
 *
 * The comparison is driven by the title or keywords typed into the search bar,
 * not by an already-created research record, so a proposed title can be
 * validated before any submission exists.
 */
function ResearcherSimilarityCheck({ role }: { role: Role }) {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ready"; matches: ResearchRecord[] }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const trimmed = draft.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 2;
  const canCheck =
    trimmed.length >= 2 &&
    trimmed.length <= MAX_SIMILARITY_QUERY_LENGTH &&
    state.status !== "checking";

  function runCheck() {
    if (!canCheck) return;
    setSubmitted(trimmed);
    setState({ status: "checking" });
    void checkTitleQuerySimilarity(trimmed)
      .then((matches) => setState({ status: "ready", matches }))
      .catch((requestError: unknown) =>
        setState({
          status: "error",
          message: similarityQueryError(requestError),
        }),
      );
  }

  const scored = state.status === "ready" ? state.matches : [];
  const reviewRequired = scored.filter(
    (match) => match.adviserReviewRequired === true,
  );

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Similarity check"
        description="Type a proposed title or keywords to check it against the archived repository before you submit."
      />

      <section className="panel-card admin-provision-card">
        <form
          className="similarity-query-form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            runCheck();
          }}
        >
          <label className="full-field" htmlFor="similarity-query">
            Proposed title or keywords
            <input
              id="similarity-query"
              type="search"
              value={draft}
              maxLength={MAX_SIMILARITY_QUERY_LENGTH}
              placeholder="e.g. web-based inventory management system for small business"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="similarity-query-actions">
            <span className="similarity-query-count">
              {trimmed.length}/{MAX_SIMILARITY_QUERY_LENGTH}
            </span>
            <Button type="submit" disabled={!canCheck}>
              {state.status === "checking"
                ? "Checking…"
                : "Check for duplicates"}
            </Button>
          </div>
        </form>
        {tooShort && (
          <p className="admin-empty">Enter at least two characters to check.</p>
        )}
      </section>

      {state.status === "checking" ? (
        <Loading label="Comparing your keywords with the repository" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={runCheck} />
      ) : state.status === "ready" ? (
        <section className="panel-card admin-data-card">
          <div className="admin-card-heading">
            <div>
              <h2>Results for “{submitted}”</h2>
              <p>
                {scored.length === 0
                  ? "No archived study shares any terms with these keywords."
                  : reviewRequired.length > 0
                    ? `${reviewRequired.length} archived ${reviewRequired.length === 1 ? "study requires" : "studies require"} adviser review. Discuss these results with your adviser before proceeding.`
                    : "No archived study requires adviser review."}
              </p>
            </div>
            {reviewRequired.length > 0 && (
              <span className="pending-invite-count">
                {reviewRequired.length} require review
              </span>
            )}
          </div>
          {scored.length > 0 && (
            <>
              <div className="admin-table-wrap">
                <table>
                  <caption className="sr-only">
                    Archived studies ranked by similarity to your keywords
                  </caption>
                  <thead>
                    <tr>
                      <th>Similarity</th>
                      <th>Archived title</th>
                      <th>Year</th>
                      <th>Shared terms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scored.map((match) => {
                      const overall = formatSimilarityPercentage(
                        match.overallSimilarityPercentage,
                      );
                      const classification = classificationLabel(
                        match.classification,
                      );
                      const title = formatSimilarityPercentage(
                        match.titleSimilarityPercentage,
                      );
                      const content = formatSimilarityPercentage(
                        match.contentSimilarityPercentage,
                      );
                      const titleWeight = formatSimilarityWeight(
                        match.titleWeight,
                      );
                      const contentWeight = formatSimilarityWeight(
                        match.contentWeight,
                      );
                      const titleContribution = formatSimilarityValue(
                        match.titleWeightedContribution,
                      );
                      const contentContribution = formatSimilarityValue(
                        match.contentWeightedContribution,
                      );
                      const contentUnavailable =
                        match.scoreStatus === "content_unavailable" || !content;
                      const showEquation =
                        !!overall &&
                        !contentUnavailable &&
                        titleContribution !== null &&
                        contentContribution !== null;
                      return (
                        <tr key={match.id}>
                          <td>
                            <span className="score-cell">
                              <strong>
                                {overall ?? "Overall similarity unavailable"}
                              </strong>
                              <span>
                                Classification:{" "}
                                {classification ?? "Unavailable"}
                              </span>
                              {match.adviserReviewRequired && (
                                <span>
                                  This result has been flagged for adviser
                                  review. The system does not automatically
                                  reject the research.
                                </span>
                              )}
                              {match.titleMatchAlert && (
                                <span>Near-exact title match alert</span>
                              )}
                              <span>
                                Title {title ?? "unavailable"} · Weight{" "}
                                {titleWeight ?? "unavailable"} · Contribution{" "}
                                {titleContribution === null
                                  ? "unavailable"
                                  : `${titleContribution} points`}
                              </span>
                              {contentUnavailable ? (
                                <span>Content analysis unavailable</span>
                              ) : (
                                <span>
                                  Content {content} · Weight{" "}
                                  {contentWeight ?? "unavailable"} ·
                                  Contribution{" "}
                                  {contentContribution === null
                                    ? "unavailable"
                                    : `${contentContribution} points`}
                                </span>
                              )}
                              {showEquation && (
                                <span>
                                  Displayed overall ≈ {titleContribution} +{" "}
                                  {contentContribution} ≈ {overall}
                                </span>
                              )}
                              {match.classification === "low" && (
                                <span>
                                  The system detected low similarity based on
                                  the configured comparison method. Low
                                  similarity does not prove originality.
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="serif-cell">{match.title}</td>
                          <td>{match.year}</td>
                          <td>
                            {match.matchedTerms && match.matchedTerms.length > 0
                              ? match.matchedTerms.join(", ")
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function similarityQueryError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "Too many checks in a short time. Wait a moment and try again.";
    if (error.status === 422)
      return "Enter between 2 and 200 characters to check a title.";
    if (error.code === "SIMILARITY_UNAVAILABLE")
      return "The similarity engine is not available right now.";
    if (error.code === "SIMILARITY_PROCESS_FAILED")
      return "The similarity check could not be completed. No score was produced.";
    if (error.status === 401)
      return "Session expired. Sign out and sign in again.";
    return `The similarity check is unavailable (${error.code}).`;
  }
  return "The similarity check is unavailable (REQUEST_FAILED).";
}

function ResearcherRelatedStudies({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const state = useLoad(
    () => listResearchDocuments({ mine: true, page, per_page: 10 }),
    attempt,
  );
  const selected =
    state.status === "ready"
      ? (state.data.data.find((document) => document.id === selectedId) ??
        state.data.data[0] ??
        null)
      : null;
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Related studies"
        description="Review stored manuscript-similarity matches for one of your submissions."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {state.status === "loading" ? (
        <Loading label="Loading your submissions" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.data.length === 0 ? (
        <p className="admin-empty">You have no submissions to compare yet.</p>
      ) : (
        <>
          <section className="panel-card admin-data-card researcher-related-selector">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Your submissions</p>
                <h2>Select a record</h2>
              </div>
              {selected && (
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/research/${selected.id}`)}
                >
                  Open workspace
                </Button>
              )}
            </div>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">Your submissions</caption>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.data.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <label className="researcher-related-option">
                          <input
                            type="radio"
                            name="related-study"
                            checked={selected?.id === record.id}
                            onChange={() => setSelectedId(record.id)}
                          />
                          {record.title}
                        </label>
                      </td>
                      <td>{label(record.submission_status)}</td>
                      <td>{displayDate(record.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={state.data.meta}
              onPage={(nextPage) => {
                setSelectedId(null);
                setPage(nextPage);
                reload();
              }}
            />
          </section>
          {selected && (
            <SimilarityResults
              researchDocumentId={selected.id}
              onOpenCatalog={(title) =>
                navigate(`/catalog?q=${encodeURIComponent(title)}`)
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------- Helpers ---------------------------------- */

function scorePercent(value: number | string | null) {
  if (value === null) return "Overall similarity unavailable";
  const normalized = Number(value);
  return Number.isFinite(normalized)
    ? `${(normalized * 100).toFixed(2)}%`
    : "Overall similarity unavailable";
}

/** Displays canonical normalized overall scores from role-summary endpoints. */
function ScoreCell({ value }: { value: number | string | null }) {
  return (
    <span className="score-cell">
      <span>{scorePercent(value)}</span>
    </span>
  );
}

function officeUserName(
  user: Awaited<ReturnType<typeof listOfficeUsers>>["data"][number],
) {
  return [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(" ");
}

function studentName(student: InstructorStudentResource) {
  return (
    [student.first_name, student.middle_name, student.last_name]
      .filter(Boolean)
      .join(" ") || "Unnamed account"
  );
}

function hasFilters(filters: Record<string, string>) {
  return Object.values(filters).some(Boolean);
}
