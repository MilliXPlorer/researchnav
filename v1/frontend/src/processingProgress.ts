const PROGRESS_MILESTONES = [
  { elapsed: 0, value: 3 },
  { elapsed: 2_000, value: 18 },
  { elapsed: 8_000, value: 42 },
  { elapsed: 20_000, value: 63 },
  { elapsed: 45_000, value: 78 },
  { elapsed: 90_000, value: 86 },
  { elapsed: 180_000, value: 90 },
] as const;

export function processingProgress(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  const last = PROGRESS_MILESTONES.at(-1)!;
  if (elapsed >= last.elapsed) return last.value;

  const nextIndex = PROGRESS_MILESTONES.findIndex(
    (milestone) => elapsed < milestone.elapsed,
  );
  const previous = PROGRESS_MILESTONES[nextIndex - 1];
  const next = PROGRESS_MILESTONES[nextIndex];
  const intervalProgress =
    (elapsed - previous.elapsed) / (next.elapsed - previous.elapsed);

  return Math.floor(
    previous.value + (next.value - previous.value) * intervalProgress,
  );
}
