import "dotenv/config";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createCampaign, quotaWhere } from "@/lib/campaigns";
import { encryptToken } from "@/lib/crypto";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  thread: vi.fn(),
}));
vi.mock("@/lib/gmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gmail")>();
  return {
    ...actual,
    gmailForUser: vi.fn(async () => ({
      email: "sender@example.test",
      name: "Anoop Jha",
      gmail: {
        users: {
          messages: { send: mocks.send, list: mocks.list, get: mocks.get },
          threads: { get: mocks.thread },
        },
      },
    })),
  };
});
import {
  deliverOne,
  checkReplies,
  replyCandidates,
  dispatchPending,
  inngest,
} from "@/lib/inngest";
import { buildMime } from "@/lib/gmail";
import { storeLocalResume, cleanupAttachments } from "@/lib/storage";

const enabled = process.env.MAILLOOP_DB_TESTS === "1";
if (
  enabled &&
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Database integration tests require a local database.");
let userId: string;
let otherId: string;
let templateId: string;
let contactId: string;
const request = (recipientIds = [contactId], extra = {}) => ({
  templateId,
  recipientIds,
  recipientRoles: Object.fromEntries(
    recipientIds.map((id) => [id, "Engineer"]),
  ),
  attachResume: false,
  idempotencyKey: randomUUID(),
  ...extra,
});

describe.runIf(enabled)(
  "database-backed campaign and delivery guarantees (Gmail mocked)",
  () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      mocks.send.mockResolvedValue({
        data: { id: "gmail-message", threadId: "gmail-thread" },
      });
      mocks.list.mockResolvedValue({ data: { messages: [] } });
      mocks.get.mockResolvedValue({
        data: { internalDate: String(Date.now()) },
      });
      mocks.thread.mockResolvedValue({ data: { messages: [] } });
      userId = randomUUID();
      otherId = randomUUID();
      await db.user.createMany({
        data: [userId, otherId].map((id) => ({
          id,
          email: `${id}@example.test`,
          gmailAuthorized: true,
          encryptedRefreshToken: encryptToken("fake-test-token"),
        })),
      });
      const template = await db.template.create({
        data: {
          userId,
          name: "Introduction",
          subject: "{{role}} at {{company}}",
          body: "Hi {{name}},\nI’d like to help {{company}}.",
        },
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
      vi.restoreAllMocks();
      await db.campaign.deleteMany({
        where: { userId: { in: [userId, otherId] } },
      });
      for (const id of [userId, otherId]) {
        await db.user.updateMany({
          where: { id },
          data: { currentAttachmentId: null },
        });
        await cleanupAttachments(id);
      }
      await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("snapshots mixed roles, links, and explicit PDF choices independently", async () => {
      await db.contact.updateMany({
        where: { id: contactId, userId },
        data: { jobRole: "SDE Intern" },
      });
      const second = await db.contact.create({
        data: {
          userId,
          name: "Sam",
          email: "sam@example.test",
          jobRole: "Frontend Developer",
        },
      });
      await db.template.updateMany({
        where: { id: templateId, userId },
        data: {
          body: "Hi {{name}}: {{role}}.\n\nhttps://example.com/first?a=1&b=2\nhttps://github.com/user\nhttps://linkedin.com/in/user\n\nEnd.",
        },
      });
      const pdf = Buffer.from("%PDF-1.4\n%%EOF");
      await storeLocalResume(
        userId,
        new File([pdf], "first.pdf", { type: "application/pdf" }),
      );
      const campaign = await createCampaign(
        userId,
        request([contactId, second.id], {
          recipientRoles: { [second.id]: "Backend Developer" },
          attachResume: false,
        }),
      );
      const saved = await db.campaign.findFirstOrThrow({
        where: { id: campaign.id, userId },
        include: { sends: true },
      });
      expect(saved.attachmentId).toBeNull();
      expect(saved.sends.map((s) => s.recipientRole).sort()).toEqual([
        "Backend Developer",
        "SDE Intern",
      ]);
      expect(
        saved.sends.every(
          (s) =>
            s.body ===
            `Hi ${s.recipientName}: ${s.recipientRole}.\n\nhttps://example.com/first?a=1&b=2\nhttps://github.com/user\nhttps://linkedin.com/in/user\n\nEnd.`,
        ),
      ).toBe(true);
      await db.template.updateMany({
        where: { id: templateId, userId },
        data: { body: "https://example.com/second" },
      });
      await db.contact.updateMany({
        where: { id: second.id, userId },
        data: { jobRole: "Designer" },
      });
      expect(
        (
          await db.send.findMany({
            where: { campaignId: campaign.id, campaign: { userId } },
          })
        ).every((s) => s.body.includes("https://example.com/first")),
      ).toBe(true);
      await deliverOne(userId, saved.sends[0].id);
      const mime = Buffer.from(
        mocks.send.mock.calls[0][0].requestBody.raw,
        "base64url",
      ).toString();
      expect(mime).not.toContain("application/pdf");
    });
    it("requires legacy roles, resolved placeholders, and an owned current PDF", async () => {
      await expect(
        createCampaign(userId, request([contactId], { recipientRoles: {} })),
      ).rejects.toThrow("job role");
      await expect(
        createCampaign(userId, request([contactId], { attachResume: true })),
      ).rejects.toThrow("PDF");
      await db.template.updateMany({
        where: { id: templateId, userId },
        data: { body: "{{link}}" },
      });
      for (const body of [
        "{{link}}",
        "{{ link }}",
        "{{\nlink\t}}",
        "{{unknown}}",
      ]) {
        await db.template.updateMany({
          where: { id: templateId, userId },
          data: { body },
        });
        await expect(createCampaign(userId, request())).rejects.toThrow(
          body.includes("link")
            ? "Replace {{link}} with a URL directly in your message."
            : "Use {{name}}",
        );
        expect(await db.campaign.count({ where: { userId } })).toBe(0);
      }
      await db.template.updateMany({
        where: { id: templateId, userId },
        data: { body: "https://example.com/resume" },
      });
      await expect(
        createCampaign(
          userId,
          request([contactId], { recipientRoles: { [otherId]: "Engineer" } }),
        ),
      ).rejects.toThrow("selected recipients");
      const foreign = await db.attachment.create({
        data: {
          userId: otherId,
          fileName: "foreign.pdf",
          storagePath: "foreign",
        },
      });
      await db.user.update({
        where: { id: userId },
        data: { currentAttachmentId: foreign.id },
      });
      await expect(
        createCampaign(userId, request([contactId], { attachResume: true })),
      ).rejects.toThrow("PDF");
      expect(await db.campaign.count({ where: { userId } })).toBe(0);
    });
    it("recovers failed event publication with one stable event per recipient", async () => {
      const second = await db.contact.create({
        data: { userId, name: "Sam", email: "sam@example.test" },
      });
      await createCampaign(userId, request([contactId, second.id]));
      const publish = vi
        .spyOn(inngest, "send")
        .mockRejectedValueOnce(new Error("queue unavailable"))
        .mockResolvedValue({ ids: ["event-a", "event-b"] });
      await expect(dispatchPending(userId)).rejects.toThrow(
        "queue unavailable",
      );
      expect(
        await db.send.count({
          where: { campaign: { userId }, dispatchedAt: null },
        }),
      ).toBe(2);
      expect(await dispatchPending(userId)).toBe(2);
      expect(publish.mock.calls[0][0]).toEqual(publish.mock.calls[1][0]);
      const events = publish.mock.calls[1][0] as {
        id: string;
        data: { userId: string; sendId: string };
      }[];
      expect(events).toHaveLength(2);
      expect(new Set(events.map((e) => e.id)).size).toBe(2);
      expect(events.every((e) => e.data.userId === userId)).toBe(true);
      expect(
        await db.send.count({
          where: { campaign: { userId }, dispatchedAt: null },
        }),
      ).toBe(0);
    });
    it("rejects removed recipients in stale campaign selections", async () => {
      await db.contact.updateMany({
        where: { id: contactId, userId },
        data: { shortlistRemovedAt: new Date() },
      });
      await expect(createCampaign(userId, request())).rejects.toThrow(
        "One or more contacts are unavailable.",
      );
      expect(await db.campaign.count({ where: { userId } })).toBe(0);
      await db.contact.updateMany({
        where: { id: contactId, userId },
        data: { shortlistRemovedAt: null },
      });
      expect((await createCampaign(userId, request())).count).toBe(1);
    });

    it("snapshots messages and rejects another user’s template/contact", async () => {
      await expect(createCampaign(otherId, request())).rejects.toThrow(
        "template",
      );
      const otherContact = await db.contact.create({
        data: { userId: otherId, name: "Other", email: "other@example.test" },
      });
      await expect(
        createCampaign(userId, request([otherContact.id])),
      ).rejects.toThrow("contacts");
      const campaign = await createCampaign(userId, request());
      await db.template.updateMany({
        where: { id: templateId, userId },
        data: { body: "Changed" },
      });
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      expect(send.body).toContain("Hi Alex");
      expect(send.subject).toBe("Engineer at Acme");
    });
    it("makes repeated submissions idempotent under concurrent requests", async () => {
      const input = request();
      const [a, b] = await Promise.all([
        createCampaign(userId, input),
        createCampaign(userId, input),
      ]);
      expect(a.id).toBe(b.id);
      expect(await db.send.count({ where: { campaign: { userId } } })).toBe(1);
    });
    it("blocks queued repeats, allows explicit sent repeats, and preserves address protection after edits", async () => {
      const campaign = await createCampaign(userId, request());
      await expect(
        createCampaign(
          userId,
          request([], { recipientIds: [contactId], resendIds: [contactId] }),
        ),
      ).rejects.toThrow("skipped");
      await db.send.updateMany({
        where: { campaignId: campaign.id, campaign: { userId } },
        data: { status: "SENT", deliveryState: "DONE", sentAt: new Date() },
      });
      await expect(createCampaign(userId, request())).rejects.toThrow(
        "skipped",
      );
      await db.contact.updateMany({
        where: { id: contactId, userId },
        data: { email: "new@example.test" },
      });
      const replacement = await db.contact.create({
        data: { userId, name: "Alex Again", email: "alex@example.test" },
      });
      await expect(
        createCampaign(userId, request([replacement.id])),
      ).rejects.toThrow("skipped");
      expect(
        (
          await createCampaign(
            userId,
            request([contactId], { resendIds: [contactId] }),
          )
        ).count,
      ).toBe(1);
    });
    it("admits only one request for the final reserved quota slot", async () => {
      const history = await db.campaign.create({
        data: { userId, templateId, status: "SENDING" },
      });
      await db.send.createMany({
        data: Array.from({ length: 499 }, () => ({
          campaignId: history.id,
          contactId,
          recipientEmail: "prior@example.test",
        })),
      });
      const contacts = await db.contact.createManyAndReturn({
        data: ["one", "two"].map((name) => ({
          userId,
          name,
          email: `${name}@example.test`,
        })),
      });
      const results = await Promise.allSettled(
        contacts.map((c) => createCampaign(userId, request([c.id]))),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.send.count({ where: quotaWhere(userId) })).toBe(500);
    });
    it("counts rolling success timestamps, queued rows, and uncertain attempts", async () => {
      const history = await db.campaign.create({
        data: { userId, templateId, status: "COMPLETED" },
      });
      await db.send.createMany({
        data: [
          {
            campaignId: history.id,
            contactId,
            status: "SENT",
            deliveryState: "DONE",
            sentAt: new Date(Date.now() - 25 * 3600000),
          },
          {
            campaignId: history.id,
            contactId,
            status: "REPLIED",
            deliveryState: "DONE",
            sentAt: new Date(),
          },
          {
            campaignId: history.id,
            contactId,
            status: "FAILED",
            deliveryState: "UNCERTAIN",
          },
          {
            campaignId: history.id,
            contactId,
            status: "FAILED",
            deliveryState: "DONE",
          },
        ],
      });
      expect(await db.send.count({ where: quotaWhere(userId) })).toBe(2);
    });
    it("paces separate campaigns for one user and never sends a completed job twice", async () => {
      const second = await db.contact.create({
        data: { userId, name: "Sam", email: "sam@example.test" },
      });
      const firstCampaign = await createCampaign(userId, request());
      const secondCampaign = await createCampaign(userId, request([second.id]));
      const a = await db.send.findFirstOrThrow({
        where: { campaignId: firstCampaign.id, campaign: { userId } },
      });
      const b = await db.send.findFirstOrThrow({
        where: { campaignId: secondCampaign.id, campaign: { userId } },
      });
      expect((await deliverOne(userId, a.id)).outcome).toBe("done");
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const delay = user.nextSendAt!.getTime() - Date.now();
      expect(delay).toBeGreaterThan(19000);
      expect(delay).toBeLessThanOrEqual(60000);
      expect((await deliverOne(userId, b.id)).outcome).toBe("wait");
      await deliverOne(userId, a.id);
      expect(mocks.send).toHaveBeenCalledTimes(1);
    });
    it("reconciles ambiguous delivery without sending again", async () => {
      const campaign = await createCampaign(userId, request());
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      mocks.send.mockRejectedValueOnce(new Error("timeout"));
      expect((await deliverOne(userId, send.id)).outcome).toBe("uncertain");
      mocks.list.mockResolvedValueOnce({
        data: { messages: [{ id: "found", threadId: "thread" }] },
      });
      expect((await deliverOne(userId, send.id)).outcome).toBe("done");
      const updated = await db.send.findFirstOrThrow({
        where: { id: send.id, campaign: { userId } },
      });
      expect(updated.status).toBe("SENT");
      expect(updated.gmailMessageId).toBe("found");
      expect(mocks.send).toHaveBeenCalledTimes(1);
    });
    it("keeps uncertain delivery reserved and releases confirmed rejections", async () => {
      const campaign = await createCampaign(userId, request());
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      mocks.send.mockRejectedValueOnce(new Error("timeout"));
      await deliverOne(userId, send.id);
      await deliverOne(userId, send.id);
      expect(await db.send.count({ where: quotaWhere(userId) })).toBe(1);
      await expect(
        createCampaign(
          userId,
          request([contactId], { resendIds: [contactId] }),
        ),
      ).rejects.toThrow("skipped");
      expect(mocks.send).toHaveBeenCalledTimes(1);
    });
    it("does not regress a delivery confirmed by a concurrent reconciler", async () => {
      const campaign = await createCampaign(userId, request());
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      await db.send.updateMany({
        where: { id: send.id, campaign: { userId } },
        data: { deliveryState: "UNCERTAIN" },
      });
      mocks.list.mockImplementationOnce(async () => {
        await db.send.updateMany({
          where: { id: send.id, campaign: { userId } },
          data: { status: "SENT", deliveryState: "DONE", sentAt: new Date() },
        });
        return { data: { messages: [] } };
      });
      expect((await deliverOne(userId, send.id)).outcome).toBe("done");
      expect(
        (
          await db.send.findFirstOrThrow({
            where: { id: send.id, campaign: { userId } },
          })
        ).status,
      ).toBe("SENT");
      expect(mocks.send).not.toHaveBeenCalled();
    });
    it("retries a definite temporary Gmail 403 throttle while keeping quota reserved", async () => {
      const campaign = await createCampaign(userId, request());
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      mocks.send.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
        },
      });
      expect((await deliverOne(userId, send.id)).outcome).toBe("retry");
      expect(await db.send.count({ where: quotaWhere(userId) })).toBe(1);
      expect(
        (
          await db.send.findFirstOrThrow({
            where: { id: send.id, campaign: { userId } },
          })
        ).deliveryState,
      ).toBe("READY");
    });
    it("releases a reservation for a definite Gmail rejection", async () => {
      const campaign = await createCampaign(userId, request());
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      mocks.send.mockRejectedValueOnce({ response: { status: 403 } });
      expect((await deliverOne(userId, send.id)).outcome).toBe("done");
      expect(await db.send.count({ where: quotaWhere(userId) })).toBe(0);
    });
    it("applies the eight-hour cutoff only to automatic reply checks", async () => {
      const campaign = await createCampaign(userId, request());
      const now = Date.now();
      const cutoff = now - 8 * 60 * 60000;
      const ids = Array.from({ length: 5 }, () => randomUUID());
      await db.send.createMany({
        data: [null, cutoff - 1, cutoff, cutoff + 1, now].map(
          (checked, index) => ({
            id: ids[index],
            campaignId: campaign.id,
            contactId,
            status: "SENT" as const,
            gmailThreadId: `thread-${index}`,
            sentAt: new Date(now - 24 * 60 * 60000),
            lastCheckedAt: checked === null ? null : new Date(checked),
          }),
        ),
      });
      // Freeze only Date.now so the database driver's timers continue to work.
      vi.spyOn(Date, "now").mockReturnValue(now);
      expect(await replyCandidates(userId)).toEqual([
        { id: ids[0] },
        { id: ids[1] },
      ]);
      expect(await replyCandidates(otherId)).toEqual([]);
      expect(await checkReplies(userId, true)).toEqual({
        checked: 5,
        replies: 0,
      });
      expect(mocks.thread).toHaveBeenCalledTimes(5);
      expect(await replyCandidates(userId)).toEqual([]);
    });
    it("rotates automatic reply checks oldest first with a 50-thread limit", async () => {
      const campaign = await createCampaign(userId, request());
      const now = Date.now();
      const ids = Array.from({ length: 51 }, () => randomUUID());
      await db.send.createMany({
        data: ids.map((id, index) => ({
          id,
          campaignId: campaign.id,
          contactId,
          status: "SENT" as const,
          gmailThreadId: `thread-${index}`,
          lastCheckedAt: new Date(now - 9 * 60 * 60000 + index),
        })),
      });
      expect(await replyCandidates(userId)).toEqual(
        ids.slice(0, 50).map((id) => ({ id })),
      );
      expect(await checkReplies(userId)).toEqual({ checked: 50, replies: 0 });
      expect(await replyCandidates(userId)).toEqual([{ id: ids[50] }]);
    });
    it("detects a real recipient reply but ignores self messages and automatic responses", async () => {
      const campaign = await createCampaign(userId, request());
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      await deliverOne(userId, send.id);
      const message = (from: string, auto?: string) => ({
        id: randomUUID(),
        internalDate: String(Date.now() + 10000),
        payload: {
          headers: [
            { name: "From", value: from },
            ...(auto ? [{ name: "Auto-Submitted", value: auto }] : []),
          ],
        },
      });
      mocks.thread.mockResolvedValueOnce({
        data: {
          messages: [
            message("sender@example.test"),
            message("Alex <alex@example.test>", "auto-replied"),
          ],
        },
      });
      expect((await checkReplies(userId, true)).replies).toBe(0);
      mocks.thread.mockResolvedValueOnce({
        data: { messages: [message("Alex <alex@example.test>")] },
      });
      expect((await checkReplies(userId, true)).replies).toBe(1);
    });
    it("retains the queued campaign’s PDF after replacement", async () => {
      const pdf = Buffer.from("%PDF-1.4\n%%EOF");
      await storeLocalResume(
        userId,
        new File([pdf], "first.pdf", { type: "application/pdf" }),
      );
      const campaign = await createCampaign(
        userId,
        request([contactId], { attachResume: true }),
      );
      await storeLocalResume(
        userId,
        new File([pdf], "second.pdf", { type: "application/pdf" }),
      );
      const saved = await db.campaign.findFirstOrThrow({
        where: { id: campaign.id, userId },
        include: { attachment: true },
      });
      expect(saved.attachment?.fileName).toBe("first.pdf");
      const send = await db.send.findFirstOrThrow({
        where: { campaignId: campaign.id, campaign: { userId } },
      });
      await deliverOne(userId, send.id);
      const raw = mocks.send.mock.calls[0][0].requestBody.raw;
      const mime = Buffer.from(raw, "base64url").toString();
      expect(mime).toContain("first.pdf");
      expect(mime).toMatch(/^From: Anoop Jha <sender@example.test>$/m);
      expect((mime.match(/^To:/gm) ?? []).length).toBe(1);
      expect(mime).not.toMatch(/^(Cc|Bcc):/m);
    });
  },
);

