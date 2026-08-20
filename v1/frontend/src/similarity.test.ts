import { describe, expect, it } from "vitest";
import {
  isZeroSimilarity,
  SIMILARITY_FLAG_THRESHOLD,
  similarityBand,
  similarityBandPercentage,
} from "./similarity";

describe("similarityBand", () => {
  it.each([
    [0, "Low"],
    [39, "Low"],
    [40, "Moderate"],
    [69, "Moderate"],
    [70, "High"],
    [100, "High"],
  ])("classifies %i percent as the %s band", (score, name) => {
    expect(similarityBand(score).name).toBe(name);
  });

  it("flags exactly at the documented 70 percent threshold", () => {
    expect(SIMILARITY_FLAG_THRESHOLD).toBe(70);
    expect(similarityBand(SIMILARITY_FLAG_THRESHOLD - 1).name).not.toBe("High");
    expect(similarityBand(SIMILARITY_FLAG_THRESHOLD).name).toBe("High");
  });

  it("keeps each band on its own color so bands never collide", () => {
    const colors = [10, 50, 90].map((score) => similarityBand(score).color);
    expect(new Set(colors).size).toBe(3);
  });
});

describe("similarityBandPercentage", () => {
  it("converts stored 0-1 scores into whole percentages", () => {
    expect(similarityBandPercentage("0.987654")).toBe(99);
    expect(similarityBandPercentage(0.7)).toBe(70);
    expect(similarityBandPercentage("0")).toBe(0);
    expect(similarityBandPercentage(1)).toBe(100);
  });

  it("returns null rather than fabricating a score", () => {
    for (const value of [null, undefined, "", "   ", "abc", -0.1, 1.1, NaN]) {
      expect(similarityBandPercentage(value)).toBeNull();
    }
  });
});

describe("isZeroSimilarity", () => {
  it("treats an exact zero score as zero", () => {
    expect(isZeroSimilarity("0.000000")).toBe(true);
    expect(isZeroSimilarity(0)).toBe(true);
  });

  it("treats any real overlap as non-zero", () => {
    expect(isZeroSimilarity("0.500000")).toBe(false);
    expect(isZeroSimilarity(1)).toBe(false);
  });

  it("respects the precision the surface will actually print", () => {
    // 0.4% prints as "0%" for a whole-number surface but as "0.4000%" at four places.
    expect(isZeroSimilarity(0.004)).toBe(true);
    expect(isZeroSimilarity(0.004, 4)).toBe(false);
    // Below four decimal places of a percent, even the detailed surface shows zero.
    expect(isZeroSimilarity(0.0000001, 4)).toBe(true);
  });

  it("never reports an absent or invalid score as zero, so it stays visible as unavailable", () => {
    for (const value of [null, undefined, "", "   ", "abc", -0.1, 1.1, NaN]) {
      expect(isZeroSimilarity(value)).toBe(false);
      expect(isZeroSimilarity(value, 4)).toBe(false);
    }
  });
});
