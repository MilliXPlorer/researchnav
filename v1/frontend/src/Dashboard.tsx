import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CircleUserRound,
  Home,
  LayoutDashboard,
  MailCheck,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { canEnterDashboard } from "./access";
import AccessRequestPanel from "./AccessRequestPanel";
import {
  ApiError,
  getRoleDashboard,
  listNotifications,
  markNotificationRead,
  type NotificationResource,
} from "./api";
import AdminSidebarPage from "./AdminSidebarPages";
import { Logo } from "./components";
import { roleConfigs } from "./data";
import RoleSidebarPage from "./RoleSidebarPages";
import RoleWorkspace, { type RoleDashboardLoadState } from "./RoleWorkspaces";
import type { Role, UserSession } from "./types";
import { useDialogFocus } from "./useDialogFocus";

const primaryNav: Record<Role, string> = {
  admin: "System Overview",
  researcher: "My Dashboard",
  adviser: "Pending Reviews",
  instructor: "Title Proposals",
  panel: "Assigned Manuscripts",
  statistician: "Review Queue",
  coordinator: "Program Overview",
  librarian: "Archiving Queue",
  "research-office": "Compliance Review",
  academics: "My Library",
};

const navIcons = [LayoutDashboard, BookOpen, Search, Home, Bell, Menu];

