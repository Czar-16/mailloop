"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings } from "lucide-react";

export function AccountMenu({
  name,
  email,
  signOut,
}: {
  name: string | null;
  email: string;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const focusFrame = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (focusFrame.current !== undefined)
        cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    // Pointer defaults can move focus again after the outside-click handler.
    if (focusFrame.current !== undefined)
      cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
  return (
    <div
      ref={root}
      className="workspace-account"
      onKeyDown={(event) => {
        if (
          !open ||
          !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        )
          return;
        event.preventDefault();
        const items = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            "[role=menuitem]",
          ) ?? [],
        );
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        items[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length
        ]?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="workspace-account-trigger"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="workspace-avatar">
          {(name?.trim() || email).slice(0, 1).toUpperCase()}
        </span>
        <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="workspace-account-menu"
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget as Node)) close();
          }}
        >
          <div className="workspace-account-heading">
            <span className="workspace-mono-label">SIGNED IN AS</span>
            <span className="workspace-account-email" title={email}>
              {email}
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              router.push("/settings");
            }}
          >
            <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
            Settings
          </button>
          <form action={signOut} onSubmit={close}>
            <button type="submit" role="menuitem">
              <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
