import { fireEvent, render, screen } from "@testing-library/react";
import { philippineYear } from "./dateTime";
import { describe, expect, it, vi } from "vitest";
import {
  AcademicYearSelect,
  DatePickerInput,
  PublicationYearInput,
  YearRangeSelect,
} from "./dateControls";

describe("date controls", () => {
  it("uses the native picker while blocking typed and pasted dates", () => {
    const onChange = vi.fn();
    render(
      <DatePickerInput
        aria-label="Scheduled at"
        type="datetime-local"
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Scheduled at");
    const typed = new KeyboardEvent("keydown", {
      key: "2",
      bubbles: true,
      cancelable: true,
    });

    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input.dispatchEvent(typed)).toBe(false);
    expect(fireEvent.paste(input)).toBe(false);
    expect(fireEvent.drop(input)).toBe(false);
  });

  it("offers publication and academic years as selections", () => {
    const latestYear = philippineYear();
    render(
      <>
        <PublicationYearInput
          aria-label="Publication year"
          defaultValue={String(latestYear)}
        />
        <AcademicYearSelect
          aria-label="Academic year"
          defaultValue={`${latestYear - 1}-${latestYear}`}
        />
      </>,
    );

    expect(screen.getByLabelText("Publication year")).toHaveValue(latestYear);
    expect(screen.getByLabelText("Academic year")).toHaveValue(
      `${latestYear - 1}-${latestYear}`,
    );
    expect(
      (screen.getByLabelText("Academic year") as HTMLSelectElement).options[1],
    ).toHaveValue(`${latestYear}-${latestYear + 1}`);
    expect(screen.getByLabelText("Publication year")).toHaveAttribute(
      "max",
      String(latestYear),
    );
    expect(
      screen.getByRole("option", { name: "1901-1902" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: String(latestYear + 1) }),
    ).not.toBeInTheDocument();
  });

  it("preserves an existing non-canonical academic-year value", () => {
    render(
      <AcademicYearSelect
        aria-label="Academic year"
        defaultValue="AY 2025-2026"
      />,
    );

    expect(screen.getByLabelText("Academic year")).toHaveValue("AY 2025-2026");
  });

  it("narrows the opposite year bound in the range dropdown", () => {
    render(
      <>
        <YearRangeSelect
          aria-label="From year"
          bound="from"
          otherValue="2024"
          value=""
        />
        <YearRangeSelect
          aria-label="To year"
          bound="to"
          otherValue="2022"
          value=""
        />
      </>,
    );

    const from = screen.getByLabelText("From year") as HTMLSelectElement;
    const to = screen.getByLabelText("To year") as HTMLSelectElement;
    const fromYears = Array.from(from.options).map((option) => option.value);
    const toYears = Array.from(to.options).map((option) => option.value);

    expect(fromYears[0]).toBe("");
    expect(toYears[0]).toBe("");
    expect(fromYears).not.toContain("2026");
    expect(fromYears).toContain("2024");
    expect(toYears).not.toContain("1901");
    expect(toYears).toContain("2022");
  });
});
