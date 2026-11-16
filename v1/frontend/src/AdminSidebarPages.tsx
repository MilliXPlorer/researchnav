import { useEffect, useState } from "react";
import { formatPhilippineDateTime } from "./dateTime";
import { instituteNames } from "./data";
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  HardDrive,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  ApiError,
  createInstitute,
  deleteInstitute,
  decideAccessRequest,
  getSystemStatus,
  listAccessRequests,
  listAdminAuditLogs,
  listAdminProvisionedAccounts,
  listAdminUsers,
  listInstitutes,
  provisionAdminAccount,
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
import { Button, Pagination, SortableHeader } from "./components";
import { DatePickerInput } from "./dateControls";
import { Modal } from "./Modal";
import ManageRepository from "./ManageRepository";
import { useLiveFilters } from "./useLiveFilters";
import { useClientSorting } from "./useClientSorting";
import UserRoleManagementWorkspace, {
  type UserDirectoryQuery,
} from "./UserRoleManagement";

const roles: AdminRole[] = [
  "admin",
  "researcher",
  "adviser",
  "instructor",
  "panel",
  "statistician",
  "coordinator",
  "librarian",
  "research_editor",
  "research-office",
];
const accessStatuses: AccessStatus[] = ["active", "invited", "blocked"];
const accessRequestStatuses: AccessRequestResource["status"][] = [
  "pending",
  "approved",
  "rejected",
];

const loadAdminManagedUsers = (query: UserDirectoryQuery) =>
  listAdminUsers({
    search: query.search || undefined,
    role: query.role || undefined,
    access_status: query.access_status || undefined,
    sort: query.sort,
    direction: query.direction,
    page: query.page,
    per_page: query.per_page,
  }).then((response) => ({
    users: response.data.map((user) => ({
      id: user.id,
      email: user.email,
      name: fullName(user),
      role: user.role,
      accessStatus: user.access_status,
      createdAt: user.created_at,
      institute: user.institute,
    })),
    summary: response.summary,
    meta: response.meta,
  }));

const saveAdminManagedUser = async (
  user: { id: string },
  draft: {
    role: AdminRole;
    accessStatus: AccessStatus;
    institute: string | null;
  },
) => {
  await updateAdminUser(user.id, {
    role: draft.role,
    access_status: draft.accessStatus,
    institute: draft.institute,
  });
};

export default function AdminSidebarPage({
  selectedNav,
}: {
  selectedNav: string;
}) {
  switch (selectedNav) {
    case "User & Role Management":
      return <UserRoleManagement />;
    case "Access Requests":
      return <AccessRequests />;
    case "Account Provisioning":
      return <AccountProvisioning />;
    case "All Users":
      return <AllUsers />;
    case "Audit Logs":
      return <AuditLogs />;
    case "Manage Repository":
      return <ManageRepository contextLabel="System Administrator" />;
    case "System Settings":
      return <SystemStatus />;
    default:
      return null;
  }
}

