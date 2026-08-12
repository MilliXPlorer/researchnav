export type Role =
  | "admin"
  | "researcher"
  | "adviser"
  | "instructor"
  | "panel"
  | "statistician"
  | "coordinator"
  | "librarian"
  | "research-office"
  | "academics";

export interface UserSession {
  email: string;
  role: Role;
  accessStatus: "active" | "invited" | "blocked";
  isAdmin: boolean;
}
