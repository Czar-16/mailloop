"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveTemplate,
  archiveTemplate,
  saveContact,
  archiveContact,
} from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import Link from "next/link";
import { suggestName } from "@/lib/imports";
import {
  TemplatePreview,
  type PreviewContact,
} from "@/components/template-preview";
import { RoleChoices } from "@/components/preferences";

import {
  SuccessConfirmation,
  useSuccessNotification,
} from "@/components/notifications";

export function useUnsavedChanges(dirty: boolean, preserveQuery = false) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const link = (e.target as Element).closest("a");
      if (link?.target === "_blank" || link?.hasAttribute("download")) return;
      if (
        link &&
        preserveQuery &&
        new URL(link.href).pathname === window.location.pathname
      )
        return;
      if (
        link &&
        link.href !== window.location.href &&
        !window.confirm("Leave this page and discard your unsaved changes?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, preserveQuery]);
}
export function Feedback({
  result,
  successConfirmation = false,
}: {
  result?: ActionResult;
  successConfirmation?: boolean;
}) {
  if (successConfirmation && result?.ok)
    return <SuccessConfirmation>{result.message}</SuccessConfirmation>;
  return (
    <p
      aria-live="polite"
      role={result?.ok === false ? "alert" : undefined}
      className={`min-h-5 text-sm ${result?.ok === false ? "text-error-deep" : "text-body"}`}
    >
      {result?.message}
    </p>
  );
}
function FieldError({ result, name }: { result?: ActionResult; name: string }) {
  return result?.fieldErrors?.[name] ? (
    <p id={`error-${name}`} className="mt-2 text-xs text-error-deep">
      {result.fieldErrors[name]}
    </p>
  ) : null;
}
export function DeleteButton({
  id,
  kind,
}: {
  id: string;
  kind: "template" | "contact";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" onClick={() => dialog.current?.showModal()}>
        Delete
      </Button>
      <dialog ref={dialog} aria-labelledby={`delete-${id}`}>
        <h2 id={`delete-${id}`} className="text-xl font-semibold">
          Delete this {kind}?
        </h2>
        <p className="mt-3 text-sm leading-6 text-body">
          It will be removed from your list. Previously queued emails and
          history are preserved.
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
                const r = await (
                  kind === "template" ? archiveTemplate : archiveContact
                )(id);
                setResult(r);
                if (r.ok) {
                  dialog.current?.close();
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
        <Feedback result={result} />
      </dialog>
    </>
  );
}
const example = {
  subject: "Exploring {{role}} opportunities at {{company}}",
  body: "Hi {{name}},\n\nI’m interested in {{role}} opportunities at {{company}}.\nI’d love to discuss how my experience could help your team.\n\nPortfolio: https://example.com/your-portfolio\nGitHub: https://github.com/your-username\nLinkedIn: https://www.linkedin.com/in/your-username\n\nI’ve attached my resume PDF for your review.\n\nThank you for your time.\nYour name",
};
export function TemplateForm({
  template,
  contacts = [],
}: {
  contacts?: PreviewContact[];
  template?: { id: string; name: string; subject: string; body: string };
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const router = useRouter();
  const notifySuccess = useSuccessNotification();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState({
    subject: template?.subject ?? "",
    body: template?.body ?? "",
  });
  const messageSelection = useRef({ start: 0, end: 0 });
  function syncDraft() {
    const form = formRef.current;
    if (form)
      setDraft({
        subject: (form.elements.namedItem("subject") as HTMLInputElement).value,
        body: (form.elements.namedItem("body") as HTMLTextAreaElement).value,
      });
  }
  useEffect(() => {
    if (!pending && result?.ok === false)
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
  }, [result, pending]);
  return (
    <div className="template-grid">
      <form
        ref={formRef}
        className="panel space-y-4 p-5"
        onChange={() => {
          setDirty(true);
          setResult((current) => (current?.ok ? undefined : current));
          syncDraft();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setResult(undefined);
          start(async () => {
            const r = await saveTemplate(form);
            setResult(r);
            if (r.ok) {
              notifySuccess("Template saved successfully.");
              setDirty(false);
              if (!template) {
                formRef.current?.reset();
                syncDraft();
              }
              router.refresh();
            }
          });
        }}
      >
        <h2 className="section-label">
          {template ? "Edit Template" : "New Template"}
        </h2>
        <p className="text-sm leading-6 text-body">
          {"{{name}}"} uses the contact’s name; {"{{company}}"} uses their
          company (or empty text if missing); {"{{role}}"} uses their job role,
          which you can override in Compose. Type a placeholder in the subject
          or message, or click a button below to insert it at the message
          cursor.
        </p>
        <div className="flex flex-wrap gap-2">
          {["name", "company", "role"].map((token) => (
            <Button
              key={token}
              type="button"
              variant="outline"
              className="chip placeholder-chip"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const field =
                  formRef.current?.querySelector<HTMLTextAreaElement>(
                    "[name=body]",
                  );
                if (field) {
                  field.setRangeText(
                    `{{${token}}}`,
                    messageSelection.current.start,
                    messageSelection.current.end,
                    "end",
                  );
                  field.focus();
                  messageSelection.current = {
                    start: field.selectionStart,
                    end: field.selectionEnd,
                  };
                  setDirty(true);
                  setResult((current) => (current?.ok ? undefined : current));
                  syncDraft();
                }
              }}
            >
              {`{{${token}}}`}
            </Button>
          ))}
        </div>
        {template && <input type="hidden" name="id" value={template.id} />}
        <div>
          <label
            htmlFor="template-name"
            className="mb-2 block text-sm font-medium"
          >
            Template name
          </label>
          <Input
            id="template-name"
            disabled={pending}
            aria-invalid={!!result?.fieldErrors?.name}
            aria-describedby={
              result?.fieldErrors?.name ? "error-name" : undefined
            }
            name="name"
            defaultValue={template?.name}
            required
            maxLength={100}
            autoComplete="off"
            placeholder="A first introduction…"
          />
          <FieldError result={result} name="name" />
        </div>
        <div>
          <label
            htmlFor="template-subject"
            className="mb-2 block text-sm font-medium"
          >
            Subject
          </label>
          <Input
            id="template-subject"
            disabled={pending}
            aria-invalid={!!result?.fieldErrors?.subject}
            aria-describedby={
              result?.fieldErrors?.subject ? "error-subject" : undefined
            }
            name="subject"
            defaultValue={template?.subject}
            required
            maxLength={250}
            autoComplete="off"
            placeholder="Exploring {{role}} opportunities at {{company}}…"
          />
          <FieldError result={result} name="subject" />
        </div>
        <div>
          <label
            htmlFor="template-body"
            className="mb-2 block text-sm font-medium"
          >
            Message
          </label>
          <Textarea
            onSelect={(e) => {
              messageSelection.current = {
                start: e.currentTarget.selectionStart,
                end: e.currentTarget.selectionEnd,
              };
            }}
            id="template-body"
            disabled={pending}
            aria-invalid={!!result?.fieldErrors?.body}
            aria-describedby={
              result?.fieldErrors?.body ? "error-body" : undefined
            }
            name="body"
            defaultValue={template?.body}
            rows={20}
            className="text-[13px]"
            required
            maxLength={20000}
            autoComplete="off"
            placeholder="Hi {{name}},…"
          />
          <FieldError result={result} name="body" />
          <p className="mt-2 text-xs leading-5 text-body">
            Personalize with <code>{"{{name}}"}</code>,{" "}
            <code>{"{{company}}"}</code>, and <code>{"{{role}}"}</code>. Paste
            your portfolio, GitHub, LinkedIn, or other links directly into the
            message. You can include multiple links. Use full URLs because
            emails are sent as plain text.
          </p>
        </div>
        <p className="text-xs leading-5 text-body">
          Upload a resume PDF in Settings, then select “Attach Resume” in
          Compose. Mentioning a PDF in the message does not attach it.
        </p>
        <p className="text-xs leading-5 text-body">
          When using the example, replace the sample links and signature, and
          either attach your resume in Compose or remove the attachment
          sentence.
        </p>
        <Feedback result={result} successConfirmation />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save Template"}
          </Button>
          {!template && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "Replace your current subject and message with the example?",
                  )
                )
                  return;
                for (const key of ["subject", "body"] as const) {
                  const field =
                    formRef.current?.querySelector<HTMLInputElement>(
                      `[name=${key}]`,
                    );
                  if (field) field.value = example[key];
                }
                setDirty(true);
                setResult((current) => (current?.ok ? undefined : current));
                syncDraft();
              }}
            >
              Use Example
            </Button>
          )}
          {template && (
            <Button asChild variant="outline">
              <Link href="/templates">Cancel</Link>
            </Button>
          )}
        </div>
      </form>
      <TemplatePreview
        contacts={contacts}
        subject={draft.subject}
        body={draft.body}
      />
    </div>
  );
}
export function ContactForm({
  contact,
  roles = [],
}: {
  roles?: string[];
  contact?: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    jobRole: string | null;
  };
}) {
  const manualName = useRef(!!contact?.name);
  const [name, setName] = useState(contact?.name ?? "");
  const [jobRole, setJobRole] = useState(contact?.jobRole ?? "");
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const router = useRouter();
  const notifySuccess = useSuccessNotification();
  const formRef = useRef<HTMLFormElement>(null);
  const focusSubmissionErrors = useRef(false);
  useEffect(() => {
    if (!pending && result?.ok === false && focusSubmissionErrors.current) {
      focusSubmissionErrors.current = false;
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
    }
  }, [result, pending]);
  function clearFieldError(field: string) {
    setResult((current) => {
      if (!current) return current;
      const fieldErrors = { ...current.fieldErrors };
      delete fieldErrors[field];
      return { ok: false, message: "", fieldErrors };
    });
  }
  return (
    <form
      ref={formRef}
      className="panel space-y-4 p-6"
      onChange={() => {
        setDirty(true);
        setResult((current) => (current?.ok ? undefined : current));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setResult(undefined);
        start(async () => {
          const r = await saveContact(form);
          focusSubmissionErrors.current = !r.ok;
          setResult(r);
          if (r.ok) {
            notifySuccess("Contact saved successfully.");
            setDirty(false);
            if (!contact) {
              formRef.current?.reset();
              setName("");
              setJobRole("");
              manualName.current = false;
            }
            router.refresh();
          }
        });
      }}
    >
      <h2 className="text-xl font-semibold">
        {contact ? "Edit Contact" : "New Contact"}
      </h2>
      {contact && <input type="hidden" name="id" value={contact.id} />}
      {(
        [
          {
            name: "email",
            label: "Email",
            placeholder: "alex@company.com…",
            max: 254,
          },
          {
            name: "name",
            label: "Name",
            placeholder: "Alex Morgan…",
            max: 120,
          },
          { name: "company", label: "Company", placeholder: "Acme…", max: 160 },
          {
            name: "jobRole",
            label: "Job Role",
            placeholder: "Software Engineer Intern…",
            max: 160,
          },
        ] as const
      ).map((f) => (
        <div key={f.name}>
          <label
            htmlFor={`contact-${f.name}`}
            className="mb-2 block text-sm font-medium"
          >
            {f.label}
            {f.name === "company" && (
              <span className="ml-2 font-normal text-body">Optional</span>
            )}
          </label>
          <Input
            id={`contact-${f.name}`}
            disabled={pending}
            aria-invalid={!!result?.fieldErrors?.[f.name]}
            aria-describedby={
              result?.fieldErrors?.[f.name] ? `error-${f.name}` : undefined
            }
            name={f.name}
            type={f.name === "email" ? "email" : "text"}
            defaultValue={
              f.name === "email" || f.name === "company"
                ? (contact?.[f.name] ?? "")
                : undefined
            }
            value={
              f.name === "name"
                ? name
                : f.name === "jobRole"
                  ? jobRole
                  : undefined
            }
            onChange={(e) => {
              clearFieldError(f.name);
              if (f.name === "name") {
                manualName.current = !!e.target.value.trim();
                setName(
                  e.target.value ||
                    suggestName(
                      formRef.current?.querySelector<HTMLInputElement>(
                        '[name="email"]',
                      )?.value ?? "",
                    ),
                );
              }
              if (f.name === "email" && !manualName.current) {
                setName(suggestName(e.target.value));
                clearFieldError("name");
              }
              if (f.name === "jobRole") setJobRole(e.target.value);
            }}
            required={f.name !== "company"}
            maxLength={f.max}
            autoComplete="off"
            spellCheck={f.name !== "email"}
            placeholder={f.placeholder}
          />
          <FieldError result={result} name={f.name} />
        </div>
      ))}
      <p className="text-xs text-body">
        Names from email addresses are suggestions. Correct them before saving.
        Enter actual names, companies, and roles here.
      </p>
      <RoleChoices
        roles={roles}
        disabled={pending}
        onChoose={(r) => {
          setJobRole(r);
          setDirty(true);
          clearFieldError("jobRole");
        }}
      />
      <Feedback result={result} successConfirmation />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Contact"}
        </Button>
        {contact && (
          <Button asChild variant="outline">
            <Link href="/contacts">Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
