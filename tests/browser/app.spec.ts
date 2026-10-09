import "dotenv/config";
import { test as base, expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { encryptToken } from "../../src/lib/crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Browser tests require a local database.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function expectCenterToFit(card: Locator) {
  const center = card.locator(".batch-ring-center");
  const overflowing = await center.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...element.children].flatMap((child) => {
      const range = document.createRange();
      range.selectNodeContents(child);
      return [...range.getClientRects()]
        .filter(
          (rect) => rect.left < box.left - 0.5 || rect.right > box.right + 0.5,
        )
        .map((rect) => ({
          text: child.textContent,
          left: rect.left,
          right: rect.right,
          centerLeft: box.left,
          centerRight: box.right,
        }));
    });
  });
  expect(overflowing).toEqual([]);
}
const test = base.extend<{ userId: string }>({
  userId: async ({ context }, runFixture) => {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO "User" (id,email,name,"googleId","gmailAuthorized","encryptedRefreshToken") VALUES ($1,$2,$3,$4,true,$5)',
      [
        id,
        `${id}@example.test`,
        "Test User",
        id,
        encryptToken("FAKE-BROWSER-TEST-TOKEN"),
      ],
    );
    const salt = "authjs.session-token";
    const token = await encode({
      secret: process.env.AUTH_SECRET!,
      salt,
      token: {
        userId: id,
        sub: id,
        name: "Test User",
        email: `${id}@example.test`,
      },
    });
    await context.addCookies([
      {
        name: salt,
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        expires: Date.now() / 1000 + 3600,
      },
    ]);
    await runFixture(id);
    await pool.query('DELETE FROM "Campaign" WHERE "userId"=$1', [id]);
    await pool.query('DELETE FROM "User" WHERE id=$1', [id]);
    await rm(path.join(process.cwd(), "uploads", "resumes", id), {
      recursive: true,
      force: true,
    });
  },
});
base("public landing and protected-route authentication", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Send up to 15 cold emails at once.",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const route of [
    "compose",
    "templates",
    "contacts",
    "history",
    "settings",
  ]) {
    await page.goto(`/${route}`);
    await expect(page).toHaveURL(/\/$/);
  }
  const response = await page.request.get("/api/resume/download");
  expect(response.status()).toBe(401);
});
test("workspace pages are accessible and fit the viewport", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  for (const route of [
    "compose",
    "templates",
    "contacts",
    "history",
    "settings",
  ]) {
    await page.goto(`/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(
      0,
    );
    await page.locator(".page-transition").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    // Check steady-state contrast after the deliberately translucent entrance.
    await page.locator(".help-cloud-entrance").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations,
      `${route}: ${result.violations.map((v) => v.id).join(", ")}`,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
test("Compose infinity mail motion, themes, and reduced motion", async ({
  page,
  userId,
}, testInfo) => {
  expect(userId).toBeTruthy();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/compose");
  const svg = page.locator(".infinity-mail-loop");
  await expect(svg.locator("animateMotion")).toHaveCount(6);
  await expect(svg).toBeVisible();
  const samples = await svg.evaluate((element) => {
    const svg = element as SVGSVGElement;
    svg.pauseAnimations();
    const path = svg.querySelector<SVGPathElement>("#loop")!;
    const total = path.getTotalLength();
    const envelope = svg.querySelector<SVGGElement>(".mail-loop-envelope")!;
    const position = (element: SVGGraphicsElement) => {
      const matrix = svg.getCTM()!.inverse().multiply(element.getCTM()!);
      return { x: matrix.e, y: matrix.f, b: matrix.b, c: matrix.c };
    };
    const sample = (time: number) => {
      svg.setCurrentTime(time);
      const expected = path.getPointAtLength(total * ((time % 6) / 6));
      const actual = position(envelope);
      return {
        error: Math.hypot(actual.x - expected.x, actual.y - expected.y),
        rotation: Math.abs(actual.b) + Math.abs(actual.c),
      };
    };
    svg.setCurrentTime(0);
    const initiallyHidden = [...svg.querySelectorAll(".mail-loop-trail")].every(
      (dot) => getComputedStyle(dot).opacity === "0",
    );
    const pulses = [
      ...svg.querySelectorAll<SVGCircleElement>(
        ".mail-loop-node > circle:first-child",
      ),
    ].map((circle) => {
      const arrival = Number(
        circle
          .querySelector("animate")!
          .getAttribute("keyTimes")!
          .split(";")[2],
      );
      svg.setCurrentTime(arrival * 6);
      const point = path.getPointAtLength(arrival * total);
      const actual = position(envelope);
      return {
        arrival,
        nodeError: Math.hypot(point.x - circle.cx.baseVal.value, point.y - 90),
        envelopeError: Math.hypot(actual.x - point.x, actual.y - point.y),
        radius: circle.r.animVal.value,
        opacity: Number(getComputedStyle(circle).opacity),
      };
    });
    const motion = [0.5, 1.5, 3, 4.5, 6, 7.5].map(sample);
    // Step two full loops at 60fps, including every center crossing and each
    // trail's wraparound. Sparse position samples can miss a closing-segment hold.
    const continuousMotion = [
      envelope,
      ...svg.querySelectorAll<SVGCircleElement>(".mail-loop-trail"),
    ].map((element) => ({
      element,
      delay: parseFloat(
        element.querySelector("animateMotion")!.getAttribute("begin") ?? "0",
      ),
      previous: null as { x: number; y: number } | null,
      minimumStep: Infinity,
      maximumError: 0,
      maximumErrorTime: 0,
      frames: 0,
    }));
    for (let frame = 0; frame <= 780; frame++) {
      const time = frame / 60;
      svg.setCurrentTime(time);
      for (const sample of continuousMotion) {
        // SMIL begin times have float precision; sample delayed dots only
        // after their initial begin, when the motion transform is active.
        if (
          time < sample.delay ||
          (sample.delay > 0 && time - sample.delay < 0.00001)
        )
          continue;
        const actual = position(sample.element);
        const expected = path.getPointAtLength(
          total * (((time - sample.delay) % 6) / 6),
        );
        const error = Math.hypot(actual.x - expected.x, actual.y - expected.y);
        if (error > sample.maximumError) sample.maximumErrorTime = time;
        sample.maximumError = Math.max(
          sample.maximumError,
          Math.hypot(actual.x - expected.x, actual.y - expected.y),
        );
        if (sample.previous)
          sample.minimumStep = Math.min(
            sample.minimumStep,
            Math.hypot(
              actual.x - sample.previous.x,
              actual.y - sample.previous.y,
            ),
          );
        sample.previous = actual;
        sample.frames++;
      }
    }
    svg.setCurrentTime(2);
    const trails = [
      ...svg.querySelectorAll<SVGCircleElement>(".mail-loop-trail"),
    ].map((dot) => {
      const delay = parseFloat(
        dot.querySelector("animateMotion")!.getAttribute("begin")!,
      );
      const expected = path.getPointAtLength(total * ((2 - delay) / 6));
      const actual = position(dot);
      return {
        error: Math.hypot(actual.x - expected.x, actual.y - expected.y),
        opacity: Number(getComputedStyle(dot).opacity),
      };
    });
    return {
      initiallyHidden,
      pulses,
      motion,
      trails,
      continuousMotion: continuousMotion.map(
        ({ minimumStep, maximumError, maximumErrorTime, frames }) => ({
          minimumStep,
          maximumError,
          maximumErrorTime,
          frames,
        }),
      ),
      expectedStep: total / 360,
    };
  });
  await testInfo.attach("mail-loop-motion-samples", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
  expect(samples.initiallyHidden).toBe(true);
  for (const sample of samples.continuousMotion) {
    expect(sample.frames).toBeGreaterThan(720);
    expect(sample.minimumStep).toBeGreaterThan(samples.expectedStep * 0.4);
    expect(sample.maximumError).toBeLessThan(0.2);
  }
  for (const pulse of samples.pulses) {
    expect(pulse.nodeError).toBeLessThan(0.1);
    expect(pulse.envelopeError).toBeLessThan(0.2);
    expect(pulse.radius).toBeCloseTo(18, 2);
    expect(pulse.opacity).toBeCloseTo(0.08, 2);
  }
  for (const sample of samples.motion) {
    expect(sample.error).toBeLessThan(0.2);
    expect(sample.rotation).toBeLessThan(0.001);
  }
  for (const trail of samples.trails) {
    expect(trail.error).toBeLessThan(0.2);
    expect(trail.opacity).toBeGreaterThan(0);
  }
  for (const [theme, color] of [
    ["Light", "rgb(109, 74, 255)"],
    ["Dark", "rgb(139, 108, 255)"],
  ]) {
    await page
      .getByRole("button", { name: `${theme} theme`, exact: true })
      .click();
    await expect(svg.locator("#loop")).toHaveCSS("stroke", color);
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await Promise.all(
        document.documentElement
          .getAnimations({ subtree: true })
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const hero = await page.locator(".compose-hero").boundingBox();
    const search = await page
      .locator('label[for="compose-search"]')
      .boundingBox();
    expect(search!.y - (hero!.y + hero!.height)).toBeCloseTo(22, 0);
    await page
      .locator(".compose-hero")
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.locator(".compose-hero").screenshot({
      path: testInfo.outputPath(`compose-loop-${theme.toLowerCase()}.png`),
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(svg).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375);
    await page.setViewportSize({ width: 1024, height: 768 });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(svg.locator("animate, animateMotion, set")).toHaveCount(0);
  await expect(svg.locator(".mail-loop-trail")).toHaveCount(0);
  await expect(svg.locator(".mail-loop-envelope")).toHaveAttribute(
    "transform",
    "translate(150 90)",
  );
  // Also verify a fresh reduced-motion load and subsequent preference changes.
  await page.reload();
  await expect(svg.locator("animate, animateMotion, set")).toHaveCount(0);
  await expect(svg.locator(".mail-loop-envelope")).toHaveAttribute(
    "transform",
    "translate(150 90)",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(svg.locator("animateMotion")).toHaveCount(6);
  expect(errors).toEqual([]);
});
test("workspace tab entry motion preserves same-page updates and respects reduced motion", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/compose");
  const content = page.locator(".page-transition");
  const original = await content.elementHandle();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation
    .getByRole("link", { name: "Templates", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(
    0,
  );
  expect(await original!.evaluate((element) => element.isConnected)).toBe(
    false,
  );
  expect(
    await content.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.animationName, style.animationDuration];
    }),
  ).toEqual(["page-enter", "0.35s"]);

  const nameInput = page.getByLabel("Template name", { exact: true });
  for (const [theme, border] of [
    ["Light", "rgb(109, 74, 255)"],
    ["Dark", "rgb(139, 108, 255)"],
  ]) {
    await page
      .getByRole("button", { name: `${theme} theme`, exact: true })
      .click();
    await nameInput.focus();
    await expect(nameInput).toHaveCSS("border-top-color", border);
    await expect(page.locator("form.panel")).toHaveCSS(
      "border-top-color",
      border,
    );
  }

  const templatesContent = await content.elementHandle();
  await page.getByLabel("Template name", { exact: true }).fill("UI check");
  expect(
    await templatesContent!.evaluate((element) => element.isConnected),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.dismiss());
  await navigation.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await page.getByLabel("Template name", { exact: true }).fill("");
  page.once("dialog", (dialog) => dialog.accept());

  for (const name of ["History", "Contacts", "Settings", "Compose"]) {
    await navigation.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(
      0,
    );
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/compose$/);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await navigation.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  expect(
    await content.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe("none");
  const contactsContent = await content.elementHandle();
  await page.evaluate(() => {
    window.history.pushState(null, "", "/contacts?q=no-match");
  });
  await expect(page).toHaveURL(/q=no-match/);
  expect(
    await contactsContent!.evaluate((element) => element.isConnected),
  ).toBe(true);
});

test("navigation highlight follows keyboard navigation, scrolling and resizing", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/compose");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const pill = nav.locator(".workspace-nav-highlight");
  await expect(pill).toHaveCount(1);
  const expectAligned = async () => {
    await expect
      .poll(() =>
        nav.evaluate((element) => {
          const active = element
            .querySelector('a[aria-current="page"]')!
            .getBoundingClientRect();
          const highlight = element
            .querySelector(".workspace-nav-highlight")!
            .getBoundingClientRect();
          return (
            Math.abs(active.x - highlight.x) < 1 &&
            Math.abs(active.width - highlight.width) < 1
          );
        }),
      )
      .toBe(true);
  };
  await expectAligned();
  await nav.getByRole("link", { name: "Settings", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
  await expectAligned();
  expect(await nav.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0,
  );
  await expect(pill).toHaveCSS("transition-duration", "0.3s, 0.3s, 0.3s");
  await page.setViewportSize({ width: 1100, height: 800 });
  await expectAligned();
  await page.goBack();
  await expect(page).toHaveURL(/\/compose$/);
  await expectAligned();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expectAligned();
  await expect(pill).toHaveCSS("transition-duration", "0s");
  await expect(
    nav.getByRole("link", { name: "Contacts", exact: true }),
  ).toHaveCSS("transition-duration", "0s");
});

test("page skeletons stream while data loads and shimmer respects reduced motion", async ({
  page,
  userId,
}) => {
  const attachmentId = randomUUID();
  await pool.query(
    'INSERT INTO "Attachment" (id,"userId","fileName","storagePath") VALUES ($1,$2,$3,$4)',
    [attachmentId, userId, "resume.pdf", "test-skeleton.pdf"],
  );
  await pool.query(
    'UPDATE "User" SET "preferredRoles"=$2,"currentAttachmentId"=$3 WHERE id=$1',
    [userId, ["Engineer"], attachmentId],
  );
  const blocker = await pool.connect();
  try {
    for (const [route, table] of [
      ["compose", "Contact"],
      ["templates", "Contact"],
      ["history", "Send"],
      ["contacts", "Contact"],
      ["settings", "Attachment"],
    ]) {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await blocker.query("BEGIN");
      await blocker.query(`LOCK TABLE "${table}" IN ACCESS EXCLUSIVE MODE`);
      try {
        await page.goto(`/${route}`, { waitUntil: "commit" });
        const loading = page.getByRole("status", {
          name: `Loading ${route}`,
          exact: true,
        });
        await expect(loading).toBeVisible();
        await expect(
          page.getByRole("navigation", { name: "Main navigation" }),
        ).toBeVisible();
        const skeleton = loading.locator(".skeleton").first();
        expect(
          await skeleton.evaluate(
            (element) => getComputedStyle(element, "::after").animationName,
          ),
        ).toBe("skeleton-shimmer");
        await page
          .getByRole("button", { name: "Dark theme", exact: true })
          .click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark",
        );
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
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await page.emulateMedia({ reducedMotion: "reduce" });
        expect(
          await skeleton.evaluate(
            (element) => getComputedStyle(element, "::after").display,
          ),
        ).toBe("none");
        await page.screenshot({
          path: `/tmp/mailloop-skeleton-${route}-${test.info().project.name}.png`,
          fullPage: true,
        });
      } finally {
        await blocker.query("ROLLBACK");
      }
      await expect(
        page.locator('[role="status"][aria-busy="true"]'),
      ).toHaveCount(0);
      await expect(page.locator("main h1")).toBeVisible();
    }
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});

test("default queue ring is purple and selected recipients retain yellow in both themes", async ({
  page,
  userId,
}) => {
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Engineer"],
  ]);
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      randomUUID(),
      userId,
      "UI template",
      "Hello {{name}}",
      "Hi {{name}}, exploring {{role}}.",
    ],
  );
  await pool.query(
    'INSERT INTO "Contact" (id,"userId",name,email,"jobRole") VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), userId, "UI Recipient", "ui@example.test", "Engineer"],
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/compose");
  await expect(
    page.getByLabel("Choose a template", { exact: true }),
  ).toHaveValue("");
  const ring = page.locator(".progress-ring");
  const recipient = page.getByRole("checkbox", { name: /UI Recipient/ });
  for (const [theme, yellow] of [
    ["Light", "rgb(217, 154, 0)"],
    ["Dark", "rgb(251, 191, 36)"],
  ]) {
    await page
      .getByRole("button", { name: `${theme} theme`, exact: true })
      .click();
    await expect(ring).toContainText("0:00");
    await expect(ring.locator("circle").first()).toHaveAttribute(
      "stroke",
      /^url\(#.+\)$/,
    );
    expect(
      await ring
        .locator(".progress-arc")
        .evaluate((element) => getComputedStyle(element).filter),
    ).not.toBe("none");
    await recipient.check();
    await expect(
      page.getByLabel("Choose a template", { exact: true }),
    ).toHaveValue("");
    await expect(ring).toContainText("0:40");
    await expect(ring.locator(".progress-arc")).toHaveCount(0);
    const selectedArc = ring.locator('circle[stroke="var(--queued)"]');
    await expect(selectedArc).toHaveCSS("opacity", "1");
    await expect(selectedArc).toHaveCSS("stroke", yellow);
    await expect(selectedArc).toHaveCSS("filter", "none");
    await recipient.uncheck();
    await expect(ring.locator(".progress-arc")).toHaveCount(1);
  }
});

test("template, contact import, preview, and individual campaign queue", async ({
  page,
  userId,
}) => {
  await page.goto("/templates");
  await page.getByLabel("Template name", { exact: true }).fill("Introduction");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("{{role}} at {{company}}");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Hi {{name}},\nI’d love to help {{company}} as a {{role}}.");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "Template saved." }),
  ).toBeVisible();
  await page.goto("/contacts");
  await page
    .getByLabel("Or paste your list", { exact: true })
    .fill(
      "name,email,company\nAlex,alex@example.test,Acme\nSam,sam@example.test,Other\nDuplicate,ALEX@example.test,Acme\nBad,invalid,Acme",
    );
  await page.getByLabel("Bulk Job Role", { exact: true }).fill("Engineer");
  await page.getByRole("button", { name: "Preview Import" }).click();
  await expect(
    page.getByText("2 valid · 1 duplicate · 1 invalid"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  await page
    .getByLabel("Row 5 email", { exact: true })
    .fill("alex@example.test");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "2 contacts imported. 0 rows skipped." }),
  ).toBeVisible();
  await expect(page.getByTestId("success-toast")).toContainText(
    "Contacts imported successfully.",
  );
  await page.goto("/compose");
  await page.getByLabel("Role to Apply to Selected").fill("Engineer");
  await page.getByRole("checkbox", { name: /Alex/ }).check();
  await expect(
    page.getByLabel("Choose a template", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Send to 1 recipient", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".send-checklist")).toContainText(
    "Choose one under 01 / The Message",
  );
  await page
    .getByLabel("Choose a template", { exact: true })
    .selectOption({ label: "Introduction" });
  await expect(
    page.getByRole("heading", { name: "Engineer at Acme", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Hi Alex,", { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/mailloop-compose-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Send to 1 recipient", exact: true })
    .click();
  await expect(page).toHaveURL(/\/history\?campaign=/);
  await expect(
    page.getByText("Waiting for delivery service", { exact: true }).first(),
  ).toBeVisible();
  const rows = await pool.query(
    'SELECT s."recipientEmail",s.subject,s.body FROM "Send" s JOIN "Campaign" c ON c.id=s."campaignId" WHERE c."userId"=$1',
    [userId],
  );
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0].recipientEmail).toBe("alex@example.test");
  await page.goto("/compose");
  await expect(page.getByRole("checkbox", { name: /Alex/ })).toBeDisabled();
});
test("private resume upload, download, replacement, and removal", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  await page.goto("/settings");
  await page.getByLabel("Choose PDF", { exact: true }).setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await page.getByRole("button", { name: "Save Resume", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "resume.pdf", exact: true }),
  ).toBeVisible();
  const download = await page.request.get("/api/resume/download");
  expect(download.status()).toBe(200);
  expect((await download.body()).toString()).toContain("%PDF-");
  expect(download.headers()["cache-control"]).toBe("private, no-store");
  await page.getByLabel("Replace PDF", { exact: true }).setInputFiles({
    name: "new.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nnew\n%%EOF"),
  });
  await page.getByRole("button", { name: "Save Resume", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "new.pdf", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(page.getByLabel("Choose PDF", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/resume/download")).status()).toBe(404);
});
test("recipient cap, duplicate override, search persistence, and keyboard focus", async ({
  page,
  userId,
}) => {
  const templateId = randomUUID();
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [templateId, userId, "Short", "Hi {{name}}", "Hello {{company}}"],
  );
  for (let i = 0; i < 16; i++)
    await pool.query(
      'INSERT INTO "Contact" (id,"userId",name,email,company) VALUES ($1,$2,$3,$4,$5)',
      [
        randomUUID(),
        userId,
        `Person ${String(i).padStart(2, "0")}`,
        `person${i}@example.test`,
        "Acme",
      ],
    );
  await page.goto("/compose");
  const checkboxes = page.getByRole("checkbox");
  for (let i = 0; i < 15; i++) await checkboxes.nth(i).check();
  await expect(checkboxes.nth(15)).toBeDisabled();
  await expect(page.getByText("15 / 15 selected")).toBeVisible();
  await page.getByLabel("Search recipients").fill("Person 00");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Person/);
  await expect(page.getByText("15 / 15 selected")).toBeVisible();
  await page.getByRole("checkbox", { name: /Person 00/ }).uncheck();
  await expect(page.getByText("14 / 15 selected")).toBeVisible();
  await page.getByLabel("Role to Apply to Selected").focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    ),
  ).not.toBe("none");
});

test("invalid template keeps typed values and focuses the field error", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  await page.goto("/templates");
  await page.getByLabel("Template name", { exact: true }).fill("Keep my draft");
  await page.getByLabel("Subject", { exact: true }).fill("Hello");
  await page.getByLabel("Message", { exact: true }).fill("Hi {{unknown}}");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await expect(page.getByTestId("success-toast")).toHaveCount(0);
  await expect(page.getByTestId("success-confirmation")).toHaveCount(0);
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "Keep my draft",
  );
  await page.getByLabel("Message", { exact: true }).fill("Hi {{name}}");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "Template saved." }),
  ).toBeVisible();
});

test("setup, name suggestion manual override, account menu, and theme persistence", async ({
  page,
  userId,
}) => {
  await page.goto("/contacts");
  await page
    .getByRole("button", { name: "SDE Intern", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Save Preferences", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose Your Preferred Roles" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Email", { exact: true })
    .fill("alex.smith123@example.test");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex");
  await page.getByLabel("Name", { exact: true }).fill("Taylor");
  await page.getByLabel("Email", { exact: true }).fill("sam@example.test");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Taylor");
  await page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "New Contact" }) })
    .getByRole("button", { name: "SDE Intern", exact: true })
    .click();
  await page.getByRole("button", { name: "Save Contact", exact: true }).click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "Contact saved." }),
  ).toBeVisible();
  const saved = await pool.query(
    'SELECT "preferredRoles" FROM "User" WHERE id=$1',
    [userId],
  );
  expect(saved.rows[0].preferredRoles).toEqual(["SDE Intern"]);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(page.getByRole("menu")).toContainText(`${userId}@example.test`);
  await expect(
    page.getByRole("menuitem", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.locator("main h1").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Audit the final colors rather than the page entrance fade.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of [
    "contacts",
    "compose",
    "templates",
    "history",
    "settings",
  ]) {
    await page.goto(`/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(
      0,
    );
    expect(
      (await new AxeBuilder({ page }).analyze()).violations,
      route,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        document.body
          .getAnimations()
          .filter((a) =>
            (a.effect as KeyframeEffect)
              .getKeyframes()
              .some(
                (frame) => frame.opacity === 0.75 || frame.opacity === "0.75",
              ),
          ).length,
    ),
  ).toBe(0);
});

