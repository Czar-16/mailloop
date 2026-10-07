import "server-only";
import { Inngest } from "inngest";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { gmailForUser, buildMime, providerCode, isInvalidGrant } from "@/lib/gmail";
import { readAttachment, cleanupAttachments } from "@/lib/storage";
import { quotaWhere } from "@/lib/campaigns";
import { AppError } from "@/lib/errors";

export const inngest = new Inngest({ id: "mailloop", isDev: process.env.NODE_ENV !== "production" && process.env.INNGEST_DEV === "1" });
const eventSchema = z.object({ userId: z.uuid(), sendId: z.uuid() });

export async function dispatchPending(userId: string) {
  const pending = await db.send.findMany({ where: { campaign: { userId }, status: "QUEUED", dispatchedAt: null }, select: { id: true }, take: 100 });
  if (!pending.length) return 0;
  await inngest.send(pending.map(s => ({ id: `send-${s.id}`, name: "mailloop/email.queued", data: { userId, sendId: s.id } })));
  await db.send.updateMany({ where: { id: { in: pending.map(s => s.id) }, campaign: { userId } }, data: { dispatchedAt: new Date() } });
  return pending.length;
}
async function completeCampaign(userId: string, campaignId: string) {
  const rows = await db.send.findMany({ where: { campaignId, campaign: { userId } }, select: { status: true } });
  const status = rows.some(s => s.status === "QUEUED") ? "SENDING" : rows.every(s => ["SENT", "REPLIED"].includes(s.status)) ? "COMPLETED" : "COMPLETED_WITH_ERRORS";
  await db.campaign.updateMany({ where: { id: campaignId, userId }, data: { status } });
}
async function reconcile(userId: string, sendId: string) {
  const send = await db.send.findFirst({ where: { id: sendId, campaign: { userId } } });
  if (!send?.mimeMessageId) return false;
  const { gmail } = await gmailForUser(userId);
  const response = await gmail.users.messages.list({ userId: "me", q: `in:sent rfc822msgid:${send.mimeMessageId.slice(1, -1)}`, maxResults: 1 }, { timeout: 30000, retry: false });
  const message = response.data.messages?.[0];
  if (!message?.id) return false;
  const detail = await gmail.users.messages.get({ userId: "me", id: message.id, format: "metadata", metadataHeaders: ["Message-ID"] }, { timeout: 30000, retry: false });
  await db.send.updateMany({ where: { id: sendId, campaign: { userId }, deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] } }, data: {
    status: "SENT", deliveryState: "DONE", sentAt: new Date(Number(detail.data.internalDate) || send.attemptedAt?.getTime() || Date.now()), gmailMessageId: message.id, gmailThreadId: message.threadId, error: null,
  } });
  await completeCampaign(userId, send.campaignId);
  return true;
}

