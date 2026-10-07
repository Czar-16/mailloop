import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { validStoragePath } from "@/lib/storage";
import { MAX_PDF_BYTES } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({ body, request,
      onBeforeGenerateToken: async pathname => {
        const session = await auth();
        if (!session?.user.id || request.headers.get("origin") !== new URL(request.url).origin || !validStoragePath(session.user.id, pathname)) throw new Error("Unauthorized upload.");
        return { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX_PDF_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 10 * 60000 };
      },
      onUploadCompleted: async () => { /* SDK validates the callback. Activation requires a user session. */ },
    });
    return Response.json(response);
  } catch { return Response.json({ error: "Secure upload failed. Sign in and try again." }, { status: 400 }); }
}
