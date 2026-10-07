/*
  Warnings:

  - A unique constraint covering the columns `[userId,idempotencyKey]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mimeMessageId]` on the table `Send` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DeliveryState" AS ENUM ('READY', 'ATTEMPTING', 'UNCERTAIN', 'DONE');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "attachmentId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Send" ADD COLUMN     "attemptedAt" TIMESTAMP(3),
ADD COLUMN     "body" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliveryState" "DeliveryState" NOT NULL DEFAULT 'READY',
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "mimeMessageId" TEXT,
ADD COLUMN     "recipientCompany" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "recipientEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "recipientName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "subject" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "templateName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentAttachmentId" TEXT,
ADD COLUMN     "gmailAuthorized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "nextSendAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_userId_idempotencyKey_key" ON "Campaign"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Send_mimeMessageId_key" ON "Send"("mimeMessageId");

-- CreateIndex
CREATE INDEX "Send_status_sentAt_idx" ON "Send"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
