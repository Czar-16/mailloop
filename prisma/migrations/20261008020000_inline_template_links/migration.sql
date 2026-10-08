BEGIN;

-- Inline each owner's saved URL, including archived templates. Use a callback-free
-- replacement escape so URL backslashes cannot be interpreted as regexp escapes.
UPDATE "Template" AS template
SET "body" = regexp_replace(
  template."body",
  '\{\{[[:space:]]*link[[:space:]]*\}\}',
  replace(owner."linkUrl", E'\\', E'\\\\'),
  'g'
)
FROM "User" AS owner
WHERE template."userId" = owner."id"
  AND owner."linkUrl" IS NOT NULL
  AND btrim(owner."linkUrl") <> ''
  AND template."body" ~ '\{\{[[:space:]]*link[[:space:]]*\}\}';

-- Queued and historical Send snapshots are deliberately untouched.
ALTER TABLE "User" DROP COLUMN "linkUrl";

COMMIT;
