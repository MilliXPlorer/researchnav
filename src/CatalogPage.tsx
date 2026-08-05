import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Filter,
  LockKeyhole,
  SlidersHorizontal,
} from "lucide-react";
import { Button, EmptyState, Logo, SearchBox } from "./components";
import { researchRecords } from "./data";
import type { ResearchRecord } from "./types";
import { useDialogFocus } from "./useDialogFocus";

export default function CatalogPage({
  onSignIn,
  navigate,
}: {
  onSignIn: () => void;
  navigate: (path: string) => void;
}) {
  const [searchParams, setSearchParams] = useState(
    () => new URLSearchParams(window.location.search),
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [selectedRecord, setSelectedRecord] = useState<ResearchRecord | null>(
    null,
  );
  const year = searchParams.get("year") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const institute = searchParams.get("institute") ?? "all";

  const results = useMemo(() => {
    const needle = (searchParams.get("q") ?? "")
      .replaceAll('"', "")
      .trim()
      .toLowerCase();
    const filtered = researchRecords.filter((record) => {
      const matchesQuery =
        !needle ||
        [record.title, record.authors, record.abstract, ...record.keywords]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return (
        matchesQuery &&
        (year === "all" || String(record.year) === year) &&
        (category === "all" || record.category === category) &&
        (institute === "all" || record.institute === institute)
      );
    });
    if (searchParams.get("sort") === "newest")
      return [...filtered].sort((a, b) => b.year - a.year);
    if (searchParams.get("sort") === "oldest")
      return [...filtered].sort((a, b) => a.year - b.year);
    return filtered;
  }, [searchParams, year, category, institute]);

  const updateParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(name);
    else next.set(name, value);
    setSearchParams(next);
    window.history.replaceState(
      {},
      "",
      `/catalog${next.size ? `?${next.toString()}` : ""}`,
    );
  };

  const submitSearch = () => updateParam("q", query);

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
              {[2025, 2024, 2023, 2022].map((value) => (
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
              {[
                ...new Set(researchRecords.map((record) => record.category)),
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Institute<span className="sr-only">Filter by institute</span>
            <select
              value={institute}
              onChange={(event) => updateParam("institute", event.target.value)}
            >
              <option value="all">All institutes</option>
              {[
                ...new Set(researchRecords.map((record) => record.institute)),
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="results-summary">
          <p>
            <strong>{results.length}</strong>{" "}
            {results.length === 1 ? "study" : "studies"} found
          </p>
          <label className="sort-control">
            <SlidersHorizontal />
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
        <div className="catalog-layout">
          <section className="result-list" aria-label="Research results">
            {results.length === 0 ? (
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
          onClose={() => setSelectedRecord(null)}
          onSignIn={onSignIn}
        />
      )}
    </div>
  );
}

function MetadataDialog({
  record,
  onClose,
  onSignIn,
}: {
  record: ResearchRecord;
  onClose: () => void;
  onSignIn: () => void;
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
            <dd>{record.program}</dd>
          </div>
          <div>
            <dt>Institute</dt>
            <dd>{record.institute}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{record.category}</dd>
          </div>
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
