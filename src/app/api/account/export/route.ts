import { auth } from "@/auth";
import { exportAccount } from "@/lib/account";
export async function GET() {
  const session = await auth();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401, headers });
  try {
    return Response.json(await exportAccount(session.user.id), {
      headers: {
        ...headers,
        "Content-Disposition": 'attachment; filename="mailloop-data.json"',
      },
    });
  } catch {
    return Response.json(
      { error: "Export unavailable." },
      { status: 403, headers },
    );
  }
}
