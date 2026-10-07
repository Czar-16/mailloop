import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
export function Pagination({
  page,
  total,
  pageSize = 20,
  path,
  query = {},
}: {
  page: number;
  total: number;
  pageSize?: number;
  path: string;
  query?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    `${path}?${new URLSearchParams({ ...query, page: String(p) })}`;
  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-between gap-3"
    >
      <span className="text-xs text-body">
        Page {page} of {pages} · {total} results
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className={buttonVariants({ variant: "outline" })}
          >
            Previous
          </Link>
        )}
        {page < pages && (
          <Link
            href={href(page + 1)}
            className={buttonVariants({ variant: "outline" })}
          >
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
