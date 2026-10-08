import { Preferences } from "@/components/preferences";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { signIn } from "@/auth";
import { PageHeading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Resume } from "@/components/resume";
import { ThemeControl } from "@/components/theme";
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
        title="Settings"
        description="Manage your outreach preferences, Gmail connection, and resume."
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Preferences roles={user.preferredRoles} resumeUrl={user.resumeUrl} />
          <section className="panel space-y-4 p-4 sm:p-6">
            <h2 className="text-lg font-semibold leading-[26px]">
              Gmail Connection
            </h2>
            <div className="space-y-3 border-y border-border py-4">
              <p className="break-all text-sm font-medium">{user.email}</p>
              <p
                className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium leading-[18px] ${connected ? "border-success/25 bg-success-soft text-success" : "border-warning/25 bg-warning-soft text-warning"}`}
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
              className="inline-flex min-h-11 items-center text-sm text-link"
            >
              Manage Access in Google
            </a>
            <div className="border-t border-border pt-4 text-sm leading-[22px] text-body">
              Your limit is 500 emails in a rolling 24 hours, including reserved
              queue capacity. Gmail may enforce additional limits.
            </div>
          </section>
        </div>
        <div className="min-w-0 space-y-6">
          <Resume
            userId={user.id}
            fileName={attachment?.fileName ?? null}
            useBlob={
              !!process.env.BLOB_READ_WRITE_TOKEN ||
              process.env.NODE_ENV === "production"
            }
          />
          <section
            className="panel space-y-4 p-4 sm:p-6"
            aria-label="Appearance"
          >
            <h2 className="text-lg font-semibold leading-[26px]">Appearance</h2>
            <p className="text-sm leading-[22px] text-body">
              Choose a light or dark workspace, or follow your system
              preference.
            </p>
            <ThemeControl label="Color theme" />
          </section>
        </div>
      </div>
    </>
  );
}