export default function Dashboard({
  session,
  navigate,
  onLogout,
  researchDocumentId,
}: {
  session: UserSession;
  navigate: (path: string) => void;
  onLogout?: () => Promise<void> | void;
  researchDocumentId?: string | number;
}) {
  const role = session.role;
  const dashboardScope = `${role}:${session.email.trim().toLowerCase()}`;
  const dashboardScopeRef = useRef(dashboardScope);
  dashboardScopeRef.current = dashboardScope;
  const config = roleConfigs.find((item) => item.id === role)!;
  const [activeNav, setActiveNav] = useState({
    scope: dashboardScope,
    role,
    item: primaryNav[role],
  });
  const [drawer, setDrawer] = useState({
    scope: dashboardScope,
    open: false,
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationState, setNotificationState] = useState({
    scope: dashboardScope,
    status: "loading" as "loading" | "ready" | "error",
    items: [] as NotificationResource[],
    error: "",
  });
  const [notificationAttempt, setNotificationAttempt] = useState(0);
  const [dashboardState, setDashboardState] = useState<RoleDashboardLoadState>({
    scope: dashboardScope,
    status: "loading",
  });
  const [dashboardAttempt, setDashboardAttempt] = useState(0);
  const selectedNav =
    activeNav.scope === dashboardScope ? activeNav.item : primaryNav[role];
  const scopedDashboardState: RoleDashboardLoadState =
    dashboardState.scope === dashboardScope
      ? dashboardState
      : { scope: dashboardScope, status: "loading" };
  const scopedNotificationState =
    notificationState.scope === dashboardScope
      ? notificationState
      : {
          scope: dashboardScope,
          status: "loading" as const,
          items: [],
          error: "",
        };
  const notifications = scopedNotificationState.items;
  const unreadCount = notifications.filter(
    (item) => item.read_at === null,
  ).length;
  const notificationDrawerOpen = drawer.open && drawer.scope === dashboardScope;

  useEffect(() => {
    if (session.accessStatus !== "active") return;

    const requestScope = dashboardScope;
    let cancelled = false;
    setNotificationState({
      scope: requestScope,
      status: "loading",
      items: [],
      error: "",
    });
    void listNotifications()
      .then((items) => {
        if (!cancelled)
          setNotificationState({
            scope: requestScope,
            status: "ready",
            items,
            error: "",
          });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setNotificationState({
            scope: requestScope,
            status: "error",
            items: [],
            error: notificationErrorMessage(error),
          });
      });

    return () => {
      cancelled = true;
    };
  }, [dashboardScope, notificationAttempt, session.accessStatus]);

  useEffect(() => {
    if (session.accessStatus !== "active") return;

    const controller = new AbortController();
    void getRoleDashboard(role, globalThis.fetch, controller.signal)
      .then((dashboard) => {
        if (!controller.signal.aborted) {
          setDashboardState({
            scope: dashboardScope,
            status: "ready",
            dashboard,
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDashboardState({
            scope: dashboardScope,
            status: "error",
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, "DASHBOARD_UNAVAILABLE"),
          });
        }
      });

    return () => controller.abort();
  }, [dashboardAttempt, dashboardScope, role, session.accessStatus]);

  if (!canEnterDashboard(session)) {
    return <AccessBlocker session={session} navigate={navigate} />;
  }

  return (
    <div className="dashboard-shell">
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>
      <header className="lamp-bar">
        <button
          className="top-logo"
          onClick={() => navigate("/")}
          aria-label="Go to ResearchNAV home"
        >
          <Logo />
        </button>
        <label className="global-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search the repository</span>
          <input
            placeholder="Search the repository..."
            onKeyDown={(event) => {
              if (event.key === "Enter")
                navigate(
                  `/catalog?q=${encodeURIComponent(event.currentTarget.value)}`,
                );
            }}
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="lamp-actions">
          <span className="term-label">Role workspace</span>
          <button
            className="notification-button"
            onClick={() => setDrawer({ scope: dashboardScope, open: true })}
            aria-label="Open notifications"
          >
            <Bell />
            {unreadCount > 0 && <span>{unreadCount}</span>}
          </button>
          <button
            className="account-switcher"
            onClick={() => setAccountOpen(true)}
            aria-label="Open account details"
          >
            <span className="avatar account-icon">
              <CircleUserRound />
            </span>
            <span className="account-copy">
              <strong>{config.label}</strong>
              <small>{session.email}</small>
            </span>
          </button>
        </div>
      </header>

      <aside className="shelf-rail">
        <div className="shelf-label">
          <span>Workspace</span>
          <strong>{config.label}</strong>
        </div>
        <nav aria-label={`${config.label} navigation`}>
          {config.nav.map((item, index) => {
            const Icon = navIcons[index % navIcons.length];
            const active = item === selectedNav;
            return (
              <button
                key={item}
                className={active ? "active" : ""}
                aria-label={item}
                title={item}
                onClick={() =>
                  setActiveNav({ scope: dashboardScope, role, item })
                }
              >
                <Icon aria-hidden="true" />
                <span>{item}</span>
              </button>
            );
          })}
        </nav>
        <div className="shelf-footer">
          <div className="shelf-stamp">
            <BookOpen />
            <span>
              <strong>ResearchNAV</strong>
              <small>Repository workspace</small>
            </span>
          </div>
          <button onClick={() => navigate("/")}>
            Return to public catalog
          </button>
        </div>
      </aside>

      <main id="workspace" className="workspace">
        {selectedNav === primaryNav[role] ? (
          <RoleWorkspace
            role={role}
            navigate={navigate}
            selectNav={(item) =>
              setActiveNav({ scope: dashboardScope, role, item })
            }
            dashboardScope={dashboardScope}
            dashboardState={scopedDashboardState}
            onRetry={() => {
              setDashboardState({ scope: dashboardScope, status: "loading" });
              setDashboardAttempt((attempt) => attempt + 1);
            }}
            researchDocumentId={researchDocumentId}
          />
        ) : role === "admin" ? (
          <AdminSidebarPage selectedNav={selectedNav} />
        ) : (
          <RoleSidebarPage
            role={role}
            selectedNav={selectedNav}
            navigate={navigate}
          />
        )}
      </main>

      <nav className="mobile-tabs" aria-label="Mobile navigation">
        <button
          onClick={() =>
            setActiveNav({
              scope: dashboardScope,
              role,
              item: primaryNav[role],
            })
          }
        >
          <Home />
          <span>Home</span>
        </button>
        <button onClick={() => navigate("/catalog")}>
          <Search />
          <span>Search</span>
        </button>
        <button
          className="active"
          onClick={() =>
            setActiveNav({
              scope: dashboardScope,
              role,
              item: primaryNav[role],
            })
          }
        >
          <LayoutDashboard />
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setDrawer({ scope: dashboardScope, open: true })}
        >
          <Bell />
          <span>Alerts</span>
          {unreadCount > 0 && <small>{unreadCount}</small>}
        </button>
        <button onClick={() => setAccountOpen(true)}>
          <CircleUserRound />
          <span>Account</span>
        </button>
      </nav>

      {notificationDrawerOpen && (
        <NotificationsDrawer
          notifications={notifications}
          state={scopedNotificationState.status}
          error={scopedNotificationState.error}
          onRetry={() => setNotificationAttempt((attempt) => attempt + 1)}
          onMarkAll={async () => {
            const requestScope = dashboardScope;
            const results = await Promise.allSettled(
              notifications
                .filter((item) => item.read_at === null)
                .map((item) => markNotificationRead(item.id)),
            );
            const marked = results
              .filter(
                (
                  result,
                ): result is PromiseFulfilledResult<NotificationResource> =>
                  result.status === "fulfilled",
              )
              .map((result) => result.value);
            const failures = results.length - marked.length;
            setNotificationState((current) =>
              current.scope === requestScope
                ? {
                    ...current,
                    items: current.items.map(
                      (item) => marked.find(({ id }) => id === item.id) ?? item,
                    ),
                    error: failures
                      ? `${failures} notification${failures === 1 ? "" : "s"} could not be marked as read.`
                      : "",
                  }
                : current,
            );
          }}
          onOpen={async (item) => {
            const requestScope = dashboardScope;
            if (item.read_at === null) {
              try {
                const marked = await markNotificationRead(item.id);
                setNotificationState((current) =>
                  current.scope === requestScope
                    ? {
                        ...current,
                        items: current.items.map((currentItem) =>
                          currentItem.id === marked.id ? marked : currentItem,
                        ),
                      }
                    : current,
                );
              } catch (error) {
                setNotificationState((current) =>
                  current.scope === requestScope
                    ? { ...current, error: notificationErrorMessage(error) }
                    : current,
                );
                return;
              }
            }
            if (dashboardScopeRef.current !== requestScope) return;
            if (isAllowedNotificationPath(item.action_url))
              navigate(item.action_url);
            setDrawer({ scope: requestScope, open: false });
          }}
          onClose={() => setDrawer({ scope: dashboardScope, open: false })}
        />
      )}
      {accountOpen && (
        <AccountDialog
          session={session}
          roleLabel={config.label}
          onClose={() => setAccountOpen(false)}
          navigate={navigate}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}

function NotificationsDrawer({
  notifications,
  state,
  error,
  onRetry,
  onMarkAll,
  onOpen,
  onClose,
}: {
  notifications: NotificationResource[];
  state: "loading" | "ready" | "error";
  error: string;
  onRetry: () => void;
  onMarkAll: () => Promise<void>;
  onOpen: (item: NotificationResource) => Promise<void>;
  onClose: () => void;
}) {
  const [dialogRef, handleDialogKeyDown] = useDialogFocus<HTMLElement>(onClose);
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="notification-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2>Notifications</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close notifications"
          >
            <X />
          </button>
        </div>
        <button
          className="mark-read"
          disabled={
            state !== "ready" ||
            !notifications.some((item) => item.read_at === null)
          }
          onClick={() => void onMarkAll()}
        >
          Mark all as read
        </button>
        {state === "loading" ? (
          <p className="notification-empty" aria-busy="true">
            Loading notifications…
          </p>
        ) : state === "error" && notifications.length === 0 ? (
          <div className="notification-error" role="alert">
            <p>{error}</p>
            <button onClick={onRetry}>Retry</button>
          </div>
        ) : (
          <>
            {error && (
              <p className="notification-operation-error" role="alert">
                {error}
              </p>
            )}
            {notifications.length === 0 ? (
              <p className="notification-empty">No notifications.</p>
            ) : (
              <section className="notification-group">
                {notifications.map((item) => (
                  <button
                    className="notification-item"
                    key={item.id}
                    onClick={() => void onOpen(item)}
                  >
                    <span
                      className={item.read_at === null ? "unread-dot" : ""}
                    />
                    <span>
                      {item.title && <strong>{item.title}</strong>}
                      {item.message && <small>{item.message}</small>}
                      {item.created_at && <time>{item.created_at}</time>}
                      {item.action_url && <small>{item.action_url}</small>}
                      {item.research_document_id !== null && (
                        <small>{item.research_document_id}</small>
                      )}
                    </span>
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function notificationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Session expired. Sign out and sign in again.";
    if (error.status === 403)
      return "Notifications are not available for this account.";
    return `Notifications are unavailable (${error.code}).`;
  }
  return "Notifications are unavailable (REQUEST_FAILED).";
}

/** Notification destinations are navigation hints, never arbitrary external URLs. */
function isAllowedNotificationPath(path: string | null): path is string {
  if (!path || !path.startsWith("/")) return false;
  return (
    path === "/app" ||
    path.startsWith("/app/") ||
    path.startsWith("/app?") ||
    path.startsWith("/app#") ||
    /^\/research\/\d+(?:[/?#]|$)/.test(path) ||
    path === "/catalog" ||
    path.startsWith("/catalog?") ||
    path.startsWith("/catalog#")
  );
}

function AccountDialog({
  session,
  roleLabel,
  onClose,
  navigate,
  onLogout,
}: {
  session: UserSession;
  roleLabel: string;
  onClose: () => void;
  navigate: (path: string) => void;
  onLogout?: () => Promise<void> | void;
}) {
  const [dialogRef, handleDialogKeyDown] = useDialogFocus<HTMLElement>(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="account-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button dialog-close"
          onClick={onClose}
          aria-label="Close account"
        >
          <X />
        </button>
        <span className="avatar account-avatar">
          <CircleUserRound />
        </span>
        <p className="eyebrow">Authenticated account</p>
        <h2 id="account-title">Google account</h2>
        <p>{session.email}</p>
        <div className="assigned-role">
          <span>{session.isAdmin ? "Access level" : "Assigned role"}</span>
          <strong>
            {session.isAdmin ? "Administrator · Full access" : roleLabel}
          </strong>
        </div>
        <small>
          Your dashboard is selected automatically from this assigned role.
          Contact the Research Coordinator if your access needs to change.
        </small>
        <button
          className="account-public-link"
          onClick={() => {
            onClose();
            navigate("/");
          }}
        >
          Return to public catalog
        </button>
        {onLogout && (
          <button className="account-signout" onClick={() => void onLogout()}>
            Sign out
          </button>
        )}
      </section>
    </div>
  );
}

function AccessBlocker({
  session,
  navigate,
}: {
  session: UserSession;
  navigate: (path: string) => void;
}) {
  const invited = session.accessStatus === "invited";
  return (
    <div className="access-blocker-page">
      <header className="access-blocker-header">
        <Logo />
        <span>Google account verification</span>
      </header>
      <main className="access-blocker-main">
        <section className="access-blocker-card">
          <span className="access-blocker-icon">
            {invited ? <MailCheck /> : <ShieldAlert />}
          </span>
          <p className="eyebrow">Dashboard access pending</p>
          <h1>
            {invited
              ? "Check your Gmail to activate access."
              : "Your account is awaiting approval."}
          </h1>
          <p>
            {invited
              ? `A ${roleConfigs.find((item) => item.id === session.role)?.label} invitation was sent to ${session.email}. Open the email and confirm the invitation before returning here.`
              : `${session.email} is verified with Google, but no workspace has been assigned yet. Ask a System Administrator or Research Coordinator to approve this account.`}
          </p>
          <div className="access-blocker-status">
            <span>Google account</span>
            <strong>{session.email}</strong>
            <span>Workspace assignment</span>
            <strong>
              {invited
                ? roleConfigs.find((item) => item.id === session.role)?.label
                : "Pending approval"}
            </strong>
            <span>Access status</span>
            <strong className={invited ? "status-invited" : "status-blocked"}>
              {invited ? "Invitation sent" : "Not assigned"}
            </strong>
          </div>
          <div className="access-blocker-actions">
            {invited && (
              <a
                className="button button-primary"
                href="https://mail.google.com"
                target="_blank"
                rel="noreferrer"
              >
                <MailCheck /> Open Gmail
              </a>
            )}
            <button
              className="button button-secondary"
              onClick={() => window.location.reload()}
            >
              <RefreshCw />
              {invited ? "I already confirmed" : "Check approval status"}
            </button>
          </div>
          <button className="use-another-account" onClick={() => navigate("/")}>
            Use another Google account
          </button>
        </section>
        {!invited && <AccessRequestPanel />}
      </main>
    </div>
  );
}
