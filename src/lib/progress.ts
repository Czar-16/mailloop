export function remainingRange(
  outstanding: number,
  nextSendAt: string | null,
  now: number,
) {
  if (!outstanding) return null;
  const wait =
    Math.max(0, (nextSendAt ? Date.parse(nextSendAt) : now) - now) / 1000;
  const intervals = Math.max(0, outstanding - 1);
  return {
    min: Math.max(1, Math.ceil((wait + intervals * 20) / 60)),
    max: Math.max(1, Math.ceil((wait + intervals * 60 + 60) / 60)),
  };
}
