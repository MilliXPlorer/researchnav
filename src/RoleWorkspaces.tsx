import { useEffect, useState } from "react";
import {
  Archive,
  ArrowRight,
  BarChart3,
  BellRing,
  BookCheck,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FilePenLine,
  FileSearch,
  FileText,
  FolderArchive,
  LibraryBig,
  MailCheck,
  MailPlus,
  MessageSquareText,
  MoreHorizontal,
  Send,
  ShieldCheck,
  Star,
  Upload,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import {
  Button,
  SectionHeading,
  SimilarityRing,
  StatusChip,
} from "./components";
import { listProvisionedAccounts, provisionAccount } from "./api";
import { researchRecords } from "./data";
import type { Role, Status } from "./types";

export default function RoleWorkspace({
  role,
  notify,
}: {
  role: Role;
  notify: (message: string) => void;
}) {
  const workspaces: Record<Role, React.ReactNode> = {
    admin: <AdminWorkspace notify={notify} />,
    researcher: <ResearcherWorkspace notify={notify} />,
    adviser: <AdviserWorkspace notify={notify} />,
    instructor: <InstructorWorkspace notify={notify} />,
    panel: <PanelWorkspace notify={notify} />,
    statistician: <StatisticianWorkspace notify={notify} />,
    coordinator: <CoordinatorWorkspace notify={notify} />,
    librarian: <LibrarianWorkspace notify={notify} />,
    "research-office": <OfficeWorkspace notify={notify} />,
    academics: <AcademicsWorkspace notify={notify} />,
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

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone = "green",
  children,
}: {
  label: string;
  value?: string;
  detail: string;
  icon: React.ReactNode;
  tone?: "green" | "amber" | "slate";
  children?: React.ReactNode;
}) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <div className="kpi-top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      {children ?? <strong>{value}</strong>}
      <p>{detail}</p>
    </article>
  );
}

