import { describe, expect, it } from "vitest";
import { batchCountdownProgress } from "@/lib/progress";

describe("whole-batch countdown", () => {
  it("uses continuous time across the entire batch", () => {
    expect(batchCountdownProgress(0, 120000, 0)).toBe(1);
    expect(batchCountdownProgress(0, 120000, 30000)).toBe(0.75);
    expect(batchCountdownProgress(0, 120000, 30500)).toBeCloseTo(0.745833);
  });
  it("keeps the batch start when the queue estimate changes", () => {
    expect(batchCountdownProgress(0, 120000, 40000)).toBeCloseTo(2 / 3);
    expect(batchCountdownProgress(0, 100000, 40000)).toBe(0.6);
    expect(batchCountdownProgress(0, 160000, 40000)).toBe(0.75);
  });
  it("catches up after delayed updates and clamps expired or empty estimates", () => {
    expect(batchCountdownProgress(0, 120000, 90000)).toBe(0.25);
    expect(batchCountdownProgress(0, 120000, 130000)).toBe(0);
    expect(batchCountdownProgress(120000, 120000, 120000)).toBe(0);
    expect(batchCountdownProgress(120000, 100000, 120000)).toBe(0);
    expect(batchCountdownProgress(10000, 120000, 0)).toBe(1);
  });
});