describe("MIME composition", () => {
  it.each([
    ["Anoop Jha", "Anoop Jha <sender@example.test>"],
    ['Doe, "Alex"', '"Doe, \\"Alex\\"" <sender@example.test>'],
    [null, "sender@example.test"],
    ["   ", "sender@example.test"],
  ])("formats sender name %j safely", async (fromName, expected) => {
    const raw = await buildMime({
      from: "sender@example.test",
      fromName,
      to: "alex@example.test",
      subject: "Hello",
      body: "Hi Alex",
      messageId: "<sender-name@mailloop.in>",
    });
    const mime = Buffer.from(raw, "base64url").toString();
    expect(mime.split("\r\n")).toContain(`From: ${expected}`);
  });

  it("encodes an international sender name as UTF-8", async () => {
    const raw = await buildMime({
      from: "sender@example.test",
      fromName: "अनूप झा",
      to: "alex@example.test",
      subject: "Hello",
      body: "Hi Alex",
      messageId: "<international-name@mailloop.in>",
    });
    const mime = Buffer.from(raw, "base64url").toString();
    expect(mime).toContain(
      `From: =?UTF-8?B?${Buffer.from("अनूप झा").toString("base64")}?= <sender@example.test>`,
    );
  });

  it("builds one To recipient, no CC/BCC, UTF-8 content, and a PDF part", async () => {
    const raw = await buildMime({
      from: "sender@example.test",
      to: "alex@example.test",
      subject: "Hello 世界",
      body: "Hi Alex 👋",
      messageId: "<test@mailloop.in>",
      attachment: {
        fileName: "resume.pdf",
        bytes: Buffer.from("%PDF-1.4\n%%EOF"),
      },
    });
    const mime = Buffer.from(raw, "base64url").toString();
    expect((mime.match(/^To:/gm) ?? []).length).toBe(1);
    expect(mime).not.toMatch(/^(Cc|Bcc):/m);
    expect(mime).toContain("application/pdf");
    expect(mime).toContain("<test@mailloop.in>");
    expect(mime).toContain("charset=utf-8");
    expect(raw).not.toMatch(/[+/=]/);
  });
});
