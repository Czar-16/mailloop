import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { CampaignProgress } from "@/components/campaign-progress";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { quotaWhere } from "@/lib/campaigns";
import { PageHeading, EmptyState, Status } from "@/components/common";
import { HistoryControls } from "@/components/history-controls";
import { DateTime } from "@/components/date-time";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const focused = params.campaign
    ? await db.campaign.findFirst({
        where: { id: params.campaign, userId: user.id },
        select: {
          id: true,
          createdAt: true,
          sends: {
            select: {
              status: true,
              deliveryState: true,
              dispatchedAt: true,
              sentAt: true,
              attemptedAt: true,
            },
          },
        },
      })
    : null;
  const outstanding = focused
    ? await db.send.count({
        where: {
          campaign: { userId: user.id },
          status: "QUEUED",
          deliveryState: { not: "UNCERTAIN" },
        },
      })
    : 0;
  const progress = focused
    ? {
        id: focused.id,
        observedAt: new Date().toISOString(),
        createdAt: focused.createdAt.toISOString(),
        finishedAt: focused.sends.every(
          (s) => s.status !== "QUEUED" && s.deliveryState !== "UNCERTAIN",
        )
          ? (focused.sends
              .map((s) => s.sentAt ?? s.attemptedAt ?? focused.createdAt)
              .sort((a, b) => b.getTime() - a.getTime())[0]
              ?.toISOString() ?? focused.createdAt.toISOString())
          : null,
        queued: focused.sends.filter(
          (s) => s.status === "QUEUED" && s.deliveryState !== "UNCERTAIN",
        ).length,
        sent: focused.sends.filter(
          (s) =>
            ["SENT", "REPLIED"].includes(s.status) &&
            s.deliveryState !== "UNCERTAIN",
        ).length,
        failed: focused.sends.filter(
          (s) => s.status === "FAILED" && s.deliveryState !== "UNCERTAIN",
        ).length,
        review: focused.sends.filter((s) => s.deliveryState === "UNCERTAIN")
          .length,
        pendingDispatch: focused.sends.some(
          (s) =>
            s.status === "QUEUED" &&
            !s.dispatchedAt &&
            s.deliveryState !== "UNCERTAIN",
        ),
        outstanding,
        nextSendAt: user.nextSendAt?.toISOString() ?? null,
      }
    : null;
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
            note: "Conversations started · checked every 15 minutes",
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
      {progress && <CampaignProgress data={progress} />}
      <form
        method="get"
        action="/history"
        className="mb-4 flex flex-wrap gap-3"
      >
        {focused && <input type="hidden" name="campaign" value={focused.id} />}
        <label htmlFor="history-search" className="sr-only">
          Search history
        </label>
        <Input
          id="history-search"
          name="q"
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
          defaultValue={status ?? ""}
          className="text-sm"
        >
          <option value="">All Statuses</option>
          {["QUEUED", "SENT", "FAILED", "REPLIED"].map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
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
                <th>Template</th>
                <th>Sent</th>
                <th>Status</th>
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
                  <td className="max-w-40 break-words text-body">
                    {s.recipientCompany || "—"}
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
        query={{ q, status: status ?? "", campaign: focused?.id ?? "" }}
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
