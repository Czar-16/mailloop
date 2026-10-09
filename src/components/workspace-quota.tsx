"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const QuotaContext = createContext<{
  used: number;
  update: (used: number) => void;
} | null>(null);

export function WorkspaceQuotaProvider({
  used,
  children,
}: {
  used: number;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState({ source: used, used });
  if (snapshot.source !== used) setSnapshot({ source: used, used });
  const update = useCallback((value: number) => {
    setSnapshot((current) =>
      current.used === value ? current : { ...current, used: value },
    );
  }, []);
  return (
    <QuotaContext value={{ used: snapshot.used, update }}>
      {children}
    </QuotaContext>
  );
}

export function useWorkspaceQuota(source?: number) {
  const context = useContext(QuotaContext);
  if (!context) throw new Error("Workspace quota requires its provider.");
  const { used, update } = context;
  useEffect(() => {
    if (source !== undefined) update(source);
  }, [source, update]);
  return used;
}

