import {
  Archive,
  Eye,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getRepositoryManagement,
  getRepositoryManagementCapabilities,
  listDeletionLedger,
  listRepositoryManagement,
  managementArchiveRepository,
  managementRestoreRepository,
  permanentDeleteRepository,
  updateRepositoryManagement,
  type LaravelPaginatedResponse,
  type RepositoryDeletionLedgerResource,
  type RepositoryManagementDetail,
  type RepositoryManagementFilters,
  type RepositoryManagementItem,
} from "./api";
import { Button } from "./components";
import { ConfirmDialog, Modal } from "./Modal";
import { useLiveFilters } from "./useLiveFilters";

type WorkspaceContext = "office" | "admin";
type CapabilityState =
  | { status: "loading" }
  | { status: "enabled"; pageSize: number }
  | { status: "disabled" }
  | { status: "error" };
type FilterForm = Record<
  | "q"
  | "submission_status"
  | "archive_status"
  | "visibility"
  | "management_state"
  | "deletion_state"
  | "sort",
  string
>;

const initialFilters: FilterForm = {
  q: "",
  submission_status: "",
  archive_status: "",
  visibility: "",
  management_state: "",
  deletion_state: "",
  sort: "",
};

function displayDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Sign in again.";
  if (error.status === 403)
    return "You are not authorized to manage this record.";
  if (error.status === 412)
    return "This record changed. Refresh before trying again.";
  if (error.status === 409)
    return "This action is no longer available. Refresh the list.";
  if (error.status === 429)
    return "Too many requests. Wait a moment and try again.";
  return fallback;
}

function isManagementArchived(item: RepositoryManagementItem) {
  return (
    item.management.deleted_at !== null &&
    item.management.management_archived_at !== null
  );
}

function hasAcceptedDeletion(item: RepositoryManagementItem) {
  return item.management.deletion_state === "accepted";
}

function detailEntryLabel(tab: string, entry: unknown) {
  const value = entry as Record<string, unknown>;
  const text = (key: string) =>
    typeof value[key] === "string" && value[key] ? value[key] : undefined;
  switch (tab) {
    case "Files":
      return text("original_filename") ?? "File record";
    case "Authors":
      return text("author_name") ?? "Author record";
    case "Reviewers":
      return text("reviewer_name") ?? text("reviewer_id") ?? "Reviewer record";
    case "Feedback":
      return text("comment") ?? "Feedback record";
    case "Revisions":
      return text("revision_remarks") ?? "Revision record";
    case "Monitoring":
      return text("remarks") ?? text("activity_type") ?? "Monitoring record";
    case "Validations":
      return (
        text("adviser_remarks") ??
        text("validation_status") ??
        "Validation record"
      );
    case "Similarity":
      return text("matched_title") ?? "Similarity record";
    default:
      return "Record detail";
  }
}

function idempotencyKeyOrNull() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : null;
}

