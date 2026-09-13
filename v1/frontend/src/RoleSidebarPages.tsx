import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Folder,
  MessageSquareText,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  ApiError,
  checkContentQuerySimilarity,
  checkTitleQuerySimilarity,
  createCoordinatorSchedule,
  createInstructorSection,
  createResearchDraft,
  getCoordinatorProgramReport,
  getInstructorProjectTeam,
  getInstitutionalReport,
  listAdviserAdvisees,
  listAdviserMonitoring,
  listAdviserPendingReviews,
  listAdviserReviewHistory,
  listAdviserFeedbackHistory,
  listAdviserSimilarityAlerts,
  listCategories,
  listCoordinatorSchedules,
  listDuplicateFlags,
  listAdviserLoad,
  listInstructorClassReports,
  listInstructorMonitoring,
  listInstructorPanelists,
  listInstructorReviewHistory,
  listInstructorAssignedSubmissions,
  listInstructorSections,
  listInstructorSimilarityOverview,
  listInstructorStudents,
  listInstructorProjectTeamCandidates,
  listOfficeUsers,
  listPanelAssignments,
  listPanelHistory,
  listPanelSchedule,
  listProvisionedAccounts,
  listRepositoryCatalog,
  listResearchDocuments,
  listMetadataStandards,
  listRetentionLogs,
  listSectionDocuments,
  listSectionDocumentMembers,
  listSectionMembers,
  listStatisticianQueue,
  listStatisticianSignoffs,
  listSupportAssignmentInbox,
  listLibrarianAssignedResearch,
  listLibrarianMonitoring,
  listLibrarianReviewHistory,
  listEditorAssignedResearch,
  listEditorHistory,
  listEditorMonitoring,
  markStatisticalReviewNotApplicable,
  provisionAccount,
  recordRetentionLog,
  removeSectionMember,
  addSectionDocumentMember,
  removeSectionDocumentMember,
  replaceInstructorProjectTeam,
  replaceInstructorProjectTeamRole,
  createSectionProject,
  updateSectionProjectTitle,
  deleteSectionProject,
  returnMethodologyForClarification,
  respondToSupportAssignment,
  saveLibrarianMonitoring,
  saveLibrarianReferenceReview,
  saveEditorMonitoring,
  saveEditorReview,
  saveAdviserMonitoring,
  saveMetadataReview,
  saveStatisticianChecklist,
  signOffMethodology,
  saveInstructorMonitoring,
  assignInstructorPanelist,
  submitPanelEvaluation,
  submitResearchDocument,
  verifyInstructorMonitoring,
  updateResearchDraft,
  updateCoordinatorSchedule,
  updateInstructorSection,
  updateOfficeUserAccess,
  uploadResearchFile,
  addSectionMembers,
  type AccessStatus,
  type AdminRole,
  type OfficeUserRow,
  type CoordinatorProgramReport,
  type DefenseScheduleResource,
  type DocumentFileResource,
  type InstructorSectionDocumentItem,
  type InstructorAssignedSubmissionItem,
  type InstructorSectionResource,
  type InstructorStudentResource,
  type InstructorMonitoringEntry,
  type InstructorProjectTeam,
  type ProjectTeamPerson,
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
import { instituteNames, programsByInstitute, roleConfigs } from "./data";
import { ConfirmDialog, Modal } from "./Modal";
import ResearchActivity from "./ResearchActivity";
import InstructorResearchReview from "./InstructorResearchReview";
import SimilarityResults from "./SimilarityResults";
import PublicResearchMetadataDialog from "./PublicResearchMetadataDialog";
import { classificationLabel, formatSimilarityPercentage } from "./similarity";
import type { ResearchRecord, Role } from "./types";
import { useLiveFilters } from "./useLiveFilters";
import { filterUserRows } from "./userManagement";

const roles: AdminRole[] = [
  "admin",
  "researcher",
  "adviser",
  "instructor",
  "panel",
  "statistician",
  "coordinator",
  "librarian",
  "research_editor",
  "research-office",
];
import ResearchOfficeBulkImport from "./ResearchOfficeBulkImport";
import RepositoryManagementWorkspace from "./RepositoryManagementWorkspace";

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
  similarityMode,
  instructorSectionId,
  instructorProjectDocumentId,
}: {
  role: Role;
  selectedNav: string;
  navigate: (path: string) => void;
  similarityMode?: "title" | "content";
  instructorSectionId?: string | number;
  instructorProjectDocumentId?: string | number;
}) {
  switch (role) {
    case "research_editor":
      switch (selectedNav) {
        case "Dashboard":
          return <EditorDashboard role={role} />;
        case "Assigned Research":
        case "Editorial Review":
          return <EditorReview role={role} />;
        case "Monitoring":
          return <EditorMonitoring role={role} />;
        case "Review History":
          return <EditorHistory role={role} navigate={navigate} />;
        default:
          return null;
      }
    case "adviser":
      switch (selectedNav) {
        case "Assigned Research":
        case "My Advisees":
          return <AdviserAdvisees role={role} navigate={navigate} />;
        case "Pending Reviews":
        case "Title Review":
          return (
            <AdviserPendingReviews role={role} navigate={navigate} titleOnly />
          );
        case "Manuscript Review":
          return <AdviserPendingReviews role={role} navigate={navigate} />;
        case "Monitoring":
          return <AdviserMonitoring role={role} />;
        case "Review History":
          return <AdviserReviewHistory role={role} navigate={navigate} />;
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
          return (
            <InstructorSections
              role={role}
              navigate={navigate}
              sectionId={instructorSectionId}
              projectDocumentId={instructorProjectDocumentId}
            />
          );
        case "Assigned Submissions":
        case "Assigned Research":
          return <InstructorAssignedSubmissions role={role} />;
        case "Review Submissions":
          return <InstructorAssignedSubmissions role={role} titleOnly />;
        case "Monitoring":
          return <InstructorMonitoring role={role} />;
        case "Review History":
          return <InstructorReviewHistory role={role} navigate={navigate} />;
        case "Panelist Availability":
          return <InstructorPanelists role={role} />;
        case "Similarity Overview":
          return <InstructorSimilarityOverview role={role} />;
        case "Class Reports":
          return <InstructorClassReports role={role} />;
        default:
          return null;
      }
    case "panel":
      switch (selectedNav) {
        case "Assigned Defenses":
        case "Defense Schedule":
          return <PanelDefenseSchedule role={role} />;
        case "Defense Evaluation":
        case "Evaluation Form":
          return <PanelEvaluationForm role={role} />;
        case "Availability Calendar":
          return <PanelAvailability role={role} />;
        case "Monitoring":
        case "Evaluation History":
        case "Panel History":
          return <PanelHistory role={role} />;
        default:
          return null;
      }
    case "statistician":
      switch (selectedNav) {
        case "Assigned Research":
        case "Statistical Review":
        case "Methodology Checklist":
          return <StatisticianMethodologyChecklist role={role} />;
        case "Monitoring":
        case "Review History":
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
        case "Assignment Requests":
          return <LibrarianAssignmentRequests role={role} />;
        case "Assigned Research":
        case "Reference Review":
          return <LibrarianReferenceReview role={role} />;
        case "Monitoring":
          return <LibrarianMonitoring role={role} />;
        case "Review History":
          return <LibrarianReviewHistory role={role} navigate={navigate} />;
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
        case "Repository Management":
          return <RepositoryManagementWorkspace context="office" />;

        case "Upload Manuscript":
          return <ResearchOfficeBulkImport />;

        case "User & Role Management":
          return <OfficeUsers role={role} />;

        case "Reports & Exports":
          return <OfficeReports role={role} />;

        default:
          return null;
      }
    case "researcher":
      switch (selectedNav) {
        case "My Submissions":
        case "My Research":
        case "Feedback & Revisions":
        case "Research Progress":
          return <ResearcherSubmissions role={role} navigate={navigate} />;
        case "Create Research":
          return <ResearcherNewSubmission role={role} />;
        case "Similarity Check":
          return (
            <ResearcherSimilarityCheck
              key={similarityMode}
              role={role}
              initialMode={similarityMode}
            />
          );
        case "Related Studies":
          return <ResearcherRelatedStudies role={role} navigate={navigate} />;
        default:
          return null;
      }
    default:
      return null;
  }
}

function PanelAvailability({ role }: { role: Role }) {
  const [selected, setSelected] = useState("");
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Availability calendar"
        description="Select dates you are unavailable. Defense scheduling remains with the Coordinator."
      />
      <section className="panel-card">
        <label>
          Unavailable date
          <input
            type="date"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          />
        </label>
        {selected && (
          <p className="admin-error">
            {displayDate(selected)} marked unavailable for this browser session
            only.
          </p>
        )}
        <p className="admin-empty">
          Unavailable dates cannot persist after refresh because the locked
          database has no safe Panelist availability field.
        </p>
      </section>
    </div>
  );
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

