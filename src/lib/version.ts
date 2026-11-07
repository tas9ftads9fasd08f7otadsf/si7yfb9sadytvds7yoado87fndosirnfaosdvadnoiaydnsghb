const parts = (text: string | null | undefined) => String(text ?? "").split(".").map((part) => Number(part) || 0);

/** Part by part; an unknown or 0.0.0 viewer is a phone's own build, never older. */
export function isOlder(running: string | null | undefined, needed: string | null | undefined): boolean {
  const mine = parts(running);
  const theirs = parts(needed);
  if (!mine.some((part) => part !== 0)) return false;
  for (let index = 0; index < Math.max(mine.length, theirs.length); index += 1) {
    const difference = (mine[index] ?? 0) - (theirs[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

export const isVersion = (text: string) => /^\d+(\.\d+){0,2}$/.test(text);
