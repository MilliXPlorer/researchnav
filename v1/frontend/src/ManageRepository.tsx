import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Check,
  Eye,
  FileText,
  FolderOpen,
  Globe2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  deleteOfficeRepository,
  getOfficeRepositoryDetail,
  listOfficeAuthorAccounts,
  listCategories,
  listOfficeRepository,
  restoreOfficeRepository,
  updateOfficeRepository,
  type OfficeRepositoryBucket,
  type OfficeRepositoryAuthorInput,
  type OfficeAuthorAccount,
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
import { SdgIcon } from "./SdgIcon";
import { sustainableDevelopmentGoals } from "./sdgs";
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
    // Sort a copy: the API resource remains authoritative and untouched.
    authors: [...detail.authors]
      .sort((a, b) => a.author_order - b.author_order)
      .map(({ id, user_id, author_name, is_corresponding_author }) => ({
        id,
        user_id,
        author_name,
        is_corresponding_author,
      })),
  };
}

function normalizeAuthorName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendKeyword(value: string | null | undefined, entry: string) {
  const keyword = normalizeAuthorName(entry);
  const keywords = (value ?? "")
    .split(",")
    .map((item) => normalizeAuthorName(item))
    .filter(Boolean);
  if (
    !keyword ||
    keywords.some(
      (item) => item.toLocaleLowerCase() === keyword.toLocaleLowerCase(),
    )
  )
    return value ?? "";
  return [...keywords, keyword].join(", ");
}

function normalizeAuthors(authors: OfficeRepositoryAuthorInput[] | undefined) {
  return (authors ?? []).map((author) => ({
    ...(author.id === undefined ? {} : { id: author.id }),
    user_id: author.user_id,
    author_name: normalizeAuthorName(author.author_name),
    is_corresponding_author: author.is_corresponding_author,
  }));
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
    return normalizeAuthors(value as OfficeRepositoryAuthorInput[] | undefined);
  }
  if (field === "title") return (value as string | undefined)?.trim() ?? "";
  return value ?? null;
}

function valuesMatch(left: unknown, right: unknown) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) =>
        typeof value === "object" && value !== null
          ? JSON.stringify(value) === JSON.stringify(right[index])
          : value === right[index],
      )
    );
  }
  return left === right;
}

type DraftIssue = {
  id: string;
  tab: EditorTab;
  message: string;
};

type EditorTab = "basic" | "classification" | "sdgs" | "files" | "review";

const editorTabs: Array<{ id: EditorTab; label: string }> = [
  { id: "basic", label: "Basic information" },
  { id: "classification", label: "Classification" },
  { id: "sdgs", label: "SDGs" },
  { id: "files", label: "Files and visibility" },
  { id: "review", label: "Review and publish" },
];

function draftIssues(draft: OfficeRepositoryUpdateInput): DraftIssue[] {
  const authors = normalizeAuthors(draft.authors);
  const names = authors.map((author) => author.author_name.toLocaleLowerCase());
  const issues: DraftIssue[] = [];
  if (!draft.title?.trim())
    issues.push({
      id: "repository-title",
      tab: "basic",
      message: "Add a title.",
    });
  if ((draft.title?.length ?? 0) > 500)
    issues.push({
      id: "repository-title",
      tab: "basic",
      message: "Title must be 500 characters or fewer.",
    });
  if (!authors.length)
    issues.push({
      id: "repository-author-0",
      tab: "basic",
      message: "Add at least one researcher.",
    });
  if (
    authors.some(
      (author) => !author.author_name || author.author_name.length > 255,
    )
  )
    issues.push({
      id: "repository-author-0",
      tab: "basic",
      message: "Each researcher needs a name of 255 characters or fewer.",
    });
  if (new Set(names).size !== names.length)
    issues.push({
      id: "repository-author-0",
      tab: "basic",
      message: "Each researcher must be unique.",
    });
  if ((draft.abstract?.length ?? 0) > 50000)
    issues.push({
      id: "repository-abstract",
      tab: "basic",
      message: "Abstract must be 50,000 characters or fewer.",
    });
  if ((draft.keywords?.length ?? 0) > 5000)
    issues.push({
      id: "repository-keywords",
      tab: "basic",
      message: "Keywords must be 5,000 characters or fewer.",
    });
  if (
    draft.publication_year &&
    (draft.publication_year < 1901 || draft.publication_year > 2155)
  )
    issues.push({
      id: "repository-year",
      tab: "classification",
      message: "Publication year must be between 1901 and 2155.",
    });
  if ((draft.manuscript_date_label?.length ?? 0) > 50)
    issues.push({
      id: "repository-manuscript-date",
      tab: "classification",
      message: "Manuscript date label must be 50 characters or fewer.",
    });
  const programs = draft.institute
    ? (repositoryProgramsByInstitute[
        draft.institute as keyof typeof repositoryProgramsByInstitute
      ] ?? [])
    : [];
  if (
    draft.degree_program &&
    (!draft.institute || !programs.includes(draft.degree_program))
  )
    issues.push({
      id: "repository-program",
      tab: "classification",
      message: "Choose a degree program offered by the selected institute.",
    });
  return issues;
}

