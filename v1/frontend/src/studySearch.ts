export function normalizeStudySearch(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function matchesStudySearch(
  query: string,
  values: Array<string | null | undefined>,
) {
  const normalizedQuery = normalizeStudySearch(query);
  if (!normalizedQuery) return true;
  return values.some((value) =>
    normalizeStudySearch(value ?? "").includes(normalizedQuery),
  );
}
