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
    page.getByText("Template saved.", { exact: true }),
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
    page.getByText("2 ready · 1 duplicates · 1 need correction"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import Valid Contacts" }),
  ).toBeDisabled();
  await page
    .getByLabel("Row 5 email", { exact: true })
    .fill("alex@example.test");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("button", { name: "Import Valid Contacts" }).click();
  await expect(
    page.getByText("2 contacts imported. 0 rows skipped."),
  ).toBeVisible();
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
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "Keep my draft",
  );
  await page.getByLabel("Message", { exact: true }).fill("Hi {{name}}");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page.getByText("Template saved.", { exact: true }),
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
  await expect(page.getByText("Contact saved.", { exact: true })).toBeVisible();
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
  for (const route of [
    "contacts",
    "compose",
    "templates",
    "history",
    "settings",
  ]) {
    await page.goto(`/${route}`);
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
}, testInfo) => {
  await pool.query(
    'UPDATE "User" SET "preferredRoles"=$2,"linkUrl"=$3 WHERE id=$1',
    [
      userId,
      ["SDE Intern", "Frontend Developer"],
      "https://example.com/portfolio",
    ],
  );
  await page.goto("/templates");
  await page.getByRole("button", { name: "Use Example", exact: true }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Exploring {{role}} opportunities",
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
    .fill("Hi {{name}}, I’m applying for {{role}}. Link: ");
  await page.getByRole("button", { name: "{{link}}", exact: true }).click();
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page.getByText("Template saved.", { exact: true }),
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
  await page.getByRole("button", { name: "Import Valid Contacts" }).click();
  await expect(
    page.getByText("3 contacts imported. 0 rows skipped."),
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
    page.getByRole("link", {
      name: "https://example.com/portfolio",
      exact: true,
    }),
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
  ).toContainText("Waiting for delivery service");
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
        r.attachmentId === null,
    ),
  ).toBe(true);
  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "userId"=$1)`,
    [userId],
  );
  await expect(
    page.getByRole("region", { name: "Campaign delivery progress" }),
  ).toContainText("Batch complete. All emails sent.", { timeout: 15000 });
  const check = page.locator(".completion-check");
  await expect(check).toBeVisible();
  await expect(check).toHaveCSS("width", "80px");
  await expect(page.locator(".progress-ring .timer-value")).toHaveCount(0);
  await expect(check.locator("path")).toHaveCSS("animation-duration", "0.45s");
  await check.locator("path").evaluate(async (e) => {
    await Promise.all(e.getAnimations().map((animation) => animation.finished));
  });
  const animationStart = await check
    .locator("path")
    .evaluate((e) => e.getAnimations()[0].startTime);
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Finish the theme's root overlay before capturing this individual panel.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) =>
          (
            animation.effect as KeyframeEffect | null
          )?.pseudoElement?.startsWith("::view-transition"),
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  expect(
    await check.locator("path").evaluate((e) => e.getAnimations()[0].startTime),
  ).toBe(animationStart);
  await page
    .getByRole("region", { name: "Campaign delivery progress" })
    .screenshot({ path: testInfo.outputPath("batch-complete.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(check.locator("path")).toHaveCSS("animation-name", "none");
  await expect(check.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await page.goto("/compose");
  await expect(page.getByText(/Last Sent:/).first()).toBeVisible();
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
      'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","dispatchedAt") VALUES ($1,$2,$3,$4::"SendStatus",$5::"DeliveryState",now())',
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
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await card
      .locator(".progress-ring circle")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await page.goto(`/history?campaign=${randomUUID()}`);
  await expect(
    page.getByRole("region", { name: "Campaign delivery progress" }),
  ).toHaveCount(0);
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
  // Confirm successful completion without relying on a live sending service.
  await pool.query(
    'UPDATE "Send" SET status=\'SENT\',"deliveryState"=\'DONE\',"sentAt"=now() WHERE id=$1',
    [sendIds[1]],
  );
  await page.reload();
  const check = card.locator(".completion-check");
  await expect(check).toBeVisible();
  await expect(check).toHaveCSS("width", "80px");
  await expect(card.locator(".timer-value")).toHaveCount(0);
  await expect(
    card.locator(".progress-ring span").filter({ hasText: /^Done$/ }),
  ).toHaveCSS("font-size", "12px");
  await check.locator("path").evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  await card.screenshot({ path: testInfo.outputPath("batch-complete.png") });
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
  await expect(page.getByLabel("Attach Resume", { exact: true })).toBeChecked();
  await page.getByLabel("Attach Resume", { exact: true }).uncheck();
  await expect(
    page.getByText("No PDF attachment", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("resume.pdf", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await page
    .getByLabel("URL (optional HTTPS link)")
    .fill("https://example.com/portfolio");
  await page
    .getByRole("button", { name: "Save Preferences", exact: true })
    .click();
  await expect(
    page.getByText("Preferences saved.", { exact: true }),
  ).toBeVisible();
  await page.goto("/compose");
  await expect(
    page.getByLabel("Attach Resume", { exact: true }),
  ).not.toBeChecked();
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
    page.getByText("Template saved.", { exact: true }),
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
  await pool.query(
    'UPDATE "User" SET "preferredRoles"=$2,"linkUrl"=$3 WHERE id=$1',
    [
      userId,
      ["SDE Intern", "Backend Developer"],
      "https://example.test/resume",
    ],
  );
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      templateId,
      userId,
      "Backend template",
      "Exploring {{role}} opportunities at {{company}}",
      "Hi {{name}},\n\nI’m interested in {{role}} opportunities at {{company}}.\n\nLink: {{link}}\n\nThank you for your time.",
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