test("example template, focused placeholder insertion, pasted lists and mixed roles with links", async ({
  page,
  userId,
}) => {
  // A live local worker may scan this shared database. Defer only this fixture's
  // queue so delivery remains under test control until we confirm it below.
  await pool.query(
    'UPDATE "User" SET "preferredRoles"=$2,"nextSendAt"=$3 WHERE id=$1',
    [
      userId,
      ["SDE Intern", "Frontend Developer"],
      new Date(Date.now() + 3600000),
    ],
  );
  await page.goto("/templates");
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Exploring {{role}} opportunities at {{company}}",
  );
  await page.getByLabel("Template name", { exact: true }).fill("Mixed Roles");
  await page.getByLabel("Subject", { exact: true }).fill("Opportunity for ");
  await page.getByLabel("Subject", { exact: true }).focus();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Opportunity for {{role}}");
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Opportunity for {{role}}",
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "Hi {{name}}, I’m applying for {{role}}.\n\nPortfolio: https://example.com/portfolio\nGitHub: https://github.com/user\nLinkedIn: https://linkedin.com/in/user",
    );
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "Template saved." }),
  ).toBeVisible();
  await page.goto("/contacts");
  await page
    .getByLabel("Or paste your list", { exact: true })
    .fill("alex.smith@example.test;sam@example.test,careers@example.test");
  await page.getByLabel("Bulk Job Role", { exact: true }).fill("SDE Intern");
  await page.getByRole("button", { name: "Preview Import" }).click();
  await page.getByLabel("Row 3 name", { exact: true }).fill("Taylor");
  await page
    .getByLabel("Row 3 jobRole", { exact: true })
    .fill("Frontend Developer");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "3 contacts imported. 0 rows skipped." }),
  ).toBeVisible();
  await page.goto("/compose");
  for (const name of ["Alex", "Sam", "Taylor"])
    await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await page
    .getByLabel("Choose a template", { exact: true })
    .selectOption({ label: "Mixed Roles" });
  await expect(
    page.getByLabel("Attach Resume", { exact: false }),
  ).toBeDisabled();
  await expect(
    page.locator(".mail-preview").getByText("Portfolio:", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Preview recipient", { exact: true })
    .selectOption({ label: "Taylor · careers@example.test" });
  await expect(
    page.getByRole("heading", {
      name: "Opportunity for Frontend Developer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send to 3 recipients", exact: true })
    .click();
  await expect(page).toHaveURL(/history\?campaign=/);
  await expect(
    page.getByRole("region", { name: "Campaign delivery progress" }),
  ).toContainText(/Queued\s*3/);
  // Follow the user's route sequence before delivery finishes.
  await page.getByRole("link", { name: "Compose", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const progress = page.getByRole("region", {
    name: "Campaign delivery progress",
  });
  await expect(progress).toContainText(/Queued\s*3/);
  await expect(progress.locator(".completion-check")).toHaveCount(0);
  const sends = await pool.query(
    'SELECT s."recipientRole",s.body,c."attachmentId" FROM "Send" s JOIN "Campaign" c ON c.id=s."campaignId" WHERE c."userId"=$1',
    [userId],
  );
  expect(sends.rows.map((r) => r.recipientRole).sort()).toEqual([
    "Frontend Developer",
    "SDE Intern",
    "SDE Intern",
  ]);
  expect(
    sends.rows.every(
      (r) =>
        r.body.includes("https://example.com/portfolio") &&
        r.body.includes("https://github.com/user") &&
        r.body.includes("https://linkedin.com/in/user") &&
        r.attachmentId === null,
    ),
  ).toBe(true);
  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "userId"=$1)`,
    [userId],
  );
  await expect(progress.locator(".completion-check")).toBeVisible({
    timeout: 15000,
  });
  const frozenArc = progress.locator(
    ".completion-countdown-exit .batch-countdown-arc",
  );
  await expect(frozenArc).toHaveCount(1);
  const frozenOffset = await frozenArc.getAttribute("stroke-dashoffset");
  await page.waitForTimeout(600);
  await expect(frozenArc).toHaveAttribute("stroke-dashoffset", frozenOffset!);
  expect(
    await progress
      .locator(".completion-countdown-exit")
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("0");
  await expect(progress).toContainText(
    "All messages confirmed by the service.",
  );
  await expect(progress).toContainText(/Sent\s*3/);
  await expect(progress).toContainText(/Queued\s*0/);
  await expect(progress.locator(".timer-value")).toHaveCount(0);
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(progress.locator(".completion-check")).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("SENT");
  await expect(page).toHaveURL(/status=SENT/);
  await expect(progress.locator(".completion-check")).toBeVisible();
  await page
    .getByRole("button", { name: "Check Replies", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check Replies", exact: true }),
  ).toBeEnabled();
  await expect(progress.locator(".completion-check")).toBeVisible();
  await page.getByRole("link", { name: "Compose", exact: true }).click();
  await expect(page).toHaveURL(/\/compose$/);
  await expect(
    page.getByRole("heading", {
      name: "Make your next connection.",
      exact: true,
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/history/);
  await expect(progress).toHaveCount(0);
  await page.reload();
  await expect(progress).toHaveCount(0);
  await page.goto("/compose");
  await expect(
    page.getByText("Last sent", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(progress).toHaveCount(0);
});

test("progress distinguishes uncertain outcomes and includes the user queue in estimates", async ({
  page,
  userId,
}) => {
  const template = randomUUID(),
    contact = randomUUID(),
    campaign = randomUUID(),
    otherCampaign = randomUUID();
  await pool.query(
    'UPDATE "User" SET "preferredRoles"=$2,"nextSendAt"=$3 WHERE id=$1',
    [userId, ["Engineer"], new Date(Date.now() + 120000)],
  );
  await pool.query(
    `INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,'Progress','Hi','Hello')`,
    [template, userId],
  );
  await pool.query(
    `INSERT INTO "Contact" (id,"userId",name,email,"jobRole") VALUES ($1,$2,'Alex','alex@example.test','Engineer')`,
    [contact, userId],
  );
  for (const id of [campaign, otherCampaign])
    await pool.query(
      `INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,'QUEUED')`,
      [id, userId, template],
    );
  for (const [id, status, state] of [
    [campaign, "QUEUED", "READY"],
    [campaign, "SENT", "DONE"],
    [campaign, "FAILED", "DONE"],
    [campaign, "FAILED", "UNCERTAIN"],
    [otherCampaign, "QUEUED", "READY"],
  ])
    await pool.query(
      `INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","dispatchedAt","recipientName","recipientEmail") VALUES ($1,$2,$3,$4::"SendStatus",$5::"DeliveryState",now(),'Alex','alex@example.test')`,
      [randomUUID(), id, contact, status, state],
    );
  await page.clock.install({ time: new Date() });
  await page.goto(`/history?campaign=${campaign}`);
  const card = page.getByRole("region", { name: "Campaign delivery progress" });
  await expect(card).toContainText("Delivery needs review");
  await expect(card).toContainText("Remaining", {
    timeout: 15000,
  });
  await expect(card).toContainText("Retries and service delays");
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 1000),
  );
  // Let the one-second timer settle after pauseAt skips to the new timestamp.
  await page.clock.runFor(1000);
  const timer = card.locator(".progress-ring b");
  const readSeconds = async () => {
    const [minutes, seconds] = (await timer.innerText()).split(":").map(Number);
    return minutes * 60 + seconds;
  };
  const before = await readSeconds();
  await expect(timer).toHaveCSS("animation-name", "none");
  await expect(timer).toHaveCSS("opacity", "1");
  await timer.evaluate((element) => {
    element.setAttribute("data-timer-original", "true");
  });
  // Ring segments reflect counts, so ticking the timer must not move them.
  const ring = card.locator(".progress-ring");
  const outerSegments = () =>
    ring
      .locator('circle[r="64"]')
      .evaluateAll((elements) => elements.map((element) => element.outerHTML));
  const beforeRing = await outerSegments();
  const arc = ring.locator(".batch-countdown-arc");
  const offset = () =>
    arc.evaluate((element) =>
      Number(element.getAttribute("stroke-dashoffset")),
    );
  const beforeOffset = await offset();
  await expectCenterToFit(card);
  // The arc changes between one-second label ticks.
  await page.clock.runFor(100);
  expect(await offset()).toBeGreaterThan(beforeOffset);
  await page.clock.runFor(900);
  expect(await readSeconds()).toBe(before - 1);
  await page.clock.runFor(1000);
  expect(await readSeconds()).toBe(before - 2);
  await expect(timer).toHaveAttribute("data-timer-original", "true");
  expect(await outerSegments()).toEqual(beforeRing);
  await expect(card.locator(".completion-check")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenOffset = await offset();
  await page.clock.runFor(2000);
  expect(await offset()).toBe(hiddenOffset);
  expect(await readSeconds()).toBe(before - 2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(readSeconds).toBe(before - 4);
  expect(await offset()).toBeGreaterThan(hiddenOffset);
  await page.clock.resume();
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Audit settled theme colors, rather than intermediate navigation transitions.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Let the media-query change handler settle before freezing the clock.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 1000),
  );
  const reducedOffset = await offset();
  await page.clock.runFor(100);
  expect(await offset()).toBe(reducedOffset);
  await page.clock.runFor(1000);
  expect(await offset()).toBeGreaterThan(reducedOffset);
  await page.clock.resume();
  expect(
    await card
      .locator(".progress-ring circle")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  // An absent/unknown campaign parameter must not conceal the user's queue.
  await page.goto(`/history?campaign=${randomUUID()}`);
  await expect(card).toContainText(/Queued\s*2/);
  await expect(card).toContainText(/Sent\s*1/);
  await expect(card).toContainText(/Failed\s*1/);
  await expect(card).toContainText("Delivery needs review · 1");
  await page.getByRole("link", { name: "Compose", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(card).toContainText(/Queued\s*2/);
  await expect(card.locator(".timer-value")).toBeVisible();
  await page.reload();
  await expect(card).toContainText(/Queued\s*2/);

  const search = page.getByRole("searchbox", { name: "Search history" });
  const statusFilter = page.getByLabel("Filter by status");
  await search.fill("alex");
  await statusFilter.selectOption("QUEUED");
  await expect(page).toHaveURL(/q=alex&status=QUEUED/);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(card).toContainText(/Sent\s*1/);
  await expect(
    page.getByRole("button", { name: "Filter", exact: true }),
  ).toHaveCount(0);
  await statusFilter.selectOption("SENT");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(search).toHaveValue("alex");
  await search.fill("no-match");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=no-match&status=SENT/);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(card).toContainText(/Queued\s*2/);

  // Finishing one campaign must not remove its counts from the observed queue.
  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId"=$1`,
    [otherCampaign],
  );
  await expect(card).toContainText(/Queued\s*1/, { timeout: 15000 });
  await expect(card).toContainText(/Sent\s*2/);
  await expect(card).toContainText("Delivery needs review");
  await expect(card.locator(".completion-check")).toHaveCount(0);

  // Uncertain outcomes remain active after the last queued send finishes.
  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId"=$1 AND status='QUEUED'`,
    [campaign],
  );
  await expect(card.locator(".timer-value")).toHaveText("Review", {
    timeout: 15000,
  });
  await expect(card.getByRole("status")).toHaveText("Sending");
  await expect(card.locator(".completion-check")).toHaveCount(0);

  await expect(card.locator(".batch-countdown-track")).toHaveCount(0);
  await expectCenterToFit(card);

  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "userId"=$1)`,
    [userId],
  );
  await expect(card.locator(".completion-check")).toBeVisible({
    timeout: 15000,
  });
  await expect(card).toContainText(/Sent\s*5/);
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.goto("/history");
  await expect(card).toHaveCount(0);
});

for (const reducedMotion of [false, true]) {
  test(`single-recipient batches show Sending without a countdown until confirmed (${reducedMotion ? "reduced" : "normal"} motion)`, async ({
    page,
    userId,
  }) => {
    await page.emulateMedia({
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    const template = randomUUID(),
      contact = randomUUID(),
      campaign = randomUUID(),
      send = randomUUID();
    await pool.query(
      "INSERT INTO \"Template\" (id,\"userId\",name,subject,body) VALUES ($1,$2,'Single timer','Hi','Hello')",
      [template, userId],
    );
    await pool.query(
      "INSERT INTO \"Contact\" (id,\"userId\",name,email) VALUES ($1,$2,'Alex','single-timer@example.test')",
      [contact, userId],
    );
    await pool.query(
      'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,\'QUEUED\')',
      [campaign, userId, template],
    );
    await pool.query(
      'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","dispatchedAt") VALUES ($1,$2,$3,\'QUEUED\',\'READY\',now())',
      [send, campaign, contact],
    );
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [userId, new Date(Date.now() + 60000).toISOString()],
    );
    await page.goto(`/history?campaign=${campaign}`);
    const card = page.getByRole("region", {
      name: "Campaign delivery progress",
    });
    const timer = card.locator(".timer-value");
    await expect(timer).toHaveText("Sending");
    await expect(card.locator(".batch-countdown-track")).toHaveCount(0);
    await expectCenterToFit(card);
    await expect(card).not.toContainText("EST. LEFT");
    await expect(card).not.toContainText("Remaining");
    await pool.query(
      'UPDATE "Send" SET "deliveryState"=\'ATTEMPTING\', "attemptedAt"=now() WHERE id=$1',
      [send],
    );
    await expect(card).toContainText("CONFIRMING", { timeout: 15000 });
    await expect(timer).toHaveText("Sending");
    await expect(card).not.toContainText("Remaining");
    await pool.query(
      'UPDATE "Send" SET status=\'SENT\', "deliveryState"=\'DONE\', "sentAt"=now() WHERE id=$1',
      [send],
    );
    await expect(card.getByRole("status")).toHaveText("Complete", {
      timeout: 15000,
    });
    await expect(card.locator(".completion-check")).toBeVisible();
    await expect(card.getByText("ALL SENT", { exact: true })).toBeVisible();
    await expect(timer).toHaveCount(0);
    const completion = card.getByRole("img", {
      name: "Batch complete. All emails sent.",
      exact: true,
    });
    await expect(completion).toBeVisible();
    await expect(completion).toHaveClass(/is-entering/);
    await page.waitForTimeout(1000);
    const animationState = () =>
      completion.evaluate((element) =>
        element.getAnimations({ subtree: true }).map((animation) => ({
          name: (animation as CSSAnimation).animationName,
          state: animation.playState,
          time: animation.currentTime,
        })),
      );
    const finished = await animationState();
    if (reducedMotion) expect(finished).toEqual([]);
    else {
      expect(finished.map((item) => item.name).sort()).toEqual([
        "completion-badge-pop",
        "completion-check-draw",
        "completion-label-enter",
        "completion-ripple",
      ]);
      expect(finished.every((item) => item.state === "finished")).toBe(true);
    }
    for (const theme of ["Light", "Dark"]) {
      await page
        .getByRole("button", { name: `${theme} theme`, exact: true })
        .click();
      expect(await animationState()).toEqual(finished);
      const ring = await card.locator(".progress-ring").boundingBox();
      expect(ring!.width).toBe(148);
      expect(ring!.height).toBe(148);
      const contained = await completion.evaluate((element) => {
        const inner = element.querySelector(".completion-inner")!;
        const box = inner.getBoundingClientRect();
        const centerX = box.x + box.width / 2,
          centerY = box.y + box.height / 2;
        return (
          [".completion-badge", ".completion-label"].every((selector) => {
            const rect = element
              .querySelector(selector)!
              .getBoundingClientRect();
            return [
              [rect.left, rect.top],
              [rect.right, rect.bottom],
              [rect.right, rect.top],
              [rect.left, rect.bottom],
            ].every(
              ([x, y]) =>
                Math.hypot(x - centerX, y - centerY) <= box.width / 2 + 0.5,
            );
          }) && getComputedStyle(inner).overflow === "hidden"
        );
      });
      expect(contained).toBe(true);
      expect(
        await completion
          .locator(".completion-ripple")
          .evaluate((element) => getComputedStyle(element).opacity),
      ).toBe("0");
    }
    await page.getByLabel("Filter by status").selectOption("SENT");
    await expect(page).toHaveURL(/status=SENT/);
    expect(await animationState()).toEqual(finished);
  });
}

for (const allFailed of [false, true]) {
  test(`whole-batch countdown survives polls, individual sends and completes ${allFailed ? "all-failed" : "mixed"} batches`, async ({
    page,
    userId,
  }, testInfo) => {
    const template = randomUUID(),
      contact = randomUUID(),
      campaign = randomUUID();
    await pool.query(
      "INSERT INTO \"Template\" (id,\"userId\",name,subject,body) VALUES ($1,$2,'Timer','Hi','Hello')",
      [template, userId],
    );
    await pool.query(
      "INSERT INTO \"Contact\" (id,\"userId\",name,email) VALUES ($1,$2,'Alex','timer@example.test')",
      [contact, userId],
    );
    await pool.query(
      'INSERT INTO "Campaign" (id,"userId","templateId",status,"createdAt") VALUES ($1,$2,$3,\'QUEUED\',now() - interval \'60 seconds\')',
      [campaign, userId, template],
    );
    const sendIds = [randomUUID(), randomUUID()];
    for (const id of sendIds)
      await pool.query(
        'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","dispatchedAt") VALUES ($1,$2,$3,\'QUEUED\',\'READY\',now())',
        [id, campaign, contact],
      );
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [userId, new Date(Date.now() + 40000).toISOString()],
    );
    await page.goto(`/history?campaign=${campaign}`);
    const card = page.getByRole("region", {
      name: "Campaign delivery progress",
    });
    const timerSeconds = () =>
      card.locator(".timer-value").evaluate((element) => {
        const [minutes, seconds] = element.textContent!.split(":").map(Number);
        return minutes * 60 + seconds;
      });
    await expect(card).toContainText("EST. LEFT");
    await expect(card.getByRole("status")).toHaveText("Sending");
    const timer = card.locator(".timer-value");
    const initial = await timerSeconds();
    const arc = card.locator(".batch-countdown-arc");
    const initialOffset = Number(await arc.getAttribute("stroke-dashoffset"));
    expect(initial).toBeGreaterThan(60);
    expect(initial).toBeLessThanOrEqual(80);
    // Confirm that an unchanged server poll does not replenish the deadline.
    await page.waitForTimeout(5500);
    expect(await timerSeconds()).toBeLessThan(initial - 3);
    expect(Number(await arc.getAttribute("stroke-dashoffset"))).toBeGreaterThan(
      initialOffset,
    );
    // A worker reservation must not replenish the existing batch estimate.
    await pool.query(
      'UPDATE "Send" SET "deliveryState"=\'ATTEMPTING\', "attemptedAt"=now() WHERE id=$1',
      [sendIds[0]],
    );
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [userId, new Date(Date.now() + 60000).toISOString()],
    );
    await expect(card).toContainText("Awaiting confirmation", {
      timeout: 15000,
    });
    await expect(card).toContainText("EST. LEFT");
    expect(await timerSeconds()).toBeLessThan(initial - 3);
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [userId, new Date(Date.now() + 40000).toISOString()],
    );
    await pool.query(
      'UPDATE "Send" SET status=$2::"SendStatus", "deliveryState"=\'DONE\', "sentAt"=now(), "attemptedAt"=now() WHERE id=$1',
      [sendIds[0], allFailed ? "FAILED" : "SENT"],
    );
    await expect(card).toContainText(/Queued\s*1/, { timeout: 15000 });
    expect(await timerSeconds()).toBeGreaterThan(20);
    await expect(card).toContainText("EST. LEFT");
    const beforeDelay = await timerSeconds();
    await expect(card.locator(".completion-check")).toHaveCount(0);
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [
        userId,
        new Date(
          (await page.evaluate(() => Date.now())) + 120000,
        ).toISOString(),
      ],
    );
    await expect(card).toContainText("Remaining 2–3 min", { timeout: 15000 });
    expect(await timerSeconds()).toBeLessThanOrEqual(beforeDelay);
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [
        userId,
        new Date((await page.evaluate(() => Date.now())) - 1000).toISOString(),
      ],
    );
    await expect(timer).toHaveText("Sending", { timeout: 15000 });
    await expect(card.locator(".batch-countdown-track")).toBeVisible();
    await expect
      .poll(async () => Number(await arc.getAttribute("stroke-dashoffset")))
      .toBeCloseTo(2 * Math.PI * 53);
    await expectCenterToFit(card);
    await expect(card).not.toContainText("EST. LEFT");
    await expect(card.getByRole("status")).toHaveText("Sending");
    await expect(card.locator(".completion-check")).toHaveCount(0);
    await pool.query(
      'UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1',
      [
        userId,
        new Date(
          (await page.evaluate(() => Date.now())) + 120000,
        ).toISOString(),
      ],
    );
    await expect(card).toContainText("Remaining 2–3 min", { timeout: 15000 });
    await expect(timer).toHaveText("Sending");
    await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const ringBox = await card.locator(".progress-ring").boundingBox();
    const tilesBox = await card.locator("dl").boundingBox();
    expect(ringBox!.width).toBe(148);
    expect(ringBox!.height).toBe(148);
    if (testInfo.project.name === "mobile")
      expect(tilesBox!.y).toBeGreaterThan(ringBox!.y + ringBox!.height);
    else expect(tilesBox!.x).toBeGreaterThan(ringBox!.x + ringBox!.width);
    expect(
      await card
        .locator("dl > div")
        .evaluateAll(
          (tiles) =>
            new Set(tiles.map((tile) => tile.getBoundingClientRect().top)).size,
        ),
    ).toBe(1);
    await card.screenshot({ path: testInfo.outputPath("batch-active.png") });
    await pool.query(
      'UPDATE "Send" SET status=\'FAILED\', "deliveryState"=\'DONE\', "attemptedAt"=now() WHERE id=$1',
      [sendIds[1]],
    );
    await expect(card.getByRole("status")).toHaveText("Complete", {
      timeout: 15000,
    });
    await expect(card.locator(".completion-check")).toBeVisible();
    await expect(card).toContainText("All messages confirmed by the service.");
    await expect(timer).toHaveCount(0);
    await expect(arc).toHaveCount(0);
    await expectCenterToFit(card);
    await expect(card).toContainText(`${allFailed ? 0 : 1} of 2 sent`);
    await expect(card.getByRole("img")).toHaveAttribute(
      "aria-label",
      `${allFailed ? 0 : 1} sent, 0 queued, ${allFailed ? 2 : 1} failed, 0 need review out of 2`,
    );
    const elapsed = await card.getByText(/^Elapsed/).innerText();
    await page.waitForTimeout(1100);
    await expect(card.getByText(/^Elapsed/)).toHaveText(elapsed);
    await card.screenshot({ path: testInfo.outputPath("batch-complete.png") });
    await page.reload();
    await expect(card).toHaveCount(0);
  });
}

test("compose bulk selection respects role filters, prior sends and the batch cap", async ({
  page,
  userId,
}) => {
  const templateId = randomUUID(),
    campaignId = randomUUID();
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [templateId, userId, "Bulk selection", "Hi {{name}}", "Hello {{role}}"],
  );
  await pool.query(
    'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,$4)',
    [campaignId, userId, templateId, "QUEUED"],
  );
  for (let index = 0; index < 20; index++) {
    const contactId = randomUUID();
    await pool.query(
      'INSERT INTO "Contact" (id,"userId",name,email,"jobRole") VALUES ($1,$2,$3,$4,$5)',
      [
        contactId,
        userId,
        `Person ${String(index).padStart(2, "0")}`,
        `person${index}@example.test`,
        index < 18 ? "Engineer" : "Designer",
      ],
    );
    if (index < 2)
      await pool.query(
        'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","sentAt") VALUES ($1,$2,$3,$4::"SendStatus",$5::"DeliveryState",$6)',
        [
          randomUUID(),
          campaignId,
          contactId,
          index === 0 ? "SENT" : "QUEUED",
          index === 0 ? "DONE" : "READY",
          index === 0 ? new Date() : null,
        ],
      );
  }
  await page.goto("/compose");
  await expect(page.locator(".progress-ring")).toContainText("est. time left");
  const filter = page.getByLabel("Filter by Job Role", { exact: true });
  await filter.selectOption("Engineer");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(
    page.getByText("15 / 15 selected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Person 00/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Person 01/ }),
  ).not.toBeChecked();
  const meter = page.getByRole("progressbar", {
    name: "Selected recipients",
    exact: true,
  });
  await expect(meter).toHaveAttribute("aria-valuenow", "15");
  await expect(
    page.getByRole("progressbar", {
      name: "Last 24 hours + queued",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", "2");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  await filter.selectOption("Designer");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(
    page.getByText("2 / 15 selected", { exact: true }),
  ).toBeVisible();
  await filter.selectOption("Engineer");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(
    page.getByText("15 / 15 selected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(
    page.getByText("2 / 15 selected", { exact: true }),
  ).toBeVisible();
  await filter.selectOption("Designer");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
});

test("attachment defaults, example replacement warning, and batch role filters", async ({
  page,
  userId,
}) => {
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["SDE Intern", "Frontend Developer"],
  ]);
  await page.goto("/settings");
  await page.getByLabel("Choose PDF", { exact: true }).setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await page.getByRole("button", { name: "Save Resume", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "resume.pdf", exact: true }),
  ).toBeVisible();
  await page.goto("/compose");
  await expect(
    page.getByLabel("Attach Resume", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByText("No PDF attachment", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("resume.pdf", { exact: true })).toBeVisible();
  await page.getByLabel("Attach Resume", { exact: true }).check();
  await expect(
    page.getByText("resume.pdf", { exact: true }).last(),
  ).toBeVisible();
  await page.goto("/templates");
  await page.getByLabel("Subject", { exact: true }).fill("Keep this draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Keep this draft",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  await page.getByLabel("Template name", { exact: true }).fill("Role Filters");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "Template saved." }),
  ).toBeVisible();
  await pool.query(
    'INSERT INTO "Contact" (id,"userId",name,email,"jobRole") VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), userId, "Alex", "alex@example.test", "SDE Intern"],
  );
  await page.goto("/compose");
  await page.getByRole("checkbox", { name: /Alex/ }).check();
  await page
    .getByRole("button", { name: "Frontend Developer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply Role to Selected", exact: true })
    .click();
  await page
    .getByLabel("Filter by Job Role", { exact: true })
    .selectOption("Frontend Developer");
  await expect(page.getByRole("checkbox", { name: /Alex/ })).toBeVisible();
  await expect(
    page.getByLabel("Job Role for Alex", { exact: true }),
  ).toHaveValue("Frontend Developer");
  const saved = await pool.query(
    'SELECT "jobRole" FROM "Contact" WHERE "userId"=$1',
    [userId],
  );
  expect(saved.rows[0].jobRole).toBe("SDE Intern");
  await page.getByRole("checkbox", { name: /Alex/ }).uncheck();
  await page.goto("/");
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.evaluate(async () => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished),
    );
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => localStorage.removeItem("mailloop-theme"));
  await page.reload();
  // Wait for header hydration and the theme preference subscription after reload.
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

base(
  "deleted-account session cookies return to sign-in without a redirect loop",
  async ({ page, context }) => {
    const salt = "authjs.session-token";
    const deletedUserId = randomUUID();
    const token = await encode({
      secret: process.env.AUTH_SECRET!,
      salt,
      token: { userId: deletedUserId, sub: deletedUserId },
    });
    await context.addCookies([
      {
        name: salt,
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    for (const pathname of ["/", "/compose", "/contacts", "/settings"]) {
      await page.goto(pathname);
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole("button", {
          name: "Get Started with Google",
          exact: false,
        }),
      ).toBeVisible();
    }
  },
);

test("redesign: populated pages in both themes, live recipient preview, cursor insertion", async ({
  page,
  userId,
}) => {
  const templateId = randomUUID(),
    contactId = randomUUID(),
    campaignId = randomUUID();
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["SDE Intern", "Backend Developer"],
  ]);
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      templateId,
      userId,
      "Backend template",
      "Exploring {{role}} opportunities at {{company}}",
      "Hi {{name}},\n\nI’m interested in {{role}} opportunities at {{company}}.\n\nLink: https://example.test/resume\n\nThank you for your time.",
    ],
  );
  await pool.query(
    'INSERT INTO "Contact" (id,"userId",name,email,company,"jobRole") VALUES ($1,$2,$3,$4,$5,$6)',
    [
      contactId,
      userId,
      "Anoop Jha",
      "anoop@example.test",
      "Mailloop",
      "SDE Intern",
    ],
  );
  await pool.query(
    'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,$4)',
    [campaignId, userId, templateId, "QUEUED"],
  );
  for (const status of ["SENT", "QUEUED", "FAILED"])
    await pool.query(
      'INSERT INTO "Send" (id,"campaignId","contactId",status,"recipientName","recipientEmail","recipientCompany","templateName","sentAt",error) VALUES ($1,$2,$3,$4::"SendStatus",$5,$6,$7,$8,$9,$10)',
      [
        randomUUID(),
        campaignId,
        contactId,
        status,
        "Anoop Jha",
        "anoop@example.test",
        "Mailloop",
        "Backend template",
        status === "SENT" ? new Date() : null,
        status === "FAILED" ? "Recipient address rejected" : null,
      ],
    );
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/compose");
    await page
      .getByRole("button", {
        name: `${theme === "light" ? "Light" : "Dark"} theme`,
        exact: true,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const route of [
      "compose",
      "templates",
      "history",
      "contacts",
      "settings",
    ]) {
      const query =
        route === "templates"
          ? `?edit=${templateId}`
          : route === "history"
            ? `?campaign=${campaignId}`
            : "";
      await page.goto(`/${route}${query}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.locator('[role="status"][aria-busy="true"]'),
      ).toHaveCount(0);
      await page.locator(".page-transition").evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        `${route}/${theme}`,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${route}/${theme}`,
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/mailloop-redesign-${route}-${theme}-${test.info().project.name}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto(`/templates?edit=${templateId}`);
  const preview = page.getByRole("complementary", {
    name: "Live email preview",
  });
  await expect(
    preview.locator("mark").filter({ hasText: "Anoop Jha" }),
  ).toBeVisible();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Hello {{nmae}} and {{role");
  await expect(preview.getByRole("status")).toContainText(
    "Unknown placeholder: {{nmae}}",
  );
  await expect(preview.getByRole("status")).toContainText("not closed");
  await expect(preview.locator("mark.invalid")).toHaveCount(2);
  const message = page.getByLabel("Message", { exact: true });
  await message.fill("Hello friend!");
  await message.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(6, 12);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.getByRole("button", { name: "{{name}}", exact: true }).click();
  await expect(message).toHaveValue("Hello {{name}}!");
  await expect(message).toBeFocused();
  await expect(preview).toContainText("Hello Anoop Jha!");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  expect(
    await page
      .locator(".theme-thumb")
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
});

base(
  "theme: system default, reveal, rapid clicks, storage events and reduced motion",
  async ({ page }) => {
    await page.emulateMedia({
      colorScheme: "dark",
      reducedMotion: "no-preference",
    });
    await page.addInitScript(() => {
      const seen: string[] = [];
      Object.assign(window, { initialThemes: seen });
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
          (window as typeof window & { initialThemes: string[] })
            .initialThemes[0],
      ),
    ).toBe("dark");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Light theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    if (
      await page.evaluate(
        () => typeof document.startViewTransition === "function",
      )
    ) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            document
              .getAnimations()
              .some((animation) =>
                (animation.effect as KeyframeEffect)
                  .getKeyframes()
                  .some(
                    (frame) =>
                      typeof frame.clipPath === "string" &&
                      frame.clipPath.startsWith("circle("),
                  ),
              ),
          ),
        )
        .toBe(true);
    }
    await page.evaluate(() => {
      const dark = document.querySelector<HTMLButtonElement>(
        '[aria-label="Dark theme"]',
      )!;
      const light = document.querySelector<HTMLButtonElement>(
        '[aria-label="Light theme"]',
      )!;
      dark.click();
      light.click();
      dark.click();
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.evaluate(() => {
      localStorage.setItem("mailloop-theme", "light");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mailloop-theme",
          newValue: "light",
        }),
      );
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Dark theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page
        .getByRole("banner")
        .locator(".theme-thumb")
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe("0s");
    expect(
      await page.evaluate(() =>
        document
          .getAnimations()
          .some((animation) =>
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .some(
                (frame) =>
                  typeof frame.clipPath === "string" &&
                  frame.clipPath.startsWith("circle("),
              ),
          ),
      ),
    ).toBe(false);
  },
);

base(
  "theme: unavailable storage and unsupported view transitions switch instantly",
  async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => {
      Object.defineProperty(document, "startViewTransition", {
        value: undefined,
      });
      Storage.prototype.getItem = () => {
        throw new Error("Storage unavailable");
      };
      Storage.prototype.setItem = () => {
        throw new Error("Storage unavailable");
      };
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Light theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(
      await page.evaluate(() =>
        document
          .getAnimations()
          .some((animation) =>
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .some(
                (frame) =>
                  typeof frame.clipPath === "string" &&
                  frame.clipPath.startsWith("circle("),
              ),
          ),
      ),
    ).toBe(false);
  },
);

test("inline links: complete example, live full message, wrapping and legacy send guard", async ({
  page,
  userId,
}) => {
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Engineer"],
  ]);
  const contactId = randomUUID();
  await pool.query(
    'INSERT INTO "Contact" (id,"userId",name,email,company,"jobRole") VALUES ($1,$2,$3,$4,$5,$6)',
    [contactId, userId, "Alex Smith", "alex@example.test", "Acme", "Engineer"],
  );
  await page.goto("/templates");
  await expect(
    page.getByRole("button", { name: "{{link}}", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  const example =
    "Hi {{name}},\n\nI’m interested in {{role}} opportunities at {{company}}.\nI’d love to discuss how my experience could help your team.\n\nPortfolio: https://example.com/your-portfolio\nGitHub: https://github.com/your-username\nLinkedIn: https://www.linkedin.com/in/your-username\n\nI’ve attached my resume PDF for your review.\n\nThank you for your time.\nYour name";
  const message = page.getByLabel("Message", { exact: true });
  await expect(message).toHaveValue(example);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Exploring {{role}} opportunities at {{company}}",
  );
  await expect(
    page.getByText("Mentioning a PDF in the message does not attach it.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("When using the example, replace", { exact: false }),
  ).toBeVisible();
  const preview = page.getByRole("complementary", {
    name: "Live email preview",
  });
  await expect(preview).toContainText(
    "I’d love to discuss how my experience could help your team.",
  );
  await message.fill("Custom draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  await expect(message).toHaveValue("Custom draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  await expect(message).toHaveValue(example);
  const longUrl = `https://example.test/${"portfolio".repeat(70)}?a=1&b=2`;
  const body = `Hi {{name}},\n\n${longUrl}\nhttps://github.com/user\nhttps://linkedin.com/in/user\n\n${"A complete paragraph.\n".repeat(35)}End of message.`;
  const personalized = body.replace("{{name}}", "Alex Smith");
  await message.fill(body);
  const templateBody = preview.locator(".mail-preview > div").last();
  expect(await templateBody.textContent()).toBe(personalized);
  await expect(templateBody).toContainText("End of message.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(
    await templateBody.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("Template name", { exact: true }).fill("Full message");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page
      .getByTestId("success-confirmation")
      .filter({ hasText: "Template saved." }),
  ).toBeVisible();
  const template = (
    await pool.query(
      'SELECT id,body FROM "Template" WHERE "userId"=$1 AND name=$2',
      [userId, "Full message"],
    )
  ).rows[0];
  expect(template.body).toBe(body);
  await page.goto("/compose");
  await page
    .getByLabel("Choose a template", { exact: true })
    .selectOption(template.id);
  await page.getByRole("checkbox", { name: /Alex Smith/ }).check();
  const composeBody = page.locator(".mail-preview p.whitespace-pre-wrap");
  expect(await composeBody.textContent()).toBe(personalized);
  expect(
    await composeBody.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await expect(
    page.getByText("Mentioning a PDF in the message does not attach it.", {
      exact: false,
    }),
  ).toBeVisible();
  await pool.query(
    'UPDATE "Template" SET body=$2 WHERE id=$1 AND "userId"=$3',
    [template.id, "Legacy {{ link }}", userId],
  );
  await page.reload();
  await page
    .getByLabel("Choose a template", { exact: true })
    .selectOption(template.id);
  await page.getByRole("checkbox", { name: /Alex Smith/ }).check();
  await expect(page.locator(".mail-preview")).toContainText(
    "Legacy {{ link }}",
  );
  await expect(page.locator(".mail-preview").getByRole("alert")).toHaveText(
    "Replace {{link}} with a URL directly in your message.",
  );
  await page
    .getByRole("button", { name: "Send to 1 recipient", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert").last()).toHaveText(
    "Replace {{link}} with a URL directly in your message.",
  );
  expect(
    (await pool.query('SELECT id FROM "Campaign" WHERE "userId"=$1', [userId]))
      .rows,
  ).toEqual([]);
  await page.goto(`/templates?edit=${template.id}`);
  await expect(
    page
      .getByRole("complementary", { name: "Live email preview" })
      .getByRole("status"),
  ).toHaveText("Replace {{link}} with a URL directly in your message.");
  await page.goto("/settings");
  await expect(page.locator('input[name="linkUrl"]')).toHaveCount(0);
});

