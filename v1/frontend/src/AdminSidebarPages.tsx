import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  ApiError,
  decideAccessRequest,
  getSystemStatus,
  listAccessRequests,
  listAdminAuditLogs,
  listAdminCoordinators,
  listAdminUsers,
  provisionCoordinator,
  REQUESTABLE_ROLES,
  updateAdminUser,
  type AccessRequestResource,
  type AccessStatus,
  type AdminRole,
  type AdminUserResource,
  type LaravelPaginatedResponse,
  type RequestableRole,
  type SystemStatusResource,
} from "./api";
import { Button } from "./components";
import { DatePickerInput } from "./dateControls";
import { useLiveFilters } from "./useLiveFilters";

const roles: AdminRole[] = [
  "admin",
  "researcher",
  "adviser",
  "instructor",
  "panel",
  "statistician",
  "coordinator",
  "librarian",
  "research-office",
  "academics",
];
const accessStatuses: AccessStatus[] = ["active", "invited", "blocked"];

export default function AdminSidebarPage({
  selectedNav,
}: {
  selectedNav: string;
}) {
  switch (selectedNav) {
    case "Access Requests":
      return <AccessRequests />;
    case "Coordinator Accounts":
      return <CoordinatorAccounts />;
    case "All Users":
      return <AllUsers />;
    case "Audit Logs":
      return <AuditLogs />;
    case "System Settings":
      return <SystemStatus />;
    default:
      return null;
  }
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">System Administrator</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function friendlyError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401)
    return "Session expired. Sign out and sign in again.";
  if (error.status === 403)
    return "Access denied. An active System Administrator account is required.";
  if (error.status === 409) {
    if (error.code === "SELF_MODIFICATION_NOT_ALLOWED")
      return "You cannot change your own role or access status.";
    if (error.code === "LAST_ACTIVE_ADMIN_REQUIRED")
      return "At least one active administrator must remain.";
    if (error.code === "ACCOUNT_ROLE_CONFLICT")
      return "That email is already assigned a different role.";
    return `The server rejected this change (${error.code}). Refresh and try again.`;
  }
  if (error.status === 429)
    return "Too many requests. Wait a moment before trying again.";
  return error.status >= 500
    ? `${fallback} (${error.code}).`
    : `${fallback} (${error.code}).`;
}

