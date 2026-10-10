import "server-only";
import { db } from "@/lib/db";
import { cancelQueuedIn } from "@/lib/cancellation";
import { deleteOwnedResumes } from "@/lib/storage";
import { decryptToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

export const DELETION_DRAIN_MS = 15 * 60 * 1000;
export async function requestAccountDeletion(userId: string, email: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || email !== user.email)
      throw new AppError("Type your account email exactly to confirm.");
    await tx.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: user.deletionRequestedAt ?? new Date(),
        gmailAuthorized: false,
      },
    });
    return cancelQueuedIn(tx, userId);
  });
}
// Durable database marker is retried by maintenance, even when event publication fails.
export async function cleanupDeletedAccount(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (
    !user?.deletionRequestedAt ||
    now.getTime() - user.deletionRequestedAt.getTime() < DELETION_DRAIN_MS
  )
    return false;
  if (user.encryptedRefreshToken) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: decryptToken(user.encryptedRefreshToken),
        }),
        signal: AbortSignal.timeout(15000),
      });
      // A revoked or invalid token needs no further revocation. Retry other failures.
      if (!response.ok && response.status !== 400) return false;
      await db.user.updateMany({
        where: { id: userId, deletionRequestedAt: { not: null } },
        data: { encryptedRefreshToken: null },
      });
    } catch {
      return false;
    }
  }
  // Includes files uploaded with a token but never activated as the current resume.
  await deleteOwnedResumes(userId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const disabled = await tx.user.findFirst({
      where: { id: userId, deletionRequestedAt: { not: null } },
    });
    if (!disabled) return;
    await tx.campaign.deleteMany({ where: { userId } });
    await tx.contact.deleteMany({ where: { userId } });
    await tx.template.deleteMany({ where: { userId } });
    await tx.attachment.deleteMany({ where: { userId } });
    await tx.user.deleteMany({
      where: { id: userId, deletionRequestedAt: { not: null } },
    });
  });
  return true;
}

export async function exportAccount(userId: string) {
  const profile = await db.user.findFirst({
    where: { id: userId, deletionRequestedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      preferredRoles: true,
      followUpDays: true,
      gmailAuthorized: true,
      currentAttachmentId: true,
    },
  });
  if (!profile) throw new AppError("Account unavailable.");
  const [contacts, templates, campaigns, attachments] = await Promise.all([
    db.contact.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        jobRole: true,
        notes: true,
        tag: true,
        archivedAt: true,
        followUpRequestedAt: true,
        shortlistRemovedAt: true,
        createdAt: true,
      },
    }),
    db.template.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        subject: true,
        body: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
    db.campaign.findMany({
      where: { userId },
      select: {
        id: true,
        templateId: true,
        status: true,
        role: true,
        attachmentId: true,
        createdAt: true,
        sends: {
          where: { campaign: { userId } },
          select: {
            id: true,
            contactId: true,
            recipientEmail: true,
            recipientName: true,
            recipientRole: true,
            recipientCompany: true,
            templateName: true,
            subject: true,
            body: true,
            status: true,
            deliveryState: true,
            createdAt: true,
            sentAt: true,
            cancelledAt: true,
            attemptedAt: true,
            lastCheckedAt: true,
            gmailMessageId: true,
            gmailThreadId: true,
            error: true,
          },
        },
      },
    }),
    db.attachment.findMany({
      where: { userId },
      select: { id: true, fileName: true, createdAt: true, deletedAt: true },
    }),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    contacts,
    templates,
    campaigns,
    attachments,
  };
}
