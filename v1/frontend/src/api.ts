import type { ResearchRecord, Role, UserSession } from "./types";

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

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getCurrentSession() {
  try {
    return (await apiRequest<SessionResponse>("/api/auth/session")).user;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHENTICATION_REQUIRED")
      return null;
    throw error;
  }
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
) {
  return (await apiRequest<{ users: UserSession[] }>(endpoint)).users;
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

export function markNotificationRead(
  id: string,
): Promise<NotificationResource> {
  return apiRequest<NotificationResource>(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
}

export async function provisionAccount(
  endpoint: "/api/admin/coordinators" | "/api/coordinator/instructors",
  email: string,
) {
  return (
    await apiRequest<SessionResponse>(endpoint, {
      method: "POST",
      body: JSON.stringify({ email }),
    })
  ).user;
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
  };
}

export async function listPublicResearch(): Promise<ResearchRecord[]> {
  const records: ResearchRecord[] = [];
  let next: string | null = "/api/repository?per_page=50";
  const maxPages = 100;

  for (let page = 0; next && page < maxPages; page += 1) {
    const response = await apiRequest<{
      data?: PublicResearchResource[];
      links?: { next?: string | null };
    }>(next);
    records.push(...(response.data ?? []).map(toResearchRecord));
    next = normalizeNextPath(response.links?.next ?? null);
  }

  return records;
}

export function normalizeNextPath(next: string | null): string | null {
  if (!next) return null;
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
}

export function roleLabel(role: Role) {
  return role
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
