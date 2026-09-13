import {
  ArrowRight,
  ExternalLink,
  LibraryBig,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./components";
import { Modal } from "./Modal";
import AdminResearchWorkspace from "./AdminResearchWorkspace";
import InstructorResearchReview from "./InstructorResearchReview";
import ResearcherResearchWorkspace from "./ResearcherResearchWorkspace";
import SimilarityResults from "./SimilarityResults";
import ResearchOfficeBulkImport from "./ResearchOfficeBulkImport";
import iasLogo from "./institute_logo/ias.webp";
import ibfsLogo from "./institute_logo/ibfs.webp";
import icsLogo from "./institute_logo/ics.webp";
import icjeLogo from "./institute_logo/icje.webp";
import ihsLogo from "./institute_logo/ihs.webp";
import iteLogo from "./institute_logo/ite.webp";
import {
  ApiError,
  listOfficeInstituteStudies,
  officeInstituteStudyOpenUrl,
  type OfficeInstituteStudy,
  type RoleDashboard,
  type RoleDashboardAnalytics,
  type RoleDashboardSection,
} from "./api";
import type { Role } from "./types";

export type RoleDashboardLoadState =
  | { scope: string; status: "loading" }
  | {
      scope: string;
      status: "ready";
      dashboard: RoleDashboard;
      source?: "live" | "mock";
    }
  | { scope: string; status: "error"; error: ApiError };

type WorkspaceProps = {
  role: Role;
  navigate: (path: string) => void;
  selectNav: (item: string) => void;
  dashboardScope: string;
  dashboardState: RoleDashboardLoadState;
  onRetry: () => void;
  researchDocumentId?: string | number;
};

const OFFICE_INSTITUTES = [
  {
    code: "IHS",
    name: "Institute of Health Sciences",
    logo: ihsLogo,
  },
  {
    code: "ICS",
    name: "Institute of Computer Studies",
    logo: icsLogo,
  },
  {
    code: "IBFS",
    name: "Institute of Business and Financial Management",
    logo: ibfsLogo,
  },
  {
    code: "ICJE",
    name: "Institute of Criminal Justice Education",
    logo: icjeLogo,
  },
  {
    code: "ITE",
    name: "Institute of Teacher Education",
    logo: iteLogo,
  },
  {
    code: "IAS",
    name: "Institute of Arts and Sciences",
    logo: iasLogo,
  },
] as const;

export default function RoleWorkspace({
  role,
  navigate,
  selectNav,
  dashboardScope,
  dashboardState,
  onRetry,
  researchDocumentId,
}: WorkspaceProps) {
  if (
    ["admin", "research-office"].includes(role) &&
    researchDocumentId !== undefined
  ) {
    return (
      <AdminResearchWorkspace
        key={`${dashboardScope}:${researchDocumentId}`}
        researchDocumentId={researchDocumentId}
        navigate={navigate}
      />
    );
  }

  if (role === "researcher" && researchDocumentId !== undefined) {
    return (
      <ResearcherResearchWorkspace
        key={`${dashboardScope}:${researchDocumentId}`}
        researchDocumentId={researchDocumentId}
        navigate={navigate}
      />
    );
  }

  if (
    researchDocumentId !== undefined &&
    (["adviser", "instructor", "panel", "statistician"] as Role[]).includes(
      role,
    )
  ) {
    const readOnly = role === "panel" || role === "statistician";
    return (
      <div className="workspace-content">
        <InstructorResearchReview
          key={`${dashboardScope}:${researchDocumentId}`}
          submission={{
            research_document_id: Number(researchDocumentId),
            title: "Assigned research",
            research_stage: "title_proposal",
            submission_status: "submitted",
            submitter: null,
            updated_at: null,
          }}
          readOnly={readOnly}
          onUpdated={onRetry}
        />
      </div>
    );
  }

  if (role === "researcher") {
    return (
      <ResearcherWorkspace
        navigate={navigate}
        selectNav={selectNav}
        researchDocumentId={researchDocumentId}
        dashboardScope={dashboardScope}
        dashboardState={dashboardState}
        onRetry={onRetry}
      />
    );
  }

  if (role === "research-office" && dashboardScope === "bulk_import") {
    return <ResearchOfficeBulkImport />;
  }

  return (
    <RoleDashboardWorkspace
      role={role}
      navigate={navigate}
      selectNav={selectNav}
      dashboardScope={dashboardScope}
      dashboardState={dashboardState}
      onRetry={onRetry}
    />
  );
}

function WorkspaceHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function ResearcherWorkspace({
  navigate,
  selectNav,
  researchDocumentId,
  dashboardScope,
  dashboardState,
  onRetry,
}: {
  navigate: (path: string) => void;
  selectNav: (item: string) => void;
  researchDocumentId?: string | number;
  dashboardScope: string;
  dashboardState: RoleDashboardLoadState;
  onRetry: () => void;
}) {
  const config = workspaceConfigs.researcher;
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        action={
          <Button
            onClick={() => selectNav("Create Research")}
            disabled={
              dashboardState.status === "ready" &&
              dashboardState.source === "mock"
            }
          >
            New submission <ArrowRight />
          </Button>
        }
      />
      <DashboardSections
        role="researcher"
        config={config}
        navigate={navigate}
        selectNav={selectNav}
        dashboardScope={dashboardScope}
        dashboardState={dashboardState}
        onRetry={onRetry}
      />
      <SimilarityResults researchDocumentId={researchDocumentId} />
    </div>
  );
}

