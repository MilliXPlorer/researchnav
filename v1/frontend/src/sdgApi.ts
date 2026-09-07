import { apiRequest, type ApiFetch } from "./api";

/** The only Sustainable Development Goal identifiers accepted by the public API. */
export type SdgNumber =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

export interface SustainableDevelopmentGoal {
  number: SdgNumber;
  title: string;
}

export function isSdgNumber(value: unknown): value is SdgNumber {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 17
  );
}

/** Rejects incomplete, unordered, or malformed taxonomy responses. */
export function validateSdgTaxonomy(
  payload: unknown,
): SustainableDevelopmentGoal[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { data?: unknown }).data)
  ) {
    throw new Error("INVALID_SDG_TAXONOMY");
  }

  const goals = (payload as { data: unknown[] }).data.map((goal, index) => {
    if (
      typeof goal !== "object" ||
      goal === null ||
      !isSdgNumber((goal as { number?: unknown }).number) ||
      (goal as { number: number }).number !== index + 1 ||
      typeof (goal as { title?: unknown }).title !== "string" ||
      !(goal as { title: string }).title.trim()
    ) {
      throw new Error("INVALID_SDG_TAXONOMY");
    }

    return goal as SustainableDevelopmentGoal;
  });

  if (goals.length !== 17) throw new Error("INVALID_SDG_TAXONOMY");
  return goals;
}

export async function fetchSdgTaxonomy(
  fetcher: ApiFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<SustainableDevelopmentGoal[]> {
  return validateSdgTaxonomy(
    await apiRequest<unknown>("/api/sdgs", { signal }, fetcher),
  );
}
