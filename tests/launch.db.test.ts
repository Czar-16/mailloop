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
import { createCampaign, quotaWhere } from "@/lib/campaigns";
import { cancelQueued } from "@/lib/cancellation";
import {
  exportAccount,
  requestAccountDeletion,
  cleanupDeletedAccount,
  DELETION_DRAIN_MS,
} from "@/lib/account";
import { readFollowUps } from "@/lib/follow-ups";
import { readCampaignProgress } from "@/lib/campaign-progress";
import { storeLocalResume } from "@/lib/storage";
import * as storage from "@/lib/storage";
import { encryptToken } from "@/lib/crypto";
import { mkdir, writeFile, access, rm } from "node:fs/promises";
import path from "node:path";

const mocks = vi.hoisted(() => ({ send: vi.fn(), gmail: vi.fn() }));
vi.mock("@/lib/gmail", async (original) => ({
  ...(await original<typeof import("@/lib/gmail")>()),
  gmailForUser: mocks.gmail,
}));
import { deliverOne, dispatchPending, checkOneReply } from "@/lib/inngest";
const enabled = process.env.MAILLOOP_DB_TESTS === "1";
if (
  enabled &&
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Launch tests require a local database.");
let userId: string, otherId: string, contactId: string, templateId: string;
const input = () => ({
  templateId,
  recipientIds: [contactId],
  recipientRoles: { [contactId]: "Engineer" },
  attachResume: false,
  idempotencyKey: randomUUID(),
});
async function queue() {
  const campaign = await createCampaign(userId, input());
  return db.send.findFirstOrThrow({
    where: { campaignId: campaign.id, campaign: { userId } },
  });
}
async function sent(days: number) {
  const send = await queue();
  return db.send.update({
    where: { id: send.id },
    data: {
      status: "SENT",
      deliveryState: "DONE",
      sentAt: new Date(Date.now() - days * 86400000),
    },
  });
}
describe.runIf(enabled)("public launch database invariants", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    userId = randomUUID();
    otherId = randomUUID();
    await db.user.createMany({
      data: [userId, otherId].map((id) => ({
        id,
        email: `${id}@example.test`,
        gmailAuthorized: true,
        encryptedRefreshToken: encryptToken("FAKE-LAUNCH-TOKEN"),
      })),
    });
    templateId = (
      await db.template.create({
        data: {
          userId,
          name: "Launch template",
          subject: "Hello {{name}}",
          body: "Private snapshot",
        },
      })
    ).id;
    contactId = (
      await db.contact.create({
        data: {
          userId,
          name: "Ada",
          email: `${(contactId = randomUUID())}@example.test`,
          jobRole: "Engineer",
        },
      })
    ).id;
    mocks.gmail.mockResolvedValue({
      email: "sender@example.test",
      gmail: { users: { messages: { send: mocks.send } } },
    });
    mocks.send.mockResolvedValue({
      data: { id: "gmail-id", threadId: "thread-id" },
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.campaign.deleteMany({
      where: { userId: { in: [userId, otherId] } },
    });
    await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await rm(path.join(process.cwd(), "uploads", "resumes", userId), {
      recursive: true,
      force: true,
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("cancels only owned ready sends, releases quota, stops published jobs, and is idempotent", async () => {
    const send = await queue();
    expect(await cancelQueued(otherId, { sendId: send.id })).toEqual({
      cancelled: 0,
      couldNotStop: 0,
    });
    expect(await db.send.count({ where: quotaWhere(userId) })).toBe(1);
    expect(await cancelQueued(userId, { campaignId: send.campaignId })).toEqual(
      { cancelled: 1, couldNotStop: 0 },
    );
    expect(await cancelQueued(userId, { sendId: send.id })).toEqual({
      cancelled: 0,
      couldNotStop: 0,
    });
    expect(await db.send.count({ where: quotaWhere(userId) })).toBe(0);
    expect(
      (await db.send.findUniqueOrThrow({ where: { id: send.id } })).cancelledAt,
    ).not.toBeNull();
    expect(await deliverOne(userId, send.id)).toEqual({ outcome: "done" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(
      (await db.campaign.findUniqueOrThrow({ where: { id: send.campaignId } }))
        .status,
    ).toBe("COMPLETED_WITH_CANCELLATIONS");
    expect(
      await readCampaignProgress({ id: userId, nextSendAt: null }, [
        send.campaignId,
      ]),
    ).toMatchObject({ cancelled: 1, sent: 0, queued: 0, outstanding: 0 });
  });
  it("cannot stop a worker after its claim and retains uncertain reservations", async () => {
    const send = await queue();
    let release!: () => void;
    let claimed!: () => void;
    const waiting = new Promise<void>((resolve) => {
      claimed = resolve;
    });
    mocks.send.mockImplementationOnce(async () => {
      claimed();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { data: { id: "sent" } };
    });
    const worker = deliverOne(userId, send.id);
    await waiting;
    expect(await cancelQueued(userId, { sendId: send.id })).toEqual({
      cancelled: 0,
      couldNotStop: 1,
    });
    release();
    await worker;
    await db.send.update({
      where: { id: send.id },
      data: { status: "FAILED", deliveryState: "UNCERTAIN" },
    });
    expect(await cancelQueued(userId, { campaignId: send.campaignId })).toEqual(
      { cancelled: 0, couldNotStop: 1 },
    );
    expect(await db.send.count({ where: quotaWhere(userId) })).toBe(1);
  });
  it("deletion during Gmail submission leaves the claimed send alone and blocks new upload activation", async () => {
    const send = await queue();
    let release!: () => void;
    let claimed!: () => void;
    const submitted = new Promise<void>((resolve) => {
      claimed = resolve;
    });
    mocks.send.mockImplementationOnce(async () => {
      claimed();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { data: { id: "already-submitted" } };
    });
    const worker = deliverOne(userId, send.id);
    await submitted;
    expect(
      await requestAccountDeletion(userId, `${userId}@example.test`),
    ).toMatchObject({ cancelled: 0, couldNotStop: 1 });
    expect(await cleanupDeletedAccount(userId)).toBe(false);
    const pathname = `resumes/${userId}/${randomUUID()}.pdf`;
    const full = path.join(process.cwd(), "uploads", pathname);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, "%PDF-1.7\nnot activated");
    await expect(
      storage.activateResume(userId, pathname, "upload.pdf"),
    ).rejects.toThrow("Account unavailable");
    expect(await db.attachment.count({ where: { userId } })).toBe(0);
    release();
    await worker;
    expect(
      (await db.send.findUniqueOrThrow({ where: { id: send.id } })).status,
    ).toBe("SENT");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .gmailAuthorized,
    ).toBe(false);
  });
  it("exports only owned explicit fields and excludes credentials and storage paths", async () => {
    const send = await sent(10);
    await db.attachment.create({
      data: {
        userId,
        fileName: "cv.pdf",
        storagePath: `resumes/${userId}/${randomUUID()}.pdf`,
      },
    });
    await db.contact.create({
      data: {
        userId: otherId,
        name: "OTHER-PRIVATE",
        email: "other@example.test",
      },
    });
    const data = await exportAccount(userId);
    const json = JSON.stringify(data);
    expect(data.version).toBe(1);
    expect(data.profile.followUpDays).toBe(7);
    expect(data.campaigns[0].sends[0]).toMatchObject({
      id: send.id,
      body: "Private snapshot",
    });
    for (const secret of [
      "encryptedRefreshToken",
      "storagePath",
      "googleId",
      "FAKE-LAUNCH-TOKEN",
      "OTHER-PRIVATE",
      "idempotencyKey",
    ])
      expect(json).not.toContain(secret);
  });
  it("account deletion does not enumerate completed history as work to cancel", async () => {
    const send = await sent(10);
    expect(
      await requestAccountDeletion(userId, `${userId}@example.test`),
    ).toEqual({ cancelled: 0, couldNotStop: 0 });
    expect(
      (await db.send.findUniqueOrThrow({ where: { id: send.id } })).status,
    ).toBe("SENT");
  });
  it("deletion disables work immediately, drains current delivery, and retries failed storage cleanup", async () => {
    const send = await queue();
    await expect(
      requestAccountDeletion(userId, "wrong@example.test"),
    ).rejects.toThrow("exactly");
    expect(
      await requestAccountDeletion(userId, `${userId}@example.test`),
    ).toMatchObject({ cancelled: 1 });
    await expect(createCampaign(userId, input())).rejects.toThrow(
      "unavailable",
    );
    await expect(
      storage.activateResume(userId, "invalid", "cv.pdf"),
    ).rejects.toThrow();
    expect(await deliverOne(userId, send.id)).toEqual({ outcome: "done" });
    expect(await dispatchPending(userId)).toBe(0);
    expect(await checkOneReply(userId, send.id)).toBe(false);
    await expect(exportAccount(userId)).rejects.toThrow("unavailable");
    expect(await cleanupDeletedAccount(userId)).toBe(false);
    const unactivated = path.join(
      process.cwd(),
      "uploads",
      "resumes",
      userId,
      `${randomUUID()}.pdf`,
    );
    await mkdir(path.dirname(unactivated), { recursive: true });
    await writeFile(unactivated, "%PDF-1.7\nprivate");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );
    const deletion = vi
      .spyOn(storage, "deleteOwnedResumes")
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const future = new Date(Date.now() + DELETION_DRAIN_MS + 1000);
    await expect(cleanupDeletedAccount(userId, future)).rejects.toThrow(
      "storage unavailable",
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .deletionRequestedAt,
    ).not.toBeNull();
    deletion.mockRestore();
    expect(await cleanupDeletedAccount(userId, future)).toBe(true);
    await expect(access(unactivated)).rejects.toThrow();
    expect(await db.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await deliverOne(userId, send.id)).toEqual({ outcome: "done" });
    expect(await cleanupDeletedAccount(userId, future)).toBe(false);
  });
  it("retains PDFs for uncertain sends and removes replaced PDFs after cancellation", async () => {
    await storeLocalResume(
      userId,
      new File(["%PDF-1.7\nfirst"], "first.pdf", { type: "application/pdf" }),
    );
    const campaign = await createCampaign(userId, {
      ...input(),
      attachResume: true,
    });
    const file = await db.attachment.findFirstOrThrow({ where: { userId } });
    await storeLocalResume(
      userId,
      new File(["%PDF-1.7\nsecond"], "second.pdf", { type: "application/pdf" }),
    );
    await access(path.join(process.cwd(), "uploads", file.storagePath));
    await cancelQueued(userId, { campaignId: campaign.id });
    await storage.cleanupAttachments(userId);
    await expect(
      access(path.join(process.cwd(), "uploads", file.storagePath)),
    ).rejects.toThrow();
    expect(
      await db.attachment.findUnique({ where: { id: file.id } }),
    ).not.toBeNull();
  });
  it("reminders also suppress replies and uncertain sends matched only by immutable email", async () => {
    const send = await sent(8);
    const contact = await db.contact.findUniqueOrThrow({
      where: { id: contactId },
    });
    await db.contact.update({
      where: { id: contactId },
      data: { email: "changed@example.test", archivedAt: new Date() },
    });
    await db.contact.create({
      data: { userId, name: "Same recipient", email: contact.email },
    });
    expect((await readFollowUps(userId, 7)).contacts[0].sendId).toBe(send.id);
    await db.send.update({
      where: { id: send.id },
      data: { status: "FAILED", deliveryState: "UNCERTAIN" },
    });
    expect((await readFollowUps(userId, 7)).total).toBe(0);
    await db.send.update({
      where: { id: send.id },
      data: { status: "REPLIED", deliveryState: "DONE" },
    });
    expect((await readFollowUps(userId, 7)).total).toBe(0);
  });
  it("reminders respect intervals, snapshots, replies, shortlist requests, repeat sends and archives", async () => {
    const send = await sent(8);
    expect((await readFollowUps(userId, 0)).total).toBe(0);
    expect((await readFollowUps(userId, 7)).total).toBe(1);
    expect((await readFollowUps(userId, 14)).total).toBe(0);
    await db.contact.update({
      where: { id: contactId },
      data: { followUpRequestedAt: new Date() },
    });
    expect((await readFollowUps(userId, 3)).total).toBe(0);
    await db.contact.update({
      where: { id: contactId },
      data: { followUpRequestedAt: null, archivedAt: new Date() },
    });
    expect((await readFollowUps(userId, 3)).total).toBe(0);
    await db.contact.update({
      where: { id: contactId },
      data: { archivedAt: null },
    });
    const repeat = await createCampaign(userId, {
      ...input(),
      resendIds: [contactId],
    });
    expect((await readFollowUps(userId, 3)).total).toBe(0);
    await db.send.updateMany({
      where: { campaignId: repeat.id, campaign: { userId } },
      data: { status: "SENT", deliveryState: "DONE", sentAt: new Date() },
    });
    expect((await readFollowUps(userId, 7)).total).toBe(0);
    await db.send.update({
      where: { id: send.id },
      data: { status: "REPLIED" },
    });
    expect(
      (await readFollowUps(userId, 3, 1, new Date(Date.now() + 30 * 86400000)))
        .total,
    ).toBe(0);
  });
});
