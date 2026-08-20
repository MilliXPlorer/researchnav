import type { ResearchRecord, Role, UserSession } from "./types";

export type ApiFetch = typeof globalThis.fetch;

/** An API failure with the server's safe error identifier and response details. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(status: number, code: string, fields?: Record<string, string[]>) {
    // Keep Error.message compatible with existing consumers that display codes.
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface SessionResponse {
  user: UserSession;
}

/** The exact fields returned by Laravel's NotificationResource. */
export interface NotificationResource {
  id: string;
  type: string;
  event: string | null;
  title: string | null;
  message: string | null;
  action_url: string | null;
  research_document_id: number | null;
  read_at: string | null;
  created_at: string | null;
}

export interface RoleDashboardItem {
  research_document_id: number;
  title: string;
  research_stage: string;
  submission_status: string;
  archive_status: string;
  visibility: "private" | "registered_only" | "public";
  publication_year: number | null;
  updated_at: string | null;
}

export interface RoleDashboardSection {
  key: string;
  state: "ready" | "unavailable";
  total: number | null;
  reason: "not_modeled" | "not_authorized_for_role" | null;
  items: RoleDashboardItem[];
}

export interface RoleDashboard {
  schema_version: 1;
  role: Role;
  sections: RoleDashboardSection[];
}

export interface RoleDashboardResponse {
  data: RoleDashboard;
}

export type AdminRole = Role;
export type AccessStatus = UserSession["accessStatus"];

/** The exact public representation from AdminUserResource. */
export interface AdminUserResource {
  id: string;
  email: string;
  student_employee_id: string | null;
  names: {
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
  };
  role: AdminRole;
  access_status: AccessStatus;
  is_admin: boolean;
  invitation_sent_at: string | null;
  confirmed_at: string | null;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Laravel's length-aware paginator shape returned by API resources. */
export interface LaravelPaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  links: Array<{ url: string | null; label: string; active: boolean }>;
  path: string;
  per_page: number;
  to: number | null;
  total: number;
}

export interface LaravelPaginationLinks {
  first: string | null;
  last: string | null;
  prev: string | null;
  next: string | null;
}

export interface LaravelPaginatedResponse<T> {
  data: T[];
  links: LaravelPaginationLinks;
  meta: LaravelPaginationMeta;
}

/** The exact public representation from AdminAuditLogResource. */
export interface AdminAuditLogResource {
  id: number;
  action: string;
  actor: { id: string; email: string } | null;
  subject: { type: string; id: string | number } | null;
  description: string | null;
  created_at: string | null;
}

export interface SystemStatusResource {
  schema_version: 1;
  checked_at: string;
  overall: "operational" | "degraded";
  issues: string[];
  runtime: {
    environment: string;
    debug_enabled: boolean;
    php_version: string;
    framework_version: string;
  };
  database: {
    driver: string | null;
    status: "operational" | "degraded" | "unavailable";
    counts: {
      users: {
        total: number | null;
        access_statuses: Record<AccessStatus, number | null>;
        administrators: number | null;
        coordinators: number | null;
      };
      audit_logs: number | null;
      research_documents: number | null;
      notifications: number | null;
      document_files: number | null;
      document_file_bytes: number | null;
    };
    migrations: {
      applied: number | null;
      available: number | null;
      pending: number | null;
    };
  };
  storage: {
    private: {
      disk: string;
      driver: string | null;
      status: "operational" | "unavailable";
      capabilities: { read: boolean; write: boolean } | null;
    };
  };
}

/** The fields the authenticated similarity-results endpoint exposes. */
export interface SimilarityResultResource {
  id: number;
  source_research_id: number;
  matched_research_id: number;
  source_title: string;
  matched_title: string;
  tfidf_score: number | string | null;
  cosine_score: number | string;
  fasttext_score: number | string | null;
  final_similarity_score: number | string;
  threshold: number | string;
  is_flagged: boolean;
  contextual_analysis: string | null;
  matched_terms: string[] | null;
  analysis_type: string;
  analyzed_at: string | null;
}

/** Fields used by the administrator's internal research console. */
export interface InternalResearchResource {
  id: number;
  submitted_by: string;
  title: string;
  abstract: string | null;
  keywords: string | null;
  publication_year: number | null;
  research_stage: "title_proposal" | "ongoing" | "completed";
  submission_status:
    | "draft"
    | "submitted"
    | "under_review"
    | "revision_required"
    | "approved"
    | "archived";
  archive_status: "not_archived" | "pending_archiving" | "archived";
  visibility: "private" | "registered_only" | "public";
}

export interface ResearchRevisionResource {
  id: number;
  revision_number: number;
  revision_remarks: string | null;
  revision_status:
    "requested" | "in_progress" | "resubmitted" | "under_review" | "accepted";
}

export interface TitleValidationResource {
  id: number;
  research_document_id: number;
  similarity_result_id: number | null;
  validated_by: string | null;
  validation_status: "pending" | "approved" | "revision_required" | "rejected";
  adviser_remarks: string | null;
  validated_at: string | null;
}

export interface ResearchMetadataInput {
  title: string;
  abstract: string | null;
  keywords: string | null;
  publication_year: number | null;
  research_stage: InternalResearchResource["research_stage"];
}

export interface ResearchAuthorResource {
  id: number;
  user_id: string | null;
  author_name: string;
  author_order: number;
  is_corresponding_author: boolean;
}

export type ResearchAuthorInput = Pick<
  ResearchAuthorResource,
  "user_id" | "author_name" | "is_corresponding_author"
>;

export interface ReviewAssignmentResource {
  id: number;
  reviewer_id: string;
  review_role: "adviser" | "instructor" | "panel" | "statistician";
  is_active: boolean;
  assigned_by: string;
}

export type ReviewAssignmentInput = Pick<
  ReviewAssignmentResource,
  "reviewer_id" | "review_role"
>;

export interface DocumentFileResource {
  id: number;
  research_document_id: number;
  document_type:
    | "title_proposal"
    | "draft"
    | "chapter"
    | "revised_manuscript"
    | "final_manuscript"
    | "attachment";
  version_number: number;
  original_filename: string;
  file_extension: string;
  mime_type: string;
  file_size: number;
  is_current: boolean;
  uploaded_at: string | null;
}

export interface FeedbackResource {
  id: number;
  research_document_id: number;
  user_id: string;
  document_file_id: number | null;
  comment: string;
  feedback_type:
    | "comment"
    | "suggestion"
    | "revision_request"
    | "approval_remark"
    | "general_feedback";
  feedback_status: "open" | "acknowledged" | "resolved";
  created_at: string | null;
}

