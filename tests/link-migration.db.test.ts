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

describe.runIf(enabled)("inline template links migration", () => {
  it("converts every owner’s active and archived bodies, preserves missing URLs and snapshots, and drops the column", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE "User" (id uuid, "linkUrl" text);
        CREATE TEMP TABLE "Template" ("userId" uuid, "body" text, "archivedAt" timestamptz);
        CREATE TEMP TABLE "Send" ("body" text);
      `);
      const owners = [1, 2, 3, 4].map(
        (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      );
      const firstUrl = "https://example.test/$&?a=1&b=2\\path";
      const secondUrl = "https://github.com/second";
      for (const [index, url] of [firstUrl, secondUrl, null, ""].entries()) {
        await client.query('INSERT INTO "User" VALUES ($1,$2)', [
          owners[index],
          url,
        ]);
        await client.query(
          'INSERT INTO "Template" VALUES ($1,$2,NULL), ($1,$3,NOW())',
          [
            owners[index],
            "Hi {{name}}\n{{link}} {{ link }} {{\nlink\t}}",
            "{{link}}\nArchived",
          ],
        );
      }
      const snapshots = [
        "Queued: https://original.test",
        "Historical {{link}}",
      ];
      await client.query('INSERT INTO "Send" VALUES ($1), ($2)', snapshots);
      const migration = await readFile(
        new URL(
          "../prisma/migrations/20261008020000_inline_template_links/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(
        migration.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""),
      );
      for (const [index, url] of [firstUrl, secondUrl, null, ""].entries()) {
        const result = await client.query(
          'SELECT body, "archivedAt" IS NOT NULL AS archived FROM "Template" WHERE "userId"=$1 ORDER BY "archivedAt" NULLS FIRST',
          [owners[index]],
        );
        expect(result.rows).toEqual([
          {
            body: url
              ? `Hi {{name}}\n${url} ${url} ${url}`
              : "Hi {{name}}\n{{link}} {{ link }} {{\nlink\t}}",
            archived: false,
          },
          {
            body: url ? `${url}\nArchived` : "{{link}}\nArchived",
            archived: true,
          },
        ]);
      }
      expect((await client.query('SELECT body FROM "Send"')).rows).toEqual(
        snapshots.map((body) => ({ body })),
      );
      expect(
        (
          await client.query(
            `SELECT attname FROM pg_attribute WHERE attrelid = 'pg_temp."User"'::regclass AND attname = 'linkUrl' AND NOT attisdropped`,
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
