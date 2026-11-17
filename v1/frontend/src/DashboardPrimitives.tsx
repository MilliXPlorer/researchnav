import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function DashboardKpiCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  description: string;
}) {
  return (
    <article className="dashboard-kpi-card">
      <span className="dashboard-kpi-icon" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <h2>{label}</h2>
        <strong>{value}</strong>
        <p>{description}</p>
      </div>
    </article>
  );
}

export function DashboardSectionCard({
  title,
  subtitle,
  actions,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`dashboard-section-card ${className}`.trim()}>
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function DashboardEmptyState({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`dashboard-compact-empty ${className}`.trim()}>{children}</p>
  );
}
