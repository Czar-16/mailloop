import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Wordmark } from "@/components/common";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
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
            <span className="hidden max-w-56 truncate text-sm text-body sm:block">
              {user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await requireUser();
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="ghost" type="submit">
                Sign Out
              </Button>
            </form>
          </div>
          <div className="w-full pt-1">
            <Navigation />
          </div>
        </div>
      </header>
      <main id="main-content" className="page-container py-10 sm:py-12">
        {children}
      </main>
      <footer className="page-container border-t border-border py-6 text-xs text-body">
        <span translate="no">Mailloop</span> · Thoughtful outreach, one
        introduction at a time.
      </footer>
    </>
  );
}
