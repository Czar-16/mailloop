"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
        if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const items = Array.from(
            root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ??
              [],
          );
          const index = items.indexOf(document.activeElement as HTMLElement);
          items[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                  items.length
          ]?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        variant="outline"
        className="size-11 shrink-0 rounded-full border-border bg-accent-soft p-0 font-semibold text-link hover:bg-muted"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {(name?.trim() || email).slice(0, 1).toUpperCase()}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="panel absolute right-0 z-40 mt-3 w-64 max-w-[calc(100vw-32px)] bg-muted p-4 shadow-overlay"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setOpen(false);
          }}
        >
          <p className="break-words text-sm font-medium">
            {name || "Your Account"}
          </p>
          <p className="mb-3 break-all text-xs text-body">{email}</p>
          <Link
            role="menuitem"
            href="/settings"
            className="flex min-h-11 items-center rounded-sm px-3 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <form action={signOut}>
            <Button
              role="menuitem"
              variant="ghost"
              className="w-full justify-start"
              type="submit"
            >
              Sign Out
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
