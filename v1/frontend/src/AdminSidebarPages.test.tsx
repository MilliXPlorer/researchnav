import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSidebarPage from "./AdminSidebarPages";
import Dashboard from "./Dashboard";

const user = {
  id: "5e6235e0-c953-4f69-a89e-b9160c3b167b",
  email: "member@example.test",
  student_employee_id: null,
  names: { first_name: "Member", middle_name: null, last_name: "Example" },
  role: "researcher",
  access_status: "active",
  is_admin: false,
  invitation_sent_at: null,
  confirmed_at: null,
  last_login_at: "2026-08-18T08:00:00.000000Z",
  created_at: "2026-08-01T08:00:00.000000Z",
  updated_at: "2026-08-18T08:00:00.000000Z",
};

const page = (data: unknown[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    from: data.length ? 1 : null,
    last_page: 1,
    links: [],
    path: "/api/admin/users",
    per_page: 25,
    to: data.length || null,
    total: data.length,
  },
});

const systemStatusResponse = {
  data: {
    schema_version: 1,
    checked_at: "2026-08-18T09:00:00.000000Z",
    overall: "operational",
    issues: [],
    runtime: {
      environment: "testing",
      debug_enabled: false,
      php_version: "8.4",
      framework_version: "12",
    },
    database: {
      driver: "sqlite",
      status: "operational",
      counts: {
        users: {
          total: 1,
          access_statuses: { active: 1, invited: 0, blocked: 0 },
          administrators: 1,
          coordinators: 0,
        },
        audit_logs: 1,
        research_documents: 0,
        notifications: 0,
        document_files: 0,
        document_file_bytes: 0,
      },
      migrations: { applied: 1, available: 1, pending: 0 },
    },
    storage: {
      private: {
        disk: "researchnav_private",
        driver: "local",
        status: "operational",
        capabilities: { read: true, write: true },
      },
    },
  },
};

beforeEach(() => vi.unstubAllGlobals());

