import Papa from "papaparse";
import { contactSchema } from "@/lib/validation";
const generic = new Set(
  "careers career jobs job hiring hr hello info contact support admin office team sales recruitment recruiting noreply no-reply mail email enquiries help talent resume resumes apply recruitment notifications test webmaster billing accounts service marketing press".split(
    " ",
  ),
);
export function suggestName(email: string): string {
  const local = email.trim().split("@")[0].split("+")[0].toLowerCase();
  const first = local.split(/[._-]/)[0].replace(/\d+$/, "");
  if (!/^[a-z]{2,30}$/.test(first) || generic.has(first)) return "";
  return first[0].toUpperCase() + first.slice(1);
}
export type ImportRow = {
  row: number;
  name: string;
  email: string;
  company: string;
  jobRole: string;
  state: "valid" | "duplicate" | "invalid";
  error?: string;
};
export function validateImportRows(
  rows: Omit<ImportRow, "state">[],
  existingEmails: string[] = [],
): ImportRow[] {
  const seen = new Set(existingEmails.map((e) => e.trim().toLowerCase()));
  return rows.map((row) => {
    const email = row.email.trim().toLowerCase();
    const duplicate = seen.has(email);
    seen.add(email);
    const parsed = contactSchema.safeParse({ ...row, email });
    return {
      ...row,
      email,
      state: duplicate
        ? "duplicate"
        : parsed.success && !row.error
          ? "valid"
          : "invalid",
      error: duplicate
        ? undefined
        : (row.error ??
          (parsed.success ? undefined : parsed.error.issues[0].message)),
    };
  });
}
export function parseContacts(
  text: string,
  existingEmails: string[] = [],
  jobRole = "",
): ImportRow[] {
  if (text.length > 1024 * 1024)
    throw new Error("Import at most 1 MB at a time.");
  const csv =
    /^([^\n]*[,\t;])?email([,\t;]|\s*$)/i.test(text.trim().split("\n")[0]) ||
    /^name[,\t;]/i.test(text.trim());
  let rows: Omit<ImportRow, "state">[];
  if (csv) {
    const result = Papa.parse<Record<string, string>>(text.trim(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    if (!result.meta.fields?.includes("email"))
      throw new Error("Include an email column header.");
    rows = result.data.map((r, i) => ({
      row: i + 2,
      email: r.email ?? "",
      name: r.name?.trim() || suggestName(r.email ?? ""),
      company: r.company ?? "",
      jobRole: r.jobrole || r.role || jobRole,
      error: result.errors.some((e) => e.row === i)
        ? "Check the number of columns."
        : undefined,
    }));
  } else
    rows = text
      .split(/[,;\n]+/)
      .map((e) => e.trim())
      .filter(Boolean)
      .map((email, i) => ({
        row: i + 1,
        email,
        name: suggestName(email),
        company: "",
        jobRole,
      }));
  if (rows.length > 1000)
    throw new Error("Import at most 1,000 rows at a time.");
  return validateImportRows(rows, existingEmails);
}
