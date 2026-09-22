import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Search, X } from "lucide-react";
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

export function ToastNotification({
  message,
  type = "success",
  duration = 3000,
  onDismiss,
}: {
  message: string;
  type?: "success" | "error";
  duration?: number;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (duration <= 0) return;
    const timeoutId = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, message]);

  return (
    <div
      className={`toast toast-notification${type === "error" ? " is-error" : ""}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <span className="toast-status-icon" aria-hidden="true">
        {type === "error" ? <CircleAlert /> : <CircleCheck />}
      </span>
      <p>{message}</p>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X />
      </button>
    </div>
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

export type SortDirection = "asc" | "desc";

/** A table header that keeps sorting controls inside the existing header styling. */
export function SortableHeader({
  sortKey,
  activeSort,
  direction = "asc",
  onSort,
  children,
  label,
}: {
  sortKey: string;
  activeSort: string | null;
  direction?: SortDirection;
  onSort: (sortKey: string) => void;
  children: ReactNode;
  label?: string;
}) {
  const active = activeSort === sortKey;
  const indicator = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  const accessibleLabel =
    label ?? (typeof children === "string" ? children : sortKey);

  return (
    <th
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        className="sortable-header-button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${accessibleLabel}`}
      >
        {children} <span aria-hidden="true">{indicator}</span>
      </button>
    </th>
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

export function Pagination({
  meta,
  onPage,
  noun = "records",
}: {
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
  onPage: (page: number) => void;
  noun?: string;
}) {
  const { current_page: page, last_page: lastPage } = meta;
  const pages = paginationItems(page, lastPage);

  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <span className="pagination-summary">
        Showing {(meta.from ?? 0).toLocaleString()}–
        {(meta.to ?? 0).toLocaleString()} of {meta.total.toLocaleString()}{" "}
        {noun}
      </span>
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
        aria-label="Previous"
      >
        ← Previous
      </Button>
      <span className="pagination-pages">
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="pagination-ellipsis"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? "primary" : "secondary"}
              className="pagination-page"
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
      </span>
      <Button
        variant="secondary"
        disabled={page >= lastPage}
        onClick={() => onPage(Math.min(lastPage, page + 1))}
        aria-label="Next"
      >
        Next →
      </Button>
    </nav>
  );
}

function paginationItems(page: number, lastPage: number) {
  if (lastPage <= 7) {
    return Array.from({ length: lastPage }, (_, index) => index + 1);
  }

  const visible = new Set([1, lastPage, page - 1, page, page + 1]);
  if (page <= 2) visible.add(2);
  if (page >= lastPage - 1) visible.add(lastPage - 1);

  const pageNumbers = [...visible]
    .filter((item) => item >= 1 && item <= lastPage)
    .sort((first, second) => first - second);
  const items: Array<number | "ellipsis"> = [];

  pageNumbers.forEach((item, index) => {
    if (index > 0 && item - pageNumbers[index - 1] > 1) {
      items.push("ellipsis");
    }
    items.push(item);
  });

  return items;
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