export interface FeedbackInput {
  comment: string;
  feedback_type: FeedbackResource["feedback_type"];
  document_file_id?: number | null;
}

export interface MonitoringLogResource {
  id: number;
  research_document_id: number;
  performed_by: string;
  activity_type: string;
  remarks: string | null;
  previous_status: string | null;
  new_status: string | null;
  monitoring_status: string;
  activity_date: string | null;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetcher(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      errors?: Record<string, string[]>;
    } | null;
    throw new ApiError(
      response.status,
      body?.error ?? `REQUEST_FAILED_${response.status}`,
      body?.errors,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getCurrentSession(fetcher: ApiFetch = globalThis.fetch) {
  try {
    return (
      await apiRequest<SessionResponse>("/api/auth/session", undefined, fetcher)
    ).user;
  } catch (error) {
    if (
      error instanceof Error &&
      ["AUTHENTICATION_REQUIRED", "SESSION_USER_NOT_FOUND"].includes(
        error.message,
      )
    ) {
      return null;
    }
    throw error;
  }
}

export async function getRoleDashboard(
  expectedRole: Role,
  fetcher: ApiFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<RoleDashboard> {
  const response = await apiRequest<RoleDashboardResponse>(
    "/api/dashboard",
    { signal },
    fetcher,
  );

  if (
    response.data.schema_version !== 1 ||
    response.data.role !== expectedRole
  ) {
    throw new Error("DASHBOARD_ROLE_MISMATCH");
  }

  return response.data;
}

function researchPath(researchDocumentId: string | number) {
  return `/api/research/${encodeURIComponent(String(researchDocumentId))}`;
}

export async function getInternalResearch(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InternalResearchResource> {
  return (
    await apiRequest<{ data: InternalResearchResource }>(
      researchPath(researchDocumentId),
      undefined,
      fetcher,
    )
  ).data;
}

export async function updateInternalResearch(
  researchDocumentId: string | number,
  metadata: ResearchMetadataInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InternalResearchResource> {
  return (
    await apiRequest<{ data: InternalResearchResource }>(
      researchPath(researchDocumentId),
      { method: "PATCH", body: JSON.stringify(metadata) },
      fetcher,
    )
  ).data;
}

export async function submitInternalResearch(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InternalResearchResource> {
  return (
    await apiRequest<{ data: InternalResearchResource }>(
      `${researchPath(researchDocumentId)}/submit`,
      { method: "POST", body: JSON.stringify({}) },
      fetcher,
    )
  ).data;
}

export async function transitionInternalResearch(
  researchDocumentId: string | number,
  submission_status: "under_review" | "approved",
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InternalResearchResource> {
  return (
    await apiRequest<{ data: InternalResearchResource }>(
      `${researchPath(researchDocumentId)}/status`,
      { method: "PATCH", body: JSON.stringify({ submission_status }) },
      fetcher,
    )
  ).data;
}

export async function archiveInternalResearch(
  researchDocumentId: string | number,
  visibility: InternalResearchResource["visibility"],
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InternalResearchResource> {
  return (
    await apiRequest<{ data: InternalResearchResource }>(
      `${researchPath(researchDocumentId)}/archive`,
      { method: "POST", body: JSON.stringify({ visibility }) },
      fetcher,
    )
  ).data;
}

export async function listResearchRevisions(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchRevisionResource[]> {
  const response = await apiRequest<{ data: ResearchRevisionResource[] }>(
    `${researchPath(researchDocumentId)}/revisions`,
    undefined,
    fetcher,
  );
  return response.data;
}

export async function resubmitResearchRevision(
  researchDocumentId: string | number,
  revisionId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchRevisionResource> {
  return (
    await apiRequest<{ data: ResearchRevisionResource }>(
      `${researchPath(researchDocumentId)}/revisions/${encodeURIComponent(String(revisionId))}/resubmit`,
      { method: "PATCH", body: JSON.stringify({}) },
      fetcher,
    )
  ).data;
}

export async function listTitleValidations(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<TitleValidationResource[]> {
  const response = await apiRequest<{ data: TitleValidationResource[] }>(
    `${researchPath(researchDocumentId)}/validation`,
    undefined,
    fetcher,
  );
  return response.data;
}

export async function updateTitleValidation(
  researchDocumentId: string | number,
  validationId: string | number,
  input: Pick<TitleValidationResource, "validation_status"> & {
    adviser_remarks?: string;
    similarity_result_id?: number | null;
  },
  fetcher: ApiFetch = globalThis.fetch,
): Promise<TitleValidationResource> {
  return (
    await apiRequest<{ data: TitleValidationResource }>(
      `${researchPath(researchDocumentId)}/validation/${encodeURIComponent(String(validationId))}`,
      { method: "PATCH", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function listResearchAuthors(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchAuthorResource[]> {
  return (
    await apiRequest<{ data: ResearchAuthorResource[] }>(
      `${researchPath(researchDocumentId)}/authors`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function replaceResearchAuthors(
  researchDocumentId: string | number,
  authors: ResearchAuthorInput[],
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchAuthorResource[]> {
  return (
    await apiRequest<{ data: ResearchAuthorResource[] }>(
      `${researchPath(researchDocumentId)}/authors`,
      { method: "PUT", body: JSON.stringify({ authors }) },
      fetcher,
    )
  ).data;
}

export async function listReviewAssignments(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ReviewAssignmentResource[]> {
  return (
    await apiRequest<{ data: ReviewAssignmentResource[] }>(
      `${researchPath(researchDocumentId)}/reviewers`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function replaceReviewAssignments(
  researchDocumentId: string | number,
  reviewers: ReviewAssignmentInput[],
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ReviewAssignmentResource[]> {
  return (
    await apiRequest<{ data: ReviewAssignmentResource[] }>(
      `${researchPath(researchDocumentId)}/reviewers`,
      { method: "PUT", body: JSON.stringify({ reviewers }) },
      fetcher,
    )
  ).data;
}

export async function listResearchFiles(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DocumentFileResource[]> {
  return (
    await apiRequest<{ data: DocumentFileResource[] }>(
      `${researchPath(researchDocumentId)}/files`,
      undefined,
      fetcher,
    )
  ).data;
}

export function researchFileDownloadUrl(
  researchDocumentId: string | number,
  fileId: string | number,
) {
  return `${researchPath(researchDocumentId)}/files/${encodeURIComponent(String(fileId))}/download`;
}

export async function uploadResearchFile(
  researchDocumentId: string | number,
  file: File,
  documentType: DocumentFileResource["document_type"],
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DocumentFileResource> {
  const body = new FormData();
  body.append("file", file);
  body.append("document_type", documentType);
  return (
    await apiRequest<{ data: DocumentFileResource }>(
      `${researchPath(researchDocumentId)}/files`,
      { method: "POST", body },
      fetcher,
    )
  ).data;
}

export async function listFeedback(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<FeedbackResource[]> {
  return (
    await apiRequest<{ data: FeedbackResource[] }>(
      `${researchPath(researchDocumentId)}/feedback`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function createFeedback(
  researchDocumentId: string | number,
  input: FeedbackInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<FeedbackResource> {
  return (
    await apiRequest<{ data: FeedbackResource }>(
      `${researchPath(researchDocumentId)}/feedback`,
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function updateFeedbackStatus(
  researchDocumentId: string | number,
  feedbackId: string | number,
  feedback_status: "acknowledged" | "resolved",
  fetcher: ApiFetch = globalThis.fetch,
): Promise<FeedbackResource> {
  return (
    await apiRequest<{ data: FeedbackResource }>(
      `${researchPath(researchDocumentId)}/feedback/${encodeURIComponent(String(feedbackId))}`,
      { method: "PATCH", body: JSON.stringify({ feedback_status }) },
      fetcher,
    )
  ).data;
}

export async function listMonitoringLogs(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<MonitoringLogResource[]> {
  return (
    await apiRequest<{ data: MonitoringLogResource[] }>(
      `${researchPath(researchDocumentId)}/monitoring`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function authenticateWithGoogle(credential: string) {
  return (
    await apiRequest<SessionResponse>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    })
  ).user;
}

export async function logout() {
  await apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export async function listProvisionedAccounts(
  endpoint: "/api/admin/coordinators" | "/api/coordinator/instructors",
  fetcher: ApiFetch = globalThis.fetch,
) {
  return (
    await apiRequest<{ users: UserSession[] }>(endpoint, undefined, fetcher)
  ).users;
}

export async function listNotifications(): Promise<NotificationResource[]> {
  const notifications: NotificationResource[] = [];
  let next: string | null = "/api/notifications";
  const maxPages = 100;

  for (let page = 0; next && page < maxPages; page += 1) {
    const response = await apiRequest<{
      data?: NotificationResource[];
      links?: { next?: string | null };
    }>(next);
    notifications.push(...(response.data ?? []));
    next = normalizeNextPath(response.links?.next ?? null);
  }

  return notifications;
}

export async function markNotificationRead(
  id: string,
): Promise<NotificationResource> {
  return (
    await apiRequest<{ data: NotificationResource }>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      { method: "PATCH" },
    )
  ).data;
}

export async function provisionAccount(
  endpoint: "/api/admin/coordinators" | "/api/coordinator/instructors",
  email: string,
  fetcher: ApiFetch = globalThis.fetch,
) {
  return (
    await apiRequest<SessionResponse>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      fetcher,
    )
  ).user;
}

/** Lists coordinator accounts from the administrator-only endpoint. */
export function listAdminCoordinators(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<UserSession[]> {
  return listProvisionedAccounts("/api/admin/coordinators", fetcher);
}

/** Provisions one coordinator account through the administrator-only endpoint. */
export function provisionCoordinator(
  email: string,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<UserSession> {
  return provisionAccount("/api/admin/coordinators", email, fetcher);
}

function adminQuery(
  path: string,
  values: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function listAdminUsers(
  input: {
    search?: string;
    role?: AdminRole;
    access_status?: AccessStatus;
    page?: number;
    per_page?: 10 | 25 | 50 | 100;
  } = {},
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LaravelPaginatedResponse<AdminUserResource>> {
  return apiRequest(adminQuery("/api/admin/users", input), undefined, fetcher);
}

export async function updateAdminUser(
  id: string,
  input: Partial<Pick<AdminUserResource, "role" | "access_status">>,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AdminUserResource> {
  return (
    await apiRequest<{ data: AdminUserResource }>(
      `/api/admin/users/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export function listAdminAuditLogs(
  input: {
    action?: string;
    actor_id?: string;
    created_from?: string;
    created_to?: string;
    page?: number;
    per_page?: 10 | 25 | 50 | 100;
  } = {},
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LaravelPaginatedResponse<AdminAuditLogResource>> {
  return apiRequest(
    adminQuery("/api/admin/audit-logs", input),
    undefined,
    fetcher,
  );
}

export async function getSystemStatus(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<SystemStatusResource> {
  return (
    await apiRequest<{ data: SystemStatusResource }>(
      "/api/admin/system-status",
      undefined,
      fetcher,
    )
  ).data;
}

export interface PublicResearchResource {
  id: string | number;
  title: string;
  authors: Array<{
    author_name: string;
    author_order: number;
    is_corresponding_author: boolean;
  }>;
  publication_year?: number | string;
  year?: number | string;
  institution_name?: string;
  institution_location?: string;
  academic_unit?: string;
  degree_program?: string;
  category?: { name?: string } | string | null;
  abstract?: string;
  keywords?: string[] | string | null;
  research_stage?: string;
  manuscript_date_label?: string;
  abstract_provenance?: string;
  query_similarity_score?: number | string | null;
  matched_terms?: string[] | null;
}

/** A public repository result ranked by the submitted query's similarity score. */
export interface PublicRepositorySimilarityResource extends PublicResearchResource {
  query_similarity_score: number | string | null;
  /** Terms shared between the submitted query and this title. */
  matched_terms?: string[] | null;
}

export interface PublicRepositorySimilarityResponse {
  data?: PublicRepositorySimilarityResource[];
}

function toAuthors(authors: PublicResearchResource["authors"]) {
  return [...authors]
    .sort((first, second) => first.author_order - second.author_order)
    .map((author) => author.author_name)
    .join(", ");
}

function toKeywords(keywords: PublicResearchResource["keywords"]) {
  if (Array.isArray(keywords)) return keywords;
  return keywords
    ? keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    : [];
}

function toCategory(category: PublicResearchResource["category"]) {
  return typeof category === "string"
    ? category
    : (category?.name ?? "Uncategorized");
}

function toResearchStage(researchStage?: string) {
  return (researchStage ?? "Not specified")
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function toResearchRecord(
  resource: PublicResearchResource,
): ResearchRecord {
  const academicUnit = resource.academic_unit ?? "";
  const degreeProgram = resource.degree_program ?? "";
  return {
    id: String(resource.id),
    title: resource.title,
    authors: toAuthors(resource.authors),
    year: Number(resource.publication_year ?? resource.year ?? 0),
    institutionName: resource.institution_name ?? "",
    institutionLocation: resource.institution_location,
    academicUnit,
    degreeProgram,
    institute: academicUnit,
    program: degreeProgram,
    category: toCategory(resource.category),
    abstract: resource.abstract ?? "",
    keywords: toKeywords(resource.keywords),
    researchStage: toResearchStage(resource.research_stage),
    manuscriptDate: resource.manuscript_date_label,
    abstractProvenance: resource.abstract_provenance,
    querySimilarityScore: resource.query_similarity_score,
    matchedTerms: resource.matched_terms ?? null,
  };
}

export async function listPublicResearch(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchRecord[]> {
  const records: ResearchRecord[] = [];
  let next: string | null = "/api/repository?per_page=50";
  const maxPages = 100;

  for (let page = 0; next && page < maxPages; page += 1) {
    const response = await apiRequest<{
      data?: PublicResearchResource[];
      links?: { next?: string | null };
    }>(next, undefined, fetcher);
    records.push(...(response.data ?? []).map(toResearchRecord));
    next = normalizeNextPath(response.links?.next ?? null);
  }

  return records;
}

/**
 * Server-side public repository search.
 *
 * Unlike `listPublicResearch`, this delegates matching and filtering to Laravel,
 * which compares the query against titles, abstracts, keywords, and author names
 * and applies the author/keyword/category/year filters in SQL. Callers therefore
 * never need to download the whole catalog to filter it in the browser.
 */
export type PublicResearchFilters = {
  q?: string;
  author?: string;
  keywords?: string;
  category?: string;
  year?: string | number;
  perPage?: number;
};

export async function searchPublicResearch(
  filters: PublicResearchFilters = {},
  fetcher: ApiFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<ResearchRecord[]> {
  const params = new URLSearchParams();
  const append = (name: string, value: string | number | undefined) => {
    const normalized =
      typeof value === "number" ? String(value) : value?.trim();
    if (normalized) params.set(name, normalized);
  };

  append("q", filters.q);
  append("author", filters.author);
  append("keywords", filters.keywords);
  append("category", filters.category);
  append("year", filters.year);
  params.set("per_page", String(filters.perPage ?? 50));

  const records: ResearchRecord[] = [];
  let next: string | null = `/api/repository?${params.toString()}`;
  const maxPages = 100;

  for (let page = 0; next && page < maxPages; page += 1) {
    const response: {
      data?: PublicResearchResource[];
      links?: { next?: string | null };
    } = await apiRequest<{
      data?: PublicResearchResource[];
      links?: { next?: string | null };
    }>(next, { signal }, fetcher);
    records.push(...(response.data ?? []).map(toResearchRecord));
    next = normalizeNextPath(response.links?.next ?? null);
  }

  return records;
}

/**
 * Requests public, algorithm-ranked repository matches for one submitted query.
 * The returned order is the server's ranking and must remain unchanged by callers.
 */
export async function searchPublicResearchBySimilarity(
  q: string,
  fetcher: ApiFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<ResearchRecord[]> {
  const response = await apiRequest<PublicRepositorySimilarityResponse>(
    "/api/repository/similarity",
    {
      method: "POST",
      body: JSON.stringify({ q }),
      signal,
    },
    fetcher,
  );
  return (response.data ?? []).map(toResearchRecord);
}

/**
 * Scores a typed title or keywords against the archived repository for an
 * authenticated account, without requiring an existing research record.
 *
 * This is the pre-submission duplicate check. It writes nothing, and its per
 * account rate limit is high enough to refine a proposed title repeatedly,
 * unlike the sessionless public endpoint.
 */
export async function checkTitleQuerySimilarity(
  q: string,
  fetcher: ApiFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<ResearchRecord[]> {
  const response = await apiRequest<PublicRepositorySimilarityResponse>(
    "/api/similarity/query",
    { method: "POST", body: JSON.stringify({ q }), signal },
    fetcher,
  );
  return (response.data ?? []).map(toResearchRecord);
}

export async function listPersistedSimilarityResults(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<SimilarityResultResource[]> {
  const response = await apiRequest<{ data?: SimilarityResultResource[] }>(
    `/api/research/${encodeURIComponent(String(researchDocumentId))}/similarity`,
    undefined,
    fetcher,
  );
  return response.data ?? [];
}

export function runTitleSimilarityCheck(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<void> {
  return apiRequest<void>(
    `/api/research/${encodeURIComponent(String(researchDocumentId))}/similarity/check`,
    { method: "POST", body: JSON.stringify({}) },
    fetcher,
  );
}

export function normalizeNextPath(next: string | null): string | null {
  if (!next) return null;
  const url = new URL(next, "http://researchnav.local");
  if (!url.pathname.startsWith("/api/")) {
    throw new Error("INVALID_PAGINATION_LINK");
  }
  return `${url.pathname}${url.search}`;
}

export function roleLabel(role: Role) {
  return role
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/** The exact public representation from CategoryResource. */
export interface CategoryResource {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
}

/** The exact fields returned by ResearchDocumentResource for authenticated actors. */
export interface ResearchDocumentSummaryResource {
  id: number;
  submitted_by: string;
  category_id: number | null;
  title: string;
  normalized_title: string | null;
  abstract: string | null;
  keywords: string | null;
  publication_year: number | null;
  institution_name: string | null;
  institution_location: string | null;
  academic_unit: string | null;
  degree_program: string | null;
  manuscript_date_label: string | null;
  abstract_provenance: string | null;
  research_stage: InternalResearchResource["research_stage"];
  submission_status: InternalResearchResource["submission_status"];
  archive_status: InternalResearchResource["archive_status"];
  visibility: InternalResearchResource["visibility"];
  submitted_at: string | null;
  approved_at: string | null;
  archived_at: string | null;
  authors: ResearchAuthorResource[];
  category: CategoryResource | null;
}

export interface ResearchDraftInput {
  category_id?: number | null;
  title: string;
  abstract?: string | null;
  keywords?: string | null;
  publication_year?: number | null;
  research_stage: InternalResearchResource["research_stage"];
  authors: ResearchAuthorInput[];
}

/* ------------------------------- Adviser APIs ------------------------------- */

export interface AdviserAdviseeGroup {
  user_id: string | null;
  name: string | null;
  email: string | null;
  documents_count: number;
  documents: Array<{
    research_document_id: number;
    title: string;
    research_stage: string;
    submission_status: string;
    updated_at: string | null;
  }>;
}

export interface AdviserPendingReviewItem {
  research_document_id: number;
  title: string;
  research_stage: string;
  submission_status: string;
  open_revisions: number;
  pending_title_validations: number;
  updated_at: string | null;
}

export interface AdviserSimilarityAlert {
  id: number;
  research_document_id: number;
  title: string | null;
  submission_status: string | null;
  matched_title: string;
  final_similarity_score: number;
  threshold: number;
  analyzed_at: string | null;
}

export interface AdviserFeedbackEntry {
  id: number;
  research_document_id: number;
  title: string | null;
  comment: string;
  feedback_type: FeedbackResource["feedback_type"];
  feedback_status: FeedbackResource["feedback_status"];
  created_at: string | null;
}

export async function listAdviserAdvisees(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AdviserAdviseeGroup[]> {
  return (
    await apiRequest<{ data: AdviserAdviseeGroup[] }>(
      "/api/adviser/advisees",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listAdviserPendingReviews(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AdviserPendingReviewItem[]> {
  return (
    await apiRequest<{ data: AdviserPendingReviewItem[] }>(
      "/api/adviser/pending-reviews",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listAdviserSimilarityAlerts(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AdviserSimilarityAlert[]> {
  return (
    await apiRequest<{ data: AdviserSimilarityAlert[] }>(
      "/api/adviser/similarity-alerts",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listAdviserFeedbackHistory(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AdviserFeedbackEntry[]> {
  return (
    await apiRequest<{ data: AdviserFeedbackEntry[] }>(
      "/api/adviser/feedback-history",
      undefined,
      fetcher,
    )
  ).data;
}

/* ------------------------------ Instructor APIs ------------------------------ */

export interface InstructorSectionResource {
  id: number;
  name: string;
  academic_year: string | null;
  is_active: boolean;
  documents_count: number;
  members_count: number;
  created_at: string | null;
}

export interface InstructorSectionInput {
  name: string;
  academic_year?: string | null;
}

export interface InstructorSectionDocumentItem {
  research_document_id: number;
  title: string;
  research_stage: string;
  submission_status: string;
  updated_at: string | null;
}

export interface InstructorTitleProposalItem {
  research_document_id: number;
  title: string;
  submission_status: string;
  submitter: string | null;
  updated_at: string | null;
}

export interface InstructorSimilarityOverviewItem {
  research_document_id: number;
  title: string | null;
  submission_status: string | null;
  best_similarity: number;
  is_flagged: boolean;
  matched_title: string;
}

export interface InstructorClassReport {
  id: number;
  name: string;
  academic_year: string | null;
  documents_count: number;
  statuses: Record<string, number>;
  similarity_buckets: { low: number; moderate: number; high: number };
}

export async function listInstructorSections(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionResource[]> {
  return (
    await apiRequest<{ data: InstructorSectionResource[] }>(
      "/api/instructor/sections",
      undefined,
      fetcher,
    )
  ).data;
}

export async function createInstructorSection(
  input: InstructorSectionInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionResource> {
  return (
    await apiRequest<{ data: InstructorSectionResource }>(
      "/api/instructor/sections",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function updateInstructorSection(
  sectionId: string | number,
  input: Partial<InstructorSectionInput> & { is_active?: boolean },
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionResource> {
  return (
    await apiRequest<{ data: InstructorSectionResource }>(
      `/api/instructor/sections/${encodeURIComponent(String(sectionId))}`,
      { method: "PATCH", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function listSectionDocuments(
  sectionId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionDocumentItem[]> {
  return (
    await apiRequest<{ data: InstructorSectionDocumentItem[] }>(
      `/api/instructor/sections/${encodeURIComponent(String(sectionId))}/documents`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function assignSectionDocuments(
  sectionId: string | number,
  researchDocumentIds: number[],
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionResource> {
  return (
    await apiRequest<{ data: InstructorSectionResource }>(
      `/api/instructor/sections/${encodeURIComponent(String(sectionId))}/assign`,
      {
        method: "POST",
        body: JSON.stringify({ research_document_ids: researchDocumentIds }),
      },
      fetcher,
    )
  ).data;
}

export interface InstructorStudentResource {
  id: string;
  email: string;
  student_employee_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  added_at: string | null;
}

export async function listSectionMembers(
  sectionId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorStudentResource[]> {
  return (
    await apiRequest<{ data: InstructorStudentResource[] }>(
      `/api/instructor/sections/${encodeURIComponent(String(sectionId))}/members`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function addSectionMembers(
  sectionId: string | number,
  userIds: string[],
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionResource> {
  return (
    await apiRequest<{ data: InstructorSectionResource }>(
      `/api/instructor/sections/${encodeURIComponent(String(sectionId))}/members`,
      { method: "PUT", body: JSON.stringify({ user_ids: userIds }) },
      fetcher,
    )
  ).data;
}

export async function removeSectionMember(
  sectionId: string | number,
  userId: string,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSectionResource> {
  return (
    await apiRequest<{ data: InstructorSectionResource }>(
      `/api/instructor/sections/${encodeURIComponent(String(sectionId))}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
      fetcher,
    )
  ).data;
}

export async function listInstructorStudents(
  search = "",
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorStudentResource[]> {
  const query = search.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";
  return (
    await apiRequest<{ data: InstructorStudentResource[] }>(
      `/api/instructor/students${query}`,
      undefined,
      fetcher,
    )
  ).data;
}

export async function listInstructorTitleProposals(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorTitleProposalItem[]> {
  return (
    await apiRequest<{ data: InstructorTitleProposalItem[] }>(
      "/api/instructor/title-proposals",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listInstructorSimilarityOverview(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorSimilarityOverviewItem[]> {
  return (
    await apiRequest<{ data: InstructorSimilarityOverviewItem[] }>(
      "/api/instructor/similarity-overview",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listInstructorClassReports(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstructorClassReport[]> {
  return (
    await apiRequest<{ data: InstructorClassReport[] }>(
      "/api/instructor/class-reports",
      undefined,
      fetcher,
    )
  ).data;
}

/* -------------------------------- Panel APIs -------------------------------- */

export interface DefenseScheduleResource {
  id: number;
  research_document_id: number;
  title: string | null;
  submission_status: string | null;
  research_stage: string | null;
  scheduled_at: string | null;
  room: string | null;
  notes: string | null;
  status: string;
  created_by: { id: string | null; name: string | null };
}

export interface PanelAssignmentResource {
  research_document_id: number;
  title: string;
  research_stage: string;
  submission_status: string;
  authors: string[];
  next_defense: {
    id: number;
    scheduled_at: string | null;
    room: string | null;
    status: string;
  } | null;
  updated_at: string | null;
}

export interface PanelEvaluationResource {
  id: number;
  research_document_id: number;
  title: string | null;
  originality: number;
  methodology: number;
  clarity: number;
  comments: string | null;
  submitted_at: string | null;
}

export interface PanelEvaluationInput {
  research_document_id: number;
  originality: number;
  methodology: number;
  clarity: number;
  comments?: string | null;
}

export async function listPanelSchedule(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DefenseScheduleResource[]> {
  return (
    await apiRequest<{ data: DefenseScheduleResource[] }>(
      "/api/panel/schedule",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listPanelAssignments(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<PanelAssignmentResource[]> {
  return (
    await apiRequest<{ data: PanelAssignmentResource[] }>(
      "/api/panel/assignments",
      undefined,
      fetcher,
    )
  ).data;
}

export async function submitPanelEvaluation(
  input: PanelEvaluationInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<PanelEvaluationResource> {
  return (
    await apiRequest<{ data: PanelEvaluationResource }>(
      "/api/panel/evaluations",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function listPanelHistory(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<PanelEvaluationResource[]> {
  return (
    await apiRequest<{ data: PanelEvaluationResource[] }>(
      "/api/panel/history",
      undefined,
      fetcher,
    )
  ).data;
}

/* ------------------------------ Statistician APIs ------------------------------ */

export interface MethodologyReviewResource {
  id: number;
  research_document_id: number;
  title: string | null;
  design_fit: boolean | null;
  sample_size: boolean | null;
  instrument_validity: boolean | null;
  analysis_plan: boolean | null;
  remarks: string | null;
  review_status: string;
  signed_off_at: string | null;
}

export interface StatisticianQueueItem {
  research_document_id: number;
  title: string;
  submission_status: string;
  research_stage: string;
  methodology_review: Omit<
    MethodologyReviewResource,
    "title" | "research_document_id"
  > | null;
}

export interface MethodologyChecklistInput {
  design_fit?: boolean | null;
  sample_size?: boolean | null;
  instrument_validity?: boolean | null;
  analysis_plan?: boolean | null;
  remarks?: string | null;
}

export interface StatisticianSignoffItem {
  id: number;
  research_document_id: number;
  title: string | null;
  submission_status: string | null;
  research_stage: string | null;
  signed_off_at: string | null;
}

export async function listStatisticianQueue(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<StatisticianQueueItem[]> {
  return (
    await apiRequest<{ data: StatisticianQueueItem[] }>(
      "/api/statistician/queue",
      undefined,
      fetcher,
    )
  ).data;
}

export async function saveStatisticianChecklist(
  researchDocumentId: string | number,
  input: MethodologyChecklistInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<MethodologyReviewResource> {
  return (
    await apiRequest<{ data: MethodologyReviewResource }>(
      `/api/statistician/queue/${encodeURIComponent(String(researchDocumentId))}/checklist`,
      { method: "PUT", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function signOffMethodology(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<MethodologyReviewResource> {
  return (
    await apiRequest<{ data: MethodologyReviewResource }>(
      `/api/statistician/queue/${encodeURIComponent(String(researchDocumentId))}/sign-off`,
      { method: "POST", body: JSON.stringify({}) },
      fetcher,
    )
  ).data;
}

export async function returnMethodologyForClarification(
  researchDocumentId: string | number,
  remarks: string,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<MethodologyReviewResource> {
  return (
    await apiRequest<{ data: MethodologyReviewResource }>(
      `/api/statistician/queue/${encodeURIComponent(String(researchDocumentId))}/return`,
      { method: "POST", body: JSON.stringify({ remarks }) },
      fetcher,
    )
  ).data;
}

export async function listStatisticianSignoffs(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<StatisticianSignoffItem[]> {
  return (
    await apiRequest<{ data: StatisticianSignoffItem[] }>(
      "/api/statistician/signoffs",
      undefined,
      fetcher,
    )
  ).data;
}

/* ------------------------------ Coordinator APIs ------------------------------ */

export interface CoordinatorScheduleInput {
  research_document_id: number;
  scheduled_at: string;
  room?: string | null;
  notes?: string | null;
}

export interface CoordinatorScheduleUpdateInput {
  scheduled_at?: string;
  room?: string | null;
  notes?: string | null;
  status?: "scheduled" | "completed" | "cancelled";
}

export interface DuplicateFlagResource {
  id: number;
  final_similarity_score: number;
  threshold: number;
  is_flagged: boolean;
  analyzed_at: string | null;
  source: {
    research_document_id: number;
    title: string | null;
    submission_status: string | null;
    research_stage: string | null;
  };
  matched: {
    research_document_id: number;
    title: string | null;
    submission_status: string | null;
    research_stage: string | null;
  };
}

export interface AdviserLoadItem {
  user_id: string;
  name: string | null;
  email: string | null;
  active_assignments: number;
}

export interface CoordinatorProgramReport {
  schema_version: 1;
  counts: {
    active_instructors: number;
    active_advisers: number;
    active_researchers: number;
    draft: number;
    submitted: number;
    under_review: number;
    revision_required: number;
    approved: number;
    archived: number;
    flagged_similarity: number;
    defenses_scheduled: number;
    defenses_completed: number;
    evaluations_submitted: number;
    methodology_signed_off: number;
  };
  by_section: Array<{ id: number; name: string; documents_count: number }>;
  adviser_load: AdviserLoadItem[];
}

export async function listCoordinatorSchedules(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DefenseScheduleResource[]> {
  return (
    await apiRequest<{ data: DefenseScheduleResource[] }>(
      "/api/coordinator/schedules",
      undefined,
      fetcher,
    )
  ).data;
}

export async function createCoordinatorSchedule(
  input: CoordinatorScheduleInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DefenseScheduleResource> {
  return (
    await apiRequest<{ data: DefenseScheduleResource }>(
      "/api/coordinator/schedules",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function updateCoordinatorSchedule(
  scheduleId: string | number,
  input: CoordinatorScheduleUpdateInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DefenseScheduleResource> {
  return (
    await apiRequest<{ data: DefenseScheduleResource }>(
      `/api/coordinator/schedules/${encodeURIComponent(String(scheduleId))}`,
      { method: "PATCH", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function listDuplicateFlags(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<DuplicateFlagResource[]> {
  return (
    await apiRequest<{ data: DuplicateFlagResource[] }>(
      "/api/coordinator/duplicate-flags",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listAdviserLoad(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AdviserLoadItem[]> {
  return (
    await apiRequest<{ data: AdviserLoadItem[] }>(
      "/api/coordinator/adviser-load",
      undefined,
      fetcher,
    )
  ).data;
}

export async function getCoordinatorProgramReport(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<CoordinatorProgramReport> {
  return (
    await apiRequest<{ data: CoordinatorProgramReport }>(
      "/api/coordinator/reports",
      undefined,
      fetcher,
    )
  ).data;
}

/* ------------------------------- Librarian APIs ------------------------------- */

export interface MetadataCompleteness {
  title: boolean;
  abstract: boolean;
  keywords: boolean;
  authors: boolean;
  category: boolean;
}

export interface ArchivingQueueItem {
  research_document_id: number;
  title: string;
  submission_status: string;
  archive_status: string;
  visibility: string;
  publication_year: number | null;
  category: string | null;
  metadata_completeness: MetadataCompleteness;
  updated_at: string | null;
}

export interface RepositoryCatalogRow {
  id: number;
  title: string;
  category: { id: number; name: string } | null;
  submission_status: string;
  archive_status: string;
  visibility: string;
  publication_year: number | null;
  updated_at: string | null;
}

export interface MetadataStandardsItem {
  research_document_id: number;
  title: string;
  submission_status: string;
  archive_status: string;
  publication_year: number | null;
  category: string | null;
  metadata_completeness: MetadataCompleteness;
  metadata_review: {
    id: number;
    title_complete: boolean;
    abstract_complete: boolean;
    authors_complete: boolean;
    keywords_complete: boolean;
    category_complete: boolean;
    notes: string | null;
    review_status: string;
  } | null;
}

export interface MetadataReviewInput {
  title_complete?: boolean | null;
  abstract_complete?: boolean | null;
  authors_complete?: boolean | null;
  keywords_complete?: boolean | null;
  category_complete?: boolean | null;
  notes?: string | null;
  review_status?: "pending" | "complete" | "needs_correction";
}

export interface MetadataReviewResource {
  id: number;
  research_document_id: number;
  title_complete: boolean;
  abstract_complete: boolean;
  authors_complete: boolean;
  keywords_complete: boolean;
  category_complete: boolean;
  notes: string | null;
  review_status: string;
}

export interface RetentionLogEntry {
  id: number;
  research_document_id: number | null;
  title: string | null;
  action: string;
  remarks: string | null;
  performed_by: string | null;
  activity_date: string | null;
}

export interface RetentionLogInput {
  research_document_id?: number | null;
  action:
    | "version_kept"
    | "version_superseded"
    | "final_archived"
    | "unpublished"
    | "removed";
  remarks?: string | null;
}

export async function listArchivingQueue(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ArchivingQueueItem[]> {
  return (
    await apiRequest<{ data: ArchivingQueueItem[] }>(
      "/api/librarian/archiving-queue",
      undefined,
      fetcher,
    )
  ).data;
}

export function listRepositoryCatalog(
  input: {
    search?: string;
    category?: string | number;
    page?: number;
    per_page?: number;
  } = {},
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LaravelPaginatedResponse<RepositoryCatalogRow>> {
  return apiRequest(
    adminQuery("/api/librarian/repository-catalog", input),
    undefined,
    fetcher,
  );
}

export async function listMetadataStandards(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<MetadataStandardsItem[]> {
  return (
    await apiRequest<{ data: MetadataStandardsItem[] }>(
      "/api/librarian/metadata-standards",
      undefined,
      fetcher,
    )
  ).data;
}

export async function saveMetadataReview(
  researchDocumentId: string | number,
  input: MetadataReviewInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<MetadataReviewResource> {
  return (
    await apiRequest<{ data: MetadataReviewResource }>(
      `/api/librarian/metadata/${encodeURIComponent(String(researchDocumentId))}`,
      { method: "PUT", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function listRetentionLogs(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<RetentionLogEntry[]> {
  return (
    await apiRequest<{ data: RetentionLogEntry[] }>(
      "/api/librarian/retention-logs",
      undefined,
      fetcher,
    )
  ).data;
}

export async function recordRetentionLog(
  input: RetentionLogInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<Omit<RetentionLogEntry, "performed_by">> {
  return (
    await apiRequest<{ data: Omit<RetentionLogEntry, "performed_by"> }>(
      "/api/librarian/retention-logs",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

/* ------------------------------- Research office APIs ------------------------------- */

export interface ComplianceReviewResource {
  id: number;
  research_document_id: number;
  title: string | null;
  format_compliant: boolean | null;
  attachments_compliant: boolean | null;
  consent_forms_compliant: boolean | null;
  remarks: string | null;
  review_status: string;
  decided_at: string | null;
}

export interface ComplianceQueueItem {
  research_document_id: number;
  title: string;
  submission_status: string;
  archive_status: string;
  visibility: string;
  updated_at: string | null;
  compliance_review: Omit<ComplianceReviewResource, "title"> | null;
}

export interface ComplianceDecisionInput {
  format_compliant?: boolean | null;
  attachments_compliant?: boolean | null;
  consent_forms_compliant?: boolean | null;
  remarks?: string | null;
  review_status: "endorsed" | "returned";
}

export interface OfficeUserRow {
  id: string;
  email: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  role: AdminRole;
  access_status: AccessStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface InstitutionalReport {
  schema_version: 1;
  counts: {
    total_users: number;
    active_users: number;
    pending_archiving: number;
    archived: number;
    flagged_similarity: number;
    audit_events: number;
    evaluations_submitted: number;
    methodology_signed_off: number;
  };
  by_academic_unit: Array<{ academic_unit: string; total: number }>;
  by_status: Array<{ status: string; total: number }>;
}

export interface PrivacyLogEntry {
  id: number;
  user: { id: string; email: string; name: string } | null;
  action: string;
  details: string | null;
  performed_by: string | null;
  activity_date: string | null;
}

export interface PrivacyLogInput {
  user_id?: string | null;
  action:
    | "consent_recorded"
    | "consent_withdrawn"
    | "consent_log_requested"
    | "data_export";
  details?: string | null;
}

export async function listComplianceQueue(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ComplianceQueueItem[]> {
  return (
    await apiRequest<{ data: ComplianceQueueItem[] }>(
      "/api/research-office/compliance",
      undefined,
      fetcher,
    )
  ).data;
}

export async function decideCompliance(
  researchDocumentId: string | number,
  input: ComplianceDecisionInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ComplianceReviewResource> {
  return (
    await apiRequest<{ data: ComplianceReviewResource }>(
      `/api/research-office/compliance/${encodeURIComponent(String(researchDocumentId))}`,
      { method: "PUT", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export function listOfficeUsers(
  input: {
    search?: string;
    role?: AdminRole;
    access_status?: AccessStatus;
    page?: number;
    per_page?: number;
  } = {},
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LaravelPaginatedResponse<OfficeUserRow>> {
  return apiRequest(
    adminQuery("/api/research-office/users", input),
    undefined,
    fetcher,
  );
}

export async function updateOfficeUserAccess(
  userId: string,
  access_status: AccessStatus,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<{
  id: string;
  email: string;
  role: AdminRole;
  access_status: AccessStatus;
}> {
  return (
    await apiRequest<{
      data: {
        id: string;
        email: string;
        role: AdminRole;
        access_status: AccessStatus;
      };
    }>(
      `/api/research-office/users/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify({ access_status }) },
      fetcher,
    )
  ).data;
}

export async function getInstitutionalReport(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<InstitutionalReport> {
  return (
    await apiRequest<{ data: InstitutionalReport }>(
      "/api/research-office/reports",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listPrivacyLogs(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<PrivacyLogEntry[]> {
  return (
    await apiRequest<{ data: PrivacyLogEntry[] }>(
      "/api/research-office/privacy-logs",
      undefined,
      fetcher,
    )
  ).data;
}

export async function recordPrivacyLog(
  input: PrivacyLogInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<{
  id: number;
  user_id: string | null;
  action: string;
  details: string | null;
  activity_date: string | null;
}> {
  return (
    await apiRequest<{
      data: {
        id: number;
        user_id: string | null;
        action: string;
        details: string | null;
        activity_date: string | null;
      };
    }>(
      "/api/research-office/privacy-logs",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

/* -------------------------------- Academics APIs -------------------------------- */

export interface LibraryItemResource {
  id: number;
  research_document_id: number;
  title: string | null;
  publication_year: number | null;
  saved_at: string | null;
}

export interface RecommendationResource {
  research_document_id: number;
  title: string | null;
  publication_year: number | null;
  final_similarity_score: number;
  is_flagged: boolean;
}

export interface CategoryCountResource {
  id: number;
  name: string;
  slug: string;
  records_count: number;
}

export async function listLibraryItems(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LibraryItemResource[]> {
  return (
    await apiRequest<{ data: LibraryItemResource[] }>(
      "/api/academics/library",
      undefined,
      fetcher,
    )
  ).data;
}

export async function saveLibraryItem(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LibraryItemResource> {
  return (
    await apiRequest<{ data: LibraryItemResource }>(
      "/api/academics/library",
      {
        method: "POST",
        body: JSON.stringify({
          research_document_id: Number(researchDocumentId),
        }),
      },
      fetcher,
    )
  ).data;
}

export async function removeLibraryItem(
  itemId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<void> {
  return apiRequest<void>(
    `/api/academics/library/${encodeURIComponent(String(itemId))}`,
    { method: "DELETE" },
    fetcher,
  );
}

export async function listRecommendations(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<RecommendationResource[]> {
  return (
    await apiRequest<{ data: RecommendationResource[] }>(
      "/api/academics/recommendations",
      undefined,
      fetcher,
    )
  ).data;
}

export async function listCategoryCounts(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<CategoryCountResource[]> {
  return (
    await apiRequest<{ data: CategoryCountResource[] }>(
      "/api/academics/categories",
      undefined,
      fetcher,
    )
  ).data;
}

/* -------------------------------- Researcher APIs -------------------------------- */

export function listResearchDocuments(
  input: {
    mine?: boolean;
    page?: number;
    per_page?: number;
  } = {},
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LaravelPaginatedResponse<ResearchDocumentSummaryResource>> {
  return apiRequest(
    adminQuery("/api/research", {
      ...input,
      mine: input.mine ? "1" : undefined,
    }),
    undefined,
    fetcher,
  );
}

export async function createResearchDraft(
  input: ResearchDraftInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchDocumentSummaryResource> {
  return (
    await apiRequest<{ data: ResearchDocumentSummaryResource }>(
      "/api/research",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function updateResearchDraft(
  researchDocumentId: string | number,
  input: ResearchDraftInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchDocumentSummaryResource> {
  return (
    await apiRequest<{ data: ResearchDocumentSummaryResource }>(
      researchPath(researchDocumentId),
      { method: "PATCH", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export async function submitResearchDocument(
  researchDocumentId: string | number,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<ResearchDocumentSummaryResource> {
  return (
    await apiRequest<{ data: ResearchDocumentSummaryResource }>(
      `${researchPath(researchDocumentId)}/submit`,
      { method: "POST", body: JSON.stringify({}) },
      fetcher,
    )
  ).data;
}

export async function listCategories(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<CategoryResource[]> {
  return (
    await apiRequest<{ data: CategoryResource[] }>(
      "/api/categories",
      undefined,
      fetcher,
    )
  ).data;
}

/**
 * Workspace access requests.
 *
 * Google stays the only authentication method. These calls let an already
 * authenticated account that has no assigned role ask for one, and let an
 * administrator decide those requests.
 */
export const REQUESTABLE_ROLES = [
  "researcher",
  "adviser",
  "instructor",
  "panel",
  "statistician",
  "coordinator",
  "librarian",
  "research-office",
  "academics",
] as const;

export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export interface AccessRequestResource {
  id: number;
  user_id: string;
  email: string | null;
  requested_role: string;
  status: "pending" | "approved" | "rejected";
  full_name: string | null;
  program: string | null;
  justification: string | null;
  decided_by_email: string | null;
  decision_remarks: string | null;
  requested_at: string | null;
  decided_at: string | null;
}

export interface AccessRequestInput {
  requested_role: RequestableRole;
  full_name?: string;
  program?: string;
  justification?: string;
}

export async function getMyAccessRequest(
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AccessRequestResource | null> {
  return (
    await apiRequest<{ data: AccessRequestResource | null }>(
      "/api/access-requests/mine",
      undefined,
      fetcher,
    )
  ).data;
}

export async function submitAccessRequest(
  input: AccessRequestInput,
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AccessRequestResource> {
  return (
    await apiRequest<{ data: AccessRequestResource }>(
      "/api/access-requests",
      { method: "POST", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}

export function listAccessRequests(
  input: { status?: AccessRequestResource["status"]; page?: number } = {},
  fetcher: ApiFetch = globalThis.fetch,
): Promise<LaravelPaginatedResponse<AccessRequestResource>> {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.page) params.set("page", String(input.page));
  const query = params.toString();

  return apiRequest(
    `/api/admin/access-requests${query ? `?${query}` : ""}`,
    undefined,
    fetcher,
  );
}

export async function decideAccessRequest(
  accessRequestId: number | string,
  input: {
    decision: "approve" | "reject";
    granted_role?: RequestableRole;
    decision_remarks?: string;
  },
  fetcher: ApiFetch = globalThis.fetch,
): Promise<AccessRequestResource> {
  return (
    await apiRequest<{ data: AccessRequestResource }>(
      `/api/admin/access-requests/${encodeURIComponent(String(accessRequestId))}`,
      { method: "PATCH", body: JSON.stringify(input) },
      fetcher,
    )
  ).data;
}
