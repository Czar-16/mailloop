import Link from "next/link";
import { ArrowRight, Files, Users, Send, Paperclip, Check } from "lucide-react";
import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/common";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user.id) redirect("/compose");
  const { error } = await searchParams;
  const googleSignIn = async () => {
    "use server";
    await signIn("google", { redirectTo: "/compose" });
  };
  return (
    <>
      <header className="border-b border-border">
        <div className="page-container flex items-center justify-between py-4">
          <Wordmark />
          <form action={googleSignIn}>
            <Button variant="outline">
              Sign In <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </div>
      </header>
      <main id="main-content">
        <section className="relative isolate overflow-hidden border-b border-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 top-0 -z-10 h-[560px] w-[700px] opacity-25 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at 30% 30%, #00dfd8, transparent 45%), radial-gradient(ellipse at 70% 45%, #7928ca, transparent 45%), radial-gradient(ellipse at 55% 70%, #ff0080, transparent 40%), radial-gradient(ellipse at 90% 85%, #f9cb28, transparent 45%)",
            }}
          />
          <div className="page-container grid items-center gap-12 py-24 lg:grid-cols-2 lg:py-32">
            <div>
              <p className="eyebrow mb-6">A better way to reach out</p>
              <h1 className="max-w-xl text-[40px] leading-[44px] sm:text-5xl sm:leading-[48px]">
                Your next opportunity
                <br />
                starts with an introduction.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-body">
                Write once. Make it personal. Send thoughtful cold emails to up
                to 15 people, individually, from your own Gmail.
              </p>
              {error && (
                <p role="alert" className="mt-4 text-sm text-error-deep">
                  Google sign-in could not complete. Try again and grant Gmail
                  permissions.
                </p>
              )}
              <form action={googleSignIn} className="mt-8">
                <Button className="w-full rounded-full px-6 sm:w-auto">
                  Get Started with Google <ArrowRight aria-hidden="true" />
                </Button>
              </form>
              <p className="mt-4 text-xs text-body">
                Your Gmail. Your resume. Your next chapter.
              </p>
            </div>
            <div className="panel overflow-hidden shadow-[0_1px_1px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <span className="eyebrow">A personal introduction</span>
                <span className="text-xs text-body">Preview</span>
              </div>
              <div className="space-y-4 p-6 text-sm leading-6">
                <p className="text-body">
                  To <span className="ml-3 text-foreground">Alex at Acme</span>
                </p>
                <p className="border-b border-border pb-4 font-medium">
                  A frontend engineer for your next chapter
                </p>
                <p>Hi Alex,</p>
                <p className="text-body">
                  I’ve been following the work at Acme and would love to
                  contribute as a frontend engineer.
                </p>
                <p className="text-body">
                  I’ve attached my resume. Would you be open to a quick
                  conversation?
                </p>
                <p>
                  Thanks,
                  <br />
                  Your name
                </p>
                <div className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs">
                  <Paperclip className="size-3" aria-hidden="true" />
                  Resume.pdf
                </div>
              </div>
              <div className="border-t border-border bg-background px-6 py-4 text-xs text-body">
                <Check className="mr-2 inline size-3" aria-hidden="true" />
                One recipient. One individual email.
              </div>
            </div>
          </div>
        </section>
        <section className="page-container py-16 sm:py-24">
          <p className="eyebrow mb-4">From draft to conversation</p>
          <h2 className="text-[32px] font-semibold leading-10 tracking-tight">
            Less busywork. More possibility.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Files,
                title: "Find your words",
                body: "Save reusable templates. Personalize each introduction with a name, company, and role.",
              },
              {
                icon: Users,
                title: "Build your shortlist",
                body: "Add contacts or import a CSV. Catch duplicates before they become awkward follow-ups.",
              },
              {
                icon: Send,
                title: "Make the connection",
                body: "Send separately from Gmail. Track delivery and replies while Mailloop handles the queue.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="panel p-6">
                <Icon className="mb-6 size-5" aria-hidden="true" />
                <h3 className="text-xl font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-body">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="page-container flex flex-wrap items-center justify-between gap-4 py-8">
          <Wordmark />
          <span className="text-xs text-body">
            Built for your next chapter.
          </span>
          <Link
            href="https://myaccount.google.com/connections"
            className="min-h-11 py-3 text-xs text-link"
          >
            Manage Google Permissions
          </Link>
        </div>
      </footer>
    </>
  );
}