function requireResearcherPage(
  response: LaravelPaginatedResponse<ResearchDocumentSummaryResource>,
) {
  if (
    !response ||
    !Array.isArray(response.data) ||
    !response.meta ||
    !Number.isFinite(response.meta.current_page) ||
    !Number.isFinite(response.meta.last_page) ||
    !Number.isFinite(response.meta.total)
  ) {
    throw new Error("RESEARCHER_PAGE_INVALID");
  }
  return response;
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

function AdviserPendingReviews({
  role,
  navigate,
  titleOnly = false,
}: {
  role: Role;
  navigate: (path: string) => void;
  titleOnly?: boolean;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listAdviserPendingReviews(), attempt);
  const rows =
    state.status === "ready"
      ? state.data.filter(
          (item) => !titleOnly || item.research_stage === "title_proposal",
        )
      : [];
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title={titleOnly ? "Title review" : "Manuscript review"}
        description={
          titleOnly
            ? "Review proposed titles, similarity evidence, and related studies."
            : "Review current and previous manuscript versions for assigned research."
        }
        action={<Button onClick={reload}>Refresh</Button>}
      />
      {state.status === "loading" ? (
        <Loading label="Loading pending reviews" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : rows.length === 0 ? (
        <p className="admin-empty">
          No assigned research currently requires this review.
        </p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Research</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Open revisions</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.research_document_id}>
                    <td>{item.title}</td>
                    <td>{label(item.research_stage)}</td>
                    <td>{label(item.submission_status)}</td>
                    <td>{item.open_revisions}</td>
                    <td>{displayDate(item.updated_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/research/${item.research_document_id}`)
                        }
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
      )}
    </div>
  );
}

function AdviserReviewHistory({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listAdviserReviewHistory(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Review history"
        description="Your persisted title and manuscript review actions."
        action={<Button onClick={reload}>Refresh</Button>}
      />
      {state.status === "loading" ? (
        <Loading label="Loading review history" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No Adviser review history is available.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Research</th>
                  <th>Stage</th>
                  <th>Type</th>
                  <th>Remarks</th>
                  <th>Required action</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      {label(
                        (item as typeof item & { research_stage?: string })
                          .research_stage ?? "",
                      )}
                    </td>
                    <td>{label(item.review_type)}</td>
                    <td>{item.remarks ?? "—"}</td>
                    <td>{item.required_action ?? "—"}</td>
                    <td>{label(item.status)}</td>
                    <td>{displayDate(item.reviewed_at ?? item.created_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/research/${item.research_document_id}`)
                        }
                      >
                        Open research
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

function AdviserMonitoring({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const entries = useLoad(() => listAdviserMonitoring(), attempt);
  const advisees = useLoad(() => listAdviserAdvisees(), attempt);
  const documents =
    advisees.status === "ready"
      ? advisees.data.flatMap((group) => group.documents)
      : [];
  const [researchId, setResearchId] = useState("");
  const [stage, setStage] = useState<
    InstructorMonitoringEntry["monitoring_stage"]
  >("before_proposal_defense");
  const [activity, setActivity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!researchId || !activity.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      await saveAdviserMonitoring(researchId, {
        monitoring_stage: stage,
        activity_date: new Date().toISOString().slice(0, 10),
        activity: activity.trim(),
        remarks: remarks.trim() || null,
        status: "completed",
        signature_status: "signed",
      });
      setActivity("");
      setRemarks("");
      setNotice("Adviser monitoring entry saved.");
      reload();
    } catch (error) {
      setNotice(friendlyError(error, "Monitoring could not be saved"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Monitoring"
        description="Record your Adviser participation before and after proposal defense. Final verification remains with the Research Instructor."
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
      {documents.length > 0 && (
        <section className="panel-card">
          <form className="admin-inline-form" onSubmit={save}>
            <label>
              Assigned research
              <select
                required
                value={researchId}
                onChange={(event) => setResearchId(event.target.value)}
              >
                <option value="">Select research</option>
                {documents.map((item) => (
                  <option
                    key={item.research_document_id}
                    value={item.research_document_id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Monitoring stage
              <select
                value={stage}
                onChange={(event) =>
                  setStage(
                    event.target
                      .value as InstructorMonitoringEntry["monitoring_stage"],
                  )
                }
              >
                <option value="before_proposal_defense">
                  Before Proposal Defense
                </option>
                <option value="after_proposal_defense">
                  After Proposal Defense
                </option>
              </select>
            </label>
            <label>
              Activity
              <textarea
                required
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
              />
            </label>
            <label>
              Remarks
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </label>
            <Button disabled={busy}>
              {busy ? "Saving…" : "Save signed Adviser entry"}
            </Button>
          </form>
        </section>
      )}
      {entries.status === "loading" ? (
        <Loading label="Loading monitoring" />
      ) : entries.status === "error" ? (
        <InlineError message={entries.message} retry={reload} />
      ) : entries.data.length === 0 ? (
        <p className="admin-empty">No monitoring entries are available.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Research</th>
                  <th>Stage</th>
                  <th>Designation</th>
                  <th>Activity</th>
                  <th>Remarks</th>
                  <th>Status</th>
                  <th>Signature</th>
                  <th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {entries.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.title}</td>
                    <td>{label(entry.monitoring_stage)}</td>
                    <td>{entry.designation ?? entry.reviewer_role}</td>
                    <td>{entry.activity ?? "—"}</td>
                    <td>{entry.remarks ?? "—"}</td>
                    <td>{label(entry.status)}</td>
                    <td>{label(entry.signature_status)}</td>
                    <td>
                      {entry.verified_at
                        ? displayDate(entry.verified_at)
                        : "Pending Instructor verification"}
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
                <table className="checker-results-table">
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
  const [sectionCode, setSectionCode] = useState("");
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
        section_code: sectionCode.trim(),
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
        <form
          onSubmit={submit}
          className="admin-inline-form section-dialog-form"
        >
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
            Section code
            <input
              value={sectionCode}
              onChange={(event) => setSectionCode(event.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label className="section-dialog-year">
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

function ProjectAccountOptions({
  candidates,
  selectedIds,
  onToggle,
  mode = "multiple",
  groupName,
  onClear,
  disabledIds = [],
  disabledLabel,
}: {
  candidates: ProjectTeamPerson[];
  selectedIds: string[];
  onToggle: (person: ProjectTeamPerson, selected: boolean) => void;
  mode?: "single" | "multiple";
  groupName?: string;
  onClear?: () => void;
  disabledIds?: string[];
  disabledLabel?: string;
}) {
  return (
    <div className="project-team-options">
      {mode === "single" && onClear && (
        <label>
          <input
            type="radio"
            name={groupName}
            checked={selectedIds.length === 0}
            onChange={onClear}
          />
          <span>
            <strong>No assignment</strong>
            <small>Leave this project role unassigned.</small>
          </span>
        </label>
      )}
      {candidates.map((person) => {
        const disabled = disabledIds.includes(person.user_id);
        return (
          <label key={person.user_id}>
            <input
              type={mode === "single" ? "radio" : "checkbox"}
              name={mode === "single" ? groupName : undefined}
              disabled={disabled}
              checked={selectedIds.includes(person.user_id)}
              onChange={(event) => onToggle(person, event.target.checked)}
            />
            <span>
              <strong>{person.name}</strong>
              <small>{person.email}</small>
              {disabled && disabledLabel && (
                <small className="project-role-status">{disabledLabel}</small>
              )}
            </span>
          </label>
        );
      })}
    </div>
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

function InstructorPanelists({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const panelists = useLoad(() => listInstructorPanelists(), attempt);
  const research = useLoad(() => listInstructorAssignedSubmissions(), attempt);
  const [researchId, setResearchId] = useState(0);
  const [panelistId, setPanelistId] = useState("");
  const [designation, setDesignation] = useState<
    "panel_member" | "panel_chair"
  >("panel_member");
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Panelist availability"
        description="View eligible Panelists and assign Panel Members or a Panel Chair to an assigned research study."
      />
      {panelists.status === "loading" ? (
        <Loading label="Loading Panelists" />
      ) : panelists.status === "error" ? (
        <InlineError message={panelists.message} retry={reload} />
      ) : (
        <>
          <section className="panel-card admin-data-card">
            {panelists.data.map((item) => (
              <p key={item.id}>
                <strong>{item.name}</strong> · {item.email} · Availability dates
                unavailable because the locked schema has no persistence
                support.
              </p>
            ))}
          </section>
          <section className="panel-card">
            <form
              className="admin-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void assignInstructorPanelist(
                  researchId,
                  panelistId,
                  designation,
                ).then(reload);
              }}
            >
              <label>
                Research
                <select
                  required
                  value={researchId || ""}
                  onChange={(event) =>
                    setResearchId(Number(event.target.value))
                  }
                >
                  <option value="">Select</option>
                  {research.status === "ready" &&
                    research.data.map((item) => (
                      <option
                        key={item.research_document_id}
                        value={item.research_document_id}
                      >
                        {item.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Panelist
                <select
                  required
                  value={panelistId}
                  onChange={(event) => setPanelistId(event.target.value)}
                >
                  <option value="">Select</option>
                  {panelists.data.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Designation
                <select
                  value={designation}
                  onChange={(event) =>
                    setDesignation(event.target.value as typeof designation)
                  }
                >
                  <option value="panel_member">Panel Member</option>
                  <option value="panel_chair">Panel Chair</option>
                </select>
              </label>
              <Button>Assign Panelist</Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function InstructorReviewHistory({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listInstructorReviewHistory(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Review history"
        description="Your persisted comments, revision requests, and recommendations."
        action={<Button onClick={reload}>Refresh</Button>}
      />
      {state.status === "loading" ? (
        <Loading label="Loading review history" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No Instructor review history is available.
        </p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Research</th>
                  <th>Type</th>
                  <th>Remarks</th>
                  <th>Required action</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{label(item.review_type)}</td>
                    <td>{item.remarks ?? "—"}</td>
                    <td>{item.required_action ?? "—"}</td>
                    <td>{label(item.status)}</td>
                    <td>{displayDate(item.reviewed_at ?? item.created_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/research/${item.research_document_id}`)
                        }
                      >
                        Open research
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

function InstructorMonitoring({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const entries = useLoad(() => listInstructorMonitoring(), attempt);
  const assignments = useLoad(
    () => listInstructorAssignedSubmissions(),
    attempt,
  );
  const [researchId, setResearchId] = useState("");
  const [stage, setStage] = useState<
    InstructorMonitoringEntry["monitoring_stage"]
  >("before_proposal_defense");
  const [activity, setActivity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!researchId || !activity.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      await saveInstructorMonitoring(researchId, {
        monitoring_stage: stage,
        activity_date: new Date().toISOString().slice(0, 10),
        activity: activity.trim(),
        remarks: remarks.trim() || null,
        status: "completed",
        signature_status: "signed",
      });
      setActivity("");
      setRemarks("");
      setNotice("Monitoring entry saved.");
      reload();
    } catch (error) {
      setNotice(friendlyError(error, "Monitoring could not be saved"));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!researchId) return;
    setBusy(true);
    setNotice("");
    try {
      await verifyInstructorMonitoring(researchId, stage);
      setNotice("Monitoring verified.");
      reload();
    } catch (error) {
      setNotice(friendlyError(error, "Monitoring could not be verified"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Monitoring"
        description="Before and after proposal defense monitoring verified by the Research Instructor."
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
      {assignments.status === "ready" && assignments.data.length > 0 && (
        <section className="panel-card">
          <form className="admin-inline-form" onSubmit={save}>
            <label>
              Research
              <select
                value={researchId}
                onChange={(event) => setResearchId(event.target.value)}
                required
              >
                <option value="">Select assigned research</option>
                {assignments.data.map((item) => (
                  <option
                    key={item.research_document_id}
                    value={item.research_document_id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Monitoring stage
              <select
                value={stage}
                onChange={(event) =>
                  setStage(
                    event.target
                      .value as InstructorMonitoringEntry["monitoring_stage"],
                  )
                }
              >
                <option value="before_proposal_defense">
                  Before Proposal Defense
                </option>
                <option value="after_proposal_defense">
                  After Proposal Defense
                </option>
              </select>
            </label>
            <label>
              Activity
              <textarea
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
                required
              />
            </label>
            <label>
              Remarks
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </label>
            <div className="row-actions">
              <Button disabled={busy}>Save signed entry</Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !researchId}
                onClick={() => void verify()}
              >
                Verify monitoring
              </Button>
            </div>
          </form>
        </section>
      )}
      {entries.status === "loading" || assignments.status === "loading" ? (
        <Loading label="Loading monitoring" />
      ) : entries.status === "error" ? (
        <InlineError message={entries.message} retry={reload} />
      ) : entries.data.length === 0 ? (
        <p className="admin-empty">No monitoring records are available.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Research</th>
                  <th>Stage</th>
                  <th>Designation</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>Signature</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {entries.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.title}</td>
                    <td>{label(entry.monitoring_stage)}</td>
                    <td>{entry.designation ?? entry.reviewer_role}</td>
                    <td>{entry.activity ?? "—"}</td>
                    <td>{label(entry.status)}</td>
                    <td>{label(entry.signature_status)}</td>
                    <td>
                      {entry.verified_at
                        ? displayDate(entry.verified_at)
                        : "Not verified"}
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

function InstructorSections({
  role,
  navigate,
  sectionId,
  projectDocumentId,
}: {
  role: Role;
  navigate: (path: string) => void;
  sectionId?: string | number;
  projectDocumentId?: string | number;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listInstructorSections(), attempt);
  const [pageNotice, setPageNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const openSection =
    sectionId !== undefined && state.status === "ready"
      ? (state.data.find((item) => String(item.id) === String(sectionId)) ??
        null)
      : null;
  const [detailsNotice, setDetailsNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSectionCode, setEditSectionCode] = useState("");
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
  const [projectTeam, setProjectTeam] = useState<InstructorProjectTeam | null>(
    null,
  );
  const [teamCandidates, setTeamCandidates] = useState<
    Record<string, ProjectTeamPerson[]>
  >({});
  const [teamSearches, setTeamSearches] = useState<Record<string, string>>({});
  const [teamDraft, setTeamDraft] = useState({
    adviser_id: "",
    research_office_representative_id: "",
    chair_id: "",
    panel_member_ids: [] as string[],
  });
  const panelSearchQuery = (teamSearches.panelMembers ?? "")
    .trim()
    .toLocaleLowerCase();
  const matchingPanelCandidates = (teamCandidates.panel_member ?? []).filter(
    (person) =>
      panelSearchQuery === "" ||
      `${person.name} ${person.email}`
        .toLocaleLowerCase()
        .includes(panelSearchQuery),
  );
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [projectDisclosures, setProjectDisclosures] = useState({
    students: false,
    adviser: false,
    researchOffice: false,
    chair: false,
    panelMembers: false,
  });
  const [projectManageOpen, setProjectManageOpen] = useState(false);
  const [confirmDocumentRemove, setConfirmDocumentRemove] =
    useState<InstructorStudentResource | null>(null);
  const [confirmTeamSave, setConfirmTeamSave] = useState<
    "adviser" | "researchOffice" | "chair" | "panelMembers" | null
  >(null);
  const teamRequestRef = useRef(0);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectBusy, setNewProjectBusy] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState("");
  const [editProjectBusy, setEditProjectBusy] = useState(false);
  const [confirmProjectDelete, setConfirmProjectDelete] = useState(false);
  const [deleteProjectBusy, setDeleteProjectBusy] = useState(false);
  const studentSearchRef = useRef<Record<number, number>>({});
  const showingProjectPage = openSection !== null && selectedDocument !== null;
  const projectAssignmentEditing =
    Object.values(projectDisclosures).some(Boolean);

  function resetProjectDisclosures() {
    setProjectDisclosures({
      students: false,
      adviser: false,
      researchOffice: false,
      chair: false,
      panelMembers: false,
    });
  }

  useEffect(() => {
    const timers = studentSearchRef.current;
    return () => {
      for (const timer of Object.values(timers)) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!openSection) return;
    void loadDocuments(openSection.id);
    void loadStudents(openSection.id, "");
  }, [openSection, sectionId, state]);

  useEffect(() => {
    if (!openSection || projectDocumentId === undefined) return;
    const document = (documentsFor[openSection.id] ?? []).find(
      (item) => String(item.research_document_id) === String(projectDocumentId),
    );
    if (document) void openDocumentMembers(openSection.id, document);
  }, [openSection, projectDocumentId, documentsFor]);

  function openSectionDetails(section: InstructorSectionResource) {
    navigate(`/app/instructor/sections/${section.id}`);
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
    const requestId = ++teamRequestRef.current;
    setSelectedDocument(document);
    setDocumentMembersLoading(true);
    setTeamLoading(true);
    try {
      const [members, team, advisers, officePersonnel, chairs, panelists] =
        await Promise.allSettled([
          listSectionDocumentMembers(sectionId, document.research_document_id),
          getInstructorProjectTeam(sectionId, document.research_document_id),
          listInstructorProjectTeamCandidates(
            sectionId,
            document.research_document_id,
            "adviser",
          ),
          listInstructorProjectTeamCandidates(
            sectionId,
            document.research_document_id,
            "research_office_representative",
          ),
          listInstructorPanelists().then((people) =>
            people.map((person) => ({
              user_id: person.id,
              name: person.name,
              email: person.email,
              team_role: "chair" as const,
            })),
          ),
          listInstructorPanelists().then((people) =>
            people.map((person) => ({
              user_id: person.id,
              name: person.name,
              email: person.email,
              team_role: "panel_member" as const,
            })),
          ),
        ]);
      if (requestId !== teamRequestRef.current) return;
      if (members.status === "fulfilled") setDocumentMembers(members.value);
      if (team.status === "fulfilled") {
        setProjectTeam(team.value);
        setTeamDraft({
          adviser_id: team.value.adviser?.user_id ?? "",
          research_office_representative_id:
            team.value.research_office_representative?.user_id ?? "",
          chair_id: team.value.chair?.user_id ?? "",
          panel_member_ids: team.value.panel_members.map(
            (member) => member.user_id,
          ),
        });
      }
      setTeamCandidates({
        adviser: advisers.status === "fulfilled" ? advisers.value : [],
        research_office_representative:
          officePersonnel.status === "fulfilled" ? officePersonnel.value : [],
        chair: chairs.status === "fulfilled" ? chairs.value : [],
        panel_member: panelists.status === "fulfilled" ? panelists.value : [],
      });
      const failedRequest = [
        members,
        team,
        advisers,
        officePersonnel,
        chairs,
        panelists,
      ].find((result) => result.status === "rejected");
      if (failedRequest?.status === "rejected") {
        setDetailsNotice(
          friendlyError(
            failedRequest.reason,
            "Some research title assignment data could not be loaded",
          ),
        );
      }
    } catch (error) {
      if (requestId !== teamRequestRef.current) return;
      setDetailsNotice(
        friendlyError(error, "The research title members could not be loaded"),
      );
      setDocumentMembers([]);
    } finally {
      if (requestId === teamRequestRef.current) {
        setDocumentMembersLoading(false);
        setTeamLoading(false);
      }
    }
  }

  function closeDocumentFolder() {
    teamRequestRef.current += 1;
    setSelectedDocument(null);
    setDocumentMembers([]);
    setProjectTeam(null);
    setProjectManageOpen(false);
    resetProjectDisclosures();
    if (openSection) navigate(`/app/instructor/sections/${openSection.id}`);
  }

  function closeSectionDetails() {
    teamRequestRef.current += 1;
    navigate("/app/instructor/sections");
  }

  async function saveProjectTeamRole(
    role: "adviser" | "researchOffice" | "chair" | "panelMembers",
  ) {
    if (!openSection || !selectedDocument) return;
    setTeamBusy(true);
    setDetailsNotice("");
    const teamRole =
      role === "researchOffice"
        ? "research_office_representative"
        : role === "panelMembers"
          ? "panel_member"
          : role;
    try {
      if (role === "panelMembers") {
        const team = await replaceInstructorProjectTeam(
          openSection.id,
          selectedDocument.research_document_id,
          {
            adviser_id: projectTeam?.adviser?.user_id ?? null,
            research_office_representative_id:
              projectTeam?.research_office_representative?.user_id ?? null,
            chair_id: projectTeam?.chair?.user_id ?? null,
            panel_member_ids: teamDraft.panel_member_ids,
          },
        );
        setProjectTeam(team);
      } else {
        const field =
          role === "adviser"
            ? "adviser_id"
            : role === "researchOffice"
              ? "research_office_representative_id"
              : "chair_id";
        const team = await replaceInstructorProjectTeamRole(
          openSection.id,
          selectedDocument.research_document_id,
          teamRole,
          teamDraft[field] || null,
        );
        setProjectTeam(team);
      }
      setDetailsNotice("Research project assignment saved.");
      resetProjectDisclosures();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The project assignment could not be saved"),
      );
    } finally {
      setTeamBusy(false);
    }
  }

  function requestProjectTeamSave(
    role: "adviser" | "researchOffice" | "chair" | "panelMembers",
  ) {
    if (!projectTeam) {
      void saveProjectTeamRole(role);
      return;
    }
    const changed =
      role === "adviser"
        ? projectTeam.adviser?.user_id !== teamDraft.adviser_id
        : role === "researchOffice"
          ? projectTeam.research_office_representative?.user_id !==
            teamDraft.research_office_representative_id
          : role === "chair"
            ? projectTeam.chair?.user_id !== teamDraft.chair_id
            : projectTeam.panel_members
                .map((member) => member.user_id)
                .sort()
                .join(",") !== [...teamDraft.panel_member_ids].sort().join(",");
    const hasCurrentAssignment =
      role === "panelMembers"
        ? projectTeam.panel_members.length > 0
        : role === "researchOffice"
          ? projectTeam.research_office_representative !== null
          : role === "adviser"
            ? projectTeam.adviser !== null
            : projectTeam.chair !== null;
    if (changed && hasCurrentAssignment) {
      setConfirmTeamSave(role);
      return;
    }
    void saveProjectTeamRole(role);
  }

  function projectTeamRoleAction(
    role: "adviser" | "researchOffice" | "chair" | "panelMembers",
  ) {
    const label =
      role === "adviser"
        ? "research adviser"
        : role === "researchOffice"
          ? "Research Office representative"
          : role === "chair"
            ? "panel chair"
            : "panel members";
    const hasCurrentAssignment =
      role === "panelMembers"
        ? Boolean(projectTeam?.panel_members.length)
        : role === "researchOffice"
          ? Boolean(projectTeam?.research_office_representative)
          : role === "adviser"
            ? Boolean(projectTeam?.adviser)
            : Boolean(projectTeam?.chair);
    const hasDraftAssignment =
      role === "panelMembers"
        ? teamDraft.panel_member_ids.length > 0
        : role === "researchOffice"
          ? Boolean(teamDraft.research_office_representative_id)
          : role === "adviser"
            ? Boolean(teamDraft.adviser_id)
            : Boolean(teamDraft.chair_id);

    if (hasCurrentAssignment && !hasDraftAssignment) return `Remove ${label}`;
    return `${hasCurrentAssignment ? "Update" : "Assign"} ${label}`;
  }

  function projectTeamRoleChanged(
    role: "adviser" | "researchOffice" | "chair" | "panelMembers",
  ) {
    if (!projectTeam) return false;
    if (role === "panelMembers") {
      return (
        projectTeam.panel_members
          .map((member) => member.user_id)
          .sort()
          .join(",") !== [...teamDraft.panel_member_ids].sort().join(",")
      );
    }
    if (role === "researchOffice") {
      return (
        (projectTeam.research_office_representative?.user_id ?? "") !==
        teamDraft.research_office_representative_id
      );
    }
    return role === "adviser"
      ? (projectTeam.adviser?.user_id ?? "") !== teamDraft.adviser_id
      : (projectTeam.chair?.user_id ?? "") !== teamDraft.chair_id;
  }

  async function refreshProjectTeamCandidates(
    role: "adviser" | "researchOffice" | "chair" | "panelMembers",
  ) {
    if (!openSection || !selectedDocument) return;
    const teamRole =
      role === "researchOffice"
        ? "research_office_representative"
        : role === "panelMembers"
          ? "panel_member"
          : role;
    try {
      const candidates: ProjectTeamPerson[] =
        teamRole === "panel_member" || teamRole === "chair"
          ? (await listInstructorPanelists()).map((person) => ({
              user_id: person.id,
              name: person.name,
              email: person.email,
              team_role: teamRole,
            }))
          : await listInstructorProjectTeamCandidates(
              openSection.id,
              selectedDocument.research_document_id,
              teamRole,
            );
      setTeamCandidates((current) => ({
        ...current,
        [teamRole]: candidates,
      }));
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "Eligible project staff could not be refreshed"),
      );
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

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openSection) return;
    const title = newProjectTitle.trim();
    if (!title) return;
    setNewProjectBusy(true);
    setDetailsNotice("");
    try {
      await createSectionProject(openSection.id, title);
      await loadDocuments(openSection.id);
      setNewProjectTitle("");
      setAddProjectOpen(false);
      setDetailsNotice("Research project created.");
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The research project could not be created"),
      );
    } finally {
      setNewProjectBusy(false);
    }
  }

  async function saveProjectTitle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openSection || !selectedDocument) return;
    setEditProjectBusy(true);
    setDetailsNotice("");
    try {
      await updateSectionProjectTitle(
        openSection.id,
        selectedDocument.research_document_id,
        editProjectTitle.trim(),
      );
      await loadDocuments(openSection.id);
      setEditingProject(false);
      setDetailsNotice("Research title updated.");
      reload();
    } catch (error) {
      setDetailsNotice(
        friendlyError(error, "The research title could not be updated"),
      );
    } finally {
      setEditProjectBusy(false);
    }
  }

  async function removeProject() {
    if (!openSection || !selectedDocument) return;
    setDeleteProjectBusy(true);
    setDetailsNotice("");
    try {
      await deleteSectionProject(
        openSection.id,
        selectedDocument.research_document_id,
      );
      setConfirmProjectDelete(false);
      closeDocumentFolder();
      await loadDocuments(openSection.id);
      setDetailsNotice("Research project deleted.");
      reload();
    } catch (error) {
      setConfirmProjectDelete(false);
      setDetailsNotice(
        friendlyError(error, "The research project could not be deleted"),
      );
    } finally {
      setDeleteProjectBusy(false);
    }
  }

  async function toggleActive(section: InstructorSectionResource) {
    setDetailsNotice("");
    try {
      await updateInstructorSection(section.id, {
        is_active: !section.is_active,
      });
      setDetailsNotice(`Section "${section.name}" updated.`);
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
      await updateInstructorSection(openSection.id, {
        name: editName.trim(),
        section_code: editSectionCode.trim(),
        academic_year: editYear.trim() || null,
      });
      setEditing(false);
      setDetailsNotice(`Section "${editName.trim()}" updated.`);
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
      await addSectionMembers(sectionId, [userId]);
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
      await removeSectionMember(sectionId, userId);
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
      {!openSection && (
        <>
          <RolePageHeader
            role={role}
            title="My sections"
            description="Class sections you own and the research assigned to each."
            action={
              <span className="row-actions">
                <Button variant="secondary" onClick={reload}>
                  <RefreshCw /> Refresh
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> Add Section
                </Button>
              </span>
            }
          />
          {pageNotice && (
            <p
              role="status"
              className={
                pageNotice.includes("could not")
                  ? "admin-error"
                  : "admin-success"
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
            <section className="section-folder-grid" aria-label="Your sections">
              {state.data.map((section) => (
                <button
                  type="button"
                  className="section-folder-card"
                  key={section.id}
                  onClick={() => openSectionDetails(section)}
                  aria-label={`Open section ${section.name}`}
                >
                  <span className="folder-card-icon" aria-hidden="true">
                    <Folder />
                  </span>
                  <span className="folder-card-copy">
                    <strong>{section.name}</strong>
                    <small>
                      {section.section_code ?? "Section code not set"}
                    </small>
                    <small>
                      {section.academic_year ?? "Academic year not set"}
                    </small>
                    <span>
                      {section.documents_count} project
                      {section.documents_count === 1 ? "" : "s"} ·{" "}
                      {section.members_count} student
                      {section.members_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span
                    className={
                      section.is_active
                        ? "badge badge-active"
                        : "badge badge-inactive"
                    }
                  >
                    {section.is_active ? "Active" : "Inactive"}
                  </span>
                </button>
              ))}
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
        </>
      )}
      {openSection && !showingProjectPage && (
        <section
          className="section-page-view"
          aria-label={`Section details: ${openSection.name}`}
        >
          <div className="section-page-toolbar">
            <Button variant="quiet" onClick={closeSectionDetails}>
              Back to Sections
            </Button>
          </div>
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
                className="icon-button"
                aria-label={
                  openSection.is_active
                    ? "Deactivate section"
                    : "Activate section"
                }
                title={
                  openSection.is_active
                    ? "Deactivate section"
                    : "Activate section"
                }
                onClick={() => void toggleActive(openSection)}
              >
                <Power />
              </Button>
              <Button
                variant="secondary"
                className="icon-button"
                aria-label="Edit section"
                title="Edit section"
                onClick={() => {
                  setEditName(openSection.name);
                  setEditSectionCode(openSection.section_code ?? "");
                  setEditYear(openSection.academic_year ?? "");
                  setEditing(true);
                }}
              >
                <Pencil />
              </Button>
            </div>
            {editing && (
              <Modal
                label="Edit section"
                onClose={() => setEditing(false)}
                busy={editBusy}
              >
                <form
                  onSubmit={saveSection}
                  className="admin-inline-form section-edit-form section-dialog-form"
                >
                  <h2>Edit section</h2>
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
                    Section code
                    <input
                      value={editSectionCode}
                      onChange={(event) =>
                        setEditSectionCode(event.target.value)
                      }
                      required
                      maxLength={100}
                    />
                  </label>
                  <label className="section-dialog-year">
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
              </Modal>
            )}
            <section className="section-detail-block">
              <div className="section-block-heading">
                <div>
                  <p className="eyebrow">Research records</p>
                  <h3>Research projects</h3>
                </div>
                <span>{openSection.documents_count}</span>
              </div>
              <div className="section-block-actions">
                <Button
                  type="button"
                  variant="secondary"
                  className="icon-button"
                  aria-label="Add Research Project"
                  title="Add research project"
                  onClick={() => setAddProjectOpen(true)}
                >
                  <Plus />
                </Button>
              </div>
              {addProjectOpen && (
                <Modal
                  label="Create research project"
                  onClose={() => setAddProjectOpen(false)}
                  busy={newProjectBusy}
                >
                  <form
                    onSubmit={createProject}
                    className="admin-inline-form section-project-create"
                    aria-label="Create research project"
                  >
                    <h2>Add research project</h2>
                    <label>
                      Research title
                      <input
                        value={newProjectTitle}
                        onChange={(event) =>
                          setNewProjectTitle(event.target.value)
                        }
                        required
                        maxLength={500}
                        placeholder="Enter the research title"
                        disabled={newProjectBusy}
                      />
                    </label>
                    <div className="modal-actions">
                      <Button type="submit" disabled={newProjectBusy}>
                        {newProjectBusy ? "Creating…" : "Create project"}
                      </Button>
                    </div>
                  </form>
                </Modal>
              )}
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
                    Create a research project to add its folder to this section.
                  </p>
                </div>
              ) : (
                <div className="research-title-folders">
                  {(documentsFor[openSection.id] ?? []).map((document) => (
                    <button
                      type="button"
                      className="research-title-folder"
                      key={document.research_document_id}
                      onClick={() =>
                        navigate(
                          `/app/instructor/sections/${openSection.id}/projects/${document.research_document_id}`,
                        )
                      }
                      aria-label={`Open research project ${document.title}`}
                    >
                      <span
                        className="research-title-folder-icon"
                        aria-hidden="true"
                      >
                        <Folder />
                      </span>
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
                      <span className="research-title-folder-arrow">
                        <ExternalLink aria-hidden="true" />
                      </span>
                    </button>
                  ))}
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
              <div className="section-block-actions">
                <Button
                  type="button"
                  variant="secondary"
                  className="icon-button"
                  aria-label="Add student"
                  title="Add student"
                  onClick={() => setAddStudentOpen(true)}
                >
                  <UserPlus />
                </Button>
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
                              className="icon-button"
                              aria-label={`Remove ${studentName(member)}`}
                              title="Remove student"
                              disabled={studentBusy[openSection.id]}
                              onClick={() =>
                                setConfirmRemove({
                                  sectionId: openSection.id,
                                  member,
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {addStudentOpen && (
                <Modal
                  label="Add a student researcher"
                  onClose={() => setAddStudentOpen(false)}
                  busy={studentBusy[openSection.id]}
                >
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
                </Modal>
              )}
            </section>
          </div>
        </section>
      )}
      {openSection && selectedDocument && (
        <section
          className="section-page-view"
          aria-label={`Research project: ${selectedDocument.title}`}
        >
          <div className="section-page-toolbar">
            <Button
              type="button"
              variant="quiet"
              className="icon-button"
              aria-label="Back to Research Projects"
              title="Back to research projects"
              onClick={closeDocumentFolder}
            >
              <ArrowLeft />
            </Button>
          </div>
          <div className="title-member-panel project-page-panel">
            <div className="title-member-panel-heading">
              <div>
                <p className="eyebrow">Research project</p>
                <h3>{selectedDocument.title}</h3>
              </div>
              <div className="section-block-actions">
                <Button
                  type="button"
                  variant="secondary"
                  className="icon-button"
                  aria-label="Edit research title"
                  title="Edit research title"
                  onClick={() => {
                    setEditProjectTitle(selectedDocument.title);
                    setEditingProject(true);
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="icon-button"
                  aria-label="Delete research project"
                  title="Delete research project"
                  onClick={() => setConfirmProjectDelete(true)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {editingProject && (
              <Modal
                label="Edit research title"
                onClose={() => setEditingProject(false)}
                busy={editProjectBusy}
              >
                <form
                  onSubmit={saveProjectTitle}
                  className="admin-inline-form section-project-create"
                  aria-label="Edit research title"
                >
                  <h2>Edit research title</h2>
                  <label>
                    Research title
                    <input
                      value={editProjectTitle}
                      onChange={(event) =>
                        setEditProjectTitle(event.target.value)
                      }
                      required
                      maxLength={500}
                      disabled={editProjectBusy}
                    />
                  </label>
                  <div className="modal-actions">
                    <Button type="submit" disabled={editProjectBusy}>
                      {editProjectBusy ? "Saving…" : "Save title"}
                    </Button>
                  </div>
                </form>
              </Modal>
            )}
            <p className="project-page-meta">
              {label(selectedDocument.research_stage)} ·{" "}
              {label(selectedDocument.submission_status)}
            </p>
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
                      className="icon-button"
                      aria-label={`Remove ${studentName(member)}`}
                      title="Remove student"
                      disabled={studentBusy[openSection.id]}
                      onClick={() => setConfirmDocumentRemove(member)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {teamLoading ? (
              <p className="section-documents-loading">
                Loading current project assignments…
              </p>
            ) : (
              <dl className="project-assignment-summary">
                <div>
                  <dt>Research adviser</dt>
                  <dd>{projectTeam?.adviser?.name ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Research Office representative</dt>
                  <dd>
                    {projectTeam?.research_office_representative?.name ??
                      "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt>Panel chair</dt>
                  <dd>{projectTeam?.chair?.name ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Panel members</dt>
                  <dd>
                    {projectTeam?.panel_members
                      .map((member) => member.name)
                      .join(", ") || "Unassigned"}
                  </dd>
                </div>
              </dl>
            )}
            <div className="project-manage-action">
              <Button
                type="button"
                variant="secondary"
                className="icon-button"
                aria-label="Manage project assignments"
                title="Manage project assignments"
                onClick={() => {
                  resetProjectDisclosures();
                  setProjectManageOpen(true);
                  void openDocumentMembers(openSection.id, selectedDocument);
                }}
              >
                <UsersRound />
              </Button>
            </div>
            {projectManageOpen && (
              <Modal
                label="Manage project assignments"
                onClose={() => {
                  resetProjectDisclosures();
                  setProjectManageOpen(false);
                }}
                busy={teamBusy}
              >
                <div
                  className={`project-disclosures project-assignment-modal${projectAssignmentEditing ? " is-editing" : ""}`}
                  aria-label="Project assignments"
                >
                  <h2>Manage project assignments</h2>
                  <div className="project-assignment-control">
                    <span>
                      <strong>Student researchers</strong>
                      <small>Add students enrolled in this section.</small>
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="icon-button"
                      aria-label="Add students"
                      title="Add students"
                      aria-expanded={projectDisclosures.students}
                      aria-controls={
                        projectDisclosures.students
                          ? "project-students-editor"
                          : undefined
                      }
                      onClick={() =>
                        setProjectDisclosures({
                          students: !projectDisclosures.students,
                          adviser: false,
                          researchOffice: false,
                          chair: false,
                          panelMembers: false,
                        })
                      }
                    >
                      <UserPlus />
                    </Button>
                  </div>
                  {projectDisclosures.students && (
                    <div
                      id="project-students-editor"
                      className="title-member-picker"
                    >
                      <div className="project-editor-heading">
                        <p className="eyebrow">Project assignment</p>
                        <h3>Student researchers</h3>
                      </div>
                      <label>
                        Search students
                        <input
                          value={studentQueries[openSection.id] ?? ""}
                          onChange={(event) =>
                            changeStudentQuery(
                              openSection.id,
                              event.target.value,
                            )
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
                                {studentName(candidate)} ({candidate.email})
                              </span>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={studentBusy[openSection.id]}
                                onClick={() =>
                                  void addStudentToDocument(candidate.id)
                                }
                              >
                                Add
                              </Button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(
                    [
                      [
                        "adviser",
                        "Assign research adviser",
                        "Research adviser",
                        "adviser_id",
                      ],
                      [
                        "researchOffice",
                        "Assign Research Office representative",
                        "Research Office representative",
                        "research_office_representative_id",
                      ],
                      [
                        "chair",
                        "Assign panel chair",
                        "Panel chair",
                        "chair_id",
                      ],
                    ] as const
                  ).map(([disclosure, buttonLabel, fieldLabel, field]) => {
                    const candidateKey =
                      disclosure === "researchOffice"
                        ? "research_office_representative"
                        : disclosure;
                    const candidates = teamCandidates[candidateKey] ?? [];
                    const searchQuery = (teamSearches[disclosure] ?? "")
                      .trim()
                      .toLocaleLowerCase();
                    const matchingCandidates = candidates.filter(
                      (person) =>
                        searchQuery === "" ||
                        `${person.name} ${person.email}`
                          .toLocaleLowerCase()
                          .includes(searchQuery),
                    );

                    return (
                      <div key={disclosure}>
                        <div className="project-assignment-control">
                          <span>
                            <strong>{fieldLabel}</strong>
                            <small>
                              View or change the current assignment.
                            </small>
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            className="icon-button"
                            aria-label={buttonLabel}
                            title={buttonLabel}
                            aria-expanded={projectDisclosures[disclosure]}
                            aria-controls={
                              projectDisclosures[disclosure]
                                ? `project-${disclosure}-editor`
                                : undefined
                            }
                            onClick={() => {
                              const opening = !projectDisclosures[disclosure];
                              setProjectDisclosures({
                                students: false,
                                adviser: false,
                                researchOffice: false,
                                chair: false,
                                panelMembers: false,
                                [disclosure]: opening,
                              });
                              if (opening) {
                                void refreshProjectTeamCandidates(disclosure);
                              }
                            }}
                          >
                            {projectTeam?.[
                              disclosure === "researchOffice"
                                ? "research_office_representative"
                                : disclosure
                            ] ? (
                              <Pencil />
                            ) : (
                              <Plus />
                            )}
                          </Button>
                        </div>
                        {projectDisclosures[disclosure] && (
                          <div
                            id={`project-${disclosure}-editor`}
                            className="project-role-editor"
                          >
                            <div className="project-editor-heading">
                              <p className="eyebrow">Project assignment</p>
                              <h3>{fieldLabel}</h3>
                            </div>
                            <p>
                              <strong>Current:</strong>{" "}
                              {projectTeam?.[
                                disclosure === "researchOffice"
                                  ? "research_office_representative"
                                  : disclosure
                              ]?.name ?? "Unassigned"}
                            </p>
                            <label>
                              Search and select {fieldLabel.toLowerCase()}
                              <input
                                type="search"
                                value={teamSearches[disclosure] ?? ""}
                                placeholder="Search by name or email"
                                autoComplete="off"
                                onChange={(event) =>
                                  setTeamSearches((current) => ({
                                    ...current,
                                    [disclosure]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <fieldset>
                              <legend>{fieldLabel}</legend>
                              {teamLoading ? (
                                <p
                                  className="project-assignment-empty"
                                  role="status"
                                >
                                  Loading eligible accounts…
                                </p>
                              ) : candidates.length === 0 ? (
                                <p className="project-assignment-empty">
                                  No eligible {fieldLabel.toLowerCase()} account
                                  is available. Ask the Coordinator or
                                  Administrator to activate the required account
                                  first.
                                </p>
                              ) : matchingCandidates.length === 0 ? (
                                <p
                                  className="project-assignment-empty"
                                  role="status"
                                >
                                  No accounts match “
                                  {teamSearches[disclosure]?.trim()}”.
                                </p>
                              ) : (
                                <ProjectAccountOptions
                                  candidates={matchingCandidates}
                                  selectedIds={
                                    teamDraft[field] ? [teamDraft[field]] : []
                                  }
                                  mode="single"
                                  groupName={`project-${disclosure}-selection`}
                                  onClear={() =>
                                    setTeamDraft((current) => ({
                                      ...current,
                                      [field]: "",
                                    }))
                                  }
                                  disabledIds={
                                    disclosure === "chair"
                                      ? teamDraft.panel_member_ids
                                      : []
                                  }
                                  disabledLabel={
                                    disclosure === "chair"
                                      ? "Panel member"
                                      : undefined
                                  }
                                  onToggle={(person, selected) =>
                                    setTeamDraft((current) => ({
                                      ...current,
                                      [field]: selected ? person.user_id : "",
                                    }))
                                  }
                                />
                              )}
                            </fieldset>
                            <div className="project-role-actions">
                              <span>
                                {teamDraft[field]
                                  ? "1 account selected"
                                  : "No account selected"}
                              </span>
                              <Button
                                type="button"
                                disabled={
                                  teamBusy ||
                                  teamLoading ||
                                  !projectTeamRoleChanged(disclosure)
                                }
                                onClick={() =>
                                  requestProjectTeamSave(disclosure)
                                }
                              >
                                {teamBusy
                                  ? "Saving…"
                                  : projectTeamRoleAction(disclosure)}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div>
                    <div className="project-assignment-control">
                      <span>
                        <strong>Panel members</strong>
                        <small>Select the project evaluation panel.</small>
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="icon-button"
                        aria-label="Assign panel members"
                        title="Assign panel members"
                        aria-expanded={projectDisclosures.panelMembers}
                        aria-controls={
                          projectDisclosures.panelMembers
                            ? "project-panel-members-editor"
                            : undefined
                        }
                        onClick={() => {
                          const opening = !projectDisclosures.panelMembers;
                          setProjectDisclosures({
                            students: false,
                            adviser: false,
                            researchOffice: false,
                            chair: false,
                            panelMembers: opening,
                          });
                          if (opening) {
                            void refreshProjectTeamCandidates("panelMembers");
                          }
                        }}
                      >
                        {projectTeam?.panel_members.length ? (
                          <Pencil />
                        ) : (
                          <Plus />
                        )}
                      </Button>
                    </div>
                    {projectDisclosures.panelMembers && (
                      <div
                        id="project-panel-members-editor"
                        className="project-role-editor"
                      >
                        <div className="project-editor-heading">
                          <p className="eyebrow">Project assignment</p>
                          <h3>Panel members</h3>
                        </div>
                        <p>
                          <strong>Current:</strong>{" "}
                          {projectTeam?.panel_members
                            .map((member) => member.name)
                            .join(", ") || "None"}
                        </p>
                        <label>
                          Search and select panel members
                          <input
                            type="search"
                            value={teamSearches.panelMembers ?? ""}
                            placeholder="Search by name or email"
                            onChange={(event) =>
                              setTeamSearches((current) => ({
                                ...current,
                                panelMembers: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <fieldset>
                          <legend>Panel members</legend>
                          {teamLoading ? (
                            <p
                              className="project-assignment-empty"
                              role="status"
                            >
                              Loading eligible panel members…
                            </p>
                          ) : (teamCandidates.panel_member ?? []).length ===
                            0 ? (
                            <p className="project-assignment-empty">
                              No eligible panel accounts are available. Ask the
                              Coordinator or Administrator to activate a Panel
                              account first.
                            </p>
                          ) : matchingPanelCandidates.length === 0 ? (
                            <p
                              className="project-assignment-empty"
                              role="status"
                            >
                              No panel accounts match “
                              {teamSearches.panelMembers?.trim()}”.
                            </p>
                          ) : (
                            <ProjectAccountOptions
                              candidates={matchingPanelCandidates}
                              selectedIds={teamDraft.panel_member_ids}
                              disabledIds={
                                teamDraft.chair_id ? [teamDraft.chair_id] : []
                              }
                              disabledLabel="Panel chair"
                              onToggle={(person, selected) =>
                                setTeamDraft((current) => ({
                                  ...current,
                                  panel_member_ids: selected
                                    ? [
                                        ...current.panel_member_ids,
                                        person.user_id,
                                      ]
                                    : current.panel_member_ids.filter(
                                        (id) => id !== person.user_id,
                                      ),
                                }))
                              }
                            />
                          )}
                        </fieldset>
                        <div className="project-role-actions">
                          <span>
                            {teamDraft.panel_member_ids.length} selected
                          </span>
                          <Button
                            type="button"
                            disabled={
                              teamBusy ||
                              teamLoading ||
                              !projectTeamRoleChanged("panelMembers")
                            }
                            onClick={() =>
                              requestProjectTeamSave("panelMembers")
                            }
                          >
                            {teamBusy
                              ? "Saving…"
                              : projectTeamRoleAction("panelMembers")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Modal>
            )}
          </div>
        </section>
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
      {confirmDocumentRemove && openSection && selectedDocument && (
        <ConfirmDialog
          title="Remove project student"
          message={`Remove ${studentName(confirmDocumentRemove)} from "${selectedDocument.title}"?`}
          confirmLabel="Remove student"
          busy={studentBusy[openSection.id]}
          onConfirm={() => {
            const member = confirmDocumentRemove;
            setConfirmDocumentRemove(null);
            void removeStudentFromDocument(member.id);
          }}
          onCancel={() => setConfirmDocumentRemove(null)}
        />
      )}
      {confirmTeamSave && (
        <ConfirmDialog
          title="Confirm assignment change"
          message={`${projectTeamRoleAction(confirmTeamSave)} for this project?`}
          confirmLabel={projectTeamRoleAction(confirmTeamSave)}
          busy={teamBusy}
          onConfirm={() => {
            const target = confirmTeamSave;
            setConfirmTeamSave(null);
            void saveProjectTeamRole(target);
          }}
          onCancel={() => setConfirmTeamSave(null)}
        />
      )}
      {confirmProjectDelete && selectedDocument && (
        <ConfirmDialog
          title="Delete research project"
          message={`Delete "${selectedDocument.title}"? Assigned students will remain in the section roster.`}
          confirmLabel="Delete project"
          busy={deleteProjectBusy}
          onConfirm={() => void removeProject()}
          onCancel={() => setConfirmProjectDelete(false)}
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
  const requests = useLoad(() => listSupportAssignmentInbox(), attempt);
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

  async function save(
    mode: "checklist" | "signoff" | "return" | "not_applicable",
  ) {
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
      } else if (mode === "return") {
        await returnMethodologyForClarification(
          selection.research_document_id,
          remarks.trim(),
        );
      } else
        await markStatisticalReviewNotApplicable(
          selection.research_document_id,
        );
      setNotice(
        mode === "checklist"
          ? "Checklist saved."
          : mode === "signoff"
            ? "Methodology signed off."
            : mode === "return"
              ? "Returned for clarification."
              : "Not Applicable – Statistical review not required.",
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
      {requests.status === "ready" && requests.data.length > 0 && (
        <section className="panel-card admin-data-card">
          <h2>Pending support requests</h2>
          {requests.data.map((request) => (
            <div className="admin-card-heading" key={request.id}>
              <div>
                <strong>{request.research_title}</strong>
                <p>
                  {request.researchers.join(", ") || "Researcher"} · Statistical
                  review requested
                </p>
              </div>
              <div className="row-actions">
                <Button
                  onClick={() =>
                    void respondToSupportAssignment(request.id, "accept").then(
                      reload,
                    )
                  }
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void respondToSupportAssignment(request.id, "decline").then(
                      reload,
                    )
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
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
                  onClick={() => void save("not_applicable")}
                  disabled={busy !== ""}
                >
                  Mark Not Applicable
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

function EditorDashboard({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const [selectedSection, setSelectedSection] = useState<
    "requests" | "assigned" | null
  >(null);
  const requests = useLoad(() => listSupportAssignmentInbox(), attempt);
  const assigned = useLoad(() => listEditorAssignedResearch(), attempt);
  async function respond(id: number, decision: "accept" | "decline") {
    await respondToSupportAssignment(id, decision);
    reload();
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Editor dashboard"
        description="Pending requests and accepted editorial assignments."
      />
      <div className="score-grid">
        <button
          type="button"
          className="panel-card admin-stat admin-stat-button"
          onClick={() => setSelectedSection("requests")}
          aria-label="View pending requests"
        >
          <strong>
            {requests.status === "ready" ? requests.data.length : 0}
          </strong>
          <span>Pending requests</span>
        </button>
        <button
          type="button"
          className="panel-card admin-stat admin-stat-button"
          onClick={() => setSelectedSection("assigned")}
          aria-label="View assigned research"
        >
          <strong>
            {assigned.status === "ready" ? assigned.data.length : 0}
          </strong>
          <span>Assigned research</span>
        </button>
      </div>
      {selectedSection !== null && (
        <Modal
          label={
            selectedSection === "requests"
              ? "Pending requests"
              : "Assigned research"
          }
          onClose={() => setSelectedSection(null)}
          size="large"
        >
          <section className="panel-card admin-data-card">
            <h2>
              {selectedSection === "requests"
                ? "Pending requests"
                : "Assigned research"}
            </h2>
            {selectedSection === "requests" ? (
              requests.status === "loading" ? (
                <Loading label="Loading Editor requests" />
              ) : requests.status === "error" ? (
                <InlineError message={requests.message} retry={reload} />
              ) : requests.data.length === 0 ? (
                <p className="admin-empty">No pending Editor requests.</p>
              ) : (
                requests.data.map((item) => (
                  <div className="admin-card-heading" key={item.id}>
                    <div>
                      <strong>{item.research_title}</strong>
                      <p>
                        {item.researchers.join(", ") || "Researcher"} ·{" "}
                        {displayDate(item.created_at)}
                      </p>
                    </div>
                    <div className="row-actions">
                      <Button onClick={() => void respond(item.id, "accept")}>
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void respond(item.id, "decline")}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))
              )
            ) : assigned.status === "loading" ? (
              <Loading label="Loading assigned research" />
            ) : assigned.status === "error" ? (
              <InlineError message={assigned.message} retry={reload} />
            ) : assigned.data.length === 0 ? (
              <p className="admin-empty">No accepted Editor assignments.</p>
            ) : (
              assigned.data.map((item) => (
                <div
                  className="admin-card-heading"
                  key={item.research_document_id}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.submission_status.replaceAll("_", " ")}</p>
                  </div>
                </div>
              ))
            )}
          </section>
        </Modal>
      )}
    </div>
  );
}

function EditorReview({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listEditorAssignedResearch(), attempt);
  const [id, setId] = useState(0);
  const [type, setType] = useState<
    "comment" | "revision_request" | "clearance"
  >("comment");
  const [remarks, setRemarks] = useState("");
  const [required, setRequired] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await saveEditorReview(id, {
      review_type: type,
      remarks,
      required_action: required || null,
    });
    setRemarks("");
    setRequired("");
    reload();
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Editorial review"
        description="Review grammar, spelling, language, clarity, organization, formatting, and citation presentation."
      />
      {state.status === "loading" ? (
        <Loading label="Loading assigned research" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No accepted Editor assignments.</p>
      ) : (
        <>
          <section className="panel-card admin-data-card">
            <div className="admin-table-wrap">
              <table>
                <tbody>
                  {state.data.map((item) => (
                    <tr key={item.research_document_id}>
                      <td>{item.title}</td>
                      <td>{item.researchers.join(", ")}</td>
                      <td>{item.latest_manuscript ?? "No manuscript"}</td>
                      <td>
                        <Button
                          onClick={() => setId(item.research_document_id)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {id > 0 && (
            <section className="panel-card">
              <form className="admin-inline-form" onSubmit={save}>
                <label>
                  Action
                  <select
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as typeof type)
                    }
                  >
                    <option value="comment">Editor comment</option>
                    <option value="revision_request">
                      Request corrections
                    </option>
                    <option value="clearance">
                      Editorial Review Completed
                    </option>
                  </select>
                </label>
                <label>
                  Editor remarks
                  <textarea
                    required
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                  />
                </label>
                {type === "revision_request" && (
                  <label>
                    Required corrections
                    <textarea
                      required
                      value={required}
                      onChange={(event) => setRequired(event.target.value)}
                    />
                  </label>
                )}
                <Button>Save editorial review</Button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function EditorMonitoring({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const records = useLoad(() => listEditorMonitoring(), attempt);
  const assigned = useLoad(() => listEditorAssignedResearch(), attempt);
  const [id, setId] = useState(0);
  const [stage, setStage] = useState<
    InstructorMonitoringEntry["monitoring_stage"]
  >("before_proposal_defense");
  const [activity, setActivity] = useState("");
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Monitoring"
        description="Record and sign Editor activity before or after proposal defense."
      />
      {assigned.status === "ready" && assigned.data.length > 0 && (
        <section className="panel-card">
          <form
            className="admin-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditorMonitoring(id, {
                monitoring_stage: stage,
                activity_date: new Date().toISOString().slice(0, 10),
                activity,
                status: "completed",
                signature_status: "signed",
              }).then(reload);
            }}
          >
            <label>
              Research
              <select
                required
                value={id || ""}
                onChange={(event) => setId(Number(event.target.value))}
              >
                <option value="">Select</option>
                {assigned.data.map((item) => (
                  <option
                    key={item.research_document_id}
                    value={item.research_document_id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stage
              <select
                value={stage}
                onChange={(event) =>
                  setStage(event.target.value as typeof stage)
                }
              >
                <option value="before_proposal_defense">Pre-Defense</option>
                <option value="after_proposal_defense">Post-Defense</option>
              </select>
            </label>
            <label>
              Activity
              <textarea
                required
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
              />
            </label>
            <Button>Save and sign my entry</Button>
          </form>
        </section>
      )}
      {records.status === "loading" ? (
        <Loading label="Loading monitoring" />
      ) : records.status === "error" ? (
        <InlineError message={records.message} retry={reload} />
      ) : records.data.length === 0 ? (
        <p className="admin-empty">No Editor monitoring entries.</p>
      ) : (
        <section className="panel-card admin-data-card">
          {records.data.map((item) => (
            <p key={item.id}>
              {item.title} · {label(item.monitoring_stage)} · {item.activity}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
function EditorHistory({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listEditorHistory(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Review history"
        description="Previous editorial comments, corrections, and completed reviews."
      />
      {state.status === "loading" ? (
        <Loading label="Loading history" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No editorial review history.</p>
      ) : (
        <section className="panel-card admin-data-card">
          {state.data.map((item) => (
            <p key={item.id}>
              {item.title} · {label(item.review_type)} · {item.remarks}{" "}
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(`/research/${item.research_document_id}`)
                }
              >
                Open
              </Button>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function LibrarianAssignmentRequests({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listSupportAssignmentInbox(), attempt);
  const [notice, setNotice] = useState("");
  async function respond(id: number, decision: "accept" | "decline") {
    try {
      await respondToSupportAssignment(id, decision);
      setNotice(`Request ${decision === "accept" ? "accepted" : "declined"}.`);
      reload();
    } catch (error) {
      setNotice(friendlyError(error, "The request could not be updated"));
    }
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Assignment requests"
        description="Librarian reference-review requests sent by researchers."
      />
      {notice && <p role="status">{notice}</p>}
      {state.status === "loading" ? (
        <Loading label="Loading requests" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No pending Librarian assignment requests.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Research</th>
                  <th>Researchers</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.research_title}</td>
                    <td>{item.researchers.join(", ") || "—"}</td>
                    <td>{displayDate(item.created_at)}</td>
                    <td>
                      <Button onClick={() => void respond(item.id, "accept")}>
                        Accept
                      </Button>{" "}
                      <Button
                        variant="secondary"
                        onClick={() => void respond(item.id, "decline")}
                      >
                        Decline
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

function LibrarianReferenceReview({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listLibrarianAssignedResearch(), attempt);
  const [selected, setSelected] = useState(0);
  const [type, setType] = useState<
    "comment" | "revision_request" | "clearance"
  >("comment");
  const [remarks, setRemarks] = useState("");
  const [required, setRequired] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !remarks.trim()) return;
    try {
      await saveLibrarianReferenceReview(selected, {
        review_type: type,
        remarks: remarks.trim(),
        required_action: required.trim() || null,
      });
      setNotice(
        type === "clearance"
          ? "Reference Review Cleared."
          : "Reference review saved.",
      );
      setRemarks("");
      setRequired("");
      reload();
    } catch (error) {
      setNotice(friendlyError(error, "Reference review could not be saved"));
    }
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Reference review"
        description="Review citations, references, formatting, spacing, indentation, links, URLs, DOIs, and hyperlinks using the citation style selected by the researchers."
      />
      {notice && <p role="status">{notice}</p>}
      {state.status === "loading" ? (
        <Loading label="Loading assigned research" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">
          No accepted Librarian assignments are available.
        </p>
      ) : (
        <>
          <section className="panel-card admin-data-card">
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Research</th>
                    <th>Researchers</th>
                    <th>Program</th>
                    <th>Stage</th>
                    <th>Latest manuscript</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.map((item) => (
                    <tr key={item.research_document_id}>
                      <td>{item.title}</td>
                      <td>{item.researchers.join(", ")}</td>
                      <td>{item.program ?? "—"}</td>
                      <td>{label(item.research_stage)}</td>
                      <td>{item.latest_manuscript ?? "No manuscript"}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => setSelected(item.research_document_id)}
                        >
                          Review references
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {selected > 0 && (
            <section className="panel-card">
              <form className="admin-inline-form" onSubmit={save}>
                <label>
                  Review action
                  <select
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as typeof type)
                    }
                  >
                    <option value="comment">Reference comment</option>
                    <option value="revision_request">
                      Request corrections
                    </option>
                    <option value="clearance">
                      Reference Review Clearance
                    </option>
                  </select>
                </label>
                <label>
                  Librarian comments
                  <textarea
                    required
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="Record citation style, missing references, URL/DOI, spacing, indentation, or hyperlink findings."
                  />
                </label>
                {type === "revision_request" && (
                  <label>
                    Required corrections
                    <textarea
                      required
                      value={required}
                      onChange={(event) => setRequired(event.target.value)}
                    />
                  </label>
                )}
                <Button>Save reference review</Button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function LibrarianMonitoring({ role }: { role: Role }) {
  const [attempt, reload] = useAttempt();
  const entries = useLoad(() => listLibrarianMonitoring(), attempt);
  const assigned = useLoad(() => listLibrarianAssignedResearch(), attempt);
  const [id, setId] = useState(0);
  const [stage, setStage] = useState<
    InstructorMonitoringEntry["monitoring_stage"]
  >("before_proposal_defense");
  const [activity, setActivity] = useState("");
  const [remarks, setRemarks] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await saveLibrarianMonitoring(id, {
      monitoring_stage: stage,
      activity_date: new Date().toISOString().slice(0, 10),
      activity,
      remarks: remarks || null,
      status: "completed",
      signature_status: "signed",
    });
    setActivity("");
    setRemarks("");
    reload();
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Monitoring"
        description="Record and sign your Pre-Defense and Post-Defense reference-review activity."
      />
      {assigned.status === "ready" && assigned.data.length > 0 && (
        <section className="panel-card">
          <form className="admin-inline-form" onSubmit={save}>
            <label>
              Research
              <select
                required
                value={id || ""}
                onChange={(event) => setId(Number(event.target.value))}
              >
                <option value="">Select research</option>
                {assigned.data.map((item) => (
                  <option
                    value={item.research_document_id}
                    key={item.research_document_id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stage
              <select
                value={stage}
                onChange={(event) =>
                  setStage(event.target.value as typeof stage)
                }
              >
                <option value="before_proposal_defense">Pre-Defense</option>
                <option value="after_proposal_defense">Post-Defense</option>
              </select>
            </label>
            <label>
              Activity
              <textarea
                required
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
              />
            </label>
            <label>
              Remarks
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </label>
            <Button>Save and sign my entry</Button>
          </form>
        </section>
      )}
      {entries.status === "loading" ? (
        <Loading label="Loading monitoring" />
      ) : entries.status === "error" ? (
        <InlineError message={entries.message} retry={reload} />
      ) : entries.data.length === 0 ? (
        <p className="admin-empty">No Librarian monitoring records.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <tbody>
                {entries.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.title}</td>
                    <td>{label(entry.monitoring_stage)}</td>
                    <td>{entry.activity}</td>
                    <td>{label(entry.signature_status)}</td>
                    <td>
                      {entry.verified_at
                        ? displayDate(entry.verified_at)
                        : "Pending Instructor verification"}
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

function LibrarianReviewHistory({
  role,
  navigate,
}: {
  role: Role;
  navigate: (path: string) => void;
}) {
  const [attempt, reload] = useAttempt();
  const state = useLoad(() => listLibrarianReviewHistory(), attempt);
  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="Review history"
        description="Previous Librarian comments, correction requests, and reference clearances."
      />
      {state.status === "loading" ? (
        <Loading label="Loading history" />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={reload} />
      ) : state.data.length === 0 ? (
        <p className="admin-empty">No Librarian review history.</p>
      ) : (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <tbody>
                {state.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{label(item.review_type)}</td>
                    <td>{item.remarks}</td>
                    <td>{item.required_action ?? "—"}</td>
                    <td>{label(item.status)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/research/${item.research_document_id}`)
                        }
                      >
                        Open research
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
  const [editingUser, setEditingUser] = useState<OfficeUserRow | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, reload] = useAttempt();

  function changeFilter(name: keyof typeof query, value: string) {
    setPage(1);
    setLoading(true);
    setError("");
    setQuery((current) => ({ ...current, [name]: value }));
  }

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
      setEditingUser(null);
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

  const visibleUsers = filterUserRows(
    result?.data ?? [],
    query,
    officeUserName,
  );

  return (
    <div className="workspace-content admin-sidebar-page">
      <RolePageHeader
        role={role}
        title="User & role management"
        description="Review account access across the program. Roles are assigned by coordinators."
      />
      <section className="panel-card admin-data-card">
        <div className="admin-card-heading">
          <div>
            <h2>Users</h2>
            <p>Search users and update their account access.</p>
          </div>
          <div className="row-actions">
            <Button
              variant="secondary"
              onClick={reload}
              aria-label="Refresh users"
              title="Refresh users"
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="admin-filters">
          <label>
            Search
            <input
              type="search"
              value={query.search}
              onChange={(event) => changeFilter("search", event.target.value)}
              placeholder="Name or email"
            />
          </label>
          <label>
            Role
            <select
              value={query.role}
              onChange={(event) => changeFilter("role", event.target.value)}
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
              value={query.access_status}
              onChange={(event) =>
                changeFilter("access_status", event.target.value)
              }
            >
              <option value="">All statuses</option>
              {accessStatuses.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        ) : visibleUsers.length === 0 ? (
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{officeUserName(user) || "—"}</td>
                      <td>{user.email}</td>
                      <td>{label(user.role)}</td>
                      <td>{label(user.access_status)}</td>
                      <td>{displayDate(user.created_at)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          className="icon-button"
                          aria-label={`Edit ${user.email}`}
                          title="Edit user"
                          onClick={() => {
                            setDrafts((current) => ({
                              ...current,
                              [user.id]: user.access_status,
                            }));
                            setEditingUser(user);
                          }}
                          disabled={saving === user.id}
                        >
                          <Pencil />
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
      {editingUser && (
        <Modal
          label={`Edit ${editingUser.email}`}
          onClose={() => setEditingUser(null)}
          busy={saving === editingUser.id}
        >
          <form
            className="admin-user-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(editingUser);
            }}
          >
            <header className="admin-user-edit-header">
              <p className="eyebrow">User management</p>
              <h2>Edit user</h2>
              <p>{editingUser.email}</p>
            </header>
            <label>
              Access status
              <select
                value={drafts[editingUser.id] ?? editingUser.access_status}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [editingUser.id]: event.target.value as AccessStatus,
                  }))
                }
              >
                {accessStatuses.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions admin-user-edit-actions">
              <Button type="submit" disabled={saving === editingUser.id}>
                {saving === editingUser.id ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
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
            {state.data.by_institute.length === 0 ? (
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
                    {state.data.by_institute.map((unit) => (
                      <tr key={unit.institute}>
                        <td>{unit.institute}</td>
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
  const [source, setSource] = useState<"live" | "mock">("live");
  const [attempt, reload] = useAttempt();

  function beginLoad() {
    setLoading(true);
    setCreating(false);
    setEditing(null);
    setActivityFor(null);
  }

  function refresh() {
    beginLoad();
    reload();
  }

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
        setResult(requireResearcherPage(response));
        setSource("live");
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Your submissions are unavailable"),
        );
        setCreating(false);
        setEditing(null);
        setActivityFor(null);
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
      refresh();
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
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              onClick={() => {
                setCreateDirty(false);
                setCreating(true);
              }}
              disabled={loading || source === "mock"}
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
      {source === "mock" && (
        <section className="researcher-demo-notice" role="status">
          <div>
            <strong>Demo data - read only</strong>
            <span>
              Your live submissions could not be loaded. Editing, submission,
              files, feedback actions, and record links are unavailable.
            </span>
          </div>
          <Button variant="secondary" onClick={refresh}>
            Retry live data
          </Button>
        </section>
      )}
      <div className="admin-filters">
        <label>
          Research status
          <select
            aria-label="Research status"
            value={statusFilter}
            onChange={(event) => {
              beginLoad();
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
        <InlineError message={error} retry={refresh} />
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
            disabled={source === "mock"}
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
                        {source === "live" && !loading && (
                          <button
                            className="icon-button"
                            aria-label="Feedback & activity"
                            title="Feedback & activity"
                            onClick={() => setActivityFor(document)}
                          >
                            <MessageSquareText size={17} aria-hidden="true" />
                          </button>
                        )}
                        {source === "live" && !loading && (
                          <button
                            className="icon-button"
                            aria-label="Open record"
                            title="Open record"
                            onClick={() => navigate(`/research/${document.id}`)}
                          >
                            <ExternalLink size={17} aria-hidden="true" />
                          </button>
                        )}
                        {source === "live" &&
                          !loading &&
                          ["draft", "revision_required"].includes(
                            document.submission_status,
                          ) && (
                            <>
                              <button
                                className="icon-button"
                                aria-label="Edit"
                                title="Edit"
                                onClick={() => {
                                  setEditDirty(false);
                                  setEditing(document);
                                }}
                                disabled={submitting === String(document.id)}
                              >
                                <Pencil size={17} aria-hidden="true" />
                              </button>
                              {document.submission_status === "draft" && (
                                <button
                                  className="icon-button"
                                  aria-label={
                                    submitting === String(document.id)
                                      ? "Submitting…"
                                      : "Submit"
                                  }
                                  title="Submit"
                                  onClick={() => void submit(document)}
                                  disabled={submitting === String(document.id)}
                                >
                                  <Send size={17} aria-hidden="true" />
                                </button>
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
              beginLoad();
              setPage(nextPage);
            }}
          />
        </section>
      )}
      {activityFor && source === "live" && !loading && (
        <Modal
          label={`Feedback and activity for ${activityFor.title}`}
          onClose={() => setActivityFor(null)}
          size="large"
        >
          <ResearchActivity
            researchDocumentId={activityFor.id}
            title={activityFor.title}
            researcherActions
          />
        </Modal>
      )}
      {creating && source === "live" && !loading && (
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
              if (page === 1) refresh();
              else {
                beginLoad();
                setPage(1);
              }
            }}
          />
        </Modal>
      )}
      {editing && source === "live" && !loading && (
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
              refresh();
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
const submissionFileExtensions = new Set(["pdf", "docx"]);
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
  const [institute, setInstitute] = useState(draft?.institute ?? "");
  const [degreeProgram, setDegreeProgram] = useState(
    draft?.degree_program ?? "",
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
    institute: draft?.institute ?? "",
    degreeProgram: draft?.degree_program ?? "",
    authors: initialAuthors,
  });
  const currentSnapshot = JSON.stringify({
    title,
    abstract,
    keywords,
    publicationYear,
    researchStage,
    institute,
    degreeProgram,
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
    setInstitute("");
    setDegreeProgram("");
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
      return "The manuscript must be a PDF or DOCX file.";
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
    const validInstitute = instituteNames.find((name) => name === institute);
    const validProgram = validInstitute
      ? programsByInstitute[validInstitute].includes(degreeProgram)
      : false;
    if (submitAfterSave && (!validInstitute || !validProgram)) {
      setError(
        "Choose a valid institute and program before submitting for review.",
      );
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
        institute: validInstitute ?? null,
        degree_program: validProgram ? degreeProgram : null,
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
              Institute
              <input
                list="submission-institutes"
                value={institute}
                placeholder="Search institutes"
                onChange={(event) => {
                  setInstitute(event.target.value);
                  setDegreeProgram("");
                }}
              />
              <datalist id="submission-institutes">
                {instituteNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label>
              Program
              <input
                list="submission-programs"
                value={degreeProgram}
                placeholder={
                  institute ? "Search programs" : "Choose an institute first"
                }
                disabled={
                  !instituteNames.includes(
                    institute as (typeof instituteNames)[number],
                  )
                }
                onChange={(event) => setDegreeProgram(event.target.value)}
              />
              <datalist id="submission-programs">
                {(
                  programsByInstitute[
                    institute as keyof typeof programsByInstitute
                  ] ?? []
                ).map((program) => (
                  <option key={program} value={program} />
                ))}
              </datalist>
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
                PDF or DOCX (maximum 25 MB)
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              onClick={() =>
                dirty
                  ? setConfirmCancel(true)
                  : onCancel
                    ? onCancel()
                    : resetForm()
              }
              disabled={saving}
            >
              {onCancel ? "Cancel" : "Reset"}
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
function ResearcherSimilarityCheck({
  role,
  initialMode = "title",
}: {
  role: Role;
  initialMode?: "title" | "content";
}) {
  const mode = initialMode;
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ready"; matches: ResearchRecord[] }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [metadataResearchId, setMetadataResearchId] = useState<
    string | number | null
  >(null);

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
    const request =
      mode === "title"
        ? checkTitleQuerySimilarity(trimmed)
        : checkContentQuerySimilarity(trimmed);
    void request
      .then((matches) => setState({ status: "ready", matches }))
      .catch((requestError: unknown) =>
        setState({
          status: "error",
          message: similarityQueryError(requestError),
        }),
      );
  }

  const scored =
    state.status === "ready"
      ? state.matches.filter((match) => {
          const percentage =
            mode === "title"
              ? match.titleSimilarityPercentage
              : match.contentSimilarityPercentage;
          return percentage === null || Number(percentage) > 0;
        })
      : [];
  const reviewRequired = scored.filter(
    (match) => match.adviserReviewRequired === true,
  );
  const hasLowResult = scored.some((match) => match.classification === "low");

  return (
    <div className="workspace-content admin-sidebar-page similarity-check-page">
      <RolePageHeader
        role={role}
        title={mode === "title" ? "Title checker" : "Content checker"}
        description={
          mode === "title"
            ? "Compare a proposed title or keywords only with archived research titles."
            : "Search your keywords only against cached archived manuscript content."
        }
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
            {mode === "title"
              ? "Proposed title or keywords"
              : "Content keywords"}
            <input
              id="similarity-query"
              type="search"
              value={draft}
              maxLength={MAX_SIMILARITY_QUERY_LENGTH}
              placeholder={
                mode === "title"
                  ? "e.g. web-based inventory management system for small business"
                  : "e.g. machine learning student performance prediction"
              }
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
                : mode === "title"
                  ? "Check Title"
                  : "Check content"}
            </Button>
          </div>
        </form>
        {tooShort && (
          <p className="admin-empty">Enter at least two characters to check.</p>
        )}
      </section>

      {state.status === "checking" ? (
        <Loading
          label={
            mode === "title"
              ? "Comparing title with the repository"
              : "Comparing manuscript content with the repository"
          }
        />
      ) : state.status === "error" ? (
        <InlineError message={state.message} retry={runCheck} />
      ) : state.status === "ready" ? (
        <section className="panel-card admin-data-card">
          <div className="admin-card-heading">
            <div>
              <h2>
                {mode === "title"
                  ? `Title results for “${submitted}”`
                  : `Content results for “${submitted}”`}
              </h2>
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
              <div
                className="checker-legend"
                aria-label="Similarity classification legend"
              >
                <span>
                  <strong>Low</strong> Below 40%
                </span>
                <span>
                  <strong>Moderate</strong> 40% to 69.99%
                </span>
                <span>
                  <strong>High</strong> 70% and above
                </span>
              </div>
              <div
                className={`admin-table-wrap checker-results-scroll${mode === "content" && scored.length > 6 ? " is-scrollable" : ""}`}
              >
                <table>
                  <caption className="sr-only">
                    Archived studies ranked by similarity to your keywords
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Archived title</th>
                      <th scope="col">Year</th>
                      <th scope="col">Shared terms</th>
                      <th scope="col">Similarity</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scored.map((match) => {
                      const overall = formatSimilarityPercentage(
                        mode === "title"
                          ? match.titleSimilarityPercentage
                          : match.contentSimilarityPercentage,
                      );
                      const classification = classificationLabel(
                        match.classification,
                      );
                      const content = formatSimilarityPercentage(
                        match.contentSimilarityPercentage,
                      );
                      const contentUnavailable =
                        match.scoreStatus === "content_unavailable" || !content;
                      return (
                        <tr key={match.id}>
                          <td className="serif-cell checker-title-cell">
                            {match.title}
                          </td>
                          <td className="checker-year-cell">{match.year}</td>
                          <td className="checker-terms-cell">
                            {match.matchedTerms && match.matchedTerms.length > 0
                              ? match.matchedTerms.map((term) => (
                                  <span className="checker-term" key={term}>
                                    {term}
                                  </span>
                                ))
                              : "—"}
                          </td>
                          <td className="checker-similarity-cell">
                            <span className="score-cell checker-score-cell">
                              <strong>
                                {overall ??
                                  `${mode === "title" ? "Title" : "Content"} similarity unavailable`}
                              </strong>
                              <span className="sr-only">
                                {mode === "title" ? "Title" : "Content"}{" "}
                                similarity
                              </span>
                              <span
                                className={
                                  match.classification === "low"
                                    ? "sr-only"
                                    : "checker-score-classification"
                                }
                              >
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
                              {mode === "content" && contentUnavailable && (
                                <span>Content similarity unavailable</span>
                              )}
                            </span>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Open metadata for ${match.title}`}
                              title="Open metadata"
                              onClick={() => setMetadataResearchId(match.id)}
                            >
                              <ExternalLink size={17} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hasLowResult && (
                <p className="admin-empty">
                  <strong>Note:</strong> The system detected low similarity
                  based on the configured comparison method. Low similarity does
                  not prove originality.
                </p>
              )}
            </>
          )}
        </section>
      ) : null}
      {metadataResearchId !== null && (
        <PublicResearchMetadataDialog
          researchDocumentId={metadataResearchId}
          onClose={() => setMetadataResearchId(null)}
        />
      )}
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
    () =>
      listResearchDocuments({ mine: true, page, per_page: 10 }).then(
        requireResearcherPage,
      ),
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
          {selected && <SimilarityResults researchDocumentId={selected.id} />}
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
