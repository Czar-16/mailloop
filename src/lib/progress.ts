// The denominator covers the whole batch, rather than restarting for each send.
export function batchCountdownProgress(
  startAt: number,
  endAt: number,
  now: number,
) {
  const duration = endAt - startAt;
  return duration > 0 ? Math.max(0, Math.min(1, (endAt - now) / duration)) : 0;
}

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
