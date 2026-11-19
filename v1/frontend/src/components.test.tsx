import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Pagination,
  SimilarityBadge,
  SimilarityRing,
  SortableHeader,
  StatusChip,
  ToastNotification,
} from "./components";
import { sortRows } from "./useClientSorting";

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

describe("ToastNotification", () => {
  it("renders the requested status and supports manual dismissal", () => {
    const onDismiss = vi.fn();
    render(
      <ToastNotification
        message="Section updated."
        type="success"
        duration={0}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Section updated.");
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("automatically dismisses after the configured duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    try {
      render(
        <ToastNotification
          message="Section updated."
          duration={1000}
          onDismiss={onDismiss}
        />,
      );
      act(() => vi.advanceTimersByTime(1000));
      expect(onDismiss).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SortableHeader", () => {
  it("announces and renders the current sort direction without browser button styling", () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableHeader sortKey="email" activeSort={null} onSort={onSort}>
              Email
            </SortableHeader>
          </tr>
        </thead>
      </table>,
    );

    expect(
      screen.getByRole("columnheader", { name: /email/i }),
    ).toHaveAttribute("aria-sort", "none");
    expect(screen.getByText("↕")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Email" })).toHaveClass(
      "sortable-header-button",
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort by Email" }));
    expect(onSort).toHaveBeenCalledWith("email");

    rerender(
      <table>
        <thead>
          <tr>
            <SortableHeader
              sortKey="email"
              activeSort="email"
              direction="desc"
              onSort={onSort}
            >
              Email
            </SortableHeader>
          </tr>
        </thead>
      </table>,
    );
    expect(
      screen.getByRole("columnheader", { name: /email/i }),
    ).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByText("↓")).toBeInTheDocument();
  });
});

describe("sortRows", () => {
  it("sorts a copied array by raw values with a stable original-index fallback", () => {
    const rows = [
      { name: "same", timestamp: 20, active: true },
      { name: "same", timestamp: 10, active: false },
      { name: "later", timestamp: 30, active: true },
    ];

    expect(sortRows(rows, (row) => row.name, "asc")).toEqual([
      rows[2],
      rows[0],
      rows[1],
    ]);
    expect(sortRows(rows, (row) => row.timestamp, "asc")).toEqual([
      rows[1],
      rows[0],
      rows[2],
    ]);
    expect(sortRows(rows, (row) => row.active, "asc")).toEqual([
      rows[1],
      rows[0],
      rows[2],
    ]);
    expect(rows.map((row) => row.timestamp)).toEqual([20, 10, 30]);
  });

  it("keeps null values last in both directions", () => {
    const rows = [
      { name: null },
      { name: "Bravo" },
      { name: "Alpha" },
      { name: undefined },
    ];

    expect(sortRows(rows, (row) => row.name, "asc")).toEqual([
      rows[2],
      rows[1],
      rows[0],
      rows[3],
    ]);
    expect(sortRows(rows, (row) => row.name, "desc")).toEqual([
      rows[1],
      rows[2],
      rows[0],
      rows[3],
    ]);
  });
});

describe("Pagination", () => {
  const meta = (currentPage: number, lastPage: number, total = 187) => ({
    current_page: currentPage,
    from: total === 0 ? null : (currentPage - 1) * 20 + 1,
    last_page: lastPage,
    per_page: 20,
    to: total === 0 ? null : Math.min(currentPage * 20, total),
    total,
  });

  it("renders the first page with a compact numbered range", () => {
    render(<Pagination meta={meta(1, 501, 10001)} onPage={vi.fn()} />);

    expect(
      screen.getByText("Showing 1–20 of 10,001 records"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Page 2" })).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Page 501" }),
    ).toBeInTheDocument();
  });

  it("preserves the existing pagination container class", () => {
    render(<Pagination meta={meta(1, 3)} onPage={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveClass(
      "admin-pagination",
    );
  });

  it("disables Previous on the first page", () => {
    render(<Pagination meta={meta(1, 5)} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("renders a middle page with both ellipses and adjacent pages", () => {
    render(<Pagination meta={meta(250, 501, 10001)} onPage={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Page 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Page 249" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 250" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Page 251" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Page 501" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("renders the last page with a context-specific noun", () => {
    render(<Pagination meta={meta(10, 10)} onPage={vi.fn()} noun="users" />);

    expect(
      screen.getByText("Showing 181–187 of 187 users"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 10" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("navigates directly to a numbered page", () => {
    const onPage = vi.fn();
    render(<Pagination meta={meta(3, 10)} onPage={onPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Page 4" }));
    expect(onPage).toHaveBeenCalledWith(4);
  });

  it("navigates to the previous and next pages", () => {
    const onPage = vi.fn();
    render(<Pagination meta={meta(3, 5)} onPage={onPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenNthCalledWith(1, 2);
    expect(onPage).toHaveBeenNthCalledWith(2, 4);
  });
});
