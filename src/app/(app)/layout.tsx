import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Wordmark } from "@/components/common";
import { Navigation } from "@/components/navigation";
import { AccountMenu } from "@/components/account-menu";
import { RoleSetup } from "@/components/preferences";
import { ThemeControl } from "@/components/theme";
import { PageTransition } from "@/components/page-transition";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { NotificationProvider } from "@/components/notifications";
import { WorkspaceQuotaProvider } from "@/components/workspace-quota";
import { GmailStatus } from "@/components/gmail-status";
import { readQuotaUsage } from "@/lib/quota-usage";
import { HelpTutorial } from "@/components/help-tutorial";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const used = await readQuotaUsage(user.id);
  return (
    <NotificationProvider>
      <WorkspaceQuotaProvider used={used}>
        <header className="">
          <div className="page-container flex flex-wrap items-center justify-between gap-3 pt-[18px]">
            <div className="workspace-header-brand">
              <Wordmark />
            </div>
            <div className="workspace-header-controls">
              <GmailStatus
                connected={user.gmailAuthorized && !!user.encryptedRefreshToken}
              />
              <ThemeControl />
              <AccountMenu
                name={user.name}
                email={user.email}
                signOut={async () => {
                  "use server";
                  await requireUser();
                  await signOut({ redirectTo: "/" });
                }}
              />
            </div>
            <div className="w-full pt-1 pb-0">
              <Navigation />
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="page-container pt-[26px] pb-[60px]"
        >
          {!user.preferredRoles.length && <RoleSetup />}
          <PageTransition>{children}</PageTransition>
        </main>
        <footer className="page-container workspace-footer">
          <div className="workspace-footer-content">
            <div className="workspace-footer-brand">
              <Wordmark />
              <p className="workspace-brand-tagline">
                Personalized outreach, made easy.
              </p>
            </div>
            <a
              className="workspace-footer-credit"
              href="https://x.com/itsCzar16"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Made by Czar16 — visit Czar16 on X (opens in a new tab)"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932 6.064-6.933Zm-1.29 19.49h2.039L6.487 3.24H4.3l13.31 17.403Z" />
              </svg>
              <span>
                Made by <span translate="no">Czar16</span>
              </span>
            </a>
          </div>
        </footer>
        <HelpTutorial />
      </WorkspaceQuotaProvider>
    </NotificationProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceLoading shell />}>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </Suspense>
  );
}
