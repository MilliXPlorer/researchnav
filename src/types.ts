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

export type Status =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Revision Required"
  | "Approved"
  | "Archived"
  | "Rejected";

export interface ResearchRecord {
  id: string;
  title: string;
  authors: string;
  year: number;
  institute: string;
  program: string;
  category: string;
  abstract: string;
  keywords: string[];
  similarity?: number;
  status: Status;
}

export interface RoleConfig {
  id: Role;
  label: string;
  shortLabel: string;
  description: string;
  nav: string[];
}

export interface UserSession {
  email: string;
  role: Role;
  accessStatus: "active" | "invited" | "blocked";
  isAdmin: boolean;
}