function editorIsValid(draft: OfficeRepositoryUpdateInput) {
  return draftIssues(draft).length === 0;
}

function humanFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function sortedFiles(files: OfficeRepositoryDetailResource["files"]) {
  return [...files].sort(
    (first, second) =>
      (first.file_order ?? Number.MAX_SAFE_INTEGER) -
        (second.file_order ?? Number.MAX_SAFE_INTEGER) ||
      first.version_number - second.version_number ||
      first.id - second.id,
  );
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

function FieldError({ messages, id }: { messages?: string[]; id?: string }) {
  if (!messages?.length) return null;
  return (
    <span id={id} className="manage-repository-field-error" role="alert">
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
      if (key !== field) normalized[key] = messages;
      return normalized;
    },
    {},
  );
}

function editorFieldTarget(
  field: string,
  draft?: OfficeRepositoryUpdateInput,
): { tab: EditorTab; id: string } {
  const authorIndex = Number(field.match(/^authors\.(\d+)/)?.[1]);
  if (Number.isInteger(authorIndex))
    return { tab: "basic", id: `repository-author-${authorIndex}` };

  const sdgIndex = Number(field.match(/^sdg_ids\.(\d+)/)?.[1]);
  if (Number.isInteger(sdgIndex)) {
    const sdgId = draft?.sdg_ids?.[sdgIndex];
    if (sdgId !== undefined)
      return { tab: "sdgs", id: `repository-sdg-${sdgId}` };
  }

  const targets: Record<string, { tab: EditorTab; id: string }> = {
    title: { tab: "basic", id: "repository-title" },
    authors: { tab: "basic", id: "repository-author-0" },
    abstract: { tab: "basic", id: "repository-abstract" },
    keywords: { tab: "basic", id: "repository-keywords" },
    publication_year: { tab: "classification", id: "repository-year" },
    category_id: { tab: "classification", id: "repository-category" },
    institute: { tab: "classification", id: "repository-institute" },
    degree_program: { tab: "classification", id: "repository-program" },
    manuscript_date_label: {
      tab: "classification",
      id: "repository-manuscript-date",
    },
    research_stage: { tab: "classification", id: "repository-research-stage" },
    sdg_ids: {
      tab: "sdgs",
      id: `repository-sdg-${sustainableDevelopmentGoals[0].id}`,
    },
  };
  return targets[field] ?? { tab: "basic", id: "repository-title" };
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

function KeywordChips({
  value,
  onChange,
  error,
  disabled,
  entry,
  setEntry,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string[];
  disabled: boolean;
  entry?: string;
  setEntry?: Dispatch<SetStateAction<string>>;
}) {
  const [fallbackEntry, setFallbackEntry] = useState("");
  const entryValue = entry ?? fallbackEntry;
  const updateEntry = setEntry ?? setFallbackEntry;
  const keywords = value
    .split(",")
    .map((keyword) => normalizeAuthorName(keyword))
    .filter(Boolean);
  const commit = () => {
    const keyword = normalizeAuthorName(entryValue);
    if (
      !keyword ||
      keywords.some(
        (item) => item.toLocaleLowerCase() === keyword.toLocaleLowerCase(),
      )
    )
      return;
    onChange([...keywords, keyword].join(", "));
    updateEntry("");
  };
  return (
    <fieldset className="repository-keywords" disabled={disabled}>
      <legend>Keywords</legend>
      <div className="repository-keyword-chips" aria-label="Selected keywords">
        {keywords.map((keyword, index) => (
          <span key={`${keyword}-${index}`}>
            {keyword}
            <button
              type="button"
              aria-label={`Remove keyword ${keyword}`}
              onClick={() =>
                onChange(
                  keywords.filter((_, item) => item !== index).join(", "),
                )
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="repository-keyword-entry">
        <input
          id="repository-keywords"
          value={entryValue}
          maxLength={5000}
          aria-invalid={Boolean(error?.length)}
          aria-describedby="repository-keywords-error"
          onChange={(event) => updateEntry(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
          }}
          placeholder="Add a keyword"
        />
        <button type="button" onClick={commit}>
          Add
        </button>
      </div>
      <small>Press Enter or comma to add a keyword.</small>
      <FieldError id="repository-keywords-error" messages={error} />
    </fieldset>
  );
}

function RepositoryAuthorFields({
  authors,
  onChange,
  disabled,
  errors,
}: {
  authors: OfficeRepositoryAuthorInput[];
  onChange: (authors: OfficeRepositoryAuthorInput[]) => void;
  disabled: boolean;
  errors?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [accounts, setAccounts] = useState<OfficeAuthorAccount[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "empty" | "error" | "ready"
  >("idle");
  const [retryVersion, setRetryVersion] = useState(0);
  const [manualError, setManualError] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const searchGeneration = useRef(0);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addDialogRef = useRef<HTMLDivElement>(null);

  const authorKey = (author: OfficeRepositoryAuthorInput) => {
    const clientKey = (
      author as OfficeRepositoryAuthorInput & {
        client_key?: string;
      }
    ).client_key;
    return author.id !== undefined ? `author-${author.id}` : (clientKey ?? "");
  };

  useEffect(() => {
    if (!adding) return;
    addDialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [adding]);

  useEffect(() => {
    if (openMenu === null) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(".repository-author-menu")) setOpenMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [openMenu]);

  useEffect(() => {
    if (openMenu === null) return;
    const closeOnScroll = () => setOpenMenu(null);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => window.removeEventListener("scroll", closeOnScroll, true);
  }, [openMenu]);

  function closeAddDialog() {
    setAdding(false);
    setOpenMenu(null);
    setAccounts([]);
    setSearchState("idle");
    setQuery("");
    setManualName("");
    setManualError("");
    requestAnimationFrame(() => addTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!adding || query.trim().length < 2) return;
    const controller = new AbortController();
    const generation = ++searchGeneration.current;
    const timeout = window.setTimeout(() => {
      setSearchState("loading");
      void listOfficeAuthorAccounts(query, undefined, controller.signal)
        .then((response) => {
          if (
            controller.signal.aborted ||
            generation !== searchGeneration.current
          )
            return;
          const limited = response
            .filter((account) => account.is_available)
            .slice(0, 10);
          setAccounts(limited);
          setSearchState(limited.length ? "ready" : "empty");
        })
        .catch(() => {
          if (
            controller.signal.aborted ||
            generation !== searchGeneration.current
          )
            return;
          setAccounts([]);
          setSearchState("error");
        });
    }, 325);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [adding, query, retryVersion]);

  function hasDuplicate(candidate: string, userId: string | null) {
    const name = normalizeAuthorName(candidate).toLocaleLowerCase();
    return authors.some(
      (author) =>
        (userId !== null && author.user_id === userId) ||
        normalizeAuthorName(author.author_name).toLocaleLowerCase() === name,
    );
  }

  function addAuthor(author: OfficeRepositoryAuthorInput) {
    if (hasDuplicate(author.author_name, author.user_id)) {
      setManualError("This researcher is already listed.");
      return false;
    }
    onChange([...authors, author]);
    setManualError("");
    return true;
  }

  function selectAccount(account: OfficeAuthorAccount) {
    if (
      addAuthor({
        user_id: account.id,
        author_name: account.name,
        is_corresponding_author: false,
      })
    )
      closeAddDialog();
  }

  function addManualAuthor() {
    const name = normalizeAuthorName(manualName);
    if (!name) {
      setManualError("Enter the researcher’s full name.");
      return;
    }
    if (
      addAuthor({
        user_id: null,
        author_name: name,
        is_corresponding_author: false,
        client_key: `new-${crypto.randomUUID()}`,
      } as OfficeRepositoryAuthorInput)
    )
      closeAddDialog();
  }

  return (
    <fieldset
      id="repository-authors"
      className="repository-authors"
      disabled={disabled}
      aria-describedby={errors?.length ? "repository-authors-error" : undefined}
    >
      <legend className="sr-only">Researchers</legend>
      <div className="repository-authors-header">
        <div>
          <h4>Researchers</h4>
          <p className="repository-authors-hint">
            Researchers are listed in citation order. Adding an account does not
            grant monitoring access or change permissions.
          </p>
        </div>
        <button
          ref={addTriggerRef}
          type="button"
          className="repository-add-researcher"
          aria-haspopup="dialog"
          aria-expanded={adding}
          onClick={() => {
            setOpenMenu(null);
            setAdding(true);
          }}
        >
          <span aria-hidden="true">+</span> Add researcher
        </button>
      </div>
      <ol className="repository-author-list">
        {authors.map((author, index) => {
          const key = authorKey(author);
          const authorLabel = author.author_name || `researcher ${index + 1}`;
          return (
            <li key={key}>
              <span className="repository-author-order" aria-hidden="true">
                {index + 1}
              </span>
              <div className="repository-author-identity">
                <strong>{author.author_name}</strong>
                <span className="repository-author-status">
                  {author.user_id ? "System account" : "Manual entry"}
                </span>
              </div>
              <div className="repository-author-actions">
                <button
                  type="button"
                  className="repository-author-menu-trigger"
                  aria-label={`Researcher actions for ${authorLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === key}
                  onClick={() => {
                    setOpenMenu((current) => (current === key ? null : key));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenMenu(null);
                  }}
                >
                  <MoreHorizontal aria-hidden="true" />
                </button>
                {openMenu === key && (
                  <div
                    className="repository-author-menu"
                    role="menu"
                    aria-label={`Researcher actions for ${authorLabel}`}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      event.stopPropagation();
                      setOpenMenu(null);
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={authors.length === 1}
                      onClick={() => {
                        setPendingRemoval({ key, name: authorLabel });
                        setOpenMenu(null);
                      }}
                    >
                      Remove researcher
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <FieldError id="repository-authors-error" messages={errors} />
      {adding && (
        <div className="repository-author-dialog-backdrop">
          <div
            ref={addDialogRef}
            className="repository-author-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="repository-add-author-title"
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key !== "Escape") return;
              event.preventDefault();
              closeAddDialog();
            }}
          >
            <div className="repository-author-dialog-header">
              <h3 id="repository-add-author-title">Add researcher</h3>
              <button
                type="button"
                aria-label="Close Add researcher"
                onClick={closeAddDialog}
              >
                ×
              </button>
            </div>
            <section>
              <h4>Search system accounts</h4>
              <label>
                Name or email
                <input
                  value={query}
                  maxLength={200}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setAccounts([]);
                    setSearchState("idle");
                    setManualError("");
                  }}
                  placeholder="Search eligible accounts"
                />
              </label>
              {searchState === "idle" && (
                <p>
                  {query.trim().length < 2
                    ? "Enter at least 2 characters to search."
                    : "Waiting to search…"}
                </p>
              )}
              {searchState === "loading" && (
                <p role="status">Searching accounts…</p>
              )}
              {searchState === "empty" && <p>No eligible accounts found.</p>}
              {searchState === "error" && (
                <p role="alert">
                  Account search is unavailable.{" "}
                  <button
                    type="button"
                    onClick={() => setRetryVersion((value) => value + 1)}
                  >
                    Retry
                  </button>
                </p>
              )}
              {searchState === "ready" && (
                <ul className="repository-author-results">
                  {accounts.map((account) => (
                    <li key={account.id}>
                      <button
                        type="button"
                        onClick={() => selectAccount(account)}
                      >
                        <strong>{account.name}</strong>
                        <small>{account.email}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4>Add manually</h4>
              <label>
                Full name
                <input
                  value={manualName}
                  maxLength={255}
                  onChange={(event) => {
                    setManualName(event.target.value);
                    setManualError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addManualAuthor();
                  }}
                />
              </label>
              <button type="button" onClick={addManualAuthor}>
                Add manual researcher
              </button>
            </section>
            {manualError && (
              <p className="manage-repository-field-error" role="alert">
                {manualError}
              </p>
            )}
          </div>
        </div>
      )}
      {pendingRemoval && (
        <div className="repository-author-dialog-backdrop">
          <div
            className="repository-author-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="repository-remove-author-title"
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key !== "Escape") return;
              event.preventDefault();
              setPendingRemoval(null);
            }}
          >
            <h3 id="repository-remove-author-title">Remove researcher?</h3>
            <p>
              Remove {pendingRemoval.name} from this record? The change remains
              pending until you save metadata.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingRemoval(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  onChange(
                    authors.filter(
                      (candidate) =>
                        authorKey(candidate) !== pendingRemoval.key,
                    ),
                  );
                  setPendingRemoval(null);
                }}
              >
                Remove researcher
              </button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
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
  const [keywordEntry, setKeywordEntry] = useState("");
  const [saving, setSaving] = useState(false);
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
    setKeywordEntry("");
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
    setKeywordEntry("");
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

  useEffect(() => {
    if (
      !editing ||
      (!draftIsDirty(draft, selected) && !normalizeAuthorName(keywordEntry))
    )
      return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, editing, keywordEntry, selected]);

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

  async function save(pendingKeyword = "") {
    if (!selected || saving) return;
    const nextDraft = {
      ...draft,
      keywords: appendKeyword(draft.keywords, pendingKeyword) || null,
    };
    if (!editorIsValid(nextDraft)) {
      setDetailError(
        "Add a title and at least one unique researcher with a name of 255 characters or fewer.",
      );
      return;
    }
    if (nextDraft.keywords !== draft.keywords) setDraft(nextDraft);
    const changes = changedDraft(nextDraft, selected);
    if (Object.keys(changes).length === 0) {
      closeDetail();
      return;
    }
    setSaving(true);
    setDetailError("");
    setDetailFieldErrors({});
    try {
      const updated = await updateOfficeRepository(selected.id, {
        ...changes,
        expected_updated_at: selected.updated_at ?? undefined,
      });
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
            dirty={
              editing &&
              (draftIsDirty(draft, selected) ||
                Boolean(normalizeAuthorName(keywordEntry)))
            }
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
                  keywordEntry={keywordEntry}
                  setKeywordEntry={setKeywordEntry}
                  error={detailError}
                  fieldErrors={detailFieldErrors}
                  categories={categories}
                  categoryOptionsError={categoryOptionsError}
                  saving={saving}
                  onEdit={() => {
                    setCategories(null);
                    setCategoryOptionsError("");
                    setDetailFieldErrors({});
                    setEditing(true);
                  }}
                  onCancel={() => {
                    document
                      .querySelector<HTMLButtonElement>(
                        ".manage-repository-modal .dialog-close",
                      )
                      ?.click();
                  }}
                  onSave={(pendingKeyword) => void save(pendingKeyword)}
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
    </div>
  );
}

function RepositoryEditor({
  detail,
  draft,
  setDraft,
  error,
  fieldErrors,
  categories,
  categoryOptionsError,
  saving,
  keywordEntry,
  setKeywordEntry,
  onCancel,
  onSave,
}: {
  detail: OfficeRepositoryDetailResource;
  draft: OfficeRepositoryUpdateInput;
  setDraft: Dispatch<SetStateAction<OfficeRepositoryUpdateInput>>;
  error: string;
  fieldErrors: FieldErrors;
  categories: CategoryResource[] | null;
  categoryOptionsError: string;
  saving: boolean;
  keywordEntry: string;
  setKeywordEntry: Dispatch<SetStateAction<string>>;
  onCancel: () => void;
  onSave: (pendingKeyword?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<EditorTab>("basic");
  const scrollRef = useRef<HTMLFieldSetElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const abstractRef = useRef<HTMLTextAreaElement>(null);
  const selectedInstitute = draft.institute ?? "";
  const programOptions =
    repositoryProgramsByInstitute[
      selectedInstitute as keyof typeof repositoryProgramsByInstitute
    ] ?? [];
  const selectedCategory = categories?.find(
    (category) => category.id === draft.category_id,
  );
  const files = sortedFiles(detail.files);
  const issues = draftIssues(draft);
  const dirty =
    draftIsDirty(draft, detail) || Boolean(normalizeAuthorName(keywordEntry));
  const update = <K extends keyof OfficeRepositoryUpdateInput>(
    key: K,
    value: OfficeRepositoryUpdateInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const activateTab = (tab: EditorTab) => {
    setActiveTab(tab);
    window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, 0);
  };
  const goTo = (tab: EditorTab, target?: string) => {
    activateTab(tab);
    if (target)
      window.setTimeout(() => document.getElementById(target)?.focus(), 0);
  };
  const fieldMessages = (field: string, id: string) => [
    ...(fieldErrors[field] ?? []),
    ...issues.filter((issue) => issue.id === id).map((issue) => issue.message),
  ];
  const allIssues = [
    ...issues,
    ...Object.entries(fieldErrors)
      .filter(([field]) => {
        const root = field.split(".", 1)[0];
        return (
          field.includes(".") ||
          !Object.keys(fieldErrors).some((candidate) =>
            candidate.startsWith(`${root}.`),
          )
        );
      })
      .flatMap(([field, messages]) => {
        const target = editorFieldTarget(field, draft);
        return messages.map((message) => ({ ...target, message }));
      }),
  ];

  useEffect(() => {
    const field =
      Object.keys(fieldErrors).find((candidate) => candidate.includes(".")) ??
      Object.keys(fieldErrors)[0];
    if (!field) return;
    const target = editorFieldTarget(field, draft);
    const timeout = window.setTimeout(() => goTo(target.tab, target.id), 0);
    return () => window.clearTimeout(timeout);
    // Error navigation must not rerun and steal focus after the user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldErrors]);

  useEffect(() => {
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    title.style.height = "auto";
    title.style.height = `${Math.min(title.scrollHeight, 70)}px`;
  }, [draft.title, activeTab]);

  useEffect(() => {
    const abstract = abstractRef.current;
    if (!abstract) return;
    abstract.style.height = "auto";
    abstract.style.height = `${Math.min(Math.max(abstract.scrollHeight, 150), 360)}px`;
  }, [draft.abstract, activeTab]);

  const tabButton = (tab: (typeof editorTabs)[number], index: number) => (
    <button
      key={tab.id}
      id={`repository-editor-tab-${tab.id}`}
      type="button"
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-controls={`repository-editor-panel-${tab.id}`}
      tabIndex={activeTab === tab.id ? 0 : -1}
      className={activeTab === tab.id ? "is-active" : ""}
      disabled={saving}
      onClick={() => {
        if (!saving) activateTab(tab.id);
      }}
      onKeyDown={(event) => {
        if (saving) {
          event.preventDefault();
          return;
        }
        const current = index;
        const next =
          event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (current + 1) % editorTabs.length
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? (current - 1 + editorTabs.length) % editorTabs.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? editorTabs.length - 1
                  : null;
        if (next === null) return;
        event.preventDefault();
        activateTab(editorTabs[next].id);
        document
          .getElementById(`repository-editor-tab-${editorTabs[next].id}`)
          ?.focus();
      }}
    >
      {tab.label}
      {allIssues.some((issue) => issue.tab === tab.id) && " · needs attention"}
    </button>
  );

  const panel = (content: React.ReactNode) => (
    <div
      id={`repository-editor-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`repository-editor-tab-${activeTab}`}
      className="repository-editor-panel"
    >
      {content}
    </div>
  );

  return (
    <div className="manage-repository-detail is-editing">
      <header className="repository-editor-header">
        <p className="eyebrow">EDIT REPOSITORY RECORD</p>
        <h2 title={detail.title}>{detail.title}</h2>
        <p className="repository-editor-facts">
          {detail.authors.length}{" "}
          {detail.authors.length === 1 ? "researcher" : "researchers"}
          <span aria-hidden="true"> · </span>
          {detail.publication_year ?? "Year not specified"}
          <span aria-hidden="true"> · </span>
          {detail.institute ?? "Institute not specified"}
        </p>
      </header>
      {error && (
        <p className="admin-error repository-editor-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="manage-repository-edit"
        onSubmit={(event) => {
          event.preventDefault();
          if (!editorIsValid(draft)) {
            const first = issues[0];
            if (first) goTo(first.tab, first.id);
            return;
          }
          onSave(keywordEntry);
        }}
      >
        <div
          className="repository-editor-tabs"
          role="tablist"
          aria-label="Metadata editor sections"
        >
          {editorTabs.map(tabButton)}
        </div>
        <fieldset
          ref={scrollRef}
          className="repository-editor-scroll"
          disabled={saving}
        >
          {activeTab === "basic" &&
            panel(
              <section
                className="repository-editor-section repository-basic-section"
                aria-labelledby="repository-basic-heading"
              >
                <h3 id="repository-basic-heading">Basic information</h3>
                <p className="repository-editor-copy">
                  Update the record title, researcher attribution, abstract, and
                  keywords.
                </p>
                <label className="repository-basic-field repository-title-field">
                  Title
                  <textarea
                    id="repository-title"
                    ref={titleRef}
                    data-testid="repository-title-field"
                    data-autoresize="true"
                    aria-label="Title"
                    rows={2}
                    value={draft.title ?? ""}
                    maxLength={500}
                    required
                    aria-invalid={
                      fieldMessages("title", "repository-title").length > 0
                    }
                    aria-describedby="repository-title-error"
                    onChange={(event) => update("title", event.target.value)}
                  />
                  <small>{(draft.title ?? "").length} / 500 characters</small>
                  <FieldError
                    id="repository-title-error"
                    messages={fieldMessages("title", "repository-title")}
                  />
                </label>
                <RepositoryAuthorFields
                  authors={draft.authors ?? []}
                  onChange={(authors) => update("authors", authors)}
                  disabled={saving}
                  errors={fieldMessages("authors", "repository-author-0")}
                />
                <label className="repository-basic-field repository-abstract-field">
                  Abstract
                  <textarea
                    id="repository-abstract"
                    ref={abstractRef}
                    data-autoresize="abstract"
                    value={draft.abstract ?? ""}
                    maxLength={50000}
                    rows={5}
                    aria-invalid={
                      fieldMessages("abstract", "repository-abstract").length >
                      0
                    }
                    aria-describedby="repository-abstract-error"
                    onChange={(event) =>
                      update("abstract", event.target.value || null)
                    }
                  />
                  <small>
                    {(draft.abstract ?? "").length.toLocaleString()} / 50,000
                    characters
                  </small>
                  <FieldError
                    id="repository-abstract-error"
                    messages={fieldMessages("abstract", "repository-abstract")}
                  />
                </label>
                <KeywordChips
                  value={draft.keywords ?? ""}
                  onChange={(keywords) => update("keywords", keywords || null)}
                  error={fieldMessages("keywords", "repository-keywords")}
                  disabled={saving}
                  entry={keywordEntry}
                  setEntry={setKeywordEntry}
                />
              </section>,
            )}
          {activeTab === "classification" &&
            panel(
              <section
                className="repository-editor-section"
                aria-labelledby="repository-classification-heading"
              >
                <h3 id="repository-classification-heading">Classification</h3>
                <div className="manage-repository-field-grid repository-classification-grid">
                  <label>
                    Publication year
                    <input
                      id="repository-year"
                      type="number"
                      value={draft.publication_year ?? ""}
                      min={1901}
                      max={2155}
                      step={1}
                      aria-invalid={
                        fieldMessages("publication_year", "repository-year")
                          .length > 0
                      }
                      aria-describedby="repository-year-error"
                      onChange={(event) =>
                        update(
                          "publication_year",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                    <FieldError
                      id="repository-year-error"
                      messages={fieldMessages(
                        "publication_year",
                        "repository-year",
                      )}
                    />
                  </label>
                  <label>
                    Category
                    <select
                      id="repository-category"
                      value={draft.category_id ?? ""}
                      disabled={saving || categories === null}
                      aria-invalid={Boolean(fieldErrors.category_id)}
                      onChange={(event) =>
                        update(
                          "category_id",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
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
                    {categoryOptionsError && (
                      <small>{categoryOptionsError}</small>
                    )}
                    <FieldError messages={fieldErrors.category_id} />
                  </label>
                  <label>
                    Institute
                    <select
                      id="repository-institute"
                      value={selectedInstitute}
                      aria-invalid={Boolean(fieldErrors.institute)}
                      onChange={(event) => {
                        update("institute", event.target.value || null);
                        update("degree_program", null);
                      }}
                    >
                      <option value="">Unclassified</option>
                      {selectedInstitute &&
                        !instituteNames.includes(
                          selectedInstitute as never,
                        ) && (
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
                      id="repository-program"
                      value={draft.degree_program ?? ""}
                      disabled={
                        saving ||
                        !selectedInstitute ||
                        programOptions.length === 0
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
                            {draft.degree_program} (not offered by this
                            institute)
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
                      id="repository-manuscript-date"
                      value={draft.manuscript_date_label ?? ""}
                      maxLength={50}
                      aria-invalid={Boolean(fieldErrors.manuscript_date_label)}
                      onChange={(event) =>
                        update(
                          "manuscript_date_label",
                          event.target.value || null,
                        )
                      }
                    />
                    <FieldError messages={fieldErrors.manuscript_date_label} />
                  </label>
                  <label>
                    Research stage
                    <select
                      id="repository-research-stage"
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
              </section>,
            )}
          {activeTab === "sdgs" &&
            panel(
              <section
                className="repository-editor-section"
                aria-labelledby="repository-sdgs-heading"
              >
                <h3 id="repository-sdgs-heading">
                  Sustainable Development Goals
                </h3>
                <p className="repository-editor-copy">
                  Select every UN Sustainable Development Goal directly
                  supported by this research.
                </p>
                <div
                  id="repository-sdgs"
                  className="repository-sdg-grid"
                  role="group"
                  aria-label="SDG selection"
                  aria-invalid={Boolean(fieldErrors.sdg_ids)}
                >
                  {sustainableDevelopmentGoals.map((sdg) => {
                    const selected = (draft.sdg_ids ?? []).includes(sdg.id);
                    return (
                      <label
                        key={sdg.id}
                        className={selected ? "is-selected" : ""}
                        style={
                          {
                            "--sdg-color": sdg.color_hex,
                          } as React.CSSProperties
                        }
                      >
                        <input
                          id={`repository-sdg-${sdg.id}`}
                          type="checkbox"
                          checked={selected}
                          aria-label={`${sdg.code}: ${sdg.title}`}
                          onChange={(event) =>
                            update(
                              "sdg_ids",
                              event.target.checked
                                ? [...(draft.sdg_ids ?? []), sdg.id].sort(
                                    (a, b) => a - b,
                                  )
                                : (draft.sdg_ids ?? []).filter(
                                    (id) => id !== sdg.id,
                                  ),
                            )
                          }
                        />
                        <SdgIcon id={sdg.id} />
                        <span>
                          {sdg.code}
                          <small>{sdg.short_title}</small>
                        </span>
                        {selected && <Check aria-label="Selected" />}
                      </label>
                    );
                  })}
                </div>
                <FieldError messages={fieldErrors.sdg_ids} />
              </section>,
            )}
          {activeTab === "files" &&
            panel(
              <section
                className="repository-editor-section"
                aria-labelledby="repository-files-heading"
              >
                <h3 id="repository-files-heading">Files and visibility</h3>
                <div className="repository-visibility-card">
                  <Globe2 aria-hidden="true" />
                  <div>
                    <strong>Visibility: {label(detail.visibility)}</strong>
                    <p>
                      Visibility and file access are managed outside this
                      metadata editor. Saving metadata does not change who can
                      access these files.
                    </p>
                  </div>
                </div>
                {files.length === 0 ? (
                  <p className="repository-editor-copy">
                    There are no file metadata entries.
                  </p>
                ) : (
                  <ul className="repository-file-list">
                    {files.map((file) => (
                      <li key={file.id}>
                        <FileText aria-hidden="true" />
                        <span>
                          <strong>{file.original_filename}</strong>
                          <small>
                            {file.document_type} · {file.mime_type} ·{" "}
                            {humanFileSize(file.file_size)} ·{" "}
                            {file.is_current
                              ? "Current version"
                              : `Version ${file.version_number}`}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>,
            )}
          {activeTab === "review" &&
            panel(
              <section
                className="repository-editor-section repository-review"
                aria-labelledby="repository-review-heading"
              >
                <h3 id="repository-review-heading">Review and publish</h3>
                <p className="repository-editor-copy">
                  Review the unsaved draft below. Save metadata updates this
                  record only; it does not publish the record or change file
                  visibility.
                </p>
                <div className="repository-review-groups">
                  <section>
                    <h4>
                      <span>
                        <Pencil aria-hidden="true" /> Basic information
                      </span>
                      <button
                        type="button"
                        onClick={() => goTo("basic", "repository-title")}
                      >
                        Edit
                      </button>
                    </h4>
                    <dl>
                      <div>
                        <dt>Title</dt>
                        <dd>{draft.title || "Missing title"}</dd>
                      </div>
                      <div>
                        <dt>Abstract</dt>
                        <dd>{draft.abstract || "No abstract"}</dd>
                      </div>
                      <div>
                        <dt>Keywords</dt>
                        <dd>{draft.keywords || "No keywords"}</dd>
                      </div>
                    </dl>
                    <ol className="repository-review-researchers">
                      {(draft.authors ?? []).map((author, index) => (
                        <li key={author.id ?? `${author.user_id}-${index}`}>
                          <strong>
                            {index + 1}.{" "}
                            {author.author_name || "Unnamed researcher"}
                          </strong>
                          <small>
                            {author.user_id ? "Linked account" : "Not linked"}
                            {author.is_corresponding_author &&
                              " · Corresponding author"}
                          </small>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section>
                    <h4>
                      <span>
                        <FolderOpen aria-hidden="true" /> Classification
                      </span>
                      <button
                        type="button"
                        onClick={() => goTo("classification")}
                      >
                        Edit
                      </button>
                    </h4>
                    <dl>
                      <div>
                        <dt>Publication year</dt>
                        <dd>{draft.publication_year ?? "Not specified"}</dd>
                      </div>
                      <div>
                        <dt>Category</dt>
                        <dd>
                          {selectedCategory?.name ??
                            detail.category?.name ??
                            "Uncategorized"}
                        </dd>
                      </div>
                      <div>
                        <dt>Institute and degree program</dt>
                        <dd>
                          {draft.institute ?? "No institute"} ·{" "}
                          {draft.degree_program ?? "No degree program"}
                        </dd>
                      </div>
                      <div>
                        <dt>Manuscript date and stage</dt>
                        <dd>
                          {draft.manuscript_date_label ?? "Not specified"} ·{" "}
                          {label(draft.research_stage ?? null)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <section>
                    <h4>
                      <span>
                        <Check aria-hidden="true" /> SDGs
                      </span>
                      <button type="button" onClick={() => goTo("sdgs")}>
                        Edit
                      </button>
                    </h4>
                    {(draft.sdg_ids ?? []).length > 0 && (
                      <div className="repository-review-sdg-chips">
                        {sustainableDevelopmentGoals
                          .filter((sdg) =>
                            (draft.sdg_ids ?? []).includes(sdg.id),
                          )
                          .map((sdg) => (
                            <span key={sdg.id}>{sdg.code}</span>
                          ))}
                      </div>
                    )}
                    {(draft.sdg_ids ?? []).length === 0 && (
                      <p>No SDGs selected</p>
                    )}
                  </section>
                  <section>
                    <h4>
                      <span>
                        <FileText aria-hidden="true" /> Files and visibility
                      </span>
                      <button type="button" onClick={() => goTo("files")}>
                        View
                      </button>
                    </h4>
                    <dl>
                      <div>
                        <dt>Visibility</dt>
                        <dd>{label(detail.visibility)}</dd>
                      </div>
                      <div>
                        <dt>Files</dt>
                        <dd>
                          {files.length
                            ? `${files.length} file${files.length === 1 ? "" : "s"}`
                            : "No files"}
                        </dd>
                      </div>
                    </dl>
                    {files.length > 0 && (
                      <ul className="repository-review-files">
                        {files.map((file) => (
                          <li key={file.id}>
                            {file.original_filename} ·{" "}
                            {humanFileSize(file.file_size)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
                {allIssues.length > 0 ? (
                  <div className="repository-validation-summary" role="alert">
                    <strong>Before you save</strong>
                    <ul>
                      {allIssues.map((issue) => (
                        <li key={`${issue.id}-${issue.message}`}>
                          <button
                            type="button"
                            onClick={() => goTo(issue.tab, issue.id)}
                          >
                            {issue.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="repository-ready" role="status">
                    Ready to save metadata.
                  </p>
                )}
              </section>,
            )}
        </fieldset>
        <footer className="repository-editor-footer">
          <span aria-live="polite" className="repository-editor-dirty">
            {saving
              ? "Saving changes…"
              : dirty
                ? "Unsaved changes"
                : "No unsaved changes"}
          </span>
          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !(dirty || Boolean(normalizeAuthorName(keywordEntry))) ||
                !editorIsValid({
                  ...draft,
                  keywords: appendKeyword(draft.keywords, keywordEntry) || null,
                })
              }
            >
              {saving ? "Saving…" : "Save metadata"}
            </Button>
          </div>
        </footer>
      </form>
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
  keywordEntry,
  setKeywordEntry,
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
  keywordEntry: string;
  setKeywordEntry: Dispatch<SetStateAction<string>>;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (pendingKeyword?: string) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  if (editing) {
    return (
      <RepositoryEditor
        detail={detail}
        draft={draft}
        setDraft={setDraft}
        error={error}
        fieldErrors={fieldErrors}
        categories={categories}
        categoryOptionsError={categoryOptionsError}
        saving={saving}
        keywordEntry={keywordEntry}
        setKeywordEntry={setKeywordEntry}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }
  return (
    <div className="manage-repository-detail">
      <header>
        <p className="eyebrow">
          {detail.submission_reference ?? "Repository record"}
        </p>
        <h2>{detail.title}</h2>
        <p>
          {detail.authors
            .slice()
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
          File names and metadata only. Downloads and storage locations are not
          available here.
        </p>
        {detail.files.length === 0 ? (
          <p>There are no file metadata entries.</p>
        ) : (
          <ul>
            {sortedFiles(detail.files).map((file) => (
              <li key={file.id}>
                <strong>{file.original_filename}</strong> · {file.mime_type} ·{" "}
                {file.file_size.toLocaleString()} bytes
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
            <RotateCcw aria-hidden="true" /> Restore Study
          </Button>
        )}
      </div>
    </div>
  );
}
