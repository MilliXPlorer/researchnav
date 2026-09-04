import { Archive, ArrowRight, LibraryBig, ShieldCheck } from "lucide-react";
import { Button } from "./components";
import AdminResearchWorkspace from "./AdminResearchWorkspace";
import InstructorResearchReview from "./InstructorResearchReview";
import ResearcherResearchWorkspace from "./ResearcherResearchWorkspace";
import SimilarityResults from "./SimilarityResults";
import {
  ApiError,
  type RoleDashboard,
  type RoleDashboardAnalytics,
  type RoleDashboardSection,
} from "./api";
import type { Role } from "./types";

export type RoleDashboardLoadState =
  | { scope: string; status: "loading" }
  | { scope: string; status: "ready"; dashboard: RoleDashboard }
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

export default function RoleWorkspace({
  role,
  navigate,
  selectNav,
  dashboardScope,
  dashboardState,
  onRetry,
  researchDocumentId,
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

  return (
    <RoleDashboardWorkspace
      role={role}
      navigate={navigate}
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
          <Button onClick={() => selectNav("My Submissions")}>
            New submission <ArrowRight />
          </Button>
        }
      />
      <DashboardSections
        role="researcher"
        config={config}
        navigate={navigate}
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
};

type WorkspaceConfig = {
  eyebrow: string;
  title: string;
  description: string;
  sections: Record<string, SectionConfig>;
};

const workspaceConfigs: Record<Role, WorkspaceConfig> = {
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
      active_accounts: {
        title: "Active accounts",
        description: "Accounts with active access.",
      },
      pending_accounts: {
        title: "Pending accounts",
        description: "Invited or blocked accounts awaiting attention.",
      },
      audit_events: {
        title: "Audit events",
        description: "Recorded system activity.",
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
      },
      invited_instructors: {
        title: "Invited instructors",
        description: "Instructors awaiting activation.",
      },
      blocked_instructors: {
        title: "Blocked instructors",
        description: "Instructors without active access.",
      },
      schedules: {
        title: "Schedules",
        description: "Program scheduling information.",
      },
      duplicate_flags: {
        title: "Duplicate flags",
        description: "Duplicate-review information.",
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
      },
      repository_records: {
        title: "Repository records",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
    },
  },
  "research-office": {
    eyebrow: "Research Office / Compliance review",
    title: "Institutional research oversight.",
    description: "Live submission, revision, and archiving queues.",
    sections: {
      submission_queue: {
        title: "Submission queue",
        description: "Submitted research awaiting institutional review.",
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
        description: "Archived research records.",
        catalog: true,
      },
    },
  },
  academics: {
    eyebrow: "My library",
    title: "Your research reading room.",
    description: "Repository references and available library information.",
    sections: {
      repository_references: {
        title: "Repository references",
        description: "Archived research available in the catalog.",
        catalog: true,
      },
      saved_library: {
        title: "Saved library",
        description: "Saved research in your library.",
      },
      recommendations: {
        title: "Recommendations",
        description: "Research recommendations for your library.",
      },
    },
  },
};

function RoleDashboardWorkspace({
  role,
  navigate,
  dashboardScope,
  dashboardState,
  onRetry,
}: Omit<WorkspaceProps, "selectNav" | "researchDocumentId"> & {
  role: Exclude<Role, "researcher">;
}) {
  const config = workspaceConfigs[role];
  const action =
    role === "librarian" ? (
      <Button variant="secondary" onClick={() => navigate("/catalog")}>
        <LibraryBig /> Open catalog
      </Button>
    ) : role === "academics" ? (
      <Button variant="secondary" onClick={() => navigate("/catalog")}>
        <Archive /> Browse catalog
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
  dashboardScope,
  dashboardState,
  onRetry,
}: {
  role: Role;
  config: WorkspaceConfig;
  navigate: (path: string) => void;
  dashboardScope: string;
  dashboardState: RoleDashboardLoadState;
  onRetry: () => void;
}) {
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
      <DashboardStatistics
        sections={dashboardState.dashboard.sections}
        config={config}
      />
      <div className="dashboard-visualizations">
        <DashboardWorkloadChart
          sections={dashboardState.dashboard.sections}
          config={config}
        />
        {dashboardState.dashboard.analytics && (
          <DashboardAnalytics analytics={dashboardState.dashboard.analytics} />
        )}
      </div>
      <div className="role-dashboard-sections">
        {dashboardState.dashboard.sections.map((section) => (
          <DashboardSection
            key={section.key}
            section={section}
            config={
              config.sections[section.key] ?? {
                title: section.key,
                description: "Role workspace data.",
              }
            }
            navigate={navigate}
            role={role}
          />
        ))}
      </div>
    </>
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
}: {
  sections: RoleDashboardSection[];
  config: WorkspaceConfig;
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
        {available.map((section) => (
          <div key={section.key} className="dashboard-stat-card">
            <dt>
              {config.sections[section.key]?.title ?? humanize(section.key)}
            </dt>
            <dd>{section.total}</dd>
          </div>
        ))}
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
  role,
}: {
  section: RoleDashboardSection;
  config: SectionConfig;
  navigate: (path: string) => void;
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
                  <Button
                    variant="secondary"
                    className="dashboard-catalog-action"
                    onClick={() =>
                      navigate(
                        `/catalog?q=${encodeURIComponent(
                          catalogSearchQuery(item.title),
                        )}`,
                      )
                    }
                  >
                    Open public catalog <ArrowRight aria-hidden="true" />
                  </Button>
                )}
                {(["admin", "adviser"] as Role[]).includes(role) &&
                  config.internalRecord && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        navigate(`/research/${item.research_document_id}`)
                      }
                    >
                      {role === "adviser"
                        ? "Open review"
                        : "Open internal record"}
                    </Button>
                  )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
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
