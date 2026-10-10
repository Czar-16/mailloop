"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Hourglass, Send } from "lucide-react";
import {
  RingCompletion,
  useRingCompletion,
} from "@/components/ring-completion";
import { estimateSeconds } from "@/components/progress-ring";
import { batchCountdownProgress, remainingRange } from "@/lib/progress";
import type { CampaignProgressData } from "@/lib/campaign-progress";
import { getCampaignProgress } from "@/lib/campaign-progress-actions";

export function CampaignProgress({
  data,
}: {
  data: CampaignProgressData | null;
}) {
  const [progress, setProgress] = useState(data);
  const [previousData, setPreviousData] = useState(data);
  const startedAt = useRef<number | null>(null);
  const confirmedActive = useRef(false);
  const router = useRouter();
  useEffect(() => {
    startedAt.current = Date.now();
    confirmedActive.current = false;
    return () => {
      // Next can restore page state on Back; completion must end with this visit.
      startedAt.current = null;
      confirmedActive.current = false;
      setProgress((current) =>
        current && (current.queued || current.review) ? current : null,
      );
    };
  }, []);

  if (previousData !== data) {
    setPreviousData(data);
    // A newly queued batch starts another progress cycle in this visit.
    if (
      data &&
      (!progress ||
        (!(progress.queued || progress.review) &&
          data.id
            .split(":")
            .some((id) => !progress.id.split(":").includes(id))))
    ) {
      setProgress(data);
    }
  }
  const ids = progress?.id ?? "";
  const active = !!progress && (progress.queued > 0 || progress.review > 0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const updated = await getCampaignProgress(ids.split(":"));
        if (cancelled) return;
        const stillActive =
          !!updated && (updated.queued > 0 || updated.review > 0);
        // Cached route payloads can contain a batch that finished before returning.
        const previouslyFinished =
          !confirmedActive.current &&
          updated?.finishedAt &&
          Date.parse(updated.finishedAt) < startedAt.current!;
        if (stillActive) confirmedActive.current = true;
        setProgress(previouslyFinished ? null : updated);
        router.refresh();
      } catch {
        // Preserve the last confirmed state and retry; service errors are not completion.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, ids, data?.id, router]);
  return progress ? <BatchProgress key={progress.id} data={progress} /> : null;
}
type BatchSegment = { label: string; count: number; color: string };
type BatchCountdown = { startAt: number; endAt: number; observedAt: number };
const countdownCircumference = 2 * Math.PI * 53;

function BatchCountdownArc({
  startAt,
  endAt,
  observedAt,
  frozen = false,
}: BatchCountdown & { frozen?: boolean }) {
  const circle = useRef<SVGCircleElement>(null);
  const [initialOffset] = useState(
    () =>
      countdownCircumference *
      (1 - batchCountdownProgress(startAt, endAt, observedAt)),
  );
  useEffect(() => {
    const element = circle.current;
    if (!element || frozen) return;
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
      // Resume at the current deadline, without animating through hidden time.
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
  }, [startAt, endAt, frozen]);
  return (
    <circle
      ref={circle}
      className="batch-countdown-arc"
      cx="74"
      cy="74"
      r="53"
      fill="none"
      stroke="var(--queued)"
      strokeWidth="3"
      strokeDasharray={countdownCircumference}
      strokeDashoffset={initialOffset}
      style={{ transition: "none" }}
    />
  );
}

function BatchRing({
  segments,
  total,
  active,
  center,
  caption,
  countdown,
}: {
  segments: BatchSegment[];
  total: number;
  active: boolean;
  center: string;
  caption: string;
  countdown?: BatchCountdown;
}) {
  const complete =
    !active &&
    total > 0 &&
    segments.every(
      (segment) => segment.label === "Sent" || segment.count === 0,
    );
  const completion = useRingCompletion(complete, countdown);
  const circumference = 2 * Math.PI * 64;
  const nonempty = segments.filter((segment) => segment.count > 0);
  return (
    <div className="progress-ring relative size-[148px]">
      <svg
        width="148"
        height="148"
        viewBox="0 0 148 148"
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="74"
          cy="74"
          r="64"
          fill="none"
          stroke="var(--ring-track)"
          strokeOpacity="0.25"
          strokeWidth="9"
        />
        {!complete &&
          nonempty.map((segment, index) => {
            const length =
              total > 0 ? (segment.count / total) * circumference : 0;
            const gap = nonempty.length > 1 ? Math.min(14, length * 0.3) : 0;
            const start =
              total > 0
                ? (nonempty
                    .slice(0, index)
                    .reduce((sum, previous) => sum + previous.count, 0) /
                    total) *
                  circumference
                : 0;
            return (
              <circle
                key={segment.label}
                cx="74"
                cy="74"
                r="64"
                fill="none"
                stroke={segment.color}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-start - gap / 2}
              />
            );
          })}
        {completion.countdown && (
          <g className={complete ? "completion-countdown-exit" : undefined}>
            <circle
              className="batch-countdown-track"
              cx="74"
              cy="74"
              r="53"
              fill="none"
              stroke="var(--ring-track)"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            <BatchCountdownArc {...completion.countdown} frozen={complete} />
          </g>
        )}
      </svg>
      {complete && (
        <RingCompletion
          size={148}
          radius={64}
          strokeWidth={9}
          animate={completion.animate}
        />
      )}
      {!complete && (
        <div className="batch-ring-center absolute inset-0 mx-auto grid w-[88px] content-center justify-items-center gap-1 text-center">
          {!active ? (
            <>
              <svg
                className="completion-check size-16 text-[var(--success)]"
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
              <span className="text-[12px] font-extrabold uppercase tracking-[.16em] text-foreground">
                Done
              </span>
            </>
          ) : (
            <>
              <b
                className={`timer-value font-num ${caption === "EST. LEFT" ? (center.length <= 4 ? "text-[26px]" : center.length === 5 ? "text-[23px]" : center.length === 6 ? "text-[21px]" : "text-[19px]") : "text-[18px]"} font-semibold tracking-[-.02em] tabular-nums`}
              >
                {center}
              </b>
              <span className="w-full max-w-[76px] font-mono text-[9px] leading-tight tracking-[.04em] text-body">
                {caption}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BatchProgress({ data }: { data: CampaignProgressData }) {
  const [now, setNow] = useState(Date.parse(data.observedAt));
  const total =
    data.sent + data.queued + data.failed + data.review + (data.cancelled ?? 0);
  const estimateKey = `${data.id}:${data.outstanding}:${data.nextSendAt}`;
  const makeEstimate = () => {
    const observed = Date.parse(data.observedAt);
    return {
      key: estimateKey,
      startAt: observed,
      endAt:
        observed +
        estimateSeconds(data.outstanding, data.nextSendAt, observed) * 1000,
    };
  };
  const [estimate, setEstimate] = useState(makeEstimate);
  // Polls and individual outcomes cannot replenish the whole-batch countdown.
  if (estimate.key !== estimateKey) {
    const updated = makeEstimate();
    setEstimate({
      ...updated,
      startAt: estimate.startAt,
      endAt: Math.min(estimate.endAt, updated.endAt),
    });
  }
  const active = data.queued > 0 || data.review > 0;
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") {
        setNow((previous) => Math.max(previous, Date.now()));
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active]);
  const seconds = Math.max(0, Math.ceil((estimate.endAt - now) / 1000));
  const countingDown = total > 1 && data.queued > 0 && seconds > 0;
  const center =
    data.queued === 0
      ? "Review"
      : countingDown
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : "Sending";
  const caption =
    data.queued === 0
      ? "NEEDS REVIEW"
      : countingDown
        ? "EST. LEFT"
        : data.sending > 0
          ? "CONFIRMING"
          : "BE PATIENT";
  const range =
    total > 1 ? remainingRange(data.outstanding, data.nextSendAt, now) : null;
  const elapsed = Math.max(
    0,
    Math.floor(
      ((data.finishedAt ? Date.parse(data.finishedAt) : now) -
        Date.parse(data.createdAt)) /
        1000,
    ),
  );
  const stats = [
    {
      label: "Sent",
      count: data.sent,
      color: "var(--success)",
      caption: "Delivered",
    },
    {
      label: "Queued",
      count: data.queued,
      color: "var(--queued)",
      caption: "Waiting",
    },
    {
      label: "Failed",
      count: data.failed,
      color: "var(--error)",
      caption: "Needs attention",
    },
  ];
  stats.push({
    label: "Cancelled",
    count: data.cancelled ?? 0,
    color: "var(--body)",
    caption: "Stopped before sending",
  });
  const segments: BatchSegment[] = [
    ...stats,
    { label: "Needs review", count: data.review, color: "var(--body)" },
  ];
  return (
    <section
      className="panel mb-[18px] space-y-4 p-5"
      aria-label="Campaign delivery progress"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-label">Batch progress</h2>
        <span
          className={`status-pill ${active ? "status-queued" : "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)]"}`}
          role="status"
        >
          {active ? (
            <span
              className="status-dot size-1.5 rounded-full bg-[var(--queued)]"
              aria-hidden="true"
            />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          {active ? "Sending" : "Complete"}
        </span>
      </div>
      <div className="flex flex-col items-center gap-7 sm:flex-row sm:flex-wrap">
        <BatchRing
          segments={segments}
          total={total}
          active={active}
          center={center}
          caption={caption}
          countdown={
            total > 1 && data.queued > 0
              ? {
                  startAt: estimate.startAt,
                  endAt: estimate.endAt,
                  observedAt: now,
                }
              : undefined
          }
        />
        <div className="w-[92%] min-w-0 sm:w-[calc(100%-256px)] sm:min-w-[260px] sm:max-w-[760px]">
          <div
            className="mb-3.5 flex h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ring-track)_25%,transparent)]"
            role="img"
            aria-label={`${data.sent} sent, ${data.queued} queued, ${data.failed} failed, ${data.cancelled ?? 0} cancelled, ${data.review} need review out of ${total}`}
          >
            {segments.map((segment) => (
              <span
                key={segment.label}
                style={{
                  width: `${total > 0 ? (segment.count / total) * 100 : 0}%`,
                  background: segment.color,
                }}
              />
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="hover-card min-w-0 rounded-xl border border-border bg-[color-mix(in_srgb,var(--foreground)_3%,var(--card))] px-2.5 py-3 sm:px-3.5"
              >
                <dt className="flex items-center gap-1.5 text-xs text-body">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: stat.color }}
                    aria-hidden="true"
                  />
                  {stat.label}
                </dt>
                <dd className="mt-1 font-num text-2xl font-semibold tracking-[-.02em] tabular-nums">
                  {stat.count}
                </dd>
                <dd className="mt-0.5 text-[11px] text-body">{stat.caption}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs tabular-nums text-body">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              Elapsed {Math.floor(elapsed / 60)}m {elapsed % 60}s
            </span>
            {active && range && (
              <span className="inline-flex items-center gap-1.5">
                <Hourglass className="size-3.5" aria-hidden="true" />
                Remaining {range.min}–{range.max} min
              </span>
            )}
            {data.sending > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Hourglass className="size-3.5" aria-hidden="true" />
                Awaiting confirmation
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Send className="size-3.5" aria-hidden="true" />
              {data.sent} of {total} sent
            </span>
          </div>
          {(data.review > 0 || data.pendingDispatch) && (
            <p className="mt-3 text-xs text-warning">
              {data.review
                ? `Delivery needs review · ${data.review}`
                : "Waiting for delivery service"}
            </p>
          )}
        </div>
      </div>
      <p className="border-t border-border pt-3 text-xs text-body">
        {active
          ? "Retries and service delays can extend this estimate. Delivery completes only when the service confirms the outcome."
          : data.cancelled
            ? `Batch finished: ${data.sent} sent, ${data.cancelled} cancelled, ${data.failed} failed.`
            : data.failed
              ? `Batch finished: ${data.sent} sent, ${data.failed} failed.`
              : "All messages confirmed by the service."}
      </p>
    </section>
  );
}
