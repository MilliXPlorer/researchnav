import { useEffect, useState } from "react";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import GoogleSignInDialog from "./GoogleSignInDialog";
import LandingPage from "./LandingPage";
import { getCurrentSession, logout } from "./api";
import type { UserSession } from "./types";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [session, setSession] = useState<UserSession | null | undefined>(
    undefined,
  );
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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
        <CatalogPage onSignIn={signIn} navigate={navigate} />
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
        <LandingPage onSignIn={signIn} navigate={navigate} />
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
