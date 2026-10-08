"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  parseContacts,
  validateImportRows,
  type ImportRow,
} from "@/lib/imports";
import { importContacts } from "@/lib/actions";
import { Feedback, useUnsavedChanges } from "@/components/forms";
import { RoleChoices } from "@/components/preferences";
import type { ActionResult } from "@/lib/errors";
const PREVIEW_SIZE = 5;
export function ContactImport({
  existingEmails,
  roles,
}: {
  existingEmails: string[];
  roles: string[];
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [role, setRole] = useState("");
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = pending || reading;
  const validCount = rows.filter((r) => r.state === "valid").length;
  const duplicateCount = rows.filter((r) => r.state === "duplicate").length;
  const invalidCount = rows.filter((r) => r.state === "invalid").length;
  const router = useRouter();
  useUnsavedChanges(!!text && !result?.ok);
  function preview(value: string) {
    try {
      if (!value.trim())
        throw new Error(
          "Your file or list is empty. Add contacts and try again.",
        );
      setPreviewPage(1);
      const parsed = parseContacts(value, existingEmails, role);
      if (!parsed.length)
        throw new Error(
          "No contact rows found. Add rows below the email header.",
        );
      setRows(parsed);
      setResult(undefined);
    } catch (e) {
      setRows([]);
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Check your list.",
      });
    }
  }
  async function upload(files: File[]) {
    if (busy || !files.length) return;
    setRows([]);
    setText("");
    setFilename("");
    setResult(undefined);
    const file = files[0];
    if (files.length !== 1 || !/\.csv$/i.test(file.name)) {
      setResult({
        ok: false,
        message:
          "Choose one CSV file (.csv). Download the sample for the correct format.",
      });
      return;
    }
    if (file.size > 1024 * 1024) {
      setResult({ ok: false, message: "Choose a CSV up to 1 MB." });
      return;
    }
    setReading(true);
    try {
      const value = await file.text();
      setFilename(file.name);
      setText(value);
      preview(value);
    } catch {
      setResult({
        ok: false,
        message:
          "Could not read this file. Choose the CSV again or paste your list below.",
      });
    } finally {
      setReading(false);
    }
  }
  function change(
    index: number,
    field: "name" | "email" | "company" | "jobRole",
    value: string,
  ) {
    setRows(
      validateImportRows(
        rows.map((r, i) => ({
          ...r,
          error: undefined,
          ...(i === index ? { [field]: value } : {}),
        })),
        existingEmails,
      ),
    );
    setResult(undefined);
  }
  function bulk(value: string) {
    setRole(value);
    setRows(
      validateImportRows(
        rows.map((r) => ({ ...r, jobRole: value, error: undefined })),
        existingEmails,
      ),
    );
  }
  return (
    <section
      className="panel min-w-0 space-y-6 p-4 sm:p-6"
      aria-labelledby="contact-import-heading"
    >
      <header className="space-y-2">
        <h2 id="contact-import-heading" className="text-xl font-semibold">
          Import contacts with CSV
        </h2>
        <p className="text-sm text-body">
          Bring your shortlist into Mailloop, then review each contact before
          importing.
        </p>
      </header>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-body">
        <li>
          <a
            href="/sample-contacts.csv"
            download
            className="text-link underline underline-offset-4"
          >
            Download sample CSV
          </a>
          .
        </li>
        <li>Fill in the columns with your contacts, keeping the header row.</li>
        <li>Upload your CSV using the area below.</li>
        <li>Review the preview and correct any invalid rows.</li>
        <li>Confirm the import to save your contacts.</li>
      </ol>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">CSV columns</h3>
        <p className="text-sm text-body">
          <code>email</code> is required. <code>name</code>,{" "}
          <code>company</code>, and <code>role</code> are optional columns.{" "}
          <code>jobRole</code> also works as a role header.
        </p>
        <p className="text-sm text-body">
          Missing names may be suggested from email addresses. Review those
          suggestions and fill in any missing names and roles before confirming.
          Use Bulk Job Role to assign a role to all rows.
        </p>
        <div
          className="overflow-x-auto rounded-sm border border-control-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          role="region"
          aria-label="Example CSV columns"
          tabIndex={0}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Example CSV contacts</caption>
            <thead>
              <tr>
                {["email (required)", "name", "company", "role"].map(
                  (column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>alex@example.com</td>
                <td>Alex</td>
                <td>Northstar</td>
                <td>Engineer</td>
              </tr>
              <tr>
                <td>sam@example.com</td>
                <td>Sam</td>
                <td></td>
                <td>Designer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div
        className={`space-y-3 rounded-sm border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-[var(--accent)] bg-accent-soft" : "border-control-border bg-surface"}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (
            !(e.relatedTarget instanceof Node) ||
            !e.currentTarget.contains(e.relatedTarget)
          )
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <p className="text-sm font-medium">Drag and drop your CSV here</p>
        <p id="csv-upload-help" className="text-xs text-body">
          One .csv file, up to 1 MB and 1,000 contact rows.
        </p>
        <input
          ref={fileInput}
          className="hidden"
          aria-label="CSV file"
          aria-describedby="csv-upload-help"
          type="file"
          name="csv"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void upload(files);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          Choose file
        </Button>
        <p className="break-all text-sm text-body" role="status">
          {reading
            ? "Reading CSV…"
            : filename
              ? `Selected file: ${filename}`
              : "Your preview will appear below after upload."}
        </p>
      </div>
      <label className="block text-sm">
        Or paste your list
        <Textarea
          name="list"
          value={text}
          rows={5}
          autoComplete="off"
          spellCheck={false}
          maxLength={1024 * 1024}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setFilename("");
            setRows([]);
            setResult(undefined);
          }}
          placeholder="alex.smith@example.com; sam@example.com…"
        />
      </label>
      <p className="text-xs text-body">
        Paste emails separated by commas, semicolons, or newlines, or paste CSV
        with an email header.
      </p>
      <label className="block text-sm">
        Bulk Job Role
        <Input
          name="bulkRole"
          value={role}
          autoComplete="off"
          maxLength={160}
          disabled={busy}
          onChange={(e) => bulk(e.target.value)}
        />
      </label>
      <RoleChoices roles={roles} onChoose={bulk} disabled={busy} />
      <Button
        variant="outline"
        disabled={busy || !text.trim()}
        onClick={() => preview(text)}
      >
        Preview Import
      </Button>
      {rows.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Review your import</h3>
          <p className="text-sm" aria-live="polite">
            {validCount} valid · {duplicateCount} duplicate · {invalidCount}{" "}
            invalid
          </p>
          <p className="text-sm text-body">
            Duplicates already in your contacts or repeated in this list will be
            skipped.{" "}
            {invalidCount > 0
              ? "Correct all invalid rows before confirming the import."
              : validCount === 0
                ? "There are no new valid contacts to import."
                : "Your valid contacts are ready to import."}
          </p>
          <p className="text-xs text-body">
            Showing rows {(previewPage - 1) * PREVIEW_SIZE + 1}–
            {Math.min(previewPage * PREVIEW_SIZE, rows.length)} of {rows.length}
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Editable import preview</caption>
              <thead>
                <tr>
                  {[
                    "CSV row",
                    "Email",
                    "Name",
                    "Company (optional)",
                    "Job Role",
                    "Result",
                  ].map((v) => (
                    <th key={v} scope="col">
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(
                    (previewPage - 1) * PREVIEW_SIZE,
                    previewPage * PREVIEW_SIZE,
                  )
                  .map((r, i) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      {(["email", "name", "company", "jobRole"] as const).map(
                        (field) => (
                          <td key={field}>
                            <Input
                              className="min-w-40"
                              aria-label={`Row ${r.row} ${field}`}
                              name={field}
                              aria-describedby={
                                r.error ? `import-error-${r.row}` : undefined
                              }
                              value={r[field]}
                              autoComplete="off"
                              disabled={busy}
                              onChange={(e) =>
                                change(
                                  (previewPage - 1) * PREVIEW_SIZE + i,
                                  field,
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        ),
                      )}
                      <td className="min-w-48">
                        <p className="font-medium">
                          {r.state === "valid"
                            ? "Valid"
                            : r.state === "duplicate"
                              ? "Duplicate (skipped)"
                              : "Invalid"}
                        </p>
                        {r.error && (
                          <p
                            className="mt-1 text-body"
                            id={`import-error-${r.row}`}
                          >
                            {r.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW_SIZE && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={busy || previewPage === 1}
                onClick={() => setPreviewPage(previewPage - 1)}
              >
                Previous Rows
              </Button>
              <span className="text-xs">
                Page {previewPage} of {Math.ceil(rows.length / PREVIEW_SIZE)}
              </span>
              <Button
                variant="outline"
                disabled={busy || previewPage * PREVIEW_SIZE >= rows.length}
                onClick={() => setPreviewPage(previewPage + 1)}
              >
                Next Rows
              </Button>
            </div>
          )}
          <Button
            disabled={busy || invalidCount > 0 || validCount === 0}
            onClick={() =>
              start(async () => {
                const r = await importContacts(
                  rows.filter((row) => row.state !== "duplicate"),
                );
                setResult(r);
                if (r.ok) {
                  setText("");
                  setRows([]);
                  setFilename("");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Importing…" : "Confirm import"}
          </Button>
        </>
      )}
      <Feedback result={result} />
    </section>
  );
}
