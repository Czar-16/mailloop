"use client";

import { useId, useState } from "react";

export type RingCountdown = {
  startAt: number;
  endAt: number;
  observedAt: number;
};
export const completionName = "Batch complete. All emails sent.";

// Keep the outgoing arc mounted with its last props so its DOM offset is frozen.
export function useRingCompletion(
  complete: boolean,
  countdown?: RingCountdown,
) {
  const [state, setState] = useState({
    complete,
    animate: false,
    countdown,
  });
  if (
    state.complete !== complete ||
    (!complete && state.countdown !== countdown)
  ) {
    const next = {
      complete,
      animate: complete && (state.animate || !state.complete),
      countdown: complete ? state.countdown : countdown,
    };
    setState(next);
    return next;
  }
  return state;
}

export function RingCompletion({
  size,
  radius,
  strokeWidth,
  animate,
}: {
  size: number;
  radius: number;
  strokeWidth: number;
  animate: boolean;
}) {
  const gradientId = useId();
  const innerDiameter = (radius - strokeWidth / 2) * 2;
  return (
    <div
      className={`ring-completion absolute inset-0${animate ? " is-entering" : ""}`}
      role="img"
      aria-label={completionName}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <defs>
          {/* Inverse of the SVG's rotation: visible top-left to bottom-right. */}
          <linearGradient id={gradientId} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        <circle
          className="completion-ring"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
        />
      </svg>
      <div
        className="completion-inner"
        style={{ width: innerDiameter, height: innerDiameter }}
        aria-hidden="true"
      >
        <div
          className="completion-ripple"
          style={{ width: size * 0.45, height: size * 0.45 }}
        />
        <div className="completion-content">
          <div
            className="completion-badge"
            style={{ width: size * 0.45, height: size * 0.45 }}
          >
            <svg
              className="completion-check"
              width={size * 0.24}
              height={size * 0.24}
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
            >
              <path
                className="completion-check-path"
                d="M8 21L16 29L32 12"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength="1"
              />
            </svg>
          </div>
          <span className="completion-label font-mono">ALL SENT</span>
        </div>
      </div>
    </div>
  );
}
