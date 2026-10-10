import "server-only";
import { Inngest } from "inngest";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  gmailForUser,
  buildMime,
  providerCode,
  isInvalidGrant,
  isRateLimited,
} from "@/lib/gmail";
import { readAttachment, cleanupAttachments } from "@/lib/storage";
import { quotaWhere } from "@/lib/campaigns";
import { completeCampaignIn } from "@/lib/cancellation";
import { cleanupDeletedAccount } from "@/lib/account";
import { AppError } from "@/lib/errors";

export const inngest = new Inngest({
  id: "mailloop",
  isDev:
    process.env.NODE_ENV !== "production" && process.env.INNGEST_DEV === "1",
});
async function activeAccount(userId: string) {
  return db.user.findFirst({
    where: { id: userId, deletionRequestedAt: null },
    select: { id: true },
  });
}
const eventSchema = z.object({ userId: z.uuid(), sendId: z.uuid() });

export async function dispatchPending(userId: string) {
  if (!(await activeAccount(userId))) return 0;
  const pending = await db.send.findMany({
    where: { campaign: { userId }, status: "QUEUED", dispatchedAt: null },
    select: { id: true },
    take: 100,
  });
  if (!pending.length) return 0;
  await inngest.send(
    pending.map((s) => ({
      id: `send-${s.id}`,
      name: "mailloop/email.queued",
      data: { userId, sendId: s.id },
    })),
  );
  await db.send.updateMany({
    where: { id: { in: pending.map((s) => s.id) }, campaign: { userId } },
    data: { dispatchedAt: new Date() },
  });
  return pending.length;
}
async function completeCampaign(userId: string, campaignId: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await completeCampaignIn(tx, userId, campaignId);
  });
}
async function reconcile(userId: string, sendId: string) {
  const send = await db.send.findFirst({
    where: { id: sendId, campaign: { userId } },
  });
  if (!send?.mimeMessageId) return false;
  const { gmail } = await gmailForUser(userId);
  const response = await gmail.users.messages.list(
    {
      userId: "me",
      q: `in:sent rfc822msgid:${send.mimeMessageId.slice(1, -1)}`,
      maxResults: 1,
    },
    { timeout: 30000, retry: false },
  );
  const message = response.data.messages?.[0];
  if (!message?.id) return false;
  const detail = await gmail.users.messages.get(
    {
      userId: "me",
      id: message.id,
      format: "metadata",
      metadataHeaders: ["Message-ID"],
    },
    { timeout: 30000, retry: false },
  );
  await db.send.updateMany({
    where: {
      id: sendId,
      campaign: { userId },
      deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] },
    },
    data: {
      status: "SENT",
      deliveryState: "DONE",
      sentAt: new Date(
        Number(detail.data.internalDate) ||
          send.attemptedAt?.getTime() ||
          Date.now(),
      ),
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      error: null,
    },
  });
  await completeCampaign(userId, send.campaignId);
  return true;
}

