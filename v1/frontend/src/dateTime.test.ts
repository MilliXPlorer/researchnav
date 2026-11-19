import { describe, expect, it } from "vitest";
import {
  formatPhilippineDateTime,
  philippineDateToday,
  formatPhilippineDate,
  philippineYear,
} from "./dateTime";

describe("Philippine date and time helpers", () => {
  it("formats timestamps in Asia/Manila", () => {
    const result = formatPhilippineDateTime("2026-09-17T16:30:00Z");

    expect(result).toContain("9/18/2026");
    expect(result).toContain("12:30");
  });

  it("returns the Philippine calendar date", () => {
    expect(
      philippineDateToday(new Date("2026-09-17T16:30:00Z")),
    ).toBe("2026-09-18");
  });

  it("returns the Philippine calendar year", () => {
    expect(
      philippineYear(new Date("2026-12-31T16:30:00Z")),
    ).toBe(2027);
  });

  it("formats dates in Asia/Manila", () => {
  expect(
    formatPhilippineDate("2026-09-17T16:30:00Z"),
  ).toBe("9/18/2026");
});
});