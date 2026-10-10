import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => ({ list: mocks.list, del: mocks.del }));
vi.mock("@/lib/db", () => ({ db: {} }));
import { deleteOwnedResumes } from "@/lib/storage";
const userId = "f5a05555-5732-4463-b29e-d4cdfef33354";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("owned Blob cleanup", () => {
  it("enumerates all tenant-prefix pages including uploads without database metadata", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "FAKE-TEST-TOKEN");
    mocks.list
      .mockResolvedValueOnce({
        blobs: [{ url: "https://blob/first" }],
        hasMore: true,
        cursor: "next",
      })
      .mockResolvedValueOnce({
        blobs: [{ url: "https://blob/unactivated" }],
        hasMore: false,
      });
    await deleteOwnedResumes(userId);
    expect(mocks.list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prefix: `resumes/${userId}/`,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ prefix: `resumes/${userId}/`, cursor: "next" }),
    );
    expect(mocks.del).toHaveBeenNthCalledWith(
      2,
      ["https://blob/unactivated"],
      expect.any(Object),
    );
  });
  it("propagates storage failure so the disabled account survives for maintenance retry", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "FAKE-TEST-TOKEN");
    mocks.list.mockResolvedValue({
      blobs: [{ url: "https://blob/private" }],
      hasMore: false,
    });
    mocks.del.mockRejectedValue(new Error("storage outage"));
    await expect(deleteOwnedResumes(userId)).rejects.toThrow("storage outage");
    await expect(deleteOwnedResumes("../../another-user")).rejects.toThrow(
      "Invalid account",
    );
  });
});
