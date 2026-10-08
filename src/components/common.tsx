import { Mail, ArrowUpRight } from "lucide-react";
import Link from "next/link";
export function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-2 text-xl font-semibold tracking-tight"
      translate="no"
    >
      <span className="logo-mark">
        <Mail className="size-4" aria-hidden="true" />
      </span>
      mailloop
    </Link>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow mb-1 text-link">{eyebrow}</p>
        <h1 className="text-[34px] leading-tight">{title}</h1>
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
    <div className="panel px-6 py-16 text-center">
      <Mail className="mx-auto mb-4 size-6 text-body" aria-hidden="true" />
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
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
    QUEUED: "status-queued",
    SENT: "status-sent",
    FAILED: "status-failed",
    REPLIED: "status-replied",
  };
  return (
    <span className={`status-pill ${styles[status] ?? styles.QUEUED}`}>
      <span
        aria-hidden="true"
        className="status-dot size-1.5 rounded-full bg-current"
      />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
