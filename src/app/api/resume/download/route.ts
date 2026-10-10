import { auth } from "@/auth";
import { db } from "@/lib/db";
import { readAttachment } from "@/lib/storage";
export async function GET() {
  const session = await auth();
  if (!session?.user.id) return new Response("Sign in first.", { status: 401 });
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { currentAttachmentId: true, deletionRequestedAt: true },
  });
  if (!user || user.deletionRequestedAt)
    return new Response("Account unavailable.", { status: 403 });
  const file = user?.currentAttachmentId
    ? await db.attachment.findFirst({
        where: { id: user.currentAttachmentId, userId: session.user.id },
      })
    : null;
  if (!file) return new Response("No resume uploaded.", { status: 404 });
  try {
    const bytes = await readAttachment(session.user.id, file.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Resume unavailable. Upload it again.", {
      status: 404,
    });
  }
}
