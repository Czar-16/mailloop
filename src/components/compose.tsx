"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Paperclip, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renderTemplate } from "@/lib/validation";
import { submitCampaign } from "@/lib/actions";
import { Feedback, useUnsavedChanges } from "@/components/forms";
import { DateTime } from "@/components/date-time";
import { RoleChoices } from "@/components/preferences";
import type { ActionResult } from "@/lib/errors";
export type ComposeContact = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobRole: string | null;
  lastSent: string | null;
  previouslySent: boolean;
  blocked: boolean;
};
export function Compose({
  templates,
  contacts,
  used,
  resume,
  connected,
  roles,
  resumeUrl,
}: {
  templates: { id: string; name: string; subject: string; body: string }[];
  contacts: ComposeContact[];
  used: number;
  resume: string | null;
  connected: boolean;
  roles: string[];
  resumeUrl: string | null;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [selected, setSelected] = useState<ComposeContact[]>([]);
  const [role, setRole] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [recipientRoles, setRecipientRoles] = useState<Record<string, string>>(
    {},
  );
  const [attachResume, setAttachResume] = useState(!!resume && !resumeUrl);
  const getRole = (c: ComposeContact) =>
    recipientRoles[c.id] ?? c.jobRole ?? "";

  const [resendIds, setResendIds] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [idempotencyKey, setKey] = useState("");
  const router = useRouter();
  const roleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!pending && result?.fieldErrors?.role) roleInput.current?.focus();
  }, [result, pending]);
  const template = templates.find((t) => t.id === templateId);
  const preview = selected.find((c) => c.id === previewId) ?? selected[0];
  const included = selected.filter(
    (c) => !c.blocked && (!c.previouslySent || resendIds.includes(c.id)),
  );
  useUnsavedChanges(selected.length > 0 && !result?.ok, true);
  function toggle(contact: ComposeContact) {
    setResult(undefined);
    if (selected.some((c) => c.id === contact.id)) {
      setSelected(selected.filter((c) => c.id !== contact.id));
      setResendIds(resendIds.filter((id) => id !== contact.id));
    } else if (selected.length < 15) setSelected([...selected, contact]);
    setKey("");
  }
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="space-y-6">
        <section className="panel space-y-5 p-6">
          <p className="eyebrow">01 / The message</p>
          <div>
            <label
              htmlFor="compose-template"
              className="mb-2 block text-sm font-medium"
            >
              Choose a template
            </label>
            <select
              id="compose-template"
              disabled={pending}
              name="templateId"
              className="w-full text-sm"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setResult(undefined);
                setKey("");
              }}
            >
              <option value="">Select a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Link
              href="/templates"
              className="mt-2 inline-flex min-h-11 items-center text-xs text-link"
            >
              Manage Templates{" "}
              <ArrowRight className="ml-1 size-3" aria-hidden="true" />
            </Link>
          </div>
          <div>
            <label
              htmlFor="compose-role"
              className="mb-2 block text-sm font-medium"
            >
              Role to Apply to Selected
            </label>
            <Input
              id="compose-role"
              ref={roleInput}
              disabled={pending}
              aria-invalid={!!result?.fieldErrors?.role}
              aria-describedby={
                result?.fieldErrors?.role ? "compose-role-error" : undefined
              }
              name="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setResult(undefined);
                setKey("");
              }}
              placeholder="Frontend engineer…"
              maxLength={160}
              autoComplete="off"
            />
            {result?.fieldErrors?.role && (
              <p
                id="compose-role-error"
                className="mt-2 text-xs text-error-deep"
              >
                {result.fieldErrors.role}
              </p>
            )}
            <p className="mt-2 text-xs text-body">
              Enter actual values here. Templates use{" "}
              {"{{name}}, {{company}}, {{role}}, and {{resume_link}}"}. Each
              recipient keeps their own role; overrides apply only to this
              batch.
            </p>
            <RoleChoices
              roles={roles}
              disabled={pending}
              onChoose={(r) => setRole(r)}
            />
            <Button
              className="mt-3"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (!role.trim()) {
                  setResult({ ok: false, message: "Enter a role to apply." });
                  return;
                }
                setRecipientRoles({
                  ...recipientRoles,
                  ...Object.fromEntries(
                    selected.map((c) => [c.id, role.trim()]),
                  ),
                });
                setKey("");
              }}
            >
              Apply Role to Selected
            </Button>
          </div>
        </section>
        <section className="panel p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">02 / Your shortlist</p>
            <p aria-live="polite" className="text-xs tabular-nums text-body">
              {selected.length} / 15 selected
            </p>
          </div>
          <p className="mb-4 text-xs leading-5 text-body">
            Previously contacted people are skipped unless you allow a resend.
            Queued or unconfirmed sends are blocked.
          </p>
          <label className="mb-4 block text-sm">
            Filter by Job Role
            <select
              aria-label="Filter by Job Role"
              name="roleFilter"
              className="ml-2"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              {[...new Set([...roles, ...contacts.map(getRole)])]
                .filter(Boolean)
                .map((r) => (
                  <option key={r}>{r}</option>
                ))}
            </select>
          </label>
          <div className="space-y-1">
            {!contacts.length && (
              <p className="py-6 text-sm text-body">
                No matching contacts.{" "}
                <Link href="/contacts" className="text-link">
                  Add contacts
                </Link>{" "}
                or change your search.
              </p>
            )}
            {contacts
              .filter((c) => !roleFilter || getRole(c) === roleFilter)
              .map((c) => {
                const checked = selected.some((s) => s.id === c.id);
                return (
                  <div
                    key={c.id}
                    className="rounded-sm border border-border p-3"
                  >
                    <label
                      className={`flex min-h-11 items-center gap-3 ${c.blocked ? "opacity-60" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c)}
                        disabled={
                          pending ||
                          c.blocked ||
                          (!checked && selected.length >= 15)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">
                          {c.name}{" "}
                          <span className="font-normal text-body">
                            {c.company && `· ${c.company}`}
                          </span>
                        </span>
                        <span className="block break-all text-xs text-body">
                          {c.email}
                        </span>
                      </span>
                    </label>
                    <p className="ml-7 text-xs text-body">
                      {getRole(c) || "Choose a job role before sending"}
                    </p>
                    {c.lastSent && (
                      <p className="ml-7 text-xs text-body">
                        Last Sent: <DateTime value={c.lastSent} />
                      </p>
                    )}
                    {c.blocked && (
                      <p className="ml-7 text-xs text-warning">
                        Already queued or awaiting delivery confirmation
                      </p>
                    )}
                    {c.previouslySent && !c.blocked && (
                      <p className="ml-7 text-xs text-warning">
                        Previously contacted · skipped by default
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          {selected.some((c) => !contacts.some((v) => v.id === c.id)) && (
            <p className="mt-4 text-xs text-body">
              Your selection includes contacts from other search results.
            </p>
          )}
        </section>
        {selected.length > 0 && (
          <section className="panel space-y-4 p-6">
            <h2 className="text-sm font-medium">
              Recipient Roles for This Batch
            </h2>
            {selected.map((c) => (
              <label key={c.id} className="block text-sm">
                Job Role for {c.name}
                <Input
                  name={`role-${c.id}`}
                  value={getRole(c)}
                  maxLength={160}
                  autoComplete="off"
                  disabled={pending}
                  onChange={(e) => {
                    setRecipientRoles({
                      ...recipientRoles,
                      [c.id]: e.target.value,
                    });
                    setKey("");
                  }}
                  required
                />
              </label>
            ))}
          </section>
        )}
        {selected.some((c) => c.previouslySent) && (
          <section className="panel p-6">
            <h2 className="text-sm font-medium">
              Allow intentional follow-ups
            </h2>
            <p className="mt-2 text-xs leading-5 text-body">
              Only check people you intend to email again.
            </p>
            {selected
              .filter((c) => c.previouslySent)
              .map((c) => (
                <label
                  key={c.id}
                  className="mt-3 flex min-h-11 items-center gap-3 break-words text-sm"
                >
                  <input
                    type="checkbox"
                    checked={resendIds.includes(c.id)}
                    disabled={pending}
                    onChange={(e) => {
                      setResult(undefined);
                      setResendIds(
                        e.target.checked
                          ? [...resendIds, c.id]
                          : resendIds.filter((id) => id !== c.id),
                      );
                      setKey("");
                    }}
                  />
                  Allow a resend to {c.name}
                </label>
              ))}
          </section>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-6">
        <section className="panel overflow-hidden">
          <div className="border-b border-border p-6">
            <p className="eyebrow mb-4">03 / A personal preview</p>
            <label htmlFor="preview-recipient" className="sr-only">
              Preview recipient
            </label>
            <select
              id="preview-recipient"
              className="w-full text-sm"
              value={preview?.id ?? ""}
              onChange={(e) => setPreviewId(e.target.value)}
            >
              <option value="" disabled>
                Select a recipient to preview
              </option>
              {selected.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </div>
          {template && preview ? (
            <div className="space-y-4 p-6 text-sm leading-6">
              <p className="break-all text-body">To: {preview.email}</p>
              <h2 className="break-words border-b border-border pb-4 font-medium">
                {renderTemplate(template.subject, {
                  name: preview.name,
                  company: preview.company,
                  role: getRole(preview),
                  resume_link: resumeUrl,
                })}
              </h2>
              <p className="min-h-40 whitespace-pre-wrap break-words">
                {renderTemplate(template.body, {
                  name: preview.name,
                  company: preview.company,
                  role: getRole(preview),
                  resume_link: resumeUrl,
                })
                  .split(resumeUrl || "\u0000")
                  .map((part, i) => (
                    <span key={i}>
                      {i > 0 && resumeUrl && (
                        <a
                          href={resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link"
                        >
                          {resumeUrl}
                        </a>
                      )}
                      {part}
                    </span>
                  ))}
              </p>
              {preview.previouslySent && !resendIds.includes(preview.id) && (
                <p className="text-xs text-warning">
                  This recipient will be skipped unless you allow a resend.
                </p>
              )}
            </div>
          ) : (
            <p className="p-6 text-sm leading-6 text-body">
              Choose a template and select a recipient to see their individual
              email.
            </p>
          )}
          <div className="border-t border-border bg-background px-6 py-4">
            <p className="flex items-center gap-2 break-all text-xs text-body">
              <Paperclip className="size-4 shrink-0" aria-hidden="true" />
              {attachResume ? resume : "No PDF attachment"}
              <Link href="/settings" className="ml-auto text-link">
                Settings
              </Link>
            </p>
          </div>
        </section>
        <section className="panel space-y-4 p-6">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="attachResume"
              checked={attachResume}
              disabled={pending || !resume}
              onChange={(e) => {
                setAttachResume(e.target.checked);
                setKey("");
              }}
            />
            Attach Resume{!resume && " (upload a PDF in Settings)"}
          </label>
          <p className="break-words text-xs text-body">
            PDF: {attachResume ? resume : "None"}. Resume link:{" "}
            {/\{\{\s*resume_link\s*\}\}/.test(template?.body ?? "")
              ? resumeUrl || "Missing — save URL in Settings"
              : "Not included by this template"}
            .
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-body">Individual emails</span>
            <span className="font-medium tabular-nums">{included.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-body">Last 24 hours + queued</span>
            <span className="tabular-nums">{used} / 500</span>
          </div>
          <p className="text-xs leading-5 text-body">
            Each recipient gets a separate email from your Gmail. Sends are
            spaced 20–60 seconds apart.
          </p>
          {!connected && (
            <p className="text-sm text-warning">
              Reconnect Gmail in{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              before sending.
            </p>
          )}
          <Feedback result={result} />
          <Button
            className="w-full"
            disabled={pending || !connected}
            onClick={() => {
              if (!template || !included.length) {
                setResult({
                  ok: false,
                  message:
                    "Choose a template and at least one eligible recipient.",
                });
                return;
              }
              if (used + included.length > 500) {
                setResult({
                  ok: false,
                  message: "This campaign would exceed your 24-hour limit.",
                });
                return;
              }
              if (included.some((c) => !getRole(c).trim())) {
                setResult({
                  ok: false,
                  message: "Choose a job role for every recipient.",
                });
                return;
              }
              if (/{{\s*resume_link\s*}}/.test(template.body) && !resumeUrl) {
                setResult({
                  ok: false,
                  message:
                    "Save a resume URL in Settings before using this template.",
                });
                return;
              }
              const key = idempotencyKey || crypto.randomUUID();
              setKey(key);
              start(async () => {
                const r = await submitCampaign({
                  templateId,
                  recipientIds: selected.map((c) => c.id),
                  recipientRoles: Object.fromEntries(
                    selected
                      .filter((c) => getRole(c).trim())
                      .map((c) => [c.id, getRole(c)]),
                  ),
                  attachResume,
                  resendIds,
                  idempotencyKey: key,
                });
                setResult(r);
                if (r.ok) {
                  setSelected([]);
                  setResendIds([]);
                  setKey("");
                  router.push(`/history?campaign=${r.id}`);
                }
              });
            }}
          >
            <Send aria-hidden="true" />
            {pending
              ? "Queuing…"
              : `Send ${included.length || ""} Individual Email${included.length === 1 ? "" : "s"}`}
          </Button>
        </section>
      </aside>
    </div>
  );
}
