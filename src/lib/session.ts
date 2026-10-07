import "server-only";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      gmailAuthorized: true,
      currentAttachmentId: true,
      encryptedRefreshToken: true,
    },
  });
  if (!user) redirect("/");
  return user;
}
