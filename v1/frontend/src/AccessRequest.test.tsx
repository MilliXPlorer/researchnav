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

const institutes = [
  "Institute of Computer Studies",
  "Institute of Health Sciences",
  "Institute of Business and Financial Management",
  "Institute of Arts and Sciences",
  "Institute of Criminal Justice Education",
  "Institute of Teacher Education",
];

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
        if (url === "/api/institutes") {
          return new Response(JSON.stringify({ data: institutes }));
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
    fireEvent.change(screen.getByLabelText("Institute"), {
      target: { value: "Institute of Computer Studies" },
    });
    fireEvent.change(screen.getByLabelText("Reason for access"), {
      target: { value: "Teaching research methods." },
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
      program: "Institute of Computer Studies",
      justification: "Teaching research methods.",
    });
  });

  it("offers only the six approved institutes and requires a selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: null }))),
    );

    render(<AccessRequestPanel />);

    const institute = await screen.findByLabelText("Institute");
    expect(institute).toBeRequired();
    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Reason for access")).toBeRequired();
    expect(institute.querySelectorAll("option")).toHaveLength(7);
    expect(
      screen.getByRole("option", { name: "Institute of Computer Studies" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Institute of Teacher Education" }),
    ).toBeInTheDocument();
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

  it("shows a rejected decision and its administrator remarks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                ...pendingRequest,
                status: "rejected",
                decision_remarks: "Enrollment could not be verified.",
                decided_at: "2026-05-03T00:00:00.000Z",
              },
            }),
          ),
      ),
    );

    render(<AccessRequestPanel />);

    expect(
      await screen.findByText("Your access request was not approved."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enrollment could not be verified."),
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
    fireEvent.change(await screen.findByLabelText("Institute"), {
      target: { value: "Institute of Computer Studies" },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Filjoy Adala" },
    });
    fireEvent.change(screen.getByLabelText("Reason for access"), {
      target: { value: "Starting my capstone." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));

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
    expect(screen.queryByText("Starting my capstone.")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "View access request from Filjoy Adala",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Access request details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BS Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Starting my capstone.")).toBeInTheDocument();
    expect(screen.getByText("Reason for access")).toBeInTheDocument();
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

  it("switches status tabs, exposes counts, and clears search", async () => {
    const requests = {
      pending: [pendingRequest],
      approved: [
        {
          ...pendingRequest,
          id: 8,
          status: "approved",
          email: "approved@example.test",
        },
      ],
      rejected: [],
    } as const;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const status =
        new URLSearchParams(String(input).split("?")[1]).get("status") ??
        "pending";
      const data = requests[status as keyof typeof requests];
      return new Response(
        JSON.stringify({
          data,
          links: {},
          meta: {
            current_page: 1,
            last_page: 1,
            total: data.length,
            per_page: 25,
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSidebarPage selectedNav="Access Requests" />);

    const pending = await screen.findByRole("tab", { name: "pending 1" });
    const approved = await screen.findByRole("tab", { name: "approved 1" });
    const rejected = await screen.findByRole("tab", { name: "rejected 0" });
    expect(pending).toHaveAttribute("aria-selected", "true");
    expect(approved).toHaveAttribute("aria-selected", "false");
    fireEvent.change(screen.getByLabelText("Search by name or email"), {
      target: { value: "filjoy" },
    });
    pending.focus();
    fireEvent.keyDown(pending, { key: "ArrowRight" });
    expect(
      await screen.findByText("approved@example.test"),
    ).toBeInTheDocument();
    expect(approved).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Search by name or email")).toHaveValue("");
    fireEvent.click(rejected);
    expect(
      await screen.findByRole("heading", {
        name: "No rejected access requests",
      }),
    ).toBeInTheDocument();
  });

  it("filters the selected status by name or email case-insensitively", async () => {
    stubQueue();
    render(<AdminSidebarPage selectedNav="Access Requests" />);
    await screen.findByText("applicant@example.test");

    fireEvent.change(screen.getByLabelText("Search by name or email"), {
      target: { value: "FILJOY" },
    });
    expect(screen.getByText("applicant@example.test")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search by name or email"), {
      target: { value: "missing@example.test" },
    });
    expect(
      screen.getByText("No pending requests match “missing@example.test”."),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "pending",
      "No pending access requests",
      "New Google-verified requests will appear here for review.",
    ],
    [
      "approved",
      "No approved access requests",
      "No approved Google-verified requests match this view.",
    ],
    [
      "rejected",
      "No rejected access requests",
      "No rejected Google-verified requests match this view.",
    ],
  ] as const)(
    "shows the %s empty state",
    async (status, heading, description) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                data: [],
                links: {},
                meta: { current_page: 1, last_page: 1, total: 0, per_page: 25 },
              }),
            ),
        ),
      );
      render(<AdminSidebarPage selectedNav="Access Requests" />);
      if (status !== "pending") {
        fireEvent.click(
          await screen.findByRole("tab", { name: `${status} 0` }),
        );
      }
      expect(
        await screen.findByRole("heading", { name: heading }),
      ).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "Requester" }),
      ).toBeInTheDocument();
    },
  );

  it("refreshes the selected queue", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [],
            links: {},
            meta: { current_page: 1, last_page: 1, total: 0, per_page: 25 },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSidebarPage selectedNav="Access Requests" />);
    await screen.findByText("No pending access requests");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before),
    );
  });
});