describe("administrator sidebar pages", () => {
  it("renders each administrator sidebar destination from its live endpoint", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/notifications")
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      if (path === "/api/dashboard")
        return new Response(
          JSON.stringify({
            data: { schema_version: 1, role: "admin", sections: [] },
          }),
        );
      if (path === "/api/admin/coordinators")
        return new Response(
          JSON.stringify({
            users: [
              {
                email: "coordinator@example.test",
                role: "coordinator",
                accessStatus: "active",
                isAdmin: false,
              },
            ],
          }),
        );
      if (path.startsWith("/api/admin/users"))
        return new Response(JSON.stringify(page([user])));
      if (path.startsWith("/api/admin/audit-logs"))
        return new Response(
          JSON.stringify(
            page([
              {
                id: 1,
                action: "LOGIN",
                actor: null,
                subject: null,
                description: "Signed in.",
                created_at: null,
              },
            ]),
          ),
        );
      return new Response(
        JSON.stringify({
          data: {
            schema_version: 1,
            checked_at: "2026-08-18T09:00:00.000000Z",
            overall: "operational",
            issues: [],
            runtime: {
              environment: "testing",
              debug_enabled: false,
              php_version: "8.4",
              framework_version: "12",
            },
            database: {
              driver: "sqlite",
              status: "operational",
              counts: {
                users: {
                  total: 1,
                  access_statuses: { active: 1, invited: 0, blocked: 0 },
                  administrators: 1,
                  coordinators: 0,
                },
                audit_logs: 1,
                research_documents: 0,
                notifications: 0,
                document_files: 0,
                document_file_bytes: 0,
              },
              migrations: { applied: 1, available: 1, pending: 0 },
            },
            storage: {
              private: {
                disk: "researchnav_private",
                driver: "local",
                status: "operational",
                capabilities: { read: true, write: true },
              },
            },
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Dashboard
        session={{
          email: "admin@example.test",
          role: "admin",
          accessStatus: "active",
          isAdmin: true,
          firstName: "System",
          middleName: null,
          lastName: "Administrator",
          studentEmployeeId: null,
          displayName: "System Administrator",
          profilePhotoUrl: null,
        }}
        navigate={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Coordinator Accounts" }),
    );
    expect(
      await screen.findByText("coordinator@example.test"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All Users" }));
    expect(await screen.findByText("member@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Audit Logs" }));
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "System Settings" }));
    expect(
      await screen.findByRole("heading", {
        name: "System status and capabilities",
      }),
    ).toBeInTheDocument();
  });

  it("loads coordinator accounts and provisions through the administrator endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (
          String(input) === "/api/admin/coordinators" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              user: {
                email: "new@example.test",
                role: "coordinator",
                accessStatus: "invited",
                isAdmin: false,
              },
            }),
            { status: 201 },
          );
        }
        return new Response(
          JSON.stringify({
            users: [
              {
                email: "coordinator@example.test",
                role: "coordinator",
                accessStatus: "active",
                isAdmin: false,
              },
            ],
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSidebarPage selectedNav="Coordinator Accounts" />);
    expect(
      await screen.findByText("coordinator@example.test"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Coordinator email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Provision account" }));
    expect(
      await screen.findByText("Coordinator account provisioned."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/coordinators",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.test" }),
      }),
    );
  });

  it.each([
    {
      selectedNav: "Coordinator Accounts",
      loadingLabel: "Loading coordinator accounts",
      successfulResponse: { users: [] },
      successText: "No coordinator accounts have been provisioned.",
    },
    {
      selectedNav: "All Users",
      loadingLabel: "Loading users",
      successfulResponse: page([]),
      successText: "No user accounts are available.",
    },
    {
      selectedNav: "Audit Logs",
      loadingLabel: "Loading audit logs",
      successfulResponse: page([]),
      successText: "No audit logs have been recorded.",
    },
    {
      selectedNav: "System Settings",
      loadingLabel: "Loading system status",
      successfulResponse: systemStatusResponse,
      successText: "Operational",
    },
  ])(
    "clears the failed %s load while retrying and renders the authoritative response",
    async ({ selectedNav, loadingLabel, successfulResponse, successText }) => {
      let requests = 0;
      let resolveRetry!: (response: Response) => void;
      const retryResponse = new Promise<Response>((resolve) => {
        resolveRetry = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          requests += 1;
          return requests === 1
            ? Promise.resolve(
                new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
                  status: 503,
                }),
              )
            : retryResponse;
        }),
      );

      const { unmount } = render(
        <AdminSidebarPage selectedNav={selectedNav} />,
      );
      expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: loadingLabel, busy: true }),
      ).toBeInTheDocument();

      resolveRetry(new Response(JSON.stringify(successfulResponse)));
      expect(await screen.findByText(successText)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      unmount();
    },
  );

  it("renders users, reports a 409 mutation, and refetches without exposing secrets", async () => {
    let userRequests = 0;
    const refreshedUser = {
      ...user,
      role: "adviser",
      access_status: "blocked",
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (
          String(input).startsWith("/api/admin/users") &&
          init?.method === "PATCH"
        ) {
          return new Response(
            JSON.stringify({ error: "LAST_ACTIVE_ADMIN_REQUIRED" }),
            { status: 409 },
          );
        }
        userRequests += 1;
        return new Response(
          JSON.stringify(page([userRequests === 1 ? user : refreshedUser])),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSidebarPage selectedNav="All Users" />);
    expect(await screen.findByText("member@example.test")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Role for member@example.test"), {
      target: { value: "admin" },
    });
    fireEvent.change(
      screen.getByLabelText("Access status for member@example.test"),
      { target: { value: "invited" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("At least one active administrator must remain."),
    ).toBeInTheDocument();
    await waitFor(() => expect(userRequests).toBeGreaterThan(1));
    expect(screen.getByLabelText("Role for member@example.test")).toHaveValue(
      "adviser",
    );
    expect(
      screen.getByLabelText("Access status for member@example.test"),
    ).toHaveValue("blocked");
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/google_sub/i)).not.toBeInTheDocument();
  });

  it("discards a successful user draft before the authoritative refetch", async () => {
    let userRequests = 0;
    const refreshedUser = {
      ...user,
      role: "coordinator",
      access_status: "blocked",
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (
          String(input).startsWith("/api/admin/users") &&
          init?.method === "PATCH"
        ) {
          return new Response(
            JSON.stringify({
              data: { ...user, role: "admin", access_status: "invited" },
            }),
          );
        }
        userRequests += 1;
        return new Response(
          JSON.stringify(page([userRequests === 1 ? user : refreshedUser])),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminSidebarPage selectedNav="All Users" />);
    expect(await screen.findByText("member@example.test")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Role for member@example.test"), {
      target: { value: "admin" },
    });
    fireEvent.change(
      screen.getByLabelText("Access status for member@example.test"),
      { target: { value: "invited" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Updated member@example.test."),
    ).toBeInTheDocument();
    await waitFor(() => expect(userRequests).toBeGreaterThan(1));
    expect(screen.getByLabelText("Role for member@example.test")).toHaveValue(
      "coordinator",
    );
    expect(
      screen.getByLabelText("Access status for member@example.test"),
    ).toHaveValue("blocked");
  });

  it("filters admin users live as search text changes without submitting", async () => {
    const refined = { ...user, email: "anna@example.test" };
    let requests = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith("/api/admin/users")) {
        requests += 1;
        return new Response(
          JSON.stringify(
            page(String(input).includes("search=") ? [refined] : [user]),
          ),
        );
      }
      return new Response(JSON.stringify(systemStatusResponse));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSidebarPage selectedNav="All Users" />);
    expect(await screen.findByText("member@example.test")).toBeInTheDocument();
    const initialRequests = requests;
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "ann" },
    });
    expect(await screen.findByText("anna@example.test")).toBeInTheDocument();
    await waitFor(() => expect(requests).toBeGreaterThan(initialRequests));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("search=ann"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(screen.queryByText("member@example.test")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply filters" }),
    ).not.toBeInTheDocument();
  });

  it("renders audit records and system counts, including degraded issues and empty filtered logs", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith("/api/admin/audit-logs")) {
        return new Response(
          JSON.stringify(
            page(
              String(input).includes("action=missing")
                ? []
                : [
                    {
                      id: 4,
                      action: "ADMIN_USER_UPDATED",
                      actor: { id: "a", email: "admin@example.test" },
                      subject: { type: "user", id: user.id },
                      description: "Changed user role.",
                      created_at: "2026-08-18T09:00:00.000000Z",
                    },
                  ],
            ),
          ),
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            schema_version: 1,
            checked_at: "2026-08-18T09:00:00.000000Z",
            overall: "degraded",
            issues: ["database.audit_logs_unavailable"],
            runtime: {
              environment: "testing",
              debug_enabled: false,
              php_version: "8.4",
              framework_version: "12",
            },
            database: {
              driver: "sqlite",
              status: "degraded",
              counts: {
                users: {
                  total: 12,
                  access_statuses: { active: 9, invited: 2, blocked: 1 },
                  administrators: 2,
                  coordinators: 1,
                },
                audit_logs: null,
                research_documents: 7,
                notifications: 3,
                document_files: 4,
                document_file_bytes: 1234,
              },
              migrations: { applied: 10, available: 11, pending: 1 },
            },
            storage: {
              private: {
                disk: "researchnav_private",
                driver: "local",
                status: "operational",
                capabilities: { read: true, write: true },
              },
            },
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<AdminSidebarPage selectedNav="Audit Logs" />);
    expect(await screen.findByText("admin@example.test")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "missing" },
    });
    expect(
      await screen.findByText("No audit logs match these filters."),
    ).toBeInTheDocument();
    rerender(<AdminSidebarPage selectedNav="System Settings" />);
    expect(
      await screen.findByRole("heading", {
        name: "System status and capabilities",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("12")).not.toHaveLength(0);
    expect(
      screen.getByText("database.audit_logs_unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText(/10 applied/)).toBeInTheDocument();
  });
});
