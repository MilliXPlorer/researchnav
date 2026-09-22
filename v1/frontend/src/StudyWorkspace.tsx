import { type ReactNode, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Folder,
  MessageSquareText,
  Pencil,
  Trash2,
  UsersRound,
} from "lucide-react";
import {
  listResearchFiles,
  listResearchFolders,
  researchFileDownloadUrl,
  type DocumentFileResource,
  type InstructorProjectTeam,
  type ResearchPeopleResource,
  type SdgResource,
} from "./api";
import { Button } from "./components";
import { Modal } from "./Modal";
import DefenseMonitoringMenu, {
  type DefenseType,
} from "./DefenseMonitoringMenu";
import SharedMonitoring from "./SharedMonitoring";
import PdfAnnotationWorkspace from "./PdfAnnotationWorkspace";
import DocumentFeedbackPanel from "./DocumentFeedbackPanel";
import DocxPreviewWorkspace from "./DocxPreviewWorkspace";
import { formatPhilippineDateTime } from "./dateTime";
import { withStandardResearchFolders } from "./researchFolders";
import type {
  ResearchWorkspaceDestination,
  ResearchWorkspaceTab,
} from "./researchWorkspaceRoute";
import type { Role } from "./types";
import { SdgBadges } from "./SdgMetadata";

type WorkspaceTab = ResearchWorkspaceTab;

export interface StudyWorkspaceResearcher {
  id: string;
  name: string;
  email?: string | null;
}

