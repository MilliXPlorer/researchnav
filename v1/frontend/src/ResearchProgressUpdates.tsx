import { useEffect, useState } from "react";
import { Folder, RefreshCw } from "lucide-react";
import {
  ApiError,
  listResearchProgressUpdates,
  type ResearchProgressFolder,
} from "./api";
import { Button } from "./components";
import { roleConfigs } from "./data";
import type { Role } from "./types";

type State =
  | { status: "loading" }
  | { status: "ready"; folders: ResearchProgressFolder[] }
  | { status: "error"; message: string };

function humanize(value: string | null) {
  if (!value) return "Not specified";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Research progress updates are not available for your role.";
  }
  return "Research progress updates could not be loaded.";
}

/**
 * Shows researcher-reported updates per assigned folder. This deliberately
 * remains separate from manuscript submissions and official defense forms.
 */
export default function ResearchProgressUpdates({ role }: { role: Role }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listResearchProgressUpdates()
      .then((folders) => {
        if (!cancelled) setState({ status: "ready", folders });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ status: "error", message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = () => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  };

  return (
    <div className="workspace-content admin-sidebar-page research-progress-updates">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">
            {roleConfigs.find((config) => config.id === role)?.label}
          </p>
          <h1>Research Progress Updates</h1>
          <p>
            Researcher-reported accomplishments and blockers by assigned folder.
            These updates do not submit a manuscript for review or complete an
            official defense monitoring form.
          </p>
        </div>
        <Button variant="secondary" onClick={reload}>
          <RefreshCw aria-hidden="true" /> Refresh
        </Button>
      </header>

      {state.status === "loading" ? (
        <p className="admin-empty" aria-busy="true">
          Loading research progress updates…
        </p>
      ) : state.status === "error" ? (
        <section className="panel-card dashboard-error" role="alert">
          <p>{state.message}</p>
          <Button variant="secondary" onClick={reload}>
            Retry
          </Button>
        </section>
      ) : state.folders.length === 0 ? (
        <section className="panel-card submissions-empty-state">
          <Folder aria-hidden="true" />
          <h2>No assigned research folders</h2>
          <p>Progress updates appear when research is assigned to you.</p>
        </section>
      ) : (
        <div className="research-progress-folder-list">
          {state.folders.map((folder) => {
            const updates = [...folder.progress_updates]
              .sort(
                (first, second) =>
                  new Date(second.activity_date ?? 0).getTime() -
                  new Date(first.activity_date ?? 0).getTime(),
              )
              .slice(0, 10);
            return (
              <section
                className="panel-card research-progress-folder"
                key={folder.research_document_id}
                aria-labelledby={`progress-folder-${folder.research_document_id}`}
              >
                <header>
                  <div>
                    <p className="eyebrow">Assigned research folder</p>
                    <h2 id={`progress-folder-${folder.research_document_id}`}>
                      {folder.title}
                    </h2>
                  </div>
                  <span className="activity-tag">
                    {humanize(folder.research_stage)}
                  </span>
                </header>
                {updates.length === 0 ? (
                  <div className="project-empty-folder">
                    <Folder aria-hidden="true" />
                    <strong>No research progress updates yet.</strong>
                    <span>
                      Researcher-reported work and blockers will appear here.
                    </span>
                  </div>
                ) : (
                  <ol className="research-progress-list">
                    {updates.map((update) => (
                      <li key={update.id}>
                        <div className="research-progress-meta">
                          <span className="status-chip status-under-review">
                            {humanize(update.status)}
                          </span>
                          <strong>
                            {update.performer_name ?? "Researcher"}
                          </strong>
                          <time dateTime={update.activity_date ?? undefined}>
                            {displayDate(update.activity_date)}
                          </time>
                        </div>
                        <p>{update.remarks || "No details were provided."}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
