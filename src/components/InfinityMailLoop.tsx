"use client";

import { useEffect, useId, useRef, useState } from "react";

const LOOP_PATH =
  "M150,90 C180,50 250,40 260,90 C270,140 190,130 150,90 C110,50 40,40 40,90 C40,140 110,130 150,90 Z";
const LOOP_SECONDS = 10;
// Pace motion by distance along the path, including its zero-length closing
// segment, so all movers maintain constant speed across the repeat boundary.
const MOTION_MODE = "paced";
const TRAIL = [
  { delay: 0.12, radius: 4, color: "var(--mail-loop-dot)" },
  { delay: 0.3, radius: 3.5, color: "var(--mail-loop-dot)" },
  { delay: 0.5, radius: 3, color: "var(--mail-loop-trail)" },
  { delay: 0.7, radius: 2.5, color: "var(--mail-loop-trail)" },
  { delay: 0.9, radius: 2, color: "var(--mail-loop-trail)" },
].map((dot) => ({ ...dot, delay: (dot.delay / 6) * LOOP_SECONDS }));

export function InfinityMailLoop() {
  const titleId = useId();
  const descriptionId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [motion, setMotion] = useState<{
    reduced: boolean;
    them: number;
    you: number;
  } | null>(null);
  const [opacities, setOpacities] = useState<{
    node: string;
    pulse: string;
    trail: string[];
  } | null>(null);

  useEffect(() => {
    // SMIL numeric values cannot use var(). Read their theme tokens without
    // resetting the shared motion timeline when the theme changes.
    const update = () => {
      const style = getComputedStyle(svgRef.current!);
      const value = (name: string) => style.getPropertyValue(name).trim();
      setOpacities({
        node: value("--mail-loop-node-opacity"),
        pulse: value("--mail-loop-pulse-opacity"),
        trail: TRAIL.map((_, index) =>
          value(`--mail-loop-trail-opacity-${index + 1}`),
        ),
      });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const total = pathRef.current!.getTotalLength();
    const prefix = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    prefix.setAttribute("d", "M150,90 C180,50 250,40 260,90");
    const them = prefix.getTotalLength() / total;
    prefix.setAttribute(
      "d",
      "M150,90 C180,50 250,40 260,90 C270,140 190,130 150,90 C110,50 40,40 40,90",
    );
    const you = prefix.getTotalLength() / total;
    const update = () => setMotion({ reduced: preference.matches, them, you });
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Start every SMIL animation on the same local timeline after hydration,
    // and restart together when motion is enabled again.
    if (motion && !motion.reduced) svgRef.current?.setCurrentTime(0);
  }, [motion]);

  const animated = motion !== null && !motion.reduced && opacities !== null;
  const duration = `${LOOP_SECONDS}s`;

  return (
    <svg
      ref={svgRef}
      className="infinity-mail-loop"
      viewBox="0 0 300 180"
      width="290"
      height="170"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>Infinity mail loop</title>
      <desc id={descriptionId}>
        An envelope travelling in an infinity loop between You and Them
      </desc>
      <circle
        cx="150"
        cy="90"
        r="70"
        fill="var(--mail-loop-accent)"
        opacity="var(--mail-loop-glow-outer)"
      />
      <circle
        cx="150"
        cy="90"
        r="48"
        fill="var(--mail-loop-accent)"
        opacity="var(--mail-loop-glow-inner)"
      />
      <path
        ref={pathRef}
        id="loop"
        d={LOOP_PATH}
        fill="none"
        stroke="var(--mail-loop-accent)"
        strokeWidth="var(--mail-loop-track-width)"
        strokeOpacity="var(--mail-loop-track-opacity)"
        strokeDasharray="2 7"
        strokeLinecap="round"
      >
        {animated && (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-45"
            dur={`${LOOP_SECONDS / 2}s`}
            calcMode="linear"
            repeatCount="indefinite"
          />
        )}
      </path>
      {[
        { label: "You", x: 40, arrival: motion?.you },
        { label: "Them", x: 260, arrival: motion?.them },
      ].map(({ label, x, arrival }) => {
        // The full-cycle pulse stays at rest until 0.48s before arrival,
        // peaks at the measured node position, then recovers over 0.6s.
        const keyTimes =
          arrival === undefined
            ? undefined
            : `0;${arrival - 0.48 / LOOP_SECONDS};${arrival};${arrival + 0.6 / LOOP_SECONDS};1`;
        return (
          <g key={label} className="mail-loop-node">
            <circle
              cx={x}
              cy="90"
              r="10"
              fill="var(--mail-loop-accent)"
              opacity="var(--mail-loop-node-opacity)"
            >
              {animated && (
                <>
                  <animate
                    attributeName="r"
                    values="10;10;18;10;10"
                    keyTimes={keyTimes}
                    dur={duration}
                    calcMode="linear"
                    repeatCount="indefinite"
                  />
                  <animate
                    key={`${opacities.node}-${opacities.pulse}`}
                    attributeName="opacity"
                    values={`${opacities.node};${opacities.node};${opacities.pulse};${opacities.node};${opacities.node}`}
                    keyTimes={keyTimes}
                    dur={duration}
                    calcMode="linear"
                    repeatCount="indefinite"
                  />
                </>
              )}
            </circle>
            <circle cx={x} cy="90" r="5" fill="var(--mail-loop-dot)" />
            <text
              x={x}
              y="122"
              fontSize="12"
              fontWeight="var(--mail-loop-label-weight)"
              fill="var(--mail-loop-label)"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}
      {animated &&
        TRAIL.map(({ delay, radius, color }, index) => (
          <circle
            key={delay}
            className="mail-loop-trail"
            r={radius}
            fill={color}
            opacity="0"
          >
            <set
              key={opacities.trail[index]}
              attributeName="opacity"
              to={opacities.trail[index]}
              begin={`${delay}s`}
              fill="freeze"
            />
            <animateMotion
              begin={`${delay}s`}
              dur={duration}
              calcMode={MOTION_MODE}
              repeatCount="indefinite"
            >
              <mpath href="#loop" />
            </animateMotion>
          </circle>
        ))}
      <g
        className="mail-loop-envelope"
        transform={animated ? undefined : "translate(150 90)"}
      >
        <circle
          r="16"
          fill="var(--mail-loop-accent)"
          opacity="var(--mail-loop-halo-opacity)"
        />
        <rect
          x="-11"
          y="-8"
          width="22"
          height="16"
          rx="3"
          fill="var(--mail-loop-envelope-fill)"
          stroke="var(--mail-loop-envelope-stroke)"
          strokeWidth="var(--mail-loop-envelope-width)"
        />
        <polyline
          points="-10,-6 0,2 10,-6"
          fill="none"
          stroke="var(--mail-loop-envelope-stroke)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {animated && (
          <animateMotion
            dur={duration}
            calcMode={MOTION_MODE}
            repeatCount="indefinite"
          >
            <mpath href="#loop" />
          </animateMotion>
        )}
      </g>
    </svg>
  );
}