export async function deliverOne(
  userId: string,
  sendId: string,
): Promise<{
  outcome: "done" | "wait" | "retry" | "uncertain";
  until?: number;
}> {
  if (!(await activeAccount(userId))) return { outcome: "done" };
  const send = await db.send.findFirst({
    where: { id: sendId, campaign: { userId } },
    include: { campaign: { include: { attachment: true } } },
  });
  if (
    !send ||
    ["SENT", "REPLIED", "CANCELLED"].includes(send.status) ||
    send.deliveryState === "DONE"
  )
    return { outcome: "done" };
  if (["ATTEMPTING", "UNCERTAIN"].includes(send.deliveryState)) {
    try {
      if (await reconcile(userId, sendId)) return { outcome: "done" };
    } catch {
      /* Keep the reservation when delivery cannot be proven. */
    }
    const unresolved = await db.send.updateMany({
      where: {
        id: sendId,
        campaign: { userId },
        deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] },
      },
      data: {
        status: "FAILED",
        deliveryState: "UNCERTAIN",
        error:
          "Delivery could not be confirmed. Check Gmail Sent before sending again; Mailloop will not automatically resend.",
      },
    });
    await completeCampaign(userId, send.campaignId);
    return { outcome: unresolved.count ? "uncertain" : "done" };
  }
  const claim = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletionRequestedAt) return { outcome: "done" as const };
    const current = await tx.send.findFirst({
      where: { id: sendId, campaign: { userId } },
    });
    if (
      !current ||
      current.status !== "QUEUED" ||
      current.deliveryState !== "READY"
    )
      return { outcome: "done" as const };
    if (user.nextSendAt && user.nextSendAt.getTime() > Date.now())
      return { outcome: "wait" as const, until: user.nextSendAt.getTime() };
    if ((await tx.send.count({ where: quotaWhere(userId) })) > 500) {
      await tx.send.updateMany({
        where: { id: sendId, campaign: { userId } },
        data: {
          status: "FAILED",
          deliveryState: "DONE",
          error: "24-hour limit reached. Try a new campaign later.",
        },
      });
      return { outcome: "done" as const };
    }
    await tx.send.updateMany({
      where: { id: sendId, campaign: { userId } },
      data: { deliveryState: "ATTEMPTING", attemptedAt: new Date() },
    });
    // A crash must leave enough separation before another worker touches Gmail.
    await tx.user.update({
      where: { id: userId },
      data: { nextSendAt: new Date(Date.now() + 60000) },
    });
    return { outcome: "claimed" as const };
  });
  if (claim.outcome !== "claimed") return claim;
  let submitted = false;
  try {
    const { gmail, email, name } = await gmailForUser(userId);
    const attachment = send.campaign.attachment;
    const raw = await buildMime({
      from: email,
      fromName: name,
      to: send.recipientEmail,
      subject: send.subject,
      body: send.body,
      messageId: send.mimeMessageId!,
      attachment: attachment
        ? {
            fileName: attachment.fileName,
            bytes: await readAttachment(userId, attachment.storagePath),
          }
        : undefined,
    });
    submitted = true;
    const response = await gmail.users.messages.send(
      { userId: "me", requestBody: { raw } },
      { timeout: 30000, retry: false },
    );
    await db.send.updateMany({
      where: {
        id: sendId,
        campaign: { userId },
        deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] },
      },
      data: {
        status: "SENT",
        deliveryState: "DONE",
        sentAt: new Date(),
        gmailMessageId: response.data.id,
        gmailThreadId: response.data.threadId,
        error: null,
      },
    });
    await completeCampaign(userId, send.campaignId).catch(() => {});
    await cleanupAttachments(userId).catch(() => {});
    return { outcome: "done" };
  } catch (error) {
    const code = providerCode(error);
    if (code === 401 || isInvalidGrant(error))
      await db.user.updateMany({
        where: { id: userId },
        data: { gmailAuthorized: false },
      });
    if (isRateLimited(error)) {
      const updated = await db.send.updateMany({
        where: {
          id: sendId,
          campaign: { userId },
          deliveryState: "ATTEMPTING",
        },
        data: {
          deliveryState: "READY",
          error: "Gmail is rate limiting sends. Retrying shortly.",
        },
      });
      return { outcome: updated.count ? "retry" : "done" };
    }
    const uncertain =
      submitted && !(code >= 400 && code < 500) && !isInvalidGrant(error);
    const updated = await db.send.updateMany({
      where: {
        id: sendId,
        campaign: { userId },
        deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] },
      },
      data: {
        status: uncertain ? "QUEUED" : "FAILED",
        deliveryState: uncertain ? "UNCERTAIN" : "DONE",
        error: uncertain
          ? "Waiting to confirm delivery in Gmail."
          : code === 401 || isInvalidGrant(error)
            ? "Gmail authorization expired. Reconnect in Settings."
            : error instanceof AppError
              ? error.message
              : "Gmail could not send this email. Check permissions and your account sending limit.",
      },
    });
    await completeCampaign(userId, send.campaignId);
    return { outcome: updated.count && uncertain ? "uncertain" : "done" };
  } finally {
    await db.user.updateMany({
      where: { id: userId },
      data: { nextSendAt: new Date(Date.now() + randomInt(20, 61) * 1000) },
    });
  }
}