test("CSV import upload, review, replacement errors and confirmation", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  await page.goto("/contacts");
  const card = page.getByRole("region", {
    name: "Import contacts with CSV",
    exact: true,
  });
  const sample = await page.request.get("/sample-contacts.csv");
  expect(sample.ok()).toBe(true);
  expect(await sample.text()).toContain("email,name,company,role");
  await expect(
    card.getByRole("link", { name: "Download sample CSV" }),
  ).toHaveAttribute("download", "");
  const input = card.getByLabel("CSV file", { exact: true });
  const csv =
    "email,name,company,role\nalex@example.com,Alex,Northstar,Engineer\nalex@example.com,Alex,Northstar,Engineer\nbad,Taylor,,Designer\nsam@example.com,Sam,,Designer\njo@example.com,Jo,,Engineer\nlee@example.com,Lee,,Engineer";
  await input.setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    card.getByText("4 valid · 1 duplicate · 1 invalid"),
  ).toBeVisible();
  await expect(card.getByText("Showing rows 1–5 of 6")).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  await card
    .getByLabel("Row 4 email", { exact: true })
    .fill("taylor@example.com");
  await expect(
    card.getByText("5 valid · 1 duplicate · 0 invalid"),
  ).toBeVisible();
  await card.getByRole("button", { name: "Next Rows" }).click();
  await expect(card.getByLabel("Row 7 email", { exact: true })).toHaveValue(
    "lee@example.com",
  );
  await card.getByLabel("Row 7 company", { exact: true }).fill("Northstar");
  await card.getByRole("button", { name: "Previous Rows" }).click();
  for (const [name, buffer, message] of [
    ["wrong.txt", Buffer.from(csv), "Choose one CSV file (.csv)."],
    ["large.csv", Buffer.alloc(1024 * 1024 + 1), "Choose a CSV up to 1 MB."],
    ["empty.csv", Buffer.from(""), "Your file or list is empty."],
    [
      "headers.csv",
      Buffer.from("email,name,company,role"),
      "No contact rows found.",
    ],
  ] as const) {
    await input.setInputFiles({ name, mimeType: "text/csv", buffer });
    await expect(card.getByRole("alert")).toContainText(message);
    await expect(
      card.getByRole("table", { name: "Editable import preview" }),
    ).toHaveCount(0);
  }
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        [
          "email,name,company,role\nalex@example.com,Alex,Northstar,Engineer\nsam@example.com,Sam,,Designer",
        ],
        "dropped.csv",
        { type: "text/csv" },
      ),
    );
    return data;
  });
  await card
    .locator("div")
    .filter({
      has: page.getByText("Drag and drop your CSV here", { exact: true }),
    })
    .last()
    .dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(card.getByText("Selected file: dropped.csv")).toBeVisible();
  await expect(
    card.getByText("2 valid · 0 duplicate · 0 invalid"),
  ).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    await card.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      );
    });
    expect(
      (
        await new AxeBuilder({ page })
          .include('section[aria-labelledby="contact-import-heading"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await card.getByRole("button", { name: "Confirm import" }).click();
  await expect(
    card
      .getByTestId("success-confirmation")
      .filter({ hasText: "2 contacts imported. 0 rows skipped." }),
  ).toBeVisible();
  await expect(page.getByTestId("success-toast")).toContainText(
    "CSV imported successfully.",
  );
  await expect(
    card.getByRole("table", { name: "Editable import preview" }),
  ).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Choose file", exact: true }),
  ).toBeEnabled();
  await input.setInputFiles({
    name: "replacement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("wrong"),
  });
  await expect(card.getByTestId("success-confirmation")).toHaveCount(0);
  await expect(card.getByRole("alert")).toContainText("Choose one CSV file");
});