export default function RepositoryManagementWorkspace({
  context,
}: {
  context: WorkspaceContext;
}) {
  const [query, setQuery] = useState<FilterForm>(initialFilters);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    LaravelPaginatedResponse<RepositoryManagementItem> | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RepositoryManagementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] =
    useState<RepositoryManagementItem | null>(null);
  const [archiveTarget, setArchiveTarget] =
    useState<RepositoryManagementItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<RepositoryManagementItem | null>(null);
  const [mutating, setMutating] = useState<number | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledger, setLedger] = useState<RepositoryDeletionLedgerResource[]>([]);
  const [ledgerError, setLedgerError] = useState("");
  const [capabilityState, setCapabilityState] = useState<CapabilityState>({
    status: "loading",
  });

  const reload = useCallback(() => {
    setError("");
    setLoading(true);
    setCapabilityState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  function openDetail(id: number) {
    setDetail(null);
    setDetailLoading(true);
    setSelectedId(id);
  }

  const { filters, change } = useLiveFilters(initialFilters, (next) => {
    setPage(1);
    setQuery(next);
    setLoading(true);
  });

  useEffect(() => {
    let cancelled = false;
    void getRepositoryManagementCapabilities()
      .then((response) => {
        if (cancelled) return;
        const maxPerPage = response.data?.max_per_page;
        if (
          response.schema_version !== 1 ||
          typeof response.data?.enabled !== "boolean"
        ) {
          setCapabilityState({ status: "error" });
        } else if (response.data.enabled !== true) {
          setCapabilityState({ status: "disabled" });
        } else if (!Number.isInteger(maxPerPage) || maxPerPage < 1) {
          setCapabilityState({ status: "error" });
        } else {
          setCapabilityState({
            status: "enabled",
            pageSize: Math.min(25, maxPerPage),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCapabilityState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (capabilityState.status !== "enabled") return;
    let cancelled = false;
    const activeFilters: RepositoryManagementFilters = {
      ...query,
      management_state:
        (query.management_state as RepositoryManagementFilters["management_state"]) ||
        undefined,
      deletion_state:
        (query.deletion_state as RepositoryManagementFilters["deletion_state"]) ||
        undefined,
      sort: (query.sort as RepositoryManagementFilters["sort"]) || undefined,
      page,
      per_page: capabilityState.pageSize,
    };
    void listRepositoryManagement(activeFilters)
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!cancelled)
          setError(
            safeError(requestError, "Repository records are unavailable."),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, capabilityState, page, query]);

  const loadLedger = useCallback(() => {
    void listDeletionLedger({ per_page: 25 })
      .then((response) => {
        setLedger(response.data);
        setLedgerError("");
      })
      .catch(() => setLedgerError("Deletion status is currently unavailable."));
  }, []);

  useEffect(() => {
    if (!ledgerOpen) return;
    loadLedger();
    const interval = window.setInterval(loadLedger, 30_000);
    return () => window.clearInterval(interval);
  }, [ledgerOpen, loadLedger]);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    void getRepositoryManagement(selectedId)
      .then((record) => {
        if (!cancelled) setDetail(record);
      })
      .catch(() => {
        if (!cancelled)
          setError("The selected repository record is unavailable.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const onMutation = async <T,>(
    item: RepositoryManagementItem,
    success: string,
    action: () => Promise<T>,
  ) => {
    setMutating(item.id);
    setNotice(null);
    try {
      const response = await action();
      setNotice({ type: "success", text: success });
      setSelectedId(null);
      reload();
      return response;
    } catch (requestError) {
      setNotice({
        type: "error",
        text: safeError(
          requestError,
          "The requested change could not be completed.",
        ),
      });
      return null;
    } finally {
      setMutating(null);
    }
  };

  const rows = result?.data ?? [];
  const meta = result?.meta;
  const heading =
    context === "admin" ? "System Administrator" : "Research Office";

  if (capabilityState.status !== "enabled") {
    const message =
      capabilityState.status === "loading"
        ? "Checking repository management availability…"
        : capabilityState.status === "disabled"
          ? "Repository management is not enabled for this environment."
          : "Repository management is currently unavailable.";
    return (
      <div className="workspace-content admin-sidebar-page repository-management-workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{heading}</p>
            <h1>Repository management</h1>
          </div>
        </header>
        <section
          className="panel-card admin-data-card"
          role={capabilityState.status === "error" ? "alert" : "status"}
          aria-busy={capabilityState.status === "loading"}
        >
          <p>{message}</p>
          {capabilityState.status === "error" && (
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-content admin-sidebar-page repository-management-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{heading}</p>
          <h1>Repository management</h1>
          <p>
            Search records, correct metadata, and manage repository lifecycle
            actions.
          </p>
        </div>
        <Button variant="secondary" onClick={reload} disabled={loading}>
          <RefreshCw aria-hidden="true" /> Refresh
        </Button>
      </header>

      {notice && (
        <p
          className={notice.type === "error" ? "admin-error" : "admin-success"}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      <section className="panel-card admin-data-card">
        <form
          className="admin-filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            Live search
            <input
              value={filters.q}
              onChange={(event) => change("q", event.target.value)}
              placeholder="Title or reference"
            />
          </label>
          <label>
            Submission status
            <select
              value={filters.submission_status}
              onChange={(event) =>
                change("submission_status", event.target.value)
              }
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="revision_required">Revision required</option>
              <option value="approved">Approved</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Archive status
            <select
              value={filters.archive_status}
              onChange={(event) => change("archive_status", event.target.value)}
            >
              <option value="">All archive states</option>
              <option value="not_archived">Not archived</option>
              <option value="pending_archiving">Pending archiving</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Visibility
            <select
              value={filters.visibility}
              onChange={(event) => change("visibility", event.target.value)}
            >
              <option value="">All visibility</option>
              <option value="private">Private</option>
              <option value="registered_only">Registered only</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label>
            Management state
            <select
              value={filters.management_state}
              onChange={(event) =>
                change("management_state", event.target.value)
              }
            >
              <option value="">All management states</option>
              <option value="active">Active</option>
              <option value="management_archived">Management-archived</option>
              <option value="legacy_soft_deleted">Legacy soft-deleted</option>
            </select>
          </label>
          <label>
            Deletion state
            <select
              value={filters.deletion_state}
              onChange={(event) => change("deletion_state", event.target.value)}
            >
              <option value="">All deletion states</option>
              <option value="none">None</option>
              <option value="accepted">Accepted</option>
              <option value="terminal">Terminal</option>
            </select>
          </label>
          <label>
            Sort
            <select
              value={filters.sort}
              onChange={(event) => change("sort", event.target.value)}
            >
              <option value="">Default</option>
              <option value="submission_reference">Submission reference</option>
              <option value="title">Title</option>
              <option value="created_at">Created</option>
              <option value="updated_at">Updated</option>
              <option value="management_archived_at">
                Management archived
              </option>
            </select>
          </label>
        </form>

        {error ? (
          <section className="dashboard-error" role="alert">
            <p>{error}</p>
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          </section>
        ) : loading ? (
          <p className="admin-empty" aria-busy="true">
            Loading repository records…
          </p>
        ) : rows.length === 0 ? (
          <p className="admin-empty">
            No repository records match these filters.
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">
                  Repository management records
                </caption>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Submission ref</th>
                    <th>Institute</th>
                    <th>Publication</th>
                    <th>Imported</th>
                    <th>Management archived</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const canArchive =
                      item.capabilities.management_archive &&
                      item.management.deleted_at === null &&
                      !hasAcceptedDeletion(item);
                    const managementArchived = isManagementArchived(item);
                    const canRestore =
                      item.capabilities.management_restore &&
                      managementArchived &&
                      !hasAcceptedDeletion(item);
                    const canDelete =
                      item.capabilities.permanent_delete &&
                      managementArchived &&
                      !hasAcceptedDeletion(item);
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.title}</strong>
                          <div>
                            {item.authors
                              .map((author) => author.author_name)
                              .join(", ") || "No authors listed"}
                          </div>
                        </td>
                        <td>{item.submission_reference}</td>
                        <td>{item.institute ?? "—"}</td>
                        <td>
                          {humanize(item.publication.submission_status)} ·{" "}
                          {humanize(item.publication.archive_status)} ·{" "}
                          {humanize(item.publication.visibility)}
                        </td>
                        <td>{item.import.is_imported ? "Yes" : "No"}</td>
                        <td>
                          {displayDate(item.management.management_archived_at)}
                        </td>
                        <td>
                          <span className="row-actions">
                            {item.capabilities.view && (
                              <Button
                                variant="secondary"
                                className="icon-button"
                                aria-label={`View or edit ${item.title}`}
                                title="View or edit record"
                                onClick={() => openDetail(item.id)}
                                disabled={!item.capabilities.view}
                              >
                                <Eye aria-hidden="true" />
                              </Button>
                            )}
                            {canArchive && (
                              <Button
                                variant="secondary"
                                className="icon-button"
                                aria-label={`Management archive ${item.title}`}
                                title="Management archive"
                                onClick={() => setArchiveTarget(item)}
                                disabled={mutating === item.id}
                              >
                                <Archive aria-hidden="true" />
                              </Button>
                            )}
                            {canRestore && (
                              <Button
                                variant="secondary"
                                className="icon-button"
                                aria-label={`Restore ${item.title}`}
                                title="Restore management archive"
                                onClick={() => setRestoreTarget(item)}
                                disabled={mutating === item.id}
                              >
                                <RotateCcw aria-hidden="true" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="rust"
                                className="icon-button"
                                aria-label={`Permanently delete ${item.title}`}
                                title="Queue permanent deletion"
                                onClick={() => setDeleteTarget(item)}
                                disabled={mutating === item.id}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {meta && (
              <nav className="admin-pagination" aria-label="Repository pages">
                <span>
                  Page {meta.current_page} of {meta.last_page} · {meta.total}{" "}
                  total
                </span>
                <Button
                  variant="secondary"
                  disabled={meta.current_page <= 1 || loading}
                  onClick={() => {
                    setPage(meta.current_page - 1);
                    setLoading(true);
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={meta.current_page >= meta.last_page || loading}
                  onClick={() => {
                    setPage(meta.current_page + 1);
                    setLoading(true);
                  }}
                >
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </section>

      <DeletionLedgerPanel
        open={ledgerOpen}
        onToggle={() => setLedgerOpen((open) => !open)}
        rows={ledger}
        error={ledgerError}
      />
      {selectedId !== null && (
        <RepositoryDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setSelectedId(null)}
          onSaved={(updated) => {
            setDetail(updated);
            setNotice({ type: "success", text: "Metadata saved." });
            reload();
          }}
        />
      )}
      {archiveTarget && (
        <ConfirmDialog
          title="Management archive record"
          message="Management-archive this record? Its publication state is preserved."
          confirmLabel="Archive record"
          busy={mutating === archiveTarget.id}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => {
            void onMutation(
              archiveTarget,
              "Record management-archived. Publication state is preserved.",
              () =>
                managementArchiveRepository(
                  archiveTarget.id,
                  archiveTarget.etag,
                ),
            ).then((response) => {
              if (response !== null) setArchiveTarget(null);
            });
          }}
        />
      )}
      {restoreTarget && (
        <ConfirmDialog
          title="Restore management archive"
          message="Restore this management-archived record? Its publication state is preserved."
          confirmLabel="Restore record"
          busy={mutating === restoreTarget.id}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={() => {
            void onMutation(
              restoreTarget,
              "Record restored. Publication state is preserved.",
              () =>
                managementRestoreRepository(
                  restoreTarget.id,
                  restoreTarget.etag,
                ),
            ).then((response) => {
              if (response !== null) setRestoreTarget(null);
            });
          }}
        />
      )}
      {deleteTarget && (
        <PermanentDeleteDialog
          item={deleteTarget}
          busy={mutating === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onSubmit={(input, idempotencyKey) => {
            void onMutation(
              deleteTarget,
              "Permanent deletion queued. Status is available in the deletion ledger.",
              () =>
                permanentDeleteRepository(
                  deleteTarget.id,
                  input,
                  deleteTarget.etag,
                  idempotencyKey,
                ),
            ).then((response) => {
              if (response !== null) {
                setDeleteTarget(null);
                setLedgerOpen(true);
                setNotice({
                  type: "success",
                  text: `Permanent deletion queued (ledger #${response.ledger_id}). Status is available in the deletion ledger.`,
                });
              }
            });
          }}
        />
      )}
    </div>
  );
}

function RepositoryDetailModal({
  detail,
  loading,
  onClose,
  onSaved,
}: {
  detail: RepositoryManagementDetail | null;
  loading: boolean;
  onClose: () => void;
  onSaved: (detail: RepositoryManagementDetail) => void;
}) {
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    abstract: "",
    keywords: "",
    institute: "",
  });
  const editable = Boolean(detail?.capabilities.update);
  const tabs = [
    "Overview",
    "Files",
    "Authors",
    "Reviewers",
    "Feedback",
    "Revisions",
    "Monitoring",
    "Validations",
    "Similarity",
  ];
  const content = useMemo(() => {
    if (!detail) return null;
    const arrays: Record<string, unknown[] | undefined> = {
      Files: detail.files,
      Authors: detail.authors,
      Reviewers: detail.reviewers,
      Feedback: detail.feedback,
      Revisions: detail.revisions,
      Monitoring: detail.monitoring,
      Validations: detail.validations,
      Similarity: detail.similarity,
    };
    if (tab === "Overview") return null;
    const entries = arrays[tab] ?? [];
    return entries.length ? (
      <ul className="admin-context-list">
        {entries.map((entry, index) => (
          <li key={(entry as { id?: number }).id ?? index}>
            {detailEntryLabel(tab, entry)}
          </li>
        ))}
      </ul>
    ) : (
      <p className="admin-empty">
        No {tab.toLowerCase()} are available for this record.
      </p>
    );
  }, [detail, tab]);
  async function save() {
    if (!detail || !form.title.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      onSaved(
        await updateRepositoryManagement(
          detail.id,
          {
            title: form.title.trim(),
            abstract: form.abstract || null,
            keywords: form.keywords || null,
            institute: form.institute || null,
          },
          detail.etag,
        ),
      );
      setEditing(false);
    } catch (error) {
      setMessage(safeError(error, "Metadata could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label={
        detail ? `Repository record: ${detail.title}` : "Repository record"
      }
      onClose={onClose}
      busy={busy}
      size="large"
    >
      <div className="admin-user-edit-modal">
        <header>
          <p className="eyebrow">Repository management</p>
          <h2>{loading ? "Loading record…" : detail?.title}</h2>
        </header>
        {loading || !detail ? (
          <p className="admin-empty" aria-busy="true">
            Loading repository record…
          </p>
        ) : (
          <>
            <div
              className="row-actions"
              role="tablist"
              aria-label="Record details"
            >
              {tabs.map((name) => (
                <Button
                  key={name}
                  variant={tab === name ? "primary" : "secondary"}
                  role="tab"
                  aria-selected={tab === name}
                  id={`repository-tab-${detail.id}-${name.toLowerCase()}`}
                  aria-controls={`repository-panel-${detail.id}`}
                  tabIndex={tab === name ? 0 : -1}
                  onKeyDown={(event) => {
                    const index = tabs.indexOf(name);
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : event.key === "ArrowRight"
                            ? (index + 1) % tabs.length
                            : event.key === "ArrowLeft"
                              ? (index - 1 + tabs.length) % tabs.length
                              : index;
                    if (next !== index) {
                      event.preventDefault();
                      setTab(tabs[next]);
                      document
                        .getElementById(
                          `repository-tab-${detail.id}-${tabs[next].toLowerCase()}`,
                        )
                        ?.focus();
                    }
                  }}
                  onClick={() => setTab(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
            <section
              className="admin-metadata-form"
              role="tabpanel"
              id={`repository-panel-${detail.id}`}
              aria-labelledby={`repository-tab-${detail.id}-${tab.toLowerCase()}`}
            >
              {tab === "Overview" ? (
                <>
                  {editable && !editing && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setForm({
                          title: detail.title,
                          abstract: detail.abstract ?? "",
                          keywords: detail.keywords ?? "",
                          institute: detail.institute ?? "",
                        });
                        setEditing(true);
                      }}
                    >
                      <Pencil aria-hidden="true" /> Edit metadata
                    </Button>
                  )}
                  {editing ? (
                    <>
                      <label>
                        Title
                        <input
                          value={form.title}
                          onChange={(event) =>
                            setForm({ ...form, title: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Institute
                        <input
                          value={form.institute}
                          onChange={(event) =>
                            setForm({ ...form, institute: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Keywords
                        <input
                          value={form.keywords}
                          onChange={(event) =>
                            setForm({ ...form, keywords: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Abstract
                        <textarea
                          value={form.abstract}
                          onChange={(event) =>
                            setForm({ ...form, abstract: event.target.value })
                          }
                        />
                      </label>
                      <div className="modal-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setEditing(false)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => void save()}
                          disabled={busy || !form.title.trim()}
                        >
                          {busy ? "Saving…" : "Save metadata"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <dl>
                      <div>
                        <dt>Submission reference</dt>
                        <dd>{detail.submission_reference}</dd>
                      </div>
                      <div>
                        <dt>Submission status</dt>
                        <dd>
                          {humanize(detail.publication.submission_status)}
                        </dd>
                      </div>
                      <div>
                        <dt>Archive status</dt>
                        <dd>{humanize(detail.publication.archive_status)}</dd>
                      </div>
                      <div>
                        <dt>Visibility</dt>
                        <dd>{humanize(detail.publication.visibility)}</dd>
                      </div>
                      <div>
                        <dt>Abstract</dt>
                        <dd>{detail.abstract ?? "—"}</dd>
                      </div>
                    </dl>
                  )}
                </>
              ) : (
                content
              )}
            </section>
            {message && (
              <p className="admin-error" role="alert">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function PermanentDeleteDialog({
  item,
  busy,
  onClose,
  onSubmit,
}: {
  item: RepositoryManagementItem;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    input: { reason: string; confirmation: string },
    idempotencyKey: string,
  ) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const key = useMemo(() => idempotencyKeyOrNull(), []);
  const phrase = item.permanent_delete_confirmation;
  const valid = reason.trim().length > 0 && confirmation === phrase;
  return (
    <Modal
      label={`Permanently delete ${item.title}`}
      onClose={onClose}
      busy={busy}
    >
      <form
        className="admin-user-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && key)
            onSubmit({ reason: reason.trim(), confirmation }, key);
        }}
      >
        <header>
          <p className="eyebrow">Irreversible action</p>
          <h2>Queue permanent deletion</h2>
          <p>
            This queues permanent deletion. Storage objects and database rows
            will be irreversibly removed. Audit logs are preserved.
          </p>
        </header>
        <label>
          Reason
          <textarea
            required
            maxLength={5000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {!key && (
          <p className="admin-error" role="alert">
            Permanent deletion is unavailable because this browser cannot create
            a secure request identifier.
          </p>
        )}
        <label>
          Type <strong>{phrase}</strong> to confirm
          <input
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-describedby="permanent-delete-confirmation"
          />
        </label>
        <p
          id="permanent-delete-confirmation"
          role="status"
          className={confirmation === phrase ? "admin-success" : "admin-empty"}
        >
          {confirmation === phrase
            ? "Confirmation matches."
            : "Confirmation must match exactly."}
        </p>
        <div className="modal-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="rust"
            disabled={busy || !valid || !key}
          >
            {busy ? "Queueing…" : "Queue permanent deletion"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeletionLedgerPanel({
  open,
  onToggle,
  rows,
  error,
}: {
  open: boolean;
  onToggle: () => void;
  rows: RepositoryDeletionLedgerResource[];
  error: string;
}) {
  const counts = rows.reduce<Record<string, number>>(
    (all, row) => ({ ...all, [row.status]: (all[row.status] ?? 0) + 1 }),
    {},
  );
  return (
    <section className="panel-card admin-data-card">
      <div className="admin-card-heading">
        <div>
          <h2>Deletion status</h2>
          <p>
            Queued deletion is processed automatically. There is no retry or
            cancellation control.
          </p>
        </div>
        <Button variant="secondary" onClick={onToggle} aria-expanded={open}>
          {open ? "Hide status" : "Show status"}
        </Button>
      </div>
      {open &&
        (error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <p role="status">
              {Object.entries(counts)
                .map(([status, count]) => `${count} ${humanize(status)}`)
                .join(" · ") || "No queued deletion activity."}
            </p>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">Deletion ledger status</caption>
                <thead>
                  <tr>
                    <th>Submission ref</th>
                    <th>Status</th>
                    <th>Queued</th>
                    <th>Objects</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.submission_reference}</td>
                      <td>{humanize(row.status)}</td>
                      <td>{displayDate(row.queued_at)}</td>
                      <td>
                        {row.objects_deleted_count} deleted / {row.object_count}{" "}
                        · {row.objects_terminal_failed_count} failed
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
    </section>
  );
}
