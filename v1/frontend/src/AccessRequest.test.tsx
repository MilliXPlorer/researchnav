import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccessRequestPanel from "./AccessRequestPanel";
import AdminSidebarPage from "./AdminSidebarPages";

afterEach(() => vi.unstubAllGlobals());

const pendingRequest = {
  id: 7,
  user_id: "u-1",
  email: "applicant@example.test",
  requested_role: "researcher",
  status: "pending" as const,
  full_name: "Filjoy Adala",
  program: "BS Computer Science",
  justification: "Starting my capstone.",
  decided_by_email: null,
  decision_remarks: null,
  requested_at: "2026-05-02T00:00:00.000Z",
  decided_at: null,
};

describe("AccessRequestPanel", () => {
  it("submits a role request for a verified account without a role", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/access-requests/mine" && init?.method === undefined) {
          return new Response(JSON.stringify({ data: null }));
        }
        calls.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ data: pendingRequest }), {
          status: 201,
        });
      }),
    );

    render(<AccessRequestPanel />);

    const select = await screen.findByLabelText("Workspace role");
    fireEvent.change(select, { target: { value: "instructor" } });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Filjoy Adala" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));

    await waitFor(() =>
      expect(
        screen.getByText("Your request is awaiting review."),
      ).toBeInTheDocument(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/access-requests");
    expect(calls[0].body).toMatchObject({
      requested_role: "instructor",
      full_name: "Filjoy Adala",
    });
  });

  it("shows an existing pending request instead of a second form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: pendingRequest }))),
    );

    render(<AccessRequestPanel />);

    expect(
      await screen.findByText("Your request is awaiting review."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Send request/ }),
    ).not.toBeInTheDocument();
  });

  it("reports a duplicate request without claiming success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: "REQUEST_ALREADY_PENDING" }),
            { status: 409 },
          );
        }
        return new Response(JSON.stringify({ data: null }));
      }),
    );

    render(<AccessRequestPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Send request/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A request from this account is already awaiting review.",
    );
    expect(
      screen.queryByText("Your request is awaiting review."),
    ).not.toBeInTheDocument();
  });
});

describe("administrator access request queue", () => {
  function stubQueue(onDecide?: (body: unknown) => void) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PATCH") {
          onDecide?.(init.body ? JSON.parse(String(init.body)) : null);
          return new Response(
            JSON.stringify({
              data: { ...pendingRequest, status: "approved" },
            }),
          );
        }
        if (url.startsWith("/api/admin/access-requests")) {
          return new Response(
            JSON.stringify({
              data: [pendingRequest],
              links: {},
              meta: { current_page: 1, last_page: 1, total: 1, per_page: 25 },
            }),
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
  }

  it("lists pending applicants with their details", async () => {
    stubQueue();
    render(<AdminSidebarPage selectedNav="Access Requests" />);

    expect(
      await screen.findByText("applicant@example.test"),
    ).toBeInTheDocument();
    expect(screen.getByText("BS Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Starting my capstone.")).toBeInTheDocument();
  });

  it("approves a request with the role the administrator selects", async () => {
    let decided: unknown = null;
    stubQueue((body) => {
      decided = body;
    });
    render(<AdminSidebarPage selectedNav="Access Requests" />);

    fireEvent.change(await screen.findByLabelText("Grant role"), {
      target: { value: "librarian" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(decided).toMatchObject({
        decision: "approve",
        granted_role: "librarian",
      }),
    );
  });

  it("rejects a request without granting a role", async () => {
    let decided: unknown = null;
    stubQueue((body) => {
      decided = body;
    });
    render(<AdminSidebarPage selectedNav="Access Requests" />);

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    await waitFor(() => expect(decided).toMatchObject({ decision: "reject" }));
    expect((decided as { granted_role?: string }).granted_role).toBeUndefined();
  });
});
