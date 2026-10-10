"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ExpansionContext = createContext<{
  expanded: boolean;
  expand: () => void;
} | null>(null);

export function ContactsTableExpandButton() {
  const context = useContext(ExpansionContext);
  const tooltipId = useId();
  if (!context || context.expanded) return null;
  return (
    <span className="group relative inline-flex shrink-0">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Expand contacts table"
        aria-describedby={tooltipId}
        aria-haspopup="dialog"
        onClick={context.expand}
      >
        <Maximize2 aria-hidden="true" />
      </Button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-10 mt-1 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 font-sans text-xs font-normal normal-case tracking-normal text-background shadow-sm group-hover:block group-focus-within:block"
      >
        Expand table
      </span>
    </span>
  );
}

export function ExpandableContactsTable({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!expanded) {
      if (restoreFocus.current) {
        restoreFocus.current = false;
        container.current
          ?.querySelector<HTMLButtonElement>(
            'button[aria-label="Expand contacts table"]',
          )
          ?.focus();
      }
      return;
    }
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  return (
    <ExpansionContext.Provider
      value={{
        expanded,
        expand: () => setExpanded(true),
      }}
    >
      <div ref={container} className="min-w-0">
        {!expanded && children}
        <dialog
          ref={dialog}
          className="contacts-expanded-dialog"
          aria-label="Expanded contacts table"
          onClose={() => {
            restoreFocus.current = true;
            setExpanded(false);
          }}
        >
          <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Contacts</h2>
            <Button
              type="button"
              variant="outline"
              title="Collapse contacts table"
              aria-label="Collapse contacts table"
              onClick={() => dialog.current?.close()}
            >
              <Minimize2 aria-hidden="true" />
              <span>Collapse</span>
            </Button>
          </div>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-auto"
            onClick={(event) => {
              // Editing a person returns to the form beside the normal table.
              if ((event.target as Element).closest("a"))
                dialog.current?.close();
            }}
          >
            {expanded && children}
          </div>
        </dialog>
      </div>
    </ExpansionContext.Provider>
  );
}
