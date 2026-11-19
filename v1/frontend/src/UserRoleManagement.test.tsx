import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserRoleManagement, {
  type UserDirectoryQuery,
} from "./UserRoleManagement";
import type { LaravelPaginationMeta } from "./api";

const meta: LaravelPaginationMeta = {
  current_page: 1,
  from: 1,
  last_page: 1,
  links: [],
  path: "/api/office/users",
  per_page: 10,
  to: 1,
  total: 1,
};

function page() {
  return {
    users: [
      {
        id: "user-1",
        email: "ana@example.edu",
        name: "Ana Santos",
        role: "researcher" as const,
        accessStatus: "active" as const,
        createdAt: "2026-10-01T00:00:00Z",
        institute: "ICS",
      },
    ],
    summary: { total: 12, active: 8, inactive: 4 },
    meta,
  };
}

const roles = ["researcher", "coordinator"] as const;
const statuses = ["active", "invited", "blocked"] as const;
const errorMessage = () => "User records are unavailable.";

describe("UserRoleManagement", () => {
  it("renders accurate statistics and combines name and email in the User column", async () => {
    render(
      <UserRoleManagement
        contextLabel="Research Office"
        loadUsers={vi.fn().mockResolvedValue(page())}
        saveUser={vi.fn()}
        roles={roles}
        accessStatuses={statuses}
        errorMessage={errorMessage}
      />,
    );

    expect(await screen.findByText("Ana Santos")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "User & role management" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ana@example.edu")).toBeInTheDocument();
    expect(
      screen.getByText("Total Users").nextElementSibling,
    ).toHaveTextContent("12");
    expect(
      screen.getByText("Active Users").nextElementSibling,
    ).toHaveTextContent("8");
    expect(
      screen.getByText("Inactive Users").nextElementSibling,
    ).toHaveTextContent("4");
    expect(
      screen.getByRole("columnheader", { name: /User/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Email" })).toBeNull();
  });

  it("keeps Research Office access-only and saves through the shared drawer", async () => {
    const saveUser = vi.fn().mockResolvedValue(undefined);
    render(
      <UserRoleManagement
        contextLabel="Research Office"
        loadUsers={vi.fn().mockResolvedValue(page())}
        saveUser={saveUser}
        roles={roles}
        accessStatuses={statuses}
        errorMessage={errorMessage}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit ana@example.edu" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit user" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Assigned role")).toBeNull();
    expect(screen.queryByLabelText("Institute")).toBeNull();

    fireEvent.change(screen.getByLabelText("Account access status"), {
      target: { value: "blocked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(saveUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1" }),
        expect.objectContaining({ accessStatus: "blocked" }),
      ),
    );
  });

  it("shows admin role and institute controls and guards dirty dismissal", async () => {
    render(
      <UserRoleManagement
        contextLabel="System Administrator"
        loadUsers={vi.fn().mockResolvedValue(page())}
        saveUser={vi.fn()}
        roles={roles}
        accessStatuses={statuses}
        canEditRole
        canEditInstitute
        institutes={["ICS", "ITE"]}
        errorMessage={errorMessage}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit ana@example.edu" }),
    );
    expect(screen.getByLabelText("Assigned role")).toBeInTheDocument();
    expect(screen.getByLabelText("Institute")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Assigned role"), {
      target: { value: "coordinator" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Close edit user drawer" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
  });

  it("sends filters and sorting to the server query", async () => {
    const queries: UserDirectoryQuery[] = [];
    const loadUsers = vi.fn((query: UserDirectoryQuery) => {
      queries.push(query);
      return Promise.resolve(page());
    });
    render(
      <UserRoleManagement
        contextLabel="Research Office"
        loadUsers={loadUsers}
        saveUser={vi.fn()}
        roles={roles}
        accessStatuses={statuses}
        errorMessage={errorMessage}
      />,
    );
    await screen.findByText("Ana Santos");

    fireEvent.click(screen.getByRole("button", { name: "Role" }));
    fireEvent.click(screen.getByRole("option", { name: "Coordinator" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Sort by Date Created" }),
    );

    await waitFor(() =>
      expect(queries.some((query) => query.role === "coordinator")).toBe(true),
    );
    await waitFor(() =>
      expect(queries.some((query) => query.sort === "created_at")).toBe(true),
    );
  });

  it("keeps filter menus scoped above the directory table", async () => {
    const { container } = render(
      <UserRoleManagement
        contextLabel="Research Office"
        loadUsers={vi.fn().mockResolvedValue(page())}
        saveUser={vi.fn()}
        roles={roles}
        accessStatuses={statuses}
        errorMessage={errorMessage}
      />,
    );
    await screen.findByText("Ana Santos");
    fireEvent.click(screen.getByRole("button", { name: "Role" }));

    expect(container.querySelector(".user-management-directory")).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Role" })).toBeInTheDocument();
  });

  it("refreshes users and renders the latest server data", async () => {
    const refreshedPage = page();
    refreshedPage.users[0] = {
      ...refreshedPage.users[0],
      name: "Updated Ana Santos",
    };
    let resolveRefresh: ((value: ReturnType<typeof page>) => void) | undefined;
    const loadUsers = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof page>>((resolve) => {
            resolveRefresh = resolve;
          }),
      )
      .mockResolvedValue(refreshedPage);

    render(
      <UserRoleManagement
        contextLabel="Research Office"
        loadUsers={loadUsers}
        saveUser={vi.fn()}
        roles={roles}
        accessStatuses={statuses}
        errorMessage={errorMessage}
      />,
    );
    await screen.findByText("Ana Santos");

    const refresh = screen.getByRole("button", { name: "Refresh users" });
    fireEvent.click(refresh);

    await waitFor(() => expect(loadUsers).toHaveBeenCalledTimes(2));
    expect(refresh).toBeDisabled();
    resolveRefresh?.(refreshedPage);
    expect(await screen.findByText("Updated Ana Santos")).toBeInTheDocument();
    expect(refresh).toBeEnabled();
  });
});
