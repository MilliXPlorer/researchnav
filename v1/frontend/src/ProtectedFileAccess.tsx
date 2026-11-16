import { FileQuestion, LockKeyhole, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";
import { repositoryDownloadUrl } from "./api";
import { Button } from "./components";
import { Modal } from "./Modal";

type AccessState = "sign-in" | "restricted" | "unavailable" | "error";

export default function ProtectedFileAccess({
  researchDocumentId,
  authenticated,
  onSignIn,
  children,
  className = "button button-primary",
}: {
  researchDocumentId: string | number;
  authenticated: boolean;
  onSignIn: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<AccessState | null>(null);
  const [checking, setChecking] = useState(false);

  function close() {
    setState(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function openFiles() {
    if (!authenticated) {
      setState("sign-in");
      return;
    }

    setChecking(true);
    try {
      const response = await fetch(repositoryDownloadUrl(researchDocumentId), {
        credentials: "include",
      });
      if (!response.ok) {
        setState(
          response.status === 401
            ? "sign-in"
            : response.status === 403
              ? "restricted"
              : response.status === 404
                ? "unavailable"
                : "error",
        );
        return;
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setState("error");
    } finally {
      setChecking(false);
    }
  }

  const content = accessContent(state);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        onClick={openFiles}
        disabled={checking}
      >
        {children}
      </button>
      {state && content && (
        <Modal
          label={content.heading}
          onClose={close}
          className="protected-file-modal"
        >
          <div className="protected-file-modal-content">
            <span className="protected-file-modal-icon" aria-hidden="true">
              <content.Icon />
            </span>
            <h2>{content.heading}</h2>
            <p>{content.description}</p>
            <div className="protected-file-modal-actions">
              {state === "sign-in" && (
                <Button
                  onClick={() => {
                    close();
                    onSignIn();
                  }}
                >
                  Sign In
                </Button>
              )}
              <Button variant="secondary" onClick={close}>
                Continue Browsing
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function accessContent(state: AccessState | null) {
  switch (state) {
    case "sign-in":
      return {
        Icon: LockKeyhole,
        heading: "Sign In Required",
        description:
          "To view or download research files, please sign in to your ResearchNAV account.",
      };
    case "restricted":
      return {
        Icon: ShieldAlert,
        heading: "Access Restricted",
        description:
          "Your account does not have permission to access these research files.",
      };
    case "unavailable":
      return {
        Icon: FileQuestion,
        heading: "Files Unavailable",
        description: "The requested research files are currently unavailable.",
      };
    case "error":
      return {
        Icon: FileQuestion,
        heading: "Unable to Open Files",
        description:
          "ResearchNAV could not open these files. Please try again later.",
      };
    default:
      return null;
  }
}
