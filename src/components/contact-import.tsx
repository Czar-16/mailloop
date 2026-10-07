"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseContacts, type ImportRow } from "@/lib/imports";
import { importContacts } from "@/lib/actions";
import { Feedback, useUnsavedChanges } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";
export function ContactImport({ existingEmails }: { existingEmails: string[] }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const router = useRouter();
  useUnsavedChanges(!!text && !result?.ok);
  function preview(value: string) {
    try { setRows(parseContacts(value, existingEmails)); setResult(undefined); }
    catch (e) { setRows([]); setResult({ ok: false, message: e instanceof Error ? e.message : "Check your CSV." }); }
  }
  return <section className="panel space-y-4 p-6"><div className="flex items-center gap-2"><Upload className="size-4" aria-hidden="true" /><h2 className="text-xl font-semibold">Import Contacts</h2></div><p className="text-sm leading-6 text-body">Paste CSV or tab-separated rows, or choose a CSV file. Include name, email, and company headers. Up to 1,000 rows per import.</p><div><label htmlFor="csv-file" className="mb-2 block text-sm font-medium">CSV file</label><Input id="csv-file" name="csv" type="file" accept=".csv,text/csv" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) { setResult({ ok: false, message: "Choose a CSV up to 1 MB." }); return; } const value = await file.text(); setText(value); preview(value); }} /></div><div><label htmlFor="csv-text" className="mb-2 block text-sm font-medium">Or paste your list</label><Textarea id="csv-text" name="list" rows={5} value={text} onChange={e => { setText(e.target.value); setRows([]); setResult(undefined); }} autoComplete="off" spellCheck={false} placeholder={'name,email,company\nAlex,alex@acme.com,Acme…'} maxLength={1024 * 1024} /></div><Button variant="outline" onClick={() => preview(text)}>Preview Import</Button>{rows.length > 0 && <><p className="text-sm text-body">{rows.filter(r => r.state === "valid").length} ready · {rows.filter(r => r.state === "duplicate").length} duplicates · {rows.filter(r => r.state === "invalid").length} invalid</p><div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Import preview, first 50 rows</caption><thead><tr><th>Row</th><th>Email</th><th>Result</th></tr></thead><tbody>{rows.slice(0, 50).map(r => <tr key={r.row}><td>{r.row}</td><td className="max-w-64 break-all">{r.email || "Missing email"}</td><td className={r.state === "invalid" ? "text-error-deep" : "text-body"}>{r.error ?? r.state}</td></tr>)}</tbody></table></div>{rows.length > 50 && <p className="text-xs text-body">Showing the first 50 rows. All valid rows will be imported.</p>}<Button disabled={pending || !rows.some(r => r.state === "valid")} onClick={() => start(async () => { const r = await importContacts(text); setResult(r); if (r.ok) { setText(""); setRows([]); router.refresh(); } })}>{pending ? "Importing…" : "Import Valid Contacts"}</Button></>}<Feedback result={result} /></section>;
}
