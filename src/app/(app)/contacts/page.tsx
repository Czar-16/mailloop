import {
  ExpandableContactsTable,
  ContactsTableExpandButton,
} from "@/components/expandable-contacts-table";
import { TableValue } from "@/components/table-value";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
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
async function ContactsContent({
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
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <form
            method="get"
            action="/contacts"
            className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2"
          >
            <label
              htmlFor="contact-search"
              className="col-span-2 text-xs font-medium"
            >
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
          <ExpandableContactsTable>
            {!contacts.length ? (
              <EmptyState
                title={q ? "No contacts found" : "Meet your shortlist"}
                description={
                  q
                    ? "Try another name, email, or company."
                    : "Add your first contact, or import a list below."
                }
              />
            ) : (
              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Your contacts</caption>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Company</th>
                      <th>Job Role</th>
                      <th>Last Sent</th>
                      <th className="sticky right-0 z-10 bg-card">
                        <div className="flex items-center gap-1">
                          <span>Actions</span>
                          <ContactsTableExpandButton />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <p className="max-w-64 break-words font-medium">
                            {c.name}
                          </p>
                          <p className="mt-1 max-w-64 break-all text-xs text-body">
                            {c.email}
                          </p>
                        </td>
                        <td className="text-body">
                          <TableValue value={c.company} singleLine />
                        </td>
                        <td className="whitespace-nowrap text-body">
                          <TableValue
                            value={c.jobRole}
                            missing="Choose a job role"
                            singleLine
                          />
                        </td>
                        <td className="whitespace-nowrap text-xs text-body">
                          <DateTime
                            value={c.sends[0]?.sentAt?.toISOString() ?? null}
                          />
                        </td>
                        <td className="sticky right-0 bg-card">
                          <div className="flex">
                            <Link
                              href={`/contacts?edit=${c.id}`}
                              className="inline-flex min-h-11 items-center px-3 text-link"
                            >
                              Edit
                            </Link>
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
          </ExpandableContactsTable>
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

export default function Contacts(props: Parameters<typeof ContactsContent>[0]) {
  return (
    <>
      <PageHeading
        eyebrow="People worth reaching out to"
        title="Contacts"
        description="Build your shortlist, one person or one CSV at a time."
      />
      <Suspense
        fallback={<WorkspaceSkeleton page="contacts" heading={false} />}
      >
        <ContactsContent {...props} />
      </Suspense>
    </>
  );
}
