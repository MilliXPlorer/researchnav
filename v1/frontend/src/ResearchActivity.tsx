import { useEffect, useState } from "react";
import {
  ApiError,
  listFeedback,
  listMonitoringLogs,
  listResearchRevisions,
  recordResearcherFeedbackAction,
  type FeedbackResource,
  type MonitoringLogResource,
  type ResearchRevisionResource,
} from "./api";
import { Button } from "./components";

type ActivityState =
  | { status: "loading" }
  | {
      status: "ready";
      feedback: FeedbackResource[];
      revisions: ResearchRevisionResource[];
      monitoring: MonitoringLogResource[];
    }
  | { status: "error"; message: string };

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function activityDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function activityError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Session expired. Sign out and sign in again.";
    if (error.status === 403)
      return "This research activity is not available for your role.";
    return `Research activity is unavailable (${error.code}).`;
  }
  return "Research activity is unavailable (REQUEST_FAILED).";
}

/**
 * Adviser feedback, revision requests, and monitoring history for one research
 * record. The server authorizes the owning researcher and every assigned
 * reviewer, so the same panel serves researchers, advisers, and instructors.
 */
export default function ResearchActivity({
  researchDocumentId,
  title,
  refreshKey = 0,
  researcherActions = false,
}: {
  researchDocumentId: string | number;
  title?: string;
  refreshKey?: number;
  researcherActions?: boolean;
}) {
  const [state, setState] = useState<ActivityState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      listFeedback(researchDocumentId),
      listResearchRevisions(researchDocumentId),
      listMonitoringLogs(researchDocumentId),
    ])
      .then(([feedback, revisions, monitoring]) => {
        if (!cancelled)
          setState({ status: "ready", feedback, revisions, monitoring });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ status: "error", message: activityError(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [researchDocumentId, attempt, refreshKey]);

  if (state.status === "loading") {
    return (
      <p className="admin-empty" aria-busy="true">
        Loading feedback, revisions, and monitoring history…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="dashboard-error panel-card" role="alert">
        <p>{state.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((current) => current + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const { feedback, revisions, monitoring } = state;

  async function applyFeedbackAction(
    item: FeedbackResource,
    action: "acknowledge" | "address",
  ) {
    const remarks =
      action === "address"
        ? window.prompt("Briefly describe what you addressed:")?.trim()
        : undefined;
    if (action === "address" && !remarks) return;
    try {
      const updated = await recordResearcherFeedbackAction(
        researchDocumentId,
        item.id,
        {
          action,
          ...(remarks ? { remarks } : {}),
        },
      );
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              feedback: current.feedback.map((feedbackItem) =>
                feedbackItem.id === updated.id ? updated : feedbackItem,
              ),
            }
          : current,
      );
    } catch (error) {
      setState({ status: "error", message: activityError(error) });
    }
  }

  return (
    <div className="research-activity">
      {title && <p className="research-activity-title">{title}</p>}

      <section className="activity-block">
        <h3>Reviewer feedback and remarks</h3>
        {feedback.length === 0 ? (
          <p className="admin-empty">No feedback has been recorded yet.</p>
        ) : (
          <ul className="activity-list">
            {feedback.map((item) => (
              <li key={item.id}>
                <div className="activity-row-top">
                  <span className="activity-tag">
                    {humanize(item.feedback_type)}
                  </span>
                  <span
                    className={`status-chip status-${item.feedback_status === "resolved" ? "approved" : item.feedback_status === "acknowledged" ? "under-review" : "revision-required"}`}
                  >
                    {humanize(item.feedback_status)}
                  </span>
                  <time>{activityDate(item.created_at)}</time>
                </div>
                <p className="activity-comment">{item.comment}</p>
                {item.reviewer_name && <p>Reviewer: {item.reviewer_name}</p>}
                {researcherActions && (
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      disabled={item.researcher_acknowledged_at != null}
                      onClick={() =>
                        void applyFeedbackAction(item, "acknowledge")
                      }
                    >
                      {item.researcher_acknowledged_at
                        ? "Acknowledged"
                        : "Acknowledge"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={item.researcher_addressed_at != null}
                      onClick={() => void applyFeedbackAction(item, "address")}
                    >
                      {item.researcher_addressed_at
                        ? "Addressed"
                        : "Mark addressed"}
                    </Button>
                  </div>
                )}
                {item.researcher_action_remarks && (
                  <p>Researcher action: {item.researcher_action_remarks}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="activity-block">
        <h3>Revision requests</h3>
        {revisions.length === 0 ? (
          <p className="admin-empty">
            No revisions have been requested for this record.
          </p>
        ) : (
          <ul className="activity-list">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <div className="activity-row-top">
                  <span className="activity-tag">
                    Revision {revision.revision_number}
                  </span>
                  <span className="activity-status">
                    {humanize(revision.revision_status)}
                  </span>
                </div>
                <p className="activity-comment">
                  {revision.revision_remarks ?? "No remarks were recorded."}
                </p>
                {revision.requester_name && (
                  <p>Requested by: {revision.requester_name}</p>
                )}
                {revision.lifecycle_status && (
                  <p>Lifecycle: {humanize(revision.lifecycle_status)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="activity-block">
        <h3>Monitoring and activity history</h3>
        {monitoring.length === 0 ? (
          <p className="admin-empty">
            No monitoring activity has been recorded yet.
          </p>
        ) : (
          <ol className="activity-timeline">
            {monitoring.map((entry) => (
              <li key={entry.id}>
                <div className="activity-row-top">
                  <span className="activity-tag">
                    {humanize(entry.activity_type)}
                  </span>
                  <time>{activityDate(entry.activity_date)}</time>
                </div>
                {(entry.previous_status ?? entry.new_status) && (
                  <p className="activity-transition">
                    {humanize(entry.previous_status ?? "unknown")} →{" "}
                    {humanize(entry.new_status ?? "unknown")}
                  </p>
                )}
                {entry.remarks && (
                  <p className="activity-comment">{entry.remarks}</p>
                )}
                {entry.performed_by_name && (
                  <p>By: {entry.performed_by_name}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
