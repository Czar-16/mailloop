import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
const mocks = vi.hoisted(() => ({
  config: {} as NextAuthConfig,
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  lock: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { auth: mocks.auth };
  },
}));
vi.mock("@/lib/db", () => {
  const tx = {
    user: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
    },
    $queryRaw: mocks.lock,
  };
  return {
    db: {
      ...tx,
      $transaction: (work: (client: typeof tx) => unknown) => work(tx),
    },
  };
});
import "@/auth";
const jwt = () =>
  mocks.config.callbacks!.jwt!({
    token: {},
    user: { id: "user" },
    account: {
      provider: "google",
      type: "oauth",
      providerAccountId: "google-id",
      refresh_token: "DO-NOT-LOG",
    },
    profile: {
      sub: "google-id",
      email: "user@example.test",
      email_verified: true,
    },
  });
describe("deletion authentication boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("blocks reconnect under the deletion lock without storing new credentials", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user" });
    mocks.findUnique.mockResolvedValue({ deletionRequestedAt: new Date() });
    await expect(jwt()).rejects.toThrow("deletion in progress");
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("disables old sessions and sessions for removed users", async () => {
    for (const user of [{ deletionRequestedAt: new Date() }, null]) {
      mocks.findUnique.mockResolvedValue(user);
      const callback = mocks.config.callbacks!.session! as (input: {
        session: Session;
        token: JWT;
      }) => Promise<Session>;
      const session = await callback({
        session: { user: { id: "old" }, expires: "future" },
        token: { userId: "old" },
      });
      expect(session.user?.id).toBe("");
    }
  });
});
