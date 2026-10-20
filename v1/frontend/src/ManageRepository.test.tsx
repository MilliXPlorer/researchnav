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

afterEach(() => vi.unstubAllGlobals());

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

const detailItem = { ...item };
Reflect.deleteProperty(detailItem, "author_names");
const detail = {
  ...detailItem,
  category_id: 3,
  category: { id: 3, name: "Computing" },
  abstract: "A safe abstract.",
  keywords: "coastal, resilience",
  degree_program: "Bachelor of Science in Computer Science",
  manuscript_date_label: "October 2026",
  sdgs: [],
  authors: [{ id: 2, author_name: "Ada Researcher", author_order: 1 }],
  submitted_at: null,
  approved_at: null,
  archived_at: null,
  files: [
    {
      id: 8,
      document_type: "final_manuscript",
      upload_purpose: "final_revision",
      version_number: 1,
      file_order: 1,
      original_filename: "coastal-study.pdf",
      file_extension: "pdf",
      mime_type: "application/pdf",
      file_size: 400,
      is_current: true,
      uploaded_at: null,
    },
  ],
};

function page(
  rows: OfficeRepositoryItemResource[] = [item],
  currentPage = 1,
  lastPage = 1,
) {
  return {
    data: rows,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: currentPage,
      from: rows.length ? 1 : null,
      last_page: lastPage,
      links: [],
      path: "/api/office/repository",
      per_page: 25,
      to: rows.length || null,
      total: rows.length,
    },
  };
}

