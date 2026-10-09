import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { quotaWhere } from "@/lib/campaigns";

// Request-local memoization keeps the header and Compose on the same snapshot.
export const readQuotaUsage = cache((userId: string) =>
  db.send.count({ where: quotaWhere(userId) }),
);
