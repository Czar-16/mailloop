import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProgressRing } from "@/components/progress-ring";
import { CampaignProgress } from "@/components/campaign-progress";
import { completionName } from "@/components/ring-completion";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/campaign-progress-actions", () => ({
  getCampaignProgress: vi.fn(),
}));

const batch = {
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: "2026-10-09T10:00:00Z",
  observedAt: "2026-10-09T10:00:33Z",
  finishedAt: "2026-10-09T10:00:33Z",
  sent: 2,
  queued: 0,
  failed: 0,
  review: 0,
  pendingDispatch: false,
  outstanding: 0,
  sending: 0,
  nextSendAt: null,
};
const separate = (props = {}) =>
  createElement(ProgressRing, {
    sent: 2,
    queued: 0,
    failed: 0,
    seconds: 0,
    ...props,
  });

describe("shared successful ring completion", () => {
  it.each([148, 170])(
    "preserves %ipx dimensions and renders an accessible, static initial success",
    (size) => {
      const html = renderToStaticMarkup(
        size === 148
          ? createElement(CampaignProgress, { data: batch })
          : separate(),
      );
      expect(html).toContain(`size-[${size}px]`);
      expect(html).toContain(`width="${size}"`);
      expect(html).toContain(`r="${size === 148 ? 64 : 70}"`);
      expect(html).toContain(`stroke-width="${size === 148 ? 9 : 12}"`);
      expect(html).toContain(`width:${size * 0.45}px;height:${size * 0.45}px`);
      expect(html).toContain(`role="img" aria-label="${completionName}"`);
      expect(html).toContain("ALL SENT");
      expect(html).toContain('stop-color="#6EE7B7"');
      expect(html).toContain('stop-color="#10B981"');
      expect(html).not.toContain("is-entering");
    },
  );
  it("gives simultaneous completion gradients unique IDs", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        separate(),
        separate(),
        createElement(CampaignProgress, { data: batch }),
      ),
    );
    const ids = [
      ...html.matchAll(/<linearGradient id="([^"]+)" x1="100%"/g),
    ].map((match) => match[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });
  it("keeps failed batch displays and status segments", () => {
    const html = renderToStaticMarkup(
      createElement(CampaignProgress, {
        data: { ...batch, sent: 1, failed: 1 },
      }),
    );
    expect(html).toContain("Done");
    expect(html).toContain('stroke="var(--error)"');
    expect(html).not.toContain("ALL SENT");
    const ring = renderToStaticMarkup(separate({ sent: 1, failed: 1 }));
    expect(ring).toContain("Finished");
    expect(ring).toContain("with failures");
    expect(ring).not.toContain("ALL SENT");
  });
  it.each([{ draft: true }, { queued: 1 }, { review: 1 }, { sent: 0 }])(
    "does not claim success for %j",
    (props) => {
      expect(renderToStaticMarkup(separate(props))).not.toContain("ALL SENT");
    },
  );
});
