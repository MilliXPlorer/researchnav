import type { Role, UserSession } from "./types";

interface SessionResponse {
  user: UserSession;
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

export function roleLabel(role: Role) {
  return role
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
