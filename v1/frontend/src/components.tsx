import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { similarityBand, SIMILARITY_FLAG_THRESHOLD } from "./similarity";
import type { Status } from "./types";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo" aria-label="ResearchNAV">
      <span className="logo-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && (
        <span className="logo-type">
          Research<span>NAV</span>
        </span>
      )}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "rust";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`status-chip status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}

/**
 * The single similarity banding rule for the whole product.
 * Mirrors the documented thresholds: 0–39 low, 40–69 moderate, 70–100 high/flagged.
 */
/** Text band label, always paired with a numeric score so color is never the only signal. */
export function SimilarityBadge({ score }: { score: number }) {
  const band = similarityBand(score);
  return (
    <span className={`similarity-band similarity-band-${band.tone}`}>
      {band.label}
    </span>
  );
}

/** Explains the 70% review threshold wherever similarity is shown. */
export function SimilarityLegend() {
  return (
    <ul className="similarity-legend" aria-label="Similarity score bands">
      <li>
        <span className="similarity-legend-dot similarity-band-low" />
        Low 0–39%
      </li>
      <li>
        <span className="similarity-legend-dot similarity-band-moderate" />
        Moderate 40–69%
      </li>
      <li>
        <span className="similarity-legend-dot similarity-band-high" />
        High 70–100% · flagged for adviser review
      </li>
    </ul>
  );
}

export function SimilarityRing({
  score,
  size = "regular",
}: {
  score: number;
  size?: "small" | "regular" | "large";
}) {
  const band = similarityBand(score);
  const announced = band.name === "High" ? "flagged" : band.name.toLowerCase();
  const style = {
    "--score": score,
    "--ring-color": band.color,
  } as CSSProperties;

  return (
    <div
      className={`similarity-ring ring-${size} ${
        score >= SIMILARITY_FLAG_THRESHOLD ? "ring-high" : ""
      }`}
      style={style}
      role="img"
      aria-label={`Similarity: ${score} percent, ${announced}`}
    >
      <span>{score}%</span>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="empty-state">
      <Search aria-hidden="true" />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Search titles, authors, or keywords",
  label = "Search the repository",
  large = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  label?: string;
  large?: boolean;
}) {
  return (
    <form
      className={`search-box ${large ? "search-box-large" : ""}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Search aria-hidden="true" />
      <label
        className="sr-only"
        htmlFor={large ? "hero-search" : "catalog-search"}
      >
        {label}
      </label>
      <input
        id={large ? "hero-search" : "catalog-search"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X />
        </button>
      )}
      <Button type="submit">
        Search <ArrowRight aria-hidden="true" />
      </Button>
    </form>
  );
}
