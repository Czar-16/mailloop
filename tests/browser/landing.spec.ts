import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing: theme reveal keeps the old theme outside the circle without flashing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Dark theme", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (
        typeof options === "object" &&
        options.pseudoElement === "::view-transition-new(root)"
      ) {
        animation.pause();
        // Hold just before the active interval to catch a pre-animation flash.
        animation.currentTime = -1;
      }
      return animation;
    };
  });
  const viewport = page.viewportSize()!;
  const clip = { x: 4, y: viewport.height - 6, width: 2, height: 2 };
  const cornerColor = async () => {
    const png = (await page.screenshot({ clip })).toString("base64");
    return page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }, png);
  };
  for (const theme of ["light", "dark"] as const) {
    const oldCorner = await cornerColor();
    const expectOldCorner = async () => {
      const color = await cornerColor();
      for (let channel = 0; channel < 3; channel++) {
        // Mobile snapshot rasterization may round a channel by one level.
        expect(
          Math.abs(color[channel] - oldCorner[channel]),
        ).toBeLessThanOrEqual(2);
      }
    };
    await page
      .getByRole("button", {
        name: `${theme === "light" ? "Light" : "Dark"} theme`,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getAnimations()
            .some(
              (animation) =>
                (animation.effect as KeyframeEffect).pseudoElement ===
                  "::view-transition-new(root)" &&
                animation.playState === "paused",
            ),
        ),
      )
      .toBe(true);
    // The DOM already has the new palette, but the first rendered frame must
    // still show the old theme outside the zero-radius circle.
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectOldCorner();
    await page.evaluate(() => {
      const animation = document
        .getAnimations()
        .find(
          (animation) =>
            (animation.effect as KeyframeEffect).pseudoElement ===
            "::view-transition-new(root)",
        )!;
      animation.currentTime = 375;
    });
    await expectOldCorner();
    await page.evaluate(() => {
      document
        .getAnimations()
        .find(
          (animation) =>
            (animation.effect as KeyframeEffect).pseudoElement ===
            "::view-transition-new(root)",
        )!
        .finish();
    });
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-reveal");
    const newCorner = await cornerColor();
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(newCorner[channel] - oldCorner[channel])).toBeGreaterThan(
        100,
      );
    }
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          "--theme-reveal-origin",
        ),
      ),
    ).toBe("");
  }
});

for (const theme of ["dark", "light"] as const) {
  test(`landing: ${theme} accessibility, responsiveness, and shared sign-in`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.addInitScript(
      (value) => localStorage.setItem("mailloop-theme", value),
      theme,
    );
    await page.goto("/");
    await expect(page).toHaveTitle(
      "Mailloop — Personalized outreach, made easy",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(
      page.getByRole("img", { name: /Example batch/ }),
    ).toHaveAttribute(
      "aria-label",
      "Example batch: 15 of 15 emails sent, 0 queued, 0 failed",
    );
    for (const width of [360, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const shortTargets = await page
        .locator(".landing a, .landing button")
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getBoundingClientRect().height < 44)
            .map((element) => element.textContent),
        );
      expect(shortTargets).toEqual([]);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    const actions = await page
      .locator(".landing form")
      .evaluateAll((forms) =>
        forms.map((form) =>
          form.querySelector('input[name^="$ACTION_"]')?.getAttribute("name"),
        ),
      );
    expect(actions).toHaveLength(3);
    expect(actions[0]).toBeTruthy();
    expect(new Set(actions).size).toBe(1);
    await page.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/#how$/);
    await expect(page.locator("#how")).toBeInViewport();
    await page.getByRole("link", { name: "Features", exact: true }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator("#features article")).toHaveCount(6);
    await page.goto("/?error=AccessDenied");
    await expect(page.locator(".landing").getByRole("alert")).toContainText(
      "Google sign-in could not complete",
    );
  });
}

test("landing: dark first paint, keyboard switch, persistence, and storage sync", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { landingThemes: seen });
    new MutationObserver(() => {
      const theme = document.documentElement?.dataset.theme;
      if (theme) seen.push(theme);
    }).observe(document, {
      attributes: true,
      attributeFilter: ["data-theme"],
      subtree: true,
    });
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { landingThemes: string[] })
          .landingThemes[0],
    ),
  ).toBe("dark");
  const light = page.getByRole("button", { name: "Light theme", exact: true });
  await light.focus();
  await page.keyboard.press("Enter");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page
        .locator('meta[name="theme-color"]')
        .evaluateAll((elements) =>
          elements.every(
            (element) => element.getAttribute("content") === "#faf9fe",
          ),
        ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => {
    localStorage.setItem("mailloop-theme", "dark");
    dispatchEvent(
      new StorageEvent("storage", { key: "mailloop-theme", newValue: "dark" }),
    );
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page
        .locator('meta[name="theme-color"]')
        .evaluateAll((elements) =>
          elements.every(
            (element) => element.getAttribute("content") === "#0b0a14",
          ),
        ),
    )
    .toBe(true);
});

