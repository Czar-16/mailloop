"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { remainingRange } from "@/lib/progress";
export type CampaignProgressData = {
  id: string;
  createdAt: string;
  observedAt: string;
  finishedAt: string | null;
  queued: number;
  sent: number;
  failed: number;
  review: number;
  pendingDispatch: boolean;
  outstanding: number;
  nextSendAt: string | null;
};
export function CampaignProgress({ data }: { data: CampaignProgressData }) {
  const [now, setNow] = useState(Date.parse(data.observedAt));
  const router = useRouter();
  const active = data.queued > 0 || data.review > 0;
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        if (active) router.refresh();
      }
    };
    const interval = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, router]);
  const range =
    now !== null
      ? remainingRange(data.outstanding, data.nextSendAt, now)
      : null;
  const elapsed = Math.max(
    0,
    Math.floor(
      ((data.finishedAt
        ? Date.parse(data.finishedAt)
        : (now ?? Date.parse(data.createdAt))) -
        Date.parse(data.createdAt)) /
        1000,
    ),
  );
  const total = data.queued + data.sent + data.failed + data.review;
  return (
    <section
      className="panel mb-6 space-y-4 p-4 sm:p-6"
      aria-label="Campaign delivery progress"
    >
      <h2 className="text-lg font-semibold leading-[26px]">
        {data.review
          ? "Delivery needs review"
          : data.pendingDispatch
            ? "Waiting for delivery service"
            : data.queued
              ? "Sending Your Introductions"
              : data.failed
                ? "Delivery Finished with Failures"
                : "Delivery Complete"}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-live="polite">
        {[
          ["Queued", data.queued],
          ["Sent", data.sent],
          ["Failed", data.failed],
          ["Delivery Review", data.review],
        ].map(([label, count]) => (
          <p
            key={`${label}-${count}`}
            className="progress-change text-sm text-body"
          >
            {label}
            <span className="mt-1 block text-2xl font-semibold tabular-nums text-foreground">
              {count}
            </span>
          </p>
        ))}
      </div>
      <progress
        className="h-2 w-full appearance-none overflow-hidden rounded-full border border-control-border bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
        aria-label="Resolved deliveries"
        value={data.sent + data.failed}
        max={total || 1}
      />
      <p className="text-sm leading-[22px] tabular-nums text-body">
        Elapsed: {Math.floor(elapsed / 60)}m {elapsed % 60}s
        {active && range
          ? ` · Approximate remaining: ${range.min}–${range.max} minutes across your queue`
          : ""}
      </p>
      {active && (
        <p className="text-sm leading-[22px] text-body">
          Retries and service delays can extend this estimate. Delivery
          completes only when the service confirms the outcome.
        </p>
      )}
    </section>
  );
}
