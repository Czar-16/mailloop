import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Match immutable delivery snapshots as well as the saved contact ID.
export const contactDeliveryState = Prisma.sql`
  SELECT
    EXISTS(SELECT 1 FROM "Send" s JOIN "Campaign" b ON b.id = s."campaignId"
      WHERE b."userId" = c."userId" AND (s."contactId" = c.id OR s."recipientEmail" = c.email)
      AND (s.status = 'QUEUED' OR s."deliveryState" IN ('ATTEMPTING', 'UNCERTAIN'))) AS blocked,
    EXISTS(SELECT 1 FROM "Send" s JOIN "Campaign" b ON b.id = s."campaignId"
      WHERE b."userId" = c."userId" AND (s."contactId" = c.id OR s."recipientEmail" = c.email)
      AND s.status IN ('SENT', 'REPLIED')) AS "previouslySent",
    (c."followUpRequestedAt" IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM "Send" s JOIN "Campaign" b ON b.id = s."campaignId"
      WHERE b."userId" = c."userId" AND (s."contactId" = c.id OR s."recipientEmail" = c.email)
      AND s.status IN ('SENT', 'REPLIED') AND s."createdAt" > c."followUpRequestedAt")) AS "followUp",
    (SELECT max(s."sentAt") FROM "Send" s JOIN "Campaign" b ON b.id = s."campaignId"
      WHERE b."userId" = c."userId" AND (s."contactId" = c.id OR s."recipientEmail" = c.email)
      AND s.status IN ('SENT', 'REPLIED')) AS "lastSent"
`;
export type ShortlistContact = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobRole: string | null;
  blocked: boolean;
  previouslySent: boolean;
  followUp: boolean;
  lastSent: Date | null;
};
export async function readShortlist(userId: string, q = "", page = 1) {
  // Literal search: %, _ and backslashes must not become LIKE patterns.
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = Prisma.sql`c."userId" = ${userId} AND c."archivedAt" IS NULL AND c."shortlistRemovedAt" IS NULL
    AND (c.name ILIKE ${search} OR c.email ILIKE ${search} OR c.company ILIKE ${search})
    AND (state.blocked OR NOT state."previouslySent" OR state."followUp")`;
  const [contacts, counts] = await Promise.all([
    db.$queryRaw<ShortlistContact[]>(Prisma.sql`
      SELECT c.id, c.name, c.email, c.company, c."jobRole", state.*
      FROM "Contact" c CROSS JOIN LATERAL (${contactDeliveryState}) state
      WHERE ${where} ORDER BY c.name, c.id LIMIT 20 OFFSET ${(page - 1) * 20}`),
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT count(*) AS total FROM "Contact" c CROSS JOIN LATERAL (${contactDeliveryState}) state WHERE ${where}`),
  ]);
  return { contacts, total: Number(counts[0].total) };
}

// Contacts retain removed unsent people so they can be re-added, but completed
// recipients return only when History explicitly opens another follow-up.
export async function readContacts(userId: string, q = "", page = 1) {
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = Prisma.sql`c."userId" = ${userId} AND c."archivedAt" IS NULL
    AND (c.name ILIKE ${search} OR c.email ILIKE ${search} OR c.company ILIKE ${search})
    AND (state.blocked OR NOT state."previouslySent" OR state."followUp")`;
  const [contacts, counts] = await Promise.all([
    db.$queryRaw<
      (ShortlistContact & { shortlistRemovedAt: Date | null })[]
    >(Prisma.sql`
      SELECT c.id, c.name, c.email, c.company, c."jobRole", c."shortlistRemovedAt", state.*
      FROM "Contact" c CROSS JOIN LATERAL (${contactDeliveryState}) state
      WHERE ${where} ORDER BY c."createdAt" DESC, c.id LIMIT 20 OFFSET ${(page - 1) * 20}`),
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT count(*) AS total FROM "Contact" c CROSS JOIN LATERAL (${contactDeliveryState}) state WHERE ${where}`),
  ]);
  return { contacts, total: Number(counts[0].total) };
}
