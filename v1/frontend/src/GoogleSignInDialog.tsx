import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { authenticateWithGoogle } from "./api";
import ConsentNotice from "./ConsentNotice";
import { hasAcceptedCurrentConsent, storeConsentAcceptance } from "./consent";
import type { UserSession } from "./types";
import { useDialogFocus } from "./useDialogFocus";

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityServices() {
  if (window.google) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-google-identity]",
    );
    if (existing) {
      existing.remove();
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GOOGLE_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
  googleScriptPromise = promise.catch((error) => {
    document
      .querySelector<HTMLScriptElement>("script[data-google-identity]")
      ?.remove();
    googleScriptPromise = null;
    throw error;
  });
  return googleScriptPromise;
}

export default function GoogleSignInDialog({
  onClose,
  onAuthenticated,
}: {
  onClose: () => void;
  onAuthenticated: (session: UserSession) => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Consent is required before the Google button is initialized at all.
  const [consented, setConsented] = useState(() => hasAcceptedCurrentConsent());
  const [dialogRef, handleDialogKeyDown] = useDialogFocus<HTMLElement>(onClose);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const configurationError = clientId
    ? ""
    : "Google Client ID is not configured.";

  useEffect(() => {
    if (!clientId || !consented) return;
    let active = true;
    loadGoogleIdentityServices()
      .then(() => {
        if (!active || !window.google || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            setSubmitting(true);
            setError("");
            try {
              onAuthenticated(await authenticateWithGoogle(credential));
            } catch {
              setError(
                "Google sign-in could not be verified. Please try again.",
              );
            } finally {
              setSubmitting(false);
            }
          },
        });
        buttonRef.current.replaceChildren();
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 320,
        });
      })
      .catch(() =>
        setError(
          "Google sign-in was blocked. Allow accounts.google.com in your browser privacy settings, then retry.",
        ),
      );
    return () => {
      active = false;
    };
  }, [clientId, consented, onAuthenticated, retryAttempt]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={`google-signin-dialog${consented ? "" : " consent-dialog"}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-signin-title"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button dialog-close"
          onClick={onClose}
          aria-label="Close sign in"
        >
          <X />
        </button>
        {!consented ? (
          <ConsentNotice
            onDecline={onClose}
            onAccept={() => {
              storeConsentAcceptance();
              setConsented(true);
            }}
          />
        ) : (
          <>
            <span className="dialog-icon">
              <ShieldCheck />
            </span>
            <p className="eyebrow">Secure account access</p>
            <h2 id="google-signin-title">Continue with Google</h2>
            <p>
              ResearchNAV verifies your Gmail on the server, then routes you to
              the dashboard assigned to that account.
            </p>
            <div
              className="google-button-slot"
              ref={buttonRef}
              aria-busy={submitting}
            />
            {submitting && (
              <span className="signin-progress">Verifying account...</span>
            )}
            {(error || configurationError) && (
              <>
                <p className="signin-error" role="alert">
                  {error || configurationError}
                </p>
                {error && (
                  <button
                    className="text-action"
                    onClick={() => {
                      setError("");
                      setRetryAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry Google sign-in
                  </button>
                )}
              </>
            )}
            <small>
              New and unassigned accounts remain blocked until provisioned.
            </small>
          </>
        )}
      </section>
    </div>
  );
}
