import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidate: vi.fn(),
  dispatch: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/inngest", () => ({
  dispatchPending: mocks.dispatch,
  inngest: { send: mocks.send },
}));
vi.mock("@/lib/gmail", () => ({ gmailForUser: vi.fn() }));

import {
  archiveContact,
  archiveTemplate,
  importContacts,
  refreshReplies,
  saveContact,
  saveTemplate,
  submitCampaign,
  savePreferences,
} from "@/lib/actions";

import { getCampaignProgress } from "@/lib/campaign-progress-actions";

const enabled = process.env.MAILLOOP_DB_TESTS === "1";
if (
  enabled &&
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
) {
  throw new Error("Database action tests require a local database.");
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  data.set("jobRole", "Engineer");
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const templateFields = {
  name: "Introduction",
  subject: "Opportunity at {{company}}",
  body: "Hi {{name}}, I would like to apply.",
};
let userId: string;
let otherId: string;
let templateId: string;
let contactId: string;

describe.runIf(enabled)("authenticated database-backed actions", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    userId = randomUUID();
    otherId = randomUUID();
    await db.user.createMany({
      data: [userId, otherId].map((id) => ({
        id,
        email: `${id}@example.test`,
      })),
    });
    mocks.requireUser.mockResolvedValue({ id: userId });
    mocks.dispatch.mockResolvedValue(undefined);
    mocks.send.mockResolvedValue({ ids: [] });
    const template = await db.template.create({
      data: { userId, ...templateFields },
    });
    templateId = template.id;
    const contact = await db.contact.create({
      data: {
        userId,
        name: "Alex",
        email: "alex@example.test",
        company: "Acme",
      },
    });
    contactId = contact.id;
  });
  afterEach(async () => {
    await db.campaign.deleteMany({
      where: { userId: { in: [userId, otherId] } },
    });
    await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("retains observed campaign totals through completion and scopes progress to its owner", async () => {
    const first = await db.campaign.create({
      data: {
        userId,
        templateId,
        status: "QUEUED",
        sends: { create: { contactId } },
      },
    });
    const second = await db.campaign.create({
      data: {
        userId,
        templateId,
        status: "QUEUED",
        sends: { create: { contactId } },
      },
    });
    const otherTemplate = await db.template.create({
      data: { userId: otherId, ...templateFields },
    });
    const otherContact = await db.contact.create({
      data: { userId: otherId, name: "Other", email: "other@example.test" },
    });
    const foreign = await db.campaign.create({
      data: {
        userId: otherId,
        templateId: otherTemplate.id,
        status: "QUEUED",
        sends: { create: { contactId: otherContact.id } },
      },
    });
    expect(await getCampaignProgress([foreign.id])).toMatchObject({
      queued: 2,
      sent: 0,
    });
    await db.send.updateMany({
      where: { campaignId: first.id, campaign: { userId } },
      data: { status: "SENT", deliveryState: "DONE", sentAt: new Date() },
    });
    expect(
      await getCampaignProgress([first.id, second.id, foreign.id]),
    ).toMatchObject({ queued: 1, sent: 1, finishedAt: null });
    await db.send.updateMany({
      where: { campaignId: second.id, campaign: { userId } },
      data: { status: "SENT", deliveryState: "DONE", sentAt: new Date() },
    });
    const completed = await getCampaignProgress([
      first.id,
      second.id,
      foreign.id,
    ]);
    expect(completed).toMatchObject({
      queued: 0,
      sent: 2,
      failed: 0,
      review: 0,
      finishedAt: expect.any(String),
    });
    expect(completed?.id.split(":")).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(completed?.id).not.toContain(foreign.id);
    expect(await getCampaignProgress([])).toBeNull();
    expect(await getCampaignProgress([foreign.id])).toBeNull();
    await expect(getCampaignProgress(["invalid-id"])).rejects.toThrow();
  });

  it("persists preferences for the current user and rejects invalid roles", async () => {
    expect(
      await savePreferences({
        preferredRoles: ["SDE Intern", "Frontend Developer"],
      }),
    ).toMatchObject({ ok: true });
    expect(await db.user.findUnique({ where: { id: userId } })).toMatchObject({
      preferredRoles: ["SDE Intern", "Frontend Developer"],
    });
    expect(await db.user.findUnique({ where: { id: otherId } })).toMatchObject({
      preferredRoles: [],
    });
    for (const input of [
      { preferredRoles: [] },
      { preferredRoles: ["Engineer", "engineer"] },
      { preferredRoles: Array(6).fill("Engineer") },
    ])
      expect(await savePreferences(input)).toMatchObject({ ok: false });
  });
  it("rejects unresolved import rows without a partial save", async () => {
    expect(
      await importContacts(
        "email,jobRole\nalex@example.test,Engineer\ncareers@example.test,Engineer",
      ),
    ).toMatchObject({ ok: false });
    expect(await db.contact.count({ where: { userId } })).toBe(1);
  });
  it("requires a session before every action and never masks authentication failures", async () => {
    mocks.requireUser.mockRejectedValue(new Error("Authentication required"));
    const calls = [
      () => saveTemplate(form(templateFields)),
      () => archiveTemplate(templateId),
      () => saveContact(form({ name: "New", email: "new@example.test" })),
      () => archiveContact(contactId),
      () => importContacts("name,email,company\nNew,new@example.test,Acme"),
      () => submitCampaign({}),
      () => refreshReplies(),
      () => getCampaignProgress([]),
      () => savePreferences({ preferredRoles: ["Engineer"] }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toThrow("Authentication required");
    }
    expect(mocks.requireUser).toHaveBeenCalledTimes(calls.length);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await db.contact.count({ where: { userId } })).toBe(1);
    expect(await db.template.count({ where: { userId } })).toBe(1);
  });

  it("creates and edits templates for the authenticated owner", async () => {
    expect(
      await saveTemplate(form({ ...templateFields, name: "Second" })),
    ).toMatchObject({ ok: true });
    expect(await db.template.count({ where: { userId } })).toBe(2);
    expect(
      await saveTemplate(
        form({ ...templateFields, id: templateId, name: "Updated" }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await db.template.findFirst({ where: { id: templateId, userId } }),
    ).toMatchObject({ name: "Updated" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/templates");
    expect(mocks.revalidate).toHaveBeenCalledWith("/compose");
  });

  it("cannot edit or archive another user's templates or contacts", async () => {
    mocks.requireUser.mockResolvedValue({ id: otherId });
    expect(
      await saveTemplate(
        form({ ...templateFields, id: templateId, name: "Intruder" }),
      ),
    ).toMatchObject({ ok: false, message: "Template not found." });
    expect(
      await saveContact(
        form({
          id: contactId,
          name: "Intruder",
          email: "changed@example.test",
        }),
      ),
    ).toMatchObject({ ok: false, message: "Contact not found." });
    await archiveTemplate(templateId);
    await archiveContact(contactId);
    expect(
      await db.template.findFirst({ where: { id: templateId, userId } }),
    ).toMatchObject({ name: "Introduction", archivedAt: null });
    expect(
      await db.contact.findFirst({ where: { id: contactId, userId } }),
    ).toMatchObject({
      name: "Alex",
      email: "alex@example.test",
      archivedAt: null,
    });
    expect(await db.contact.count({ where: { userId: otherId } })).toBe(0);
  });

  it("archives referenced records while preserving campaign history and snapshots", async () => {
    const campaign = await db.campaign.create({
      data: { userId, templateId, status: "COMPLETED" },
    });
    const sentAt = new Date();
    const send = await db.send.create({
      data: {
        campaignId: campaign.id,
        contactId,
        status: "SENT",
        deliveryState: "DONE",
        sentAt,
        recipientEmail: "alex@example.test",
        recipientName: "Alex",
        recipientCompany: "Acme",
        templateName: "Introduction",
        subject: "Opportunity at Acme",
        body: "Hi Alex, I would like to apply.",
      },
    });
    expect(await archiveTemplate(templateId)).toMatchObject({ ok: true });
    expect(await archiveContact(contactId)).toMatchObject({ ok: true });
    expect(
      await db.template.count({ where: { userId, archivedAt: null } }),
    ).toBe(0);
    expect(
      await db.contact.count({ where: { userId, archivedAt: null } }),
    ).toBe(0);
    const history = await db.send.findFirstOrThrow({
      where: { id: send.id, campaign: { userId } },
      include: { contact: true, campaign: { include: { template: true } } },
    });
    expect(history).toMatchObject({
      status: "SENT",
      sentAt,
      recipientEmail: "alex@example.test",
      subject: "Opportunity at Acme",
    });
    expect(history.contact.archivedAt).toBeInstanceOf(Date);
    expect(history.campaign.template.archivedAt).toBeInstanceOf(Date);
    expect(
      await saveTemplate(form({ ...templateFields, id: templateId })),
    ).toMatchObject({ ok: false });
    expect(
      await saveContact(
        form({ id: contactId, name: "Alex", email: "alex@example.test" }),
      ),
    ).toMatchObject({ ok: false });
  });

  it("normalizes duplicate email creation, restores archived contacts, and keeps users independent", async () => {
    expect(
      await saveContact(
        form({ name: "Alex Updated", email: " ALEX@EXAMPLE.TEST " }),
      ),
    ).toMatchObject({ ok: true });
    expect(await db.contact.count({ where: { userId } })).toBe(1);
    expect(
      await db.contact.findFirst({ where: { id: contactId, userId } }),
    ).toMatchObject({ name: "Alex Updated", email: "alex@example.test" });
    await archiveContact(contactId);
    expect(
      await saveContact(
        form({ name: "Alex Restored", email: "alex@example.test" }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await db.contact.findFirst({ where: { id: contactId, userId } }),
    ).toMatchObject({ archivedAt: null, name: "Alex Restored" });
    mocks.requireUser.mockResolvedValue({ id: otherId });
    expect(
      await saveContact(
        form({ name: "Other Alex", email: "alex@example.test" }),
      ),
    ).toMatchObject({ ok: true });
    expect(await db.contact.count({ where: { userId: otherId } })).toBe(1);
    expect(
      await db.contact.findFirst({ where: { id: contactId, userId } }),
    ).toMatchObject({ name: "Alex Restored" });
  });

  it("rejects editing a contact to another existing email without changing either record", async () => {
    const second = await db.contact.create({
      data: { userId, name: "Sam", email: "sam@example.test" },
    });
    const outcome = await saveContact(
      form({ id: second.id, name: "Changed", email: "alex@example.test" }),
    );
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.message).toContain("already exists");
    expect(outcome.fieldErrors?.email).toBe(outcome.message);
    expect(
      await db.contact.findFirst({ where: { id: second.id, userId } }),
    ).toMatchObject({ name: "Sam", email: "sam@example.test" });
    expect(
      await db.contact.findFirst({ where: { id: contactId, userId } }),
    ).toMatchObject({ name: "Alex" });
  });

  it("imports only valid unique rows and scopes duplicate lookup to the current user", async () => {
    await db.contact.create({
      data: { userId: otherId, name: "Other", email: "new@example.test" },
    });
    const outcome = await importContacts(
      [
        "name,email,company,jobRole",
        "Existing,ALEX@EXAMPLE.TEST,Acme,Engineer",
        "New,new@example.test,Acme,Engineer",
        "Repeated,NEW@EXAMPLE.TEST,Acme,Engineer",
      ].join("\n"),
    );
    expect(outcome).toMatchObject({
      ok: true,
      message: "1 contacts imported. 2 rows skipped.",
    });
    expect(await db.contact.count({ where: { userId } })).toBe(2);
    expect(await db.contact.count({ where: { userId: otherId } })).toBe(1);
    expect(
      await db.contact.findFirst({
        where: { userId, email: "new@example.test" },
      }),
    ).toMatchObject({ name: "New" });
  });

  it("returns field errors for invalid forms and rejects header injection and unknown placeholders", async () => {
    const badContact = await saveContact(form({ name: "", email: "invalid" }));
    expect(badContact).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String), email: expect.any(String) },
    });
    const badTemplate = await saveTemplate(
      form({
        ...templateFields,
        subject: "Hello\r\nBcc: attacker@example.test",
        body: "Hello {{unknown}}",
      }),
    );
    expect(badTemplate).toMatchObject({
      ok: false,
      fieldErrors: {
        subject: "Subject must be one line.",
        body: expect.stringContaining("Use {{name}}"),
      },
    });
    expect(await db.contact.count({ where: { userId } })).toBe(1);
    expect(await db.template.count({ where: { userId } })).toBe(1);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
