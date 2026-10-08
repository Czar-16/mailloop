"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Paperclip, ArrowRight, Eye, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
const steps = [
  {
    id: "message",
    name: "Message",
    description: "Choose template & customize",
  },
  {
    id: "recipients",
    name: "Recipients",
    description: "Select people to email",
  },
  { id: "preview", name: "Preview", description: "See individual emails" },
  { id: "send", name: "Send", description: "Start your campaign" },
] as const;

export function Compose({
  templates,
  contacts,
  used,
  resume,
  connected,
  roles,
  resumeUrl,
  search,
  pagination,
}: {
  templates: { id: string; name: string; subject: string; body: string }[];
  contacts: ComposeContact[];
  used: number;
  resume: string | null;
  connected: boolean;
  roles: string[];
  resumeUrl: string | null;
  search: ReactNode;
  pagination: ReactNode;
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
  const desktopFeedback = useRef<HTMLDivElement>(null);
  const mobileFeedback = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] =
    useState<(typeof steps)[number]["id"]>("message");
  useEffect(() => {
    if (pending || result?.ok !== false) return;
    if (result.fieldErrors?.role) roleInput.current?.focus();
    else {
      const feedback = matchMedia("(min-width: 1280px)").matches
        ? desktopFeedback.current
        : mobileFeedback.current;
      feedback?.focus();
    }
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
  const visibleContacts = contacts.filter(
    (c) => !roleFilter || getRole(c) === roleFilter,
  );
  function sendCampaign() {
    setActiveStep("send");
    if (!template || !included.length) {
      setResult({
        ok: false,
        message: "Choose a template and at least one eligible recipient.",
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
        message: "Save a resume URL in Settings before using this template.",
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
  }
  const sendAction = (
    <Button
      className="w-full sm:w-auto"
      disabled={pending || !connected}
      aria-describedby="compose-send-count"
      onClick={sendCampaign}
    >
      <Send aria-hidden="true" />
      {pending ? "Queuing…" : "Send Campaign"}
    </Button>
  );
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-[34px] sm:text-[32px] sm:leading-10">
            Compose Campaign
          </h1>
          <p className="mt-2 text-sm leading-[22px] text-body">
            Send personalized emails to multiple people with one click.
          </p>
        </div>
        <div className="shrink-0 sm:max-w-xs sm:text-right">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="outline"
              disabled
              aria-describedby="compose-draft-note"
            >
              Save Draft
            </Button>
            <div className="hidden xl:block">{sendAction}</div>
            <Button asChild variant="outline" className="xl:hidden">
              <a href="#compose-send" onClick={() => setActiveStep("send")}>
                Review &amp; Send <ArrowRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p
            id="compose-draft-note"
            className="mt-2 text-sm leading-[22px] text-muted-foreground"
          >
            Draft saving is not available yet.
          </p>
          <div
            ref={desktopFeedback}
            tabIndex={-1}
            className="mt-2 hidden rounded-sm xl:block [&_p:empty]:hidden"
          >
            <Feedback result={result} />
          </div>
          {!connected && (
            <p className="mt-2 text-sm text-warning">
              Reconnect Gmail in{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              before sending.
            </p>
          )}
        </div>
      </div>
      <nav aria-label="Campaign workflow" className="mb-8">
        <ol className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:gap-x-6">
          {steps.map((step, index) => (
            <li key={step.id} className="relative min-w-0">
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-12 right-0 top-[18px] hidden h-px bg-control-border sm:block"
                >
                  {activeStep === step.id && (
                    <span className="absolute inset-y-0 left-0 w-12 bg-primary" />
                  )}
                </span>
              )}
              <a
                href={`#compose-${step.id}`}
                aria-current={activeStep === step.id ? "step" : undefined}
                onClick={() => setActiveStep(step.id)}
                className="relative flex min-h-11 flex-col items-start gap-2 rounded-sm"
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border text-base font-semibold tabular-nums",
                    activeStep === step.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-control-border bg-card text-body",
                  )}
                >
                  {index + 1}
                </span>
                <span className="text-base font-semibold leading-6">
                  {step.name}
                </span>
                <span className="text-sm leading-[22px] text-body">
                  {step.description}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2 xl:grid-rows-[min-content_min-content_1fr]">
        <section
          id="compose-message"
          aria-labelledby="compose-message-title"
          className="panel min-w-0 scroll-mt-6 space-y-5 p-4 sm:p-6 xl:col-start-1 xl:row-span-3"
        >
          <h2
            id="compose-message-title"
            className="flex min-h-11 items-center text-lg font-semibold leading-[26px]"
          >
            1. Message
          </h2>
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
              className="w-full"
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
            <div className="flex flex-wrap items-center gap-x-4">
              <Link
                href="/templates"
                className="inline-flex min-h-11 items-center gap-1 text-sm text-link"
              >
                Manage Templates{" "}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              {template && (
                <Link
                  href={`/templates?edit=${template.id}`}
                  className="inline-flex min-h-11 items-center text-sm text-link"
                >
                  Edit Template
                </Link>
              )}
            </div>
            {!templates.length && (
              <p className="mt-2 text-sm leading-[22px] text-body">
                Create a template in Templates to start your campaign.
              </p>
            )}
          </div>
          <div className="space-y-4 border-t border-border pt-5">
            <h3 className="text-base font-semibold leading-6">
              Customize your message
            </h3>
            <p className="text-sm leading-[22px] text-body">
              Subject and email body come from your saved template. Edit them in
              Templates; personalize recipient values below.
            </p>
            <div>
              <label
                htmlFor="compose-subject"
                className="mb-2 block text-sm font-medium"
              >
                Subject{" "}
                <span className="font-normal text-muted-foreground">
                  · Template text
                </span>
              </label>
              <Input
                id="compose-subject"
                name="templateSubject"
                readOnly
                value={template?.subject ?? ""}
                placeholder="Choose a template to see its subject…"
              />
            </div>
            <div>
              <label
                htmlFor="compose-body"
                className="mb-2 block text-sm font-medium"
              >
                Email body{" "}
                <span className="font-normal text-muted-foreground">
                  · Template text
                </span>
              </label>
              <Textarea
                id="compose-body"
                name="templateBody"
                readOnly
                value={template?.body ?? ""}
                rows={6}
                placeholder="Choose a template to see its message…"
              />
            </div>
            <div
              className="flex flex-wrap gap-2"
              aria-label="Supported personalization variables"
            >
              {["name", "company", "role", "resume_link"].map((token) => (
                <code
                  key={token}
                  className="rounded-sm border border-border bg-input px-2 py-1.5 text-xs leading-[18px] text-body"
                >{`{{${token}}}`}</code>
              ))}
            </div>
            <p className="text-sm leading-[22px] text-body">
              Variables use each recipient’s details. The resume link is
              included only where the template requests it, in the email body.
            </p>
          </div>
          <div className="space-y-3 border-t border-border pt-5">
            <label htmlFor="compose-role" className="block text-sm font-medium">
              Role to Apply to Selected
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="compose-role"
                ref={roleInput}
                disabled={pending}
                aria-invalid={!!result?.fieldErrors?.role}
                aria-describedby={
                  result?.fieldErrors?.role
                    ? "compose-role-error"
                    : "compose-role-help"
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
              <Button
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
            {result?.fieldErrors?.role && (
              <p id="compose-role-error" className="text-sm text-error-deep">
                {result.fieldErrors.role}
              </p>
            )}
            <p
              id="compose-role-help"
              className="text-sm leading-[22px] text-body"
            >
              Enter an actual role, not a placeholder. Apply it to your selected
              recipients for this batch; saved contacts keep their own roles.
            </p>
            <RoleChoices
              roles={roles}
              disabled={pending}
              onChoose={(r) => setRole(r)}
            />
          </div>
          <div className="space-y-3 border-t border-border pt-5">
            <div className="flex items-start gap-3">
              <Paperclip
                className="mt-1 size-5 shrink-0 text-body"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">
                  {resume ?? "No resume PDF uploaded"}
                </p>
                <Link
                  href="/settings"
                  className="inline-flex min-h-11 items-center text-sm text-link"
                >
                  Manage Resume
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
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
              <Button asChild variant="outline">
                <a
                  href="#compose-preview"
                  onClick={() => setActiveStep("preview")}
                >
                  <Eye aria-hidden="true" />
                  Preview Email
                </a>
              </Button>
            </div>
            <p className="break-words text-sm leading-[22px] text-body">
              PDF: {attachResume ? resume : "None"}. Resume link:{" "}
              {/\{\{\s*resume_link\s*\}\}/.test(template?.body ?? "")
                ? resumeUrl || "Missing — save URL in Settings"
                : "Not included by this template"}
              .
            </p>
          </div>
        </section>
        <section
          id="compose-recipients"
          aria-labelledby="compose-recipients-title"
          className="panel min-w-0 scroll-mt-6 space-y-4 p-4 sm:p-6 xl:col-start-2 xl:row-start-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="compose-recipients-title"
              className="text-lg font-semibold leading-[26px]"
            >
              2. Recipients
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/contacts">
                <Upload aria-hidden="true" />
                Import Contacts
              </Link>
            </Button>
          </div>
          <p className="text-sm leading-[22px] text-body">
            Import CSV or pasted lists in Contacts. Previously contacted people
            are skipped unless you allow a resend.
          </p>
          {search}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block min-w-0 text-sm">
              Filter by Job Role
              <select
                aria-label="Filter by Job Role"
                name="roleFilter"
                className="mt-2 block w-full"
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
            <p
              aria-live="polite"
              className="py-3 text-sm tabular-nums text-body"
            >
              {selected.length} / 15 selected
            </p>
          </div>
          <div
            role="region"
            aria-label="Available recipients"
            tabIndex={0}
            className="max-h-80 overflow-y-auto rounded-sm"
          >
            {!visibleContacts.length && (
              <p className="py-6 text-sm leading-[22px] text-body">
                No matching contacts.{" "}
                <Link href="/contacts" className="text-link">
                  Add contacts
                </Link>{" "}
                or change your search or role filter.
              </p>
            )}
            {visibleContacts.map((c) => {
              const checked = selected.some((s) => s.id === c.id);
              return (
                <div
                  key={c.id}
                  className={cn(
                    "border-b border-border px-2 py-3 last:border-0",
                    checked ? "rounded-sm bg-muted" : "hover:bg-muted",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={cn(
                        "flex min-h-11 min-w-0 flex-1 basis-48 items-center gap-3",
                        !c.blocked && "cursor-pointer",
                      )}
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
                        <span className="block break-words text-base font-medium leading-6">
                          {c.name}{" "}
                          <span className="font-normal text-body">
                            {c.company && `· ${c.company}`}
                          </span>
                        </span>
                        <span className="block break-all text-sm text-body">
                          {c.email}
                        </span>
                      </span>
                    </label>
                    <span
                      className={cn(
                        "ml-8 inline-flex max-w-full rounded-full border px-2 py-1 text-xs font-medium leading-[18px] sm:ml-0",
                        c.blocked
                          ? "border-warning/25 bg-warning-soft text-warning"
                          : "border-border bg-card text-body",
                      )}
                    >
                      {c.blocked
                        ? "Queued or awaiting confirmation"
                        : c.previouslySent
                          ? "Previously contacted"
                          : "No confirmed send"}
                    </span>
                  </div>
                  <p className="ml-8 mt-1 break-words text-xs text-body">
                    {getRole(c) || "Choose a job role before sending"}
                  </p>
                  {c.lastSent && (
                    <p className="ml-8 mt-1 text-xs text-body">
                      Last Sent: <DateTime value={c.lastSent} />
                    </p>
                  )}
                  {c.blocked && (
                    <p className="ml-8 mt-2 text-sm leading-[22px] text-warning">
                      Already queued or awaiting delivery confirmation
                    </p>
                  )}
                  {c.previouslySent && !c.blocked && (
                    <p className="ml-8 mt-2 text-sm leading-[22px] text-body">
                      Skipped by default. Select this person and allow an
                      intentional resend below.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {pagination}
          {selected.length > 0 && (
            <div className="space-y-4 border-t border-border pt-5">
              <h3 className="text-sm font-semibold">
                Recipient Roles for This Batch
              </h3>
              {selected.some((c) => !contacts.some((v) => v.id === c.id)) && (
                <p className="text-sm leading-[22px] text-body">
                  Your selection includes contacts from other search results.
                </p>
              )}
              {selected.map((c) => (
                <div key={c.id} className="min-w-0">
                  <label
                    htmlFor={`recipient-role-${c.id}`}
                    className="mb-2 block min-w-0 break-words text-sm"
                  >
                    Job Role for {c.name}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`recipient-role-${c.id}`}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`Remove ${c.name} from campaign`}
                      onClick={() => toggle(c)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {selected.some((c) => c.previouslySent) && (
            <div className="space-y-3 border-t border-border pt-5">
              <h3 className="text-sm font-semibold">
                Allow intentional follow-ups
              </h3>
              <p className="text-sm leading-[22px] text-body">
                Only check people you intend to email again.
              </p>
              {selected
                .filter((c) => c.previouslySent)
                .map((c) => (
                  <label
                    key={c.id}
                    className="flex min-h-11 items-center gap-3 break-words text-sm"
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
            </div>
          )}
        </section>
        <section
          id="compose-preview"
          aria-labelledby="compose-preview-title"
          className="panel min-w-0 scroll-mt-6 overflow-hidden xl:col-start-2 xl:row-start-2"
        >
          <div className="space-y-4 border-b border-border p-4 sm:p-6">
            <h2
              id="compose-preview-title"
              className="text-lg font-semibold leading-[26px]"
            >
              3. Personal Preview
            </h2>
            <div className="space-y-2">
              <label
                htmlFor="preview-recipient"
                className="block text-sm font-medium"
              >
                Preview recipient
              </label>
              <select
                id="preview-recipient"
                className="w-full"
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
          </div>
          {template && preview ? (
            <div className="space-y-4 p-4 text-base leading-[26px] sm:p-6">
              <p className="break-all text-sm text-body">To: {preview.email}</p>
              <h3 className="break-words border-b border-border pb-4 font-medium">
                {renderTemplate(template.subject, {
                  name: preview.name,
                  company: preview.company,
                  role: getRole(preview),
                  resume_link: resumeUrl,
                })}
              </h3>
              <div
                role="region"
                aria-label="Full personalized email"
                tabIndex={0}
                className="max-h-96 overflow-y-auto rounded-sm"
              >
                <p className="min-h-24 whitespace-pre-wrap break-words">
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
              </div>
              {preview.previouslySent && !resendIds.includes(preview.id) && (
                <p className="text-sm text-warning">
                  This recipient will be skipped unless you allow a resend.
                </p>
              )}
            </div>
          ) : (
            <p className="p-4 text-sm leading-[22px] text-body sm:p-6">
              Choose a template and select a recipient to see their individual
              email.
            </p>
          )}
          <div className="border-t border-border px-4 py-4 sm:px-6">
            <p className="flex items-start gap-2 break-all text-sm text-body">
              <Paperclip
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {attachResume ? resume : "No PDF attachment"}
            </p>
          </div>
        </section>
        <section
          id="compose-send"
          aria-labelledby="compose-send-title"
          className="panel min-w-0 scroll-mt-6 space-y-3 p-4 sm:p-6 xl:col-start-2 xl:row-start-3"
        >
          <h2
            id="compose-send-title"
            className="text-lg font-semibold leading-[26px]"
          >
            4. Campaign Limits
          </h2>
          <div
            id="compose-send-count"
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-body">Individual emails</span>
            <span className="text-2xl font-semibold leading-8 tabular-nums">
              {included.length}
            </span>
          </div>
          {selected.length > included.length && (
            <p className="text-sm text-body">
              {selected.length} selected · {selected.length - included.length}{" "}
              skipped
            </p>
          )}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-body">Last 24 hours + queued</span>
            <span className="font-semibold tabular-nums">{used} / 500</span>
          </div>
          <progress
            aria-label="Email usage in rolling 24 hours"
            aria-valuetext={`${used} of 500 emails used or reserved`}
            value={Math.min(500, Math.max(0, used))}
            max={500}
            className={cn(
              "h-2 w-full appearance-none overflow-hidden rounded-full border border-control-border bg-muted [&::-webkit-progress-bar]:bg-muted",
              used >= 450
                ? "[&::-webkit-progress-value]:bg-warning [&::-moz-progress-bar]:bg-warning"
                : "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
            )}
          />
          <p className="text-sm leading-[22px] text-body">
            Used or reserved in a rolling 24 hours, including queued and
            unconfirmed deliveries.
          </p>
          {used >= 450 && (
            <p className="text-sm text-warning">
              {used >= 500
                ? "Sending limit reached. Wait for capacity before queuing another campaign."
                : "Approaching your sending limit. Review available capacity before sending."}
            </p>
          )}
          <p className="text-sm leading-[22px] text-body">
            Each recipient gets a separate email from your Gmail. Sends are
            spaced 20–60 seconds apart. Retries and service delays may extend
            timing.
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
          <div className="space-y-3 xl:hidden">
            <div ref={mobileFeedback} tabIndex={-1} className="rounded-sm">
              <Feedback result={result} />
            </div>
            {sendAction}
          </div>
        </section>
      </div>
    </>
  );
}
