"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { Prisma } from "@/generated/prisma/client";
import { contactDeliveryState } from "@/lib/shortlist";
import { db } from "@/lib/db";
import {
  contactSchema,
  templateSchema,
  preferredRolesSchema,
} from "@/lib/validation";
import { parseContacts, validateImportRows } from "@/lib/imports";
import { AppError, type ActionResult } from "@/lib/errors";
import { createCampaign } from "@/lib/campaigns";
import { dispatchPending, inngest } from "@/lib/inngest";

async function result(
  work: () => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof z.ZodError)
      return {
        ok: false,
        message: e.issues[0].message,
        fieldErrors: Object.fromEntries(
          e.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
      };
    if (e instanceof AppError)
      return {
        ok: false,
        message: e.message,
        ...(e.field ? { fieldErrors: { [e.field]: e.message } } : {}),
      };
    if ((e as { code?: string })?.code === "P2002") {
      const message =
        "A contact with this email already exists. Edit that contact instead.";
      return { ok: false, message, fieldErrors: { email: message } };
    }
    return {
      ok: false,
      message:
        "Could not save this change. Check for a duplicate email and try again.",
    };
  }
}
async function mutation(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<ActionResult>,
) {
  return result(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.deletionRequestedAt)
        throw new AppError("Account unavailable.");
      return work(tx);
    }),
  );
}
export async function saveTemplate(form: FormData) {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    const data = templateSchema.parse(Object.fromEntries(form));
    const id = form.get("id");
    if (id) {
      const updated = await tx.template.updateMany({
        where: { id: z.uuid().parse(id), userId: user.id, archivedAt: null },
        data,
      });
      if (!updated.count) throw new AppError("Template not found.");
    } else await tx.template.create({ data: { ...data, userId: user.id } });
    revalidatePath("/templates");
    revalidatePath("/compose");
    return { ok: true, message: "Template saved." };
  });
}
export async function archiveTemplate(id: string) {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    await tx.template.updateMany({
      where: { id: z.uuid().parse(id), userId: user.id },
      data: { archivedAt: new Date() },
    });
    revalidatePath("/templates");
    revalidatePath("/compose");
    return {
      ok: true,
      message: "Template deleted. Existing history is preserved.",
    };
  });
}
export async function saveContact(form: FormData) {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    const data = contactSchema.parse(Object.fromEntries(form));
    const id = form.get("id");
    if (id) {
      const updated = await tx.contact.updateMany({
        where: { id: z.uuid().parse(id), userId: user.id, archivedAt: null },
        data,
      });
      if (!updated.count) throw new AppError("Contact not found.");
    } else {
      await tx.contact.upsert({
        where: { userId_email: { userId: user.id, email: data.email } },
        update: { ...data, archivedAt: null },
        create: { ...data, userId: user.id },
      });
    }
    revalidatePath("/contacts");
    revalidatePath("/compose");
    return { ok: true, message: "Contact saved." };
  });
}
export async function archiveContact(id: string) {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    await tx.contact.updateMany({
      where: { id: z.uuid().parse(id), userId: user.id },
      data: { archivedAt: new Date() },
    });
    revalidatePath("/contacts");
    revalidatePath("/compose");
    return {
      ok: true,
      message: "Contact deleted. Existing history is preserved.",
    };
  });
}
export async function importContacts(input: unknown) {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    const existing = await tx.contact.findMany({
      where: { userId: user.id },
      select: { email: true },
    });
    const rows =
      typeof input === "string"
        ? parseContacts(
            z
              .string()
              .max(1024 * 1024)
              .parse(input),
            existing.map((c) => c.email),
          )
        : validateImportRows(
            z
              .array(contactSchema)
              .max(1000)
              .parse(input)
              .map((r, i) => ({ ...r, row: i + 1 })),
            existing.map((c) => c.email),
          );
    if (rows.some((r) => r.state === "invalid"))
      throw new AppError(
        "Correct every unresolved name, email, and job role before importing.",
      );
    const data = rows
      .filter((r) => r.state === "valid")
      .map((r) => ({
        userId: user.id,
        name: r.name,
        email: r.email,
        company: r.company,
        jobRole: r.jobRole,
      }));
    const saved = await tx.contact.createMany({ data, skipDuplicates: true });
    revalidatePath("/contacts");
    revalidatePath("/compose");
    return {
      ok: true,
      message: `${saved.count} contacts imported. ${rows.length - saved.count} rows skipped.`,
    };
  });
}
export async function submitCampaign(input: unknown) {
  const user = await requireUser();
  return result(async () => {
    const campaign = await createCampaign(user.id, input);
    // Database rows are the durable outbox when Inngest is temporarily unavailable.
    try {
      await dispatchPending(user.id);
    } catch {
      /* The dispatcher retries pending rows. */
    }
    revalidatePath("/history");
    revalidatePath("/compose");
    return {
      ok: true,
      id: campaign.id,
      message: `Emails queued for ${campaign.count} recipient${campaign.count === 1 ? "" : "s"}. ${campaign.skipped} recipients skipped.`,
    };
  });
}
export async function refreshReplies() {
  const user = await requireUser();
  return result(async () => {
    await inngest.send({
      name: "mailloop/replies.refresh",
      data: { userId: user.id },
    });
    return {
      ok: true,
      message: "Reply check queued. History updates automatically.",
    };
  });
}