function ResearcherWorkspace({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const record = researchRecords[0];
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="My dashboard / Overview"
        title="Welcome back."
        description="Your research is moving forward. Here is what needs your attention today."
        action={
          <Button onClick={() => notify("New submission form opened")}>
            New submission <ArrowRight />
          </Button>
        }
      />
      <section
        className="kpi-grid kpi-grid-three"
        aria-label="Submission overview"
      >
        <KpiCard
          label="Current status"
          detail="With your research adviser"
          icon={<Clock3 />}
        >
          <StatusChip status="Under Review" />
        </KpiCard>
        <KpiCard
          label="Title similarity"
          detail="Moderate · checked June 12"
          icon={<FileSearch />}
        >
          <div className="kpi-ring">
            <SimilarityRing score={42} size="large" />
            <span>Within review range</span>
          </div>
        </KpiCard>
        <KpiCard
          label="Revisions"
          value="01"
          detail="One revision requested"
          icon={<FilePenLine />}
          tone="amber"
        />
      </section>
      <div className="workspace-columns">
        <section className="panel-card submission-card">
          <SectionHeading
            eyebrow="Active record"
            title="My submission"
            action={
              <button className="text-action">
                View record <ChevronRight />
              </button>
            }
          />
          <div className="catalog-rule" />
          <span className="record-code">{record.id} · VERSION 02</span>
          <h3>{record.title}</h3>
          <div className="record-facts">
            <span>
              <strong>Submitted</strong>June 12, 2025
            </span>
            <span>
              <strong>Adviser</strong>Prof. Anne Villarin
            </span>
            <span>
              <strong>Manuscript</strong>IMRAD · 8.4 MB
            </span>
          </div>
          <div className="adviser-note">
            <MessageSquareText />
            <div>
              <strong>Latest adviser note</strong>
              <p>
                “Refine the scope in Chapter 1 and clarify how the title corpus
                is normalized before comparison.”
              </p>
              <time>Yesterday, 4:18 PM</time>
            </div>
          </div>
          <div className="card-actions">
            <Button onClick={() => notify("Revision upload is ready")}>
              <Upload /> Upload revision
            </Button>
            <Button
              variant="secondary"
              onClick={() => notify("Adviser comments opened")}
            >
              View all comments
            </Button>
          </div>
        </section>
        <aside className="panel-card timeline-card">
          <SectionHeading eyebrow="Progress" title="Research trail" />
          <ol className="timeline">
            <li className="complete">
              <span>
                <Check />
              </span>
              <div>
                <strong>Title submitted</strong>
                <small>June 12 · 9:42 AM</small>
              </div>
            </li>
            <li className="complete">
              <span>
                <Check />
              </span>
              <div>
                <strong>Similarity checked</strong>
                <small>42% · Moderate</small>
              </div>
            </li>
            <li className="current">
              <span>3</span>
              <div>
                <strong>Adviser review</strong>
                <small>In progress</small>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Panel endorsement</strong>
                <small>Upcoming</small>
              </div>
            </li>
          </ol>
        </aside>
      </div>
      <section className="panel-card related-panel">
        <SectionHeading
          eyebrow="Catalog connections"
          title="Related studies found"
          action={
            <button className="text-action">
              View all 8 <ArrowRight />
            </button>
          }
        />
        <div className="related-list">
          {researchRecords.slice(1, 4).map((item) => (
            <article key={item.id}>
              <SimilarityRing score={item.similarity!} />
              <div>
                <span className="record-code">
                  {item.id} · {item.year}
                </span>
                <h3>{item.title}</h3>
                <p>
                  {item.authors} · {item.institute}
                </p>
              </div>
              <button aria-label={`View ${item.title}`}>
                <ChevronRight />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdviserWorkspace({ notify }: { notify: (message: string) => void }) {
  const [resolved, setResolved] = useState<string[]>([]);
  const reviews = [
    {
      id: "J. Santos",
      title: researchRecords[2].title,
      score: 74,
      submitted: "2h ago",
      status: "Flagged for review",
    },
    {
      id: "M. Lopez",
      title: "Web-based Grading Portal for Flexible Learning",
      score: 31,
      submitted: "Yesterday",
      status: "Low similarity",
    },
    {
      id: "A. Rivera",
      title: researchRecords[5].title,
      score: 51,
      submitted: "Jun 10",
      status: "Moderate similarity",
    },
  ].filter((review) => !resolved.includes(review.id));
  const resolve = (id: string, action: string) => {
    setResolved((current) => [...current, id]);
    notify(`${action} for ${id}`);
  };
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Review desk / Pending reviews"
        title="Three drafts await your review."
        description="Similarity alerts are surfaced first so you can add context before approving a title."
        action={
          <Button variant="secondary">
            <FileSearch /> Feedback history
          </Button>
        }
      />
      <div className="queue-summary">
        <div>
          <span className="alert-mark">
            <BellRing />
          </span>
          <div>
            <strong>1 high-similarity title needs attention</strong>
            <p>
              Similarity is an indicator for review, not a plagiarism
              determination.
            </p>
          </div>
        </div>
        <button>
          View scoring guide <ArrowRight />
        </button>
      </div>
      <section className="review-queue">
        <SectionHeading
          eyebrow="Flagged first"
          title={`Pending reviews (${reviews.length})`}
          action={
            <label className="compact-select">
              Sort by{" "}
              <select>
                <option>Highest similarity</option>
                <option>Oldest submission</option>
              </select>
            </label>
          }
        />
        <div className="review-list">
          {reviews.map((review, index) => (
            <article
              className={`review-card ${review.score >= 70 ? "review-flagged" : ""}`}
              key={review.id}
            >
              <div className="review-index">0{index + 1}</div>
              <SimilarityRing score={review.score} size="large" />
              <div className="review-main">
                <div className="review-meta">
                  <span>
                    Advisee · <strong>{review.id}</strong>
                  </span>
                  <span>{review.submitted}</span>
                </div>
                <h3>{review.title}</h3>
                <span
                  className={`similarity-label ${review.score >= 70 ? "high" : ""}`}
                >
                  {review.status}
                </span>
              </div>
              <div className="review-actions">
                <Button
                  variant="secondary"
                  onClick={() => notify(`Comparison opened for ${review.id}`)}
                >
                  Compare titles
                </Button>
                <button
                  className="more-button"
                  aria-label={`More actions for ${review.id}`}
                >
                  <MoreHorizontal />
                </button>
                <Button
                  onClick={() => resolve(review.id, "Approved to proceed")}
                >
                  Approve
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => resolve(review.id, "Revision requested")}
                >
                  Request revision
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function InstructorWorkspace({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const rows = [
    [
      "Group 01",
      "Inventory System for Community-Based Small Businesses",
      "22",
      "Approved",
    ],
    [
      "Group 02",
      "Smart Attendance System Using Facial Recognition",
      "74",
      "Revision Required",
    ],
    [
      "Group 03",
      "Learning Management Portal for Flexible Instruction",
      "51",
      "Under Review",
    ],
    [
      "Group 04",
      "Mobile Emergency Response and Community Alert Platform",
      "18",
      "Submitted",
    ],
  ] as const;
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="My sections / BSCS 4A"
        title="Title proposals"
        description="Monitor all twelve research groups and identify duplicate clusters before the title hearing."
        action={
          <Button onClick={() => notify("Class similarity report exported")}>
            <Download /> Export report
          </Button>
        }
      />
      <section className="kpi-grid kpi-grid-three">
        <KpiCard
          label="Submitted titles"
          value="12"
          detail="All groups have submitted"
          icon={<FileCheck2 />}
        />
        <KpiCard
          label="Class similarity"
          value="41%"
          detail="Average across proposals"
          icon={<BarChart3 />}
        />
        <KpiCard
          label="Needs revision"
          value="02"
          detail="One high-similarity flag"
          icon={<BellRing />}
          tone="amber"
        />
      </section>
      <section className="panel-card distribution-card">
        <SectionHeading
          eyebrow="Similarity overview"
          title="Distribution by review range"
        />
        <div className="distribution">
          <span style={{ width: "50%" }}>6 low</span>
          <span style={{ width: "33%" }}>4 moderate</span>
          <span style={{ width: "17%" }}>2 high</span>
        </div>
        <div className="distribution-legend">
          <span>0–39% · Low</span>
          <span>40–69% · Moderate</span>
          <span>70%+ · Flagged</span>
        </div>
      </section>
      <section className="panel-card table-panel">
        <SectionHeading
          eyebrow="Section BSCS 4A"
          title="Proposal roster"
          action={
            <div className="table-actions">
              <Button
                variant="secondary"
                onClick={() => notify("Reminder sent to selected groups")}
              >
                <Send /> Remind groups
              </Button>
              <label>
                Filter{" "}
                <select>
                  <option>All statuses</option>
                  <option>Flagged</option>
                  <option>Approved</option>
                </select>
              </label>
            </div>
          }
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all groups" />
                </th>
                <th>Group</th>
                <th>Proposed title</th>
                <th>Similarity</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]}>
                  <td data-label="Select">
                    <input type="checkbox" aria-label={`Select ${row[0]}`} />
                  </td>
                  <td data-label="Group">
                    <strong>{row[0]}</strong>
                  </td>
                  <td data-label="Proposed title" className="serif-cell">
                    {row[1]}
                  </td>
                  <td data-label="Similarity">
                    <div className="inline-ring">
                      <SimilarityRing score={Number(row[2])} size="small" />
                      <span>
                        {Number(row[2]) >= 70
                          ? "High"
                          : Number(row[2]) >= 40
                            ? "Moderate"
                            : "Low"}
                      </span>
                    </div>
                  </td>
                  <td data-label="Status">
                    <StatusChip status={row[3] as Status} />
                  </td>
                  <td data-label="Actions">
                    <button
                      className="icon-button"
                      aria-label={`Open ${row[0]} proposal`}
                    >
                      <ChevronRight />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PanelWorkspace({ notify }: { notify: (message: string) => void }) {
  const [ratings, setRatings] = useState({
    originality: 0,
    methodology: 0,
    clarity: 0,
  });
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Assigned manuscripts / Upcoming"
        title="Proposal defense brief"
        description="Everything you need for the next scheduled defense, gathered in one reading view."
        action={
          <div className="defense-badge">
            <CalendarDays />
            <span>
              <strong>July 14 · 9:00 AM</strong>
              <small>Room 302</small>
            </span>
          </div>
        }
      />
      <div className="manuscript-layout">
        <article className="panel-card manuscript-card">
          <div className="manuscript-cover">
            <span className="record-code">RN-2024-097 · PROPOSAL</span>
            <div className="cover-score">
              <SimilarityRing score={74} size="large" />
              <span>Flagged for review</span>
            </div>
            <h2>{researchRecords[2].title}</h2>
            <p>John L. Santos · BS Computer Science</p>
            <div className="cover-facts">
              <span>
                <small>Adviser</small>Prof. M. Villarin
              </span>
              <span>
                <small>Submitted</small>July 8, 2025
              </span>
              <span>
                <small>Pages</small>86 pages
              </span>
            </div>
          </div>
          <div className="matched-note">
            <FileSearch />
            <div>
              <strong>3 closely related titles found</strong>
              <p>
                Highest match: 74%. Review the matched terms before the defense.
              </p>
            </div>
            <button>
              View matches <ChevronRight />
            </button>
          </div>
          <div className="card-actions">
            <Button onClick={() => notify("Manuscript reader opened")}>
              <BookCheck /> Read full manuscript
            </Button>
            <Button variant="secondary">
              <MessageSquareText /> Prior comments
            </Button>
          </div>
        </article>
        <section className="panel-card evaluation-card">
          <SectionHeading
            eyebrow="Evaluation form"
            title={
              submitted ? "Evaluation submitted" : "Record your assessment"
            }
          />
          {submitted ? (
            <div className="evaluation-complete">
              <CheckCircle2 />
              <h3>Evaluation locked</h3>
              <p>
                Your ratings and comments were submitted on July 14 at 10:02 AM.
              </p>
              <Button variant="secondary">View receipt</Button>
            </div>
          ) : (
            <>
              <p className="form-help">
                Rate each criterion from 1 (needs work) to 5 (excellent).
              </p>
              {Object.keys(ratings).map((criterion) => (
                <fieldset className="rating-row" key={criterion}>
                  <legend>
                    {criterion[0].toUpperCase() + criterion.slice(1)}
                  </legend>
                  <div>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        onClick={() =>
                          setRatings((current) => ({
                            ...current,
                            [criterion]: value,
                          }))
                        }
                        className={
                          ratings[criterion as keyof typeof ratings] >= value
                            ? "selected"
                            : ""
                        }
                        aria-label={`${value} stars for ${criterion}`}
                      >
                        <Star />
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              <label className="comment-field">
                Panel comments
                <textarea
                  placeholder="Add evidence-based comments for the researcher..."
                  rows={5}
                />
              </label>
              <Button
                className="full-button"
                disabled={Object.values(ratings).some((value) => value === 0)}
                onClick={() => {
                  setSubmitted(true);
                  notify("Evaluation submitted and locked");
                }}
              >
                <ClipboardCheck /> Submit final evaluation
              </Button>
            </>
          )}
        </section>
      </div>
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
        eyebrow="Statistical review / Queue"
        title="Three studies await methodology review."
        description="Validate each study's statistical treatment before it advances to proposal defense."
        action={
          <Button variant="secondary">
            <BookCheck /> Sign-offs issued
          </Button>
        }
      />
      <div className="review-progress">
        <div>
          <strong>
            {completedChecks} of {checks.length} checks complete
          </strong>
          <p>Web-based Grading Portal for Flexible Learning</p>
        </div>
        <span>{progress}%</span>
      </div>
      <div className="workspace-columns methodology-layout">
        <section className="panel-card methodology-card">
          <SectionHeading eyebrow="RN-2025-036" title="Methodology summary" />
          <h3>Web-based Grading Portal for Flexible Learning</h3>
          <dl>
            <div>
              <dt>Research design</dt>
              <dd>Descriptive-developmental</dd>
            </div>
            <div>
              <dt>Respondents</dt>
              <dd>n = 24 faculty members</dd>
            </div>
            <div>
              <dt>Sampling</dt>
              <dd>Purposive sampling</dd>
            </div>
            <div>
              <dt>Instrument</dt>
              <dd>5-point Likert scale · ISO/IEC 25010</dd>
            </div>
            <div>
              <dt>Analysis</dt>
              <dd>Weighted mean and standard deviation</dd>
            </div>
          </dl>
          <Button variant="secondary">
            <FileText /> Open Chapter 3
          </Button>
        </section>
        <section className="panel-card checklist-card">
          <SectionHeading
            eyebrow="Required checks"
            title="Methodology checklist"
          />
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
                <span>
                  <Check />
                </span>
                {label}
              </label>
            ))}
          </div>
          <label className="comment-field">
            Review note
            <textarea
              rows={4}
              placeholder="Add a clarification request or sign-off note..."
            />
          </label>
          <div className="card-actions">
            <Button
              variant="secondary"
              onClick={() => notify("Clarification request sent")}
            >
              <MessageSquareText /> Request clarification
            </Button>
            <Button
              disabled={!checks.every(Boolean)}
              onClick={() => notify("Statistical sign-off issued")}
            >
              <UserRoundCheck /> Issue sign-off
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminWorkspace({ notify }: { notify: (message: string) => void }) {
  const [coordinatorEmail, setCoordinatorEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [coordinatorAccounts, setCoordinatorAccounts] = useState<
    Array<{ email: string; status: "active" | "invited" | "blocked" }>
  >([]);

  useEffect(() => {
    listProvisionedAccounts("/api/admin/coordinators")
      .then((users) =>
        setCoordinatorAccounts(
          users.map((user) => ({
            email: user.email,
            status: user.accessStatus,
          })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const provisionCoordinator = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = coordinatorEmail.trim().toLowerCase();
    if (!email) return;
    if (coordinatorAccounts.some((account) => account.email === email)) {
      notify(`${email} already has a coordinator account.`);
      return;
    }
    setSubmitting(true);
    try {
      const user = await provisionAccount("/api/admin/coordinators", email);
      setCoordinatorAccounts((current) => [
        { email: user.email, status: user.accessStatus },
        ...current.filter((account) => account.email !== user.email),
      ]);
      setCoordinatorEmail("");
      notify(
        user.accessStatus === "active"
          ? `Coordinator access approved for ${email}.`
          : `Coordinator invitation sent to ${email}.`,
      );
    } catch {
      notify("Coordinator invitation could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="System administration / Access control"
        title="System access overview."
        description="Provision Research Coordinators, monitor invitations, and audit access across every ResearchNAV workspace."
        action={
          <span className="admin-access-badge">
            <ShieldCheck /> Full system access
          </span>
        }
      />
      <section className="kpi-grid kpi-grid-four">
        <KpiCard
          label="Active coordinators"
          value={String(
            coordinatorAccounts.filter((account) => account.status === "active")
              .length,
          ).padStart(2, "0")}
          detail="Can provision instructors"
          icon={<UsersRound />}
        />
        <KpiCard
          label="Pending invitations"
          value={String(
            coordinatorAccounts.filter(
              (account) => account.status === "invited",
            ).length,
          ).padStart(2, "0")}
          detail="Awaiting Gmail confirmation"
          icon={<MailCheck />}
          tone="amber"
        />
        <KpiCard
          label="System users"
          value="418"
          detail="Across all assigned roles"
          icon={<UsersRound />}
        />
        <KpiCard
          label="Access events"
          value="1.2K"
          detail="Logged this month"
          icon={<ShieldCheck />}
        />
      </section>
      <section className="panel-card admin-provision-panel">
        <SectionHeading
          eyebrow="Administrator authority"
          title="Research Coordinator accounts"
          action={
            <span className="pending-invite-count">
              {
                coordinatorAccounts.filter(
                  (account) => account.status === "invited",
                ).length
              }{" "}
              pending
            </span>
          }
        />
        <p className="role-admin-intro">
          Only the System Administrator can create a Research Coordinator
          account. A pending verified Gmail activates immediately; a new Gmail
          activates after its first matching Google sign-in.
        </p>
        <form
          className="account-invite-form admin-invite-form"
          onSubmit={provisionCoordinator}
        >
          <span className="invite-form-icon">
            <MailPlus />
          </span>
          <label>
            Coordinator Gmail
            <input
              type="email"
              value={coordinatorEmail}
              onChange={(event) => setCoordinatorEmail(event.target.value)}
              placeholder="coordinator@gmail.com"
              required
            />
          </label>
          <div className="fixed-role-field">
            <small>Assigned role</small>
            <strong>Research Coordinator</strong>
          </div>
          <Button type="submit" disabled={submitting}>
            <MailPlus /> Create coordinator account
          </Button>
        </form>
        <div className="account-assignment-list coordinator-account-list">
          {coordinatorAccounts.map((account) => (
            <article key={account.email}>
              <span className="assignment-avatar">
                <MailCheck />
              </span>
              <div>
                <strong>{account.email}</strong>
                <small>Research Coordinator</small>
              </div>
              <span className="role-fixed">Research Coordinator</span>
              <span
                className={
                  account.status === "active"
                    ? "access-active"
                    : "access-invited"
                }
              >
                {account.status === "active" ? (
                  <>
                    <Check /> Active
                  </>
                ) : (
                  <>
                    <MailCheck /> Check Gmail
                  </>
                )}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CoordinatorWorkspace({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [accounts, setAccounts] = useState<
    Array<{
      id: string;
      email: string;
      invitationStatus: "active" | "invited";
    }>
  >([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listProvisionedAccounts("/api/coordinator/instructors")
      .then((users) =>
        setAccounts(
          users.map((user) => ({
            id: user.email,
            email: user.email,
            invitationStatus:
              user.accessStatus === "active" ? "active" : "invited",
          })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const inviteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (accounts.some((account) => account.email === email)) {
      notify(`${email} already has an account record.`);
      return;
    }
    setSubmitting(true);
    try {
      const user = await provisionAccount(
        "/api/coordinator/instructors",
        email,
      );
      setAccounts((current) => [
        {
          id: user.email,
          email: user.email,
          invitationStatus:
            user.accessStatus === "active" ? "active" : "invited",
        },
        ...current.filter((account) => account.email !== user.email),
      ]);
      setInviteEmail("");
      notify(
        user.accessStatus === "active"
          ? `Instructor access approved for ${email}.`
          : `Invitation sent to ${email}. Access is pending Gmail confirmation.`,
      );
    } catch {
      notify("Instructor invitation could not be created.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Program overview / AY 2025—26"
        title="Research program at a glance."
        description="Track active studies, resolve cross-section duplication, and keep defenses on schedule."
        action={
          <Button onClick={() => notify("Schedule form opened")}>
            <CalendarDays /> Schedule defense
          </Button>
        }
      />
      <section className="kpi-grid kpi-grid-four">
        <KpiCard
          label="Active studies"
          value="86"
          detail="Across 9 sections"
          icon={<FileText />}
        />
        <KpiCard
          label="Flagged titles"
          value="12"
          detail="70% similarity or higher"
          icon={<BellRing />}
          tone="amber"
        />
        <KpiCard
          label="Defenses this week"
          value="06"
          detail="Next: Monday, 9:00 AM"
          icon={<CalendarDays />}
        />
        <KpiCard
          label="Archived this year"
          value="214"
          detail="18% above last year"
          icon={<Archive />}
        />
      </section>
      <div className="workspace-columns coordinator-columns">
        <section className="panel-card duplicate-panel">
          <SectionHeading
            eyebrow="Needs resolution"
            title="Cross-section duplicate flags"
            action={
              <button className="text-action">
                View all 12 <ArrowRight />
              </button>
            }
          />
          {[
            [81, "BSCS 4A", "BSIT 3B"],
            [76, "BSEd 4B", "BSCS 4C"],
          ].map(([score, left, right]) => (
            <article className="duplicate-item" key={String(score)}>
              <SimilarityRing score={Number(score)} size="large" />
              <div>
                <span className="similarity-label high">
                  Cross-section match
                </span>
                <h3>“Smart Attendance Monitoring…”</h3>
                <p>
                  <strong>{left}</strong> ↔ <strong>{right}</strong>
                </p>
                <div>
                  <button onClick={() => notify("Both advisers were notified")}>
                    Notify advisers
                  </button>
                  <button
                    onClick={() => notify("Flag escalated to Research Office")}
                  >
                    Escalate
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
        <aside className="panel-card agenda-card">
          <SectionHeading eyebrow="This week" title="Defense calendar" />
          <div className="week-strip">
            {["MON", "TUE", "WED", "THU", "FRI"].map((day, index) => (
              <button key={day} className={index === 1 ? "active" : ""}>
                <span>{day}</span>
                <strong>{14 + index}</strong>
                <small>{index === 1 ? "3" : "1"}</small>
              </button>
            ))}
          </div>
          <div className="agenda-list">
            <span>09:00</span>
            <article>
              <strong>Proposal defense · BSCS 4A</strong>
              <p>Room 302 · 3 panelists</p>
            </article>
            <span>01:30</span>
            <article>
              <strong>Final defense · BSIT 4B</strong>
              <p>AVR · 4 panelists</p>
            </article>
          </div>
        </aside>
      </div>
      <section className="panel-card role-admin-panel">
        <SectionHeading
          eyebrow="Account access"
          title="Role assignment ladder"
          action={
            <span className="pending-invite-count">
              {
                accounts.filter(
                  (account) => account.invitationStatus === "invited",
                ).length
              }{" "}
              pending
            </span>
          }
        />
        <p className="role-admin-intro">
          The System Administrator provisions Research Coordinator accounts. An
          active coordinator can invite Research Instructors by Gmail;
          instructor dashboards remain blocked until the invitation is
          confirmed.
        </p>
        <div className="access-ladder" aria-label="Account access ladder">
          <span>
            <small>System authority</small>
            <strong>System Administrator</strong>
          </span>
          <ArrowRight />
          <span>
            <small>Provisioned by admin</small>
            <strong>Research Coordinator</strong>
          </span>
          <ArrowRight />
          <span>
            <small>Invited by coordinator</small>
            <strong>Research Instructor</strong>
          </span>
        </div>
        <form
          className="account-invite-form instructor-invite-form"
          onSubmit={inviteAccount}
        >
          <span className="invite-form-icon">
            <MailPlus />
          </span>
          <label>
            Google account
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="faculty@gmail.com"
              required
            />
          </label>
          <div className="fixed-role-field">
            <small>Assigned role</small>
            <strong>Research Instructor</strong>
          </div>
          <Button type="submit" disabled={submitting}>
            <MailPlus /> Create instructor account
          </Button>
        </form>
        <div className="account-assignment-list">
          {accounts.map((account) => (
            <article key={account.id}>
              <span className="assignment-avatar">
                <MailCheck />
              </span>
              <div>
                <strong>{account.email}</strong>
                <small>Google account</small>
              </div>
              <span className="role-fixed">Research Instructor</span>
              <span
                className={
                  account.invitationStatus === "active"
                    ? "access-active"
                    : "access-invited"
                }
              >
                {account.invitationStatus === "active" ? (
                  <>
                    <Check /> Active
                  </>
                ) : (
                  <>
                    <MailCheck /> Check Gmail
                  </>
                )}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function LibrarianWorkspace({ notify }: { notify: (message: string) => void }) {
  const [published, setPublished] = useState(false);
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="Repository operations / Archiving queue"
        title="Five studies are ready to archive."
        description="Validate metadata, preserve the final manuscript, and publish approved work to the catalog."
        action={
          <Button variant="secondary">
            <LibraryBig /> Open catalog
          </Button>
        }
      />
      <section className="archive-queue-card">
        <div className="archive-queue-index">
          <FolderArchive />
          <span>
            READY
            <br />
            01 / 05
          </span>
        </div>
        <div className="archive-queue-content">
          <span className="record-code">RN-2025-029 · APPROVED FINAL</span>
          <h2>
            Inventory and Sales Management System for Community-Based Small
            Businesses
          </h2>
          <p>Carlo D. Gomez, Rica P. Tan · BS Business Administration</p>
          <div className="metadata-checks">
            {["Title", "Authors", "Abstract", "Keywords", "Consent"].map(
              (label) => (
                <span key={label}>
                  <CheckCircle2 /> {label}
                </span>
              ),
            )}
          </div>
          <div className="file-row">
            <FileText />
            <span>
              <strong>manuscript-final.pdf</strong>
              <small>PDF · 12.4 MB · uploaded June 24</small>
            </span>
            <button aria-label="Download final manuscript">
              <Download />
            </button>
          </div>
          <div className="card-actions">
            <Button
              variant="secondary"
              onClick={() => notify("Metadata editor opened")}
            >
              <FilePenLine /> Edit metadata
            </Button>
            <Button
              disabled={published}
              onClick={() => {
                setPublished(true);
                notify("Study published to the repository");
              }}
            >
              <Archive /> {published ? "Published" : "Publish to repository"}
            </Button>
          </div>
        </div>
      </section>
      <section className="panel-card table-panel">
        <SectionHeading
          eyebrow="Catalog health"
          title="Recently managed records"
          action={<Button variant="secondary">+ New entry</Button>}
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Accession</th>
                <th>Research title</th>
                <th>Year</th>
                <th>Metadata</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {researchRecords.slice(1, 5).map((item) => (
                <tr key={item.id}>
                  <td data-label="Accession">
                    <span className="record-code">{item.id}</span>
                  </td>
                  <td data-label="Research title" className="serif-cell">
                    {item.title}
                  </td>
                  <td data-label="Year">{item.year}</td>
                  <td data-label="Metadata">
                    <span className="complete-label">
                      <Check /> Complete
                    </span>
                  </td>
                  <td data-label="Status">
                    <StatusChip status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OfficeWorkspace({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="CAES / Compliance review"
        title="Institutional research oversight."
        description="Review repository compliance, manage role access, and prepare audit-ready reports."
        action={
          <Button>
            <BarChart3 /> Generate report
          </Button>
        }
      />
      <section className="kpi-grid kpi-grid-four">
        <KpiCard
          label="Pending review"
          value="07"
          detail="3 due this week"
          icon={<ClipboardCheck />}
          tone="amber"
        />
        <KpiCard
          label="Active users"
          value="418"
          detail="Across 9 assigned roles"
          icon={<UsersRound />}
        />
        <KpiCard
          label="Consent coverage"
          value="98.6%"
          detail="2 records need follow-up"
          icon={<ShieldCheck />}
        />
        <KpiCard
          label="Monthly exports"
          value="14"
          detail="All audit events logged"
          icon={<Download />}
        />
      </section>
      <div className="workspace-columns office-columns">
        <section className="panel-card compliance-panel">
          <SectionHeading
            eyebrow="Oldest pending"
            title="Compliance review"
            action={<span className="record-code">RN-2025-017</span>}
          />
          <h3>
            Learning Management System for Flexible and Blended Instruction
          </h3>
          <p>Ella V. Ramos, Dominic C. Yu · Institute of Teacher Education</p>
          <div className="compliance-checks">
            <span>
              <CheckCircle2 />
              <strong>Format</strong>
              <small>IMRAD verified</small>
            </span>
            <span>
              <CheckCircle2 />
              <strong>Attachments</strong>
              <small>4 of 4 present</small>
            </span>
            <span>
              <CheckCircle2 />
              <strong>Consent</strong>
              <small>Signed June 19</small>
            </span>
          </div>
          <div className="card-actions">
            <Button
              variant="secondary"
              onClick={() => notify("Record returned with a correction note")}
            >
              Return for correction
            </Button>
            <Button onClick={() => notify("Study endorsed for archiving")}>
              <FileCheck2 /> Endorse for archiving
            </Button>
          </div>
        </section>
        <aside className="panel-card report-panel">
          <SectionHeading eyebrow="Exports" title="Institutional reports" />
          {[
            [BarChart3, "Similarity trend report", "Monthly · PDF"],
            [FileText, "Submission volume by department", "Quarterly · CSV"],
            [UsersRound, "User activity export", "Audit · CSV"],
            [ShieldCheck, "Data privacy consent log", "Compliance · PDF"],
          ].map(([Icon, title, meta]) => (
            <button
              key={String(title)}
              onClick={() => notify(`${title} prepared`)}
            >
              {typeof Icon !== "string" && <Icon />}
              <span>
                <strong>{title as string}</strong>
                <small>{meta as string}</small>
              </span>
              <Download />
            </button>
          ))}
        </aside>
      </div>
      <section className="panel-card user-strip">
        <div>
          <UsersRound />
          <span>
            <strong>User & role management</strong>
            <small>418 active · 12 pending invitations · 3 deactivated</small>
          </span>
        </div>
        <Button variant="secondary">
          Manage users <ArrowRight />
        </Button>
      </section>
    </div>
  );
}

function AcademicsWorkspace({ notify }: { notify: (message: string) => void }) {
  const [saved, setSaved] = useState(researchRecords.slice(1, 4));
  const [libraryQuery, setLibraryQuery] = useState("");
  const librarySource = libraryQuery ? researchRecords : saved;
  const visibleSaved = librarySource.filter((item) =>
    [item.title, item.authors, ...item.keywords]
      .join(" ")
      .toLowerCase()
      .includes(libraryQuery.toLowerCase()),
  );
  return (
    <div className="workspace-content">
      <WorkspaceHeader
        eyebrow="My library / Saved research"
        title="Your research reading room."
        description="Return to bookmarked studies and continue exploring related scholarship."
        action={
          <Button
            onClick={() => {
              setLibraryQuery("");
              notify("Repository browser ready");
            }}
          >
            <Bookmark /> Browse repository
          </Button>
        }
      />
      <form
        className="library-search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sr-only" htmlFor="library-query">
          Search your saved studies
        </label>
        <input
          id="library-query"
          value={libraryQuery}
          onChange={(event) => setLibraryQuery(event.target.value)}
          placeholder="Search your saved studies..."
        />
        <button type="submit">Search</button>
      </form>
      <div className="workspace-columns library-columns">
        <section className="panel-card saved-panel">
          <SectionHeading
            eyebrow={
              libraryQuery
                ? `${visibleSaved.length} repository results`
                : `${visibleSaved.length} bookmarked studies`
            }
            title={libraryQuery ? "Repository search" : "Saved to my library"}
            action={
              <label className="compact-select">
                Sort{" "}
                <select>
                  <option>Recently saved</option>
                  <option>Publication year</option>
                </select>
              </label>
            }
          />
          <div className="saved-list">
            {visibleSaved.length === 0 ? (
              <p className="library-empty">
                No repository studies match “{libraryQuery}”.
              </p>
            ) : (
              visibleSaved.map((item) => {
                const isSaved = saved.some((record) => record.id === item.id);
                return (
                  <article key={item.id}>
                    <button
                      className="bookmark-button"
                      onClick={() => {
                        if (isSaved) {
                          setSaved((current) =>
                            current.filter((record) => record.id !== item.id),
                          );
                          notify("Removed from your library");
                        } else {
                          setSaved((current) => [...current, item]);
                          notify("Saved to your library");
                        }
                      }}
                      aria-label={`${isSaved ? "Remove" : "Save"} ${item.title} ${isSaved ? "from" : "to"} library`}
                    >
                      <Bookmark fill={isSaved ? "currentColor" : "none"} />
                    </button>
                    <div>
                      <span className="record-code">
                        {item.id} · {item.year}
                      </span>
                      <h3>{item.title}</h3>
                      <p>
                        {item.authors} · {item.program}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => notify(`Download started · ${item.id}`)}
                    >
                      <Download /> PDF
                    </Button>
                  </article>
                );
              })
            )}
          </div>
        </section>
        <aside className="panel-card suggested-panel">
          <SectionHeading
            eyebrow="Based on your library"
            title="Suggested for you"
          />
          {researchRecords.slice(3, 6).map((item) => (
            <article key={item.id}>
              <SimilarityRing score={item.similarity!} />
              <div>
                <h3>{item.title}</h3>
                <p>
                  {item.year} · {item.category}
                </p>
              </div>
            </article>
          ))}
          <button className="text-action">
            Refresh suggestions <ArrowRight />
          </button>
        </aside>
      </div>
    </div>
  );
}
