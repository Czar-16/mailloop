"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pause, Play } from "lucide-react";

function subscribeMotion(callback: () => void) {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function motionSnapshot() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const outerLength = 2 * Math.PI * 44;
const innerLength = 2 * Math.PI * 34;
const SEND_SECONDS = 15;
const HOLD_SECONDS = 7;
const CYCLE_SECONDS = SEND_SECONDS + HOLD_SECONDS;

export function BatchProgressCard() {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    () => true,
  );
  const [timeline, setTimeline] = useState({
    sent: 0,
    countdown: SEND_SECONDS,
  });
  const [paused, setPaused] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const innerQueuedArc = useRef<SVGCircleElement>(null);
  const queuedArc = useRef<SVGCircleElement>(null);
  const sentArc = useRef<SVGCircleElement>(null);
  const sentBar = useRef<HTMLSpanElement>(null);
  const queuedBar = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const discrete = useRef(timeline);
  const gradientId = useId();
  const sent = reduced ? SEND_SECONDS : timeline.sent;
  const queued = SEND_SECONDS - sent;
  const countdown = reduced ? 0 : timeline.countdown;
  const done = sent === SEND_SECONDS;

  useEffect(() => {
    const element = card.current;
    if (!element) return;
    let visible = !window.IntersectionObserver;
    const paint = () => {
      const seconds = elapsed.current / 1000;
      const progress = reduced ? 1 : Math.min(seconds / SEND_SECONDS, 1);
      const remaining = 1 - progress;
      innerQueuedArc.current?.setAttribute(
        "stroke-dasharray",
        `${remaining * innerLength} ${innerLength}`,
      );
      queuedArc.current?.setAttribute(
        "stroke-dasharray",
        `${remaining * outerLength} ${outerLength}`,
      );
      queuedArc.current?.setAttribute(
        "stroke-dashoffset",
        `${-progress * outerLength}`,
      );
      sentArc.current?.setAttribute(
        "stroke-dasharray",
        `${progress * outerLength} ${outerLength}`,
      );
      if (sentBar.current) sentBar.current.style.width = `${progress * 100}%`;
      if (queuedBar.current)
        queuedBar.current.style.width = `${remaining * 100}%`;
      const next = {
        sent: Math.min(SEND_SECONDS, Math.floor(seconds)),
        countdown: Math.max(0, Math.ceil(SEND_SECONDS - seconds)),
      };
      if (
        !reduced &&
        (next.sent !== discrete.current.sent ||
          next.countdown !== discrete.current.countdown)
      ) {
        discrete.current = next;
        setTimeline(next);
      }
    };
    const stop = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      lastFrame.current = null;
    };
    const animate = () => {
      const now = performance.now();
      elapsed.current += now - (lastFrame.current ?? now);
      lastFrame.current = now;
      delete element.dataset.reset;
      if (elapsed.current >= CYCLE_SECONDS * 1000) {
        elapsed.current = 0;
        element.dataset.reset = "true";
      }
      paint();
      frame.current = requestAnimationFrame(animate);
    };
    const sync = () => {
      if (reduced || paused || !visible || document.hidden) stop();
      else if (frame.current === null) {
        lastFrame.current = performance.now();
        frame.current = requestAnimationFrame(animate);
      }
    };
    const observer = window.IntersectionObserver
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          element.dataset.visible = String(visible);
          sync();
        })
      : null;
    observer?.observe(element);
    paint();
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      delete element.dataset.reset;
    };
  }, [reduced, paused]);

  return (
    <div
      ref={card}
      className="landing-batch"
      data-done={done}
      data-paused={paused}
      data-visible="true"
    >
      <div className="landing-batch-header">
        <span className="landing-batch-label">Batch progress</span>
        <span
          className={`landing-status ${done ? "is-complete" : "is-sending"}`}
        >
          <span className="landing-status-dot" aria-hidden="true" />
          {done ? "Complete" : "Sending"}
        </span>
      </div>
      <p className="sr-only">
        Example: a batch of 15 emails being sent one by one.
      </p>
      <div className="landing-batch-body">
        <div
          className="landing-ring"
          role="img"
          aria-label={`Example batch: ${sent} of 15 emails sent, ${queued} queued, 0 failed`}
        >
          <svg
            width="132"
            height="132"
            viewBox="0 0 100 100"
            className={`landing-ring-svg ${done ? "is-complete" : ""}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#6EE7B7" />
                <stop offset="1" stopColor="#10B981" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--landing-line3)"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="34"
              fill="none"
              stroke="var(--landing-line2)"
              strokeWidth="1.5"
              opacity=".7"
            />
            <circle
              ref={innerQueuedArc}
              className="landing-progress-arc"
              cx="50"
              cy="50"
              r="34"
              fill="none"
              stroke="var(--landing-amber)"
              strokeWidth="1.5"
              strokeDasharray={`${(reduced ? 0 : 1) * innerLength} ${innerLength}`}
              opacity={done ? 0 : 1}
            />
            <circle
              ref={queuedArc}
              className="landing-progress-arc"
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--landing-amber)"
              strokeWidth="8"
              strokeDasharray={`${(reduced ? 0 : 1) * outerLength} ${outerLength}`}
              strokeDashoffset={0}
            />
            <circle
              ref={sentArc}
              className="landing-progress-arc"
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={done ? `url(#${gradientId})` : "var(--landing-green)"}
              strokeWidth="8"
              strokeDasharray={`${(reduced ? 1 : 0) * outerLength} ${outerLength}`}
            />
          </svg>
          <div className="landing-ring-center" aria-hidden="true">
            {done ? (
              <div
                className={`landing-completion ${reduced ? "" : "is-entering"}`}
              >
                <div className="landing-completion-badge">
                  <span className="landing-completion-ripple" />
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      className="landing-completion-check"
                      d="m5 12.5 4.5 4.5L19 7.5"
                      stroke="#04261A"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="landing-completion-label">ALL SENT</span>
              </div>
            ) : (
              <div className="landing-countdown" aria-live="off">
                <span>0:{String(countdown).padStart(2, "0")}</span>
                <small>EST. LEFT</small>
              </div>
            )}
          </div>
        </div>
        <div className="landing-batch-details">
          <div className="landing-segmented-bar" aria-hidden="true">
            <span
              ref={sentBar}
              className="landing-bar-sent"
              style={{ width: reduced ? "100%" : "0%" }}
            />
            <span
              ref={queuedBar}
              className="landing-bar-queued"
              style={{ width: reduced ? "0%" : "100%" }}
            />
          </div>
          <div className="landing-stat-grid">
            {[
              {
                label: "Sent",
                value: sent,
                sub: "Delivered",
                color: "var(--landing-green)",
              },
              {
                label: "Queued",
                value: queued,
                sub: "Waiting",
                color: "var(--landing-amber)",
              },
              {
                label: "Failed",
                value: 0,
                sub: "Needs attention",
                color: "var(--landing-red)",
              },
            ].map(({ label, value, sub, color }) => (
              <div className="landing-stat" key={label}>
                <span className="landing-stat-label">
                  <i style={{ background: color }} aria-hidden="true" />
                  {label}
                </span>
                <span className="landing-stat-value">{value}</span>
                <span className="landing-stat-sub">{sub}</span>
              </div>
            ))}
          </div>
          <div className="landing-batch-meta">
            <span>Elapsed 0m {sent}s</span>
            {!done && <span>Remaining ~{countdown}s</span>}
            <span>{sent} of 15 sent</span>
          </div>
        </div>
      </div>
      <p className="landing-batch-footnote">
        {done
          ? "All messages confirmed by the service."
          : "Each recipient gets a separate email from your Gmail, one after another."}
      </p>
      {!reduced && (
        <button
          type="button"
          className="landing-demo-control"
          aria-label={
            paused ? "Resume batch animation" : "Pause batch animation"
          }
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <Play size={14} aria-hidden="true" />
          ) : (
            <Pause size={14} aria-hidden="true" />
          )}
          {paused ? "Resume demo" : "Pause demo"}
        </button>
      )}
    </div>
  );
}
