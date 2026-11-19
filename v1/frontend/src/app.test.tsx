import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { within } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import RoleWorkspace from "./RoleWorkspaces";
import { ApiError, type RoleDashboard } from "./api";
import { defaultUserSession, roleConfigs } from "./data";
import { type InitialState } from "./ssr";
import type { ResearchRecord, Role } from "./types";

const reviewedRecord: ResearchRecord = {
  id: "900",
  title: "API ARCHIVED STUDY",
  authors: "First API Author, Second API Author",
  year: 2026,
  institutionName: "API College",
  institutionLocation: "Tangub City",
  degreeProgram: "API Program",
  institute: "API Academic Unit",
  program: "API Program",
  abstract: "A public repository response.",
  keywords: ["api", "repository"],
  researchStage: "Completed",
  manuscriptDate: "June 2026",
  abstractProvenance: "Imported public metadata.",
};

const repositoryResource = {
  id: 900,
  title: reviewedRecord.title,
  authors: [
    {
      author_name: "Second API Author",
      author_order: 2,
      is_corresponding_author: false,
    },
    {
      author_name: "First API Author",
      author_order: 1,
      is_corresponding_author: true,
    },
  ],
  publication_year: 2026,
  institution_name: "API College",
  institution_location: "Tangub City",
  institute: "API Academic Unit",
  degree_program: "API Program",
  abstract: "A public repository response.",
  keywords: "api, repository",
  manuscript_date_label: "June 2026",
  abstract_provenance: "Imported public metadata.",
  research_stage: "completed",
};

beforeAll(() => {
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/auth/session") {
        return new Response(
          JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (String(input) === "/api/repository?per_page=1000") {
        return new Response(
          JSON.stringify({ data: [repositoryResource], links: { next: null } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    }),
  );
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public catalog", () => {
  it("shows the authenticated profile instead of sign-in on the landing page", async () => {
    const user = {
      email: "ada@example.test",
      role: "researcher" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Ada",
      middleName: null,
      lastName: "Lovelace",
      studentEmployeeId: "2026-001",
      displayName: "Ada Lovelace",
      profilePhotoUrl: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/profile") {
          return new Response(JSON.stringify({ user }));
        }
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );

    const { container } = render(
      <App
        initialState={{
          version: 1,
          url: { pathname: "/", search: "" },
          session: { status: "authenticated", user },
          repository: { status: "ready", records: [reviewedRecord] },
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(
      screen.queryByText("or continue to your workspace"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open your workspace" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".hero")).toHaveClass("hero-authenticated");
    fireEvent.click(
      screen.getByRole("button", { name: "Open profile for Ada Lovelace" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Edit profile" }),
    ).toBeInTheDocument();
  });

  it("opens profile editing from the workspace sidebar", async () => {
    window.history.replaceState({}, "", "/app");
    const user = {
      email: "ada@example.test",
      role: "researcher" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Ada",
      middleName: null,
      lastName: "Lovelace",
      studentEmployeeId: "2026-001",
      displayName: "Ada Lovelace",
      profilePhotoUrl: null,
    };
    render(
      <App
        initialState={{
          version: 1,
          url: { pathname: "/app", search: "" },
          session: { status: "authenticated", user },
          repository: { status: "ready", records: [] },
        }}
      />,
    );

    const sidebar = document.querySelector(".shelf-rail");
    expect(sidebar).not.toBeNull();
    expect(
      within(sidebar as HTMLElement).getByText("Ada Lovelace"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open profile for Ada Lovelace" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Edit profile" }),
    ).toBeInTheDocument();
  });

  it("displays API metadata using the Laravel author resource shape", async () => {
    window.history.replaceState({}, "", "/catalog");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: reviewedRecord.title }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    expect(
      screen.getByText("First API Author, Second API Author"),
    ).toBeInTheDocument();
    expect(screen.getByText("Final binding date")).toBeInTheDocument();
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getAllByText("Search to calculate")).toHaveLength(2);
    expect(screen.queryByText("Research stage")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Imported public metadata."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/source file/i)).not.toBeInTheDocument();
  });

  it("shows no catalog studies when the API returns an empty collection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/auth/session")
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401 },
          );
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    render(<App />);
    expect(
      await screen.findByText("No public catalog records are available."),
    ).toBeInTheDocument();
    expect(screen.queryByText("API ARCHIVED STUDY")).not.toBeInTheDocument();
  });

  it("shows an unavailable message instead of a fallback when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/auth/session")
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401 },
          );
        return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "public catalog is unavailable",
    );
    expect(screen.queryByText("API ARCHIVED STUDY")).not.toBeInTheDocument();
  });

  it("requires direct catalog callers to provide reviewed record fixtures", () => {
    render(
      <CatalogPage
        onSignIn={vi.fn()}
        navigate={vi.fn()}
        records={[reviewedRecord]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: reviewedRecord.title }),
    ).toBeInTheDocument();
  });
});

