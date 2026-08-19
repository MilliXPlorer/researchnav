import { describe, expect, it } from "vitest";
import {
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
