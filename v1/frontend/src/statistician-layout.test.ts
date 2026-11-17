import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("statistician dashboard layout CSS", () => {
  it("uses centralized header sizing and workspace scroll offsets", () => {
    expect(styles).toMatch(/--workspace-header-height:\s*64px/);
    expect(styles).toMatch(
      /\.dashboard-shell\s*\{[^}]*padding:\s*var\(--workspace-header-height\)/s,
    );
    expect(styles).toMatch(
      /\.lamp-bar\s*\{[^}]*height:\s*var\(--workspace-header-height\)[^}]*background:\s*var\(--paper\)/s,
    );
    expect(styles).toMatch(
      /\.workspace\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--workspace-header-height\) \+ 16px\)/s,
    );
  });

  it("uses the compact desktop spacing system without forced card height", () => {
    expect(styles).toMatch(
      /\.statistician-dashboard\s*\{[^}]*--dashboard-section-gap:\s*22px[^}]*--dashboard-card-padding:\s*28px[^}]*--dashboard-kpi-gap:\s*18px[^}]*gap:\s*var\(--dashboard-section-gap\)/s,
    );
    expect(styles).toMatch(
      /\.statistician-dashboard-workspace\s*\{[^}]*padding-top:\s*36px/s,
    );
    expect(styles).toMatch(
      /\.statistician-dashboard-workspace > \.workspace-header\s*\{[^}]*margin-bottom:\s*28px/s,
    );
    expect(styles).not.toMatch(/\.dashboard-content-row\s*\{/);
  });

  it("keeps KPI and workload content compact", () => {
    expect(styles).toMatch(
      /\.dashboard-kpi-card\s*\{[^}]*min-height:\s*124px[^}]*padding:\s*20px 22px/s,
    );
    expect(styles).toMatch(
      /\.dashboard-section-card > header\s*\{[^}]*margin-bottom:\s*20px/s,
    );
    expect(styles).toMatch(
      /\.statistician-workload-row\s*\{[^}]*padding-block:\s*14px/s,
    );
    expect(styles).toMatch(
      /\.statistician-workload-summary\s*\{[^}]*margin:\s*16px 0 0[^}]*padding-top:\s*16px/s,
    );
    expect(styles).not.toMatch(
      /\.statistician-workload-summary\s*\{[^}]*margin:\s*auto/s,
    );
    expect(styles).toMatch(
      /\.statistician-donut\s*\{[^}]*width:\s*min\(154px, 100%\)/s,
    );
  });

  it("uses one combined workload card and one combined activity card", () => {
    expect(styles).toMatch(
      /\.statistician-workload-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 7fr\) minmax\(280px, 3fr\)[^}]*overflow:\s*hidden/s,
    );
    expect(styles).toMatch(
      /\.statistician-workload-main,[\s\S]*?padding:\s*26px 28px/,
    );
    expect(styles).toMatch(
      /\.statistician-workload-status\s*\{[^}]*border-left:\s*1px solid var\(--line\)/s,
    );
    expect(styles).toMatch(
      /\.statistician-activity-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 7fr\) minmax\(280px, 3fr\)/s,
    );
    expect(styles).toMatch(
      /\.statistician-recent-activity\s*\{[^}]*border-left:\s*1px solid var\(--line\)/s,
    );
  });

  it("uses two KPI columns on tablet and natural single-column cards when cramped", () => {
    expect(styles).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.statistician-dashboard\s*\{[^}]*--dashboard-section-gap:\s*20px[\s\S]*?\.statistician-kpi-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?\.statistician-workload-card,[\s\S]*?minmax\(0, 3fr\) minmax\(260px, 2fr\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 860px\)[\s\S]*?\.statistician-workload-card,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.statistician-dashboard\s*\{[^}]*--dashboard-section-gap:\s*16px[^}]*--dashboard-card-padding:\s*20px[\s\S]*?\.statistician-kpi-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.statistician-workload-filters\s*\{[^}]*flex-wrap:\s*wrap/,
    );
  });

  it("centers empty activity content inside the compact combined card", () => {
    expect(styles).toMatch(
      /\.statistician-activity-empty\s*\{[^}]*min-height:\s*118px[^}]*place-items:\s*center/s,
    );
    expect(styles).toMatch(
      /\.dashboard-compact-empty\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/s,
    );
    expect(styles).not.toMatch(/\.statistician-activity-card:has/);
  });
});
