import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import {
  classificationLabel,
  type SimilarityClassification,
} from "./similarity";
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

/** API-provided classification, always rendered as text as well as color. */
export function SimilarityBadge({
  classification,
}: {
  classification: SimilarityClassification;
}) {
  const label = classificationLabel(classification);
  return (
    <span className={`similarity-band similarity-band-${classification}`}>
      Classification: {label}
    </span>
  );
}

/** Explains the service-provided categories without duplicating policy thresholds. */
export function SimilarityLegend() {
  return (
    <ul className="similarity-legend" aria-label="Similarity score bands">
      <li>
        <span className="similarity-legend-dot similarity-band-low" />
        Low classification
      </li>
      <li>
        <span className="similarity-legend-dot similarity-band-moderate" />
        Moderate classification
      </li>
      <li>
        <span className="similarity-legend-dot similarity-band-high" />
        High classification · review status is provided by the service
      </li>
    </ul>
  );
}

export function SimilarityRing({
  percentage,
  classification,
  size = "regular",
  label = "Similarity",
}: {
  percentage: string;
  classification?: SimilarityClassification | null;
  size?: "small" | "regular" | "large";
  label?: string;
}) {
  const colors: Record<SimilarityClassification, string> = {
    low: "var(--fern)",
    moderate: "var(--amber)",
    high: "var(--rust)",
  };
  const style = {
    "--score": percentage.replace("%", ""),
    "--ring-color": classification ? colors[classification] : "var(--moss)",
  } as CSSProperties;
  const classificationName = classificationLabel(classification);

  return (
    <div
      className={`similarity-ring ring-${size}${classification ? ` similarity-ring-${classification}` : " similarity-ring-neutral"}`}
      style={style}
      role="img"
      aria-label={`${label}: ${percentage}${classificationName ? `, classification ${classificationName}` : ""}`}
    >
      <span>{percentage}</span>
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