export async function deliverOne(userId: string, sendId: string): Promise<{ outcome: "done" | "wait" | "retry" | "uncertain"; until?: number }> {
  const send = await db.send.findFirst({ where: { id: sendId, campaign: { userId } }, include: { campaign: { include: { attachment: true } } } });
  if (!send || ["SENT", "REPLIED"].includes(send.status) || send.deliveryState === "DONE") return { outcome: "done" };
  if (["ATTEMPTING", "UNCERTAIN"].includes(send.deliveryState)) {
    try { if (await reconcile(userId, sendId)) return { outcome: "done" }; } catch { /* Keep the reservation when delivery cannot be proven. */ }
    await db.send.updateMany({ where: { id: sendId, campaign: { userId } }, data: { status: "FAILED", deliveryState: "UNCERTAIN", error: "Delivery could not be confirmed. Check Gmail Sent before sending again; Mailloop will not automatically resend." } });
    await completeCampaign(userId, send.campaignId);
    return { outcome: "uncertain" };
  }
  const claim = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const current = await tx.send.findFirstOrThrow({ where: { id: sendId, campaign: { userId } } });
    if (current.status !== "QUEUED" || current.deliveryState !== "READY") return { outcome: "done" as const };
    if (user.nextSendAt && user.nextSendAt.getTime() > Date.now()) return { outcome: "wait" as const, until: user.nextSendAt.getTime() };
    if (await tx.send.count({ where: quotaWhere(userId) }) > 500) {
      await tx.send.updateMany({ where: { id: sendId, campaign: { userId } }, data: { status: "FAILED", deliveryState: "DONE", error: "24-hour limit reached. Try a new campaign later." } });
      return { outcome: "done" as const };
    }
    await tx.send.updateMany({ where: { id: sendId, campaign: { userId } }, data: { deliveryState: "ATTEMPTING", attemptedAt: new Date() } });
    // A crash must leave enough separation before another worker touches Gmail.
    await tx.user.update({ where: { id: userId }, data: { nextSendAt: new Date(Date.now() + 60000) } });
    return { outcome: "claimed" as const };
  });
  if (claim.outcome !== "claimed") return claim;
  let submitted = false;
  try {
    const { gmail, email } = await gmailForUser(userId);
    const attachment = send.campaign.attachment;
    const raw = await buildMime({ from: email, to: send.recipientEmail, subject: send.subject, body: send.body, messageId: send.mimeMessageId!, attachment: attachment ? { fileName: attachment.fileName, bytes: await readAttachment(userId, attachment.storagePath) } : undefined });
    submitted = true;
    const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw } }, { timeout: 30000, retry: false });
    await db.send.updateMany({ where: { id: sendId, campaign: { userId } }, data: { status: "SENT", deliveryState: "DONE", sentAt: new Date(), gmailMessageId: response.data.id, gmailThreadId: response.data.threadId, error: null } });
    await completeCampaign(userId, send.campaignId);
    await cleanupAttachments(userId);
    return { outcome: "done" };
  } catch (error) {
    const code = providerCode(error);
    if (code === 401 || isInvalidGrant(error)) await db.user.update({ where: { id: userId }, data: { gmailAuthorized: false } });
    if (code === 429) {
      await db.send.updateMany({ where: { id: sendId, campaign: { userId } }, data: { deliveryState: "READY", error: "Gmail is rate limiting sends. Retrying shortly." } });
      return { outcome: "retry" };
    }
    const uncertain = submitted && !(code >= 400 && code < 500) && !isInvalidGrant(error);
    await db.send.updateMany({ where: { id: sendId, campaign: { userId } }, data: {
      status: uncertain ? "QUEUED" : "FAILED", deliveryState: uncertain ? "UNCERTAIN" : "DONE",
      error: uncertain ? "Waiting to confirm delivery in Gmail." : code === 401 || isInvalidGrant(error) ? "Gmail authorization expired. Reconnect in Settings." : error instanceof AppError ? error.message : "Gmail could not send this email. Check permissions and your account sending limit.",
    } });
    await completeCampaign(userId, send.campaignId);
    return { outcome: uncertain ? "uncertain" : "done" };
  } finally {
    await db.user.update({ where: { id: userId }, data: { nextSendAt: new Date(Date.now() + randomInt(20, 61) * 1000) } });
  }
}

export const sendEmail = inngest.createFunction({
  id: "send-individual-email", triggers: { event: "mailloop/email.queued" },
  concurrency: { limit: 1, key: "event.data.userId" }, retries: 3,
  onFailure: async ({ event }) => {
    const parsed = eventSchema.safeParse(event.data.event.data);
    if (!parsed.success) return;
    const { userId, sendId } = parsed.data;
    await db.send.updateMany({ where: { id: sendId, campaign: { userId }, status: "QUEUED", deliveryState: "READY" }, data: { status: "FAILED", deliveryState: "DONE", error: "Background send failed. Create a new campaign to retry." } });
    const pending = await db.send.findFirst({ where: { id: sendId, campaign: { userId } }, select: { campaignId: true } });
    if (pending) await completeCampaign(userId, pending.campaignId);
  },
}, async ({ event, step }) => {
  const { userId, sendId } = eventSchema.parse(event.data);
  let transientRetries = 0;
  let reconciliationChecks = 0;
  for (let round = 0; round < 2000; round++) {
    const state = await step.run(`deliver-${round}`, () => deliverOne(userId, sendId));
    if (state.outcome === "done") return { sendId, completed: true };
    if (state.outcome === "uncertain") {
      if (++reconciliationChecks > 3) return { sendId, requiresReview: true };
      await step.sleep(`reconcile-wait-${round}`, `${30 * reconciliationChecks}s`);
    } else if (state.outcome === "retry") {
      if (++transientRetries > 3) {
        await step.run("fail-rate-limit", async () => {
          await db.send.updateMany({ where: { id: sendId, campaign: { userId }, deliveryState: "READY" }, data: { status: "FAILED", deliveryState: "DONE", error: "Gmail continued to rate limit this send. Try again later." } });
          const send = await db.send.findFirst({ where: { id: sendId, campaign: { userId } }, select: { campaignId: true } });
          if (send) await completeCampaign(userId, send.campaignId);
        });
        return { sendId, failed: true };
      }
      await step.sleep(`retry-wait-${round}`, `${60 * transientRetries}s`);
    } else await step.sleepUntil(`pace-${round}`, new Date(state.until!));
  }
  throw new Error("Pacing loop limit reached.");
});

