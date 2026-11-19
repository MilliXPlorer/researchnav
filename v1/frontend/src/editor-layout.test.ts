import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("editor dashboard layout CSS", () => {
  it("uses four compact shared KPI cards", () => {
    expect(styles).toMatch(
      /\.editor-dashboard-kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s,
    );
    expect(styles).toMatch(
      /\.editor-dashboard \.dashboard-kpi-card\s*\{[^}]*min-height:\s*108px[^}]*padding:\s*16px 18px/s,
    );
  });

  it("uses the approved workload and quick-action split", () => {
    expect(styles).toMatch(
      /\.editor-dashboard-overview-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 2fr\) minmax\(260px, 1fr\)/s,
    );
  });

  it("stacks the summary cards on small screens", () => {
    expect(styles).toMatch(
      /@media \(max-width: 640px\)\s*\{[^}]*\.editor-dashboard\s*\{[^}]*\}[\s\S]*?\.editor-dashboard-kpi-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});
