import { auth } from "@/auth";
import { storeLocalResume } from "@/lib/storage";
import { MAX_PDF_BYTES } from "@/lib/validation";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_PDF_BYTES + 65536)
    return Response.json(
      { error: "Choose a PDF up to 5 MB." },
      { status: 413 },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Choose a PDF." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_PDF_BYTES + 65536) {
          await reader.cancel();
          return Response.json(
            { error: "Choose a PDF up to 5 MB." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: new Uint8Array(Buffer.concat(chunks)),
    });
    const form = await boundedRequest.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json({ error: "Choose a PDF." }, { status: 400 });
    await storeLocalResume(session.user.id, file);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not upload. Choose a valid PDF up to 5 MB." },
      { status: 400 },
    );
  }
}
