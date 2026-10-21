import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfficeRepositoryItemResource } from "./api";
import ManageRepository from "./ManageRepository";

afterEach(() => {
  vi.unstubAllGlobals();
});

const item: OfficeRepositoryItemResource = {
  id: 7,
  submission_reference: "RN-2026-007",
  title: "Coastal resilience study",
  publication_year: 2026,
  institute: "Institute of Computer Studies",
  research_stage: "ongoing",
  submission_status: "approved",
  archive_status: "not_archived",
  visibility: "private",
  author_names: ["Ada Researcher"],
  updated_at: "2026-10-01T08:00:00Z",
  deleted_at: null,
  can_edit: true,
  can_delete: true,
  can_restore: false,
};

const detail = {
  ...item,
  category_id: null,
  category: null,
  abstract: "A safe abstract.",
  keywords: null,
  degree_program: null,
  manuscript_date_label: null,
  sdgs: [],
  authors: [{ id: 1, author_name: "Ada Researcher", author_order: 1 }],
  submitted_at: null,
  approved_at: null,
  archived_at: null,
  files: [],
};

function page(rows: OfficeRepositoryItemResource[] = [item]) {
  return {
    data: rows,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: rows.length ? 1 : null,
      last_page: 1,
      links: [],
      path: "/api/office/repository",
      per_page: 10,
      to: rows.length || null,
      total: rows.length,
    },
    summary: { all: 12, ongoing: 8, archived: 3, recycle: 1 },
  };
}

function installFetch() {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (init?.method === "PATCH") {
        const changes = JSON.parse(String(init.body)) as {
          title?: string;
          authors?: string[];
        };
        return new Response(
          JSON.stringify({
            data: {
              ...detail,
              title: changes.title ?? detail.title,
              authors: (changes.authors ?? detail.author_names).map(
                (author_name, index) => ({
                  id: index + 1,
                  author_name,
                  author_order: index + 1,
                }),
              ),
            },
          }),
        );
      }
      if (path === "/api/office/repository/7")
        return new Response(JSON.stringify({ data: detail }));
      if (path.includes("bucket=recycle")) {
        return new Response(
          JSON.stringify(
            page([
              {
                ...item,
                archive_status: "archived",
                deleted_at: "2026-10-02T08:00:00Z",
                can_edit: false,
                can_delete: false,
                can_restore: true,
              },
            ]),
          ),
        );
      }
      return new Response(JSON.stringify(page()));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ManageRepository", () => {
  it("renders the specified all-studies workspace, global counts, and 10-row query", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository contextLabel="System Administrator" />);

    expect(await screen.findByText(item.title)).toBeInTheDocument();
    expect(
      screen.getByText("Manage studies and archived manuscripts."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add study/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All Studies",
      "Ongoing",
      "Archived",
      "Recycle Bin",
    ]);
    expect(screen.queryByText("Import manuscripts")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply filters|reset filters/i }),
    ).not.toBeInTheDocument();
    const summary = within(screen.getByLabelText("Repository summary"));
    expect(summary.getByRole("button", { name: /ongoing/i })).toHaveTextContent(
      "8",
    );
    expect(
      summary.getByRole("button", { name: /archived/i }),
    ).toHaveTextContent("3");
    expect(
      summary.getByRole("button", { name: /recycle bin/i }),
    ).toHaveTextContent("1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("bucket=all");
    expect(String(fetchMock.mock.calls[0][0])).toContain("per_page=10");
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map(({ textContent }) => textContent),
    ).toEqual([
      "Study Title ↕",
      "Researchers / Institute",
      "Year ↕",
      "Status ↕",
      "Actions",
    ]);
  });

  it("changes buckets, preserves the global summary, and describes recycle records", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
        "bucket=archived",
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Recycle Bin" }));
    expect(await screen.findByText("Previous: Archived")).toBeInTheDocument();
    expect(screen.getByText(/Deleted /)).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Repository summary")).getByRole("button", {
        name: /recycle bin/i,
      }),
    ).toHaveTextContent("1");
  });

  it("debounces search but applies institute selection immediately", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "coastal" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain("search=coastal");

    fireEvent.change(screen.getByLabelText("Institute"), {
      target: { value: "Institute of Computer Studies" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "institute=Institute+of+Computer+Studies",
    );
  });

  it("opens the existing bulk importer in a modal and reloads studies when closed", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.click(screen.getByRole("button", { name: /add study/i }));
    expect(
      await screen.findByRole("heading", { name: "Upload Manuscript" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Add study" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("uses compact icon actions for detail, edit, and recycle", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    expect(
      screen.getByRole("button", { name: `View ${item.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Edit ${item.title}` }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Move ${item.title} to Recycle Bin`,
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Move to Recycle Bin" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      ),
    ).toHaveLength(0);
  });

  it("opens only the restore confirmation from the recycle action", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("tab", { name: "Recycle Bin" }));

    const restore = await screen.findByRole("button", {
      name: `Restore ${item.title}`,
    });
    fireEvent.click(restore);

    expect(
      await screen.findByRole("dialog", { name: "Restore repository record" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Repository record details" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close Restore repository record" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes the metadata dialog after a successful save", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const title = within(dialog).getByLabelText("Title");
    const researchers = within(dialog).getByLabelText("Researchers");
    fireEvent.change(title, { target: { value: "Updated study title" } });
    fireEvent.change(researchers, {
      target: { value: "Updated Researcher\nSecond Researcher" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Repository record details" }),
      ).not.toBeInTheDocument(),
    );
  });
});
