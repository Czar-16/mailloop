import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { contactDeliveryState } from "@/lib/shortlist";
export async function readFollowUps(
  userId: string,
  days: number,
  page = 1,
  now = new Date(),
) {
  if (!days) return { contacts: [], total: 0 };
  const where = Prisma.sql`c."userId" = ${userId} AND c."archivedAt" IS NULL
    AND NOT state.blocked AND NOT state."followUp" AND latest."sentAt" <= ${new Date(now.getTime() - days * 86400000)}
    AND NOT EXISTS (SELECT 1 FROM "Send" r JOIN "Campaign" b ON b.id = r."campaignId"
      WHERE b."userId" = ${userId} AND (r."contactId" = c.id OR r."recipientEmail" = c.email) AND r.status = 'REPLIED')`;
  const latest = Prisma.sql`SELECT s.id, s."sentAt", s."lastCheckedAt" FROM "Send" s JOIN "Campaign" b ON b.id = s."campaignId"
    WHERE b."userId" = ${userId} AND (s."contactId" = c.id OR s."recipientEmail" = c.email) AND s.status IN ('SENT', 'REPLIED')
    ORDER BY s."sentAt" DESC, s.id DESC LIMIT 1`;
  const [contacts, counts] = await Promise.all([
    db.$queryRaw<
      {
        id: string;
        name: string;
        email: string;
        sendId: string;
        sentAt: Date;
        lastCheckedAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT c.id, c.name, c.email, latest.id AS "sendId", latest."sentAt", latest."lastCheckedAt"
      FROM "Contact" c CROSS JOIN LATERAL (${contactDeliveryState}) state CROSS JOIN LATERAL (${latest}) latest
      WHERE ${where} ORDER BY latest."sentAt", c.id LIMIT 20 OFFSET ${(page - 1) * 20}`),
    db.$queryRaw<
      { total: bigint }[]
    >(Prisma.sql`SELECT count(*) AS total FROM "Contact" c
      CROSS JOIN LATERAL (${contactDeliveryState}) state CROSS JOIN LATERAL (${latest}) latest WHERE ${where}`),
  ]);
  return { contacts, total: Number(counts[0].total) };
}
