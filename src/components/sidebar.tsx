"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/common";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";

function UsageCard() {
  return (
    <section className="panel space-y-3 p-4" aria-label="Plan and email usage">
      <h2 className="text-sm font-semibold">Plan &amp; Usage</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        Plan information unavailable
      </p>
      <div className="border-t border-border pt-3 text-sm text-body">
        <p>Usage unavailable</p>
        <p className="mt-1 text-xs leading-5">
          500 email limit · Rolling 24 hours
        </p>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Usage includes sent emails and reserved queue capacity. View current
        usage in Compose or History.
      </p>
    </section>
  );
}

export function Sidebar() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    dialog.current?.close();
  }

  useEffect(() => {
    const desktop = matchMedia("(min-width: 1024px)");
    const resize = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <aside
        aria-label="Workspace sidebar"
        className="fixed inset-y-0 left-0 hidden h-dvh w-60 flex-col overflow-y-auto border-r border-border bg-sidebar px-4 pb-4 lg:flex"
      >
        <div className="flex min-h-18 shrink-0 items-center border-b border-border px-2 [&_a]:gap-3 [&_a]:text-2xl [&_svg]:size-7">
          <Wordmark />
        </div>
        <div className="py-5">
          <Navigation />
        </div>
        <div className="mt-auto pt-6">
          <UsageCard />
        </div>
      </aside>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Menu aria-hidden="true" />
      </Button>
      <dialog
        ref={dialog}
        id="mobile-navigation"
        aria-labelledby="mobile-navigation-title"
        className="navigation-drawer"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <div className="flex min-h-full flex-col">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4">
            <Wordmark onNavigate={close} />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={close}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <h2 id="mobile-navigation-title" className="sr-only">
            Workspace navigation
          </h2>
          <Navigation onNavigate={close} />
          <div className="mt-auto pt-8">
            <UsageCard />
          </div>
        </div>
      </dialog>
    </>
  );
}
