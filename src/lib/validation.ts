import { z } from "zod";
export const normalizedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: normalizedEmail,
  company: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(2000).default(""),
  tag: z.string().trim().max(50).default(""),
});
export const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(250)
      .refine((v) => !/[\r\n]/.test(v), "Subject must be one line."),
    body: z.string().trim().min(1).max(20000),
  })
  .superRefine((v, ctx) => {
    for (const field of ["subject", "body"] as const) {
      const tokens = [...v[field].matchAll(/{{\s*([^{}]+?)\s*}}/g)];
      if (
        tokens.some(
          (t) => !["name", "company", "role"].includes(t[1].trim()),
        ) ||
        /{{|}}/.test(v[field].replace(/{{\s*(name|company|role)\s*}}/g, ""))
      ) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Use only {{name}}, {{company}}, and {{role}} placeholders.",
        });
      }
    }
  });
export const campaignSchema = z.object({
  templateId: z.uuid(),
  recipientIds: z
    .array(z.uuid())
    .min(1)
    .max(15)
    .refine((v) => new Set(v).size === v.length, "Select each recipient once."),
  role: z.string().trim().max(160).default(""),
  resendIds: z.array(z.uuid()).max(15).default([]),
  idempotencyKey: z.uuid(),
});
export function renderTemplate(
  text: string,
  values: { name: string; company?: string | null; role: string },
) {
  return text.replace(
    /{{\s*(name|company|role)\s*}}/g,
    (_, key: keyof typeof values) => values[key] ?? "",
  );
}
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export function validatePdf(bytes: Uint8Array, type: string) {
  if (bytes.length > MAX_PDF_BYTES || bytes.length < 5)
    throw new Error("Choose a PDF up to 5 MB.");
  if (
    type !== "application/pdf" ||
    Buffer.from(bytes.slice(0, 5)).toString("ascii") !== "%PDF-"
  )
    throw new Error("The file must be a PDF.");
}
