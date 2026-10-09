"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type ChecklistItem = { label: string; done: boolean; hint: string };

function ChecklistRow({
  item,
  phase,
  delay,
}: {
  item: ChecklistItem;
  phase: "idle" | "done" | "undone";
  delay: number;
}) {
  // Retain outgoing text while its container fades and collapses.
  const [lastHint, setLastHint] = useState(item.hint);
  const hint = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = hint.current;
    if (!element) return;
    const measure = () =>
      element.style.setProperty("--hint-height", `${element.scrollHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [lastHint]);
  if (item.hint && item.hint !== lastHint) setLastHint(item.hint);
  return (
    <li
      className="send-checklist-row"
      data-done={item.done}
      aria-atomic="true"
      style={{ "--checklist-delay": `${delay}ms` } as CSSProperties}
    >
      <span
        className="send-checklist-icon"
        data-phase={phase}
        aria-hidden="true"
      >
        <span className="send-checklist-empty" />
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" pathLength="1" />
          <path d="M8 12.5l3 3 5-6" pathLength="1" />
        </svg>
      </span>
      <div className="send-checklist-copy">
        <span className="send-checklist-label">
          <span className="sr-only">
            {item.done ? "Complete: " : "Incomplete: "}
          </span>
          {item.label}
        </span>
        <span
          ref={hint}
          className="send-checklist-hint"
          data-visible={!!item.hint}
          aria-hidden={!item.hint}
        >
          {item.hint || lastHint}
        </span>
      </div>
    </li>
  );
}

export function SendChecklist({
  templateSelected,
  recipientCount,
  missingRoles,
  attachResume,
}: {
  templateSelected: boolean;
  recipientCount: number;
  missingRoles: string[];
  attachResume: boolean;
}) {
  const items: ChecklistItem[] = [
    {
      label: "Pick a template",
      done: templateSelected,
      hint: templateSelected ? "" : "Choose one under 01 / The Message",
    },
    {
      label: "Select at least one recipient",
      done: recipientCount > 0,
      hint: recipientCount
        ? `${recipientCount} selected`
        : "Tick people in your shortlist",
    },
    {
      label: "Every recipient has a role",
      done: recipientCount > 0 && !missingRoles.length,
      hint: missingRoles.length
        ? `${missingRoles.join(", ")} ${missingRoles.length === 1 ? "needs" : "need"} a role. Use Apply Role to Selected.`
        : "",
    },
    { label: "Resume attached (optional)", done: attachResume, hint: "" },
  ];
  const signature = items.map((item) => (item.done ? "1" : "0")).join("");
  const ready = items.slice(0, 3).every((item) => item.done);
  const [motion, setMotion] = useState({
    signature,
    ready,
    phases: items.map(() => "idle" as "idle" | "done" | "undone"),
    delays: items.map(() => 0),
    pulses: 0,
  });
  if (motion.signature !== signature) {
    let changed = 0;
    const delays = items.map((_, index) =>
      motion.signature[index] !== signature[index] ? changed++ * 60 : 0,
    );
    setMotion({
      signature,
      ready,
      phases: items.map((item, index) =>
        motion.signature[index] === signature[index]
          ? "idle"
          : item.done
            ? "done"
            : "undone",
      ),
      delays,
      pulses: motion.pulses + (!motion.ready && ready ? 1 : 0),
    });
  }
  return (
    <section
      className="send-checklist"
      aria-labelledby="send-checklist-title"
      data-ready={ready}
    >
      {motion.pulses > 0 && (
        <span
          key={motion.pulses}
          className="send-checklist-glow"
          aria-hidden="true"
        />
      )}
      <h3 id="send-checklist-title">Before you can send</h3>
      <div aria-live="polite">
        <ul>
          {items.map((item, index) => (
            <ChecklistRow
              key={item.label}
              item={item}
              phase={motion.phases[index]}
              delay={motion.delays[index]}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
