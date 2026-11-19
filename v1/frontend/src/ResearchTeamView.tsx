import { useEffect, useState, type ReactNode } from "react";
import {
  getResearchProjectTeam,
  type InstructorProjectTeam,
  type ResearchPeopleResource,
} from "./api";
import type { StudyWorkspaceResearcher } from "./StudyWorkspace";
import {
  researchTeamPresentation,
  type ResearchTeamDefenseType,
  type ResearchTeamPhase,
  type ResearchTeamRow,
} from "./researchTeamPresentation";

export function ResearchTeamHeader({
  defenseType,
  onDefenseTypeChange,
  description,
}: {
  defenseType: ResearchTeamDefenseType;
  onDefenseTypeChange: (defenseType: ResearchTeamDefenseType) => void;
  description: string;
}) {
  return (
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
          onChange={(event) =>
            onDefenseTypeChange(event.target.value as ResearchTeamDefenseType)
          }
        >
          <option value="proposal">Proposal Defense</option>
          <option value="final">Final Defense</option>
        </select>
      </label>
    </header>
  );
}

export function DefenseTeamCard({
  phase,
  onPhaseChange,
  rows,
  complete,
  loading,
  error,
  onRetry,
}: {
  phase: ResearchTeamPhase;
  onPhaseChange: (phase: ResearchTeamPhase) => void;
  rows: ResearchTeamRow[];
  complete: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <section className="research-team-card defense-team-card">
      <header className="defense-team-header">
        <h3>Defense team</h3>
        <div className="defense-phase-tabs" role="tablist" aria-label="Defense team phase">
          {(["before", "after"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={phase === value}
              className={phase === value ? "is-active" : ""}
              onClick={() => onPhaseChange(value)}
            >
              {value === "before" ? "Before defense" : "After defense"}
            </button>
          ))}
        </div>
        {!loading && !error && (
          <span className={`defense-completion ${complete ? "is-complete" : ""}`}>
            <i aria-hidden="true" /> {complete ? "Complete" : "Incomplete"}
          </span>
        )}
      </header>
      {loading && <p className="research-team-state">Loading current team assignments…</p>}
      {error && (
        <p className="research-team-state" role="alert">
          {error} <button type="button" className="text-action" onClick={onRetry}>Retry</button>
        </p>
      )}
      {!loading && !error && (
        <div className="defense-roster" role="tabpanel">
          {rows.map(([role, name]) => (
            <div key={role}>
              <strong>{role}</strong>
              <span className={name ? "" : "is-unassigned"} title={name ?? ""}>
                {name || "Unassigned"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SupportSpecialistsCard({
  support,
}: {
  support: ReturnType<typeof researchTeamPresentation>["support"];
}) {
  return (
    <section className="research-team-card support-specialists-card">
      <h3>Support specialists</h3>
      <div className="researcher-support-grid">
        {support.map(([role, Icon, name]) => (
          <article className="researcher-support-card" key={role}>
            <span className="researcher-support-icon" aria-hidden="true"><Icon /></span>
            <div>
              <span>{role}</span>
              <strong className={name ? "" : "is-unassigned"} title={name ?? ""}>
                {name ?? "Unassigned"}
              </strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ResearchersCard({
  researchers,
  actions,
}: {
  researchers: StudyWorkspaceResearcher[];
  actions?: (researcher: StudyWorkspaceResearcher) => ReactNode;
}) {
  return (
    <section className="research-team-card researchers-roster-card">
      <header><h3>Researchers</h3><span>{researchers.length} assigned</span></header>
      {researchers.length === 0 ? (
        <p className="research-team-state">No researchers are assigned to this study.</p>
      ) : (
        <ul className="canonical-researcher-list">
          {researchers.map((researcher) => (
            <li key={researcher.id}>
              <span className="project-person-avatar" aria-hidden="true">{researcher.name.slice(0, 1).toUpperCase()}</span>
              <span className="canonical-researcher-details">
                <strong title={researcher.name}>{researcher.name}</strong>
                {researcher.email && <small title={researcher.email}>{researcher.email}</small>}
                <small>Student researcher</small>
              </span>
              {actions?.(researcher)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
  const [defenseType, setDefenseType] = useState<ResearchTeamDefenseType>(
    initialTeam?.defense_type ?? "proposal",
  );
  const [phase, setPhase] = useState<ResearchTeamPhase>("before");
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

  const presentation = researchTeamPresentation(team, people, defenseType);
  const complete =
    team !== null &&
    (phase === "before" ? team.pre_defense_ready : team.post_defense_ready);
  function changeDefenseType(next: ResearchTeamDefenseType) {
    setLoadedTeam(null);
    setError("");
    setDefenseType(next);
  }

  return (
    <div
      className="canonical-research-team"
      data-testid="canonical-research-team"
    >
      <ResearchTeamHeader defenseType={defenseType} onDefenseTypeChange={changeDefenseType} description={description} />
      <div className="research-team-primary-grid">
        <DefenseTeamCard phase={phase} onPhaseChange={setPhase} rows={presentation[phase]} complete={complete} loading={loading} error={error} onRetry={() => { setError(""); setRetry((value) => value + 1); }} />
        <SupportSpecialistsCard support={presentation.support} />
      </div>
      <ResearchersCard researchers={researchers} />
    </div>
  );
}

export function ResearchTeamLayout({ children }: { children: ReactNode }) {
  return <div className="research-team-primary-grid">{children}</div>;
}
