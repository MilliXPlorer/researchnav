import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  OfficeRepositoryAuthorInput,
  OfficeRepositoryDetailResource,
  OfficeRepositoryItemResource,
} from "./api";
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

const detail: OfficeRepositoryDetailResource = {
  ...item,
  abstract: "A safe abstract.",
  keywords: null,
  degree_program: null,
  manuscript_date_label: null,
  sdgs: [],
  authors: [
    {
      id: 1,
      user_id: "ada-1",
      author_name: "Ada Researcher",
      author_order: 1,
      is_corresponding_author: true,
      account: {
        id: "ada-1",
        name: "Ada Lovelace",
        email: "ada@example.test",
        is_available: true,
      },
    },
  ],
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

function installFetch({
  conflict = false,
  validationFields,
  patchResponse,
  responseDetail = detail,
}: {
  conflict?: boolean;
  validationFields?: Record<string, string[]>;
  patchResponse?: Promise<Response>;
  responseDetail?: typeof detail;
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (init?.method === "PATCH") {
        if (patchResponse) return patchResponse;
        if (conflict)
          return new Response(
            JSON.stringify({ error: "REPOSITORY_RECORD_CONFLICT" }),
            { status: 409 },
          );
        if (validationFields)
          return new Response(
            JSON.stringify({
              error: "VALIDATION_ERROR",
              errors: validationFields,
            }),
            { status: 422 },
          );
        const changes = JSON.parse(String(init.body)) as {
          title?: string;
          authors?: OfficeRepositoryAuthorInput[];
        };
        return new Response(
          JSON.stringify({
            data: {
              ...responseDetail,
              title: changes.title ?? responseDetail.title,
              authors: (changes.authors ?? responseDetail.authors).map(
                (author, index) => ({
                  ...author,
                  id: author.id ?? index + 1,
                  author_order: index + 1,
                }),
              ),
            },
          }),
        );
      }
      if (path === "/api/office/repository/7")
        return new Response(JSON.stringify({ data: responseDetail }));
      if (path.startsWith("/api/office/author-accounts"))
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "grace-2",
                name: "Grace Hopper",
                email: "grace@example.test",
                is_available: true,
              },
            ],
          }),
        );
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

    fireEvent.click(screen.getByRole("button", { name: "Institute" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Institute of Computer Studies" }),
    );
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
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);

    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const title = await within(dialog).findByLabelText("Title");
    expect(within(dialog).queryByLabelText("Category")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([path]) => String(path) === "/api/categories"),
    ).toBe(false);
    fireEvent.change(title, { target: { value: "Updated study title" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add researcher" }),
    );
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Second Researcher" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add manual researcher" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Repository record details" }),
      ).not.toBeInTheDocument(),
    );
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "PATCH",
    );
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toMatchObject({
      expected_updated_at: detail.updated_at,
      authors: [
        {
          id: 1,
          user_id: "ada-1",
          author_name: "Ada Researcher",
          is_corresponding_author: true,
        },
        {
          user_id: null,
          author_name: "Second Researcher",
          is_corresponding_author: false,
        },
      ],
    });
    expect(
      JSON.parse(String((patch?.[1] as RequestInit).body)),
    ).not.toHaveProperty("category_id");
  });

  it("keeps the draft open after a version conflict", async () => {
    installFetch({ conflict: true });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    fireEvent.change(await within(dialog).findByLabelText("Title"), {
      target: { value: "Draft that must remain" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This record changed elsewhere",
    );
    expect(within(dialog).getByLabelText("Title")).toHaveValue(
      "Draft that must remain",
    );
  });

  it("dismisses the account picker with Escape without closing the editor and restores its trigger", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const trigger = await within(dialog).findByRole("button", {
      name: "Add researcher",
    });
    fireEvent.click(trigger);
    const search = await screen.findByLabelText("Name or email");
    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Add researcher",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("restores the account picker trigger after a selection", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const trigger = await within(dialog).findByRole("button", {
      name: "Add researcher",
    });
    fireEvent.click(trigger);
    fireEvent.change(await screen.findByLabelText("Name or email"), {
      target: { value: "gr" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /grace hopper/i }),
    );

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("sends every structured author with a nullable account key", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add researcher" }),
    );
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Manual Researcher" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add manual researcher" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "PATCH",
    );
    expect(
      JSON.parse(String((patch?.[1] as RequestInit).body)).authors[1],
    ).toEqual({
      user_id: null,
      author_name: "Manual Researcher",
      is_corresponding_author: false,
    });
  });

  it("searches existing author accounts from the anchored picker before adding one", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Add researcher" }),
    );
    fireEvent.change(await screen.findByLabelText("Name or email"), {
      target: { value: "gr" },
    });
    expect(
      fetchMock.mock.calls.some(([path]) =>
        String(path).includes("/api/office/author-accounts"),
      ),
    ).toBe(false);
    const account = await screen.findByRole("button", {
      name: /grace hopper/i,
    });
    fireEvent.click(account);
    expect(within(dialog).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(dialog).getAllByText("System account")).toHaveLength(2);
  });

  it("prevents blank and duplicate manual researchers", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add researcher" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add manual researcher" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the researcher’s full name.",
    );
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Ada Researcher" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add manual researcher" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This researcher is already listed.",
    );
  });

  it("shows compact account-status cards without linking or corresponding controls", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    expect(
      within(dialog).getByRole("button", { name: "Add researcher" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Ada Researcher")).toBeInTheDocument();
    expect(within(dialog).getByText("System account")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Link account" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Corresponding")).not.toBeInTheDocument();
  });

  it("keeps an unavailable linked account linked and safely indicates its status", async () => {
    installFetch({
      responseDetail: {
        ...detail,
        authors: [
          {
            ...detail.authors[0],
            account: { ...detail.authors[0].account!, is_available: false },
          },
        ],
      },
    });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    expect(within(dialog).getByText("System account")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Link account" }),
    ).not.toBeInTheDocument();
  });

  it("uses exclusive roving editor tabs and preserves the draft across panels", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));

    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const tabs = within(dialog).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Basic information",
      "Classification",
      "SDGs",
      "Files and visibility",
      "Review and publish",
    ]);
    expect(within(dialog).getAllByRole("tabpanel")).toHaveLength(1);

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Draft title across tabs" },
    });
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(
      within(dialog).getByRole("tabpanel", { name: "Review and publish" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Draft title across tabs"),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Edit" })[0]);
    expect(within(dialog).getByLabelText("Title")).toHaveValue(
      "Draft title across tabs",
    );
  });

  it("resets only the editor content scroller when changing tabs", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));

    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const scroller = dialog.querySelector<HTMLElement>(
      ".repository-editor-scroll",
    );
    expect(scroller).not.toBeNull();
    if (!scroller) return;

    scroller.scrollTop = 240;
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Classification" }),
    );

    await waitFor(() => expect(scroller.scrollTop).toBe(0));
  });

  it("keeps a pending keyword while changing tabs and commits it before save", async () => {
    const fetchMock = installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.change(within(dialog).getByPlaceholderText("Add a keyword"), {
      target: { value: "climate" },
    });
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Classification" }),
    );
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Basic information" }),
    );
    expect(within(dialog).getByPlaceholderText("Add a keyword")).toHaveValue(
      "climate",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "PATCH",
    );
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toMatchObject({
      keywords: "climate",
    });
  });

  it("moves client validation links to the invalid field and server errors to their tab", async () => {
    installFetch({ validationFields: { publication_year: ["Invalid year."] } });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "" },
    });
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Review and publish" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add a title." }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Title")).toHaveFocus(),
    );

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "A valid title" },
    });
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Classification" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Publication year"), {
      target: { value: "2025" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("tab", {
          name: /Classification.*needs attention/,
        }),
      ).toHaveAttribute("aria-selected", "true"),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("spinbutton")).toHaveFocus(),
    );
  });

  it("focuses interactive author and SDG controls for validation navigation", async () => {
    installFetch({ validationFields: { sdg_ids: ["Select a valid SDG."] } });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "SDG error study" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("tab", { name: /SDGs.*needs attention/ }),
      ).toHaveAttribute("aria-selected", "true"),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("checkbox", {
          name: /SDG 1: No Poverty/i,
        }),
      ).toHaveFocus(),
    );
  });

  it("confirms draft removal and renumbers the remaining researcher cards", async () => {
    installFetch({
      responseDetail: {
        ...detail,
        authors: [
          ...detail.authors,
          {
            id: 2,
            user_id: null,
            author_name: "Manual Researcher",
            author_order: 2,
            is_corresponding_author: false,
          },
        ],
      },
    });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    const firstActions = within(dialog).getByRole("button", {
      name: "Researcher actions for Ada Researcher",
    });
    fireEvent.click(firstActions);
    const firstMenu = within(dialog).getByRole("menu", {
      name: "Researcher actions for Ada Researcher",
    });
    expect(within(firstMenu).getAllByRole("menuitem")).toHaveLength(1);
    fireEvent.click(
      within(firstMenu).getByRole("menuitem", { name: "Remove researcher" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Remove researcher?",
    });
    expect(within(dialog).getByText("Ada Researcher")).toBeInTheDocument();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Remove researcher" }),
    );
    expect(
      within(dialog).queryByText("Ada Researcher"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("Manual Researcher")).toBeInTheDocument();
    expect(
      within(dialog)
        .getByRole("button", {
          name: "Researcher actions for Manual Researcher",
        })
        .closest("li"),
    ).toHaveTextContent(/^1Manual ResearcherManual entry/);
    expect(within(dialog).getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("disables every editable control while a metadata save is pending", async () => {
    let resolvePatch: (response: Response) => void = () => undefined;
    const patchResponse = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    installFetch({ patchResponse });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Pending save title" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save metadata" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Title")).toBeDisabled(),
    );
    expect(
      within(dialog).getByRole("button", { name: "Add researcher" }),
    ).toBeDisabled();
    const tabs = within(dialog).getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    tabs.forEach((tab) => expect(tab).toBeDisabled());
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    resolvePatch(new Response(JSON.stringify({ data: detail })));
  });

  it("prompts before discarding a nonblank pending keyword", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    fireEvent.change(within(dialog).getByPlaceholderText("Add a keyword"), {
      target: { value: "climate" },
    });

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      within(dialog).getByRole("alertdialog", { name: "Unsaved changes" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );

    fireEvent.mouseDown(dialog.parentElement!);
    expect(
      within(dialog).getByRole("alertdialog", { name: "Unsaved changes" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      within(dialog).getByRole("alertdialog", { name: "Unsaved changes" }),
    ).toBeInTheDocument();
  });

  it("focuses the actual editor title and sorts file metadata deterministically", async () => {
    installFetch({
      responseDetail: {
        ...detail,
        files: [
          {
            id: 9,
            document_type: "Draft",
            upload_purpose: null,
            version_number: 2,
            file_order: 2,
            original_filename: "zeta.pdf",
            file_extension: "pdf",
            mime_type: "application/pdf",
            file_size: 10,
            is_current: false,
            uploaded_at: null,
          },
          {
            id: 2,
            document_type: "Draft",
            upload_purpose: null,
            version_number: 1,
            file_order: 1,
            original_filename: "alpha.pdf",
            file_extension: "pdf",
            mime_type: "application/pdf",
            file_size: 10,
            is_current: true,
            uploaded_at: null,
          },
          {
            id: 1,
            document_type: "Draft",
            upload_purpose: null,
            version_number: 1,
            file_order: 2,
            original_filename: "beta.pdf",
            file_extension: "pdf",
            mime_type: "application/pdf",
            file_size: 10,
            is_current: false,
            uploaded_at: null,
          },
        ],
      },
    });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `View ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((file) => file.textContent),
    ).toEqual([
      expect.stringContaining("alpha.pdf"),
      expect.stringContaining("beta.pdf"),
      expect.stringContaining("zeta.pdf"),
    ]);
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Close Repository record details",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const editDialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });
    await waitFor(() =>
      expect(within(editDialog).getByLabelText("Title")).toHaveFocus(),
    );
    fireEvent.click(
      within(editDialog).getByRole("tab", { name: "Files and visibility" }),
    );
    expect(
      within(editDialog)
        .getAllByRole("listitem")
        .map((file) => file.textContent),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("alpha.pdf"),
        expect.stringContaining("beta.pdf"),
        expect.stringContaining("zeta.pdf"),
      ]),
    );
  });

  it("renders all official SDG cards and review readiness without file actions", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.click(within(dialog).getByRole("tab", { name: "SDGs" }));
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(17);
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /SDG 1: No Poverty/i }),
    );
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Review and publish" }),
    );
    expect(within(dialog).getByText("SDG 1")).toBeInTheDocument();
    expect(within(dialog).getByText(/does not publish/i)).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Files and visibility" }),
    );
    expect(
      within(dialog).getByText(/managed outside this metadata editor/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", {
        name: /download|delete file|view file/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows structured, readable review cards and readiness only for a valid draft", async () => {
    installFetch();
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Review and publish" }),
    );
    expect(
      within(dialog).getByText("Ready to save metadata."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Publication year")).toBeInTheDocument();
    expect(within(dialog).getByText("Visibility")).toBeInTheDocument();
    expect(within(dialog).getByText("1. Ada Researcher")).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "" },
    });
    fireEvent.click(
      within(dialog).getByRole("tab", { name: /Review and publish/ }),
    );
    expect(
      within(dialog).queryByText("Ready to save metadata."),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("Before you save")).toBeInTheDocument();
  });

  it("keeps classification values, author order, and safe humanized file metadata in the draft", async () => {
    installFetch({
      responseDetail: {
        ...detail,
        files: [
          {
            id: 3,
            document_type: "Final manuscript",
            upload_purpose: null,
            version_number: 2,
            file_order: 1,
            original_filename: "coastal-final.pdf",
            file_extension: "pdf",
            mime_type: "application/pdf",
            file_size: 1536,
            is_current: true,
            uploaded_at: null,
          },
        ],
      },
    });
    render(<ManageRepository />);
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${item.title}` }));
    const dialog = await screen.findByRole("dialog", {
      name: "Repository record details",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add researcher" }),
    );
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Second Researcher" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add manual researcher" }),
    );
    expect(within(dialog).getByText("Second Researcher")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Classification" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Publication year"), {
      target: { value: "2025" },
    });
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Files and visibility" }),
    );
    expect(
      within(dialog).getByText(
        (_, element) =>
          element?.tagName === "SMALL" &&
          Boolean(element.textContent?.includes("1.5 KiB")),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        (_, element) =>
          element?.tagName === "SMALL" &&
          Boolean(element.textContent?.includes("Current version")),
      ),
    ).toBeInTheDocument();
  });
});
