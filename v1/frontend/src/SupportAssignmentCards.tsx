import {
  BarChart3,
  BookOpen,
  Check,
  Clock3,
  Folder,
  LoaderCircle,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  ApiError,
  requestResearchSupport,
  searchEligibleSupportAccounts,
  type EligibleSupportAccountResource,
  type SupportAssignmentResource,
  type SupportRole,
} from "./api";
import { Button } from "./components";
import { Modal } from "./Modal";

type RoleConfig = {
  role: SupportRole;
  label: string;
  Icon: typeof Pencil;
};

const roles: RoleConfig[] = [
  { role: "research_editor", label: "Editor", Icon: Pencil },
  { role: "statistician", label: "Statistician", Icon: BarChart3 },
  { role: "librarian", label: "Librarian", Icon: BookOpen },
];

const pendingStatuses = new Set(["requested", "pending"]);
const activeStatuses = new Set(["accepted", "confirmed", "active"]);

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function assignmentFor(
  assignments: SupportAssignmentResource[],
  role: SupportRole,
  statuses: Set<string>,
) {
  return assignments.find(
    (assignment) =>
      assignment.assignment_role === role && statuses.has(assignment.status),
  );
}

/** Configurable support-role cards with one shared assignment request dialog. */
export default function SupportAssignmentCards({
  researchDocumentId,
  researchTitle,
  assignments,
  canManage,
  onRefreshAssignments,
  onNotify,
}: {
  researchDocumentId: string | number;
  researchTitle: string;
  assignments: SupportAssignmentResource[];
  canManage: boolean;
  onRefreshAssignments: () => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [role, setRole] = useState<RoleConfig | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<
    EligibleSupportAccountResource[]
  >([]);
  const [selected, setSelected] =
    useState<EligibleSupportAccountResource | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const requestGeneration = useRef(0);
  const listboxId = useId();

  const active = role
    ? assignmentFor(assignments, role.role, activeStatuses)
    : undefined;
  const roleName = role?.label.toLowerCase() ?? "";
  const showResults = searchState !== "idle";
  function close(force = false) {
    if (submitting && !force) return;
    requestGeneration.current += 1;
    setRole(null);
    setCandidates([]);
    setSelected(null);
    setQuery("");
    setStep("choose");
    setInlineError("");
  }

  function open(nextRole: RoleConfig) {
    setRole(nextRole);
    setCandidates([]);
    setSelected(null);
    setQuery("");
    setActiveIndex(-1);
    setSearchState("idle");
    setSearchAttempt(0);
    setStep("choose");
    setInlineError("");
  }

  useEffect(() => {
    if (!role || query.trim().length === 1) return;
    const controller = new AbortController();
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    const timer = window.setTimeout(
      () => {
        setSearchState("loading");
        setInlineError("");
        void searchEligibleSupportAccounts(
          researchDocumentId,
          role.role,
          query,
          globalThis.fetch,
          controller.signal,
        )
          .then((result) => {
            if (requestGeneration.current !== generation) return;
            setCandidates(result);
            setActiveIndex(result.length ? 0 : -1);
            setSearchState("ready");
          })
          .catch((error: unknown) => {
            if (
              controller.signal.aborted ||
              requestGeneration.current !== generation
            )
              return;
            setCandidates([]);
            setSearchState("error");
            setInlineError(
              error instanceof ApiError && error.status === 422
                ? "Your eligibility changed. Search again to see current accounts."
                : "Eligible accounts could not be loaded.",
            );
          });
      },
      query.trim() ? 275 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, researchDocumentId, role, searchAttempt]);

  useEffect(() => {
    if (!role) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    // Modal establishes its focus trap after mounting; defer once so the search
    // field, rather than the close control, is the dialog's initial focus.
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [role]);

  useEffect(() => {
    if (step !== "confirm") return;
    const frame = requestAnimationFrame(() => confirmationRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [step]);

  function choose(candidate: EligibleSupportAccountResource) {
    setSelected(candidate);
    setInlineError("");
  }

  function updateQuery(nextQuery: string) {
    if (nextQuery.trim() !== query.trim()) setSelected(null);
    setQuery(nextQuery);
    if (nextQuery.trim().length === 1) {
      setCandidates([]);
      setActiveIndex(-1);
      setSearchState("idle");
      setInlineError("");
    }
  }

  async function sendRequest() {
    if (!role || !selected || submitting) return;
    setSubmitting(true);
    setInlineError("");
    try {
      await requestResearchSupport(
        researchDocumentId,
        selected.id,
        role.role,
        Boolean(active),
        active?.id,
      );
      onNotify(`${role.label} change requested.`);
      close(true);
      // The request is durable once POST succeeds. Do not misreport success if
      // the optional projection refresh is temporarily unavailable.
      void onRefreshAssignments().catch(() => undefined);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setSelected(null);
        setStep("choose");
        setInlineError(
          "That account is no longer eligible. Choose another eligible account.",
        );
        setSearchAttempt((attempt) => attempt + 1);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      } else if (error instanceof ApiError && error.status === 409) {
        setSelected(null);
        setStep("choose");
        setInlineError(
          "This assignment changed. The latest status has been loaded.",
        );
        await onRefreshAssignments();
        setSearchAttempt((attempt) => attempt + 1);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setInlineError(
          "The support request could not be sent. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="support-assignment-cards"
        aria-label="Support specialists"
      >
        {roles.map((item) => {
          const current = assignmentFor(assignments, item.role, activeStatuses);
          const waiting = assignmentFor(
            assignments,
            item.role,
            pendingStatuses,
          );
          const name = current?.name ?? waiting?.name ?? "Not assigned";
          const Icon = item.Icon;
          return (
            <article className="support-assignment-card" key={item.role}>
              <span className="support-assignment-card-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="support-assignment-card-copy">
                <span className="support-assignment-card-role">
                  {item.label}
                </span>
                <strong className="support-assignment-card-name" title={name}>
                  {name}
                </strong>
                <small>
                  {waiting
                    ? "Change requested"
                    : current
                      ? "Active"
                      : "No active assignment"}
                </small>
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant="secondary"
                  className="support-assignment-card-action"
                  aria-label={`${waiting ? "Pending" : current ? "Change" : "Assign"} ${item.label}`}
                  disabled={Boolean(waiting) || submitting}
                  onClick={() => open(item)}
                >
                  {waiting && <Clock3 aria-hidden="true" />}
                  {waiting ? "Pending" : current ? "Change" : "Assign"}
                </Button>
              )}
            </article>
          );
        })}
      </div>

      {role && (
        <Modal
          label={`${active ? "Change" : "Assign"} ${roleName}`}
          onClose={close}
          busy={submitting}
          showClose={false}
          className="support-assignment-modal"
        >
          <section className="support-assignment-dialog">
            {step === "choose" ? (
              <>
                <p className="eyebrow">Support specialist</p>
                <h2>{active ? `Change ${roleName}` : `Assign ${roleName}`}</h2>
                <p className="support-assignment-subtitle">
                  Search eligible accounts and send a request for this research
                  project.
                </p>
                <div className="support-assignment-current">
                  <Folder aria-hidden="true" />
                  <span>
                    <strong title={researchTitle}>{researchTitle}</strong>
                    <small>
                      {active
                        ? `Current ${roleName}: ${active.name ?? "Assigned account"}`
                        : `No current ${roleName}`}
                    </small>
                  </span>
                </div>
                <label className="support-assignment-search">
                  <span>Find an eligible {roleName}</span>
                  <span className="support-assignment-search-input">
                    <Search aria-hidden="true" />
                    <input
                      ref={inputRef}
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showResults}
                      aria-controls={showResults ? listboxId : undefined}
                      aria-activedescendant={
                        activeIndex >= 0
                          ? `${listboxId}-${activeIndex}`
                          : undefined
                      }
                      value={query}
                      placeholder="Search by name or email"
                      onChange={(event) => updateQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" && candidates.length) {
                          event.preventDefault();
                          setActiveIndex((index) =>
                            Math.min(index + 1, candidates.length - 1),
                          );
                        } else if (
                          event.key === "ArrowUp" &&
                          candidates.length
                        ) {
                          event.preventDefault();
                          setActiveIndex((index) => Math.max(index - 1, 0));
                        } else if (event.key === "Enter" && activeIndex >= 0) {
                          event.preventDefault();
                          choose(candidates[activeIndex]);
                        }
                      }}
                      disabled={submitting}
                    />
                    {query && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => updateQuery("")}
                      >
                        <X aria-hidden="true" />
                      </button>
                    )}
                    {searchState === "loading" && (
                      <LoaderCircle
                        className="support-assignment-spinner"
                        aria-label="Searching"
                      />
                    )}
                  </span>
                </label>
                {!showResults && (
                  <p className="support-assignment-helper">
                    Enter at least 2 characters to filter available accounts.
                  </p>
                )}
                {showResults && (
                  <div
                    id={listboxId}
                    className="support-assignment-results"
                    role="listbox"
                    aria-label={`Eligible ${roleName} accounts`}
                    aria-busy={searchState === "loading"}
                  >
                    {searchState === "loading" && (
                      <p role="status">Searching eligible accounts…</p>
                    )}
                    {searchState === "error" && (
                      <p role="alert">
                        {inlineError}{" "}
                        <button
                          type="button"
                          onClick={() =>
                            setSearchAttempt((attempt) => attempt + 1)
                          }
                        >
                          Retry
                        </button>
                      </p>
                    )}
                    {searchState === "ready" && candidates.length === 0 && (
                      <p>No eligible active accounts found for this role.</p>
                    )}
                    {searchState === "ready" &&
                      candidates.map((candidate, index) => (
                        <button
                          type="button"
                          id={`${listboxId}-${index}`}
                          role="option"
                          aria-selected={selected?.id === candidate.id}
                          className={`support-assignment-option${selected?.id === candidate.id ? " is-selected" : ""}${activeIndex === index ? " is-active" : ""}`}
                          key={candidate.id}
                          onMouseMove={() => setActiveIndex(index)}
                          onClick={() => choose(candidate)}
                        >
                          <span
                            className="support-assignment-avatar"
                            aria-hidden="true"
                          >
                            {initials(candidate.name)}
                          </span>
                          <span>
                            <strong>{candidate.name}</strong>
                            <small>{candidate.email}</small>
                          </span>
                          {selected?.id === candidate.id && (
                            <Check aria-hidden="true" />
                          )}
                        </button>
                      ))}
                  </div>
                )}
                {inlineError && searchState !== "error" && (
                  <p className="support-assignment-inline-error" role="alert">
                    {inlineError}
                  </p>
                )}
                <footer className="modal-actions support-assignment-footer">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => close()}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setStep("confirm")}
                    disabled={!selected || submitting}
                  >
                    {submitting && (
                      <LoaderCircle
                        className="support-assignment-spinner"
                        aria-hidden="true"
                      />
                    )}
                    {submitting ? "Sending…" : "Send request"}
                  </Button>
                </footer>
              </>
            ) : (
              <>
                <p className="eyebrow">Confirm request</p>
                <h2 ref={confirmationRef} tabIndex={-1}>
                  Send support request?
                </h2>
                <p>
                  Send a request to {selected?.name} to become the {role.label}{" "}
                  for this research project?{" "}
                  {active &&
                    "The current assignment remains active until the request is accepted."}
                </p>
                {inlineError && (
                  <p className="support-assignment-inline-error" role="alert">
                    {inlineError}
                  </p>
                )}
                <footer className="modal-actions support-assignment-footer">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setStep("choose");
                      window.setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    disabled={submitting}
                  >
                    Go back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void sendRequest()}
                    disabled={submitting}
                  >
                    {submitting && (
                      <LoaderCircle
                        className="support-assignment-spinner"
                        aria-hidden="true"
                      />
                    )}
                    {submitting ? "Sending…" : "Send request"}
                  </Button>
                </footer>
              </>
            )}
          </section>
        </Modal>
      )}
    </>
  );
}
