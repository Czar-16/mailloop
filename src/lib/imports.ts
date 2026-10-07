import Papa from "papaparse";
import { contactSchema } from "@/lib/validation";
export type ImportRow = { row: number; name: string; email: string; company: string; state: "valid" | "duplicate" | "invalid"; error?: string };
export function parseContacts(text: string, existingEmails: string[] = []): ImportRow[] {
  if (text.length > 1024 * 1024) throw new Error("Import at most 1 MB at a time.");
  const result = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim().toLowerCase() });
  if (!["name", "email", "company"].every(k => result.meta.fields?.includes(k))) throw new Error("Include name,email,company column headers.");
  if (result.data.length > 1000) throw new Error("Import at most 1,000 rows at a time.");
  const seen = new Set(existingEmails.map(v => v.toLowerCase()));
  return result.data.map((r, i) => {
    const parsed = contactSchema.safeParse(r);
    const base = { row: i + 2, name: r.name ?? "", email: (r.email ?? "").trim().toLowerCase(), company: r.company ?? "" };
    const csvError = result.errors.find(e => e.row === i);
    if (!parsed.success || csvError) return { ...base, state: "invalid", error: csvError ? "Check the number of columns." : parsed.error?.issues[0].message ?? "Invalid row." };
    const duplicate = seen.has(parsed.data.email);
    seen.add(parsed.data.email);
    return { ...base, ...parsed.data, state: duplicate ? "duplicate" : "valid" };
  });
}
