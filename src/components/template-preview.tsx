"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, AlertTriangle } from "lucide-react";
export type PreviewContact = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobRole: string | null;
};
export type PreviewPart = { text: string; kind: "text" | "filled" | "invalid" };
export function previewParts(
  text: string,
  values: Record<string, string | null>,
  body: boolean,
) {
  const parts: PreviewPart[] = [];
  const errors: string[] = [];
  const tokens = /{{([\s\S]*?)}}|{{[^{}]*|}}/g;
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    if (match.index > cursor)
      parts.push({ text: text.slice(cursor, match.index), kind: "text" });
    const token = match[1]?.trim();
    const valid =
      token !== undefined &&
      Object.hasOwn(values, token) &&
      (body || token !== "link");
    parts.push({
      text: valid ? (values[token!] ?? "") : match[0],
      kind: valid ? "filled" : "invalid",
    });
    if (!valid)
      errors.push(
        token === undefined || token.includes("{{")
          ? "A {{ }} bracket is not closed."
          : token === "link" && !body
            ? "{{link}} is allowed in the message body only."
            : `Unknown placeholder: ${match[0]}.`,
      );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), kind: "text" });
  return { parts, errors };
}
function Highlighted({ parts }: { parts: PreviewPart[] }) {
  return parts.map((part, i) =>
    part.kind === "text" ? (
      <span key={i}>{part.text}</span>
    ) : (
      <mark key={i} className={part.kind === "invalid" ? "invalid" : undefined}>
        {part.text}
      </mark>
    ),
  );
}
export function TemplatePreview({
  contacts,
  linkUrl,
  subject,
  body,
}: {
  contacts: PreviewContact[];
  linkUrl: string | null;
  subject: string;
  body: string;
}) {
  const [recipientId, setRecipientId] = useState(contacts[0]?.id ?? "");
  const recipient =
    contacts.find((contact) => contact.id === recipientId) ?? contacts[0];
  const values = recipient
    ? {
        name: recipient.name,
        company: recipient.company,
        role: recipient.jobRole,
        link: linkUrl,
      }
    : {
        name: "Recipient name",
        company: "Company",
        role: "Job role",
        link: linkUrl,
      };
  const renderedSubject = previewParts(subject, values, false);
  const renderedBody = previewParts(body, values, true);
  const errors = [
    ...new Set([...renderedSubject.errors, ...renderedBody.errors]),
  ];
  const missing = [
    ...new Set(
      [
        ...subject.matchAll(/{{\s*(name|company|role)\s*}}/g),
        ...body.matchAll(/{{\s*(name|company|role|link)\s*}}/g),
      ]
        .filter((match) => !values[match[1] as keyof typeof values])
        .map((match) => match[1]),
    ),
  ];
  return (
    <aside
      className="panel space-y-3 p-5 min-[861px]:sticky min-[861px]:top-3"
      aria-label="Live email preview"
    >
      <div className="flex items-center justify-between">
        <h2 className="section-label">Live preview</h2>
        <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-success">
          <span
            className="live-dot size-2 rounded-full bg-current"
            aria-hidden="true"
          />
          LIVE
        </span>
      </div>
      <label
        className="block text-sm font-medium"
        htmlFor="template-preview-as"
      >
        Preview as
      </label>
      <select
        id="template-preview-as"
        className="w-full"
        value={recipient?.id ?? ""}
        disabled={!contacts.length}
        onChange={(event) => setRecipientId(event.target.value)}
      >
        {contacts.length ? (
          contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {[contact.name, contact.company, contact.jobRole]
                .filter(Boolean)
                .join(" · ")}
            </option>
          ))
        ) : (
          <option value="">Sample recipient — no saved contacts</option>
        )}
      </select>
      {!contacts.length && (
        <p className="text-xs text-body">
          Sample values shown.{" "}
          <Link className="text-link" href="/contacts">
            Add a contact
          </Link>{" "}
          to preview a real recipient.
        </p>
      )}
      <div className="mail-preview">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs text-body">
            To: {recipient?.email ?? "Sample recipient"}
          </p>
          <p className="mt-1 font-semibold">
            <Highlighted parts={renderedSubject.parts} />
          </p>
        </div>
        <div className="min-h-[180px] whitespace-pre-wrap p-4">
          <Highlighted parts={renderedBody.parts} />
        </div>
      </div>
      <p
        role="status"
        className={`flex items-start gap-1.5 text-xs ${errors.length ? "text-error-deep" : missing.length ? "text-warning" : "text-success"}`}
      >
        {errors.length || missing.length ? (
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Check className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span>
          {errors.length
            ? errors.join(" ")
            : missing.length
              ? `Missing values: ${missing.join(", ")}. These placeholders resolve to empty text.`
              : "Looks good. Highlighted text is filled in per recipient."}
        </span>
      </p>
    </aside>
  );
}
