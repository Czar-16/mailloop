import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class Client {
    $disconnect = vi.fn().mockResolvedValue(undefined);
  }
  return { Constructor: Client };
});
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: mocks.Constructor,
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
const cache = globalThis as unknown as {
  prisma?: { $disconnect: ReturnType<typeof vi.fn> };
  prismaClientConstructor?: typeof mocks.Constructor;
};
afterEach(() => {
  delete cache.prisma;
  delete cache.prismaClientConstructor;
  vi.resetModules();
});

describe("development Prisma cache", () => {
  it("reuses the client when the generated constructor is unchanged", async () => {
    const first = (await import("@/lib/db")).db;
    vi.resetModules();
    expect((await import("@/lib/db")).db).toBe(first);
    expect(first.$disconnect).not.toHaveBeenCalled();
  });
  it("replaces and disconnects a client cached before regeneration", async () => {
    const old = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    cache.prisma = old;
    cache.prismaClientConstructor = class extends mocks.Constructor {};
    const { db } = await import("@/lib/db");
    expect(db).not.toBe(old);
    expect(old.$disconnect).toHaveBeenCalledOnce();
    expect(cache.prismaClientConstructor).toBe(mocks.Constructor);
  });
  it("replaces a legacy cached client with no constructor marker", async () => {
    const old = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    cache.prisma = old;
    expect((await import("@/lib/db")).db).not.toBe(old);
    expect(old.$disconnect).toHaveBeenCalledOnce();
  });
});