describe("role workspaces", () => {
  const cases: Array<[Exclude<Role, "researcher">, RegExp, string, string]> = [
    ["admin", /Dashboard/, "recent_research", "Recent research"],
    ["adviser", /Dashboard/, "assigned_reviews", "Assigned reviews"],
    ["instructor", /Dashboard/, "title_proposals", "Title proposals"],
    ["panel", /Dashboard/, "repository_references", "Repository references"],
    [
      "statistician",
      /Dashboard/,
      "completed_references",
      "Completed references",
    ],
    [
      "coordinator",
      /Program Overview/,
      "active_instructors",
      "Active instructors",
    ],
    ["librarian", /Dashboard/, "repository_records", "Repository records"],
    [
      "research-office",
      /Institutional research dashboard/,
      "submission_queue",
      "Submission queue",
    ],
  ];

  const unavailableKey: Record<Exclude<Role, "researcher">, string> = {
    admin: "audit_events",
    adviser: "revision_requests",
    instructor: "pending_reviews",
    panel: "assigned_manuscripts",
    statistician: "methodology_reviews",
    coordinator: "schedules",
    librarian: "archiving_queue",
    "research-office": "pending_archiving",
    research_editor: "assigned_reviews",
  };

  const dashboardFor = (
    role: Exclude<Role, "researcher">,
    readyKey: string,
  ): RoleDashboard => ({
    schema_version: 1,
    role,
    sections: [
      {
        key: readyKey,
        state: "ready",
        total: 7,
        reason: null,
        items: [
          {
            research_document_id: 77,
            title: `${role} API RECORD`,
            research_stage: "title_proposal",
            submission_status: "under_review",
            archive_status: "pending_archiving",
            visibility: "private",
            publication_year: 2026,
            updated_at: "2026-08-18T12:00:00.000000Z",
          },
        ],
      },
      {
        key: unavailableKey[role],
        state: "unavailable",
        total: null,
        reason: "not_modeled",
        items: [],
      },
    ],
  });

  const dashboardScopeFor = (role: Role) => `${role}:fixture@example.test`;

  it("uses the reduced staff sidebar navigation", () => {
    const navFor = (role: Role) =>
      roleConfigs.find((config) => config.id === role)?.nav;

    expect(navFor("instructor")).toEqual([
      "Dashboard",
      "My Sections",
      "User Logs",
    ]);

    expect(navFor("adviser")).toEqual([
      "Dashboard",
      "Assigned Research",
      "User Logs",
    ]);

    expect(navFor("panel")).toEqual([
      "Dashboard",
      "Assigned Research",
      "Repository",
      "User Logs",
    ]);

    expect(navFor("statistician")).toEqual([
      "Dashboard",
      "Assigned Research",
      "Repository",
      "User Logs",
    ]);

    expect(navFor("librarian")).toEqual([
      "Dashboard",
      "Assigned Research",
      "Repository",
      "User Logs",
    ]);

    expect(navFor("research_editor")).toEqual([
      "Dashboard",
      "Assigned Research",
      "Repository",
      "User Logs",
    ]);
  });

  it("exposes every role destination through the workspace menu", async () => {
    const activeSession = {
      email: "researcher@example.test",
      role: "researcher" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Research",
      middleName: null,
      lastName: "Student",
      studentEmployeeId: null,
      displayName: "Research Student",
      profilePhotoUrl: null,
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      }

      return new Response(
        JSON.stringify({
          data: { schema_version: 1, role: "researcher", sections: [] },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open workspace navigation" }),
    );

    const menu = screen.getByRole("navigation", {
      name: "Researcher workspace navigation",
    });
    expect(menu).toHaveTextContent("My Research");
    expect(menu).not.toHaveTextContent("Create Research");
    expect(menu).toHaveTextContent("Similarity Check");
    expect(menu).not.toHaveTextContent("Feedback & Revisions");
    expect(menu).not.toHaveTextContent("Research Progress");
    expect(menu).not.toHaveTextContent("Notifications");
    expect(menu).not.toHaveTextContent("Profile");
    fireEvent.click(
      within(menu).getByRole("button", { name: "Similarity Check" }),
    );
    expect(
      within(menu).getByRole("button", { name: "Title Checker" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("button", { name: "Content Checker" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(menu).getByRole("button", { name: "Title Checker" }),
    );
    expect(menu).not.toBeInTheDocument();
  });

  it("gives Research Office the same similarity checker submenu", async () => {
    const session = {
      email: "office@example.test",
      role: "research-office" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Research",
      middleName: null,
      lastName: "Office",
      studentEmployeeId: null,
      displayName: "Research Office",
      profilePhotoUrl: null,
    };
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = String(input);
        if (path === "/api/notifications") {
          return new Response(
            JSON.stringify({ data: [], links: { next: null } }),
          );
        }
        if (/^\/api\/office\/institutes\/[^/]+\/studies$/.test(path)) {
          return new Response(JSON.stringify({ data: [] }));
        }
        return new Response(
          JSON.stringify({
            data: {
              schema_version: 1,
              role: "research-office",
              sections: [],
            },
          }),
        );
      }),
    );

    render(<Dashboard session={session} navigate={navigate} />);
    const navigation = screen.getByRole("navigation", {
      name: "Research Office navigation",
    });
    fireEvent.click(
      within(navigation).getByRole("button", { name: "Similarity Check" }),
    );
    expect(
      within(navigation).getByRole("button", { name: "Title Checker" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("button", { name: "Content Checker" }),
    ).toBeInTheDocument();
    expect(
      within(navigation)
        .getByRole("button", { name: "Title Checker" })
        .querySelector("svg"),
    ).toBeInTheDocument();
    expect(
      within(navigation)
        .getByRole("button", { name: "Content Checker" })
        .querySelector("svg"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(navigation).getByRole("button", { name: "Content Checker" }),
    );
    expect(navigate).toHaveBeenCalledWith(
      "/app/research-office/similarity/content",
    );
  });

  it("routes Research Office sidebar pages away from the similarity checker", async () => {
    const session = {
      email: "office@example.test",
      role: "research-office" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Research",
      middleName: null,
      lastName: "Office",
      studentEmployeeId: null,
      displayName: "Research Office",
      profilePhotoUrl: null,
    };
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                schema_version: 1,
                role: "research-office",
                sections: [],
              },
            }),
          ),
      ),
    );

    render(
      <Dashboard
        session={session}
        navigate={navigate}
        initialNav="Similarity Check"
        initialSimilarityMode="content"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage Repository" }));

    expect(navigate).toHaveBeenCalledWith(
      "/app/research-office/manage-repository",
    );
  });

  it("restores a routed Research Office sidebar page", async () => {
    const session = {
      email: "office@example.test",
      role: "research-office" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Research",
      middleName: null,
      lastName: "Office",
      studentEmployeeId: null,
      displayName: "Research Office",
      profilePhotoUrl: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).startsWith("/api/office/repository?")) {
          return new Response(
            JSON.stringify({ data: [], links: { next: null }, meta: {} }),
          );
        }
        return new Response(
          JSON.stringify({
            data: { schema_version: 1, role: "research-office", sections: [] },
          }),
        );
      }),
    );

    render(
      <App
        initialState={{
          version: 1,
          url: {
            pathname: "/app/research-office/manage-repository",
            search: "",
          },
          session: { status: "authenticated", user: session },
          repository: { status: "ready", records: [] },
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Manage Repository" }),
    ).toBeInTheDocument();
  });

  it("leaves instructor section routes when another sidebar page is selected", async () => {
    const session = {
      email: "instructor@example.test",
      role: "instructor" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Research",
      middleName: null,
      lastName: "Instructor",
      studentEmployeeId: null,
      displayName: "Research Instructor",
      profilePhotoUrl: null,
    };
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications") {
          return new Response(
            JSON.stringify({ data: [], links: { next: null } }),
          );
        }
        if (String(input) === "/api/instructor/sections") {
          return new Response(JSON.stringify({ data: [] }));
        }
        return new Response(
          JSON.stringify({
            data: { schema_version: 1, role: "instructor", sections: [] },
          }),
        );
      }),
    );

    render(
      <Dashboard
        session={session}
        navigate={navigate}
        initialNav="My Sections"
        instructorSectionsRoute
        instructorSectionId="7"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "User Logs" }));
    expect(navigate).toHaveBeenCalledWith("/app/instructor/user-logs");

    fireEvent.click(
      screen.getByRole("button", { name: "Open workspace navigation" }),
    );
    const menu = screen.getByRole("navigation", {
      name: "Research Instructor workspace navigation",
    });
    fireEvent.click(within(menu).getByRole("button", { name: "My Sections" }));
    expect(navigate).toHaveBeenCalledWith("/app/instructor/sections");
  });

  it("opens a researcher record from My Submissions without a refresh", async () => {
    window.history.replaceState({}, "", "/app");
    const session = {
      email: "researcher@example.test",
      role: "researcher" as const,
      accessStatus: "active" as const,
      isAdmin: false,
      firstName: "Research",
      middleName: null,
      lastName: "Student",
      studentEmployeeId: null,
      displayName: "Research Student",
      profilePhotoUrl: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/notifications")
          return new Response(JSON.stringify({ data: [] }));
        if (url === "/api/dashboard?role=researcher")
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "researcher", sections: [] },
            }),
          );
        if (url.startsWith("/api/research?") && url.includes("mine=1"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 77,
                  title: "Open without refresh",
                  submission_status: "draft",
                  archive_status: "not_archived",
                  research_stage: "ongoing",
                  submitted_at: null,
                },
              ],
              meta: { current_page: 1, last_page: 1, total: 1 },
            }),
          );
        if (url === "/api/research/77")
          return new Response(
            JSON.stringify({
              data: {
                id: 77,
                title: "Open without refresh",
                submission_status: "draft",
                archive_status: "not_archived",
                research_stage: "ongoing",
                abstract: null,
                keywords: null,
                publication_year: null,
                authors: [],
                submitted_at: null,
              },
            }),
          );
        if (url.includes("/api/research/77/"))
          return new Response(JSON.stringify({ data: [] }));
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );

    const { unmount } = render(
      <App
        initialState={{
          version: 1,
          url: { pathname: "/app", search: "" },
          session: { status: "authenticated", user: session },
          repository: { status: "ready", records: [] },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "My Research" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open research folder Open without refresh",
      }),
    );

    expect(window.location.pathname).toBe("/research/77");
    expect(
      screen.queryByRole("heading", { name: /Find the study/ }),
    ).not.toBeInTheDocument();
    unmount();
  });

  const readyProps = (role: Exclude<Role, "researcher">, key: string) => ({
    role,
    selectNav: vi.fn(),
    navigate: vi.fn(),
    dashboardScope: dashboardScopeFor(role),
    dashboardState: {
      scope: dashboardScopeFor(role),
      status: "ready" as const,
      dashboard: dashboardFor(role, key),
    },
    onRetry: vi.fn(),
  });

  const statisticianProjection = {
    schema_version: 1 as const,
    counts: {
      assigned: 4,
      pending: 1,
      in_review: 1,
      for_sign_off: 1,
      completed: 2,
    },
    workload: [
      {
        research_document_id: 71,
        title: "Pending methodology study with a complete accessible title",
        research_stage: "proposal",
        submission_status: "under_review",
        review_status: "pending" as const,
        due_at: null,
        started_at: null,
        completed_at: null,
        updated_at: "2026-11-14T08:00:00Z",
      },
      {
        research_document_id: 72,
        title: "Active methodology review",
        research_stage: "ongoing",
        submission_status: "under_review",
        review_status: "in_progress" as const,
        due_at: "2026-11-30T08:00:00Z",
        started_at: "2026-11-10T08:00:00Z",
        completed_at: null,
        updated_at: "2026-11-15T08:00:00Z",
      },
    ],
    workload_status: { pending: 1, in_review: 1, completed: 2 },
    activity: {
      months: [
        { key: "2026-06", label: "Jun", started: 0, completed: 0 },
        { key: "2026-07", label: "Jul", started: 1, completed: 0 },
        { key: "2026-08", label: "Aug", started: 1, completed: 1 },
        { key: "2026-09", label: "Sep", started: 0, completed: 0 },
        { key: "2026-10", label: "Oct", started: 1, completed: 1 },
        { key: "2026-11", label: "Nov", started: 1, completed: 0 },
      ],
    },
    recent_activity: [
      {
        id: "newer",
        research_document_id: 72,
        title: "Active methodology review",
        type: "review_started" as const,
        occurred_at: "2026-11-15T08:00:00Z",
      },
      {
        id: "older",
        research_document_id: 71,
        title: "Pending methodology study",
        type: "study_assigned" as const,
        occurred_at: "2026-11-14T08:00:00Z",
      },
    ],
  };

  const librarianProjection = {
    schema_version: 1 as const,
    counts: {
      archiving_queue: 2,
      metadata_validation: 1,
      repository_records: 14,
      archived_this_month: 3,
    },
    queue: [
      {
        research_document_id: 81,
        title: "Pending librarian review",
        submitted_by: "Ada Researcher",
        research_stage: "completed",
        status: "pending" as const,
        updated_at: "2026-11-15T08:00:00Z",
      },
      {
        research_document_id: 82,
        title: "Archive ready record",
        submitted_by: "Grace Researcher",
        research_stage: "completed",
        status: "ready" as const,
        updated_at: "2026-11-14T08:00:00Z",
      },
    ],
    queue_status: { pending: 1, validating: 0, ready: 1 },
    activity: {
      six_months: {
        months: [
          { key: "2026-06", label: "Jun", archived: 0, returned: 0 },
          { key: "2026-07", label: "Jul", archived: 1, returned: 0 },
          { key: "2026-08", label: "Aug", archived: 0, returned: 1 },
          { key: "2026-09", label: "Sep", archived: 1, returned: 0 },
          { key: "2026-10", label: "Oct", archived: 1, returned: 0 },
          { key: "2026-11", label: "Nov", archived: 3, returned: 0 },
        ],
      },
      twelve_months: {
        months: Array.from({ length: 12 }, (_, index) => ({
          key: `2025-${String(index + 1).padStart(2, "0")}`,
          label: `M${index + 1}`,
          archived: index === 11 ? 1 : 0,
          returned: 0,
        })),
      },
    },
    recent_activity: [
      {
        id: "newer",
        research_document_id: 82,
        title: "Archive ready record",
        type: "archiving_review_completed" as const,
        occurred_at: "2026-11-15T08:00:00Z",
      },
      {
        id: "older",
        research_document_id: 81,
        title: "Pending librarian review",
        type: "record_returned" as const,
        occurred_at: "2026-11-14T08:00:00Z",
      },
    ],
  };

  it("renders the combined librarian dashboard with scoped filters and actions", () => {
    const navigate = vi.fn();
    const dashboard = dashboardFor("librarian", "repository_records");
    const { container } = render(
      <RoleWorkspace
        {...readyProps("librarian", "repository_records")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("librarian"),
          status: "ready",
          dashboard: { ...dashboard, librarian: librarianProjection },
        }}
      />,
    );

    expect(
      screen.getByText(
        "Manage archiving requests, validate repository metadata, and monitor collection activity.",
      ),
    ).toBeInTheDocument();
    for (const [label, value] of [
      ["Archiving queue", "2"],
      ["Metadata validation", "1"],
      ["Repository records", "14"],
      ["Archived this month", "3"],
    ]) {
      const kpiGrid = container.querySelector<HTMLElement>(
        ".librarian-kpi-grid",
      )!;
      expect(
        within(kpiGrid).getByRole("heading", { name: label }).parentElement,
      ).toHaveTextContent(value);
    }
    expect(container.querySelectorAll(".dashboard-kpi-card")).toHaveLength(4);
    expect(screen.getByTestId("librarian-queue-card")).toContainElement(
      screen.getByRole("heading", { name: "Queue status" }),
    );
    expect(
      screen.getByTestId("librarian-recent-activity-card"),
    ).toContainElement(
      screen.getByRole("heading", { name: "Recent activity" }),
    );
    expect(screen.getByText("Archiving review completed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    const queueCard = screen.getByTestId("librarian-queue-card");
    expect(
      within(queueCard).getByText("Archive ready record"),
    ).toBeInTheDocument();
    expect(
      within(queueCard).queryByText("Pending librarian review"),
    ).not.toBeInTheDocument();
    fireEvent.click(within(queueCard).getByRole("button", { name: "Open" }));
    expect(navigate).toHaveBeenCalledWith("/research/82");

    expect(
      screen.queryByRole("heading", { name: "Repository activity" }),
    ).not.toBeInTheDocument();
  });

  it("renders compact librarian empty states", () => {
    const dashboard = dashboardFor("librarian", "repository_records");
    render(
      <RoleWorkspace
        {...readyProps("librarian", "repository_records")}
        dashboardState={{
          scope: dashboardScopeFor("librarian"),
          status: "ready",
          dashboard: {
            ...dashboard,
            librarian: {
              ...librarianProjection,
              counts: {
                archiving_queue: 0,
                metadata_validation: 0,
                repository_records: 0,
                archived_this_month: 0,
              },
              queue: [],
              queue_status: { pending: 0, validating: 0, ready: 0 },
              activity: {
                six_months: {
                  months: librarianProjection.activity.six_months.months.map(
                    (month) => ({ ...month, archived: 0, returned: 0 }),
                  ),
                },
                twelve_months: librarianProjection.activity.twelve_months,
              },
              recent_activity: [],
            },
          },
        }}
      />,
    );

    expect(
      screen.getByText("No studies are currently awaiting librarian review."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No active archiving requests."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No recent librarian activity."),
    ).toBeInTheDocument();
  });

  it("renders the scoped statistician dashboard and filters its current workload", () => {
    const navigate = vi.fn();
    const dashboard = dashboardFor("statistician", "methodology_reviews");
    render(
      <RoleWorkspace
        {...readyProps("statistician", "methodology_reviews")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "ready",
          dashboard: { ...dashboard, statistician: statisticianProjection },
        }}
      />,
    );

    expect(
      screen.getByText(
        "Overview of your assigned studies, workload, and recent activity.",
      ),
    ).toBeInTheDocument();
    for (const [label, value] of [
      ["Assigned studies", "4"],
      ["Pending reviews", "1"],
      ["For sign-off", "1"],
      ["Completed", "2"],
    ]) {
      expect(
        screen.getByRole("heading", { name: label }).parentElement,
      ).toHaveTextContent(value);
    }
    expect(screen.queryByText("Completed references")).not.toBeInTheDocument();
    expect(screen.getByText("No due date")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /1 pending, 1 in review, 2 completed/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Review started")).toBeInTheDocument();
    const activityItems = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!
      .querySelectorAll("li");
    expect(activityItems[0]).toHaveTextContent("Active methodology review");

    fireEvent.click(screen.getByRole("button", { name: "Pending" }));
    const workloadCard = screen
      .getByRole("heading", { name: "Current workload" })
      .closest("section")!;
    expect(
      within(workloadCard).getByText(
        "Pending methodology study with a complete accessible title",
      ),
    ).toBeInTheDocument();
    expect(
      within(workloadCard).queryByText("Active methodology review"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(workloadCard).getByRole("button", { name: "Review" }),
    );
    expect(navigate).toHaveBeenCalledWith("/research/71");

    fireEvent.click(screen.getByRole("button", { name: "In review" }));
    expect(
      within(workloadCard).getByText("Active methodology review"),
    ).toBeInTheDocument();
    fireEvent.click(within(workloadCard).getByRole("button", { name: "Open" }));
    expect(navigate).toHaveBeenCalledWith("/research/72");
  });

  it("renders compact statistician dashboard empty states", () => {
    const dashboard = dashboardFor("statistician", "methodology_reviews");
    render(
      <RoleWorkspace
        {...readyProps("statistician", "methodology_reviews")}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "ready",
          dashboard: {
            ...dashboard,
            statistician: {
              ...statisticianProjection,
              counts: {
                assigned: 0,
                pending: 0,
                in_review: 0,
                for_sign_off: 0,
                completed: 0,
              },
              workload: [],
              workload_status: { pending: 0, in_review: 0, completed: 0 },
              activity: {
                months: statisticianProjection.activity.months.map((month) => ({
                  ...month,
                  started: 0,
                  completed: 0,
                })),
              },
              recent_activity: [],
            },
          },
        }}
      />,
    );

    expect(
      screen.getByText("No methodology reviews are currently assigned to you."),
    ).toHaveClass("dashboard-compact-empty");
    expect(
      screen.getByText("No workload status is available."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No review activity in the last 6 months."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No recent statistician activity."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Review activity for the last six months"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No review activity in the last 6 months."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No review activity in the last 6 months.")
        .parentElement,
    ).toHaveClass("statistician-activity-empty");
  });

  it("combines statistician workload and activity sections without changing their data", () => {
    const dashboard = dashboardFor("statistician", "methodology_reviews");
    const props = readyProps("statistician", "methodology_reviews");
    const { container, rerender } = render(
      <RoleWorkspace
        {...props}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "ready",
          dashboard: {
            ...dashboard,
            statistician: {
              ...statisticianProjection,
              workload: statisticianProjection.workload.slice(0, 1),
            },
          },
        }}
      />,
    );

    const workloadCard = screen
      .getByRole("heading", { name: "Current workload" })
      .closest("section")!;
    expect(workloadCard).toHaveClass("statistician-workload-card");
    expect(within(workloadCard).getAllByRole("row")).toHaveLength(2);
    expect(
      within(workloadCard).getByText("Showing 1 of 1 assigned study"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".dashboard-kpi-card")).toHaveLength(4);
    expect(
      container.querySelector(".statistician-kpi-grid"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".statistician-dashboard"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".statistician-dashboard-workspace"),
    ).toBeInTheDocument();
    const workloadCombinedCard = screen.getByTestId(
      "statistician-workload-card",
    );
    const activityCombinedCard = screen.getByTestId(
      "statistician-activity-card",
    );
    expect(workloadCombinedCard).toHaveClass("statistician-workload-card");
    expect(activityCombinedCard).toHaveClass("statistician-activity-card");
    expect(workloadCombinedCard).toContainElement(
      screen.getByRole("heading", { name: "Current workload" }),
    );
    expect(workloadCombinedCard).toContainElement(
      screen.getByRole("heading", { name: "Workload status" }),
    );
    expect(activityCombinedCard).toContainElement(
      screen.getByRole("heading", { name: "Activity" }),
    );
    expect(activityCombinedCard).toContainElement(
      screen.getByRole("heading", { name: "Recent activity" }),
    );
    expect(
      workloadCombinedCard.compareDocumentPosition(activityCombinedCard),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.getByRole("button", { name: "Review activity" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Recent activity" }));
    expect(
      screen.getByRole("button", { name: "Recent activity" }),
    ).toHaveAttribute("aria-pressed", "true");

    rerender(
      <RoleWorkspace
        {...props}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "ready",
          dashboard: { ...dashboard, statistician: statisticianProjection },
        }}
      />,
    );

    expect(
      within(
        screen
          .getByRole("heading", { name: "Current workload" })
          .closest("section")!,
      ).getAllByRole("row"),
    ).toHaveLength(3);
    expect(
      within(
        screen
          .getByRole("heading", { name: "Current workload" })
          .closest("section")!,
      ).getByText("Showing 2 of 2 assigned studies"),
    ).toBeInTheDocument();
  });

  it.each(cases)(
    "opens live %s workspace records from its statistic card",
    async (role, heading, readyKey, sectionHeading) => {
      if (role === "coordinator") {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () =>
            new Response(
              JSON.stringify({
                data: {
                  schema_version: 1,
                  institute: { name: "Institute of Computer Studies" },
                  counts: { total_users: 7, total_instructors: 7, total_advisers: 7, total_studies: 7 },
                  adviser_workload: [],
                  repository_status: { total: 7, ongoing: 7, archived: 0 },
                  recent_activity: [],
                },
              }),
            ),
          ),
        );
      }
      render(<RoleWorkspace {...readyProps(role, readyKey)} />);
      expect(
        screen.getByRole("heading", { level: 1, name: heading }),
      ).toBeInTheDocument();
      if (role === "coordinator") {
        expect(await screen.findByText("Total Instructors")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        return;
      }
      const sectionButton = await screen.findByRole("button", {
        name: `View ${sectionHeading}`,
      });
      expect(sectionButton).toBeInTheDocument();
      if (role === "adviser" || role === "instructor") {
        expect(
          screen.getByRole("heading", { level: 2, name: sectionHeading }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole("heading", { level: 2, name: sectionHeading }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("heading", {
            level: 2,
            name: role === "admin" ? "Repository overview" : "Statistics",
          }),
        ).toBeInTheDocument();
      }
      const workloadMeter = screen.queryByRole("meter", {
        name: sectionHeading,
      });
      if (workloadMeter) {
        expect(workloadMeter).toHaveAttribute("aria-valuenow", "7");
        expect(
          screen.getByLabelText(`${sectionHeading}: 7 total`),
        ).toHaveTextContent("7 total");
      }
      fireEvent.click(sectionButton);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(`${role} API RECORD`)).toBeInTheDocument();
      expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    },
  );

  it("groups administrator statistics and analytics by operational meaning", () => {
    const sectionTotals = {
      pending_accounts: 3,
      draft_research: 4,
      submission_queue: 5,
      revision_required: 6,
      pending_title_validations: 7,
      flagged_similarity: 8,
      approved_for_archiving: 9,
      archived_repository: 10,
      recent_research: 11,
    };
    const dashboard = dashboardFor("admin", "submission_queue");
    const { container } = render(
      <RoleWorkspace
        {...readyProps("admin", "submission_queue")}
        dashboardState={{
          scope: dashboardScopeFor("admin"),
          status: "ready",
          dashboard: {
            ...dashboard,
            sections: Object.entries(sectionTotals).map(([key, total]) => ({
              key,
              state: "ready" as const,
              total,
              reason: null,
              items: [],
            })),
            analytics: {
              title: "Research activity",
              period: "Last 6 months",
              series: [
                {
                  key: "created",
                  label: "Created",
                  points: [
                    { key: "2026-09", label: "Sep", value: 2 },
                    { key: "2026-10", label: "Oct", value: 7 },
                  ],
                },
                {
                  key: "archived",
                  label: "Archived",
                  points: [
                    { key: "2026-09", label: "Sep", value: 1 },
                    { key: "2026-10", label: "Oct", value: 3 },
                  ],
                },
              ],
            },
          },
        }}
      />,
    );

    expect(
      container.querySelector(".admin-dashboard-workspace"),
    ).not.toBeNull();
    expect(screen.getByText("Full system access")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Needs attention" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Repository overview" }),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        ".admin-dashboard-statistics-attention .dashboard-stat-card",
      ),
    ).toHaveLength(6);
    expect(
      container.querySelectorAll(
        ".admin-dashboard-statistics-repository .dashboard-stat-card",
      ),
    ).toHaveLength(3);
    expect(
      screen.getByRole("heading", { name: "Current workload" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".dashboard-chart-row")).toHaveLength(6);
    expect(
      screen.queryByRole("meter", { name: "Archived repository" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("meter", { name: "Recent research" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Research activity, Last 6 months" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("18 total activity"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(
        ".admin-dashboard-visualizations .dashboard-analytics",
      ),
    ).not.toBeNull();
  });

  it("renders close monthly activity values as separate zero-based bars", () => {
    const dashboard = dashboardFor("admin", "submission_queue");
    const { container } = render(
      <RoleWorkspace
        {...readyProps("admin", "submission_queue")}
        dashboardState={{
          scope: dashboardScopeFor("admin"),
          status: "ready",
          dashboard: {
            ...dashboard,
            analytics: {
              title: "Research activity",
              period: "Last 6 months",
              series: [
                {
                  key: "created",
                  label: "Created",
                  points: [
                    { key: "2026-08", label: "Aug", value: 0 },
                    { key: "2026-09", label: "Sep", value: 509 },
                  ],
                },
                {
                  key: "archived",
                  label: "Archived",
                  points: [
                    { key: "2026-08", label: "Aug", value: 0 },
                    { key: "2026-09", label: "Sep", value: 512 },
                  ],
                },
              ],
            },
          },
        }}
      />,
    );

    const septemberBars = container.querySelectorAll(
      '.analytics-bar[data-month="2026-09"]',
    );
    const augustBars = container.querySelectorAll(
      '.analytics-bar[data-month="2026-08"]',
    );
    expect(septemberBars).toHaveLength(2);
    expect(septemberBars[0]).toHaveAttribute("data-value", "509");
    expect(septemberBars[1]).toHaveAttribute("data-value", "512");
    expect(septemberBars[0].getAttribute("x")).not.toBe(
      septemberBars[1].getAttribute("x"),
    );
    expect(augustBars).toHaveLength(2);
    augustBars.forEach((bar) => {
      expect(bar).toHaveAttribute("height", "0");
      expect(bar).toHaveAttribute("y", "228");
    });
    const septemberGroup = screen.getByRole("group", {
      name: "Sep, Created: 509, Archived: 512",
    });
    expect(septemberGroup).toHaveAttribute("tabindex", "0");
    fireEvent.focus(septemberGroup);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "SepCreated: 509Archived: 512",
    );
    expect(septemberGroup).toHaveAttribute(
      "aria-describedby",
      "dashboard-activity-tooltip",
    );
    fireEvent.blur(septemberGroup);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(container.querySelector(".analytics-area")).toBeNull();
    expect(container.querySelector(".analytics-line")).toBeNull();
  });

  it("does not render research activity when monthly analytics are missing", () => {
    const dashboard = dashboardFor("admin", "submission_queue");
    render(
      <RoleWorkspace
        {...readyProps("admin", "submission_queue")}
        dashboardState={{
          scope: dashboardScopeFor("admin"),
          status: "ready",
          dashboard: { ...dashboard, analytics: undefined },
        }}
      />,
    );

    expect(
      screen.queryByRole("img", { name: /Research activity/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps all-zero activity series anchored to the baseline", () => {
    const dashboard = dashboardFor("panel", "assigned_manuscripts");
    const { container } = render(
      <RoleWorkspace
        {...readyProps("panel", "assigned_manuscripts")}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: {
            ...dashboard,
            analytics: {
              title: "Research activity",
              period: "Last 6 months",
              series: [
                {
                  key: "created",
                  label: "Created",
                  points: [{ key: "2026-10", label: "Oct", value: 1 }],
                },
                {
                  key: "archived",
                  label: "Archived",
                  points: [{ key: "2026-10", label: "Oct", value: 0 }],
                },
              ],
            },
          },
        }}
      />,
    );

    const bars = container.querySelectorAll(".analytics-bar");
    expect(bars).toHaveLength(2);
    expect(bars[1]).toHaveAttribute("height", "0");
    expect(bars[1]).toHaveAttribute("y", "202");
    const legend = screen.getByLabelText("Chart legend");
    expect(within(legend).getByText("Created")).toBeInTheDocument();
    expect(within(legend).getByText("Archived")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Archived" }),
    ).toBeInTheDocument();
  });

  it("renders the scoped panel dashboard projection", () => {
    const selectNav = vi.fn();
    const props = readyProps("panel", "assigned_manuscripts");
    const { container } = render(
      <RoleWorkspace
        {...props}
        selectNav={selectNav}
        dashboardState={{
          ...props.dashboardState,
          dashboard: {
            ...props.dashboardState.dashboard,
            panel: {
              schema_version: 1,
              counts: { assigned: 7, pending: 3, completed: 4, repository_references: 12 },
              assignments: [
                {
                  research_document_id: 71,
                  title: "Pending panel study",
                  submission_reference: "RN-2026-PANEL01",
                  defense_stage: "proposal",
                  review_status: "pending",
                  updated_at: "2026-08-18T12:00:00.000000Z",
                },
              ],
              recent_activity: [{ id: "evaluation-1", research_document_id: 71, title: "Pending panel study", type: "evaluation_submitted", occurred_at: "2026-08-18T12:00:00.000000Z" }],
            },
          },
        }}
      />,
    );

    expect(
      container.querySelector(".panel-dashboard-workspace"),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Current assignments" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("panel-dashboard"),
    ).toBeInTheDocument();
    expect(screen.getByText("RN-2026-PANEL01")).toBeInTheDocument();
    expect(screen.getByText("Proposal Defense")).toBeInTheDocument();
    expect(screen.getByText("Evaluation submitted")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open review" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse repository" }));

    expect(selectNav).toHaveBeenNthCalledWith(1, "Assigned Research");
    expect(selectNav).toHaveBeenNthCalledWith(2, "Repository");
    expect(container.querySelector(".dashboard-analytics")).toBeNull();
  });

  it("hides legacy schedules and duplicate flags on the coordinator overview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              schema_version: 1,
              institute: { name: "Institute of Computer Studies" },
              counts: { total_users: 0, total_instructors: 0, total_advisers: 0, total_studies: 0 },
              adviser_workload: [],
              repository_status: { total: 0, ongoing: 0, archived: 0 },
              recent_activity: [],
            },
          }),
        ),
      ),
    );
    const coordinator = dashboardFor("coordinator", "active_instructors");
    render(
      <RoleWorkspace
        {...readyProps("coordinator", "active_instructors")}
        dashboardState={{
          scope: dashboardScopeFor("coordinator"),
          status: "ready",
          dashboard: {
            ...coordinator,
            sections: [
              ...coordinator.sections,
              {
                key: "schedules",
                state: "ready",
                total: 0,
                reason: null,
                items: [],
              },
              {
                key: "duplicate_flags",
                state: "ready",
                total: 0,
                reason: null,
                items: [],
              },
            ],
          },
        }}
      />,
    );

    expect(await screen.findByText("Total Instructors")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View Schedules" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View Duplicate flags" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("meter", { name: "Schedules" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("meter", { name: "Duplicate flags" }),
    ).not.toBeInTheDocument();
  });

  it("merges the research office navigation and shows institute totals below analytics", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const officeNav = roleConfigs.find(
      (config) => config.id === "research-office",
    )?.nav;
    expect(officeNav).toEqual([
      "Dashboard",
      "Assigned Research",
      "Similarity Check",
      "Manage Repository",
      "User & Role Management",
      "Reports & Exports",
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = String(input);
        if (path === "/api/office/institutes/IHS/studies") {
          return new Response(
            JSON.stringify({
              data: [
                { id: 42, year: "2026", title: "Community Health Study" },
                { id: 43, year: "2025", title: "Nutrition Research" },
              ],
            }),
          );
        }
        if (/^\/api\/office\/institutes\/[^/]+\/studies$/.test(path)) {
          return new Response(JSON.stringify({ data: [] }));
        }
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );

    const selectNav = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("research-office", "submission_queue")}
        selectNav={selectNav}
        dashboardState={{
          scope: dashboardScopeFor("research-office"),
          status: "ready",
          dashboard: {
            ...dashboardFor("research-office", "submission_queue"),
            analytics: {
              title: "Research activity",
              period: "Last six months",
              series: [],
            },
            institutional_overview: [
              { institute: "Institute of Health Sciences", total: 4 },
            ],
          },
        }}
      />,
    );

    const analytics = screen.getByText("Research analytics");
    expect(
      screen.getByRole("button", { name: "View Submission queue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Research manuscripts by institute" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Current workload" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Quick actions" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage Repository" }));
    expect(selectNav).toHaveBeenCalledWith("Manage Repository");
    expect(screen.getByLabelText("4 total")).toBeInTheDocument();
    const overview = await screen.findByRole("heading", {
      name: "Institutional Overview",
    });
    expect(
      analytics.compareDocumentPosition(overview) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      await screen.findByLabelText(
        "Institute of Health Sciences: 2 research records",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Institute of Business and Financial Management: 0 research records",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /research records$/ }),
    ).toHaveLength(6);

    fireEvent.click(
      screen.getByLabelText("Institute of Health Sciences: 2 research records"),
    );
    const studyLink = await screen.findByRole("link", {
      name: /Community Health Study/,
    });
    expect(studyLink).toHaveAttribute("target", "_blank");
    expect(studyLink).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/api/office/institutes/IHS/studies/2026/Community%20Health%20Study/open?id=42",
      ),
    );
    const search = screen.getByRole("searchbox", {
      name: "Search Institute of Health Sciences studies",
    });
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "nutrition" } });
    expect(screen.getByText("Community Health Study")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(
      screen.queryByText("Community Health Study"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Nutrition Research")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "missing study" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(
      screen.getByText("No studies match your search."),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders every administrator dashboard section and opens internal records", () => {
    const navigate = vi.fn();
    const adminSections = [
      ["pending_accounts", "Pending accounts"],
      ["draft_research", "Draft research"],
      ["submission_queue", "Submission queue"],
      ["revision_required", "Revision required"],
      ["pending_title_validations", "Pending title validations"],
      ["flagged_similarity", "Flagged similarity"],
      ["approved_for_archiving", "Approved for archiving"],
      ["archived_repository", "Archived repository"],
      ["recent_research", "Recent research"],
    ];
    render(
      <RoleWorkspace
        {...readyProps("admin", "recent_research")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("admin"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "admin",
            sections: adminSections.map(([key], index) => ({
              key,
              state: "ready" as const,
              total: 1,
              reason: null,
              items: [
                {
                  research_document_id: index + 1,
                  title: `ADMIN RECORD ${index + 1}`,
                  research_stage: "ongoing",
                  submission_status: "submitted",
                  archive_status: "not_archived",
                  visibility: "private",
                  publication_year: null,
                  updated_at: null,
                },
              ],
            })),
          },
        }}
      />,
    );

    adminSections.forEach(([, label]) => {
      expect(
        screen.getByRole("button", { name: `View ${label}` }),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText("1")).toHaveLength(adminSections.length);
    expect(screen.queryByText("ADMIN RECORD 4")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "View Draft research" }),
    );
    expect(screen.getByText("ADMIN RECORD 2")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open internal record" }),
    );
    expect(navigate).toHaveBeenCalledWith("/research/2");
  });

  it("shows totals and a details action for count-only dashboard cards", () => {
    const selectNav = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("admin", "pending_accounts")}
        selectNav={selectNav}
        dashboardState={{
          scope: dashboardScopeFor("admin"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "admin",
            sections: [
              {
                key: "pending_accounts",
                state: "ready",
                total: 3,
                reason: null,
                items: [],
              },
            ],
          },
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Pending accounts" }),
    );
    expect(
      screen.getByText("3 matching records are available."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(selectNav).toHaveBeenCalledWith("User & Role Management");
  });

  it("uses loading and retry states without a statistician checklist", () => {
    const retry = vi.fn();
    render(
      <RoleWorkspace
        role="statistician"
        selectNav={vi.fn()}
        navigate={vi.fn()}
        dashboardScope={dashboardScopeFor("statistician")}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "loading",
        }}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("region", { busy: true })).toBeInTheDocument();
    expect(screen.queryByText("Methodology checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("Issue sign-off")).not.toBeInTheDocument();

    render(
      <RoleWorkspace
        role="statistician"
        selectNav={vi.fn()}
        navigate={vi.fn()}
        dashboardScope={dashboardScopeFor("statistician")}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "error",
          error: new ApiError(500, "DASHBOARD_UNAVAILABLE"),
        }}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a ready zero count as an empty workspace", () => {
    render(
      <RoleWorkspace
        {...readyProps("adviser", "assigned_reviews")}
        dashboardState={{
          scope: dashboardScopeFor("adviser"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "adviser",
            sections: [
              {
                key: "assigned_reviews",
                state: "ready",
                total: 0,
                reason: null,
                items: [],
              },
            ],
          },
        }}
      />,
    );
    expect(
      within(screen.getByRole("button", { name: "View Assigned reviews" })).getByText("0"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No records are currently available."),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "View Assigned reviews" }),
    );
    expect(
      screen.getByText("No records are currently available."),
    ).toBeInTheDocument();
  });

  it("links public repository previews to a catalog title search", () => {
    const navigate = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("panel", "repository_references")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: {
            ...dashboardFor("panel", "repository_references"),
            sections: [
              {
                ...dashboardFor("panel", "repository_references").sections[0],
                items: [
                  {
                    ...dashboardFor("panel", "repository_references")
                      .sections[0].items[0],
                    title: "Public research & testing",
                    visibility: "public",
                  },
                ],
              },
            ],
          },
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View Repository references" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open public catalog" }),
    );
    expect(navigate).toHaveBeenCalledWith(
      "/catalog?q=Public%20research%20%26%20testing",
    );
    expect(screen.getByText("Public catalog")).toBeInTheDocument();
  });

  it("bounds Unicode catalog queries to 200 code points", () => {
    const navigate = vi.fn();
    const longTitle = "🧪".repeat(250);
    render(
      <RoleWorkspace
        {...readyProps("panel", "repository_references")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: {
            ...dashboardFor("panel", "repository_references"),
            sections: [
              {
                ...dashboardFor("panel", "repository_references").sections[0],
                items: [
                  {
                    ...dashboardFor("panel", "repository_references")
                      .sections[0].items[0],
                    title: longTitle,
                    visibility: "public",
                  },
                ],
              },
            ],
          },
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Repository references" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open public catalog" }),
    );

    const query = new URL(
      navigate.mock.calls[0][0],
      "https://researchnav.test",
    ).searchParams.get("q");
    expect(query).toBe(Array.from(longTitle).slice(0, 200).join(""));
    expect(Array.from(query ?? "")).toHaveLength(200);
  });

  it("does not link registered repository or internal queue previews", () => {
    const { unmount } = render(
      <RoleWorkspace
        {...readyProps("panel", "repository_references")}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: dashboardFor("panel", "repository_references"),
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View Repository references" }),
    );
    expect(screen.getByText("Registered workspace")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open public catalog" }),
    ).not.toBeInTheDocument();
    unmount();

    render(<RoleWorkspace {...readyProps("adviser", "assigned_reviews")} />);
    fireEvent.click(
      screen.getByRole("button", { name: "View Assigned reviews" }),
    );
    expect(screen.getByText("Internal workspace")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Open (record|public catalog)/ }),
    ).not.toBeInTheDocument();
  });

  it("routes the librarian catalog action to the public catalog", () => {
    const librarianNavigate = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("librarian", "repository_records")}
        navigate={librarianNavigate}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Open catalog" })[0]);
    expect(librarianNavigate).toHaveBeenCalledWith("/catalog");
  });

  it("renders live researcher sections from dashboard data", () => {
    const selectNav = vi.fn();
    const { container } = render(
      <RoleWorkspace
        role="researcher"
        selectNav={selectNav}
        navigate={vi.fn()}
        dashboardScope={dashboardScopeFor("researcher")}
        dashboardState={{
          scope: dashboardScopeFor("researcher"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "researcher",
            sections: [
              {
                key: "my_revision_required",
                state: "ready",
                total: 1,
                reason: null,
                items: [
                  {
                    research_document_id: 12,
                    title: "Returned study",
                    research_stage: "ongoing",
                    submission_status: "revision_required",
                    archive_status: "not_archived",
                    visibility: "registered_only",
                    publication_year: 2026,
                    updated_at: "2026-05-02T00:00:00.000Z",
                  },
                ],
              },
            ],
            analytics: {
              title: "Research activity",
              period: "Last 6 months",
              series: [
                {
                  key: "created",
                  label: "Created",
                  points: [
                    { key: "2026-03", label: "Mar", value: 0 },
                    { key: "2026-04", label: "Apr", value: 1 },
                    { key: "2026-05", label: "May", value: 2 },
                    { key: "2026-06", label: "Jun", value: 1 },
                    { key: "2026-07", label: "Jul", value: 3 },
                    { key: "2026-08", label: "Aug", value: 2 },
                  ],
                },
                {
                  key: "archived",
                  label: "Archived",
                  points: [
                    { key: "2026-03", label: "Mar", value: 0 },
                    { key: "2026-04", label: "Apr", value: 0 },
                    { key: "2026-05", label: "May", value: 1 },
                    { key: "2026-06", label: "Jun", value: 0 },
                    { key: "2026-07", label: "Jul", value: 1 },
                    { key: "2026-08", label: "Aug", value: 1 },
                  ],
                },
              ],
            },
          },
        }}
        onRetry={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /My dashboard/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Returned study")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "View Revision required" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Revision required" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Returned study")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Research activity, Last 6 months",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: "Research activity, Last 6 months",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".analytics-bar")).toHaveLength(12);
    expect(container.querySelectorAll(".analytics-area")).toHaveLength(0);
    expect(container.querySelector(".dashboard-analytics")).toBeInTheDocument();
    const activityChart = screen.getByRole("img", {
      name: "Research activity, Last 6 months",
    });
    expect(
      Array.from(
        activityChart.querySelectorAll(".analytics-axis-value"),
        (tick) => tick.textContent,
      ),
    ).toEqual(["4", "2", "0"]);
    const gridY = Array.from(
      activityChart.querySelectorAll(".analytics-grid-line"),
      (line) => Number(line.getAttribute("y1")),
    );
    expect(gridY[1] - gridY[0]).toBe(gridY[2] - gridY[1]);
    expect(screen.getByLabelText("12 total activity")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New submission/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Similarity results")).not.toBeInTheDocument();
  });
});