export interface StudyWorkspaceControls {
  onEditTitle?: () => void;
  onDeleteProject?: () => void;
  onManageAssignments?: (stage: "proposal" | "final") => void;
  onDefenseTeamStageChange?: (stage: "proposal" | "final") => void;
  onRemoveResearcher?: (researcher: StudyWorkspaceResearcher) => void;
  researcherActionsDisabled?: boolean;
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reviewerName(
  people: ResearchPeopleResource | null | undefined,
  role: string,
) {
  return (
    people?.reviewers.find((reviewer) => reviewer.review_role === role)?.name ??
    null
  );
}

export default function StudyWorkspace({
  role,
  researchDocumentId,
  title,
  context,
  researchers,
  projectTeam,
  people,
  teamLoading = false,
  badgeLabel = "Central record",
  summary,
  sdgs = [],
  controls,
  actorExtension,
  canPostFeedback = false,
  monitoringReadOnly = false,
  destination,
}: {
  role: Role;
  researchDocumentId: string | number;
  title: string;
  context: string[];
  researchers: StudyWorkspaceResearcher[];
  projectTeam?: InstructorProjectTeam | null;
  people?: ResearchPeopleResource | null;
  teamLoading?: boolean;
  badgeLabel?: string;
  summary?: string | null;
  sdgs?: SdgResource[];
  controls?: StudyWorkspaceControls;
  actorExtension?: ReactNode;
  canPostFeedback?: boolean;
  monitoringReadOnly?: boolean;
  destination?: ResearchWorkspaceDestination;
}) {
  const [tab, setTab] = useState<WorkspaceTab>(destination?.tab ?? "overview");
  const [defenseType, setDefenseType] = useState<DefenseType>("proposal");
  const [files, setFiles] = useState<DocumentFileResource[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [feedbackFile, setFeedbackFile] = useState<DocumentFileResource | null>(
    null,
  );
  const [commentFile, setCommentFile] = useState<DocumentFileResource | null>(
    null,
  );
  const [activeFolder, setActiveFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      listResearchFiles(researchDocumentId),
      listResearchFolders(researchDocumentId),
    ]).then(([filesResult, foldersResult]) => {
      if (cancelled) return;
      const loadedFiles =
        filesResult.status === "fulfilled" ? filesResult.value : [];
      const loadedFolders = withStandardResearchFolders(
        foldersResult.status === "fulfilled"
          ? foldersResult.value
          : (Array.from(
              new Set(
                loadedFiles.map((file) => file.relative_path).filter(Boolean),
              ),
            ) as string[]),
      );
      setFiles(loadedFiles);
      setFolders(loadedFolders);
      setTab(destination?.tab ?? "overview");
      const targetFile = loadedFiles.find(
        (file) => file.id === destination?.fileId,
      );
      const availableFolders = [
        ...loadedFolders,
        ...(loadedFiles.some((file) => !file.relative_path) ? ["Unfiled"] : []),
      ];
      const targetFolder = targetFile
        ? (targetFile.relative_path ?? "Unfiled")
        : destination?.folder && availableFolders.includes(destination.folder)
          ? destination.folder
          : (availableFolders[0] ?? "");
      setActiveFolder(targetFolder);
      setFeedbackFile(
        targetFile && destination?.panel === "annotations" ? targetFile : null,
      );
      setCommentFile(
        targetFile && destination?.panel === "feedback" ? targetFile : null,
      );
      setLoadError(
        [filesResult, foldersResult].some(
          (result) => result.status === "rejected",
        )
          ? "Some study workspace data could not be loaded."
          : "",
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    researchDocumentId,
    attempt,
    destination?.tab,
    destination?.folder,
    destination?.fileId,
    destination?.panel,
  ]);
  const [defenseTeamStage, setDefenseTeamStage] = useState<
    "proposal" | "final"
  >("proposal");
  // Review-assignment contacts describe the proposal-stage setup. Once a
  // stage-specific team is loaded, the final defense view must reflect only
  // what was actually assigned for final (Unassigned until the instructor
  // assigns it) instead of mirroring the proposal contacts.
  const fallbackPeople =
    projectTeam != null && defenseTeamStage === "final" ? undefined : people;
  const instructorName =
    projectTeam?.instructor?.name ??
    fallbackPeople?.section?.instructor_name ??
    null;
  const adviserName =
    projectTeam?.adviser?.name ?? reviewerName(fallbackPeople, "adviser");
  const editorName =
    projectTeam?.support_assignments.editor?.name ??
    reviewerName(fallbackPeople, "research_editor") ??
    reviewerName(fallbackPeople, "editor");
  const statisticianName =
    projectTeam?.support_assignments.statistician?.name ??
    reviewerName(fallbackPeople, "statistician");
  const librarianName =
    projectTeam?.support_assignments.librarian?.name ??
    reviewerName(fallbackPeople, "librarian");
  const panelNames =
    projectTeam?.panel_members.map((member) => member.name) ??
    fallbackPeople?.reviewers
      .filter((reviewer) => reviewer.review_role === "panel")
      .map((reviewer) => reviewer.name) ??
    [];
  const representativeName =
    projectTeam?.research_office_representative?.name ??
    reviewerName(fallbackPeople, "research_office_representative");
  const chairName =
    projectTeam?.chair?.name ?? reviewerName(fallbackPeople, "chair");
  const readinessAvailable = projectTeam != null;
  const folderOptions = [
    ...folders,
    ...(files.some((file) => !file.relative_path) ? ["Unfiled"] : []),
  ].filter((folder, index, values) => values.indexOf(folder) === index);

  const actorRows = (
    rows: Array<[string, string | null | undefined, string]>,
    prefix: string,
  ) =>
    rows.map(([actorLabel, actorName, note]) => (
      <div className="project-actor-row" key={`${prefix}-${actorLabel}`}>
        <span>
          <strong>{actorLabel}</strong>
          <small>{note}</small>
        </span>
        <span className={actorName ? "actor-name" : "actor-name is-empty"}>
          {actorName || "Unassigned"}
        </span>
      </div>
    ));

  return (
    <div
      className="title-member-panel project-page-panel"
      data-testid="study-workspace"
    >
      <div className="title-member-panel-heading">
        <div>
          <p className="eyebrow">Research project</p>
          <h3>{title}</h3>
        </div>
        {(controls?.onEditTitle || controls?.onDeleteProject) && (
          <div className="section-block-actions">
            {controls.onEditTitle && (
              <Button
                variant="secondary"
                className="icon-button"
                aria-label="Edit research title"
                title="Edit research title"
                onClick={controls.onEditTitle}
              >
                <Pencil />
              </Button>
            )}
            {controls.onDeleteProject && (
              <Button
                variant="secondary"
                className="icon-button"
                aria-label="Delete research project"
                title="Delete research project"
                onClick={controls.onDeleteProject}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="project-workspace-context">
        {context.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
      <nav
        className="project-workspace-tabs"
        aria-label="Research study workspace"
      >
        {(
          [
            ["overview", "Overview", FileText],
            ["team", "Research Team", UsersRound],
            ["documents", "Documents", Folder],
          ] as const
        ).map(([item, itemLabel, Icon]) => (
          <button
            type="button"
            key={item}
            className={tab === item ? "is-active" : ""}
            aria-current={tab === item ? "page" : undefined}
            onClick={() => setTab(item)}
          >
            <Icon aria-hidden="true" />
            <span>{itemLabel}</span>
          </button>
        ))}
        <DefenseMonitoringMenu
          key={tab}
          active={tab === "monitoring"}
          defenseType={defenseType}
          onSelect={(type) => {
            setDefenseType(type);
            setTab("monitoring");
          }}
        />
      </nav>

      {loading && (
        <p className="section-documents-loading">Loading study workspace…</p>
      )}
      {loadError && (
        <div className="dashboard-error panel-card" role="alert">
          <p>{loadError}</p>
          <Button
            variant="secondary"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Retry
          </Button>
        </div>
      )}

      {tab === "overview" && (
        <div className="project-workspace-section project-overview-grid">
          <section className="project-overview-card project-overview-card-wide">
            <div className="project-card-heading">
              <div>
                <p className="eyebrow">Study summary</p>
                <h4>Research workspace</h4>
              </div>
              <span className="badge badge-active">{badgeLabel}</span>
            </div>
            <dl className="project-overview-stats">
              <div>
                <dt>Researchers</dt>
                <dd>{researchers.length}</dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>{files.length}</dd>
              </div>
              <div>
                <dt>Folders</dt>
                <dd>{folderOptions.length}</dd>
              </div>
              <div>
                <dt>Document folders</dt>
                <dd>{folderOptions.length}</dd>
              </div>
            </dl>
            {summary && <p>{summary}</p>}
            <div className="project-sdg-summary">
              <strong>Sustainable Development Goals</strong>

              {sdgs.length > 0 ? (
                <SdgBadges sdgs={sdgs} />
              ) : (
                <small>No SDGs assigned to this research yet.</small>
              )}
            </div>
            <div className="project-readiness-list">
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>Before Proposal Defense</strong>
                  <small>
                    {readinessAvailable
                      ? projectTeam.pre_defense_ready
                        ? "Required team members are assigned and accepted."
                        : "Waiting for one or more required team assignments."
                      : "Assignment status is managed by the Research Instructor."}
                  </small>
                </span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>After Proposal Defense</strong>
                  <small>
                    {readinessAvailable
                      ? projectTeam.post_defense_ready
                        ? "Adviser, editor, librarian, three panels, Research Rep, and Chair are ready."
                        : "The post-defense team is not complete yet."
                      : "Assignment status is managed by the Research Instructor."}
                  </small>
                </span>
              </div>
            </div>
          </section>
          <section className="project-overview-card">
            <div className="project-card-heading">
              <div>
                <p className="eyebrow">Researchers</p>
                <h4>Study members</h4>
              </div>
              {controls?.onManageAssignments && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => setTab("team")}
                >
                  Manage
                </button>
              )}
            </div>
            {researchers.length === 0 ? (
              <p className="project-empty-copy">No researchers assigned yet.</p>
            ) : (
              <ul className="project-compact-list">
                {researchers.map((researcher) => (
                  <li key={researcher.id}>
                    <span className="project-person-avatar" aria-hidden="true">
                      {researcher.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{researcher.name}</strong>
                      <small>{researcher.email ?? "Student researcher"}</small>
                    </span>
                    {controls?.onRemoveResearcher && (
                      <button
                        type="button"
                        className="icon-button button-quiet"
                        aria-label={`Remove ${researcher.name}`}
                        title="Remove researcher"
                        disabled={controls.researcherActionsDisabled}
                        onClick={() =>
                          controls.onRemoveResearcher?.(researcher)
                        }
                      >
                        <Trash2 />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="project-overview-card">
            <div className="project-card-heading">
              <div>
                <p className="eyebrow">Recent files</p>
                <h4>Latest documents</h4>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => setTab("documents")}
              >
                View all
              </button>
            </div>
            {files.length === 0 ? (
              <p className="project-empty-copy">
                No manuscript files uploaded yet.
              </p>
            ) : (
              <ul className="project-compact-list project-file-preview-list">
                {[...files]
                  .sort(
                    (a, b) =>
                      new Date(b.uploaded_at ?? 0).getTime() -
                      new Date(a.uploaded_at ?? 0).getTime(),
                  )
                  .slice(0, 4)
                  .map((file) => (
                    <li key={file.id}>
                      <FileText aria-hidden="true" />
                      <span>
                        <strong>{file.original_filename}</strong>
                        <small>
                          {file.relative_path ?? "Unfiled"} · v
                          {file.version_number}
                        </small>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "team" && (
        <div className="project-workspace-section">
          <div className="project-section-heading">
            <div>
              <p className="eyebrow">Research Team</p>
              <h4>People assigned to this study</h4>
              <p>
                Role-specific controls remain available only to authorized
                members of the research team.
              </p>
            </div>
            {controls?.onManageAssignments && (
              <Button
                variant="secondary"
                onClick={() => controls.onManageAssignments?.(defenseTeamStage)}
              >
                <UsersRound /> Manage assignments
              </Button>
            )}
          </div>
          <section className="project-team-block">
            <div className="project-team-block-heading">
              <div>
                <h5>Student researchers</h5>
                <span>{researchers.length} assigned</span>
              </div>
            </div>
            {researchers.length === 0 ? (
              <p className="project-empty-copy">
                No students are assigned to this research title.
              </p>
            ) : (
              <ul className="title-member-list project-researcher-list">
                {researchers.map((researcher) => (
                  <li key={researcher.id}>
                    <span>
                      <strong>{researcher.name}</strong>
                      <small>{researcher.email ?? "Researcher"}</small>
                    </span>
                    {controls?.onRemoveResearcher && (
                      <Button
                        variant="quiet"
                        className="icon-button"
                        aria-label={`Remove ${researcher.name}`}
                        title="Remove student from this study"
                        disabled={controls.researcherActionsDisabled}
                        onClick={() =>
                          controls.onRemoveResearcher?.(researcher)
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {teamLoading ? (
            <p className="section-documents-loading">
              Loading current team assignments…
            </p>
          ) : (
            <>
              <div className="project-team-stage-control">
                <label>
                  Defense team
                  <select
                    value={defenseTeamStage}
                    onChange={(event) => {
                      const stage = event.target.value as "proposal" | "final";
                      setDefenseTeamStage(stage);
                      controls?.onDefenseTeamStageChange?.(stage);
                    }}
                  >
                    <option value="proposal">Proposal Defense</option>
                    <option value="final">Final Defense</option>
                  </select>
                </label>
              </div>

            <div className="project-stage-columns">
              {defenseTeamStage === "proposal" ? (
                <>
                  <section className="project-team-block">
                    <div className="project-team-block-heading">
                      <div>
                        <p className="eyebrow">Before Proposal Defense</p>
                        <h5>Pre-defense team</h5>
                      </div>

                      {readinessAvailable && (
                        <span
                          className={
                            projectTeam.pre_defense_ready
                              ? "status-dot is-ready"
                              : "status-dot"
                          }
                        >
                          {projectTeam.pre_defense_ready ? "Ready" : "Incomplete"}
                        </span>
                      )}
                    </div>

                    <div className="project-actor-grid">
                      {actorRows(
                        [
                          [
                            "Research Instructor",
                            instructorName,
                            "Automatically assigned",
                          ],
                          [
                            "Research Adviser",
                            adviserName,
                            "Instructor assigned",
                          ],
                          ["Editor", editorName, "Researcher assigned"],
                          [
                            "Statistician",
                            statisticianName,
                            "Researcher assigned",
                          ],
                          ["Librarian", librarianName, "Researcher assigned"],
                        ],
                        "pre",
                      )}
                    </div>
                  </section>

                  <section className="project-team-block">
                    <div className="project-team-block-heading">
                      <div>
                        <p className="eyebrow">After Proposal Defense</p>
                        <h5>Post-defense team</h5>
                      </div>

                      {readinessAvailable && (
                        <span
                          className={
                            projectTeam.post_defense_ready
                              ? "status-dot is-ready"
                              : "status-dot"
                          }
                        >
                          {projectTeam.post_defense_ready ? "Ready" : "Incomplete"}
                        </span>
                      )}
                    </div>

                    <div className="project-actor-grid">
                      {actorRows(
                        [
                          [
                            "Research Instructor",
                            instructorName,
                            "Automatically assigned",
                          ],
                          [
                            "Research Adviser",
                            adviserName,
                            "Instructor assigned",
                          ],
                          ["Editor", editorName, "Researcher assigned"],
                          ["Librarian", librarianName, "Researcher assigned"],
                          ["Panel 1", panelNames[0], "Instructor assigned"],
                          ["Panel 2", panelNames[1], "Instructor assigned"],
                          ["Panel 3", panelNames[2], "Instructor assigned"],
                          [
                            "Research Rep",
                            representativeName,
                            "Research Office personnel",
                          ],
                          ["Chair", chairName, "Panel chair"],
                        ],
                        "post",
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <section className="project-team-block">
                    <div className="project-team-block-heading">
                      <div>
                        <p className="eyebrow">Before Final Defense</p>
                        <h5>Pre-defense team</h5>
                      </div>

                      {readinessAvailable && (
                        <span
                          className={
                            projectTeam.pre_defense_ready
                              ? "status-dot is-ready"
                              : "status-dot"
                          }
                        >
                          {projectTeam.pre_defense_ready ? "Ready" : "Incomplete"}
                        </span>
                      )}
                    </div>

                    <div className="project-actor-grid">
                      {actorRows(
                        [
                          [
                            "Research Instructor",
                            instructorName,
                            "Automatically assigned",
                          ],
                          [
                            "Research Adviser",
                            adviserName,
                            "Instructor assigned",
                          ],
                          ["Editor", editorName, "Researcher assigned"],
                          [
                            "Statistician",
                            statisticianName,
                            "Researcher assigned",
                          ],
                          ["Librarian", librarianName, "Researcher assigned"],
                        ],
                        "pre",
                      )}
                    </div>
                  </section>

                  <section className="project-team-block">
                    <div className="project-team-block-heading">
                      <div>
                        <p className="eyebrow">After Final Defense</p>
                        <h5>Post-defense team</h5>
                      </div>

                      {readinessAvailable && (
                        <span
                          className={
                            projectTeam.post_defense_ready
                              ? "status-dot is-ready"
                              : "status-dot"
                          }
                        >
                          {projectTeam.post_defense_ready ? "Ready" : "Incomplete"}
                        </span>
                      )}
                    </div>

                    <div className="project-actor-grid">
                      {actorRows(
                        [
                          [
                            "Research Instructor",
                            instructorName,
                            "Automatically assigned",
                          ],
                          [
                            "Research Adviser",
                            adviserName,
                            "Instructor assigned",
                          ],
                          ["Editor", editorName, "Researcher assigned"],
                          ["Librarian", librarianName, "Researcher assigned"],
                          ["Panel 1", panelNames[0], "Instructor assigned"],
                          ["Panel 2", panelNames[1], "Instructor assigned"],
                          ["Panel 3", panelNames[2], "Instructor assigned"],
                          [
                            "Research Rep",
                            representativeName,
                            "Research Office personnel",
                          ],
                          ["Chair", chairName, "Panel chair"],
                        ],
                        "post",
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
            </>
          )}
          {actorExtension}
        </div>
      )}

      {tab === "documents" && (
        <div className="project-workspace-section project-documents-layout">
          <aside
            className="project-folder-sidebar"
            aria-label="Document folders"
          >
            <div className="project-folder-sidebar-heading">
              <div>
                <p className="eyebrow">Paper files</p>
                <h4>Folders</h4>
              </div>
            </div>
            <div className="project-folder-nav">
              {folderOptions.map((folder) => (
                <button
                  type="button"
                  key={folder}
                  className={activeFolder === folder ? "is-active" : ""}
                  onClick={() => {
                    setActiveFolder(folder);
                    setFeedbackFile(null);
                  }}
                >
                  <Folder aria-hidden="true" />
                  <span>{folder}</span>
                  <small>
                    {
                      files.filter((file) =>
                        folder === "Unfiled"
                          ? !file.relative_path
                          : file.relative_path === folder,
                      ).length
                    }
                  </small>
                </button>
              ))}
            </div>
          </aside>
          <section className="project-folder-content">
            <div className="project-section-heading project-folder-heading">
              <div>
                <p className="eyebrow">Document folder</p>
                <h4>{activeFolder || "Select a folder"}</h4>
                <p>
                  Previous revisions stay visible so the review history is never
                  lost.
                </p>
              </div>
            </div>
            {!activeFolder ? (
              <p className="project-empty-copy">Choose a document folder.</p>
            ) : files.filter((file) =>
                activeFolder === "Unfiled"
                  ? !file.relative_path
                  : file.relative_path === activeFolder,
              ).length === 0 ? (
              <div className="project-empty-folder">
                <Folder aria-hidden="true" />
                <strong>No documents in this folder yet.</strong>
                <span>
                  Files uploaded by the researchers will appear here with their
                  revision history.
                </span>
              </div>
            ) : (
              <div className="project-document-list">
                {files
                  .filter((file) =>
                    activeFolder === "Unfiled"
                      ? !file.relative_path
                      : file.relative_path === activeFolder,
                  )
                  .sort((a, b) => b.version_number - a.version_number)
                  .map((file) => (
                    <article
                      className={
                        file.id === destination?.fileId
                          ? "project-document-row is-targeted"
                          : "project-document-row"
                      }
                      key={file.id}
                    >
                      <div className="project-document-icon" aria-hidden="true">
                        <FileText />
                      </div>
                      <div className="project-document-copy">
                        <div>
                          <strong>{file.original_filename}</strong>
                          <span
                            className={
                              file.is_current
                                ? "file-version is-current"
                                : "file-version"
                            }
                          >
                            {file.is_current ? "Current" : "Previous"} · v
                            {file.version_number}
                          </span>
                        </div>
                        <small>
                          {label(file.upload_purpose ?? "initial_submission")} ·{" "}
                          {file.uploader_name ?? "Researcher"} ·{" "}
                          {formatPhilippineDateTime(file.uploaded_at)}
                        </small>
                      </div>
                      <div className="project-document-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setFeedbackFile(file)}
                        >
                          Open document
                        </Button>
                        {canPostFeedback && (
                          <Button
                            variant="quiet"
                            onClick={() => setCommentFile(file)}
                          >
                            <MessageSquareText aria-hidden="true" />
                            File feedback
                          </Button>
                        )}
                        <a
                          className="icon-link-button"
                          href={researchFileDownloadUrl(
                            researchDocumentId,
                            file.id,
                          )}
                          aria-label={`Download ${file.original_filename}`}
                          title="Download file"
                        >
                          <Download />
                        </a>
                      </div>
                    </article>
                  ))}
              </div>
            )}
            {feedbackFile && (
              <>
                {feedbackFile.mime_type === "application/pdf" ? (
                  <PdfAnnotationWorkspace
                    key={feedbackFile.id}
                    researchDocumentId={researchDocumentId}
                    file={feedbackFile}
                    canAnnotate={canPostFeedback}
                    onClose={() => setFeedbackFile(null)}
                  />
                ) : (
                  <DocxPreviewWorkspace
                    key={feedbackFile.id}
                    researchDocumentId={researchDocumentId}
                    file={feedbackFile}
                    onClose={() => setFeedbackFile(null)}
                  />
                )}
                <DocumentFeedbackPanel
                  key={`document-review-${feedbackFile.id}`}
                  researchDocumentId={researchDocumentId}
                  file={feedbackFile}
                  canPostFeedback={canPostFeedback}
                  showClose={false}
                  onClose={() => setFeedbackFile(null)}
                />
              </>
            )}
            {commentFile && (
              <Modal
                label={`File feedback for ${commentFile.original_filename}`}
                onClose={() => setCommentFile(null)}
                size="large"
                className="modal-panel-feedback"
                showClose={false}
              >
                <DocumentFeedbackPanel
                  key={`feedback-${commentFile.id}`}
                  researchDocumentId={researchDocumentId}
                  file={commentFile}
                  canPostFeedback={canPostFeedback}
                  onClose={() => setCommentFile(null)}
                />
              </Modal>
            )}
          </section>
        </div>
      )}

      {tab === "monitoring" && (
        <div className="project-workspace-section">
          <SharedMonitoring
            key={`${researchDocumentId}:${defenseType}`}
            role={role}
            researchDocumentId={researchDocumentId}
            embedded
            readOnly={monitoringReadOnly}
            defenseType={defenseType}
          />
        </div>
      )}
    </div>
  );
}
