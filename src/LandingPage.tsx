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
import { researchRecords } from "./data";

export default function LandingPage({
  onSignIn,
  navigate,
}: {
  onSignIn: () => void;
  navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const recent = researchRecords
    .filter((record) => record.status === "Archived")
    .slice(0, 3);

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
          <button className="signin-link" onClick={onSignIn}>
            Sign in
          </button>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero">
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
                    navigate(`/catalog?year=${event.target.value}`)
                  }
                >
                  <option value="">All years</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="2023">2023</option>
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
                  <option>Web-based Systems</option>
                  <option>Information Systems</option>
                  <option>Artificial Intelligence</option>
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
                  <option>Institute of Computer Studies</option>
                  <option>Institute of Arts and Sciences</option>
                  <option>Institute of Teacher Education</option>
                </select>
                <ChevronDown />
              </label>
            </div>
            <div className="hero-access">
              <span>or continue to your workspace</span>
              <Button variant="secondary" onClick={onSignIn}>
                <span className="google-mark">G</span> Continue with Google
              </Button>
            </div>
          </div>
          <div className="hero-index" aria-label="Repository statistics">
            <div>
              <strong>526</strong>
              <span>archived studies</span>
            </div>
            <div>
              <strong>09</strong>
              <span>academic programs</span>
            </div>
            <div>
              <strong>2018</strong>
              <span>cataloging since</span>
            </div>
          </div>
        </section>

        <section className="archive-section" id="archive">
          <SectionIntro />
          <div className="archive-grid">
            {recent.map((record, index) => (
              <article className="archive-card" key={record.id}>
                <div className="archive-card-top">
                  <span className="accession">0{index + 1}</span>
                  <span className="archive-type">
                    <FileText /> Archived study
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
            ))}
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
                Keep feedback, similarity context, and approvals in one trail.
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

      <footer className="public-footer">
        <Logo />
        <p id="privacy">
          Tangub City Global College · Institute of Computer Studies
          <br />
          Prototype records contain no personal data. Live access will follow
          the Data Privacy Act of 2012.
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
        <h2>Recently archived</h2>
      </div>
      <p>
        Selected additions from across the college, cataloged and ready to
        inspire the next inquiry.
      </p>
    </div>
  );
}
