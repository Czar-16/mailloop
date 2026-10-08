import type { CSSProperties } from "react";
export function estimateSeconds(
  queued: number,
  nextSendAt: string | null = null,
  now = 0,
) {
  const wait = nextSendAt
    ? Math.max(0, (Date.parse(nextSendAt) - now) / 1000)
    : 40;
  return queued ? Math.ceil(wait + Math.max(0, queued - 1) * 40) : 0;
}
export function ProgressRing({
  sent,
  queued,
  failed,
  review = 0,
  seconds,
  draft = false,
}: {
  sent: number;
  queued: number;
  failed: number;
  review?: number;
  seconds: number;
  draft?: boolean;
}) {
  const segments = [
    { label: "Sent", count: sent, color: "var(--success)" },
    { label: "Queued", count: queued, color: "var(--queued)" },
    { label: "Failed", count: failed, color: "var(--error)" },
    ...(review
      ? [{ label: "Needs review", count: review, color: "var(--body)" }]
      : []),
  ];
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const circumference = 2 * Math.PI * 70;
  const nonempty = segments.filter((segment) => segment.count > 0).length;
  let offset = 0;
  const center = queued
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : review
      ? "Review"
      : failed
        ? "Finished"
        : sent
          ? "Done"
          : "0:00";
  return (
    <div
      className="flex flex-wrap items-center gap-[22px]"
      aria-label={`Estimated send progress: ${sent} sent, ${queued} ${draft ? "selected" : "queued"}, ${failed} failed, ${review} need review`}
    >
      <div className="progress-ring relative size-[170px]">
        <svg
          width="170"
          height="170"
          viewBox="0 0 170 170"
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="85"
            cy="85"
            r="70"
            fill="none"
            stroke="var(--border)"
            strokeWidth="12"
          />
          {segments.map((segment) => {
            const length = total ? (segment.count / total) * circumference : 0;
            const gap = nonempty > 1 ? Math.min(14, length * 0.3) : 0;
            const start = offset;
            offset += length;
            return (
              <circle
                key={segment.label}
                cx="85"
                cy="85"
                r="70"
                fill="none"
                stroke={segment.color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-start - gap / 2}
                style={{ opacity: segment.count ? 1 : 0 } as CSSProperties}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid content-center text-center">
          <b className="font-mono text-[30px] tracking-[-.04em]">{center}</b>
          <span className="text-[11px] uppercase tracking-widest text-body">
            {queued
              ? "est. left"
              : review
                ? "needs review"
                : failed
                  ? "with failures"
                  : sent
                    ? "all sent"
                    : "select recipients"}
          </span>
        </div>
      </div>
      <div className="grid gap-2 text-[13px]">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ background: segment.color }}
              aria-hidden="true"
            />
            {draft && segment.label === "Queued" ? "Selected" : segment.label} ·{" "}
            {segment.count}
          </div>
        ))}
      </div>
    </div>
  );
}