export async function savePreferences(input: unknown) {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    const data = z
      .object({
        preferredRoles: preferredRolesSchema,
      })
      .parse(input);
    await tx.user.update({
      where: { id: user.id },
      data,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Preferences saved." };
  });
}

async function restoreShortlistContact(
  tx: Prisma.TransactionClient,
  userId: string,
  contactId: string,
) {
  const [contact] = await tx.$queryRaw<
    {
      id: string;
      blocked: boolean;
      followUp: boolean;
      previouslySent: boolean;
    }[]
  >(Prisma.sql`
    SELECT c.id, state.* FROM "Contact" c
    CROSS JOIN LATERAL (${contactDeliveryState}) state
    WHERE c.id = ${contactId} AND c."userId" = ${userId} AND c."archivedAt" IS NULL`);
  if (!contact) throw new AppError("Contact is unavailable.");
  if (contact.blocked)
    throw new AppError(
      "Wait for pending delivery to resolve before adding to the shortlist.",
    );
  await tx.contact.updateMany({
    where: { id: contact.id, userId, archivedAt: null },
    data: {
      shortlistRemovedAt: null,
      ...(contact.previouslySent && !contact.followUp
        ? { followUpRequestedAt: new Date() }
        : {}),
    },
  });
  revalidatePath("/compose");
  revalidatePath("/contacts");
  revalidatePath("/history");
  return { ok: true, message: "In shortlist" };
}

export async function addToShortlist(sendId: string): Promise<ActionResult> {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    const send = await tx.send.findFirst({
      where: {
        id: z.uuid().parse(sendId),
        campaign: { userId: user.id },
        status: { in: ["SENT", "REPLIED"] },
      },
      select: { contactId: true },
    });
    if (!send) throw new AppError("Successful delivery not found.");
    return restoreShortlistContact(tx, user.id, send.contactId);
  });
}

export async function addContactToShortlist(
  contactId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return mutation(user.id, (tx) =>
    restoreShortlistContact(tx, user.id, z.uuid().parse(contactId)),
  );
}

export async function removeFromShortlist(
  contactId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return mutation(user.id, async (tx) => {
    const id = z.uuid().parse(contactId);
    const [contact] = await tx.$queryRaw<
      { id: string; blocked: boolean }[]
    >(Prisma.sql`
      SELECT c.id, state.blocked FROM "Contact" c
      CROSS JOIN LATERAL (${contactDeliveryState}) state
      WHERE c.id = ${id} AND c."userId" = ${user.id} AND c."archivedAt" IS NULL`);
    if (!contact) throw new AppError("Contact is unavailable.");
    if (contact.blocked)
      throw new AppError(
        "Wait for pending delivery to resolve before removing this person.",
      );
    await tx.contact.updateMany({
      where: {
        id,
        userId: user.id,
        archivedAt: null,
        shortlistRemovedAt: null,
      },
      data: { shortlistRemovedAt: new Date(), followUpRequestedAt: null },
    });
    revalidatePath("/compose");
    revalidatePath("/contacts");
    revalidatePath("/history");
    return { ok: true, message: "Removed from shortlist." };
  });
}
