import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { ArrowRight, Mail } from "lucide-react";
import { auth, signIn } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ThemeSwitch } from "@/components/landing/theme-switch";
import { BatchProgressCard } from "@/components/landing/batch-progress-card";
import { FeatureCards } from "@/components/landing/feature-cards";
import "@/components/landing/landing.css";

const headings = Bricolage_Grotesque({
  variable: "--font-landing-heading",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});
const body = DM_Sans({
  variable: "--font-landing-body",
  subsets: ["latin"],
  display: "swap",
});

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Mailloop — Personalized outreach, made easy" },
  description:
    "Send up to 15 personalized cold emails at once from your own Gmail. Attach your resume and track delivery and replies with Mailloop.",
};

const steps = [
  [
    "01",
    "Write your template",
    "Draft once with placeholders for name and company. Save it to reuse.",
  ],
  [
    "02",
    "Pick up to 15 contacts",
    "Choose from your saved contacts and attach your resume.",
  ],
  [
    "03",
    "Send, then follow",
    "One click sends individual emails from your Gmail. Watch delivery and replies.",
  ],
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (user) redirect("/compose");
  }
  const { error } = await searchParams;
  const googleSignIn = async () => {
    "use server";
    await signIn("google", { redirectTo: "/compose" });
  };
  return (
    <div className={`landing ${headings.variable} ${body.variable}`}>
      <header className="landing-container landing-header">
        <Link
          href="/"
          className="landing-logo"
          aria-label="Mailloop home"
          translate="no"
        >
          <span className="landing-logo-mark">
            <Mail size={22} aria-hidden="true" />
          </span>
          <span>mailloop</span>
        </Link>
        <div className="landing-header-controls">
          <nav aria-label="Main navigation" className="landing-nav">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
          </nav>
          <ThemeSwitch />
          <form action={googleSignIn}>
            <button
              type="submit"
              className="landing-button landing-button-outline"
            >
              Sign in
            </button>
          </form>
        </div>
      </header>
      <main id="main-content" className="landing-container">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="min-w-0">
            <p className="landing-eyebrow">Personalized outreach, made easy.</p>
            <h1 id="hero-title">
              Send up to <span className="landing-gradient-text">15</span> cold
              emails at <span className="landing-gradient-text">once</span>.
            </h1>
            <p className="landing-hero-copy">
              Write once, then send a separate, personalized email to each
              recruiter from your own Gmail. Your resume attached. Replies
              tracked.
            </p>
            {error && (
              <p role="alert" className="landing-auth-error">
                Google sign-in could not complete. Try again and grant Gmail
                permissions.
              </p>
            )}
            <div className="landing-hero-actions">
              <form action={googleSignIn}>
                <button type="submit" className="landing-button">
                  Get started with Google{" "}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </form>
              <p>
                Free to start.
                <br className="hidden sm:block" /> Sends from your Gmail.
              </p>
            </div>
            <p className="mt-3 text-xs leading-5 text-body">
              By signing in, you agree to the{" "}
              <Link href="/terms" className="inline-flex min-h-11 items-center">
                Terms
              </Link>{" "}
              and acknowledge the{" "}
              <Link
                href="/privacy"
                className="inline-flex min-h-11 items-center"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <BatchProgressCard />
        </section>
        <section
          id="how"
          className="landing-section"
          aria-labelledby="how-title"
        >
          <p className="landing-eyebrow">From draft to conversation</p>
          <h2 id="how-title">Three steps. Each email goes out on its own.</h2>
          <div className="landing-card-grid">
            {steps.map(([number, title, copy]) => (
              <article key={number} className="landing-glow-card landing-step">
                <span className="landing-step-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <FeatureCards />
        <section className="landing-closing" aria-labelledby="closing-title">
          <div className="landing-closing-glow" aria-hidden="true" />
          <div className="relative">
            <p className="landing-eyebrow">Ready when you are</p>
            <h2 id="closing-title">
              Your next <span className="landing-gradient-text">15 intros</span>{" "}
              are one click away.
            </h2>
            <p className="landing-closing-copy">
              Connect Gmail, pick your template, and send. We’ll show you every
              delivery and reply.
            </p>
            <form action={googleSignIn}>
              <button
                type="submit"
                className="landing-button landing-button-gradient"
              >
                Start sending <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
            <ul className="landing-closing-benefits">
              <li>Sends from your Gmail</li>
              <li>One email per person</li>
              <li>Replies tracked</li>
            </ul>
          </div>
        </section>
      </main>
      <footer className="landing-container">
        <div className="landing-footer">
          <span className="landing-footer-wordmark" translate="no">
            mailloop
          </span>
          <p>Personalized outreach, made easy.</p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link href="/privacy" className="inline-flex min-h-11 items-center">
              Privacy Policy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
