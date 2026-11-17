import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Folder, RefreshCw } from "lucide-react";
import {
  assignOfficeRepresentative,
  archiveInternalResearch,
  getInternalResearch,
  getOfficeProjectTeam,
  getResearchPeople,
  listOfficeRepresentativeCandidates,
  listSharedMonitoringResearch,
  respondToSupportAssignment,
  transitionInternalResearch,
  type InstructorProjectTeam,
  type ProjectTeamPerson,
  type ResearchDocumentSummaryResource,
  type ResearchPeopleResource,
  type SharedMonitoringResearch,
} from "./api";
import { Button } from "./components";
import { ConfirmDialog } from "./Modal";
import ResearchFolderRow from "./ResearchFolderRow";
import StudyWorkspace from "./StudyWorkspace";
import { matchesStudySearch } from "./studySearch";
import type { ResearchWorkspaceDestination } from "./researchWorkspaceRoute";
import type { Role } from "./types";
import SelectMenu from "./SelectMenu";

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FoldersLoading({ label }: { label: string }) {
  return (
    <section
      className="panel-card dashboard-loading"
      role="region"
      aria-label={label}
      aria-busy="true"
    >
      <p>{label}…</p>
    </section>
  );
}

function FoldersError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="panel-card dashboard-error" role="alert">
      <p>{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </section>
  );
}

