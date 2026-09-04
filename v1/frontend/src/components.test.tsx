import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SimilarityBadge, SimilarityRing, StatusChip } from "./components";

describe("SimilarityRing", () => {
  it.each(["low", "moderate", "high"] as const)(
    "announces the API-provided %s classification",
    (classification) => {
      render(
        <SimilarityRing percentage="25.17%" classification={classification} />,
      );
      expect(screen.getByRole("img")).toHaveAccessibleName(
        `Similarity: 25.17%, classification ${classification.toUpperCase()}`,
      );
      expect(screen.getByText("25.17%")).toBeInTheDocument();
    },
  );

  it("renders classification as accessible text rather than color alone", () => {
    render(<SimilarityBadge classification="high" />);
    expect(screen.getByText("Classification: HIGH")).toBeInTheDocument();
  });

  it("supports a labeled neutral ring when no classification applies", () => {
    render(<SimilarityRing percentage="61.93%" label="Content similarity" />);

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Content similarity: 61.93%",
    );
    expect(screen.getByRole("img")).toHaveClass("similarity-ring-neutral");
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
