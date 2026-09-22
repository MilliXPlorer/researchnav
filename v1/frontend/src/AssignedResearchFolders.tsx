import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Folder, RefreshCw } from "lucide-react";
import {
  assignOfficeRepresentative,
  getInternalResearch,
  getOfficeProjectTeam,
  getResearchPeople,
  listOfficeRepresentativeCandidates,
  listSharedMonitoringResearch,
  type InstructorProjectTeam,
  type ProjectTeamPerson,
  type ResearchDocumentSummaryResource,
  type ResearchPeopleResource,
  type SharedMonitoringResearch,
} from "./api";
import { Button } from "./components";
import ResearchFolderRow from "./ResearchFolderRow";
import StudyWorkspace from "./StudyWorkspace";
import { matchesStudySearch } from "./studySearch";
import type { ResearchWorkspaceDestination } from "./researchWorkspaceRoute";
import type { Role } from "./types";

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AssignedResearchFolders(props: {
  role: Role;
  actorKey?: string;
  initialResearchDocumentId?: string | number;
  destination?: ResearchWorkspaceDestination;
}) {
  return (
    <AssignedResearchFoldersContent
      key={`${props.role}:${props.actorKey ?? ""}`}
      {...props}
    />
  );
}

function AssignedResearchFoldersContent({
  role,
  actorKey,
  initialResearchDocumentId,
  destination,
}: {
  role: Role;
  actorKey?: string;
  initialResearchDocumentId?: string | number;
  destination?: ResearchWorkspaceDestination;
}) {
  const [folders, setFolders] = useState<SharedMonitoringResearch[]>([]);
  const [selected, setSelected] = useState(
    initialResearchDocumentId === undefined
      ? ""
      : String(initialResearchDocumentId),
  );
  const selectedRef = useRef(selected);
  const [research, setResearch] =
    useState<ResearchDocumentSummaryResource | null>(null);
  const [loadedId, setLoadedId] = useState("");
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
  const [stageFilter, setStageFilter] = useState("");

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  function clearSelectedStudy() {
    setSelected("");
    setResearch(null);
    setPeople(null);
    setTeam(null);
    setRepresentatives([]);
    setRepresentativeId("");
    setRepresentativeBusy(false);
    setLoadedId("");
  }

  useEffect(() => {
    let cancelled = false;

    void listSharedMonitoringResearch()
      .then((items) => {
        if (cancelled) return;
        if (initialResearchDocumentId === undefined) clearSelectedStudy();
        setFolders(items);
        setError("");
      })
      .catch(() => {
        if (cancelled) return;
        if (initialResearchDocumentId === undefined) clearSelectedStudy();
        setFolders([]);
        setError("Assigned research folders could not be loaded.");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [attempt, actorKey, initialResearchDocumentId]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    void Promise.all([
      getInternalResearch(selected),
      getResearchPeople(selected),
    ])
      .then(async ([record, researchPeople]) => {
        const officeData =
          role === "research-office" && record.section_id != null
            ? await Promise.all([
                getOfficeProjectTeam(selected),
                listOfficeRepresentativeCandidates(selected),
              ])
            : null;

        if (cancelled) return;
        setResearch(record);
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
    const researchId = String(research.id);
    setRepresentativeBusy(true);
    try {
      const updated = await assignOfficeRepresentative(
        research.id,
        representativeId || null,
      );
      if (selectedRef.current !== researchId) return;
      setTeam(updated);
      setError("");
    } catch {
      if (selectedRef.current !== researchId) return;
      setError("The Research Representative assignment could not be saved.");
    } finally {
      if (selectedRef.current === researchId) setRepresentativeBusy(false);
    }
  }

  function refreshFolders() {
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  const institutes = Array.from(
    new Set(folders.map((folder) => folder.institute).filter(Boolean)),
  ).sort() as string[];
  const stages = Array.from(
    new Set(folders.map((folder) => folder.research_stage).filter(Boolean)),
  ).sort();
  const visibleFolders = folders
    .filter(
      (folder) =>
        (!stageFilter || folder.research_stage === stageFilter) &&
        (role !== "research-office" ||
          !instituteFilter ||
          folder.institute === instituteFilter) &&
        matchesStudySearch(folderSearch, [
          folder.title,
          folder.researchers.join(" "),
          folder.institute,
          folder.research_stage,
        ]),
    )
    .sort((left, right) =>
      role === "research-office"
        ? (left.institute || "").localeCompare(right.institute || "") ||
          left.title.localeCompare(right.title)
        : 0,
    );

  const actorExtension =
    role !== "research-office" || !research ? undefined : research.section_id !=
      null ? (
      <section className="project-team-block office-representative-assignment">
        <div className="project-team-block-heading">
          <div>
            <p className="eyebrow">Defense monitoring forms</p>
            <h4>Research Representative</h4>
            <p>
              Assign active Research Office personnel to participate in this
              project&apos;s official defense forms.
            </p>
          </div>
        </div>
        <div className="office-representative-control">
          <label>
            <span>Representative</span>
            <select
              value={representativeId}
              onChange={(event) => setRepresentativeId(event.target.value)}
            >
              <option value="">No representative assigned</option>
              {representatives.map((person) => (
                <option key={person.user_id} value={person.user_id}>
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
                (team?.research_office_representative?.user_id ?? "")
            }
          >
            {representativeBusy ? "Saving..." : "Save assignment"}
          </Button>
        </div>
      </section>
    ) : (
      <p className="project-empty-copy">
        Research Representative assignment is available for section research
        projects. This imported folder remains available for Research Office
        review.
      </p>
    );

  return (
    <div className="workspace-content admin-sidebar-page">
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!selected && (
        <>
          <header className="role-page-heading">
            <div>
              <p className="eyebrow">Assigned research</p>
              <h1>Assigned Research</h1>
              <p>
                Open a study to review its documents, feedback, and defense
                monitoring forms.
              </p>
            </div>
            <Button variant="secondary" onClick={refreshFolders}>
              <RefreshCw /> Refresh
            </Button>
          </header>
          {loading ? (
            <p className="admin-empty" aria-busy="true">
              Loading assigned studies…
            </p>
          ) : folders.length === 0 ? (
            <section className="panel-card submissions-empty-state">
              <Folder />
              <h2>No assigned research folders</h2>
              <p>
                Only research where you have an active assignment appears here.
              </p>
            </section>
          ) : (
            <aside
              className="project-folder-sidebar assigned-research-folders research-folder-surface"
              aria-label="Assigned research folders"
            >
              <div className="project-folder-sidebar-heading">
                <div>
                  <p className="eyebrow">Studies</p>
                  <h4>Folders</h4>
                </div>
              </div>
              <div className="study-list-controls assigned-research-controls">
                <label className="study-list-search">
                  <span>Search assigned studies</span>
                  <input
                    type="search"
                    value={folderSearch}
                    placeholder="Search assigned studies..."
                    onChange={(event) => setFolderSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span>Research stage</span>
                  <select
                    aria-label="Research stage filter"
                    value={stageFilter}
                    onChange={(event) => setStageFilter(event.target.value)}
                  >
                    <option value="">All stages</option>
                    {stages.map((stage) => (
                      <option key={stage} value={stage}>
                        {label(stage)}
                      </option>
                    ))}
                  </select>
                </label>
                {role === "research-office" && (
                  <label>
                    <span>Institute</span>
                    <select
                      aria-label="Institute filter"
                      value={instituteFilter}
                      onChange={(event) =>
                        setInstituteFilter(event.target.value)
                      }
                    >
                      <option value="">All institutes</option>
                      {institutes.map((institute) => (
                        <option key={institute} value={institute}>
                          {institute}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(stageFilter || instituteFilter) && (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => {
                      setStageFilter("");
                      setInstituteFilter("");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="project-folder-nav research-folder-list">
                {visibleFolders.length === 0 && (
                  <p className="project-empty-copy">
                    No assigned studies match your search.
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
                        setRepresentativeBusy(false);
                        setSelected(String(item.id));
                      }}
                    />
                  </div>
                ))}
              </div>
            </aside>
          )}
        </>
      )}
      {selected && (
        <section
          className="section-page-view"
          aria-label={
            research && loadedId === selected
              ? `Assigned research study: ${research.title}`
              : "Assigned research study"
          }
        >
          <div className="section-page-toolbar">
            <Button variant="quiet" onClick={clearSelectedStudy}>
              <ArrowLeft aria-hidden="true" /> Back to Assigned Research
            </Button>
          </div>
          {!research || loadedId !== selected ? (
            <p className="admin-empty" aria-busy="true">
              Loading study details…
            </p>
          ) : (
            <StudyWorkspace
              key={research.id}
              role={role}
              researchDocumentId={research.id}
              title={research.title}
              context={[
                research.institute || "Institute not set",
                research.degree_program || "Program not set",
                label(research.research_stage),
                label(research.submission_status),
              ]}
              researchers={research.authors.map((author) => ({
                id: String(author.id),
                name: author.author_name,
              }))}
              people={people}
              projectTeam={team ?? undefined}
              badgeLabel="Assigned record"
              summary={research.abstract}
              sdgs={research.sdgs}
              actorExtension={actorExtension}
              canPostFeedback={
                role === "adviser" ||
                role === "instructor" ||
                role === "panel" ||
                role === "research-office" ||
                role === "admin"
              }
              destination={destination}
            />
          )}
        </section>
      )}
    </div>
  );
}
