import type { UserSession } from "./types";

export function canEnterDashboard(session: UserSession) {
  return session.accessStatus === "active";
}
