ALTER TABLE "User" ADD COLUMN "preferredRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "resumeUrl" TEXT;
ALTER TABLE "Contact" ADD COLUMN "jobRole" TEXT;
ALTER TABLE "Send" ADD COLUMN "recipientRole" TEXT NOT NULL DEFAULT '';
UPDATE "Contact" c SET "jobRole" = (
 SELECT trim(ca.role) FROM "Send" s JOIN "Campaign" ca ON ca.id = s."campaignId"
 WHERE s."contactId" = c.id AND ca."userId" = c."userId" AND trim(ca.role) <> ''
 ORDER BY ca."createdAt" DESC, s."createdAt" DESC LIMIT 1
);
UPDATE "Send" s SET "recipientRole" = ca.role FROM "Campaign" ca WHERE ca.id = s."campaignId";