type SectionConfig = {
  title: string;
  description: string;
  catalog?: boolean;
  internalRecord?: boolean;
  destination?: string;
};

type WorkspaceConfig = {
  eyebrow: string;
  title: string;
  description: string;
  sections: Record<string, SectionConfig>;
};

const workspaceConfigs: Record<Role, WorkspaceConfig> = {
  research_editor: {
    eyebrow: "Research Editor / Dashboard",
    title: "Editorial review",
    description: "Assigned manuscripts, editorial corrections, and monitoring.",
    sections: {},
  },
  researcher: {
    eyebrow: "My dashboard / Overview",
    title: "My research.",
    description:
      "Your own submissions, review progress, and flagged title similarity.",
    sections: {
      my_drafts: {
        title: "Drafts",
        description: "Records you have started but not yet submitted.",
      },
      my_under_review: {
        title: "Under review",
        description: "Submitted research currently being reviewed.",
      },
      my_revision_required: {
        title: "Revision required",
        description: "Research returned to you for required revisions.",
      },
      my_flagged_similarity: {
        title: "Flagged title similarity",
        description:
          "Your research with a stored similarity flag at or above the review threshold.",
      },
      my_approved: {
        title: "Approved",
        description: "Your research cleared to proceed.",
      },
      my_archived: {
        title: "Archived",
        description: "Your research preserved in the institutional repository.",
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  admin: {
    eyebrow: "System administration / Access control",
    title: "System access overview.",
    description: "Live account, audit, and research activity summaries.",
    sections: {
      pending_accounts: {
        title: "Pending accounts",
        description: "Invited or blocked accounts awaiting attention.",
        destination: "User & Role Management",
      },
      draft_research: {
        title: "Draft research",
        description: "Internal research records still in draft.",
        internalRecord: true,
      },
      submission_queue: {
        title: "Submission queue",
        description: "Submitted research awaiting review.",
        internalRecord: true,
      },
      revision_required: {
        title: "Revision required",
        description: "Research returned for required revisions.",
        internalRecord: true,
      },
      pending_title_validations: {
        title: "Pending title validations",
        description: "Human title-validation decisions awaiting review.",
        internalRecord: true,
      },
      flagged_similarity: {
        title: "Flagged similarity",
        description: "Research with persisted similarity flags.",
        internalRecord: true,
      },
      approved_for_archiving: {
        title: "Approved for archiving",
        description: "Approved research ready for repository archiving.",
        internalRecord: true,
      },
      archived_repository: {
        title: "Archived repository",
        description: "Archived research records in the repository.",
        internalRecord: true,
      },
      recent_research: {
        title: "Recent research",
        description: "Recently updated internal research records.",
        internalRecord: true,
      },
    },
  },
  adviser: {
    eyebrow: "Review desk",
    title: "Pending reviews",
    description: "Assignments and revision requests for your advisees.",
    sections: {
      assigned_reviews: {
        title: "Assigned reviews",
        description: "Active research reviews assigned to you.",
        internalRecord: true,
      },
      revision_requests: {
        title: "Revision requests",
        description: "Assigned research awaiting revisions.",
        internalRecord: true,
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  instructor: {
    eyebrow: "My sections",
    title: "Title proposals",
    description: "Title proposals and active reviews assigned to you.",
    sections: {
      title_proposals: {
        title: "Title proposals",
        description: "Assigned title proposals.",
      },
      pending_reviews: {
        title: "Pending reviews",
        description: "Assigned research awaiting review.",
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  panel: {
    eyebrow: "Assigned manuscripts",
    title: "Proposal defense brief",
    description: "Available defense information and repository references.",
    sections: {
      assigned_manuscripts: {
        title: "Assigned manuscripts",
        description: "Manuscripts authorized for panel review.",
      },
      defense_schedule: {
        title: "Defense schedule",
        description: "Scheduled proposal defense information.",
        destination: "Assigned Defenses",
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  statistician: {
    eyebrow: "Statistical review",
    title: "Methodology review",
    description:
      "Available methodology work and completed research references.",
    sections: {
      methodology_reviews: {
        title: "Methodology reviews",
        description: "Research authorized for methodology review.",
      },
      signoffs: {
        title: "Sign-offs",
        description: "Recorded statistical sign-offs.",
        destination: "Review History",
      },
      completed_references: {
        title: "Completed references",
        description: "Completed archived research in the catalog.",
        catalog: true,
      },
    },
  },
  coordinator: {
    eyebrow: "Program overview",
    title: "Research program at a glance.",
    description: "Live instructor access and program information.",
    sections: {
      active_instructors: {
        title: "Active instructors",
        description: "Instructors with active access.",
        destination: "Account Roles",
      },
      invited_instructors: {
        title: "Invited instructors",
        description: "Instructors awaiting activation.",
        destination: "Account Roles",
      },
      blocked_instructors: {
        title: "Blocked instructors",
        description: "Instructors without active access.",
        destination: "Account Roles",
      },
      schedules: {
        title: "Schedules",
        description: "Program scheduling information.",
        destination: "Schedules",
      },
      duplicate_flags: {
        title: "Duplicate flags",
        description: "Duplicate-review information.",
        destination: "Duplicate Flags",
      },
    },
  },
  librarian: {
    eyebrow: "Repository operations",
    title: "Archiving queue",
    description: "Repository records and available archiving information.",
    sections: {
      archiving_queue: {
        title: "Archiving queue",
        description: "Research authorized for archiving.",
      },
      metadata_validation: {
        title: "Metadata validation",
        description: "Metadata validation work.",
        destination: "Assigned Research",
      },
      repository_records: {
        title: "Repository records",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  "research-office": {
    eyebrow: "Research Office / Dashboard",
    title: "Institutional research dashboard.",
    description: "Analytics, institutional totals, and compliance queues.",
    sections: {
      submission_queue: {
        title: "Submission queue",
        description: "Submitted research awaiting institutional review.",
      },
      bulk_import: {
        title: "Upload Manuscript",
        description:
          "Upload multiple research manuscripts and extract metadata.",
      },
      revision_requests: {
        title: "Revision requests",
        description: "Research awaiting revisions.",
      },
      pending_archiving: {
        title: "Pending archiving",
        description: "Research awaiting repository archiving.",
      },
      archived_repository: {
        title: "Archived repository",
        description: "Review and correct metadata for archived manuscripts.",
        internalRecord: true,
      },
    },
  },
};

function RoleDashboardWorkspace({
  role,
  navigate,
  selectNav,
  dashboardScope,
  dashboardState,
  onRetry,
}: Omit<WorkspaceProps, "researchDocumentId"> & {
  role: Exclude<Role, "researcher">;
}) {
  const config = workspaceConfigs[role];
  const action =
    role === "librarian" ? (
      <Button variant="secondary" onClick={() => navigate("/catalog")}>
        <LibraryBig /> Open catalog
      </Button>
    ) : role === "admin" ? (
      <span className="admin-access-badge">
        <ShieldCheck /> Full system access
      </span>
    ) : undefined;

  return (
    <div className="workspace-content">
      <WorkspaceHeader {...config} action={action} />
      <DashboardSections
        role={role}
        config={config}
        navigate={navigate}
        selectNav={selectNav}
        dashboardScope={dashboardScope}
        dashboardState={dashboardState}
        onRetry={onRetry}
      />
    </div>
  );
}

function DashboardSections({
  role,
  config,
  navigate,
  selectNav,
  dashboardScope,
  dashboardState,
  onRetry,
}: {
  role: Role;
  config: WorkspaceConfig;
  navigate: (path: string) => void;
  selectNav: (item: string) => void;
  dashboardScope: string;
  dashboardState: RoleDashboardLoadState;
  onRetry: () => void;
}) {
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(
    null,
  );
  if (
    dashboardState.scope !== dashboardScope ||
    dashboardState.status === "loading" ||
    (dashboardState.status === "ready" &&
      dashboardState.dashboard.role !== role)
  ) {
    return (
      <section
        className="panel-card dashboard-loading"
        aria-busy="true"
        aria-label="Loading role workspace"
      >
        <p>Loading role workspace…</p>
      </section>
    );
  }

  if (dashboardState.status === "error") {
    const { error } = dashboardState;
    const message =
      error.status === 401
        ? "Session expired. Sign out and sign in again."
        : error.status === 403
          ? "Access denied or pending approval."
          : `Role workspace data is unavailable (${error.code}).`;
    return (
      <section className="panel-card dashboard-error" role="alert">
        <p>{message}</p>
        {error.status !== 401 && (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </section>
    );
  }

  return (
    <>
      {role === "researcher" && dashboardState.source === "mock" && (
        <section className="researcher-demo-notice" role="status">
          <div>
            <strong>Demo data - read only</strong>
            <span>The live Researcher dashboard could not be loaded.</span>
          </div>
          <Button variant="secondary" onClick={onRetry}>
            Retry live data
          </Button>
        </section>
      )}
      <DashboardStatistics
        sections={dashboardState.dashboard.sections}
        config={config}
        onSelect={(section) => setSelectedSectionKey(section.key)}
      />
      {role === "research-office" && (
        <InstituteCountAnalytics
          institutes={dashboardState.dashboard.institutional_overview}
        />
      )}
      <div className="dashboard-visualizations">
        <DashboardWorkloadChart
          sections={dashboardState.dashboard.sections}
          config={config}
        />
        {role !== "research-office" && dashboardState.dashboard.analytics && (
          <DashboardAnalytics analytics={dashboardState.dashboard.analytics} />
        )}
      </div>
      {role === "research-office" && (
        <OfficeInstitutionalOverview
          institutes={dashboardState.dashboard.institutional_overview}
        />
      )}
      {selectedSectionKey !== null && (
        <Modal
          label={config.sections[selectedSectionKey]?.title ?? "Research"}
          onClose={() => setSelectedSectionKey(null)}
          size="large"
        >
          {(() => {
            const section = dashboardState.dashboard.sections.find(
              (item) => item.key === selectedSectionKey,
            );
            if (!section) return null;
            return (
              <DashboardSection
                section={section}
                config={
                  config.sections[section.key] ?? {
                    title: section.key,
                    description: "Research records.",
                  }
                }
                navigate={navigate}
                selectNav={selectNav}
                role={role}
              />
            );
          })()}
        </Modal>
      )}
    </>
  );
}

function OfficeInstitutionalOverview({
  institutes,
}: {
  institutes?: Array<{ institute: string; total: number }> | null;
}) {
  const [selectedInstitute, setSelectedInstitute] = useState<string | null>(
    null,
  );
  const [studiesState, setStudiesState] = useState<
    | { status: "idle" }
    | { status: "loading"; code: string }
    | { status: "error"; code: string }
    | { status: "ready"; code: string; studies: OfficeInstituteStudy[] }
  >({ status: "idle" });
  const totals = new Map(
    (institutes ?? []).map((unit) => [unit.institute, unit.total]),
  );

  async function loadStudies(code: string) {
    setStudiesState({ status: "loading", code });
    try {
      const studies = await listOfficeInstituteStudies(code);
      setStudiesState({ status: "ready", code, studies });
    } catch {
      setStudiesState({ status: "error", code });
    }
  }

  function selectInstitute(code: string) {
    if (selectedInstitute === code) {
      setSelectedInstitute(null);
      setStudiesState({ status: "idle" });
      return;
    }
    setSelectedInstitute(code);
    void loadStudies(code);
  }

  function closeInstituteStudies() {
    setSelectedInstitute(null);
    setStudiesState({ status: "idle" });
  }

  const selectedInstituteName = OFFICE_INSTITUTES.find(
    (institute) => institute.code === selectedInstitute,
  )?.name;

  return (
    <>
      <section
        className="panel-card office-institute-overview"
        aria-labelledby="office-institute-overview-title"
      >
        <header>
          <div>
            <p className="eyebrow">Research by institute</p>
            <h2 id="office-institute-overview-title">Institutional Overview</h2>
            <p>
              Select an institute to browse its Supabase studies and manuscript
              files.
            </p>
          </div>
        </header>
        <div className="office-institute-grid">
          {OFFICE_INSTITUTES.map((institute) => {
            const total =
              institutes === null ? null : (totals.get(institute.name) ?? 0);
            return (
              <button
                type="button"
                className="office-institute-card"
                key={institute.code}
                aria-label={`${institute.name}: ${total ?? "unavailable"} research records`}
                aria-haspopup="dialog"
                onClick={() => selectInstitute(institute.code)}
              >
                <div className="office-institute-mark" aria-hidden="true">
                  <span>{institute.code}</span>
                  <img src={institute.logo} alt="" />
                </div>
                <div className="office-institute-copy">
                  <strong>{institute.code}</strong>
                  <span>{institute.name}</span>
                </div>
                <div className="office-institute-total">
                  <strong>{total ?? "-"}</strong>
                  <span>
                    {total === null
                      ? "Supabase unavailable"
                      : total === 1
                        ? "research record"
                        : "research records"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      {selectedInstitute && selectedInstituteName && (
        <Modal
          label={`${selectedInstituteName} studies`}
          onClose={closeInstituteStudies}
          size="large"
        >
          <div className="office-study-browser" aria-live="polite">
            <header>
              <div>
                <p className="eyebrow">Supabase manuscripts</p>
                <h3>{selectedInstituteName}</h3>
                <p>
                  Select a study to choose which file to open, or download all
                  study files as a ZIP archive.
                </p>
              </div>
            </header>
            {studiesState.status === "loading" ? (
              <p className="office-institute-message">Loading studies...</p>
            ) : studiesState.status === "error" ? (
              <div className="office-institute-message" role="alert">
                <p>Studies could not be loaded from Supabase.</p>
                <Button
                  variant="secondary"
                  onClick={() => void loadStudies(selectedInstitute)}
                >
                  Retry
                </Button>
              </div>
            ) : studiesState.status === "ready" &&
              studiesState.studies.length === 0 ? (
              <p className="office-institute-message">
                No studies are stored for this institute.
              </p>
            ) : studiesState.status === "ready" ? (
              <div className="office-study-list" aria-label="Studies">
                {studiesState.studies.map((study) => (
                  <a
                    className="office-study-item"
                    key={`${study.year}/${study.title}`}
                    href={officeInstituteStudyOpenUrl(selectedInstitute, study)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="office-study-year">{study.year}</span>
                    <strong>{study.title}</strong>
                    <ExternalLink aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}

const INSTITUTE_CHART_WIDTH = 760;
const INSTITUTE_CHART_HEIGHT = 250;
const INSTITUTE_CHART_LEFT = 48;
const INSTITUTE_CHART_RIGHT = 26;
const INSTITUTE_CHART_TOP = 26;
const INSTITUTE_CHART_BOTTOM = 48;

function InstituteCountAnalytics({
  institutes,
}: {
  institutes?: Array<{ institute: string; total: number }> | null;
}) {
  const totals = new Map(
    (institutes ?? []).map((unit) => [unit.institute, unit.total]),
  );
  const points = OFFICE_INSTITUTES.map((institute) => ({
    ...institute,
    total: totals.get(institute.name) ?? 0,
  }));
  const maximum = Math.max(1, ...points.map((point) => point.total));
  const plotWidth =
    INSTITUTE_CHART_WIDTH - INSTITUTE_CHART_LEFT - INSTITUTE_CHART_RIGHT;
  const plotHeight =
    INSTITUTE_CHART_HEIGHT - INSTITUTE_CHART_TOP - INSTITUTE_CHART_BOTTOM;
  const x = (index: number) =>
    INSTITUTE_CHART_LEFT + (index * plotWidth) / (points.length - 1);
  const y = (total: number) =>
    INSTITUTE_CHART_TOP + plotHeight - (total / maximum) * plotHeight;
  const line = points
    .map((point, index) => `${x(index)},${y(point.total)}`)
    .join(" ");
  const area = `${INSTITUTE_CHART_LEFT},${INSTITUTE_CHART_TOP + plotHeight} ${line} ${INSTITUTE_CHART_LEFT + plotWidth},${INSTITUTE_CHART_TOP + plotHeight}`;

  return (
    <figure className="office-institute-analytics">
      <figcaption>
        <div>
          <p className="eyebrow">Supabase analytics</p>
          <h2>Manuscripts by institute</h2>
          <p>Live distribution based on research-title folders in Supabase.</p>
        </div>
        <strong>
          {points.reduce((sum, point) => sum + point.total, 0)} total
        </strong>
      </figcaption>
      {institutes === null ? (
        <p className="office-institute-message">
          Supabase analytics are unavailable.
        </p>
      ) : (
        <div className="office-institute-chart-scroll">
          <svg
            viewBox={`0 0 ${INSTITUTE_CHART_WIDTH} ${INSTITUTE_CHART_HEIGHT}`}
            role="img"
            aria-label="Supabase manuscripts by institute"
          >
            <defs>
              <linearGradient
                id="institute-chart-area"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="var(--fern)" stopOpacity="0.28" />
                <stop
                  offset="100%"
                  stopColor="var(--fern)"
                  stopOpacity="0.02"
                />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((ratio) => {
              const value = Math.round(maximum * (1 - ratio));
              const gridY = INSTITUTE_CHART_TOP + plotHeight * ratio;
              return (
                <g key={ratio}>
                  <line
                    className="office-institute-grid-line"
                    x1={INSTITUTE_CHART_LEFT}
                    x2={INSTITUTE_CHART_WIDTH - INSTITUTE_CHART_RIGHT}
                    y1={gridY}
                    y2={gridY}
                  />
                  <text className="office-institute-axis" x={36} y={gridY + 4}>
                    {value}
                  </text>
                </g>
              );
            })}
            <polygon className="office-institute-area" points={area} />
            <polyline className="office-institute-line" points={line} />
            {points.map((point, index) => (
              <g key={point.code}>
                <circle
                  className="office-institute-point"
                  cx={x(index)}
                  cy={y(point.total)}
                  r="6"
                />
                <text
                  className="office-institute-point-value"
                  x={x(index)}
                  y={Math.max(17, y(point.total) - 13)}
                >
                  {point.total}
                </text>
                <text
                  className="office-institute-axis-label"
                  x={x(index)}
                  y={INSTITUTE_CHART_HEIGHT - 18}
                >
                  {point.code}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </figure>
  );
}

const CHART_WIDTH = 620;
const CHART_HEIGHT = 130;
const CHART_LEFT = 38;
const CHART_RIGHT = 12;
const CHART_TOP = 12;
const CHART_BOTTOM = 26;

function DashboardAnalytics({
  analytics,
}: {
  analytics: RoleDashboardAnalytics;
}) {
  const allValues = analytics.series.flatMap((series) =>
    series.points.map((point) => point.value),
  );
  const maximum = Math.max(1, ...allValues);
  const labels = analytics.series[0]?.points ?? [];
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const gridValues =
    maximum <= 4
      ? Array.from({ length: maximum + 1 }, (_, index) => maximum - index)
      : [
          ...new Set(
            [maximum, 0.75, 0.5, 0.25, 0].map((value) =>
              value <= 1 ? Math.round(maximum * value) : value,
            ),
          ),
        ];
  const x = (index: number) =>
    CHART_LEFT + (index * plotWidth) / Math.max(labels.length - 1, 1);
  const y = (value: number) =>
    CHART_TOP + plotHeight - (value / maximum) * plotHeight;

  return (
    <figure
      className="dashboard-analytics"
      aria-labelledby="dashboard-analytics-title"
    >
      <figcaption>
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 id="dashboard-analytics-title">{analytics.title}</h2>
          <p>{analytics.period}, based on records visible to this workspace.</p>
        </div>
        <div className="dashboard-analytics-legend" aria-label="Chart legend">
          {analytics.series.map((series, index) => (
            <span key={series.key} className={`analytics-series-${index + 1}`}>
              <i aria-hidden="true" /> {series.label}
            </span>
          ))}
        </div>
      </figcaption>

      <div className="dashboard-line-chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={`${analytics.title}, ${analytics.period}`}
        >
          {gridValues.map((value) => {
            const gridY = y(value);
            return (
              <g key={value}>
                <line
                  className="analytics-grid-line"
                  x1={CHART_LEFT}
                  x2={CHART_WIDTH - CHART_RIGHT}
                  y1={gridY}
                  y2={gridY}
                />
                <text
                  className="analytics-axis-value"
                  x={CHART_LEFT - 10}
                  y={gridY + 4}
                >
                  {value}
                </text>
              </g>
            );
          })}

          {analytics.series.map((series, seriesIndex) => {
            const points = series.points
              .map((point, index) => `${x(index)},${y(point.value)}`)
              .join(" ");
            return (
              <g
                key={series.key}
                className={`analytics-line analytics-series-${seriesIndex + 1}`}
              >
                <polyline points={points} />
                {series.points.map((point, index) => (
                  <circle
                    key={point.key}
                    cx={x(index)}
                    cy={y(point.value)}
                    r="4"
                  >
                    <title>{`${point.label} ${series.label}: ${point.value}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          {labels.map((point, index) => (
            <text
              key={point.key}
              className="analytics-axis-label"
              x={x(index)}
              y={CHART_HEIGHT - 13}
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>

      <table className="sr-only">
        <caption>{`${analytics.title}, ${analytics.period}`}</caption>
        <thead>
          <tr>
            <th>Month</th>
            {analytics.series.map((series) => (
              <th key={series.key}>{series.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((point, pointIndex) => (
            <tr key={point.key}>
              <th>{point.label}</th>
              {analytics.series.map((series) => (
                <td key={series.key}>
                  {series.points[pointIndex]?.value ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function DashboardStatistics({
  sections,
  config,
  onSelect,
}: {
  sections: RoleDashboardSection[];
  config: WorkspaceConfig;
  onSelect?: (section: RoleDashboardSection) => void;
}) {
  const available = availableDashboardSections(sections);

  if (available.length === 0) return null;

  return (
    <section
      className="dashboard-statistics"
      aria-labelledby="dashboard-statistics-title"
    >
      <header>
        <div>
          <p className="eyebrow">Live overview</p>
          <h2 id="dashboard-statistics-title">Statistics</h2>
        </div>
        <p>Current totals for this role workspace.</p>
      </header>
      <dl className="dashboard-stat-grid">
        {available.map((section) => {
          return onSelect ? (
            <button
              key={section.key}
              type="button"
              className="dashboard-stat-card dashboard-stat-card-button"
              onClick={() => onSelect(section)}
              aria-label={`View ${config.sections[section.key]?.title ?? humanize(section.key)}`}
            >
              <span className="dashboard-stat-label">
                {config.sections[section.key]?.title ?? humanize(section.key)}
              </span>
              <strong className="dashboard-stat-value">{section.total}</strong>
            </button>
          ) : (
            <div key={section.key} className="dashboard-stat-card">
              <dt>
                {config.sections[section.key]?.title ?? humanize(section.key)}
              </dt>
              <dd>{section.total}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function DashboardWorkloadChart({
  sections,
  config,
}: {
  sections: RoleDashboardSection[];
  config: WorkspaceConfig;
}) {
  const available = availableDashboardSections(sections);
  if (available.length === 0) return null;
  const maximumTotal = Math.max(
    1,
    ...available.map((section) => section.total),
  );

  return (
    <figure className="dashboard-chart">
      <figcaption>
        <div>
          <p className="eyebrow">Distribution</p>
          <h3>Current workload</h3>
        </div>
      </figcaption>
      <div className="dashboard-chart-bars">
        {available.map((section) => {
          const title =
            config.sections[section.key]?.title ?? humanize(section.key);

          return (
            <div key={section.key} className="dashboard-chart-row">
              <div className="dashboard-chart-label">
                <span>{title}</span>
              </div>
              <div
                className="dashboard-chart-meter"
                role="meter"
                aria-label={title}
                aria-valuemin={0}
                aria-valuemax={maximumTotal}
                aria-valuenow={section.total}
                aria-valuetext={`${section.total} total`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: `${(section.total / maximumTotal) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function availableDashboardSections(sections: RoleDashboardSection[]) {
  return sections.filter(
    (section): section is RoleDashboardSection & { total: number } =>
      section.state === "ready" && section.total !== null,
  );
}

function DashboardSection({
  section,
  config,
  navigate,
  selectNav,
  role,
}: {
  section: RoleDashboardSection;
  config: SectionConfig;
  navigate: (path: string) => void;
  selectNav?: (item: string) => void;
  role: Role;
}) {
  if (section.state === "unavailable") {
    return (
      <section className="panel-card dashboard-section dashboard-section-unavailable">
        <header>
          <div>
            <p className="eyebrow">{config.title}</p>
            <h2 className="dashboard-section-title">{config.title}</h2>
            <p>{config.description}</p>
          </div>
          <strong className="dashboard-unavailable">Unavailable</strong>
        </header>
        <p className="dashboard-unavailable-copy">
          {section.reason === "not_authorized_for_role"
            ? "This information is not authorized for your role."
            : "This information is not modeled in the current workspace."}
        </p>
      </section>
    );
  }

  const isPublicCatalogRecord = config.catalog && section.state === "ready";

  return (
    <section
      className={`panel-card dashboard-section${config.catalog ? " dashboard-section-catalog" : ""}`}
    >
      <header>
        <div>
          <p className="eyebrow">
            {config.catalog ? "Catalog collection" : config.title}
          </p>
          <h2 className="dashboard-section-title">{config.title}</h2>
          <p>{config.description}</p>
        </div>
      </header>
      {section.total === 0 ? (
        <p className="dashboard-empty">No records are currently available.</p>
      ) : section.items.length > 0 ? (
        <ul className="dashboard-record-list">
          {section.items.map((item) => (
            <li key={item.research_document_id}>
              <div className="dashboard-record-summary">
                <h3>{item.title}</h3>
                <p>
                  {humanize(item.research_stage)} ·{" "}
                  {humanize(item.submission_status)} ·{" "}
                  {humanize(item.archive_status)}
                  {item.publication_year ? ` · ${item.publication_year}` : ""}
                </p>
                {item.updated_at && (
                  <time dateTime={item.updated_at}>
                    Updated {formatDate(item.updated_at)}
                  </time>
                )}
              </div>
              <div className="dashboard-record-access">
                <span className="dashboard-record-visibility">
                  <i aria-hidden="true" />
                  {isPublicCatalogRecord
                    ? item.visibility === "public"
                      ? "Public catalog"
                      : "Registered workspace"
                    : "Internal workspace"}
                </span>
                {isPublicCatalogRecord && item.visibility === "public" && (
                  <button
                    className="icon-button dashboard-record-icon-action"
                    aria-label="Open public catalog"
                    title="Open public catalog"
                    onClick={() =>
                      navigate(
                        `/catalog?q=${encodeURIComponent(
                          catalogSearchQuery(item.title),
                        )}`,
                      )
                    }
                  >
                    <ExternalLink size={17} aria-hidden="true" />
                  </button>
                )}
                {(["admin", "adviser", "research-office"] as Role[]).includes(
                  role,
                ) &&
                  config.internalRecord && (
                    <button
                      className="icon-button dashboard-record-icon-action"
                      aria-label={
                        role === "adviser"
                          ? "Open review"
                          : "Open internal record"
                      }
                      title={
                        role === "adviser"
                          ? "Open review"
                          : "Open internal record"
                      }
                      onClick={() =>
                        navigate(`/research/${item.research_document_id}`)
                      }
                    >
                      <ExternalLink size={17} aria-hidden="true" />
                    </button>
                  )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dashboard-count-summary">
          <strong>{section.total?.toLocaleString()}</strong>
          <p>
            {section.total === 1
              ? "1 matching record is available."
              : `${section.total?.toLocaleString()} matching records are available.`}
          </p>
          {config.destination && selectNav && (
            <Button onClick={() => selectNav(config.destination!)}>
              Open details
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function catalogSearchQuery(title: string) {
  return Array.from(title).slice(0, 200).join("");
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
