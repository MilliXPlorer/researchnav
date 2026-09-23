import { describe, expect, it } from "vitest";
import { buildOfficeReportCsv } from "./officeReportExport";
import type { InstitutionalReport } from "./api";

const report: InstitutionalReport = {
  schema_version: 1,
  counts: {
    total_users: 0,
    active_users: 0,
    pending_archiving: 0,
    archived: 0,
    flagged_similarity: 0,
    audit_events: 0,
    evaluations_submitted: 0,
    methodology_signed_off: 0,
  },
  by_institute: [{ institute: 'Institute of "Arts", and Sciences', total: 5 }],
  by_status: [{ status: "under_review", total: 2 }],
  by_sdg: [{ id: 4, code: "SDG 4", title: "Quality Education", color_hex: "#006e52", total: 3 }],
};

describe("buildOfficeReportCsv", () => {
  it("exports only chosen sections and escapes CSV values", () => {
    const csv = buildOfficeReportCsv(report, new Set(["academic_units", "sdgs"]));

    expect(csv).toContain('"By academic unit","Institute of ""Arts"", and Sciences","5"');
    expect(csv).toContain('"By Sustainable Development Goal","SDG 4 - Quality Education","3"');
    expect(csv).not.toContain("under_review");
    expect(csv).not.toContain("Under Review");
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
