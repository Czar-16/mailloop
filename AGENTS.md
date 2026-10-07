# Mailloop

## Project

Mailloop is a web app that helps job seekers send personalized cold emails
through their own Gmail account.

## Stack

- Next.js App Router
- TypeScript
- Auth.js / NextAuth v5
- PostgreSQL
- Prisma
- Inngest
- Gmail API
- Tailwind CSS
- shadcn/ui
- Zod

## Development Rules

- Use TypeScript.
- Use the Next.js App Router.
- Use server-side code for secrets and Gmail API operations.
- Every user-facing server action and API route must authenticate the user.
- Auth.js entrypoints validate OAuth before a session exists. Inngest callbacks must verify service signatures; Blob completion callbacks must verify the Blob service.
- Always scope database queries by `userId`.
- Never log OAuth tokens.
- Never log email bodies.
- Never expose secrets to the client.
- Keep database IDs as UUIDs.
- PostgreSQL runs locally through Docker.
- The Next.js application runs directly on the host.
- Do not put the Next.js application inside Docker.

## Database

Use Prisma 7.10.0.

PostgreSQL is provided by docker-compose.yml.

## Email

Every recipient must receive their own individual email.

Never use CC or BCC for batch sending.

## Development Style

Prefer simple, readable implementations.

Do not build unnecessary abstractions.

Build features incrementally and verify each step before moving on.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
