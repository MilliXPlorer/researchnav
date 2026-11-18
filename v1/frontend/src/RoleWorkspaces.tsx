import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  ExternalLink,
  FolderKanban,
  History,
  LibraryBig,
  LineChart,
  UserRound,
  UserRoundCheck,
  UsersRound,
  Search,
  ShieldCheck,
  SquareStack,
  Tags,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatedStat, Button } from "./components";
import {
  DashboardEmptyState,
  DashboardKpiCard,
} from "./DashboardPrimitives";
import { formatPhilippineDate, formatPhilippineDateTime } from "./dateTime";
import { Modal } from "./Modal";
import AdminResearchWorkspace from "./AdminResearchWorkspace";
import AssignedResearchFolders from "./AssignedResearchFolders";
import ResearcherResearchWorkspace from "./ResearcherResearchWorkspace";
import type { ResearchWorkspaceDestination } from "./researchWorkspaceRoute";
import iasLogo from "./institute_logo/ias.webp";
import ibfsLogo from "./institute_logo/ibfs.webp";
import icsLogo from "./institute_logo/ics.webp";
import icjeLogo from "./institute_logo/icje.webp";
import ihsLogo from "./institute_logo/ihs.webp";
import iteLogo from "./institute_logo/ite.webp";
import {
  ApiError,
  getCoordinatorProgramOverview,
  listOfficeInstituteStudies,
  officeInstituteStudyOpenUrl,
  type OfficeInstituteStudy,
  type PanelDashboardProjection,
  type CoordinatorProgramOverview,
  type LibrarianDashboardProjection,
  type RoleDashboard,
  type RoleDashboardAnalytics,
  type RoleDashboardSection,
  type StatisticianDashboardProjection,
  type StatisticianDashboardWorkloadItem,
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
  researchWorkspaceDestination?: ResearchWorkspaceDestination;
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

type OfficeInstituteStudies = Record<
  string,
  OfficeInstituteStudy[] | null | undefined
>;

function defenseStageLabel(value: string | null) {
  if (!value) return "Not specified";
  const normalized = value.toLowerCase();
  if (normalized.includes("proposal")) return "Proposal Defense";
  if (normalized.includes("pre") && normalized.includes("oral")) {
    return "Pre-Oral Defense";
  }
  if (normalized.includes("final")) return "Final Defense";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function RoleWorkspace({
  role,
  navigate,
  selectNav,
  dashboardScope,
  dashboardState,
  onRetry,
  researchDocumentId,
  researchWorkspaceDestination,
}: WorkspaceProps) {
  if (role === "admin" && researchDocumentId !== undefined) {
    return (
      <AdminResearchWorkspace
        key={`${dashboardScope}:${researchDocumentId}`}
        researchDocumentId={researchDocumentId}
        navigate={navigate}
      />
    );
  }

  if (role === "research-office" && researchDocumentId !== undefined) {
    return (
      <AssignedResearchFolders
        key={`${dashboardScope}:${researchDocumentId}`}
        role={role}
        actorKey={dashboardScope}
        initialResearchDocumentId={researchDocumentId}
        destination={researchWorkspaceDestination}
        navigate={navigate}
        onResearchChanged={onRetry}
      />
    );
  }

  if (role === "researcher" && researchDocumentId !== undefined) {
    return (
      <ResearcherResearchWorkspace
        key={`${dashboardScope}:${researchDocumentId}`}
        researchDocumentId={researchDocumentId}
        navigate={navigate}
        destination={researchWorkspaceDestination}
      />
    );
  }

  if (
    researchDocumentId !== undefined &&
    (
      [
        "adviser",
        "instructor",
        "panel",
        "statistician",
        "librarian",
        "research_editor",
      ] as Role[]
    ).includes(role)
  ) {
    return (
      <AssignedResearchFolders
        key={`${dashboardScope}:${researchDocumentId}`}
        role={role}
        actorKey={dashboardScope}
        initialResearchDocumentId={researchDocumentId}
        destination={researchWorkspaceDestination}
      />
    );
  }

  if (role === "researcher") {
    return (
      <ResearcherWorkspace
        navigate={navigate}
        selectNav={selectNav}
        dashboardScope={dashboardScope}
        dashboardState={dashboardState}
        onRetry={onRetry}
      />
    );
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
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
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
  dashboardScope,
  dashboardState,
  onRetry,
}: {
  navigate: (path: string) => void;
  selectNav: (item: string) => void;
  dashboardScope: string;
  dashboardState: RoleDashboardLoadState;
  onRetry: () => void;
}) {
  const config = workspaceConfigs.researcher;
  return (
    <div className="workspace-content researcher-dashboard-workspace">
      <WorkspaceHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
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
    </div>
  );
}

type SectionConfig = {
  title: string;
  description: string;
  catalog?: boolean;
  internalRecord?: boolean;
  destination?: string;
  researchMetric?: boolean;
};

type WorkspaceConfig = {
  eyebrow?: string;
  title: string;
  description: string;
  sections: Record<string, SectionConfig>;
};

const workspaceConfigs: Record<Role, WorkspaceConfig> = {
  research_editor: {
    eyebrow: "Research Editor / Dashboard",
    title: "Dashboard",
    description: "Assigned manuscripts, editorial corrections, and monitoring.",
    sections: {},
  },
  researcher: {
    title: "My dashboard.",
    description:
      "Your own submissions, review progress, and flagged title similarity.",
    sections: {
      my_drafts: {
        title: "Drafts",
        description: "Records you have started but not yet submitted.",
        researchMetric: true,
      },
      my_under_review: {
        title: "Under review",
        description: "Submitted research currently being reviewed.",
        researchMetric: true,
      },
      my_revision_required: {
        title: "Revision required",
        description: "Research returned to you for required revisions.",
        researchMetric: true,
      },
      my_flagged_similarity: {
        title: "Flagged title similarity",
        description:
          "Your research with a stored similarity flag at or above the review threshold.",
        researchMetric: true,
      },
      my_approved: {
        title: "Approved",
        description: "Your research cleared to proceed.",
        researchMetric: true,
      },
      my_archived: {
        title: "Archived",
        description: "Your research preserved in the institutional repository.",
        researchMetric: true,
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  admin: {
    eyebrow: "System administration / Dashboard",
    title: "Dashboard",
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
        researchMetric: true,
      },
      submission_queue: {
        title: "Submission queue",
        description: "Submitted research awaiting review.",
        internalRecord: true,
        researchMetric: true,
      },
      revision_required: {
        title: "Revision required",
        description: "Research returned for required revisions.",
        internalRecord: true,
        researchMetric: true,
      },
      pending_title_validations: {
        title: "Pending title validations",
        description: "Human title-validation decisions awaiting review.",
        internalRecord: true,
        researchMetric: true,
      },
      flagged_similarity: {
        title: "Flagged similarity",
        description: "Research with persisted similarity flags.",
        internalRecord: true,
        researchMetric: true,
      },
      approved_for_archiving: {
        title: "Approved for archiving",
        description: "Approved research ready for repository archiving.",
        internalRecord: true,
        researchMetric: true,
      },
      archived_repository: {
        title: "Archived repository",
        description: "Archived research records in the repository.",
        internalRecord: true,
        researchMetric: true,
      },
      recent_research: {
        title: "Recent research",
        description: "Recently updated internal research records.",
        internalRecord: true,
        researchMetric: true,
      },
    },
  },
  adviser: {
    eyebrow: "Research Adviser / Dashboard",
    title: "Dashboard",
    description: "Assignments and revision requests for your advisees.",
    sections: {
      assigned_reviews: {
        title: "Assigned reviews",
        description: "Active research reviews assigned to you.",
        internalRecord: true,
        researchMetric: true,
      },
      revision_requests: {
        title: "Revision requests",
        description: "Assigned research awaiting revisions.",
        internalRecord: true,
        researchMetric: true,
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
    title: "Dashboard",
    description:
      "Title proposals, reviews, and repository references in your sections.",
    sections: {
      title_proposals: {
        title: "Title proposals",
        description: "Assigned title proposals.",
        researchMetric: true,
      },
      pending_reviews: {
        title: "Pending reviews",
        description: "Assigned research awaiting review.",
        researchMetric: true,
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  panel: {
    eyebrow: "Research Panel / Dashboard",
    title: "Dashboard",
    description: "Review assigned studies and manage your panel evaluations.",
    sections: {
      assigned_manuscripts: {
        title: "Assigned manuscripts",
        description: "Manuscripts authorized for panel review.",
        internalRecord: true,
        researchMetric: true,
      },
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  statistician: {
    eyebrow: "Statistician / Dashboard",
    title: "Dashboard",
    description:
      "Overview of your assigned studies, workload, and recent activity.",
    sections: {
      methodology_reviews: {
        title: "Methodology reviews",
        description: "Research authorized for methodology review.",
        researchMetric: true,
      },
      signoffs: {
        title: "Sign-offs",
        description: "Recorded statistical sign-offs.",
        destination: "Sign-offs Issued",
      },
      completed_references: {
        title: "Completed references",
        description: "Completed archived research in the catalog.",
        catalog: true,
      },
    },
  },
  coordinator: {
    title: "Program Overview",
    description: "Institute research activity, assignments, and repository status.",
    sections: {},
  },
  librarian: {
    eyebrow: "Librarian / Dashboard",
    title: "Dashboard",
    description:
      "Manage archiving requests, validate repository metadata, and monitor collection activity.",
    sections: {
      archiving_queue: {
        title: "Archiving queue",
        description: "Research authorized for archiving.",
        researchMetric: true,
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
      assigned_research: {
        title: "Assigned research",
        description:
          "Research where you are the assigned Research Office representative.",
        internalRecord: true,
        researchMetric: true,
      },
      submission_queue: {
        title: "Submission queue",
        description: "Submitted research awaiting institutional review.",
        researchMetric: true,
      },
      bulk_import: {
        title: "Manage Repository",
        description: "Manage studies and import multiple research manuscripts.",
        destination: "Manage Repository",
      },
      revision_requests: {
        title: "Revision requests",
        description: "Research awaiting revisions.",
        researchMetric: true,
      },
      pending_archiving: {
        title: "Pending archiving",
        description: "Research awaiting repository archiving.",
        researchMetric: true,
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
    <div
      className={
        role === "research-office"
          ? "workspace-content office-dashboard-workspace"
          : role === "admin"
            ? "workspace-content admin-dashboard-workspace"
            : role === "panel"
              ? "workspace-content panel-dashboard-workspace"
              : role === "statistician"
                ? "workspace-content statistician-dashboard-workspace"
                : role === "librarian"
                  ? "workspace-content librarian-dashboard-workspace"
                  : role === "coordinator"
                    ? "workspace-content coordinator-dashboard-workspace"
                : "workspace-content"
      }
    >
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
  const [officeInstituteStudies, setOfficeInstituteStudies] =
    useState<OfficeInstituteStudies>({});
  const officeDashboardReady =
    role === "research-office" &&
    dashboardState.scope === dashboardScope &&
    dashboardState.status === "ready" &&
    dashboardState.dashboard.role === role;

  useEffect(() => {
    if (!officeDashboardReady) return;

    let active = true;
    void Promise.all(
      OFFICE_INSTITUTES.map(async ({ code }) => {
        try {
          return [code, await listOfficeInstituteStudies(code)] as const;
        } catch {
          return [code, null] as const;
        }
      }),
    ).then((entries) => {
      if (active) setOfficeInstituteStudies(Object.fromEntries(entries));
    });

    return () => {
      active = false;
    };
  }, [officeDashboardReady]);

  async function reloadOfficeInstituteStudies(code: string) {
    setOfficeInstituteStudies((current) => ({
      ...current,
      [code]: undefined,
    }));
    try {
      const studies = await listOfficeInstituteStudies(code);
      setOfficeInstituteStudies((current) => ({
        ...current,
        [code]: studies,
      }));
    } catch {
      setOfficeInstituteStudies((current) => ({
        ...current,
        [code]: null,
      }));
    }
  }
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

  if (role === "statistician" && dashboardState.dashboard.statistician) {
    return (
      <StatisticianDashboard
        projection={dashboardState.dashboard.statistician}
        navigate={navigate}
      />
    );
  }

  if (role === "panel" && dashboardState.dashboard.panel) {
    return (
      <PanelDashboard
        projection={dashboardState.dashboard.panel}
        selectNav={selectNav}
      />
    );
  }

  if (role === "librarian" && dashboardState.dashboard.librarian) {
    return (
      <LibrarianDashboard
        projection={dashboardState.dashboard.librarian}
        navigate={navigate}
      />
    );
  }

  if (role === "coordinator") {
    return <CoordinatorDashboard selectNav={selectNav} />;
  }

  const visibleSections = dashboardState.dashboard.sections;
  const adminAttentionKeys = new Set([
    "pending_accounts",
    "submission_queue",
    "revision_required",
    "pending_title_validations",
    "flagged_similarity",
    "approved_for_archiving",
  ]);
  const adminRepositoryKeys = new Set([
    "draft_research",
    "archived_repository",
    "recent_research",
  ]);
  const adminWorkloadKeys = new Set([
    "draft_research",
    "submission_queue",
    "revision_required",
    "pending_title_validations",
    "flagged_similarity",
    "approved_for_archiving",
  ]);
  const adminAttentionSections = visibleSections.filter((section) =>
    adminAttentionKeys.has(section.key),
  );
  const adminRepositorySections = visibleSections.filter((section) =>
    adminRepositoryKeys.has(section.key),
  );
  const adminWorkloadSections = visibleSections.filter((section) =>
    adminWorkloadKeys.has(section.key),
  );

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
      {role === "admin" ? (
        <>
          <DashboardStatistics
            sections={adminAttentionSections}
            config={config}
            eyebrow="Needs attention"
            title="Needs attention"
            titleHidden
            variant="attention"
            onSelect={(section) => setSelectedSectionKey(section.key)}
          />
          <DashboardStatistics
            sections={adminRepositorySections}
            config={config}
            eyebrow="Repository overview"
            title="Repository overview"
            titleHidden
            variant="repository"
            onSelect={(section) => setSelectedSectionKey(section.key)}
          />
        </>
      ) : (
        <DashboardStatistics
          sections={visibleSections}
          config={config}
          onSelect={(section) => setSelectedSectionKey(section.key)}
        />
      )}
      {role === "research-office" && (
        <InstituteCountAnalytics
          instituteTotals={dashboardState.dashboard.institutional_overview}
        />
      )}
      {role === "research-office" ? (
        <OfficeDashboardOperations
          sections={visibleSections.filter(
            (section) => config.sections[section.key]?.researchMetric,
          )}
          config={config}
          selectNav={selectNav}
        />
      ) : role === "panel" ? (
        <>
          <PanelDashboardOperations
            sections={visibleSections}
            config={config}
            selectNav={selectNav}
          />
          {dashboardState.dashboard.analytics && (
            <div className="dashboard-visualizations">
              <DashboardAnalytics analytics={dashboardState.dashboard.analytics} />
            </div>
          )}
        </>
      ) : role === "admin" ? (
        <div className="dashboard-visualizations admin-dashboard-visualizations">
          <DashboardWorkloadChart
            sections={adminWorkloadSections}
            config={config}
          />
          {dashboardState.dashboard.analytics && (
            <DashboardAnalytics
              analytics={dashboardState.dashboard.analytics}
              fitToContainer
              showTotal={false}
            />
          )}
        </div>
      ) : (
        <div className="dashboard-visualizations">
          <DashboardWorkloadChart
            sections={visibleSections.filter(
              (section) => config.sections[section.key]?.researchMetric,
            )}
            config={config}
          />
          {dashboardState.dashboard.analytics && (
            <DashboardAnalytics
              analytics={dashboardState.dashboard.analytics}
              fitToContainer={role === "researcher"}
            />
          )}
        </div>
      )}
      {role === "research-office" && (
        <OfficeInstitutionalOverview
          studiesByInstitute={officeInstituteStudies}
          onReload={reloadOfficeInstituteStudies}
        />
      )}
      {selectedSectionKey !== null && (
        <Modal
          label={config.sections[selectedSectionKey]?.title ?? "Research"}
          onClose={() => setSelectedSectionKey(null)}
          size="large"
        >
          {(() => {
            const section = visibleSections.find(
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

function CoordinatorDashboard({
  selectNav,
}: {
  selectNav: (item: string) => void;
}) {
  const [overview, setOverview] = useState<CoordinatorProgramOverview | null>(null);
  const [selectedStatistic, setSelectedStatistic] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void getCoordinatorProgramOverview()
      .then((data) => active && setOverview(data))
      .catch(() => active && setError("Program overview is unavailable."));
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error && !overview) {
    return (
      <section className="coordinator-overview-state panel-card" role="alert">
        <p>{error}</p>
        <Button variant="secondary" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>
          Retry
        </Button>
      </section>
    );
  }
  if (!overview) {
    return (
      <section className="coordinator-overview-state panel-card" aria-busy="true" aria-live="polite">
        Loading program overview…
      </section>
    );
  }

  const workload = overview.adviser_workload.slice(0, 5);
  const maximum = Math.max(1, ...workload.map((item) => item.active_assignments));
  const ongoingPercent = overview.repository_status.total
    ? (overview.repository_status.ongoing / overview.repository_status.total) * 100
    : 0;
  const statistics = [
    ["Total users", overview.counts.total_users, UserRound],
    ["Active instructors", overview.counts.total_instructors, UserRoundCheck],
    ["Total advisers", overview.counts.total_advisers, UsersRound],
    ["Total studies", overview.counts.total_studies, SquareStack],
  ] as const;

  return (
    <div className="coordinator-dashboard">
      <p className="coordinator-institute-label">{overview.institute.name || "Assigned institute"}</p>
      <section className="coordinator-kpi-grid" aria-label="Program statistics">
        {statistics.map(([label, value, icon]) => (
          <DashboardKpiCard key={label} icon={icon} label={label} value={value} description="" onClick={() => setSelectedStatistic(label)} />
        ))}
      </section>
      <div className="coordinator-dashboard-grid">
        <section className="panel-card coordinator-workload-card">
          <header><div><h2>Adviser workload</h2><p>Active institute research assignments</p></div></header>
          {workload.length === 0 ? (
            <DashboardEmptyState>No active adviser assignments.</DashboardEmptyState>
          ) : (
            <div className="coordinator-workload-list">
              {workload.map((item) => (
                <div className="coordinator-workload-row" key={item.user_id}>
                  <div><strong>{item.name || item.email || "Unnamed adviser"}</strong><span>{item.email}</span></div>
                  <div className="coordinator-workload-meter" role="meter" aria-label={`${item.name || "Adviser"} active assignments`} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={item.active_assignments}>
                    <span style={{ width: `${(item.active_assignments / maximum) * 100}%` }} />
                  </div>
                  <strong>{item.active_assignments}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel-card coordinator-status-card">
          <header><h2>Research status</h2></header>
          <div className="coordinator-status-content">
            <div className="coordinator-status-donut" role="img" aria-label={`${overview.repository_status.total} studies: ${overview.repository_status.ongoing} ongoing and ${overview.repository_status.archived} archived`} style={{ background: `conic-gradient(#1f7a5a ${ongoingPercent}%, #d7a840 0)` }}>
              <span><strong>{overview.repository_status.total}</strong><small>Total studies</small></span>
            </div>
            <dl><div><dt>Ongoing</dt><dd>{overview.repository_status.ongoing}</dd></div><div><dt>Archived</dt><dd>{overview.repository_status.archived}</dd></div></dl>
          </div>
        </section>
        <section className="panel-card coordinator-activity-card">
          <header><h2>Recent research activities</h2></header>
          {overview.recent_activity.length === 0 ? <DashboardEmptyState>No recent research activities.</DashboardEmptyState> : (
            <div className="coordinator-activity-list">{overview.recent_activity.map((item) => <article key={item.id}><div><strong>{item.label}</strong><p>{item.title}</p></div><time dateTime={item.occurred_at || undefined}>{formatPhilippineDateTime(item.occurred_at)}</time></article>)}</div>
          )}
        </section>
        <nav className="panel-card coordinator-quick-actions" aria-label="Quick actions">
          <h2>Quick actions</h2>
          {(["Research Assignments", "Repository", "Reports"] as const).map((item) => <button key={item} type="button" onClick={() => selectNav(item)}>{item}<ArrowUpRight aria-hidden="true" /></button>)}
        </nav>
      </div>
      {selectedStatistic && (
        <Modal label={selectedStatistic} onClose={() => setSelectedStatistic(null)}>
          <section className="panel-card admin-data-card">
            <p>Live institute total: {statistics.find(([label]) => label === selectedStatistic)?.[1] ?? 0}</p>
          </section>
        </Modal>
      )}
    </div>
  );
}

function StatisticianDashboard({
  projection,
  navigate,
}: {
  projection: StatisticianDashboardProjection;
  navigate: (path: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "in_review">("all");
  const [activityView, setActivityView] = useState<"review" | "recent">(
    "review",
  );
  const workload = projection.workload.filter((item) => {
    if (filter === "pending") return item.review_status === "pending";
    if (filter === "in_review") {
      return ["in_progress", "returned_for_clarification"].includes(
        item.review_status,
      );
    }
    return true;
  });
  const statusTotal =
    projection.workload_status.pending +
    projection.workload_status.in_review +
    projection.workload_status.completed;
  const pendingEnd = statusTotal
    ? (projection.workload_status.pending / statusTotal) * 100
    : 0;
  const inReviewEnd = statusTotal
    ? pendingEnd + (projection.workload_status.in_review / statusTotal) * 100
    : 0;
  const activityMaximum = Math.max(
    1,
    ...projection.activity.months.flatMap((month) => [
      month.started,
      month.completed,
    ]),
  );
  const hasActivity = projection.activity.months.some(
    (month) => month.started > 0 || month.completed > 0,
  );

  return (
    <div
      className="statistician-dashboard"
      data-testid="statistician-dashboard"
    >
      <div className="statistician-kpi-grid">
        <DashboardKpiCard
          icon={SquareStack}
          label="Assigned studies"
          value={projection.counts.assigned}
          description="Total studies under your work"
        />
        <DashboardKpiCard
          icon={Clock3}
          label="Pending reviews"
          value={projection.counts.pending}
          description="Awaiting methodology review"
        />
        <DashboardKpiCard
          icon={ClipboardCheck}
          label="For sign-off"
          value={projection.counts.for_sign_off}
          description="Reviews ready for your sign-off"
        />
        <DashboardKpiCard
          icon={CheckCircle2}
          label="Completed"
          value={projection.counts.completed}
          description="Reviews completed and signed off"
        />
      </div>

      <section
        className="statistician-workload-card"
        data-testid="statistician-workload-card"
      >
        <div className="statistician-workload-main">
          <header className="statistician-section-heading">
            <h2>Current workload</h2>
            <div
              className="statistician-workload-filters"
              aria-label="Workload filters"
            >
              {(["all", "pending", "in_review"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === "all"
                    ? "All"
                    : value === "pending"
                      ? "Pending"
                      : "In review"}
                </button>
              ))}
            </div>
          </header>
          {workload.length === 0 ? (
            <DashboardEmptyState>
              No methodology reviews are currently assigned to you.
            </DashboardEmptyState>
          ) : (
            <>
              <div
                className="statistician-workload-table"
                role="table"
                aria-label="Current methodology workload"
              >
                <div className="statistician-workload-head" role="row">
                  <span role="columnheader">Study</span>
                  <span role="columnheader">Stage</span>
                  <span role="columnheader">Due date</span>
                  <span role="columnheader">Action</span>
                </div>
                {workload.map((item) => (
                  <StatisticianWorkloadRow
                    key={item.research_document_id}
                    item={item}
                    onOpen={() =>
                      navigate(`/research/${item.research_document_id}`)
                    }
                  />
                ))}
              </div>
              <p className="statistician-workload-summary">
                Showing {workload.length} of {projection.workload.length}{" "}
                assigned {projection.workload.length === 1 ? "study" : "studies"}
              </p>
            </>
          )}
        </div>

        <aside
          className="statistician-workload-status"
          aria-labelledby="statistician-workload-status-title"
        >
          <h2 id="statistician-workload-status-title">Workload status</h2>
          {statusTotal === 0 ? (
            <DashboardEmptyState className="statistician-status-empty">
              No workload status is available.
            </DashboardEmptyState>
          ) : (
            <div className="statistician-status-visual">
              <div
                className="statistician-donut"
                role="img"
                aria-label={`Workload status: ${projection.workload_status.pending} pending, ${projection.workload_status.in_review} in review, ${projection.workload_status.completed} completed`}
                style={
                  {
                    "--pending-end": `${pendingEnd}%`,
                    "--review-end": `${inReviewEnd}%`,
                  } as CSSProperties
                }
              >
                <span>
                  <strong>{statusTotal}</strong>
                  <small>Total reviews</small>
                </span>
              </div>
              <dl className="statistician-status-legend">
                {(
                  [
                    ["Pending", projection.workload_status.pending],
                    ["In review", projection.workload_status.in_review],
                    ["Completed", projection.workload_status.completed],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>
      </section>

      <section
        className="statistician-activity-card"
        data-testid="statistician-activity-card"
      >
        <header className="statistician-activity-heading">
          <h2>Activity</h2>
          <div className="statistician-activity-tabs" aria-label="Activity view">
            <button
              type="button"
              aria-pressed={activityView === "review"}
              onClick={() => setActivityView("review")}
            >
              Review activity
            </button>
            <button
              type="button"
              aria-pressed={activityView === "recent"}
              onClick={() => setActivityView("recent")}
            >
              Recent activity
            </button>
          </div>
        </header>
        <div className="statistician-activity-layout">
          <div
            className={`statistician-review-activity ${activityView === "review" ? "is-selected" : ""}`}
          >
            {!hasActivity ? (
              <div className="statistician-activity-empty">
                <LineChart aria-hidden="true" />
                <p>No review activity in the last 6 months.</p>
              </div>
            ) : (
              <>
                <div className="statistician-activity-chart" aria-hidden="true">
                  {projection.activity.months.map((month) => (
                    <div key={month.key}>
                      <span className="statistician-activity-bars">
                        <i
                          style={{
                            height: `${(month.completed / activityMaximum) * 100}%`,
                          }}
                        />
                        <b
                          style={{
                            height: `${(month.started / activityMaximum) * 100}%`,
                          }}
                        />
                      </span>
                      <small>{month.label}</small>
                    </div>
                  ))}
                </div>
                <div className="statistician-activity-legend">
                  <span>
                    <i /> Completed
                  </span>
                  <span>
                    <b /> Reviews started
                  </span>
                </div>
                <table className="sr-only">
                  <caption>Review activity for the last six months</caption>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Completed</th>
                      <th>Reviews started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.activity.months.map((month) => (
                      <tr key={month.key}>
                        <th>{month.label}</th>
                        <td>{month.completed}</td>
                        <td>{month.started}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <aside
            className={`statistician-recent-activity ${activityView === "recent" ? "is-selected" : ""}`}
            aria-labelledby="statistician-recent-activity-title"
          >
            <h3 id="statistician-recent-activity-title">Recent activity</h3>
            {projection.recent_activity.length === 0 ? (
              <DashboardEmptyState className="statistician-recent-empty">
                No recent statistician activity.
              </DashboardEmptyState>
            ) : (
              <ol className="statistician-recent-list">
                {projection.recent_activity.map((activity) => (
                  <li key={activity.id}>
                    <span aria-hidden="true" />
                    <div>
                      <strong>{statisticianActivityLabel(activity.type)}</strong>
                      <p title={activity.title}>{activity.title}</p>
                    </div>
                    <time dateTime={activity.occurred_at}>
                      {formatDate(activity.occurred_at)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function StatisticianWorkloadRow({
  item,
  onOpen,
}: {
  item: StatisticianDashboardWorkloadItem;
  onOpen: () => void;
}) {
  const inReview = ["in_progress", "returned_for_clarification"].includes(
    item.review_status,
  );
  return (
    <div className="statistician-workload-row" role="row">
      <span role="cell" className="statistician-study-title" title={item.title}>
        {item.title}
      </span>
      <span role="cell">
        <span
          className={`statistician-status-badge ${inReview ? "is-review" : "is-pending"}`}
        >
          {inReview ? "In review" : "Pending"}
        </span>
      </span>
      <span role="cell">
        {item.due_at ? formatDate(item.due_at) : "No due date"}
      </span>
      <span role="cell">
        <Button onClick={onOpen}>{inReview ? "Open" : "Review"}</Button>
      </span>
    </div>
  );
}

function statisticianActivityLabel(
  type: StatisticianDashboardProjection["recent_activity"][number]["type"],
) {
  return {
    study_assigned: "Study assigned",
    review_started: "Review started",
    review_completed: "Review completed",
    sign_off_requested: "Sign-off requested",
    sign_off_completed: "Sign-off completed",
  }[type];
}

function LibrarianDashboard({
  projection,
  navigate,
}: {
  projection: LibrarianDashboardProjection;
  navigate: (path: string) => void;
}) {
  const [queueFilter, setQueueFilter] = useState<
    "all" | "pending" | "ready"
  >("all");
  const queue = projection.queue.filter((item) => {
    if (queueFilter === "pending") {
      return ["pending", "validating"].includes(item.status);
    }
    if (queueFilter === "ready") return item.status === "ready";
    return true;
  });
  const queueTotal =
    projection.queue_status.pending +
    projection.queue_status.validating +
    projection.queue_status.ready;
  const pendingEnd = queueTotal
    ? (projection.queue_status.pending / queueTotal) * 100
    : 0;
  const validatingEnd = queueTotal
    ? pendingEnd + (projection.queue_status.validating / queueTotal) * 100
    : 0;

  return (
    <div className="librarian-dashboard" data-testid="librarian-dashboard">
      <div className="librarian-kpi-grid">
        <DashboardKpiCard
          icon={SquareStack}
          label="Archiving queue"
          value={projection.counts.archiving_queue}
          description="Studies awaiting review."
        />
        <DashboardKpiCard
          icon={Tags}
          label="Metadata validation"
          value={projection.counts.metadata_validation}
          description="Records requiring validation."
        />
        <DashboardKpiCard
          icon={Database}
          label="Repository records"
          value={projection.counts.repository_records}
          description="Total records in the repository."
        />
        <DashboardKpiCard
          icon={CheckCircle2}
          label="Archived this month"
          value={projection.counts.archived_this_month}
          description="Studies archived this month."
        />
      </div>

      <section className="librarian-queue-card" data-testid="librarian-queue-card">
        <div className="librarian-queue-main">
          <header className="librarian-section-heading">
            <h2>Archiving queue</h2>
            <div className="librarian-queue-filters" aria-label="Queue filters">
              {(["all", "pending", "ready"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={queueFilter === value}
                  onClick={() => setQueueFilter(value)}
                >
                  {value === "all"
                    ? "All"
                    : value === "pending"
                      ? "Pending"
                      : "Ready"}
                </button>
              ))}
            </div>
          </header>
          {queue.length === 0 ? (
            <DashboardEmptyState>
              No studies are currently awaiting librarian review.
            </DashboardEmptyState>
          ) : (
            <div
              className="librarian-queue-table"
              role="table"
              aria-label="Archiving queue"
            >
              <div className="librarian-queue-head" role="row">
                <span role="columnheader">Study</span>
                <span role="columnheader">Submitted by</span>
                <span role="columnheader">Stage</span>
                <span role="columnheader">Action</span>
              </div>
              {queue.map((item) => (
                <div
                  className="librarian-queue-row"
                  role="row"
                  key={item.research_document_id}
                >
                  <span role="cell" title={item.title}>
                    {item.title}
                  </span>
                  <span role="cell">{item.submitted_by}</span>
                  <span role="cell">
                    <span className={`librarian-status-badge is-${item.status}`}>
                      {item.status === "validating"
                        ? "Validating"
                        : item.status === "ready"
                          ? "Ready"
                          : "Pending"}
                    </span>
                  </span>
                  <span role="cell">
                    <Button
                      onClick={() =>
                        navigate(`/research/${item.research_document_id}`)
                      }
                    >
                      {item.status === "ready" ? "Open" : "Review"}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="librarian-queue-summary">
          <h2>Queue status</h2>
          {queueTotal === 0 ? (
            <DashboardEmptyState>No active archiving requests.</DashboardEmptyState>
          ) : (
            <div className="librarian-status-visual">
              <div
                className="librarian-donut"
                role="img"
                aria-label={`Queue status: ${projection.queue_status.pending} pending, ${projection.queue_status.validating} validating, ${projection.queue_status.ready} ready`}
                style={
                  {
                    "--pending-end": `${pendingEnd}%`,
                    "--validating-end": `${validatingEnd}%`,
                  } as CSSProperties
                }
              >
                <span>
                  <strong>{queueTotal}</strong>
                  <small>Total requests</small>
                </span>
              </div>
              <dl className="librarian-status-legend">
                {(
                  [
                    ["Pending", projection.queue_status.pending],
                    ["Validating", projection.queue_status.validating],
                    ["Ready", projection.queue_status.ready],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>
      </section>

      <section
        className="librarian-recent-activity librarian-recent-activity-card"
        data-testid="librarian-recent-activity-card"
      >
          <h2>Recent activity</h2>
          {projection.recent_activity.length === 0 ? (
            <DashboardEmptyState>No recent librarian activity.</DashboardEmptyState>
          ) : (
            <ol className="librarian-recent-list">
              {projection.recent_activity.map((item) => (
                <li key={item.id}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{librarianActivityLabel(item.type)}</strong>
                    <p title={item.title}>{item.title}</p>
                  </div>
                  <time dateTime={item.occurred_at}>{formatDate(item.occurred_at)}</time>
                </li>
              ))}
            </ol>
          )}
      </section>
    </div>
  );
}

function librarianActivityLabel(
  type: LibrarianDashboardProjection["recent_activity"][number]["type"],
) {
  return {
    record_archived: "Record archived",
    metadata_updated: "Metadata updated",
    record_returned: "Record returned for correction",
    archiving_review_completed: "Archiving review completed",
  }[type];
}

function PanelDashboardOperations({
  sections,
  config,
  selectNav,
}: {
  sections: RoleDashboardSection[];
  config: WorkspaceConfig;
  selectNav: (item: string) => void;
}) {
  const assigned = availableDashboardSections(sections).find(
    (section) => section.key === "assigned_manuscripts",
  );
  const assignedTitle =
    config.sections.assigned_manuscripts?.title ?? "Assigned manuscripts";
  const actions = [
    { label: "Assigned Research", icon: BookOpen },
    { label: "User Logs", icon: History },
  ] as const;

  return (
    <div className="panel-dashboard-operations">
      <section className="panel-dashboard-workload">
        <header>
          <p className="eyebrow">Workload</p>
          <h2>Current workload</h2>
        </header>
        <div>
          <span>{assignedTitle}</span>
          <strong aria-label={`${assignedTitle}: ${assigned?.total ?? 0} total`}>
            {assigned?.total ?? 0}
          </strong>
        </div>
        <button type="button" onClick={() => selectNav("Assigned Research")}>
          Open Assigned Research <ArrowUpRight aria-hidden="true" />
        </button>
      </section>
      <section className="panel-dashboard-tools">
        <header>
          <p className="eyebrow">Shortcuts</p>
          <h2>Panel tools</h2>
        </header>
        <div>
          {actions.map(({ label, icon: Icon }) => (
            <button key={label} type="button" onClick={() => selectNav(label)}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              <ArrowUpRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function PanelDashboard({
  projection,
  selectNav,
}: {
  projection: PanelDashboardProjection;
  selectNav: (item: string) => void;
}) {
  const totalReviews = projection.counts.pending + projection.counts.completed;
  const completedShare = totalReviews
    ? (projection.counts.completed / totalReviews) * 100
    : 0;

  return (
    <div className="panel-dashboard" data-testid="panel-dashboard">
      <div className="panel-dashboard-kpi-grid">
        <DashboardKpiCard icon={SquareStack} label="Assigned studies" value={projection.counts.assigned} description="Active studies assigned to you." />
        <DashboardKpiCard icon={Clock3} label="Pending reviews" value={projection.counts.pending} description="Studies awaiting your review." />
        <DashboardKpiCard icon={CheckCircle2} label="Completed reviews" value={projection.counts.completed} description="Studies with finalized reviews." />
      </div>

      <div className="panel-dashboard-main-grid">
        <section className="dashboard-section-card panel-dashboard-assignments">
          <header>
            <h2>Current assignments</h2>
            <button type="button" onClick={() => selectNav("Assigned Research")}>View all assignments <ArrowUpRight aria-hidden="true" /></button>
          </header>
          {projection.assignments.length === 0 ? (
            <DashboardEmptyState><strong>No assigned studies</strong><span>New panel assignments will appear here.</span></DashboardEmptyState>
          ) : (
            <div className="panel-dashboard-assignment-table" role="table" aria-label="Current assignments">
              <div className="panel-dashboard-assignment-head" role="row">
                <span role="columnheader">Study</span><span role="columnheader">Defense stage</span><span role="columnheader">Status</span><span role="columnheader">Action</span>
              </div>
              {projection.assignments.map((assignment) => (
                <div className="panel-dashboard-assignment-row" role="row" key={assignment.research_document_id}>
                  <span role="cell" className="panel-dashboard-assignment-copy"><strong title={assignment.title}>{assignment.title}</strong>{assignment.submission_reference && <small>{assignment.submission_reference}</small>}</span>
                  <span role="cell">{defenseStageLabel(assignment.defense_stage)}</span>
                  <span role="cell"><span className={`panel-review-status is-${assignment.review_status}`}>{assignment.review_status === "pending" ? "Pending review" : "Completed"}</span></span>
                  <span role="cell"><button type="button" onClick={() => selectNav("Assigned Research")}>{assignment.review_status === "pending" ? "Open review" : "View review"}</button></span>
                </div>
              ))}
              <p className="panel-dashboard-assignment-summary">Showing {projection.assignments.length} assigned {projection.assignments.length === 1 ? "study" : "studies"}</p>
            </div>
          )}
        </section>

        <aside className="dashboard-section-card panel-dashboard-status" aria-labelledby="panel-review-status-title">
          <h2 id="panel-review-status-title">Review status</h2>
          {totalReviews === 0 ? <DashboardEmptyState>No review status is available.</DashboardEmptyState> : (
            <div className="panel-dashboard-status-summary">
              <div className="panel-dashboard-donut" role="img" aria-label={`${projection.counts.pending} pending reviews and ${projection.counts.completed} completed reviews`} style={{ "--completed-share": `${completedShare}%` } as CSSProperties}><span><strong>{totalReviews}</strong><small>Total reviews</small></span></div>
              <dl><div><dt>Pending reviews</dt><dd>{projection.counts.pending}</dd></div><div><dt>Completed</dt><dd>{projection.counts.completed}</dd></div></dl>
            </div>
          )}
        </aside>
      </div>

      <div className="panel-dashboard-lower-grid">
        <section className="dashboard-section-card panel-dashboard-activity">
          <header><h2>Recent activity</h2></header>
          {projection.recent_activity.length === 0 ? <DashboardEmptyState>No recent panel activity.</DashboardEmptyState> : (
            <ol>{projection.recent_activity.map((activity) => <li key={activity.id}><span aria-hidden="true" /><div><strong>{activity.type === "study_assigned" ? "Study assigned" : "Evaluation submitted"}</strong><span title={activity.title}>{activity.title}</span></div><time dateTime={activity.occurred_at}>{formatDate(activity.occurred_at)}</time></li>)}</ol>
          )}
        </section>
        <section className="dashboard-section-card panel-dashboard-repository" aria-label="Repository access">
          <LibraryBig aria-hidden="true" /><div><h2>Repository access</h2><p>{projection.counts.repository_references} archived studies available for reference.</p></div>
          <button type="button" onClick={() => selectNav("Repository")}>Browse repository <ArrowUpRight aria-hidden="true" /></button>
        </section>
      </div>
    </div>
  );
}

function OfficeDashboardOperations({
  sections,
  config,
  selectNav,
}: {
  sections: RoleDashboardSection[];
  config: WorkspaceConfig;
  selectNav: (item: string) => void;
}) {
  const actions = [
    { label: "Assigned Research", icon: BookOpen },
    { label: "Manage Repository", icon: FolderKanban },
    { label: "Similarity Check", icon: Search },
    { label: "Reports & Exports", icon: BarChart3 },
  ] as const;

  return (
    <section
      className="office-dashboard-operations"
      aria-label="Dashboard tools"
    >
      <DashboardWorkloadChart sections={sections} config={config} />
      <nav
        className="office-dashboard-quick-actions"
        aria-label="Quick actions"
      >
        <header>
          <p className="eyebrow">Shortcuts</p>
          <h3>Quick actions</h3>
        </header>
        <div>
          {actions.map(({ label, icon: Icon }) => (
            <button key={label} type="button" onClick={() => selectNav(label)}>
              <span aria-hidden="true">
                <Icon />
              </span>
              <strong>{label}</strong>
              <ArrowUpRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </nav>
    </section>
  );
}

function OfficeInstitutionalOverview({
  studiesByInstitute,
  onReload,
}: {
  studiesByInstitute: OfficeInstituteStudies;
  onReload: (code: string) => Promise<void>;
}) {
  const [selectedInstitute, setSelectedInstitute] = useState<string | null>(
    null,
  );
  const [studyQuery, setStudyQuery] = useState("");
  const [debouncedStudyQuery, setDebouncedStudyQuery] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedStudyQuery(studyQuery);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [studyQuery]);

  function selectInstitute(code: string) {
    if (selectedInstitute === code) {
      setSelectedInstitute(null);
      setStudyQuery("");
      setDebouncedStudyQuery("");
      return;
    }
    setSelectedInstitute(code);
    setStudyQuery("");
    setDebouncedStudyQuery("");
  }

  function closeInstituteStudies() {
    setSelectedInstitute(null);
    setStudyQuery("");
    setDebouncedStudyQuery("");
  }

  const selectedInstituteName = OFFICE_INSTITUTES.find(
    (institute) => institute.code === selectedInstitute,
  )?.name;
  const selectedStudies = selectedInstitute
    ? studiesByInstitute[selectedInstitute]
    : undefined;
  const normalizedStudyQuery = debouncedStudyQuery.trim().toLocaleLowerCase();
  const filteredStudies = Array.isArray(selectedStudies)
    ? selectedStudies.filter((study) =>
        `${study.title} ${study.year}`
          .toLocaleLowerCase()
          .includes(normalizedStudyQuery),
      )
    : [];

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
              Select an institute to browse its research studies and manuscript
              files.
            </p>
          </div>
        </header>
        <div className="office-institute-grid">
          {OFFICE_INSTITUTES.map((institute) => {
            const studies = studiesByInstitute[institute.code];
            const total = Array.isArray(studies) ? studies.length : null;
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
                  <AnimatedStat value={total} placeholder="-" />
                  <span>
                    {studies === undefined
                      ? "Loading studies"
                      : studies === null
                        ? "Studies unavailable"
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
                <p className="eyebrow">Research manuscripts</p>
                <h3>{selectedInstituteName}</h3>
                <p>
                  Select a study to choose which file to open, or download all
                  study files as a ZIP archive.
                </p>
              </div>
            </header>
            {selectedStudies === undefined ? (
              <p className="office-institute-message">Loading studies...</p>
            ) : selectedStudies === null ? (
              <div className="office-institute-message" role="alert">
                <p>Studies could not be loaded from ResearchNAV.</p>
                <Button
                  variant="secondary"
                  onClick={() => void onReload(selectedInstitute)}
                >
                  Retry
                </Button>
              </div>
            ) : selectedStudies.length === 0 ? (
              <p className="office-institute-message">
                No studies are stored for this institute.
              </p>
            ) : (
              <>
                <div className="office-study-search">
                  <Search aria-hidden="true" />
                  <input
                    type="search"
                    value={studyQuery}
                    onChange={(event) => setStudyQuery(event.target.value)}
                    aria-label={`Search ${selectedInstituteName} studies`}
                    placeholder="Search by title or year..."
                    autoComplete="off"
                  />
                  <span aria-live="polite">
                    {filteredStudies.length} of {selectedStudies.length}
                  </span>
                </div>
                {filteredStudies.length === 0 ? (
                  <p className="office-institute-message">
                    No studies match your search.
                  </p>
                ) : (
                  <div className="office-study-list" aria-label="Studies">
                    {filteredStudies.map((study) => (
                      <a
                        className="office-study-item"
                        key={study.id}
                        href={officeInstituteStudyOpenUrl(
                          selectedInstitute,
                          study,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="office-study-year">{study.year}</span>
                        <strong>{study.title}</strong>
                        <ExternalLink aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
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
  instituteTotals,
}: {
  instituteTotals?: Array<{ institute: string; total: number }> | null;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [chartProgress, setChartProgress] = useState(0);
  const totals = new Map(
    (instituteTotals ?? []).map((item) => [item.institute, item.total]),
  );
  const points = OFFICE_INSTITUTES.map((institute) => ({
    ...institute,
    total: totals.get(institute.name) ?? 0,
  }));
  const unassignedTotal = totals.get("Unassigned / Other") ?? 0;
  const allUnavailable = !instituteTotals;
  const maximum = Math.max(1, ...points.map((point) => point.total));
  const plotWidth =
    INSTITUTE_CHART_WIDTH - INSTITUTE_CHART_LEFT - INSTITUTE_CHART_RIGHT;
  const plotHeight =
    INSTITUTE_CHART_HEIGHT - INSTITUTE_CHART_TOP - INSTITUTE_CHART_BOTTOM;
  const x = (index: number) =>
    INSTITUTE_CHART_LEFT + (index * plotWidth) / (points.length - 1);
  const animatedY = (total: number) =>
    INSTITUTE_CHART_TOP +
    plotHeight -
    (total / maximum) * plotHeight * chartProgress;
  const line = points
    .map((point, index) => `${x(index)},${animatedY(point.total)}`)
    .join(" ");
  const area = `${INSTITUTE_CHART_LEFT},${INSTITUTE_CHART_TOP + plotHeight} ${line} ${INSTITUTE_CHART_LEFT + plotWidth},${INSTITUTE_CHART_TOP + plotHeight}`;

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setChartProgress(1));
      return () => cancelAnimationFrame(frame);
    }
    const duration = 1150;
    const start = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const bounce =
        elapsed < 1 ? Math.sin(elapsed * Math.PI * 3) * 0.04 * elapsed : 0;
      setChartProgress(Math.min(1, Math.max(0, eased + bounce)));
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <figure
      ref={figureRef}
      className={`office-institute-analytics${visible ? " is-visible" : ""}`}
    >
      <figcaption>
        <div>
          <p className="eyebrow">Research analytics</p>
          <h2>Manuscripts by institute</h2>
          <p>Live distribution based on archived ResearchNAV studies.</p>
        </div>
        <span
          className="office-institute-grand-total"
          aria-label={`${points.reduce(
            (sum, point) => sum + point.total,
            unassignedTotal,
          )} total`}
        >
          <AnimatedStat
            value={points.reduce(
              (sum, point) => sum + point.total,
              unassignedTotal,
            )}
          />{" "}
          <span aria-hidden="true">total</span>
        </span>
      </figcaption>
      {allUnavailable ? (
        <p className="office-institute-message">
          Research analytics are unavailable.
        </p>
      ) : (
        <div className="office-institute-chart-scroll">
          <svg
            viewBox={`0 0 ${INSTITUTE_CHART_WIDTH} ${INSTITUTE_CHART_HEIGHT}`}
            role="img"
            aria-label="Research manuscripts by institute"
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
              <g
                className="office-institute-point-group"
                style={
                  {
                    "--point-index": index,
                  } as CSSProperties
                }
                key={point.code}
              >
                <circle
                  className="office-institute-point"
                  cx={x(index)}
                  cy={animatedY(point.total)}
                  r="6"
                />
                <text
                  className="office-institute-point-value"
                  x={x(index)}
                  y={Math.max(17, animatedY(point.total) - 13)}
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

const CHART_WIDTH = 760;
const CHART_HEIGHT = 250;
const CHART_LEFT = 48;
const CHART_RIGHT = 26;
const CHART_TOP = 40;
const CHART_BOTTOM = 48;

function niceChartMaximum(value: number) {
  if (value <= 5) return Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const rounded = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function DashboardAnalytics({
  analytics,
  fitToContainer = false,
  showTotal = true,
}: {
  analytics: RoleDashboardAnalytics;
  fitToContainer?: boolean;
  showTotal?: boolean;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(CHART_WIDTH);
  const [activeTooltip, setActiveTooltip] = useState<{
    index: number;
    label: string;
    values: number[];
  } | null>(null);
  const chartSeries = analytics.series;
  const allValues = chartSeries.flatMap((series) =>
    series.points.map((point) => point.value),
  );
  const niceMaximum = niceChartMaximum(Math.max(0, ...allValues));
  const maximum = fitToContainer
    ? Math.max(2, Math.ceil(niceMaximum / 2) * 2)
    : niceMaximum;
  const labels = Array.from(
    new Map(
      analytics.series
        .flatMap((series) => series.points)
        .map((point) => [point.key, point]),
    ).values(),
  ).sort((left, right) => left.key.localeCompare(right.key));
  const chartWidth = fitToContainer ? containerWidth : CHART_WIDTH;
  const chartHeight = fitToContainer ? 280 : CHART_HEIGHT;
  const chartLeft = fitToContainer ? 58 : CHART_LEFT;
  const chartRight = fitToContainer ? 42 : CHART_RIGHT;
  const chartTop = fitToContainer ? 42 : CHART_TOP;
  const chartBottom = fitToContainer ? 52 : CHART_BOTTOM;
  const plotWidth = chartWidth - chartLeft - chartRight;
  const plotHeight = chartHeight - chartTop - chartBottom;
  const gridValues = Array.from(new Set([maximum, Math.round(maximum / 2), 0]));
  const total = analytics.series.reduce(
    (sum, series) =>
      sum +
      series.points.reduce((seriesSum, point) => seriesSum + point.value, 0),
    0,
  );
  const groupWidth = plotWidth / Math.max(labels.length, 1);
  const barGap = Math.min(8, groupWidth * 0.08);
  const barWidth = Math.min(
    44,
    Math.max(4, (groupWidth * 0.58 - barGap) / Math.max(chartSeries.length, 1)),
  );
  const barsWidth =
    chartSeries.length * barWidth +
    Math.max(0, chartSeries.length - 1) * barGap;
  const x = (index: number) => chartLeft + groupWidth * (index + 0.5);
  const finalY = (value: number) =>
    chartTop + plotHeight - (value / maximum) * plotHeight;

  useEffect(() => {
    const plot = plotRef.current;
    if (!fitToContainer || !plot) return;
    const measure = () => {
      const width = Math.round(plot.getBoundingClientRect().width);
      if (width > 0) setContainerWidth(Math.max(240, width));
    };
    const frame = requestAnimationFrame(measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(plot);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fitToContainer]);

  return (
    <figure
      ref={figureRef}
      className="dashboard-analytics office-institute-analytics"
      aria-labelledby="dashboard-analytics-title"
    >
      <figcaption>
        <div>
          <p className="eyebrow">{showTotal ? "Analytics" : "Trend"}</p>
          <h2 id="dashboard-analytics-title">{analytics.title}</h2>
          <p>{analytics.period}, based on records visible to this workspace.</p>
        </div>
        <div className="dashboard-analytics-summary">
          {showTotal && (
            <span
              className="office-institute-grand-total"
              aria-label={`${total} total activity`}
            >
              <AnimatedStat value={total} />{" "}
              <span aria-hidden="true">total</span>
            </span>
          )}
          <div className="dashboard-analytics-legend" aria-label="Chart legend">
            {chartSeries.map((series, index) => (
              <span
                key={series.key}
                className={`analytics-series-${index + 1}`}
              >
                <i aria-hidden="true" /> {series.label}
              </span>
            ))}
          </div>
        </div>
      </figcaption>

      <div className="dashboard-bar-chart" ref={plotRef}>
        {activeTooltip && (
          <div
            id="dashboard-activity-tooltip"
            className="dashboard-activity-tooltip"
            role="tooltip"
            style={{
              left: `${((activeTooltip.index + 0.5) / Math.max(labels.length, 1)) * 100}%`,
            }}
          >
            <strong>{activeTooltip.label}</strong>
            {chartSeries.map((series, seriesIndex) => (
              <span key={series.key}>
                {series.label}:{" "}
                {activeTooltip.values[seriesIndex].toLocaleString()}
              </span>
            ))}
          </div>
        )}
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label={`${analytics.title}, ${analytics.period}`}
        >
          {gridValues.map((value) => {
            const gridY = finalY(value);
            return (
              <g key={value}>
                <line
                  className="analytics-grid-line"
                  x1={chartLeft}
                  x2={chartWidth - chartRight}
                  y1={gridY}
                  y2={gridY}
                />
                {(value > 0 || fitToContainer) && (
                  <text
                    className="analytics-axis-value"
                    x={chartLeft - 10}
                    y={gridY + 4}
                  >
                    {value.toLocaleString()}
                  </text>
                )}
              </g>
            );
          })}

          {labels.map((label, index) => {
            const values = chartSeries.map(
              (series) =>
                series.points.find((point) => point.key === label.key)?.value ??
                0,
            );
            const tooltip = [
              label.label,
              ...chartSeries.map(
                (series, seriesIndex) =>
                  `${series.label}: ${values[seriesIndex].toLocaleString()}`,
              ),
            ].join("\n");
            return (
              <g
                key={label.key}
                className="analytics-bar-group"
                tabIndex={0}
                role="group"
                aria-label={tooltip.replaceAll("\n", ", ")}
                aria-describedby={
                  activeTooltip?.index === index
                    ? "dashboard-activity-tooltip"
                    : undefined
                }
                onMouseEnter={() =>
                  setActiveTooltip({ index, label: label.label, values })
                }
                onMouseLeave={() => setActiveTooltip(null)}
                onFocus={() =>
                  setActiveTooltip({ index, label: label.label, values })
                }
                onBlur={() => setActiveTooltip(null)}
              >
                <title>{tooltip}</title>
                {chartSeries.map((series, seriesIndex) => {
                  const value = values[seriesIndex];
                  const height = (value / maximum) * plotHeight;
                  const barX =
                    x(index) -
                    barsWidth / 2 +
                    seriesIndex * (barWidth + barGap);
                  return (
                    <rect
                      key={series.key}
                      className={`analytics-bar analytics-series-${seriesIndex + 1}`}
                      data-month={label.key}
                      data-value={value}
                      x={barX}
                      y={chartTop + plotHeight - height}
                      width={barWidth}
                      height={height}
                      rx={Math.min(4, barWidth / 4)}
                    />
                  );
                })}
              </g>
            );
          })}

          {labels.map((point, index) => (
            <text
              key={point.key}
              className="analytics-axis-label"
              x={x(index)}
              y={chartHeight - 13}
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
          {labels.map((point) => (
            <tr key={point.key}>
              <th>{point.label}</th>
              {analytics.series.map((series) => (
                <td key={series.key}>
                  {series.points.find((item) => item.key === point.key)
                    ?.value ?? 0}
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
  eyebrow = "Live overview",
  title = "Statistics",
  titleHidden = false,
  variant,
}: {
  sections: RoleDashboardSection[];
  config: WorkspaceConfig;
  onSelect?: (section: RoleDashboardSection) => void;
  eyebrow?: string;
  title?: string;
  titleHidden?: boolean;
  variant?: "attention" | "repository";
}) {
  const available = availableDashboardSections(sections);

  if (available.length === 0) return null;

  return (
    <section
      className={`dashboard-statistics${variant ? ` admin-dashboard-statistics admin-dashboard-statistics-${variant}` : ""}`}
      aria-labelledby={`dashboard-statistics-${variant ?? "default"}-title`}
    >
      <header>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2
            id={`dashboard-statistics-${variant ?? "default"}-title`}
            className={titleHidden ? "sr-only" : undefined}
          >
            {title}
          </h2>
        </div>
        {!variant && <p>Current totals for this role workspace.</p>}
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
  const allEmpty = available.every((section) => section.total === 0);

  return (
    <figure className="dashboard-chart">
      <figcaption>
        <div>
          <p className="eyebrow">Distribution</p>
          <h3>Current workload</h3>
        </div>
      </figcaption>
      {allEmpty && (
        <p className="dashboard-chart-empty" role="status">
          No actionable workload is currently pending.
        </p>
      )}
      <div className="dashboard-chart-bars">
        {available.map((section) => {
          const title =
            config.sections[section.key]?.title ?? humanize(section.key);

          return (
            <div key={section.key} className="dashboard-chart-row">
              <div className="dashboard-chart-label">
                <span>{title}</span>
                <strong aria-label={`${title}: ${section.total} total`}>
                  {section.total} total
                </strong>
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
                {(
                  ["admin", "adviser", "panel", "research-office"] as Role[]
                ).includes(role) &&
                  config.internalRecord && (
                    <button
                      className="icon-button dashboard-record-icon-action"
                      aria-label={
                        role === "adviser" || role === "panel"
                          ? "Open review"
                          : "Open internal record"
                      }
                      title={
                        role === "adviser" || role === "panel"
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
  return formatPhilippineDate(value);
}
