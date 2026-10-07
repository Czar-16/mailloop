"use server";
import { requireUser } from "@/lib/session";
import { activateResume, cleanupAttachments } from "@/lib/storage";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
export async function finalizeResume(pathname: string, filename: string) {
  const user = await requireUser();
  try {
    await activateResume(user.id, z.string().max(200).parse(pathname), z.string().max(150).parse(filename));
    revalidatePath("/settings"); return { ok: true, message: "Resume saved. It will be attached to new campaigns." };
  } catch { return { ok: false, message: "Could not validate the resume. Upload a PDF up to 5 MB." }; }
}
export async function removeResume() {
  const user = await requireUser();
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    await tx.user.update({ where: { id: user.id }, data: { currentAttachmentId: null } });
  });
  await cleanupAttachments(user.id); revalidatePath("/settings");
  return { ok: true, message: "Resume removed from future campaigns. Queued emails keep their attachment." };
}
