import { useEffect, useId, useRef, useState } from "react";
import { batchCountdownProgress } from "@/lib/progress";

type Countdown = { startAt: number; endAt: number; observedAt: number };
const countdownCircumference = 2 * Math.PI * 59;

function CountdownArc({ startAt, endAt, observedAt }: Countdown) {
  const circle = useRef<SVGCircleElement>(null);
  const [initialOffset] = useState(
    () =>
      countdownCircumference *
      (1 - batchCountdownProgress(startAt, endAt, observedAt)),
  );
  useEffect(() => {
    const element = circle.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    let from = Number(element.getAttribute("stroke-dashoffset"));
    let transitionStart = performance.now();
    const draw = (immediate = false) => {
      const target =
        countdownCircumference *
        (1 - batchCountdownProgress(startAt, endAt, Date.now()));
      const fraction =
        immediate || motion.matches
          ? 1
          : Math.min(1, (performance.now() - transitionStart) / 400);
      const eased = 1 - (1 - fraction) ** 3;
      element.setAttribute(
        "stroke-dashoffset",
        String(from + (target - from) * eased),
      );
    };
    const animate = () => {
      draw();
      if (Date.now() < endAt || performance.now() - transitionStart < 400) {
        frame = requestAnimationFrame(animate);
      }
    };
    const synchronize = () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      if (document.visibilityState !== "visible") return;
      // Catch up immediately after a hidden tab or a motion preference change.
      draw(true);
      from = Number(element.getAttribute("stroke-dashoffset"));
      transitionStart = performance.now();
      if (motion.matches) interval = setInterval(() => draw(true), 1000);
      else frame = requestAnimationFrame(animate);
    };
    if (document.visibilityState === "visible") {
      if (motion.matches) synchronize();
      else frame = requestAnimationFrame(animate);
    }
    document.addEventListener("visibilitychange", synchronize);
    motion.addEventListener("change", synchronize);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", synchronize);
      motion.removeEventListener("change", synchronize);
    };
  }, [startAt, endAt]);
  return (
    <circle
      ref={circle}
      className="countdown-arc"
      cx="85"
      cy="85"
      r="59"
      fill="none"
      stroke="var(--queued)"
      strokeWidth="3"
      strokeLinecap="butt"
      strokeDasharray={countdownCircumference}
      strokeDashoffset={initialOffset}
    />
  );
}
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
  countdown,
}: {
  sent: number;
  queued: number;
  failed: number;
  review?: number;
  seconds: number;
  draft?: boolean;
  countdown?: Countdown;
}) {
  const gradientId = useId();
  const segments = [
    { label: "Sent", count: sent, color: "var(--success)" },
    { label: "Queued", count: queued, color: "var(--queued)" },
    { label: "Failed", count: failed, color: "var(--error)" },
    ...(review
      ? [{ label: "Needs review", count: review, color: "var(--body)" }]
      : []),
  ];
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const idle = draft && total === 0;
  const complete =
    !draft && sent > 0 && queued === 0 && failed === 0 && review === 0;
  const circumference = 2 * Math.PI * 70;
  const nonempty = segments.filter((segment) => segment.count > 0).length;
  let offset = 0;
  const center = queued
    ? !draft && seconds === 0
      ? "Sending"
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
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
      <span className="sr-only" role="status">
        {complete ? "Batch complete. All emails sent." : ""}
      </span>
      <div className="progress-ring relative size-[170px]">
        <svg
          width="170"
          height="170"
          viewBox="0 0 170 170"
          className="-rotate-90"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent2)" />
            </linearGradient>
          </defs>
          <circle
            className={idle ? "progress-arc" : undefined}
            cx="85"
            cy="85"
            r="70"
            fill="none"
            stroke={idle ? `url(#${gradientId})` : "var(--ring-track)"}
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
                style={{ opacity: segment.count ? 1 : 0 }}
              />
            );
          })}
          {queued > 0 && countdown && <CountdownArc {...countdown} />}
        </svg>
        <div className="absolute inset-0 mx-auto grid w-[110px] content-center text-center">
          {complete && (
            <svg
              className="completion-check mx-auto mb-1 size-20 text-success"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
            >
              <path
                className="completion-check-path"
                d="M8 21L16 29L32 12"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength="1"
              />
            </svg>
          )}
          {!complete && (
            <b
              className={`timer-value font-mono ${center === "Sending" ? "text-[18px]" : "text-[30px]"} tracking-[-.04em] tabular-nums`}
            >
              {center}
            </b>
          )}
          <span
            className={
              complete
                ? "text-[12px] font-extrabold uppercase tracking-[.16em] text-foreground"
                : "text-[10px] uppercase tracking-wide text-body"
            }
          >
            {complete
              ? "Done"
              : queued
                ? !draft && seconds === 0
                  ? "Please be patient"
                  : "est. left"
                : review
                  ? "needs review"
                  : failed
                    ? "with failures"
                    : sent
                      ? "all sent"
                      : "est. time left"}
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
