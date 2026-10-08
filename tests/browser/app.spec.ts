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
  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Theme", { exact: true }).first().selectOption(theme);
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`landing-${theme}.png`),
      fullPage: true,
      caret: "initial",
    });
  }
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
test("shell navigation, themes, and all routes remain usable", async ({
  page,
  userId,
}) => {
  test.setTimeout(120000);
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Software Engineer"],
  ]);
  const desktop = test.info().project.name === "desktop";
  if (desktop) await page.setViewportSize({ width: 1440, height: 1000 });

  for (const theme of ["dark", "light"]) {
    await page.goto("/compose");
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    for (const route of [
      "compose",
      "templates",
      "contacts",
      "history",
      "settings",
    ]) {
      await page.goto(`/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (desktop) {
        const sidebar = page.getByRole("complementary", {
          name: "Workspace sidebar",
        });
        await expect(sidebar).toBeVisible();
        await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute(
          "href",
          `/${route}`,
        );
        await expect(
          sidebar.getByText("Usage unavailable", { exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("link", { name: "Campaigns", exact: true }),
        ).toHaveCount(0);
      }
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        `${route}: ${theme}`,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`${route}-${theme}.png`),
        fullPage: true,
        caret: "initial",
      });
    }
  }

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/compose");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(drawer).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("navigation-320.png"),
    caret: "initial",
  });
  await page.keyboard.press("Tab");
  expect(
    await drawer.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("link", { name: "Templates", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(drawer).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);

  await trigger.click();
  await drawer.getByRole("link", { name: "mailloop", exact: true }).click();
  await expect(page).toHaveURL(/\/compose$/);
  await expect(drawer).not.toBeVisible();

  for (const route of [
    "compose",
    "templates",
    "contacts",
    "history",
    "settings",
  ]) {
    await page.goto(`/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${route} at 320px`,
    ).toBe(true);
  }

  await trigger.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(drawer).not.toBeVisible();
  await page.goto("/compose");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("compose-1024.png"),
    fullPage: true,
    caret: "initial",
  });
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
    page.getByRole("heading", { name: "Engineer at Acme", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Hi Alex,", { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/mailloop-compose-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Send Campaign", exact: true })
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
test("compose workflow preserves selection, personalization, and resend eligibility", async ({
  page,
  userId,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Engineer"],
  ]);
  const templateId = randomUUID();
  const campaignId = randomUUID();
  const freshId = randomUUID();
  const previousId = randomUUID();
  const queuedId = randomUUID();
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      templateId,
      userId,
      "Outreach",
      "{{role}} at {{company}}",
      "Hi {{name}},\nI’d love to join {{company}} as a {{role}}.",
    ],
  );
  for (const [id, name, company] of [
    [freshId, "Fresh", "Acme"],
    [previousId, "Previous", "Other"],
    [queuedId, "Queued", "Example"],
  ]) {
    await pool.query(
      'INSERT INTO "Contact" (id,"userId",name,email,company,"jobRole") VALUES ($1,$2,$3,$4,$5,$6)',
      [
        id,
        userId,
        name,
        `${name.toLowerCase()}@example.test`,
        company,
        "Engineer",
      ],
    );
  }
  await pool.query(
    'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,$4)',
    [campaignId, userId, templateId, "QUEUED"],
  );
  await pool.query(
    'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState","sentAt") VALUES ($1,$2,$3,$4,$5,NOW()),($6,$2,$7,$8,$9,NULL)',
    [
      randomUUID(),
      campaignId,
      previousId,
      "SENT",
      "DONE",
      randomUUID(),
      queuedId,
      "QUEUED",
      "READY",
    ],
  );
  const desktop = test.info().project.name === "desktop";
  if (desktop) await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/compose");
  await expect(
    page.getByRole("button", { name: "Save Draft", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send Campaign", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByLabel(/^Subject/)).toHaveAttribute("readonly", "");
  await expect(page.getByLabel(/^Email body/)).toHaveValue(
    "Hi {{name}},\nI’d love to join {{company}} as a {{role}}.",
  );
  await expect(
    page.getByRole("link", { name: "Import Contacts", exact: true }),
  ).toHaveAttribute("href", "/contacts");
  await expect(page.getByRole("checkbox", { name: /^Queued/ })).toBeDisabled();
  await expect(
    page.getByText("No confirmed send", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Previously contacted", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "2");

  await page.getByRole("checkbox", { name: /^Fresh/ }).check();
  await page.getByRole("checkbox", { name: /^Previous/ }).check();
  await expect(page.locator("#compose-send-count")).toHaveText(
    "Individual emails1",
  );
  await expect(
    page.getByText("2 selected · 1 skipped", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Allow a resend to Previous", { exact: true }).check();
  await expect(page.locator("#compose-send-count")).toHaveText(
    "Individual emails2",
  );
  await page
    .getByLabel("Job Role for Previous", { exact: true })
    .fill("Developer");
  await page
    .getByLabel("Preview recipient", { exact: true })
    .selectOption(previousId);
  await expect(
    page.getByRole("heading", { name: "Developer at Other", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Full personalized email", exact: true }),
  ).toContainText("Hi Previous,");

  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const workflow = page.getByRole("navigation", {
    name: "Campaign workflow",
    exact: true,
  });
  for (const step of ["Recipients", "Preview", "Send", "Message"]) {
    const link = workflow.getByRole("link", { name: new RegExp(step) });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "step");
    await expect(
      page.getByLabel("Job Role for Previous", { exact: true }),
    ).toHaveValue("Developer");
  }
  expect(dialogs).toEqual([]);
  await page.getByLabel("Search recipients", { exact: true }).fill("Fresh");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Fresh/);
  await expect(page.getByRole("checkbox", { name: /^Fresh/ })).toBeChecked();
  await expect(
    page.getByLabel("Job Role for Previous", { exact: true }),
  ).toHaveValue("Developer");
  await expect(
    page.getByText(
      "Your selection includes contacts from other search results.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Search recipients", { exact: true }).fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^Queued/ })).toBeDisabled();

  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.locator("main h1").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`compose-populated-${theme}.png`),
      fullPage: true,
      caret: "initial",
    });
  }
  const message = await page.locator("#compose-message").boundingBox();
  const recipients = await page.locator("#compose-recipients").boundingBox();
  const preview = await page.locator("#compose-preview").boundingBox();
  const limits = await page.locator("#compose-send").boundingBox();
  expect(preview!.y - (recipients!.y + recipients!.height)).toBeCloseTo(24, 0);
  expect(limits!.y - (preview!.y + preview!.height)).toBeCloseTo(24, 0);
  if (desktop) expect(message!.x + message!.width).toBeLessThan(recipients!.x);
  else expect(message!.y + message!.height).toBeLessThan(recipients!.y);
});

test("responsive viewport matrix preserves the campaign workflow and usable page controls", async ({
  page,
  userId,
}) => {
  test.skip(
    test.info().project.name !== "desktop",
    "The matrix runs once; touch behavior is covered by the mobile suite.",
  );
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Engineer"],
  ]);
  const templateId = randomUUID();
  const campaignId = randomUUID();
  const company = `Example ${"International".repeat(9)}`;
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      templateId,
      userId,
      "Responsive outreach",
      "{{role}} at {{company}}",
      `Hi {{name}},\n\n${"I’m interested in {{role}} opportunities at {{company}}.\n".repeat(24)}`,
    ],
  );
  await pool.query(
    'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,$4)',
    [campaignId, userId, templateId, "QUEUED"],
  );
  for (let i = 0; i < 22; i++) {
    const contactId = randomUUID();
    const name =
      i === 0
        ? `Avery ${"Longname".repeat(12)}`
        : i === 1
          ? "Beatrice"
          : `Z Contact ${String(i).padStart(2, "0")}`;
    const email =
      i === 0
        ? `avery.${"a".repeat(140)}@example.test`
        : `person${i}@example.test`;
    await pool.query(
      'INSERT INTO "Contact" (id,"userId",name,email,company,"jobRole") VALUES ($1,$2,$3,$4,$5,$6)',
      [contactId, userId, name, email, company, "Engineer"],
    );
    if (i === 2 || i === 3)
      await pool.query(
        'INSERT INTO "Send" (id,"campaignId","contactId","recipientName","recipientEmail","recipientCompany","templateName",status,"deliveryState","sentAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          randomUUID(),
          campaignId,
          contactId,
          name,
          email,
          company,
          "Responsive outreach",
          i === 2 ? "SENT" : "QUEUED",
          i === 2 ? "DONE" : "READY",
          i === 2 ? new Date() : null,
        ],
      );
  }
  await page.goto("/compose");
  await expect(page.locator("main h1")).toBeVisible();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByRole("checkbox", { name: /^Avery/ }).check();
  await page.getByRole("checkbox", { name: /^Beatrice/ }).check();
  await page
    .getByLabel("Job Role for Beatrice", { exact: true })
    .fill("Product Developer");
  const viewports = [
    { name: "desktop", width: 1920, height: 1080 },
    { name: "desktop-compact", width: 1440, height: 900 },
    { name: "laptop", width: 1366, height: 768 },
    { name: "wide-boundary", width: 1280, height: 800 },
    { name: "stacked-boundary", width: 1279, height: 800 },
    { name: "small-laptop", width: 1024, height: 768 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "tablet-compact", width: 768, height: 1024 },
    { name: "mobile-landscape", width: 844, height: 390 },
    { name: "mobile", width: 390, height: 844 },
    { name: "mobile-small", width: 320, height: 720 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByLabel("Job Role for Beatrice", { exact: true }),
    ).toHaveValue("Product Developer");
    await expect(page.locator("#compose-send-count")).toHaveText(
      "Individual emails2",
    );
    await expect(
      page.getByRole("button", { name: "Send Campaign", exact: true }),
    ).toHaveCount(1);
    const sidebar = page.getByRole("complementary", {
      name: "Workspace sidebar",
    });
    if (viewport.width >= 1024) await expect(sidebar).toBeVisible();
    else {
      await expect(sidebar).not.toBeVisible();
      const trigger = page.getByRole("button", { name: "Open navigation" });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
      await expect(drawer).toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(
        "hidden",
      );
      await page.keyboard.press("Tab");
      expect(
        await drawer.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
        "hidden",
      );
    }
    const panels = await Promise.all(
      ["message", "recipients", "preview", "send"].map((id) =>
        page.locator(`#compose-${id}`).boundingBox(),
      ),
    );
    if (viewport.width < 1280) {
      for (let i = 1; i < panels.length; i++)
        expect(panels[i]!.y).toBeGreaterThanOrEqual(
          panels[i - 1]!.y + panels[i - 1]!.height + 23,
        );
    } else
      expect(panels[1]!.x).toBeGreaterThan(panels[0]!.x + panels[0]!.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      viewport.name,
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).analyze()).violations,
      `compose: ${viewport.name}`,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`compose-${viewport.name}.png`),
      fullPage: true,
      caret: "initial",
    });
  }
  await page.getByRole("checkbox", { name: /^Avery/ }).uncheck();
  await page.getByRole("checkbox", { name: /^Beatrice/ }).uncheck();
  for (const viewport of viewports.filter((v) =>
    [1920, 1366, 1024, 834, 768, 390, 320].includes(v.width),
  )) {
    await page.setViewportSize(viewport);
    for (const route of ["templates", "contacts", "history", "settings"]) {
      await page.goto(
        route === "history" ? `/history?campaign=${campaignId}` : `/${route}`,
      );
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${route}: ${viewport.name}`,
      ).toBe(true);
      expect(
        await page
          .locator("main input:not([type=hidden]), main textarea, main select")
          .evaluateAll((elements) =>
            elements.every(
              (element) => parseFloat(getComputedStyle(element).fontSize) >= 16,
            ),
          ),
      ).toBe(true);
      if (
        viewport.width < 640 &&
        (route === "contacts" || route === "history")
      ) {
        const region = page.getByRole("region", {
          name:
            route === "contacts"
              ? "Contact directory table"
              : "Delivery history table",
          exact: true,
        });
        expect(
          await region.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
          `${route} mobile rows expose all columns`,
        ).toBe(true);
      }
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        `${route}: ${viewport.name}`,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`${route}-${viewport.name}.png`),
        fullPage: true,
        caret: "initial",
      });
    }
  }
});

test("workspace editors, archive confirmation, delivery states, and appearance preserve real data", async ({
  page,
  userId,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (test.info().project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 1000 });
  await pool.query('UPDATE "User" SET "preferredRoles"=$2 WHERE id=$1', [
    userId,
    ["Engineer"],
  ]);
  const templateId = randomUUID();
  const campaignId = randomUUID();
  await pool.query(
    'INSERT INTO "Template" (id,"userId",name,subject,body) VALUES ($1,$2,$3,$4,$5)',
    [
      templateId,
      userId,
      "Outreach",
      "Hello {{name}}",
      "Hi {{name}},\nI’m interested in {{role}} opportunities at {{company}}.",
    ],
  );
  await pool.query(
    'INSERT INTO "Campaign" (id,"userId","templateId",status) VALUES ($1,$2,$3,$4)',
    [campaignId, userId, templateId, "QUEUED"],
  );
  for (const [name, status, deliveryState] of [
    ["SentPerson", "SENT", "DONE"],
    ["RepliedPerson", "REPLIED", "DONE"],
    ["ReviewPerson", "FAILED", "UNCERTAIN"],
    ["QueuedPerson", "QUEUED", "READY"],
  ]) {
    const contactId = randomUUID();
    const email = `${name.toLowerCase()}@example.test`;
    await pool.query(
      'INSERT INTO "Contact" (id,"userId",name,email,company,"jobRole") VALUES ($1,$2,$3,$4,$5,$6)',
      [contactId, userId, name, email, "Acme", "Engineer"],
    );
    await pool.query(
      'INSERT INTO "Send" (id,"campaignId","contactId","recipientName","recipientEmail","recipientCompany","templateName",status,"deliveryState","sentAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        randomUUID(),
        campaignId,
        contactId,
        name,
        email,
        "Acme",
        "Outreach",
        status,
        deliveryState,
        deliveryState === "DONE" ? new Date() : null,
      ],
    );
  }
  await page.goto("/templates");
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "Outreach", exact: true }),
    })
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "Outreach",
  );
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Introduction for {{name}}");
  await page
    .getByRole("button", { name: "Save Template", exact: true })
    .click();
  await expect(
    page.getByText("Template saved.", { exact: true }),
  ).toBeVisible();
  const savedTemplate = await pool.query(
    'SELECT subject FROM "Template" WHERE id=$1 AND "userId"=$2',
    [templateId, userId],
  );
  expect(savedTemplate.rows[0].subject).toBe("Introduction for {{name}}");

  await page.goto("/contacts");
  const sentRow = page
    .getByRole("region", { name: "Contact directory table", exact: true })
    .getByRole("row")
    .filter({ hasText: "SentPerson" });
  await sentRow.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "SentPerson",
  );
  await page.getByLabel("Company", { exact: false }).fill("Updated company");
  await page.getByRole("button", { name: "Save Contact", exact: true }).click();
  await expect(page.getByText("Contact saved.", { exact: true })).toBeVisible();
  await expect(sentRow).toContainText("Updated company");
  await sentRow.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete this contact?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(sentRow).toBeVisible();
  await sentRow.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(sentRow).toHaveCount(0);
  const archived = await pool.query(
    'SELECT "archivedAt" FROM "Contact" WHERE "userId"=$1 AND name=$2',
    [userId, "SentPerson"],
  );
  expect(archived.rows[0].archivedAt).toBeTruthy();
  const retained = await pool.query(
    'SELECT COUNT(*) FROM "Send" WHERE "campaignId"=$1',
    [campaignId],
  );
  expect(Number(retained.rows[0].count)).toBe(4);

  await page.goto(`/history?campaign=${campaignId}`);
  const history = page.getByRole("region", {
    name: "Delivery history table",
    exact: true,
  });
  await expect(
    history.getByText("Delivery needs review", { exact: true }),
  ).toBeVisible();
  await expect(history.getByText("failed", { exact: true })).toHaveCount(0);
  await expect(history).toContainText("SentPerson");
  await expect(
    page.getByRole("progressbar", { name: "Resolved deliveries", exact: true }),
  ).toHaveAttribute("value", "2");
  await expect(
    page.getByRole("progressbar", { name: "Resolved deliveries", exact: true }),
  ).toHaveAttribute("max", "4");
  await page.goto("/settings");
  await page.getByLabel("Color theme", { exact: true }).selectOption("dark");
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    for (const route of ["templates", "contacts", "history", "settings"]) {
      await page.goto(
        route === "history" ? `/history?campaign=${campaignId}` : `/${route}`,
      );
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        `${route}: ${theme}`,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`${route}-populated-${theme}.png`),
        fullPage: true,
        caret: "initial",
      });
    }
  }
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
  const checkboxes = page
    .getByRole("region", { name: "Available recipients", exact: true })
    .getByRole("checkbox");
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
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
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
    await expect(page.locator("main h1")).toBeVisible();
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
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
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
  await pool.query(
    'UPDATE "User" SET "preferredRoles"=$2,"resumeUrl"=$3 WHERE id=$1',
    [
      userId,
      ["SDE Intern", "Frontend Developer"],
      "https://example.com/resume",
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
    .getByRole("button", { name: "Insert {{role}}", exact: true })
    .click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Opportunity for {{role}}",
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill("Hi {{name}}, I’m applying for {{role}}. Resume: ");
  await page
    .getByRole("button", { name: "Insert {{resume_link}}", exact: true })
    .click();
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
  await expect(
    page.getByLabel("Attach Resume", { exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "https://example.com/resume", exact: true }),
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
    .getByRole("button", { name: "Send Campaign", exact: true })
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
        r.body.includes("https://example.com/resume") &&
        r.attachmentId === null,
    ),
  ).toBe(true);
  await pool.query(
    `UPDATE "Send" SET status='SENT',"deliveryState"='DONE',"sentAt"=now() WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "userId"=$1)`,
    [userId],
  );
  await expect(
    page.getByRole("region", { name: "Campaign delivery progress" }),
  ).toContainText("Delivery Complete", { timeout: 15000 });
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
      'INSERT INTO "Send" (id,"campaignId","contactId",status,"deliveryState") VALUES ($1,$2,$3,$4::"SendStatus",$5::"DeliveryState")',
      [randomUUID(), id, contact, status, state],
    );
  await page.goto(`/history?campaign=${campaign}`);
  const card = page.getByRole("region", { name: "Campaign delivery progress" });
  await expect(card).toContainText("Delivery needs review");
  await expect(card).toContainText("Approximate remaining:", {
    timeout: 15000,
  });
  await expect(card).toContainText("Retries and service delays");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await card
      .locator(".progress-change")
      .first()
      .evaluate((e) => getComputedStyle(e).animationDuration),
  ).toBe("1e-05s");
  await page.goto(`/history?campaign=${randomUUID()}`);
  await expect(
    page.getByRole("region", { name: "Campaign delivery progress" }),
  ).toHaveCount(0);
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
  await expect(page.getByText("PDF: None.", { exact: false })).toBeVisible();
  await page.goto("/settings");
  await page
    .getByLabel("Resume URL (optional HTTPS link)")
    .fill("https://example.com/resume");
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
    page.getByText("PDF: resume.pdf.", { exact: false }),
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
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
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
