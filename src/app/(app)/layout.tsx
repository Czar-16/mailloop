import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Wordmark } from "@/components/common";
import { Navigation } from "@/components/navigation";
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
    <>
      <header className="border-b border-border bg-card">
        <div className="page-container flex flex-wrap items-center justify-between gap-3 py-4">
          <Wordmark />
          <div className="flex min-w-0 items-center gap-3">
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
          <div className="w-full pt-1">
            <Navigation />
          </div>
        </div>
      </header>
      <main id="main-content" className="page-container py-10 sm:py-12">
        {!user.preferredRoles.length && (
          <RoleSetup resumeUrl={user.resumeUrl} />
        )}
        {children}
      </main>
      <footer className="page-container border-t border-border py-6 text-xs text-body">
        <span translate="no">Mailloop</span> · Thoughtful outreach, one
        introduction at a time.
      </footer>
    </>
  );
}
