import { BookOpen, ChartNoAxesColumn, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getResearchProjectTeam,
  type InstructorProjectTeam,
  type ProjectSupportActor,
  type ResearchPeopleResource,
} from "./api";
import type { StudyWorkspaceResearcher } from "./StudyWorkspace";

type DefenseType = "proposal" | "final";
type DefensePhase = "before" | "after";

function reviewerName(people: ResearchPeopleResource, role: string) {
  return people.reviewers.find((reviewer) => reviewer.review_role === role)
    ?.name;
}

function supportStatus(assignment: ProjectSupportActor | null) {
  if (!assignment) return "Unassigned";
  if (["accepted", "confirmed", "active"].includes(assignment.status)) {
    return "Active";
  }
  return assignment.status.replace(/^./, (letter) => letter.toUpperCase());
}

export default function ResearchTeamView({
  researchDocumentId,
  researchers,
  people,
  initialTeam,
  description = "View the researchers and assigned study team. Assignment changes are managed by authorized roles.",
}: {
  researchDocumentId: string | number;
  researchers: StudyWorkspaceResearcher[];
  people: ResearchPeopleResource;
  initialTeam?: InstructorProjectTeam | null;
  description?: string;
}) {
  const [defenseType, setDefenseType] = useState<DefenseType>(
    initialTeam?.defense_type ?? "proposal",
  );
  const [phase, setPhase] = useState<DefensePhase>("before");
  const [loadedTeam, setLoadedTeam] = useState<InstructorProjectTeam | null>(
    null,
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const initialTeamMatches = initialTeam?.defense_type === defenseType;
  const loadedTeamMatches = loadedTeam?.defense_type === defenseType;
  const team = initialTeamMatches
    ? initialTeam
    : loadedTeamMatches
      ? loadedTeam
      : null;
  const loading = team == null && !error;

  useEffect(() => {
    if (initialTeamMatches) return;

    let cancelled = false;
    void getResearchProjectTeam(researchDocumentId, defenseType)
      .then((value) => {
        if (!cancelled) setLoadedTeam(value);
      })
      .catch(() => {
        if (!cancelled) setError("Research team could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [defenseType, initialTeamMatches, researchDocumentId, retry]);

  const fallback = (role: string) =>
    defenseType === "proposal" ? reviewerName(people, role) : undefined;
  const instructor =
    team?.instructor?.name ??
    (defenseType === "proposal" ? people.section?.instructor_name : undefined);
  const adviser = team?.adviser?.name ?? fallback("adviser");
  const editor =
    team?.support_assignments.editor?.name ??
    fallback("research_editor") ??
    fallback("editor");
  const statistician =
    team?.support_assignments.statistician?.name ?? fallback("statistician");
  const librarian =
    team?.support_assignments.librarian?.name ?? fallback("librarian");
  const panels = team?.panel_members?.length
    ? team.panel_members.map((member) => member.name)
    : defenseType === "proposal"
      ? people.reviewers
          .filter(
            (reviewer) =>
              reviewer.review_role === "panel" &&
              reviewer.designation !== "panel_chair",
          )
          .map((reviewer) => reviewer.name)
      : [];
  const representative =
    team?.research_office_representative?.name ??
    fallback("research-office") ??
    fallback("research_office_representative");
  const chair =
    team?.chair?.name ??
    (defenseType === "proposal"
      ? people.reviewers.find(
          (reviewer) => reviewer.designation === "panel_chair",
        )?.name
      : undefined);
  const rows: Array<[string, string | null | undefined]> =
    phase === "before"
      ? [
          ["Research Instructor", instructor],
          ["Research Adviser", adviser],
          ["Editor", editor],
          ["Statistician", statistician],
          ["Librarian", librarian],
        ]
      : [
          ["Research Instructor", instructor],
          ["Research Adviser", adviser],
          ["Editor", editor],
          ["Librarian", librarian],
          ["Panel 1", panels[0]],
          ["Panel 2", panels[1]],
          ["Panel 3", panels[2]],
          ["Research Representative", representative],
          ["Chair", chair],
        ];
  const complete =
    team !== null &&
    (phase === "before" ? team.pre_defense_ready : team.post_defense_ready);
  const support = [
    ["Editor", PenLine, team?.support_assignments.editor ?? null],
    [
      "Statistician",
      ChartNoAxesColumn,
      team?.support_assignments.statistician ?? null,
    ],
    ["Librarian", BookOpen, team?.support_assignments.librarian ?? null],
  ] as const;

  return (
    <div
      className="canonical-research-team"
      data-testid="canonical-research-team"
    >
      <header className="research-team-intro">
        <div>
          <p className="eyebrow">Research Team</p>
          <h2>People assigned to this study</h2>
          <p>{description}</p>
        </div>
        <label className="research-team-stage">
          <span>Defense stage</span>
          <select
            value={defenseType}
            onChange={(event) => {
              setLoadedTeam(null);
              setError("");
              setDefenseType(event.target.value as DefenseType);
            }}
          >
            <option value="proposal">Proposal Defense</option>
            <option value="final">Final Defense</option>
          </select>
        </label>
      </header>

      <section className="research-team-card researchers-roster-card">
        <header>
          <h3>Researchers</h3>
          <span>{researchers.length} assigned</span>
        </header>
        {researchers.length === 0 ? (
          <p className="research-team-state">
            No researchers are assigned to this study.
          </p>
        ) : (
          <ul className="canonical-researcher-list">
            {researchers.map((researcher) => (
              <li key={researcher.id}>
                <span className="project-person-avatar" aria-hidden="true">
                  {researcher.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{researcher.name}</strong>
                  <small>Student researcher</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="research-team-card defense-team-card">
        <header className="defense-team-header">
          <h3>Defense team</h3>
          <div
            className="defense-phase-tabs"
            role="tablist"
            aria-label="Defense team phase"
          >
            {(["before", "after"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={phase === value}
                className={phase === value ? "is-active" : ""}
                onClick={() => setPhase(value)}
              >
                {value === "before" ? "Before defense" : "After defense"}
              </button>
            ))}
          </div>
          {!loading && !error && (
            <span
              className={`defense-completion ${complete ? "is-complete" : ""}`}
            >
              <i aria-hidden="true" /> {complete ? "Complete" : "Incomplete"}
            </span>
          )}
        </header>
        {loading && (
          <p className="research-team-state">
            Loading current team assignments…
          </p>
        )}
        {error && (
          <p className="research-team-state" role="alert">
            {error}{" "}
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setError("");
                setRetry((value) => value + 1);
              }}
            >
              Retry
            </button>
          </p>
        )}
        {!loading && !error && (
          <div className="defense-roster" role="tabpanel">
            {rows.map(([role, name]) => (
              <div key={role}>
                <strong>{role}</strong>
                <span className={name ? "" : "is-unassigned"}>
                  {name || "Unassigned"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="research-team-card support-specialists-card">
        <h3>Support specialists</h3>
        <div className="researcher-support-grid">
          {support.map(([role, Icon, assignment]) => (
            <article className="researcher-support-card" key={role}>
              <span className="researcher-support-icon" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <span>{role}</span>
                <strong>{assignment?.name ?? "Unassigned"}</strong>
                <small>{supportStatus(assignment)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
