import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupportAssignmentResource } from "./api";
import SupportAssignmentCards from "./SupportAssignmentCards";

const activeEditor: SupportAssignmentResource = {
  id: 1,
  research_document_id: 42,
  research_title: "A study",
  researchers: ["Ada"],
  user_id: "editor-a",
  name: "Editor With A Very Long Name",
  assignment_role: "research_editor",
  status: "accepted",
  created_at: null,
};

const activeLibrarian: SupportAssignmentResource = {
  ...activeEditor,
  id: 2,
  user_id: "librarian-a",
  name: "Library Person",
  assignment_role: "librarian",
};

function renderCards(
  assignments: SupportAssignmentResource[] = [activeEditor, activeLibrarian],
) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  render(
    <SupportAssignmentCards
      researchDocumentId={42}
      researchTitle="A study"
      assignments={assignments}
      canManage
      onRefreshAssignments={refresh}
      onNotify={notify}
    />,
  );
  return { refresh, notify };
}

function eligibleResponse(
  data: Array<{ id: string; name: string; email: string; role: string }> = [
    {
      id: "editor-b",
      name: "Editor B",
      email: "editor@example.test",
      role: "research_editor",
    },
  ],
) {
  return new Response(JSON.stringify({ data }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SupportAssignmentCards", () => {
  it("renders all configured roles with active, pending, and unassigned states", () => {
    renderCards([activeEditor, { ...activeLibrarian, status: "requested" }]);

    expect(screen.getByText("Editor With A Very Long Name")).toHaveAttribute(
      "title",
      "Editor With A Very Long Name",
    );
    expect(screen.getByRole("button", { name: "Change Editor" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Assign Statistician" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Pending Librarian" }),
    ).toBeDisabled();
    expect(screen.getByText("Change requested")).toBeInTheDocument();
  });

  it("opens with all available accounts and waits for two characters before filtering", async () => {
    const fetchMock = vi.fn().mockResolvedValue(eligibleResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderCards();

    fireEvent.click(screen.getByRole("button", { name: "Change Librarian" }));

    expect(
      await screen.findByRole("heading", { name: "Change librarian" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Support specialist")).toBeInTheDocument();
    expect(
      screen.getByText("Current librarian: Library Person"),
    ).toBeInTheDocument();
    expect(screen.getByText("Find an eligible librarian")).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: /Editor B/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("search=");
    expect(
      screen.queryByRole("button", { name: /Close Change librarian/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "L" },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter at least 2 characters to filter available accounts.",
      ),
    ).toHaveClass("support-assignment-helper");
  });

  it("shows loading, results, clear control, keyboard selection, and enabled submit", async () => {
    const pendingSearches: Array<(response: Response) => void> = [];
    const fetchMock =
      vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingSearches.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Change Editor" }));
    const input = await screen.findByRole("combobox");
    await waitFor(() => expect(pendingSearches).toHaveLength(1));
    await act(async () => {
      pendingSearches.shift()!(eligibleResponse());
      await Promise.resolve();
    });
    await screen.findByRole("option", { name: /Editor B/ });
    fireEvent.change(input, { target: { value: "Ed" } });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Searching eligible accounts",
    );
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Searching")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear search" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(pendingSearches).toHaveLength(1));
    await act(async () => {
      pendingSearches.shift()!(eligibleResponse());
      await Promise.resolve();
    });

    const option = await screen.findByRole("option", { name: /Editor B/ });
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "false");
    expect(String(fetchMock.mock.calls[1][0])).toContain("search=Ed");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Editor B/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
  });

  it("shows empty and error search states with retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(eligibleResponse([]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "failed" }), { status: 500 }),
      )
      .mockResolvedValueOnce(eligibleResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Change Editor" }));
    const input = await screen.findByRole("combobox");

    fireEvent.change(input, { target: { value: "Ed" } });
    expect(
      await screen.findByText(
        "No eligible active accounts found for this role.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Er" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Eligible accounts could not be loaded.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it.each([
    ["Cancel", "click"],
    ["Escape", "escape"],
    ["backdrop", "backdrop"],
  ])("closes with %s and restores trigger focus", async (_label, action) => {
    renderCards();
    const trigger = screen.getByRole("button", { name: "Change Editor" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");

    if (action === "click") {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    } else if (action === "escape") {
      fireEvent.keyDown(dialog, { key: "Escape" });
    } else {
      fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
    }

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("confirms, submits once while busy, and restores focus after success", async () => {
    let resolvePost!: (response: Response) => void;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (path.startsWith("/api/support-assignments/eligible?")) {
          return eligibleResponse();
        }
        if (
          path === "/api/research/42/support-assignments" &&
          init?.method === "POST"
        ) {
          return new Promise<Response>((resolve) => {
            resolvePost = resolve;
          });
        }
        return eligibleResponse([]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { refresh, notify } = renderCards();
    const trigger = screen.getByRole("button", { name: "Change Editor" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "Ed" } });
    fireEvent.click(await screen.findByRole("option", { name: /Editor B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    const confirmation = await screen.findByRole("heading", {
      name: "Send support request?",
    });
    await waitFor(() => expect(confirmation).toHaveFocus());
    const send = screen.getByRole("button", { name: "Send request" });
    fireEvent.click(send);

    expect(
      await screen.findByRole("button", { name: "Sending…" }),
    ).toBeDisabled();
    fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    resolvePost(new Response(JSON.stringify({ data: activeEditor })));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith("Editor change requested.");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("keeps a successful POST successful when the best-effort refresh fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith("/api/support-assignments/eligible?")) {
        return eligibleResponse();
      }
      return new Response(JSON.stringify({ data: activeEditor }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockRejectedValue(new Error("refresh failed"));
    const notify = vi.fn();
    render(
      <SupportAssignmentCards
        researchDocumentId={42}
        researchTitle="A study"
        assignments={[activeEditor]}
        canManage
        onRefreshAssignments={refresh}
        onNotify={notify}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change Editor" }));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "Ed" } });
    fireEvent.click(await screen.findByRole("option", { name: /Editor B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Send request" }),
    );

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Editor change requested."),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
