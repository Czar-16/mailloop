import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), export: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/account", () => ({ exportAccount: mocks.export }));
import { GET } from "@/app/api/account/export/route";
describe("account export HTTP boundary", () => {
  it("requires authentication and prevents caching", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.export).not.toHaveBeenCalled();
  });
  it("downloads a JSON file using the session owner", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    mocks.export.mockResolvedValue({ version: 1 });
    const response = await GET();
    expect(mocks.export).toHaveBeenCalledWith("owner");
    expect(response.headers.get("Content-Disposition")).toContain(
      "mailloop-data.json",
    );
    expect(await response.json()).toEqual({ version: 1 });
  });
});