export default function AssignedResearchFolders(props: {
  role: Role;
  actorKey?: string;
  initialResearchDocumentId?: string | number;
  destination?: ResearchWorkspaceDestination;
  navigate?: (path: string) => void;
  onResearchChanged?: () => void;
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
  navigate,
  onResearchChanged,
}: {
  role: Role;
  actorKey?: string;
  initialResearchDocumentId?: string | number;
  destination?: ResearchWorkspaceDestination;
  navigate?: (path: string) => void;
  onResearchChanged?: () => void;
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
  const [representativeMenuOpen, setRepresentativeMenuOpen] = useState(false);
  const representativeMenuId = useId();
  const representativeMenuRef = useRef<HTMLDivElement>(null);
  const representativeTriggerRef = useRef<HTMLButtonElement>(null);
  const [representativeBusy, setRepresentativeBusy] = useState(false);
  const [representativeLoading, setRepresentativeLoading] = useState(false);
  const [representativeError, setRepresentativeError] = useState("");
  const [representativeFeedback, setRepresentativeFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [folderSearch, setFolderSearch] = useState("");
  const [instituteFilter, setInstituteFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [respondingAssignmentId, setRespondingAssignmentId] = useState<
    number | null
  >(null);
  const [workflowAction, setWorkflowAction] = useState<
    "under_review" | "approved" | "archive" | null
  >(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const workflowPendingRef = useRef(false);
  const [workflowFeedback, setWorkflowFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [archiveVisibility, setArchiveVisibility] = useState<
    "private" | "registered_only" | "public"
  >("private");

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!representativeMenuOpen) return;

    function closeRepresentativeMenu(event: MouseEvent) {
      if (!representativeMenuRef.current?.contains(event.target as Node)) {
        setRepresentativeMenuOpen(false);
      }
    }

    function closeRepresentativeMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setRepresentativeMenuOpen(false);
      representativeTriggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeRepresentativeMenu);
    document.addEventListener("keydown", closeRepresentativeMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeRepresentativeMenu);
      document.removeEventListener("keydown", closeRepresentativeMenuOnEscape);
    };
  }, [representativeMenuOpen]);

  function clearSelectedStudy() {
    setSelected("");
    setResearch(null);
    setPeople(null);
    setTeam(null);
    setRepresentatives([]);
    setRepresentativeId("");
    setRepresentativeMenuOpen(false);
    setRepresentativeBusy(false);
    setRepresentativeLoading(false);
    setRepresentativeError("");
    setRepresentativeFeedback(null);
    setLoadedId("");
    if (initialResearchDocumentId !== undefined) {
      navigate?.("/app/research-office/assigned-research");
    }
  }

  async function respondToAssignment(
    assignmentId: number,
    decision: "accept" | "decline",
  ) {
    setRespondingAssignmentId(assignmentId);
    setError("");
    try {
      await respondToSupportAssignment(assignmentId, decision);
      setAttempt((value) => value + 1);
    } catch {
      setError("The assignment request could not be updated.");
    } finally {
      setRespondingAssignmentId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void listSharedMonitoringResearch()
      .then((items) => {
        if (cancelled) return;
        if (initialResearchDocumentId === undefined) {
          setSelected("");
          setResearch(null);
          setPeople(null);
          setTeam(null);
          setLoadedId("");
        }
        setFolders(items);
        setError("");
      })
      .catch(() => {
        if (cancelled) return;
        if (initialResearchDocumentId === undefined) {
          setSelected("");
          setResearch(null);
          setPeople(null);
          setTeam(null);
          setLoadedId("");
        }
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
        if (cancelled) return;
        setResearch(record);
        setArchiveVisibility(record.visibility);
        setPeople(researchPeople);

        if (role === "research-office" && record.section_id != null) {
          setRepresentativeFeedback(null);
          setRepresentativeLoading(true);
          setRepresentativeError("");
          try {
            const loadedTeam = await getOfficeProjectTeam(selected);
            if (cancelled) return;
            setTeam(loadedTeam);
            setRepresentativeId(
              loadedTeam.research_office_representative?.user_id ?? "",
            );
          } catch {
            if (cancelled) return;
            setTeam(null);
            setRepresentativeId("");
            setRepresentatives([]);
            setRepresentativeLoading(false);
            setLoadedId(selected);
            setError("");
            return;
          }

          try {
            const officeRepresentatives =
              await listOfficeRepresentativeCandidates(selected);
            if (cancelled) return;
            setRepresentatives(officeRepresentatives);
            setRepresentativeError("");
          } catch {
            if (cancelled) return;
            setRepresentatives([]);
            setRepresentativeError(
              "Active Research Office personnel could not be loaded. Retry opening this folder.",
            );
          } finally {
            if (!cancelled) setRepresentativeLoading(false);
          }
        } else {
          setTeam(null);
          setRepresentatives([]);
          setRepresentativeId("");
          setRepresentativeError("");
          setRepresentativeLoading(false);
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
    if (
      !research ||
      !team ||
      representativeBusy ||
      representativeLoading ||
      representativeId === (team.research_office_representative?.user_id ?? "")
    )
      return;
    const researchId = String(research.id);
    setRepresentativeBusy(true);
    setRepresentativeFeedback(null);
    try {
      const updated = await assignOfficeRepresentative(
        research.id,
        representativeId || null,
      );
      if (selectedRef.current !== researchId) return;
      setTeam(updated);
      setRepresentativeId(
        updated.research_office_representative?.user_id ?? "",
      );
      setRepresentativeFeedback({
        type: "success",
        text: "Research Representative assignment saved.",
      });
      setError("");
    } catch {
      if (selectedRef.current !== researchId) return;
      setRepresentativeFeedback({
        type: "error",
        text: "The Research Representative assignment could not be saved. Please try again.",
      });
    } finally {
      if (selectedRef.current === researchId) setRepresentativeBusy(false);
    }
  }

  async function applyWorkflowAction() {
    if (!research || !workflowAction || workflowPendingRef.current) return;
    workflowPendingRef.current = true;
    setWorkflowBusy(true);
    setWorkflowFeedback(null);
    try {
      const updated =
        workflowAction === "archive"
          ? await archiveInternalResearch(research.id, archiveVisibility)
          : await transitionInternalResearch(research.id, workflowAction);
      setResearch((current) =>
        current
          ? { ...current, ...updated, authors: current.authors }
          : current,
      );
      setWorkflowFeedback({
        type: "success",
        text:
          workflowAction === "under_review"
            ? "Research moved to under review."
            : workflowAction === "approved"
              ? "Research approved."
              : "Research archived.",
      });
      setFolders((current) =>
        workflowAction === "archive"
          ? current.filter((folder) => folder.id !== research.id)
          : current.map((folder) =>
              folder.id === research.id ? { ...folder, ...updated } : folder,
            ),
      );
      onResearchChanged?.();
      setWorkflowAction(null);
    } catch {
      setWorkflowFeedback({
        type: "error",
        text: "The research status could not be updated. Refresh and try again.",
      });
      setWorkflowAction(null);
    } finally {
      workflowPendingRef.current = false;
      setWorkflowBusy(false);
    }
  }

  const nextWorkflowAction =
    role !== "research-office" || !research
      ? null
      : research.submission_status === "submitted"
        ? { key: "under_review" as const, label: "Move to under review" }
        : research.submission_status === "under_review"
          ? { key: "approved" as const, label: "Approve research" }
          : research.submission_status === "approved" &&
              research.archive_status !== "archived"
            ? { key: "archive" as const, label: "Archive research" }
            : null;

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

  const currentRepresentative = team?.research_office_representative ?? null;
  const representativeOptions =
    currentRepresentative &&
    !representatives.some(
      (person) => person.user_id === currentRepresentative.user_id,
    )
      ? [...representatives, currentRepresentative]
      : representatives;
  const selectedRepresentative = representativeOptions.find(
    (person) => person.user_id === representativeId,
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
          <div className="office-representative-field">
            <span id={`${representativeMenuId}-label`}>Representative</span>
            <div
              className="office-representative-select"
              ref={representativeMenuRef}
            >
              <button
                ref={representativeTriggerRef}
                type="button"
                aria-labelledby={`${representativeMenuId}-label`}
                aria-haspopup="listbox"
                aria-expanded={representativeMenuOpen}
                aria-controls={representativeMenuId}
                disabled={representativeLoading || representativeBusy || !team}
                onClick={() => setRepresentativeMenuOpen((open) => !open)}
              >
                <span>
                  {selectedRepresentative
                    ? `${selectedRepresentative.name} (${selectedRepresentative.email})`
                    : "No representative assigned"}
                </span>
                <ChevronDown aria-hidden="true" />
              </button>
              {representativeMenuOpen && (
                <div
                  className="office-representative-options"
                  id={representativeMenuId}
                  role="listbox"
                  aria-labelledby={`${representativeMenuId}-label`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={representativeId === ""}
                    onClick={() => {
                      setRepresentativeId("");
                      setRepresentativeFeedback(null);
                      setRepresentativeMenuOpen(false);
                    }}
                  >
                    <span>No representative assigned</span>
                    {representativeId === "" && <Check aria-hidden="true" />}
                  </button>
                  {representativeOptions.map((person) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={representativeId === person.user_id}
                      key={person.user_id}
                      onClick={() => {
                        setRepresentativeId(person.user_id);
                        setRepresentativeFeedback(null);
                        setRepresentativeMenuOpen(false);
                      }}
                    >
                      <span>
                        {person.name} ({person.email})
                      </span>
                      {representativeId === person.user_id && (
                        <Check aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button
            title={
              representativeBusy
                ? "Saving assignment"
                : representativeLoading
                  ? "Loading assignment"
                  : !team
                    ? "Assignment unavailable"
                    : representativeId ===
                        (currentRepresentative?.user_id ?? "")
                      ? "No changes to save"
                      : "Save assignment"
            }
            onClick={() => void saveRepresentative()}
            disabled={
              representativeBusy ||
              representativeLoading ||
              !team ||
              representativeId === (currentRepresentative?.user_id ?? "")
            }
          >
            {representativeBusy ? "Saving..." : "Save assignment"}
          </Button>
        </div>
        {representativeFeedback && (
          <p
            className={`form-message is-${representativeFeedback.type}`}
            role={representativeFeedback.type === "error" ? "alert" : "status"}
          >
            {representativeFeedback.text}
          </p>
        )}
        {representativeLoading && (
          <p className="project-empty-copy">
            Loading Research Office personnel…
          </p>
        )}
        {!representativeLoading && representativeError && (
          <p className="project-empty-copy" role="alert">
            {representativeError}
          </p>
        )}
        {!representativeLoading &&
          !representativeError &&
          representativeOptions.length === 0 && (
            <p className="project-empty-copy">
              No active Research Office personnel found. Ask an administrator to
              activate a research-office account before assigning a
              representative.
            </p>
          )}
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
      {!selected && (
        <>
          <header className="workspace-header">
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
          {error && <FoldersError message={error} onRetry={refreshFolders} />}
          {loading ? (
            <FoldersLoading label="Loading assigned studies" />
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
                  <SelectMenu
                    label="Research stage filter"
                    value={stageFilter}
                    onChange={setStageFilter}
                    options={[
                      { value: "", label: "All stages" },
                      ...stages.map((stage) => ({
                        value: stage,
                        label: label(stage),
                      })),
                    ]}
                  />
                </label>
                {role === "research-office" && (
                  <label>
                    <span>Institute</span>
                    <SelectMenu
                      label="Institute filter"
                      value={instituteFilter}
                      onChange={setInstituteFilter}
                      options={[
                        { value: "", label: "All institutes" },
                        ...institutes.map((institute) => ({
                          value: institute,
                          label: institute,
                        })),
                      ]}
                    />
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
                {visibleFolders.map((item, index) => {
                  const pendingAssignment = ["requested", "pending"].includes(
                    item.assignment_status ?? "",
                  );

                  return (
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
                          pendingAssignment
                            ? `Assignment request pending · ${item.researchers.join(", ") || "Researcher"}`
                            : item.research_stage
                              ? label(item.research_stage)
                              : "Research project"
                        }
                        detail={
                          pendingAssignment
                            ? undefined
                            : item.researchers.join(", ") || "Researchers"
                        }
                        selected={selected === String(item.id)}
                        onOpen={() => {
                          if (pendingAssignment) return;
                          setRepresentativeBusy(false);
                          setRepresentativeLoading(false);
                          setRepresentativeError("");
                          setSelected(String(item.id));
                        }}
                        openLabel={
                          pendingAssignment
                            ? `Assignment request for ${item.title}`
                            : undefined
                        }
                        actions={
                          item.assignment_id && pendingAssignment ? (
                            <div className="support-assignment-actions">
                              <Button
                                className="support-assignment-action support-assignment-accept"
                                disabled={respondingAssignmentId !== null}
                                onClick={() =>
                                  void respondToAssignment(
                                    item.assignment_id!,
                                    "accept",
                                  )
                                }
                              >
                                {respondingAssignmentId === item.assignment_id
                                  ? "Updating..."
                                  : "Accept"}
                              </Button>
                              <Button
                                variant="secondary"
                                className="support-assignment-action support-assignment-decline"
                                disabled={respondingAssignmentId !== null}
                                onClick={() =>
                                  void respondToAssignment(
                                    item.assignment_id!,
                                    "decline",
                                  )
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          ) : undefined
                        }
                      />
                    </div>
                  );
                })}
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
            <FoldersLoading label="Loading study details" />
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
                role === "statistician" ||
                role === "research_editor" ||
                role === "librarian" ||
                role === "research-office" ||
                role === "admin"
              }
              destination={destination}
              status={
                role === "research-office"
                  ? {
                      submissionStatus: research.submission_status,
                      researchStage: research.research_stage,
                      archiveStatus: research.archive_status,
                      visibility: research.visibility,
                      publicationYear: research.publication_year,
                      actionLabel: nextWorkflowAction?.label,
                      actionBusy: workflowBusy,
                      feedback: workflowFeedback,
                      onAction: nextWorkflowAction
                        ? () => setWorkflowAction(nextWorkflowAction.key)
                        : undefined,
                    }
                  : undefined
              }
            />
          )}
        </section>
      )}
      {workflowAction && research && (
        <ConfirmDialog
          title={
            workflowAction === "under_review"
              ? "Move to Under Review?"
              : workflowAction === "approved"
                ? "Approve this research?"
                : "Archive this research?"
          }
          message={
            workflowAction === "archive"
              ? `This will archive the record with ${label(archiveVisibility)} visibility.`
              : workflowAction === "under_review"
                ? "Are you sure you want to change this research status from Submitted to Under Review?"
                : "The current workflow status will be updated for all authorized users."
          }
          confirmLabel={
            workflowAction === "under_review"
              ? "Confirm"
              : (nextWorkflowAction?.label ?? "Update status")
          }
          busy={workflowBusy}
          onConfirm={() => void applyWorkflowAction()}
          onCancel={() => !workflowBusy && setWorkflowAction(null)}
        >
          {workflowAction === "archive" ? (
            <label>
              Archive visibility
              <select
                value={archiveVisibility}
                disabled={workflowBusy}
                onChange={(event) =>
                  setArchiveVisibility(
                    event.target.value as typeof archiveVisibility,
                  )
                }
              >
                <option value="private">Private</option>
                <option value="registered_only">Registered only</option>
                <option value="public">Public</option>
              </select>
            </label>
          ) : undefined}
        </ConfirmDialog>
      )}
    </div>
  );
}
