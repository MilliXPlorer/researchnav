import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Search, X } from "lucide-react";
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

export function SimilarityRing({
  score,
  size = "regular",
}: {
  score: number;
  size?: "small" | "regular" | "large";
}) {
  const band = score < 40 ? "Low" : score < 70 ? "Moderate" : "Flagged";
  const color =
    score < 40 ? "var(--fern)" : score < 70 ? "var(--moss)" : "var(--amber)";
  const style = { "--score": score, "--ring-color": color } as CSSProperties;

  return (
    <div
      className={`similarity-ring ring-${size} ${score >= 70 ? "ring-high" : ""}`}
      style={style}
      role="img"
      aria-label={`Similarity: ${score} percent, ${band.toLowerCase()}`}
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
