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
  await page.getByRole("button", { name: "Preview Import" }).click();
  await expect(
    page.getByText("2 ready · 1 duplicates · 1 invalid"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import Valid Contacts" }).click();
  await expect(
    page.getByText("2 contacts imported. 2 rows skipped."),
  ).toBeVisible();
  await page.goto("/compose");
  await page.getByLabel("Role you’re applying for").fill("Engineer");
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
    .getByRole("button", { name: "Send 1 Individual Email", exact: true })
    .click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("queued", { exact: true })).toBeVisible();
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
  await page.getByLabel("Role you’re applying for").focus();
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
