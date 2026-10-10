"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function HistoryFilters({
  q,
  status,
  campaign,
}: {
  q: string;
  status: string;
  campaign?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      key={`${q}:${status}`}
      method="get"
      action="/history"
      className="mb-4 flex flex-wrap gap-3"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const name of ["q", "status", "campaign"]) {
          const value = fields.get(name);
          if (typeof value === "string" && value) params.set(name, value);
        }
        startTransition(() => {
          router.push(`/history?${params.toString()}`, { scroll: false });
        });
      }}
    >
      {campaign && <input type="hidden" name="campaign" value={campaign} />}
      <label htmlFor="history-search" className="sr-only">
        Search history
      </label>
      <Input
        id="history-search"
        name="q"
        type="search"
        defaultValue={q}
        className="min-w-44 flex-1"
        autoComplete="off"
        placeholder="Search recipients or companies…"
      />
      <label htmlFor="history-status" className="sr-only">
        Filter by status
      </label>
      <select
        id="history-status"
        name="status"
        defaultValue={status}
        className="text-sm"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">All Statuses</option>
        {["QUEUED", "SENT", "FAILED", "REPLIED", "CANCELLED"].map((value) => (
          <option key={value} value={value}>
            {value.charAt(0) + value.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
    </form>
  );
}