function installRepositoryFetch() {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (path === "/api/office/repository/7") {
        return new Response(JSON.stringify({ data: detail }));
      }
      return new Response(JSON.stringify(page()));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ManageRepository", () => {
  it("uses the same workspace labels for Admin and Research Office", async () => {
    installRepositoryFetch();
    const { rerender } = render(
      <ManageRepository contextLabel="System Administrator" />,
    );
    expect(screen.getByText("System Administrator")).toBeInTheDocument();
    expect(await screen.findByText(item.title)).toBeInTheDocument();
    rerender(<ManageRepository contextLabel="Research Office" />);
    expect(screen.getByText("Research Office")).toBeInTheDocument();
  });

  it("opens safe details, requires a confirmation, and refetches after a recycle move", async () => {
    const fetchMock = installRepositoryFetch();
    render(<ManageRepository />);
    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    expect(await screen.findByText("A safe abstract.")).toBeInTheDocument();
    expect(screen.getByText("coastal-study.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/permanent delete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/similarity/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Move to Recycle Bin" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      ),
    ).toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Move to Recycle Bin" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move to Recycle Bin" })[1],
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Moved Coastal resilience study to the Recycle Bin/),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      ),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) =>
          String(path).startsWith("/api/office/repository?"),
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it("keeps the Import manuscripts view embedded and switches buckets through office queries", async () => {
    const fetchMock = installRepositoryFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("bucket=archived"),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Import manuscripts" }));
    expect(
      await screen.findByRole("heading", { name: "Upload Manuscript" }),
    ).toBeInTheDocument();
  });

  it("reloads page one exactly once after deleting the final record from a later page", async () => {
    let deleted = false;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (init?.method === "DELETE") {
          deleted = true;
          return new Response(null, { status: 204 });
        }
        if (path === "/api/office/repository/7") {
          return new Response(JSON.stringify({ data: detail }));
        }
        const currentPage =
          new URL(path, "http://localhost").searchParams.get("page") === "2"
            ? 2
            : 1;
        return new Response(
          JSON.stringify(page(deleted ? [] : [item], currentPage, 2)),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: `View ${item.title}` }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Move to Recycle Bin" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move to Recycle Bin" })[1],
    );

    await screen.findByText(
      /Moved Coastal resilience study to the Recycle Bin/,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) =>
          String(path).startsWith("/api/office/repository?"),
        ),
      ).toHaveLength(3),
    );
    const repositoryQueries = fetchMock.mock.calls.filter(([path]) =>
      String(path).startsWith("/api/office/repository?"),
    );
    expect(String(repositoryQueries[2][0])).toContain("page=1");
  });

  it("uses submitted filters only, trims them, and resets them to page one", async () => {
    const fetchMock = installRepositoryFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: " coastal " },
    });
    fireEvent.change(screen.getByLabelText("Institute"), {
      target: { value: "Institute of Computer Studies" },
    });
    fireEvent.change(screen.getByLabelText("Publication year"), {
      target: { value: "2026" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "search=coastal&institute=Institute+of+Computer+Studies&publication_year=2026",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=1");

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(screen.getByLabelText("Institute")).toHaveValue("");
    expect(screen.getByLabelText("Publication year")).toHaveValue(null);
    expect(String(fetchMock.mock.calls[2][0])).not.toContain("search=");
    expect(String(fetchMock.mock.calls[2][0])).not.toContain("institute=");
  });

  it("limits filters to valid institute and year values and shows rejected filter errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("publication_year=2026")) {
        return new Response(
          JSON.stringify({
            error: "VALIDATION_FAILED",
            errors: {
              institute: ["Select a valid institute."],
              publication_year: ["The publication year is not available."],
            },
          }),
          { status: 422 },
        );
      }
      return new Response(JSON.stringify(page()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);
    await screen.findByText(item.title);

    const institute = screen.getByLabelText("Institute");
    const year = screen.getByLabelText("Publication year");
    expect(institute.tagName).toBe("SELECT");
    expect(institute).toHaveDisplayValue("All institutes");
    expect(year).toHaveAttribute("min", "1901");
    expect(year).toHaveAttribute("max", "2155");

    fireEvent.change(institute, {
      target: { value: "Institute of Computer Studies" },
    });
    fireEvent.change(year, { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      await screen.findByText("Select a valid institute."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The publication year is not available."),
    ).toBeInTheDocument();
    expect(institute).toHaveAttribute("aria-invalid", "true");
    expect(year).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(year, { target: { value: "2156" } });
    fireEvent.submit(year.closest("form")!);
    expect(
      await screen.findByText(
        "Enter a publication year from 1901 through 2155.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps recycle records in the server-defined removal order", async () => {
    const fetchMock = installRepositoryFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.click(screen.getByRole("tab", { name: "Recycle Bin" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const recycleQuery = String(fetchMock.mock.calls[1][0]);
    expect(recycleQuery).toContain("bucket=recycle");
    expect(recycleQuery).not.toContain("sort=");
    expect(recycleQuery).not.toContain("direction=");
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map(({ textContent }) => textContent),
    ).toEqual(["Title", "Authors", "Year", "Institute", "Removed", "Actions"]);
    expect(
      within(table.querySelector("thead")!).queryAllByRole("button"),
    ).toHaveLength(0);
    expect(screen.queryByLabelText("Sort records")).not.toBeInTheDocument();
  });

  it("does not reload or enter loading when the current pagination page is clicked", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(page([item], 2, 3))),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Loading repository records…"),
    ).not.toBeInTheDocument();
  });

  it("resets sort direction to descending updated time when changing buckets", async () => {
    const fetchMock = installRepositoryFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.click(screen.getByRole("button", { name: "Sort by Title" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "sort=title&direction=asc",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "sort=updated_at&direction=desc",
    );
  });

  it("implements associated keyboard-operable tabs and ignores an already active tab", async () => {
    const fetchMock = installRepositoryFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    const ongoing = screen.getByRole("tab", { name: "Ongoing" });
    expect(ongoing).toHaveAttribute(
      "aria-controls",
      "repository-view-ongoing-panel",
    );
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "repository-view-ongoing-tab",
    );
    fireEvent.click(ongoing);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Loading repository records…"),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(ongoing, { key: "ArrowRight" });
    expect(await screen.findByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "repository-view-archived-tab",
    );
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not let a stale bucket response replace the current view", async () => {
    let resolveOngoing!: (response: Response) => void;
    const archived = { ...item, id: 9, title: "Archived record" };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("bucket=archived")) {
        return Promise.resolve(new Response(JSON.stringify(page([archived]))));
      }
      return new Promise<Response>((resolve) => {
        resolveOngoing = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(await screen.findByText("Archived record")).toBeInTheDocument();
    resolveOngoing(
      new Response(JSON.stringify(page([{ ...item, title: "Stale record" }]))),
    );

    await waitFor(() =>
      expect(screen.queryByText("Stale record")).not.toBeInTheDocument(),
    );
  });

  it("edits only allowed metadata, submits only changed safe fields, and validates a title", async () => {
    const updated = {
      ...detail,
      title: "Revised coastal study",
      abstract: "A revised abstract.",
      keywords: "coastal, revised",
      publication_year: 2027,
      sdgs: [
        {
          id: 4,
          code: "SDG 4",
          title: "Quality Education",
          short_title: "Quality Education",
          color_hex: "#c5192d",
        },
      ],
      institute: "Institute of Health Sciences",
      degree_program: "Bachelor of Science in Midwifery",
      manuscript_date_label: "November 2027",
      research_stage: "completed",
    };
    const unsafeDetail = {
      ...detail,
      internal_notes: "Never render or submit this.",
      storage_path: "/private/coastal-study.pdf",
      similarity_score: "99.9",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (init?.method === "PATCH") {
          return new Response(JSON.stringify({ data: updated }));
        }
        if (path === "/api/categories") {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 3,
                  name: "Computing",
                  slug: "computing",
                  description: null,
                  is_active: true,
                },
              ],
            }),
          );
        }
        if (path === "/api/office/repository/7") {
          return new Response(JSON.stringify({ data: unsafeDetail }));
        }
        return new Response(JSON.stringify(page()));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    await screen.findByRole("button", { name: "Edit metadata" });
    expect(
      screen.queryByText("Never render or submit this."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("/private/coastal-study.pdf"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("99.9")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit metadata" }));
    const detailDialog = screen.getByRole("dialog", {
      name: "Repository record details",
    });
    expect(within(detailDialog).getByLabelText("Institute").tagName).toBe(
      "SELECT",
    );
    expect(within(detailDialog).getByLabelText("Degree program").tagName).toBe(
      "SELECT",
    );
    expect(
      within(detailDialog).getByRole("option", {
        name: "Bachelor of Science in Information Technology",
      }),
    ).toHaveValue("Bachelor of Science in Information Technology");
    expect(
      within(detailDialog).getByLabelText("Publication year"),
    ).toHaveAttribute("min", "1901");
    expect(
      within(detailDialog).queryByLabelText(/SDG IDs/),
    ).not.toBeInTheDocument();
    fireEvent.change(within(detailDialog).getByLabelText("Title"), {
      target: { value: "Revised coastal study" },
    });
    fireEvent.change(within(detailDialog).getByLabelText("Abstract"), {
      target: { value: "A revised abstract." },
    });
    fireEvent.change(within(detailDialog).getByLabelText("Keywords"), {
      target: { value: "coastal, revised" },
    });
    fireEvent.change(within(detailDialog).getByLabelText("Publication year"), {
      target: { value: "2027" },
    });
    fireEvent.change(within(detailDialog).getByLabelText("Institute"), {
      target: { value: "Institute of Health Sciences" },
    });
    fireEvent.change(within(detailDialog).getByLabelText("Degree program"), {
      target: { value: "Bachelor of Science in Midwifery" },
    });
    fireEvent.change(
      within(detailDialog).getByLabelText("Manuscript date label"),
      {
        target: { value: "November 2027" },
      },
    );
    fireEvent.change(within(detailDialog).getByLabelText("Research stage"), {
      target: { value: "completed" },
    });
    fireEvent.click(
      within(detailDialog).getByRole("checkbox", {
        name: "SDG 4: Quality Education",
      }),
    );
    fireEvent.click(
      within(detailDialog).getByRole("checkbox", {
        name: "SDG 13: Climate Action",
      }),
    );
    fireEvent.click(
      within(detailDialog).getByRole("button", { name: "Save metadata" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit)?.method === "PATCH",
        ),
      ).toHaveLength(1),
    );
    const [, updateInit] = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "PATCH",
    )!;
    expect(JSON.parse(String((updateInit as RequestInit).body))).toEqual({
      title: "Revised coastal study",
      abstract: "A revised abstract.",
      keywords: "coastal, revised",
      publication_year: 2027,
      sdg_ids: [4, 13],
      institute: "Institute of Health Sciences",
      degree_program: "Bachelor of Science in Midwifery",
      manuscript_date_label: "November 2027",
      research_stage: "completed",
    });
    expect(
      await screen.findByText("Saved metadata for Revised coastal study."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit metadata" }));
    fireEvent.change(within(detailDialog).getByLabelText("Title"), {
      target: { value: "" },
    });
    fireEvent.submit(
      within(detailDialog)
        .getByRole("button", { name: "Save metadata" })
        .closest("form")!,
    );
    expect(await screen.findByText("A title is required.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "PATCH",
      ),
    ).toHaveLength(1);
  });

  it("patches only a title change and skips legacy fields, normalized nulls, and reordered SDGs", async () => {
    const legacyDetail = {
      ...detail,
      abstract: null,
      keywords: null,
      institute: "Legacy institute",
      degree_program: "Legacy program",
      sdgs: [
        {
          id: 13,
          code: "SDG 13",
          title: "Climate Action",
          short_title: "Climate Action",
          color_hex: "#3f7e44",
        },
        {
          id: 4,
          code: "SDG 4",
          title: "Quality Education",
          short_title: "Quality Education",
          color_hex: "#c5192d",
        },
      ],
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(
            JSON.stringify({
              data: { ...legacyDetail, title: "Legacy revised" },
            }),
          );
        }
        if (String(input) === "/api/office/repository/7") {
          return new Response(JSON.stringify({ data: legacyDetail }));
        }
        return new Response(JSON.stringify(page()));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit metadata" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Repository record details",
    });
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Legacy revised" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit)?.method === "PATCH",
        ),
      ).toHaveLength(1),
    );
    const [, updateInit] = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "PATCH",
    )!;
    expect(JSON.parse(String((updateInit as RequestInit).body))).toEqual({
      title: "Legacy revised",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit metadata" }));
    fireEvent.change(within(dialog).getByLabelText("Abstract"), {
      target: { value: "" },
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "SDG 4: Quality Education",
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "SDG 4: Quality Education",
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit metadata" }),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "PATCH",
      ),
    ).toHaveLength(1);
  });

  it("renders server field errors and confirms before discarding a dirty edit", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (init?.method === "PATCH") {
          return new Response(
            JSON.stringify({
              error: "VALIDATION_FAILED",
              errors: {
                title: ["Choose a more specific title."],
                "sdg_ids.0": ["Select a valid sustainable development goal."],
              },
            }),
            { status: 422 },
          );
        }
        if (path === "/api/categories") {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 3,
                  name: "Computing",
                  slug: "computing",
                  description: null,
                  is_active: true,
                },
              ],
            }),
          );
        }
        if (path === "/api/office/repository/7") {
          return new Response(JSON.stringify({ data: detail }));
        }
        return new Response(JSON.stringify(page()));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit metadata" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Repository record details",
    });
    const title = within(dialog).getByLabelText("Title");
    fireEvent.change(title, { target: { value: "A revised title" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    expect(
      await screen.findByText("Choose a more specific title."),
    ).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(
      await screen.findByText("Select a valid sustainable development goal."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "SDG selection" }),
    ).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Close Repository record details" }),
    );
    expect(
      screen.getByText("You have unsaved changes. Discard them and close?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.getByText("You have unsaved changes. Discard them and close?"),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.mouseDown(dialog.parentElement!);
    expect(
      screen.getByText("You have unsaved changes. Discard them and close?"),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Close Repository record details" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("shows loading, empty, failed, and retried list states", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ManageRepository />);

    expect(screen.getByText("Loading repository records…")).toBeInTheDocument();
    resolveFirst(new Response(JSON.stringify(page([]))));
    expect(
      await screen.findByText("No records match these filters."),
    ).toBeInTheDocument();
    unmount();

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "LIST_FAILED" }), { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(page())));
    render(<ManageRepository />);
    expect(
      await screen.findByText(
        "Repository records are unavailable (LIST_FAILED).",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(item.title)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed recycle mutation visible and supports a subsequent reload", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return new Response(
            JSON.stringify({ error: "RECYCLE_MOVE_FAILED" }),
            { status: 500 },
          );
        }
        if (String(input) === "/api/office/repository/7") {
          return new Response(JSON.stringify({ data: detail }));
        }
        return new Response(JSON.stringify(page()));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    await screen.findByRole("button", { name: "Move to Recycle Bin" });
    fireEvent.click(
      screen.getByRole("button", { name: "Move to Recycle Bin" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move to Recycle Bin" })[1],
    );
    expect(
      await screen.findByText(
        "The record could not be moved (RECYCLE_MOVE_FAILED).",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move to Recycle Bin" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) =>
          String(path).startsWith("/api/office/repository?"),
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it("restores a recycle-bin record and refetches its authoritative list", async () => {
    const recycled = {
      ...item,
      deleted_at: "2026-10-02T08:00:00Z",
      can_edit: false,
      can_delete: false,
      can_restore: true,
    };
    const recycledDetail = { ...detail, ...recycled };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/office/repository/7/restore") {
        return new Response(JSON.stringify({ data: detail }));
      }
      if (path === "/api/office/repository/7") {
        return new Response(JSON.stringify({ data: recycledDetail }));
      }
      return new Response(
        JSON.stringify(
          page(
            [recycled],
            new URL(path, "http://localhost").searchParams.get("page") === "2"
              ? 2
              : 1,
            2,
          ),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(screen.getByRole("tab", { name: "Recycle Bin" }));
    await screen.findByRole("button", { name: "Page 2" });
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    fireEvent.click(
      await screen.findByRole("button", { name: `View ${recycled.title}` }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Restore record" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Restore repository record" }),
      ).getByRole("button", { name: "Restore record" }),
    );
    expect(
      await screen.findByText(`Restored ${recycled.title}.`),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/office/repository/7/restore",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) =>
          String(path).includes("bucket=recycle"),
        ),
      ).toHaveLength(3),
    );
    const recycleQueries = fetchMock.mock.calls.filter(([path]) =>
      String(path).includes("bucket=recycle"),
    );
    expect(String(recycleQueries[2][0])).toContain("page=1");
  });

  it("does not let a stale detail response replace the newest selected record", async () => {
    let resolveFirstDetail!: (response: Response) => void;
    const second = { ...item, id: 8, title: "Second record" };
    const secondDetail = { ...detail, ...second };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/office/repository/7") {
        return new Promise<Response>((resolve) => {
          resolveFirstDetail = resolve;
        });
      }
      if (path === "/api/office/repository/8") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: secondDetail })),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(page([item, second]))),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/office/repository/7",
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "View Second record" }));
    expect(
      await screen.findByRole("heading", { name: "Second record" }),
    ).toBeInTheDocument();
    resolveFirstDetail(
      new Response(
        JSON.stringify({ data: { ...detail, title: "Stale details" } }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Stale details")).not.toBeInTheDocument(),
    );
  });

  it("restores focus to the record action after closing details", async () => {
    installRepositoryFetch();
    render(<ManageRepository />);
    const view = await screen.findByRole("button", {
      name: `View ${item.title}`,
    });
    view.focus();
    fireEvent.click(view);
    await screen.findByRole("dialog", { name: "Repository record details" });
    fireEvent.click(
      screen.getByRole("button", { name: "Close Repository record details" }),
    );
    await waitFor(() => expect(view).toHaveFocus());
  });

  it("moves focus between Edit metadata and Title for edit transitions", async () => {
    const updated = { ...detail, title: "Updated coastal study" };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(JSON.stringify({ data: updated }));
        }
        if (String(input) === "/api/office/repository/7") {
          return new Response(JSON.stringify({ data: detail }));
        }
        if (String(input) === "/api/categories") {
          return new Response(JSON.stringify({ data: [] }));
        }
        return new Response(JSON.stringify(page()));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(
      await screen.findByRole("button", { name: `View ${item.title}` }),
    );
    const edit = await screen.findByRole("button", { name: "Edit metadata" });
    edit.focus();
    fireEvent.click(edit);
    const dialog = screen.getByRole("dialog", {
      name: "Repository record details",
    });
    let title = within(dialog).getByLabelText("Title");
    await waitFor(() => expect(title).toHaveFocus());

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit metadata" }),
      ).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit metadata" }));
    title = within(dialog).getByLabelText("Title");
    await waitFor(() => expect(title).toHaveFocus());
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit metadata" }),
      ).toHaveFocus(),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "PATCH",
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Edit metadata" }));
    title = within(dialog).getByLabelText("Title");
    fireEvent.change(title, {
      target: { value: updated.title },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit metadata" }),
      ).toHaveFocus(),
    );
    expect(dialog).toBeInTheDocument();
  });

  it("keeps responsive table hooks and accessible view tabs in the rendered structure", async () => {
    installRepositoryFetch();
    const { container } = render(<ManageRepository />);
    await screen.findByText(item.title);

    expect(
      screen.getByRole("tablist", { name: "Repository views" }),
    ).toHaveClass("manage-repository-tabs");
    expect(
      container.querySelector(".manage-repository-table-wrap"),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        "td[data-label='Title'], td[data-label='Authors'], td[data-label='Year'], td[data-label='Institute'], td[data-label='Updated'], td[data-label='Actions']",
      ),
    ).toHaveLength(6);
    const mobileSort = screen.getByLabelText("Sort records");
    expect(mobileSort).toHaveDisplayValue("Updated (newest first)");
    expect(
      container.querySelectorAll("thead .sortable-header-button"),
    ).toHaveLength(3);

    mobileSort.focus();
    fireEvent.keyDown(mobileSort, { key: "ArrowDown" });
    expect(mobileSort).toHaveFocus();
    fireEvent.change(mobileSort, {
      target: { value: "title:asc" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Sort records")).toHaveDisplayValue(
        "Title (A–Z)",
      ),
    );
  });
});
