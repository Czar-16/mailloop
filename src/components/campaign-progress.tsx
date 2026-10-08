"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressRing, estimateSeconds } from "@/components/progress-ring";
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
  const estimateKey = `${data.id}:${data.outstanding}:${data.nextSendAt}`;
  const makeEstimate = () => {
    const observed = Date.parse(data.observedAt);
    const duration = estimateSeconds(
      data.outstanding,
      data.nextSendAt,
      observed,
    );
    return { key: estimateKey, endAt: observed + duration * 1000, duration };
  };
  const [estimate, setEstimate] = useState(makeEstimate);
  // A poll with an unchanged queue must not restart the countdown.
  if (estimate.key !== estimateKey) setEstimate(makeEstimate());
  const router = useRouter();
  const active = data.queued > 0 || data.review > 0;
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, router]);
  const seconds = Math.max(0, Math.ceil((estimate.endAt - now) / 1000));
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
  return (
    <section
      className="panel mb-[18px] space-y-4 p-5"
      aria-label="Campaign delivery progress"
    >
      <h2 className="section-label">Batch progress</h2>
      <ProgressRing
        sent={data.sent}
        queued={data.queued}
        failed={data.failed}
        review={data.review}
        seconds={seconds}
        countdownProgress={
          estimate.duration ? Math.min(1, seconds / estimate.duration) : 0
        }
      />
      {(data.review > 0 || data.pendingDispatch) && (
        <p className="text-sm text-warning">
          {data.review
            ? "Delivery needs review"
            : "Waiting for delivery service"}
        </p>
      )}
      <p className="text-xs tabular-nums text-body">
        Elapsed: {Math.floor(elapsed / 60)}m {elapsed % 60}s
        {active && range
          ? ` · Approximate remaining: ${range.min}–${range.max} minutes across your queue`
          : ""}
      </p>
      {active && (
        <p className="text-xs text-body">
          Retries and service delays can extend this estimate. Delivery
          completes only when the service confirms the outcome.
        </p>
      )}
    </section>
  );
}
