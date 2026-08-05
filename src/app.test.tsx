import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import RoleWorkspace from "./RoleWorkspaces";
import { defaultUserSession } from "./data";
import type { Role } from "./types";

beforeAll(() => {
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/auth/session") {
        return new Response(
          JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (
        (path === "/api/admin/coordinators" ||
          path === "/api/coordinator/instructors") &&
        (!init?.method || init.method === "GET")
      ) {
        return new Response(JSON.stringify({ users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (init?.method === "POST" && path.includes("/api/")) {
        const body = JSON.parse(String(init.body)) as { email: string };
        return new Response(
          JSON.stringify({
            user: {
              email: body.email,
              role: path.includes("coordinators")
                ? "coordinator"
                : "instructor",
              accessStatus: "invited",
              isAdmin: false,
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    }),
  );
});

describe("public catalog", () => {
  it("supports quoted search and opens public metadata", () => {
    window.history.replaceState({}, "", "/catalog?q=%22Digital%20Archiving%22");
    render(<CatalogPage onSignIn={vi.fn()} navigate={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        name: /Digital Archiving and Records Management/,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    expect(
      screen.getByRole("dialog", {
        name: /Digital Archiving and Records Management/,
      }),
    ).toBeInTheDocument();
  });
});

describe("prototype access", () => {
  it("does not expose a dashboard from a direct unauthenticated URL", async () => {
    window.history.replaceState({}, "", "/app");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Welcome back.")).not.toBeInTheDocument();
  });

  it("opens one server-backed Google sign-in dialog", async () => {
    window.history.replaceState({}, "", "/");
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Continue with Google/ }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Continue with Google",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Choose a reading room")).not.toBeInTheDocument();
  });
});

describe("role workspaces", () => {
  const cases: Array<[Role, RegExp]> = [
    ["admin", /System access overview/],
    ["researcher", /Welcome back/],
    ["adviser", /Three drafts await your review/],
    ["instructor", /Title proposals/],
    ["panel", /Proposal defense brief/],
    ["statistician", /Three studies await methodology review/],
    ["coordinator", /Research program at a glance/],
    ["librarian", /Five studies are ready to archive/],
    ["research-office", /Institutional research oversight/],
    ["academics", /Your research reading room/],
  ];

  it.each(cases)("renders the %s primary workspace", (role, heading) => {
    render(<RoleWorkspace role={role} notify={vi.fn()} />);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("updates methodology progress from checklist state", () => {
    render(<RoleWorkspace role="statistician" notify={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Instrument validity is documented"));
    expect(screen.getByText("3 of 4 checks complete")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("lets academics search beyond saved records", () => {
    render(<RoleWorkspace role="academics" notify={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search your saved studies"), {
      target: { value: "Inventory and Sales" },
    });
    expect(
      screen.getAllByRole("heading", {
        name: /Inventory and Sales Management System/,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", {
        name: /Save Inventory and Sales Management System.*to library/,
      }),
    ).toBeInTheDocument();
  });

  it("lets the administrator provision a coordinator account", async () => {
    const notify = vi.fn();
    render(<RoleWorkspace role="admin" notify={notify} />);
    fireEvent.change(screen.getByLabelText("Coordinator Gmail"), {
      target: { value: "new.coordinator@gmail.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Create coordinator account/ }),
    );
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        "Coordinator invitation sent to new.coordinator@gmail.com.",
      ),
    );
  });

  it("restricts coordinator provisioning to instructor accounts", async () => {
    const notify = vi.fn();
    render(<RoleWorkspace role="coordinator" notify={notify} />);
    fireEvent.change(screen.getByLabelText("Google account"), {
      target: { value: "new.instructor@gmail.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Create instructor account/ }),
    );
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        "Invitation sent to new.instructor@gmail.com. Access is pending Gmail confirmation.",
      ),
    );
    expect(
      screen.queryByRole("option", { name: "Research Coordinator" }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
  });

  it("blocks an invited instructor until Gmail confirmation", () => {
    render(
      <Dashboard
        session={{
          email: "pending.instructor@gmail.com",
          role: "instructor",
          accessStatus: "invited",
          isAdmin: false,
        }}
        navigate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Check your Gmail to activate access.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Title proposals")).not.toBeInTheDocument();
  });

  it("lets an active administrator bypass role restrictions", () => {
    render(
      <Dashboard
        session={{
          email: "admin@gmail.com",
          role: "admin",
          accessStatus: "active",
          isAdmin: true,
        }}
        navigate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "System access overview.",
      }),
    ).toBeInTheDocument();
  });

  it("blocks a disabled administrator account", () => {
    render(
      <Dashboard
        session={{
          email: "admin@gmail.com",
          role: "admin",
          accessStatus: "blocked",
          isAdmin: true,
        }}
        navigate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Your account is awaiting approval.",
      }),
    ).toBeInTheDocument();
  });
});

describe("dashboard notifications", () => {
  it("opens the notification's referenced research record", () => {
    render(
      <Dashboard
        session={{ ...defaultUserSession, accessStatus: "active" }}
        navigate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Revision feedback received/ }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("RN-2025-041");
  });
});
