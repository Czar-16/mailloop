"use client";

import { useRouter } from "next/navigation";

export function GmailStatus({ connected }: { connected: boolean }) {
  const router = useRouter();
  const content = (
    <>
      <span className="workspace-gmail-dot" aria-hidden="true" />
      Gmail {connected ? "connected" : "not connected"}
    </>
  );
  return connected ? (
    <span className="workspace-gmail" data-connected="true">
      {content}
    </span>
  ) : (
    <button
      type="button"
      className="workspace-gmail"
      data-connected="false"
      onClick={() => router.push("/settings")}
    >
      {content}
    </button>
  );
}
