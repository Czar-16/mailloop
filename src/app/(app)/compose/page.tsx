import Form from "next/form";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { quotaWhere } from "@/lib/campaigns";
import { PageHeading } from "@/components/common";
import { Compose } from "@/components/compose";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { pageNumber } from "@/lib/params";
export const metadata = { title: "Compose" };
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
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
  const [templates, contacts, total, used, attachment] = await Promise.all([
    db.template.findMany({
      where: { userId: user.id, archivedAt: null },
      select: { id: true, name: true, subject: true, body: true },
      orderBy: { name: "asc" },
    }),
    db.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        jobRole: true,
      },
      orderBy: { name: "asc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.contact.count({ where }),
    db.send.count({ where: quotaWhere(user.id) }),
    user.currentAttachmentId
      ? db.attachment.findFirst({
          where: { id: user.currentAttachmentId, userId: user.id },
          select: { fileName: true },
        })
      : null,
  ]);
  const history = await db.send.findMany({
    where: {
      campaign: { userId: user.id },
      OR: [
        { contactId: { in: contacts.map((c) => c.id) } },
        { recipientEmail: { in: contacts.map((c) => c.email) } },
      ],
    },
    select: {
      contactId: true,
      recipientEmail: true,
      status: true,
      deliveryState: true,
      sentAt: true,
    },
  });
  const recipients = contacts.map((c) => {
    const prior = history.filter(
      (s) => s.contactId === c.id || s.recipientEmail === c.email,
    );
    return {
      ...c,
      lastSent:
        prior
          .map((s) => s.sentAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0]
          ?.toISOString() ?? null,
      previouslySent: prior.some((s) => ["SENT", "REPLIED"].includes(s.status)),
      blocked: prior.some(
        (s) =>
          s.status === "QUEUED" ||
          ["ATTEMPTING", "UNCERTAIN"].includes(s.deliveryState),
      ),
    };
  });
  return (
    <>
      <PageHeading
        eyebrow="A thoughtful introduction"
        title="Make your next connection."
        description="Choose your words, build a shortlist, and see exactly what each person will receive."
      />
      <Form action="/compose" className="mb-6 flex max-w-xl gap-2">
        <label htmlFor="compose-search" className="sr-only">
          Search recipients
        </label>
        <Input
          id="compose-search"
          name="q"
          defaultValue={q}
          autoComplete="off"
          placeholder="Find a recipient by name, email, or company…"
        />
        <Button variant="outline" type="submit">
          Search
        </Button>
      </Form>
      <Compose
        templates={templates}
        contacts={recipients}
        used={used}
        roles={user.preferredRoles}
        resumeUrl={user.resumeUrl}
        resume={attachment?.fileName ?? null}
        connected={user.gmailAuthorized && !!user.encryptedRefreshToken}
      />
      <Pagination path="/compose" page={page} total={total} query={{ q }} />
    </>
  );
}
