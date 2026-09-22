export const standardResearchFolders = [
  "Chapter 1",
  "Chapter 2",
  "Chapter 3",
  "Chapter 4",
  "Chapter 5",
  "Chapter 6",
  "Full Manuscript",
] as const;

export function withStandardResearchFolders(folders: string[]): string[] {
  const merged = [...standardResearchFolders, ...folders];

  return merged.filter(
    (folder, index) =>
      merged.findIndex(
        (candidate) => candidate.toLowerCase() === folder.toLowerCase(),
      ) === index,
  );
}
