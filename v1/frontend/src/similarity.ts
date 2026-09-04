export type SimilarityClassification = "low" | "moderate" | "high";

/** Formats a percentage/percentage-point value already calculated by the API. */
export function formatSimilarityValue(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : null;
}

export function formatSimilarityPercentage(
  value: string | null | undefined,
): string | null {
  const formatted = formatSimilarityValue(value);
  return formatted === null ? null : `${formatted}%`;
}

/**
 * Formats an API-provided normalized policy weight for display only. This must
 * never be used to derive an overall score or a review decision.
 */
export function formatSimilarityWeight(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized)
    ? `${(normalized * 100).toFixed(2)}%`
    : null;
}

export function classificationLabel(
  classification: SimilarityClassification | null | undefined,
): string | null {
  return classification ? classification.toUpperCase() : null;
}
