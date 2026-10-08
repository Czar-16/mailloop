import { DateTime } from "@/components/date-time";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeading, EmptyState } from "@/components/common";
import { ContactForm, DeleteButton } from "@/components/forms";
import { ContactImport } from "@/components/contact-import";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Contacts" };
export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 160);
  const page = pageNumber(params.page);
  const where = {
    userId: user.id,
    archivedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { company: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [contacts, total, existing, editing] = await Promise.all([
    db.contact.findMany({
      where,
      include: {
        sends: {
          where: {
            campaign: { userId: user.id },
            status: { in: ["SENT", "REPLIED"] },
          },
          select: { sentAt: true },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.contact.count({ where }),
    db.contact.findMany({
      where: { userId: user.id },
      select: { email: true },
    }),
    params.edit
      ? db.contact.findFirst({
          where: { id: params.edit, userId: user.id, archivedAt: null },
        })
      : null,
  ]);
  return (
    <>
      <PageHeading
        title="Contacts"
        description="Manage your recipients, job roles, and contact lists."
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="panel mb-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold leading-[26px]">
                Contact Directory
              </h2>
              <p className="text-sm tabular-nums text-body">{total} results</p>
            </div>
            <form method="get" action="/contacts" className="mt-4 flex gap-2">
              <label htmlFor="contact-search" className="sr-only">
                Search contacts
              </label>
              <Input
                id="contact-search"
                name="q"
                defaultValue={q}
                placeholder="Search names, emails, or companies…"
                autoComplete="off"
              />
              <Button variant="outline" type="submit">
                Search
              </Button>
            </form>
          </div>
          {!contacts.length ? (
            <EmptyState
              title={q ? "No contacts found" : "No contacts yet"}
              description={
                q
                  ? "Try another name, email, or company."
                  : "Add your first contact, or import a list below."
              }
            />
          ) : (
            <div
              role="region"
              aria-label="Contact directory table"
              tabIndex={0}
              className="panel overflow-x-auto"
            >
              <table
                role="table"
                className="responsive-table w-full min-w-0 text-sm sm:min-w-[680px]"
              >
                <caption className="sr-only">Your contacts</caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Person
                    </th>
                    <th role="columnheader" scope="col">
                      Company
                    </th>
                    <th role="columnheader" scope="col">
                      Job Role
                    </th>
                    <th role="columnheader" scope="col">
                      Last Sent
                    </th>
                    <th role="columnheader" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {contacts.map((c) => (
                    <tr role="row" key={c.id}>
                      <td role="cell">
                        <p className="sm:max-w-64 break-words font-medium">
                          {c.name}
                        </p>
                        <p className="mt-1 sm:max-w-64 break-all text-sm text-body">
                          {c.email}
                        </p>
                      </td>
                      <td
                        role="cell"
                        className="sm:max-w-40 break-words text-body"
                      >
                        <span className="mb-1 block text-xs text-body sm:hidden">
                          Company
                        </span>
                        {c.company || "—"}
                      </td>
                      <td
                        role="cell"
                        className="sm:max-w-40 break-words text-body"
                      >
                        <span className="mb-1 block text-xs text-body sm:hidden">
                          Job Role
                        </span>
                        {c.jobRole || "Choose a job role"}
                      </td>
                      <td
                        role="cell"
                        className="table-wide text-xs text-body sm:whitespace-nowrap"
                      >
                        <span className="mb-1 block text-xs text-body sm:hidden">
                          Last Sent
                        </span>
                        <DateTime
                          value={c.sends[0]?.sentAt?.toISOString() ?? null}
                        />
                      </td>
                      <td role="cell" className="table-wide">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/contacts?edit=${c.id}`}>Edit</Link>
                          </Button>
                          <DeleteButton id={c.id} kind="contact" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            path="/contacts"
            page={page}
            total={total}
            query={{ q }}
          />
          <div className="mt-8">
            <ContactImport
              roles={user.preferredRoles}
              existingEmails={existing.map((c) => c.email)}
            />
          </div>
        </section>
        <ContactForm
          key={editing?.id ?? "new"}
          contact={editing ?? undefined}
          roles={user.preferredRoles}
        />
      </div>
    </>
  );
}
