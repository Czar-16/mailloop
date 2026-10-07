import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { get, del } from "@vercel/blob";
import { db } from "@/lib/db";
import { MAX_PDF_BYTES, validatePdf } from "@/lib/validation";
import { AppError } from "@/lib/errors";

export function validStoragePath(userId: string, pathname: string) {
  return new RegExp(`^resumes/${userId}/[a-f0-9-]{36}\\.pdf$`).test(pathname);
}
export function safeFileName(value: string) {
  return (
    value.replace(/[\r\n\\/\x00-\x1f]/g, "_").slice(0, 150) || "resume.pdf"
  );
}
export async function readAttachment(userId: string, storagePath: string) {
  if (!validStoragePath(userId, storagePath))
    throw new AppError("Invalid resume location.");
  if (
    !process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.NODE_ENV !== "production"
  ) {
    return readFile(path.join(process.cwd(), "uploads", storagePath));
  }
  const blob = await get(storagePath, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200)
    throw new AppError(
      "Resume could not be loaded. Upload it again in Settings.",
    );
  const reader = blob.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF_BYTES) {
        await reader.cancel();
        throw new AppError("Resume exceeds 5 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function activateResume(
  userId: string,
  storagePath: string,
  fileName: string,
) {
  const bytes = await readAttachment(userId, storagePath);
  validatePdf(bytes, "application/pdf");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const existing = await tx.attachment.findFirst({
      where: { userId, storagePath },
    });
    if (existing?.deletedAt)
      throw new AppError("This resume was removed. Upload it again.");
    const attachment =
      existing ??
      (await tx.attachment.create({
        data: { userId, storagePath, fileName: safeFileName(fileName) },
      }));
    await tx.user.update({
      where: { id: userId },
      data: { currentAttachmentId: attachment.id },
    });
  });
  await cleanupAttachments(userId);
}
export async function storeLocalResume(userId: string, file: File) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.BLOB_READ_WRITE_TOKEN
  )
    throw new AppError("Use the secure Blob upload.");
  if (file.size > MAX_PDF_BYTES) throw new AppError("Choose a PDF up to 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  validatePdf(bytes, file.type);
  const storagePath = `resumes/${userId}/${randomUUID()}.pdf`;
  const full = path.join(process.cwd(), "uploads", storagePath);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, bytes, { mode: 0o600 });
  await activateResume(userId, storagePath, file.name);
}
export async function cleanupAttachments(userId: string) {
  const old = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { currentAttachmentId: true },
    });
    const candidates = await tx.attachment.findMany({
      where: {
        userId,
        ...(user?.currentAttachmentId
          ? { id: { not: user.currentAttachmentId } }
          : {}),
        campaigns: {
          none: {
            userId,
            sends: {
              some: {
                OR: [
                  { status: "QUEUED" },
                  { deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] } },
                ],
              },
            },
          },
        },
      },
    });
    await tx.attachment.updateMany({
      where: { userId, id: { in: candidates.map((f) => f.id) } },
      data: { deletedAt: new Date() },
    });
    return candidates;
  });
  for (const file of old) {
    if (!validStoragePath(userId, file.storagePath)) continue;
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) await del(file.storagePath);
      else if (process.env.NODE_ENV !== "production")
        await unlink(path.join(process.cwd(), "uploads", file.storagePath));
      // Preserve the attachment row referenced by historical campaigns.
    } catch {
      /* Cleanup can be retried after another upload or send. */
    }
  }
}
