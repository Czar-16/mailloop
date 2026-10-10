import Link from "next/link";
import { Wordmark } from "@/components/common";
export function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-8 px-6 py-10"
    >
      <Wordmark />
      <div>
        <h1 className="text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-body">
          Effective October 10, 2026 · Operated by Czar16
        </p>
      </div>
      <div className="space-y-8 text-sm leading-7 [&_h2]:mb-2 [&_h2]:text-xl [&_a]:text-link">
        {children}
      </div>
      <nav
        aria-label="Policy navigation"
        className="flex flex-wrap gap-6 text-sm text-link"
      >
        <Link href="/" className="inline-flex min-h-11 items-center">
          Home
        </Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center">
          Privacy Policy
        </Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center">
          Terms of Service
        </Link>
      </nav>
    </main>
  );
}
