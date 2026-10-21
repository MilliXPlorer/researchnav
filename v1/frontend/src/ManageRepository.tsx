import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Eye,
  FolderOpen,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  deleteOfficeRepository,
  getOfficeRepositoryDetail,
  listCategories,
  listOfficeRepository,
  restoreOfficeRepository,
  updateOfficeRepository,
  type OfficeRepositoryBucket,
  type CategoryResource,
  type OfficeRepositoryDetailResource,
  type OfficeRepositoryItemResource,
  type OfficeRepositoryUpdateInput,
} from "./api";
import { Button, Pagination, SortableHeader } from "./components";
import { instituteNames, programsByInstitute } from "./data";
import { formatPhilippineDateTime } from "./dateTime";
import { ConfirmDialog, Modal } from "./Modal";
import ResearchOfficeBulkImport from "./ResearchOfficeBulkImport";
import { SdgSelector } from "./SdgMetadata";
import "./ManageRepository.css";

type View = OfficeRepositoryBucket;
type FilterValues = { search: string; institute: string };
type FieldErrors = Record<string, string[]>;
type Sort = "title" | "publication_year" | "updated_at" | "archive_status";

const views: Array<{ value: View; label: string }> = [
  { value: "all", label: "All Studies" },
  { value: "ongoing", label: "Ongoing" },
  { value: "archived", label: "Archived" },
  { value: "recycle", label: "Recycle Bin" },
];

// This view must offer every pair accepted by ResearchDocument::PROGRAMS_BY_INSTITUTE.
// Shared data is missing the Information Technology program, so correct it locally
// without changing choices used by unrelated screens.
const repositoryProgramsByInstitute = {
  ...programsByInstitute,
  "Institute of Computer Studies": [
    ...programsByInstitute["Institute of Computer Studies"],
    "Bachelor of Science in Information Technology",
  ],
} satisfies Record<(typeof instituteNames)[number], readonly string[]>;

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
    authors: [...detail.authors]
      .sort((a, b) => a.author_order - b.author_order)
      .map((author) => author.author_name),
  };
}

function normalizedDraftValue(
  field: keyof OfficeRepositoryUpdateInput,
  value: OfficeRepositoryUpdateInput[keyof OfficeRepositoryUpdateInput],
) {
  if (field === "sdg_ids") {
    return [...((value as number[] | undefined) ?? [])].sort(
      (first, second) => first - second,
    );
  }
  if (field === "authors") {
    return ((value as string[] | undefined) ?? []).map((author) =>
      author.trim(),
    );
  }
  if (field === "title") return (value as string | undefined)?.trim() ?? "";
  return value ?? null;
}

function valuesMatch(left: unknown, right: unknown) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  return left === right;
}

function changedDraft(
  draft: OfficeRepositoryUpdateInput,
  detail: OfficeRepositoryDetailResource,
) {
  const initial = initialDraft(detail);
  return (
    Object.keys(initial) as Array<keyof OfficeRepositoryUpdateInput>
  ).reduce((changes, field) => {
    const next = normalizedDraftValue(field, draft[field]);
    const previous = normalizedDraftValue(field, initial[field]);
    if (!valuesMatch(next, previous)) changes[field] = next as never;
    return changes;
  }, {} as OfficeRepositoryUpdateInput);
}

function draftIsDirty(
  draft: OfficeRepositoryUpdateInput,
  detail: OfficeRepositoryDetailResource | null,
) {
  return detail !== null && Object.keys(changedDraft(draft, detail)).length > 0;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <span className="manage-repository-field-error" role="alert">
      {messages.join(" ")}
    </span>
  );
}

function normalizeFieldErrors(fields?: FieldErrors): FieldErrors {
  if (!fields) return {};
  return Object.entries(fields).reduce<FieldErrors>(
    (normalized, [key, messages]) => {
      const field = key.split(".", 1)[0];
      normalized[field] = [...(normalized[field] ?? []), ...messages];
      return normalized;
    },
    {},
  );
}

