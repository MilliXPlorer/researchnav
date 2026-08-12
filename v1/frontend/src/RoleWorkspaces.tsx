import { useState } from "react";
import {
  Archive,
  ArrowRight,
  BookCheck,
  FileSearch,
  FileText,
  LibraryBig,
  ShieldCheck,
} from "lucide-react";
import { Button, EmptyState, SectionHeading } from "./components";
import type { Role } from "./types";

export default function RoleWorkspace({
  role,
  notify,
}: {
  role: Role;
  notify: (message: string) => void;
}) {
  const workspaces: Record<Role, React.ReactNode> = {
    admin: <AdminWorkspace />,
    researcher: <ResearcherWorkspace notify={notify} />,
    adviser: <AdviserWorkspace />,
    instructor: <InstructorWorkspace />,
    panel: <PanelWorkspace />,
    statistician: <StatisticianWorkspace notify={notify} />,
    coordinator: <CoordinatorWorkspace />,
    librarian: <LibrarianWorkspace />,
    "research-office": <OfficeWorkspace />,
    academics: <AcademicsWorkspace />,
  };

  return workspaces[role];
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

function PendingPanel({
  title = "No records to display",
  message = "This workflow will show records after the required service is available.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <section className="panel-card">
      <EmptyState title={title} message={message} />
    </section>
  );
}

function ResearcherWorkspace({
  notify,
}: {
  notify: (message: string) => void;
}) {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="My dashboard / Overview"
        title="Welcome back."
        description="Submission tracking is available when a workspace record has been created."
        action={
          <Button
            onClick={() => notify("Submission workflow is not implemented")}
          >
            New submission <ArrowRight />
          </Button>
        }
      />
      <section
        className="kpi-grid kpi-grid-three"
        aria-label="Submission overview"
      >
        <article className="kpi-card kpi-slate">
          <small>Current status</small>
          <strong>—</strong>
          <p>No active submission</p>
        </article>
        <article className="kpi-card kpi-slate">
          <small>Title similarity</small>
          <strong>Pending</strong>
          <p>Analysis is not available</p>
        </article>
        <article className="kpi-card kpi-slate">
          <small>Revisions</small>
          <strong>—</strong>
          <p>No workflow record</p>
        </article>
      </section>
      <PendingPanel
        title="No submission has been selected"
        message="Researcher submissions are not connected to the public catalog."
      />
    </div>
  );
}

function AdviserWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Review desk"
        title="Pending reviews"
        description="Advisee assignments and review records are not available in this prototype."
      />
      <PendingPanel
        title="No review assignments"
        message="Review queues will be populated from the internal workflow service, not public catalog records."
      />
    </div>
  );
}

function InstructorWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="My sections"
        title="Title proposals"
        description="Section rosters and title proposals are not available in this prototype."
      />
      <PendingPanel
        title="No section proposals"
        message="Similarity analysis and class proposal data have not been implemented."
      />
    </div>
  );
}

function PanelWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Assigned manuscripts"
        title="Proposal defense brief"
        description="Defense assignments are not available in this prototype."
      />
      <PendingPanel
        title="No defense brief available"
        message="Panel assignments, manuscripts, and evaluations are managed separately from public metadata."
      />
    </div>
  );
}

function StatisticianWorkspace({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [checks, setChecks] = useState([true, true, false, false]);
  const labels = [
    "Research design fits the stated objectives",
    "Sampling method and size are justified",
    "Instrument validity is documented",
    "Analysis plan maps to each research question",
  ];
  const completedChecks = checks.filter(Boolean).length;
  const progress = Math.round((completedChecks / checks.length) * 100);

  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Statistical review"
        title="Methodology review"
        description="No internal review record is selected."
      />
      <section className="panel-card checklist-card">
        <SectionHeading eyebrow="Template" title="Methodology checklist" />
        <p className="form-help">
          This checklist is a local template and is not attached to a study.
        </p>
        <div className="review-progress">
          <strong>
            {completedChecks} of {checks.length} checks complete
          </strong>
          <span>{progress}%</span>
        </div>
        <div className="checklist">
          {labels.map((label, index) => (
            <label key={label} className={checks[index] ? "checked" : ""}>
              <input
                type="checkbox"
                checked={checks[index]}
                onChange={() =>
                  setChecks((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index ? !value : value,
                    ),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <Button
          variant="secondary"
          onClick={() => notify("Sign-off workflow is not implemented")}
        >
          Issue sign-off
        </Button>
      </section>
    </div>
  );
}

function CoordinatorWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Program overview"
        title="Research program at a glance."
        description="Program, schedule, and duplicate-analysis data are not available in this prototype."
      />
      <PendingPanel
        title="No program data available"
        message="Internal program workflow data is intentionally not derived from the public catalog."
      />
    </div>
  );
}

function LibrarianWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Repository operations"
        title="Archiving queue"
        description="Archiving work is awaiting an internal workflow connection."
        action={
          <Button variant="secondary">
            <LibraryBig /> Open catalog
          </Button>
        }
      />
      <PendingPanel
        title="No records in the archiving queue"
        message="Metadata, file, and consent status are not represented until an internal record is assigned."
      />
    </div>
  );
}

function OfficeWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="CAES / Compliance review"
        title="Institutional research oversight."
        description="Compliance review data is not available in this prototype."
      />
      <PendingPanel
        title="No compliance record selected"
        message="Consent, attachments, and review dates require an internal workflow record."
      />
    </div>
  );
}

function AcademicsWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="My library"
        title="Your research reading room."
        description="Saved items and recommendations are not available in this prototype."
        action={
          <Button variant="secondary">
            <Archive /> Browse catalog
          </Button>
        }
      />
      <PendingPanel
        title="No saved research"
        message="Use the public catalog to search cataloged public metadata."
      />
    </div>
  );
}

function AdminWorkspace() {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="System administration / Access control"
        title="System access overview."
        description="Account provisioning is not implemented in this prototype."
        action={
          <span className="admin-access-badge">
            <ShieldCheck /> Full system access
          </span>
        }
      />
      <section className="kpi-grid kpi-grid-three">
        <article className="kpi-card kpi-slate">
          <FileText />
          <small>Accounts</small>
          <strong>—</strong>
          <p>No account data loaded</p>
        </article>
        <article className="kpi-card kpi-slate">
          <FileSearch />
          <small>Audit events</small>
          <strong>—</strong>
          <p>Not implemented</p>
        </article>
        <article className="kpi-card kpi-slate">
          <BookCheck />
          <small>Access review</small>
          <strong>Pending</strong>
          <p>Not implemented</p>
        </article>
      </section>
      <PendingPanel
        title="Administration data unavailable"
        message="This workspace does not create fabricated user or workflow assignments."
      />
    </div>
  );
}
