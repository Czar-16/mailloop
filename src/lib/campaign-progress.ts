import "server-only";
import { db } from "@/lib/db";

export type CampaignProgressData = {
  id: string;
  createdAt: string;
  observedAt: string;
  finishedAt: string | null;
  queued: number;
  sent: number;
  failed: number;
  cancelled: number;
  review: number;
  pendingDispatch: boolean;
  outstanding: number;
  sending: number;
  nextSendAt: string | null;
};

// Include observed batches until this History visit ends, even after delivery finishes.
export async function readCampaignProgress(
  user: { id: string; nextSendAt: Date | null },
  campaignIds: string[] = [],
): Promise<CampaignProgressData | null> {
  const campaignSelect = {
    id: true,
    createdAt: true,
    sends: {
      select: {
        status: true,
        deliveryState: true,
        dispatchedAt: true,
        sentAt: true,
        attemptedAt: true,
        cancelledAt: true,
      },
    },
  } as const;
  const batches = await db.campaign.findMany({
    where: {
      userId: user.id,
      OR: [
        { id: { in: campaignIds } },
        {
          sends: {
            some: {
              OR: [{ status: "QUEUED" }, { deliveryState: "UNCERTAIN" }],
            },
          },
        },
      ],
    },
    select: campaignSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const batchSends = batches.flatMap((batch) => batch.sends);
  const createdAt = batches[0]?.createdAt;
  const outstanding = batchSends.filter(
    (s) => s.status === "QUEUED" && s.deliveryState !== "UNCERTAIN",
  ).length;
  return createdAt
    ? {
        id: batches.map((batch) => batch.id).join(":"),
        observedAt: new Date().toISOString(),
        createdAt: createdAt.toISOString(),
        finishedAt: batchSends.every(
          (s) => s.status !== "QUEUED" && s.deliveryState !== "UNCERTAIN",
        )
          ? (batchSends
              .map(
                (s) => s.cancelledAt ?? s.sentAt ?? s.attemptedAt ?? createdAt,
              )
              .sort((a, b) => b.getTime() - a.getTime())[0]
              ?.toISOString() ?? createdAt.toISOString())
          : null,
        queued: outstanding,
        sent: batchSends.filter(
          (s) =>
            ["SENT", "REPLIED"].includes(s.status) &&
            s.deliveryState !== "UNCERTAIN",
        ).length,
        failed: batchSends.filter(
          (s) => s.status === "FAILED" && s.deliveryState !== "UNCERTAIN",
        ).length,
        cancelled: batchSends.filter((s) => s.status === "CANCELLED").length,
        review: batchSends.filter((s) => s.deliveryState === "UNCERTAIN")
          .length,
        pendingDispatch: batchSends.some(
          (s) =>
            s.status === "QUEUED" &&
            !s.dispatchedAt &&
            s.deliveryState !== "UNCERTAIN",
        ),
        outstanding,
        sending: batchSends.filter(
          (s) => s.status === "QUEUED" && s.deliveryState === "ATTEMPTING",
        ).length,
        nextSendAt: user.nextSendAt?.toISOString() ?? null,
      }
    : null;
}
