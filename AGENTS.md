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