export const sendEmail = inngest.createFunction(
  {
    id: "send-individual-email",
    triggers: { event: "mailloop/email.queued" },
    concurrency: { limit: 1, key: "event.data.userId" },
    retries: 3,
    onFailure: async ({ event }) => {
      const parsed = eventSchema.safeParse(event.data.event.data);
      if (!parsed.success) return;
      const { userId, sendId } = parsed.data;
      await db.send.updateMany({
        where: {
          id: sendId,
          campaign: { userId },
          status: "QUEUED",
          deliveryState: "READY",
        },
        data: {
          status: "FAILED",
          deliveryState: "DONE",
          error: "Background send failed. Create a new campaign to retry.",
        },
      });
      await db.send.updateMany({
        where: {
          id: sendId,
          campaign: { userId },
          status: "QUEUED",
          deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] },
        },
        data: {
          status: "FAILED",
          deliveryState: "UNCERTAIN",
          error:
            "Delivery requires review. Check Gmail Sent; Mailloop will not automatically resend.",
        },
      });
      const pending = await db.send.findFirst({
        where: { id: sendId, campaign: { userId } },
        select: { campaignId: true },
      });
      if (pending) await completeCampaign(userId, pending.campaignId);
    },
  },
  async ({ event, step }) => {
    const { userId, sendId } = eventSchema.parse(event.data);
    let transientRetries = 0;
    let reconciliationChecks = 0;
    for (let round = 0; round < 2000; round++) {
      const state = await step.run(`deliver-${round}`, () =>
        deliverOne(userId, sendId),
      );
      if (state.outcome === "done") return { sendId, completed: true };
      if (state.outcome === "uncertain") {
        if (++reconciliationChecks > 3) return { sendId, requiresReview: true };
        await step.sleep(
          `reconcile-wait-${round}`,
          `${30 * reconciliationChecks}s`,
        );
      } else if (state.outcome === "retry") {
        if (++transientRetries > 3) {
          await step.run("fail-rate-limit", async () => {
            await db.send.updateMany({
              where: {
                id: sendId,
                campaign: { userId },
                deliveryState: "READY",
                status: "QUEUED",
              },
              data: {
                status: "FAILED",
                deliveryState: "DONE",
                error:
                  "Gmail continued to rate limit this send. Try again later.",
              },
            });
            const send = await db.send.findFirst({
              where: { id: sendId, campaign: { userId } },
              select: { campaignId: true },
            });
            if (send) await completeCampaign(userId, send.campaignId);
          });
          return { sendId, failed: true };
        }
        await step.sleep(
          `retry-wait-${round}`,
          `${60 * 2 ** (transientRetries - 1)}s`,
        );
      } else await step.sleepUntil(`pace-${round}`, new Date(state.until!));
    }
    throw new Error("Pacing loop limit reached.");
  },
);

