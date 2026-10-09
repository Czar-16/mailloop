import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Playwright rewrites JSX for component testing; render real React markup outside it.
const html = execFileSync(
  process.execPath,
  ["--import", "tsx", path.resolve("tests/fixtures/render-ring.ts")],
  { encoding: "utf8" },
);

for (const reducedMotion of [false, true]) {
  test(`170px completed ring fits both themes (${reducedMotion ? "reduced" : "normal"} motion)`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    await page.setContent(html);
    const ring = page.locator(".progress-ring");
    await expect(
      ring.getByRole("img", { name: "Batch complete. All emails sent." }),
    ).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      const box = await ring.boundingBox();
      expect(box!.width).toBe(170);
      expect(box!.height).toBe(170);
      expect(
        await ring
          .locator(".completion-badge")
          .evaluate((element) => element.getBoundingClientRect().width),
      ).toBe(76.5);
      expect(
        await ring.evaluate(
          (element) => element.getAnimations({ subtree: true }).length,
        ),
      ).toBe(0);
      expect(
        await ring.locator(".completion-inner").evaluate((inner) => {
          const box = inner.getBoundingClientRect();
          return (
            [
              ...inner.querySelectorAll(".completion-badge, .completion-label"),
            ].every((element) => {
              const rect = element.getBoundingClientRect();
              return [
                [rect.left, rect.top],
                [rect.right, rect.top],
                [rect.left, rect.bottom],
                [rect.right, rect.bottom],
              ].every(
                ([x, y]) =>
                  Math.hypot(
                    x - box.x - box.width / 2,
                    y - box.y - box.height / 2,
                  ) <=
                  box.width / 2 + 0.5,
              );
            }) && getComputedStyle(inner).overflow === "hidden"
          );
        }),
      ).toBe(true);
      await expect(ring.locator(".completion-ripple")).toHaveCSS(
        "opacity",
        "0",
      );
    }
  });
}
