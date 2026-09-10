import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma CLI resolves relative SQLite URLs from the schema directory, while
// a bundled Next server can resolve them from a generated chunk. Normalize
// file: URLs explicitly. Postgres / other remote URLs pass through unchanged.
function datasourceUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) {
    throw new Error(
      "DATABASE_URL is not set. Use a Postgres connection string for local and Vercel.",
    );
  }
  if (!configured.startsWith("file:")) return configured;

  const filePath = configured.slice("file:".length);
  if (path.isAbsolute(filePath)) return `file:${filePath}`;

  return `file:${path.resolve(process.cwd(), "prisma", filePath)}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: datasourceUrl() });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
