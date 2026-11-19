import { useCallback, useMemo, useState } from "react";
import type { SortDirection } from "./components";

export type SortValue = string | number | boolean | null | undefined;

/** Sorts a copy and retains API order when values compare equally. */
export function sortRows<T>(
  rows: readonly T[],
  getValue: (row: T) => SortValue,
  direction: SortDirection,
): T[] {
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((first, second) => {
      if (first.value == null || second.value == null) {
        if (first.value == null && second.value == null) {
          return first.index - second.index;
        }
        return first.value == null ? 1 : -1;
      }
      const comparison = compareValues(first.value, second.value);
      return comparison === 0
        ? first.index - second.index
        : direction === "asc"
          ? comparison
          : -comparison;
    })
    .map(({ row }) => row);
}

function compareValues(first: SortValue, second: SortValue) {
  if (typeof first === "boolean" && typeof second === "boolean") {
    return Number(first) - Number(second);
  }
  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }
  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
  });
}

export function useClientSorting<T, Key extends string>(
  rows: readonly T[],
  valueFor: Record<Key, (row: T) => SortValue>,
) {
  const [sort, setSort] = useState<Key | null>(null);
  const [direction, setDirection] = useState<SortDirection>("asc");

  const changeSort = useCallback(
    (nextSort: Key) => {
      if (sort === nextSort) {
        setDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setSort(nextSort);
      setDirection("asc");
    },
    [sort],
  );

  const sortedRows = useMemo(
    () =>
      sort === null ? [...rows] : sortRows(rows, valueFor[sort], direction),
    [direction, rows, sort, valueFor],
  );

  return { sortedRows, sort, direction, changeSort };
}
