import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination, SimilarityBadge, SimilarityRing, StatusChip } from "./components";

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

describe("Pagination", () => {
  it("renders page indicator with current and last page", () => {
    const onPage = vi.fn();
    render(<Pagination page={1} lastPage={5} onPage={onPage} />);
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
  });

  it("wraps content in a nav with pagination label", () => {
    const onPage = vi.fn();
    render(<Pagination page={1} lastPage={3} onPage={onPage} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveClass("admin-pagination");
  });

  it("disables Previous button on the first page", () => {
    const onPage = vi.fn();
    render(<Pagination page={1} lastPage={5} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next button on the last page", () => {
    const onPage = vi.fn();
    render(<Pagination page={5} lastPage={5} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables both buttons on a middle page", () => {
    const onPage = vi.fn();
    render(<Pagination page={3} lastPage={5} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("calls onPage with previous page number when Previous is clicked", () => {
    const onPage = vi.fn();
    render(<Pagination page={3} lastPage={5} onPage={onPage} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("calls onPage with next page number when Next is clicked", () => {
    const onPage = vi.fn();
    render(<Pagination page={3} lastPage={5} onPage={onPage} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenCalledWith(4);
  });
});
