import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("panel dashboard layout CSS", () => {
  it("defines the desktop and responsive grids", () => {
    expect(styles).toMatch(/\.panel-dashboard\s*\{[^}]*display:\s*grid/s);
    expect(styles).toMatch(/\.panel-dashboard-kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/@media \(max-width: 980px\)[\s\S]*?\.panel-dashboard-main-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});
