import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronDown,
  FileText,
  GraduationCap,
  LockKeyhole,
  Search,
} from "lucide-react";
import { Button, Logo, SearchBox } from "./components";
import ProfileDialog, { ProfileAvatar } from "./ProfileDialog";
import { instituteNames, roleConfigs } from "./data";
import type { ResearchRecord, UserSession } from "./types";

export default function LandingPage({
  onSignIn,
  session,
  onSessionChange,
  onLogout,
  navigate,
  records,
  loading = false,
  error = null,
}: {
  onSignIn: () => void;
  session: UserSession | null | undefined;
  onSessionChange: (session: UserSession) => void;
  onLogout: () => Promise<void> | void;
  navigate: (path: string) => void;
  records: ResearchRecord[];
  loading?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const recent = records.slice(0, 3);
  const programCount = new Set(
    records
      .map((record) => record.degreeProgram.trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const earliestYear = records.length
    ? Math.min(...records.map((record) => record.year))
    : null;

  const search = () => navigate(`/catalog?q=${encodeURIComponent(query)}`);

  return (
    <div className="public-page">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="public-header">
        <Logo />
        <nav aria-label="Public navigation">
          <a href="#archive">Browse archive</a>
          {session?.accessStatus === "active" && (
            <a
              className="workspace-nav-link"
              href="/app"
              onClick={(event) => {
                event.preventDefault();
                navigate("/app");
              }}
            >
              Workspace
            </a>
          )}
          {session === undefined ? (
            <span className="public-profile-placeholder" aria-hidden="true" />
          ) : session ? (
            <button
              className="public-profile-trigger"
              onClick={() => setProfileOpen(true)}
              aria-label={`Open profile for ${session.displayName}`}
            >
              <ProfileAvatar session={session} />
              <span>
                <strong>{session.displayName}</strong>
                <small>
                  {roleConfigs.find((config) => config.id === session.role)
                    ?.shortLabel ?? session.role}
                </small>
              </span>
            </button>
          ) : (
            <button className="signin-link" onClick={onSignIn}>
              Sign in
            </button>
          )}
        </nav>
      </header>

      <main id="main-content">
        <section className={`hero${session ? " hero-authenticated" : ""}`}>
          <div className="hero-architecture" aria-hidden="true">
            <span className="arch arch-one" />
            <span className="arch arch-two" />
            <span className="arch arch-three" />
          </div>
          <div className="hero-content">
            <p className="hero-kicker">
              <Building2 /> Tangub City Global College
            </p>
            <h1>
              Find the study.
              <br />
              <em>Follow the idea.</em>
            </h1>
            <p className="hero-copy">
              A living catalog of undergraduate research, built to help every
              new inquiry begin with what is already known.
            </p>
            <SearchBox
              value={query}
              onChange={setQuery}
              onSubmit={search}
              large
            />
            <div className="hero-filters" aria-label="Search filters">
              <label>
                <span className="sr-only">Browse by year</span>
                <select
                  defaultValue=""
                  onChange={(event) =>
                    event.target.value &&
                    navigate(
                      `/catalog?year_from=${event.target.value}&year_to=${event.target.value}`,
                    )
                  }
                >
                  <option value="">All years</option>
                  {[...new Set(records.map((record) => record.year))]
                    .sort((a, b) => b - a)
                    .map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                </select>
                <ChevronDown />
              </label>
              <label>
                <span className="sr-only">Browse by category</span>
                <select
                  defaultValue=""
                  onChange={(event) =>
                    event.target.value &&
                    navigate(
                      `/catalog?category=${encodeURIComponent(event.target.value)}`,
                    )
                  }
                >
                  <option value="">All categories</option>
                  {[...new Set(records.map((record) => record.category))].map(
                    (category) => (
                      <option key={category}>{category}</option>
                    ),
                  )}
                </select>
                <ChevronDown />
              </label>
              <label>
                <span className="sr-only">Browse by institute</span>
                <select
                  defaultValue=""
                  onChange={(event) =>
                    event.target.value &&
                    navigate(
                      `/catalog?institute=${encodeURIComponent(event.target.value)}`,
                    )
                  }
                >
                  <option value="">All institutes</option>
                  {instituteNames.map((institute) => (
                    <option key={institute}>{institute}</option>
                  ))}
                </select>
                <ChevronDown />
              </label>
            </div>
            {session === null && (
              <div className="hero-access">
                <span>or continue to your workspace</span>
                <Button variant="secondary" onClick={onSignIn}>
                  <span className="google-mark">G</span> Continue with Google
                </Button>
              </div>
            )}
          </div>
          <div className="hero-index" aria-label="Repository statistics">
            <div>
              <strong>{records.length}</strong>
              <span>public studies</span>
            </div>
            <div>
              <strong>{programCount}</strong>
              <span>
                academic {programCount === 1 ? "program" : "programs"}
                {" represented"}
              </span>
            </div>
            <div>
              <strong>{earliestYear ?? "—"}</strong>
              <span>earliest catalog year</span>
            </div>
          </div>
        </section>

        <section className="archive-section" id="archive">
          <SectionIntro />
          <div className="archive-grid">
            {loading ? (
              <p className="empty-state">Loading public catalog…</p>
            ) : error ? (
              <p className="empty-state" role="alert">
                {error}
              </p>
            ) : recent.length === 0 ? (
              <p className="empty-state">
                No public catalog records are available.
              </p>
            ) : (
              recent.map((record, index) => (
                <article className="archive-card" key={record.id}>
                  <div className="archive-card-top">
                    <span className="accession">0{index + 1}</span>
                    <span className="archive-type">
                      <FileText /> Public record
                    </span>
                  </div>
                  <h3>{record.title}</h3>
                  <p>{record.abstract}</p>
                  <div className="archive-meta">
                    <span>{record.authors}</span>
                    <span>
                      {record.year} · {record.program}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      navigate(`/catalog?q=${encodeURIComponent(record.title)}`)
                    }
                  >
                    View metadata <ArrowRight />
                  </button>
                </article>
              ))
            )}
          </div>
          <div className="archive-footer">
            <p>
              <BookOpen /> Browse open abstracts and metadata without an
              account.
            </p>
            <Button variant="secondary" onClick={() => navigate("/catalog")}>
              Explore the full catalog <ArrowRight />
            </Button>
          </div>
        </section>

        <section className="trust-section" id="about">
          <div>
            <p className="eyebrow">Built for responsible discovery</p>
            <h2>A trusted shelf for every scholarly milestone.</h2>
          </div>
          <div className="trust-points">
            <article>
              <Search />
              <strong>Discover</strong>
              <p>
                Search across titles, authors, years, categories, and
                institutes.
              </p>
            </article>
            <article>
              <GraduationCap />
              <strong>Review</strong>
              <p>
                Keep catalog context and research stages visible in one place.
              </p>
            </article>
            <article>
              <LockKeyhole />
              <strong>Preserve</strong>
              <p>
                Protect institutional knowledge with clear catalog and privacy
                controls.
              </p>
            </article>
          </div>
        </section>
      </main>
      {session && profileOpen && (
        <ProfileDialog
          session={session}
          onSessionChange={onSessionChange}
          onClose={() => setProfileOpen(false)}
          onOpenWorkspace={() => {
            setProfileOpen(false);
            navigate("/app");
          }}
          onLogout={onLogout}
        />
      )}

      <footer className="public-footer">
        <Logo />
        <p id="privacy">
          Tangub City Global College · Institute of Computer Studies
          <br />
          Public records provide cataloged public metadata and abstract
          previews. Manuscript access and personal information remain protected
          by institutional privacy controls and the Data Privacy Act of 2012.
        </p>
        <nav aria-label="Footer navigation">
          <a href="#about">About</a>
          <a href="mailto:research@tcgc.edu.ph">Contact</a>
          <a href="#privacy">Data privacy</a>
        </nav>
        <span>© 2026 ResearchNAV</span>
      </footer>
    </div>
  );
}

function SectionIntro() {
  return (
    <div className="archive-heading">
      <div>
        <p className="eyebrow">New on the shelf</p>
        <h2>Public catalog records</h2>
      </div>
      <p>
        Selected additions from across the college, cataloged and ready to
        inspire the next inquiry.
      </p>
    </div>
  );
}
