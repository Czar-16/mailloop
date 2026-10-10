import "server-only";
import { google } from "googleapis";
import MailComposer from "gmail-mime/lib/mail-composer";
import { db } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

export async function gmailForUser(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (
    user.deletionRequestedAt ||
    !user.gmailAuthorized ||
    !user.encryptedRefreshToken
  )
    throw new AppError("Reconnect Gmail in Settings.");
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth.transporter.defaults = {
    timeout: 15000,
    retry: false,
    signal: AbortSignal.timeout(120000),
  };
  oauth.setCredentials({
    refresh_token: decryptToken(user.encryptedRefreshToken),
  });
  return {
    gmail: google.gmail({ version: "v1", auth: oauth }),
    email: user.email,
    name: user.name,
  };
}
export async function buildMime(input: {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  attachment?: { fileName: string; bytes: Buffer };
}) {
  const message = new MailComposer({
    from: { name: input.fromName?.trim() ?? "", address: input.from },
    to: input.to,
    subject: input.subject,
    text: input.body,
    messageId: input.messageId,
    date: new Date(),
    disableFileAccess: true,
    disableUrlAccess: true,
    attachments: input.attachment
      ? [
          {
            filename: input.attachment.fileName,
            content: input.attachment.bytes,
            contentType: "application/pdf",
          },
        ]
      : [],
  }).compile();
  return (await message.build()).toString("base64url");
}
export function providerCode(error: unknown) {
  const e = error as { code?: unknown; response?: { status?: number } };
  return Number(e?.response?.status ?? e?.code) || 0;
}
export function isInvalidGrant(error: unknown) {
  const e = error as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error === "invalid_grant";
}
export function isRateLimited(error: unknown) {
  const e = error as {
    response?: { data?: { error?: { errors?: { reason?: string }[] } } };
  };
  return (
    providerCode(error) === 429 ||
    (providerCode(error) === 403 &&
      e?.response?.data?.error?.errors?.some((item) =>
        ["rateLimitExceeded", "userRateLimitExceeded"].includes(
          item.reason ?? "",
        ),
      )) === true
  );
}
