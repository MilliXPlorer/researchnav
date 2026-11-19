import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("librarian dashboard layout CSS", () => {
  it("uses compact KPI and combined desktop cards", () => {
    expect(styles).toMatch(/\.librarian-dashboard\s*\{[^}]*gap:\s*22px/s);
    expect(styles).toMatch(
      /\.librarian-dashboard-workspace\s*\{[^}]*padding-top:\s*36px/s,
    );
    expect(styles).toMatch(
      /\.librarian-kpi-grid\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)[^}]*gap:\s*18px/s,
    );
    expect(styles).toMatch(
      /\.librarian-kpi-grid \.dashboard-kpi-card\s*\{[^}]*min-height:\s*116px[^}]*padding:\s*18px 20px[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*15px/s,
    );
    expect(styles).toMatch(
      /\.librarian-kpi-grid \.dashboard-kpi-icon\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(styles).toMatch(
      /\.librarian-kpi-grid \.dashboard-kpi-card h2\s*\{[^}]*font-size:\s*15px/s,
    );
    expect(styles).toMatch(
      /\.librarian-kpi-grid \.dashboard-kpi-card strong\s*\{[^}]*font-size:\s*28px/s,
    );
    expect(styles).toMatch(
      /\.librarian-kpi-grid \.dashboard-kpi-card p\s*\{[^}]*font-size:\s*12px/s,
    );
    expect(styles).toMatch(
      /\.librarian-queue-card,[\s\S]*?grid-template-columns:\s*minmax\(0, 7fr\) minmax\(280px, 3fr\)/,
    );
    expect(styles).toMatch(
      /\.librarian-queue-summary,[\s\S]*?border-left:\s*1px solid var\(--line\)/,
    );
  });

  it("keeps the queue status donut compact", () => {
    expect(styles).toMatch(
      /\.librarian-donut\s*\{[^}]*width:\s*min\(154px, 100%\)/s,
    );
    expect(styles).toMatch(/\.librarian-donut::before\s*\{[^}]*width:\s*76%/s);
    expect(styles).toMatch(
      /\.librarian-recent-activity-card\s*\{[^}]*padding:\s*24px 28px/s,
    );
  });

  it("uses a responsive read-only repository list surface", () => {
    expect(styles).toMatch(
      /\.librarian-repository-filters\s*\{[^}]*grid-template-columns:\s*minmax\(240px, 1\.5fr\) minmax\(180px, 0\.75fr\)/s,
    );
    expect(styles).toMatch(
      /\.librarian-repository-table-wrap\s*\{[^}]*overflow-x:\s*auto/s,
    );
  });

  it("uses tablet and mobile stacking without page overflow", () => {
    expect(styles).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.librarian-kpi-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 860px\)[\s\S]*?\.librarian-queue-card,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 860px\)[\s\S]*?\.librarian-queue-summary,[\s\S]*?border-top:\s*1px solid var\(--line\)[^}]*border-left:\s*0/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.librarian-kpi-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it("preserves centralized fixed-header offsets", () => {
    expect(styles).toMatch(/--workspace-header-height:\s*64px/);
    expect(styles).toMatch(
      /\.workspace\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--workspace-header-height\) \+ 16px\)/s,
    );
  });
});
