"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/forms";
import { refreshReplies } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
export function HistoryControls({
  hasQueued,
  autoRefresh = true,
}: {
  hasQueued: boolean;
  autoRefresh?: boolean;
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(
      () => {
        if (document.visibilityState === "visible") router.refresh();
      },
      hasQueued ? 5000 : 30000,
    );
    return () => clearInterval(interval);
  }, [hasQueued, autoRefresh, router]);
  return (
    <div className="history-controls flex w-full max-w-full flex-col items-start gap-2 self-start sm:w-80 sm:items-end sm:text-right">
      <Button
        variant="outline"
        className="min-w-48"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (pending) return;
          setResult(undefined);
          start(async () => {
            try {
              setResult(await refreshReplies());
              router.refresh();
            } catch {
              setResult({
                ok: false,
                message:
                  "Could not queue a reply check. Verify Inngest is running.",
              });
            }
          });
        }}
      >
        <RefreshCw
          className={pending ? "button-spinner" : undefined}
          aria-hidden="true"
        />
        {pending ? "Queuing Check…" : "Check Replies"}
      </Button>
      <div className="min-h-10 w-full break-words">
        <Feedback result={result} />
      </div>
    </div>
  );
}
