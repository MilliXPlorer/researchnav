import { describe, expect, it } from "vitest";
import { processingProgress } from "./processingProgress";

describe("processingProgress", () => {
  it("moves quickly at first and slows as processing continues", () => {
    expect(processingProgress(0)).toBe(3);
    expect(processingProgress(2_000)).toBe(18);
    expect(processingProgress(20_000)).toBe(63);
    expect(processingProgress(90_000)).toBe(86);
  });

  it("stays below completion while the request is pending", () => {
    expect(processingProgress(180_000)).toBe(90);
    expect(processingProgress(600_000)).toBe(90);
  });
});
