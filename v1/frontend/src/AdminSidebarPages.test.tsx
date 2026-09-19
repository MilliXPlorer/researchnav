import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
      if (path === "/api/admin/accounts")
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
      screen.getByRole("button", { name: "User & Role Management" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Add user" }));
    expect(
      await screen.findByRole("heading", { name: "Add user" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("option", { name: "Research Editor" }).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close Add user" }));
    expect(await screen.findByText("member@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Audit Logs" }));
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upload Manuscript" }));
    expect(
      await screen.findByRole("heading", { name: "Upload Manuscript" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "System Settings" }));
    expect(
      await screen.findByRole("heading", {
        name: "System status and capabilities",
      }),
    ).toBeInTheDocument();
  });

  it("loads provisioned accounts and provisions a selected role", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (
          String(input) === "/api/admin/accounts" &&
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
    render(<AdminSidebarPage selectedNav="Account Provisioning" />);
    expect(
      await screen.findByText("coordinator@example.test"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Account email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Workspace role"), {
      target: { value: "librarian" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByText("Account provisioned.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/accounts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.test", role: "librarian" }),
      }),
    );
  });

  it.each([
    {
      selectedNav: "Account Provisioning",
      loadingLabel: "Loading provisioned accounts",
      successfulResponse: { users: [] },
      successText: "No accounts have been provisioned.",
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
    fireEvent.click(
      screen.getByRole("button", { name: "Edit member@example.test" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Edit member@example.test",
    });
    fireEvent.change(within(dialog).getByLabelText("Role"), {
      target: { value: "admin" },
    });
    fireEvent.change(within(dialog).getByLabelText("Access status"), {
      target: { value: "invited" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await screen.findByText("At least one active administrator must remain."),
    ).toBeInTheDocument();
    await waitFor(() => expect(userRequests).toBeGreaterThan(1));
    expect(screen.getByRole("cell", { name: "Adviser" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Blocked" })).toBeInTheDocument();
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
    fireEvent.click(
      screen.getByRole("button", { name: "Edit member@example.test" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Edit member@example.test",
    });
    fireEvent.change(within(dialog).getByLabelText("Role"), {
      target: { value: "admin" },
    });
    fireEvent.change(within(dialog).getByLabelText("Access status"), {
      target: { value: "invited" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await screen.findByText("Updated member@example.test."),
    ).toBeInTheDocument();
    await waitFor(() => expect(userRequests).toBeGreaterThan(1));
    expect(
      screen.getByRole("cell", { name: "Coordinator" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Blocked" })).toBeInTheDocument();
  });

  it("confirms and deletes a user account", async () => {
    let deleted = false;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          deleted = true;
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify(page(deleted ? [] : [user])));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminSidebarPage selectedNav="All Users" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete member@example.test",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Delete user account" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete user" }));

    expect(
      await screen.findByText("Deleted member@example.test."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/users/${user.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
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

  it("debounces the AllUsers search at 350 ms and resets page to 1", async () => {
    let userRequests = 0;
    const refined = { ...user, email: "anna@example.test" };
    const page1Users = [
      user,
      { ...user, id: "b", email: "second@example.test" },
    ];
    function userParams(input: string | URL | Request) {
      const url = input instanceof Request ? input.url : String(input);
      const sep = url.indexOf("?");
      return new URLSearchParams(sep >= 0 ? url.slice(sep + 1) : "");
    }
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const params = userParams(input);
      const path = (input instanceof Request ? input.url : String(input)).split("?")[0];
      if (path === "/api/admin/users") {
        userRequests += 1;
        if (params.get("search") === "ann") {
          return new Response(
            JSON.stringify({
              data: [refined],
              links: { first: null, last: null, prev: null, next: null },
              meta: {
                current_page: 1,
                from: 1,
                last_page: 1,
                links: [],
                path: "/api/admin/users",
                per_page: 25,
                to: 1,
                total: 1,
              },
            }),
          );
        }
        if (params.get("page") === "2") {
          return new Response(
            JSON.stringify({
              data: [
                { ...user, id: "c", email: "page2@example.test" },
              ],
              links: {
                first: null,
                last: null,
                prev: "/api/admin/users?page=1",
                next: null,
              },
              meta: {
                current_page: 2,
                from: 3,
                last_page: 2,
                links: [],
                path: "/api/admin/users",
                per_page: 25,
                to: 3,
                total: 3,
              },
            }),
          );
        }
        return new Response(
          JSON.stringify({
            data: page1Users,
            links: {
              first: null,
              last: null,
              prev: null,
              next: "/api/admin/users?page=2",
            },
            meta: {
              current_page: 1,
              from: 1,
              last_page: 2,
              links: [],
              path: "/api/admin/users",
              per_page: 25,
              to: 2,
              total: 3,
            },
          }),
        );
      }
      return new Response(JSON.stringify(systemStatusResponse));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminSidebarPage selectedNav="All Users" />);
    expect(
      await screen.findByText("member@example.test"),
    ).toBeInTheDocument();
    expect(screen.getByText("second@example.test")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByText("page2@example.test"),
    ).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2", { exact: false })).toBeInTheDocument();
    const requestsAfterPage2 = userRequests;

    vi.useFakeTimers({ shouldAdvanceTime: true });

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "ann" },
    });
    expect(screen.getByLabelText("Search")).toHaveValue("ann");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(userRequests).toBe(requestsAfterPage2);

    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(userRequests).toBeGreaterThan(requestsAfterPage2);

    const searchCall = fetchMock.mock.calls.find(
      ([input]) => userParams(input).get("search") === "ann",
    );
    expect(searchCall).toBeDefined();
    expect(userParams(searchCall![0]).get("page")).not.toBe("2");

    vi.useRealTimers();
  });
});
