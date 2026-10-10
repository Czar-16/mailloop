import { Prisma } from "@/generated/prisma/client";
import { contactDeliveryState } from "@/lib/shortlist";
import { AddToShortlist } from "@/components/add-to-shortlist";
import { TableValue } from "@/components/table-value";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { readCampaignProgress } from "@/lib/campaign-progress";
import { CampaignProgress } from "@/components/campaign-progress";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { quotaWhere } from "@/lib/campaigns";
import { PageHeading, EmptyState, Status } from "@/components/common";
import { HistoryFilters } from "@/components/history-filters";
import { HistoryControls } from "@/components/history-controls";
import { DateTime } from "@/components/date-time";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
export const metadata = { title: "History" };
async function HistoryContent({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    campaign?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const q = (params.q ?? "").slice(0, 160);
  const status = ["QUEUED", "SENT", "FAILED", "REPLIED"].includes(
    params.status ?? "",
  )
    ? (params.status as "QUEUED" | "SENT" | "FAILED" | "REPLIED")
    : undefined;
  const where = {
    campaign: { userId: user.id },
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { recipientEmail: { contains: q, mode: "insensitive" as const } },
            { recipientName: { contains: q, mode: "insensitive" as const } },
            { recipientCompany: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const sent = {
    campaign: { userId: user.id },
    status: { in: ["SENT" as const, "REPLIED" as const] },
  };
  const [sends, total, today, allTime, replies, used, queued] =
    await Promise.all([
      db.send.findMany({
        where,
        select: {
          id: true,
          recipientName: true,
          recipientEmail: true,
          recipientCompany: true,
          recipientRole: true,
          contactId: true,
          templateName: true,
          status: true,
          sentAt: true,
          error: true,
          dispatchedAt: true,
          deliveryState: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: (page - 1) * 20,
      }),
      db.send.count({ where }),
      db.send.count({ where: { ...sent, sentAt: { gte: day } } }),
      db.send.count({ where: sent }),
      db.send.count({
        where: { campaign: { userId: user.id }, status: "REPLIED" },
      }),
      db.send.count({ where: quotaWhere(user.id) }),
      db.send.count({
        where: { campaign: { userId: user.id }, status: "QUEUED" },
      }),
    ]);
  const contactIds = [...new Set(sends.map((s) => s.contactId))];
  const contactStates = contactIds.length
    ? await db.$queryRaw<
        {
          id: string;
          archivedAt: Date | null;
          blocked: boolean;
          followUp: boolean;
        }[]
      >(Prisma.sql`
    SELECT c.id, c."archivedAt", state.blocked, state."followUp"
    FROM "Contact" c CROSS JOIN LATERAL (${contactDeliveryState}) state
    WHERE c."userId" = ${user.id} AND c.id IN (${Prisma.join(contactIds)})
  `)
    : [];
  const states = new Map(contactStates.map((c) => [c.id, c]));
  // Initial visits show only the live queue; completion belongs to client visit state.
  const progress = await readCampaignProgress(user);
  return (
    <>
      <PageHeading
        eyebrow="Every introduction, in view"
        title="History"
        description="Follow your messages from the queue to a new conversation."
        action={
          <HistoryControls
            hasQueued={queued > 0}
            autoRefresh={!progress || (!progress.queued && !progress.review)}
          />
        }
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Sent Today",
            value: today,
            note: `UTC day · ${used} / 500 used or reserved in 24h`,
          },
          {
            label: "In queue",
            value: queued,
            note: `${allTime} sent in total · sends spaced 20–60 seconds apart`,
          },
          {
            label: "Replies",
            value: replies,
            note: "Conversations started · checked every 8 hours",
          },
        ].map((s) => (
          <div key={s.label} className="panel p-6">
            <p className="text-sm text-body">{s.label}</p>
            <p
              className={`mt-3 text-[34px] font-bold tracking-tight tabular-nums ${s.label === "In queue" ? "text-warning" : ""}`}
            >
              {new Intl.NumberFormat("en").format(s.value)}
            </p>
            <p className="mt-2 text-xs leading-5 text-body">{s.note}</p>
          </div>
        ))}
      </div>
      <CampaignProgress data={progress} />
      <HistoryFilters q={q} status={status ?? ""} campaign={params.campaign} />
      {!sends.length ? (
        <EmptyState
          title="Your introductions start here"
          description="Once you send a campaign, each recipient’s delivery and replies will appear here."
          href="/compose"
          link="Compose an Email"
        />
      ) : (
        <div
          role="region"
          aria-label="Delivery history table"
          tabIndex={0}
          className="panel overflow-x-auto"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Email delivery history</caption>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Company</th>
                <th>Job Role</th>
                <th>Template</th>
                <th>Sent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((s) => (
                <tr key={s.id}>
                  <td>
                    <p className="max-w-56 break-words font-medium">
                      {s.recipientName}
                    </p>
                    <p className="mt-1 max-w-56 break-all text-xs text-body">
                      {s.recipientEmail}
                    </p>
                  </td>
                  <td className="text-body">
                    <TableValue value={s.recipientCompany} singleLine />
                  </td>
                  <td className="whitespace-nowrap">
                    <TableValue value={s.recipientRole} singleLine />
                  </td>
                  <td className="max-w-40 break-words text-body">
                    {s.templateName}
                  </td>
                  <td className="whitespace-nowrap text-xs text-body">
                    <DateTime value={s.sentAt?.toISOString() ?? null} />
                  </td>
                  <td>
                    {s.deliveryState === "UNCERTAIN" ? (
                      <span className="text-warning">
                        Delivery needs review
                      </span>
                    ) : (
                      <Status status={s.status} />
                    )}
                    {s.error && (
                      <p className="mt-2 max-w-64 break-words text-xs leading-5 text-error-deep">
                        {s.error}
                      </p>
                    )}
                    {s.status === "QUEUED" && !s.dispatchedAt && (
                      <p className="mt-2 text-xs text-body">
                        Waiting for delivery service
                      </p>
                    )}
                  </td>
                  <td>
                    {["SENT", "REPLIED"].includes(s.status) && (
                      <AddToShortlist
                        sendId={s.id}
                        inShortlist={states.get(s.contactId)?.followUp ?? false}
                        blocked={states.get(s.contactId)?.blocked ?? false}
                        active={
                          !!states.get(s.contactId) &&
                          !states.get(s.contactId)?.archivedAt
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        path="/history"
        page={page}
        total={total}
        query={{ q, status: status ?? "", campaign: params.campaign ?? "" }}
      />
    </>
  );
}

export default async function History(
  props: Parameters<typeof HistoryContent>[0],
) {
  const params = await props.searchParams;
  return (
    <Suspense
      fallback={
        <WorkspaceSkeleton page="history" showProgress={!!params.campaign} />
      }
    >
      <HistoryContent {...props} />
    </Suspense>
  );
}
