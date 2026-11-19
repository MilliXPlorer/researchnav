export type ResearchWorkspaceTab =
  "overview" | "team" | "documents" | "monitoring";

export type ResearchWorkspacePanel = "feedback" | "annotations";

export interface ResearchWorkspaceDestination {
  tab?: ResearchWorkspaceTab;
  folder?: string;
  fileId?: number;
  panel?: ResearchWorkspacePanel;
}

const tabs = new Set<ResearchWorkspaceTab>([
  "overview",
  "team",
  "documents",
  "monitoring",
]);

const panels = new Set<ResearchWorkspacePanel>(["feedback", "annotations"]);

export function parseResearchWorkspaceDestination(
  search: string,
): ResearchWorkspaceDestination {
  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab") as ResearchWorkspaceTab | null;
  const requestedPanel = params.get("panel") as ResearchWorkspacePanel | null;
  const requestedFileId = Number(params.get("file"));

  return {
    tab: requestedTab && tabs.has(requestedTab) ? requestedTab : undefined,
    folder: params.get("folder") || undefined,
    fileId:
      Number.isSafeInteger(requestedFileId) && requestedFileId > 0
        ? requestedFileId
        : undefined,
    panel:
      requestedPanel && panels.has(requestedPanel) ? requestedPanel : undefined,
  };
}
