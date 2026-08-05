import type { Role } from "../src/types.js";
import type { UserSession } from "../src/types.js";

export function canProvisionExistingRole(
  existingRole: Role,
  accessStatus: UserSession["accessStatus"],
  provisionedRole: "coordinator" | "instructor",
  isAdmin: boolean,
) {
  if (isAdmin || accessStatus === "active") return false;
  return provisionedRole === "coordinator"
    ? existingRole === "researcher" || existingRole === "coordinator"
    : existingRole === "researcher" || existingRole === "instructor";
}
