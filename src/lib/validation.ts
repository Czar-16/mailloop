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
  jobRole: z.string().trim().min(1, "Choose a job role.").max(160),
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
          (t) =>
            ![
              "name",
              "company",
              "role",
              ...(field === "body" ? ["resume_link"] : []),
            ].includes(t[1].trim()),
        ) ||
        /{{|}}/.test(
          v[field].replace(/{{\s*(name|company|role|resume_link)\s*}}/g, ""),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message:
            "Use {{name}}, {{company}}, {{role}}, and {{resume_link}} (body only).",
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
  recipientRoles: z
    .record(z.uuid(), z.string().trim().min(1).max(160))
    .default({}),
  attachResume: z.boolean(),
  resendIds: z.array(z.uuid()).max(15).default([]),
  idempotencyKey: z.uuid(),
});
export function renderTemplate(
  text: string,
  values: {
    name: string;
    company?: string | null;
    role: string;
    resume_link?: string | null;
  },
) {
  return text.replace(
    /{{\s*(name|company|role|resume_link)\s*}}/g,
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

export const preferredRolesSchema = z
  .array(z.string().trim().min(1).max(160))
  .min(1, "Save at least one preferred role.")
  .max(5, "Save at most five preferred roles.")
  .refine(
    (v) => new Set(v.map((r) => r.toLowerCase())).size === v.length,
    "Choose unique roles.",
  );
export const resumeUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Enter an HTTPS resume URL.");
