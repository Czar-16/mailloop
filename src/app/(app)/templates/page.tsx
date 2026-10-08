import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeading, EmptyState } from "@/components/common";
import { TemplateForm, DeleteButton } from "@/components/forms";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
export const metadata = { title: "Templates" };
async function TemplatesContent({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const where = { userId: user.id, archivedAt: null };
  const [templates, total, editing, contacts] = await Promise.all([
    db.template.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.template.count({ where }),
    params.edit
      ? db.template.findFirst({ where: { ...where, id: params.edit } })
      : null,
    db.contact.findMany({
      where: { userId: user.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        jobRole: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <TemplateForm
        key={editing?.id ?? "new"}
        template={editing ?? undefined}
        contacts={contacts}
        resumeUrl={user.resumeUrl}
      />
      <div className="mt-8">
        <h2 className="section-label mb-4">Saved templates</h2>
        <section className="space-y-4">
          {!templates.length ? (
            <EmptyState
              title="Your first introduction"
              description="Create a template alongside this list. Use placeholders to personalize each email."
            />
          ) : (
            templates.map((t) => (
              <article key={t.id} className="panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-semibold tracking-tight">
                      {t.name}
                    </h2>
                    <p className="mt-2 break-words text-sm text-body">
                      {t.subject}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Link
                      href={`/templates?edit=${t.id}`}
                      className="inline-flex min-h-11 items-center px-3 text-sm text-link"
                    >
                      Edit
                    </Link>
                    <DeleteButton id={t.id} kind="template" />
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-body">
                  {t.body}
                </p>
              </article>
            ))
          )}
          <Pagination path="/templates" page={page} total={total} />
        </section>
      </div>
    </>
  );
}

export default function Templates(
  props: Parameters<typeof TemplatesContent>[0],
) {
  return (
    <>
      <PageHeading
        eyebrow="Templates"
        title="Write once, personalise for everyone."
        description="Type on the left. The real email updates live on the right."
      />
      <Suspense
        fallback={<WorkspaceSkeleton page="templates" heading={false} />}
      >
        <TemplatesContent {...props} />
      </Suspense>
    </>
  );
}
