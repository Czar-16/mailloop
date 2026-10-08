import "dotenv/config";
import { test as base, expect } from "@playwright/test";
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
    "opportunity",
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
  ).toEqual(["page-enter", "0.3s"]);

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
  await page
    .getByRole("button", { name: "Send to 1 recipient", exact: true })
    .click();
  await expect(
    page.getByText("Choose a template and at least one eligible recipient.", {
      exact: true,
    }),
  ).toBeVisible();
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
  await expect(page.getByRole("menu")).toContainText("Test User");
  await expect(
    page.getByRole("menuitem", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeFocused();
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
  ).toContainText("Queued · 3");
  // Follow the user's route sequence before delivery finishes.
  await page.getByRole("link", { name: "Compose", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const progress = page.getByRole("region", {
    name: "Campaign delivery progress",
  });
  await expect(progress).toContainText("Queued · 3");
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
  await expect(progress).toContainText("Batch complete. All emails sent.");
  await expect(progress).toContainText("Sent · 3");
  await expect(progress).toContainText("Queued · 0");
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
  await expect(page.getByText(/Last Sent:/).first()).toBeVisible();
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
  await expect(card).toContainText("Approximate remaining:", {
    timeout: 15000,
  });
  await expect(card).toContainText("Retries and service delays");
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 1000),
  );
  // Let the sampled clock settle after pauseAt skips to the new timestamp.
  await page.clock.runFor(100);
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
  const arc = card.locator(".countdown-arc");
  const offset = () =>
    arc.evaluate((e) => Number(e.getAttribute("stroke-dashoffset")));
  // The ring moves between digit changes, rather than stepping once a second.
  const firstOffset = await offset();
  await page.clock.runFor(250);
  expect(await offset()).toBeGreaterThan(firstOffset);
  await page.clock.runFor(750);
  expect(await readSeconds()).toBe(before - 1);
  await page.clock.runFor(1000);
  expect(await readSeconds()).toBe(before - 2);
  await expect(timer).toHaveAttribute("data-timer-original", "true");
  await expect(card.locator(".countdown-arc")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(card.locator(".completion-check")).toHaveCount(0);
  const beforeHidden = await offset();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(2000);
  expect(await offset()).toBe(beforeHidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(offset).toBeGreaterThan(beforeHidden);
  expect(await readSeconds()).toBe(before - 4);
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
  expect(
    await card
      .locator(".progress-ring circle")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  // An absent/unknown campaign parameter must not conceal the user's queue.
  await page.goto(`/history?campaign=${randomUUID()}`);
  await expect(card).toContainText("Queued · 2");
  await expect(card).toContainText("Sent · 1");
  await expect(card).toContainText("Failed · 1");
  await expect(card).toContainText("Needs review · 1");
  await page.getByRole("link", { name: "Compose", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(card).toContainText("Queued · 2");
  await expect(card.locator(".countdown-arc")).toBeVisible();
  await page.reload();
  await expect(card).toContainText("Queued · 2");

  const search = page.getByRole("searchbox", { name: "Search history" });
  const statusFilter = page.getByLabel("Filter by status");
  await search.fill("alex");
  await statusFilter.selectOption("QUEUED");
  await expect(page).toHaveURL(/q=alex&status=QUEUED/);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(card).toContainText("Sent · 1");
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
  await expect(card).toContainText("Queued · 2");

  // Finishing one campaign must not remove its counts from the observed queue.
  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId"=$1`,
    [otherCampaign],
  );
  await expect(card).toContainText("Queued · 1", { timeout: 15000 });
  await expect(card).toContainText("Sent · 2");
  await expect(card).toContainText("Delivery needs review");
  await expect(card.locator(".completion-check")).toHaveCount(0);

  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "userId"=$1)`,
    [userId],
  );
  await expect(card.locator(".completion-check")).toBeVisible({
    timeout: 15000,
  });
  await expect(card).toContainText("Sent · 5");
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.goto("/history");
  await expect(card).toHaveCount(0);
});

test("batch countdown survives polls, individual sends and an expired estimate", async ({
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
  await page.goto(`/history?campaign=${campaign}`);
  const card = page.getByRole("region", { name: "Campaign delivery progress" });
  const arc = card.locator(".countdown-arc");
  const offset = () =>
    arc.evaluate((e) => Number(e.getAttribute("stroke-dashoffset")));
  await expect.poll(offset).toBeGreaterThan(100);
  await card.screenshot({ path: testInfo.outputPath("batch-active.png") });
  const initial = await offset();
  // An unchanged server poll must not replenish the countdown.
  await page.waitForTimeout(5500);
  expect(await offset()).toBeGreaterThan(initial);
  await pool.query(
    'UPDATE "Send" SET status=\'SENT\',"deliveryState"=\'DONE\',"sentAt"=now() WHERE id=$1',
    [sendIds[0]],
  );
  await expect(card).toContainText("Queued · 1", { timeout: 15000 });
  // Updating the queue must retain elapsed batch time in the arc denominator.
  await expect.poll(offset).toBeGreaterThan(150);
  await expect(card.locator(".completion-check")).toHaveCount(0);
  const timerSeconds = () =>
    card.locator(".timer-value").evaluate((element) => {
      const [minutes, seconds] = element.textContent!.split(":").map(Number);
      return minutes * 60 + seconds;
    });
  const beforeDelay = await timerSeconds();
  await pool.query('UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1', [
    userId,
    new Date((await page.evaluate(() => Date.now())) + 120000).toISOString(),
  ]);
  // The explanatory range may change, but the running timer must not increase.
  await expect(card).toContainText("Approximate remaining: 2–3 minutes", {
    timeout: 15000,
  });
  expect(await timerSeconds()).toBeLessThanOrEqual(beforeDelay);
  expect(await offset()).toBeGreaterThan(initial);
  await pool.query('UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1', [
    userId,
    new Date((await page.evaluate(() => Date.now())) - 1000).toISOString(),
  ]);
  await expect(card.locator(".timer-value")).toHaveText("Sending", {
    timeout: 15000,
  });
  await expect(card).toContainText("Please be patient");
  await expect(card.locator(".completion-check")).toHaveCount(0);
  await pool.query('UPDATE "User" SET "nextSendAt"=$2::timestamp WHERE id=$1', [
    userId,
    new Date((await page.evaluate(() => Date.now())) + 120000).toISOString(),
  ]);
  await expect(card).toContainText("Approximate remaining: 2–3 minutes", {
    timeout: 15000,
  });
  await expect(card.locator(".timer-value")).toHaveText("Sending");
  expect(await offset()).toBeCloseTo(2 * Math.PI * 59);
  await pool.query(
    'UPDATE "Send" SET status=\'FAILED\',"deliveryState"=\'DONE\',"attemptedAt"=now() WHERE id=$1',
    [sendIds[1]],
  );
  await expect(card).toContainText("with failures", { timeout: 15000 });
  await expect(card.locator(".completion-check")).toHaveCount(0);
  await expect(arc).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
});

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
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => localStorage.removeItem("mailloop-theme"));
  await page.reload();
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
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Dark theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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
