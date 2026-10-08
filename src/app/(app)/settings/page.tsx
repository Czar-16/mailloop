import { Preferences } from "@/components/preferences";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { signIn } from "@/auth";
import { PageHeading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Resume } from "@/components/resume";
export const metadata = { title: "Settings" };
export default async function Settings() {
  const user = await requireUser();
  const attachment = user.currentAttachmentId
    ? await db.attachment.findFirst({
        where: { id: user.currentAttachmentId, userId: user.id },
        select: { fileName: true },
      })
    : null;
  const connected = user.gmailAuthorized && !!user.encryptedRefreshToken;
  return (
    <>
      <PageHeading
        eyebrow="Ready for your next chapter"
        title="Settings"
        description="Manage your Gmail connection and the resume that goes with your introductions."
      />
      <Preferences roles={user.preferredRoles} resumeUrl={user.resumeUrl} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="panel space-y-5 p-6">
          <h2 className="text-xl font-semibold tracking-tight">
            Gmail Connection
          </h2>
          <div className="rounded-sm border border-border p-4">
            <p className="break-all text-sm font-medium">{user.email}</p>
            <p
              className={`mt-2 text-xs ${connected ? "text-link" : "text-warning"}`}
            >
              {connected
                ? "Connected · sending and reply detection enabled"
                : "Reconnect required · grant both Gmail permissions"}
            </p>
          </div>
          <p className="text-sm leading-6 text-body">
            Mailloop sends from your Gmail and checks tracked threads for
            replies. Your refresh token is encrypted on the server.
          </p>
          <form
            action={async () => {
              "use server";
              await requireUser();
              await signIn("google", { redirectTo: "/settings" });
            }}
          >
            <Button variant="outline">Reconnect Gmail</Button>
          </form>
          <a
            href="https://myaccount.google.com/connections"
            className="inline-flex min-h-11 items-center text-xs text-link"
          >
            Manage Access in Google
          </a>
          <div className="border-t border-border pt-4 text-xs leading-5 text-body">
            Your limit is 500 emails in a rolling 24 hours, including reserved
            queue capacity. Gmail may enforce additional limits.
          </div>
        </section>
        <Resume
          userId={user.id}
          fileName={attachment?.fileName ?? null}
          useBlob={
            !!process.env.BLOB_READ_WRITE_TOKEN ||
            process.env.NODE_ENV === "production"
          }
        />
      </div>
    </>
  );
}
