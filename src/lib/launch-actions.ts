"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { cancelQueued } from "@/lib/cancellation";
import { requestAccountDeletion } from "@/lib/account";
import { cleanupAttachments } from "@/lib/storage";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function cancelEmails(target: {
  sendId?: string;
  campaignId?: string;
}) {
  const user = await requireUser();
  const data = z
    .object({ sendId: z.uuid().optional(), campaignId: z.uuid().optional() })
    .refine((t) => !!t.sendId !== !!t.campaignId)
    .parse(target);
  const counts = await cancelQueued(user.id, data);
  await cleanupAttachments(user.id).catch(() => {});
  revalidatePath("/history");
  revalidatePath("/compose");
  return {
    ok: true,
    ...counts,
    message: `${counts.cancelled} cancelled. ${counts.couldNotStop} could not be stopped (already sent, sending, or needing review).`,
  };
}
export async function deleteAccount(email: string) {
  const user = await requireUser();
  try {
    await requestAccountDeletion(user.id, z.string().max(320).parse(email));
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof AppError
          ? e.message
          : "Could not request deletion. Try again.",
    };
  }
  await signOut({ redirectTo: "/?deleted=1" });
  return { ok: true, message: "Deletion requested." };
}
export async function saveFollowUpDays(days: number) {
  const user = await requireUser();
  const value = z
    .union([z.literal(0), z.literal(3), z.literal(7), z.literal(14)])
    .parse(days);
  await db.user.updateMany({
    where: { id: user.id, deletionRequestedAt: null },
    data: { followUpDays: value },
  });
  revalidatePath("/settings");
  revalidatePath("/history");
  return { ok: true, message: "Reminder preference saved." };
}
