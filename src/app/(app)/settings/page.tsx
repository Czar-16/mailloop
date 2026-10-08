import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { Preferences } from "@/components/preferences";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { signIn } from "@/auth";
import { PageHeading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Resume } from "@/components/resume";
export const metadata = { title: "Settings" };
async function SettingsContent() {
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
      <Preferences roles={user.preferredRoles} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="panel space-y-5 p-6">
          <h2 className="section-label">Account · Gmail connection</h2>
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
      <section className="panel mt-6 space-y-3 p-6">
        <h2 className="section-label">Sending</h2>
        <p className="text-sm text-body">
          Your limit is 500 emails in a rolling 24 hours, including
          reserved queue capacity. Select up to 15 recipients per batch. Sends
          are spaced 20–60 seconds apart.
        </p>
        <p className="text-xs text-body">
          Gmail may enforce additional limits. Estimated queue times do not
          confirm delivery.
        </p>
      </section>
    </>
  );
}

export default function Settings() {
  return (
    <>
      <PageHeading
        eyebrow="Ready for your next chapter"
        title="Settings"
        description="Manage your Gmail connection and the resume that goes with your introductions."
      />
      <Suspense
        fallback={<WorkspaceSkeleton page="settings" heading={false} />}
      >
        <SettingsContent />
      </Suspense>
    </>
  );
}
