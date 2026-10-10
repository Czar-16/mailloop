import { del } from "@vercel/blob";
import { z } from "zod";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/lib/db";
import { DELETION_DRAIN_MS } from "@/lib/account";
import { auth } from "@/auth";
import { validStoragePath } from "@/lib/storage";
import { MAX_PDF_BYTES } from "@/lib/validation";
export async function POST(request: Request) {
  let cleanupFailed = false;
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (
          !session?.user.id ||
          request.headers.get("origin") !== new URL(request.url).origin ||
          !validStoragePath(session.user.id, pathname)
        )
          throw new Error("Unauthorized upload.");
        const user = await db.user.findFirst({
          where: { id: session.user.id, deletionRequestedAt: null },
          select: { id: true },
        });
        if (!user) throw new Error("Account unavailable.");
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_PDF_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ userId: user.id }),
          validUntil: Date.now() + 10 * 60000,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The SDK verifies the service callback before trusting its signed payload.
        const { userId } = z
          .object({ userId: z.uuid() })
          .parse(JSON.parse(tokenPayload ?? "{}"));
        if (!validStoragePath(userId, blob.pathname))
          throw new Error("Invalid upload location.");
        const owner = await db.user.findUnique({
          where: { id: userId },
          select: { deletionRequestedAt: true },
        });
        // Before the drain deadline, maintenance owns cleanup: this PDF may
        // already have been activated and claimed by a running send worker.
        // Remove late uploads once the account has drained or been removed.
        if (
          !owner ||
          (owner.deletionRequestedAt &&
            Date.now() - owner.deletionRequestedAt.getTime() >=
              DELETION_DRAIN_MS)
        ) {
          try {
            await del(blob.url, { abortSignal: AbortSignal.timeout(15000) });
          } catch {
            cleanupFailed = true;
            throw new Error("Upload cleanup requires retry.");
          }
        }
      },
    });
    return Response.json(response);
  } catch {
    return Response.json(
      { error: "Secure upload failed. Sign in and try again." },
      { status: cleanupFailed ? 503 : 400 },
    );
  }
}
