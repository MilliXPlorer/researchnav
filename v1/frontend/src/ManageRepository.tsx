import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { Eye, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import {
  ApiError,
  deleteOfficeRepository,
  getOfficeRepositoryDetail,
  listOfficeRepository,
  restoreOfficeRepository,
  updateOfficeRepository,
  type OfficeRepositoryBucket,
  type OfficeRepositoryDetailResource,
  type OfficeRepositoryItemResource,
  type OfficeRepositoryUpdateInput,
} from "./api";
import { Button, Pagination, SortableHeader } from "./components";
import { formatPhilippineDateTime } from "./dateTime";
import { ConfirmDialog, Modal } from "./Modal";
import ResearchOfficeBulkImport from "./ResearchOfficeBulkImport";
import "./ManageRepository.css";

type View = OfficeRepositoryBucket | "import";
type Sort = "title" | "publication_year" | "updated_at";

const views: Array<{ value: View; label: string }> = [
  { value: "ongoing", label: "Ongoing" },
  { value: "archived", label: "Archived" },
  { value: "recycle", label: "Recycle Bin" },
  { value: "import", label: "Import manuscripts" },
];

function friendlyError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error.status === 403)
    return "You do not have permission to manage this repository.";
  if (error.status === 409)
    return "This record changed elsewhere. Refresh and try again.";
  if (error.status === 422)
    return "Please correct the highlighted metadata and try again.";
  if (error.status === 429)
    return "Too many requests. Please wait a moment and try again.";
  return `${fallback} (${error.code}).`;
}

function label(value: string | null) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initialDraft(
  detail: OfficeRepositoryDetailResource,
): OfficeRepositoryUpdateInput {
  return {
    category_id: detail.category_id,
    title: detail.title,
    abstract: detail.abstract,
    keywords: detail.keywords,
    publication_year: detail.publication_year,
    sdg_ids: detail.sdgs.map((sdg) => sdg.id),
    institute: detail.institute,
    degree_program: detail.degree_program,
    manuscript_date_label: detail.manuscript_date_label,
    research_stage:
      detail.research_stage as OfficeRepositoryUpdateInput["research_stage"],
  };
}

