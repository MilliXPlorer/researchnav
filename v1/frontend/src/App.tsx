import { useEffect, useState } from "react";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import GoogleSignInDialog from "./GoogleSignInDialog";
import LandingPage from "./LandingPage";
import { getCurrentSession, listPublicResearch, logout } from "./api";
import type { ResearchRecord, UserSession } from "./types";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [session, setSession] = useState<UserSession | null | undefined>(
    undefined,
  );
  const [loginOpen, setLoginOpen] = useState(false);
  const [records, setRecords] = useState<ResearchRecord[]>([]);
  const [repositoryLoading, setRepositoryLoading] = useState(true);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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
  }, []);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    setPath(new URL(nextPath, window.location.origin).pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signIn = () => setLoginOpen(true);

  if (session === undefined) {
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
