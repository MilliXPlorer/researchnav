import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Download,
  FileText,
  Filter,
  LockKeyhole,
} from "lucide-react";
import {
  Button,
  EmptyState,
  Logo,
  SearchBox,
  SimilarityBadge,
  SimilarityRing,
} from "./components";
import {
  repositoryDownloadUrl,
  searchPublicResearch,
  searchPublicResearchBySimilarity,
} from "./api";
import ProfileDialog, { ProfileAvatar } from "./ProfileDialog";
import { instituteNames } from "./data";
import { PublicationYearInput } from "./dateControls";
import { classificationLabel, formatSimilarityPercentage } from "./similarity";
import type { ResearchRecord, UserSession } from "./types";
import { useDialogFocus } from "./useDialogFocus";

type SimilaritySearchResponse =
  | {
      query: string;
      request: number;
      status: "success";
      records: ResearchRecord[];
    }
  | {
      query: string;
      request: number;
      status: "error";
      message: string;
    };

export default function CatalogPage({
  onSignIn,
  session,
  onSessionChange,
  onLogout,
  navigate,
  records,
  loading = false,
  error = null,
  initialSearch,
}: {
  onSignIn: () => void;
  session?: UserSession | null;
  onSessionChange?: (session: UserSession) => void;
  onLogout?: () => Promise<void> | void;
  navigate: (path: string) => void;
  records: ResearchRecord[];
  loading?: boolean;
  error?: string | null;
  initialSearch?: string;
}) {
  const [searchParams, setSearchParams] = useState(
    () =>
      new URLSearchParams(
        initialSearch ??
          (typeof window === "undefined" ? "" : window.location.search),
      ),
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [selectedRecord, setSelectedRecord] = useState<ResearchRecord | null>(
    null,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const exactYear = searchParams.get("year") ?? "";
  const yearFrom = searchParams.get("year_from") ?? exactYear;
  const yearTo = searchParams.get("year_to") ?? exactYear;
  const category = searchParams.get("category") ?? "all";
  const institute = searchParams.get("institute") ?? "all";
  /**
   * Category and year matching run in SQL. `institute` has no server-side
   * filter and stays local.
   */
  const hasServerFilters = Boolean(yearFrom || yearTo) || category !== "all";
  const serverFilterKey = JSON.stringify({ yearFrom, yearTo, category });
  const [serverFiltered, setServerFiltered] = useState<{
    key: string;
    status: "ready" | "error";
    records: ResearchRecord[];
  } | null>(null);
  const serverFilterState =
    serverFiltered?.key === serverFilterKey ? serverFiltered : null;
  // Derived, so the effect never has to write a loading flag.
  const serverFiltersLoading = hasServerFilters && serverFilterState === null;
  const serverFiltersFailed = serverFilterState?.status === "error";

  useEffect(() => {
    if (!hasServerFilters) return;

    let active = true;
    const controller = new AbortController();

    searchPublicResearch(
      {
        category: category === "all" ? undefined : category,
        yearFrom: yearFrom || undefined,
        yearTo: yearTo || undefined,
      },
      globalThis.fetch,
      controller.signal,
    )
      .then((filteredRecords) => {
        if (active)
          setServerFiltered({
            key: serverFilterKey,
            status: "ready",
            records: filteredRecords,
          });
      })
      .catch(() => {
        if (active)
          setServerFiltered({
            key: serverFilterKey,
            status: "error",
            records: [],
          });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [category, hasServerFilters, serverFilterKey, yearFrom, yearTo]);

  const activeQuery = (searchParams.get("q") ?? "").trim();
  const hasActiveSimilarityQuery = activeQuery.length > 0;
  const [similarityRequest, setSimilarityRequest] = useState(0);
  const [similarityResponse, setSimilarityResponse] =
    useState<SimilaritySearchResponse | null>(null);
  const isCurrentSimilarityResponse =
    similarityResponse?.query === activeQuery &&
    similarityResponse.request === similarityRequest;
  const similarityLoading =
    hasActiveSimilarityQuery && !isCurrentSimilarityResponse;
  const similarityRecords =
    isCurrentSimilarityResponse && similarityResponse.status === "success"
      ? similarityResponse.records
      : null;
  const similarityError =
    isCurrentSimilarityResponse && similarityResponse.status === "error"
      ? similarityResponse.message
      : null;

  useEffect(() => {
    if (!hasActiveSimilarityQuery) return;

    let active = true;
    const controller = new AbortController();

    searchPublicResearchBySimilarity(
      activeQuery,
      globalThis.fetch,
      controller.signal,
    )
      .then((rankedRecords) => {
        if (active) {
          setSimilarityResponse({
            query: activeQuery,
            request: similarityRequest,
            status: "success",
            records: rankedRecords,
          });
        }
      })
      .catch(() => {
        if (active) {
          if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
            console.debug("[ResearchNAV][catalog-search] failed", {
              query: activeQuery,
            });
          }
          setSimilarityResponse({
            query: activeQuery,
            request: similarityRequest,
            status: "error",
            message: "Similarity results are unavailable for this search.",
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeQuery, hasActiveSimilarityQuery, similarityRequest]);

  const results = useMemo(() => {
    // Server-side matching decides which records qualify whenever category or
    // year filters are active.
    const allowedIds = hasServerFilters
      ? new Set(serverFilterState?.records.map((record) => record.id))
      : null;

    const base = hasActiveSimilarityQuery
      ? (similarityRecords ?? [])
      : hasServerFilters
        ? (serverFilterState?.records ?? [])
        : records;

    const filtered = base.filter((record) => {
      if (allowedIds && !allowedIds.has(record.id)) return false;
      // `institute` has no server-side filter, so it is always applied locally.
      return institute === "all" || record.institute === institute;
    });

    // Relevance preserves the backend's exact similarity rank. Date options
    // deliberately reorder only the already-qualified similarity results.
    if (hasActiveSimilarityQuery) {
      if (searchParams.get("sort") === "newest")
        return [...filtered].sort((a, b) => b.year - a.year);
      if (searchParams.get("sort") === "oldest")
        return [...filtered].sort((a, b) => a.year - b.year);
      return filtered;
    }
    if (searchParams.get("sort") === "newest")
      return [...filtered].sort((a, b) => b.year - a.year);
    if (searchParams.get("sort") === "oldest")
      return [...filtered].sort((a, b) => a.year - b.year);
    return filtered;
  }, [
    records,
    similarityRecords,
    hasActiveSimilarityQuery,
    hasServerFilters,
    serverFilterState,
    searchParams,
    institute,
  ]);

  const updateParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all" || !value) next.delete(name);
    else next.set(name, value);
    if (name === "year_from" || name === "year_to") next.delete("year");
    setSearchParams(next);
    window.history.replaceState(
      {},
      "",
      `/catalog${next.size ? `?${next.toString()}` : ""}`,
    );
  };

  const submitSearch = () => {
    const submittedQuery = query.trim();
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      console.debug("[ResearchNAV][catalog-search] submitted", {
        query: submittedQuery,
        yearFrom: yearFrom || null,
        yearTo: yearTo || null,
        category: category === "all" ? null : category,
        institute: institute === "all" ? null : institute,
      });
    }
    setSimilarityResponse(null);
    if (submittedQuery) setSimilarityRequest((request) => request + 1);
    updateParam("q", submittedQuery);
  };

  return (
    <div className="catalog-page">
      <header className="catalog-header">
        <button className="back-link" onClick={() => navigate("/")}>
          <ArrowLeft /> Back
        </button>
        <Logo />
        {session ? (
          <button
            className="public-profile-trigger catalog-profile-trigger"
            onClick={() => setProfileOpen(true)}
            aria-label={`Open profile for ${session.displayName}`}
          >
            <ProfileAvatar session={session} />
            <span>
              <strong>{session.displayName}</strong>
              <small>{session.email}</small>
            </span>
          </button>
        ) : (
          <Button variant="secondary" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </header>
      <main className="catalog-main">
        <div className="catalog-title-row">
          <div>
            <p className="eyebrow">Public research catalog</p>
            <h1>Explore the archive</h1>
            <p>
              Search complete metadata and abstract previews from Tangub City
              Global College.
            </p>
          </div>
          <span className="catalog-seal">
            <FileText /> Open metadata
          </span>
        </div>
        <SearchBox value={query} onChange={setQuery} onSubmit={submitSearch} />
        <div className="catalog-toolbar">
          <div className="filter-label">
            <Filter /> Refine results
          </div>
          <label className="catalog-year-filter">
            From year
            <PublicationYearInput
              aria-label="Filter from publication year"
              value={yearFrom}
              max={yearTo || undefined}
              placeholder="From"
              onChange={(event) => updateParam("year_from", event.target.value)}
            />
          </label>
          <label className="catalog-year-filter">
            To year
            <PublicationYearInput
              aria-label="Filter to publication year"
              value={yearTo}
              min={yearFrom || undefined}
              placeholder="To"
              onChange={(event) => updateParam("year_to", event.target.value)}
            />
          </label>
          <label>
            Category<span className="sr-only">Filter by category</span>
            <select
              value={category}
              onChange={(event) => updateParam("category", event.target.value)}
            >
              <option value="all">All categories</option>
              {[...new Set(records.map((record) => record.category))].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Institute<span className="sr-only">Filter by institute</span>
            <select
              value={institute}
              onChange={(event) => updateParam("institute", event.target.value)}
            >
              <option value="all">All institutes</option>
              {instituteNames.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <aside className="aside-note catalog-search-tip">
          <strong>Search tip</strong>
          <p>
            Use quotation marks around a phrase to find closely matching
            research titles.
          </p>
        </aside>
        <div className="results-summary">
          <p>
            <strong>
              {similarityLoading || serverFiltersLoading ? "…" : results.length}
            </strong>{" "}
            {results.length === 1 ? "study" : "studies"} found
          </p>
          <label className="sort-control">
            <ArrowUpDown aria-hidden="true" />
            <span className="sr-only">Sort studies</span>
            <select
              value={searchParams.get("sort") ?? "relevance"}
              onChange={(event) => updateParam("sort", event.target.value)}
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <div className={`catalog-layout${session ? " is-authenticated" : ""}`}>
          <section className="result-list" aria-label="Research results">
            {hasActiveSimilarityQuery && similarityLoading ? (
              <EmptyState
                title="Calculating similarity results"
                message="Ranking public research studies for your submitted search…"
              />
            ) : hasActiveSimilarityQuery && similarityError ? (
              <div role="alert">
                <EmptyState
                  title="Similarity search unavailable"
                  message={similarityError}
                />
              </div>
            ) : serverFiltersLoading ? (
              <EmptyState
                title="Applying filters"
                message="Matching authors, keywords, categories, and years in the repository…"
              />
            ) : serverFiltersFailed ? (
              <div role="alert">
                <EmptyState
                  title="Filtered search unavailable"
                  message="The repository could not apply these filters. Adjust or clear them and try again."
                />
              </div>
            ) : loading ? (
              <EmptyState
                title="Loading public catalog"
                message="Retrieving cataloged public metadata…"
              />
            ) : error ? (
              <EmptyState title="Public catalog unavailable" message={error} />
            ) : !hasActiveSimilarityQuery && records.length === 0 ? (
              <EmptyState
                title="No public catalog records are available"
                message="The repository did not return any public records."
              />
            ) : results.length === 0 ? (
              hasActiveSimilarityQuery ? (
                <EmptyState
                  title="No studies share terms with this search"
                  message="Nothing in the catalog matched these words. Try different or broader keywords."
                />
              ) : (
                <EmptyState
                  title="No studies match these filters"
                  message="Try a broader keyword or clear one of your filters."
                />
              )
            ) : (
              results.map((record) => (
                <article className="result-card" key={record.id}>
                  <div className="result-accession">
                    <span>{record.id}</span>
                    <span>{record.category}</span>
                  </div>
                  <h2>{record.title}</h2>
                  <p className="result-authors">
                    {record.authors} · {record.year} · {record.program}
                  </p>
                  <p className="result-abstract">{record.abstract}</p>
                  {hasActiveSimilarityQuery ? (
                    <OverallSimilarityScore record={record} />
                  ) : (
                    <p className="result-similarity-score is-unavailable">
                      <span>Similarity</span>
                      <strong>Search to calculate</strong>
                    </p>
                  )}
                  <div className="keyword-list">
                    {record.keywords.map((keyword) => (
                      <span key={keyword}>{keyword}</span>
                    ))}
                  </div>
                  <div className="result-actions">
                    <button onClick={() => setSelectedRecord(record)}>
                      View full metadata <ArrowRight />
                    </button>
                    {session ? (
                      record.hasDownloadableManuscript ? (
                        <a
                          className="download-gate"
                          href={repositoryDownloadUrl(record.id)}
                        >
                          <Download /> Download manuscript
                        </a>
                      ) : (
                        <span className="download-gate is-unavailable">
                          <FileText /> Final manuscript unavailable
                        </span>
                      )
                    ) : (
                      <button className="download-gate" onClick={onSignIn}>
                        <LockKeyhole /> Sign in to download
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>
          {!session && (
            <aside className="catalog-aside">
              <div className="aside-card">
                <Download />
                <h3>Need the full manuscript?</h3>
                <p>
                  Downloads are available to verified students, faculty, and
                  research personnel.
                </p>
                <Button variant="secondary" onClick={onSignIn}>
                  Continue with Google
                </Button>
              </div>
            </aside>
          )}
        </div>
      </main>
      {selectedRecord && (
        <MetadataDialog
          record={selectedRecord}
          hasActiveSimilarityQuery={hasActiveSimilarityQuery}
          onClose={() => setSelectedRecord(null)}
          onSignIn={onSignIn}
          authenticated={Boolean(session)}
        />
      )}
      {session && profileOpen && onSessionChange && (
        <ProfileDialog
          session={session}
          onSessionChange={onSessionChange}
          onClose={() => setProfileOpen(false)}
          onOpenWorkspace={() => navigate("/app")}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}

function MetadataDialog({
  record,
  hasActiveSimilarityQuery,
  onClose,
  onSignIn,
  authenticated,
}: {
  record: ResearchRecord;
  hasActiveSimilarityQuery: boolean;
  onClose: () => void;
  onSignIn: () => void;
  authenticated: boolean;
}) {
  const [dialogRef, handleDialogKeyDown] = useDialogFocus<HTMLElement>(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="metadata-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-title"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="metadata-close"
          onClick={onClose}
          aria-label="Close metadata"
        >
          ×
        </button>
        <p className="eyebrow">Public record · {record.id}</p>
        <h2 id="metadata-title">{record.title}</h2>
        <p className="metadata-authors">{record.authors}</p>
        <dl className="metadata-grid">
          <div>
            <dt>Year</dt>
            <dd>{record.year}</dd>
          </div>
          <div>
            <dt>Program</dt>
            <dd>{record.degreeProgram}</dd>
          </div>
          <div>
            <dt>Institution</dt>
            <dd>
              {record.institutionName}
              {record.institutionLocation
                ? ` · ${record.institutionLocation}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>Academic unit</dt>
            <dd>{record.academicUnit}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{record.category}</dd>
          </div>
          {hasActiveSimilarityQuery ? (
            <SimilarityBreakdown record={record} />
          ) : (
            <div>
              <dt>Similarity score</dt>
              <dd className="metadata-similarity-score is-unavailable">
                Search to calculate
              </dd>
            </div>
          )}
          {record.manuscriptDate && (
            <div>
              <dt>Final binding date</dt>
              <dd>{record.manuscriptDate}</dd>
            </div>
          )}
          {hasActiveSimilarityQuery && <SimilarityOverview record={record} />}
        </dl>
        <div className="metadata-abstract">
          <h3>Abstract</h3>
          <p>{record.abstract}</p>
        </div>
        <div className="keyword-list">
          {record.keywords.map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
        <div className="metadata-actions">
          <Button variant="secondary" onClick={onClose}>
            Return to results
          </Button>
          {authenticated && record.hasDownloadableManuscript ? (
            <a
              className="button button-primary"
              href={repositoryDownloadUrl(record.id)}
            >
              <Download /> Download manuscript
            </a>
          ) : authenticated ? (
            <span className="download-gate is-unavailable">
              <FileText /> Final manuscript unavailable
            </span>
          ) : (
            <Button onClick={onSignIn}>
              <LockKeyhole /> Sign in to download
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function SimilarityBreakdown({ record }: { record: ResearchRecord }) {
  const details = [
    [
      "Classification",
      classificationLabel(record.classification) ??
        "Classification unavailable",
    ],
  ];

  if (record.adviserReviewRequired) {
    details.push(["Review status", "Adviser review required"]);
  }
  if (record.titleMatchAlert) {
    details.push(["Title safeguard", "Near-exact title match alert"]);
  }

  return details.map(([label, value]) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd className="metadata-similarity-score">{value}</dd>
    </div>
  ));
}

function SimilarityOverview({ record }: { record: ResearchRecord }) {
  const title = formatSimilarityPercentage(record.titleSimilarityPercentage);
  const content = formatSimilarityPercentage(
    record.contentSimilarityPercentage,
  );
  const overall = formatSimilarityPercentage(
    record.overallSimilarityPercentage,
  );
  const contentUnavailable =
    record.scoreStatus === "content_unavailable" || !content;
  const scores = [
    ["Overall", overall, record.classification, "Overall similarity"],
    ["Title", title, null, "Title similarity"],
    [
      "Content",
      contentUnavailable ? null : content,
      null,
      "Content similarity",
    ],
  ] as const;

  return (
    <div className="metadata-similarity-overview">
      <dt>Similarity overview</dt>
      <dd className="metadata-similarity-rings">
        {scores.map(([label, value, classification, accessibleLabel]) => (
          <figure key={label}>
            {value ? (
              <SimilarityRing
                percentage={value}
                classification={classification}
                label={accessibleLabel}
                size="large"
              />
            ) : (
              <span className="metadata-score-unavailable">Unavailable</span>
            )}
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </dd>
    </div>
  );
}

function OverallSimilarityScore({ record }: { record: ResearchRecord }) {
  const value = formatSimilarityPercentage(record.overallSimilarityPercentage);
  const classification = classificationLabel(record.classification);

  return (
    <p className={`result-similarity-score${value ? "" : " is-unavailable"}`}>
      <span>Overall Similarity</span>
      <strong>{value ?? "Overall similarity unavailable"}</strong>
      {record.classification && (
        <SimilarityBadge classification={record.classification} />
      )}
      {record.adviserReviewRequired && (
        <span className="similarity-alert">Adviser review required</span>
      )}
      {record.titleMatchAlert && (
        <span className="similarity-alert">Near-exact title match alert</span>
      )}
      {!classification && <span>Classification unavailable</span>}
    </p>
  );
}
