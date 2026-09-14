import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleUserRound,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FileSearch,
  FileText,
  FileUp,
  Flag,
  FolderKanban,
  Home,
  LibraryBig,
  LayoutDashboard,
  MailCheck,
  Menu,
  Presentation,
  RefreshCw,
  ScanSearch,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UserCog,
  Users,
  X,
  LogOut,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { canEnterDashboard } from "./access";
import AccessRequestPanel from "./AccessRequestPanel";
import {
  ApiError,
  decideAccessRequest,
  getRoleDashboard,
  listNotifications,
  markNotificationRead,
  type NotificationResource,
  type RequestableRole,
} from "./api";
import AdminSidebarPage from "./AdminSidebarPages";
import { Button, Logo } from "./components";
import { roleConfigs } from "./data";
import { Modal } from "./Modal";
import ProfileDialog, { ProfileAvatar } from "./ProfileDialog";
import RoleSidebarPage from "./RoleSidebarPages";
import RoleWorkspace, { type RoleDashboardLoadState } from "./RoleWorkspaces";
import type { Role, UserSession } from "./types";
import { useDialogFocus } from "./useDialogFocus";

const primaryNav: Record<Role, string> = {
  admin: "Dashboard",
  researcher: "Dashboard",
  adviser: "Dashboard",
  instructor: "Dashboard",
  panel: "Dashboard",
  statistician: "Dashboard",
  coordinator: "Program Overview",
  librarian: "Dashboard",
  "research-office": "Dashboard",
  research_editor: "Dashboard",
};

const navIcons: Record<string, LucideIcon> = {
  "Audit Logs": ScrollText,
  "Upload Manuscript": FileUp,
  "System Settings": Settings,
  Dashboard: LayoutDashboard,
  "My Research": FolderKanban,
  "My Sections": FolderKanban,
  "Similarity Check": ScanSearch,
  "Assigned Research": BookOpen,
  "Title Review": FileSearch,
  "Manuscript Review": BookOpenCheck,
  "Defense Monitoring Forms": Activity,
  "Research Progress Updates": Activity,
  "Review History": FileClock,
  "Review Submissions": ClipboardCheck,
  "Assigned Defenses": Presentation,
  "Defense Evaluation": ClipboardCheck,
  "Availability Calendar": CalendarDays,
  "Evaluation History": FileClock,
  "Statistical Review": ChartNoAxesCombined,
  "Editorial Review": FileText,
  "Program Overview": LayoutDashboard,
  Schedules: CalendarDays,
  "Duplicate Flags": Flag,
  "Adviser Load": Users,
  "Account Roles": UserCog,
  Reports: ChartNoAxesCombined,
  "Assignment Requests": ClipboardCheck,
  "Reference Review": BookOpenCheck,
  "User & Role Management": UserCog,
  "Access Requests": ClipboardCheck,
  "Reports & Exports": FileCheck2,
  Search,
  "My Library": LibraryBig,
  "Browse by Category": Archive,
  Notifications: Bell,
  Profile: CircleUserRound,
};

const getNavIcon = (item: string) => navIcons[item] ?? SlidersHorizontal;
const ignoreSessionChange = () => undefined;

