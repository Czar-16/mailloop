"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToShortlist } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

export function AddToShortlist({
  sendId,
  inShortlist,
  blocked,
  active,
}: {
  sendId: string;
  inShortlist: boolean;
  blocked: boolean;
  active: boolean;
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const added = inShortlist;
  return (
    <div className="max-w-56">
      <Button
        variant="outline"
        disabled={pending || !!added || blocked || !active}
        onClick={() =>
          start(async () => {
            try {
              setResult(await addToShortlist(sendId));
              router.refresh();
            } catch {
              setResult({
                ok: false,
                message: "Could not add this follow-up. Try again.",
              });
            }
          })
        }
      >
        {added ? "In shortlist" : pending ? "Adding…" : "Add to shortlist"}
      </Button>
      {blocked && <p className="mt-2 text-xs text-body">Pending delivery</p>}
      {!active && <p className="mt-2 text-xs text-body">Contact unavailable</p>}
      {result?.ok === false && <Feedback result={result} />}
    </div>
  );
}
