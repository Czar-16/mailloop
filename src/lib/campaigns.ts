import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  campaignSchema,
  renderTemplate,
  templateSchema,
} from "@/lib/validation";
import { AppError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

export function quotaWhere(
  userId: string,
  now = new Date(),
): Prisma.SendWhereInput {
  return {
    campaign: { userId },
    OR: [
      {
        status: { in: ["SENT", "REPLIED"] },
        sentAt: { gte: new Date(now.getTime() - 86400000) },
      },
      { status: "QUEUED" },
      { deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] } },
    ],
  };
}
export async function createCampaign(userId: string, input: unknown) {
  const data = campaignSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const active = await tx.user.findUnique({ where: { id: userId } });
      if (!active || active.deletionRequestedAt)
        throw new AppError("Account unavailable.");
      const previous = await tx.campaign.findFirst({
        where: { userId, idempotencyKey: data.idempotencyKey },
      });
      if (previous)
        return {
          id: previous.id,
          count: await tx.send.count({
            where: { campaignId: previous.id, campaign: { userId } },
          }),
          skipped: 0,
        };
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.gmailAuthorized || !user.encryptedRefreshToken)
        throw new AppError("Reconnect Gmail in Settings before sending.");
      const template = await tx.template.findFirst({
        where: { id: data.templateId, userId, archivedAt: null },
      });
      if (!template) throw new AppError("Choose an available template.");
      templateSchema.parse(template);
      const contacts = await tx.contact.findMany({
        where: {
          id: { in: data.recipientIds },
          userId,
          archivedAt: null,
          shortlistRemovedAt: null,
        },
      });
      if (contacts.length !== data.recipientIds.length)
        throw new AppError("One or more contacts are unavailable.");
      const history = await tx.send.findMany({
        where: {
          campaign: { userId },
          OR: [
            { contactId: { in: contacts.map((c) => c.id) } },
            { recipientEmail: { in: contacts.map((c) => c.email) } },
          ],
          AND: [
            {
              OR: [
                { status: { in: ["QUEUED", "SENT", "REPLIED"] } },
                { deliveryState: { in: ["ATTEMPTING", "UNCERTAIN"] } },
              ],
            },
          ],
        },
        select: {
          contactId: true,
          recipientEmail: true,
          status: true,
          deliveryState: true,
        },
      });
      const selected = contacts.filter((c) => {
        const prior = history.filter(
          (s) => s.contactId === c.id || s.recipientEmail === c.email,
        );
        if (
          prior.some(
            (s) =>
              s.status === "QUEUED" ||
              ["ATTEMPTING", "UNCERTAIN"].includes(s.deliveryState),
          )
        )
          return false;
        return !prior.length || data.resendIds.includes(c.id);
      });
      if (!selected.length)
        throw new AppError(
          "All selected contacts were skipped. Choose new recipients or explicitly allow a resend.",
        );
      if (
        (await tx.send.count({ where: quotaWhere(userId) })) + selected.length >
        500
      )
        throw new AppError(
          "This campaign would exceed 500 emails in 24 hours, including queued emails.",
        );
      const attachment =
        data.attachResume && user.currentAttachmentId
          ? await tx.attachment.findFirst({
              where: { id: user.currentAttachmentId, userId, deletedAt: null },
            })
          : null;
      if (
        Object.keys(data.recipientRoles).some(
          (id) => !data.recipientIds.includes(id),
        )
      )
        throw new AppError(
          "Role overrides must belong to selected recipients.",
        );
      if (data.attachResume && !attachment)
        throw new AppError(
          "Upload a resume PDF in Settings or turn off Attach Resume.",
        );
      const snapshots = selected.map((c) => {
        const role = data.recipientRoles[c.id] ?? c.jobRole;
        if (!role?.trim())
          throw new AppError("Choose a job role for every recipient.", "role");
        const values = {
          name: c.name,
          company: c.company,
          role,
        };

        const subject = renderTemplate(template.subject, values);
        if (/[\r\n]/.test(subject))
          throw new AppError(
            "A recipient value makes the subject span multiple lines. Edit that contact.",
          );
        const id = randomUUID();
        return {
          id,
          contactId: c.id,
          recipientEmail: c.email,
          recipientName: c.name,
          recipientRole: role,
          recipientCompany: c.company ?? "",
          templateName: template.name,
          subject,
          body: renderTemplate(template.body, values),
          mimeMessageId: `<${id}@mailloop.in>`,
        };
      });
      const campaign = await tx.campaign.create({
        data: {
          userId,
          templateId: template.id,
          role: "",
          status: "QUEUED",
          idempotencyKey: data.idempotencyKey,
          attachmentId: attachment?.id,
          sends: { create: snapshots },
        },
      });
      return {
        id: campaign.id,
        count: selected.length,
        skipped: contacts.length - selected.length,
      };
    },
    { timeout: 10000 },
  );
}
