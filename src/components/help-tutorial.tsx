"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { tutorials, type TutorialStep } from "@/components/tutorial-content";
import { TutorialHint } from "@/components/tutorial-hint";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TutorialDialog({
  steps,
  onClose,
  draft = false,
}: {
  steps: readonly TutorialStep[];
  onClose: () => void;
  draft?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const closing = useRef(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "out" | "in" | "closing">("idle");
  const [direction, setDirection] = useState(1);
  const titleId = useId();
  const last = index === steps.length - 1;

  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    (next.current ?? done.current)?.focus();
    return () => {
      clearTimeout(timer.current);
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    // Next is replaced by Done, so preserve focus when its node disappears.
    if (last && document.activeElement === document.body) done.current?.focus();
  }, [last]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    clearTimeout(timer.current);
    if (reducedMotion()) {
      dialog.current?.close();
      onClose();
    } else {
      setPhase("closing");
      timer.current = setTimeout(() => {
        dialog.current?.close();
        onClose();
      }, 200);
    }
  }, [onClose]);

  function travel(delta: number) {
    if (
      busy.current ||
      closing.current ||
      index + delta < 0 ||
      index + delta >= steps.length
    )
      return;
    const focusNext = document.activeElement === next.current;
    const arrive = () => {
      setIndex(index + delta);
      // Focus after React commits the final-step button replacement.
      if (focusNext && index + delta === steps.length - 1) {
        requestAnimationFrame(() => done.current?.focus());
      }
    };
    if (reducedMotion()) {
      arrive();
      return;
    }
    busy.current = true;
    setDirection(delta);
    setPhase("out");
    timer.current = setTimeout(() => {
      arrive();
      setPhase("in");
      timer.current = setTimeout(() => {
        busy.current = false;
        setPhase("idle");
      }, 240);
    }, 150);
  }

  const step = steps[index];
  return (
    <dialog
      ref={dialog}
      className="tutorial-dialog"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const first = controls[0];
          const final = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            final?.focus();
          } else if (!event.shiftKey && document.activeElement === final) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          travel(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div className="tutorial-card" data-phase={phase}>
        <header className="tutorial-topbar">
          <span
            className="tutorial-counter"
            aria-live="polite"
            aria-atomic="true"
          >
            {index + 1} / {steps.length}
          </span>
          <button
            type="button"
            className="tutorial-close"
            aria-label="Close tutorial"
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="tutorial-progress" aria-hidden="true">
          <span
            style={{ transform: `scaleX(${(index + 1) / steps.length})` }}
          />
        </div>
        <div className="tutorial-body">
          <button
            type="button"
            className="tutorial-arrow tutorial-back"
            aria-label="Back"
            disabled={index === 0}
            onClick={() => travel(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div
            key={index}
            className={`tutorial-step ${phase === "out" ? "step-out" : phase === "in" ? "step-in" : ""}`}
            style={{ "--travel": direction } as React.CSSProperties}
          >
            <h2 id={titleId} className="tutorial-title">
              {step.title}
            </h2>
            <p className="tutorial-text">{step.text}</p>
            <div className="tutorial-visual">
              <TutorialHint hint={step.hint} draft={draft} />
            </div>
          </div>
          {!last && (
            <button
              ref={next}
              type="button"
              className="tutorial-arrow tutorial-next"
              aria-label="Next"
              onClick={() => travel(1)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        <footer className="tutorial-footer">
          <div className="tutorial-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span className="tutorial-dot-slot" key={i}>
                <span className={i === index ? "is-active" : ""} />
              </span>
            ))}
          </div>
          {last && (
            <button
              ref={done}
              type="button"
              className="tutorial-done"
              onClick={close}
            >
              Done
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}

export function HelpTutorial() {
  const pathname = usePathname();
  const [state, setState] = useState({ pathname, open: false });
  const [visibility, setVisibility] = useState<
    "visible" | "dismissing" | "dismissed"
  >("visible");
  const dismissing = useRef(false);
  const dismissalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(dismissalTimer.current), []);

  useEffect(() => {
    if (visibility === "dismissed") {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }, [visibility]);

  function dismiss() {
    if (dismissing.current) return;
    dismissing.current = true;
    if (reducedMotion()) {
      setVisibility("dismissed");
    } else {
      setVisibility("dismissing");
      dismissalTimer.current = setTimeout(
        () => setVisibility("dismissed"),
        200,
      );
    }
  }
  const launcher = useRef<HTMLButtonElement>(null);
  if (state.pathname !== pathname) setState({ pathname, open: false });
  const open = state.pathname === pathname && state.open;
  const steps = tutorials[pathname];
  const close = useCallback(() => {
    setState({ pathname, open: false });
    requestAnimationFrame(() => launcher.current?.focus());
  }, [pathname]);
  if (!steps || visibility === "dismissed") return null;

  return (
    <>
      <div
        className="help-launcher"
        data-state={visibility}
        hidden={open}
        inert={visibility === "dismissing"}
      >
        <div className="help-cloud-visibility">
          <div className="help-cloud-entrance">
            <div className="help-cloud" aria-hidden="true">
              Need help?
            </div>
          </div>
        </div>
        <div className="help-button-pop">
          <button
            ref={launcher}
            type="button"
            className="help-button"
            aria-label={`Help with ${pathname.slice(1)}`}
            aria-haspopup="dialog"
            onClick={() => {
              if (!dismissing.current) setState({ pathname, open: true });
            }}
          >
            ?
          </button>
        </div>
        {!open && (
          <button
            type="button"
            className="help-dismiss"
            aria-label="Hide help button until reload."
            title="Hide help button until reload."
            onClick={dismiss}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <TutorialDialog
          steps={steps}
          onClose={close}
          draft={pathname === "/compose"}
        />
      )}
    </>
  );
}
