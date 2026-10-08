BEGIN;

ALTER TABLE "User" RENAME COLUMN "resumeUrl" TO "linkUrl";

-- Convert all saved templates, including archived ones. Rendered sends are unchanged.
UPDATE "Template"
SET "body" = regexp_replace("body", '\{\{[[:space:]]*resume_link[[:space:]]*\}\}', '{{link}}', 'g')
WHERE "body" ~ '\{\{[[:space:]]*resume_link[[:space:]]*\}\}';

COMMIT;