export default function Dashboard({
  session,
  navigate,
  onSessionChange = ignoreSessionChange,
  onLogout,
  researchDocumentId,
  instructorSectionsRoute = false,
  instructorSectionId,
  instructorProjectDocumentId,
  initialNav,
  initialSimilarityMode,
}: {
  session: UserSession;
  navigate: (path: string) => void;
  onSessionChange?: (session: UserSession) => void;
  onLogout?: () => Promise<void> | void;
  researchDocumentId?: string | number;
  instructorSectionsRoute?: boolean;
  instructorSectionId?: string | number;
  instructorProjectDocumentId?: string | number;
  initialNav?: string;
  initialSimilarityMode?: "title" | "content";
}) {
  const role = session.role;
  const dashboardScope = `${role}:${session.email.trim().toLowerCase()}`;
  const dashboardScopeRef = useRef(dashboardScope);
  dashboardScopeRef.current = dashboardScope;
  const config = roleConfigs.find((item) => item.id === role)!;
  const [activeNav, setActiveNav] = useState({
    scope: dashboardScope,
    role,
    item:
      initialNav && config.nav.includes(initialNav)
        ? initialNav
        : primaryNav[role],
  });
  const [drawer, setDrawer] = useState({
    scope: dashboardScope,
    open: false,
  });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [similarityMenuOpen, setSimilarityMenuOpen] = useState(false);
  const similarityMode = initialSimilarityMode ?? "title";
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationState, setNotificationState] = useState({
    scope: dashboardScope,
    status: "loading" as "loading" | "ready" | "error",
    items: [] as NotificationResource[],
    error: "",
    source: "live" as "live" | "mock",
  });
  const [notificationAttempt, setNotificationAttempt] = useState(0);
  const [accessRequestNotification, setAccessRequestNotification] =
    useState<NotificationResource | null>(null);
  const [accessDecisionBusy, setAccessDecisionBusy] = useState(false);
  const [accessDecisionError, setAccessDecisionError] = useState("");
  const [dashboardState, setDashboardState] = useState<RoleDashboardLoadState>({
    scope: dashboardScope,
    status: "loading",
  });
  const [dashboardAttempt, setDashboardAttempt] = useState(0);
  const selectedNav =
    activeNav.scope === dashboardScope ? activeNav.item : primaryNav[role];
  useEffect(() => {
    if (initialNav && config.nav.includes(initialNav)) {
      setActiveNav({ scope: dashboardScope, role, item: initialNav });
    }
  }, [config.nav, dashboardScope, initialNav, role]);
  const showingInstructorSection =
    role === "instructor" && instructorSectionsRoute;
  const showingRecordWorkspace =
    researchDocumentId !== undefined &&
    (
      [
        "researcher",
        "admin",
        "adviser",
        "instructor",
        "panel",
        "statistician",
        "research-office",
      ] as Role[]
    ).includes(role);

  function selectNavigation(item: string) {
    setActiveNav({ scope: dashboardScope, role, item });
    if (role === "researcher") {
      if (item === "My Research") {
        navigate("/app/researcher/submissions");
      } else if (showingRecordWorkspace) {
        navigate("/app");
      }
      return;
    }
    if (role !== "instructor") return;
    if (item === "My Sections") {
      navigate("/app/instructor/sections");
    } else if (showingInstructorSection) {
      navigate("/app");
    }
  }
  function selectSimilarityMode(mode: "title" | "content") {
    setSimilarityMenuOpen(true);
    selectNavigation("Similarity Check");
    navigate(`/app/researcher/similarity/${mode}`);
  }
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
          source: "live" as const,
        };
  const notifications = scopedNotificationState.items;
  const unreadCount = notifications.filter(
    (item) =>
      scopedNotificationState.source === "live" && item.read_at === null,
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
      source: "live",
    });
    void listNotifications()
      .then((items) => {
        if (!cancelled)
          setNotificationState({
            scope: requestScope,
            status: "ready",
            items,
            error: "",
            source: "live",
          });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setNotificationState({
            scope: requestScope,
            status: "error",
            items: [],
            error: notificationErrorMessage(error),
            source: "live",
          });
      });

    return () => {
      cancelled = true;
    };
  }, [dashboardScope, notificationAttempt, role, session.accessStatus]);

  useEffect(() => {
    if (session.accessStatus !== "active") return;
    const interval = window.setInterval(
      () => setNotificationAttempt((attempt) => attempt + 1),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, [dashboardScope, session.accessStatus]);

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
            source: "live",
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

  async function recordAccessDecision(decision: "approve" | "reject") {
    const notification = accessRequestNotification;
    if (!notification?.access_request_id) return;

    setAccessDecisionBusy(true);
    setAccessDecisionError("");
    try {
      await decideAccessRequest(notification.access_request_id, {
        decision,
        granted_role:
          decision === "approve"
            ? ((notification.requested_role ?? "researcher") as RequestableRole)
            : undefined,
      });
      setAccessRequestNotification(null);
      setNotificationAttempt((attempt) => attempt + 1);
      setDashboardAttempt((attempt) => attempt + 1);
    } catch (error) {
      setAccessDecisionError(
        error instanceof ApiError
          ? `The request could not be ${decision === "approve" ? "approved" : "rejected"} (${error.code}).`
          : "The access decision could not be recorded.",
      );
    } finally {
      setAccessDecisionBusy(false);
    }
  }

  if (!canEnterDashboard(session)) {
    return (
      <AccessBlocker
        session={session}
        navigate={navigate}
        onSessionChange={onSessionChange}
        onLogout={onLogout}
      />
    );
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
            className="workspace-menu-button"
            onClick={() => setWorkspaceMenuOpen((open) => !open)}
            aria-label="Open workspace navigation"
            aria-expanded={workspaceMenuOpen}
            aria-controls="mobile-workspace-navigation"
          >
            <Menu />
          </button>
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
            <ProfileAvatar session={session} className="account-icon" />
            <span className="account-copy">
              <strong>{session.displayName}</strong>
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
          {config.nav.map((item) => {
            const Icon = getNavIcon(item);
            const active = item === selectedNav;
            if (role === "researcher" && item === "Similarity Check") {
              return (
                <div className="sidebar-nav-group" key={item}>
                  <button
                    className={active ? "active" : ""}
                    aria-label="Similarity Check"
                    aria-expanded={similarityMenuOpen}
                    onClick={() => setSimilarityMenuOpen((open) => !open)}
                  >
                    <Icon aria-hidden="true" />
                    <span>Similarity Check</span>
                    <ChevronDown
                      className="sidebar-nav-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {similarityMenuOpen && (
                    <div className="sidebar-nav-children">
                      <button onClick={() => selectSimilarityMode("title")}>
                        Title Checker
                      </button>
                      <button onClick={() => selectSimilarityMode("content")}>
                        Content Checker
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                key={item}
                className={active ? "active" : ""}
                aria-label={item}
                title={item}
                onClick={() => {
                  if (item === "Notifications") {
                    setDrawer({ scope: dashboardScope, open: true });
                    return;
                  }
                  if (item === "Profile") {
                    setAccountOpen(true);
                    return;
                  }
                  selectNavigation(item);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item}</span>
              </button>
            );
          })}
        </nav>
        <div className="shelf-footer">
          <div className="shelf-profile">
            <ProfileAvatar session={session} className="shelf-profile-avatar" />
            <div className="shelf-profile-copy">
              <button
                className="shelf-profile-trigger"
                onClick={() => setAccountOpen(true)}
                aria-label={`Open profile for ${session.displayName}`}
              >
                <strong>{session.displayName}</strong>
                <small>{session.email}</small>
              </button>
              <div className="shelf-profile-menu" role="menu">
                <button role="menuitem" onClick={() => setAccountOpen(true)}>
                  <Pencil size={14} /> Edit profile
                </button>
                <button role="menuitem" onClick={() => void onLogout?.()}>
                  <LogOut size={14} /> Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main id="workspace" className="workspace">
        {showingInstructorSection ? (
          <RoleSidebarPage
            role={role}
            selectedNav="My Sections"
            navigate={navigate}
            instructorSectionId={instructorSectionId}
            instructorProjectDocumentId={instructorProjectDocumentId}
          />
        ) : role === "research_editor" && selectedNav === "Dashboard" ? (
          <RoleSidebarPage
            role={role}
            selectedNav="Dashboard"
            navigate={navigate}
          />
        ) : showingRecordWorkspace || selectedNav === primaryNav[role] ? (
          <RoleWorkspace
            role={role}
            navigate={navigate}
            selectNav={selectNavigation}
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
            similarityMode={similarityMode}
          />
        )}
      </main>

      {workspaceMenuOpen && (
        <div
          className="workspace-menu-backdrop"
          onMouseDown={() => setWorkspaceMenuOpen(false)}
        >
          <nav
            id="mobile-workspace-navigation"
            className="workspace-menu"
            aria-label={`${config.label} workspace navigation`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">{config.label} workspace</p>
            {config.nav.map((item) => {
              const Icon = getNavIcon(item);
              const active = item === selectedNav;
              if (role === "researcher" && item === "Similarity Check") {
                return (
                  <div className="sidebar-nav-group" key={item}>
                    <button
                      className={active ? "active" : ""}
                      aria-expanded={similarityMenuOpen}
                      onClick={() => setSimilarityMenuOpen((open) => !open)}
                    >
                      <Icon aria-hidden="true" />
                      <span>Similarity Check</span>
                      <ChevronDown
                        className="sidebar-nav-chevron"
                        aria-hidden="true"
                      />
                    </button>
                    {similarityMenuOpen && (
                      <div className="sidebar-nav-children">
                        <button
                          onClick={() => {
                            selectSimilarityMode("title");
                            setWorkspaceMenuOpen(false);
                          }}
                        >
                          Title Checker
                        </button>
                        <button
                          onClick={() => {
                            selectSimilarityMode("content");
                            setWorkspaceMenuOpen(false);
                          }}
                        >
                          Content Checker
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={item}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (item === "Notifications") {
                      setDrawer({ scope: dashboardScope, open: true });
                    } else if (item === "Profile") {
                      setAccountOpen(true);
                    } else {
                      selectNavigation(item);
                    }
                    setWorkspaceMenuOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{item}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}

      <nav className="mobile-tabs" aria-label="Mobile navigation">
        <button
          className={selectedNav === primaryNav[role] ? "active" : ""}
          aria-current={selectedNav === primaryNav[role] ? "page" : undefined}
          onClick={() => selectNavigation(primaryNav[role])}
        >
          <Home />
          <span>Home</span>
        </button>
        <button onClick={() => navigate("/catalog")}>
          <Search />
          <span>Search</span>
        </button>
        <button
          className={selectedNav !== primaryNav[role] ? "active" : ""}
          aria-current={selectedNav !== primaryNav[role] ? "page" : undefined}
          onClick={() => setWorkspaceMenuOpen(true)}
          aria-expanded={workspaceMenuOpen}
          aria-controls="mobile-workspace-navigation"
        >
          <LayoutDashboard />
          <span>Workspace</span>
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
          source={scopedNotificationState.source}
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
            if (
              role === "admin" &&
              item.event === "ACCESS_REQUEST_SUBMITTED" &&
              item.access_request_id
            ) {
              setAccessDecisionError("");
              setAccessRequestNotification(item);
              setDrawer({ scope: requestScope, open: false });
              return;
            }
            if (isAllowedNotificationPath(item.action_url))
              navigate(item.action_url);
            setDrawer({ scope: requestScope, open: false });
          }}
          onClose={() => setDrawer({ scope: dashboardScope, open: false })}
        />
      )}
      {accessRequestNotification?.access_request_id && (
        <Modal
          label="Review access request"
          busy={accessDecisionBusy}
          onClose={() => setAccessRequestNotification(null)}
        >
          <div className="modal-heading">
            <p className="eyebrow">Workspace access</p>
            <h2>Review access request</h2>
            <p>
              Approving activates this account with the requested role.
              Rejecting leaves the account blocked.
            </p>
          </div>
          <dl className="project-assignment-summary">
            <div>
              <dt>Applicant</dt>
              <dd>
                {accessRequestNotification.full_name ||
                  accessRequestNotification.applicant_email ||
                  "Unknown account"}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                {accessRequestNotification.applicant_email || "Not provided"}
              </dd>
            </div>
            <div>
              <dt>Requested role</dt>
              <dd>
                {accessRequestNotification.requested_role || "researcher"}
              </dd>
            </div>
            <div>
              <dt>Program</dt>
              <dd>{accessRequestNotification.program || "Not provided"}</dd>
            </div>
          </dl>
          {accessRequestNotification.justification && (
            <p>{accessRequestNotification.justification}</p>
          )}
          {accessDecisionError && (
            <p className="admin-error" role="alert">
              {accessDecisionError}
            </p>
          )}
          <div className="row-actions">
            <Button
              disabled={accessDecisionBusy}
              onClick={() => void recordAccessDecision("approve")}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              disabled={accessDecisionBusy}
              onClick={() => void recordAccessDecision("reject")}
            >
              Reject
            </Button>
          </div>
        </Modal>
      )}
      {accountOpen && (
        <ProfileDialog
          session={session}
          onSessionChange={onSessionChange}
          onClose={() => setAccountOpen(false)}
          onOpenWorkspace={() => setAccountOpen(false)}
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
  source,
  onRetry,
  onMarkAll,
  onOpen,
  onClose,
}: {
  notifications: NotificationResource[];
  state: "loading" | "ready" | "error";
  error: string;
  source: "live" | "mock";
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
            source === "mock" ||
            state !== "ready" ||
            !notifications.some((item) => item.read_at === null)
          }
          onClick={() => void onMarkAll()}
        >
          Mark all as read
        </button>
        {source === "mock" && (
          <div className="researcher-demo-notice" role="status">
            <div>
              <strong>Demo data - read only</strong>
              <span>Live notifications could not be loaded.</span>
            </div>
            <button onClick={onRetry}>Retry live data</button>
          </div>
        )}
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
                    onClick={() => source === "live" && void onOpen(item)}
                    disabled={source === "mock"}
                  >
                    <span
                      className={item.read_at === null ? "unread-dot" : ""}
                    />
                    <span>
                      {item.title && <strong>{item.title}</strong>}
                      {(item.details ?? item.message) && (
                        <small>{item.details ?? item.message}</small>
                      )}
                      {item.research_title && (
                        <small>{item.research_title}</small>
                      )}
                      {item.submission_reference && (
                        <small>{item.submission_reference}</small>
                      )}
                      {item.created_at && <time>{item.created_at}</time>}
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

function AccessBlocker({
  session,
  navigate,
  onSessionChange,
  onLogout,
}: {
  session: UserSession;
  navigate: (path: string) => void;
  onSessionChange: (session: UserSession) => void;
  onLogout?: () => Promise<void> | void;
}) {
  const invited = session.accessStatus === "invited";
  const [profileOpen, setProfileOpen] = useState(false);
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
            <button
              className="button button-secondary"
              onClick={() => setProfileOpen(true)}
            >
              <CircleUserRound /> Manage profile
            </button>
          </div>
          <button className="use-another-account" onClick={() => navigate("/")}>
            Use another Google account
          </button>
        </section>
        {!invited && <AccessRequestPanel />}
      </main>
      {profileOpen && (
        <ProfileDialog
          session={session}
          onSessionChange={onSessionChange}
          onClose={() => setProfileOpen(false)}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}
