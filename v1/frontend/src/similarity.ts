/**
 * The single similarity banding rule for the whole product.
 *
 * Mirrors the documented interpretation thresholds: 0–39% low, 40–69% moderate,
 * and 70–100% high, where high is the flagged range that requires adviser review.
 * Every surface that renders a similarity score must derive its band from here so
 * the interface can never disagree with the scoring rules it is describing.
 */
export type SimilarityBandName = "Low" | "Moderate" | "High";

export type SimilarityBand = {
  name: SimilarityBandName;
  label: string;
  tone: "low" | "moderate" | "high";
  color: string;
};

export const SIMILARITY_FLAG_THRESHOLD = 70;

export function similarityBand(score: number): SimilarityBand {
  if (score < 40)
    return { name: "Low", label: "Low", tone: "low", color: "var(--fern)" };
  if (score < SIMILARITY_FLAG_THRESHOLD)
    return {
      name: "Moderate",
      label: "Moderate",
      tone: "moderate",
      color: "var(--moss)",
    };
  return {
    name: "High",
    label: "High · Flagged",
    tone: "high",
    color: "var(--amber)",
  };
}

/**
 * Converts a stored 0–1 similarity score into a whole-number percentage for the
 * ring and band label. Returns null for absent or out-of-range values so callers
 * never display a fabricated score.
 */
export function similarityBandPercentage(
  normalizedScore: string | number | null | undefined,
): number | null {
  if (
    normalizedScore === null ||
    normalizedScore === undefined ||
    (typeof normalizedScore === "string" && normalizedScore.trim() === "")
  ) {
    return null;
  }

  const score = Number(normalizedScore);
  if (!Number.isFinite(score) || score < 0 || score > 1) return null;

  return Math.round(score * 100);
}

/**
 * True when a score is present, valid, and would render as exactly zero at the
 * given precision.
 *
 * A zero score means the query and the title share no comparable terms, so the
 * record is not a similarity result and listing it only buries the real matches.
 * Precision is passed in because surfaces render to different numbers of decimal
 * places, and a record must be dropped whenever the figure that surface would
 * actually print is zero.
 *
 * An absent or unparsable score is deliberately NOT zero: that is an unavailable
 * result, and callers must keep showing it as such rather than hiding a score the
 * engine failed to produce.
 */
export function isZeroSimilarity(
  normalizedScore: string | number | null | undefined,
  decimals = 0,
): boolean {
  if (
    normalizedScore === null ||
    normalizedScore === undefined ||
    (typeof normalizedScore === "string" && normalizedScore.trim() === "")
  ) {
    return false;
  }

  const score = Number(normalizedScore);
  if (!Number.isFinite(score) || score < 0 || score > 1) return false;

  return Number((score * 100).toFixed(decimals)) === 0;
}
