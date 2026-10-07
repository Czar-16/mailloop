"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
export function DateTime({ value }: { value: string | null }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!value) return <span>—</span>;
  return (
    <time dateTime={value}>
      {hydrated
        ? new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(value))
        : value.slice(0, 16).replace("T", " ") + " UTC"}
    </time>
  );
}
