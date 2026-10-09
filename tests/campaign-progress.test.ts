import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignProgress } from "@/components/campaign-progress";
import {
  readCampaignProgress,
  type CampaignProgressData,
} from "@/lib/campaign-progress";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { campaign: { findMany } } }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/campaign-progress-actions", () => ({
  getCampaignProgress: vi.fn(),
}));

const batch: CampaignProgressData = {
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: "2026-10-09T10:00:00Z",
  observedAt: "2026-10-09T10:00:33Z",
  finishedAt: null,
  sent: 0,
  queued: 0,
  failed: 0,
  review: 0,
  pendingDispatch: false,
  outstanding: 0,
  sending: 0,
  nextSendAt: null,
};
const render = (data: CampaignProgressData) =>
  renderToStaticMarkup(createElement(CampaignProgress, { data }));

describe("History batch progress edge states", () => {
  it("renders zero totals without invalid proportions or missing tiles", () => {
    const html = render(batch);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("0 of 0 sent");
    for (const label of ["Sent", "Queued", "Failed"])
      expect(html).toContain(`>${label}</dt>`);
    expect(html.match(/width:0%/g)).toHaveLength(4);
    expect(
      renderToStaticMarkup(createElement(CampaignProgress, { data: null })),
    ).toBe("");
  });

  it("keeps review-only batches active without claiming confirmed completion", () => {
    const html = render({ ...batch, review: 2 });
    expect(html).toContain("NEEDS REVIEW");
    expect(html).toContain("Delivery needs review · 2");
    expect(html).toContain(
      "0 sent, 0 queued, 0 failed, 2 need review out of 2",
    );
    expect(html).toContain("Sending");
    expect(html).not.toContain("All messages confirmed by the service.");
    expect(html).not.toContain("completion-check");
    expect(html).not.toContain("Remaining");
    expect(html).not.toContain("batch-countdown-track");
  });

  it("does not mistake the in-flight safety reservation for a one-recipient timer", () => {
    const html = render({
      ...batch,
      queued: 1,
      outstanding: 1,
      sending: 1,
      nextSendAt: "2026-10-09T10:01:33Z",
    });
    expect(html).toContain("CONFIRMING");
    expect(html).toContain("Awaiting confirmation");
    expect(html).not.toContain("1:00");
    expect(html).not.toContain("NEXT SEND");
    expect(html).not.toContain("Remaining");
    const complete = render({
      ...batch,
      sent: 1,
      finishedAt: "2026-10-09T10:00:40Z",
    });
    expect(complete).toContain("completion-check");
    expect(complete).toContain("ALL SENT");
    expect(complete).not.toContain("batch-countdown-track");
  });

  it("does not invent a countdown when the service has not scheduled a send", () => {
    const html = render({
      ...batch,
      queued: 1,
      outstanding: 1,
      pendingDispatch: true,
    });
    expect(html).toMatch(/timer-value[^>]*>Sending</);
    expect(html).toContain("BE PATIENT");
    expect(html).not.toContain("NEXT SEND");
    expect(html).not.toContain("Remaining");
  });

  it("hides timing for one selected recipient even with a future schedule", () => {
    const html = render({
      ...batch,
      queued: 1,
      outstanding: 1,
      nextSendAt: "2026-10-09T10:01:33Z",
    });
    expect(html).toMatch(/timer-value[^>]*>Sending</);
    expect(html).not.toContain("1:00");
    expect(html).not.toContain("EST. LEFT");
    expect(html).not.toContain("batch-countdown-track");
    expect(html).not.toContain("Remaining");
  });

  it("keeps the batch timer for the final in-flight message of a larger batch", () => {
    const html = render({
      ...batch,
      sent: 1,
      queued: 1,
      outstanding: 1,
      sending: 1,
      nextSendAt: "2026-10-09T10:00:40Z",
    });
    expect(html).toContain("0:07");
    expect(html).toContain("EST. LEFT");
    expect(html).toContain("Remaining");
  });

  it("retains service-delay warnings and uses the whole-batch estimate", () => {
    const html = render({
      ...batch,
      queued: 2,
      outstanding: 2,
      pendingDispatch: true,
      nextSendAt: "2026-10-09T10:00:40Z",
    });
    expect(html).toContain("0:47");
    expect(html).toContain('class="batch-countdown-track"');
    expect(html).toContain('class="batch-countdown-arc"');
    expect(html).toContain('r="53"');
    expect(html).toContain("EST. LEFT");
    expect(html).toContain("Waiting for delivery service");
    expect(html).toContain(
      "Retries and service delays can extend this estimate.",
    );
  });

  it("keeps the inner track when a larger batch estimate has expired", () => {
    const html = render({
      ...batch,
      sent: 1,
      queued: 1,
      outstanding: 1,
      nextSendAt: batch.createdAt,
    });
    expect(html).toMatch(/timer-value[^>]*>Sending</);
    expect(html).toContain("BE PATIENT");
    expect(html).toContain("batch-countdown-track");
    expect(html).toContain(`stroke-dashoffset="${2 * Math.PI * 53}"`);
  });
});

it("reports in-flight sends separately without changing queued totals", async () => {
  findMany.mockResolvedValue([
    {
      id: batch.id,
      createdAt: new Date(batch.createdAt),
      sends: [
        {
          status: "QUEUED",
          deliveryState: "ATTEMPTING",
          dispatchedAt: new Date(),
          attemptedAt: new Date(),
          sentAt: null,
        },
        {
          status: "QUEUED",
          deliveryState: "READY",
          dispatchedAt: new Date(),
          attemptedAt: null,
          sentAt: null,
        },
        {
          status: "FAILED",
          deliveryState: "UNCERTAIN",
          dispatchedAt: new Date(),
          attemptedAt: new Date(),
          sentAt: null,
        },
      ],
    },
  ]);
  const data = await readCampaignProgress(
    { id: "test-user", nextSendAt: new Date("2026-10-09T10:01:33Z") },
    [batch.id],
  );
  expect(data).toMatchObject({
    queued: 2,
    outstanding: 2,
    sending: 1,
    review: 1,
    finishedAt: null,
  });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ userId: "test-user" }),
    }),
  );
});
