import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeading, EmptyState } from "@/components/common";
import { TemplateForm, DeleteButton } from "@/components/forms";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Templates" };
export default async function Templates({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const where = { userId: user.id, archivedAt: null };
  const [templates, total, editing] = await Promise.all([
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
  ]);
  return (
    <>
      <PageHeading
        title="Templates"
        description="Create and manage reusable messages for your email campaigns."
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <section className="min-w-0 space-y-4" aria-label="Saved templates">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2 className="text-lg font-semibold leading-[26px]">
              Saved Templates
            </h2>
            <p className="text-sm tabular-nums text-body">{total} saved</p>
          </div>
          {!templates.length ? (
            <EmptyState
              title="No templates yet"
              description="Create a template alongside this list. Use placeholders to personalize each email."
            />
          ) : (
            templates.map((t) => (
              <article key={t.id} className="panel p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold leading-[26px]">
                      {t.name}
                    </h3>
                    <p className="mt-2 break-words text-sm text-body">
                      {t.subject}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/templates?edit=${t.id}`}>Edit</Link>
                    </Button>
                    <DeleteButton id={t.id} kind="template" />
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words border-t border-border pt-4 text-sm leading-[22px] text-body">
                  {t.body}
                </p>
              </article>
            ))
          )}
          <Pagination path="/templates" page={page} total={total} />
        </section>
        <TemplateForm
          key={editing?.id ?? "new"}
          template={editing ?? undefined}
        />
      </div>
    </>
  );
}
