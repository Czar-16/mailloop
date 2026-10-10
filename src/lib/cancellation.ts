import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function completeCampaignIn(
  tx: Prisma.TransactionClient,
  userId: string,
  campaignId: string,
) {
  const rows = await tx.send.findMany({
    where: { campaignId, campaign: { userId } },
    select: { status: true },
  });
  if (!rows.length) return;
  const status = rows.some((s) => s.status === "QUEUED")
    ? "SENDING"
    : rows.some((s) => s.status === "FAILED")
      ? "COMPLETED_WITH_ERRORS"
      : rows.some((s) => s.status === "CANCELLED")
        ? "COMPLETED_WITH_CANCELLATIONS"
        : "COMPLETED";
  await tx.campaign.updateMany({
    where: { id: campaignId, userId },
    data: { status },
  });
}

// Caller holds the user row lock, shared with delivery claims and account deletion.
export async function cancelQueuedIn(
  tx: Prisma.TransactionClient,
  userId: string,
  target: { sendId?: string; campaignId?: string } = {},
) {
  const where: Prisma.SendWhereInput = {
    campaign: { userId },
    // Account deletion only needs outstanding work, not years of sent history.
    ...(!target.sendId && !target.campaignId
      ? {
          OR: [
            { status: "QUEUED" as const },
            {
              deliveryState: {
                in: ["ATTEMPTING" as const, "UNCERTAIN" as const],
              },
            },
          ],
        }
      : {}),
    ...(target.sendId ? { id: target.sendId } : {}),
    ...(target.campaignId ? { campaignId: target.campaignId } : {}),
  };
  const rows = await tx.send.findMany({
    where,
    select: { campaignId: true, status: true, deliveryState: true },
  });
  const cancelled = await tx.send.updateMany({
    where: { ...where, status: "QUEUED", deliveryState: "READY" },
    data: {
      status: "CANCELLED",
      deliveryState: "DONE",
      cancelledAt: new Date(),
      error: null,
    },
  });
  for (const id of new Set(rows.map((s) => s.campaignId)))
    await completeCampaignIn(tx, userId, id);
  return {
    cancelled: cancelled.count,
    couldNotStop: rows.filter(
      (s) =>
        s.status !== "CANCELLED" &&
        !(s.status === "QUEUED" && s.deliveryState === "READY"),
    ).length,
  };
}
export async function cancelQueued(
  userId: string,
  target: { sendId?: string; campaignId?: string },
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    return cancelQueuedIn(tx, userId, target);
  });
}