export async function checkReplies(userId: string, force = false) {
  const { gmail } = await gmailForUser(userId);
  const uncertain = await db.send.findMany({ where: { campaign: { userId }, deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] } }, select: { id: true }, take: 10 });
  for (const send of uncertain) { try { await reconcile(userId, send.id); } catch { /* Unconfirmed delivery stays blocked. */ } }
  const sends = await db.send.findMany({ where: { campaign: { userId }, status: "SENT", gmailThreadId: { not: null }, ...(force ? {} : { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 15 * 60000) } }] }) }, orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { sentAt: "desc" }], take: 50 });
  let replies = 0;
  for (const send of sends) {
    try {
      const thread = await gmail.users.threads.get({ userId: "me", id: send.gmailThreadId!, format: "metadata", metadataHeaders: ["From", "Auto-Submitted"] }, { timeout: 15000, retry: false });
      const replied = thread.data.messages?.some(m => {
        const from = m.payload?.headers?.find(h => h.name?.toLowerCase() === "from")?.value?.toLowerCase() ?? "";
        const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
        const auto = m.payload?.headers?.find(h => h.name?.toLowerCase() === "auto-submitted")?.value;
        return address === send.recipientEmail && Number(m.internalDate) > (send.sentAt?.getTime() ?? Infinity) && m.id !== send.gmailMessageId && !m.labelIds?.includes("SENT") && (!auto || auto === "no");
      });
      await db.send.updateMany({ where: { id: send.id, campaign: { userId }, status: "SENT" }, data: { lastCheckedAt: new Date(), ...(replied ? { status: "REPLIED" } : {}) } });
      if (replied) replies++;
    } catch (e) {
      if (providerCode(e) === 401 || isInvalidGrant(e)) { await db.user.update({ where: { id: userId }, data: { gmailAuthorized: false } }); break; }
      await db.send.updateMany({ where: { id: send.id, campaign: { userId } }, data: { lastCheckedAt: new Date() } });
    }
  }
  return { checked: sends.length, replies };
}
export const refreshReplyJob = inngest.createFunction({ id: "refresh-replies", triggers: { event: "mailloop/replies.refresh" }, concurrency: { limit: 1, key: "event.data.userId" }, retries: 2 }, async ({ event, step }) => {
  const userId = z.uuid().parse(event.data.userId);
  return step.run("check-threads", () => checkReplies(userId, true));
});
// System schedulers enumerate IDs only; every tenant operation remains user-scoped.
export const maintenance = inngest.createFunction({ id: "maintenance", triggers: { cron: "*/1 * * * *" }, concurrency: 1 }, async ({ step }) => {
  let cursor: string | undefined;
  for (let page = 0; ; page++) {
    const ids: string[] = await step.run(`users-${page}`, async () => (await db.user.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })).map(u => u.id));
    if (!ids.length) break;
    for (const userId of ids) await step.run(`dispatch-${userId}`, () => dispatchPending(userId));
    cursor = ids.at(-1);
  }
});
export const scheduledReplies = inngest.createFunction({ id: "scheduled-replies", triggers: { cron: "*/15 * * * *" }, concurrency: 1 }, async ({ step }) => {
  let cursor: string | undefined;
  for (let page = 0; ; page++) {
    const ids: string[] = await step.run(`users-${page}`, async () => (await db.user.findMany({ where: { gmailAuthorized: true }, select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })).map(u => u.id));
    if (!ids.length) break;
    await step.sendEvent(`refresh-${page}`, ids.map(userId => ({ name: "mailloop/replies.refresh", data: { userId } })));
    cursor = ids.at(-1);
  }
});
