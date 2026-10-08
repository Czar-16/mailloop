import { Mail, ArrowUpRight } from "lucide-react";
import Link from "next/link";
export function Wordmark({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 text-xl font-semibold tracking-tight"
      translate="no"
    >
      <Mail className="size-6 text-link" aria-hidden="true" />
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>
        mailloop
      </span>
    </Link>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-[34px] sm:text-[32px] sm:leading-10">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  href,
  link,
}: {
  title: string;
  description: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="panel px-4 py-10 text-center sm:px-6 sm:py-12">
      <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-sm bg-muted">
        <Mail className="size-5 text-body" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold leading-[26px]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-body">
        {description}
      </p>
      {href && (
        <Link
          href={href}
          className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link"
        >
          {link}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function Status({ status }: { status: string }) {
  const styles: Record<string, string> = {
    QUEUED: "border-warning/25 bg-warning-soft text-warning",
    ATTEMPTING: "border-warning/25 bg-warning-soft text-warning",
    UNCERTAIN: "border-warning/25 bg-warning-soft text-warning",
    SENT: "border-success/25 bg-success-soft text-success",
    FAILED: "border-destructive/25 bg-destructive-soft text-destructive",
    REPLIED: "border-link/25 bg-accent-soft text-link",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium leading-[18px] ${styles[status] ?? styles.QUEUED}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status === "UNCERTAIN"
        ? "Delivery needs review"
        : status === "ATTEMPTING"
          ? "Sending"
          : status.toLowerCase()}
    </span>
  );
}