test("landing: 22-second batch loop, completion fit, pause, and off-screen suspension", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install({ time: new Date("2026-10-09T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-09T10:00:01Z"));
  await page.goto("/");
  const ring = page.getByRole("img", { name: /Example batch/ });
  const card = page.locator(".landing-batch");
  await expect(
    page.getByRole("button", { name: "Pause batch animation" }),
  ).toBeVisible();
  await expect(ring).toHaveAttribute("aria-label", /0 of 15 emails sent/);
  await page.clock.runFor(1100);
  await expect(ring).toHaveAttribute(
    "aria-label",
    /1 of 15 emails sent, 14 queued/,
  );
  await page.getByRole("button", { name: "Pause batch animation" }).click();
  await page.clock.runFor(3000);
  await expect(ring).toHaveAttribute("aria-label", /1 of 15 emails sent/);
  await page.getByRole("button", { name: "Resume batch animation" }).click();
  await page.clock.runFor(14000);
  await expect(card).toHaveAttribute("data-done", "true");
  await page.clock.runFor(1500);
  const fits = await card.locator(".landing-ring-center").evaluate((center) => {
    const outer = center.getBoundingClientRect();
    return [
      ...center.querySelectorAll(
        ".landing-completion-badge, .landing-completion-label",
      ),
    ].every((child) => {
      const box = child.getBoundingClientRect();
      return (
        box.left >= outer.left &&
        box.right <= outer.right &&
        box.top >= outer.top &&
        box.bottom <= outer.bottom
      );
    });
  });
  expect(fits).toBe(true);
  await page.clock.runFor(4500);
  await expect(card).toHaveAttribute("data-done", "true");
  await page.clock.runFor(1000);
  await expect(ring).toHaveAttribute("aria-label", /0 of 15 emails sent/);
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-visible", "false");
  const label = await ring.getAttribute("aria-label");
  await page.clock.runFor(3000);
  await expect(ring).toHaveAttribute("aria-label", label!);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(1100);
  await expect(ring).not.toHaveAttribute("aria-label", label!);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const beforeHidden = await ring.getAttribute("aria-label");
  await page.clock.runFor(3000);
  await expect(ring).toHaveAttribute("aria-label", beforeHidden!);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(1100);
  await expect(ring).not.toHaveAttribute("aria-label", beforeHidden!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card).toHaveAttribute("data-done", "true");
  await expect(
    page.getByRole("button", { name: /batch animation/ }),
  ).toHaveCount(0);
  await page.clock.runFor(30000);
  await expect(card).toHaveAttribute("data-done", "true");
});

test("landing: feature reveal fires once and releases hover transform", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const section = page.locator("#features");
  await expect(section).toHaveAttribute("data-reveal", "pending");
  await expect(section.locator("article").first()).toHaveCSS("opacity", "0");
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-reveal", "visible");
  const first = section.locator("article").first();
  await expect(first).toHaveCSS("opacity", "1");
  // Wait for the entry animation to release its transform before testing hover.
  await first.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  if (!isMobile) {
    await first.hover();
    await expect(first).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -6)");
  }
  await page.locator("header").scrollIntoViewIfNeeded();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-reveal", "visible");
});

test("landing: unavailable observers show features and JavaScript-free content remains readable", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "IntersectionObserver", { value: undefined }),
  );
  await page.goto("/");
  await expect(page.locator("#features article").first()).toHaveCSS(
    "opacity",
    "1",
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.goto(baseURL!);
  await expect(staticPage.locator("#features article").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(staticPage.locator(".landing-batch")).toHaveAttribute(
    "data-done",
    "true",
  );
  await context.close();
});

test("landing: sending state is accessible in both themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause batch animation" }).click();
  for (const theme of ["Light", "Dark"]) {
    await page
      .getByRole("button", { name: `${theme} theme`, exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
    // Audit settled colors, including the badge's 400ms color transition.
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished),
      );
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
