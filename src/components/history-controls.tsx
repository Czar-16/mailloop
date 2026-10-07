"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/forms";
import { refreshReplies } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
export function HistoryControls({ hasQueued }: { hasQueued: boolean }) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { const interval = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, hasQueued ? 10000 : 30000); return () => clearInterval(interval); }, [hasQueued, router]);
  return <div className="space-y-2"><Button variant="outline" disabled={pending} onClick={() => start(async () => { try { setResult(await refreshReplies()); router.refresh(); } catch { setResult({ ok: false, message: "Could not queue a reply check. Verify Inngest is running." }); } })}><RefreshCw aria-hidden="true" />{pending ? "Queuing Check…" : "Check Replies"}</Button><Feedback result={result} /></div>;
}