export async function replyCandidates(userId: string, force = false) {
  if (!(await activeAccount(userId))) return [];
  return db.send.findMany({
    where: {
      campaign: { userId },
      AND: [
        {
          OR: [
            { status: "SENT", gmailThreadId: { not: null } },
            { deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] } },
          ],
        },
        ...(force
          ? []
          : [
              {
                OR: [
                  { lastCheckedAt: null },
                  {
                    lastCheckedAt: {
                      lt: new Date(Date.now() - 8 * 60 * 60000),
                    },
                  },
                ],
              },
            ]),
      ],
    },
    select: { id: true },
    orderBy: [
      { lastCheckedAt: { sort: "asc", nulls: "first" } },
      { sentAt: "desc" },
    ],
    take: 50,
  });
}
export async function checkOneReply(userId: string, sendId: string) {
  if (!(await activeAccount(userId))) return false;
  const send = await db.send.findFirst({
    where: { id: sendId, campaign: { userId } },
  });
  if (!send) return false;
  try {
    if (["ATTEMPTING", "UNCERTAIN"].includes(send.deliveryState)) {
      await reconcile(userId, send.id);
      return false;
    }
    if (send.status !== "SENT" || !send.gmailThreadId) return false;
    const { gmail } = await gmailForUser(userId);
    const thread = await gmail.users.threads.get(
      {
        userId: "me",
        id: send.gmailThreadId,
        format: "metadata",
        metadataHeaders: ["From", "Auto-Submitted"],
      },
      { timeout: 15000, retry: false },
    );
    const replied = thread.data.messages?.some((m) => {
      const from =
        m.payload?.headers
          ?.find((h) => h.name?.toLowerCase() === "from")
          ?.value?.toLowerCase() ?? "";
      const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
      const auto = m.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === "auto-submitted",
      )?.value;
      return (
        address === send.recipientEmail &&
        Number(m.internalDate) > (send.sentAt?.getTime() ?? Infinity) &&
        m.id !== send.gmailMessageId &&
        !m.labelIds?.includes("SENT") &&
        (!auto || auto === "no")
      );
    });
    if (replied)
      await db.send.updateMany({
        where: { id: send.id, campaign: { userId }, status: "SENT" },
        data: { status: "REPLIED" },
      });
    return !!replied;
  } catch (e) {
    if (providerCode(e) === 401 || isInvalidGrant(e))
      await db.user.updateMany({
        where: { id: userId },
        data: { gmailAuthorized: false },
      });
    return false;
  } finally {
    await db.send.updateMany({
      where: { id: send.id, campaign: { userId } },
      data: { lastCheckedAt: new Date() },
    });
  }
}
export async function checkReplies(userId: string, force = false) {
  const sends = await replyCandidates(userId, force);
  let replies = 0;
  for (const send of sends) if (await checkOneReply(userId, send.id)) replies++;
  return { checked: sends.length, replies };
}
export const refreshReplyJob = inngest.createFunction(
  {
    id: "refresh-replies",
    triggers: { event: "mailloop/replies.refresh" },
    concurrency: { limit: 1, key: "event.data.userId" },
    retries: 2,
  },
  async ({ event, step }) => {
    const userId = z.uuid().parse(event.data.userId);
    const sends = await step.run("tracked-threads", () =>
      // Manual events omit force; scheduled events explicitly respect the cutoff.
      replyCandidates(userId, event.data.force !== false),
    );
    let replies = 0;
    for (const send of sends)
      if (
        await step.run(`thread-${send.id}`, () =>
          checkOneReply(userId, send.id),
        )
      )
        replies++;
    return { checked: sends.length, replies };
  },
);
// System schedulers enumerate IDs only; every tenant operation remains user-scoped.
export const maintenance = inngest.createFunction(
  { id: "maintenance", triggers: { cron: "*/1 * * * *" }, concurrency: 1 },
  async ({ step }) => {
    let cursor: string | undefined;
    for (let page = 0; ; page++) {
      const ids: string[] = await step.run(`users-${page}`, async () =>
        (
          await db.user.findMany({
            where: cursor ? { id: { gt: cursor } } : {},
            select: { id: true },
            orderBy: { id: "asc" },
            take: 100,
          })
        ).map((u) => u.id),
      );
      if (!ids.length) break;
      for (const userId of ids) {
        const disabled = await step.run(`account-${userId}`, () =>
          db.user.findUnique({
            where: { id: userId },
            select: { deletionRequestedAt: true },
          }),
        );
        if (!disabled || disabled.deletionRequestedAt) {
          await step.run(`delete-${userId}`, () =>
            // Keep a failed account disabled and retry next minute without
            // blocking dispatch or cleanup for other accounts.
            cleanupDeletedAccount(userId).catch(() => false),
          );
          continue;
        }
        await step.run(`dispatch-${userId}`, () => dispatchPending(userId));
        await step.run(`cleanup-${userId}`, () => cleanupAttachments(userId));
      }
      cursor = ids.at(-1);
    }
  },
);
export const scheduledReplies = inngest.createFunction(
  {
    id: "scheduled-replies",
    triggers: { cron: "0 */8 * * *" },
    concurrency: 1,
  },
  async ({ step }) => {
    let cursor: string | undefined;
    for (let page = 0; ; page++) {
      const ids: string[] = await step.run(`users-${page}`, async () =>
        (
          await db.user.findMany({
            where: {
              gmailAuthorized: true,
              deletionRequestedAt: null,
              ...(cursor ? { id: { gt: cursor } } : {}),
            },
            select: { id: true },
            orderBy: { id: "asc" },
            take: 100,
          })
        ).map((u) => u.id),
      );
      if (!ids.length) break;
      await step.sendEvent(
        `refresh-${page}`,
        ids.map((userId) => ({
          name: "mailloop/replies.refresh",
          data: { userId, force: false },
        })),
      );
      cursor = ids.at(-1);
    }
  },
);