for (const kind of ["Contact", "Template"] as const) {
  test(`${kind} confirmations: refresh, editing, repeated saves and toast lifetime`, async ({
    page,
    userId,
  }, testInfo) => {
    await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
      userId,
      ["Engineer"],
    ]);
    const route = kind === "Contact" ? "contacts" : "templates";
    await page.goto(`/${route}`);
    if (kind === "Contact") {
      await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
      await page.getByLabel("Name", { exact: true }).fill("Alex");
      await page.getByLabel("Job Role", { exact: true }).fill("Engineer");
    } else {
      await page
        .getByLabel("Template name", { exact: true })
        .fill("Introduction");
      await page.getByLabel("Subject", { exact: true }).fill("Hello");
      await page.getByLabel("Message", { exact: true }).fill("Hi {{name}}");
    }
    const save = page.getByRole("button", {
      name: `Save ${kind}`,
      exact: true,
    });
    const toast = page.getByTestId("success-toast");
    const inline = page.getByTestId("success-confirmation");
    await save.click();
    await expect(toast).toContainText(`${kind} saved successfully.`);
    await expect(inline).toHaveText(`${kind} saved.`);
    // A refreshed server list proves that the notification survived the refresh.
    const saved = await pool.query(
      `SELECT id FROM "${kind}" WHERE "userId"=$1`,
      [userId],
    );
    const edit = page.locator(`a[href="/${route}?edit=${saved.rows[0].id}"]`);
    await expect(edit).toBeVisible();
    await expect(toast).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: `${kind} saved successfully.` }),
    ).toHaveCount(1);
    expect(await inline.getAttribute("aria-live")).toBeNull();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .include('[data-testid="success-toast"]')
            .include('[data-testid="success-confirmation"]')
            .analyze()
        ).violations,
      ).toEqual([]);
      const box = await toast.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      await toast.screenshot({
        path: testInfo.outputPath(`success-${theme}.png`),
      });
    }
    await page.getByRole("button", { name: "Dismiss notification" }).focus();
    await page.keyboard.press("Enter");
    await expect(toast).toHaveCount(0);
    await expect(inline).toBeVisible();
    await page
      .getByLabel(kind === "Contact" ? "Email" : "Template name", {
        exact: true,
      })
      .fill("draft");
    await expect(inline).toHaveCount(0);
    if (kind === "Contact") {
      await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
      await page.getByLabel("Name", { exact: true }).fill("   ");
      await page.getByLabel("Job Role", { exact: true }).fill("Engineer");
      await save.click();
      await expect(
        page.locator("form").filter({ has: save }).getByRole("alert"),
      ).toBeVisible();
      await expect(toast).toHaveCount(0);
      await expect(inline).toHaveCount(0);
    }
    // Discard the new draft and open the saved record.
    page.once("dialog", (dialog) => dialog.accept());
    await edit.click();
    await expect(
      page.getByRole("heading", { name: `Edit ${kind}`, exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(kind === "Contact" ? "Name" : "Template name", {
        exact: true,
      })
      .fill("Updated");
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await save.click();
    await expect(toast).toBeVisible();
    await expect(inline).toBeVisible();
    await expect(save).toBeEnabled();
    expect(
      (
        await pool.query(
          `SELECT name FROM "${kind}" WHERE "userId"=$1 AND id=$2`,
          [userId, saved.rows[0].id],
        )
      ).rows[0].name,
    ).toBe("Updated");
    await page.mouse.move(0, 0);
    await page.clock.runFor(4500);
    await save.click();
    await expect(save).toBeEnabled();
    await expect(toast).toBeVisible();
    await page.mouse.move(0, 0);
    await page.clock.runFor(2000);
    await expect(toast).toBeVisible();
    // Hover and keyboard focus independently pause the remaining six seconds.
    await toast.hover();
    await page.clock.runFor(7000);
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "Dismiss notification" }).focus();
    await page.mouse.move(0, 0);
    await page.clock.runFor(7000);
    await expect(toast).toBeVisible();
    await save.focus();
    await page.clock.runFor(6001);
    await expect(toast).toHaveCount(0);
    await expect(inline).toBeVisible();
    if (kind === "Contact") {
      await page
        .locator("form")
        .filter({ has: save })
        .getByRole("button", { name: "Engineer", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: "{{name}}", exact: true }).click();
    }
    await expect(inline).toHaveCount(0);
  });
}

