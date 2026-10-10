import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientConstructor?: typeof PrismaClient;
};
// Regenerating Prisma changes its constructor. Do not reuse a development
// client that still validates queries against the previous schema.
const cachedClient =
  globalForPrisma.prismaClientConstructor === PrismaClient
    ? globalForPrisma.prisma
    : undefined;
if (!cachedClient && globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect().catch(() => {});
}
export const db =
  cachedClient ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    }),
  });
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaClientConstructor = PrismaClient;
}
