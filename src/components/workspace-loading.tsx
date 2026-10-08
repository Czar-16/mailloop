"use client";

import { usePathname } from "next/navigation";
import {
  Skeleton,
  WorkspaceSkeleton,
  type WorkspacePage,
} from "@/components/workspace-skeleton";

export function WorkspaceLoading({ shell = false }: { shell?: boolean }) {
  const pathname = usePathname();
  const page = pathname.split("/")[1];
  const current: WorkspacePage = [
    "compose",
    "templates",
    "history",
    "contacts",
    "settings",
  ].includes(page)
    ? (page as WorkspacePage)
    : "compose";
  if (!shell) return <WorkspaceSkeleton page={current} />;
  return (
    <>
      <div className="page-container pt-[18px]" aria-hidden="true">
        <div className="flex min-h-[54px] items-center justify-between gap-3">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-[54px] w-40" />
        </div>
        <div className="workspace-nav mt-3">
          {["w-20", "w-24", "w-20", "w-24", "w-20"].map((width, index) => (
            <Skeleton key={index} className={`h-11 shrink-0 ${width}`} />
          ))}
        </div>
      </div>
      <main id="main-content" className="page-container pt-[26px] pb-[60px]">
        <WorkspaceSkeleton page={current} />
      </main>
    </>
  );
}
