import { useEffect, useState } from "react";
import { getResearchProjectTeam, type InstructorProjectTeam, type ResearchPeopleResource } from "./api";

export default function DefenseTeamRoster({ researchDocumentId, people, refreshKey }: {
  researchDocumentId: string | number;
  people: ResearchPeopleResource;
  refreshKey?: number;
}) {
  const [defenseType, setDefenseType] = useState<"proposal" | "final">("proposal");
  const [team, setTeam] = useState<InstructorProjectTeam | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTeam(null);
    setLoading(true);
    setError("");
    void getResearchProjectTeam(researchDocumentId, defenseType)
      .then((value) => { if (!cancelled) setTeam(value); })
      .catch(() => { if (!cancelled) setError("Defense team could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [researchDocumentId, defenseType, refreshKey, retry]);

  const fallback = (role: string) => defenseType === "proposal"
    ? people.reviewers.find((person) => person.review_role === role)?.name
    : null;
  const instructor = team?.instructor?.name ?? (defenseType === "proposal" ? people.section?.instructor_name : null);
  const adviser = team?.adviser?.name ?? fallback("adviser");
  const editor = team?.support_assignments?.editor?.name ?? fallback("research_editor");
  const statistician = team?.support_assignments?.statistician?.name ?? fallback("statistician");
  const librarian = team?.support_assignments?.librarian?.name ?? fallback("librarian");
  const panels = team?.panel_members?.length
    ? team.panel_members.map((member) => member.name)
    : defenseType === "proposal"
      ? people.reviewers.filter((person) => person.review_role === "panel" && person.designation !== "panel_chair").map((person) => person.name)
      : [];
  const representative = team?.research_office_representative?.name ?? fallback("research-office");
  const chair = team?.chair?.name ?? (defenseType === "proposal" ? people.reviewers.find((person) => person.designation === "panel_chair")?.name : null);
  const rows = (items: Array<[string, string | null | undefined]>) => items.map(([role, name]) => (
    <div className="project-actor-row" key={role}>
      <span><strong>{role}</strong></span>
      <span className={name ? "actor-name" : "actor-name is-empty"}>{name || "Unassigned"}</span>
    </div>
  ));

  return <>
    <div className="project-team-stage-control">
      <label>Defense team
        <select value={defenseType} onChange={(event) => setDefenseType(event.target.value as "proposal" | "final")}>
          <option value="proposal">Proposal Defense</option>
          <option value="final">Final Defense</option>
        </select>
      </label>
    </div>
    {loading && <p>Loading current team assignments…</p>}
    {error && <div role="alert">{error} <button type="button" className="text-action" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {!loading && <div className="project-stage-columns">
      <section className="project-team-block">
        <div className="project-team-block-heading"><div><p className="eyebrow">Before {defenseType === "proposal" ? "Proposal" : "Final"} Defense</p><h5>Pre-defense team</h5></div>
          {team && <span className={team.pre_defense_ready ? "status-dot is-ready" : "status-dot"}>{team.pre_defense_ready ? "Ready" : "Incomplete"}</span>}
        </div>
        <div className="project-actor-grid">{rows([["Research Instructor", instructor], ["Research Adviser", adviser], ["Editor", editor], ["Statistician", statistician], ["Librarian", librarian]])}</div>
      </section>
      <section className="project-team-block">
        <div className="project-team-block-heading"><div><p className="eyebrow">After {defenseType === "proposal" ? "Proposal" : "Final"} Defense</p><h5>Post-defense team</h5></div>
          {team && <span className={team.post_defense_ready ? "status-dot is-ready" : "status-dot"}>{team.post_defense_ready ? "Ready" : "Incomplete"}</span>}
        </div>
        <div className="project-actor-grid">{rows([["Research Instructor", instructor], ["Research Adviser", adviser], ["Editor", editor], ["Librarian", librarian], ["Panel 1", panels[0]], ["Panel 2", panels[1]], ["Panel 3", panels[2]], ["Research Rep", representative], ["Chair", chair]])}</div>
      </section>
    </div>}
  </>;
}
