import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandleUploadOptions } from "@vercel/blob/client";
const mocks = vi.hoisted(() => ({
  options: {} as HandleUploadOptions,
  payload: null as
    Parameters<NonNullable<HandleUploadOptions["onUploadCompleted"]>>[0] | null,
  auth: vi.fn(),
  user: vi.fn(),
  owner: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { user: { findFirst: mocks.user, findUnique: mocks.owner } },
}));
vi.mock("@vercel/blob", () => ({ del: mocks.del }));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: async (options: HandleUploadOptions) => {
    mocks.options = options;
    if (mocks.payload) await options.onUploadCompleted!(mocks.payload);
    return { type: "test" };
  },
}));
import { POST } from "@/app/api/resume/blob/route";
const userId = "f5a05555-5732-4463-b29e-d4cdfef33354";
const pathname = `resumes/${userId}/f5a05555-5732-4463-b29e-d4cdfef33355.pdf`;
describe("Blob deletion boundaries after service signature verification", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.payload = null;
    mocks.owner.mockResolvedValue(null);
    await POST(
      new Request("http://localhost/api/resume/blob", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: "{}",
      }),
    );
  });
  it("does not issue upload authorization for a disabled account", async () => {
    mocks.auth.mockResolvedValue({ user: { id: userId } });
    mocks.user.mockResolvedValue(null);
    await expect(
      mocks.options.onBeforeGenerateToken(pathname, null, false),
    ).rejects.toThrow("unavailable");
  });
  it("issues a tenant-bound token for at most ten minutes", async () => {
    mocks.auth.mockResolvedValue({ user: { id: userId } });
    mocks.user.mockResolvedValue({ id: userId });
    const now = Date.now();
    const token = await mocks.options.onBeforeGenerateToken(
      pathname,
      null,
      false,
    );
    expect(JSON.parse(token.tokenPayload!)).toEqual({ userId });
    expect(token.validUntil).toBeLessThanOrEqual(now + 600001);
    expect(token.allowOverwrite).toBe(false);
  });
  it("preserves an already activated PDF during the worker drain window", async () => {
    mocks.owner.mockResolvedValue({ deletionRequestedAt: new Date() });
    await mocks.options.onUploadCompleted!({
      tokenPayload: JSON.stringify({ userId }),
      blob: {
        pathname,
        url: "https://private.blob.vercel-storage.com/owned",
        downloadUrl: "https://private.blob.vercel-storage.com/owned",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        etag: "test",
      },
    });
    expect(mocks.del).not.toHaveBeenCalled();
  });
  it("returns a retryable service response when late-upload removal fails", async () => {
    mocks.user.mockResolvedValue(null);
    mocks.del.mockRejectedValueOnce(new Error("storage outage"));
    mocks.payload = {
      tokenPayload: JSON.stringify({ userId }),
      blob: {
        pathname,
        url: "https://private.blob.vercel-storage.com/owned",
        downloadUrl: "https://private.blob.vercel-storage.com/owned",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        etag: "test",
      },
    };
    const response = await POST(
      new Request("http://localhost/api/resume/blob", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
  });
  it("removes late unactivated uploads for missing accounts and propagates storage failures for retries", async () => {
    mocks.user.mockResolvedValue(null);
    const payload = {
      tokenPayload: JSON.stringify({ userId }),
      blob: {
        pathname,
        url: "https://private.blob.vercel-storage.com/owned",
        downloadUrl: "https://private.blob.vercel-storage.com/owned",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        etag: "test-etag",
      },
    };
    await mocks.options.onUploadCompleted!(payload);
    expect(mocks.del).toHaveBeenCalledWith(
      payload.blob.url,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    mocks.del.mockRejectedValueOnce(new Error("retry storage"));
    await expect(mocks.options.onUploadCompleted!(payload)).rejects.toThrow(
      "cleanup requires retry",
    );
  });
});
