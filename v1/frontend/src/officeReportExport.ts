import type { InstitutionalReport } from "./api";

export const officeReportOptions = [
  { key: "academic_units", label: "By academic unit" },
  { key: "submission_status", label: "By submission status" },
  { key: "sdgs", label: "By Sustainable Development Goal" },
] as const;

export type OfficeReportSection = (typeof officeReportOptions)[number]["key"];

export function buildOfficeReportCsv(
  report: InstitutionalReport,
  selected: ReadonlySet<OfficeReportSection>,
): string {
  const rows: Array<[string, string, string]> = [["Report", "Category", "Records"]];

  if (selected.has("academic_units")) {
    if (report.by_institute.length === 0) {
      rows.push(["By academic unit", "No records", "0"]);
    }
    report.by_institute.forEach((unit) =>
      rows.push(["By academic unit", unit.institute, String(unit.total)]),
    );
  }
  if (selected.has("submission_status")) {
    if (report.by_status.length === 0) {
      rows.push(["By submission status", "No records", "0"]);
    }
    report.by_status.forEach((row) =>
      rows.push([
        "By submission status",
        row.status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        String(row.total),
      ]),
    );
  }
  if (selected.has("sdgs")) {
    if ((report.by_sdg ?? []).length === 0) {
      rows.push(["By Sustainable Development Goal", "No records", "0"]);
    }
    (report.by_sdg ?? []).forEach((row) =>
      rows.push(["By Sustainable Development Goal", `${row.code} - ${row.title}`, String(row.total)]),
    );
  }

  return `\uFEFF${rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\r\n")}\r\n`;
}
