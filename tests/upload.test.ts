import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), store: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/storage", () => ({ storeLocalResume: mocks.store }));
import { POST } from "@/app/api/resume/upload/route";
import { MAX_PDF_BYTES } from "@/lib/validation";
describe("local upload request boundary", () => {
  it("requires a session before reading the body", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          new Request("http://localhost/api/resume/upload", { method: "POST" }),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects cross-origin writes", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: crypto.randomUUID() } });
    expect(
      (
        await POST(
          new Request("http://localhost/api/resume/upload", {
            method: "POST",
            headers: { origin: "https://other.example" },
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("bounds actual body bytes even without Content-Length", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: crypto.randomUUID() } });
    const request = new Request("http://localhost/api/resume/upload", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new Uint8Array(MAX_PDF_BYTES + 65537),
    });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await POST(request)).status).toBe(413);
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
