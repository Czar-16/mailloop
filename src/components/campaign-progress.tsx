"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressRing, estimateSeconds } from "@/components/progress-ring";
import { remainingRange } from "@/lib/progress";
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
function BatchProgress({ data }: { data: CampaignProgressData }) {
  const [now, setNow] = useState(Date.parse(data.observedAt));
  const estimateKey = `${data.id}:${data.outstanding}:${data.nextSendAt}`;
  const makeEstimate = () => {
    const observed = Date.parse(data.observedAt);
    const duration = estimateSeconds(
      data.outstanding,
      data.nextSendAt,
      observed,
    );
    return { key: estimateKey, endAt: observed + duration * 1000 };
  };
  const [estimate, setEstimate] = useState(makeEstimate);
  // Scheduling changes may shorten the countdown, but never replenish it.
  // Once expired, it stays in progress until delivery confirms the outcome.
  if (estimate.key !== estimateKey) {
    const updated = makeEstimate();
    setEstimate({ ...updated, endAt: Math.min(estimate.endAt, updated.endAt) });
  }
  const active = data.queued > 0 || data.review > 0;
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") {
        setNow((previous) =>
          Math.max(previous, Math.floor(Date.now() / 1000) * 1000),
        );
      }
    };
    tick();
    // Sample the wall clock frequently, but render only when the second changes.
    const interval = setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active]);
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
        countdown={{
          startAt: Date.parse(data.createdAt),
          endAt: estimate.endAt,
          observedAt: Date.parse(data.observedAt),
        }}
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
