import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import RoleWorkspace from "./RoleWorkspaces";
import { defaultUserSession } from "./data";
import type { ResearchRecord, Role } from "./types";

const reviewedRecord: ResearchRecord = {
  id: "900",
  title: "API ARCHIVED STUDY",
  authors: "First API Author, Second API Author",
  year: 2026,
  institutionName: "API College",
  institutionLocation: "Tangub City",
  academicUnit: "API Academic Unit",
  degreeProgram: "API Program",
  institute: "API Academic Unit",
  program: "API Program",
  category: "API Category",
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
  academic_unit: "API Academic Unit",
  degree_program: "API Program",
  category: { name: "API Category" },
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/auth/session") {
        return new Response(
          JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (String(input) === "/api/repository?per_page=50") {
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

describe("public catalog", () => {
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
    expect(screen.getByText("Research stage")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Imported public metadata.")).toBeInTheDocument();
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
  const cases: Array<[Role, RegExp]> = [
    ["admin", /System access overview/],
    ["researcher", /Welcome back/],
    ["adviser", /Pending reviews/],
    ["instructor", /Title proposals/],
    ["panel", /Proposal defense brief/],
    ["statistician", /Methodology review/],
    ["coordinator", /Research program at a glance/],
    ["librarian", /Archiving queue/],
    ["research-office", /Institutional research oversight/],
    ["academics", /Your research reading room/],
  ];

  it.each(cases)(
    "renders the %s primary workspace without catalog assignments",
    (role, heading) => {
      render(<RoleWorkspace role={role} notify={vi.fn()} />);
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
      expect(screen.queryByText("API ARCHIVED STUDY")).not.toBeInTheDocument();
    },
  );

  it("updates the unattached methodology checklist", () => {
    render(<RoleWorkspace role="statistician" notify={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Instrument validity is documented"));
    expect(screen.getByText("3 of 4 checks complete")).toBeInTheDocument();
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
  };
  const notification = {
    id: "f2bc7d6b-28d5-4ebc-8ac3-6d5e7c0b2fc0",
    type: "App\\Notifications\\ResearchActivityNotification",
    event: "RESEARCH_SUBMITTED",
    title: "Research activity",
    message: "Research was submitted for review.",
    action_url: "/research/42",
    research_document_id: 42,
    read_at: null,
    created_at: "2026-08-10T12:00:00.000000Z",
  };

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
        return new Response(JSON.stringify(readNotification));
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
    expect(screen.getByText(notification.message)).toBeInTheDocument();
    expect(screen.getByText(notification.created_at)).toBeInTheDocument();
    expect(screen.getByText(notification.action_url)).toBeInTheDocument();
    expect(
      screen.getByText(String(notification.research_document_id)),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText(notification.title));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(notification.action_url);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
