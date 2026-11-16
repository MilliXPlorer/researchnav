import { useEffect, useState } from "react";
import {
  getResearchProjectTeam,
  type InstructorProjectTeam,
  type ResearchPeopleResource,
} from "./api";

export type DefenseType = "proposal" | "final";
type DefensePhase = "before" | "after";

export default function DefenseTeamRoster({
  researchDocumentId,
  people,
  defenseType: controlledDefenseType,
  onDefenseTypeChange,
  refreshKey,
}: {
  researchDocumentId: string | number;
  people: ResearchPeopleResource;
  defenseType?: DefenseType;
  onDefenseTypeChange?: (defenseType: DefenseType) => void;
  refreshKey?: number;
}) {
  const [phase, setPhase] = useState<DefensePhase>("before");
  const [localDefenseType, setLocalDefenseType] =
    useState<DefenseType>("proposal");
  const defenseType = controlledDefenseType ?? localDefenseType;
  const [team, setTeam] = useState<InstructorProjectTeam | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true);
          setError("");
        }
        return getResearchProjectTeam(researchDocumentId, defenseType);
      })
      .then((value) => {
        if (!cancelled) setTeam(value);
      })
      .catch(() => {
        if (!cancelled) setError("Defense team could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [researchDocumentId, defenseType, refreshKey, retry]);

  const fallback = (role: string) =>
    defenseType === "proposal"
      ? people.reviewers.find((person) => person.review_role === role)?.name
      : null;
  const instructor =
    team?.instructor?.name ??
    (defenseType === "proposal" ? people.section?.instructor_name : null);
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
            (person) =>
              person.review_role === "panel" &&
              person.designation !== "panel_chair",
          )
          .map((person) => person.name)
      : [];
  const representative =
    team?.research_office_representative?.name ?? fallback("research-office");
  const chair =
    team?.chair?.name ??
    (defenseType === "proposal"
      ? people.reviewers.find((person) => person.designation === "panel_chair")
          ?.name
      : null);
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

  return (
    <>
      <div className="research-team-intro">
        <div>
          <p className="eyebrow">Research Team</p>
          <h2 id="research-support-title">People assigned to this study</h2>
          <p>
            View your instructor and reviewers, then request support specialists
            for your group as needed.
          </p>
        </div>
        <label className="research-team-stage">
          <span>Defense stage</span>
          <select
            value={defenseType}
            onChange={(event) => {
              setTeam(null);
              const next = event.target.value as DefenseType;
              setLocalDefenseType(next);
              onDefenseTypeChange?.(next);
            }}
          >
            <option value="proposal">Proposal Defense</option>
            <option value="final">Final Defense</option>
          </select>
        </label>
      </div>
      <div className="research-team-columns-start">
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
                onClick={() => setRetry((value) => value + 1)}
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
      </div>
    </>
  );
}
