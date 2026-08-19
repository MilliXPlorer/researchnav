import { useEffect, useState } from "react";
import { ClipboardCheck, Send } from "lucide-react";
import {
  ApiError,
  getMyAccessRequest,
  REQUESTABLE_ROLES,
  submitAccessRequest,
  type AccessRequestResource,
  type RequestableRole,
} from "./api";
import { Button } from "./components";
import { roleConfigs } from "./data";

type State =
  | { status: "loading" }
  | { status: "form" }
  | { status: "submitting" }
  | { status: "submitted"; request: AccessRequestResource }
  | { status: "existing"; request: AccessRequestResource };

function roleLabelFor(role: string) {
  return roleConfigs.find((config) => config.id === role)?.label ?? role;
}

function requestError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "REQUEST_ALREADY_PENDING")
      return "A request from this account is already awaiting review.";
    if (error.code === "ACCESS_ALREADY_GRANTED")
      return "This account already has access. Reload the page.";
    if (error.status === 401)
      return "Session expired. Sign in again to request access.";
    return `The request could not be submitted (${error.code}).`;
  }
  return "The request could not be submitted (REQUEST_FAILED).";
}

/**
 * Lets a Google-authenticated account with no assigned role ask an administrator
 * for one. This is an authorization request, not a second way to sign in.
 */
export default function AccessRequestPanel() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [error, setError] = useState("");
  const [role, setRole] = useState<RequestableRole>("researcher");
  const [fullName, setFullName] = useState("");
  const [program, setProgram] = useState("");
  const [justification, setJustification] = useState("");

  useEffect(() => {
    let cancelled = false;

    void getMyAccessRequest()
      .then((request) => {
        if (cancelled) return;
        setState(
          request && request.status === "pending"
            ? { status: "existing", request }
            : { status: "form" },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "form" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p className="access-request-status" aria-busy="true">
        Checking for an existing access request…
      </p>
    );
  }

  if (state.status === "existing" || state.status === "submitted") {
    const { request } = state;
    return (
      <div className="access-request-pending" role="status">
        <span className="access-request-icon">
          <ClipboardCheck />
        </span>
        <strong>Your request is awaiting review.</strong>
        <p>
          You asked for the {roleLabelFor(request.requested_role)} workspace. An
          administrator will review it and you will be notified once a decision
          is recorded.
        </p>
      </div>
    );
  }

  const submitting = state.status === "submitting";

  return (
    <form
      className="access-request-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (submitting) return;
        setError("");
        setState({ status: "submitting" });
        void submitAccessRequest({
          requested_role: role,
          full_name: fullName.trim() || undefined,
          program: program.trim() || undefined,
          justification: justification.trim() || undefined,
        })
          .then((request) => setState({ status: "submitted", request }))
          .catch((requestFailure: unknown) => {
            setError(requestError(requestFailure));
            setState({ status: "form" });
          });
      }}
    >
      <h2>Request workspace access</h2>
      <p className="access-request-intro">
        Your Google account is verified but has no assigned role yet. Tell the
        administrator which workspace you need.
      </p>

      <label>
        Workspace role
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as RequestableRole)}
        >
          {REQUESTABLE_ROLES.map((value) => (
            <option key={value} value={value}>
              {roleLabelFor(value)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Full name
        <input
          value={fullName}
          maxLength={180}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="As enrolled or employed"
        />
      </label>

      <label>
        Program or department
        <input
          value={program}
          maxLength={180}
          onChange={(event) => setProgram(event.target.value)}
          placeholder="e.g. BS Computer Science"
        />
      </label>

      <label>
        Reason for access
        <textarea
          value={justification}
          maxLength={1000}
          rows={3}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="Briefly explain why you need this workspace."
        />
      </label>

      {error && (
        <p className="access-request-error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        <Send /> {submitting ? "Sending request…" : "Send request"}
      </Button>
    </form>
  );
}
