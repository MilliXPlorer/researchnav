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
  | "academics"
  | "research_editor";

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
  authorNames?: string[];
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
  querySimilarityScore?: string | null;
  querySimilarityPercentage?: string | null;
  /** Canonical weighted title comparison values supplied by the API. */
  titleSimilarityScore?: string | null;
  titleSimilarityPercentage?: string | null;
  titleWeight?: string | null;
  titleWeightedContribution?: string | null;
  /** Canonical weighted manuscript-content comparison values supplied by the API. */
  contentSimilarityScore?: string | null;
  contentSimilarityPercentage?: string | null;
  contentWeight?: string | null;
  contentWeightedContribution?: string | null;
  /** The API's authoritative overall result and review decision. */
  overallSimilarityScore?: string | null;
  overallSimilarityPercentage?: string | null;
  classification?: "low" | "moderate" | "high" | null;
  overallFlagged?: boolean;
  titleMatchAlert?: boolean;
  adviserReviewRequired?: boolean;
  flagReason?:
    | "overall_high_similarity"
    | "near_exact_title_match"
    | "overall_and_title_match"
    | "not_flagged";
  algorithmVersion?: string | null;
  analyzedAt?: string | null;
  scoreStatus?: "scored" | "content_unavailable" | null;
  /** Normalized title-vector score calculated for the active public query. */
  queryTitleSimilarityScore?: string | null;
  queryTitleSimilarityPercentage?: string | null;
  /** Normalized manuscript-content-vector score for the active public query. */
  queryContentSimilarityScore?: string | null;
  queryContentSimilarityPercentage?: string | null;
  /** Terms shared with the submitted query, when the result came from a check. */
  matchedTerms?: string[] | null;
  /** Optional FastText sentence-vector cosine supplied by the search worker. */
  fastTextSupportScore?: string | null;
  hasDownloadableManuscript?: boolean;
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
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  studentEmployeeId: string | null;
  displayName: string;
  profilePhotoUrl: string | null;
}
