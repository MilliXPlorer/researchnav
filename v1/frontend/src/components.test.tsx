import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SimilarityRing, StatusChip } from "./components";

describe("SimilarityRing", () => {
  it.each([
    [39, "low"],
    [40, "moderate"],
    [69, "moderate"],
    [70, "flagged"],
  ])("announces %i percent as %s", (score, band) => {
    render(<SimilarityRing score={score} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      `Similarity: ${score} percent, ${band}`,
    );
    expect(screen.getByText(`${score}%`)).toBeInTheDocument();
  });
});

describe("StatusChip", () => {
  it("shows the full workflow status", () => {
    render(<StatusChip status="Revision Required" />);
    expect(screen.getByText("Revision Required")).toHaveClass(
      "status-revision-required",
    );
  });
});
