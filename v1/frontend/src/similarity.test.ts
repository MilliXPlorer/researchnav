import { describe, expect, it } from "vitest";
import {
  classificationLabel,
  formatSimilarityPercentage,
  formatSimilarityValue,
  formatSimilarityWeight,
} from "./similarity";

describe("similarity display helpers", () => {
  it("formats API-provided percentages and points to two decimals", () => {
    expect(formatSimilarityPercentage("25.170000")).toBe("25.17%");
    expect(formatSimilarityValue("16.408000")).toBe("16.41");
  });

  it("does not manufacture a value when the API reports none", () => {
    expect(formatSimilarityPercentage(null)).toBeNull();
    expect(formatSimilarityValue("not-a-number")).toBeNull();
  });

  it("formats normalized policy weights for display without making decisions", () => {
    expect(formatSimilarityWeight("0.300000000000")).toBe("30.00%");
    expect(formatSimilarityWeight("0.700000000000")).toBe("70.00%");
    expect(formatSimilarityWeight(null)).toBeNull();
  });

  it("only labels the API-provided classification", () => {
    expect(classificationLabel("low")).toBe("LOW");
    expect(classificationLabel("moderate")).toBe("MODERATE");
    expect(classificationLabel("high")).toBe("HIGH");
    expect(classificationLabel(null)).toBeNull();
  });
});
