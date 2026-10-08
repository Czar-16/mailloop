import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Wordmark } from "@/components/common";
import { Sidebar } from "@/components/sidebar";
import { AccountMenu } from "@/components/account-menu";
import { RoleSetup } from "@/components/preferences";
import { ThemeControl } from "@/components/theme";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh lg:pl-60">
      <header className="border-b border-border bg-sidebar">
        <div className="page-container flex min-h-18 items-center justify-between gap-2 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sidebar />
            <div className="lg:hidden">
              <Wordmark compact />
            </div>
            <span className="hidden text-sm text-muted-foreground lg:block">
              Your outreach workspace
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <ThemeControl />
            <span className="hidden max-w-64 truncate text-sm text-body md:block">
              {user.email}
            </span>
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
        </div>
      </header>
      <main
        id="main-content"
        className="workspace-content page-container py-6 sm:py-8"
      >
        {!user.preferredRoles.length && (
          <RoleSetup resumeUrl={user.resumeUrl} />
        )}
        {children}
      </main>
      <footer className="page-container border-t border-border py-6 text-xs text-muted-foreground">
        <span translate="no">Mailloop</span> · Thoughtful outreach, one
        introduction at a time.
      </footer>
    </div>
  );
}
