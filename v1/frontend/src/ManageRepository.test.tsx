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

const detail = {
  ...item,
  category_id: 3,
  category: { id: 3, name: "Computing" },
  abstract: "A safe abstract.",
  keywords: "coastal, resilience",
  degree_program: "BSCS",
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

  it("edits only allowed metadata, submits the complete safe request body, and validates a title", async () => {
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
      institute: "Updated institute",
      degree_program: "MSCS",
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
      target: { value: "Updated institute" },
    });
    fireEvent.change(within(detailDialog).getByLabelText("Degree program"), {
      target: { value: "MSCS" },
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
    fireEvent.change(within(detailDialog).getByLabelText(/SDG IDs/), {
      target: { value: "4, invalid, 13" },
    });
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
      category_id: 3,
      title: "Revised coastal study",
      abstract: "A revised abstract.",
      keywords: "coastal, revised",
      publication_year: 2027,
      sdg_ids: [4, 13],
      institute: "Updated institute",
      degree_program: "MSCS",
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
      return new Response(JSON.stringify(page([recycled])));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManageRepository />);

    fireEvent.click(screen.getByRole("tab", { name: "Recycle Bin" }));
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
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
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
  });
});
