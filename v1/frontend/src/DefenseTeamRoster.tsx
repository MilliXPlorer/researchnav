import { useEffect, useState } from "react";
import {
  getResearchProjectTeam,
  type InstructorProjectTeam,
  type ResearchPeopleResource,
} from "./api";
import {
  DefenseTeamCard,
  ResearchTeamHeader,
  ResearchTeamLayout,
} from "./ResearchTeamView";
import {
  researchTeamPresentation,
  type ResearchTeamDefenseType,
  type ResearchTeamPhase,
} from "./researchTeamPresentation";

export type DefenseType = ResearchTeamDefenseType;

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
  const [phase, setPhase] = useState<ResearchTeamPhase>("before");
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

  const presentation = researchTeamPresentation(team, people, defenseType);
  const complete =
    team !== null &&
    (phase === "before" ? team.pre_defense_ready : team.post_defense_ready);

  function changeDefenseType(next: DefenseType) {
    setTeam(null);
    setLocalDefenseType(next);
    onDefenseTypeChange?.(next);
  }

  return (
    <>
      <ResearchTeamHeader
        defenseType={defenseType}
        onDefenseTypeChange={changeDefenseType}
        description="View your instructor and reviewers, then request support specialists for your group as needed."
      />
      <ResearchTeamLayout>
        <DefenseTeamCard
          phase={phase}
          onPhaseChange={setPhase}
          rows={presentation[phase]}
          complete={complete}
          loading={loading}
          error={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      </ResearchTeamLayout>
    </>
  );
}
