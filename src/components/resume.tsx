"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Paperclip, Upload } from "lucide-react";
import { finalizeResume, removeResume } from "@/lib/resume-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feedback } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";
import { MAX_PDF_BYTES } from "@/lib/validation";
export function Resume({
  userId,
  fileName,
  useBlob,
}: {
  userId: string;
  fileName: string | null;
  useBlob: boolean;
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  return (
    <section className="panel space-y-5 p-6">
      <div>
        <h2 className="section-label">Resume PDF</h2>
        <p className="mt-2 text-sm leading-6 text-body">
          Upload one resume PDF, up to 5 MB, then select “Attach Resume” in
          Compose. Mentioning a PDF in the message does not attach it. Queued
          emails retain the resume you selected when sending.
        </p>
      </div>
      {fileName && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border p-4">
          <a
            href="/api/resume/download"
            className="flex min-h-11 min-w-0 items-center gap-2 break-all text-sm text-link"
          >
            <Paperclip className="size-4 shrink-0" aria-hidden="true" />
            {fileName}
          </a>
          <Button variant="ghost" onClick={() => dialog.current?.showModal()}>
            Remove
          </Button>
        </div>
      )}
      <form
        className="space-y-4"
        action={() =>
          start(async () => {
            const file = input.current?.files?.[0];
            if (!file) {
              setResult({ ok: false, message: "Choose a PDF first." });
              input.current?.focus();
              return;
            }
            if (file.type !== "application/pdf" || file.size > MAX_PDF_BYTES) {
              setResult({ ok: false, message: "Choose a PDF up to 5 MB." });
              input.current?.focus();
              return;
            }
            try {
              if (useBlob) {
                const pathname = `resumes/${userId}/${crypto.randomUUID()}.pdf`;
                await upload(pathname, file, {
                  access: "private",
                  handleUploadUrl: "/api/resume/blob",
                });
                setResult(await finalizeResume(pathname, file.name));
              } else {
                const form = new FormData();
                form.set("file", file);
                const response = await fetch("/api/resume/upload", {
                  method: "POST",
                  body: form,
                });
                const data = await response.json();
                setResult({
                  ok: response.ok,
                  message:
                    data.error ??
                    "Resume saved. It will be attached to new campaigns.",
                });
              }
              router.refresh();
            } catch {
              setResult({
                ok: false,
                message: "Upload failed. Check your connection and try again.",
              });
            }
          })
        }
      >
        <label htmlFor="resume-file" className="block text-sm font-medium">
          {fileName ? "Replace PDF" : "Choose PDF"}
        </label>
        <Input
          ref={input}
          id="resume-file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
        />
        <Button type="submit" disabled={pending}>
          <Upload aria-hidden="true" />
          {pending ? "Uploading…" : "Save Resume"}
        </Button>
      </form>
      <Feedback result={result} />
      <dialog ref={dialog} aria-labelledby="remove-resume-title">
        <h2 id="remove-resume-title" className="text-xl font-semibold">
          Remove your resume?
        </h2>
        <p className="mt-3 text-sm text-body">
          Future campaigns will have no attachment. Queued emails keep their
          saved resume.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setResult(await removeResume());
                dialog.current?.close();
                router.refresh();
              })
            }
          >
            Remove
          </Button>
        </div>
      </dialog>
    </section>
  );
}
