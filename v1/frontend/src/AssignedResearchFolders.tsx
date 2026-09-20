import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Folder,
  MessageSquareText,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import {
  assignOfficeRepresentative,
  getInternalResearch,
  getOfficeProjectTeam,
  getResearchPeople,
  listResearchFiles,
  listOfficeRepresentativeCandidates,
  listSharedMonitoringResearch,
  researchFileDownloadUrl,
  researchFilePreviewUrl,
  type DocumentFileResource,
  type InstructorProjectTeam,
  type ProjectTeamPerson,
  type ResearchDocumentSummaryResource,
  type ResearchPeopleResource,
  type SharedMonitoringResearch,
} from "./api";
import { Button } from "./components";
import ResearchActivity from "./ResearchActivity";
import ResearchFolderRow from "./ResearchFolderRow";
import SharedMonitoring from "./SharedMonitoring";
import type { Role } from "./types";

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AssignedResearchFolders({
  role,
  actorKey,
}: {
  role: Role;
  actorKey?: string;
}) {
  const [folders, setFolders] = useState<SharedMonitoringResearch[]>([]);
  const [selected, setSelected] = useState("");
  const [research, setResearch] =
    useState<ResearchDocumentSummaryResource | null>(null);
  const [loadedId, setLoadedId] = useState("");
  const [files, setFiles] = useState<DocumentFileResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [team, setTeam] = useState<InstructorProjectTeam | null>(null);
  const [people, setPeople] = useState<ResearchPeopleResource | null>(null);
  const [representatives, setRepresentatives] = useState<ProjectTeamPerson[]>(
    [],
  );
  const [representativeId, setRepresentativeId] = useState("");
  const [representativeBusy, setRepresentativeBusy] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const [instituteFilter, setInstituteFilter] = useState("");
  const [projectTab, setProjectTab] = useState<
    "overview" | "team" | "documents" | "feedback" | "monitoring"
  >("overview");
  const [monitoringMenuOpen, setMonitoringMenuOpen] = useState(false);
  const [defenseType, setDefenseType] = useState<"proposal" | "final">(
    "proposal",
  );

  useEffect(() => {
    let cancelled = false;

    setFolders([]);
    setSelected("");
    setResearch(null);
    setFiles([]);
    setPeople(null);
    setTeam(null);
    setRepresentatives([]);
    setRepresentativeId("");
    setLoadedId("");
    setLoading(true);
    void listSharedMonitoringResearch()
      .then((items) => {
        if (cancelled) return;
        setFolders(items);
        setSelected((current) =>
          items.some((item) => String(item.id) === current) ? current : "",
        );
        setError("");
      })
      .catch(
        () =>
          !cancelled &&
          setError("Assigned research folders could not be loaded."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attempt, actorKey]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void Promise.all([
      getInternalResearch(selected),
      listResearchFiles(selected),
      getResearchPeople(selected),
    ])
      .then(async ([record, documents, researchPeople]) => {
        const officeData =
          role === "research-office" && record.section_id != null
            ? await Promise.all([
                getOfficeProjectTeam(selected),
                listOfficeRepresentativeCandidates(selected),
              ])
            : null;
        if (!cancelled) {
          setResearch(record);
          setFiles(documents);
          setPeople(researchPeople);
          if (officeData) {
            const [loadedTeam, officeRepresentatives] = officeData;
            setTeam(loadedTeam);
            setRepresentatives(officeRepresentatives);
            setRepresentativeId(
              loadedTeam.research_office_representative?.user_id ?? "",
            );
          } else {
            setTeam(null);
            setRepresentatives([]);
            setRepresentativeId("");
          }
          setLoadedId(selected);
          setError("");
        }
      })
      .catch(
        () =>
          !cancelled &&
          setError(
            "This folder is unavailable or is no longer assigned to you.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [selected, attempt, role]);

  async function saveRepresentative() {
    if (!research) return;
    setRepresentativeBusy(true);
    try {
      const updated = await assignOfficeRepresentative(
        research.id,
        representativeId || null,
      );
      setTeam(updated);
      setError("");
    } catch {
      setError("The Research Representative assignment could not be saved.");
    } finally {
      setRepresentativeBusy(false);
    }
  }

  const fileFolders = Array.from(
    new Set(files.map((file) => file.relative_path || "Unfiled")),
  );
  const institutes = Array.from(
    new Set(folders.map((folder) => folder.institute).filter(Boolean)),
  ).sort() as string[];
  const normalizedFolderSearch = folderSearch.trim().toLocaleLowerCase();
  const visibleFolders =
    role === "research-office"
      ? folders
          .filter(
            (folder) =>
              (!instituteFilter || folder.institute === instituteFilter) &&
              (!normalizedFolderSearch ||
                `${folder.title} ${folder.researchers.join(" ")}`
                  .toLocaleLowerCase()
                  .includes(normalizedFolderSearch)),
          )
          .sort(
            (left, right) =>
              (left.institute || "").localeCompare(right.institute || "") ||
              left.title.localeCompare(right.title),
          )
      : folders;

  return (
    <div className="workspace-content admin-sidebar-page">
      <header className="role-page-heading">
        <div>
          <p className="eyebrow">Assigned research</p>
          <h1>Research folders</h1>
          <p>
            Track student documents, revisions, feedback, and defense monitoring
            forms in one read-only workspace.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw /> Refresh
        </Button>
      </header>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="admin-empty" aria-busy="true">
          Loading assigned folders…
        </p>
      ) : folders.length === 0 ? (
        <section className="panel-card submissions-empty-state">
          <Folder />
          <h2>No assigned research folders</h2>
          <p>Only research where you have an active assignment appears here.</p>
        </section>
      ) : (
        <div
          className={`project-documents-layout assigned-research-folders${selected ? " has-selection" : ""}`}
        >
          <aside
            className="project-folder-sidebar"
            aria-label="Assigned research folders"
          >
            <div className="project-folder-sidebar-heading">
              <div>
                <p className="eyebrow">Studies</p>
                <h4>Folders</h4>
              </div>
            </div>
            {role === "research-office" && (
              <div className="office-folder-filters">
                <label>
                  <span>Search folders</span>
                  <input
                    type="search"
                    value={folderSearch}
                    placeholder="Title or researcher"
                    onChange={(event) => setFolderSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span>Institute</span>
                  <select
                    value={instituteFilter}
                    onChange={(event) => setInstituteFilter(event.target.value)}
                  >
                    <option value="">All institutes</option>
                    {institutes.map((institute) => (
                      <option key={institute} value={institute}>
                        {institute}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="project-folder-nav research-folder-list">
              {visibleFolders.length === 0 && (
                <p className="project-empty-copy">
                  No ongoing research folders match these filters.
                </p>
              )}
              {visibleFolders.map((item, index) => (
                <div key={item.id}>
                  {role === "research-office" &&
                    (index === 0 ||
                      visibleFolders[index - 1]?.institute !==
                        item.institute) && (
                      <p className="project-folder-institute">
                        {item.institute || "Institute not set"}
                      </p>
                    )}
                  <ResearchFolderRow
                    title={item.title}
                    metadata={
                      item.research_stage
                        ? label(item.research_stage)
                        : "Research project"
                    }
                    detail={item.researchers.join(", ") || "Researchers"}
                    selected={selected === String(item.id)}
                    onOpen={() => {
                      setSelected(String(item.id));
                      setProjectTab("overview");
                      setMonitoringMenuOpen(false);
                      setDefenseType("proposal");
                    }}
                  />
                </div>
              ))}
            </div>
          </aside>
          {selected && (
            <main className="project-folder-content">
              {!research || loadedId !== selected ? (
                <p className="admin-empty" aria-busy="true">
                  Loading folder details…
                </p>
              ) : (
                <>
                  <div className="project-workspace-context">
                    <span>{research.institute || "Institute not set"}</span>
                    <span>{research.degree_program || "Program not set"}</span>
                    <span>{label(research.research_stage)}</span>
                    <span>{label(research.submission_status)}</span>
                    <span>Read only</span>
                  </div>
                  <nav
                    className="project-workspace-tabs"
                    aria-label="Research study workspace"
                  >
                    {(
                      [
                        ["overview", "Overview", FileText],
                        ["team", "Research actors", UsersRound],
                        ["documents", "Documents", Folder],
                        ["feedback", "Feedback", MessageSquareText],
                      ] as const
                    ).map(([tab, tabLabel, Icon]) => (
                      <button
                        type="button"
                        key={tab}
                        className={projectTab === tab ? "is-active" : ""}
                        aria-current={projectTab === tab ? "page" : undefined}
                        onClick={() => setProjectTab(tab)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{tabLabel}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={projectTab === "monitoring" ? "is-active" : ""}
                      aria-current={
                        projectTab === "monitoring" ? "page" : undefined
                      }
                      aria-expanded={monitoringMenuOpen}
                      onClick={() => setMonitoringMenuOpen((open) => !open)}
                    >
                      <ClipboardCheck aria-hidden="true" />
                      <span>Defense Monitoring Forms</span>
                      <ChevronDown
                        className="sidebar-nav-chevron"
                        aria-hidden="true"
                      />
                    </button>
                    {monitoringMenuOpen && (
                      <>
                        {(["proposal", "final"] as const).map((type) => (
                          <button
                            type="button"
                            key={type}
                            className={
                              projectTab === "monitoring" &&
                              defenseType === type
                                ? "is-active"
                                : ""
                            }
                            onClick={() => {
                              setDefenseType(type);
                              setProjectTab("monitoring");
                            }}
                          >
                            {type === "proposal"
                              ? "Proposal Defense"
                              : "Final Defense"}
                          </button>
                        ))}
                      </>
                    )}
                  </nav>

                  {projectTab === "overview" && (
                    <div className="project-workspace-section project-overview-grid">
                      <section className="project-overview-card project-overview-card-wide">
                        <div className="project-card-heading">
                          <div>
                            <p className="eyebrow">Study summary</p>
                            <h4>{research.title}</h4>
                          </div>
                          <span className="badge badge-active">
                            Read-only record
                          </span>
                        </div>
                        <dl className="project-overview-stats">
                          <div>
                            <dt>Researchers</dt>
                            <dd>{research.authors.length}</dd>
                          </div>
                          <div>
                            <dt>Documents</dt>
                            <dd>{files.length}</dd>
                          </div>
                          <div>
                            <dt>Folders</dt>
                            <dd>{fileFolders.length}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{label(research.submission_status)}</dd>
                          </div>
                        </dl>
                        <p>
                          {research.abstract ||
                            "No abstract has been provided yet."}
                        </p>
                      </section>
                      <section className="project-overview-card">
                        <div className="project-card-heading">
                          <div>
                            <p className="eyebrow">Researchers</p>
                            <h4>Study members</h4>
                          </div>
                        </div>
                        <ul className="project-compact-list">
                          {research.authors.map((author) => (
                            <li key={author.id}>
                              <span
                                className="project-person-avatar"
                                aria-hidden="true"
                              >
                                {author.author_name.slice(0, 1).toUpperCase()}
                              </span>
                              <span>
                                <strong>{author.author_name}</strong>
                                <small>Student researcher</small>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  )}

                  {projectTab === "team" && (
                    <div className="project-workspace-section">
                      <div className="project-section-heading">
                        <div>
                          <p className="eyebrow">Research actors</p>
                          <h4>People connected to this study</h4>
                          <p>
                            Assignments are managed by the Research Instructor.
                            This view does not permit amendments.
                          </p>
                        </div>
                      </div>
                      <section className="project-team-block">
                        <div className="project-team-block-heading">
                          <div>
                            <h5>Student researchers</h5>
                            <span>{research.authors.length} listed</span>
                          </div>
                        </div>
                        <ul className="title-member-list">
                          {research.authors.map((author) => (
                            <li key={author.id}>
                              <span>
                                <strong>{author.author_name}</strong>
                                <small>Researcher</small>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                      {people?.section?.instructor_name && (
                        <section className="project-team-block">
                          <div className="project-team-block-heading">
                            <div>
                              <h5>Research Instructor</h5>
                              <span>{people.section.name}</span>
                            </div>
                          </div>
                          <ul className="title-member-list">
                            <li>
                              <span>
                                <strong>
                                  {people.section.instructor_name}
                                </strong>
                                <small>Research Instructor</small>
                              </span>
                            </li>
                          </ul>
                        </section>
                      )}
                      {people && people.reviewers.length > 0 && (
                        <section className="project-team-block">
                          <div className="project-team-block-heading">
                            <div>
                              <h5>Assigned reviewers</h5>
                              <span>{people.reviewers.length} active</span>
                            </div>
                          </div>
                          <ul className="title-member-list">
                            {people.reviewers.map((reviewer, index) => (
                              <li key={`${reviewer.review_role}-${index}`}>
                                <span>
                                  <strong>
                                    {reviewer.name || "Assigned reviewer"}
                                  </strong>
                                  <small>{label(reviewer.review_role)}</small>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {role === "research-office" &&
                        research.section_id != null && (
                          <section className="project-team-block office-representative-assignment">
                            <div className="project-team-block-heading">
                              <div>
                                <p className="eyebrow">
                                  Defense monitoring forms
                                </p>
                                <h4>Research Representative</h4>
                                <p>
                                  Assign active Research Office personnel to
                                  participate in this project&apos;s official
                                  defense forms.
                                </p>
                              </div>
                            </div>
                            <div className="office-representative-control">
                              <label>
                                <span>Representative</span>
                                <select
                                  value={representativeId}
                                  onChange={(event) =>
                                    setRepresentativeId(event.target.value)
                                  }
                                >
                                  <option value="">
                                    No representative assigned
                                  </option>
                                  {representatives.map((person) => (
                                    <option
                                      key={person.user_id}
                                      value={person.user_id}
                                    >
                                      {person.name} ({person.email})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <Button
                                onClick={() => void saveRepresentative()}
                                disabled={
                                  representativeBusy ||
                                  representativeId ===
                                    (team?.research_office_representative
                                      ?.user_id ?? "")
                                }
                              >
                                {representativeBusy
                                  ? "Saving..."
                                  : "Save assignment"}
                              </Button>
                            </div>
                          </section>
                        )}
                      {role === "research-office" &&
                        research.section_id == null && (
                          <p className="project-empty-copy">
                            Research Representative assignment is available for
                            section research projects. This imported folder
                            remains available for Research Office review.
                          </p>
                        )}
                    </div>
                  )}

                  {projectTab === "documents" && (
                    <div className="project-workspace-section">
                      <section className="project-team-block">
                        <div className="project-team-block-heading">
                          <div>
                            <p className="eyebrow">Documents</p>
                            <h4>Files and versions</h4>
                          </div>
                        </div>
                        {fileFolders.length === 0 ? (
                          <p className="project-empty-copy">
                            No documents uploaded yet.
                          </p>
                        ) : (
                          fileFolders.map((folder) => (
                            <div className="project-document-list" key={folder}>
                              <h5>
                                <Folder /> {folder}
                              </h5>
                              {files
                                .filter(
                                  (file) =>
                                    (file.relative_path || "Unfiled") ===
                                    folder,
                                )
                                .map((file) => (
                                  <article
                                    className="project-document-row"
                                    key={file.id}
                                  >
                                    <FileText />
                                    <div className="project-document-copy">
                                      <strong>{file.original_filename}</strong>
                                      <small>
                                        {label(file.document_type)} · Version{" "}
                                        {file.version_number} ·{" "}
                                        {file.is_current
                                          ? "Current"
                                          : "Previous"}
                                      </small>
                                    </div>
                                    <div className="project-document-actions">
                                      {file.mime_type === "application/pdf" && (
                                        <a
                                          className="icon-link-button"
                                          href={researchFilePreviewUrl(
                                            research.id,
                                            file.id,
                                          )}
                                          target="_blank"
                                          rel="noreferrer"
                                          aria-label={`Preview ${file.original_filename}`}
                                        >
                                          <Eye />
                                        </a>
                                      )}
                                      <a
                                        className="icon-link-button"
                                        href={researchFileDownloadUrl(
                                          research.id,
                                          file.id,
                                        )}
                                        aria-label={`Download ${file.original_filename}`}
                                      >
                                        <Download />
                                      </a>
                                    </div>
                                  </article>
                                ))}
                            </div>
                          ))
                        )}
                      </section>
                    </div>
                  )}
                  {projectTab === "feedback" && (
                    <div className="project-workspace-section">
                      <ResearchActivity
                        researchDocumentId={research.id}
                        title={research.title}
                      />
                    </div>
                  )}
                  {projectTab === "monitoring" && (
                    <div className="project-workspace-section">
                      <SharedMonitoring
                        key={defenseType}
                        role={role}
                        researchDocumentId={research.id}
                        embedded
                        readOnly
                        defenseType={defenseType}
                      />
                    </div>
                  )}
                </>
              )}
            </main>
          )}
        </div>
      )}
    </div>
  );
}
