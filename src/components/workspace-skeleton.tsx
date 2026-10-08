import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WorkspacePage =
  "compose" | "templates" | "history" | "contacts" | "settings";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("skeleton rounded-sm", className)} />
  );
}

function FieldSkeleton({ multiline = false }: { multiline?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-36 max-w-full" />
      <Skeleton className={multiline ? "h-56 w-full" : "h-11 w-full"} />
    </div>
  );
}

function CardSkeleton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel min-w-0 space-y-4 p-5", className)}>
      <Skeleton className="h-4 w-40 max-w-full" />
      {children}
    </div>
  );
}

export function ShortlistSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-[14px] border border-border bg-surface p-3"
        >
          <div className="flex min-h-11 items-center gap-3">
            <Skeleton className="size-[18px] shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
          <Skeleton className="mt-2 ml-7 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel overflow-x-auto" aria-hidden="true">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {Array.from({ length: 5 }, (_, index) => (
              <th key={index}>
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: 5 }, (_, column) => (
                <td key={column}>
                  <Skeleton
                    className={
                      column === 4 ? "h-7 w-20 rounded-full" : "h-4 w-24"
                    }
                  />
                  {column === 0 && <Skeleton className="mt-2 h-3 w-32" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SearchSkeleton({ label = true }: { label?: boolean }) {
  return (
    <div className="mb-[18px] space-y-2" aria-hidden="true">
      {label && <Skeleton className="h-4 w-32" />}
      <div className="flex gap-2">
        <Skeleton className="h-11 min-w-0 flex-1" />
        <Skeleton className="h-11 w-20 shrink-0" />
      </div>
    </div>
  );
}

function RingSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-[22px]" aria-hidden="true">
      <Skeleton className="size-[170px] rounded-full" />
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-4 w-24" />
        ))}
      </div>
    </div>
  );
}

export function PageContentSkeleton({
  page,
  showProgress = false,
}: {
  page: WorkspacePage;
  showProgress?: boolean;
}) {
  if (page === "compose") {
    return (
      <>
        <SearchSkeleton />
        <div className="compose-grid">
          <div className="space-y-[18px]">
            <CardSkeleton>
              <FieldSkeleton />
              <Skeleton className="h-11 w-36" />
              <FieldSkeleton />
              <Skeleton className="h-9 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-11 w-28 rounded-full" />
                <Skeleton className="h-11 w-40 rounded-full" />
              </div>
              <Skeleton className="h-11 w-48 max-w-full" />
            </CardSkeleton>
            <CardSkeleton>
              <Skeleton className="h-10 w-full" />
              <FieldSkeleton />
              <ShortlistSkeleton />
            </CardSkeleton>
          </div>
          <div className="space-y-[18px]">
            <CardSkeleton>
              <FieldSkeleton />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-5 w-40 max-w-full" />
            </CardSkeleton>
            <CardSkeleton>
              <RingSkeleton />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-11 w-full" />
            </CardSkeleton>
          </div>
        </div>
      </>
    );
  }
  if (page === "templates") {
    return (
      <>
        <div className="template-grid">
          <CardSkeleton>
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton multiline />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-11 w-24 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-11 w-40" />
          </CardSkeleton>
          <CardSkeleton>
            <FieldSkeleton />
            <div className="mail-preview space-y-4 p-4">
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-52 w-full" />
            </div>
            <Skeleton className="h-5 w-4/5" />
          </CardSkeleton>
        </div>
        <div className="mt-8 space-y-4">
          <Skeleton className="h-4 w-40" />
          <CardSkeleton>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </CardSkeleton>
        </div>
      </>
    );
  }
  if (page === "history") {
    return (
      <>
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <CardSkeleton key={index} className="p-6">
              <Skeleton className="h-[51px] w-20" />
              <Skeleton className="h-10 w-full" />
            </CardSkeleton>
          ))}
        </div>
        {showProgress && (
          <CardSkeleton className="mb-[18px]">
            <RingSkeleton />
            <Skeleton className="h-5 w-48 max-w-full" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </CardSkeleton>
        )}
        <SearchSkeleton label={false} />
        <TableSkeleton />
        <Skeleton className="mt-6 h-4 w-40" />
      </>
    );
  }
  if (page === "contacts") {
    return (
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <SearchSkeleton />
          <TableSkeleton />
          <Skeleton className="mt-6 h-4 w-40" />
          <div className="mt-8">
            <CardSkeleton>
              <Skeleton className="h-4 w-3/4" />
              <div className="space-y-2 py-2">
                {[0, 1, 2, 3, 4].map((index) => (
                  <Skeleton key={index} className="h-4 w-3/4" />
                ))}
              </div>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-44 w-full" />
              <FieldSkeleton multiline />
              <FieldSkeleton />
              <Skeleton className="h-11 w-40" />
            </CardSkeleton>
          </div>
        </div>
        <CardSkeleton className="space-y-4 p-6">
          {[0, 1, 2, 3].map((index) => (
            <FieldSkeleton key={index} />
          ))}
          <Skeleton className="h-11 w-32" />
        </CardSkeleton>
      </div>
    );
  }
  return (
    <>
      <CardSkeleton className="mb-6 p-6">
        <FieldSkeleton />
        <FieldSkeleton />
        <Skeleton className="h-11 w-40" />
      </CardSkeleton>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <CardSkeleton className="p-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-11 w-40" />
        </CardSkeleton>
        <CardSkeleton className="p-6">
          <Skeleton className="h-16 w-full" />
          <FieldSkeleton />
          <Skeleton className="h-11 w-40" />
        </CardSkeleton>
      </div>
      <div className="mt-6">
        <CardSkeleton className="p-6">
          <Skeleton className="h-14 w-full" />
        </CardSkeleton>
      </div>
    </>
  );
}

export function WorkspaceSkeleton({
  page,
  heading = true,
  showProgress = false,
}: {
  page: WorkspacePage;
  heading?: boolean;
  showProgress?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={`Loading ${page}`}>
      <span className="sr-only">Loading {page}…</span>
      {heading && (
        <div className="mb-6 space-y-2" aria-hidden="true">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-[43px] w-full max-w-xl" />
          <Skeleton className="h-6 w-full max-w-2xl" />
        </div>
      )}
      <PageContentSkeleton page={page} showProgress={showProgress} />
    </div>
  );
}
