import { BookOpen, ChartNoAxesColumn, PenLine } from "lucide-react";
import type { InstructorProjectTeam, ResearchPeopleResource } from "./api";

export type ResearchTeamDefenseType = "proposal" | "final";
export type ResearchTeamPhase = "before" | "after";
export type ResearchTeamRow = [string, string | null | undefined];

function reviewerName(people: ResearchPeopleResource, role: string) {
  return people.reviewers.find((reviewer) => reviewer.review_role === role)
    ?.name;
}

export function researchTeamPresentation(
  team: InstructorProjectTeam | null,
  people: ResearchPeopleResource,
  defenseType: ResearchTeamDefenseType,
) {
  const fallback = (role: string) =>
    defenseType === "proposal" ? reviewerName(people, role) : undefined;
  const instructor =
    team?.instructor?.name ??
    (defenseType === "proposal" ? people.section?.instructor_name : undefined);
  const adviser = team?.adviser?.name ?? fallback("adviser");
  const editor =
    team?.support_assignments?.editor?.name ??
    fallback("research_editor") ??
    fallback("editor");
  const statistician =
    team?.support_assignments?.statistician?.name ?? fallback("statistician");
  const librarian =
    team?.support_assignments?.librarian?.name ?? fallback("librarian");
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

  return {
    before: [
      ["Research Instructor", instructor],
      ["Research Adviser", adviser],
      ["Editor", editor],
      ["Statistician", statistician],
      ["Librarian", librarian],
    ] as ResearchTeamRow[],
    after: [
      ["Research Instructor", instructor],
      ["Research Adviser", adviser],
      ["Editor", editor],
      ["Librarian", librarian],
      ["Panel 1", panels[0]],
      ["Panel 2", panels[1]],
      ["Panel 3", panels[2]],
      ["Research Representative", representative],
      ["Chair", chair],
    ] as ResearchTeamRow[],
    support: [
      ["Editor", PenLine, editor],
      ["Statistician", ChartNoAxesColumn, statistician],
      ["Librarian", BookOpen, librarian],
    ] as const,
  };
}