/** Shared Admin and Research Office repository management workspace. */
export default function ManageRepository({
  contextLabel = "Research Office",
}: {
  contextLabel?: string;
}) {
  const [view, setView] = useState<View>("ongoing");
  const [rows, setRows] = useState<OfficeRepositoryItemResource[] | null>(null);
  const [meta, setMeta] = useState<
    Awaited<ReturnType<typeof listOfficeRepository>>["meta"] | null
  >(null);
  const [search, setSearch] = useState("");
  const [institute, setInstitute] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState<Sort>("updated_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] =
    useState<OfficeRepositoryDetailResource | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OfficeRepositoryUpdateInput>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<"delete" | "restore" | null>(
    null,
  );
  const requestGeneration = useRef(0);
  const detailGeneration = useRef(0);

  const isImport = view === "import";
  const bucket = isImport ? "ongoing" : view;

  function reload() {
    setError("");
    setLoading(true);
    setReloadVersion((version) => version + 1);
  }

  function openDetail(id: number) {
    setDetailLoading(true);
    setDetailError("");
    setSelected(null);
    setEditing(false);
    setDetailVersion((version) => version + 1);
    setSelectedId(id);
  }

  useEffect(() => {
    if (isImport) return;
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    void listOfficeRepository(
      {
        bucket,
        search,
        institute,
        publication_year: year ? Number(year) : undefined,
        sort,
        direction,
        page,
        per_page: 25,
      },
      undefined,
      controller.signal,
    )
      .then((response) => {
        if (generation !== requestGeneration.current) return;
        setRows(response.data);
        setMeta(response.meta);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (
          controller.signal.aborted ||
          generation !== requestGeneration.current
        )
          return;
        setRows(null);
        setMeta(null);
        setError(
          friendlyError(requestError, "Repository records are unavailable"),
        );
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
    return () => controller.abort();
  }, [
    bucket,
    direction,
    institute,
    isImport,
    page,
    reloadVersion,
    search,
    sort,
    year,
  ]);

  useEffect(() => {
    if (selectedId === null) return;
    const generation = ++detailGeneration.current;
    const controller = new AbortController();
    void getOfficeRepositoryDetail(selectedId, undefined, controller.signal)
      .then((detail) => {
        if (generation !== detailGeneration.current) return;
        setSelected(detail);
        setDraft(initialDraft(detail));
      })
      .catch((requestError: unknown) => {
        if (
          controller.signal.aborted ||
          generation !== detailGeneration.current
        )
          return;
        setDetailError(
          friendlyError(requestError, "Record details are unavailable"),
        );
      })
      .finally(() => {
        if (generation === detailGeneration.current) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [detailVersion, selectedId]);

  function changeView(next: View) {
    setView(next);
    setPage(1);
    setSelectedId(null);
    setConfirming(null);
    setError("");
    setLoading(true);
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setLoading(true);
    reload();
  }

  function changeSort(next: Sort) {
    setPage(1);
    setLoading(true);
    if (sort === next)
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(next);
      setDirection(next === "updated_at" ? "desc" : "asc");
    }
  }

  async function save() {
    if (!selected || saving) return;
    if (!draft.title?.trim()) {
      setDetailError("A title is required.");
      return;
    }
    setSaving(true);
    setDetailError("");
    try {
      const updated = await updateOfficeRepository(selected.id, {
        ...draft,
        title: draft.title.trim(),
      });
      setSelected(updated);
      setDraft(initialDraft(updated));
      setEditing(false);
      setNotice(`Saved metadata for ${updated.title}.`);
      reload();
    } catch (requestError) {
      setDetailError(
        friendlyError(requestError, "Metadata could not be saved"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function mutate(action: "delete" | "restore") {
    if (!selected || saving) return;
    setSaving(true);
    setDetailError("");
    try {
      if (action === "delete") await deleteOfficeRepository(selected.id);
      else await restoreOfficeRepository(selected.id);
      setConfirming(null);
      setSelectedId(null);
      setNotice(
        action === "delete"
          ? `Moved ${selected.title} to the Recycle Bin.`
          : `Restored ${selected.title}.`,
      );
      reload();
    } catch (requestError) {
      setConfirming(null);
      setDetailError(
        friendlyError(
          requestError,
          action === "delete"
            ? "The record could not be moved"
            : "The record could not be restored",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-content manage-repository">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{contextLabel}</p>
          <h1>Manage Repository</h1>
          <p>
            Review active records, safely update metadata, and recover records
            from the Recycle Bin.
          </p>
        </div>
        {!isImport && (
          <Button variant="secondary" onClick={reload} disabled={loading}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
        )}
      </header>

      <div
        className="manage-repository-tabs"
        role="tablist"
        aria-label="Repository views"
      >
        {views.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={view === item.value}
            className={view === item.value ? "is-active" : ""}
            onClick={() => changeView(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isImport ? (
        <ResearchOfficeBulkImport contextLabel={contextLabel} />
      ) : (
        <section
          className="panel-card admin-data-card manage-repository-card"
          aria-busy={loading}
        >
          <div className="admin-card-heading">
            <div>
              <h2>
                {view === "recycle" ? "Recycle Bin" : `${label(view)} records`}
              </h2>
              <p>
                {view === "recycle"
                  ? "Records can be restored; they are never permanently deleted here."
                  : "Open a record to review safe metadata or make an allowed change."}
              </p>
            </div>
          </div>
          <form
            className="admin-filters manage-repository-filters"
            onSubmit={applyFilters}
          >
            <label>
              Search
              <input
                value={search}
                onChange={(event) => {
                  setLoading(true);
                  setSearch(event.target.value);
                }}
                placeholder="Title, reference, or author"
              />
            </label>
            <label>
              Institute
              <input
                value={institute}
                onChange={(event) => {
                  setLoading(true);
                  setInstitute(event.target.value);
                }}
                placeholder="All institutes"
              />
            </label>
            <label>
              Publication year
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={year}
                onChange={(event) => {
                  setLoading(true);
                  setYear(event.target.value.replace(/\D/g, ""));
                }}
                placeholder="All years"
              />
            </label>
            <Button type="submit" variant="secondary">
              Apply filters
            </Button>
          </form>
          {notice && (
            <p role="status" className="admin-success manage-repository-notice">
              {notice}
            </p>
          )}
          {error ? (
            <div className="admin-error manage-repository-error" role="alert">
              <p>{error}</p>
              <Button variant="secondary" onClick={reload}>
                Retry
              </Button>
            </div>
          ) : loading || rows === null ? (
            <p className="admin-empty" aria-live="polite">
              Loading repository records…
            </p>
          ) : rows.length === 0 ? (
            <p className="admin-empty">
              No{" "}
              {view === "recycle"
                ? "records in the Recycle Bin"
                : "records match these filters"}
              .
            </p>
          ) : (
            <>
              <div className="admin-table-wrap manage-repository-table-wrap">
                <table>
                  <caption className="sr-only">
                    {label(view)} repository records
                  </caption>
                  <thead>
                    <tr>
                      <SortableHeader
                        sortKey="title"
                        activeSort={sort}
                        direction={direction}
                        onSort={() => changeSort("title")}
                      >
                        Title
                      </SortableHeader>
                      <th>Authors</th>
                      <SortableHeader
                        sortKey="publication_year"
                        activeSort={sort}
                        direction={direction}
                        onSort={() => changeSort("publication_year")}
                      >
                        Year
                      </SortableHeader>
                      <th>Institute</th>
                      <SortableHeader
                        sortKey="updated_at"
                        activeSort={sort}
                        direction={direction}
                        onSort={() => changeSort("updated_at")}
                      >
                        {view === "recycle" ? "Removed" : "Updated"}
                      </SortableHeader>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((record) => (
                      <tr key={record.id}>
                        <td data-label="Title">
                          <strong>{record.title}</strong>
                          <small>
                            {record.submission_reference ??
                              "No submission reference"}
                          </small>
                        </td>
                        <td data-label="Authors">
                          {record.author_names.join(", ") || "—"}
                        </td>
                        <td data-label="Year">
                          {record.publication_year ?? "—"}
                        </td>
                        <td data-label="Institute">
                          {record.institute ?? "—"}
                        </td>
                        <td
                          data-label={
                            view === "recycle" ? "Removed" : "Updated"
                          }
                        >
                          {formatPhilippineDateTime(
                            view === "recycle"
                              ? record.deleted_at
                              : record.updated_at,
                          )}
                        </td>
                        <td data-label="Actions">
                          <span className="row-actions">
                            <Button
                              type="button"
                              variant="secondary"
                              className="icon-button"
                              aria-label={`View ${record.title}`}
                              title="View safe details"
                              onClick={() => openDetail(record.id)}
                            >
                              <Eye />
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {meta && (
                <Pagination
                  meta={meta}
                  noun="records"
                  onPage={(nextPage) => {
                    setLoading(true);
                    setPage(nextPage);
                  }}
                />
              )}
            </>
          )}
        </section>
      )}

      {selectedId !== null && (
        <Modal
          label="Repository record details"
          onClose={() => setSelectedId(null)}
          busy={saving}
          size="large"
          className="manage-repository-modal"
        >
          {detailLoading ? (
            <p className="admin-empty" aria-live="polite">
              Loading safe record details…
            </p>
          ) : detailError && !selected ? (
            <div className="admin-error" role="alert">
              <p>{detailError}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  openDetail(selectedId);
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            selected && (
              <RepositoryDetail
                detail={selected}
                editing={editing}
                draft={draft}
                setDraft={setDraft}
                error={detailError}
                saving={saving}
                onEdit={() => setEditing(true)}
                onCancel={() => {
                  setDraft(initialDraft(selected));
                  setEditing(false);
                  setDetailError("");
                }}
                onSave={() => void save()}
                onDelete={() => setConfirming("delete")}
                onRestore={() => setConfirming("restore")}
              />
            )
          )}
        </Modal>
      )}
      {confirming && selected && (
        <ConfirmDialog
          title={
            confirming === "delete"
              ? "Move to Recycle Bin"
              : "Restore repository record"
          }
          message={
            confirming === "delete"
              ? `Move “${selected.title}” to the Recycle Bin? Its record is retained and can be restored later.`
              : `Restore “${selected.title}” to its previous repository bucket?`
          }
          confirmLabel={
            confirming === "delete" ? "Move to Recycle Bin" : "Restore record"
          }
          busy={saving}
          onConfirm={() => void mutate(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function RepositoryDetail({
  detail,
  editing,
  draft,
  setDraft,
  error,
  saving,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onRestore,
}: {
  detail: OfficeRepositoryDetailResource;
  editing: boolean;
  draft: OfficeRepositoryUpdateInput;
  setDraft: Dispatch<SetStateAction<OfficeRepositoryUpdateInput>>;
  error: string;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const update = <K extends keyof OfficeRepositoryUpdateInput>(
    key: K,
    value: OfficeRepositoryUpdateInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="manage-repository-detail">
      <header>
        <p className="eyebrow">
          {detail.submission_reference ?? "Repository record"}
        </p>
        <h2>{detail.title}</h2>
        <p>
          {detail.authors
            .sort((a, b) => a.author_order - b.author_order)
            .map((author) => author.author_name)
            .join(", ") || "No authors listed"}
        </p>
      </header>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {editing ? (
        <form
          className="manage-repository-edit"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>
            Title
            <input
              value={draft.title ?? ""}
              maxLength={500}
              required
              onChange={(event) => update("title", event.target.value)}
            />
          </label>
          <label>
            Abstract
            <textarea
              value={draft.abstract ?? ""}
              onChange={(event) =>
                update("abstract", event.target.value || null)
              }
            />
          </label>
          <label>
            Keywords
            <input
              value={draft.keywords ?? ""}
              onChange={(event) =>
                update("keywords", event.target.value || null)
              }
            />
          </label>
          <div className="manage-repository-field-grid">
            <label>
              Publication year
              <input
                type="number"
                value={draft.publication_year ?? ""}
                onChange={(event) =>
                  update(
                    "publication_year",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Category ID
              <input
                type="number"
                value={draft.category_id ?? ""}
                onChange={(event) =>
                  update(
                    "category_id",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Institute
              <input
                value={draft.institute ?? ""}
                onChange={(event) =>
                  update("institute", event.target.value || null)
                }
              />
            </label>
            <label>
              Degree program
              <input
                value={draft.degree_program ?? ""}
                onChange={(event) =>
                  update("degree_program", event.target.value || null)
                }
              />
            </label>
            <label>
              Manuscript date label
              <input
                value={draft.manuscript_date_label ?? ""}
                onChange={(event) =>
                  update("manuscript_date_label", event.target.value || null)
                }
              />
            </label>
            <label>
              Research stage
              <select
                value={draft.research_stage ?? "ongoing"}
                onChange={(event) =>
                  update(
                    "research_stage",
                    event.target
                      .value as OfficeRepositoryUpdateInput["research_stage"],
                  )
                }
              >
                <option value="title_proposal">Title proposal</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          <label>
            SDG IDs <small>Comma-separated goal IDs</small>
            <input
              value={(draft.sdg_ids ?? []).join(", ")}
              inputMode="numeric"
              onChange={(event) =>
                update(
                  "sdg_ids",
                  event.target.value
                    .split(",")
                    .map((value) => Number(value.trim()))
                    .filter((value) => Number.isInteger(value) && value > 0),
                )
              }
            />
          </label>
          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save metadata"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="manage-repository-metadata">
            <div>
              <dt>Category</dt>
              <dd>{detail.category?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Research stage</dt>
              <dd>{label(detail.research_stage)}</dd>
            </div>
            <div>
              <dt>Publication year</dt>
              <dd>{detail.publication_year ?? "—"}</dd>
            </div>
            <div>
              <dt>Institute</dt>
              <dd>{detail.institute ?? "—"}</dd>
            </div>
            <div>
              <dt>Degree program</dt>
              <dd>{detail.degree_program ?? "—"}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatPhilippineDateTime(detail.updated_at)}</dd>
            </div>
            <div className="manage-repository-wide">
              <dt>Keywords</dt>
              <dd>{detail.keywords ?? "—"}</dd>
            </div>
            <div className="manage-repository-wide">
              <dt>Abstract</dt>
              <dd>{detail.abstract ?? "—"}</dd>
            </div>
          </dl>
          <section className="manage-repository-files">
            <h3>Files</h3>
            <p>
              File names and metadata only. Downloads and storage locations are
              not available here.
            </p>
            {detail.files.length === 0 ? (
              <p>There are no file metadata entries.</p>
            ) : (
              <ul>
                {detail.files.map((file) => (
                  <li key={file.id}>
                    <strong>{file.original_filename}</strong> · {file.mime_type}{" "}
                    · {file.file_size.toLocaleString()} bytes
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="modal-actions manage-repository-detail-actions">
            {detail.can_edit && !detail.deleted_at && (
              <Button variant="secondary" onClick={onEdit}>
                <Pencil aria-hidden="true" /> Edit metadata
              </Button>
            )}
            {detail.can_delete && !detail.deleted_at && (
              <Button variant="rust" onClick={onDelete}>
                <Trash2 aria-hidden="true" /> Move to Recycle Bin
              </Button>
            )}
            {detail.can_restore && (
              <Button onClick={onRestore}>
                <RotateCcw aria-hidden="true" /> Restore record
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
