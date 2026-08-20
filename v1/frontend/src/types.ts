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
  institutionName: string;
  institutionLocation?: string;
  academicUnit: string;
  degreeProgram: string;
  /** @deprecated Use academicUnit. Kept for existing workspace layouts. */
  institute: string;
  /** @deprecated Use degreeProgram. Kept for existing workspace layouts. */
  program: string;
  category: string;
  abstract: string;
  keywords: string[];
  researchStage: string;
  manuscriptDate?: string;
  abstractProvenance?: string;
  /** Normalized score calculated for the active public repository query only. */
  querySimilarityScore?: number | string | null;
  /** Terms shared with the submitted query, when the result came from a check. */
  matchedTerms?: string[] | null;
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
