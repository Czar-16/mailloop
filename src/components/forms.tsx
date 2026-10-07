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
export function Feedback({ result }: { result?: ActionResult }) {
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
export function TemplateForm({
  template,
}: {
  template?: { id: string; name: string; subject: string; body: string };
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && result?.ok === false)
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
  }, [result, pending]);
  return (
    <form
      ref={formRef}
      className="panel space-y-5 p-6"
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const r = await saveTemplate(form);
          setResult(r);
          if (r.ok) {
            setDirty(false);
            if (!template) formRef.current?.reset();
            router.refresh();
          }
        });
      }}
    >
      <h2 className="text-xl font-semibold tracking-tight">
        {template ? "Edit Template" : "New Template"}
      </h2>
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
          id="template-body"
          disabled={pending}
          aria-invalid={!!result?.fieldErrors?.body}
          aria-describedby={
            result?.fieldErrors?.body ? "error-body" : undefined
          }
          name="body"
          defaultValue={template?.body}
          rows={10}
          required
          maxLength={20000}
          autoComplete="off"
          placeholder="Hi {{name}},…"
        />
        <FieldError result={result} name="body" />
        <p className="mt-2 text-xs leading-5 text-body">
          Personalize with <code>{"{{name}}"}</code>,{" "}
          <code>{"{{company}}"}</code>, and <code>{"{{role}}"}</code>. Messages
          are sent as plain text.
        </p>
      </div>
      <Feedback result={result} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Template"}
        </Button>
        {template && (
          <Button asChild variant="outline">
            <Link href="/templates">Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
export function ContactForm({
  contact,
}: {
  contact?: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    notes: string | null;
    tag: string | null;
  };
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && result?.ok === false)
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
  }, [result, pending]);
  return (
    <form
      ref={formRef}
      className="panel space-y-4 p-6"
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const r = await saveContact(form);
          setResult(r);
          if (r.ok) {
            setDirty(false);
            if (!contact) formRef.current?.reset();
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
            name: "name",
            label: "Name",
            placeholder: "Alex Morgan…",
            max: 120,
          },
          {
            name: "email",
            label: "Email",
            placeholder: "alex@company.com…",
            max: 254,
          },
          { name: "company", label: "Company", placeholder: "Acme…", max: 160 },
          { name: "tag", label: "Tag", placeholder: "Engineering…", max: 50 },
        ] as const
      ).map((f) => (
        <div key={f.name}>
          <label
            htmlFor={`contact-${f.name}`}
            className="mb-2 block text-sm font-medium"
          >
            {f.label}
            {!["name", "email"].includes(f.name) && (
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
            defaultValue={contact?.[f.name] ?? ""}
            required={["name", "email"].includes(f.name)}
            maxLength={f.max}
            autoComplete="off"
            spellCheck={f.name !== "email"}
            placeholder={f.placeholder}
          />
          <FieldError result={result} name={f.name} />
        </div>
      ))}
      <div>
        <label
          htmlFor="contact-notes"
          className="mb-2 block text-sm font-medium"
        >
          Notes <span className="font-normal text-body">Optional</span>
        </label>
        <Textarea
          id="contact-notes"
          disabled={pending}
          name="notes"
          defaultValue={contact?.notes ?? ""}
          maxLength={2000}
          autoComplete="off"
        />
      </div>
      <Feedback result={result} />
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
