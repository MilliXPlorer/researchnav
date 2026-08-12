import { useEffect, useState } from "react";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import GoogleSignInDialog from "./GoogleSignInDialog";
import LandingPage from "./LandingPage";
import { getCurrentSession, listPublicResearch, logout } from "./api";
import { createBrowserInitialState, type InitialState } from "./ssr";
import type { ResearchRecord, UserSession } from "./types";

export default function App({ initialState }: { initialState?: InitialState }) {
  const seed = initialState ?? createBrowserInitialState();
  const [location, setLocation] = useState(seed.url);
  const [session, setSession] = useState<UserSession | null | undefined>(
    seed.session.status === "authenticated"
      ? seed.session.user
      : seed.session.status === "anonymous"
        ? null
        : undefined,
  );
  const [loginOpen, setLoginOpen] = useState(false);
  const [records, setRecords] = useState<ResearchRecord[]>(
    seed.repository.records,
  );
  const [repositoryLoading, setRepositoryLoading] = useState(
    seed.repository.status === "unresolved",
  );
  const [repositoryError, setRepositoryError] = useState<string | null>(
    seed.repository.status === "error" ? seed.repository.message : null,
  );
  const path = location.pathname;

  useEffect(() => {
    const handlePopState = () =>
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (seed.repository.status !== "unresolved") return;
    let active = true;
    listPublicResearch()
      .then((publicRecords) => {
        if (active) {
          setRecords(publicRecords);
          setRepositoryError(null);
        }
      })
      .catch(() => {
        if (active) setRepositoryError("The public catalog is unavailable.");
      })
      .finally(() => {
        if (active) setRepositoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [seed.repository.status]);

  useEffect(() => {
    if (seed.session.status !== "unresolved") return;
    let active = true;
    getCurrentSession()
      .then((currentSession) => {
        if (active) setSession(currentSession);
      })
      .catch(() => {
        if (active) setSession(null);
      });
    return () => {
      active = false;
    };
  }, [seed.session.status]);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    const nextUrl = new URL(nextPath, window.location.origin);
    setLocation({ pathname: nextUrl.pathname, search: nextUrl.search });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signIn = () => setLoginOpen(true);

  if (path === "/app" && session === undefined) {
    return <div className="session-loading">Loading ResearchNAV...</div>;
  }

  return (
    <>
      {path === "/catalog" ? (
        <CatalogPage
          onSignIn={signIn}
          navigate={navigate}
          records={records}
          loading={repositoryLoading}
          error={repositoryError}
          initialSearch={location.search}
        />
      ) : path === "/app" && session ? (
        <Dashboard
          session={session}
          navigate={navigate}
          onLogout={async () => {
            await logout();
            setSession(null);
            navigate("/");
          }}
        />
      ) : (
        <LandingPage
          onSignIn={signIn}
          navigate={navigate}
          records={records}
          loading={repositoryLoading}
          error={repositoryError}
        />
      )}
      {loginOpen && (
        <GoogleSignInDialog
          onClose={() => setLoginOpen(false)}
          onAuthenticated={(authenticatedSession) => {
            setSession(authenticatedSession);
            setLoginOpen(false);
            navigate("/app");
          }}
        />
      )}
    </>
  );
}