function UserRoleManagement() {
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [usersVersion, setUsersVersion] = useState(0);

  return (
    <div className="workspace-content admin-sidebar-page access-requests-page">
      <AllUsers key={usersVersion} onAdd={() => setAddUserOpen(true)} />
      {addUserOpen && (
        <Modal label="Add user" onClose={() => setAddUserOpen(false)}>
          <div className="admin-add-user-modal">
            <header>
              <p className="eyebrow">User & role management</p>
              <h2>Add user</h2>
              <p>Enter an email address and choose the user's role.</p>
            </header>
            <AccountProvisioning
              embedded
              onAdded={() => {
                setAddUserOpen(false);
                setUsersVersion((version) => version + 1);
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
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
    if (error.code === "INSTITUTE_IN_USE")
      return "This institute is assigned to users or research records and cannot be removed.";
    return `The server rejected this change (${error.code}). Refresh and try again.`;
  }
  if (error.status === 429)
    return "Too many requests. Wait a moment before trying again.";
  return error.status >= 500
    ? `${fallback} (${error.code}).`
    : `${fallback} (${error.code}).`;
}

const INSTITUTES_CHANGED_EVENT = "researchnav:institutes-changed";

/** Shared, database-backed institute list with a constant fallback for resilience. */
function useInstituteOptions(): [string[], () => void] {
  const [institutes, setInstitutes] = useState<string[]>([...instituteNames]);
  useEffect(() => {
    const load = () => {
      void listInstitutes()
        .then((values) => {
          const names = Array.isArray(values)
            ? values.filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          if (names.length > 0) setInstitutes(names);
        })
        .catch(() => setInstitutes([...instituteNames]));
    };
    load();
    window.addEventListener(INSTITUTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(INSTITUTES_CHANGED_EVENT, load);
  }, []);
  const refresh = () =>
    window.dispatchEvent(new Event(INSTITUTES_CHANGED_EVENT));
  return [institutes, refresh];
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
  const [page, setPage] = useState(1);
  const [viewingRequest, setViewingRequest] =
    useState<AccessRequestResource | null>(null);
  const [search, setSearch] = useState("");
  const [statusCounts, setStatusCounts] = useState<
    Record<AccessRequestResource["status"], number>
  >({ pending: 0, approved: 0, rejected: 0 });

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void listAccessRequests({ status, page })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setStatusCounts((current) => ({
          ...current,
          [status]: response.meta.total,
        }));
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
  }, [attempt, status, page]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      accessRequestStatuses
        .filter((candidate) => candidate !== status)
        .map(async (candidate) => {
          const response = await listAccessRequests({ status: candidate });
          return [candidate, response.meta.total] as const;
        }),
    )
      .then((counts) => {
        if (!cancelled) {
          setStatusCounts((current) => ({
            ...current,
            ...Object.fromEntries(counts),
          }));
        }
      })
      .catch(() => undefined);
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

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRequests =
    result?.data.filter((request) => {
      if (!normalizedSearch) return true;
      return [request.full_name, request.email].some((value) =>
        value?.toLocaleLowerCase().includes(normalizedSearch),
      );
    }) ?? [];
  const emptyTitle = `No ${status} access requests`;
  const emptyDescription =
    status === "pending"
      ? "New Google-verified requests will appear here for review."
      : `No ${status} Google-verified requests match this view.`;
  function selectStatus(nextStatus: AccessRequestResource["status"]) {
    setLoading(true);
    setStatus(nextStatus);
    setPage(1);
    setSearch("");
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
      <section className="panel-card admin-data-card access-requests-card">
        <div className="access-requests-toolbar">
          <div
            className="access-request-tabs"
            role="tablist"
            aria-label="Access request status"
          >
            {accessRequestStatuses.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={status === candidate}
                className={status === candidate ? "active" : undefined}
                onClick={() => selectStatus(candidate)}
                onKeyDown={(event) => {
                  const currentIndex = accessRequestStatuses.indexOf(candidate);
                  const nextIndex =
                    event.key === "ArrowRight"
                      ? (currentIndex + 1) % accessRequestStatuses.length
                      : event.key === "ArrowLeft"
                        ? (currentIndex - 1 + accessRequestStatuses.length) %
                          accessRequestStatuses.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? accessRequestStatuses.length - 1
                            : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  selectStatus(accessRequestStatuses[nextIndex]);
                  const tabs =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    );
                  tabs?.[nextIndex]?.focus();
                }}
              >
                <span>{candidate}</span>
                <strong
                  className={
                    candidate === "pending" && statusCounts.pending > 0
                      ? "has-pending"
                      : undefined
                  }
                >
                  {statusCounts[candidate]}
                </strong>
              </button>
            ))}
          </div>
          <label className="access-request-search">
            <span className="sr-only">Search by name or email</span>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Search by name or email"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="admin-table-wrap access-request-table-wrap">
          <table>
            <caption className="sr-only">Access requests</caption>
            <thead>
              <tr>
                <th>Requester</th>
                <th>Requested role</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={5}>
                    <p className="admin-error" role="alert">
                      {error}
                    </p>
                  </td>
                </tr>
              ) : loading || result === null ? (
                <tr>
                  <td
                    colSpan={5}
                    className="access-request-table-state"
                    aria-busy="true"
                  >
                    Loading access requests…
                  </td>
                </tr>
              ) : visibleRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="access-request-empty">
                    <div>
                      <span
                        className="access-request-empty-icon"
                        aria-hidden="true"
                      >
                        <UserRound />
                        <ShieldCheck />
                      </span>
                      <h2>{emptyTitle}</h2>
                      <p>
                        {normalizedSearch
                          ? `No ${status} requests match “${search.trim()}”.`
                          : emptyDescription}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRequests.map((request) => (
                  <tr key={request.id}>
                    <td className="access-request-requester">
                      <strong>
                        {request.full_name ||
                          request.email ||
                          "Unknown account"}
                      </strong>
                      {request.full_name && request.email && (
                        <span>{request.email}</span>
                      )}
                    </td>
                    <td>{request.requested_role}</td>
                    <td>
                      {request.requested_at
                        ? formatPhilippineDateTime(request.requested_at)
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`access-request-status is-${request.status}`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="access-request-actions">
                      <span className="row-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setViewingRequest(request)}
                          aria-label={`View access request from ${request.full_name || request.email || "unknown account"}`}
                          title="View access request"
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                        {request.status === "pending" ? (
                          <>
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
                          </>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {result && result.data.length > 0 && (
          <Pagination
            meta={result.meta}
            noun="requests"
            onPage={(nextPage) => {
              setPage(nextPage);
              reload();
            }}
          />
        )}
      </section>
      {viewingRequest && (
        <Modal
          label="Access request details"
          onClose={() => setViewingRequest(null)}
        >
          <div className="access-request-details">
            <header>
              <p className="eyebrow">Access request</p>
              <h2>
                {viewingRequest.full_name ||
                  viewingRequest.email ||
                  "Unknown account"}
              </h2>
              <p>
                Review the account information and reason for requesting access.
              </p>
            </header>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{viewingRequest.email ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Requested role</dt>
                <dd>{viewingRequest.requested_role}</dd>
              </div>
              <div>
                <dt>Program</dt>
                <dd>{viewingRequest.program ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>
                  {viewingRequest.requested_at
                    ? formatPhilippineDateTime(viewingRequest.requested_at)
                    : "Not provided"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{viewingRequest.status}</dd>
              </div>
              {viewingRequest.decided_by_email && (
                <div>
                  <dt>Reviewed by</dt>
                  <dd>{viewingRequest.decided_by_email}</dd>
                </div>
              )}
              {viewingRequest.decided_at && (
                <div>
                  <dt>Reviewed</dt>
                  <dd>{formatPhilippineDateTime(viewingRequest.decided_at)}</dd>
                </div>
              )}
            </dl>
            <section className="access-request-reason">
              <h3>Reason for access</h3>
              <p>{viewingRequest.justification || "No reason was provided."}</p>
            </section>
            {viewingRequest.decision_remarks && (
              <section className="access-request-reason">
                <h3>Decision remarks</h3>
                <p>{viewingRequest.decision_remarks}</p>
              </section>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function AccountProvisioning({
  embedded = false,
  onAdded,
}: {
  embedded?: boolean;
  onAdded?: () => void;
}) {
  const [users, setUsers] = useState<Awaited<
    ReturnType<typeof listAdminProvisionedAccounts>
  > | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RequestableRole>("researcher");
  const [institute, setInstitute] = useState("");
  const [instituteOptions] = useInstituteOptions();
  const [provisioning, setProvisioning] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const {
    sortedRows: sortedUsers,
    sort,
    direction,
    changeSort,
  } = useClientSorting(users ?? [], {
    email: (user) => user.email,
    role: (user) => user.role,
    access: (user) => user.accessStatus,
  });

  function reload() {
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    if (embedded) return;
    let cancelled = false;
    void listAdminProvisionedAccounts()
      .then((result) => {
        if (cancelled) return;
        setUsers(result);
        setError("");
        setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          friendlyError(requestError, "Provisioned accounts are unavailable"),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, embedded]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setProvisioning(true);
    try {
      await provisionAdminAccount(
        email.trim(),
        role,
        role === "coordinator" ? institute : undefined,
      );
      setEmail("");
      setNotice("Account provisioned.");
      if (onAdded) onAdded();
      else reload();
    } catch (requestError) {
      setNotice(
        friendlyError(requestError, "Account could not be provisioned"),
      );
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div
      className={
        embedded ? "admin-data-grid" : "workspace-content admin-sidebar-page"
      }
    >
      {!embedded && (
        <PageHeader
          title="User & role management"
          description="Add users, assign roles, and manage account access."
        />
      )}
      <section className="panel-card admin-provision-card">
        {!embedded && <h2>Add user</h2>}
        <form onSubmit={submit} className="admin-inline-form">
          <label>
            Account email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Workspace role
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as RequestableRole)
              }
            >
              {REQUESTABLE_ROLES.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {label(roleOption)}
                </option>
              ))}
            </select>
          </label>
          {role === "coordinator" && (
            <label>
              Institute
              <select
                value={institute}
                onChange={(event) => setInstitute(event.target.value)}
                required
              >
                <option value="">Select institute</option>
                {instituteOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit" disabled={provisioning}>
            {provisioning ? "Adding…" : "Add user"}
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
      {!embedded && (
        <section className="panel-card admin-data-card">
          <div className="admin-card-heading">
            <div>
              <h2>Provisioned accounts</h2>
              <p>Only role and account-access information is listed.</p>
            </div>
            <Button variant="secondary" onClick={reload}>
              <RefreshCw /> Refresh
            </Button>
          </div>
          {error ? (
            <InlineError message={error} retry={reload} />
          ) : loading || users === null ? (
            <Loading label="Loading provisioned accounts" />
          ) : users.length === 0 ? (
            <p className="admin-empty">No accounts have been provisioned.</p>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <caption className="sr-only">Provisioned accounts</caption>
                <thead>
                  <tr>
                    <SortableHeader
                      sortKey="email"
                      activeSort={sort}
                      direction={direction}
                      onSort={(key) =>
                        changeSort(key as "email" | "role" | "access")
                      }
                    >
                      Email
                    </SortableHeader>
                    <SortableHeader
                      sortKey="role"
                      activeSort={sort}
                      direction={direction}
                      onSort={(key) =>
                        changeSort(key as "email" | "role" | "access")
                      }
                    >
                      Role
                    </SortableHeader>
                    <SortableHeader
                      sortKey="access"
                      activeSort={sort}
                      direction={direction}
                      onSort={(key) =>
                        changeSort(key as "email" | "role" | "access")
                      }
                    >
                      Access
                    </SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
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
      )}
    </div>
  );
}

function AllUsers({ onAdd }: { onAdd?: () => void }) {
  const [institutes, refreshInstitutes] = useInstituteOptions();
  const [managingInstitutes, setManagingInstitutes] = useState(false);
  const [newInstitute, setNewInstitute] = useState("");
  const [addingInstitute, setAddingInstitute] = useState(false);
  const [removingInstitute, setRemovingInstitute] = useState<string | null>(
    null,
  );
  const [saveMessage, setSaveMessage] = useState("");

  async function addManagedInstitute() {
    const name = newInstitute.trim();
    if (!name) return;
    setAddingInstitute(true);
    setSaveMessage("");
    try {
      await createInstitute(name);
      setNewInstitute("");
      setSaveMessage(`Added ${name}.`);
      refreshInstitutes();
    } catch (requestError) {
      setSaveMessage(
        friendlyError(requestError, "Institute could not be added"),
      );
    } finally {
      setAddingInstitute(false);
    }
  }

  async function removeManagedInstitute(name: string) {
    setRemovingInstitute(name);
    setSaveMessage("");
    try {
      await deleteInstitute(name);
      setSaveMessage(`Removed ${name}.`);
      refreshInstitutes();
    } catch (requestError) {
      setSaveMessage(
        friendlyError(requestError, "Institute could not be removed"),
      );
    } finally {
      setRemovingInstitute(null);
    }
  }

  return (
    <>
      <UserRoleManagementWorkspace
        contextLabel="System Administrator"
        loadUsers={loadAdminManagedUsers}
        saveUser={saveAdminManagedUser}
        roles={roles}
        accessStatuses={accessStatuses}
        canEditRole
        canEditInstitute
        institutes={institutes}
        actions={
          <div className="row-actions">
            {onAdd && (
              <Button onClick={onAdd}>
                <Plus aria-hidden="true" /> Add user
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setSaveMessage("");
                setManagingInstitutes(true);
              }}
              aria-label="Manage institutes"
            >
              <Building2 aria-hidden="true" /> Manage institutes
            </Button>
          </div>
        }
        errorMessage={(requestError) =>
          friendlyError(requestError, "User records are unavailable")
        }
      />
      {managingInstitutes && (
        <Modal
          label="Manage institutes"
          onClose={() => setManagingInstitutes(false)}
          busy={removingInstitute !== null || addingInstitute}
        >
          <div className="admin-user-edit-form">
            <header className="admin-user-edit-header">
              <p className="eyebrow">User management</p>
              <h2>Manage institutes</h2>
              <p>Add institute options or remove unused custom institutes.</p>
            </header>
            {saveMessage && (
              <p role="status" className="admin-success">
                {saveMessage}
              </p>
            )}
            <div className="admin-institute-create">
              <label>
                Institute name
                <input
                  value={newInstitute}
                  maxLength={180}
                  onChange={(event) => setNewInstitute(event.target.value)}
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                className="icon-button"
                aria-label="Add institute"
                disabled={!newInstitute.trim() || addingInstitute}
                onClick={() => void addManagedInstitute()}
              >
                {addingInstitute ? "…" : <Plus />}
              </Button>
            </div>
            <div
              className="admin-institute-list"
              aria-label="Institute management"
            >
              {institutes.map((institute) => (
                <div key={institute} className="admin-institute-row">
                  <span>{institute}</span>
                  <Button
                    type="button"
                    variant="quiet"
                    className="icon-button"
                    aria-label={`Remove ${institute}`}
                    disabled={removingInstitute === institute}
                    onClick={() => void removeManagedInstitute(institute)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function AuditLogs() {
  const [query, setQuery] = useState({
    action: "",
    created_from: "",
    created_to: "",
  });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    "actor" | "action" | "subject" | "created_at" | null
  >(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
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
    void listAdminAuditLogs({
      ...query,
      sort: sort || undefined,
      direction: sort ? sortDirection : undefined,
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
        setError(friendlyError(requestError, "Audit logs are unavailable"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page, query, sort, sortDirection]);

  function changeSort(column: "actor" | "action" | "subject" | "created_at") {
    setPage(1);
    if (sort === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(column);
    setSortDirection("asc");
  }
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
              placeholder="Search by action"
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
                    <SortableHeader
                      sortKey="actor"
                      activeSort={sort}
                      direction={sortDirection}
                      onSort={(key) =>
                        changeSort(
                          key as "actor" | "action" | "subject" | "created_at",
                        )
                      }
                    >
                      Actor
                    </SortableHeader>
                    <SortableHeader
                      sortKey="action"
                      activeSort={sort}
                      direction={sortDirection}
                      onSort={(key) =>
                        changeSort(
                          key as "actor" | "action" | "subject" | "created_at",
                        )
                      }
                    >
                      Action
                    </SortableHeader>
                    <SortableHeader
                      sortKey="subject"
                      activeSort={sort}
                      direction={sortDirection}
                      onSort={(key) =>
                        changeSort(
                          key as "actor" | "action" | "subject" | "created_at",
                        )
                      }
                    >
                      Subject
                    </SortableHeader>
                    <th>Description</th>
                    <SortableHeader
                      sortKey="created_at"
                      activeSort={sort}
                      direction={sortDirection}
                      onSort={(key) =>
                        changeSort(
                          key as "actor" | "action" | "subject" | "created_at",
                        )
                      }
                    >
                      Timestamp
                    </SortableHeader>
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
              noun="logs"
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
    if (loading) return;
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
          <Button variant="secondary" onClick={reload} disabled={loading}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {error && status === null ? (
        <InlineError message={error} retry={reload} />
      ) : status === null ? (
        <Loading label="Loading system status" />
      ) : (
        <div className={`system-settings ${loading ? "is-refreshing" : ""}`}>
          {error && <InlineError message={error} retry={reload} />}
          <section
            className={`panel-card system-overall system-${status.overall}`}
          >
            <div className="system-health-summary">
              {status.overall === "operational" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              <div>
                <span>System health</span>
                <h2>{label(status.overall)}</h2>
              </div>
            </div>
            <p className="system-checked">
              Last checked
              <br />
              <strong>{displayDate(status.checked_at)}</strong>
            </p>
            {status.issues.length > 0 && (
              <div className="system-issues">
                <strong>Degraded components</strong>
                <ul>
                  {status.issues.map((issue) => (
                    <li key={issue}>{label(issue.replaceAll(".", " "))}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <div className="system-card-grid">
            <StatusCard icon={<Server />} title="Application runtime">
              <StatusRow
                term="Environment"
                value={status.runtime.environment}
              />
              <StatusRow term="PHP" value={status.runtime.php_version} />
              <StatusRow
                term="Laravel"
                value={status.runtime.framework_version}
              />
              <StatusRow
                term="Debug mode"
                value={status.runtime.debug_enabled ? "Enabled" : "Disabled"}
                tone={status.runtime.debug_enabled ? "warning" : "success"}
              />
            </StatusCard>
            <StatusCard icon={<Database />} title="Database">
              <StatusRow
                term="Connection"
                value={label(status.database.status)}
                tone={
                  status.database.status === "operational"
                    ? "success"
                    : "warning"
                }
              />
              <StatusRow
                term="Driver"
                value={status.database.driver ?? "Unavailable"}
              />
              <StatusRow
                term="Applied migrations"
                value={status.database.migrations.applied}
              />
              <StatusRow
                term="Deployed files"
                value={status.database.migrations.available}
              />
              <StatusRow
                term="Pending"
                value={status.database.migrations.pending}
                tone={
                  status.database.migrations.pending === 0
                    ? "success"
                    : "warning"
                }
              />
              <StatusRow
                term="Historical"
                value={status.database.migrations.historical}
              />
            </StatusCard>
            <StatusCard icon={<HardDrive />} title="Private storage">
              <StatusRow term="Disk" value={status.storage.private.disk} />
              <StatusRow
                term="Driver"
                value={status.storage.private.driver ?? "Unavailable"}
              />
              <StatusRow
                term="Health"
                value={label(status.storage.private.status)}
                tone={
                  status.storage.private.status === "operational"
                    ? "success"
                    : "warning"
                }
              />
              <Capability
                label="Read"
                enabled={status.storage.private.capabilities.read}
              />
              <Capability
                label="Write"
                enabled={status.storage.private.capabilities.write}
              />
              <Capability
                label="Cleanup"
                enabled={status.storage.private.capabilities.delete}
              />
            </StatusCard>
          </div>

          <section
            className="panel-card system-metrics"
            aria-labelledby="system-metrics-title"
          >
            <header>
              <Activity />
              <div>
                <p className="eyebrow">Database snapshot</p>
                <h2 id="system-metrics-title">Operational metrics</h2>
              </div>
            </header>
            <div className="system-metric-grid">
              <Stat label="Users" value={status.database.counts.users.total} />
              <Stat
                label="Active"
                value={status.database.counts.users.access_statuses.active}
              />
              <Stat
                label="Invited"
                value={status.database.counts.users.access_statuses.invited}
              />
              <Stat
                label="Blocked"
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
                label="File storage"
                value={formatBytes(status.database.counts.document_file_bytes)}
                title={
                  status.database.counts.document_file_bytes === null
                    ? undefined
                    : `${status.database.counts.document_file_bytes.toLocaleString()} bytes`
                }
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-card system-status-card">
      <header>
        <span className="system-card-icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
      </header>
      <dl>{children}</dl>
    </section>
  );
}

function StatusRow({
  term,
  value,
  tone,
}: {
  term: string;
  value: React.ReactNode;
  tone?: "success" | "warning";
}) {
  return (
    <>
      <dt>{term}</dt>
      <dd className={tone ? `system-value-${tone}` : undefined}>
        {value ?? "—"}
      </dd>
    </>
  );
}

function Capability({
  label: capabilityLabel,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <StatusRow
      term={capabilityLabel}
      value={enabled ? "Available" : "Unavailable"}
      tone={enabled ? "success" : "warning"}
    />
  );
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length,
  );
  return `${(bytes / 1024 ** unit).toFixed(2)} ${units[unit - 1]}`;
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
  title,
}: {
  label: string;
  value: number | string | null;
  title?: string;
}) {
  return (
    <section className="admin-stat" title={title}>
      <strong>
        {value === null
          ? "—"
          : typeof value === "number"
            ? value.toLocaleString()
            : value}
      </strong>
      <span>{statLabel}</span>
    </section>
  );
}
function fullName(user: AdminUserResource) {
  return [user.names.first_name, user.names.middle_name, user.names.last_name]
    .filter(Boolean)
    .join(" ");
}
function displayDate(value: string | null) {
  return formatPhilippineDateTime(value);
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
