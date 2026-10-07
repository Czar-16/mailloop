export function pageNumber(value?: string) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
