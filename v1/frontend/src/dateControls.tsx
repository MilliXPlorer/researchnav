import { philippineYear } from "./dateTime";
import { useId } from "react";
import type { ComponentProps, KeyboardEvent } from "react";

type DatePickerInputProps = Omit<
  ComponentProps<"input">,
  "type" | "onKeyDown" | "onPaste" | "onDrop"
> & {
  type: "date" | "datetime-local";
};

const currentYear = philippineYear();
const years = Array.from({ length: currentYear - 1901 + 1 }, (_, index) =>
  String(currentYear - index),
);
const rangeYears = years.slice(0, 9);

function preventDateTyping(event: KeyboardEvent<HTMLInputElement>) {
  if (
    event.key.length === 1 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault();
  }
}

export function DatePickerInput(props: DatePickerInputProps) {
  return (
    <input
      {...props}
      onKeyDown={preventDateTyping}
      onPaste={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    />
  );
}

type PublicationYearInputProps = Omit<ComponentProps<"input">, "type" | "list">;

export function PublicationYearInput(props: PublicationYearInputProps) {
  const generatedId = useId();
  const suggestionsId = `${generatedId}-year-suggestions`;

  return (
    <>
      <input
        {...props}
        type="number"
        list={suggestionsId}
        min={props.min ?? 1901}
        max={props.max ?? currentYear}
        step={1}
      />
      <datalist id={suggestionsId}>
        {years.map((year) => (
          <option key={year} value={year} />
        ))}
      </datalist>
    </>
  );
}

type YearRangeSelectProps = Omit<ComponentProps<"select">, "children"> & {
  bound: "from" | "to";
  otherValue?: string;
  emptyLabel?: string;
};

export function YearRangeSelect({
  bound,
  otherValue,
  emptyLabel = "Any year",
  ...props
}: YearRangeSelectProps) {
  const selectedValue = String(props.value ?? props.defaultValue ?? "");
  const other = Number(otherValue);
  const hasOther =
    otherValue !== undefined && otherValue !== "" && Number.isInteger(other);
  const selectable = rangeYears.filter((year) => {
    const value = Number(year);
    if (!hasOther) return true;
    return bound === "from" ? value <= other : value >= other;
  });

  return (
    <select {...props}>
      <option value="">{emptyLabel}</option>
      {selectedValue && !selectable.includes(selectedValue) && (
        <option value={selectedValue}>{selectedValue}</option>
      )}
      {selectable.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  );
}

type DateSelectProps = Omit<ComponentProps<"select">, "children"> & {
  emptyLabel?: string;
};

export function AcademicYearSelect({
  emptyLabel = "Not specified",
  ...props
}: DateSelectProps) {
  const selectedValue = String(props.value ?? props.defaultValue ?? "");
  const canonicalValues = new Set(
    years.map((year) => `${year}-${Number(year) + 1}`),
  );

  return (
    <select {...props}>
      <option value="">{emptyLabel}</option>
      {selectedValue && !canonicalValues.has(selectedValue) && (
        <option value={selectedValue}>{selectedValue}</option>
      )}
      {years.map((year) => {
        const academicYear = `${year}-${Number(year) + 1}`;
        return (
          <option key={academicYear} value={academicYear}>
            {academicYear}
          </option>
        );
      })}
    </select>
  );
}