function normalizeFilterFieldErrors(fields?: FieldErrors): FieldErrors {
  const normalized = normalizeFieldErrors(fields);
  if (normalized.publication_year) {
    normalized.year = [
      ...(normalized.year ?? []),
      ...normalized.publication_year,
    ];
    delete normalized.publication_year;
  }
  return normalized;
}

/** Shared Admin and Research Office repository management workspace. */
export default function ManageRepository({
  contextLabel = "Research Office",
}: {
  contextLabel?: string;
}) {
  const [view, setView] = useState<View>("all");
  const [rows, setRows] = useState<OfficeRepositoryItemResource[] | null>(null);
  const [meta, setMeta] = useState<
    Awaited<ReturnType<typeof listOfficeRepository>>["meta"] | null
  >(null);
  const [summary, setSummary] = useState<
    Awaited<ReturnType<typeof listOfficeRepository>>["summary"] | null
  >(null);
  const [filterDraft, setFilterDraft] = useState<FilterValues>({
    search: "",
    institute: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    search: "",
    institute: "",
  });
  const [page, setPage] = useState(1);
  const [addStudyOpen, setAddStudyOpen] = useState(false);
  const [sort, setSort] = useState<Sort>("updated_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
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
  const [detailFieldErrors, setDetailFieldErrors] = useState<FieldErrors>({});
  const [filterFieldErrors, setFilterFieldErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OfficeRepositoryUpdateInput>({});
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirming, setConfirming] = useState<"delete" | "restore" | null>(
    null,
  );
  const [pendingDetailAction, setPendingDetailAction] = useState<
    "edit" | "delete" | "restore" | null
  >(null);
  const requestGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const [categories, setCategories] = useState<CategoryResource[] | null>(null);
  const [categoryOptionsError, setCategoryOptionsError] = useState("");

  const bucket = view;

  function reload() {
    setError("");
    setLoading(true);
    setReloadVersion((version) => version + 1);
  }

  function closeDetail() {
    detailGeneration.current += 1;
    setSelectedId(null);
    setSelected(null);
    setEditing(false);
    setPendingDetailAction(null);
    setDetailLoading(false);
    setDetailError("");
    setDetailFieldErrors({});
  }

  function openDetail(
    id: number,
    action: "edit" | "delete" | "restore" | null = null,
  ) {
    setDetailLoading(true);
    setDetailError("");
    setDetailFieldErrors({});
    setCategories(null);
    setCategoryOptionsError("");
    setSelected(null);
    setEditing(false);
    setPendingDetailAction(action);
    setDetailVersion((version) => version + 1);
    setSelectedId(id);
  }

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    void listOfficeRepository(
      {
        bucket,
        search: appliedFilters.search,
        institute: appliedFilters.institute,
        sort: bucket === "recycle" ? undefined : sort,
        direction: bucket === "recycle" ? undefined : direction,
        page,
        per_page: 10,
      },
      undefined,
      controller.signal,
    )
      .then((response) => {
        if (generation !== requestGeneration.current) return;
        setRows(response.data);
        setMeta(response.meta);
        setSummary(response.summary);
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
        setSummary(null);
        if (requestError instanceof ApiError) {
          setFilterFieldErrors(normalizeFilterFieldErrors(requestError.fields));
        }
        setError(
          friendlyError(requestError, "Repository records are unavailable"),
        );
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
    return () => controller.abort();
  }, [bucket, appliedFilters, direction, page, reloadVersion, sort]);

  useEffect(() => {
    if (selectedId === null) return;
    const generation = ++detailGeneration.current;
    const controller = new AbortController();
    void getOfficeRepositoryDetail(selectedId, undefined, controller.signal)
      .then((detail) => {
        if (generation !== detailGeneration.current) return;
        setSelected(detail);
        setDraft(initialDraft(detail));
        if (pendingDetailAction === "edit") setEditing(true);
        if (
          pendingDetailAction === "delete" ||
          pendingDetailAction === "restore"
        )
          setConfirming(pendingDetailAction);
        setPendingDetailAction(null);
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
  }, [detailVersion, pendingDetailAction, selectedId]);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    void listCategories()
      .then((values) => {
        if (!cancelled) {
          setCategories(values.filter((category) => category.is_active));
          setCategoryOptionsError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories(null);
          setCategoryOptionsError(
            "Category options are unavailable. The current category is preserved; refresh and try again before changing it.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editing]);

  function changeView(next: View) {
    if (next === view) return;
    setView(next);
    setPage(1);
    setSelectedId(null);
    setConfirming(null);
    setError("");
    setLoading(true);
  }

  useEffect(() => {
    const search = filterDraft.search.trim();
    if (search === appliedFilters.search) return;
    const timeout = window.setTimeout(() => {
      setFilterFieldErrors({});
      setAppliedFilters((current) => ({ ...current, search }));
      setPage(1);
      setLoading(true);
      setError("");
    }, 325);
    return () => window.clearTimeout(timeout);
  }, [appliedFilters.search, filterDraft.search]);

  function changeInstitute(institute: string) {
    setFilterDraft((current) => ({ ...current, institute }));
    setFilterFieldErrors({});
    setAppliedFilters((current) => ({ ...current, institute }));
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changeSort(next: Sort) {
    if (bucket === "recycle") return;
    setPage(1);
    setLoading(true);
    if (sort === next) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDirection(next === "updated_at" ? "desc" : "asc");
  }

  async function save() {
    if (!selected || saving) return;
    if (!draft.title?.trim()) {
      setDetailError("A title is required.");
      return;
    }
    const changes = changedDraft(draft, selected);
    if (Object.keys(changes).length === 0) {
      closeDetail();
      return;
    }
    setSaving(true);
    setDetailError("");
    setDetailFieldErrors({});
    try {
      const updated = await updateOfficeRepository(selected.id, changes);
      closeDetail();
      setNotice(`Saved metadata for ${updated.title}.`);
      reload();
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setDetailFieldErrors(normalizeFieldErrors(requestError.fields));
      }
      setDetailError(
        friendlyError(requestError, "Metadata could not be saved"),
      );
    } finally {
      setSaving(false);
    }
  }

  function requestDetailClose() {
    if (editing && draftIsDirty(draft, selected)) {
      setDiscarding(true);
      return;
    }
    closeDetail();
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
      setPage(1);
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
      <header className="workspace-header manage-repository-header">
        <div>
          <p className="eyebrow">{contextLabel}</p>
          <h1>Manage Repository</h1>
          <p>Manage studies and archived manuscripts.</p>
        </div>
        <div className="manage-repository-header-actions">
          <Button onClick={() => setAddStudyOpen(true)}>+ Add Study</Button>
        </div>
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
            id={`repository-view-${item.value}-tab`}
            aria-controls={`repository-view-${item.value}-panel`}
            aria-selected={view === item.value}
            tabIndex={view === item.value ? 0 : -1}
            className={view === item.value ? "is-active" : ""}
            onClick={() => changeView(item.value)}
            onKeyDown={(event) => {
              const current = views.findIndex(({ value }) => value === view);
              const nextIndex =
                event.key === "ArrowRight"
                  ? (current + 1) % views.length
                  : event.key === "ArrowLeft"
                    ? (current - 1 + views.length) % views.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? views.length - 1
                        : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const nextView = views[nextIndex];
              changeView(nextView.value);
              document
                .getElementById(`repository-view-${nextView.value}-tab`)
                ?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section
        id={`repository-view-${view}-panel`}
        role="tabpanel"
        aria-labelledby={`repository-view-${view}-tab`}
        className="panel-card admin-data-card manage-repository-card"
        aria-busy={loading}
      >
        {summary && (
          <div
            className="manage-repository-summary"
            aria-label="Repository summary"
          >
            <button type="button" onClick={() => changeView("ongoing")}>
              <FolderOpen aria-hidden="true" />
              <span>Ongoing</span>
              <strong>{summary.ongoing.toLocaleString()}</strong>
            </button>
            <button type="button" onClick={() => changeView("archived")}>
              <Archive aria-hidden="true" />
              <span>Archived</span>
              <strong>{summary.archived.toLocaleString()}</strong>
            </button>
            <button type="button" onClick={() => changeView("recycle")}>
              <Trash2 aria-hidden="true" />
              <span>Recycle Bin</span>
              <strong>{summary.recycle.toLocaleString()}</strong>
            </button>
          </div>
        )}
        <div className="manage-repository-filter-row">
          <label>
            Search
            <input
              value={filterDraft.search}
              maxLength={200}
              aria-invalid={Boolean(filterFieldErrors.search)}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Search studies..."
            />
            <FieldError messages={filterFieldErrors.search} />
          </label>
          <label>
            Institute
            <select
              value={filterDraft.institute}
              onChange={(event) => changeInstitute(event.target.value)}
              aria-invalid={Boolean(filterFieldErrors.institute)}
            >
              <option value="">All institutes</option>
              {instituteNames.map((institute) => (
                <option key={institute} value={institute}>
                  {institute}
                </option>
              ))}
            </select>
            <FieldError messages={filterFieldErrors.institute} />
          </label>
          <Button
            type="button"
            variant="secondary"
            className="manage-repository-refresh"
            onClick={reload}
            disabled={loading}
            aria-label="Refresh studies"
            title="Refresh studies"
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
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
        ) : rows === null ? (
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
            <div
              className={`admin-table-wrap manage-repository-table-wrap${loading ? " is-refreshing" : ""}`}
            >
              <table>
                <caption className="sr-only">
                  {label(view)} repository records
                </caption>
                <thead>
                  <tr>
                    {view === "recycle" ? (
                      <th>Study Title</th>
                    ) : (
                      <SortableHeader
                        sortKey="title"
                        activeSort={sort}
                        direction={direction}
                        onSort={() => changeSort("title")}
                      >
                        Study Title
                      </SortableHeader>
                    )}
                    <th>Researchers / Institute</th>
                    {view === "recycle" ? (
                      <th>Year</th>
                    ) : (
                      <SortableHeader
                        sortKey="publication_year"
                        activeSort={sort}
                        direction={direction}
                        onSort={() => changeSort("publication_year")}
                      >
                        Year
                      </SortableHeader>
                    )}
                    {view === "recycle" ? (
                      <th>Status</th>
                    ) : (
                      <SortableHeader
                        sortKey="archive_status"
                        activeSort={sort}
                        direction={direction}
                        onSort={() => changeSort("archive_status")}
                      >
                        Status
                      </SortableHeader>
                    )}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={record.id}>
                      <td data-label="Study Title">
                        <strong>{record.title}</strong>
                        <small>
                          {record.submission_reference ??
                            "No submission reference"}
                        </small>
                        {view === "recycle" && (
                          <small>
                            Deleted{" "}
                            {formatPhilippineDateTime(record.deleted_at)}
                          </small>
                        )}
                      </td>
                      <td data-label="Researchers / Institute">
                        <strong>{record.author_names.join(", ") || "—"}</strong>
                        <small>{record.institute ?? "—"}</small>
                      </td>
                      <td data-label="Year">
                        {record.publication_year ?? "—"}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`manage-repository-status ${
                            record.archive_status === "archived"
                              ? "is-archived"
                              : "is-ongoing"
                          }`}
                        >
                          {view === "recycle" ? "Previous: " : ""}
                          {record.archive_status === "archived"
                            ? "Archived"
                            : "Ongoing"}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div className="manage-repository-row-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            className="icon-button"
                            aria-label={`View ${record.title}`}
                            title="View details"
                            onClick={() => openDetail(record.id)}
                          >
                            <Eye aria-hidden="true" />
                          </Button>
                          {record.can_edit && (
                            <Button
                              type="button"
                              variant="secondary"
                              className="icon-button"
                              aria-label={`Edit ${record.title}`}
                              title="Edit metadata"
                              onClick={() => openDetail(record.id, "edit")}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                          )}
                          {record.can_delete && (
                            <Button
                              type="button"
                              variant="secondary"
                              className="icon-button"
                              aria-label={`Move ${record.title} to Recycle Bin`}
                              title="Move to Recycle Bin"
                              onClick={() => openDetail(record.id, "delete")}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          )}
                          {record.can_restore && (
                            <Button
                              type="button"
                              variant="secondary"
                              className="icon-button"
                              aria-label={`Restore ${record.title}`}
                              title="Restore study"
                              onClick={() => openDetail(record.id, "restore")}
                            >
                              <RotateCcw aria-hidden="true" />
                            </Button>
                          )}
                        </div>
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
                  if (nextPage === meta.current_page) return;
                  setLoading(true);
                  setPage(nextPage);
                }}
              />
            )}
          </>
        )}
      </section>

      {addStudyOpen && (
        <Modal
          label="Add study"
          onClose={() => {
            setAddStudyOpen(false);
            reload();
          }}
          size="large"
          className="manage-repository-add-study-modal"
        >
          <ResearchOfficeBulkImport
            contextLabel={contextLabel}
            compact
            onComplete={() => {
              setAddStudyOpen(false);
              reload();
            }}
          />
        </Modal>
      )}

      {selectedId !== null &&
        pendingDetailAction !== "delete" &&
        pendingDetailAction !== "restore" &&
        !confirming && (
          <Modal
            label="Repository record details"
            onClose={requestDetailClose}
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
                  fieldErrors={detailFieldErrors}
                  categories={categories}
                  categoryOptionsError={categoryOptionsError}
                  saving={saving}
                  onEdit={() => {
                    setCategories(null);
                    setCategoryOptionsError("");
                    setDetailFieldErrors({});
                    setDiscarding(false);
                    setEditing(true);
                  }}
                  onCancel={() => {
                    setDraft(initialDraft(selected));
                    setEditing(false);
                    setDetailError("");
                    setDetailFieldErrors({});
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
          onCancel={() => {
            setConfirming(null);
            closeDetail();
          }}
        />
      )}
      {discarding && (
        <Modal
          label="Discard unsaved changes"
          onClose={() => setDiscarding(false)}
        >
          <div className="confirm-card">
            <p>You have unsaved changes. Discard them and close?</p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setDiscarding(false)}>
                Keep editing
              </Button>
              <Button
                variant="rust"
                onClick={() => {
                  setDiscarding(false);
                  setSelectedId(null);
                }}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </Modal>
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
  fieldErrors,
  categories,
  categoryOptionsError,
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
  fieldErrors: FieldErrors;
  categories: CategoryResource[] | null;
  categoryOptionsError: string;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLSpanElement>(null);
  const wasEditing = useRef(editing);

  useEffect(() => {
    if (editing) titleInputRef.current?.focus();
    else if (wasEditing.current)
      editButtonRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const update = <K extends keyof OfficeRepositoryUpdateInput>(
    key: K,
    value: OfficeRepositoryUpdateInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const selectedInstitute = draft.institute ?? "";
  const programOptions =
    repositoryProgramsByInstitute[
      selectedInstitute as keyof typeof programsByInstitute
    ] ?? [];
  const selectedCategory = categories?.find(
    (category) => category.id === draft.category_id,
  );
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
              ref={titleInputRef}
              value={draft.title ?? ""}
              maxLength={500}
              required
              aria-invalid={Boolean(fieldErrors.title)}
              onChange={(event) => update("title", event.target.value)}
            />
            <FieldError messages={fieldErrors.title} />
          </label>
          <label>
            Researchers
            <small>Enter one researcher per line.</small>
            <textarea
              aria-label="Researchers"
              defaultValue={(draft.authors ?? []).join("\n")}
              rows={4}
              required
              aria-invalid={Boolean(fieldErrors.authors)}
              onChange={(event) => {
                update(
                  "authors",
                  event.target.value
                    .split("\n")
                    .map((author) => author.trim())
                    .filter(Boolean),
                );
              }}
            />
            <FieldError messages={fieldErrors.authors} />
          </label>
          <label>
            Abstract
            <textarea
              value={draft.abstract ?? ""}
              maxLength={50000}
              rows={5}
              aria-invalid={Boolean(fieldErrors.abstract)}
              onChange={(event) =>
                update("abstract", event.target.value || null)
              }
            />
            <FieldError messages={fieldErrors.abstract} />
          </label>
          <label>
            Keywords
            <input
              value={draft.keywords ?? ""}
              maxLength={5000}
              aria-invalid={Boolean(fieldErrors.keywords)}
              onChange={(event) =>
                update("keywords", event.target.value || null)
              }
            />
            <FieldError messages={fieldErrors.keywords} />
          </label>
          <div className="manage-repository-field-grid">
            <label>
              Publication year
              <input
                type="number"
                value={draft.publication_year ?? ""}
                min={1901}
                max={2155}
                step={1}
                aria-invalid={Boolean(fieldErrors.publication_year)}
                onChange={(event) =>
                  update(
                    "publication_year",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
              <FieldError messages={fieldErrors.publication_year} />
            </label>
            <label>
              Category
              <select
                value={draft.category_id ?? ""}
                disabled={saving || categories === null}
                aria-invalid={Boolean(fieldErrors.category_id)}
                onChange={(event) =>
                  update(
                    "category_id",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">Uncategorized</option>
                {draft.category_id !== null &&
                  draft.category_id !== undefined &&
                  !selectedCategory && (
                    <option value={draft.category_id}>
                      {detail.category?.name ??
                        `Current category (${draft.category_id})`}
                    </option>
                  )}
                {categories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categories === null && !categoryOptionsError && (
                <small>Loading category options…</small>
              )}
              {categoryOptionsError && <small>{categoryOptionsError}</small>}
              <FieldError messages={fieldErrors.category_id} />
            </label>
            <label>
              Institute
              <select
                value={selectedInstitute}
                aria-invalid={Boolean(fieldErrors.institute)}
                onChange={(event) => {
                  update("institute", event.target.value || null);
                  update("degree_program", null);
                }}
              >
                <option value="">Unclassified</option>
                {selectedInstitute &&
                  !instituteNames.includes(selectedInstitute as never) && (
                    <option value={selectedInstitute} disabled>
                      {selectedInstitute} (unavailable)
                    </option>
                  )}
                {instituteNames.map((institute) => (
                  <option key={institute} value={institute}>
                    {institute}
                  </option>
                ))}
              </select>
              <FieldError messages={fieldErrors.institute} />
            </label>
            <label>
              Degree program
              <select
                value={draft.degree_program ?? ""}
                disabled={
                  saving || !selectedInstitute || programOptions.length === 0
                }
                aria-invalid={Boolean(fieldErrors.degree_program)}
                onChange={(event) =>
                  update("degree_program", event.target.value || null)
                }
              >
                <option value="">Not specified</option>
                {draft.degree_program &&
                  !programOptions.includes(draft.degree_program) && (
                    <option value={draft.degree_program} disabled>
                      {draft.degree_program} (not offered by this institute)
                    </option>
                  )}
                {programOptions.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
              <FieldError messages={fieldErrors.degree_program} />
            </label>
            <label>
              Manuscript date label
              <input
                value={draft.manuscript_date_label ?? ""}
                maxLength={50}
                aria-invalid={Boolean(fieldErrors.manuscript_date_label)}
                onChange={(event) =>
                  update("manuscript_date_label", event.target.value || null)
                }
              />
              <FieldError messages={fieldErrors.manuscript_date_label} />
            </label>
            <label>
              Research stage
              <select
                value={draft.research_stage ?? "ongoing"}
                aria-invalid={Boolean(fieldErrors.research_stage)}
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
              <FieldError messages={fieldErrors.research_stage} />
            </label>
          </div>
          <div
            role="group"
            aria-label="SDG selection"
            aria-invalid={Boolean(fieldErrors.sdg_ids)}
          >
            <SdgSelector
              selectedIds={draft.sdg_ids ?? []}
              onChange={(sdgIds) => update("sdg_ids", sdgIds)}
              disabled={saving}
            />
          </div>
          <FieldError messages={fieldErrors.sdg_ids} />
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
              <span ref={editButtonRef}>
                <Button variant="secondary" onClick={onEdit}>
                  <Pencil aria-hidden="true" /> Edit metadata
                </Button>
              </span>
            )}
            {detail.can_delete && !detail.deleted_at && (
              <Button variant="rust" onClick={onDelete}>
                <Trash2 aria-hidden="true" /> Move to Recycle Bin
              </Button>
            )}
            {detail.can_restore && (
              <Button onClick={onRestore}>
                <RotateCcw aria-hidden="true" /> Restore Study
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
