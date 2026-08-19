import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Filter,
  LockKeyhole,
  SlidersHorizontal,
} from "lucide-react";
import {
  Button,
  EmptyState,
  Logo,
  SearchBox,
  SimilarityBadge,
  SimilarityLegend,
  SimilarityRing,
} from "./components";
import { searchPublicResearch, searchPublicResearchBySimilarity } from "./api";
import { similarityBandPercentage } from "./similarity";
import type { ResearchRecord } from "./types";
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
  navigate,
  records,
  loading = false,
  error = null,
  initialSearch,
}: {
  onSignIn: () => void;
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
  const year = searchParams.get("year") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const institute = searchParams.get("institute") ?? "all";
  const author = (searchParams.get("author") ?? "").trim();
  const keywords = (searchParams.get("keywords") ?? "").trim();
  const [authorDraft, setAuthorDraft] = useState(author);
  const [keywordsDraft, setKeywordsDraft] = useState(keywords);
  /**
   * Author, keyword, category, and year matching all run in SQL. Only these
   * filters reach Laravel; `institute` has no server-side filter and stays local.
   */
  const hasServerFilters =
    author !== "" || keywords !== "" || year !== "all" || category !== "all";
  const serverFilterKey = JSON.stringify({ author, keywords, year, category });
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
        author: author || undefined,
        keywords: keywords || undefined,
        category: category === "all" ? undefined : category,
        year: year === "all" ? undefined : year,
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
  }, [author, category, hasServerFilters, keywords, serverFilterKey, year]);

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
    // Server-side matching decides which records qualify whenever author,
    // keyword, category, or year filters are active.
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

    // Similarity endpoint response order is the backend's exact rank order.
    if (hasActiveSimilarityQuery) return filtered;
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
    if (value === "all" || (name === "q" && !value)) next.delete(name);
    else next.set(name, value);
    setSearchParams(next);
    window.history.replaceState(
      {},
      "",
      `/catalog${next.size ? `?${next.toString()}` : ""}`,
    );
  };

  /** Applies several metadata filters at once so one Apply is one update. */
  const updateParams = (values: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [name, value] of Object.entries(values)) {
      if (!value || value === "all") next.delete(name);
      else next.set(name, value);
    }
    setSearchParams(next);
    window.history.replaceState(
      {},
      "",
      `/catalog${next.size ? `?${next.toString()}` : ""}`,
    );
  };

  const submitSearch = () => {
    setSimilarityResponse(null);
    if (query.trim()) setSimilarityRequest((request) => request + 1);
    updateParam("q", query.trim());
  };

  return (
    <div className="catalog-page">
      <header className="catalog-header">
        <button className="back-link" onClick={() => navigate("/")}>
          <ArrowLeft /> Back
        </button>
        <Logo />
        <Button variant="secondary" onClick={onSignIn}>
          Sign in
        </Button>
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
          <label>
            Year<span className="sr-only">Filter by year</span>
            <select
              value={year}
              onChange={(event) => updateParam("year", event.target.value)}
            >
              <option value="all">All years</option>
              {[...new Set(records.map((record) => record.year))]
                .sort((a, b) => b - a)
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
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
              {[...new Set(records.map((record) => record.institute))].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <form
            className="catalog-metadata-filters"
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({
                author: authorDraft.trim(),
                keywords: keywordsDraft.trim(),
              });
            }}
          >
            <label>
              Author
              <input
                type="search"
                value={authorDraft}
                placeholder="Surname"
                onChange={(event) => setAuthorDraft(event.target.value)}
              />
            </label>
            <label>
              Keyword
              <input
                type="search"
                value={keywordsDraft}
                placeholder="e.g. inventory"
                onChange={(event) => setKeywordsDraft(event.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        </div>
        <div className="results-summary">
          <p>
            <strong>
              {similarityLoading || serverFiltersLoading ? "…" : results.length}
            </strong>{" "}
            {results.length === 1 ? "study" : "studies"} found
            {author && (
              <span className="filter-note"> · author “{author}”</span>
            )}
            {keywords && (
              <span className="filter-note"> · keyword “{keywords}”</span>
            )}
          </p>
          <label className="sort-control">
            <SlidersHorizontal />
            <span className="sr-only">Sort studies</span>
            <select
              value={
                hasActiveSimilarityQuery
                  ? "relevance"
                  : (searchParams.get("sort") ?? "relevance")
              }
              onChange={(event) => updateParam("sort", event.target.value)}
              disabled={hasActiveSimilarityQuery}
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        {hasActiveSimilarityQuery &&
          !similarityLoading &&
          !similarityError &&
          results.length > 0 && <SimilarityLegend />}
        <div className="catalog-layout">
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
              <EmptyState
                title="No studies match these filters"
                message="Try a broader keyword or clear one of your filters."
              />
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
                  <p
                    className={`result-similarity-score${
                      hasActiveSimilarityQuery &&
                      formatSimilarityPercentage(record.querySimilarityScore)
                        ? ""
                        : " is-unavailable"
                    }`}
                  >
                    <span>Similarity</span>
                    <strong>
                      {hasActiveSimilarityQuery
                        ? (formatSimilarityPercentage(
                            record.querySimilarityScore,
                          ) ?? "Similarity unavailable")
                        : "Search to calculate"}
                    </strong>
                    {hasActiveSimilarityQuery &&
                      (() => {
                        const band = similarityBandPercentage(
                          record.querySimilarityScore,
                        );
                        return band === null ? null : (
                          <SimilarityBadge score={band} />
                        );
                      })()}
                  </p>
                  <div className="keyword-list">
                    {record.keywords.map((keyword) => (
                      <span key={keyword}>{keyword}</span>
                    ))}
                  </div>
                  <div className="result-actions">
                    <button onClick={() => setSelectedRecord(record)}>
                      View full metadata <ArrowRight />
                    </button>
                    <button className="download-gate" onClick={onSignIn}>
                      <LockKeyhole /> Sign in to download
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
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
            <div className="aside-note">
              <strong>Search tip</strong>
              <p>
                Use quotation marks around a phrase to find closely matching
                research titles.
              </p>
            </div>
          </aside>
        </div>
      </main>
      {selectedRecord && (
        <MetadataDialog
          record={selectedRecord}
          hasActiveSimilarityQuery={hasActiveSimilarityQuery}
          onClose={() => setSelectedRecord(null)}
          onSignIn={onSignIn}
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
}: {
  record: ResearchRecord;
  hasActiveSimilarityQuery: boolean;
  onClose: () => void;
  onSignIn: () => void;
}) {
  const [dialogRef, handleDialogKeyDown] = useDialogFocus<HTMLElement>(onClose);
  const similarityScore = hasActiveSimilarityQuery
    ? formatSimilarityPercentage(record.querySimilarityScore)
    : null;
  const similarityBand = hasActiveSimilarityQuery
    ? similarityBandPercentage(record.querySimilarityScore)
    : null;
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
          <div>
            <dt>Similarity score</dt>
            <dd
              className={`metadata-similarity-score${
                similarityScore ? "" : " is-unavailable"
              }`}
            >
              {similarityScore ??
                (hasActiveSimilarityQuery
                  ? "Similarity unavailable"
                  : "Search to calculate")}
            </dd>
          </div>
          {similarityBand !== null && (
            <div>
              <dt>Similarity band</dt>
              <dd className="metadata-similarity-band">
                <SimilarityRing score={similarityBand} size="small" />
                <SimilarityBadge score={similarityBand} />
              </dd>
            </div>
          )}
          {record.manuscriptDate && (
            <div>
              <dt>Final binding date</dt>
              <dd>{record.manuscriptDate}</dd>
            </div>
          )}
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
          <Button onClick={onSignIn}>
            <LockKeyhole /> Sign in to download
          </Button>
        </div>
      </section>
    </div>
  );
}

function formatSimilarityPercentage(
  normalizedScore: ResearchRecord["querySimilarityScore"],
): string | null {
  if (
    normalizedScore === null ||
    normalizedScore === undefined ||
    (typeof normalizedScore === "string" && normalizedScore.trim() === "")
  ) {
    return null;
  }

  const score = Number(normalizedScore);
  if (!Number.isFinite(score) || score < 0 || score > 1) return null;

  return `${(score * 100).toFixed(4)}%`;
}

/**
 * Whole-number band percentage for the ring/badge. The exact score stays visible
 * separately, so no displayed value is ever rounded away or fabricated.
 */
