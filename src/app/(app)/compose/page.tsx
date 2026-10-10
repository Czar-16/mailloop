import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import Form from "next/form";
import { requireUser } from "@/lib/session";
import { readShortlist } from "@/lib/shortlist";
import { db } from "@/lib/db";
import { readQuotaUsage } from "@/lib/quota-usage";
import { PageHeading } from "@/components/common";
import { InfinityMailLoop } from "@/components/InfinityMailLoop";
import { Compose } from "@/components/compose";
import { Input } from "@/components/ui/input";
import { SearchButton } from "@/components/search-button";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
export const metadata = { title: "Compose" };
async function ComposePageContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 160);
  const page = pageNumber(params.page);
  const [templates, shortlist, used, attachment] = await Promise.all([
    db.template.findMany({
      where: { userId: user.id, archivedAt: null },
      select: { id: true, name: true, subject: true, body: true },
      orderBy: { name: "asc" },
    }),
    readShortlist(user.id, q, page),
    readQuotaUsage(user.id),
    user.currentAttachmentId
      ? db.attachment.findFirst({
          where: { id: user.currentAttachmentId, userId: user.id },
          select: { fileName: true },
        })
      : null,
  ]);
  const { contacts, total } = shortlist;
  const recipients = contacts.map((c) => ({
    ...c,
    lastSent: c.lastSent?.toISOString() ?? null,
  }));
  return (
    <>
      <Form
        action="/compose"
        className="mb-[18px] grid grid-cols-[minmax(0,1fr)_auto] gap-2"
      >
        <label
          htmlFor="compose-search"
          className="col-span-2 text-xs font-medium"
        >
          Search recipients
        </label>
        <Input
          id="compose-search"
          name="q"
          defaultValue={q}
          autoComplete="off"
          placeholder="Find a recipient by name, email, or company…"
        />
        <SearchButton />
      </Form>
      <Compose
        templates={templates}
        contacts={recipients}
        used={used}
        roles={user.preferredRoles}
        resume={attachment?.fileName ?? null}
        connected={user.gmailAuthorized && !!user.encryptedRefreshToken}
      />
      <Pagination path="/compose" page={page} total={total} query={{ q }} />
    </>
  );
}

export default function ComposePage(
  props: Parameters<typeof ComposePageContent>[0],
) {
  return (
    <div className="compose-page">
      <div className="compose-hero">
        <PageHeading
          eyebrow="A thoughtful introduction"
          title="Make your next connection."
          description="Choose your words, build a shortlist, and see exactly what each person will receive."
        />
        <InfinityMailLoop />
      </div>
      <Suspense fallback={<WorkspaceSkeleton page="compose" heading={false} />}>
        <ComposePageContent {...props} />
      </Suspense>
    </div>
  );
}
