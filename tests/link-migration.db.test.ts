import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const enabled = process.env.MAILLOOP_DB_TESTS === "1";
if (
  enabled &&
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Migration tests require a local database.");

describe.runIf(enabled)("generic link migration", () => {
  it("preserves URLs, converts active and archived templates, and preserves queued bodies", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      // Temporary tables shadow application tables; rollback removes all fixtures.
      await client.query(`
        CREATE TEMP TABLE "User" ("resumeUrl" text);
        CREATE TEMP TABLE "Template" ("body" text, "archivedAt" timestamptz);
        CREATE TEMP TABLE "Send" ("body" text);
      `);
      await client.query('INSERT INTO "User" VALUES ($1), (NULL)', [
        "https://example.test/portfolio",
      ]);
      await client.query(
        'INSERT INTO "Template" VALUES ($1, NULL), ($2, NOW()), ($3, NULL)',
        [
          "{{name}} {{resume_link}} {{ resume_link }}",
          "{{\nresume_link\t}} {{role}}",
          "Plain text and {{link}}",
        ],
      );
      const queuedBody = "Already rendered: https://example.test/original";
      await client.query('INSERT INTO "Send" VALUES ($1)', [queuedBody]);
      const migration = await readFile(
        new URL(
          "../prisma/migrations/20261008010000_generic_link/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(
        migration.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""),
      );
      expect((await client.query('SELECT "linkUrl" FROM "User"')).rows).toEqual(
        [{ linkUrl: "https://example.test/portfolio" }, { linkUrl: null }],
      );
      expect(
        (
          await client.query(
            'SELECT "body", "archivedAt" IS NOT NULL AS archived FROM "Template"',
          )
        ).rows,
      ).toEqual(
        expect.arrayContaining([
          { body: "Plain text and {{link}}", archived: false },
          { body: "{{name}} {{link}} {{link}}", archived: false },
          { body: "{{link}} {{role}}", archived: true },
        ]),
      );
      expect((await client.query('SELECT "body" FROM "Send"')).rows).toEqual([
        { body: queuedBody },
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
