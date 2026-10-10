"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Paperclip, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { templateSchema, renderTemplate } from "@/lib/validation";
import { submitCampaign } from "@/lib/actions";
import { Feedback, useUnsavedChanges } from "@/components/forms";
import { ProgressRing, estimateSeconds } from "@/components/progress-ring";
import { DateTime } from "@/components/date-time";
import { RoleChoices } from "@/components/preferences";
import { SendChecklist } from "@/components/send-checklist";
import { useWorkspaceQuota } from "@/components/workspace-quota";
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
  followUp?: boolean;
};
export function Compose({
  templates,
  contacts,
  used,
  resume,
  connected,
  roles,
}: {
  templates: { id: string; name: string; subject: string; body: string }[];
  contacts: ComposeContact[];
  used: number;
  resume: string | null;
  connected: boolean;
  roles: string[];
}) {
  const displayedQuota = useWorkspaceQuota(used);
  const [templateId, setTemplateId] = useState("");
  const [selected, setSelected] = useState<ComposeContact[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [recipientRoles, setRecipientRoles] = useState<Record<string, string>>(
    {},
  );
  const [attachResume, setAttachResume] = useState(false);
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
  const templateValidation = template
    ? templateSchema.safeParse(template)
    : null;
  const preview = selected.find((c) => c.id === previewId) ?? selected[0];
  const included = selected.filter(
    (c) => !c.blocked && (!c.previouslySent || resendIds.includes(c.id)),
  );
  const missingRoles = included.filter((contact) => !getRole(contact).trim());
  const readyToSend =
    !!template && included.length > 0 && missingRoles.length === 0;
  const filteredContacts = contacts.filter(
    (c) => !roleFilter || getRole(c) === roleFilter,
  );
  const bulkEligible = filteredContacts.filter(
    (c) => !c.blocked && !c.previouslySent,
  );
  const selectedIds = new Set(selected.map((c) => c.id));
  const hasFilteredSelection = bulkEligible.some((c) => selectedIds.has(c.id));
  const allSelected =
    bulkEligible.length > 0 &&
    (bulkEligible.every((c) => selectedIds.has(c.id)) ||
      (selected.length >= 15 && hasFilteredSelection));
  useUnsavedChanges(selected.length > 0 && !result?.ok, true);
  function updateRole(id: string, value: string) {
    setRecipientRoles((current) => ({ ...current, [id]: value }));
    setResult(undefined);
    setKey("");
  }
  function toggle(contact: ComposeContact) {
    setResult(undefined);
    if (selected.some((c) => c.id === contact.id)) {
      setSelected(selected.filter((c) => c.id !== contact.id));
      setResendIds(resendIds.filter((id) => id !== contact.id));
    } else if (selected.length < 15) setSelected([...selected, contact]);
    setKey("");
  }
  return (
    <div className="compose-grid">
      <div className="space-y-[18px]">
        <section className="panel space-y-4 p-5">
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
              Role for {preview?.name ?? "current recipient"}
            </label>
            <Input
              id="compose-role"
              ref={roleInput}
              disabled={pending || !preview}
              aria-invalid={!!result?.fieldErrors?.role}
              aria-describedby={
                result?.fieldErrors?.role ? "compose-role-error" : undefined
              }
              name="role"
              value={preview ? getRole(preview) : ""}
              onChange={(e) => {
                if (preview) updateRole(preview.id, e.target.value);
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
            <p className="mt-2 mb-3 text-xs text-body">
              Enter actual values here. Templates use{" "}
              {"{{name}}, {{company}}, and {{role}}"}. Each recipient keeps
              their own role; overrides apply only to this batch.
            </p>
            <RoleChoices
              roles={roles}
              disabled={pending || !preview}
              onChoose={(r) => {
                if (preview) updateRole(preview.id, r);
              }}
            />
          </div>
        </section>
        <section className="panel recipient-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">02 / Your shortlist</p>
            <p aria-live="polite" className="text-xs tabular-nums text-body">
              {selected.length} / 15 selected
            </p>
          </div>
          <p className="mb-4 text-xs leading-5 text-body">
            Unsent contacts appear here. Add intentional follow-ups from
            History, then allow a resend. Pending deliveries remain blocked.
          </p>
          <label className="mb-4 block text-sm">
            Filter by Job Role
            <select
              aria-label="Filter by Job Role"
              name="roleFilter"
              className="mt-2 w-full"
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
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={
                pending ||
                !bulkEligible.length ||
                (!allSelected && selected.length >= 15)
              }
              onClick={() => {
                if (allSelected) {
                  const filteredIds = new Set(
                    filteredContacts.map((c) => c.id),
                  );
                  setSelected(selected.filter((c) => !filteredIds.has(c.id)));
                  setResendIds(resendIds.filter((id) => !filteredIds.has(id)));
                } else {
                  setSelected([
                    ...selected,
                    ...bulkEligible
                      .filter((c) => !selectedIds.has(c.id))
                      .slice(0, 15 - selected.length),
                  ]);
                }
                setResult(undefined);
                setKey("");
              }}
            >
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
            <span className="text-xs text-body">
              Up to 15 eligible contacts in this filter
            </span>
          </div>
          <div className="space-y-4">
            {!filteredContacts.length && (
              <p className="py-6 text-sm text-body">
                No matching contacts.{" "}
                <Link href="/contacts" className="text-link">
                  Add contacts
                </Link>{" "}
                or change your search.
              </p>
            )}
            {[false, true].map((blocked) => (
              <div key={String(blocked)} className="space-y-4">
                {blocked && filteredContacts.some((c) => c.blocked) && (
                  <h3 className="text-sm font-semibold">Pending delivery</h3>
                )}
                {filteredContacts
                  .filter((c) => c.blocked === blocked)
                  .map((c) => {
                    const checked = selected.some((s) => s.id === c.id);
                    return (
                      <div key={c.id} className="recipient-card">
                        <label
                          className={`recipient-header flex min-h-11 items-center gap-3 ${c.blocked ? "opacity-60" : "cursor-pointer"}`}
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
                            <span className="block break-words text-[17px] font-semibold">
                              {c.name}{" "}
                              {c.company?.trim() && (
                                <span className="recipient-company font-normal">
                                  · {c.company}
                                </span>
                              )}
                            </span>
                          </span>
                        </label>
                        <dl className="recipient-details">
                          <dt>Email</dt>
                          <dd>{c.email}</dd>
                          {getRole(c).trim() && (
                            <>
                              <dt>Role</dt>
                              <dd>{getRole(c)}</dd>
                            </>
                          )}
                          {c.lastSent && (
                            <>
                              <dt>Last sent</dt>
                              <dd>
                                <DateTime value={c.lastSent} />
                              </dd>
                            </>
                          )}
                        </dl>
                        {c.blocked && (
                          <p className="recipient-blocked text-xs">
                            Already queued or awaiting delivery confirmation
                          </p>
                        )}
                        {c.previouslySent && !c.blocked && (
                          <p className="status-pill recipient-warning">
                            Follow-up · allow a resend to include
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
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
                  className="mt-2"
                  name={`role-${c.id}`}
                  value={getRole(c)}
                  maxLength={160}
                  autoComplete="off"
                  disabled={pending}
                  onChange={(e) => {
                    updateRole(c.id, e.target.value);
                  }}
                  required
                />
              </label>
            ))}
          </section>
        )}
        {selected.some((c) => c.previouslySent) && (
          <section className="panel p-5">
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
        <section className="panel p-5">
          <div className="mb-3">
            <p className="section-label mb-4">03 / Personal preview</p>
            <label
              htmlFor="preview-recipient"
              className="mb-2 block text-sm font-medium"
            >
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
            <div className="mail-preview space-y-4 p-4 text-sm leading-6">
              <p className="break-all text-body">To: {preview.email}</p>
              <h2 className="break-words border-b border-border pb-4 font-medium">
                {renderTemplate(template.subject, {
                  name: preview.name,
                  company: preview.company,
                  role: getRole(preview),
                })}
              </h2>
              <p className="min-h-40 whitespace-pre-wrap break-words">
                {renderTemplate(template.body, {
                  name: preview.name,
                  company: preview.company,
                  role: getRole(preview),
                })}
              </p>
              {templateValidation?.success === false && (
                <p role="alert" className="text-xs text-error-deep">
                  {templateValidation.error.issues
                    .map((issue) => issue.message)
                    .join(" ")}
                </p>
              )}
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
          <div className="mt-4 space-y-3 border-t border-border pt-3">
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
            <p className="flex min-w-0 items-center gap-2 text-xs text-body">
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate" title={resume ?? undefined}>
                {resume ?? "No PDF uploaded"}
              </span>
            </p>
            <p className="text-xs leading-5 text-body">
              Upload a resume PDF in Settings, then select “Attach Resume” here.
              Mentioning a PDF in the message does not attach it.
            </p>
          </div>
          <div className="pt-3">
            <p className="flex items-center gap-2 break-all text-xs text-body">
              <Paperclip className="size-4 shrink-0" aria-hidden="true" />
              <span
                className="min-w-0 truncate"
                title={attachResume ? (resume ?? undefined) : undefined}
              >
                {attachResume ? resume : "No PDF attachment"}
              </span>
              <Link href="/settings" className="ml-auto text-link">
                Settings
              </Link>
            </p>
          </div>
        </section>
        <section className="panel send-queue-panel space-y-4 p-5">
          <h2 className="section-label">Send queue</h2>
          <ProgressRing
            sent={0}
            queued={included.length}
            failed={0}
            seconds={estimateSeconds(included.length)}
            draft
          />
          <p className="text-xs text-body">
            Estimate for selected recipients at 20–60 seconds between sends.
            This is not a delivery confirmation.
          </p>
          {[
            { label: "Selected recipients", value: included.length, max: 15 },
            {
              label: "Last 24 hours + queued",
              value: displayedQuota,
              max: 500,
            },
          ].map(({ label, value, max }) => (
            <div key={label} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-body">{label}</span>
                <span className="font-medium tabular-nums">
                  {value} / {max}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={Math.min(value, max)}
                aria-valuetext={`${value} / ${max}`}
                className="recipient-meter-track h-2 overflow-hidden rounded-full"
              >
                <div
                  className="queue-meter recipient-meter-fill h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <p className="text-xs leading-5 text-body">
            Each recipient gets a separate email from your Gmail. Sends are
            spaced 20–60 seconds apart.
          </p>
          <SendChecklist
            templateSelected={!!template}
            recipientCount={included.length}
            missingRoles={missingRoles.map((contact) => contact.name)}
            attachResume={attachResume}
          />
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
            className="compose-send-button w-full"
            disabled={pending || !connected || !readyToSend}
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
              const validation = templateSchema.safeParse(template);
              if (!validation.success) {
                setResult({
                  ok: false,
                  message: validation.error.issues[0].message,
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
                  setRecipientRoles({});
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
              : `Send to ${included.length} recipient${included.length === 1 ? "" : "s"}`}
          </Button>
        </section>
      </aside>
    </div>
  );
}