describe("staff access gate", () => {
  it("blocks a new account until a coordinator assigns access", () => {
    render(<Dashboard session={defaultUserSession} navigate={vi.fn()} />);
    expect(
      screen.getByRole("heading", {
        name: "Your account is awaiting approval.",
      }),
    ).toBeInTheDocument();
  });
});

describe("authenticated notifications", () => {
  const activeSession = {
    email: "researcher@example.test",
    role: "researcher" as const,
    accessStatus: "active" as const,
    isAdmin: false,
    firstName: "Research",
    middleName: null,
    lastName: "Student",
    studentEmployeeId: null,
    displayName: "Research Student",
    profilePhotoUrl: null,
  };
  const notification = {
    id: "f2bc7d6b-28d5-4ebc-8ac3-6d5e7c0b2fc0",
    type: "App\\Notifications\\ResearchActivityNotification",
    event: "RESEARCH_SUBMITTED",
    title: "Research activity",
    message: "Research was submitted for review.",
    details: "Research was submitted for review. · Safe research title",
    research_title: "Safe research title",
    submission_reference: "RN-2026-ABCD1234",
    action_url: "/research/42",
    research_document_id: 42,
    read_at: null,
    created_at: "2026-08-10T12:00:00.000000Z",
  };
  const adviserDashboardResponse = (title: string, id: number) =>
    new Response(
      JSON.stringify({
        data: {
          schema_version: 1,
          role: "adviser",
          sections: [
            {
              key: "assigned_reviews",
              state: "ready",
              total: 1,
              reason: null,
              items: [
                {
                  research_document_id: id,
                  title,
                  research_stage: "title_proposal",
                  submission_status: "under_review",
                  archive_status: "pending_archiving",
                  visibility: "private",
                  publication_year: null,
                  updated_at: null,
                },
              ],
            },
          ],
        },
      }),
    );

  it("keeps the selected workspace when notifications open, retries loading, and blocks external actions", async () => {
    let notificationAttempts = 0;
    const externalNotification = {
      ...notification,
      action_url: "https://outside.example.test/redirect",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications") {
          notificationAttempts += 1;
          return notificationAttempts === 1
            ? new Response(JSON.stringify({ error: "NOTIFICATIONS_DOWN" }), {
                status: 500,
              })
            : new Response(
                JSON.stringify({
                  data: [externalNotification],
                  links: { next: null },
                }),
              );
        }
        if (String(input).endsWith("/read")) {
          return new Response(
            JSON.stringify({
              data: {
                ...externalNotification,
                read_at: "2026-08-10T12:01:00.000000Z",
              },
            }),
          );
        }
        if (String(input) === "/api/dashboard") {
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "researcher", sections: [] },
            }),
          );
        }
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );
    const navigate = vi.fn();
    render(<Dashboard session={activeSession} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notifications are unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).not.toHaveTextContent("1");
    expect(
      screen.queryByText("This shelf is being cataloged."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText(externalNotification.title),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(externalNotification.title));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Notifications" }),
      ).not.toBeInTheDocument(),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("lets an administrator approve an access request from its notification", async () => {
    const administrator = {
      ...activeSession,
      email: "admin@example.test",
      role: "admin" as const,
      isAdmin: true,
    };
    const accessNotification = {
      ...notification,
      event: "ACCESS_REQUEST_SUBMITTED",
      title: "New workspace access request",
      message: "applicant@example.test requested the researcher workspace.",
      details: "applicant@example.test requested the researcher workspace.",
      action_url: "/app",
      research_document_id: null,
      access_request_id: 17,
      applicant_email: "applicant@example.test",
      requested_role: "researcher",
      full_name: "Applicant Name",
      program: "BS Computer Science",
      justification: "Capstone access",
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/notifications")
          return new Response(
            JSON.stringify({
              data: [accessNotification],
              links: { next: null },
            }),
          );
        if (path.endsWith("/read"))
          return new Response(
            JSON.stringify({
              data: { ...accessNotification, read_at: "2026-08-10T12:01:00Z" },
            }),
          );
        if (
          path === "/api/admin/access-requests/17" &&
          init?.method === "PATCH"
        )
          return new Response(
            JSON.stringify({
              data: {
                id: 17,
                status: "approved",
                requested_role: "researcher",
              },
            }),
          );
        if (path === "/api/dashboard")
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "admin", sections: [] },
            }),
          );
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard session={administrator} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    fireEvent.click(await screen.findByText("New workspace access request"));
    expect(
      await screen.findByRole("dialog", { name: "Review access request" }),
    ).toHaveTextContent("Applicant Name");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/notifications/${accessNotification.id}/read`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/access-requests/17",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            decision: "approve",
            granted_role: "researcher",
          }),
        }),
      ),
    );
    expect(
      screen.queryByRole("dialog", { name: "Review access request" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("distinguishes expired sessions from retryable dashboard server failures", async () => {
    const adviser = { ...activeSession, role: "adviser" as const };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications")
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      return new Response(
        JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
        {
          status: 401,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <Dashboard session={adviser} navigate={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session expired. Sign out and sign in again.",
    );
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input) === "/api/notifications"
          ? new Response(JSON.stringify({ data: [], links: { next: null } }))
          : new Response(JSON.stringify({ error: "DASHBOARD_UNAVAILABLE" }), {
              status: 500,
            }),
      ),
    );
    rerender(
      <Dashboard
        session={{ ...adviser, email: "new@example.test" }}
        navigate={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Role workspace data is unavailable (DASHBOARD_UNAVAILABLE).",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("applies successful mark-all responses while reporting partial failures", async () => {
    const second = {
      ...notification,
      id: "34b52180-1b2a-4a06-9f9f-b4c6678ed72c",
      title: "Second activity",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications")
          return new Response(
            JSON.stringify({
              data: [notification, second],
              links: { next: null },
            }),
          );
        if (String(input).includes(notification.id))
          return new Response(
            JSON.stringify({
              data: {
                ...notification,
                read_at: "2026-08-10T12:01:00.000000Z",
              },
            }),
          );
        if (String(input) === "/api/dashboard")
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "researcher", sections: [] },
            }),
          );
        return new Response(JSON.stringify({ error: "MARK_FAILED" }), {
          status: 500,
        });
      }),
    );
    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(await screen.findByText(second.title)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark all notifications as read" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 notification could not be marked as read.",
    );
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).toHaveTextContent("1");
  });

  it("shows an active user no fabricated alerts when the API collection is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications") {
          return new Response(
            JSON.stringify({ data: [], links: { next: null } }),
          );
        }
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );

    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(await screen.findByText("No notifications.")).toBeInTheDocument();
    expect(
      screen.queryByText("Revision feedback received"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Similarity check complete"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Defense schedule updated"),
    ).not.toBeInTheDocument();
  });

  it("requests a role dashboard for a researcher", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      }
      if (String(input) === "/api/dashboard") {
        return new Response(
          JSON.stringify({
            data: {
              schema_version: 1,
              role: "researcher",
              sections: [
                {
                  key: "my_drafts",
                  state: "ready",
                  total: 0,
                  reason: null,
                  items: [],
                },
              ],
            },
          }),
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/unread-count",
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) => String(input) === "/api/dashboard",
        ),
      ).toBe(true);
    });
  });

  it("shows a retryable error instead of mock Researcher data after a server failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications") {
          return new Response(
            JSON.stringify({ data: [], links: { next: null } }),
          );
        }
        return new Response(
          JSON.stringify({ error: "RESEARCH_TABLE_UNAVAILABLE" }),
          { status: 500 },
        );
      }),
    );

    render(<Dashboard session={activeSession} navigate={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Campus Service Announcement and Deadline Management System/,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("loads notifications independently while a staff dashboard is loading", async () => {
    const staffSession = { ...activeSession, role: "adviser" as const };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [notification], links: { next: null } }),
        );
      }
      if (String(input) === "/api/dashboard") {
        return new Response(
          JSON.stringify({
            data: {
              schema_version: 1,
              role: "adviser",
              sections: [],
            },
          }),
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard session={staffSession} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(await screen.findByText(notification.title)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("fails closed for notifications when the active account changes", async () => {
    const adviserA = {
      ...activeSession,
      email: "adviser.a@example.test",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    const sensitiveNotification = {
      ...notification,
      title: "ADVISER A SENSITIVE NOTIFICATION",
      message: "Only adviser A may view this message.",
      details: "Only adviser A may view this message.",
    };
    let notificationRequests = 0;
    let resolveAdviserBNotifications!: (response: Response) => void;
    const adviserBNotifications = new Promise<Response>((resolve) => {
      resolveAdviserBNotifications = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications/unread-count") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              unread_count: notificationRequests === 0 ? 1 : 0,
            }),
          ),
        );
      }
      if (String(input) === "/api/notifications") {
        notificationRequests += 1;
        return notificationRequests === 1
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  data: [sensitiveNotification],
                  links: { next: null },
                }),
              ),
            )
          : adviserBNotifications;
      }
      if (String(input) === "/api/dashboard") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "adviser", sections: [] },
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserA} navigate={vi.fn()} />,
    );
    const notificationButton = screen.getByRole("button", {
      name: "Open notifications",
    });
    await waitFor(() => expect(notificationButton).toHaveTextContent("1"));
    fireEvent.click(notificationButton);
    expect(
      await screen.findByText(sensitiveNotification.title),
    ).toBeInTheDocument();
    expect(screen.getByText(sensitiveNotification.message)).toBeInTheDocument();

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);

    expect(
      screen.queryByText(sensitiveNotification.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(sensitiveNotification.message),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Notifications" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).not.toHaveTextContent("1");

    expect(notificationRequests).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await waitFor(() => expect(notificationRequests).toBe(2));
    resolveAdviserBNotifications(
      new Response(JSON.stringify({ data: [], links: { next: null } })),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open notifications" }),
      ).not.toHaveTextContent("1"),
    );
    expect(
      screen.queryByText(sensitiveNotification.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(sensitiveNotification.message),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("does not apply a stale mark-read response to the next account", async () => {
    const adviserA = {
      ...activeSession,
      email: "adviser.a@example.test",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    const adviserANotification = {
      ...notification,
      title: "ADVISER A NOTIFICATION",
      message: "Adviser A message",
    };
    const adviserBNotification = {
      ...notification,
      title: "ADVISER B NOTIFICATION",
      message: "Adviser B message",
    };
    let notificationRequests = 0;
    let resolveMarked!: (response: Response) => void;
    const marked = new Promise<Response>((resolve) => {
      resolveMarked = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications/unread-count") {
        return Promise.resolve(
          new Response(JSON.stringify({ unread_count: 1 })),
        );
      }
      if (String(input) === "/api/notifications") {
        notificationRequests += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data:
                notificationRequests === 1
                  ? [adviserANotification]
                  : [adviserBNotification],
              links: { next: null },
            }),
          ),
        );
      }
      if (String(input) === `/api/notifications/${notification.id}/read`) {
        return marked;
      }
      if (String(input) === "/api/dashboard") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "adviser", sections: [] },
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const navigate = vi.fn();
    const { rerender } = render(
      <Dashboard session={adviserA} navigate={navigate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(
      await screen.findByText(adviserANotification.title),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(adviserANotification.title));

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);
    expect(notificationRequests).toBe(1);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open notifications" }),
      ).toHaveTextContent("1"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await waitFor(() => expect(notificationRequests).toBe(2));
    expect(
      await screen.findByText(adviserBNotification.title),
    ).toBeInTheDocument();

    await act(async () => {
      resolveMarked(
        new Response(
          JSON.stringify({
            data: {
              ...adviserANotification,
              read_at: "2026-08-10T12:01:00Z",
            },
          }),
        ),
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    });
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).toHaveTextContent("1");
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("fails closed while loading a dashboard for a changed role", async () => {
    const adviserSession = { ...activeSession, role: "adviser" as const };
    const instructorSession = {
      ...activeSession,
      role: "instructor" as const,
    };
    let dashboardRequests = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Promise<Response>(() => undefined);
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        if (dashboardRequests === 1) {
          return new Response(
            JSON.stringify({
              data: {
                schema_version: 1,
                role: "adviser",
                sections: [
                  {
                    key: "assigned_reviews",
                    state: "ready",
                    total: 1,
                    reason: null,
                    items: [
                      {
                        research_document_id: 77,
                        title: "ADVISER ASSIGNMENT",
                        research_stage: "title_proposal",
                        submission_status: "under_review",
                        archive_status: "pending_archiving",
                        visibility: "private",
                        publication_year: null,
                        updated_at: null,
                      },
                    ],
                  },
                ],
              },
            }),
          );
        }
        return new Promise<Response>(() => undefined);
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserSession} navigate={vi.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View Assigned reviews" }),
    );
    expect(await screen.findByText("ADVISER ASSIGNMENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assigned Research" }));

    rerender(<Dashboard session={instructorSession} navigate={vi.fn()} />);

    expect(screen.queryByText("ADVISER ASSIGNMENT")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Loading role workspace",
        busy: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "My Sections" }),
    ).toBeInTheDocument();
  });

  it("ignores stale dashboard responses after role changes", async () => {
    const adviserSession = { ...activeSession, role: "adviser" as const };
    const instructorSession = {
      ...activeSession,
      role: "instructor" as const,
    };
    let resolveAdviserDashboard!: (response: Response) => void;
    let resolveInstructorDashboard!: (response: Response) => void;
    const adviserDashboard = new Promise<Response>((resolve) => {
      resolveAdviserDashboard = resolve;
    });
    const instructorDashboard = new Promise<Response>((resolve) => {
      resolveInstructorDashboard = resolve;
    });
    let dashboardRequests = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], links: { next: null } })),
        );
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        return dashboardRequests === 1 ? adviserDashboard : instructorDashboard;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserSession} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(dashboardRequests).toBe(1));

    rerender(<Dashboard session={instructorSession} navigate={vi.fn()} />);
    await waitFor(() => expect(dashboardRequests).toBe(2));

    resolveAdviserDashboard(
      new Response(
        JSON.stringify({
          data: {
            schema_version: 1,
            role: "adviser",
            sections: [
              {
                key: "assigned_reviews",
                state: "ready",
                total: 1,
                reason: null,
                items: [
                  {
                    research_document_id: 77,
                    title: "STALE ADVISER ASSIGNMENT",
                    research_stage: "title_proposal",
                    submission_status: "under_review",
                    archive_status: "pending_archiving",
                    visibility: "private",
                    publication_year: null,
                    updated_at: null,
                  },
                ],
              },
            ],
          },
        }),
      ),
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await waitFor(() =>
      expect(
        screen.queryByText("STALE ADVISER ASSIGNMENT"),
      ).not.toBeInTheDocument(),
    );

    resolveInstructorDashboard(
      new Response(
        JSON.stringify({
          data: {
            schema_version: 1,
            role: "instructor",
            sections: [
              {
                key: "title_proposals",
                state: "ready",
                total: 1,
                reason: null,
                items: [
                  {
                    research_document_id: 88,
                    title: "CURRENT INSTRUCTOR PROPOSAL",
                    research_stage: "title_proposal",
                    submission_status: "under_review",
                    archive_status: "pending_archiving",
                    visibility: "private",
                    publication_year: null,
                    updated_at: null,
                  },
                ],
              },
            ],
          },
        }),
      ),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "View Title proposals" }),
    );
    expect(
      await screen.findByText("CURRENT INSTRUCTOR PROPOSAL"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("STALE ADVISER ASSIGNMENT"),
    ).not.toBeInTheDocument();
  });

  it("fails closed while loading a dashboard for a different account in the same role", async () => {
    const adviserA = {
      ...activeSession,
      email: " Adviser.A@Example.Test ",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    let dashboardRequests = 0;
    let resolveAdviserB!: (response: Response) => void;
    const adviserBDashboard = new Promise<Response>((resolve) => {
      resolveAdviserB = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], links: { next: null } })),
        );
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        return dashboardRequests === 1
          ? Promise.resolve(
              adviserDashboardResponse("ADVISER A ASSIGNMENT", 77),
            )
          : adviserBDashboard;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserA} navigate={vi.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View Assigned reviews" }),
    );
    expect(await screen.findByText("ADVISER A ASSIGNMENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assigned Research" }));

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);

    expect(screen.queryByText("ADVISER A ASSIGNMENT")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Loading role workspace",
        busy: true,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass(
      "active",
    );
    await waitFor(() => expect(dashboardRequests).toBe(2));

    resolveAdviserB(adviserDashboardResponse("ADVISER B ASSIGNMENT", 88));
    fireEvent.click(
      await screen.findByRole("button", { name: "View Assigned reviews" }),
    );
    expect(await screen.findByText("ADVISER B ASSIGNMENT")).toBeInTheDocument();
    expect(screen.queryByText("ADVISER A ASSIGNMENT")).not.toBeInTheDocument();
  });

  it("ignores a stale same-role dashboard response after the account changes", async () => {
    const adviserA = {
      ...activeSession,
      email: "adviser.a@example.test",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    let resolveAdviserA!: (response: Response) => void;
    let resolveAdviserB!: (response: Response) => void;
    const adviserADashboard = new Promise<Response>((resolve) => {
      resolveAdviserA = resolve;
    });
    const adviserBDashboard = new Promise<Response>((resolve) => {
      resolveAdviserB = resolve;
    });
    let dashboardRequests = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], links: { next: null } })),
        );
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        return dashboardRequests === 1 ? adviserADashboard : adviserBDashboard;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserA} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(dashboardRequests).toBe(1));

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);
    await waitFor(() => expect(dashboardRequests).toBe(2));

    resolveAdviserA(adviserDashboardResponse("STALE ADVISER A ASSIGNMENT", 77));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(
      screen.queryByText("STALE ADVISER A ASSIGNMENT"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Loading role workspace",
        busy: true,
      }),
    ).toBeInTheDocument();

    resolveAdviserB(adviserDashboardResponse("ADVISER B ASSIGNMENT", 88));
    fireEvent.click(
      await screen.findByRole("button", { name: "View Assigned reviews" }),
    );
    expect(await screen.findByText("ADVISER B ASSIGNMENT")).toBeInTheDocument();
    expect(
      screen.queryByText("STALE ADVISER A ASSIGNMENT"),
    ).not.toBeInTheDocument();
  });

  it("renders and reads the exact Laravel notification fields", async () => {
    const readNotification = {
      ...notification,
      read_at: "2026-08-10T12:01:00.000000Z",
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [notification], links: { next: null } }),
        );
      }
      if (String(input) === `/api/notifications/${notification.id}/read`) {
        return new Response(JSON.stringify({ data: readNotification }));
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();

    render(<Dashboard session={activeSession} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(await screen.findByText(notification.title)).toBeInTheDocument();
    expect(screen.getByText(notification.details)).toBeInTheDocument();
    expect(screen.getByText(notification.research_title)).toBeInTheDocument();
    expect(
      screen.getByText(notification.submission_reference),
    ).toBeInTheDocument();
    expect(screen.getByText(notification.created_at)).toBeInTheDocument();
    expect(screen.queryByText(notification.action_url)).not.toBeInTheDocument();
    expect(
      screen.queryByText(String(notification.research_document_id)),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).toHaveTextContent("1");

    fireEvent.click(screen.getByText(notification.title));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(notification.action_url);
    });
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).not.toHaveTextContent("1");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it.each(["adviser", "instructor", "panel", "statistician"] as const)(
    "opens a notified %s assignment in its research folder workspace",
    async (role) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) => {
          const path = String(input);
          if (path === "/api/notifications")
            return new Response(
              JSON.stringify({ data: [], links: { next: null } }),
            );
          if (path === "/api/dashboard")
            return new Response(
              JSON.stringify({
                data: { schema_version: 1, role, sections: [] },
              }),
            );
          if (path === "/api/monitoring/research")
            return new Response(JSON.stringify({ data: [] }));
          if (path === "/api/research/42")
            return new Response(
              JSON.stringify({
                data: {
                  id: 42,
                  title: "Deep-linked assigned record",
                  abstract: "Assigned review evidence.",
                  keywords: null,
                  publication_year: null,
                  research_stage: "title_proposal",
                  submission_status: "under_review",
                  archive_status: "not_archived",
                  visibility: "private",
                  authors: [{ id: 8, author_name: "Research Student" }],
                },
              }),
            );
          if (path === "/api/research/42/people")
            return new Response(
              JSON.stringify({ data: { section: null, reviewers: [] } }),
            );
          if (path.startsWith("/api/research/42/"))
            return new Response(JSON.stringify({ data: [] }));
          return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
            status: 404,
          });
        }),
      );

      render(
        <Dashboard
          session={{ ...activeSession, role }}
          navigate={vi.fn()}
          researchDocumentId={42}
        />,
      );

      expect(
        await screen.findByRole("heading", {
          level: 3,
          name: "Deep-linked assigned record",
        }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("study-workspace")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Documents" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Similarity results")).not.toBeInTheDocument();
    },
  );

  it("opens a Research Office file feedback deep link in the shared workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = String(input);
        if (path === "/api/notifications")
          return new Response(
            JSON.stringify({ data: [], links: { next: null } }),
          );
        if (path === "/api/dashboard")
          return new Response(
            JSON.stringify({
              data: {
                schema_version: 1,
                role: "research-office",
                sections: [],
              },
            }),
          );
        if (path === "/api/monitoring/research")
          return new Response(JSON.stringify({ data: [] }));
        if (path === "/api/research/791")
          return new Response(
            JSON.stringify({
              data: {
                id: 791,
                title: "Office deep-linked record",
                abstract: null,
                publication_year: 2026,
                research_stage: "ongoing",
                submission_status: "under_review",
                archive_status: "not_archived",
                visibility: "private",
                authors: [],
                sdgs: [],
              },
            }),
          );
        if (path === "/api/research/791/people")
          return new Response(
            JSON.stringify({ data: { section: null, reviewers: [] } }),
          );
        if (path === "/api/research/791/files")
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 1069,
                  original_filename: "chapter-three.pdf",
                  mime_type: "application/pdf",
                  relative_path: "Chapter 3",
                  version_number: 1,
                  is_current: true,
                  upload_purpose: "revision",
                  uploaded_at: "2026-11-01T08:00:00Z",
                },
              ],
            }),
          );
        if (path === "/api/research/791/folders")
          return new Response(JSON.stringify({ data: ["Chapter 3"] }));
        if (path === "/api/research/791/files/1069/feedback")
          return new Response(JSON.stringify({ data: [] }));
        if (path.startsWith("/api/research/791/"))
          return new Response(JSON.stringify({ data: [] }));
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );

    render(
      <Dashboard
        session={{ ...activeSession, role: "research-office" }}
        navigate={vi.fn()}
        researchDocumentId={791}
        researchWorkspaceDestination={{
          tab: "documents",
          folder: "Chapter 3",
          fileId: 1069,
          panel: "feedback",
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "chapter-three.pdf" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("study-workspace")).toBeInTheDocument();
    expect(screen.queryByText("System administration")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Documents" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("sign out middleware", () => {
  const authenticatedAppState: InitialState = {
    version: 1,
    url: { pathname: "/app", search: "" },
    session: {
      status: "authenticated",
      user: {
        email: "researcher@example.test",
        role: "researcher",
        accessStatus: "active",
        isAdmin: false,
        firstName: "Research",
        middleName: null,
        lastName: "Student",
        studentEmployeeId: null,
        displayName: "Research Student",
        profilePhotoUrl: null,
      },
    },
    repository: { status: "unresolved", records: [] },
  };

  const instructorAppState: InitialState = {
    ...authenticatedAppState,
    session: {
      status: "authenticated",
      user: {
        ...(authenticatedAppState.session.status === "authenticated"
          ? authenticatedAppState.session.user
          : defaultUserSession),
        email: "instructor@example.test",
        role: "instructor",
        displayName: "Test Instructor",
      },
    },
  };
  const appStateAt = (state: InitialState, pathname: string): InitialState => ({
    ...state,
    url: { pathname, search: "" },
  });

  it("opens the canonical Instructor sections workspace from the sidebar", async () => {
    window.history.replaceState({}, "", "/app");
    render(<App initialState={instructorAppState} />);

    fireEvent.click(screen.getByRole("button", { name: "My Sections" }));

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/instructor/sections"),
    );
    expect(screen.getByRole("button", { name: "My Sections" })).toHaveClass(
      "active",
    );
    expect(
      screen.queryByRole("heading", { name: /Find the study/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    "/app/instructor/sections",
    "/app/instructor/sections/7",
    "/app/instructor/sections/7/projects/11",
  ])("routes an instructor to My Sections at %s", async (path) => {
    window.history.replaceState({}, "", path);
    render(<App initialState={appStateAt(instructorAppState, path)} />);

    expect(
      await screen.findByRole("button", { name: "My Sections" }),
    ).toHaveClass("active");
    expect(
      screen.queryByRole("heading", { name: /Find the study/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    "/app/instructor/sections/not-a-section",
    "/app/instructor/sections/7/projects/not-a-project",
    "/app/instructor/not-configured",
  ])("fails closed for malformed instructor route %s", async (path) => {
    window.history.replaceState({}, "", path);
    render(<App initialState={appStateAt(instructorAppState, path)} />);

    expect(
      await screen.findByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "My Sections" }),
    ).not.toBeInTheDocument();
  });

  it("does not expose instructor section routes to another role", async () => {
    window.history.replaceState({}, "", "/app/instructor/sections");
    render(
      <App
        initialState={appStateAt(
          authenticatedAppState,
          "/app/instructor/sections",
        )}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
  });

  it("protects direct Instructor section routes from anonymous users", async () => {
    const path = "/app/instructor/sections";
    window.history.replaceState({}, "", path);
    render(
      <App
        initialState={{
          ...appStateAt(instructorAppState, path),
          session: { status: "anonymous" },
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "My Sections" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["/app/researcher/submissions", "My Research"],
    ["/app/researcher/similarity/title", "Similarity Check"],
  ])("keeps Researcher special route %s protected and working", async (path, nav) => {
    window.history.replaceState({}, "", path);
    render(<App initialState={appStateAt(authenticatedAppState, path)} />);

    expect(await screen.findByRole("button", { name: nav })).toHaveClass("active");
    expect(
      screen.queryByRole("heading", { name: /Find the study/ }),
    ).not.toBeInTheDocument();
  });
  const signOutFetchMock = (logoutStatus: number) =>
    vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/auth/session") {
        return new Response(
          JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
          { status: 401 },
        );
      }
      if (path === "/api/auth/logout") {
        return logoutStatus === 204
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ error: "SESSION_EXPIRED" }), {
              status: logoutStatus,
            });
      }
      if (path === "/api/repository?per_page=1000") {
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });

  it("signs out to the landing page", async () => {
    window.history.replaceState({}, "", "/app");
    vi.stubGlobal("fetch", signOutFetchMock(204));
    render(<App initialState={authenticatedAppState} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open profile for Research Student",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const alertDialog = await screen.findByRole("alertdialog", {
      name: "Sign out of ResearchNAV?",
    });
    fireEvent.click(
      within(alertDialog).getByRole("button", { name: "Sign out" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.getByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open profile for Research Student",
      }),
    ).not.toBeInTheDocument();
  });

  it("signs out to the landing page even when the logout request fails", async () => {
    window.history.replaceState({}, "", "/app");
    vi.stubGlobal("fetch", signOutFetchMock(401));
    render(<App initialState={authenticatedAppState} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open profile for Research Student",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const alertDialog = await screen.findByRole("alertdialog", {
      name: "Sign out of ResearchNAV?",
    });
    fireEvent.click(
      within(alertDialog).getByRole("button", { name: "Sign out" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.getByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
  });

  it("redirects to the landing page when the session is gone on a protected route", async () => {
    window.history.replaceState({}, "", "/research/900");
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.getByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
  });
});
