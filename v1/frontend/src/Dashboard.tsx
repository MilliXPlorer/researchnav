import { useEffect, useState } from "react";
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
import {
  listNotifications,
  markNotificationRead,
  type NotificationResource,
} from "./api";
import { Logo } from "./components";
import { roleConfigs } from "./data";
import RoleWorkspace from "./RoleWorkspaces";
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
}: {
  session: UserSession;
  navigate: (path: string) => void;
  onLogout?: () => Promise<void> | void;
}) {
  const role = session.role;
  const config = roleConfigs.find((item) => item.id === role)!;
  const [activeNav, setActiveNav] = useState(primaryNav[role]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResource[]>(
    [],
  );
  const [toast, setToast] = useState("");
  const unreadCount = notifications.filter(
    (item) => item.read_at === null,
  ).length;

  useEffect(() => {
    if (!canEnterDashboard(session)) return;

    let cancelled = false;
    void listNotifications()
      .then((items) => {
        if (!cancelled) setNotifications(items);
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

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
          <span className="term-label">AY 2025—26</span>
          <button
            className="notification-button"
            onClick={() => setDrawerOpen(true)}
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
            const active = item === activeNav;
            return (
              <button
                key={item}
                className={active ? "active" : ""}
                onClick={() => {
                  setActiveNav(item);
                  if (item === "Notifications") setDrawerOpen(true);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item}</span>
                {item === "Notifications" && unreadCount > 0 && (
                  <small>{unreadCount}</small>
                )}
              </button>
            );
          })}
        </nav>
        <div className="shelf-footer">
          <div className="shelf-stamp">
            <BookOpen />
            <span>
              <strong>ResearchNAV</strong>
              <small>Repository prototype</small>
            </span>
          </div>
          <button onClick={() => navigate("/")}>
            Return to public catalog
          </button>
        </div>
      </aside>

      <main id="workspace" className="workspace">
        {activeNav === primaryNav[role] ? (
          <RoleWorkspace role={role} notify={notify} />
        ) : (
          <section className="scope-page">
            <p className="eyebrow">{config.label}</p>
            <h1>{activeNav}</h1>
            <div className="scope-card">
              <BookOpen />
              <h2>This shelf is being cataloged.</h2>
              <p>
                The prototype focuses on the primary workspace for each role.
                Select <strong>{primaryNav[role]}</strong> to return to the
                completed view.
              </p>
              <button onClick={() => setActiveNav(primaryNav[role])}>
                Return to primary workspace
              </button>
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-tabs" aria-label="Mobile navigation">
        <button onClick={() => setActiveNav(primaryNav[role])}>
          <Home />
          <span>Home</span>
        </button>
        <button onClick={() => navigate("/catalog")}>
          <Search />
          <span>Search</span>
        </button>
        <button
          className="active"
          onClick={() => setActiveNav(primaryNav[role])}
        >
          <LayoutDashboard />
          <span>Dashboard</span>
        </button>
        <button onClick={() => setDrawerOpen(true)}>
          <Bell />
          <span>Alerts</span>
          {unreadCount > 0 && <small>{unreadCount}</small>}
        </button>
        <button onClick={() => setAccountOpen(true)}>
          <CircleUserRound />
          <span>Account</span>
        </button>
      </nav>

      {drawerOpen && (
        <NotificationsDrawer
          notifications={notifications}
          onMarkAll={async () => {
            const marked = await Promise.all(
              notifications
                .filter((item) => item.read_at === null)
                .map((item) => markNotificationRead(item.id)),
            );
            setNotifications((current) =>
              current.map(
                (item) => marked.find(({ id }) => id === item.id) ?? item,
              ),
            );
          }}
          onOpen={async (item) => {
            if (item.read_at === null) {
              const marked = await markNotificationRead(item.id);
              setNotifications((current) =>
                current.map((currentItem) =>
                  currentItem.id === marked.id ? marked : currentItem,
                ),
              );
            }
            if (item.action_url) navigate(item.action_url);
            setDrawerOpen(false);
          }}
          onClose={() => setDrawerOpen(false)}
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
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}

function NotificationsDrawer({
  notifications,
  onMarkAll,
  onOpen,
  onClose,
}: {
  notifications: NotificationResource[];
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
          disabled={!notifications.some((item) => item.read_at === null)}
          onClick={() => void onMarkAll()}
        >
          Mark all as read
        </button>
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
                <span className={item.read_at === null ? "unread-dot" : ""} />
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
      </aside>
    </div>
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
      </main>
    </div>
  );
}
