import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Pencil,
  RefreshCw,
  Search,
  UserCog,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import type {
  AccessStatus,
  AdminRole,
  LaravelPaginationMeta,
  UserDirectorySummary,
} from "./api";
import { Button, Pagination, SortableHeader } from "./components";
import { formatPhilippineDate } from "./dateTime";
import { useDebouncedValue } from "./useDebouncedValue";
import { useDialogFocus } from "./useDialogFocus";

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  accessStatus: AccessStatus;
  createdAt: string | null;
  institute?: string | null;
}

export type UserDirectorySort =
  "last_name" | "role" | "access_status" | "created_at";

export interface UserDirectoryQuery {
  search: string;
  role: AdminRole | "";
  access_status: AccessStatus | "";
  sort?: UserDirectorySort;
  direction?: "asc" | "desc";
  page: number;
  per_page: 10;
}

interface UserDirectoryPage {
  users: ManagedUser[];
  summary: UserDirectorySummary;
  meta: LaravelPaginationMeta;
}

interface UserRoleManagementProps {
  contextLabel: string;
  loadUsers: (query: UserDirectoryQuery) => Promise<UserDirectoryPage>;
  saveUser: (user: ManagedUser, draft: UserEditDraft) => Promise<void>;
  roles: readonly AdminRole[];
  accessStatuses: readonly AccessStatus[];
  canEditRole?: boolean;
  canEditInstitute?: boolean;
  institutes?: readonly string[];
  actions?: React.ReactNode;
  reloadKey?: number;
  errorMessage?: (error: unknown) => string;
}

interface UserEditDraft {
  role: AdminRole;
  accessStatus: AccessStatus;
  institute: string | null;
}

const initialQuery: UserDirectoryQuery = {
  search: "",
  role: "",
  access_status: "",
  page: 1,
  per_page: 10,
};

function title(value: string) {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null) {
  return value ? formatPhilippineDate(value) : "Not available";
}

function draftFor(user: ManagedUser): UserEditDraft {
  return {
    role: user.role,
    accessStatus: user.accessStatus,
    institute: user.institute ?? null,
  };
}

