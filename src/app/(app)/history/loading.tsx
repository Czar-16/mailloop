"use client";

import { useSearchParams } from "next/navigation";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

export default function Loading() {
  const params = useSearchParams();
  return (
    <WorkspaceSkeleton page="history" showProgress={!!params.get("campaign")} />
  );
}
