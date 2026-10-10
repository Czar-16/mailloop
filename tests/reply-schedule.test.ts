import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (context: unknown) => Promise<unknown>>(),
  users: vi.fn(),
  active: vi.fn(),
  sends: vi.fn(),
  account: vi.fn(),
  deleteAccount: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("inngest", () => ({
  Inngest: class {
    createFunction(
      opts: { id: string; triggers: unknown },
      handler: (context: unknown) => Promise<unknown>,
    ) {
      mocks.handlers.set(opts.id, handler);
      return { opts };
    }
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findMany: mocks.users,
      findFirst: mocks.active,
      findUnique: mocks.account,
    },
    send: { findMany: mocks.sends },
  },
}));
vi.mock("@/lib/gmail", () => ({}));
vi.mock("@/lib/storage", () => ({ cleanupAttachments: mocks.cleanup }));
vi.mock("@/lib/account", () => ({
  cleanupDeletedAccount: mocks.deleteAccount,
}));
vi.mock("@/lib/campaigns", () => ({}));
import { scheduledReplies } from "@/lib/inngest";

const userId = "f5a05555-5732-4463-b29e-d4cdfef33354";
const run = async (_id: string, work: () => unknown) => work();

describe("reply polling schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sends.mockResolvedValue([]);
    mocks.active.mockResolvedValue({ id: userId });
  });

  it("registers the cron for 00:00, 08:00, and 16:00 UTC", () => {
    expect(scheduledReplies.opts.triggers).toEqual({ cron: "0 */8 * * *" });
  });

  it("fans out automatic events that respect the eligibility cutoff", async () => {
    mocks.users
      .mockResolvedValueOnce([{ id: userId }])
      .mockResolvedValueOnce([]);
    const sendEvent = vi.fn();
    await mocks.handlers.get("scheduled-replies")!({
      step: { run, sendEvent },
    });
    expect(sendEvent).toHaveBeenCalledWith("refresh-0", [
      { name: "mailloop/replies.refresh", data: { userId, force: false } },
    ]);
    const event = sendEvent.mock.calls[0][1][0];
    await mocks.handlers.get("refresh-replies")!({ event, step: { run } });
    expect(mocks.sends.mock.calls[0][0].where.AND).toHaveLength(2);
  });

  it("stops reply checks for deleted accounts", async () => {
    mocks.active.mockResolvedValue(null);
    await mocks.handlers.get("refresh-replies")!({
      event: { data: { userId } },
      step: { run },
    });
    expect(mocks.sends).not.toHaveBeenCalled();
  });

  it("retries deletion cleanup next minute without blocking healthy accounts", async () => {
    const healthy = "f5a05555-5732-4463-b29e-d4cdfef33355";
    mocks.users
      .mockResolvedValueOnce([{ id: userId }, { id: healthy }])
      .mockResolvedValueOnce([]);
    mocks.account
      .mockResolvedValueOnce({ deletionRequestedAt: new Date() })
      .mockResolvedValueOnce({ deletionRequestedAt: null });
    mocks.deleteAccount.mockRejectedValue(new Error("storage unavailable"));
    await mocks.handlers.get("maintenance")!({ step: { run } });
    expect(mocks.users).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: { gt: healthy } } }),
    );
    expect(mocks.deleteAccount).toHaveBeenCalledWith(userId);
    expect(mocks.cleanup).toHaveBeenCalledWith(healthy);
    expect(mocks.sends).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campaign: { userId: healthy } }),
      }),
    );
  });
  it("keeps manual events free of the eligibility cutoff", async () => {
    await mocks.handlers.get("refresh-replies")!({
      event: { data: { userId } },
      step: { run },
    });
    expect(mocks.sends.mock.calls[0][0].where.AND).toHaveLength(1);
  });
});
