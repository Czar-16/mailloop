"use client";
import { useState, useTransition } from "react";
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
  const router = useRouter();
  useUnsavedChanges(!!text && !result?.ok);
  function preview(value: string) {
    try {
      setPreviewPage(1);
      setRows(parseContacts(value, existingEmails, role));
      setResult(undefined);
    } catch (e) {
      setRows([]);
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Check your list.",
      });
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
    <section className="panel min-w-0 space-y-4 p-6">
      <h2 className="text-xl font-semibold">Import Contacts</h2>
      <p className="text-sm text-body">
        Paste emails separated by commas, semicolons, or newlines, or CSV with
        an email header. Name, company, and jobRole columns are optional. Review
        suggested names and choose roles before saving. Up to 1,000 rows.
      </p>
      <label className="block text-sm">
        CSV file
        <Input
          type="file"
          name="csv"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1024 * 1024) {
              setResult({ ok: false, message: "Choose a CSV up to 1 MB." });
              return;
            }
            const value = await file.text();
            setText(value);
            preview(value);
          }}
        />
      </label>
      <label className="block text-sm">
        Or paste your list
        <Textarea
          name="list"
          value={text}
          rows={5}
          autoComplete="off"
          spellCheck={false}
          maxLength={1024 * 1024}
          disabled={pending}
          onChange={(e) => {
            setText(e.target.value);
            setRows([]);
            setResult(undefined);
          }}
          placeholder="alex.smith@example.com; sam@example.com…"
        />
      </label>
      <label className="block text-sm">
        Bulk Job Role
        <Input
          name="bulkRole"
          value={role}
          autoComplete="off"
          maxLength={160}
          disabled={pending}
          onChange={(e) => bulk(e.target.value)}
        />
      </label>
      <RoleChoices roles={roles} onChoose={bulk} disabled={pending} />
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => preview(text)}
      >
        Preview Import
      </Button>
      {rows.length > 0 && (
        <>
          <p className="text-sm" aria-live="polite">
            {rows.filter((r) => r.state === "valid").length} ready ·{" "}
            {rows.filter((r) => r.state === "duplicate").length} duplicates ·{" "}
            {rows.filter((r) => r.state === "invalid").length} need correction
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Editable import preview</caption>
              <thead>
                <tr>
                  {[
                    "Email",
                    "Name",
                    "Company (optional)",
                    "Job Role",
                    "Result",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice((previewPage - 1) * 50, previewPage * 50)
                  .map((r, i) => (
                    <tr key={r.row}>
                      {(["email", "name", "company", "jobRole"] as const).map(
                        (field) => (
                          <td key={field}>
                            <Input
                              className="min-w-40"
                              aria-label={`Row ${r.row} ${field}`}
                              name={field}
                              value={r[field]}
                              autoComplete="off"
                              disabled={pending}
                              onChange={(e) =>
                                change(
                                  (previewPage - 1) * 50 + i,
                                  field,
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        ),
                      )}
                      <td>{r.error ?? r.state}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={pending || previewPage === 1}
                onClick={() => setPreviewPage(previewPage - 1)}
              >
                Previous Rows
              </Button>
              <span className="text-xs">
                Page {previewPage} of {Math.ceil(rows.length / 50)}
              </span>
              <Button
                variant="outline"
                disabled={pending || previewPage * 50 >= rows.length}
                onClick={() => setPreviewPage(previewPage + 1)}
              >
                Next Rows
              </Button>
            </div>
          )}
          <Button
            disabled={
              pending ||
              rows.some((r) => r.state === "invalid") ||
              !rows.some((r) => r.state === "valid")
            }
            onClick={() =>
              start(async () => {
                const r = await importContacts(
                  rows.filter((row) => row.state !== "duplicate"),
                );
                setResult(r);
                if (r.ok) {
                  setText("");
                  setRows([]);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Importing…" : "Import Valid Contacts"}
          </Button>
        </>
      )}
      <Feedback result={result} />
    </section>
  );
}