function AccessRequests() {
  const [result, setResult] =
    useState<LaravelPaginatedResponse<AccessRequestResource> | null>(null);
  const [status, setStatus] =
    useState<AccessRequestResource["status"]>("pending");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [grantedRoles, setGrantedRoles] = useState<
    Record<number, RequestableRole>
  >({});
  const [attempt, setAttempt] = useState(0);

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void listAccessRequests({ status })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Access requests are unavailable"),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, status]);

  async function decide(
    request: AccessRequestResource,
    decision: "approve" | "reject",
  ) {
    setNotice("");
    setDeciding(request.id);
    try {
      await decideAccessRequest(request.id, {
        decision,
        granted_role:
          decision === "approve" ? grantedRoles[request.id] : undefined,
      });
      setNotice(
        decision === "approve"
          ? `Access granted to ${request.email ?? "the applicant"}.`
          : `Request from ${request.email ?? "the applicant"} was rejected.`,
      );
      reload();
    } catch (requestError) {
      setNotice(
        friendlyError(requestError, "The decision could not be recorded"),
      );
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <PageHeader
        title="Access requests"
        description="Google-verified accounts asking to be assigned a workspace role."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {notice && (
        <p
          role="status"
          className={
            notice.includes("could not") ? "admin-error" : "admin-success"
          }
        >
          {notice}
        </p>
      )}
      <section className="panel-card admin-data-card">
        <div className="admin-filters">
          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AccessRequestResource["status"])
              }
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : loading || result === null ? (
          <p className="admin-empty" aria-busy="true">
            Loading access requests…
          </p>
        ) : result.data.length === 0 ? (
          <p className="admin-empty">No {status} access requests.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Access requests</caption>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Requested role</th>
                  <th>Details</th>
                  <th>Requested</th>
                  <th>{status === "pending" ? "Decision" : "Outcome"}</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.email ?? "Unknown account"}</strong>
                      {request.full_name && <div>{request.full_name}</div>}
                    </td>
                    <td>{request.requested_role}</td>
                    <td>
                      {request.program && <div>{request.program}</div>}
                      {request.justification && (
                        <div>{request.justification}</div>
                      )}
                      {!request.program && !request.justification && "—"}
                    </td>
                    <td>{request.requested_at ?? "—"}</td>
                    <td>
                      {request.status === "pending" ? (
                        <span className="row-actions">
                          <label
                            className="sr-only"
                            htmlFor={`role-${request.id}`}
                          >
                            Grant role
                          </label>
                          <select
                            id={`role-${request.id}`}
                            value={
                              grantedRoles[request.id] ??
                              (REQUESTABLE_ROLES.includes(
                                request.requested_role as RequestableRole,
                              )
                                ? (request.requested_role as RequestableRole)
                                : "researcher")
                            }
                            onChange={(event) =>
                              setGrantedRoles((current) => ({
                                ...current,
                                [request.id]: event.target
                                  .value as RequestableRole,
                              }))
                            }
                          >
                            {REQUESTABLE_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <Button
                            disabled={deciding === request.id}
                            onClick={() => void decide(request, "approve")}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={deciding === request.id}
                            onClick={() => void decide(request, "reject")}
                          >
                            Reject
                          </Button>
                        </span>
                      ) : (
                        <span>
                          {request.status}
                          {request.decided_by_email
                            ? ` · ${request.decided_by_email}`
                            : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CoordinatorAccounts() {
  const [users, setUsers] = useState<Awaited<
    ReturnType<typeof listAdminCoordinators>
  > | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void listAdminCoordinators()
      .then((result) => {
        if (cancelled) return;
        setUsers(result);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Coordinator accounts are unavailable"),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setProvisioning(true);
    try {
      await provisionCoordinator(email.trim());
      setEmail("");
      setNotice("Coordinator account provisioned.");
      reload();
    } catch (requestError) {
      setNotice(
        friendlyError(
          requestError,
          "Coordinator account could not be provisioned",
        ),
      );
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <PageHeader
        title="Coordinator accounts"
        description="Provision and review Research Coordinator accounts."
      />
      <section className="panel-card admin-provision-card">
        <h2>Provision coordinator</h2>
        <form onSubmit={submit} className="admin-inline-form">
          <label>
            Coordinator email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <Button type="submit" disabled={provisioning}>
            {provisioning ? "Provisioning…" : "Provision account"}
          </Button>
        </form>
        {notice && (
          <p
            role="status"
            className={
              notice.includes("provisioned") ? "admin-success" : "admin-error"
            }
          >
            {notice}
          </p>
        )}
      </section>
      <section className="panel-card admin-data-card">
        <div className="admin-card-heading">
          <div>
            <h2>Provisioned coordinators</h2>
            <p>Only role and account-access information is listed.</p>
          </div>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        </div>
        {error ? (
          <InlineError message={error} retry={reload} />
        ) : loading || users === null ? (
          <Loading label="Loading coordinator accounts" />
        ) : users.length === 0 ? (
          <p className="admin-empty">
            No coordinator accounts have been provisioned.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">
                Provisioned coordinator accounts
              </caption>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.email}>
                    <td>{user.email}</td>
                    <td>{label(user.role)}</td>
                    <td>{label(user.accessStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AllUsers() {
  const [query, setQuery] = useState({
    search: "",
    role: "",
    access_status: "",
  });
  const [page, setPage] = useState(1);
  const [result, setResult] =
    useState<LaravelPaginatedResponse<AdminUserResource> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [drafts, setDrafts] = useState<
    Record<string, { role: AdminRole; access_status: AccessStatus }>
  >({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const { filters, change } = useLiveFilters(
    { search: "", role: "", access_status: "" },
    (next) => {
      setPage(1);
      setQuery(next);
      reload();
    },
  );

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void listAdminUsers({
      ...query,
      role: (query.role as AdminRole) || undefined,
      access_status: (query.access_status as AccessStatus) || undefined,
      page,
      per_page: 25,
    })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(friendlyError(requestError, "User records are unavailable"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page, query]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(filters);
    reload();
  }
  function draftFor(user: AdminUserResource) {
    return (
      drafts[user.id] ?? { role: user.role, access_status: user.access_status }
    );
  }
  async function save(user: AdminUserResource) {
    const draft = draftFor(user);
    setSaveMessage("");
    setSaving(user.id);
    try {
      await updateAdminUser(user.id, draft);
      setDrafts((current) => {
        const remaining = { ...current };
        delete remaining[user.id];
        return remaining;
      });
      setSaveMessage(`Updated ${user.email}.`);
      reload();
    } catch (requestError) {
      setDrafts((current) => {
        const remaining = { ...current };
        delete remaining[user.id];
        return remaining;
      });
      setSaveMessage(
        friendlyError(requestError, "User change could not be saved"),
      );
      reload();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="workspace-content admin-sidebar-page">
      <PageHeader
        title="All users"
        description="Review account access and roles. Authentication and session data are never displayed."
      />
      <section className="panel-card admin-data-card">
        <form className="admin-filters" onSubmit={applyFilters}>
          <label>
            Search
            <input
              value={filters.search}
              onChange={(event) => change("search", event.target.value)}
              placeholder="Name, email, or ID"
            />
          </label>
          <label>
            Role
            <select
              value={filters.role}
              onChange={(event) => change("role", event.target.value)}
            >
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {label(role)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Access status
            <select
              value={filters.access_status}
              onChange={(event) => change("access_status", event.target.value)}
            >
              <option value="">All statuses</option>
              {accessStatuses.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
        </form>
        {saveMessage && (
          <p
            role="status"
            className={
              saveMessage.startsWith("Updated")
                ? "admin-success"
                : "admin-error"
            }
          >
            {saveMessage}
          </p>
        )}
        {error ? (
          <InlineError message={error} retry={reload} />
        ) : loading || result === null ? (
          <Loading label="Loading users" />
        ) : result.data.length === 0 ? (
          <p className="admin-empty">
            {hasFilters(query)
              ? "No users match these filters."
              : "No user accounts are available."}
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">User accounts</caption>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Last login</th>
                    <th>Created</th>
                    <th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((user) => {
                    const draft = draftFor(user);
                    return (
                      <tr key={user.id}>
                        <td>{fullName(user) || "—"}</td>
                        <td>{user.email}</td>
                        <td>
                          <select
                            aria-label={`Role for ${user.email}`}
                            value={draft.role}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...draft,
                                  role: event.target.value as AdminRole,
                                },
                              }))
                            }
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {label(role)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label={`Access status for ${user.email}`}
                            value={draft.access_status}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...draft,
                                  access_status: event.target
                                    .value as AccessStatus,
                                },
                              }))
                            }
                          >
                            {accessStatuses.map((status) => (
                              <option key={status} value={status}>
                                {label(status)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{displayDate(user.last_login_at)}</td>
                        <td>{displayDate(user.created_at)}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => void save(user)}
                            disabled={saving === user.id}
                          >
                            {saving === user.id ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={result.meta}
              onPage={(nextPage) => {
                setPage(nextPage);
                reload();
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

function AuditLogs() {
  const [query, setQuery] = useState({
    action: "",
    created_from: "",
    created_to: "",
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof listAdminAuditLogs>
  > | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const { filters, change } = useLiveFilters(
    { action: "", created_from: "", created_to: "" },
    (next) => {
      setPage(1);
      setQuery(next);
      reload();
    },
  );

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void listAdminAuditLogs({ ...query, page, per_page: 25 })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(friendlyError(requestError, "Audit logs are unavailable"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page, query]);
  return (
    <div className="workspace-content admin-sidebar-page">
      <PageHeader
        title="Audit logs"
        description="Read-only record of administrative and domain activity."
      />
      <section className="panel-card admin-data-card">
        <form
          className="admin-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(filters);
            reload();
          }}
        >
          <label>
            Action
            <input
              value={filters.action}
              onChange={(event) => change("action", event.target.value)}
              placeholder="ADMIN_USER_UPDATED"
            />
          </label>
          <label>
            From
            <DatePickerInput
              type="date"
              value={filters.created_from}
              max={filters.created_to || undefined}
              onChange={(event) => change("created_from", event.target.value)}
            />
          </label>
          <label>
            To
            <DatePickerInput
              type="date"
              value={filters.created_to}
              min={filters.created_from || undefined}
              onChange={(event) => change("created_to", event.target.value)}
            />
          </label>
        </form>
        {error ? (
          <InlineError message={error} retry={reload} />
        ) : loading || result === null ? (
          <Loading label="Loading audit logs" />
        ) : result.data.length === 0 ? (
          <p className="admin-empty">
            {hasFilters(query)
              ? "No audit logs match these filters."
              : "No audit logs have been recorded."}
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">Audit log entries</caption>
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Subject</th>
                    <th>Description</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((log) => (
                    <tr key={log.id}>
                      <td>{log.actor?.email ?? "System"}</td>
                      <td>{log.action}</td>
                      <td>
                        {log.subject
                          ? `${label(log.subject.type)} · ${log.subject.id}`
                          : "—"}
                      </td>
                      <td>{log.description ?? "—"}</td>
                      <td>{displayDate(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={result.meta}
              onPage={(nextPage) => {
                setPage(nextPage);
                reload();
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

function SystemStatus() {
  const [status, setStatus] = useState<SystemStatusResource | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void getSystemStatus()
      .then((response) => {
        if (cancelled) return;
        setStatus(response);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(friendlyError(requestError, "System status is unavailable"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return (
    <div className="workspace-content admin-sidebar-page">
      <PageHeader
        title="System status and capabilities"
        description="Live, read-only service checks and aggregate operational counts."
        action={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {error ? (
        <InlineError message={error} retry={reload} />
      ) : loading || status === null ? (
        <Loading label="Loading system status" />
      ) : (
        <>
          <section
            className={`panel-card system-overall system-${status.overall}`}
          >
            <h2>{label(status.overall)}</h2>
            <p>Checked {displayDate(status.checked_at)}.</p>
            {status.issues.length > 0 && (
              <>
                <h3>Degraded components</h3>
                <ul>
                  {status.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="admin-stat-grid" aria-label="Database counts">
            <Stat label="Users" value={status.database.counts.users.total} />
            <Stat
              label="Active users"
              value={status.database.counts.users.access_statuses.active}
            />
            <Stat
              label="Invited users"
              value={status.database.counts.users.access_statuses.invited}
            />
            <Stat
              label="Blocked users"
              value={status.database.counts.users.access_statuses.blocked}
            />
            <Stat
              label="Administrators"
              value={status.database.counts.users.administrators}
            />
            <Stat
              label="Coordinators"
              value={status.database.counts.users.coordinators}
            />
            <Stat
              label="Research documents"
              value={status.database.counts.research_documents}
            />
            <Stat
              label="Audit logs"
              value={status.database.counts.audit_logs}
            />
            <Stat
              label="Notifications"
              value={status.database.counts.notifications}
            />
            <Stat
              label="Document files"
              value={status.database.counts.document_files}
            />
            <Stat
              label="File bytes"
              value={status.database.counts.document_file_bytes}
            />
          </section>
          <section className="panel-card admin-status-details">
            <h2>Runtime and database</h2>
            <dl>
              <dt>Environment</dt>
              <dd>{status.runtime.environment}</dd>
              <dt>PHP</dt>
              <dd>{status.runtime.php_version}</dd>
              <dt>Framework</dt>
              <dd>{status.runtime.framework_version}</dd>
              <dt>Debug enabled</dt>
              <dd>{String(status.runtime.debug_enabled)}</dd>
              <dt>Database</dt>
              <dd>
                {status.database.driver ?? "Unavailable"} ·{" "}
                {status.database.status}
              </dd>
              <dt>Migrations</dt>
              <dd>
                {status.database.migrations.applied ?? "—"} applied /{" "}
                {status.database.migrations.available ?? "—"} available /{" "}
                {status.database.migrations.pending ?? "—"} pending
              </dd>
            </dl>
          </section>
          <section className="panel-card admin-status-details">
            <h2>Storage capabilities</h2>
            <dl>
              <dt>Private disk</dt>
              <dd>
                {status.storage.private.disk} (
                {status.storage.private.driver ?? "unavailable"})
              </dd>
              <dt>Status</dt>
              <dd>{status.storage.private.status}</dd>
              <dt>Capabilities</dt>
              <dd>
                {status.storage.private.capabilities
                  ? `Read: ${status.storage.private.capabilities.read}; Write: ${status.storage.private.capabilities.write}`
                  : "Unavailable"}
              </dd>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <section
      className="panel-card dashboard-loading"
      role="region"
      aria-label={label}
      aria-busy="true"
    >
      <p>{label}…</p>
    </section>
  );
}
function InlineError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <section className="panel-card dashboard-error" role="alert">
      <p>{message}</p>
      <Button variant="secondary" onClick={retry}>
        Retry
      </Button>
    </section>
  );
}
function Stat({
  label: statLabel,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <section className="panel-card admin-stat">
      <strong>{value === null ? "—" : value.toLocaleString()}</strong>
      <span>{statLabel}</span>
    </section>
  );
}
function Pagination({
  meta,
  onPage,
}: {
  meta: LaravelPaginatedResponse<unknown>["meta"];
  onPage: (page: number) => void;
}) {
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <span>
        Page {meta.current_page} of {meta.last_page} · {meta.total} total
      </span>
      <Button
        variant="secondary"
        disabled={meta.current_page <= 1}
        onClick={() => onPage(meta.current_page - 1)}
      >
        Previous
      </Button>
      <Button
        variant="secondary"
        disabled={meta.current_page >= meta.last_page}
        onClick={() => onPage(meta.current_page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
function fullName(user: AdminUserResource) {
  return [user.names.first_name, user.names.middle_name, user.names.last_name]
    .filter(Boolean)
    .join(" ");
}
function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function hasFilters(filters: Record<string, string>) {
  return Object.values(filters).some(Boolean);
}