const tutorialPages = [
  { route: "compose", title: "Search recipients", count: 6 },
  { route: "templates", title: "Personalize with placeholders", count: 4 },
  { route: "history", title: "Read your totals", count: 4 },
  { route: "contacts", title: "Find your contacts", count: 4 },
  { route: "settings", title: "Save role shortcuts", count: 4 },
];

for (const theme of ["light", "dark"] as const) {
  for (const { route, title, count } of tutorialPages) {
    test(`page help fits and is accessible: ${route} ${theme}`, async ({
      page,
      userId,
    }, testInfo) => {
      await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
        userId,
        ["Frontend Developer"],
      ]);
      await pool.query(
        'INSERT INTO "Contact" (id,"userId",name,email,company,"jobRole") VALUES ($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          userId,
          "Alex",
          "alex@example.test",
          "Northstar",
          "Frontend Developer",
        ],
      );
      await pool.query(
        'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          userId,
          "A first introduction",
          "Exploring {{role}} opportunities",
          "Hi {{name}},\nI would like to apply at {{company}}.\nhttps://example.com/portfolio",
        ],
      );
      await page.addInitScript(
        (value) => localStorage.setItem("mailloop-theme", value),
        theme,
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.locator('[role="status"][aria-busy="true"]'),
      ).toHaveCount(0);
      const help = page.getByRole("button", {
        name: `Help with ${route}`,
        exact: true,
      });
      await expect(help).toHaveCount(1);
      const bounds = await help.boundingBox();
      expect(bounds!.width).toBe(44);
      expect(bounds!.height).toBe(44);
      const badge = page.getByRole("button", {
        name: "Hide help button until reload.",
        exact: true,
      });
      const wrapper = page.locator(".help-launcher");
      await expect(wrapper).toHaveAttribute("data-state", "visible");
      const wrapperBox = (await wrapper.boundingBox())!;
      const badgeBox = (await badge.boundingBox())!;
      expect(wrapperBox.width).toBe(44);
      expect(wrapperBox.height).toBe(44);
      expect(badgeBox.width).toBe(20);
      expect(badgeBox.height).toBe(20);
      expect(badgeBox.x).toBe(wrapperBox.x - 6);
      expect(badgeBox.y).toBe(wrapperBox.y - 6);
      expect(
        await badge.evaluate((element) => element.parentElement?.className),
      ).toBe("help-launcher");
      const iconBox = (await badge.locator("svg").boundingBox())!;
      expect(iconBox.width).toBe(10);
      expect(iconBox.height).toBe(10);
      expect(iconBox.x + 5).toBe(badgeBox.x + 10);
      expect(iconBox.y + 5).toBe(badgeBox.y + 10);
      await expect(badge.locator("svg line")).toHaveCount(2);
      const clearance = await page
        .locator(".help-cloud")
        .evaluate((element) => {
          const cloud = element.getBoundingClientRect();
          const badge = document
            .querySelector(".help-dismiss")!
            .getBoundingClientRect();
          return [null, "::before", "::after"].every((pseudo) => {
            if (!pseudo)
              return (
                cloud.bottom < badge.top ||
                cloud.left > badge.right ||
                cloud.right < badge.left
              );
            const style = getComputedStyle(element, pseudo);
            const right = cloud.right - parseFloat(style.right);
            const bottom = cloud.bottom - parseFloat(style.bottom);
            return (
              bottom < badge.top ||
              right < badge.left ||
              right - parseFloat(style.width) > badge.right
            );
          });
        });
      expect(clearance).toBe(true);
      await help.focus();
      await page.keyboard.press("Tab");
      await expect(badge).toBeFocused();
      await expect(badge).toHaveCSS("outline-style", "solid");
      await expect(badge).toHaveCSS("outline-width", "2px");
      await expect(badge).toHaveCSS(
        "transform",
        "matrix(1.1, 0, 0, 1.1, 0, 0)",
      );
      await badge.blur();
      const cloud = page.locator(".help-cloud");
      const cloudBox = await cloud.boundingBox();
      expect(cloudBox!.x).toBeGreaterThanOrEqual(0);
      expect(cloudBox!.y).toBeGreaterThanOrEqual(0);
      expect(cloudBox!.x + cloudBox!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath("closed.png"),
        fullPage: true,
      });
      await help.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Next", exact: true }),
      ).toBeFocused();
      await expect(
        dialog.getByRole("button", { name: "Back", exact: true }),
      ).toBeDisabled();
      await expect(page.locator(".help-launcher")).toBeHidden();
      await expect(page.locator(".help-dismiss")).toHaveCount(0);
      for (let step = 1; step <= count; step++) {
        await expect(dialog.locator(".tutorial-counter")).toHaveText(
          `${step} / ${count}`,
        );
        await expect(dialog.locator(".tutorial-step")).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        const fits = await dialog.evaluate((element) => {
          const card = element
            .querySelector(".tutorial-card")!
            .getBoundingClientRect();
          const content = element
            .querySelector(".tutorial-step")!
            .getBoundingClientRect();
          const arrows = [...element.querySelectorAll(".tutorial-arrow")];
          return (
            card.left >= 0 &&
            card.right <= innerWidth &&
            arrows.every((arrow) => {
              const rect = arrow.getBoundingClientRect();
              return (
                rect.left >= card.left &&
                rect.right <= card.right &&
                rect.top >= card.top &&
                rect.bottom <= card.bottom &&
                (rect.right <= content.left || rect.left >= content.right)
              );
            }) &&
            element.scrollWidth <= innerWidth
          );
        });
        expect(fits).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`open-${step}.png`),
        });
        if (step < count) await page.keyboard.press("ArrowRight");
      }
      await expect(
        dialog.getByRole("button", { name: "Next", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Done", exact: true }),
      ).toBeFocused();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
      await page.keyboard.press("Shift+Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(help).toBeFocused();
      await help.click();
      await expect(dialog.locator(".tutorial-counter")).toHaveText(
        `1 / ${count}`,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(help).toBeFocused();
      await help.click();
      await dialog.click({ position: { x: 2, y: 2 } });
      await expect(dialog).toHaveCount(0);
      await expect(help).toBeFocused();
      await expect(wrapper).toBeVisible();
      await expect(badge).toBeVisible();
      await badge.focus();
      await page.keyboard.down("Space");
      await expect(badge).toHaveCSS(
        "transform",
        "matrix(0.9, 0, 0, 0.9, 0, 0)",
      );
      await page.keyboard.up("Space");
      await expect(wrapper).toHaveCount(0);
      await expect(page.locator("#main-content")).toBeFocused();
      for (const destination of tutorialPages) {
        await page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", {
            name: new RegExp(`^${destination.route}$`, "i"),
          })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${destination.route}$`));
        await expect(wrapper).toHaveCount(0);
      }
      await page.reload();
      await expect(wrapper).toBeVisible();
      await expect(badge).toBeVisible();
    });
  }
}

test("page help transitions, dismissal, route changes, and narrow screens", async ({
  page,
  userId,
}) => {
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Frontend Developer"],
  ]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/compose");
  const help = page.getByRole("button", {
    name: "Help with compose",
    exact: true,
  });
  await help.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Next", exact: true }),
  ).toBeFocused();
  // Dispatch repeated events in one frame to exercise the navigation lock.
  await dialog
    .getByRole("button", { name: "Next", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(dialog.locator(".tutorial-counter")).toHaveText("2 / 6");
  await expect(dialog).toHaveAttribute("data-phase", "idle");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.locator(".tutorial-counter")).toHaveText("1 / 6");
  await expect(dialog).toHaveAttribute("data-phase", "idle");
  await page.keyboard.press("ArrowRight");
  await dialog.getByRole("button", { name: "Close tutorial" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(help).toBeFocused();
  await help.click();
  await expect(dialog.locator(".tutorial-counter")).toHaveText("1 / 6");
  // Browser history can navigate even while the page itself is inert.
  await page.evaluate(() => history.pushState(null, "", "/settings"));
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Help with settings" }),
  ).toBeVisible();
  await page.goBack();
  await expect(help).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const { route, count } of tutorialPages) {
    await page.goto(`/${route}`);
    await page
      .getByRole("button", { name: `Help with ${route}`, exact: true })
      .click();
    for (let step = 1; step <= count; step++) {
      await expect(dialog.locator(".tutorial-counter")).toHaveText(
        `${step} / ${count}`,
      );
      const card = await dialog.locator(".tutorial-card").boundingBox();
      expect(card!.x).toBeGreaterThanOrEqual(16);
      expect(card!.x + card!.width).toBeLessThanOrEqual(304);
      await expect(
        dialog.getByRole("button", { name: "Back", exact: true }),
      ).toBeVisible();
      if (step < count) {
        await expect(
          dialog.getByRole("button", { name: "Next", exact: true }),
        ).toBeVisible();
        await page.keyboard.press("ArrowRight");
      }
    }
    const dots = await dialog.locator(".tutorial-dots").boundingBox();
    const done = await dialog
      .getByRole("button", { name: "Done", exact: true })
      .boundingBox();
    expect(dots!.x + dots!.width).toBeLessThanOrEqual(done!.x);
    await page.keyboard.press("Escape");
  }
});

test("help dismissal animation survives navigation and ignores repeated interaction", async ({
  page,
  userId,
}) => {
  expect(userId).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/compose");
  const wrapper = page.locator(".help-launcher");
  const badge = page.getByRole("button", {
    name: "Hide help button until reload.",
    exact: true,
  });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveCSS("transition-duration", "0.15s");
  await badge.hover();
  await expect(badge).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");
  expect(
    await badge.evaluate(
      (element) =>
        getComputedStyle(element).color ===
        getComputedStyle(document.querySelector(".help-cloud")!).color,
    ),
  ).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await badge.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
    (document.querySelector(".help-button") as HTMLButtonElement).click();
    // Next's native history integration updates the pathname without unmounting the shared layout.
    history.pushState(null, "", "/settings");
  });
  await wrapper.evaluate((element) => {
    for (const animation of element.getAnimations()) animation.pause();
  });
  await expect(page).toHaveURL(/\/settings$/);
  await expect(wrapper).toHaveAttribute("data-state", "dismissing");
  await expect(wrapper).toHaveAttribute("inert", "");
  await expect(wrapper).toHaveCSS("pointer-events", "none");
  await expect(wrapper).toHaveCSS("transition-duration", "0.2s, 0.2s");
  await expect(wrapper).toHaveCSS(
    "transition-timing-function",
    "ease-in, ease-in",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const transitions = await wrapper.evaluate((element) =>
    element.getAnimations().map((animation) => ({
      frames: (animation.effect as KeyframeEffect).getKeyframes(),
      duration: animation.effect?.getTiming().duration,
    })),
  );
  expect(
    transitions.some(
      ({ frames, duration }) =>
        duration === 200 && frames.some((frame) => frame.opacity === "0"),
    ),
  ).toBe(true);
  expect(
    transitions.some(
      ({ frames, duration }) =>
        duration === 200 &&
        frames.some((frame) => frame.transform === "scale(0.8)"),
    ),
  ).toBe(true);
  const midway = await wrapper.evaluate((element) => {
    for (const animation of element.getAnimations())
      animation.currentTime = 100;
    const style = getComputedStyle(element);
    return {
      opacity: Number(style.opacity),
      scale: new DOMMatrix(style.transform).a,
    };
  });
  expect(midway.opacity).toBeGreaterThan(0);
  expect(midway.opacity).toBeLessThan(1);
  expect(midway.scale).toBeGreaterThan(0.8);
  expect(midway.scale).toBeLessThan(1);
  await page.clock.runFor(199);
  await expect(wrapper).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(wrapper).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
  await page.clock.resume();
  await page.reload();
  await expect(badge).toBeVisible();
});

test("help touch target and instant reduced-motion dismissal preserve scroll", async ({
  page,
  userId,
  isMobile,
}) => {
  expect(userId).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/compose");
  const badge = page.getByRole("button", {
    name: "Hide help button until reload.",
    exact: true,
  });
  await expect(badge).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 200));
  const scrollY = await page.evaluate(() => window.scrollY);
  const box = (await badge.boundingBox())!;
  if (isMobile) {
    const target = await badge.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return {
        width: parseFloat(style.width),
        height: parseFloat(style.height),
        background: style.backgroundColor,
      };
    });
    expect(target).toEqual({
      width: 32,
      height: 32,
      background: "rgba(0, 0, 0, 0)",
    });
    // Five pixels outside the visible circle, inside its transparent touch target.
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.className,
        { x: box.x - 5, y: box.y + 10 },
      ),
    ).toBe("help-dismiss");
  }
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  if (isMobile) await page.touchscreen.tap(box.x - 5, box.y + 10);
  else await badge.click();
  // No timer advancement: reduced motion removes the wrapper immediately.
  await expect(page.locator(".help-launcher")).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

async function seedReadinessWorkspace(userId: string) {
  const templateId = randomUUID();
  const campaignId = randomUUID();
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Engineer"],
  ]);
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      templateId,
      userId,
      "Readiness template",
      "Hello {{name}}",
      "Hi {{name}}, exploring {{role}}.",
    ],
  );
  await pool.query(
    'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,$4)',
    [campaignId, userId, templateId, "QUEUED"],
  );
  const contacts: Record<string, string> = {};
  for (const [name, role] of [
    ["Alex", null],
    ["Sam", " "],
    ["Maya", "Engineer"],
    ["Previously", "Engineer"],
    ["Queued", "Engineer"],
  ]) {
    const id = randomUUID();
    contacts[name!] = id;
    await pool.query(
      'INSERT INTO "Contact" (id,"userId",name,email,"jobRole") VALUES ($1,$2,$3,$4,$5)',
      [id, userId, name, `${name}@example.test`, role],
    );
  }
  await pool.query(
    'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","sentAt") VALUES ($1,$2,$3,$4,$5,$6)',
    [
      randomUUID(),
      campaignId,
      contacts.Previously,
      "SENT",
      "DONE",
      new Date(Date.now() - 48 * 3600000),
    ],
  );
  // Exact quota: 50 queued + 3 recently sent + 1 replied + 2 uncertain/in-flight.
  for (let index = 0; index < 57; index++) {
    const status =
      index < 50
        ? "QUEUED"
        : index < 53
          ? "SENT"
          : index === 53
            ? "REPLIED"
            : "FAILED";
    const delivery =
      index === 54 ? "ATTEMPTING" : index === 55 ? "UNCERTAIN" : "DONE";
    await pool.query(
      'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","sentAt") VALUES ($1,$2,$3,$4::"SendStatus",$5::"DeliveryState",$6)',
      [
        randomUUID(),
        campaignId,
        contacts.Queued,
        status,
        delivery,
        ["SENT", "REPLIED"].includes(status) ? new Date() : null,
      ],
    );
  }
  const attachmentId = randomUUID();
  await pool.query(
    'INSERT INTO "Attachment" (id,"userId","fileName","storagePath") VALUES ($1,$2,$3,$4)',
    [
      attachmentId,
      userId,
      "readiness.pdf",
      `browser-fixture/${userId}/readiness.pdf`,
    ],
  );
  await pool.query('UPDATE "User" SET "currentAttachmentId"=$2 WHERE id=$1', [
    userId,
    attachmentId,
  ]);
  return { templateId, campaignId, contacts };
}

for (const theme of ["light", "dark"] as const) {
  test(`workspace header and Compose readiness: ${theme}`, async ({
    page,
    userId,
  }, testInfo) => {
    const { templateId } = await seedReadinessWorkspace(userId);
    await page.addInitScript(
      (value) => localStorage.setItem("mailloop-theme", value),
      theme,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of [
      "compose",
      "templates",
      "contacts",
      "history",
      "settings",
    ]) {
      await page.goto(`/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      const header = page.locator(".workspace-header-controls");
      expect(
        await header.evaluate((element) =>
          [...element.children].map((child) => child.className),
        ),
      ).toEqual([
        "workspace-gmail",
        "inline-flex items-center gap-3",
        "workspace-account",
      ]);
      await expect(header).toHaveCSS("gap", "12px");
      await expect(header.getByRole("progressbar")).toHaveCount(0);
      await expect(header.locator(".workspace-gmail")).toHaveText(
        "Gmail connected",
      );
      await expect(header.locator(".workspace-gmail")).toHaveCSS(
        "height",
        "52px",
      );
      await expect(header.locator(".workspace-account-trigger")).toHaveCSS(
        "height",
        "52px",
      );
      await expect(header.locator(".workspace-avatar")).toHaveCSS(
        "width",
        "40px",
      );
      await expect(header.locator(".workspace-avatar")).toHaveText("T");
      await expect(header.locator(".workspace-mono-label")).toHaveCSS(
        "font-family",
        /JetBrains/,
      );
      await expect(header).toHaveCSS("font-family", /Plus Jakarta/);
      // Preserve the existing font everywhere outside the requested areas.
      await expect(page.locator("main h1")).toHaveCSS("font-family", /Inter/);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(
        await header.evaluate((element) =>
          [...element.children].every((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
          }),
        ),
      ).toBe(true);
      const account = page.getByRole("button", {
        name: "Account menu",
        exact: true,
      });
      await account.click();
      const menu = page.getByRole("menu", { name: "Account" });
      await expect(menu).toContainText("SIGNED IN AS");
      await expect(menu).toContainText(`${userId}@example.test`);
      if (route === "compose")
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
      await expect(
        menu.getByRole("menuitem", { name: "Settings", exact: true }),
      ).toBeFocused();
      await expect(account).toHaveAttribute("aria-expanded", "true");
      await expect(account.locator("svg")).toHaveCSS(
        "transform",
        "matrix(-1, 0, 0, -1, 0, 0)",
      );
      const box = (await menu.boundingBox())!;
      const trigger = (await account.boundingBox())!;
      expect(box.width).toBe(290);
      expect(box.y).toBeCloseTo(trigger.y + trigger.height + 10, 1);
      expect(box.x + box.width).toBeCloseTo(trigger.x + trigger.width, 1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      await page.keyboard.press("ArrowUp");
      await expect(
        menu.getByRole("menuitem", { name: "Sign out", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        menu.getByRole("menuitem", { name: "Settings", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(account).toBeFocused();
      await expect(account).toHaveCSS("outline-width", "2px");
      await expect(account).toHaveCSS("outline-offset", "2px");
      await expect(account.locator("svg")).toHaveCSS("transform", "none");
      await account.click();
      await page.locator("main h1").click({ position: { x: 5, y: 5 } });
      await expect(menu).toHaveCount(0);
      await expect(account).toBeFocused();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (route !== "compose")
        await expect(page.locator(".send-checklist")).toHaveCount(0);
    }
    await page.goto("/compose");
    const checklist = page.getByRole("region", { name: "Before you can send" });
    const rows = checklist.locator("li");
    const send = page.locator(".compose-send-button");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0).locator(".sr-only")).toHaveText("Incomplete:");
    await expect(checklist.locator('[aria-live="polite"]')).toHaveCount(1);
    await expect(send).toBeDisabled();
    await expect(checklist).toHaveCSS("font-family", /Plus Jakarta/);
    const checklistBox = (await checklist.boundingBox())!;
    const sendBox = (await send.boundingBox())!;
    expect(checklistBox.y + checklistBox.height).toBeLessThanOrEqual(sendBox.y);
    await expect(
      page.getByRole("progressbar", {
        name: "Last 24 hours + queued",
        exact: true,
      }),
    ).toHaveAttribute("aria-valuenow", "56");
    await page
      .getByLabel("Choose a template", { exact: true })
      .selectOption(templateId);
    await expect(rows.nth(0)).toHaveAttribute("data-done", "true");
    await expect(rows.nth(0).locator(".sr-only")).toHaveText("Complete:");
    await expect(rows.nth(0).locator(".send-checklist-hint")).toHaveCSS(
      "max-height",
      "0px",
    );
    await expect(send).toBeDisabled();
    await page.getByRole("checkbox", { name: /^Alex/ }).check();
    await page.getByRole("checkbox", { name: /^Sam/ }).check();
    await expect(rows.nth(1)).toHaveAttribute("data-done", "true");
    await expect(rows.nth(1)).toContainText("2 selected");
    await expect(rows.nth(2)).toContainText(
      "Alex, Sam need a role. Use Apply Role to Selected.",
    );
    await expect(send).toBeDisabled();
    await page
      .getByLabel("Role to Apply to Selected", { exact: true })
      .fill("Engineer");
    await page
      .getByRole("button", { name: "Apply Role to Selected", exact: true })
      .click();
    await expect(rows.nth(2)).toHaveAttribute("data-done", "true");
    await expect(rows.nth(2).locator(".send-checklist-hint")).toHaveCSS(
      "max-height",
      "0px",
    );
    await expect(send).toBeEnabled();
    await expect(send).toHaveText("Send to 2 recipients");
    await expect(rows.nth(3)).toHaveAttribute("data-done", "false");
    await page
      .getByRole("checkbox", {
        name: "Attach Resume",
        exact: true,
      })
      .check();
    await expect(rows.nth(3)).toHaveAttribute("data-done", "true");
    await expect(send).toBeEnabled();
    await page
      .getByRole("checkbox", {
        name: "Attach Resume",
        exact: true,
      })
      .uncheck();
    await expect(send).toBeEnabled();
    await page.getByLabel("Job Role for Alex", { exact: true }).fill("   ");
    await expect(rows.nth(2)).toHaveAttribute("data-done", "false");
    await expect(rows.nth(2)).toContainText(
      "Alex needs a role. Use Apply Role to Selected.",
    );
    await expect(send).toBeDisabled();
    await page
      .getByLabel("Job Role for Alex", { exact: true })
      .fill("Engineer");
    await page.getByRole("checkbox", { name: /^Previously/ }).check();
    await expect(rows.nth(1)).toContainText("2 selected");
    await page
      .getByRole("checkbox", {
        name: "Allow a resend to Previously",
        exact: true,
      })
      .check();
    await expect(rows.nth(1)).toContainText("3 selected");
    await expect(
      page.getByRole("checkbox", { name: /^Queued/ }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(rows.nth(1)).toContainText("4 selected");
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await expect(rows.nth(1)).toHaveAttribute("data-done", "false");
    await expect(rows.nth(2)).toHaveAttribute("data-done", "false");
    await expect(send).toBeDisabled();
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(rows.nth(1)).toContainText("3 selected");
    await expect(send).toBeEnabled();
    await expect(rows.locator(".send-checklist-icon").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(rows.locator("path").first()).toHaveCSS(
      "transition-duration",
      "0s",
    );
    await expect(checklist.locator(".send-checklist-glow")).toHaveCSS(
      "animation-name",
      "none",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`readiness-${theme}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 568 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await page
      .getByRole("button", { name: "Account menu", exact: true })
      .click();
    const narrowMenu = (await page.getByRole("menu").boundingBox())!;
    expect(narrowMenu.width).toBe(280);
    expect(narrowMenu.x).toBeGreaterThanOrEqual(20);
    expect(narrowMenu.x + narrowMenu.width).toBeLessThanOrEqual(300);
    await page.keyboard.press("Escape");
  });
}

test("quota stays shared across navigation and clamps overflow; Gmail status and sign-out work", async ({
  page,
  userId,
}) => {
  const { templateId, campaignId, contacts } =
    await seedReadinessWorkspace(userId);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await expect(page.locator("header").getByRole("progressbar")).toHaveCount(0);
  await pool.query(
    'INSERT INTO "Send" (id,"campaignId","contactId",status) VALUES ($1,$2,$3,$4)',
    [randomUUID(), campaignId, contacts.Queued, "QUEUED"],
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Compose", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", {
      name: "Last 24 hours + queued",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", "57");
  // Mutate only this test user's count, keeping the schema and quota rules intact.
  await pool.query(
    'INSERT INTO "Send" (id,"campaignId","contactId",status) SELECT gen_random_uuid(),$1,$2,\'QUEUED\'::"SendStatus" FROM generate_series(1,444)',
    [campaignId, contacts.Queued],
  );
  await page.reload();
  const quota = page.getByRole("progressbar", {
    name: "Last 24 hours + queued",
    exact: true,
  });
  await expect(quota).toHaveAttribute("aria-valuenow", "500");
  const email = `${userId}.${"long".repeat(20)}@example.test`;
  await pool.query(
    'UPDATE "User" SET "gmailAuthorized"=false,email=$2 WHERE id=$1',
    [userId, email],
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Gmail not connected", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-gmail-dot")).toHaveCSS(
    "background-color",
    "rgb(251, 191, 36)",
  );
  await page
    .getByLabel("Choose a template", { exact: true })
    .selectOption(templateId);
  await page.getByRole("checkbox", { name: /^Maya/ }).check();
  await expect(page.locator(".send-checklist")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".compose-send-button")).toBeDisabled();
  await page.getByRole("checkbox", { name: /^Maya/ }).uncheck();
  await page
    .getByRole("button", { name: "Gmail not connected", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Compose", exact: true })
    .click();
  await expect(page).toHaveURL(/\/compose$/);
  const account = page.getByRole("button", {
    name: "Account menu",
    exact: true,
  });
  await account.click();
  const menu = page.getByRole("menu");
  await expect(menu.locator(".workspace-account-email")).toHaveText(email);
  await expect(menu.locator(".workspace-account-email")).toHaveCSS(
    "text-overflow",
    "ellipsis",
  );
  expect(
    await menu
      .locator(".workspace-account-email")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await menu.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(menu).toHaveCount(0);
  await expect(account).toBeFocused();
  await account.click();
  await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/compose");
  await expect(page).toHaveURL(/\/$/);
});

test("checklist animations draw, reverse, stagger and pulse once on readiness", async ({
  page,
  userId,
}) => {
  const { templateId } = await seedReadinessWorkspace(userId);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/compose");
  const checklist = page.locator(".send-checklist");
  const rows = checklist.locator("li");
  await expect(checklist.locator(".send-checklist-glow")).toHaveCount(0);
  await page
    .getByLabel("Choose a template", { exact: true })
    .selectOption(templateId);
  await expect(rows.nth(0).locator(".send-checklist-icon")).toHaveCSS(
    "animation-name",
    "checklist-pop",
  );
  await expect(rows.nth(0).locator("path")).toHaveCSS(
    "stroke-dashoffset",
    "0px",
  );
  await expect(rows.nth(0).locator("path")).toHaveCSS(
    "transition-duration",
    "0.35s, 0.2s",
  );
  await page.getByRole("checkbox", { name: /^Maya/ }).check();
  await expect(rows.nth(1).locator("path")).toHaveCSS("transition-delay", "0s");
  await expect(rows.nth(2).locator("path")).toHaveCSS(
    "transition-delay",
    "0.06s",
  );
  await expect(checklist).toHaveAttribute("data-ready", "true");
  const glow = checklist.locator(".send-checklist-glow");
  await expect(glow).toHaveCSS("animation-duration", "0.6s");
  await expect(page.locator(".compose-send-button")).toBeEnabled();
  await expect(page.locator(".compose-send-button")).toHaveCSS(
    "transition-duration",
    "0.25s, 0.25s, 0.25s, 0.25s",
  );
  const originalGlow = await glow.elementHandle();
  await page
    .getByRole("checkbox", {
      name: "Attach Resume",
      exact: true,
    })
    .check();
  expect(
    await originalGlow!.evaluate(
      (element) => element === document.querySelector(".send-checklist-glow"),
    ),
  ).toBe(true);
  await page.getByRole("checkbox", { name: /^Maya/ }).uncheck();
  await expect(rows.nth(1).locator(".send-checklist-icon")).toHaveCSS(
    "animation-name",
    "checklist-unpop",
  );
  await expect(rows.nth(1).locator("path")).toHaveCSS(
    "stroke-dashoffset",
    "1px",
  );
  await expect(rows.nth(2)).toHaveAttribute("data-done", "false");
  await expect(page.locator(".compose-send-button")).toBeDisabled();
  await page.getByRole("checkbox", { name: /^Maya/ }).check();
  expect(await originalGlow!.evaluate((element) => element.isConnected)).toBe(
    false,
  );
  await page.getByLabel("Choose a template", { exact: true }).selectOption("");
  await expect(rows.nth(0).locator(".send-checklist-hint")).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(rows.nth(0).locator(".send-checklist-hint")).toHaveCSS(
    "transition-duration",
    "0.2s, 0.2s",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(rows.nth(0).locator(".send-checklist-icon")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(glow).toHaveCSS("animation-name", "none");
});