export default function UserRoleManagement({
  contextLabel,
  loadUsers,
  saveUser,
  roles,
  accessStatuses,
  canEditRole = false,
  canEditInstitute = false,
  institutes = [],
  actions,
  reloadKey = 0,
  errorMessage = () => "User records are unavailable.",
}: UserRoleManagementProps) {
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<UserDirectoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [message, setMessage] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    let cancelled = false;
    void loadUsers({ ...query, search: debouncedSearch })
      .then((result) => {
        if (cancelled) return;
        setPage(result);
        setError("");
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, debouncedSearch, errorMessage, loadUsers, query, reloadKey]);

  function changeFilter(
    key: "role" | "access_status",
    value: AdminRole | AccessStatus | "",
  ) {
    setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  }

  function changeSort(sort: UserDirectorySort) {
    setQuery((current) => ({
      ...current,
      sort,
      direction:
        current.sort === sort && current.direction === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }

  async function update(user: ManagedUser, draft: UserEditDraft) {
    await saveUser(user, draft);
    setMessage(`Updated ${user.email}.`);
    setAttempt((current) => current + 1);
  }

  const summary = page?.summary ?? { total: 0, active: 0, inactive: 0 };

  return (
    <div className="user-management-workspace">
      <header className="workspace-header user-management-header">
        <div>
          <p className="eyebrow">{contextLabel}</p>
          <div className="user-management-title">
            <span aria-hidden="true">
              <UserCog />
            </span>
            <h1>User &amp; role management</h1>
          </div>
          <p>Manage user accounts, assigned roles, and access permissions.</p>
        </div>
        {actions}
      </header>

      <section className="user-management-stats" aria-label="User statistics">
        <StatCard
          icon={<UsersRound />}
          label="Total Users"
          value={summary.total}
        />
        <StatCard
          icon={<CheckCircle2 />}
          label="Active Users"
          value={summary.active}
        />
        <StatCard
          icon={<UserRoundX />}
          label="Inactive Users"
          value={summary.inactive}
        />
      </section>

      <section className="panel-card user-management-directory">
        <div className="user-management-toolbar">
          <label className="user-management-search">
            <span className="sr-only">Search</span>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLoading(true);
                setQuery((current) => ({ ...current, page: 1 }));
              }}
              placeholder="Search by name or email"
            />
          </label>
          <label>
            <span className="sr-only">Role</span>
            <select
              value={query.role}
              onChange={(event) =>
                changeFilter("role", event.target.value as AdminRole | "")
              }
            >
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {title(role)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Access status</span>
            <select
              value={query.access_status}
              onChange={(event) =>
                changeFilter(
                  "access_status",
                  event.target.value as AccessStatus | "",
                )
              }
            >
              <option value="">All statuses</option>
              {accessStatuses.map((status) => (
                <option key={status} value={status}>
                  {title(status)}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            className="icon-button"
            onClick={() => setAttempt((current) => current + 1)}
            aria-label="Refresh users"
            title="Refresh users"
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>

        {message && (
          <p className="admin-success" role="status">
            {message}
          </p>
        )}
        {error ? (
          <div className="admin-error" role="alert">
            {error}
          </div>
        ) : loading && page === null ? (
          <p className="admin-empty">Loading users…</p>
        ) : page?.users.length === 0 ? (
          <p className="admin-empty">No users match these filters.</p>
        ) : (
          <>
            <div
              className={
                loading
                  ? "user-management-table is-loading"
                  : "user-management-table"
              }
            >
              <table>
                <caption className="sr-only">User accounts</caption>
                <thead>
                  <tr>
                    <SortableHeader
                      sortKey="last_name"
                      activeSort={query.sort ?? null}
                      direction={query.direction ?? "asc"}
                      onSort={() => changeSort("last_name")}
                    >
                      User
                    </SortableHeader>
                    <SortableHeader
                      sortKey="role"
                      activeSort={query.sort ?? null}
                      direction={query.direction ?? "asc"}
                      onSort={() => changeSort("role")}
                    >
                      Role
                    </SortableHeader>
                    <SortableHeader
                      sortKey="access_status"
                      activeSort={query.sort ?? null}
                      direction={query.direction ?? "asc"}
                      onSort={() => changeSort("access_status")}
                    >
                      Access Status
                    </SortableHeader>
                    <SortableHeader
                      sortKey="created_at"
                      activeSort={query.sort ?? null}
                      direction={query.direction ?? "asc"}
                      onSort={() => changeSort("created_at")}
                    >
                      Date Created
                    </SortableHeader>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {page?.users.map((user) => (
                    <tr key={user.id}>
                      <td data-label="User">
                        <div className="user-management-identity">
                          <strong>{user.name || "Unnamed user"}</strong>
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td data-label="Role">{title(user.role)}</td>
                      <td data-label="Access Status">
                        <span
                          className={`user-status user-status--${user.accessStatus}`}
                        >
                          {title(user.accessStatus)}
                        </span>
                      </td>
                      <td data-label="Date Created">
                        {displayDate(user.createdAt)}
                      </td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="icon-button user-management-edit"
                          aria-label={`Edit ${user.email}`}
                          title="Edit user"
                          onClick={() => setEditing(user)}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {page && (
              <Pagination
                meta={page.meta}
                noun="users"
                onPage={(nextPage) =>
                  setQuery((current) => ({ ...current, page: nextPage }))
                }
              />
            )}
          </>
        )}
      </section>

      {editing && (
        <UserEditDrawer
          user={editing}
          roles={roles}
          accessStatuses={accessStatuses}
          institutes={institutes}
          canEditRole={canEditRole}
          canEditInstitute={canEditInstitute}
          onClose={() => setEditing(null)}
          onSave={update}
          errorMessage={errorMessage}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article>
      <span aria-hidden="true">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value.toLocaleString()}</strong>
      </div>
    </article>
  );
}

function UserEditDrawer({
  user,
  roles,
  accessStatuses,
  institutes,
  canEditRole,
  canEditInstitute,
  onClose,
  onSave,
  errorMessage,
}: {
  user: ManagedUser;
  roles: readonly AdminRole[];
  accessStatuses: readonly AccessStatus[];
  institutes: readonly string[];
  canEditRole: boolean;
  canEditInstitute: boolean;
  onClose: () => void;
  onSave: (user: ManagedUser, draft: UserEditDraft) => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const [baseline, setBaseline] = useState(() => draftFor(user));
  const [draft, setDraft] = useState(() => draftFor(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function requestClose() {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  const [drawerRef, onKeyDown] = useDialogFocus<HTMLElement>(requestClose);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(user, draft);
      setBaseline(draft);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-drawer-backdrop" onMouseDown={requestClose}>
      <aside
        ref={drawerRef}
        className="user-management-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-drawer-title"
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">User management</p>
            <h2 id="user-drawer-title">Edit user</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={requestClose}
            aria-label="Close edit user drawer"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="user-drawer-identity">
          <span aria-hidden="true">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{user.name || "Unnamed user"}</strong>
            <p>{user.email}</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="user-drawer-fields">
            {error && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}
            {canEditRole && (
              <label>
                Assigned role
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      role: event.target.value as AdminRole,
                    }))
                  }
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {title(role)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Account access status
              <select
                value={draft.accessStatus}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    accessStatus: event.target.value as AccessStatus,
                  }))
                }
              >
                {accessStatuses.map((status) => (
                  <option key={status} value={status}>
                    {title(status)}
                  </option>
                ))}
              </select>
            </label>
            {canEditInstitute && (
              <label>
                Institute
                <select
                  value={draft.institute ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      institute: event.target.value || null,
                    }))
                  }
                >
                  <option value="">Not assigned</option>
                  {institutes.map((institute) => (
                    <option key={institute} value={institute}>
                      {institute}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <footer>
            <Button
              type="button"
              variant="secondary"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </footer>
        </form>
        {confirmDiscard && (
          <div
            className="user-drawer-discard"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-user-changes-title"
          >
            <div>
              <h3 id="discard-user-changes-title">Discard unsaved changes?</h3>
              <p>Your updates have not been saved.</p>
              <div>
                <Button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  autoFocus
                >
                  Keep editing
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Discard changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
