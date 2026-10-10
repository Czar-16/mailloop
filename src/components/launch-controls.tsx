"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuccessNotification } from "@/components/notifications";
import { Feedback } from "@/components/forms";
import {
  cancelEmails,
  deleteAccount,
  saveFollowUpDays,
} from "@/lib/launch-actions";
import type { ActionResult } from "@/lib/errors";

export function CancelEmails({
  sendId,
  campaignId,
}: {
  sendId?: string;
  campaignId?: string;
}) {
  const notify = useSuccessNotification();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const router = useRouter();
  return (
    <div>
      <Button variant="outline" onClick={() => dialog.current?.showModal()}>
        {sendId ? "Cancel email" : "Cancel queued emails in batch"}
      </Button>
      <dialog
        ref={dialog}
        className="panel m-auto w-[calc(100%-2rem)] max-w-md p-6 text-foreground"
        aria-labelledby={`cancel-${sendId ?? campaignId}`}
      >
        <h2 id={`cancel-${sendId ?? campaignId}`} className="text-lg">
          Cancel queued emails?
        </h2>
        <p className="my-4 text-sm text-body">
          Only emails waiting to send can be cancelled. Emails already sent,
          actively sending, or needing delivery review cannot be stopped.
          {campaignId &&
            " All waiting emails in this batch are included, even outside the current filter."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const response = await cancelEmails({ sendId, campaignId });
                  setResult(response);
                  notify(response.message);
                  dialog.current?.close();
                  router.refresh();
                } catch {
                  setResult({
                    ok: false,
                    message: "Could not cancel. Please try again.",
                  });
                }
              })
            }
          >
            {pending ? "Cancelling…" : "Confirm cancellation"}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            Keep emails
          </Button>
        </div>
        {result?.ok === false && <Feedback result={result} />}
      </dialog>
      <Feedback result={result} />
    </div>
  );
}
export function AccountControls({
  email,
  days,
}: {
  email: string;
  days: number;
}) {
  const [value, setValue] = useState(days);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const notify = useSuccessNotification();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <section className="panel mt-6 space-y-4 p-6">
        <h2 className="section-label">Follow-up reminders</h2>
        <p className="text-sm text-body">
          History shows contacts due for a follow-up when no reply has been
          detected. Add them to your shortlist and approve each email in
          Compose. Reminders never send automatically.
        </p>
        <label htmlFor="follow-up-days" className="text-sm">
          Remind me after{" "}
        </label>
        <select
          id="follow-up-days"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(Number(e.target.value))}
        >
          <option value={0}>Off</option>
          {[3, 7, 14].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const response = await saveFollowUpDays(value);
                setResult(response);
                notify(response.message);
              } catch {
                setResult({ ok: false, message: "Could not save reminders." });
              }
            })
          }
        >
          Save reminders
        </Button>
      </section>
      <section className="panel mt-6 space-y-4 p-6">
        <h2 className="section-label">Your data</h2>
        <p className="text-sm text-body">
          Download your profile, preferences, contacts, templates, message
          history, and attachment metadata. Download your current PDF separately
          using the resume control.
        </p>
        <a
          href="/api/account/export"
          className="inline-flex min-h-11 items-center text-link"
        >
          Download my data
        </a>
        <div>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.showModal()}
          >
            Delete account
          </Button>
        </div>
        <p className="text-sm">
          <a
            href="/privacy"
            className="inline-flex min-h-11 items-center text-link"
          >
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a
            href="/terms"
            className="inline-flex min-h-11 items-center text-link"
          >
            Terms of Service
          </a>
        </p>
        <Feedback result={result} />
      </section>
      <dialog
        ref={dialog}
        className="panel m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 p-6 text-foreground"
        aria-labelledby="delete-account-title"
      >
        <h2 id="delete-account-title" className="text-xl">
          Delete your Mailloop account?
        </h2>
        <p className="text-sm text-body">
          You will be signed out immediately and queued emails will be cancelled
          where possible. An email already sending may still finish. After at
          least 15 minutes, we will revoke Google authorization and remove your
          profile, contacts, templates, history, and uploaded PDFs. Failed
          cleanup will be retried while your account remains disabled. This
          cannot be undone.
        </p>
        <p className="text-sm text-body">
          This does not remove emails from Gmail or recipients’ inboxes.
          Download your data first if you need a copy.
        </p>
        <label htmlFor="delete-email" className="block break-all text-sm">
          Type {email} to confirm
        </label>
        <Input
          id="delete-email"
          type="email"
          autoComplete="off"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={pending || confirmation !== email}
            onClick={() =>
              start(async () => {
                const response = await deleteAccount(confirmation);
                setResult(response);
              })
            }
          >
            {pending ? "Requesting…" : "Permanently delete account"}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            Keep account
          </Button>
        </div>
        <Feedback result={result} />
      </dialog>
    </>
  );
}
